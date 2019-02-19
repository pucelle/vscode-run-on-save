import * as path from 'path'
import {exec} from 'child_process'
import * as vscode from 'vscode'


export interface Configuration {
	statusMessageTimeout: number
	commands: OriginalCommand
}

export interface OriginalCommand {
	match: string
	notMatch: string
	command: string
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface ProcessedCommand {
	match?: RegExp
	notMatch?: RegExp
	command: string
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface BackendCommand {
	runIn: 'backend'
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface TerminalCommand {
	runIn: 'terminal'
	command: string
}


export class CommandProcessor {
	private commands: ProcessedCommand[]

	constructor() {
		this.commands = []
	}
	
	setOriginalCommands (commands: OriginalCommand[]) {
		this.commands = this.processCommands(commands)
	}

	private processCommands(commands: OriginalCommand[]): ProcessedCommand[] {
		return commands.filter(command => command.command).map(command => {
			command.runIn = command.runIn || 'backend'

			return Object.assign({}, command, {
				match: command.match ? new RegExp(command.match, 'i') : undefined,
				notMatch: command.notMatch ? new RegExp(command.notMatch, 'i') : undefined
			})
		})
	}

	prepareCommandsForFile (fileName: string): (BackendCommand | TerminalCommand)[] {
		let filteredCommands = this.filterCommandsForFile(fileName)
		
		let formattedCommands = filteredCommands.map((command) => {
			if (command.runIn === 'backend') {
				return <BackendCommand>{
					runIn: 'backend',
					command: path.normalize(this.formatVariables(command.command, fileName)),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, fileName),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, fileName)
				}
			}
			else {
				return <TerminalCommand>{
					runIn: 'terminal',
					command: path.normalize(this.formatVariables(command.command, fileName))
				}
			}
		})

		return formattedCommands
	}

	private filterCommandsForFile(fileName: string): ProcessedCommand[] {
		return this.commands.filter(({match, notMatch}) => {
			if (match && !match.test(fileName)) {
				return false
			}

			if (notMatch && notMatch.test(fileName)) {
				return false
			}

			return true
		})
	}

	private formatVariables (commandOrMessage: string, fileName: string): string {
		if (!commandOrMessage) {
			return ''
		}

		commandOrMessage = commandOrMessage.replace(/\${workspaceFolder}/g, vscode.workspace.rootPath || '')
		commandOrMessage = commandOrMessage.replace(/\${workspaceFolderBasename}/g, path.basename(vscode.workspace.rootPath || ''))
		commandOrMessage = commandOrMessage.replace(/\${file}/g, fileName)
		commandOrMessage = commandOrMessage.replace(/\${fileBasename}/g, path.basename(fileName))
		commandOrMessage = commandOrMessage.replace(/\${fileBasenameNoExtension}/g, path.basename(fileName, path.extname(fileName)))
		commandOrMessage = commandOrMessage.replace(/\${fileDirname}/g, path.dirname(fileName))
		commandOrMessage = commandOrMessage.replace(/\${fileExtname}/g, path.extname(fileName))
		commandOrMessage = commandOrMessage.replace(/\${cwd}/g, process.cwd())

		commandOrMessage = commandOrMessage.replace(/\${env\.([\w]+)}/g, (sub: string | undefined, envName: string | undefined) => {
			return envName ? String(process.env[envName]) : ''
		})

		return commandOrMessage
	}
}


export class RunOnSaveExtension {
	private context: vscode.ExtensionContext
	private channel: vscode.OutputChannel
	private config!: vscode.WorkspaceConfiguration
	private commandProcessor: CommandProcessor

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.channel = vscode.window.createOutputChannel('Run On Save')
		this.commandProcessor = new CommandProcessor()
		this.loadConfig()
		this.showEnablingChannelMessage()

		context.subscriptions.push(this.channel)
	}

	loadConfig() {
		this.config = vscode.workspace.getConfiguration('runOnSave')
		this.commandProcessor.setOriginalCommands(<OriginalCommand[]>this.config.get('commands') || [])
	}
	
	private showEnablingChannelMessage () {
		let message = `Run On Save is ${this.getEnabled() ? 'enabled' : 'disabled'}`
		this.showChannelMessage(message)
		this.showStatusMessage(message)
	}

	private showChannelMessage(message: string) {
		this.channel.appendLine(message)
	}

	getEnabled(): boolean {
		return !!this.context.globalState.get('enabled', true)
	}
		
	setEnabled(enabled: boolean) {
		this.context.globalState.update('enabled', enabled)
		this.showEnablingChannelMessage()
	}

	private showStatusMessage(message: string) {
		let disposable = vscode.window.setStatusBarMessage(message, this.config.get('statusMessageTimeout') || 3000)
		this.context.subscriptions.push(disposable)
	}

	onDocumentSave(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		let commandsToRun = this.commandProcessor.prepareCommandsForFile(document.fileName)
		if (commandsToRun.length > 0) {
			this.runCommands(commandsToRun)
		}
	}

	private runCommands(commands: (BackendCommand | TerminalCommand) []) {
		for (let command of commands) {
			if (command.runIn === 'backend') {
				this.runBackendCommand(command)
			}
			else {
				this.runTerminalCommand(command)
			}
		}
	}

	private runBackendCommand (command: BackendCommand) {
		this.showChannelMessage(`Running "${command.command}"`)

		if (command.runningStatusMessage) {
			this.showStatusMessage(command.runningStatusMessage)
		}

		let child = exec(command.command)
		child.stdout.on('data', data => this.channel.append(data.toString()))
		child.stderr.on('data', data => this.channel.append(data.toString()))
		
		child.on('exit', (e) => {
			if (e === 0 && (command).finishStatusMessage) {
				this.showStatusMessage((command).finishStatusMessage)
			}

			if (e !== 0) {
				this.channel.show(true)
			}
		})
	}

	private runTerminalCommand(command: TerminalCommand) {
		let terminal = this.createTerminal()

		terminal.show()
		terminal.sendText(command.command)

		setTimeout(() => {
			vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup")
		}, 100)
	}

	private createTerminal(): vscode.Terminal {
		let terminalName = 'Run On Save'
		let terminal = vscode.window.terminals.find(terminal => terminal.name === terminalName)

		if (!terminal) {
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName))
		}

		return terminal
	}
}
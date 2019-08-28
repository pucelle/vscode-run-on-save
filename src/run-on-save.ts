import * as path from 'path'
import {exec} from 'child_process'
import * as vscode from 'vscode'
import {encodeCommandLineToBeQuoted, decodeQuotedCommandLine} from './util'


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

	private commands: ProcessedCommand[] = []
	
	setRawCommands (commands: OriginalCommand[]) {
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
					command: path.normalize(this.formatVariables(command.command, fileName, true)),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, fileName),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, fileName)
				}
			}
			else {
				return <TerminalCommand>{
					runIn: 'terminal',
					command: path.normalize(this.formatVariables(command.command, fileName, true))
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

	private formatVariables(commandOrMessage: string, fileName: string, isCommand: boolean = false): string {
		if (!commandOrMessage) {
			return ''
		}

		// if white spaces in file name or directory name, we need to wrap them in "".
		// we doing this by testing each pieces, and wrap them if needed.
		return commandOrMessage.replace(/\S+/g, (piece: string) => {
			let oldPiece = piece

			if (piece[0] === '"' && piece[piece.length - 1] === '"') {
				piece = decodeQuotedCommandLine(piece.slice(1, -1))
			}

			piece = piece.replace(/\${workspaceFolder}/g, vscode.workspace.rootPath || '')
			piece = piece.replace(/\${workspaceFolderBasename}/g, path.basename(vscode.workspace.rootPath || ''))
			piece = piece.replace(/\${file}/g, fileName)
			piece = piece.replace(/\${fileBasename}/g, path.basename(fileName))
			piece = piece.replace(/\${fileBasenameNoExtension}/g, path.basename(fileName, path.extname(fileName)))
			piece = piece.replace(/\${fileDirname}/g, path.dirname(fileName))
			piece = piece.replace(/\${fileExtname}/g, path.extname(fileName))
			piece = piece.replace(/\${cwd}/g, process.cwd())

			piece = piece.replace(/\${env\.([\w]+)}/g, (_sub: string, envName: string) => {
				return envName ? String(process.env[envName]) : ''
			})

			// If piece includes spaces or `\\`, then it must be encoded
			if (isCommand && piece !== oldPiece && /[\s"]|\\\\/.test(piece)) {
				piece = '"' + encodeCommandLineToBeQuoted(piece) + '"'
			}

			return piece
		})
	}
}


export class RunOnSaveExtension {

	private context: vscode.ExtensionContext
	private config!: vscode.WorkspaceConfiguration
	private channel: vscode.OutputChannel = vscode.window.createOutputChannel('Run on Save')
	private commandProcessor: CommandProcessor = new CommandProcessor()

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadConfig()
		this.showEnablingChannelMessage()

		context.subscriptions.push(this.channel)
	}

	loadConfig() {
		this.config = vscode.workspace.getConfiguration('runOnSave')
		this.commandProcessor.setRawCommands(<OriginalCommand[]>this.config.get('commands') || [])
	}
	
	private showEnablingChannelMessage () {
		let message = `Run on Save is ${this.getEnabled() ? 'enabled' : 'disabled'}`
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
		let terminalName = 'Run on Save'
		let terminal = vscode.window.terminals.find(terminal => terminal.name === terminalName)

		if (!terminal) {
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName))
		}

		return terminal
	}
}
import * as vscode from 'vscode'
import * as path from 'path'
import { exec } from 'child_process'


export interface Command {
	match: string
	notMatch: string
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
}

interface CompiledCommand {
	match?: RegExp
	notMatch?: RegExp
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
}

interface CommandToRun {
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
}


export class CommandManager {
	private commands: CompiledCommand[]
	
	public setCommands (commands: Command[]) {
		this.compileCommands(commands)
	}

	private compileCommands(commands: Command[]) {
		this.commands = commands.map(({match, notMatch, command, runningStatusMessage, finishStatusMessage}) => {
			return <CompiledCommand>{
				match: match ? new RegExp(match, 'i') : undefined,
				notMatch: notMatch ? new RegExp(notMatch, 'i') : undefined,
				command,
				runningStatusMessage: runningStatusMessage,
				finishStatusMessage: finishStatusMessage,
			}
		})
	}

	public prepareCommandsForFile (fileName: string): CommandToRun[] {
		let filteredCommands = this.filterCommandsForFile(fileName)
		
		let formattedCommands = filteredCommands.map(({ command, runningStatusMessage, finishStatusMessage }) => {
			return <CommandToRun>{
				command: path.normalize(this.formatVariables(command, fileName)),
				runningStatusMessage: this.formatVariables(runningStatusMessage, fileName),
				finishStatusMessage: this.formatVariables(finishStatusMessage, fileName),
			}
		})

		return formattedCommands
	}

	private filterCommandsForFile(fileName: string): CompiledCommand[] {
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
	private channel: vscode.OutputChannel
	private context: vscode.ExtensionContext
	private commandManager: CommandManager
	private config: vscode.WorkspaceConfiguration

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.channel = vscode.window.createOutputChannel('Run On Save')
		this.commandManager = new CommandManager()
		this.loadConfig()
		this.showEnablingChannelMessage()
	}

	public loadConfig() {
		this.config = vscode.workspace.getConfiguration('runOnSave')
		this.commandManager.setCommands(<Command[]>this.config.get('commands') || [])
	}
	
	private showEnablingChannelMessage () {
		let message = `Run On Save is ${this.getEnabled() ? 'enabled' : 'disabled'}`
		this.showChannelMessage(message)
		this.showStatusMessage(message)
	}

	private showChannelMessage(message: string) {
		this.channel.appendLine(message)
	}

	public getEnabled(): boolean {
		return !!this.context.globalState.get('enabled', true)
	}
		
	public setEnabled(enabled: boolean) {
		this.context.globalState.update('enabled', enabled)
		this.showEnablingChannelMessage()
	}

	private showStatusMessage(message: string): vscode.Disposable {
		return vscode.window.setStatusBarMessage(message, <number>this.config.get('statusMessageTimeout') || 3000)
	}

	public onDocumentSave(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		let commandsToRun = this.commandManager.prepareCommandsForFile(document.fileName)
		if (commandsToRun.length > 0) {
			this.runCommands(commandsToRun)
		}
	}

	private runCommands(commands: CommandToRun[]) {
		for (let {command, runningStatusMessage, finishStatusMessage} of commands) {
			this.showChannelMessage(`Running "${command}"`)

			if (runningStatusMessage) {
				this.showStatusMessage(runningStatusMessage)
			}

			let child = exec(command)
			child.stdout.on('data', data => this.channel.append(data.toString()))
			child.stderr.on('data', data => this.channel.append(data.toString()))
			
			child.on('exit', (e) => {
				if (e === 0 && finishStatusMessage) {
					this.showStatusMessage(finishStatusMessage)
				}

				if (e !== 0) {
					this.channel.show(true)
				}
			})
		}
	}
}
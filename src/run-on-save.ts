import {exec, ChildProcess} from 'child_process'
import * as vscode from 'vscode'
import {RawCommand, CommandProcessor, BackendCommand, TerminalCommand, VSCodeCommand} from './command-processor'


export interface Configuration {
	statusMessageTimeout: number
	shell: String
	commands: RawCommand
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

	/** Load or reload configuration. */
	loadConfig() {
		this.config = vscode.workspace.getConfiguration('runOnSave')
		this.commandProcessor.setRawCommands(<RawCommand[]>this.config.get('commands') || [])
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

	/** Returns a promise it was resolved firstly and then save document. */
	async onWillSaveDocument(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		let commandsToRun = this.commandProcessor.prepareCommandsForFileBeforeSaving(document.fileName)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	async onDocumentSaved(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		let commandsToRun = this.commandProcessor.prepareCommandsForFileAfterSaving(document.fileName)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	private async runCommands(commands: (BackendCommand | TerminalCommand | VSCodeCommand) []) {
		let promises: Promise<void>[] = []

		// Run all the commands in parallel, not in series.
		for (let command of commands) {
			let promise: Promise<void>

			if (command.runIn === 'backend') {
				promise = this.runBackendCommand(command)
			}
			else if (command.runIn === 'terminal') {
				promise = this.runTerminalCommand(command)
			}
			else {
				promise = this.runVSCodeCommand(command)
			}

			promises.push(promise)
		}

		await Promise.all(promises)
	}

	private runBackendCommand(command: BackendCommand) {
		return new Promise((resolve) => {
			this.showChannelMessage(`Running "${command.command}"`)

			if (command.runningStatusMessage) {
				this.showStatusMessage(command.runningStatusMessage)
			}
	
			let child = this.execShellCommand(command.command)
			child.stdout.on('data', data => this.channel.append(data.toString()))
			child.stderr.on('data', data => this.channel.append(data.toString()))
	
			child.on('exit', (e) => {
				if (e === 0 && command.finishStatusMessage) {
					this.showStatusMessage(command.finishStatusMessage)
				}
	
				if (e !== 0) {
					this.channel.show(true)
				}

				resolve()
			})
		}) as Promise<void>
	}

	private execShellCommand(command: string): ChildProcess {
		let shell = this.getShellPath()
		if (shell) {
			return exec(command, {
				shell,
				cwd: vscode.workspace.rootPath,
			})
		}
		else {
			return exec(command, {
				cwd: vscode.workspace.rootPath,
			})
		}
	}

	private getShellPath(): string | undefined {
		return this.config.get('shell') || undefined
	}

	private async runTerminalCommand(command: TerminalCommand) {
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
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName, this.getShellPath()))
		}

		return terminal
	}

	private async runVSCodeCommand(command: VSCodeCommand) {
		// finishStatusMessage have to be hooked to exit of command execution
		this.showChannelMessage(`Running "${command.command}"`)

		await vscode.commands.executeCommand(command.command)
	}
}
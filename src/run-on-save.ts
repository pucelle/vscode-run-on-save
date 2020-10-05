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

	onDocumentSave(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		let commandsToRun = this.commandProcessor.prepareCommandsForFile(document.fileName)
		if (commandsToRun.length > 0) {
			this.runCommands(commandsToRun)
		}
	}

	private runCommands(commands: (BackendCommand | TerminalCommand | VSCodeCommand) []) {
		for (let command of commands) {
			if (command.runIn === 'backend') {
				this.runBackendCommand(command)
			}
			else if (command.runIn === 'terminal') {
				this.runTerminalCommand(command)
			}
			else {
				this.runVSCodeCommand(command)
			}
		}
	}

	private runBackendCommand(command: BackendCommand) {
		this.showChannelMessage(`Running "${command.command}"`)

		if (command.runningStatusMessage) {
			this.showStatusMessage(command.runningStatusMessage)
		}

		let child = this.execShellCommand(command.command)
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

	private execShellCommand(command: string): ChildProcess {
		let shell = this.getShellPath()
		if (shell) {
			return exec(command, {
				shell,
				cwd: vscode.workspace.rootPath,
			})
		}
		else {
			return exec(command)
		}
	}

	private getShellPath(): string | undefined {
		return this.config.get('shell') || undefined
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
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName, this.getShellPath()))
		}

		return terminal
	}

	private runVSCodeCommand(command: VSCodeCommand) {
		// finishStatusMessage have to be hooked to exit of command execution
		this.showChannelMessage(`Running "${command.command}"`)

		vscode.commands.executeCommand(command.command)
	}
}
import {exec, ChildProcess} from 'child_process'
import * as vscode from 'vscode'
import {RawCommand, CommandProcessor, BackendCommand, TerminalCommand, VSCodeCommand} from './command-processor'
import {timeout} from './util'
import {FileIgnoreChecker} from './file-ignore-checker'


export interface Configuration {
	statusMessageTimeout: number
	ignoreFilesBy: string[]
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
		const message = `Run on Save is ${this.getEnabled() ? 'enabled' : 'disabled'}`
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

	private showStatusMessage(message: string, timeout?: number) {
		timeout = timeout || this.config.get('statusMessageTimeout') || 3000
		const disposable = vscode.window.setStatusBarMessage(message, timeout)
		this.context.subscriptions.push(disposable)
	}

	/** Returns a promise it was resolved firstly and then save document. */
	async onWillSaveDocument(document: vscode.TextDocument | vscode.NotebookDocument) {
		if (!this.getEnabled() || await this.shouldIgnore(document.uri)) {
			return
		}

		const commandsToRun = await this.commandProcessor.prepareCommandsForFileBeforeSaving(document.uri)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	async onDocumentSaved(document: vscode.TextDocument) {
		if (!this.getEnabled()) {
			return
		}

		if (await this.shouldIgnore(document.uri)) {
			return
		}

		const commandsToRun = await this.commandProcessor.prepareCommandsForFileAfterSaving(document.uri)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	private async shouldIgnore(uri: vscode.Uri): Promise<boolean> {
		const checker = new FileIgnoreChecker({
			workspaceDir: vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath,
			ignoreFilesBy: this.config.get('ignoreFilesBy') || [],
		})

		return checker.shouldIgnore(uri.fsPath)
	}

	private async runCommands(commands: (BackendCommand | TerminalCommand | VSCodeCommand)[]) {
		const promises: Promise<void>[] = []
		const syncCommands = commands.filter(c => !c.async)
		const asyncCommands = commands.filter(c => c.async)

		// Run commands in a parallel.
		for (let command of asyncCommands) {
			let promise = this.runACommand(command)
			promises.push(promise)
		}

		// Run commands in series.
		for (let command of syncCommands) {
			await this.runACommand(command)
		}

		await Promise.all(promises)
	}

	private runACommand(command: BackendCommand | TerminalCommand | VSCodeCommand): Promise<void> {
		if (command.runIn === 'backend') {
			return this.runBackendCommand(command)
		}
		if (command.runIn === 'terminal') {
			return this.runTerminalCommand(command)
		}
		return this.runVSCodeCommand(command)
	}

	private runBackendCommand(command: BackendCommand) {
		return new Promise((resolve) => {
			this.showChannelMessage(`Running "${command.command}"`)

			if (command.runningStatusMessage) {
				this.showStatusMessage(command.runningStatusMessage, command.statusMessageTimeout)
			}
	
			let child = this.execShellCommand(command.command, command.workingDirectoryAsCWD ?? true)
			child.stdout!.on('data', data => this.channel.append(data.toString()))
			child.stderr!.on('data', data => this.channel.append(data.toString()))
	
			child.on('exit', (e) => {
				if (e === 0 && command.finishStatusMessage) {
					this.showStatusMessage(command.finishStatusMessage, command.statusMessageTimeout)
				}
	
				if (e !== 0) {
					this.channel.show(true)
				}

				resolve()
			})
		}) as Promise<void>
	}

	private execShellCommand(command: string, workingDirectoryAsCWD: boolean): ChildProcess {
		let cwd = workingDirectoryAsCWD ? vscode.workspace.rootPath : undefined

		let shell = this.getShellPath()
		if (shell) {
			return exec(command, {
				shell,
				cwd,
			})
		}
		else {
			return exec(command, {
				cwd,
			})
		}
	}

	private getShellPath(): string | undefined {
		return this.config.get('shell') || undefined
	}

	private async runTerminalCommand(command: TerminalCommand) {
		const terminal = this.createTerminal()

		terminal.show()
		terminal.sendText(command.command)

		await timeout(100)
		await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup")

		if ((command.terminalHideTimeout || -1) >= 0) {
			await timeout(command.terminalHideTimeout!)
			terminal.dispose()
		}
	}

	private createTerminal(): vscode.Terminal {
		const terminalName = 'Run on Save'
		let terminal = vscode.window.terminals.find(terminal => terminal.name === terminalName)

		if (!terminal) {
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName, this.getShellPath()))
		}

		return terminal
	}

	private async runVSCodeCommand(command: VSCodeCommand) {
		// finishStatusMessage has to be hooked to exit of command execution
		this.showChannelMessage(`Running "${command.command}"`)

		let args: any[]

		if (Array.isArray(command.args)) {
			args = command.args
		}
		else if (typeof command.args === 'string') {
			args = [command.args]
		}
		else if (typeof command.args === 'object') {
			args = [command.args]
		}
		else {
			args = []
		}

		await vscode.commands.executeCommand(command.command, ...args)
	}
}
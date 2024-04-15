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
	defaultRunIn: 'backend' | 'terminal' | 'vscode'
}

export class RunOnSaveExtension {

	private context: vscode.ExtensionContext
	private config!: vscode.WorkspaceConfiguration
	private channel: vscode.OutputChannel = vscode.window.createOutputChannel('Run on Save')
	private commandProcessor: CommandProcessor = new CommandProcessor()

	// A record of document uris to document versions to save reasons.
	private documentSaveReason: Record<string, Record<number, vscode.TextDocumentSaveReason>>

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadConfig()
		this.showEnablingChannelMessage()

		context.subscriptions.push(this.channel)
		this.documentSaveReason = {}
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

	private showStatusMessage(message: string, timeout?: number) {
		timeout = timeout || this.config.get('statusMessageTimeout') || 3000
		let disposable = vscode.window.setStatusBarMessage(message, timeout)
		this.context.subscriptions.push(disposable)
	}

	/** Returns a promise it was resolved firstly and then save document. */
	async onWillSaveDocument(document: vscode.TextDocument | vscode.NotebookDocument, reason: vscode.TextDocumentSaveReason) {
		this.documentSaveReason[document.uri.fsPath] ??= {}
		this.documentSaveReason[document.uri.fsPath][document.version] = reason

		if (!this.getEnabled() || await this.shouldIgnore(document.uri, reason)) {
			return
		}

		let commandsToRun = await this.commandProcessor.prepareCommandsForFileBeforeSaving(document.uri)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	async onDocumentSaved(document: vscode.TextDocument | vscode.NotebookDocument) {
		const documentVersions = this.documentSaveReason[document.uri.fsPath]
		const reason = documentVersions?.[document.version]

		if (documentVersions != null) {
			delete documentVersions[document.version]
		}

		if (!this.getEnabled() || await this.shouldIgnore(document.uri, reason)) {
			return
		}

		let commandsToRun = await this.commandProcessor.prepareCommandsForFileAfterSaving(document.uri)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun)
		}
	}

	async onDidDeleteFiles(e: vscode.FileDeleteEvent) {
		for (const uri of e.files) {
			delete this.documentSaveReason[uri.fsPath]
		}
	}

	private async shouldIgnore(uri: vscode.Uri, reason: vscode.TextDocumentSaveReason): Promise<boolean> {
		if (reason !== vscode.TextDocumentSaveReason.Manual && this.config.get('onlyRunOnManualSave')) {
			return true
		}

		let checker = new FileIgnoreChecker({
			workspaceDir: vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath,
			ignoreFilesBy: this.config.get('ignoreFilesBy') || [],
		})

		return checker.shouldIgnore(uri.fsPath)
	}

	private async runCommands(commands: (BackendCommand | TerminalCommand | VSCodeCommand)[]) {
		let promises: Promise<void>[] = []
		let syncCommands = commands.filter(c => !c.async)
		let asyncCommands = commands.filter(c => c.async)

		// Run commands in a parallel.
		for (let command of asyncCommands) {
			promises.push(this.runACommand(command))
		}

		// Run commands in series.
		for (let command of syncCommands) {
			await this.runACommand(command)
		}

		await Promise.all(promises)
	}

	private runACommand(command: BackendCommand | TerminalCommand | VSCodeCommand): Promise<void> {
		if (command.clearOutput) {
			this.channel.clear()
		}

		let runIn = command.runIn || this.config.get('defaultRunIn')

		if (runIn === 'backend') {
			return this.runBackendCommand(command as BackendCommand)
		}
		else if (runIn === 'terminal') {
			return this.runTerminalCommand(command as TerminalCommand)
		}
		else {
			return this.runVSCodeCommand(command as VSCodeCommand)
		}
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
		let cwd = workingDirectoryAsCWD ? vscode.workspace.workspaceFolders?.[0].uri.fsPath : undefined
		let shell = this.getShellPath()

		return shell ? exec(command, { shell, cwd }) : exec(command, { cwd })
	}

	private getShellPath(): string | undefined {
		return this.config.get('shell') || undefined
	}

	private async runTerminalCommand(command: TerminalCommand) {
		let terminal = this.createTerminal()

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
		let terminalName = 'Run on Save'
		let terminal = vscode.window.terminals.find(terminal => terminal.name === terminalName)

		if (!terminal) {
			this.context.subscriptions.push(terminal = vscode.window.createTerminal(terminalName, this.getShellPath()))
		}

		return terminal
	}

	private async runVSCodeCommand(command: VSCodeCommand) {
		// `finishStatusMessage` has to be hooked to exit of command execution.
		this.showChannelMessage(`Running "${command.command}"`)

		let args = this.formatVSCodeCommandArgs(command.args)
		await vscode.commands.executeCommand(command.command, ...args)
	}
	
	private formatVSCodeCommandArgs(args: string | object | string[] | undefined): any[] {
		if (Array.isArray(args)) {
			return args
		}

		if (['string', 'object'].includes(typeof args)) {
			return [args]
		}

		return []
	}
}

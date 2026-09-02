import {exec, ChildProcess, ExecOptions} from 'child_process'
import * as vscode from 'vscode'
import {CommandProcessor, BackendCommand, TerminalCommand, VSCodeCommand, ProcessedCommand} from './command-processor'
import {FleetingDoubleKeysCache, timeout} from './util'
import {FileIgnoreChecker} from './file-ignore-checker'
import {RawCommand, VSCodeDocument, RunOnSavePluginExport} from './types'


const TERMINAL_SHELL_INTEGRATION_TIMEOUT = 3000


export class RunOnSaveExtension implements RunOnSavePluginExport{

	private context: vscode.ExtensionContext
	private config!: vscode.WorkspaceConfiguration
	private channel: vscode.OutputChannel = vscode.window.createOutputChannel('Run on Save')
	private commandProcessor: CommandProcessor = new CommandProcessor()

	/** A record of document uris and document versions to save reasons. */
	private documentSaveReasonCache: FleetingDoubleKeysCache<string, number, vscode.TextDocumentSaveReason>
		= new FleetingDoubleKeysCache()

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadConfig()
		this.showEnablingChannelMessage()

		context.subscriptions.push(this.channel)
	}

	/** Load or reload configuration. */
	loadConfig() {
		this.config = vscode.workspace.getConfiguration('runOnSave')
		this.commandProcessor.setRawCommands(<RawCommand[]>this.config.get('commands') || [], this.config.get('defaultRunIn')!)
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

	/** Returns a promise it was resolved firstly and then will save document. */
	async onWillSaveDocument(document: VSCodeDocument, reason: vscode.TextDocumentSaveReason) {
		this.documentSaveReasonCache.set(document.uri.fsPath, document.version, reason)

		if (!this.getEnabled() || await this.shouldIgnore(document.uri, reason)) {
			return
		}

		let commandsToRun = await this.commandProcessor.prepareCommandsForFileBeforeSaving(document)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun, document.uri)
		}
	}

	async onDocumentSaved(document: VSCodeDocument) {
		let reason = this.documentSaveReasonCache.get(document.uri.fsPath, document.version)

		if (!this.getEnabled() || await this.shouldIgnore(document.uri, reason)) {
			return
		}

		let commandsToRun = await this.commandProcessor.prepareCommandsForFileAfterSaving(document)
		if (commandsToRun.length > 0) {
			await this.runCommands(commandsToRun, document.uri)
		}
	}

	private async shouldIgnore(uri: vscode.Uri, reason: vscode.TextDocumentSaveReason | undefined): Promise<boolean> {
		if (reason !== vscode.TextDocumentSaveReason.Manual && this.config.get('onlyRunOnManualSave')) {
			return true
		}

		let checker = new FileIgnoreChecker({
			workspaceDir: vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath,
			ignoreFilesBy: this.config.get('ignoreFilesBy') || [],
		})

		return checker.shouldIgnore(uri.fsPath)
	}

	private async runCommands(commands: ProcessedCommand[], uri: vscode.Uri) {
		let promises: Promise<void>[] = []
		let syncCommands = commands.filter(c => !c.async)
		let asyncCommands = commands.filter(c => c.async)

		// Run commands in a parallel.
		for (let command of asyncCommands) {
			promises.push(this.runACommand(command, uri))
		}

		// Run commands in series.
		for (let command of syncCommands) {
			await this.runACommand(command, uri)
		}

		await Promise.all(promises)
	}

	private runACommand(command: ProcessedCommand, uri: vscode.Uri): Promise<void> {
		if (command.clearOutput) {
			this.channel.clear()
		}

		let runIn = command.runIn || this.config.get('defaultRunIn') || 'backend'

		if (runIn === 'backend') {
			return this.runBackendCommand(command as BackendCommand, uri)
		}
		else if (runIn === 'terminal') {
			return this.runTerminalCommand(command as TerminalCommand)
		}
		else {
			return this.runVSCodeCommand(command as VSCodeCommand)
		}
	}

	private runBackendCommand(command: BackendCommand, uri: vscode.Uri) {
		return new Promise((resolve) => {
			this.showChannelMessage(`Running "${command.command}"`)

			if (command.runningStatusMessage) {
				this.showStatusMessage(command.runningStatusMessage, command.statusMessageTimeout)
			}

			let child = this.execShellCommand(command.command, command.workingDirectoryAsCWD ?? true, uri)
			child.stdout!.on('data', data => {
				// Explicitly handle UTF-8 encoding for German Umlaute and other Unicode characters
				const output = typeof data === 'string' ? data : data.toString('utf8')
				this.channel.append(output)
			})
			child.stderr!.on('data', data => {
				// Explicitly handle UTF-8 encoding for German Umlaute and other Unicode characters
				const output = typeof data === 'string' ? data : data.toString('utf8')
				this.channel.append(output)
			})

			child.on('exit', (e) => {
				if (e === 0 && command.finishStatusMessage) {
					this.showStatusMessage(command.finishStatusMessage, command.statusMessageTimeout)
				}

				if (e !== 0 && !command.doNotDisturb) {
					this.channel.show(true)
				}

				resolve()
			})
		}) as Promise<void>
	}

	private execShellCommand(command: string, workingDirectoryAsCWD: boolean, uri: vscode.Uri): ChildProcess {
		let cwd: string | undefined
		
		if (workingDirectoryAsCWD) {
			cwd = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath
				?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		}
		
		let shell = this.getShellPath()

		// Set encoding to utf8 and configure environment to ensure proper UTF-8 handling
		const execOptions: ExecOptions & {encoding: BufferEncoding} = {
			cwd,
			encoding: 'utf8',
			env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
		}

		return exec(command, { shell, ...execOptions })
	}

	private getShellPath(): string | undefined {
		return this.config.get('shell') || undefined
	}

	private async runTerminalCommand(command: TerminalCommand) {
		let terminal = this.createTerminal()
		if (command.terminalReveal === 'always') {
			terminal.show()
		}

		if (command.terminalReveal === 'onError') {
			let shellIntegration = await this.waitForTerminalShellIntegration(terminal)

			if (shellIntegration) {
				try {
					let exitCode = await this.executeTerminalCommand(terminal, shellIntegration, command.command)
					if (exitCode !== 0) {
						terminal.show()
					}
				}
				catch {
					this.showChannelMessage('Failed to track the terminal command; revealing the terminal and retrying it normally.')
					terminal.show()
					terminal.sendText(command.command)
				}
			}
			else {
				this.showChannelMessage('Terminal shell integration is unavailable; revealing the terminal before running the command.')
				terminal.show()
				terminal.sendText(command.command)
			}
		}
		else {
			terminal.sendText(command.command)
		}

		await timeout(100)
		await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup")

		if ((command.terminalHideTimeout || -1) >= 0) {
			await timeout(command.terminalHideTimeout!)
			terminal.dispose()
		}
	}

	private waitForTerminalShellIntegration(terminal: vscode.Terminal): Promise<vscode.TerminalShellIntegration | undefined> {
		if (terminal.shellIntegration) {
			return Promise.resolve(terminal.shellIntegration)
		}

		return new Promise(resolve => {
			let disposable = vscode.window.onDidChangeTerminalShellIntegration(event => {
				if (event.terminal === terminal) {
					clearTimeout(timer)
					disposable.dispose()
					resolve(event.shellIntegration)
				}
			})
			
			let timer = setTimeout(() => {
				disposable.dispose()
				resolve(undefined)
			}, TERMINAL_SHELL_INTEGRATION_TIMEOUT)
		})
	}

	private executeTerminalCommand(
		terminal: vscode.Terminal,
		shellIntegration: vscode.TerminalShellIntegration,
		command: string
	): Promise<number | undefined> {
		return new Promise((resolve, reject) => {
			let execution: vscode.TerminalShellExecution
			let endDisposable = vscode.window.onDidEndTerminalShellExecution(event => {
				if (event.execution === execution) {
					endDisposable.dispose()
					closeDisposable.dispose()
					resolve(event.exitCode)
				}
			})
			let closeDisposable = vscode.window.onDidCloseTerminal(closedTerminal => {
				if (closedTerminal === terminal) {
					endDisposable.dispose()
					closeDisposable.dispose()
					resolve(undefined)
				}
			})

			try {
				execution = shellIntegration.executeCommand(command)
			}
			catch (error) {
				endDisposable.dispose()
				closeDisposable.dispose()
				reject(error)
			}
		})
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

		// If run vscode commands and got 4 times error, vscode will refuse keep listening this file.
		try {
			await vscode.commands.executeCommand(command.command, ...args)
		}
		catch (err) {
			vscode.window.showErrorMessage(`RunOnSave has failed to run vscode command: '${command.command}':\n${err}`)
		}
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

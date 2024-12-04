import * as vscode from 'vscode'
import {formatCommandPieces, encodeCommandLineToBeQuotedIf} from './util'
import * as minimatch from 'minimatch'
import {CommandVariables} from './command-variables'
import * as path from 'path'


/** Processed command, which can be run directly. */
export interface ProcessedCommand {
	languages?: string[]
	match?: RegExp
	notMatch?: RegExp
	globMatch?: string
	commandBeforeSaving?: string
	command?: string
	args?: string[] | object | string
	forcePathSeparator?: PathSeparator
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
	async?: boolean
	clearOutput?: boolean
	doNotDisturb?: boolean
}

/** The commands in list will be picked by current editing file path. */
export interface BackendCommand {
	runIn: 'backend'
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
	workingDirectoryAsCWD: boolean
	async: boolean
	statusMessageTimeout?: number
	clearOutput?: boolean
	doNotDisturb?: boolean
}

export interface TerminalCommand {
	runIn: 'terminal'
	command: string
	async: boolean
	statusMessageTimeout?: number
	terminalHideTimeout?: number
	clearOutput?: boolean
}

export interface VSCodeCommand {
	runIn: 'vscode'
	command: string
	args?: string[] | object | string
	async: boolean
	clearOutput?: boolean
}


export class CommandProcessor {

	private commands: ProcessedCommand[] = []

	setRawCommands(commands: RawCommand[], defaultRunIn: Configuration['defaultRunIn']) {
		this.commands = this.processCommands(commands, defaultRunIn)
	}

	private processCommands(commands: RawCommand[], defaultRunIn: Configuration['defaultRunIn']): ProcessedCommand[] {
		return commands.map(command => {
			return Object.assign({}, command, {
				runIn: command.runIn || defaultRunIn || 'backend',
				languages: command.languages,
				match: command.match ? new RegExp(command.match, 'i') : undefined,
				notMatch: command.notMatch ? new RegExp(command.notMatch, 'i') : undefined,
				globMatch: command.globMatch ? command.globMatch : undefined
			})
		})
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileBeforeSaving(document: VSCodeDocument) {
		return this.prepareCommandsForFile(document, true)
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileAfterSaving(document: VSCodeDocument) {
		return this.prepareCommandsForFile(document, false)
	}

	/** Prepare raw commands to link current working file. */
	private async prepareCommandsForFile(document: VSCodeDocument, forCommandsAfterSaving: boolean) {
		let preparedCommands = []

		for (let command of await this.filterCommandsFromFilePath(document)) {
			let commandString = forCommandsAfterSaving
				? command.commandBeforeSaving
				: command.command

			if (!commandString) {
				continue
			}

			let pathSeparator = command.forcePathSeparator

			if (command.runIn === 'backend') {
				preparedCommands.push({
					runIn: 'backend',
					command: this.formatArgs(await this.formatCommandString(commandString, pathSeparator, document.uri), command.args),
					runningStatusMessage: await this.formatVariables(command.runningStatusMessage, pathSeparator, document.uri),
					finishStatusMessage: await this.formatVariables(command.finishStatusMessage, pathSeparator, document.uri),
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
					doNotDisturb: command.doNotDisturb ?? false,
				} as BackendCommand)
			}
			else if (command.runIn === 'terminal') {
				preparedCommands.push({
					runIn: 'terminal',
					command: this.formatArgs(await this.formatCommandString(commandString, pathSeparator, document.uri), command.args),
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
				} as TerminalCommand)
			}
			else {
				preparedCommands.push({
					runIn: 'vscode',
					command: await this.formatCommandString(commandString, pathSeparator, document.uri),
					args: command.args,
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
				} as VSCodeCommand)
			}
		}

		return preparedCommands
	}

	private async filterCommandsFromFilePath(document: VSCodeDocument): Promise<ProcessedCommand[]> {
		let filteredCommands = []

		for (let command of this.commands) {
			let {languages, match, notMatch, globMatch} = command

			if (!this.doLanguageTest(languages, document)) {
				continue;
			}

			if (!this.doMatchTest(match, notMatch, document.uri)) {
				continue
			}

			if (!(await this.doGlobMatchTest(globMatch, document.uri))) {
				continue
			}

			filteredCommands.push(command)
		}

		return filteredCommands
	}

	private doLanguageTest(languages: string[] | undefined, document: VSCodeDocument): boolean {
		// No languages specified. Apply to all by default.
		if (!languages?.length) {
			return true
		}

		// Does not apply if user has specified languages and the current document is a `NotebookDocument`.
		if (!('languageId' in document)) {
			return false
		}

		// Match `languageId` case-insensitively.
		return languages.some((languageId) => languageId.toLowerCase() === document.languageId.toLowerCase())
	}

	private doMatchTest(match: RegExp | undefined, notMatch: RegExp | undefined, uri: vscode.Uri): boolean {
		if (match && !match.test(uri.fsPath)) {
			return false
		}

		if (notMatch && notMatch.test(uri.fsPath)) {
			return false
		}

		return true
	}

	private async doGlobMatchTest(globMatch: string | undefined, uri: vscode.Uri): Promise<boolean> {
		if (!globMatch) {
			return true
		}

		if (/\${(?:\w+:)?[\w\.]+}/.test(globMatch)) {
			globMatch = await this.formatVariables(globMatch, undefined, uri)
		}

		let gm = new minimatch.Minimatch(globMatch)

		// If match whole path.
		if (gm.match(uri.fsPath)) {
			return true
		}

		// Or match relative path.
		let relativePath = path.relative(vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || '', uri.fsPath)
		if (gm.match(relativePath)) {
			return true
		}

		return false
	}

	private async formatCommandString(command: string, pathSeparator: PathSeparator | undefined, uri: vscode.Uri): Promise<string> {
		if (!command) {
			return ''
		}

		// If white spaces exist in file name or directory name, we need to wrap them with `""`.
		// We do this by testing each piece, and wrap them if needed.
		return formatCommandPieces(command, async (piece) => {
			return CommandVariables.format(piece, uri, pathSeparator)
		})
	}

	private async formatVariables(message: string, pathSeparator: PathSeparator | undefined, uri: vscode.Uri): Promise<string> {
		if (!message) {
			return ''
		}

		return CommandVariables.format(message, uri, pathSeparator)
	}

	/** Add args to a command string. */
	private formatArgs(command: string, args: string[] | object | string | undefined): string {
		if (!args) {
			return command
		}

		if (Array.isArray(args)) {
			for (let arg of args) {
				command += ' ' + encodeCommandLineToBeQuotedIf(arg)
			}
		}
		else if (typeof args === 'string') {
			command += ' ' + args
		}
		else if (typeof args === 'object') {
			for (let [key, value] of Object.entries(args)) {
				command += ' ' + key + ' ' + encodeCommandLineToBeQuotedIf(value)
			}
		}

		return command
	}
}

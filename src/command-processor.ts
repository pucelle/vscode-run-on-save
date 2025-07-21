import * as vscode from 'vscode'
import {encodeCommandLineToBeQuotedIf} from './util'
import {MinimatchOptions, Minimatch} from 'minimatch'
import {CommandVariables} from './command-variables'
import * as path from 'path'
import {Configuration, PathSeparator, RawCommand, VSCodeDocumentPartial} from './types'


/** Processed command base, get extended by detailed command. */
export interface ProcessedCommandBase {
	languages?: string[]
	match?: RegExp
	notMatch?: RegExp
	globMatch?: string
	globMatchOptions? : MinimatchOptions
	commandBeforeSaving?: string
	command: string
	args?: string[] | object | string
	forcePathSeparator?: PathSeparator
	runIn: string
	async?: boolean
	clearOutput?: boolean
	doNotDisturb?: boolean
}

export interface BackendCommand extends ProcessedCommandBase {
	runIn: 'backend'
	runningStatusMessage: string
	finishStatusMessage: string
	workingDirectoryAsCWD: boolean
	statusMessageTimeout?: number
	doNotDisturb?: boolean
}

export interface TerminalCommand extends ProcessedCommandBase {
	runIn: 'terminal'
	statusMessageTimeout?: number
	terminalHideTimeout?: number
	clearOutput?: boolean
	doNotDisturb?: boolean
}

export interface VSCodeCommand extends ProcessedCommandBase {
	runIn: 'vscode'
	args?: string[] | object | string
}

export type ProcessedCommand = BackendCommand | TerminalCommand | VSCodeCommand



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
			}) as ProcessedCommand
		})
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileBeforeSaving(document: VSCodeDocumentPartial): Promise<ProcessedCommand[]> {
		return this.prepareCommandsForDocument(document, true)
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileAfterSaving(document: VSCodeDocumentPartial): Promise<ProcessedCommand[]> {
		return this.prepareCommandsForDocument(document, false)
	}

	/** Prepare raw commands to link current working file. */
	private async prepareCommandsForDocument(document: VSCodeDocumentPartial, forCommandsAfterSaving: boolean): Promise<ProcessedCommand[]> {
		let preparedCommands: ProcessedCommand[] = []

		for (let command of await this.filterCommandsByDocument(document)) {
			let commandString = forCommandsAfterSaving
				? command.commandBeforeSaving
				: command.command

			if (!commandString) {
				continue
			}

			let pathSeparator = command.forcePathSeparator
			let formattedCommand = await CommandVariables.formatCommand(commandString, document.uri, pathSeparator)
			let commandWithArgs = await this.formatCommandWithArgs(formattedCommand, command.args, document.uri, pathSeparator)

			if (command.runIn === 'backend') {
				preparedCommands.push({
					runIn: 'backend',
					command: commandWithArgs,
					runningStatusMessage: await CommandVariables.format(command.runningStatusMessage, document.uri, pathSeparator),
					finishStatusMessage: await CommandVariables.format(command.finishStatusMessage, document.uri, pathSeparator),
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
					doNotDisturb: command.doNotDisturb ?? false,
				} as BackendCommand)
			}
			else if (command.runIn === 'terminal') {
				preparedCommands.push({
					runIn: 'terminal',
					command: commandWithArgs,
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
					doNotDisturb: command.doNotDisturb ?? false,
				} as TerminalCommand)
			}
			else {
				preparedCommands.push({
					runIn: 'vscode',
					command: commandWithArgs,
					args: command.args,
					async: command.async ?? true,
					clearOutput: command.clearOutput ?? false,
				} as VSCodeCommand)
			}
		}

		return preparedCommands
	}

	private async filterCommandsByDocument(document: VSCodeDocumentPartial): Promise<ProcessedCommand[]> {
		let filteredCommands = []

		for (let command of this.commands) {
			let {languages, match, notMatch, globMatch} = command

			if (!this.doLanguageTest(languages, document)) {
				continue
			}

			if (!this.doMatchTest(match, notMatch, document.uri)) {
				continue
			}

			if (!await this.doGlobMatchTest(globMatch, document.uri, command.globMatchOptions)) {
				continue
			}

			filteredCommands.push(command)
		}

		return filteredCommands
	}

	private doLanguageTest(languages: string[] | undefined, document: VSCodeDocumentPartial): boolean {

		// No languages specified, not filter out document.
		if (!languages?.length) {
			return true
		}

		// Does not apply if user has specified languages and the current document is a `NotebookDocument`.
		if (!('languageId' in document)) {
			return false
		}

		// Match `languageId` case-insensitively.
		return languages.some((languageId) => languageId.toLowerCase() === document.languageId!.toLowerCase())
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

	private async doGlobMatchTest(globMatch: string | undefined, uri: vscode.Uri, globMatchOptions?: MinimatchOptions): Promise<boolean> {
		if (!globMatch) {
			return true
		}

		// Have variable interpolation.
		if (/\${(?:\w+:)?[\w\.]+}/.test(globMatch)) {
			globMatch = await CommandVariables.format(globMatch, uri, undefined)
		}

		let gm = new Minimatch(globMatch, globMatchOptions)

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


	/** Add args to a command string. */
	private async formatCommandWithArgs(command: string, args: string[] | object | string | undefined, uri: vscode.Uri, pathSeparator: string | undefined): Promise<string> {
		if (!args) {
			return command
		}

		if (Array.isArray(args)) {
			for (let arg of args) {
				command += ' ' + encodeCommandLineToBeQuotedIf(await CommandVariables.format(arg, uri, pathSeparator))
			}
		}
		else if (typeof args === 'string') {
			command += ' ' + args
		}
		else if (typeof args === 'object') {
			for (let [key, value] of Object.entries(args)) {
				command += ' ' + key + ' ' + encodeCommandLineToBeQuotedIf(await CommandVariables.format(value, uri, pathSeparator))
			}
		}

		return command
	}
}

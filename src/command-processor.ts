import * as path from 'path'
import * as vscode from 'vscode'
import { encodeCommandLineToBeQuoted, decodeQuotedCommandLine } from './util'
import * as minimatch from 'minimatch'
import { homedir } from 'os'


/** Raw command configured by user. */
export interface RawCommand {
	match: string
	notMatch: string
	globMatch: string
	commandBeforeSaving?: string
	command?: string
	args?: string[] | object | string
	forcePathSeparator?: PathSeparator
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
	async?: boolean
}

type PathSeparator = '/' | '\\'

/** Processed command, which can be run directly. */
export interface ProcessedCommand {
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
}

/** The commands in list will be picked by current editting file path. */
export interface BackendCommand {
	runIn: 'backend'
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
	workingDirectoryAsCWD: boolean
	async: boolean
	statusMessageTimeout?: number
}

export interface TerminalCommand {
	runIn: 'terminal'
	command: string
	async: boolean
	statusMessageTimeout?: number
	terminalHideTimeout?: number
}

export interface VSCodeCommand {
	runIn: 'vscode'
	command: string
	args?: string[] | object | string
	async: boolean
}


export class CommandProcessor {

	private commands: ProcessedCommand[] = []

	setRawCommands(commands: RawCommand[]) {
		this.commands = this.processCommands(commands)
	}

	private processCommands(commands: RawCommand[]): ProcessedCommand[] {
		return commands.map(command => {
			command.runIn = command.runIn || 'backend'

			return Object.assign({}, command, {
				match: command.match ? new RegExp(command.match, 'i') : undefined,
				notMatch: command.notMatch ? new RegExp(command.notMatch, 'i') : undefined,
				globMatch: command.globMatch ? command.globMatch : undefined
			})
		})
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileBeforeSaving(uri: vscode.Uri) {
		return this.prepareCommandsForFile(uri, true)
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileAfterSaving(uri: vscode.Uri) {
		return this.prepareCommandsForFile(uri, false)
	}
	
	/** Prepare raw commands to link current working file. */
	private async prepareCommandsForFile(uri: vscode.Uri, forCommandsAfterSaving: boolean) {
		let preparedCommands = []

		for (const command of await this.filterCommandsFromFilePath(uri)) {
			const commandString = forCommandsAfterSaving
			? command.commandBeforeSaving
			: command.command

			if (!commandString) {
				continue
			}

			const pathSeparator = command.forcePathSeparator

			if (command.runIn === 'backend') {
				preparedCommands.push({
					runIn: 'backend',
					command: this.formatArgs(await this.formatVariables(commandString, pathSeparator, uri, true), command.args),
					runningStatusMessage: await this.formatVariables(command.runningStatusMessage, pathSeparator, uri),
					finishStatusMessage: await this.formatVariables(command.finishStatusMessage, pathSeparator, uri),
					async: command.async ?? true,			
				} as BackendCommand)
			} else if (command.runIn === 'terminal') {
				preparedCommands.push({
					runIn: 'terminal',
					command: this.formatArgs(await this.formatVariables(commandString, pathSeparator, uri, true), command.args),
					async: command.async ?? true,
				} as TerminalCommand)
			} else {
				preparedCommands.push({
					runIn: 'vscode',
					command: await this.formatVariables(commandString, pathSeparator, uri, true),
					args: command.args,
					async: command.async ?? true,
				} as VSCodeCommand)
			}
		}

		return preparedCommands
	}

	private async filterCommandsFromFilePath(uri: vscode.Uri): Promise<ProcessedCommand[]> {
		let filteredCommands = []

		for (const command of this.commands) {
			let {match, notMatch, globMatch} = command
			if (match && !match.test(uri.fsPath)) {
				continue
			}
			if (notMatch && notMatch.test(uri.fsPath)) {
				continue
			}

			if (globMatch) {
				if (/\${(?:\w+:)?[\w\.]+}/.test(globMatch)) {
					globMatch = await this.formatVariables(globMatch, undefined, uri)
				}

				if (!minimatch(uri.fsPath, globMatch)) {
					continue
				}
			}

			filteredCommands.push(command)
		}

		return filteredCommands
	}

	private async formatVariables(commandOrMessage: string, pathSeparator: PathSeparator | undefined, uri: vscode.Uri, isCommand: boolean = false): Promise<string> {
		if (!commandOrMessage) {
			return ''
		}

		const variables = [
			'userHome',
			'workspaceFolder',
			'workspaceFolderBasename',
			'file',
			'fileWorkspaceFolder',
			'relativeFile',
			'relativeFileDirname',
			'fileBasename',
			'fileBasenameNoExtension',
			'fileExtname',
			'fileDirname',
			'fileDirnameBasename',
			'cwd',
			'lineNumber',
			'selectedText',
			'execPath',
			'defaultBuildTask',
			'pathSeparator',
			'env',
			'config',
		]

		// if white spaces in file name or directory name, we need to wrap them in "".
		// we doing this by testing each pieces, and wrap them if needed.
		return this.replaceAsync(commandOrMessage, /\S+/g, async (piece: string) => {
			const oldPiece = piece
			let alreadyQuoted = false

			if (piece[0] === '"' && piece[piece.length - 1] === '"') {
				piece = decodeQuotedCommandLine(piece.slice(1, -1))
				alreadyQuoted = true
			}

			piece = await this.replaceAsync(piece, /\${(?:(\w+):)?([\w\.]+)}/g, async (m0: string, prefix: string, name: string) => {
				if (variables.includes(prefix || name)) {
					let value = await this.getVariableValue(prefix, name, uri)
					value = this.formatPathSeparator(value, pathSeparator)
					return value
				}

				return m0
			})

			// If piece includes spaces or `\\`, or be quoted before, then it must be encoded.
			if (isCommand && piece !== oldPiece && /[\s"]|\\\\/.test(piece) || alreadyQuoted) {
				piece = '"' + encodeCommandLineToBeQuoted(piece) + '"'
			}

			return piece
		})
	}

	/** Get each variable value from its name. */
	private async getVariableValue(prefix: string, name: string, uri: vscode.Uri) {
		let scope

		if (prefix) {
			switch (prefix) {
				case 'env':
					return process.env[name] || ''
				case 'config':
					return vscode.workspace.getConfiguration("", uri)?.get(name)?.toString() || ''
			}

			[scope, name] = [name, prefix]
		}

		switch (name) {
			case 'userHome':
				return homedir()

			case 'workspaceFolder':
				return this.getRootPath(uri, scope)

			case 'workspaceFolderBasename':
				return path.basename(this.getRootPath(uri, scope))

			case 'file':
				return uri.fsPath
			
			case 'fileWorkspaceFolder':
				return this.getRootPath(uri)

			case 'relativeFile':
				return path.relative(this.getRootPath(uri, scope), uri.fsPath)

			case 'relativeFileDirname':
				return this.getDirName(path.relative(this.getRootPath(uri, scope), uri.fsPath))

			case 'fileBasename':
				return path.basename(uri.fsPath)

			case 'fileBasenameNoExtension':
				return path.basename(uri.fsPath, path.extname(uri.fsPath))

			case 'fileExtname':
				return path.extname(uri.fsPath)

			case 'fileDirname':
				return this.getDirName(uri.fsPath)

			case 'fileDirnameBasename':
				return path.basename(this.getDirName(uri.fsPath))

			case 'cwd':
				return process.cwd()

			case 'lineNumber':
				return this.editor?.selection.active.line.toString() || ''
			
			case 'selectedText':
				return this.editor?.document.getText(this.editor.selection) || ''
			
			case 'execPath':
				return process.execPath
			
			case 'defaultBuildTask':
				return (await vscode.tasks.fetchTasks())
					.find(t => t.group?.id == vscode.TaskGroup.Build.id && t.group.isDefault)
					?.name || ''

			case 'pathSeparator':
				return path.sep

			default:
				return ''
		}
	}

	/** Replace path separators. */
	private formatPathSeparator(path: string, pathSeparator: string | undefined) {
		if (pathSeparator) {
			path = path.replace(/[\\|\/]/g, pathSeparator)
		}

		return path
	}

	// `path.dirname(...)` can't handle paths like `\\dir\name`.
	private getDirName(filePath: string): string {
		return filePath.replace(/[\\\/][^\\\/]+$/, '') || filePath[0] || ''
	}

	private getRootPath(uri: vscode.Uri, scope?: string): string {
		// TODO: get workspace when specified: vsCode.Uri.joinPath
		uri = scope ? vscode.Uri.file(scope) : uri
		return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || ''
	}

	/** Add args to a command string. */
	private formatArgs(command: string, args: string[] | object | string | undefined): string {
		if (!args) {
			return command
		}

		if (Array.isArray(args)) {
			for (const arg of args) {
				command += ' ' + this.encodeCommandLineToBeQuotedIf(arg)
			}
		}
		else if (typeof args === 'string') {
			command += ' ' + args
		}
		else if (typeof args === 'object') {
			for (const [key, value] of Object.entries(args)) {
				command += ' ' + key + ' ' + this.encodeCommandLineToBeQuotedIf(value)
			}
		}

		return command
	}

	/** If piece includes spaces, `\\`, or is quoted, then it must be encoded. */
	private encodeCommandLineToBeQuotedIf(arg: string) {
		if (/[\s"]|\\\\/.test(arg)) {
			arg = '"' + encodeCommandLineToBeQuoted(arg) + '"'
		}

		return arg
	}

	private async replaceAsync(str: string, searchValue: RegExp, replacer: (...matches: string[]) => Promise<string>): Promise<string> {
		const replacements = await Promise.all(
			Array.from(str.matchAll(searchValue),
			match => replacer(...match))
		);

		let i = 0;
		return str.replace(searchValue, () => replacements[i++]);
	}

	private get editor() {
		return vscode.window.activeTextEditor
	}
}

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

/** The commands in list will be picked by current editing file path. */
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

	private vars = Vars.of({
		env: name => process.env[name] || '',
		config: (name, uri) => vscode.workspace.getConfiguration("", uri)?.get<string>(name) || '',
		command: async name => await vscode.commands.executeCommand(name)
	})

	private values = Vars.of({
		userHome: () => homedir(),
		workspaceFolder: (uri, scope) => this.getRootPath(uri, scope),
		workspaceFolderBasename: (uri, scope) => path.basename(this.getRootPath(uri, scope)),
		file: (uri) => uri.fsPath,
		fileWorkspaceFolder: (uri) => this.getRootPath(uri),
		relativeFile: (uri, scope) => path.relative(this.getRootPath(uri, scope), uri.fsPath),
		relativeFileDirname: (uri, scope) => this.getDirName(path.relative(this.getRootPath(uri, scope), uri.fsPath)),
		fileBasename: (uri) => path.basename(uri.fsPath),
		fileBasenameNoExtension: (uri) => path.basename(uri.fsPath, path.extname(uri.fsPath)),
		fileExtname: (uri) => path.extname(uri.fsPath),
		fileDirname: (uri) => this.getDirName(uri.fsPath),
		fileDirnameBasename: (uri) => path.basename(this.getDirName(uri.fsPath)),
		cwd: () => process.cwd(),
		lineNumber: () => this.editor?.selection.active.line.toString() || '',
		selectedText: () => this.editor?.document.getText(this.editor.selection) || '',
		execPath: () => process.execPath,
		defaultBuildTask: async () => await this.defaultBuildTask(),
		pathSeparator: () => path.sep
	})

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
		const preparedCommands = []

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
		const filteredCommands = []

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
				if (this.vars.has(prefix) || this.values.has(name)) {
					const value = await this.getVariableValue(prefix, name, uri)
					return this.formatPathSeparator(value, pathSeparator)
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
		let scope = ''

		if (prefix) {
			const values = this.vars.get(prefix)
			if (values != null) {
				return values.get(name, uri)
			}

			[scope, name] = [name, prefix]
		}

		return this.values.get(name)?.get(uri, scope) || ''
	}

	private async defaultBuildTask() {
		return (await vscode.tasks.fetchTasks())
			.find(t => t.group?.id == vscode.TaskGroup.Build.id && t.group.isDefault)
			?.name || ''
	}

	/** Replace path separators. */
	private formatPathSeparator(path: string, pathSeparator: string | undefined) {
		return pathSeparator ? path.replace(/[\\|\/]/g, pathSeparator) : path
	}

	// `path.dirname(...)` can't handle paths like `\\dir\name`.
	private getDirName(filePath: string): string {
		return filePath.replace(/[\\\/][^\\\/]+$/, '') || filePath[0] || ''
	}

	private getRootPath(uri: vscode.Uri, scope?: string): string {
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

class Vars {
	private constructor() {}

	public static of(fns: { [prefix: string]: VarFn}) {
		return new Map(Object.entries(fns).map(
			([name, fn]) => [name, new Var(fn)]
		))
	}
}

class Var {
	constructor(private fn: VarFn) {}

	public get(...args: any[]): Promise<string> {
		return Promise.resolve(this.fn(...args))
	}
}

type VarFn = (...args: any[]) => string | Promise<string>

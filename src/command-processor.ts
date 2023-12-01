import * as path from 'path'
import * as vscode from 'vscode'
import {encodeCommandLineToBeQuoted, decodeQuotedCommandLine} from './util'
import * as minimatch from 'minimatch'


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
	private prepareCommandsForFile(uri: vscode.Uri, forCommandsAfterSaving: boolean) {
		let filteredCommands = this.filterCommandsFromFilePath(uri)

		let processedCommands = filteredCommands.map((command) => {
			let commandString = forCommandsAfterSaving
				? command.commandBeforeSaving
				: command.command

			let pathSeparator = command.forcePathSeparator

			if (!commandString) {
				return null
			}

			if (command.runIn === 'backend') {
				return {
					runIn: 'backend',
					command: this.formatArgs(this.formatVariables(commandString, pathSeparator, uri, true), command.args),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, pathSeparator, uri),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, pathSeparator, uri),
					async: command.async ?? true,
				} as BackendCommand
			}
			else if (command.runIn === 'terminal') {
				return {
					runIn: 'terminal',
					command: this.formatArgs(this.formatVariables(commandString, pathSeparator, uri, true), command.args),
					async: command.async ?? true,
				} as TerminalCommand
			}
			else {
				return {
					runIn: 'vscode',
					command: this.formatVariables(commandString, pathSeparator, uri, true),
					args: command.args,
					async: command.async ?? true,
				} as VSCodeCommand
			}
		})

		return processedCommands.filter(v => v) as (BackendCommand | TerminalCommand | VSCodeCommand)[]
	}

	private filterCommandsFromFilePath(uri: vscode.Uri): ProcessedCommand[] {
		return this.commands.filter(({match, notMatch, globMatch}) => {
			if (match && !match.test(uri.fsPath)) {
				return false
			}

			if (notMatch && notMatch.test(uri.fsPath)) {
				return false
			}

			if (globMatch) {
				if (/\${((\w+):)?(\w+)}/.test(globMatch)) {
					globMatch = this.formatVariables(globMatch, undefined, uri)
				}

				if (!minimatch(uri.fsPath, globMatch)) {
					return false
				}
			}

			return true
		})
	}

	private formatVariables(commandOrMessage: string, pathSeparator: PathSeparator | undefined, uri: vscode.Uri, isCommand: boolean = false): string {
		if (!commandOrMessage) {
			return ''
		}

		let variables = [
			'workspaceFolder',
			'workspaceFolderBasename', 
			'file',
			'fileBasename',
			'fileBasenameNoExtension', 
			'fileDirname',
			'fileDirnameRelative',
			'fileExtname',
			'fileRelative',
			'cwd',
			'env',
		]

		// if white spaces in file name or directory name, we need to wrap them in "".
		// we doing this by testing each pieces, and wrap them if needed.
		return commandOrMessage.replace(/\S+/g, (piece: string) => {
			let oldPiece = piece
			let alreadyQuoted = false

			if (piece[0] === '"' && piece[piece.length - 1] === '"') {
				piece = decodeQuotedCommandLine(piece.slice(1, -1))
				alreadyQuoted = true
			}

			piece = piece.replace(/\${(?:(\w+):)?(\w+)}/g, (m0: string, prefix: string, name: string) => {
				if (variables.includes(prefix || name)) {
					let value = this.getPathVariableValue(prefix, name, uri)
					value = this.formatPathSeparator(value, pathSeparator)
					return value
				}

				return m0
			})
			
			piece = piece.replace(/\${env\.([\w]+)}/g, (_sub: string, envName: string) => {
				return envName ? String(process.env[envName]) : ''
			})

			// If piece includes spaces or `\\`, or be quoted before, then it must be encoded.
			if (isCommand && piece !== oldPiece && /[\s"]|\\\\/.test(piece) || alreadyQuoted) {
				piece = '"' + encodeCommandLineToBeQuoted(piece) + '"'
			}

			return piece
		})
	}

	/** Get each path variable value from its name. */
	private getPathVariableValue(prefix: string, name: string, uri: vscode.Uri) {
		switch(prefix) {
			case 'env':
				return process.env[name] || ''
		}

		switch(name) {
			case 'workspaceFolder':
				return this.getRootPath(uri)

			case 'workspaceFolderBasename':
				return path.basename(vscode.workspace.rootPath || '')

			case 'file':
				return uri.fsPath

			case 'fileBasename':
				return path.basename(uri.fsPath)

			case 'fileBasenameNoExtension':
				return path.basename(uri.fsPath, path.extname(uri.fsPath))

			case 'fileDirname':
				return this.getDirName(uri.fsPath)

			case 'fileDirnameRelative':
				return this.getDirName(path.relative(this.getRootPath(uri), uri.fsPath))

			case 'fileExtname':
				return path.extname(uri.fsPath)

			case 'fileRelative':
				return path.relative(this.getRootPath(uri), uri.fsPath)

			case 'cwd':
				return process.cwd()

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
		let dir = filePath.replace(/[\\\/][^\\\/]+$/, '')
		if (!dir) {
			dir = filePath[0] || ''
		}
		return dir
	}

	private getRootPath(uri: vscode.Uri): string {
		return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || ''
	}

	/** Add args to a command string. */
	private formatArgs(command: string, args: string[] | object | string | undefined): string {
		if (!args) {
			return command
		}

		if (Array.isArray(args)) {
			for (let arg of args) {
				command += ' ' + this.encodeCommandLineToBeQuotedIf(arg)
			}
		}
		else if (typeof args === 'string') {
			command += ' ' + args
		}
		else if (typeof args === 'object') {
			for (let [key, value] of Object.entries(args)) {
				command += ' ' + key + ' ' + this.encodeCommandLineToBeQuotedIf(value)
			}
		}

		return command
	}

	/** If piece includes spaces, `\\`, or be quoted, then it must be encoded. */
	private encodeCommandLineToBeQuotedIf(arg: string) {
		if (/[\s"]|\\\\/.test(arg)) {
			arg = '"' + encodeCommandLineToBeQuoted(arg) + '"'
		}

		return arg
	}
}

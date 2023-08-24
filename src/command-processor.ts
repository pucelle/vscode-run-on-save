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
	prepareCommandsForFileBeforeSaving(filePath: string) {
		return this.prepareCommandsForFile(filePath, true)
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFileAfterSaving(filePath: string) {
		return this.prepareCommandsForFile(filePath, false)
	}
	
	/** Prepare raw commands to link current working file. */
	private prepareCommandsForFile(filePath: string, forCommandsAfterSaving: boolean) {
		let filteredCommands = this.filterCommandsFromFilePath(filePath)

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
					command: this.formatArgs(this.formatVariables(commandString, pathSeparator, filePath, true), command.args),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, pathSeparator, filePath),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, pathSeparator, filePath),
					async: command.async ?? true,
				} as BackendCommand
			}
			else if (command.runIn === 'terminal') {
				return {
					runIn: 'terminal',
					command: this.formatArgs(this.formatVariables(commandString, pathSeparator, filePath, true), command.args),
					async: command.async ?? true,
				} as TerminalCommand
			}
			else {
				return {
					runIn: 'vscode',
					command: this.formatVariables(commandString, pathSeparator, filePath, true),
					args: command.args,
					async: command.async ?? true,
				} as VSCodeCommand
			}
		})

		return processedCommands.filter(v => v) as (BackendCommand | TerminalCommand | VSCodeCommand)[]
	}

	private filterCommandsFromFilePath(filePath: string): ProcessedCommand[] {
		return this.commands.filter(({match, notMatch, globMatch}) => {
			if (match && !match.test(filePath)) {
				return false
			}

			if (notMatch && notMatch.test(filePath)) {
				return false
			}

			if (globMatch) {
				if (/\$\{\w+\}/.test(globMatch)) {
					globMatch = this.formatVariables(globMatch, undefined, filePath)
				}

				if (!minimatch(filePath, globMatch)) {
					return false
				}
			}

			return true
		})
	}

	private formatVariables(commandOrMessage: string, pathSeparator: PathSeparator | undefined, filePath: string, isCommand: boolean = false): string {
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

			piece = piece.replace(/\${(\w+)}/g, (m0: string, name: string) => {
				if (variables.includes(name)) {
					let value = this.getPathVariableValue(name, filePath)
					value = this.formatPathSeparator(value, pathSeparator)
					return value
				}
				else {
					return m0
				}
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

	/** Get each path variable value from it's name. */
	private getPathVariableValue(name: string, filePath: string) {
		switch(name) {
			case 'workspaceFolder':
				return vscode.workspace.rootPath || ''

			case 'workspaceFolderBasename':
				return path.basename(vscode.workspace.rootPath || '')

			case 'file':
				return filePath

			case 'fileBasename':
				return path.basename(filePath)

			case 'fileBasenameNoExtension':
				return path.basename(filePath, path.extname(filePath))

			case 'fileDirname':
				return this.getDirName(filePath)

			case 'fileDirnameRelative':
				return this.getDirName(path.relative(vscode.workspace.rootPath || '', filePath))

			case 'fileExtname':
				return path.extname(filePath)

			case 'fileRelative':
				return path.relative(vscode.workspace.rootPath || '', filePath)

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

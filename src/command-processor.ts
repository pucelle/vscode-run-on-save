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
	forcePathSeparator?: PathSeparator
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

type PathSeparator = '/' | '\\'

/** Processed command, which can be run directly. */
export interface ProcessedCommand {
	match?: RegExp
	notMatch?: RegExp
	globMatch?: string
	commandBeforeSaving?: string
	command?: string
	forcePathSeparator?: PathSeparator
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface BackendCommand {
	runIn: 'backend'
	command: string
	forcePathSeparator?: PathSeparator
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface TerminalCommand {
	runIn: 'terminal'
	command: string
	forcePathSeparator?: PathSeparator
}

export interface VSCodeCommand {
	runIn: 'vscode'
	command: string
	forcePathSeparator?: PathSeparator
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
					command: this.formatVariables(commandString, pathSeparator, filePath, true),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, pathSeparator, filePath),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, pathSeparator, filePath),
				} as BackendCommand
			}
			else if (command.runIn === 'terminal') {
				return {
					runIn: 'terminal',
					command: this.formatVariables(commandString, pathSeparator, filePath, true)
				} as TerminalCommand
			}
			else {
				return {
					runIn: 'vscode',
					command: this.formatVariables(commandString, pathSeparator, filePath, true)
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

			if (globMatch && !minimatch(filePath, globMatch)) {
				return false
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

			if (piece[0] === '"' && piece[piece.length - 1] === '"') {
				piece = decodeQuotedCommandLine(piece.slice(1, -1))
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

			// If piece includes spaces or `\\`, then it must be encoded
			if (isCommand && piece !== oldPiece && /[\s"]|\\\\/.test(piece)) {
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

	// `path.dirname` can't handle `\\dir\name`
	private getDirName(filePath: string): string {
		let dir = filePath.replace(/[\\\/][^\\\/]+$/, '')
		if (!dir) {
			dir = filePath[0] || ''
		}
		return dir
	}
}

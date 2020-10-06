import * as path from 'path'
import * as vscode from 'vscode'
import {encodeCommandLineToBeQuoted, decodeQuotedCommandLine} from './util'
import * as minimatch from 'minimatch'


/** Raw command configured by user. */
export interface RawCommand {
	match: string
	notMatch: string
	globMatch: string
	command: string
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

/** Processed command, which can be run directly. */
export interface ProcessedCommand {
	match?: RegExp
	notMatch?: RegExp
	globMatch?: string
	command: string
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface BackendCommand {
	runIn: 'backend'
	command: string
	runningStatusMessage: string
	finishStatusMessage: string
}

export interface TerminalCommand {
	runIn: 'terminal'
	command: string
}

export interface VSCodeCommand {
	runIn: 'vscode'
	command: string
}


export class CommandProcessor {

	private commands: ProcessedCommand[] = []

	setRawCommands(commands: RawCommand[]) {
		this.commands = this.processCommands(commands)
	}

	private processCommands(commands: RawCommand[]): ProcessedCommand[] {
		return commands.filter(command => command.command).map(command => {
			command.runIn = command.runIn || 'backend'

			return Object.assign({}, command, {
				match: command.match ? new RegExp(command.match, 'i') : undefined,
				notMatch: command.notMatch ? new RegExp(command.notMatch, 'i') : undefined,
				globMatch: command.globMatch ? command.globMatch : undefined
			})
		})
	}

	/** Prepare raw commands to link current working file. */
	prepareCommandsForFile(filePath: string): (BackendCommand | TerminalCommand | VSCodeCommand)[] {
		let filteredCommands = this.filterCommandsFromFilePath(filePath)

		let processedCommands = filteredCommands.map((command) => {
			if (command.runIn === 'backend') {
				return {
					runIn: 'backend',
					command: this.formatVariables(command.command, filePath, true),
					runningStatusMessage: this.formatVariables(command.runningStatusMessage, filePath),
					finishStatusMessage: this.formatVariables(command.finishStatusMessage, filePath)
				} as BackendCommand
			}
			else if (command.runIn === 'terminal') {
				return {
					runIn: 'terminal',
					command: this.formatVariables(command.command, filePath, true)
				} as TerminalCommand
			}
			else {
				return {
					runIn: 'vscode',
					command: this.formatVariables(command.command, filePath, true)
				} as VSCodeCommand
			}
		})

		return processedCommands
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

	private formatVariables(commandOrMessage: string, filePath: string, isCommand: boolean = false): string {
		if (!commandOrMessage) {
			return ''
		}

		// if white spaces in file name or directory name, we need to wrap them in "".
		// we doing this by testing each pieces, and wrap them if needed.
		return commandOrMessage.replace(/\S+/g, (piece: string) => {
			let oldPiece = piece

			if (piece[0] === '"' && piece[piece.length - 1] === '"') {
				piece = decodeQuotedCommandLine(piece.slice(1, -1))
			}

			piece = piece.replace(/\${workspaceFolder}/g, vscode.workspace.rootPath || '')
			piece = piece.replace(/\${workspaceFolderBasename}/g, path.basename(vscode.workspace.rootPath || ''))
			piece = piece.replace(/\${file}/g, filePath)
			piece = piece.replace(/\${fileBasename}/g, path.basename(filePath))
			piece = piece.replace(/\${fileBasenameNoExtension}/g, path.basename(filePath, path.extname(filePath)))
			piece = piece.replace(/\${fileDirname}/g, this.getDirName(filePath))
			piece = piece.replace(/\${fileExtname}/g, path.extname(filePath))
			piece = piece.replace(/\${cwd}/g, process.cwd())

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

	// `path.dirname` can't handle `\\dir\name`
	private getDirName(filePath: string): string {
		let dir = filePath.replace(/[\\\/][^\\\/]+$/, '')
		if (!dir) {
			dir = filePath[0] || ''
		}
		return dir
	}
}

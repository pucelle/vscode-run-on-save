import * as vscode from 'vscode'


export interface Configuration {
	statusMessageTimeout: number
	ignoreFilesBy: string[]
	shell: String
	commands: RawCommand
	defaultRunIn: 'backend' | 'terminal' | 'vscode'
}

/** Raw command configured by user. */
export interface RawCommand {
	languages?: string[]
	match?: string
	notMatch?: string
	globMatch?: string
	commandBeforeSaving?: string
	command?: string
	args?: string[] | object | string
	forcePathSeparator?: PathSeparator
	runIn?: string
	runningStatusMessage?: string
	finishStatusMessage?: string
	async?: boolean
	clearOutput?: boolean
	doNotDisturb?: boolean
}

export type PathSeparator = '/' | '\\'

export type VSCodeDocument = vscode.TextDocument | vscode.NotebookDocument

export type VSCodeDocumentPartial = Pick<vscode.TextDocument, 'uri'> & Partial<Pick<vscode.TextDocument, 'languageId'>>


/** Stable `run-on-save` plugin output. */
export interface RunOnSavePluginExport {

	/** Get whether this plugin is enabled. */
	getEnabled(): boolean

	/** Set enabled state of this plugin. */
	setEnabled(enabled: boolean): void

	/** Before a document save. */
	onWillSaveDocument(document: VSCodeDocument, reason: vscode.TextDocumentSaveReason): Promise<void>

	/** After a document saved. */
	onDocumentSaved(document: VSCodeDocument): Promise<void>
}
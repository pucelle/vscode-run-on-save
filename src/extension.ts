import * as vscode from 'vscode';
import {RunOnSaveExtension} from './run-on-save';


export function activate(context: vscode.ExtensionContext): RunOnSaveExtension {
	const extension = new RunOnSaveExtension(context)

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			extension.loadConfig()
		}),

		vscode.commands.registerCommand('extension.enableRunOnSave', () => {
			extension.setEnabled(true)
		}),

		vscode.commands.registerCommand('extension.disableRunOnSave', () => {
			extension.setEnabled(false)
		}),

		vscode.workspace.onWillSaveTextDocument((e: vscode.TextDocumentWillSaveEvent) => {
			e.waitUntil(extension.onWillSaveDocument(e.document))
		}),

		vscode.workspace.onWillSaveNotebookDocument((e: vscode.NotebookDocumentWillSaveEvent) => {
			e.waitUntil(extension.onWillSaveDocument(e.notebook))
		}),

		vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
			extension.onDocumentSaved(document)
		}),

		vscode.workspace.onDidSaveNotebookDocument((document: vscode.NotebookDocument) => {
			extension.onDocumentSaved(document)
		}),
	)

	return extension
}

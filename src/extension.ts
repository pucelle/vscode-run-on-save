import * as vscode from 'vscode';
import {RunOnSaveExtension} from './run-on-save';


export function activate(context: vscode.ExtensionContext): RunOnSaveExtension {
	let extension = new RunOnSaveExtension(context)

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

		vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
			extension.onDocumentSave(document)
		})
	)

	return extension
}

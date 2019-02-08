import * as vscode from 'vscode';
import { RunOnSaveExtension } from './run-on-save';


export function activate(context: vscode.ExtensionContext): void {
	let extension = new RunOnSaveExtension(context)

	vscode.workspace.onDidChangeConfiguration(() => {
		extension.loadConfig()
	})

	vscode.commands.registerCommand('extension.enableRunOnSave', () => {
		extension.setEnabled(true)
	})

	vscode.commands.registerCommand('extension.disableRunOnSave', () => {
		extension.setEnabled(false)
	})

	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		extension.onDocumentSave(document)
	})
}

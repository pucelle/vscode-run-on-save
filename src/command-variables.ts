import * as path from 'path'
import * as vscode from 'vscode'
import {formatPathSeparator, replaceAsync} from './util'
import {homedir} from 'os'


type VariableProvider = (uri: vscode.Uri) => string | Promise<string>
type SubVariableProvider = (name: string, uri: vscode.Uri) => string | Promise<string>


export namespace CommandVariables {

	const VariableProviders: Record<string, VariableProvider> = {
		userHome: () => homedir(),
		workspaceFolder: (uri) => getRootPath(uri),
		workspaceFolderBasename: (uri) => path.basename(getRootPath(uri)),
		file: (uri) => uri.fsPath,
		fileBasename: (uri) => path.basename(uri.fsPath),
		fileBasenameNoExtension: (uri) => path.basename(uri.fsPath, path.extname(uri.fsPath)),
		fileExtname: (uri) => path.extname(uri.fsPath),
		fileRelative: (uri) => path.relative(getRootPath(uri), uri.fsPath),
		fileDirname: (uri) => getDirName(uri.fsPath),
		fileDirnameBasename: (uri) => path.basename(getDirName(uri.fsPath)),
		fileDirnameRelative: (uri) => getDirName(path.relative(getRootPath(uri), uri.fsPath)),
		
		cwd: () => process.cwd(),
		lineNumber: () => getEditor()?.selection.active.line.toString() || '',
		selectedText: () => getEditor()?.document.getText(getEditor()!.selection) || '',
		execPath: () => process.execPath,
		defaultBuildTaskName: defaultBuildTaskName,
		pathSeparator: () => path.sep,
	}

	const SubVariableProviders: Record<string, SubVariableProvider> = {
		env: name => process.env[name] || '',
		config: (name, uri) => vscode.workspace.getConfiguration('', uri)?.get(name) || '',
		command: async name => await vscode.commands.executeCommand(name),
	}

	// `path.dirname(...)` can't be used to handle paths like `\\dir\name`.
	function getDirName(filePath: string): string {
		return filePath.replace(/[\\\/][^\\\/]+$/, '') || filePath[0] || ''
	}

	function getRootPath(uri: vscode.Uri, scope?: string): string {
		uri = scope ? vscode.Uri.file(scope) : uri
		return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || ''
	}

	function getEditor() {
		return vscode.window.activeTextEditor
	}

	async function defaultBuildTaskName() {
		let tasks = await vscode.tasks.fetchTasks()
		let task = tasks.find(t => t.group?.id == vscode.TaskGroup.Build.id && t.group.isDefault)

		return task?.name || ''
	}


	/** Format variables of a string in kind of command / command piece / message. */
	export async function format(string: string, uri: vscode.Uri, pathSeparator: string | undefined) {

		// Compatible with old versioned syntax `${env.xxx}`.
		string = string.replace(/\$\{env\.(\w+)\}/g, '${env:$1}')

		return await replaceAsync(string, /\$\{(?:(\w+):)?([\w\.]+)\}/g, async (m0: string, prefix: string | undefined, name: string) => {
			let value = await getVariableValue(prefix, name, uri)
			if (value !== null) {
				return formatPathSeparator(value, pathSeparator)
			}

			return m0
		})
	}

	/** Get each variable value by RegExp match result. */
	async function getVariableValue(prefix: string | undefined, name: string, uri: vscode.Uri): Promise<string | null> {
		if (prefix && SubVariableProviders.hasOwnProperty(prefix)) {
			return SubVariableProviders[prefix](name, uri)
		}
		else if (VariableProviders.hasOwnProperty(name)) {
			return VariableProviders[name](uri)
		}
		else {
			return null
		}
	}
}

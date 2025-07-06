import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import {CommandProcessor} from '../../out/command-processor'
import {FileIgnoreChecker} from '../../out/file-ignore-checker'
import {FleetingDoubleKeysCache} from '../../out/util'
import {RawCommand, VSCodeDocumentPartial} from '../../out/types'


suite("Extension Tests", () => {
	suite('test backend command', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
			'forcePathSeparator': '/',
		}], 'backend')

		test('will compile scss file in backend', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			}
			
			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
				'doNotDisturb': false,
			}])
		})

		test('will exclude scss file that file name starts with "_"', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/_fileName.scss')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [])
		})
		
		test('will escape white spaces', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/fileName 1.scss')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(
				commands[0].command,
				'node-sass "c:/folderName/fileName 1.scss" "c:/folderName/fileName 1.css"'
			)
		})
	})


	suite('test globMatch', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			'globMatch': '**/*.scss',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
			'async': true,
			'forcePathSeparator': '/',
		}], 'backend')

		test('will compile scss file in backend', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
				'doNotDisturb': false,
			}])
		})
	})


	suite('test commandBeforeSaving', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			'globMatch': '**/*.scss',
			'runIn': 'backend',
			'commandBeforeSaving': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
			'async': true,
			'forcePathSeparator': '/',
		}], 'backend')

		test('will compile scss file in backend', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			}

			let commands = await manager.prepareCommandsForFileBeforeSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
				'doNotDisturb': false,
			}])
		})
	})

	
	suite('test backend command with back slash path', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}\\${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
		}], 'backend')

		test('will escape paths starts with "\\\\"', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('\\\\folderName\\fileName 1.scss')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(
				commands[0].command,
				'node-sass "\\\\folderName\\fileName 1.scss" "\\\\folderName\\fileName 1.css"'
			)
		})
	})


	suite('test terminal command', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'terminal',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'forcePathSeparator': '/',
		}], 'backend')

		test('will compile scss file in terminal', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'terminal',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'async': true,
				'clearOutput': false,
				"doNotDisturb": false,
			}])
		})
	})


	suite('test for #20', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			"match": ".*\\.drawio$",
			"runIn": "backend",
			"command": "draw.io --crop --export -f pdf \"${file}\"",
			'forcePathSeparator': '/',
		}], 'backend')

		test('will compile it rightly', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/test.drawio')
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'draw.io --crop --export -f pdf "c:/test.drawio"',
				'finishStatusMessage': '',
				'runningStatusMessage': '',
				'async': true,
				'clearOutput': false,
				'doNotDisturb': false,
			}])
		})
	})


	suite('test #47, supports `commands[].languages`', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			"languages": ["typescript"],
			"runIn": "backend",
			"command": "anyCommandsToRun",
		}], 'backend')

		test('will compile it rightly', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('C:/anyFileName'),
				languageId: 'typescript',
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'anyCommandsToRun',
				'async': true,
				'clearOutput': false,
				'doNotDisturb': false,
				"finishStatusMessage": "",
				"runningStatusMessage": ""
			}])
		})
	})


	suite('test for #24, should ignore files follow ".gitignore"', function () {
		let checker = new FileIgnoreChecker({
			workspaceDir: path.resolve(__dirname, '../../'),
			ignoreFilesBy: ['.gitignore'],
		})

		test('will ignore file 1', async () => {
			assert.ok(await checker.shouldIgnore(path.resolve(__dirname, '../fixture/should-ignore/test.css')))
		})

		test('will ignore file 2', async () => {
			assert.ok(await checker.shouldIgnore(path.resolve(__dirname, '../fixture/should-ignore.css')))
		})

		test('will not ignore file 3', async () => {
			assert.ok(!await checker.shouldIgnore(path.resolve(__dirname, 'index.ts')))
		})
	})


	suite('test for #40, class FleetingDoubleKeysCache', function () {
		let cache = new FleetingDoubleKeysCache<string, number, string>(100)

		test('will cache item', async () => {
			cache.set('a', 1, 'value')
			assert.equal(cache.get('a', 1), 'value')
			cache.clear()
		})

		test('will cache item for a while', async () => {
			cache.set('a', 1, 'value')
			await new Promise(resolve => setTimeout(resolve, 100))
			assert.equal(cache.get('a', 1), 'value')
			await new Promise(resolve => setTimeout(resolve, 50))
			assert.equal(cache.get('a', 1), 'value')
			cache.clear()
		})

		test('will clear after enough time', async () => {
			cache.set('a', 1, 'value')
			await new Promise(resolve => setTimeout(resolve, 250))
			assert.equal(cache.get('a', 1), undefined)
			cache.clear()
		})
	})
})
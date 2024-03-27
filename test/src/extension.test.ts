import * as assert from 'assert'
import * as path from 'path'
import {Uri} from 'vscode'
import {RawCommand, CommandProcessor} from '../../out/command-processor'
import {FileIgnoreChecker} from '../../out/file-ignore-checker'


suite("Extension Tests", () => {
	suite('test backend command', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
			'forcePathSeparator': '/',
		}])

		test('will compile scss file in backend', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/folderName/fileName.scss'))
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
			}])
		})

		test('will exclude scss file that file name starts with "_"', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/folderName/_fileName.scss'))
			assert.deepStrictEqual(commands, [])
		})
		
		test('will escape white spaces', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/folderName/fileName 1.scss'))
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
		}])

		test('will compile scss file in backend', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/folderName/fileName.scss'))
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
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
		}])

		test('will compile scss file in backend', async function () {
			let commands = await manager.prepareCommandsForFileBeforeSaving(Uri.file('C:/folderName/fileName.scss'))
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
				'async': true,
				'clearOutput': false,
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
		}])

		test('will escape paths starts with "\\\\"', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('\\\\folderName\\fileName 1.scss'))
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
		}])

		test('will compile scss file in terminal', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/folderName/fileName.scss'))
			assert.deepStrictEqual(commands, [{
				'runIn': 'terminal',
				'command': 'node-sass c:/folderName/fileName.scss c:/folderName/fileName.css',
				'async': true,
				'clearOutput': false,
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
		}])

		test('will compile it right', async function () {
			let commands = await manager.prepareCommandsForFileAfterSaving(Uri.file('C:/test.drawio'))
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'draw.io --crop --export -f pdf "c:/test.drawio"',
				'finishStatusMessage': '',
				'runningStatusMessage': '',
				'async': true,
				'clearOutput': false,
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
})
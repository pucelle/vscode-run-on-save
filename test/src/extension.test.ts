import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import {CommandProcessor, TerminalCommand} from '../../out/command-processor'
import {FileIgnoreChecker} from '../../out/file-ignore-checker'
import {FleetingDoubleKeysCache, PromiseDebouncer} from '../../out/util'
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


	suite('test commandDebounce', function () {
		test('keeps the same debounce key while using the latest file variables', async function () {
			let manager = new CommandProcessor()
			manager.setRawCommands([{
				runIn: 'backend',
				command: 'echo ${fileBasename}',
				commandBeforeSaving: 'prepare ${fileBasename}',
				commandDebounce: 100,
			}], 'backend')

			let first = await manager.prepareCommandsForFileAfterSaving({
				uri: vscode.Uri.file('C:/folderName/file1.ts')
			})
			let last = await manager.prepareCommandsForFileAfterSaving({
				uri: vscode.Uri.file('C:/folderName/file3.ts')
			})
			let before = await manager.prepareCommandsForFileBeforeSaving({
				uri: vscode.Uri.file('C:/folderName/file3.ts')
			})

			assert.equal(first[0].command, 'echo file1.ts')
			assert.equal(last[0].command, 'echo file3.ts')
			assert.equal(first[0].commandDebounce, 100)
			assert.equal(first[0].debounceKey, last[0].debounceKey)
			assert.notEqual(last[0].debounceKey, before[0].debounceKey)
		})

		test('runs only the latest callback after the delay', async function () {
			let debouncer = new PromiseDebouncer<string>()
			let values: number[] = []

			let promises = [
				debouncer.run('command', 20, async () => { values.push(1) }),
				debouncer.run('command', 20, async () => { values.push(2) }),
				debouncer.run('command', 20, async () => { values.push(3) }),
			]

			await Promise.all(promises)
			assert.deepStrictEqual(values, [3])
		})

		test('debounces different command entries independently', async function () {
			let manager = new CommandProcessor()
			manager.setRawCommands([
				{command: 'first', commandDebounce: 20},
				{command: 'second', commandDebounce: 20},
			], 'backend')
			let commands = await manager.prepareCommandsForFileAfterSaving({
				uri: vscode.Uri.file('C:/folderName/file.ts')
			})

			assert.notEqual(commands[0].debounceKey, commands[1].debounceKey)

			let debouncer = new PromiseDebouncer<string>()
			let values: string[] = []

			await Promise.all([
				debouncer.run('first', 20, async () => { values.push('first') }),
				debouncer.run('second', 20, async () => { values.push('second') }),
			])

			assert.deepStrictEqual(values.sort(), ['first', 'second'])
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
			'terminalReveal': 'onError',
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
				'terminalReveal': 'onError',
				'async': true,
				'clearOutput': false,
				"doNotDisturb": false,
			}])
		})

		test('defaults to revealing the terminal', async function () {
			let defaultManager = new CommandProcessor()
			defaultManager.setRawCommands([{
				runIn: 'terminal',
				command: 'echo ${fileBasename}',
			}], 'backend')

			let commands = await defaultManager.prepareCommandsForFileAfterSaving({
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			})

			assert.equal(commands[0].runIn, 'terminal')
			assert.equal((commands[0] as TerminalCommand).terminalReveal, 'always')
		})

		test('keeps doNotDisturb compatibility when terminalReveal is omitted', async function () {
			let quietManager = new CommandProcessor()
			quietManager.setRawCommands([{
				runIn: 'terminal',
				command: 'echo ${fileBasename}',
				doNotDisturb: true,
			}], 'backend')

			let commands = await quietManager.prepareCommandsForFileAfterSaving({
				uri: vscode.Uri.file('C:/folderName/fileName.scss')
			})

			assert.equal(commands[0].runIn, 'terminal')
			assert.equal((commands[0] as TerminalCommand).terminalReveal, 'never')
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


	suite('test for #50, German Umlaute (Ä Ü Ö)', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			"match": "\\.gdl$",
			"command": "${workspaceFolder}/runConv.fish ${file}",
			"runIn": "backend",
		}], 'backend')

		test('will rightly pass parameter to fish command line', async function () {
			let doc: VSCodeDocumentPartial = {
				uri: vscode.Uri.file('/Users/runxel/dev/redactedreponame/objects/Übergangsmarker LX/Übergangsmarker LX/scripts/2d.gdl'),
				languageId: 'gremlin',
			}

			let commands = await manager.prepareCommandsForFileAfterSaving(doc)
			assert.deepStrictEqual(commands[0].command, "/runConv.fish \"\\Users\\runxel\\dev\\redactedreponame\\objects\\Übergangsmarker LX\\Übergangsmarker LX\\scripts\\2d.gdl\"".replace(/\\/g, path.sep))
		})
	})
})

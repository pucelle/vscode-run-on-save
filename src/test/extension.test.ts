import * as assert from 'assert'
import {RawCommand, CommandProcessor} from '../command-processor'


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
		}])

		test('will compile scss file in backend', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
			}])
		})

		test('will exclude scss file that file name starts with "_"', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('folderName/_fileName.scss')
			assert.deepStrictEqual(commands, [])
		})
		
		test('will escape white spaces', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('folderName/fileName 1.scss')
			assert.deepStrictEqual(
				commands[0].command,
				'node-sass "folderName/fileName 1.scss" "folderName/fileName 1.css"'
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
		}])

		test('will compile scss file in backend', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
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
		}])

		test('will compile scss file in backend', function () {
			let commands = manager.prepareCommandsForFileBeforeSaving('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
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

		test('will escape paths starts with "\\\\"', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('\\\\folderName\\fileName 1.scss')
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
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css'
		}])

		test('will compile scss file in terminal', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'terminal',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css'
			}])
		})
	})


	suite('test for #20', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<RawCommand>{
			"match": ".*\\.drawio$",
			"runIn": "backend",
			"command": "draw.io --crop --export -f pdf \"${file}\""
		}])

		test('will compile it right', function () {
			let commands = manager.prepareCommandsForFileAfterSaving('test.drawio')
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'draw.io --crop --export -f pdf "test.drawio"',
				'finishStatusMessage': '',
				'runningStatusMessage': ''
			}])
		})
	})
})
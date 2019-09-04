import * as assert from 'assert';
import * as path from 'path'
import {OriginalCommand, CommandProcessor} from '../run-on-save'


suite("Extension Tests", () => {
	suite('test backend command', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<OriginalCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
		}])

		test('will compile scss file in backend', function () {
			let commands = manager.prepareCommandsForFile('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'backend',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css',
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
			}])
		})

		test('will exclude scss file whose file name starts with "_"', function () {
			let commands = manager.prepareCommandsForFile('folderName/_fileName.scss')
			assert.deepStrictEqual(commands, [])
		})
		
		test('will escape white spaces', function () {
			let commands = manager.prepareCommandsForFile('folderName/fileName 1.scss')
			assert.deepStrictEqual(
				commands[0].command,
				'node-sass "folderName/fileName 1.scss" "folderName/fileName 1.css"'
			)
		})
	})


	suite('test backend command with back slash path', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<OriginalCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'backend',
			'command': 'node-sass ${file} ${fileDirname}\\${fileBasenameNoExtension}.css',
			'runningStatusMessage': 'Compiling ${fileBasename}',
			'finishStatusMessage': '${fileBasename} compiled',
		}])

		test('will escape paths starts with "\\\\"', function () {
			let commands = manager.prepareCommandsForFile('\\\\folderName\\fileName 1.scss')
			assert.deepStrictEqual(
				commands[0].command,
				'node-sass "\\\\\\\\folderName\\\\fileName 1.scss" "\\\\\\\\folderName\\\\fileName 1.css"'
			)
		})
	})


	suite('test terminal command', function () {
		let manager = new CommandProcessor()
		manager.setRawCommands([<OriginalCommand>{
			'match': '.*\\.scss$',
			'notMatch': '[\\\\\\/]_[^\\\\\\/]*\\.scss$',
			'runIn': 'terminal',
			'command': 'node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css'
		}])

		test('will compile scss file in terminal', function () {
			let commands = manager.prepareCommandsForFile('folderName/fileName.scss')
			assert.deepStrictEqual(commands, [{
				'runIn': 'terminal',
				'command': 'node-sass folderName/fileName.scss folderName/fileName.css'
			}])
		})
	})
});
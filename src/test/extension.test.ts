// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as path from 'path'
import {OriginalCommand, CommandProcessor} from '../run-on-save'

// Defines a Mocha test suite to group tests of similar kind together
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
				'command': path.normalize('node-sass folderName/fileName.scss folderName/fileName.css'),
				'runningStatusMessage': 'Compiling fileName.scss',
				'finishStatusMessage': 'fileName.scss compiled',
			}])
		})

		test('will exclude scss file whose file name starts with "_"', function () {
			let commands = manager.prepareCommandsForFile('folderName/_fileName.scss')
			assert.deepStrictEqual(commands, [])
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
				'command': path.normalize('node-sass folderName/fileName.scss folderName/fileName.css')
			}])
		})
	})
});
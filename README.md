## Run shell commands when file is saved

Based on [vscode-runonsave](https://github.com/emeraldwalk/vscode-runonsave).


## Features

- Configure multiple shell commands which will execute when a matched file is saved.
- You can also specify status bar messages before and after commands executing, such that it will never distrub coding. If you prefer showing message in terminal, choose [Save And Run](https://github.com/wk-j/vscode-save-and-run).

![example](images/example.gif)


## Configuration

### Normal Configuration

- "runOnSave.statusMessageTimeout": Specify the timeout millisecond after which the status bar message will be hidden, default value is 3000.
- "runOnSave.commands" - Specify the array of shell commands to be executed after file is saved, its items as below.


### Command Item Configuration

- "match" - Specify a RegExp source to match file path. eg. \"\\.scss$\" can used to match scss files.
- "notMatch" - Specify a RegExp source, the files whole path match it will be excluded. eg. \"[\\\\\\/]_[\\w-]+\\.scss$\" can be used to exclude scss library files.
- "command" - Specify the shell command to execute. You can include variable substitution like what to do in [VSCode Tasks](https://code.visualstudio.com/docs/editor/tasks#_variable-substitution).
- "runningStatusMessage" - Specify the status bar message when the shell command began to execute, also supports variable substitution.
- "finishStatusMessage" - Specify the status bar message after the shell command finished executing, also supports variable substitution.


## Sample Config

```json
{
    "runOnSave.statusMessageTimeout": 3000,
    "runOnSave.commands": [
        {
            "match": ".*\\.scss$",
            "notMatch": "[\\\\\\/]_[^\\\\\\/]*\\.scss$",
            "command": "node-sass ${file} ${fileDirname}/${fileBasenameNoExtension}.css",
            "runningStatusMessage": "Compiling ${fileBasename}",
            "finishStatusMessage": "${fileBasename} compiled",
        }
    ]
}
```


## Variable Substitution

For more details please refer to [VSCode Tasks](https://code.visualstudio.com/docs/editor/tasks#_variable-substitution).

 - `${workspaceFolder}` - the path of the folder opened in VS Code
 - `${workspaceFolderBasename}` - the name of the folder opened in VS Code without any slashes (/)
 - `${file}` - the current opened file
 - `${fileBasename}` - the current opened file's basename
 - `${fileBasenameNoExtension}` - the current opened file's basename with no file extension
 - `${fileDirname}` - the current opened file's dirname
 - `${fileExtname}` - the current opened file's extension
 - `${cwd}` - the task runner's current working directory on startup
 - `${env.Name}` - reference environment variables



## Commands

The following commands are exposed in the command palette

- `Run On Save: Enable` - to enable the extension
- `Run On Save: Disable` - to disable the extension


## License

MIT
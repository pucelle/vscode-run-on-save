# ChangeLog


## [1.11.2]
 - Fixes #50, merges commits from `runxel@github`.

## [1.11.1]
 - Try fix #50, and changes default encoding of backend command to `utf8`.


## [1.11.0]
 - Supports `globMatchOptions` to config glob match options.
 - Command parameters will be formatted by Variable Substitutions like `${file}`.


## [1.10.1]
 - Fix #49, when `workingDirectoryAsCWD` is `true`, and multiple root folders existing, `cwd` can be rightly choose the root folder that recently saved file belongs to.

## [1.10.0]
 - Merges `strawhat-dev@github`'s pull request, supports `commands[].languages` to do language id matching.


## [1.9.2]
 - `defaultRunIn` option now it's default value is `backend`, not `vscode`. If your commands can't run, try specify this option.

## [1.9.1]
 - Fix #44, which will cause `defaultRunIn` option not working.

## [1.9.0]
 - Add a `doNotDisturb` option to prevent output tab from been focused on non-zero exit code. Thanks to pull request from `Tristano8@github` .


## [1.8.0]
 - Supports `onlyRunOnManualSave` option, to limit running commands only for manually save.
 - Fixes the wrong `commandBeforeSaving` usage description.


## [1.7.1]

 - Merges `CyprusSocialite@github`'s pull request, supports `clearOutput` option, and adjust plugin activation time.
 - Supports `commandBeforeSaving`, to specifies commands before saving document.
 - `globMatch` can be specified as a relative path, which will be used to match file path relative to current workspace directory.


## [1.7.0]

 - Merges `jackwhelpton@github`'s pull request, supports more variables.
 - Adjusts test settings.


## [1.6.0]

 - Adds a `terminalHideTimeout` option, to support close terminal automatically after command ran.
 - Adds a `ignoreFilesBy` option, to support ignore files that listed in like `.gitignore`.
 - Adds a `args` option, to provide arguments for command, especially for vscode command.
 

## [1.5.0]

 - Adds a `async` option, to support run commands in a sequence.


## [1.4.3]

 - `globMatch` will also apply "Variable Substitution", so you may specify a `globMatch` expression that include `${workspaceFolder}` to only match saved files in current workspace.


## [1.4.0]

 - Supports `forcePathSeparator` option.


## [1.3.1]

 - Supports `${fileRelative}`.


## [1.3.0]

 - Supports `commandBeforeSaving`.
 - Supports `globMatch` to make it easier to specifies file matcher.


## [1.2.0]

 - Supports vscode command, Thanks to Hulvdan@github.


## [1.1.0]

 - Will escape command line arguments automatically when file or directory name contains white space.


## [1.0.6]

 - Supports run command in terminal.
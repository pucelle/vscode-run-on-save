# ChangeLog


## [1.7.1]

 - Merges CyprusSocialite@github's pull request, supports `clearOutput` option, and adjust plugin activation time.
 - Supports `commandBeforeSaving`, to specifies commands before saving document.


## [1.7.0]

 - Merges jackwhelpton@github's pull request, supports more variables.
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
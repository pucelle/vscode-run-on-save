# ChangeLog


## [1.6.0]

 - Adds a `terminalHideTimeout` option, to support close terminal automatically after command ran.


## [1.5.0]

 - Adds a `async` option, to support run commands in a sequence.


## [1.4.3]

 - `globMatch` will also apply "Variable Substitution", so you may specify a `globMatch` expression that include `${workspaceFolder}` to only match saved files in current workspace.


## [1.4.0]

 - Support `forcePathSeparator` option.


## [1.3.1]

 - Support `${fileRelative}`.


## [1.3.0]

 - Support `commandBeforeSaving`.
 - Support `globMatch` to make it easier to specifies file matcher.


## [1.2.0]

 - Support vscode command, Thanks to Hulvdan@github.


## [1.1.0]

 - Will escape command line arguments automatically when file or directory name contains white space.


## [1.0.6]

 - Supports run command in terminal.
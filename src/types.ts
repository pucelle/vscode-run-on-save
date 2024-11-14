interface Configuration {
	statusMessageTimeout: number
	ignoreFilesBy: string[]
	shell: String
	commands: RawCommand
	defaultRunIn: 'backend' | 'terminal' | 'vscode'
}

/** Raw command configured by user. */
interface RawCommand {
	match: string
	notMatch: string
	globMatch: string
	commandBeforeSaving?: string
	command?: string
	args?: string[] | object | string
	forcePathSeparator?: PathSeparator
	runIn: string
	runningStatusMessage: string
	finishStatusMessage: string
	async?: boolean
	clearOutput?: boolean
	doNotDisturb?: boolean
}

type PathSeparator = '/' | '\\'

export function encodeCommandLineToBeQuoted(command: string) {
	return command.replace(/["]/g, '\\$&')
}


export function decodeQuotedCommandLine(command: string) {
	return command.replace(/\\(.)/g, '$1')
}


/** Resolves the returned promise after `ms` millseconds. */
export function timeout(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}

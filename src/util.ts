export function encodeCommandLineToBeQuoted(command: string) {
	return command.replace(/[\\"]/g, '\\$&')
}


export function decodeQuotedCommandLine(command: string) {
	return command.replace(/\\(.)/g, '$1')
}
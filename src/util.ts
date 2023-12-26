/** Format command string, quote piece part which includes white spaces. */
export async function formatCommandPieces(command: string, formatPiece: (piece: string) => Promise<string>): Promise<string> {
	if (!command) {
		return ''
	}

	// If white spaces exist in file name or directory name, we need to wrap them with `""`.
	// We do this by testing each pieces, and wrap them if needed.
	return replaceAsync(command, /\S+/g, async (piece: string) => {
		let oldPiece = piece
		let alreadyQuoted = false

		if (piece[0] === '"' && piece[piece.length - 1] === '"') {
			piece = decodeQuotedCommandLine(piece.slice(1, -1))
			alreadyQuoted = true
		}

		// May need to be quoted after piece formatted.
		piece = await formatPiece(piece)

		// If piece includes spaces or `\\`, or be quoted before, then it must be encoded.
		if (piece !== oldPiece && /[\s"]|\\\\/.test(piece) || alreadyQuoted) {
			piece = '"' + encodeCommandLineToBeQuoted(piece) + '"'
		}

		return piece
	})
}

/** Encode `"` to `\"`. */
export function encodeCommandLineToBeQuoted(command: string) {
	return command.replace(/["]/g, '\\$&')
}

/** If piece includes spaces, `\\`, or is quoted, then it must be encoded. */
export function encodeCommandLineToBeQuotedIf(arg: string) {
	if (/[\s"]|\\\\/.test(arg)) {
		arg = '"' + encodeCommandLineToBeQuoted(arg) + '"'
	}

	return arg
}

/** Decode `\"` to `"`. */
export function decodeQuotedCommandLine(command: string) {
	return command.replace(/\\(.)/g, '$1')
}


/** Replace path separators. */
export function formatPathSeparator(path: string, pathSeparator: string | undefined) {
	return pathSeparator ? path.replace(/[\\|\/]/g, pathSeparator) : path
}


/** Resolves the returned promise after `ms` millseconds. */
export function timeout(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}


/** Do RegExp replacing asynchronously. */
export async function replaceAsync(str: string, re: RegExp, replacer: (...matches: string[]) => Promise<string>): Promise<string> {
	let replacements = await Promise.all(
		Array.from(str.matchAll(re),
		match => replacer(...match))
	)

	let i = 0
	return str.replace(re, () => replacements[i++])
}

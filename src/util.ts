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


/** All cache values exist for more than 3 seconds, but less than 6 seconds. */
export class FleetingDoubleKeysCache<K1, K2, V> {

	private timeoutMs: number
	private mapCurr: DoubleKeysMap<K1, K2, V> = new DoubleKeysMap()
	private mapBack: DoubleKeysMap<K1, K2, V> = new DoubleKeysMap()
	private timeout: any | null = null

	constructor(timeoutMs: number = 3000) {
		this.timeoutMs = timeoutMs
	}

	get(k1: K1, k2: K2): V | undefined {
		return this.mapCurr.get(k1, k2)
			?? this.mapBack.get(k1, k2)
	}

	set(k1: K1, k2: K2, v: V) {
		this.mapCurr.set(k1, k2, v)
		this.setSwapTimeout()
	}

	firstKeyCount(): number {
		return this.mapCurr.firstKeyCount() + this.mapBack.firstKeyCount()
	}

	clear() {
		this.mapCurr.clear()
		this.mapBack.clear()
	}

	private setSwapTimeout() {
		if (this.timeout === null) {
			this.timeout = setTimeout(this.onSwapTimeout.bind(this), this.timeoutMs)
		}
	}

	private onSwapTimeout() {
		[this.mapCurr, this.mapBack] = [this.mapBack, this.mapCurr]
		this.mapCurr.clear()
		this.timeout = null

		// Need to swap a more time if has any values cached.
		if (this.firstKeyCount() > 0) {
			this.setSwapTimeout()
		}
	}
}


/** 
 * `K1 -> K2 -> V` Map Struct.
 * Index each value by a pair of keys.
 */
class DoubleKeysMap<K1, K2, V> {

	private map: Map<K1, Map<K2, V>> = new Map()

	/** Has associated value by key pair. */
	has(k1: K1, k2: K2): boolean {
		let sub = this.map.get(k1)
		if (!sub) {
			return false
		}

		return sub.has(k2)
	}

	/** Get the count of all the first keys. */
	firstKeyCount(): number {
		return this.map.size
	}

	/** Get associated value by key pair. */
	get(k1: K1, k2: K2): V | undefined {
		let sub = this.map.get(k1)
		if (!sub) {
			return undefined
		}

		return sub.get(k2)
	}

	/** Set key pair and associated value. */
	set(k1: K1, k2: K2, v: V) {
		let sub = this.map.get(k1)
		if (!sub) {
			sub = new Map()
			this.map.set(k1, sub)
		}

		sub.set(k2, v)
	}

	/** Delete all the associated values by key pair. */
	delete(k1: K1, k2: K2) {
		let sub = this.map.get(k1)
		if (sub) {
			sub.delete(k2)

			if (sub.size === 0) {
				this.map.delete(k1)
			}
		}
	}

	/** Clear all the data. */
	clear() {
		this.map = new Map()
	}
}
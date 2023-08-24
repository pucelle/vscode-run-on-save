import * as fs from 'fs-extra'
import * as path from 'path'
import {IMinimatch, Minimatch} from 'minimatch'


export interface FileIgnoreCheckerOptions {

	/** Current workspace directory. */
	workspaceDir?: string

	/** Ignores file names. */
	ignoreFilesBy: string[]
}


export class FileIgnoreChecker {

	/** Current workspace directory, default value is `undefined`. */
	private workspaceDir: string | undefined

	/** Ignores file names. */
	private ignoreFilesBy: string[]

	constructor(options: FileIgnoreCheckerOptions) {
		this.workspaceDir = options.workspaceDir
		this.ignoreFilesBy = options.ignoreFilesBy
	}

	/** Test whether should ignore a file by it's path. */
	async shouldIgnore(filePath: string): Promise<boolean> {

		// No ignore files should follow, never ignore.
		if (this.ignoreFilesBy.length === 0) {
			return false
		}

		let workspaceDir = this.workspaceDir
		
		// Not in current working dirctory, never ignore.
		if (workspaceDir && !path.normalize(filePath).startsWith(workspaceDir)) {
			return false
		}

		let dir = path.dirname(filePath)
		while (dir && dir !== workspaceDir) {
			for (let ignoreFileName of this.ignoreFilesBy) {
				let ignoreFilePath = path.join(dir, ignoreFileName)

				if (await fs.pathExists(ignoreFilePath)) {
					let shouldIgnore = await this.shouldIgnoreByIgnoreFilePath(filePath, ignoreFilePath)
					if (shouldIgnore) {
						return true
					}
				}
			}

			dir = path.dirname(dir)
		}

		return false
	}

	private async shouldIgnoreByIgnoreFilePath(filePath: string, ignoreFilePath: string): Promise<boolean> {
		let ignoreRules = await this.parseIgnoreRules(ignoreFilePath)
		let relPath = path.relative(path.dirname(ignoreFilePath), filePath)

		return this.matchIgnoreRules(relPath, ignoreRules)
	}

	private async parseIgnoreRules(ignoreFilePath: string): Promise<IMinimatch[]> {
		let text = await fs.readFile(ignoreFilePath, 'utf8')

		let globOptions = {
			matchBase: true,
			dot: true,
			flipNegate: true,
			nocase: true
		}

		let ruleLines = text.split(/\r?\n/)
			.filter(line => !/^#|^$/.test(line.trim()))

		// Here it doesn't supports expressions like `!XXX`.
		let rules = ruleLines.map(pattern => {
			if (pattern.startsWith('/')) {
				pattern = pattern.slice(1)
			}
			else {
				pattern = '{**/,}' + pattern
			}

			if (pattern.endsWith('/')) {
				pattern = pattern.replace(/\/$/, '{/**,}')
			}
			
			return new Minimatch(pattern, globOptions)
		})
		
		return rules
	}

	private matchIgnoreRules(relPath: string, ignoreRules: IMinimatch[]): boolean {
		for (let rule of ignoreRules) {
			if (rule.match(relPath)) {
				return true
			}
		}

		return false
	}
}

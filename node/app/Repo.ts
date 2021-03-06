import * as Git from 'nodegit';
import * as path from 'path';
import { c } from '../lib/Log';
import __rootDir from '../lib/RootDirFinder';
import { Utils } from '../lib/Utils';


/**
 * Helpers for our repos.
 */
export namespace Repo {
	export const ROOT_REPOS = __rootDir+`/repositories`;
	
	export interface Refs {
		tags:     string[];
		branches: string[];
	}
	
	export function name(repo: Git.Repository) {
		const rel = path.relative(ROOT_REPOS, repo.path());
		if (rel.endsWith(`/.git`)) {
			/// non-bare repo
			return Utils.trimSuffix(rel, `/.git`);
		} else {
			/// bare repo
			return Utils.trimSuffix(rel, '.git');
		}
	}
	
	/**
	 * Find paths to repos on disk.
	 */
	export async function repoFolders(): Promise<string[]> {
		/// Assume top-level or nesting=1 folders in this dir
		/// are our repos.
		/// Also assume they are bare repos.
		/// Update: Also support non-bare repos, but only at top-level.
		return Utils.readdirREnt(
			ROOT_REPOS,
			(x) => x.name === `.git` || x.name.endsWith(`.git`),
			2
		);
	}
	
	export async function refs(repo: Git.Repository): Promise<Refs> {
		const tags = await Git.Tag.list(repo);
		const branches = (await repo.getReferences())
			.filter(x => x.isBranch())
			.map(x => x.shorthand())
		;
		return { tags, branches };
	}
	
	export async function numOfCommits(
		repo: Git.Repository,
		before: Git.Commit
	): Promise<number> {
		const revWalk = repo.createRevWalk();
		revWalk.push(before.id());
		let i = 0;
		/// ^^ Include `before` in the count.
		while (true) {
			try {
				await revWalk.next();
				i++;
			} catch(err) {
				if (err.errno === Git.Error.CODE.ITEROVER) {
					break;
				}
				throw err;
			}
		}
		return i;
	}
}

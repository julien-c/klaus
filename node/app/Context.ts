import * as express from 'express';
import * as Git from 'nodegit';
import { c } from '../lib/Log';
import { Repo } from './Repo';


const DEFAULT_BRANCH = `master`;

interface BreadcrumbPath {
	dir:   string;
	href?: string;
}

export class NotFoundError extends Error {}


export class Context {
	/**
	 * Repo id (repo or user/repo)
	 */
	repoName:  string;
	/**
	 * Branch/commit-sha/tag
	 */
	rev:       string;
	/**
	 * path is undefined for repo's root
	 * (only makes sense for tree)
	 */
	path?:     string;
	
	/// After `.initialize()`
	repo:      Git.Repository;
	commit:    Git.Commit;
	treeEntry: Git.TreeEntry;
	/// Other ad hoc data, for convenient access from templates
	data: Record<string, any> = {};
	
	constructor(req: express.Request) {
		/**
		 * Note: we only support branch names and tag names
		 * not containing a `/`.
		 */
		this.repoName = req.params.namespace
			? `${req.params.namespace}/${req.params.repo}`
			: req.params.repo
		;
		this.rev = req.params.rev ?? DEFAULT_BRANCH;
		this.path = req.params[0];
	}
	
	async initialize(): Promise<void> {
		try {
			this.repo = await Git.Repository.openBare(`${Repo.ROOT_REPOS}/${this.repoName}.git`);
		} catch {
			throw new NotFoundError(`No such repository ${this.repoName}`);
		}
		
		try {
			this.commit = await this.repo.getCommit(this.rev);
		} catch {
			try {
				this.commit = await this.repo.getBranchCommit(this.rev);
			} catch {
				throw new NotFoundError(`Invalid rev id`);
			}
		};
	}
	
	/**
	 * For the breadcrumbs
	 */
	get subpaths(): BreadcrumbPath[] | undefined {
		if (! this.path) {
			return undefined;
		}
		const parts = this.path.split('/');
		return parts.map((dir, i) => {
			const href = (i === parts.length - 1)
				? undefined
				: parts.slice(0, i+1).join('/')
			;
			return { dir, href };
		});
	}
	
	/**
	 * For links in templates (e.g. branch_selector)
	 */
	get view(): "tree" | "blob" | string {
		throw new Error(`Implemented by concrete subclass`);
	}
}

export class TreeContext extends Context {
	tree: Git.Tree;
	
	async initialize() {
		await super.initialize();
		
		if (this.path === undefined) {
			/// "Root" tree
			this.tree = await this.commit.getTree();
		} else {
			const commitTree = await this.commit.getTree();
			const treeEntry = await commitTree.getEntry(this.path);
			if (! treeEntry.isTree()) {
				throw new NotFoundError(`No such tree ${this.path} in repository ${this.repoName}/${this.rev}`);
			}
			this.tree = await treeEntry.getTree();
		}
	}
	
	get view() {
		return `tree`;
	}
}

export class BlobContext extends Context {
	blob: Git.Blob;
	
	async initialize() {
		await super.initialize();
		
		if (this.path === undefined) {
			throw new NotFoundError(`Invalid blob, path is undefined`);
		} else {
			const commitTree = await this.commit.getTree();
			const treeEntry = await commitTree.getEntry(this.path);
			if (! treeEntry.isBlob()) {
				throw new NotFoundError(`No such blob ${this.path} in repository ${this.repoName}/${this.rev}`);
			}
			this.blob = await treeEntry.getBlob();
		}
	}
	
	get view() {
		return `blob`;
	}
}
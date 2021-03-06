import * as express from 'express';
import * as Git from 'nodegit';
import * as hljs from 'highlight.js';
import { extname } from 'path';
import { c } from '../lib/Log';
import { Repo } from './Repo';
import { Utils } from '../lib/Utils';



interface BreadcrumbPath {
	dir:   string;
	href?: string;
}

export class NotFoundError extends Error {}


const repoNameFromRequest = (req: express.Request) => {
	return req.params.namespace
		? `${req.params.namespace}/${req.params.repo}`
		: req.params.repo
	;
}


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
	/// Other ad hoc data, for convenient access from templates
	data: Record<string, any> = {};
	
	constructor(req: express.Request) {
		/**
		 * Note: we only support branch names and tag names
		 * not containing a `/`.
		 */
		this.repoName = repoNameFromRequest(req);
		this.rev = req.params.rev;
		/// ^ if undefined, we'll figure out when we have the Repo below.
		this.path = req.params[0];
	}
	
	async initialize(): Promise<void> {
		const potentialBare    = `${Repo.ROOT_REPOS}/${this.repoName}.git`;
		const potentialNonBare = `${Repo.ROOT_REPOS}/${this.repoName}/.git`;
		if (await Utils.fileExists(potentialBare)) {
			/// bare repo
			this.repo = await Git.Repository.openBare(potentialBare);
		} else if (await Utils.fileExists(potentialNonBare)) {
			/// non-bare repo
			this.repo = await Git.Repository.open(potentialNonBare);
		} else {
			throw new NotFoundError(`No such repository ${this.repoName}`);
		}
		
		if (this.rev === undefined) {
			const ref = await this.repo.head();
			this.rev = ref.shorthand();
		}
		
		try {
			this.commit = await this.repo.getCommit(this.rev);
		} catch {
			try {
				this.commit = await this.repo.getBranchCommit(this.rev);
				/// ^^ Also works for tags apparently.
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
	get view(): "tree" | "blob" | "commits" | string {
		throw new Error(`Implemented by concrete subclass`);
	}
}


export class CommitContext extends Context {}

export class HistoryContext extends Context {
	get view() {
		return `commits`;
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
	
	get isBinary(): boolean {
		return this.blob.isBinary() !== 0;
	}
	get isTooLarge(): boolean {
		return this.blob.rawsize() > 10**9;
	}
	
	/**
	 * Highlight content with hljs,
	 * and store in this.data.
	 */
	renderText() {
		const ext = Utils.trimPrefix(extname(this.path!), ".");
		const str = this.blob.toString();
		if (hljs.getLanguage(ext)) {
			const res = hljs.highlight(ext, str, true);
			this.data.code = res.value;
		} else {
			/// Fallback to automatic detection.
			const res = hljs.highlightAuto(str);
			this.data.code = res.value;
		}
		const n_lines = str.split('\n').length;
		this.data.line_gutter = Utils.range(1, n_lines+1).join("\n");
	}
}


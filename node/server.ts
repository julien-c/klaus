import * as util from 'util';
import * as child_process from 'child_process';
import * as Git from 'nodegit';
import * as express from 'express';
import { c } from './lib/Log';
import { hbs } from './lib/Hbs';
import __rootDir, { __klausDir, __nodeDir } from './lib/RootDirFinder';
import { Utils } from './lib/Utils';
import { Repo } from './app/Repo';
import {
	indexTree,
	indexBlob,
	rawBlob,
	blameBlob,
	viewCommit,
	historyCommits,
} from './app/routes';
import { config, Environment } from './lib/config';
const __exec = util.promisify(child_process.exec);

if (config.environment === Environment.development) {
	require('source-map-support').install();
}

const app = express();
const PORT = process.env.PORT || 8888;


// Express setup
app.set('views', `${__nodeDir}/views`);
app.set('view engine', 'hbs');
app.engine('hbs', hbs.renderFile.bind(hbs));

app.use(
	'/static',
	express.static(`${__klausDir}/static`)
);
app.get(
	'/favicon.ico',
	(req, res) => res.sendFile(`${__klausDir}/static/favicon.png`)
);

/**
 * Note: we only support branch names and tag names
 * not containing a `/`.
 */


/**
 * Routes(scaffolding)
 */

app.get('/', async function(req, res) {
	const folders = await Repo.repoFolders();
	const repos = await Promise.all(folders.map(x => {
		return Git.Repository.openBare(x);
	}));
	const headCommits = await Promise.all(repos.map(x => x.getHeadCommit()));
	
	const items: {
		repo: Git.Repository,
		commit: Git.Commit,
	}[] = Utils.zip(repos, headCommits).map(x => ({ repo: x[0], commit: x[1] }));
	
	if (req.query['by-name']) {
		items.sort((a, b) => Repo.name(a.repo).localeCompare(Repo.name(b.repo)));
	} else {
		items.sort((a, b) => b.commit.time() - a.commit.time());
	}
	
	res.render('repo_list', {
		items,
		order_by: req.query['by-name'] ? 'name' : 'last_updated',
		meta: {
			title: `Repository list`,
		},
		layout: 'skeleton',
	});
});

app.post('/fetch_all', async function(req, res) {
	const folders = await Repo.repoFolders();
	res.set('content-type', 'text/plain');
	for (const folder of folders) {
		res.write('\n===\n');
		res.write(folder+'\n');
		const remotes = (await __exec(`git remote`, { cwd: folder })).stdout;
		if (remotes.length === 0) {
			res.write('no remote\n');
		} else {
			try {
				/// stackoverflow.com/a/26172920/593036
				const { stdout, stderr } = await __exec(
					`git fetch origin +refs/heads/*:refs/heads/* --prune`,
					{ cwd: folder }
				);
				res.write(stdout+'\n');
				res.write(stderr.split('\n').map(x => `(!) ${x}`).join('\n'));
			} catch(err) {
				res.write(`(!!) ${err}`);
			}
		}
	}
	res.end();
});

/**
 * Actual git-viewer routes
 * 
 * see url-layout.png
 * 
 * CAUTION(Always keep the most generic routes at the end.)
 */

app.get(           '/:repo/blob/:rev/*',    indexBlob);
app.get('/:namespace/:repo/blob/:rev/*',    indexBlob);

app.get(           '/:repo/raw/:rev/*',     rawBlob);
app.get('/:namespace/:repo/raw/:rev/*',     rawBlob);

app.get(           '/:repo/blame/:rev/*',   blameBlob);
app.get('/:namespace/:repo/blame/:rev/*',   blameBlob);


app.get(           '/:repo/commit/:rev',    viewCommit);
app.get('/:namespace/:repo/commit/:rev',    viewCommit);



app.get(           '/:repo/commits',        historyCommits);
app.get('/:namespace/:repo/commits',        historyCommits);
app.get(           '/:repo/commits/:rev',   historyCommits);
app.get('/:namespace/:repo/commits/:rev',   historyCommits);
app.get(           '/:repo/commits/:rev/*', historyCommits);
app.get('/:namespace/:repo/commits/:rev/*', historyCommits);



app.get(           '/:repo/tree/:rev',      indexTree);
app.get('/:namespace/:repo/tree/:rev',      indexTree);
app.get(           '/:repo/tree/:rev/*',    indexTree);
app.get('/:namespace/:repo/tree/:rev/*',    indexTree);
app.get(           '/:repo',                indexTree);
app.get('/:namespace/:repo',                indexTree);

// Start engine.

const guess_git_revision = async () => {
	try {
		const { stdout } = await __exec(`git log --format=%h -n 1`);
		return stdout.trim();
	} catch {
		return `1.5.2`;
	}
};

(async () => {
	app.locals.KLAUS_VERSION = await guess_git_revision();
	app.locals.SITE_NAME = process.env.KLAUS_SITE_NAME ?? "klaus-node";
	
	app.listen(PORT, () => {
		c.debug(`Running on http://localhost:${PORT}`);
	});
})();

// Publishes the website version to GitHub Pages: builds dist/ and pushes it to the "gh-pages"
// branch of this repository's "origin" remote. The branch holds only the built site and is replaced
// on every deploy, so the main branch stays small.
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js')]);

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT }).toString().trim();
const message = process.env.DEPLOY_MESSAGE || `Deploy website ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

run('git', ['init', '-q', '-b', 'gh-pages'], DIST);
run('git', ['add', '-A'], DIST);
run('git', ['commit', '-q', '-m', message], DIST);
console.log(`Pushing to ${remote} (branch gh-pages)…`);
run('git', ['push', '--force', remote, 'gh-pages'], DIST);

const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(remote);
if (m) console.log(`\nDone. The site will be at https://${m[1]}.github.io/${m[2]}/ (it can take a minute or two to update).`);

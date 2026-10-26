/**
 * Builds the "React, initial port" row of the comparison: the React shell as it was first ported,
 * before any memoization, written to perf/builds/react-initial.html (not committed). Run from this
 * package: node perf/build-react-initial.mts
 *
 * The port and the memoization landed as separate commits in PR #6, which was squash-merged, so the
 * unmemoized commit is not on main. It stays reachable as the parent of GitHub's refs/pull/6/head,
 * which is fetched when the commit is missing locally. The commit is checked out into a temporary
 * git worktree and built there with its own lockfiles (npm ci), so the build does not depend on what
 * is installed in this checkout.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** "feat: add a React shell over the shared modules", the unmemoized port. */
export const INITIAL_PORT_COMMIT = '080c53c5bf233eb75862d0a7e24069997ec5fceb';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const out = path.join(here, 'builds/react-initial.html');

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString().trim();
const run = (cwd: string, ...args: string[]) => execFileSync('npm', args, { cwd, stdio: 'inherit' });

function haveCommit(): boolean {
  try {
    git('cat-file', '-e', `${INITIAL_PORT_COMMIT}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

if (!haveCommit()) git('fetch', 'origin', 'refs/pull/6/head');
if (!haveCommit()) throw new Error(`Commit ${INITIAL_PORT_COMMIT} is not reachable, even after fetching refs/pull/6/head.`);

const tree = path.join(mkdtempSync(path.join(os.tmpdir(), 'react-initial-')), 'tree');
git('worktree', 'add', '--detach', tree, INITIAL_PORT_COMMIT);
try {
  run(tree, 'ci');
  run(path.join(tree, 'resume-builder-react'), 'ci');
  run(path.join(tree, 'resume-builder-react'), 'run', 'build');
  mkdirSync(path.dirname(out), { recursive: true });
  copyFileSync(path.join(tree, 'resume-builder-react/dist/index.html'), out);
  console.log(`Wrote ${path.relative(process.cwd(), out)} from ${INITIAL_PORT_COMMIT.slice(0, 7)}`);
} finally {
  git('worktree', 'remove', '--force', tree);
  rmSync(path.dirname(tree), { recursive: true, force: true });
}

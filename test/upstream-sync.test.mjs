import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OWNED_BY_PHOTOGRAPHER, RETIRED, WORKFLOW_DIR, applySync, assertSafe, branchAction, bumpUpstream, filesToSync,
  formatUpstream, hasOffers, labelAction, listFiles, needsHelp, needsUpdate, parseTag, parseUpstream, planSync, prAction,
  prBody,
} from '../scripts/upstream-sync.mjs';
import { tempRoot, writeFile } from './helpers.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts', 'upstream-sync.mjs');
const UPSTREAM_TEXT = 'repo=beedigital-gr/offers-template\ntag=v0.1.0\n';
const emptyDir = () => mkdtempSync(join(tmpdir(), 'offers-sync-'));

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const snapshot = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), readFileSync(f, 'utf8')]));

function upstreamTree() {
  const root = emptyDir();
  writeFile(root, 'build.mjs', 'build v2');
  writeFile(root, 'lib/a.mjs', 'a v2');
  writeFile(root, 'lib/new.mjs', 'new');
  writeFile(root, 'docs/SETUP.md', 'setup v2');
  writeFile(root, 'UPSTREAM', 'repo=beedigital-gr/offers-template\ntag=v0.2.0\n');
  writeFile(root, '.github/workflows/check.yml', 'check v2');
  writeFile(root, '.github/workflows/added.yml', 'added');
  writeFile(root, '.github/workflows/same.yml', 'same');
  return root;
}

function targetTree() {
  const root = tempRoot();
  writeFile(root, 'build.mjs', 'build v1');
  writeFile(root, 'lib/a.mjs', 'a v1');
  writeFile(root, 'docs/SETUP.md', 'setup v2');
  writeFile(root, 'docs/old.md', 'stray');
  writeFile(root, 'setup/x.mjs', 'retired');
  writeFile(root, 'UPSTREAM', UPSTREAM_TEXT);
  writeFile(root, '.github/workflows/check.yml', 'check v1 edited');
  writeFile(root, '.github/workflows/obsolete.yml', 'gone upstream');
  writeFile(root, '.github/workflows/same.yml', 'same');
  return root;
}

test('filesToSync: upstream-owned only, all safe, includes UPSTREAM and .github/, no setup/', () => {
  const files = filesToSync();
  for (const owned of OWNED_BY_PHOTOGRAPHER) assert.ok(!files.some((f) => f.startsWith(owned)), owned);
  for (const f of files) assert.doesNotThrow(() => assertSafe(f), f);
  assert.ok(files.includes('UPSTREAM'));
  assert.ok(files.includes('.github/'));
  assert.ok(files.includes('lib/'));
  assert.ok(!files.includes('setup/'));
  assert.deepEqual(RETIRED, ['setup/']);
  assert.equal(WORKFLOW_DIR, '.github/workflows/');
});

test('every filesToSync() entry exists in this repo', () => {
  for (const f of filesToSync()) assert.ok(existsSync(join(REPO, f)), `${f} is missing`);
});

test('UPSTREAM in this repo parses and matches package.json', () => {
  const { repo, tag } = parseUpstream(readFileSync(join(REPO, 'UPSTREAM'), 'utf8'));
  const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(repo, 'beedigital-gr/offers-template');
  assert.equal(tag, `v${version}`);
});

test('parseTag and needsUpdate compare numerically', () => {
  assert.deepEqual(parseTag('v1.10.3'), [1, 10, 3]);
  assert.deepEqual(parseTag('1.2.0'), [1, 2, 0]);
  assert.equal(needsUpdate('v1.2.0', 'v1.10.0'), true);
  assert.equal(needsUpdate('v1.2.0', 'v2.0.0'), true);
  assert.equal(needsUpdate('v1.2.0', 'v1.2.1'), true);
  assert.equal(needsUpdate('v1.2.0', 'v1.2.0'), false);
  assert.equal(needsUpdate('v1.10.0', 'v1.9.9'), false);
  assert.equal(needsUpdate('1.2.0', 'v1.3.0'), true);
  assert.equal(needsUpdate('v1.2.0', '1.2.0'), false);
  for (const bad of ['v1.2', '1.2.0-rc1', 'latest', '', 'v1.2.3.4']) assert.throws(() => parseTag(bad), /tag/, bad);
  assert.throws(() => needsUpdate('v1.2.0', '1.3.0-rc1'), /tag/);
});

test('parseUpstream / formatUpstream round-trip; a missing key throws', () => {
  const parsed = parseUpstream(UPSTREAM_TEXT);
  assert.deepEqual(parsed, { repo: 'beedigital-gr/offers-template', tag: 'v0.1.0' });
  assert.equal(formatUpstream(parsed), UPSTREAM_TEXT);
  assert.throws(() => parseUpstream('repo=beedigital-gr/offers-template\n'), /tag/);
  assert.throws(() => parseUpstream('tag=v0.1.0\n'), /repo/);
  assert.throws(() => formatUpstream({ repo: 'beedigital-gr/offers-template' }), /tag/);
  assert.throws(() => formatUpstream({ tag: 'v0.1.0' }), /repo/);
  for (const repo of ['a/b; rm -rf /', 'a/b/c', '/b', 'a/', ' a/b', 'a/..', '../b', 'a/.', '-a/b', 'a b/c', '$(x)/y']) {
    assert.throws(() => parseUpstream(`repo=${repo}\ntag=v0.1.0\n`), /repo/, repo);
  }
  for (const repo of ['beedigital-gr/offers-template', 'a/b.c', 'A1/x_y-z']) {
    assert.equal(parseUpstream(`repo=${repo}\ntag=v0.1.0\n`).repo, repo);
  }
});

test('assertSafe rejects photographer paths, escapes and machine dirs', () => {
  for (const bad of [
    'offers/a.json', 'photos/_portfolio/x.jpg', 'brand/brand.json', './brand/x', 'docs/../brand/x', 'offers',
    '../x', 'lib/../../x', '/abs', '.git/config', 'lib/.git/x', 'node_modules/x', 'dist/public/index.html', '', '.',
    'Brand/x', 'OFFERS/a.json', 'Photos', 'brand\\x.json', 'lib\\..\\..\\x', 'C:\\x', 'c:/x', 'lib/.GIT/x',
  ]) assert.throws(() => assertSafe(bad), /unsafe/, bad);
  for (const ok of ['lib/a.mjs', 'UPSTREAM', '.github/workflows/check.yml', 'docs/brand-notes.md', 'setup/x.mjs']) {
    assert.doesNotThrow(() => assertSafe(ok), ok);
  }
});

test('listFiles: sorted posix paths, [] when absent, single files too', () => {
  const root = upstreamTree();
  assert.deepEqual(listFiles(root, 'lib/'), ['lib/a.mjs', 'lib/new.mjs']);
  assert.deepEqual(listFiles(root, '.github/'), ['.github/workflows/added.yml', '.github/workflows/check.yml', '.github/workflows/same.yml']);
  assert.deepEqual(listFiles(root, 'UPSTREAM'), ['UPSTREAM']);
  assert.deepEqual(listFiles(root, 'templates/'), []);
  assert.deepEqual(listFiles(root, 'nope'), []);
});

test('planSync: copies changes, removes strays and retired setup/, leaves workflows to a person', () => {
  const plan = planSync(upstreamTree(), targetTree());
  assert.deepEqual(plan.copy, ['UPSTREAM', 'build.mjs', 'lib/a.mjs', 'lib/new.mjs']);
  assert.deepEqual(plan.remove, ['docs/old.md', 'setup/x.mjs']);
  assert.deepEqual(plan.workflowDiff, ['.github/workflows/added.yml', '.github/workflows/check.yml', '.github/workflows/obsolete.yml']);
  for (const p of [...plan.copy, ...plan.remove]) {
    assert.ok(!p.startsWith(WORKFLOW_DIR), p);
    for (const owned of OWNED_BY_PHOTOGRAPHER) assert.ok(!p.startsWith(owned), p);
  }
});

test('planSync: workflowDiff is empty when workflows are identical', () => {
  const up = emptyDir();
  const target = emptyDir();
  for (const root of [up, target]) writeFile(root, '.github/workflows/check.yml', 'same');
  writeFile(up, 'UPSTREAM', UPSTREAM_TEXT);
  writeFile(target, 'UPSTREAM', UPSTREAM_TEXT);
  assert.deepEqual(planSync(up, target), { copy: [], remove: [], workflowDiff: [] });
});

test('applySync: photographer files byte-identical, files copied, empty dirs pruned, second plan empty', () => {
  const up = upstreamTree();
  const target = targetTree();
  const owned = () => Object.fromEntries(OWNED_BY_PHOTOGRAPHER.map((d) => [d, snapshot(join(target, d))]));
  const before = owned();
  assert.ok(Object.keys(before['offers/']).length > 0 && Object.keys(before['photos/']).length > 0 && Object.keys(before['brand/']).length > 0);

  const plan = planSync(up, target);
  applySync(up, target, plan);

  assert.deepEqual(owned(), before);
  assert.equal(readFileSync(join(target, 'lib/a.mjs'), 'utf8'), 'a v2');
  assert.equal(readFileSync(join(target, 'lib/new.mjs'), 'utf8'), 'new');
  assert.equal(readFileSync(join(target, 'build.mjs'), 'utf8'), 'build v2');
  assert.ok(!existsSync(join(target, 'docs/old.md')));
  assert.ok(existsSync(join(target, 'docs/SETUP.md')));
  assert.ok(!existsSync(join(target, 'setup')), 'empty setup/ not pruned');
  assert.equal(readFileSync(join(target, '.github/workflows/check.yml'), 'utf8'), 'check v1 edited');
  assert.ok(existsSync(join(target, '.github/workflows/obsolete.yml')));

  const again = planSync(up, target);
  assert.deepEqual(again.copy, []);
  assert.deepEqual(again.remove, []);
  assert.deepEqual(again.workflowDiff, plan.workflowDiff);
});

test('applySync refuses a plan that touches photographer files', () => {
  const up = upstreamTree();
  const target = targetTree();
  writeFile(up, 'brand/brand.json', '{}');
  const before = readFileSync(join(target, 'brand/brand.json'), 'utf8');
  assert.throws(() => applySync(up, target, { copy: ['brand/brand.json'], remove: [], workflowDiff: [] }), /unsafe/);
  assert.throws(() => applySync(up, target, { copy: [], remove: ['offers/../brand/brand.json'], workflowDiff: [] }), /unsafe/);
  assert.equal(readFileSync(join(target, 'brand/brand.json'), 'utf8'), before);
});

test('bumpUpstream changes only the tag', () => {
  const root = emptyDir();
  writeFile(root, 'UPSTREAM', 'repo=someone/fork\ntag=v0.1.0\n');
  bumpUpstream(root, 'v0.3.1');
  assert.equal(readFileSync(join(root, 'UPSTREAM'), 'utf8'), 'repo=someone/fork\ntag=v0.3.1\n');
  assert.throws(() => bumpUpstream(root, 'v0.4'), /tag/);
});

test('prBody and needsHelp', () => {
  const notes = '## Changes\n- bolder **gallery**\n';
  const clean = prBody({ tag: 'v0.2.0', notes, workflowDiff: [], testsPassed: true });
  assert.ok(clean.includes(notes), 'notes not verbatim');
  assert.match(clean, /v0\.2\.0/);
  assert.match(clean, /passed/);
  assert.match(clean, /does not start the `check` workflow/);
  assert.match(clean, /merge/i);
  assert.ok(!clean.includes('Workflow files need a manual update'));
  assert.equal(needsHelp({ workflowDiff: [], testsPassed: true }), false);

  const red = prBody({ tag: 'v0.2.0', notes, workflowDiff: ['.github/workflows/check.yml'], testsPassed: false });
  assert.match(red, /failed/i);
  assert.ok(!/passed/.test(red));
  assert.match(red, /Workflow files need a manual update \(BeeDigital\)/);
  assert.match(red, /`\.github\/workflows\/check\.yml`/);
  assert.equal(needsHelp({ workflowDiff: ['.github/workflows/check.yml'], testsPassed: true }), true);
  assert.equal(needsHelp({ workflowDiff: [], testsPassed: false }), true);
});

test('CLI should-update reads ./UPSTREAM; bad input exits non-zero', () => {
  const cwd = emptyDir();
  writeFile(cwd, 'UPSTREAM', UPSTREAM_TEXT);
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  assert.equal(run('should-update', 'v0.2.0').stdout.trim(), 'true');
  assert.equal(run('should-update', 'v0.1.0').stdout.trim(), 'false');
  const bad = run('should-update', 'v0.2');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /tag/);
  assert.notEqual(run('nope').status, 0);
});

test('CLI sync + bump + body in a temp repo', () => {
  const up = upstreamTree();
  const cwd = targetTree();
  const temp = emptyDir();
  const out = join(temp, 'github-output');
  const env = { ...process.env, RUNNER_TEMP: temp, GITHUB_OUTPUT: out };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });

  const before = snapshot(cwd);
  assert.equal(run('diff', up).status, 0);
  assert.deepEqual(snapshot(cwd), before, 'diff changed files');
  assert.equal(JSON.parse(readFileSync(join(temp, 'workflow-diff.json'), 'utf8')).length, 3);
  assert.equal(run('sync', up).status, 0);
  assert.equal(readFileSync(join(cwd, 'lib/a.mjs'), 'utf8'), 'a v2');
  assert.deepEqual(JSON.parse(readFileSync(join(temp, 'workflow-diff.json'), 'utf8')).length, 3);
  assert.equal(run('bump', 'v0.2.0').status, 0);
  assert.match(readFileSync(join(cwd, 'UPSTREAM'), 'utf8'), /^tag=v0\.2\.0$/m);

  writeFile(temp, 'notes.md', 'NOTES-VERBATIM');
  const body = run('body', 'v0.2.0', join(temp, 'notes.md'), 'true');
  assert.equal(body.status, 0, body.stderr);
  assert.match(body.stdout, /NOTES-VERBATIM/);
  assert.match(body.stdout, /`\.github\/workflows\/added\.yml`/);
  assert.equal(readFileSync(out, 'utf8'), 'needs-help=true\n');
  assert.notEqual(run('body', 'v0.2.0', join(temp, 'notes.md'), 'maybe').status, 0);
});

test('planSync throws on an unsafe upstream path or an upstream with no UPSTREAM', () => {
  const up = upstreamTree();
  writeFile(up, 'lib/.git/x', 'sneaky');
  assert.throws(() => planSync(up, targetTree()), /unsafe/);
  assert.throws(() => planSync(emptyDir(), targetTree()), /UPSTREAM/);
});

test('listFiles skips symlinks', () => {
  const root = upstreamTree();
  symlinkSync('../offers', join(root, 'lib', 'link'));
  symlinkSync('a.mjs', join(root, 'lib', 'alias.mjs'));
  assert.deepEqual(listFiles(root, 'lib/'), ['lib/a.mjs', 'lib/new.mjs']);
});

test('branchAction: rebuild only for a missing branch or an older branch tag', () => {
  assert.equal(branchAction({ branchTag: null, latestTag: 'v0.2.0' }), 'rebuild');
  assert.equal(branchAction({ branchTag: '', latestTag: 'v0.2.0' }), 'rebuild');
  assert.equal(branchAction({ branchTag: 'v0.1.0', latestTag: 'v0.2.0' }), 'rebuild');
  assert.equal(branchAction({ branchTag: 'v0.2.0', latestTag: 'v0.2.0' }), 'keep');
  assert.equal(branchAction({ branchTag: 'v0.3.0', latestTag: 'v0.2.0' }), 'keep');
  assert.throws(() => branchAction({ branchTag: 'v0.2', latestTag: 'v0.2.0' }), /tag/);
});

test('prAction: edit an open PR, skip a closed one for this tag, else create', () => {
  const t = (tag) => `Template update ${tag}`;
  assert.equal(prAction([], 'v0.2.0'), 'create');
  assert.equal(prAction([{ title: t('v0.1.0'), state: 'OPEN' }], 'v0.2.0'), 'edit');
  assert.equal(prAction([{ title: t('v0.2.0'), state: 'CLOSED' }], 'v0.2.0'), 'skip');
  assert.equal(prAction([{ title: t('v0.1.0'), state: 'CLOSED' }], 'v0.2.0'), 'create');
  assert.equal(prAction([{ title: t('v0.1.0'), state: 'MERGED' }], 'v0.2.0'), 'create');
  assert.equal(prAction([{ title: t('v0.2.0'), state: 'MERGED' }], 'v0.2.0'), 'create');
  assert.equal(prAction([{ title: t('v0.2.0'), state: 'CLOSED' }, { title: t('v0.2.0'), state: 'OPEN' }], 'v0.2.0'), 'edit');
  assert.throws(() => prAction([{ title: t('v0.2.0'), state: 'closed?' }], 'v0.2.0'), /state/);
  assert.throws(() => prAction({}, 'v0.2.0'), /list/);
});

test('labelAction is strict', () => {
  assert.equal(labelAction({ needsHelp: true, labelled: false }), 'add');
  assert.equal(labelAction({ needsHelp: true, labelled: true }), 'none');
  assert.equal(labelAction({ needsHelp: false, labelled: true }), 'remove');
  assert.equal(labelAction({ needsHelp: false, labelled: false }), 'none');
  for (const bad of [{ needsHelp: 'true', labelled: false }, { needsHelp: true }, { needsHelp: undefined, labelled: true }]) {
    assert.throws(() => labelAction(bad), /true or false/);
  }
});

test('hasOffers: real offers only, samples starting with _ do not count', () => {
  const root = emptyDir();
  assert.equal(hasOffers(root), false);
  writeFile(root, 'offers/_example.json', '{}');
  writeFile(root, 'offers/notes.md', 'x');
  writeFile(root, 'offers/sub/x.json', '{}');
  assert.equal(hasOffers(root), false);
  writeFile(root, 'offers/maria-nikos-k3x9qa.json', '{}');
  assert.equal(hasOffers(root), true);
});

test('prBody neutralises @mentions and has a fallback for empty notes', () => {
  const body = prBody({ tag: 'v0.2.0', notes: 'thanks @mkoulouras and @beedigital-gr/team, mail a@b.com', workflowDiff: [], testsPassed: true });
  assert.match(body, /thanks `@mkoulouras` and `@beedigital-gr`\/team, mail a@b\.com/);
  assert.ok(!/(^|[^`\w])@mkoulouras/.test(body));
  for (const [raw, safe] of [['thanks.@bob', 'thanks.`@bob`'], ['a-@bob', 'a-`@bob`'], ['x/@bob', 'x/`@bob`'], ['`x`@bob', '`x``@bob`'], ['@bob first', '`@bob` first']]) {
    assert.ok(prBody({ tag: 'v0.2.0', notes: raw, workflowDiff: [], testsPassed: true }).includes(safe), raw);
  }
  for (const notes of ['', '  \n', undefined]) {
    assert.match(prBody({ tag: 'v0.2.0', notes, workflowDiff: [], testsPassed: true }), /_No release notes\._/);
  }
});

test('CLI body: failed tests alone need help; a clean run does not', () => {
  const temp = emptyDir();
  writeFile(temp, 'workflow-diff.json', '[]');
  writeFile(temp, 'notes.md', 'n');
  const run = (passed) => {
    const out = join(temp, `out-${passed}`);
    const r = spawnSync(process.execPath, [SCRIPT, 'body', 'v0.2.0', join(temp, 'notes.md'), passed], {
      cwd: temp, env: { ...process.env, RUNNER_TEMP: temp, GITHUB_OUTPUT: out }, encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return { stdout: r.stdout, output: readFileSync(out, 'utf8') };
  };
  const red = run('false');
  assert.match(red.stdout, /failed/);
  assert.equal(red.output, 'needs-help=true\n');
  const green = run('true');
  assert.match(green.stdout, /passed/);
  assert.equal(green.output, 'needs-help=false\n');
});

test('CLI decisions: repo, branch-action, pr-action, label-action, has-offers, paths', () => {
  const cwd = emptyDir();
  writeFile(cwd, 'UPSTREAM', UPSTREAM_TEXT);
  writeFile(cwd, 'branch-UPSTREAM', 'repo=beedigital-gr/offers-template\ntag=v0.2.0\n');
  writeFile(cwd, 'prs.json', JSON.stringify([{ number: 7, title: 'Template update v0.2.0', state: 'CLOSED' }]));
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  const out = (...args) => {
    const r = run(...args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  assert.equal(out('repo'), 'beedigital-gr/offers-template');
  assert.equal(out('branch-action', 'v0.2.0'), 'rebuild');
  assert.equal(out('branch-action', 'v0.2.0', 'branch-UPSTREAM'), 'keep');
  assert.equal(out('branch-action', 'v0.3.0', 'branch-UPSTREAM'), 'rebuild');
  assert.equal(out('pr-action', 'v0.2.0', 'prs.json'), 'skip');
  assert.equal(out('pr-action', 'v0.3.0', 'prs.json'), 'create');
  assert.equal(out('label-action', 'true', 'false'), 'add');
  assert.equal(out('label-action', 'false', 'true'), 'remove');
  assert.notEqual(run('label-action', 'yes', 'false').status, 0);
  assert.notEqual(run('label-action', 'true', '').status, 0);
  assert.equal(out('has-offers'), 'false');
  writeFile(cwd, 'offers/real-ab12cd.json', '{}');
  assert.equal(out('has-offers'), 'true');
  const paths = out('paths').split('\n');
  assert.ok(paths.includes('UPSTREAM') && paths.includes('setup/') && paths.includes('lib/'));
  assert.ok(!paths.some((p) => OWNED_BY_PHOTOGRAPHER.includes(p)));
  writeFile(cwd, 'UPSTREAM', 'repo=a/b/c\ntag=v0.1.0\n');
  assert.notEqual(run('repo').status, 0);
});

test('CLI sync against a dir that is not the template exits non-zero and changes nothing', () => {
  const cwd = targetTree();
  const before = snapshot(cwd);
  const r = spawnSync(process.execPath, [SCRIPT, 'sync', emptyDir()], { cwd, env: { ...process.env, RUNNER_TEMP: emptyDir() }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /UPSTREAM/);
  assert.deepEqual(snapshot(cwd), before);
});

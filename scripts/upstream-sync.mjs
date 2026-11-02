import {
  appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OWNED_BY_PHOTOGRAPHER = ['offers/', 'photos/', 'brand/'];
// The workflow's GITHUB_TOKEN cannot write workflow files, so these are reported, never copied.
export const WORKFLOW_DIR = '.github/workflows/';
export const RETIRED = ['setup/'];
const NEVER_AT_TOP = ['node_modules', 'dist'];
const SYNCED = [
  'build.mjs', 'lib/', 'templates/', 'verticals/', 'test/', 'test-template/', 'scripts/', 'docs/', '.github/',
  'AGENTS.md', 'package.json', '.node-version', 'UPSTREAM',
];

export const filesToSync = () => [...SYNCED];

export function parseTag(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag));
  if (!m) throw new Error(`not a release tag (want vX.Y.Z): "${tag}"`);
  return m.slice(1).map(Number);
}

export function needsUpdate(currentTag, latestTag) {
  const cur = parseTag(currentTag);
  const latest = parseTag(latestTag);
  for (let i = 0; i < 3; i++) if (latest[i] !== cur[i]) return latest[i] > cur[i];
  return false;
}

function checkUpstream({ repo, tag } = {}) {
  if (!repo) throw new Error('UPSTREAM: missing repo=');
  const [owner, name, ...rest] = repo.split('/');
  const okOwner = /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner ?? '');
  const okName = /^[A-Za-z0-9._-]+$/.test(name ?? '') && name !== '.' && name !== '..';
  if (!okOwner || !okName || rest.length) throw new Error(`UPSTREAM: repo must be owner/name: "${repo}"`);
  if (!tag) throw new Error('UPSTREAM: missing tag=');
  parseTag(tag);
  return { repo, tag };
}

export function parseUpstream(text) {
  const fields = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1).replace(/\r$/, '');
  }
  return checkUpstream(fields);
}

export function formatUpstream(fields) {
  const { repo, tag } = checkUpstream(fields);
  return `repo=${repo}\ntag=${tag}\n`;
}

export function assertSafe(relPath) {
  const raw = String(relPath).replaceAll('\\', '/');
  const norm = posix.normalize(raw).toLowerCase();
  const first = norm.split('/')[0];
  const unsafe = !raw || posix.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw) || norm === '.' || first === '..'
    || NEVER_AT_TOP.includes(first) || norm.split('/').includes('.git')
    || OWNED_BY_PHOTOGRAPHER.some((d) => norm === d.slice(0, -1) || norm.startsWith(d));
  if (unsafe) throw new Error(`unsafe path for a template update: "${relPath}"`);
}

export function listFiles(root, entry) {
  if (!existsSync(join(root, entry))) return [];
  // Symlinks are skipped so a link cannot reach photographer files.
  const walk = (rel) => {
    const stat = lstatSync(join(root, rel));
    if (stat.isFile()) return [rel];
    if (!stat.isDirectory()) return [];
    return readdirSync(join(root, rel)).flatMap((name) => walk(posix.join(rel, name)));
  };
  return walk(entry.replace(/\/$/, '')).sort();
}

const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));
const isWorkflow = (p) => p.startsWith(WORKFLOW_DIR);

export function planSync(upstreamRoot, targetRoot) {
  const copy = [];
  const remove = [];
  const workflowDiff = [];
  if (!existsSync(join(upstreamRoot, 'UPSTREAM'))) throw new Error(`${upstreamRoot} does not look like the template (no UPSTREAM)`);
  for (const entry of filesToSync()) {
    const up = listFiles(upstreamRoot, entry);
    const upSet = new Set(up);
    for (const p of up) {
      if (same(join(upstreamRoot, p), join(targetRoot, p))) continue;
      (isWorkflow(p) ? workflowDiff : copy).push(p);
    }
    for (const p of listFiles(targetRoot, entry)) {
      if (!upSet.has(p)) (isWorkflow(p) ? workflowDiff : remove).push(p);
    }
  }
  for (const entry of RETIRED) remove.push(...listFiles(targetRoot, entry));
  for (const p of [...copy, ...remove, ...workflowDiff]) assertSafe(p);
  return { copy: copy.sort(), remove: remove.sort(), workflowDiff: workflowDiff.sort() };
}

function pruneEmpty(targetRoot, rel) {
  for (let dir = posix.dirname(rel); dir !== '.'; dir = posix.dirname(dir)) {
    const abs = join(targetRoot, dir);
    if (!existsSync(abs) || readdirSync(abs).length) return;
    rmdirSync(abs);
  }
}

export function applySync(upstreamRoot, targetRoot, plan) {
  for (const p of [...plan.copy, ...plan.remove]) assertSafe(p);
  for (const p of plan.copy) {
    mkdirSync(dirname(join(targetRoot, p)), { recursive: true });
    copyFileSync(join(upstreamRoot, p), join(targetRoot, p));
  }
  for (const p of plan.remove) {
    rmSync(join(targetRoot, p), { force: true });
    pruneEmpty(targetRoot, p);
  }
}

export function bumpUpstream(targetRoot, tag) {
  const file = join(targetRoot, 'UPSTREAM');
  const { repo } = parseUpstream(readFileSync(file, 'utf8'));
  writeFileSync(file, formatUpstream({ repo, tag }));
}

export function prBody({ tag, notes, workflowDiff, testsPassed }) {
  const parts = [
    `Template update to ${tag} from upstream.`,
    '## Release notes',
    notes?.trim() ? notes.replace(/(^|\W)@([A-Za-z0-9][A-Za-z0-9-]*)/g, '$1`@$2`') : '_No release notes._',
    '## Check',
    testsPassed
      ? 'Tests and build passed inside the update workflow.'
      : '**Tests or build failed** inside the update workflow. BeeDigital needs to look before this is merged.',
    'A pull request opened by the update workflow does not start the `check` workflow, so the line above is the check.',
  ];
  if (workflowDiff.length) {
    parts.push(
      '## Workflow files need a manual update (BeeDigital)',
      `The workflow cannot change these files. Copy them by hand from the upstream ${tag} tag (delete the ones upstream no longer has), then merge:`,
      workflowDiff.map((p) => `- \`${p}\``).join('\n'),
    );
  }
  parts.push('Do not merge blindly: read the notes above, and merge only when the result is green.');
  return `${parts.join('\n\n')}\n`;
}

export const needsHelp = ({ workflowDiff, testsPassed }) => workflowDiff.length > 0 || !testsPassed;

export function branchAction({ branchTag, latestTag }) {
  parseTag(latestTag);
  return !branchTag || needsUpdate(branchTag, latestTag) ? 'rebuild' : 'keep';
}

const PR_STATES = ['OPEN', 'CLOSED', 'MERGED'];

export function prAction(prs, tag) {
  if (!Array.isArray(prs)) throw new Error('pull requests must be a list');
  for (const pr of prs) if (!PR_STATES.includes(pr.state)) throw new Error(`unknown pull request state "${pr.state}"`);
  if (prs.some((pr) => pr.state === 'OPEN')) return 'edit';
  if (prs.some((pr) => pr.state === 'CLOSED' && pr.title === `Template update ${tag}`)) return 'skip';
  return 'create';
}

export function labelAction({ needsHelp: help, labelled }) {
  if (typeof help !== 'boolean' || typeof labelled !== 'boolean') throw new Error('needsHelp and labelled must be true or false');
  if (help && !labelled) return 'add';
  if (!help && labelled) return 'remove';
  return 'none';
}

export function hasOffers(root) {
  const dir = join(root, 'offers');
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { withFileTypes: true }).some((d) => d.isFile() && d.name.endsWith('.json') && !d.name.startsWith('_'));
}

const bool = (v) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`expected true or false, got "${v}"`);
};

const diffFile = () => join(process.env.RUNNER_TEMP || tmpdir(), 'workflow-diff.json');

function cli([cmd, ...args]) {
  const cwd = process.cwd();
  const need = (n, usage, max = n) => {
    if (args.length < n || args.length > max || args.some((a) => !a)) throw new Error(`usage: node scripts/upstream-sync.mjs ${usage}`);
  };
  if (cmd === 'should-update') {
    need(1, 'should-update <latestTag>');
    const { tag } = parseUpstream(readFileSync(join(cwd, 'UPSTREAM'), 'utf8'));
    console.log(String(needsUpdate(tag, args[0])));
  } else if (cmd === 'sync' || cmd === 'diff') {
    need(1, `${cmd} <upstreamDir>`);
    const upstream = resolve(args[0]);
    const plan = planSync(upstream, cwd);
    if (cmd === 'sync') applySync(upstream, cwd, plan);
    writeFileSync(diffFile(), JSON.stringify(plan.workflowDiff));
    if (cmd === 'sync') console.log(`copied ${plan.copy.length}, removed ${plan.remove.length}, workflow files to update by hand ${plan.workflowDiff.length}`);
  } else if (cmd === 'bump') {
    need(1, 'bump <tag>');
    bumpUpstream(cwd, args[0]);
  } else if (cmd === 'body') {
    need(3, 'body <tag> <notesFile> <testsPassed true|false>');
    const [tag, notesFile, passed] = args;
    if (!existsSync(diffFile())) throw new Error(`${diffFile()} is missing: run sync first`);
    const input = { tag, notes: readFileSync(notesFile, 'utf8'), workflowDiff: JSON.parse(readFileSync(diffFile(), 'utf8')), testsPassed: bool(passed) };
    process.stdout.write(prBody(input));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `needs-help=${needsHelp(input)}\n`);
  } else if (cmd === 'repo') {
    need(0, 'repo');
    console.log(parseUpstream(readFileSync(join(cwd, 'UPSTREAM'), 'utf8')).repo);
  } else if (cmd === 'branch-action') {
    need(1, 'branch-action <latestTag> [branchUpstreamFile]', 2);
    const branchTag = args[1] ? parseUpstream(readFileSync(args[1], 'utf8')).tag : null;
    console.log(branchAction({ branchTag, latestTag: args[0] }));
  } else if (cmd === 'pr-action') {
    need(2, 'pr-action <latestTag> <prsJsonFile>');
    console.log(prAction(JSON.parse(readFileSync(args[1], 'utf8')), args[0]));
  } else if (cmd === 'label-action') {
    need(2, 'label-action <needsHelp true|false> <labelled true|false>');
    console.log(labelAction({ needsHelp: bool(args[0]), labelled: bool(args[1]) }));
  } else if (cmd === 'has-offers') {
    need(0, 'has-offers');
    console.log(String(hasOffers(cwd)));
  } else if (cmd === 'paths') {
    need(0, 'paths');
    console.log([...filesToSync(), ...RETIRED].join('\n'));
  } else {
    throw new Error('usage: node scripts/upstream-sync.mjs should-update|sync|diff|bump|body|repo|branch-action|pr-action|label-action|has-offers|paths ...');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    console.error(`upstream-sync: ${err.message}`);
    process.exit(1);
  }
}

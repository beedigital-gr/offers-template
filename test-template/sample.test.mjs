import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build.mjs';
import { validateOffer } from '../lib/validate.mjs';
import { FILE } from '../lib/record.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-11-01';
const MAX_SAMPLE_BYTES = 400 * 1024;
const example = JSON.parse(readFileSync(join(REPO, 'offers', '_example.json'), 'utf8'));
const brand = JSON.parse(readFileSync(join(REPO, 'brand', 'brand.json'), 'utf8'));

function sampleRoot() {
  const root = mkdtempSync(join(tmpdir(), 'offers-sample-'));
  for (const dir of ['brand', 'offers', 'photos']) cpSync(join(REPO, dir), join(root, dir), { recursive: true });
  return root;
}

test('sample: offers/_example.json with the sample brand and portfolio validates and renders', () => {
  const root = sampleRoot();
  const result = build({ root, out: 'dist', today: TODAY, includeExample: true });
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
  assert.equal(result.written, 1);
  const page = join(root, 'dist', 'public', example.slug);
  const html = readFileSync(join(page, 'index.html'), 'utf8');
  assert.ok(html.includes('Κατερίνα &amp; Γιώργος'));
  assert.ok(!html.includes(example.notes));
  const shown = example.photos.map((p) => `p-${p.replace(/^portfolio:/, '')}`).sort();
  assert.deepEqual(readdirSync(join(page, 'photos')).sort(), shown);
});

test('sample: a normal build skips _example (fails without --allow-empty, empty with it)', () => {
  const root = sampleRoot();
  assert.deepEqual(build({ root, out: 'dist', today: TODAY }).errors, ['offers/: no offers to build']);
  const empty = build({ root, out: 'dist', today: TODAY, allowEmpty: true });
  assert.deepEqual(empty.errors, [], JSON.stringify(empty.errors));
  assert.equal(empty.written, 0);
  assert.ok(!existsSync(join(root, 'dist', 'public', example.slug)));
});

test('sample: the PR check command (node build.mjs --allow-empty) passes on the template as shipped', () => {
  const root = sampleRoot();
  const res = spawnSync(process.execPath, [join(REPO, 'build.mjs'), '--allow-empty'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /built 0 offer page\(s\)/);
});

test('sample: portfolio photos are each ≤ 400 KB, tagged in brand.json and credited row for row', () => {
  const dir = join(REPO, 'photos', '_portfolio');
  const credits = readFileSync(join(dir, 'CREDITS.md'), 'utf8');
  const credited = [...credits.matchAll(/^\| ([^|\s]+\.jpe?g) \|/gim)].map((m) => m[1]).sort();
  const photos = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  assert.deepEqual(photos, brand.portfolio.map((p) => p.file).sort());
  assert.deepEqual(credited, photos);
  for (const p of brand.portfolio) assert.ok(Array.isArray(p.types) && p.types.length > 0, `${p.file} has no event types`);
  for (const f of photos) assert.ok(statSync(join(dir, f)).size <= MAX_SAMPLE_BYTES, `${f} is over 400 KB`);
});

test('docs/PROJECT-INSTRUCTIONS.md: the offer JSON it teaches validates against the sample brand', () => {
  const doc = readFileSync(join(REPO, 'docs', 'PROJECT-INSTRUCTIONS.md'), 'utf8');
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)];
  assert.ok(blocks.length >= 1);
  const clientPhotoMissing = (e) => /: photos\[\d+\]: file not found \("\d+\.jpg"\)$/.test(e);
  const full = blocks.map((b) => JSON.parse(b[1])).filter((o) => o.schema === 1);
  assert.equal(full.length, 1, 'exactly one complete offer example');
  const offer = full[0];
  offer[FILE] = `offers/${offer.slug}.json`;
  assert.deepEqual(validateOffer(offer, brand, REPO).filter((e) => !clientPhotoMissing(e)), []);
  assert.deepEqual(Object.keys(offer).sort(), Object.keys(example).sort());
});

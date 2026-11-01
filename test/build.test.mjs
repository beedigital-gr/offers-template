import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { athensToday, build, dateClashes } from '../build.mjs';
import { OK, readJson, tempRoot, writeFile } from './helpers.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// root ignores file permissions, so the chmod-based failures cannot happen.
const AS_ROOT = process.getuid?.() === 0 && 'running as root: chmod cannot make a file unreadable';
const TODAY = '2026-11-01';
const MARIA = 'maria-nikos-k3x9qa';
const ELENI = 'eleni-kostas-p7m2zd';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const snapshot = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), readFileSync(f, 'utf8')]));
const pub = (root, ...p) => join(root, 'dist', 'public', ...p);
const run = (root, today = TODAY) => build({ root, out: 'dist', today });
const ok = (result) => assert.deepEqual(result.errors, [], JSON.stringify(result.errors));

function writeOffer(root, slug, patch = {}) {
  const offer = { ...readJson(OK, `offers/${MARIA}.json`), slug, ...patch };
  writeFile(root, `offers/${slug}.json`, JSON.stringify(offer, null, 2));
  return offer;
}

// A previous deploy that every failure test proves was not touched.
function withLastGood(root) {
  mkdirSync(join(root, 'dist', 'public'), { recursive: true });
  writeFileSync(join(root, 'dist', 'public', 'last-good.txt'), 'previous deploy');
  return readdirSync(root).sort();
}
function assertUntouched(root, before) {
  assert.deepEqual(snapshot(join(root, 'dist')), { [join('public', 'last-good.txt')]: 'previous deploy' });
  assert.deepEqual(readdirSync(root).sort(), before, 'temp dir left behind');
}

// Two offers with distinctive private values, so a leak is unambiguous.
function twoOffers() {
  const root = tempRoot();
  writeOffer(root, MARIA, {
    client: { names: 'Maria & Nikos', email: 'maria.private@example.com', phone: '+306911111111' },
    notes: 'SECRET-NOTE-MARIA haggled hard',
  });
  writeOffer(root, ELENI, {
    client: { names: 'Eleni Papadaki', email: 'eleni.private@example.com', phone: '+306922222222' },
    event: { type: 'wedding', date: '2027-07-20', venue: 'Elounda' },
    photos: [],
    notes: 'SECRET-NOTE-ELENI second wedding',
  });
  return root;
}

test('valid fixture: no errors, one folder per offer, photos copied byte-for-byte under p-/c- names', () => {
  const root = tempRoot();
  const result = run(root);
  ok(result);
  assert.equal(result.written, 1);
  const dirs = readdirSync(pub(root)).filter((n) => statSync(pub(root, n)).isDirectory()).sort();
  assert.deepEqual(dirs, ['_assets', MARIA]);
  assert.ok(existsSync(pub(root, MARIA, 'index.html')));
  assert.deepEqual(readdirSync(pub(root, MARIA, 'photos')).sort(), ['c-01.jpg', 'c-IMG_01.JPG', 'p-03.jpg']);
  assert.deepEqual(readFileSync(pub(root, MARIA, 'photos', 'p-03.jpg')), readFileSync(join(root, 'photos/_portfolio/03.jpg')));
  assert.deepEqual(readFileSync(pub(root, MARIA, 'photos', 'c-IMG_01.JPG')), readFileSync(join(root, `photos/${MARIA}/IMG_01.JPG`)));
});

test('only photos the page uses are copied', () => {
  const root = tempRoot();
  writeOffer(root, MARIA, { photos: ['portfolio:03.jpg', '01.jpg'] });
  ok(run(root));
  assert.deepEqual(readdirSync(pub(root, MARIA, 'photos')).sort(), ['c-01.jpg', 'p-03.jpg']);
});

test('_example is never built', () => {
  const root = tempRoot();
  ok(run(root));
  assert.ok(!existsSync(pub(root, 'example-couple-abc123')));
  for (const f of walk(pub(root))) assert.ok(!readFileSync(f, 'utf8').includes('example-couple-abc123'), f);
});

test('leak test: no notes, client email or phone anywhere; no page names another offer', () => {
  const root = twoOffers();
  const result = run(root);
  ok(result);
  assert.equal(result.written, 2);
  const forbiddenEverywhere = ['SECRET-NOTE', 'maria.private', 'eleni.private', '6911111111', '6922222222', '"notes"'];
  for (const f of walk(pub(root))) {
    const text = readFileSync(f, 'latin1') + readFileSync(f, 'utf8');
    for (const s of forbiddenEverywhere) assert.ok(!text.includes(s), `${relative(root, f)} contains ${s}`);
  }
  const others = { [MARIA]: ['Eleni', ELENI], [ELENI]: ['Maria', 'Nikos', MARIA] };
  for (const [slug, banned] of Object.entries(others)) {
    for (const f of walk(pub(root, slug))) {
      const text = readFileSync(f, 'utf8');
      for (const s of banned) assert.ok(!text.includes(s), `${relative(root, f)} contains ${s}`);
    }
  }
  for (const f of walk(pub(root, '_assets'))) {
    const text = readFileSync(f, 'latin1');
    for (const s of ['Maria', 'Eleni', MARIA, ELENI]) assert.ok(!text.includes(s), `${relative(root, f)} contains ${s}`);
  }
});

test('index.html: branded "nothing here", no slug, no list, no names', () => {
  const root = twoOffers();
  ok(run(root));
  const html = readFileSync(pub(root, 'index.html'), 'utf8');
  assert.match(html, /Studio Name/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  for (const s of [MARIA, ELENI, 'Maria', 'Eleni']) assert.ok(!html.includes(s), s);
  assert.doesNotMatch(html, /<(ul|ol|li|a)\b/);
  for (const v of ['--bg', '--ink', '--accent', '--accent-text', '--tint', '--muted', '--muted-on-ink', '--line', '--shade', '--light']) {
    assert.match(html, new RegExp(`<style>:root\\{[^}]*${v}:#[0-9a-f]{3,6}[;}]`), v);
  }
});

test('robots.txt disallows everything; _headers sets noindex and caches assets', () => {
  const root = tempRoot();
  ok(run(root));
  assert.match(readFileSync(pub(root, 'robots.txt'), 'utf8'), /^User-agent: \*\nDisallow: \/\n$/);
  const headers = readFileSync(pub(root, '_headers'), 'utf8');
  assert.equal(headers, [
    '/*',
    '  X-Robots-Tag: noindex, nofollow',
    '/_assets/offer.css',
    '  Cache-Control: public, max-age=300, must-revalidate',
    '/_assets/offer.js',
    '  Cache-Control: public, max-age=300, must-revalidate',
    '/_assets/fonts/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'));
});

// Cloudflare merges every matching rule, so two Cache-Control rules must never cover the same path.
test('_headers: no Cache-Control rule overlaps another', () => {
  const root = tempRoot();
  ok(run(root));
  const headers = readFileSync(pub(root, '_headers'), 'utf8');
  assert.ok(!headers.split('\n').includes('/_assets/*'));
  const rules = headers.split(/\n(?=\/)/).map((block) => block.split('\n')).filter(([, ...lines]) => lines.some((l) => l.trim().startsWith('Cache-Control:')));
  const paths = rules.map(([path]) => path);
  assert.equal(paths.length, 3);
  const covers = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path);
  for (const a of paths) for (const b of paths) if (a !== b) assert.ok(!covers(a, b), `${a} also matches ${b}`);
});

test('all of templates/ (fonts + licence) lands in _assets; every url() in offer.css resolves', () => {
  const root = tempRoot();
  ok(run(root));
  const expected = walk(join(REPO, 'templates')).map((f) => relative(join(REPO, 'templates'), f)).sort();
  const got = walk(pub(root, '_assets')).map((f) => relative(pub(root, '_assets'), f)).sort();
  assert.deepEqual(got, expected);
  assert.ok(got.includes(join('fonts', 'OFL-GFS-Didot.txt')));
  const css = readFileSync(pub(root, '_assets', 'offer.css'), 'utf8');
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.ok(existsSync(join(pub(root, '_assets'), u)), `offer.css url(${u}) is missing`);
});

test('link checker: every src/href starting with "/" in every built page resolves to a file', () => {
  const root = twoOffers();
  ok(run(root));
  const pages = walk(pub(root)).filter((f) => f.endsWith('.html'));
  assert.equal(pages.length, 3);
  let checked = 0;
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    for (const [, , ref] of html.matchAll(/\b(src|href)="(\/[^"]*)"/g)) {
      let path = decodeURIComponent(ref.replace(/&amp;/g, '&').split(/[?#]/)[0]);
      if (path.endsWith('/')) path += 'index.html';
      assert.ok(existsSync(join(pub(root), path)), `${relative(root, page)}: ${ref} does not exist`);
      checked++;
    }
  }
  assert.ok(checked >= 9, `only ${checked} links checked`);
});

test('a bad offer: errors name the file, nothing written, existing out left untouched, no temp dir left', () => {
  const root = tempRoot();
  const before = withLastGood(root);
  writeFile(root, 'offers/broken-offer-zzzzzz.json', '{ "schema": 1, }');
  const result = run(root);
  assert.equal(result.written, 0);
  assert.ok(result.errors.some((e) => e.startsWith('offers/broken-offer-zzzzzz.json: ')), JSON.stringify(result.errors));
  assertUntouched(root, before);
});

test('a bad offer with no previous out: out is never created', () => {
  const root = tempRoot();
  writeOffer(root, MARIA, { cover: '01.jpg' });
  const result = run(root);
  assert.ok(result.errors.some((e) => e.startsWith(`offers/${MARIA}.json: cover: `)), JSON.stringify(result.errors));
  assert.ok(!existsSync(join(root, 'dist')));
});

test('a successful build replaces the previous out completely', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'dist', 'public', 'deleted-offer-qqqqqq'), { recursive: true });
  writeFileSync(join(root, 'dist', 'stale.txt'), 'old');
  ok(run(root));
  assert.ok(!existsSync(join(root, 'dist', 'stale.txt')));
  assert.ok(!existsSync(pub(root, 'deleted-offer-qqqqqq')));
  assert.deepEqual(readdirSync(join(root, 'dist')), ['public']);
});

test('an already-expired offer is built expired: no Book links, banner shown', () => {
  const root = tempRoot();
  const result = run(root, '2027-01-01');
  ok(result);
  const html = readFileSync(pub(root, MARIA, 'index.html'), 'utf8');
  assert.match(html, /<body class="is-expired"/);
  assert.doesNotMatch(html, /class="[^"]*\bbook\b/);
  assert.doesNotMatch(html, /<div class="expired" role="status" hidden>/);
  const fresh = tempRoot();
  ok(run(fresh, '2026-12-31'));
  assert.match(readFileSync(pub(fresh, MARIA, 'index.html'), 'utf8'), /class="btn book"/);
});

test('today must be a real date', () => {
  const root = tempRoot();
  const result = run(root, '2026-13-01');
  assert.match(result.errors.join('\n'), /today/);
  assert.ok(!existsSync(join(root, 'dist')));
});

test('empty photos + event.type wedding: page shows only the portfolio photos tagged wedding', () => {
  const root = tempRoot();
  writeOffer(root, MARIA, { photos: [] });
  ok(run(root));
  assert.deepEqual(readdirSync(pub(root, MARIA, 'photos')), ['p-03.jpg']);
  const html = readFileSync(pub(root, MARIA, 'index.html'), 'utf8');
  assert.ok(html.includes(`/${MARIA}/photos/p-03.jpg`));
  assert.ok(!html.includes('p-04.JPEG'));
});

test('dateClashes: non-lost offers sharing a date clash; lost and null dates never do', () => {
  const o = (slug, date, status = 'sent') => ({ slug, status, event: { date } });
  const clashes = dateClashes([
    o('a-aaaaaa', '2027-06-14'), o('b-bbbbbb', '2027-06-14', 'booked'), o('c-cccccc', '2027-06-14', 'lost'),
    o('d-dddddd', null, 'draft'), o('e-eeeeee', null, 'draft'), o('f-ffffff', '2027-07-01'),
  ]);
  assert.deepEqual(clashes, [{ date: '2027-06-14', slugs: ['a-aaaaaa', 'b-bbbbbb'] }]);
});

test('clash in the fixture: warning names the date and both slugs, build still succeeds', () => {
  const root = tempRoot();
  writeOffer(root, ELENI, { photos: [] });
  writeOffer(root, 'lost-one-r4t5y6', { photos: [], status: 'lost' });
  const result = run(root);
  ok(result);
  assert.equal(result.written, 3);
  assert.equal(result.warnings.length, 1);
  const [w] = result.warnings;
  assert.match(w, /2027-06-14/);
  assert.ok(w.includes(MARIA) && w.includes(ELENI) && !w.includes('lost-one'), w);
});

test('migrate runs on every offer: schema 1 passes through unchanged, an unknown schema fails the build', () => {
  const root = tempRoot();
  const offer = writeOffer(root, ELENI, { photos: [], client: { names: 'Unchanged Names', email: '', phone: '' } });
  ok(run(root));
  assert.match(readFileSync(pub(root, ELENI, 'index.html'), 'utf8'), /<h1 class="names">Unchanged Names<\/h1>/);
  writeFile(root, `offers/${ELENI}.json`, JSON.stringify({ ...offer, schema: 2 }));
  const result = run(root);
  assert.ok(result.errors.some((e) => e.startsWith(`offers/${ELENI}.json: schema: `)), JSON.stringify(result.errors));
});

const cli = (root, args = []) => spawnSync(process.execPath, [join(REPO, 'build.mjs'), ...args], { cwd: root, encoding: 'utf8' });

test('CLI: exit 0 and builds dist/ in cwd; warnings printed', () => {
  const root = tempRoot();
  writeOffer(root, ELENI, { photos: [] });
  const res = cli(root);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(pub(root, MARIA, 'index.html')));
  assert.match(res.stdout + res.stderr, /2027-06-14/);
});

test('CLI: exit 1 on any error, the error names the file and field', () => {
  const root = tempRoot();
  writeOffer(root, MARIA, { validUntil: 'soon' });
  const res = cli(root);
  assert.equal(res.status, 1);
  assert.match(res.stderr, new RegExp(`offers/${MARIA}\\.json: validUntil: `));
  assert.ok(!existsSync(join(root, 'dist')));
});

test('zero offers (only _example and README): error, unless allowEmpty', () => {
  const root = tempRoot();
  rmSync(join(root, 'offers', `${MARIA}.json`));
  const before = withLastGood(root);
  const result = run(root);
  assert.deepEqual(result.errors, ['offers/: no offers to build']);
  assertUntouched(root, before);
  const empty = build({ root, out: 'dist', today: TODAY, allowEmpty: true });
  ok(empty);
  assert.equal(empty.written, 0);
  assert.ok(existsSync(pub(root, 'index.html')));
});

test('CLI: zero offers exits 1 with the reason; --allow-empty exits 0', () => {
  const root = tempRoot();
  rmSync(join(root, 'offers', `${MARIA}.json`));
  const res = cli(root);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /offers\/: no offers to build/);
  assert.match(res.stderr, /--allow-empty/);
  assert.ok(!existsSync(join(root, 'dist')));
  const allowed = cli(root, ['--allow-empty']);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.ok(existsSync(pub(root, 'index.html')));
});

test('CLI: an unknown flag exits 1', () => {
  const res = cli(tempRoot(), ['--alow-empty']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /--alow-empty/);
});

function templatesWithout(rel) {
  const dir = join(tempRoot(), 'templates-copy');
  cpSync(join(REPO, 'templates'), dir, { recursive: true });
  rmSync(join(dir, rel));
  assert.ok(!existsSync(join(dir, rel)));
  return dir;
}

test('tree check: a font missing from templates → error naming offer.css, nothing swapped', () => {
  const root = tempRoot();
  const before = withLastGood(root);
  const result = build({ root, out: 'dist', today: TODAY, templates: templatesWithout('fonts/gfs-didot-greek-400-normal.woff2') });
  assert.equal(result.written, 0);
  assert.ok(result.errors.some((e) => e.includes('_assets/offer.css') && e.includes('gfs-didot-greek-400-normal.woff2')), JSON.stringify(result.errors));
  assertUntouched(root, before);
});

test('tree check: offer.js missing → errors name it and the page linking it, nothing swapped', () => {
  const root = tempRoot();
  const before = withLastGood(root);
  const result = build({ root, out: 'dist', today: TODAY, templates: templatesWithout('offer.js') });
  assert.ok(result.errors.some((e) => e.includes(`${MARIA}/index.html`) && e.includes('/_assets/offer.js')), JSON.stringify(result.errors));
  assert.ok(result.errors.some((e) => /_assets\/offer\.js: missing/.test(e)), JSON.stringify(result.errors));
  assertUntouched(root, before);
});

test('tree check: offer.css missing → error, nothing swapped', () => {
  const root = tempRoot();
  const before = withLastGood(root);
  const result = build({ root, out: 'dist', today: TODAY, templates: templatesWithout('offer.css') });
  assert.ok(result.errors.some((e) => /_assets\/offer\.css: missing/.test(e)), JSON.stringify(result.errors));
  assertUntouched(root, before);
});

test('renderOffer throwing on one of several offers: error names the file, old out untouched, no temp dir', () => {
  const root = tempRoot();
  writeOffer(root, ELENI, { photos: [], packages: [{ id: 'gold', price: 1e307 }], recommended: 'gold' });
  const before = withLastGood(root);
  const result = run(root);
  assert.equal(result.written, 0);
  assert.equal(result.errors.length, 1, JSON.stringify(result.errors));
  assert.match(result.errors[0], new RegExp(`^offers/${ELENI}\\.json: .*too large`));
  assertUntouched(root, before);
});

test('photo copy failure after validation: error names offer file and photo, old out untouched, no temp dir', { skip: AS_ROOT }, (t) => {
  const root = tempRoot();
  const src = join(root, 'photos', MARIA, 'IMG_01.JPG');
  chmodSync(src, 0o000);
  t.after(() => chmodSync(src, 0o644));
  const before = withLastGood(root);
  const result = run(root);
  assert.equal(result.written, 0);
  assert.deepEqual(result.errors, [`offers/${MARIA}.json: photos: could not copy IMG_01.JPG: EACCES`]);
  assertUntouched(root, before);
});

test('any throw (here: out under a file) is returned as an error, never thrown', () => {
  const root = tempRoot();
  let result;
  assert.doesNotThrow(() => { result = build({ root, out: 'brand/brand.json/dist', today: TODAY }); });
  assert.equal(result.written, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /^build: .*(ENOTDIR|EEXIST)/);
});

test('removing the old tree is best-effort: failure is a warning, the new build is live', { skip: AS_ROOT }, (t) => {
  const root = tempRoot();
  const locked = join(root, 'dist', 'public', 'locked');
  mkdirSync(locked, { recursive: true });
  writeFileSync(join(locked, 'f.txt'), 'x');
  chmodSync(locked, 0o555);
  t.after(() => {
    for (const d of readdirSync(root)) if (d.startsWith('.dist-tmp-')) chmodSync(join(root, d, 'public', 'locked'), 0o755);
  });
  const result = run(root);
  ok(result);
  assert.ok(existsSync(pub(root, MARIA, 'index.html')));
  assert.ok(!existsSync(pub(root, 'locked')));
  assert.equal(result.warnings.length, 1, JSON.stringify(result.warnings));
  assert.match(result.warnings[0], /could not remove the previous build .*\.dist-tmp-/);
});

test('CLI: missing brand → exit 1, error names brand/brand.json, nothing written', () => {
  const root = tempRoot();
  rmSync(join(root, 'brand', 'brand.json'));
  const res = cli(root);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /brand\/brand\.json: /);
  assert.doesNotMatch(res.stderr, /\n\s+at /);
  assert.ok(!existsSync(join(root, 'dist')));
});

test('two offers each with a client photo 01.jpg: each page gets its own bytes', () => {
  const root = tempRoot();
  writeOffer(root, ELENI, { photos: ['portfolio:03.jpg', '01.jpg'] });
  writeFile(root, `photos/${ELENI}/01.jpg`, 'eleni-bytes');
  ok(run(root));
  assert.deepEqual(readFileSync(pub(root, MARIA, 'photos', 'c-01.jpg')), readFileSync(join(root, `photos/${MARIA}/01.jpg`)));
  assert.equal(readFileSync(pub(root, ELENI, 'photos', 'c-01.jpg'), 'utf8'), 'eleni-bytes');
});

test('bad offers next to a good one: no partial output, every bad file named', () => {
  const root = tempRoot();
  writeOffer(root, ELENI, { photos: [], validUntil: 'soon' });
  writeFile(root, 'offers/broken-offer-zzzzzz.json', '{ "schema": 1, }');
  const result = run(root);
  assert.equal(result.written, 0);
  for (const f of [`offers/${ELENI}.json`, 'offers/broken-offer-zzzzzz.json']) {
    assert.ok(result.errors.some((e) => e.startsWith(`${f}: `)), `${f} not named in ${JSON.stringify(result.errors)}`);
  }
  assert.ok(!result.errors.some((e) => e.startsWith(`offers/${MARIA}.json`)));
  assert.ok(!existsSync(join(root, 'dist')));
});

test('athensToday: Athens calendar date, across both 2026 DST changes', () => {
  const cases = {
    '2026-10-24T21:30:00Z': '2026-10-25',
    '2026-03-28T21:59:00Z': '2026-03-28',
    '2026-03-28T22:00:00Z': '2026-03-29',
    '2026-03-29T21:00:00Z': '2026-03-30',
    '2026-03-29T20:59:00Z': '2026-03-29',
    '2026-10-24T20:59:00Z': '2026-10-24',
    '2026-10-24T21:00:00Z': '2026-10-25',
    '2026-10-25T21:59:00Z': '2026-10-25',
    '2026-10-25T22:00:00Z': '2026-10-26',
  };
  for (const [utc, athens] of Object.entries(cases)) assert.equal(athensToday(new Date(utc)), athens, utc);
});

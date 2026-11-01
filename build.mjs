import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBrand, loadOffers } from './lib/load.mjs';
import { resolvePhoto, validateAll } from './lib/validate.mjs';
import { photoOutputName, photosFor, renderOffer } from './lib/render-offer.mjs';
import { isIsoDate, paletteStyle } from './lib/page.mjs';
import { escapeHtml as esc } from './lib/html.mjs';
import { t } from './lib/strings.mjs';
import { FILE } from './lib/record.mjs';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), 'templates');
const NO_OFFERS = 'offers/: no offers to build';

const ROBOTS = 'User-agent: *\nDisallow: /\n';
const HEADERS = `/*
  X-Robots-Tag: noindex, nofollow
/_assets/offer.css
  Cache-Control: public, max-age=300, must-revalidate
/_assets/offer.js
  Cache-Control: public, max-age=300, must-revalidate
/_assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;
const message = (e) => e?.message ?? String(e);
const reason = (e) => e?.code ?? message(e);

// Non-lost offers sharing an event date.
export function dateClashes(offers) {
  const byDate = new Map();
  for (const o of offers) {
    const date = o.event?.date;
    if (o.status === 'lost' || typeof date !== 'string' || date === '') continue;
    byDate.set(date, [...(byDate.get(date) ?? []), o.slug]);
  }
  return [...byDate].filter(([, slugs]) => slugs.length > 1).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, slugs]) => ({ date, slugs }));
}

function indexPage(brand) {
  const lang = brand.defaultLanguage;
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${esc(brand.name)}</title>
<style>${paletteStyle(brand.colors)}</style>
<link rel="stylesheet" href="/_assets/offer.css">
</head>
<body>
<header class="masthead"><p class="wordmark">${esc(brand.name)}</p></header>
<main><section class="intro"><p>${esc(t(lang, 'nothingHere'))}</p></section></main>
</body>
</html>
`;
}

// Rendered in memory first, so a throw leaves the disk untouched.
function renderAll(offers, brand, root, today) {
  const pages = [];
  const errors = [];
  for (const offer of offers) {
    try {
      const photos = photosFor(offer, brand).map((entry) => ({
        from: resolvePhoto(entry, offer.slug, root).path,
        name: photoOutputName(entry),
      }));
      pages.push({ file: offer[FILE], slug: offer.slug, html: renderOffer(offer, brand, { today }), photos });
    } catch (e) {
      errors.push(`${offer[FILE]}: ${message(e)}`);
    }
  }
  return { pages, errors };
}

function writeTree(pub, pages, brand, templates) {
  const errors = [];
  cpSync(templates, join(pub, '_assets'), { recursive: true });
  for (const page of pages) {
    mkdirSync(join(pub, page.slug, 'photos'), { recursive: true });
    writeFileSync(join(pub, page.slug, 'index.html'), page.html);
    for (const p of page.photos) {
      try {
        copyFileSync(p.from, join(pub, page.slug, 'photos', p.name));
      } catch (e) {
        errors.push(`${page.file}: photos: could not copy ${basename(p.from)}: ${reason(e)}`);
      }
    }
  }
  writeFileSync(join(pub, 'index.html'), indexPage(brand));
  writeFileSync(join(pub, 'robots.txt'), ROBOTS);
  writeFileSync(join(pub, '_headers'), HEADERS);
  return errors;
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

function rootRelativePath(ref) {
  try {
    const path = decodeURIComponent(ref.replace(/&amp;/g, '&').split(/[?#]/)[0]);
    return path.endsWith('/') ? `${path}index.html` : path;
  } catch {
    return null;
  }
}

// The finished tree must be self-consistent before it may replace the last good deploy.
function verifyTree(pub) {
  const errors = [];
  const assets = join(pub, '_assets');
  const cssFile = join(assets, 'offer.css');
  for (const name of ['offer.css', 'offer.js']) if (!existsSync(join(assets, name))) errors.push(`_assets/${name}: missing from templates/`);
  if (existsSync(cssFile)) {
    const css = readFileSync(cssFile, 'utf8');
    for (const [, ref] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(ref)) continue;
      if (!existsSync(join(assets, ref.split(/[?#]/)[0]))) errors.push(`_assets/offer.css: url(${ref}) does not exist`);
    }
  }
  for (const page of walk(pub).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(page, 'utf8');
    for (const [, ref] of html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)) {
      const path = rootRelativePath(ref);
      if (!path || !existsSync(join(pub, path))) errors.push(`${relative(pub, page)}: ${ref} does not exist in the build`);
    }
  }
  return errors;
}

// Returns a warning when the previous tree could not be removed after the swap.
function swapInto(tmp, out) {
  if (!existsSync(out)) {
    renameSync(tmp, out);
    return null;
  }
  const old = `${tmp}-old`;
  renameSync(out, old);
  try {
    renameSync(tmp, out);
  } catch (e) {
    renameSync(old, out);
    throw e;
  }
  try {
    rmSync(old, { recursive: true, force: true });
    return null;
  } catch (e) {
    return `build: could not remove the previous build ${old}: ${reason(e)} (delete it by hand)`;
  }
}

function buildUnsafe({ root, out, today, allowEmpty, templates }) {
  const warnings = [];
  const fail = (errors) => ({ errors, warnings, written: 0 });
  if (!isIsoDate(today)) return fail([`build: today must be a real date YYYY-MM-DD, got ${JSON.stringify(today)}`]);

  const { brand, errors: brandErrors } = loadBrand(root);
  const { offers, errors: offerErrors } = loadOffers(root);
  const errors = [...brandErrors, ...offerErrors];
  if (brand) errors.push(...validateAll(offers, brand, root));
  if (errors.length) return fail(errors);
  if (offers.length === 0 && !allowEmpty) return fail([NO_OFFERS]);

  for (const { date, slugs } of dateClashes(offers)) warnings.push(`event.date ${date}: ${slugs.length} offers on the same day: ${slugs.join(', ')}`);

  const { pages, errors: renderErrors } = renderAll(offers, brand, root, today);
  if (renderErrors.length) return fail(renderErrors);

  const outDir = resolve(root, out);
  mkdirSync(dirname(outDir), { recursive: true });
  const tmp = mkdtempSync(join(dirname(outDir), `.${basename(outDir)}-tmp-`));
  try {
    const pub = join(tmp, 'public');
    const writeErrors = writeTree(pub, pages, brand, templates);
    if (writeErrors.length) return fail(writeErrors);
    const treeErrors = verifyTree(pub);
    if (treeErrors.length) return fail(treeErrors);
    const warning = swapInto(tmp, outDir);
    if (warning) warnings.push(warning);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { errors: [], warnings, written: pages.length };
}

// Never throws: any failure comes back as an error and nothing is swapped in.
export function build({ root, out, today, allowEmpty = false, templates = TEMPLATES }) {
  try {
    return buildUnsafe({ root, out, today, allowEmpty, templates });
  } catch (e) {
    return { errors: [`build: ${message(e)}`], warnings: [], written: 0 };
  }
}

export function athensToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--allow-empty');
  const { errors, warnings, written } = unknown.length
    ? { errors: [`build: unknown option ${unknown.join(' ')} (only --allow-empty)`], warnings: [], written: 0 }
    : build({ root: process.cwd(), out: 'dist', today: athensToday(), allowEmpty: args.includes('--allow-empty') });
  for (const e of errors) console.error(`error: ${e}`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    if (errors.includes(NO_OFFERS)) console.error('Building with no offers would empty the live site, so the build stops. A repo with no offers yet: node build.mjs --allow-empty');
    console.error(`build failed: ${errors.length} error(s), nothing written`);
    process.exit(1);
  }
  console.log(`built ${written} offer page(s) into dist/public`);
}

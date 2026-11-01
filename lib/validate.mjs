import { statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_FILE, FILE, LANGUAGES, err, isObject, isText, show } from './record.mjs';
import { getVertical } from '../verticals/index.mjs';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{6}$/;
const PHOTO_EXT = /\.jpe?g$/i;
const SAFE_NAME = /^[^/\\\0]+$/;
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
export const DEFAULT_VERTICAL = 'photographer';
const PORTFOLIO = 'portfolio:';

export function migrate(raw) {
  if (raw.schema === 1) return raw;
  throw new Error(`schema: unsupported schema version ${show(raw.schema)} (expected 1)`);
}

function checkPhotoFile(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch (e) {
    return e.code === 'ENOENT' ? 'file not found' : e.code ?? e.message;
  }
  if (!stat.isFile()) return 'not a file';
  if (stat.size > MAX_PHOTO_BYTES) return `file is ${(stat.size / 1048576).toFixed(1)} MB, max 1.5 MB`;
  return null;
}

function checkPhotoName(name) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name) || name === '.' || name === '..') return 'invalid file name';
  if (!PHOTO_EXT.test(name)) return 'only .jpg/.jpeg photos are allowed';
  return null;
}

export function resolvePhoto(entry, slug, root) {
  if (typeof entry === 'string' && entry.startsWith(PORTFOLIO)) {
    const name = entry.slice(PORTFOLIO.length);
    return { name, portfolio: true, path: join(root, 'photos', '_portfolio', name) };
  }
  return { name: entry, portfolio: false, path: join(root, 'photos', String(slug), String(entry)) };
}

function verticalOf(brand) {
  if (brand.vertical === undefined) return getVertical(DEFAULT_VERTICAL);
  return typeof brand.vertical === 'string' ? getVertical(brand.vertical) : undefined;
}

export function validateBrand(brand, root) {
  if (!isObject(brand)) return [];
  const errors = [];
  const add = (field, problem) => errors.push(err(BRAND_FILE, field, problem));

  if (!isText(brand.name)) add('name', `must be text, got ${show(brand.name)}`);
  for (const key of ['currency', 'whatsapp', 'email']) {
    if (typeof brand[key] !== 'string') add(key, `must be text, got ${show(brand[key])}`);
  }
  if (!LANGUAGES.includes(brand.defaultLanguage)) add('defaultLanguage', `must be "el" or "en", got ${show(brand.defaultLanguage)}`);
  if (!isObject(brand.colors)) {
    add('colors', 'must be { bg, ink, accent }');
  } else {
    for (const key of ['bg', 'ink', 'accent']) {
      if (typeof brand.colors[key] !== 'string') add(`colors.${key}`, `must be a colour like "#1d1b19", got ${show(brand.colors[key])}`);
    }
  }

  if (typeof brand.offersBaseUrl !== 'string' || !/^https?:\/\/\S+$/.test(brand.offersBaseUrl) || brand.offersBaseUrl.endsWith('/')) {
    add('offersBaseUrl', `must be like "https://offers.studio.gr" (no trailing slash), got ${show(brand.offersBaseUrl)}`);
  }

  const vertical = verticalOf(brand);
  if (!vertical) add('vertical', `unknown vertical ${show(brand.vertical)}`);

  const portfolio = brand.portfolio;
  if (!Array.isArray(portfolio)) {
    add('portfolio', `must be a list of { file, types }, got ${show(portfolio)}`);
  } else {
    const files = new Set();
    portfolio.forEach((p, i) => {
      const field = `portfolio[${i}]`;
      if (!isObject(p)) return add(field, 'must be { file, types }');
      if (files.has(p.file)) {
        add(`${field}.file`, `${show(p.file)} is listed twice`);
      } else {
        files.add(p.file);
        const problem = checkPhotoName(p.file) ?? checkPhotoFile(join(root, 'photos', '_portfolio', String(p.file)));
        if (problem) add(`${field}.file`, `${problem} (${show(p.file)})`);
      }
      if (!Array.isArray(p.types) || !p.types.every((t) => typeof t === 'string')) {
        add(`${field}.types`, 'must be a list of event types');
      }
    });
  }

  if (vertical?.validateBrand) errors.push(...vertical.validateBrand(brand).map((e) => `${BRAND_FILE}: ${e}`));
  return errors;
}

function validatePhotos(offer, brand, root, file, slugOk) {
  const errors = [];
  const photos = offer.photos;
  if (!Array.isArray(photos)) return [err(file, 'photos', 'must be a list, use [] for portfolio photos')];
  const seen = new Set();
  photos.forEach((entry, i) => {
    const key = show(entry);
    if (seen.has(key)) return errors.push(err(file, `photos[${i}]`, `${key} is listed twice`));
    seen.add(key);
    const photo = resolvePhoto(entry, offer.slug, root);
    let problem = checkPhotoName(photo.name);
    if (!problem && (photo.portfolio || slugOk)) problem = checkPhotoFile(photo.path);
    if (problem) errors.push(err(file, `photos[${i}]`, `${problem} (${key})`));
  });
  if (offer.cover === undefined || offer.cover === null || offer.cover === '') return errors;
  const cover = offer.cover;
  if (typeof cover !== 'string' || !cover.startsWith(PORTFOLIO)) {
    errors.push(err(file, 'cover', `must be a portfolio photo ("portfolio:<file>"), got ${show(cover)}`));
    return errors;
  }
  if (photos.length > 0 && !photos.includes(cover)) errors.push(err(file, 'cover', `${show(cover)} is not in photos`));
  if (brand) {
    const name = cover.slice(PORTFOLIO.length);
    const tagged = Array.isArray(brand.portfolio) && brand.portfolio.some((p) => p?.file === name);
    if (!tagged) errors.push(err(file, 'cover', `${show(name)} is not listed in brand.portfolio`));
  }
  return errors;
}

export function validateOffer(offer, brand, root) {
  const file = offer[FILE] ?? `offers/${offer.slug}.json`;
  const errors = [];
  const base = file.replace(/^offers\//, '').replace(/\.json$/i, '');
  const slugOk = typeof offer.slug === 'string' && SLUG.test(offer.slug);
  if (!slugOk) {
    errors.push(err(file, 'slug', `${show(offer.slug)} must be lowercase words joined by "-" ending in a 6-character code`));
  } else if (base !== '_example' && base !== offer.slug) {
    errors.push(err(file, 'slug', `${show(offer.slug)} does not match the file name`));
  }
  const usableBrand = isObject(brand) ? brand : null;
  errors.push(...validatePhotos(offer, usableBrand, root, file, slugOk));
  const vertical = usableBrand && verticalOf(usableBrand);
  if (vertical) errors.push(...vertical.validate(offer, usableBrand, root).map((e) => `${file}: ${e}`));
  return errors;
}

function duplicateSlugs(offers) {
  const bySlug = new Map();
  for (const o of offers) {
    if (typeof o.slug !== 'string') continue;
    bySlug.set(o.slug, [...(bySlug.get(o.slug) ?? []), o[FILE] ?? `offers/${o.slug}.json`]);
  }
  return [...bySlug.values()].filter((files) => files.length > 1).flatMap((files) =>
    files.map((f) => err(f, 'slug', `also used by ${files.filter((g) => g !== f).join(', ')}`)));
}

export function validateAll(offers, brand, root) {
  return [
    ...validateBrand(brand, root),
    ...offers.flatMap((o) => validateOffer(o, brand, root)),
    ...duplicateSlugs(offers),
  ];
}

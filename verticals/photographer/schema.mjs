import { LANGUAGES, isObject, isText, show } from '../../lib/record.mjs';

export const statuses = ['draft', 'sent', 'booked', 'lost'];

const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isTexts = (v) => isObject(v) && LANGUAGES.every((l) => typeof v[l] === 'string');
const isTextLists = (v) => isObject(v) && LANGUAGES.every((l) => Array.isArray(v[l]) && v[l].every((s) => typeof s === 'string'));

function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const idsOf = (list) => new Set(Array.isArray(list) ? list.filter(isObject).map((x) => x.id).filter(isText) : []);

function checkCatalog(list, field, add, { extra }) {
  const seen = new Set();
  list.forEach((item, i) => {
    const at = `${field}[${i}]`;
    if (!isObject(item)) return add(at, 'must be an object');
    if (!isText(item.id)) add(`${at}.id`, `must be text, got ${show(item.id)}`);
    else if (seen.has(item.id)) add(`${at}.id`, `${show(item.id)} is listed twice`);
    else seen.add(item.id);
    if (!isPrice(item.price)) add(`${at}.price`, `must be a number ≥ 0, got ${show(item.price)}`);
    if (!isTexts(item.name)) add(`${at}.name`, 'must be { "el": text, "en": text }');
    extra?.(item, at);
  });
}

export function validateBrand(brand) {
  const errors = [];
  const add = (field, problem) => errors.push(`${field}: ${problem}`);
  if (!Array.isArray(brand.packages) || brand.packages.length === 0) {
    add('packages', 'must list at least one package');
  } else {
    checkCatalog(brand.packages, 'packages', add, {
      extra: (p, at) => { if (!isTextLists(p.includes)) add(`${at}.includes`, 'must be { "el": [text], "en": [text] }'); },
    });
  }
  if (!Array.isArray(brand.addons)) add('addons', 'must be a list (may be empty)');
  else checkCatalog(brand.addons, 'addons', add, {});
  if (!isTextLists(brand.terms)) add('terms', 'must be { "el": [text], "en": [text] }');
  return errors;
}

function checkAddonList(list, field, brandAddons, add) {
  if (!Array.isArray(list)) return add(field, 'must be a list');
  const seen = new Set();
  list.forEach((a, i) => {
    if (!isText(a) || !brandAddons.has(a)) add(`${field}[${i}]`, `unknown addon ${show(a)}`);
    else if (seen.has(a)) add(`${field}[${i}]`, `${show(a)} is listed twice`);
    seen.add(a);
  });
}

// Returns "<field>: <problem>"; core prefixes the file name.
export function validate(offer, brand) {
  const errors = [];
  const add = (field, problem) => errors.push(`${field}: ${problem}`);
  const brandPackages = idsOf(brand.packages);
  const brandAddons = idsOf(brand.addons);

  if (!isObject(offer.client)) {
    add('client', 'must be { names, email, phone }');
  } else {
    if (!isText(offer.client.names)) add('client.names', 'is required');
    for (const key of ['email', 'phone']) {
      if (offer.client[key] !== undefined && typeof offer.client[key] !== 'string') add(`client.${key}`, `must be text, got ${show(offer.client[key])}`);
    }
  }

  if (!LANGUAGES.includes(offer.language)) add('language', `must be "el" or "en", got ${show(offer.language)}`);
  if (!statuses.includes(offer.status)) add('status', `must be one of ${statuses.join('|')}, got ${show(offer.status)}`);

  if (!isObject(offer.event)) {
    add('event', 'must be { type, date, venue }');
  } else {
    if (!isText(offer.event.type)) add('event.type', 'is required');
    if (offer.event.date === null) {
      if (offer.status !== 'draft') add('event.date', 'may be empty only while status is "draft"');
    } else if (!isDate(offer.event.date)) {
      add('event.date', `must be a real date YYYY-MM-DD, got ${show(offer.event.date)}`);
    }
  }

  if (Array.isArray(offer.photos) && offer.photos.length === 0 && isObject(offer.event) && isText(offer.event.type)) {
    const type = offer.event.type;
    const tagged = Array.isArray(brand.portfolio) && brand.portfolio.some((p) => Array.isArray(p?.types) && p.types.includes(type));
    if (!tagged) add('photos', `is empty and no brand.portfolio photo is tagged ${show(type)}; add photos or tag one`);
  }

  const offerPackages = new Set();
  if (!Array.isArray(offer.packages) || offer.packages.length === 0) {
    add('packages', 'must list at least one package');
  } else {
    offer.packages.forEach((p, i) => {
      const id = isObject(p) ? p.id : undefined;
      if (isObject(p)) {
        for (const key of Object.keys(p)) {
          if (key !== 'id' && key !== 'price') add(`packages[${i}].${key}`, 'unknown field (only "id" and "price" are allowed)');
        }
      }
      if (!isText(id)) return add(`packages[${i}].id`, `must be a package id, got ${show(id)}`);
      if (!brandPackages.has(id)) return add(`packages[${i}].id`, `unknown package ${show(id)}`);
      if (offerPackages.has(id)) add(`packages[${i}].id`, `${show(id)} is listed twice`);
      offerPackages.add(id);
      if (p.price !== undefined && !isPrice(p.price)) add(`packages[${i}].price`, `must be a number ≥ 0, got ${show(p.price)}`);
    });
  }

  if (offer.recommended !== undefined && offer.recommended !== null && !offerPackages.has(offer.recommended)) {
    add('recommended', `${show(offer.recommended)} is not one of this offer's packages`);
  }

  checkAddonList(offer.addons ?? [], 'addons', brandAddons, add);

  if (offer.cover === undefined || offer.cover === null || offer.cover === '') add('cover', 'is required');

  if (!isDate(offer.validUntil)) add('validUntil', `must be a real date YYYY-MM-DD, got ${show(offer.validUntil)}`);

  if (offer.status === 'booked') {
    if (!isObject(offer.booked)) {
      add('booked', 'status is "booked" but booked is empty: set { "package": ..., "addons": [...] }');
    } else {
      if (!offerPackages.has(offer.booked.package)) add('booked.package', `${show(offer.booked.package)} is not one of this offer's packages`);
      checkAddonList(offer.booked.addons ?? [], 'booked.addons', brandAddons, add);
    }
  } else if (offer.booked !== null && offer.booked !== undefined) {
    add('booked', 'must be null unless status is "booked"');
  }

  return errors;
}

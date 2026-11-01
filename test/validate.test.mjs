import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrand, loadOffers } from '../lib/load.mjs';
import { migrate, validateAll, validateBrand, validateOffer } from '../lib/validate.mjs';
import { OK, baseOffer, errorFor, errorMatching, readJson, tempRoot, writeFile } from './helpers.mjs';

const F = 'offers/maria-nikos-k3x9qa.json';
const { brand } = loadBrand(OK);
const check = (patch, root = OK) => validateOffer(baseOffer(patch), brand, root);
const expectError = (errors, field, file = F) =>
  assert.ok(errorFor(errors, file, field), `expected "${file}: ${field}: ..." in ${JSON.stringify(errors, null, 1)}`);

test('the ok fixture validates clean, including IMG_01.JPG and a .JPEG portfolio photo', () => {
  const { offers } = loadOffers(OK);
  assert.deepEqual(validateAll(offers, brand, OK), []);
  assert.deepEqual(check({ photos: ['portfolio:04.JPEG', 'IMG_01.JPG'], cover: 'portfolio:04.JPEG' }), []);
});

test('migrate: schema 1 is identity; other versions throw', () => {
  const raw = readJson(OK, F);
  assert.deepEqual(migrate(raw), raw);
  assert.throws(() => migrate({ ...raw, schema: 2 }), /schema/);
  assert.throws(() => migrate({ ...raw, schema: undefined }), /schema/);
});

test('slug must equal the file name', () => {
  expectError(validateOffer(baseOffer({}, 'offers/other-name-k3x9qa.json'), brand, OK), 'slug', 'offers/other-name-k3x9qa.json');
});

test('slug must match the pattern', () => {
  for (const slug of ['Maria-k3x9qa', 'maria-nikos', 'maria--nikos-k3x9qa', 'maria-nikos-k3x9q']) {
    expectError(validateOffer(baseOffer({ slug }, `offers/${slug}.json`), brand, OK), 'slug', `offers/${slug}.json`);
  }
});

test('unknown package id', () => {
  expectError(check({ packages: [{ id: 'gold' }, { id: 'diamond' }] }), 'packages[1].id');
});

test('empty packages list', () => {
  expectError(check({ packages: [], recommended: null }), 'packages');
});

test('recommended not in the offer packages', () => {
  expectError(check({ packages: [{ id: 'silver' }, { id: 'gold' }], recommended: 'platinum' }), 'recommended');
});

test('recommended may be omitted', () => {
  const offer = baseOffer();
  delete offer.recommended;
  assert.deepEqual(validateOffer(offer, brand, OK), []);
});

test('unknown addon id', () => {
  expectError(check({ addons: ['drone', 'helicopter'] }), 'addons[1]');
});

test('photo listed but missing on disk', () => {
  expectError(check({ photos: ['portfolio:03.jpg', 'nope.jpg'] }), 'photos[1]');
});

test('portfolio photo missing on disk', () => {
  expectError(check({ photos: ['portfolio:03.jpg', 'portfolio:x.jpg'] }), 'photos[1]');
});

test('.heic and .PNG photos are rejected', () => {
  const root = tempRoot();
  writeFile(root, 'photos/maria-nikos-k3x9qa/IMG_02.HEIC', 'x');
  writeFile(root, 'photos/maria-nikos-k3x9qa/shot.PNG', 'x');
  const errors = check({ photos: ['portfolio:03.jpg', 'IMG_02.HEIC', 'shot.PNG'] }, root);
  expectError(errors, 'photos[1]');
  expectError(errors, 'photos[2]');
});

test('photo over 1.5 MB is rejected, exactly 1.5 MB is accepted', () => {
  const root = tempRoot();
  writeFile(root, 'photos/maria-nikos-k3x9qa/big.jpg', Buffer.alloc(1.5 * 1024 * 1024 + 1));
  writeFile(root, 'photos/maria-nikos-k3x9qa/edge.jpg', Buffer.alloc(1.5 * 1024 * 1024));
  const errors = check({ photos: ['portfolio:03.jpg', 'big.jpg', 'edge.jpg'] }, root);
  expectError(errors, 'photos[1]');
  assert.equal(errorFor(errors, F, 'photos[2]'), undefined);
});

const invalidName = (errors, field) =>
  assert.ok(errorMatching(errors, F, field, /invalid file name/), `expected invalid file name at ${field} in ${JSON.stringify(errors)}`);

test('photo names with a slash cannot escape their folder (bare and portfolio:)', () => {
  invalidName(check({ photos: ['portfolio:03.jpg', '../maria-nikos-k3x9qa/01.jpg'] }), 'photos[1]');
  invalidName(check({ photos: ['portfolio:../_portfolio/03.jpg'], cover: 'portfolio:03.jpg' }), 'photos[0]');
});

test('photo name ".." is an invalid name', () => {
  invalidName(check({ photos: ['portfolio:03.jpg', '..'] }), 'photos[1]');
});

test('photo name "." is an invalid name', () => {
  invalidName(check({ photos: ['portfolio:03.jpg', '.'] }), 'photos[1]');
});

test('cover must be a portfolio: entry', () => {
  expectError(check({ cover: '01.jpg' }), 'cover');
});

test('cover must be listed in photos when photos is not empty', () => {
  expectError(check({ photos: ['01.jpg'], cover: 'portfolio:03.jpg' }), 'cover');
});

test('cover is allowed when photos is empty', () => {
  assert.deepEqual(check({ photos: [] }), []);
});

test('cover must be tagged in brand.portfolio', () => {
  const root = tempRoot();
  writeFile(root, 'photos/_portfolio/99.jpg', 'x');
  expectError(check({ photos: ['portfolio:99.jpg'], cover: 'portfolio:99.jpg' }, root), 'cover');
});

test('cover is required', () => {
  expectError(check({ cover: '' }), 'cover');
});

test('status booked requires a booked object', () => {
  expectError(check({ status: 'booked', booked: null }), 'booked');
});

test('booked package must be one of the offer packages; booked set while not booked is an error', () => {
  expectError(check({ status: 'booked', booked: { package: 'diamond', addons: [] } }), 'booked.package');
  expectError(check({ status: 'booked', booked: { package: 'gold', addons: ['helicopter'] } }), 'booked.addons[0]');
  assert.deepEqual(check({ status: 'booked', booked: { package: 'gold', addons: ['drone'] } }), []);
  expectError(check({ status: 'sent', booked: { package: 'gold', addons: [] } }), 'booked');
});

test('unknown status', () => {
  expectError(check({ status: 'won' }), 'status');
});

test('event.date null only with status draft', () => {
  const event = { type: 'wedding', date: null, venue: '' };
  expectError(check({ event, status: 'sent' }), 'event.date');
  assert.deepEqual(check({ event, status: 'draft' }), []);
  expectError(check({ event: { ...event, date: '2027-02-30' } }), 'event.date');
});

test('validUntil must be YYYY-MM-DD', () => {
  expectError(check({ validUntil: '31/12/2026' }), 'validUntil');
  expectError(check({ validUntil: '2026-13-01' }), 'validUntil');
});

test('language must be el or en', () => {
  expectError(check({ language: 'de' }), 'language');
});

test('one bad offer does not hide another offer\'s errors', () => {
  const a = baseOffer({ language: 'de' });
  const b = baseOffer({ slug: 'other-couple-zzzzzz', status: 'won' }, 'offers/other-couple-zzzzzz.json');
  const errors = validateAll([a, b], brand, OK);
  expectError(errors, 'language');
  expectError(errors, 'status', 'offers/other-couple-zzzzzz.json');
});

test('validateBrand: portfolio entry missing on disk, bad extension, bad types', () => {
  const root = tempRoot();
  writeFile(root, 'photos/_portfolio/shot.png', 'x');
  const b = {
    ...brand,
    portfolio: [
      { file: '03.jpg', types: ['wedding'] },
      { file: 'gone.jpg', types: ['wedding'] },
      { file: 'shot.png', types: ['wedding'] },
      { file: '04.JPEG', types: 'baptism' },
    ],
  };
  const errors = validateBrand(b, root);
  const BF = 'brand/brand.json';
  assert.equal(errorFor(errors, BF, 'portfolio[0].file'), undefined);
  expectError(errors, 'portfolio[1].file', BF);
  expectError(errors, 'portfolio[2].file', BF);
  expectError(errors, 'portfolio[3].types', BF);
});

test('validateBrand: unknown vertical; absent vertical defaults to photographer', () => {
  expectError(validateBrand({ ...brand, vertical: 'florist' }, OK), 'vertical', 'brand/brand.json');
  const { vertical, ...noVertical } = brand;
  assert.deepEqual(validateBrand(noVertical, OK), []);
  assert.deepEqual(validateOffer(baseOffer(), noVertical, OK), []);
});

test('validateAll includes brand errors', () => {
  const errors = validateAll([], { ...brand, portfolio: [{ file: 'gone.jpg', types: [] }] }, OK);
  expectError(errors, 'portfolio[0].file', 'brand/brand.json');
});

const BF = 'brand/brand.json';
const brandError = (b, field) => {
  const errors = validateBrand(b, OK);
  const hits = errors.filter((e) => e.startsWith(`${BF}: ${field}: `));
  assert.equal(hits.length, 1, `expected exactly one "${BF}: ${field}: ..." in ${JSON.stringify(errors, null, 1)}`);
  return errors;
};

test('validateBrand: the fixture brand is clean', () => {
  assert.deepEqual(validateBrand(brand, OK), []);
});

test('validateBrand: top-level fields', () => {
  brandError({ ...brand, name: '' }, 'name');
  brandError({ ...brand, name: 5 }, 'name');
  brandError({ ...brand, currency: 1 }, 'currency');
  brandError({ ...brand, whatsapp: 306900000000 }, 'whatsapp');
  brandError({ ...brand, email: null }, 'email');
  brandError({ ...brand, defaultLanguage: 'de' }, 'defaultLanguage');
  brandError({ ...brand, colors: 'red' }, 'colors');
  brandError({ ...brand, colors: { ...brand.colors, accent: 5 } }, 'colors.accent');
  brandError({ ...brand, terms: { el: ['x'] } }, 'terms');
  brandError({ ...brand, terms: { el: ['x'], en: [1] } }, 'terms');
});

test('validateBrand: vertical must be a registry string key, no coercion', () => {
  for (const vertical of [null, ['photographer'], 5, 'florist', 'toString']) {
    brandError({ ...brand, vertical }, 'vertical');
  }
});

test('validateBrand: packages must be a non-empty list, reported once', () => {
  brandError({ ...brand, packages: 'gold' }, 'packages');
  brandError({ ...brand, packages: [] }, 'packages');
});

test('validateBrand: package entries', () => {
  const [p0, p1] = brand.packages;
  brandError({ ...brand, packages: [{ ...p0, id: 5 }, p1] }, 'packages[0].id');
  brandError({ ...brand, packages: [{ ...p0, id: '' }, p1] }, 'packages[0].id');
  brandError({ ...brand, packages: [p0, { ...p1, id: p0.id }] }, 'packages[1].id');
  brandError({ ...brand, packages: [{ ...p0, price: -1 }] }, 'packages[0].price');
  brandError({ ...brand, packages: [{ ...p0, price: '1800' }] }, 'packages[0].price');
  brandError({ ...brand, packages: [{ ...p0, name: 'Gold' }] }, 'packages[0].name');
  brandError({ ...brand, packages: [{ ...p0, name: { el: 'Gold' } }] }, 'packages[0].name');
  brandError({ ...brand, packages: [{ ...p0, includes: { el: ['a'], en: 'b' } }] }, 'packages[0].includes');
  brandError({ ...brand, packages: ['gold'] }, 'packages[0]');
});

test('validateBrand: addons', () => {
  const [a0] = brand.addons;
  brandError({ ...brand, addons: {} }, 'addons');
  assert.deepEqual(validateBrand({ ...brand, addons: [] }, OK), []);
  brandError({ ...brand, addons: [{ ...a0, id: 7 }] }, 'addons[0].id');
  brandError({ ...brand, addons: [a0, { ...a0 }] }, 'addons[1].id');
  brandError({ ...brand, addons: [{ ...a0, price: -5 }] }, 'addons[0].price');
  brandError({ ...brand, addons: [{ ...a0, name: { el: 'x', en: 2 } }] }, 'addons[0].name');
});

test('validateOffer: brand packages/addons not lists does not throw', () => {
  assert.doesNotThrow(() => validateOffer(baseOffer(), { ...brand, packages: 'x', addons: 5 }, OK));
  const errors = validateOffer(baseOffer(), { ...brand, packages: 'x', addons: 5 }, OK);
  expectError(errors, 'packages[0].id');
  expectError(errors, 'addons[0]');
});

test('validateOffer: brand ids that are not strings never match', () => {
  const b = { ...brand, packages: [{ ...brand.packages[0], id: 5 }] };
  expectError(validateOffer(baseOffer({ packages: [{ id: 5 }], recommended: null }), b, OK), 'packages[0].id');
});

test('validateAll: malformed brand still reports offer errors', () => {
  const errors = validateAll([baseOffer({ language: 'de' })], { ...brand, packages: 'x' }, OK);
  expectError(errors, 'packages', BF);
  expectError(errors, 'language');
});

test('validateAll: null brand (failed to load) still reports generic offer errors', () => {
  const errors = validateAll([baseOffer({}, 'offers/other-name-k3x9qa.json')], null, OK);
  expectError(errors, 'slug', 'offers/other-name-k3x9qa.json');
});

test('offer packages and addons must be lists', () => {
  expectError(check({ packages: 'gold', recommended: null }), 'packages');
  expectError(check({ addons: 'drone' }), 'addons');
});

test('offer package entries need a string id', () => {
  expectError(check({ packages: [{}], recommended: null }), 'packages[0].id');
  expectError(check({ packages: ['gold'], recommended: null }), 'packages[0].id');
});

test('duplicate offer package ids', () => {
  expectError(check({ packages: [{ id: 'gold' }, { id: 'gold' }] }), 'packages[1].id');
});

test('offer package price override must be a number >= 0', () => {
  expectError(check({ packages: [{ id: 'gold', price: -1 }] }), 'packages[0].price');
  expectError(check({ packages: [{ id: 'gold', price: '1700' }] }), 'packages[0].price');
  assert.deepEqual(check({ packages: [{ id: 'gold', price: 0 }] }), []);
});

test('duplicate addons, in the offer and in booked.addons', () => {
  expectError(check({ addons: ['drone', 'drone'] }), 'addons[1]');
  expectError(check({ status: 'booked', booked: { package: 'gold', addons: ['drone', 'drone'] } }), 'booked.addons[1]');
});

test('booked.addons must be a list', () => {
  expectError(check({ status: 'booked', booked: { package: 'gold', addons: 'drone' } }), 'booked.addons');
});

test('client must be an object with names', () => {
  expectError(check({ client: null }), 'client');
  expectError(check({ client: { names: '' } }), 'client.names');
  expectError(check({ client: { names: 'A', email: 5 } }), 'client.email');
  expectError(check({ client: { names: 'A', phone: 6900 } }), 'client.phone');
  assert.deepEqual(check({ client: { names: 'A' } }), []);
});

test('photos must be a list; absent says to use []', () => {
  const offer = baseOffer();
  delete offer.photos;
  const errors = validateOffer(offer, brand, OK);
  assert.ok(errorMatching(errors, F, 'photos', /use \[\]/), JSON.stringify(errors));
  expectError(check({ photos: 'portfolio:03.jpg' }), 'photos');
});

test('duplicate photos entries', () => {
  expectError(check({ photos: ['portfolio:03.jpg', '01.jpg', '01.jpg'] }), 'photos[2]');
});

test('empty photos needs a portfolio photo tagged with the event type', () => {
  expectError(check({ photos: [], event: { type: 'portrait', date: '2027-06-14', venue: '' } }), 'photos');
  assert.deepEqual(check({ photos: [], event: { type: 'baptism', date: '2027-06-14', venue: '' } }), []);
});

test('error text shows non-string values as JSON', () => {
  assert.ok(errorMatching(check({ recommended: { a: 1 } }), F, 'recommended', /\{"a":1\}/));
  assert.ok(errorMatching(check({ photos: ['portfolio:03.jpg', { x: 1 }] }), F, 'photos[1]', /\{"x":1\}/));
});

test('stat errors other than not-found report the code', () => {
  const root = tempRoot();
  writeFile(root, 'photos/flat-folder-aaaaaa', 'not a dir');
  const errors = validateOffer(baseOffer({ slug: 'flat-folder-aaaaaa', photos: ['portfolio:03.jpg', '01.jpg'] }, 'offers/flat-folder-aaaaaa.json'), brand, root);
  assert.ok(errorMatching(errors, 'offers/flat-folder-aaaaaa.json', 'photos[1]', /ENOTDIR/), JSON.stringify(errors));
});

test('.JSON offer file: slug compares without the extension case', () => {
  assert.deepEqual(validateOffer(baseOffer({}, 'offers/maria-nikos-k3x9qa.JSON'), brand, OK), []);
});

test('validateAll: the same slug in two files is flagged on both', () => {
  const a = baseOffer({}, 'offers/maria-nikos-k3x9qa.json');
  const b = baseOffer({}, 'offers/maria-nikos-k3x9qa.JSON');
  const errors = validateAll([a, b], brand, OK);
  assert.ok(errorMatching(errors, 'offers/maria-nikos-k3x9qa.json', 'slug', /also used by offers\/maria-nikos-k3x9qa\.JSON/), JSON.stringify(errors));
  assert.ok(errorMatching(errors, 'offers/maria-nikos-k3x9qa.JSON', 'slug', /also used by offers\/maria-nikos-k3x9qa\.json/));
});

test('validateAll: _example.json colliding with a real offer slug is flagged', () => {
  const errors = validateAll([baseOffer(), baseOffer({}, 'offers/_example.json')], brand, OK);
  assert.ok(errorMatching(errors, 'offers/_example.json', 'slug', /also used by/), JSON.stringify(errors));
});

test('a non-string cover is reported once', () => {
  for (const cover of [{}, 5]) {
    const hits = check({ cover }).filter((e) => e.startsWith(`${F}: cover: `));
    assert.equal(hits.length, 1, JSON.stringify(hits));
  }
});

test('photo name with NUL is an invalid name', () => {
  invalidName(check({ photos: ['portfolio:03.jpg', 'a\0.jpg'] }), 'photos[1]');
});

test('validateBrand: offersBaseUrl is an http(s) URL without a trailing slash', () => {
  for (const offersBaseUrl of [undefined, 5, 'offers.studio.gr', 'ftp://x.gr', 'https://offers.studio.gr/']) {
    brandError({ ...brand, offersBaseUrl }, 'offersBaseUrl');
  }
  assert.deepEqual(validateBrand({ ...brand, offersBaseUrl: 'http://localhost:8080' }, OK), []);
});

test('validateBrand: portfolio must be a list without duplicate files', () => {
  for (const portfolio of [null, undefined, {}, 'x']) brandError({ ...brand, portfolio }, 'portfolio');
  brandError({ ...brand, portfolio: [...brand.portfolio, { file: '03.jpg', types: [] }] }, 'portfolio[2].file');
});

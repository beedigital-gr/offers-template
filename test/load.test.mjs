import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBrand, loadOffers } from '../lib/load.mjs';
import { FILE } from '../lib/record.mjs';
import { FIXTURES, OK, readJson, tempRoot, writeFile } from './helpers.mjs';

const BAD = join(FIXTURES, 'bad');
const BOM = '﻿';
const offerJson = (slug) => JSON.stringify({ ...readJson(OK, 'offers/maria-nikos-k3x9qa.json'), slug, photos: [] });

test('loadOffers: trailing comma and comment become errors with file and line; valid offers still load', () => {
  const { offers, errors } = loadOffers(BAD);
  assert.deepEqual(offers.map((o) => o.slug), ['good-one-cccccc']);
  const trailing = errors.find((e) => e.startsWith('offers/trailing-comma-aaaaaa.json: '));
  assert.ok(trailing, `no trailing-comma error in ${JSON.stringify(errors)}`);
  assert.match(trailing, /line 5\b/);
  const comment = errors.find((e) => e.startsWith('offers/with-comment-bbbbbb.json: '));
  assert.ok(comment);
  assert.match(comment, /line 3\b/);
});

test('loadOffers: unsupported schema version is an error, not a throw', () => {
  const { errors } = loadOffers(BAD);
  assert.ok(errors.some((e) => e.startsWith('offers/future-schema-dddddd.json: schema: ')), JSON.stringify(errors));
});

test('loadOffers: README is ignored; _example.json only with includeExample', () => {
  const plain = loadOffers(OK);
  assert.deepEqual(plain.errors, []);
  assert.deepEqual(plain.offers.map((o) => o.slug), ['maria-nikos-k3x9qa']);
  const withExample = loadOffers(OK, { includeExample: true });
  assert.deepEqual(withExample.offers.map((o) => o.slug).sort(), ['example-couple-abc123', 'maria-nikos-k3x9qa']);
});

test('loadOffers: other _-prefixed .json files are errors', () => {
  const root = tempRoot();
  writeFile(root, 'offers/_draft.json', offerJson('draft-one-aaaaaa'));
  const { errors } = loadOffers(root);
  assert.ok(errors.some((e) => e.startsWith('offers/_draft.json: file: ')), JSON.stringify(errors));
});

test('loadOffers: a non-.json file is an error naming it; .gitkeep is fine', () => {
  const root = tempRoot();
  writeFile(root, 'offers/maria.txt', 'x');
  writeFile(root, 'offers/.gitkeep', '');
  const { errors, offers } = loadOffers(root);
  assert.deepEqual(errors.filter((e) => e.startsWith('offers/maria.txt: file: not a .json offer file')).length, 1, JSON.stringify(errors));
  assert.equal(errors.length, 1);
  assert.equal(offers.length, 1);
});

test('loadOffers: .JSON in any case loads', () => {
  const root = tempRoot();
  writeFile(root, 'offers/upper-case-aaaaaa.JSON', offerJson('upper-case-aaaaaa'));
  const { errors, offers } = loadOffers(root);
  assert.deepEqual(errors, []);
  assert.ok(offers.some((o) => o.slug === 'upper-case-aaaaaa'));
});

test('loadOffers: a directory named *.json is an error, not a throw', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'offers', 'folder-aaaaaa.json'));
  const { errors, offers } = loadOffers(root);
  assert.ok(errors.some((e) => e === 'offers/folder-aaaaaa.json: file: EISDIR'), JSON.stringify(errors));
  assert.equal(offers.length, 1);
});

test('loadOffers: a leading BOM is stripped', () => {
  const root = tempRoot();
  writeFile(root, 'offers/bom-file-aaaaaa.json', BOM + offerJson('bom-file-aaaaaa'));
  const { errors, offers } = loadOffers(root);
  assert.deepEqual(errors, []);
  assert.ok(offers.some((o) => o.slug === 'bom-file-aaaaaa'));
});

test('loadOffers: each offer records its file, invisible to JSON', () => {
  const [offer] = loadOffers(OK).offers;
  assert.equal(offer[FILE], 'offers/maria-nikos-k3x9qa.json');
  assert.ok(!JSON.stringify(offer).includes('offers/maria'));
});

test('loadOffers: a non-object JSON value is an error', () => {
  const root = tempRoot();
  writeFile(root, 'offers/array-xxxxxx.json', '[1,2]');
  const { errors, offers } = loadOffers(root);
  assert.ok(errors.some((e) => e.startsWith('offers/array-xxxxxx.json: ')));
  assert.equal(offers.length, 1);
});

test('loadOffers: missing offers/ is an error; empty offers/ is fine', () => {
  const missing = loadOffers(join(FIXTURES, 'nowhere'));
  assert.deepEqual(missing.offers, []);
  assert.equal(missing.errors.length, 1);
  assert.match(missing.errors[0], /^offers\/: directory: /);
  const root = tempRoot();
  const empty = join(root, 'empty');
  mkdirSync(join(empty, 'offers'), { recursive: true });
  assert.deepEqual(loadOffers(empty), { offers: [], errors: [] });
});

test('loadBrand: reads brand.json', () => {
  const { brand, errors } = loadBrand(OK);
  assert.deepEqual(errors, []);
  assert.equal(brand.name, 'Studio Name');
  assert.equal(brand.portfolio.length, 2);
});

test('loadBrand: broken JSON is an error naming the file and line', () => {
  const root = tempRoot();
  writeFile(root, 'brand/brand.json', '{\n  "name": "x",\n}\n');
  const { brand, errors } = loadBrand(root);
  assert.equal(brand, null);
  assert.match(errors[0], /^brand\/brand\.json: line 3\b/);
});

test('loadBrand: missing file and non-object are errors', () => {
  const root = join(tempRoot(), 'empty');
  const missing = loadBrand(root);
  assert.equal(missing.brand, null);
  assert.deepEqual(missing.errors, ['brand/brand.json: file: not found']);
  const r2 = tempRoot();
  writeFile(r2, 'brand/brand.json', '"x"');
  assert.match(loadBrand(r2).errors[0], /^brand\/brand\.json: json: /);
});

test('loadBrand: a leading BOM is stripped', () => {
  const root = tempRoot();
  writeFile(root, 'brand/brand.json', BOM + JSON.stringify(readJson(OK, 'brand/brand.json')));
  const { brand, errors } = loadBrand(root);
  assert.deepEqual(errors, []);
  assert.equal(brand.name, 'Studio Name');
});

test('loadOffers: only README, README.md and README.txt are ignored, not a slug starting with "readme"', () => {
  const root = tempRoot();
  writeFile(root, 'offers/readme-anna-k3x9qb.json', offerJson('readme-anna-k3x9qb'));
  writeFile(root, 'offers/README.md', 'notes');
  writeFile(root, 'offers/readme', 'notes');
  const { offers, errors } = loadOffers(root);
  assert.deepEqual(errors, []);
  assert.ok(offers.some((o) => o.slug === 'readme-anna-k3x9qb'), JSON.stringify(offers.map((o) => o.slug)));
});

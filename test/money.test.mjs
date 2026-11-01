import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrand } from '../lib/load.mjs';
import { formatMoney, packagePrice } from '../lib/money.mjs';
import { OK, baseOffer } from './helpers.mjs';

const { brand } = loadBrand(OK);
const NBSP = ' ';

test('packagePrice: offer override, else brand price', () => {
  const offer = baseOffer();
  assert.equal(packagePrice(offer, brand, 'gold'), 1700);
  assert.equal(packagePrice(offer, brand, 'silver'), 1200);
  assert.equal(packagePrice(offer, brand, 'platinum'), 2400);
});

test('packagePrice: an override of 0 is kept', () => {
  assert.equal(packagePrice(baseOffer({ packages: [{ id: 'gold', price: 0 }] }), brand, 'gold'), 0);
});

test('packagePrice: unknown package throws', () => {
  assert.throws(() => packagePrice(baseOffer(), brand, 'diamond'), /diamond/);
});

test('formatMoney el: "1.700 €" with a non-breaking space before €', () => {
  assert.equal(formatMoney(1700, { currency: 'EUR' }, 'el'), `1.700${NBSP}€`);
  assert.equal(formatMoney(250, { currency: 'EUR' }, 'el'), `250${NBSP}€`);
});

test('formatMoney en: "€1,700"', () => {
  assert.equal(formatMoney(1700, { currency: 'EUR' }, 'en'), '€1,700');
});

test('formatMoney: decimals only when the amount has cents', () => {
  assert.equal(formatMoney(1700.5, { currency: 'EUR' }, 'el'), `1.700,50${NBSP}€`);
  assert.equal(formatMoney(1700.5, { currency: 'EUR' }, 'en'), '€1,700.50');
  assert.equal(formatMoney(0.1 + 0.2, { currency: 'EUR' }, 'en'), '€0.30');
  assert.equal(formatMoney(1700.001, { currency: 'EUR' }, 'en'), '€1,700');
});

test('formatMoney: bad input throws instead of rendering junk', () => {
  assert.throws(() => formatMoney(NaN, brand, 'el'), /amount/);
  assert.throws(() => formatMoney('1700', brand, 'el'), /amount/);
  assert.throws(() => formatMoney(1700, brand, 'de'), /language/);
});

test('packagePrice: a non-number or negative price throws naming slug and package', () => {
  for (const price of ['1700', -1, NaN, Infinity, null]) {
    assert.throws(() => packagePrice(baseOffer({ packages: [{ id: 'gold', price }] }), brand, 'gold'), /maria-nikos-k3x9qa.*gold/, String(price));
  }
  const badBrand = { ...brand, packages: brand.packages.map((p) => (p.id === 'silver' ? { ...p, price: '1200' } : p)) };
  assert.throws(() => packagePrice(baseOffer(), badBrand, 'silver'), /maria-nikos-k3x9qa.*silver/);
  assert.throws(() => packagePrice(baseOffer(), brand, 'diamond'), /maria-nikos-k3x9qa.*diamond/);
});

test('formatMoney: rounds to cents once', () => {
  assert.equal(formatMoney(999.996, { currency: 'EUR' }, 'en'), '€1,000');
  assert.equal(formatMoney(12.344, { currency: 'EUR' }, 'en'), '€12.34');
  assert.equal(formatMoney(0.996, { currency: 'EUR' }, 'en'), '€1');
});

test('formatMoney: negative throws, -0 renders as 0', () => {
  assert.throws(() => formatMoney(-1, { currency: 'EUR' }, 'en'), /amount/);
  assert.throws(() => formatMoney(-0.5, { currency: 'EUR' }, 'en'), /amount/);
  assert.equal(formatMoney(-0, { currency: 'EUR' }, 'en'), '€0');
  assert.equal(formatMoney(-0, { currency: 'EUR' }, 'el'), `0${NBSP}€`);
});

test('formatMoney: bad currency names brand.currency', () => {
  for (const currency of ['EURO', undefined, '']) {
    assert.throws(() => formatMoney(1, { currency }, 'en'), /brand\.currency/, String(currency));
  }
});

test('formatMoney: an amount too large to round throws', () => {
  assert.throws(() => formatMoney(1e308, { currency: 'EUR' }, 'en'), /amount/);
});

test('formatMoney: missing or non-object brand names brand.currency', () => {
  for (const b of [undefined, null, 'EUR', 5]) {
    assert.throws(() => formatMoney(1, b, 'en'), (e) => !(e instanceof TypeError) && /brand\.currency/.test(e.message), String(b));
  }
});

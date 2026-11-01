import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, strings, t } from '../lib/strings.mjs';
import { getVertical } from '../verticals/index.mjs';

const photographer = { vertical: 'photographer' };
const vstrings = getVertical('photographer').strings;

const sameKeys = (set) => assert.deepEqual(Object.keys(set.el).sort(), Object.keys(set.en).sort());
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('core strings: every key exists in el and en, with the same placeholders', () => {
  sameKeys(strings);
  for (const key of Object.keys(strings.el)) assert.deepEqual(placeholders(strings.el[key]), placeholders(strings.en[key]), key);
});

test('photographer strings: every key exists in el and en, with the same placeholders', () => {
  sameKeys(vstrings);
  for (const key of Object.keys(vstrings.el)) assert.deepEqual(placeholders(vstrings.el[key]), placeholders(vstrings.en[key]), key);
});

test('no string is empty', () => {
  for (const set of [strings, vstrings]) for (const lang of ['el', 'en']) {
    for (const [key, s] of Object.entries(set[lang])) assert.ok(typeof s === 'string' && s.trim(), `${lang}.${key}`);
  }
});

test('vertical keys never shadow core keys', () => {
  for (const key of Object.keys(vstrings.el)) assert.ok(!Object.hasOwn(strings.el, key), key);
});

test('t: core key, both languages', () => {
  assert.equal(t('el', 'savePdf'), 'Αποθήκευση ως PDF');
  assert.equal(t('en', 'savePdf'), 'Save as PDF');
});

test('t: fills vars', () => {
  assert.equal(t('en', 'validUntil', { date: '31/12/2026' }), 'Valid until 31/12/2026');
  assert.equal(t('en', 'validUntil', { date: 0 }), 'Valid until 0');
});

test('t: vertical key through the brand', () => {
  const s = t('en', 'bookText', { names: 'Maria & Nikos', package: 'Gold', date: '14/6/2027' }, photographer);
  assert.match(s, /Maria & Nikos/);
  assert.match(s, /Gold/);
  assert.match(s, /14\/6\/2027/);
});

test('t: brand without vertical uses the default (photographer)', () => {
  assert.equal(t('el', 'packagesHeading', {}, {}), vstrings.el.packagesHeading);
});

test('t: vertical key without a brand throws', () => {
  assert.throws(() => t('en', 'bookText', { names: 'a', package: 'b', date: 'c' }), /bookText/);
});

test('t: missing key throws', () => {
  assert.throws(() => t('el', 'noSuchKey'), /noSuchKey/);
});

test('t: missing or empty var throws', () => {
  assert.throws(() => t('en', 'validUntil'), /date/);
  assert.throws(() => t('en', 'validUntil', { date: undefined }), /date/);
  assert.throws(() => t('en', 'validUntil', { date: null }), /date/);
});

test('t: unknown language or vertical throws', () => {
  assert.throws(() => t('de', 'savePdf'), /language/);
  assert.throws(() => t('en', 'savePdf', {}, { vertical: 'florist' }), /florist/);
});

test('t: result never contains "undefined" or a leftover placeholder', () => {
  for (const lang of ['el', 'en']) {
    for (const key of [...Object.keys(strings[lang]), ...Object.keys(vstrings[lang])]) {
      const all = Object.fromEntries(placeholders({ ...strings[lang], ...vstrings[lang] }[key]).map((p) => [p, 'X']));
      const s = t(lang, key, all, photographer);
      assert.ok(!/undefined|\{\w+\}/.test(s), `${lang}.${key}: ${s}`);
    }
  }
});

test('escapeHtml: escapes all five of & < > " \'', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml: Greek, emoji and & in a client name', () => {
  assert.equal(escapeHtml('Μαρία & Νίκος 💍 <3 "Ο\'Νίκος"'), 'Μαρία &amp; Νίκος 💍 &lt;3 &quot;Ο&#39;Νίκος&quot;');
});

test('escapeHtml: escapes an already-escaped string again', () => {
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml: numbers pass, null/undefined throw', () => {
  assert.equal(escapeHtml(1700), '1700');
  assert.throws(() => escapeHtml(undefined), TypeError);
  assert.throws(() => escapeHtml(null), TypeError);
  assert.throws(() => escapeHtml({}), TypeError);
});

test('t: a var must be non-empty text or a finite number', () => {
  for (const date of ['', false, true, NaN, Infinity, {}, [], () => 'x']) {
    assert.throws(() => t('en', 'validUntil', { date }), /date/, String(date));
  }
});

test('t: Greek recommended label', () => {
  assert.equal(t('el', 'recommended'), 'Προτεινόμενο');
});

test('escapeHtml: non-finite numbers throw', () => {
  for (const n of [NaN, Infinity, -Infinity]) assert.throws(() => escapeHtml(n), TypeError);
});

test('t: vars null is treated as no vars', () => {
  assert.equal(t('en', 'savePdf', null), 'Save as PDF');
  assert.throws(() => t('en', 'validUntil', null), (e) => !(e instanceof TypeError) && /date/.test(e.message));
});

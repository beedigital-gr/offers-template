import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { renderOffer, photosFor, photoOutputName, formatDate } from '../lib/render-offer.mjs';
import { recommendedId } from '../verticals/photographer/render.mjs';
import { getVertical } from '../verticals/index.mjs';
import { mailtoLink, whatsappLink } from '../lib/links.mjs';
import { escapeHtml, strings, t } from '../lib/strings.mjs';
import { validateBrand } from '../lib/validate.mjs';
import { OK, baseOffer, readJson } from './helpers.mjs';

const brand = readJson(OK, 'brand/brand.json');
const offer = () => baseOffer();
const english = () => baseOffer({ language: 'en' });
const emailOnly = { ...brand, whatsapp: '' };
const emptyPhotos = () => baseOffer({ photos: [], event: { type: 'baptism', date: '2027-06-14', venue: 'Agia Pelagia' } });

const FORBIDDEN = /\bnull\b|\bundefined\b|NaN|\[object Object\]|href=""|src=""/;
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const bookHrefs = (html) => [...html.matchAll(/<a class="[^"]*\bbook\b[^"]*" href="([^"]*)"/g)].map((m) => m[1]);
const render = (...args) => {
  const html = renderOffer(...args);
  const m = FORBIDDEN.exec(html);
  assert.equal(m, null, m && `found ${m[0]} near ${html.slice(m.index - 60, m.index + 20)}`);
  return html;
};
const SLUG = '/maria-nikos-k3x9qa/photos/';
const meta = (html, prop) => unescape(new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1] ?? '');

test('head: og:title, og:image, robots, lang', () => {
  const html = render(offer(), brand);
  assert.equal(meta(html, 'og:title'), 'Maria & Nikos');
  assert.equal(meta(html, 'og:image'), 'https://offers.studio.gr/maria-nikos-k3x9qa/photos/p-03.jpg');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<html lang="el">/);
  assert.match(html, /href="\/_assets\/offer\.css"/);
  assert.match(html, /src="\/_assets\/offer\.js"/);
});

test('head: brand colours become CSS custom properties', () => {
  const html = render(offer(), brand);
  assert.match(html, /--bg:\s*#f6f2ec/);
  assert.match(html, /--ink:\s*#1d1b19/);
  assert.match(html, /--accent:\s*#9a6b3f/);
});

test('a colour that is not a hex value never reaches the page', () => {
  const evil = { ...brand, colors: { ...brand.colors, bg: 'red;}</style><script>alert(1)</script>' } };
  assert.throws(() => render(offer(), evil), /colors\.bg/);
  assert.ok(validateBrand(evil, OK).some((e) => e.startsWith('brand/brand.json: colors.bg: ')));
  assert.deepEqual(validateBrand({ ...brand, colors: { bg: '#FFF', ink: '#000000', accent: '#9a6b3f' } }, OK), []);
});

test('body carries data-valid-until', () => {
  assert.match(render(offer(), brand), /<body[^>]* data-valid-until="2026-12-31"/);
});

test('each package has one WhatsApp Book link with package and date prefilled, plus a mailto fallback', () => {
  const o = offer();
  const html = render(o, brand);
  const date = formatDate('2027-06-14', 'el');
  const links = hrefs(html).map(unescape);
  for (const p of o.packages) {
    const name = brand.packages.find((b) => b.id === p.id).name.el;
    const vars = { names: o.client.names, package: name, date };
    const wa = whatsappLink(brand.whatsapp, t('el', 'bookText', vars, brand));
    const mail = mailtoLink(brand.email, t('el', 'bookSubject', vars, brand), t('el', 'bookText', vars, brand));
    assert.equal(links.filter((h) => h === wa).length, 1, `whatsapp ${p.id}`);
    assert.equal(links.filter((h) => h === mail).length, 1, `mailto ${p.id}`);
  }
});

test('every href and src in the page is HTML-escaped', () => {
  const html = render(offer(), brand);
  for (const h of hrefs(html)) assert.doesNotMatch(h, /[<>"]|&(?!amp;|quot;|#39;|lt;|gt;)/, h);
});

test('brand with only email: no WhatsApp link, mailto Book links instead', () => {
  const html = render(offer(), emailOnly);
  assert.ok(!html.includes('wa.me'));
  assert.deepEqual(bookHrefs(html).map((h) => h.slice(0, 7)), ['mailto:', 'mailto:', 'mailto:']);
});

test('brand with only WhatsApp: no mailto link', () => {
  const html = render(offer(), { ...brand, email: '' });
  assert.ok(!html.includes('mailto:'));
  assert.deepEqual(bookHrefs(html).map((h) => h.slice(0, 14)), Array(3).fill('https://wa.me/'));
});

test('client names with &, quotes, < and emoji appear only escaped', () => {
  const names = 'Μαρία & "Νίκος" <3 💍';
  const html = render(baseOffer({ client: { names, email: '', phone: '' } }), brand);
  assert.ok(html.includes(escapeHtml(names)));
  assert.ok(!html.includes(names));
  assert.ok(!html.includes('"Νίκος"'));
  assert.ok(!html.includes('<3'));
  assert.equal(meta(html, 'og:title'), names);
  const wa = hrefs(html).map(unescape).find((h) => h.startsWith('https://wa.me/'));
  assert.ok(decodeURIComponent(new URL(wa).searchParams.get('text')).includes(names));
});

test('notes never appear', () => {
  const secret = 'PRIVATE-NOTE-shh-42';
  assert.ok(!render(baseOffer({ notes: secret }), brand).includes(secret));
});

test('English offer uses the English strings', () => {
  const html = render(english(), brand);
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes(escapeHtml(strings.en.termsHeading)));
  assert.ok(!html.includes(escapeHtml(strings.el.termsHeading)));
  assert.ok(html.includes('6 hours'));
  assert.ok(html.includes('€1,700'));
});

test('Greek offer shows Greek prices, terms and VAT line', () => {
  const html = render(offer(), brand);
  assert.ok(html.includes(escapeHtml('1.700 €')));
  assert.ok(html.includes('Προκαταβολή 30%'));
  assert.ok(html.includes(strings.el.vatIncluded));
});

test('recommended package is marked; defaults to the middle listed package', () => {
  const o = offer();
  delete o.recommended;
  assert.equal(recommendedId(o), 'gold');
  assert.equal(recommendedId(baseOffer({ packages: [{ id: 'silver' }, { id: 'gold' }], recommended: undefined })), 'silver');
  assert.equal(recommendedId(baseOffer({ recommended: 'platinum' })), 'platinum');
  const html = render(o, brand);
  assert.equal((html.match(/data-recommended/g) ?? []).length, 1);
  assert.match(html, /<article[^>]*data-package="gold"[^>]*data-recommended/);
  assert.ok(html.includes(strings.el.recommended));
});

test('photoOutputName: portfolio and client photos never share a name', () => {
  assert.equal(photoOutputName('portfolio:03.jpg'), 'p-03.jpg');
  assert.equal(photoOutputName('01.jpg'), 'c-01.jpg');
  assert.notEqual(photoOutputName('portfolio:03.jpg'), photoOutputName('p-03.jpg'));
  assert.throws(() => photoOutputName(''), /photo/);
});

test('photosFor: the listed photos, cover first, no repeats', () => {
  assert.deepEqual(photosFor(offer(), brand), ['portfolio:03.jpg', '01.jpg', 'IMG_01.JPG']);
});

test('photosFor: empty list → brand portfolio tagged with the event type, cover first', () => {
  assert.deepEqual(photosFor(emptyPhotos(), brand), ['portfolio:03.jpg', 'portfolio:04.JPEG']);
  assert.deepEqual(photosFor(baseOffer({ photos: [] }), brand), ['portfolio:03.jpg']);
});

test('photos: cover eager with high priority, grid lazy, all root-relative /<slug>/photos/<name>', () => {
  const html = render(offer(), brand);
  const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, 3);
  assert.match(imgs[0], /src="\/maria-nikos-k3x9qa\/photos\/p-03\.jpg"/);
  assert.match(imgs[0], /fetchpriority="high"/);
  assert.doesNotMatch(imgs[0], /loading="lazy"/);
  for (const img of imgs.slice(1)) assert.match(img, /loading="lazy"/);
  assert.ok(imgs.some((i) => i.includes('src="/maria-nikos-k3x9qa/photos/c-IMG_01.JPG"')));
  for (const img of imgs) assert.doesNotMatch(img, /\b(width|height)=/);
});

test('photo file names are URL-encoded in src', () => {
  const html = render(baseOffer({ photos: ['portfolio:03.jpg', 'my photo#1.jpg'] }), brand);
  assert.ok(html.includes('src="/maria-nikos-k3x9qa/photos/c-my%20photo%231.jpg"'));
});

test('empty photos list shows the tagged portfolio; no empty grid when only the cover is left', () => {
  const html = render(emptyPhotos(), brand);
  assert.ok(html.includes('src="/maria-nikos-k3x9qa/photos/p-04.JPEG"'));
  assert.doesNotMatch(render(baseOffer({ photos: [] }), brand), /class="grid"/);
});

test('message: shown when set, as escaped paragraphs; absent when empty', () => {
  const html = render(baseOffer({ message: 'Line <one>\n\nLine two' }), brand);
  assert.ok(html.includes('<p>Line &lt;one&gt;</p>'));
  assert.ok(html.includes('<p>Line two</p>'));
  assert.doesNotMatch(render(offer(), brand), /class="letter"/);
});

test('deposit button for an https link; empty means none; anything else throws', () => {
  const link = 'https://buy.stripe.com/test_abc?x=1&y=2';
  const html = render(baseOffer({ depositLink: link }), brand);
  assert.ok(html.includes(`href="${escapeHtml(link)}"`));
  assert.ok(html.includes(t('el', 'depositButton', {}, brand)));
  for (const none of ['', undefined]) assert.ok(!render(baseOffer({ depositLink: none }), brand).includes('class="deposit"'));
  for (const bad of ['javascript:alert(1)', 'http://x.test', 'https://x.test/a b', 5]) {
    assert.throws(() => renderOffer(baseOffer({ depositLink: bad }), brand), /depositLink/, String(bad));
  }
});

test('expired banner and Save-as-PDF button are in the page, hidden until offer.js runs', () => {
  const html = render(offer(), brand);
  assert.match(html, /<div class="expired" role="status" hidden>/);
  assert.ok(html.includes(escapeHtml(t('el', 'expired', { date: formatDate('2026-12-31', 'el') }))));
  assert.match(html, /<button type="button" class="save-pdf" hidden>/);
});

test('draft without an event date renders without a date', () => {
  const html = render(baseOffer({ status: 'draft', event: { type: 'wedding', date: null, venue: '' } }), brand);
  const names = 'Maria & Nikos';
  const vars = { names, package: 'Gold' };
  const links = hrefs(html).map(unescape);
  assert.ok(links.includes(whatsappLink(brand.whatsapp, t('el', 'bookTextNoDate', vars, brand))));
  assert.ok(links.includes(mailtoLink(brand.email, t('el', 'bookSubjectNoDate', vars, brand), t('el', 'bookTextNoDate', vars, brand))));
});

test('add-ons offered are listed with prices', () => {
  const html = render(offer(), brand);
  assert.ok(html.includes(strings.el.addonsHeading));
  assert.ok(html.includes('Drone'));
  assert.ok(html.includes(escapeHtml('250 €')));
  assert.ok(!html.includes('Άλμπουμ'));
  assert.doesNotMatch(render(baseOffer({ addons: [] }), brand), /class="addons"/);
});

test('rendered output never contains null, undefined, NaN, [object Object] or empty href/src', () => {
  const cases = {
    fixture: render(offer(), brand),
    english: render(english(), brand),
    emailOnly: render(offer(), emailOnly),
    emptyPhotos: render(emptyPhotos(), brand),
    noVenue: render(baseOffer({ event: { type: 'wedding', date: '2027-06-14' } }), brand),
    vatExcluded: render(offer(), { ...brand, pricesIncludeVat: false }),
  };
  for (const [name, html] of Object.entries(cases)) {
    const m = FORBIDDEN.exec(html);
    assert.equal(m, null, `${name}: found ${m?.[0]} near ${m && html.slice(m.index - 60, m.index + 20)}`);
  }
});

test('the vertical module exposes renderPage and photosFor', () => {
  const v = getVertical('photographer');
  assert.equal(typeof v.renderPage, 'function');
  assert.equal(typeof v.photosFor, 'function');
});

function runOfferJs(validUntil, today) {
  const banner = { hidden: true };
  const button = { hidden: true, listeners: [], addEventListener(type, fn) { this.listeners.push([type, fn]); } };
  const classes = new Set();
  const printed = [];
  const RealDate = Date;
  const context = {
    document: {
      body: { dataset: { validUntil }, classList: { add: (c) => classes.add(c) } },
      querySelector: (s) => (s === '.expired' ? banner : null),
      querySelectorAll: (s) => (s === '.save-pdf' ? [button] : []),
    },
    window: { print: () => printed.push(1) },
    Date: class extends RealDate { constructor(...a) { super(...(a.length ? a : [today])); } },
    String,
  };
  vm.runInNewContext(readFileSync(new URL('../templates/offer.js', import.meta.url), 'utf8'), context);
  return { banner, button, classes, printed };
}

test('offer.js: past valid-until shows the banner and hides Book via body class', () => {
  const r = runOfferJs('2026-12-31', '2027-01-01T10:00:00');
  assert.equal(r.banner.hidden, false);
  assert.ok(r.classes.has('is-expired'));
});

test('offer.js: on the last valid day nothing changes; Save as PDF prints', () => {
  const r = runOfferJs('2026-12-31', '2026-12-31T23:30:00');
  assert.equal(r.banner.hidden, true);
  assert.equal(r.classes.size, 0);
  assert.equal(r.button.hidden, false);
  r.button.listeners.find(([type]) => type === 'click')[1]();
  assert.equal(r.printed.length, 1);
});

test('offer.css: expired pages hide the Book actions; print hides every button', () => {
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8');
  assert.match(css, /\.is-expired \.actions, \.is-expired \.deposit\s*\{\s*display:\s*none/);
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /\.btn, \.book, \.actions, button, \.save-pdf, \.deposit \{ display: none !important; \}/);
  assert.match(print, /print-color-adjust: exact/);
});

const expiredEl = /<body[^>]*class="is-expired"/;

test('English Book links: English text, subject, package name and date', () => {
  const o = english();
  const html = render(o, brand);
  const date = formatDate('2027-06-14', 'en');
  assert.equal(date, '14 June 2027');
  const links = hrefs(html).map(unescape);
  for (const p of o.packages) {
    const name = brand.packages.find((b) => b.id === p.id).name.en;
    const vars = { names: o.client.names, package: name, date };
    assert.ok(links.includes(whatsappLink(brand.whatsapp, t('en', 'bookText', vars, brand))), p.id);
    assert.ok(links.includes(mailtoLink(brand.email, t('en', 'bookSubject', vars, brand), t('en', 'bookText', vars, brand))), p.id);
  }
  assert.ok(html.includes('Drone'));
  assert.ok(html.includes('+€250'));
  assert.ok(html.includes(strings.en.addonsHeading));
});

test('Book links: accessible name carries the package (visible text first)', () => {
  const html = render(offer(), brand);
  for (const pkg of ['Silver', 'Gold', 'Platinum']) {
    const forPkg = escapeHtml(t('el', 'forPackage', { package: pkg }, brand));
    const wa = `${escapeHtml(t('el', 'bookByWhatsapp', {}, brand))}<span class="vh"> ${forPkg}</span></a>`;
    const mail = `${escapeHtml(t('el', 'bookOrEmail', {}, brand))}<span class="vh"> ${forPkg}</span></a>`;
    assert.ok(html.includes(wa), `whatsapp ${pkg}`);
    assert.ok(html.includes(mail), `email ${pkg}`);
  }
});

test('no WhatsApp and no email: throws naming both fields', () => {
  assert.throws(() => renderOffer(offer(), { ...brand, whatsapp: '', email: '' }), /brand\.whatsapp.*brand\.email|brand\.email.*brand\.whatsapp/);
});

test('recommended: unknown id throws; absent keeps the middle default', () => {
  assert.throws(() => renderOffer(baseOffer({ recommended: 'diamond' }), brand), /recommended.*diamond/);
  assert.throws(() => recommendedId(baseOffer({ recommended: 'diamond' })), /diamond/);
  assert.match(render(baseOffer({ recommended: undefined }), brand), /data-package="gold" data-recommended/);
});

test('photosFor: a portfolio entry missing from brand.portfolio throws (cover included)', () => {
  assert.throws(() => photosFor(baseOffer({ photos: ['portfolio:03.jpg', 'portfolio:nope.jpg'] }), brand), /portfolio:nope\.jpg/);
  assert.throws(() => photosFor(baseOffer({ cover: 'portfolio:gone.jpg' }), brand), /portfolio:gone\.jpg/);
  assert.throws(() => renderOffer(baseOffer({ cover: 'portfolio:gone.jpg', photos: [] }), brand), /gone\.jpg/);
});

test('package or addon id missing from the brand: explicit error naming slug and id', () => {
  assert.throws(() => renderOffer(baseOffer({ packages: [{ id: 'silver' }, { id: 'ghost', price: 10 }], recommended: 'silver' }), brand),
    (e) => !(e instanceof TypeError) && /maria-nikos-k3x9qa/.test(e.message) && /ghost/.test(e.message));
  assert.throws(() => renderOffer(baseOffer({ addons: ['jetski'] }), brand),
    (e) => !(e instanceof TypeError) && /maria-nikos-k3x9qa/.test(e.message) && /jetski/.test(e.message));
});

test('pricesIncludeVat must be a boolean (validation and render)', () => {
  for (const v of [undefined, 'yes', 1, null]) {
    assert.ok(validateBrand({ ...brand, pricesIncludeVat: v }, OK).some((e) => e.startsWith('brand/brand.json: pricesIncludeVat: ')), String(v));
    assert.throws(() => renderOffer(offer(), { ...brand, pricesIncludeVat: v }), /pricesIncludeVat/);
  }
});

test('depositLink validation: empty or an https URL without spaces', () => {
  const v = getVertical('photographer');
  const errs = (depositLink) => v.validate(baseOffer({ depositLink }), brand).filter((e) => e.startsWith('depositLink: '));
  for (const ok of ['', undefined, 'https://buy.stripe.com/test_abc']) assert.deepEqual(errs(ok), [], String(ok));
  for (const bad of ['http://x.test', 'javascript:alert(1)', 'https://x.test/a b', 'https://', 5, null]) assert.equal(errs(bad).length, 1, String(bad));
});

test('formatDate rejects impossible dates', () => {
  assert.throws(() => formatDate('2026-02-31', 'el'), /2026-02-31/);
  assert.throws(() => formatDate('2026-13-01', 'en'), /2026-13-01/);
  assert.equal(formatDate('2028-02-29', 'en'), '29 February 2028');
});

test('built after validUntil: page is already expired, no Book or deposit links', () => {
  const o = baseOffer({ depositLink: 'https://buy.stripe.com/test_abc' });
  const html = render(o, brand, { today: '2027-01-01' });
  assert.match(html, expiredEl);
  assert.match(html, /<div class="expired" role="status">/);
  assert.deepEqual(bookHrefs(html), []);
  assert.ok(!html.includes('buy.stripe.com'));
  assert.ok(!html.includes('class="actions"'));
  assert.ok(html.includes('wa.me'), 'contact footer still reachable');
});

test('built on the last valid day or without today: not expired', () => {
  for (const opts of [{ today: '2026-12-31' }, {}, undefined]) {
    const html = render(offer(), brand, opts);
    assert.doesNotMatch(html, expiredEl);
    assert.match(html, /<div class="expired" role="status" hidden>/);
    assert.equal(bookHrefs(html).length, 6);
  }
  assert.throws(() => renderOffer(offer(), brand, { today: '1/1/2027' }), /today/);
});

test('og:image uses the cover output name, even for an odd file name', () => {
  const html = render(baseOffer({ cover: 'portfolio:03.jpg', photos: ['portfolio:03.jpg', 'my photo#1.jpg'] }), brand);
  assert.equal(meta(html, 'og:image'), 'https://offers.studio.gr/maria-nikos-k3x9qa/photos/p-03.jpg');
  assert.equal(photoOutputName('my photo#1.jpg'), 'c-my photo#1.jpg');
  const odd = { ...brand, portfolio: [...brand.portfolio, { file: 'Ζ & "x".jpg', types: ['wedding'] }] };
  const html2 = render(baseOffer({ cover: 'portfolio:Ζ & "x".jpg', photos: [] }), odd);
  assert.equal(meta(html2, 'og:image'), `https://offers.studio.gr/maria-nikos-k3x9qa/photos/${encodeURIComponent('p-Ζ & "x".jpg')}`);
});

test('client email and phone never appear in the page', () => {
  const html = render(baseOffer({ client: { names: 'Maria & Nikos', email: 'maria.private@example.com', phone: '+30 699 111 2233' } }), brand);
  assert.ok(!html.includes('maria.private'));
  assert.ok(!html.includes('699 111'));
  assert.ok(!html.includes('699111'));
});

test('validateBrand: contrast ink/bg ≥ 4.5 and accent/bg ≥ 3, both sides of each threshold', () => {
  const bad = (colors, field) => validateBrand({ ...brand, colors }, OK).some((e) => e.startsWith(`brand/brand.json: ${field}: `));
  assert.deepEqual(validateBrand(brand, OK), []);
  // #767676 on white = 4.54, #777777 on white = 4.48
  assert.equal(bad({ bg: '#ffffff', ink: '#767676', accent: '#000000' }, 'colors.ink'), false);
  assert.equal(bad({ bg: '#ffffff', ink: '#777777', accent: '#000000' }, 'colors.ink'), true);
  // #949494 on white = 3.03, #959595 on white = 2.99
  assert.equal(bad({ bg: '#ffffff', ink: '#000000', accent: '#949494' }, 'colors.accent'), false);
  assert.equal(bad({ bg: '#ffffff', ink: '#000000', accent: '#959595' }, 'colors.accent'), true);
  assert.equal(bad({ bg: '#111111', ink: '#ffffff', accent: '#c9a27a' }, 'colors.ink'), false);
});

test('offer.css: print forces dark-on-white colours and display headings wrap', () => {
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8');
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /html:root\s*\{[^}]*--bg:\s*#fff(fff)?;[^}]*--ink:\s*#1a1a1a;[^}]*--accent:\s*#1a1a1a;/);
  assert.match(css, /\.names, h2, h3, \.studio\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*hyphens:\s*auto;/);
  assert.match(css, /url\(fonts\/gfs-didot-greek-400-normal\.woff2\)/);
});

test('core strings no longer carry the unused bookButton key', () => {
  assert.ok(!Object.hasOwn(strings.el, 'bookButton'));
  assert.ok(!Object.hasOwn(strings.en, 'bookButton'));
});

test('galleryRows: every count fills its rows (no half-empty row)', async () => {
  const { galleryRows } = await import('../verticals/photographer/render.mjs');
  const size = { solo: 1, pair: 2, trio: 3 };
  const expected = { 0: [], 1: ['solo'], 2: ['pair'], 3: ['trio'], 4: ['pair', 'pair'], 5: ['trio', 'pair'], 6: ['trio', 'trio'], 7: ['trio', 'pair', 'pair'] };
  for (const [n, rows] of Object.entries(expected)) assert.deepEqual(galleryRows(Number(n)), rows, `count ${n}`);
  for (let n = 2; n <= 40; n++) {
    const rows = galleryRows(n);
    assert.equal(rows.reduce((s, r) => s + size[r], 0), n, `count ${n}`);
    assert.ok(!rows.includes('solo'), `count ${n} never needs a solo`);
  }
  for (const bad of [-1, 1.5, NaN, '3']) assert.throws(() => galleryRows(bad), /galleryRows/);
});

test('gallery markup: rows per photo count, alternate rows flipped, every photo once', () => {
  const photos = (n) => ['portfolio:03.jpg', ...Array.from({ length: n }, (_, i) => `x${i}.jpg`)];
  const grid = (n) => /<section class="grid" data-count="(\d+)" data-rows="([^"]*)">/.exec(render(baseOffer({ photos: photos(n) }), brand));
  assert.deepEqual(grid(1).slice(1), ['1', 'solo']);
  assert.deepEqual(grid(2).slice(1), ['2', 'pair']);
  assert.deepEqual(grid(5).slice(1), ['5', 'trio pair']);
  const html = render(baseOffer({ photos: photos(5) }), brand);
  assert.match(html, /<div class="row row-trio"><figure>(?:(?!<\/div>).)*<\/div><div class="row row-pair is-flipped">/);
  for (let i = 0; i < 5; i++) assert.equal(html.split(`c-x${i}.jpg`).length - 1, 1, `x${i}`);
});

test('names: the joining word is set apart; other names are left alone', () => {
  assert.match(render(offer(), brand), /<h1 class="names">Maria <span class="amp">&amp;<\/span> Nikos<\/h1>/);
  const kai = render(baseOffer({ client: { names: 'Ελένη και Κώστας', email: '', phone: '' } }), brand);
  assert.match(kai, /<h1 class="names">Ελένη <span class="amp">και<\/span> Κώστας<\/h1>/);
  assert.match(render(baseOffer({ client: { names: 'Alexandra', email: '', phone: '' } }), brand), /<h1 class="names">Alexandra<\/h1>/);
});

test('packages: the recommended one comes first with the filled button; the others get the quiet one', () => {
  const html = render(offer(), brand);
  const order = [...html.matchAll(/<article [^>]*data-package="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['gold', 'silver', 'platinum']);
  const gold = html.slice(html.indexOf('data-package="gold"'), html.indexOf('data-package="silver"'));
  assert.match(gold, /<a class="btn book" href="https:\/\/wa\.me\//);
  const silver = html.slice(html.indexOf('data-package="silver"'));
  assert.match(silver, /<a class="btn btn-quiet book" href="https:\/\/wa\.me\//);
  const single = render(baseOffer({ packages: [{ id: 'gold' }], recommended: 'gold' }), brand);
  assert.doesNotMatch(single, /class="others"/);
});

test('phone dock links to the packages and is left out of an expired page', () => {
  const html = render(offer(), brand);
  assert.ok(html.includes(`<div class="dock"><a class="btn" href="#packages">${escapeHtml(t('el', 'seePackages', {}, brand))}</a></div>`));
  assert.match(html, /<section class="packages" id="packages"/);
  assert.doesNotMatch(render(offer(), brand, { today: '2027-01-01' }), /class="dock"/);
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8');
  assert.match(css, /\.is-expired \.dock \{ display: none; \}/);
  assert.match(css.slice(css.indexOf('@media print')), /\.dock \{ display: none !important; \}/);
});

test('derived palette: every text colour stays ≥ 4.5:1 on its surface, for edge-case brands too', async () => {
  const { contrastRatio, derivePalette } = await import('../lib/page.mjs');
  const brands = [
    brand.colors,
    { bg: '#ffffff', ink: '#767676', accent: '#000000' },
    { bg: '#111111', ink: '#ffffff', accent: '#c9a27a' },
    { bg: '#fff', ink: '#000', accent: '#949494' },
    { bg: '#0b2a3a', ink: '#f4efe6', accent: '#e0b15c' },
  ];
  for (const c of brands) {
    const d = derivePalette(c);
    const label = JSON.stringify(c);
    assert.ok(contrastRatio(c.ink, d.tint) >= 4.5, `ink on tint ${label}`);
    assert.ok(contrastRatio(d.muted, c.bg) >= 4.5, `muted on bg ${label}`);
    assert.ok(contrastRatio(d.muted, d.tint) >= 4.5, `muted on tint ${label}`);
    assert.ok(contrastRatio(d.mutedOnInk, c.ink) >= 4.5, `muted on ink ${label}`);
    assert.ok(contrastRatio(d.light, d.shade) >= 4.5, `names on the cover scrim ${label}`);
  }
});

test('head: the inline :root block carries the derived colours', () => {
  const html = render(offer(), brand);
  for (const v of ['--tint', '--muted', '--muted-on-ink', '--line', '--shade', '--light']) assert.match(html, new RegExp(`${v}:#[0-9a-f]{6}[;}]`), v);
});

test('derivePalette/paletteStyle: malformed or missing colours throw naming the field; nothing reaches the <style>', async () => {
  const { derivePalette, mixHex, paletteStyle } = await import('../lib/page.mjs');
  const ok = { bg: '#ffffff', ink: '#000000', accent: '#9a6b3f' };
  const cases = [
    ['accent', '#ffgggg'], ['bg', 'white'], ['ink', '#12345'], ['accent', undefined],
    ['accent', '#c00;}body{x:y'], ['bg', '#fff;}</style><script>alert(1)</script>'],
  ];
  for (const [key, value] of cases) {
    const colors = { ...ok, [key]: value };
    for (const fn of [derivePalette, paletteStyle]) {
      assert.throws(() => fn(colors), (e) => !(e instanceof TypeError) && e.message.startsWith(`brand/brand.json: colors.${key}: `), `${fn.name} ${key}=${value}`);
    }
  }
  assert.throws(() => derivePalette(undefined), /colors\.bg/);
  assert.throws(() => mixHex('#ffgggg', '#000000', 0.5), /mixHex/);
  assert.doesNotMatch(paletteStyle(ok), /NaN|undefined/);
});

test('derivePalette: a palette with no readable derivation throws instead of guessing', async () => {
  const { derivePalette } = await import('../lib/page.mjs');
  assert.throws(() => derivePalette({ bg: '#808080', ink: '#7a7a7a', accent: '#000000' }), /^Error: brand\/brand\.json: colors\.ink: contrast with colors\.bg is 1\.\d\d:1/);
  assert.throws(() => renderOffer(offer(), { ...brand, colors: { bg: '#808080', ink: '#7a7a7a', accent: '#000000' } }), /colors\.ink/);
});

const PALETTES = [
  brand.colors,
  { bg: '#ffffff', ink: '#767676', accent: '#000000' },
  { bg: '#111111', ink: '#ffffff', accent: '#c9a27a' },
  { bg: '#fff', ink: '#000', accent: '#949494' },
  { bg: '#0b2a3a', ink: '#f4efe6', accent: '#e0b15c' },
];

test('accentText: accent used as text reaches 4.5:1 on bg; unchanged when the accent already does', async () => {
  const { contrastRatio, derivePalette } = await import('../lib/page.mjs');
  for (const c of PALETTES) assert.ok(contrastRatio(derivePalette(c).accentText, c.bg) >= 4.5, JSON.stringify(c));
  assert.equal(derivePalette({ bg: '#ffffff', ink: '#000000', accent: '#2a4d7a' }).accentText, '#2a4d7a');
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8');
  assert.match(css, /\.names \.amp \{ color: var\(--accent-text\); \}/);
  assert.doesNotMatch(css, /[{;]\s*color:\s*var\(--accent\)/, 'no text coloured with the raw accent');
});

test('head: --line is ink over bg; --shade is the darker and --light the lighter brand colour', async () => {
  const { mixHex } = await import('../lib/page.mjs');
  const vars = (html) => Object.fromEntries([...html.matchAll(/--([\w-]+):(#[0-9a-f]{3,6})/g)].map((m) => [m[1], m[2]]));
  const light = vars(render(offer(), brand));
  assert.equal(light.line, mixHex(brand.colors.ink, brand.colors.bg, 0.16));
  assert.equal(light.shade, brand.colors.ink);
  assert.equal(light.light, brand.colors.bg);
  const dark = vars(render(offer(), { ...brand, colors: { bg: '#111111', ink: '#ffffff', accent: '#c9a27a' } }));
  assert.equal(dark.shade, '#111111');
  assert.equal(dark.light, '#ffffff');
  assert.equal(dark.line, mixHex('#ffffff', '#111111', 0.16));
  assert.match(dark['accent-text'], /^#[0-9a-f]{6}$/);
});

test('names: one joiner only; English "and", three-part names and markup in names', () => {
  const h1 = (names) => /<h1 class="names">(.*?)<\/h1>/.exec(render(baseOffer({ client: { names, email: '', phone: '' } }), brand))[1];
  assert.equal(h1('Emma and James'), 'Emma <span class="amp">and</span> James');
  assert.equal(h1('Anna & Petros & Maria'), 'Anna &amp; Petros &amp; Maria');
  assert.equal(h1('Ελένη και Κώστας & Νίκος'), 'Ελένη και Κώστας &amp; Νίκος');
  assert.equal(h1('<b>Anna</b> & Petros'), '&lt;b&gt;Anna&lt;/b&gt; <span class="amp">&amp;</span> Petros');
  assert.equal(h1('Sandra Andrews'), 'Sandra Andrews');
});

test('gallery: 7 photos → trio, pair, pair; flips alternate; alt text numbers 2..8 of 8 in order', () => {
  const photos = ['portfolio:03.jpg', ...Array.from({ length: 7 }, (_, i) => `x${i}.jpg`)];
  const html = render(baseOffer({ photos }), brand);
  const rows = [...html.matchAll(/<div class="(row [^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['row row-trio', 'row row-pair is-flipped', 'row row-pair']);
  const grid = html.slice(html.indexOf('<section class="grid"'), html.indexOf('</section>', html.indexOf('<section class="grid"')));
  const alts = [...grid.matchAll(/<img src="([^"]*)" alt="([^"]*)"/g)];
  assert.deepEqual(alts.map((m) => m[1].split('/').pop()), Array.from({ length: 7 }, (_, i) => `c-x${i}.jpg`));
  assert.deepEqual(alts.map((m) => m[2]), Array.from({ length: 7 }, (_, i) => escapeHtml(t('el', 'photoAlt', { brand: brand.name, n: i + 2, total: 8 }, brand))));
});

test('offer.css: expired pages drop the dock padding at the foot of the contact block', () => {
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8');
  assert.match(css, /\.contact \{[^}]*padding-block:[^;}]*var\(--dock-h\)/);
  assert.match(css, /\.is-expired \.contact \{ padding-bottom: calc\(3rem \+ env\(safe-area-inset-bottom\)\); \}/);
});

function runDock({ withObserver = true } = {}) {
  const els = Object.fromEntries(['.dock', '.opening', '.packages'].map((s) => [s, { name: s }]));
  const dockClasses = new Set();
  els['.dock'].classList = { toggle: (c, force) => (force ? dockClasses.add(c) : dockClasses.delete(c)) };
  const observers = new Map();
  class FakeObserver {
    constructor(cb) { this.cb = cb; }
    observe(el) { observers.set(el.name, this.cb); }
  }
  const window = { print() {} };
  if (withObserver) window.IntersectionObserver = FakeObserver;
  const context = {
    document: {
      body: { dataset: { validUntil: '2099-12-31' }, classList: { add() {} } },
      querySelector: (s) => els[s] ?? null,
      querySelectorAll: () => [],
    },
    window,
    Date,
    String,
  };
  vm.runInNewContext(readFileSync(new URL('../templates/offer.js', import.meta.url), 'utf8'), context);
  const fire = (name, isIntersecting, top) => observers.get(name)([{ isIntersecting, boundingClientRect: { top } }]);
  return { away: () => dockClasses.has('is-away'), fire, observers };
}

test('offer.js dock: hidden on the cover, shown between cover and packages, hidden at and past the packages', () => {
  const d = runDock();
  assert.deepEqual([...d.observers.keys()].sort(), ['.opening', '.packages']);
  assert.equal(d.away(), true, 'starts hidden: the cover is on screen');
  d.fire('.opening', true, 0);
  d.fire('.packages', false, 2000);
  assert.equal(d.away(), true, 'cover visible');
  d.fire('.opening', false, -900);
  assert.equal(d.away(), false, 'between cover and packages');
  d.fire('.packages', true, 300);
  assert.equal(d.away(), true, 'packages in view');
  d.fire('.packages', false, -1500);
  assert.equal(d.away(), true, 'scrolled past the packages');
  d.fire('.packages', false, 1200);
  assert.equal(d.away(), false, 'scrolled back up above the packages');
});

test('offer.js dock: without IntersectionObserver nothing throws and the dock stays visible', () => {
  const d = runDock({ withObserver: false });
  assert.equal(d.observers.size, 0);
  assert.equal(d.away(), false);
});

test('offer.css: outside .is-away, expiry and media queries the dock is never hidden (the no-JS path)', () => {
  const css = readFileSync(new URL('../templates/offer.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let top = '';
  let depth = 0;
  let inMedia = 0;
  for (let i = 0; i < css.length; i++) {
    if (depth === 0 && css.startsWith('@media', i)) inMedia = 1;
    const c = css[i];
    if (c === '{') depth++;
    if (!inMedia) top += c;
    if (c === '}') { depth--; if (depth === 0) inMedia = 0; }
  }
  const rules = [...top.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const dockRules = rules.filter((r) => /\.dock\b/.test(r.sel));
  assert.ok(dockRules.some((r) => r.sel === '.dock' && /position:\s*fixed/.test(r.body)), 'the base .dock rule is at top level');
  for (const r of dockRules) {
    if (/\.is-away|\.is-expired/.test(r.sel)) continue;
    assert.doesNotMatch(r.body, /display:\s*none|visibility:\s*hidden|opacity:\s*0\b/, r.sel);
  }
});

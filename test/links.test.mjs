import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatgptLink, mailtoLink, whatsappLink } from '../lib/links.mjs';

const NAMES = 'Μαρία & Νίκος 💍 "Ο\'Νίκος" <3';
const roundTrip = (url, param) => new URL(url).searchParams.get(param);

test('whatsappLink: plan example', () => {
  assert.equal(
    whatsappLink('+30 690-000 0000', 'Maria & Nikos – 14/6'),
    'https://wa.me/306900000000?text=Maria%20%26%20Nikos%20%E2%80%93%2014%2F6',
  );
});

test('whatsappLink: strips +, spaces, dashes, dots and parens', () => {
  assert.equal(whatsappLink('(+30) 690.000.0000', 'hi'), 'https://wa.me/306900000000?text=hi');
});

test('whatsappLink: empty or invalid phone returns null', () => {
  for (const phone of ['', '   ', null, undefined, '+30 690 abc', '12', '+', '+1234567890123456', '6900000000', '06900000000', '+06900000000', '000306900000000', '+30 69+00 00000']) {
    assert.equal(whatsappLink(phone, 'hi'), null, `phone ${JSON.stringify(phone)}`);
  }
});

test('links encode !\'()* too', () => {
  assert.equal(chatgptLink("it's (ok)!*"), 'https://chatgpt.com/?q=it%27s%20%28ok%29%21%2A');
});

test('whatsappLink: special characters round-trip', () => {
  const url = whatsappLink('+306900000000', NAMES);
  assert.ok(!/[\s&<>"'💍]/u.test(url.split('?')[1].slice(5)), url);
  assert.equal(roundTrip(url, 'text'), NAMES);
});

test('mailtoLink: encodes subject and body, CRLF line breaks', () => {
  const url = mailtoLink('hello@studio.gr', `Κράτηση: ${NAMES}`, 'line 1\nline 2 & more');
  assert.ok(url.startsWith('mailto:hello@studio.gr?subject='), url);
  assert.ok(url.includes('&body=line%201%0D%0Aline%202%20%26%20more'), url);
  assert.ok(!/[\s<>"]/.test(url), url);
  assert.equal(roundTrip(url, 'subject'), `Κράτηση: ${NAMES}`);
  assert.equal(roundTrip(url, 'body'), 'line 1\r\nline 2 & more');
});

test('mailtoLink: empty or invalid email returns null', () => {
  for (const email of ['', null, undefined, 'not-an-email', 'a@b', 'a b@c.gr', 'a@b.gr?cc=x@y.gr']) {
    assert.equal(mailtoLink(email, 's', 'b'), null, `email ${JSON.stringify(email)}`);
  }
});

test('chatgptLink: plain', () => {
  assert.equal(chatgptLink('Maria & Nikos – 14/6'), 'https://chatgpt.com/?q=Maria%20%26%20Nikos%20%E2%80%93%2014%2F6');
});

test('chatgptLink: project URL', () => {
  assert.equal(chatgptLink('hi there', 'https://chatgpt.com/g/g-p-example/project'), 'https://chatgpt.com/g/g-p-example/project?q=hi%20there');
});

test('chatgptLink: project URL that already has a query appends with &', () => {
  assert.equal(chatgptLink('hi', 'https://chatgpt.com/g/g-p-example/project?model=x'), 'https://chatgpt.com/g/g-p-example/project?model=x&q=hi');
});

test('chatgptLink: special characters round-trip', () => {
  assert.equal(roundTrip(chatgptLink(NAMES), 'q'), NAMES);
  assert.equal(roundTrip(chatgptLink(NAMES, 'https://chatgpt.com/g/g-p-example/project?a=1'), 'q'), NAMES);
});

test('whatsappLink: 00 prefix becomes international', () => {
  assert.equal(whatsappLink('0030 6900000000', 'hi'), 'https://wa.me/306900000000?text=hi');
});

test('whatsappLink: 8 to 15 digits (E.164)', () => {
  assert.equal(whatsappLink('+1234567', 'hi'), null);
  assert.equal(whatsappLink('+12345678', 'hi'), 'https://wa.me/12345678?text=hi');
  assert.equal(whatsappLink('+123456789012345', 'hi'), 'https://wa.me/123456789012345?text=hi');
  assert.equal(whatsappLink('+1234567890123456', 'hi'), null);
});

test('link builders throw on missing or empty text', () => {
  for (const text of [undefined, null, '', 5]) {
    assert.throws(() => whatsappLink('+306900000000', text), /text/);
    assert.throws(() => chatgptLink(text), /text/);
    assert.throws(() => mailtoLink('hello@studio.gr', text, 'body'), /subject/);
    assert.throws(() => mailtoLink('hello@studio.gr', 'subject', text), /body/);
  }
});

test('chatgptLink: project URL with an existing q replaces it', () => {
  assert.equal(chatgptLink('new', 'https://chatgpt.com/g/g-p-example/project?q=old&model=x'), 'https://chatgpt.com/g/g-p-example/project?model=x&q=new');
  assert.equal(chatgptLink('new', 'https://chatgpt.com/g/g-p-example/project?q=old'), 'https://chatgpt.com/g/g-p-example/project?q=new');
});

test('chatgptLink: project URL must be https, chatgpt.com, no hash', () => {
  for (const url of ['', 'http://chatgpt.com/g/x', 'https://evil.com/g/x', 'https://chatgpt.com.evil.com/x', 'https://chatgpt.com/g/x#frag', 'https://chatgpt.com/g/x#', 'not a url', 'https://u:p@chatgpt.com/g/x', 5, null]) {
    assert.throws(() => chatgptLink('hi', url), /projectUrl/, JSON.stringify(url));
  }
});

test('mailtoLink: rejects addresses with header or quote characters', () => {
  for (const email of ['a"b@c.gr', 'a<b@c.gr', 'a>b@c.gr', 'a\\b@c.gr', 'a,b@c.gr', 'a;b@c.gr', 'a:b@c.gr', 'a&b@c.gr', 'a#b@c.gr', 'a/b@c.gr', 'a?b@c.gr', 'a@b,c.gr', 'a@b;c.gr', 'a@b\tc.gr']) {
    assert.equal(mailtoLink(email, 's', 'b'), null, email);
  }
  assert.ok(mailtoLink('first.last+tag@studio.co.uk', 's', 'b'));
});

test('whatsappLink: a (0) trunk prefix is rejected anywhere', () => {
  assert.equal(whatsappLink('+30 (0)690 000 0000', 'hi'), null);
  assert.equal(whatsappLink('+44 (0) 20 7946 0000', 'hi'), null);
});

test('whatsappLink: Greece rejects a 0 after the country code; Italy keeps it', () => {
  assert.equal(whatsappLink('+30 0690 000 0000', 'hi'), null);
  assert.equal(whatsappLink('0030 0690 000 0000', 'hi'), null);
  assert.equal(whatsappLink('+30 690 000 0000', 'hi'), 'https://wa.me/306900000000?text=hi');
  assert.equal(whatsappLink('+39 06 1234 5678', 'hi'), 'https://wa.me/390612345678?text=hi');
});

test('mailtoLink: domain labels start and end with a letter or digit; no %', () => {
  for (const email of ['a@...', 'a@-.-', 'a@-x.gr', 'a@x-.gr', 'a@x..gr', 'a@.x.gr', 'a@x.gr.', 'a%b@c.gr', 'a@c%41.gr']) {
    assert.equal(mailtoLink(email, 's', 'b'), null, email);
  }
  for (const email of ['a@my-studio.gr', 'a@x.y.gr', 'a@2x.gr', 'a@φωτο.gr']) assert.ok(mailtoLink(email, 's', 'b'), email);
});

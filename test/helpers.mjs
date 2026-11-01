import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE } from '../lib/record.mjs';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const OK = join(FIXTURES, 'ok');

export function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'offers-test-'));
  cpSync(OK, root, { recursive: true });
  return root;
}

export function readJson(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

export function writeFile(root, rel, data) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), data);
}

export function baseOffer(patch = {}, file = 'offers/maria-nikos-k3x9qa.json') {
  const offer = { ...readJson(OK, 'offers/maria-nikos-k3x9qa.json'), ...patch };
  offer[FILE] = file;
  return offer;
}

export function errorFor(errors, file, field) {
  return errors.find((e) => e.startsWith(`${file}: ${field}: `));
}

export function errorMatching(errors, file, field, pattern) {
  return errors.find((e) => e.startsWith(`${file}: ${field}: `) && pattern.test(e));
}

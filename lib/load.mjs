import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_FILE, FILE, err, isObject } from './record.mjs';
import { migrate } from './validate.mjs';

const EXAMPLE = '_example.json';
const IGNORED = (name) => /^readme(\.(md|txt))?$/i.test(name) || name === '.gitkeep';

function lineOf(text, message) {
  const explicit = /\(line (\d+) column (\d+)\)/.exec(message);
  if (explicit) return `line ${explicit[1]} column ${explicit[2]}`;
  const pos = /at position (\d+)/.exec(message);
  if (!pos) return 'line ?';
  const before = text.slice(0, Number(pos[1]));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  return `line ${line} column ${column}`;
}

function readObject(path, file) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return { error: err(file, 'file', e.code === 'ENOENT' ? 'not found' : e.code ?? e.message) };
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: err(file, lineOf(text, e.message), `invalid JSON (${e.message})`) };
  }
  if (!isObject(value)) return { error: err(file, 'json', 'expected an object') };
  return { value };
}

export function loadBrand(root) {
  const { value, error } = readObject(join(root, BRAND_FILE), BRAND_FILE);
  return error ? { brand: null, errors: [error] } : { brand: value, errors: [] };
}

export function loadOffers(root, { includeExample = false } = {}) {
  const dir = join(root, 'offers');
  const offers = [];
  const errors = [];
  let names;
  try {
    names = readdirSync(dir).sort();
  } catch (e) {
    errors.push(err('offers/', 'directory', e.code === 'ENOENT' ? 'not found' : e.code ?? e.message));
    return { offers, errors };
  }
  for (const name of names) {
    const file = `offers/${name}`;
    if (IGNORED(name) || (name === EXAMPLE && !includeExample)) continue;
    if (!/\.json$/i.test(name)) {
      errors.push(err(file, 'file', 'not a .json offer file'));
      continue;
    }
    if (name.startsWith('_') && name !== EXAMPLE) {
      errors.push(err(file, 'file', `names starting with "_" are reserved (only ${EXAMPLE})`));
      continue;
    }
    const { value, error } = readObject(join(dir, name), file);
    if (error) {
      errors.push(error);
      continue;
    }
    try {
      const offer = migrate(value);
      offer[FILE] = file;
      offers.push(offer);
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }
  return { offers, errors };
}

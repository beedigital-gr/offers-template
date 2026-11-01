// Symbol key: JSON.stringify and Object.keys skip it, so the path never reaches a rendered page.
export const FILE = Symbol('file');
export const BRAND_FILE = 'brand/brand.json';
export const LANGUAGES = ['el', 'en'];

export const err = (file, field, problem) => `${file}: ${field}: ${problem}`;
export const show = (v) => JSON.stringify(v) ?? String(v);
export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isText = (v) => typeof v === 'string' && v.length > 0;

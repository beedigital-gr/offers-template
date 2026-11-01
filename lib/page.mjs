import { LANGUAGES } from './record.mjs';

export const PORTFOLIO = 'portfolio:';
const LOCALES = { el: 'el-GR', en: 'en-GB' };

function channels(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.x contrast ratio of two hex colours.
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const isHexColor = (v) => typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

// File name under dist/public/<slug>/photos/. Portfolio photos get "p-", the client's own "c-",
// so a client file can never overwrite a portfolio file of the same name.
export function photoOutputName(entry) {
  if (typeof entry !== 'string' || entry === '' || entry === PORTFOLIO) throw new Error(`photoOutputName: photo entry must be text, got ${JSON.stringify(entry)}`);
  return entry.startsWith(PORTFOLIO) ? `p-${entry.slice(PORTFOLIO.length)}` : `c-${entry}`;
}

// Root-relative, so /<slug> without a trailing slash still finds its photos. Still needs escapeHtml.
export const photoSrc = (entry, slug) => `/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoOutputName(entry))}`;

// A real calendar date: "2026-02-31" fails the round trip.
export function isIsoDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function formatDate(iso, lang) {
  if (!LANGUAGES.includes(lang)) throw new Error(`formatDate: unknown language ${JSON.stringify(lang)}`);
  if (!isIsoDate(iso)) throw new Error(`formatDate: not a date ${JSON.stringify(iso)}`);
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

const rgbOf = (hex) => {
  if (!isHexColor(hex)) throw new Error(`mixHex: not a colour like "#1d1b19": ${JSON.stringify(hex)}`);
  return channels(hex);
};

export function mixHex(a, b, t) {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

const colorError = (key, problem) => new Error(`brand/brand.json: colors.${key}: ${problem}`);

const steps = (from) => Array.from({ length: (100 - from) / 2 + 1 }, (_, i) => (from + 2 * i) / 100);

function firstPassing(list, make, ok, problem) {
  const hit = list.find((v) => ok(make(v)));
  if (hit === undefined) throw colorError('ink', problem);
  return make(hit);
}

export function derivePalette(colors) {
  for (const key of ['bg', 'ink', 'accent']) {
    if (!isHexColor(colors?.[key])) throw colorError(key, `must be a colour like "#1d1b19", got ${JSON.stringify(colors?.[key])}`);
  }
  const { bg, ink, accent } = colors;
  const low = `contrast with colors.bg is ${contrastRatio(ink, bg).toFixed(2)}:1, needs at least 4.5:1`;
  const tint = firstPassing([14, 12, 10, 8, 6, 4, 2, 0].map((n) => n / 100), (p) => mixHex(accent, bg, p), (c) => contrastRatio(ink, c) >= 4.5, low);
  const muted = firstPassing(steps(66), (p) => mixHex(ink, bg, p), (c) => contrastRatio(c, bg) >= 4.5 && contrastRatio(c, tint) >= 4.5, low);
  const mutedOnInk = firstPassing(steps(66), (p) => mixHex(bg, ink, p), (c) => contrastRatio(c, ink) >= 4.5, low);
  const accentShare = steps(0).reverse().find((p) => contrastRatio(mixHex(accent, ink, p), bg) >= 4.5);
  const accentText = mixHex(accent, ink, accentShare);
  const [shade, light] = luminance(bg) < luminance(ink) ? [bg, ink] : [ink, bg];
  return { tint, muted, mutedOnInk, accentText, line: mixHex(ink, bg, 0.16), shade, light };
}

export function paletteStyle(colors) {
  const d = derivePalette(colors);
  const { bg, ink, accent } = colors;
  return `:root{--bg:${bg};--ink:${ink};--accent:${accent};--accent-text:${d.accentText};--tint:${d.tint};--muted:${d.muted};--muted-on-ink:${d.mutedOnInk};--line:${d.line};--shade:${d.shade};--light:${d.light}}`;
}

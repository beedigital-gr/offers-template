import { LANGUAGES } from './record.mjs';

export const PORTFOLIO = 'portfolio:';
const LOCALES = { el: 'el-GR', en: 'en-GB' };

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
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

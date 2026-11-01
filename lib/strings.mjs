import { LANGUAGES } from './record.mjs';
import { verticalOf } from './vertical.mjs';

export { escapeHtml } from './html.mjs';

export const strings = {
  el: {
    expired: 'Η προσφορά έληξε στις {date}. Επικοινωνήστε μαζί μας για νέα τιμή.',
    validUntil: 'Ισχύει έως {date}',
    savePdf: 'Αποθήκευση ως PDF',
    contact: 'Επικοινωνία',
    termsHeading: 'Όροι',
    addonsHeading: 'Επιπλέον',
    recommended: 'Προτεινόμενο',
    vatIncluded: 'Οι τιμές περιλαμβάνουν ΦΠΑ.',
    vatExcluded: 'Οι τιμές δεν περιλαμβάνουν ΦΠΑ.',
    whatsapp: 'WhatsApp',
    email: 'Email',
    nothingHere: 'Δεν υπάρχει τίποτα εδώ.',
  },
  en: {
    expired: 'This offer expired on {date}. Get in touch for an updated price.',
    validUntil: 'Valid until {date}',
    savePdf: 'Save as PDF',
    contact: 'Contact',
    termsHeading: 'Terms',
    addonsHeading: 'Extras',
    recommended: 'Recommended',
    vatIncluded: 'Prices include VAT.',
    vatExcluded: 'Prices exclude VAT.',
    whatsapp: 'WhatsApp',
    email: 'Email',
    nothingHere: 'Nothing here.',
  },
};

// Throws on a missing key, language or var so the build fails instead of printing "undefined".
// Pass the brand to reach its vertical's strings. Returns plain text: escape before putting it in HTML.
export function t(lang, key, vars = {}, brand) {
  if (!LANGUAGES.includes(lang)) throw new Error(`strings: unknown language ${JSON.stringify(lang)}`);
  let extra = {};
  if (brand !== undefined) {
    const vertical = verticalOf(brand);
    if (!vertical) throw new Error(`strings: unknown vertical ${JSON.stringify(brand.vertical)}`);
    extra = vertical.strings?.[lang] ?? {};
  }
  const source = Object.hasOwn(strings[lang], key) ? strings[lang] : Object.hasOwn(extra, key) ? extra : null;
  if (!source) throw new Error(`strings: missing key "${key}" for "${lang}"`);
  return source[key].replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars?.[name];
    const ok = (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
    if (!ok) throw new Error(`strings: "${key}" needs {${name}} as text or a number, got ${typeof v}`);
    return String(v);
  });
}


const LOCALES = { el: 'el-GR', en: 'en-IE' };
const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function packagePrice(offer, brand, id) {
  const where = `packagePrice: ${offer.slug}: ${JSON.stringify(id)}`;
  const entry = offer.packages?.find((p) => p?.id === id);
  const brandPackage = brand.packages?.find((p) => p?.id === id);
  if (!entry && !brandPackage) throw new Error(`${where}: unknown package`);
  const price = entry?.price !== undefined ? entry.price : brandPackage?.price;
  if (!isPrice(price)) throw new Error(`${where}: price must be a number ≥ 0, got ${JSON.stringify(price)}`);
  return price;
}

// el keeps Intl's U+00A0 before "€" so the symbol never wraps onto its own line.
export function formatMoney(n, brand, lang) {
  if (!isPrice(n)) throw new Error(`formatMoney: amount must be a number ≥ 0, got ${JSON.stringify(n)}`);
  if (!Object.hasOwn(LOCALES, lang)) throw new Error(`formatMoney: unknown language ${JSON.stringify(lang)}`);
  const c = Math.round(n * 100);
  if (!Number.isFinite(c)) throw new Error(`formatMoney: amount is too large, got ${n}`);
  if (brand === null || typeof brand !== 'object') throw new Error(`formatMoney: brand.currency is missing (brand is ${JSON.stringify(brand)})`);
  const digits = c % 100 !== 0 ? 2 : 0;
  let format;
  try {
    format = new Intl.NumberFormat(LOCALES[lang], {
      style: 'currency',
      currency: brand.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch (e) {
    throw new Error(`formatMoney: brand.currency ${JSON.stringify(brand.currency)} is not usable: ${e.message}`);
  }
  return format.format(c / 100 + 0);
}

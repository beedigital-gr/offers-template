import { escapeHtml as esc } from './html.mjs';
import { formatMoney } from './money.mjs';
import { formatDate, isHexColor, isIsoDate, paletteStyle, photoOutputName, photoSrc } from './page.mjs';
import { t } from './strings.mjs';
import { verticalOf } from './vertical.mjs';

export { formatDate, photoOutputName };

const OG_LOCALE = { el: 'el_GR', en: 'en_GB' };

function verticalFor(brand) {
  const vertical = verticalOf(brand);
  if (!vertical?.renderPage) throw new Error(`renderOffer: vertical ${JSON.stringify(brand.vertical)} has no page renderer`);
  return vertical;
}

export const photosFor = (offer, brand) => verticalFor(brand).photosFor(offer, brand);

// today ('YYYY-MM-DD', optional): a page built after validUntil ships already expired.
export function renderOffer(offer, brand, { today } = {}) {
  const vertical = verticalFor(brand);
  for (const key of ['bg', 'ink', 'accent']) {
    if (!isHexColor(brand.colors?.[key])) throw new Error(`brand/brand.json: colors.${key}: must be a colour like "#1d1b19"`);
  }
  if (today !== undefined && !isIsoDate(today)) throw new Error(`renderOffer: today must be a real date YYYY-MM-DD, got ${JSON.stringify(today)}`);
  const lang = offer.language;
  const validUntil = formatDate(offer.validUntil, lang);
  const expired = today !== undefined && today > offer.validUntil;
  const ctx = {
    lang,
    expired,
    t: (key, vars) => t(lang, key, vars, brand),
    money: (n) => formatMoney(n, brand, lang),
    date: (iso) => formatDate(iso, lang),
    photoSrc: (entry) => photoSrc(entry, offer.slug),
    savePdf: `<button type="button" class="save-pdf" hidden>${esc(t(lang, 'savePdf'))}</button>`,
  };
  const page = vertical.renderPage(offer, brand, ctx);
  const { bg } = brand.colors;

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(page.ogTitle)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${esc(brand.offersBaseUrl + ctx.photoSrc(page.image))}">
<meta property="og:url" content="${esc(`${brand.offersBaseUrl}/${offer.slug}/`)}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${bg}">
<style>${paletteStyle(brand.colors)}</style>
<link rel="stylesheet" href="/_assets/offer.css">
<script src="/_assets/offer.js" defer></script>
</head>
<body${expired ? ' class="is-expired"' : ''} data-valid-until="${esc(offer.validUntil)}">
<div class="expired" role="status"${expired ? '' : ' hidden'}><p>${esc(t(lang, 'expired', { date: validUntil }))}</p></div>
${page.body}
</body>
</html>
`;
}

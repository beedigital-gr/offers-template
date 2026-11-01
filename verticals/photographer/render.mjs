import { escapeHtml as esc } from '../../lib/html.mjs';
import { isHttpsUrl, mailtoLink, whatsappLink } from '../../lib/links.mjs';
import { packagePrice } from '../../lib/money.mjs';
import { PORTFOLIO } from '../../lib/page.mjs';

const has = (v) => typeof v === 'string' && v.trim() !== '';

export function recommendedId(offer) {
  const r = offer.recommended;
  if (offer.packages.length === 0) throw new Error(`${offer.slug}: offer has no packages`);
  if (r === undefined || r === null || r === '') return offer.packages[Math.floor((offer.packages.length - 1) / 2)].id;
  if (!offer.packages.some((p) => p.id === r)) throw new Error(`${offer.slug}: recommended ${JSON.stringify(r)} is not one of this offer's packages`);
  return r;
}

// Every photo the page shows, cover first. An empty offer list means the brand's portfolio
// photos tagged with the event type.
export function photosFor(offer, brand) {
  const listed = offer.photos.length > 0
    ? offer.photos
    : brand.portfolio.filter((p) => p.types.includes(offer.event.type)).map((p) => `${PORTFOLIO}${p.file}`);
  const photos = [...new Set([offer.cover, ...listed])];
  const known = new Set(brand.portfolio.map((p) => `${PORTFOLIO}${p.file}`));
  for (const entry of photos) {
    if (entry.startsWith(PORTFOLIO) && !known.has(entry)) throw new Error(`${offer.slug}: photo ${JSON.stringify(entry)} is not listed in brand.portfolio`);
  }
  return photos;
}

function bookLinks(offer, brand, ctx, pkgName) {
  const names = offer.client.names;
  const date = offer.event.date ? ctx.date(offer.event.date) : null;
  const vars = { names, package: pkgName, date };
  const text = ctx.t(date ? 'bookText' : 'bookTextNoDate', vars);
  const subject = ctx.t(date ? 'bookSubject' : 'bookSubjectNoDate', vars);
  const wa = whatsappLink(brand.whatsapp, text);
  const mail = mailtoLink(brand.email, subject, text);
  if (!wa && !mail) throw new Error(`${offer.slug}: no Book button possible, brand.whatsapp and brand.email are both unusable`);
  if (ctx.expired) return '';
  const forPkg = `<span class="vh"> ${esc(ctx.t('forPackage', { package: pkgName }))}</span>`;
  const out = [];
  if (wa) out.push(`<a class="btn book" href="${esc(wa)}">${esc(ctx.t('bookByWhatsapp'))}${forPkg}</a>`);
  if (mail) {
    const label = wa ? ctx.t('bookOrEmail') : ctx.t('bookByEmail');
    out.push(`<a class="${wa ? 'book book-alt' : 'btn book'}" href="${esc(mail)}">${esc(label)}${forPkg}</a>`);
  }
  return `<div class="actions">${out.join('')}</div>`;
}

function tier(offer, brand, ctx, entry, recommended) {
  const pkg = brand.packages.find((p) => p.id === entry.id);
  if (!pkg) throw new Error(`${offer.slug}: package ${JSON.stringify(entry.id)} is not in brand.packages`);
  const name = pkg.name[ctx.lang];
  const includes = pkg.includes[ctx.lang];
  const isRec = entry.id === recommended;
  return `<article class="tier${isRec ? ' is-recommended' : ''}" data-package="${esc(entry.id)}"${isRec ? ' data-recommended' : ''}>
<header class="tier-head">${isRec ? `<p class="tag">${esc(ctx.t('recommended'))}</p>` : ''}<h3 id="pkg-${esc(entry.id)}">${esc(name)}</h3><p class="price">${esc(ctx.money(packagePrice(offer, brand, entry.id)))}</p></header>
${includes.length ? `<ul class="includes" aria-label="${esc(ctx.t('includesHeading'))}">${includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
${bookLinks(offer, brand, ctx, name)}
</article>`;
}

function letter(message, brandName) {
  if (!has(message)) return '';
  const paras = message.trim().split(/\r?\n\s*\r?\n/).map((p) => `<p>${p.trim().split(/\r?\n/).map(esc).join('<br>')}</p>`);
  return `<section class="letter">${paras.join('')}<p class="sign">${esc(brandName)}</p></section>`;
}

function photoGrid(photos, brand, ctx) {
  const rest = photos.slice(1);
  if (rest.length === 0) return '';
  const imgs = rest.map((entry, i) => `<figure><img src="${esc(ctx.photoSrc(entry))}" alt="${esc(ctx.t('photoAlt', { brand: brand.name, n: i + 2, total: photos.length }))}" loading="lazy" decoding="async"></figure>`);
  return `<section class="grid" data-count="${rest.length}">${imgs.join('')}</section>`;
}

function contact(offer, brand, ctx) {
  const names = offer.client.names;
  const text = ctx.t('contactText', { names });
  const wa = whatsappLink(brand.whatsapp, text);
  const mail = mailtoLink(brand.email, ctx.t('contactSubject', { names }), text);
  const rows = [];
  if (wa) rows.push(`<li><span class="label">${esc(ctx.t('whatsapp'))}</span><a href="${esc(wa)}">${esc(brand.whatsapp)}</a></li>`);
  if (mail) rows.push(`<li><span class="label">${esc(ctx.t('email'))}</span><a href="${esc(mail)}">${esc(brand.email)}</a></li>`);
  return `<footer class="contact">
<div class="wrap">
<h2>${esc(ctx.t('contact'))}</h2>
<p class="studio">${esc(brand.name)}</p>
${rows.length ? `<ul class="channels">${rows.join('')}</ul>` : ''}
${ctx.savePdf}
</div>
</footer>`;
}

export function renderPage(offer, brand, ctx) {
  const lang = ctx.lang;
  const photos = photosFor(offer, brand);
  const recommended = recommendedId(offer);
  const facts = [];
  if (offer.event.date) facts.push(`<div><dt>${esc(ctx.t('eventDate'))}</dt><dd>${esc(ctx.date(offer.event.date))}</dd></div>`);
  if (has(offer.event.venue)) facts.push(`<div><dt>${esc(ctx.t('venue'))}</dt><dd>${esc(offer.event.venue)}</dd></div>`);
  const addons = (offer.addons ?? []).map((id) => {
    const addon = brand.addons.find((a) => a.id === id);
    if (!addon) throw new Error(`${offer.slug}: addon ${JSON.stringify(id)} is not in brand.addons`);
    return addon;
  });
  const terms = brand.terms[lang];
  if (typeof brand.pricesIncludeVat !== 'boolean') throw new Error(`brand/brand.json: pricesIncludeVat: must be true or false, got ${JSON.stringify(brand.pricesIncludeVat)}`);
  const vat = brand.pricesIncludeVat ? 'vatIncluded' : 'vatExcluded';
  const depositSet = offer.depositLink !== undefined && offer.depositLink !== '';
  if (depositSet && !isHttpsUrl(offer.depositLink)) throw new Error(`${offer.slug}: depositLink must be empty or a https:// link, got ${JSON.stringify(offer.depositLink)}`);
  const deposit = depositSet && !ctx.expired ? offer.depositLink : null;

  const body = `<header class="masthead"><p class="wordmark">${esc(brand.name)}</p></header>
<main>
<figure class="cover"><img src="${esc(ctx.photoSrc(photos[0]))}" alt="${esc(ctx.t('photoAlt', { brand: brand.name, n: 1, total: photos.length }))}" fetchpriority="high" decoding="async"></figure>
<section class="intro">
<h1 class="names">${esc(offer.client.names)}</h1>
${facts.length ? `<dl class="facts">${facts.join('')}</dl>` : ''}
<p class="valid">${esc(ctx.t('validUntil', { date: ctx.date(offer.validUntil) }))}</p>
</section>
${letter(offer.message, brand.name)}
${photoGrid(photos, brand, ctx)}
<section class="packages" aria-labelledby="h-packages">
<h2 id="h-packages">${esc(ctx.t('packagesHeading'))}</h2>
<div class="tiers" data-count="${offer.packages.length}">
${offer.packages.map((p) => tier(offer, brand, ctx, p, recommended)).join('\n')}
</div>
</section>
${addons.length ? `<section class="addons" aria-labelledby="h-addons"><h2 id="h-addons">${esc(ctx.t('addonsHeading'))}</h2><ul>${addons.map((a) => `<li><span>${esc(a.name[lang])}</span><span class="price">+${esc(ctx.money(a.price))}</span></li>`).join('')}</ul></section>` : ''}
${`<section class="terms" aria-labelledby="h-terms"><h2 id="h-terms">${esc(ctx.t('termsHeading'))}</h2>${terms.length ? `<ul>${terms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="vat">${esc(ctx.t(vat))}</p></section>`}
${deposit ? `<section class="deposit"><a class="btn btn-quiet" href="${esc(deposit)}">${esc(ctx.t('depositButton'))}</a></section>` : ''}
</main>
${contact(offer, brand, ctx)}`;

  return {
    title: `${offer.client.names} · ${brand.name}`,
    ogTitle: offer.client.names,
    description: ctx.t('ogDescription', { brand: brand.name }),
    image: photos[0],
    body,
  };
}

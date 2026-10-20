// SearchLocal static site generator. Zero dependencies.
// Reads src/data/*.json, writes a complete static site to dist/.
// Usage: node build.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { icon } from './src/icons.mjs';
import { skylineLayer, shopsLayer, nearLayer } from './src/street.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, 'data', f), 'utf8'));

const site = read('site.json');
const categories = read('categories.json');
const towns = read('towns.json');
const rawListings = read('listings.json');

// ---------- helpers ----------
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byCat = Object.fromEntries(categories.map((c) => [c.slug, c]));
const byTown = Object.fromEntries(towns.map((t) => [t.slug, t]));
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const HOURS_PRESETS = {
  restaurant: { mon: null, tue: '16:00-22:00', wed: '16:00-22:00', thu: '16:00-22:00', fri: '12:00-23:00', sat: '12:00-23:00', sun: '12:00-21:00' },
  early: { mon: '06:30-15:00', tue: '06:30-15:00', wed: '06:30-15:00', thu: '06:30-15:00', fri: '06:30-15:00', sat: '07:00-14:00', sun: '07:00-14:00' },
  trades: { mon: '07:00-18:00', tue: '07:00-18:00', wed: '07:00-18:00', thu: '07:00-18:00', fri: '07:00-18:00', sat: '08:00-14:00', sun: null },
  office: { mon: '08:00-17:00', tue: '08:00-17:00', wed: '08:00-17:00', thu: '08:00-17:00', fri: '08:00-15:00', sat: null, sun: null },
  salon: { mon: null, tue: '10:00-19:00', wed: '10:00-19:00', thu: '10:00-19:00', fri: '10:00-19:00', sat: '09:00-16:00', sun: null },
  gym: { mon: '05:30-21:00', tue: '05:30-21:00', wed: '05:30-21:00', thu: '05:30-21:00', fri: '05:30-21:00', sat: '07:00-14:00', sun: '08:00-12:00' },
  retail: { mon: '10:00-18:00', tue: '10:00-18:00', wed: '10:00-18:00', thu: '10:00-18:00', fri: '10:00-18:00', sat: '10:00-18:00', sun: '11:00-17:00' },
};

const listings = rawListings.map((l) => {
  if (!byCat[l.category]) throw new Error(`${l.slug}: unknown category "${l.category}"`);
  if (!byTown[l.town]) throw new Error(`${l.slug}: unknown town "${l.town}"`);
  const hours = l.hours == null ? null : typeof l.hours === 'string' ? HOURS_PRESETS[l.hours] : l.hours;
  if (l.hours != null && !hours) throw new Error(`${l.slug}: unknown hours preset "${l.hours}"`);
  return { ...l, hours, cat: byCat[l.category], townObj: byTown[l.town] };
});

// Blog posts: src/posts/<slug>.html, each starting with a <!-- {json front matter} --> comment.
// {{card:<listing-slug>}} on its own line embeds that listing's card.
const POSTS_DIR = path.join(SRC, 'posts');
const bySlug = Object.fromEntries(listings.map((l) => [l.slug, l]));
const posts = (fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.html')) : [])
  .map((f) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const m = raw.match(/^<!--([\s\S]*?)-->/);
    if (!m) throw new Error(`posts/${f}: missing front matter`);
    const meta = JSON.parse(m[1]);
    const slug = f.replace(/\.html$/, '');
    for (const k of ['title', 'description', 'lead', 'date']) if (!meta[k]) throw new Error(`posts/${f}: missing "${k}"`);
    for (const b of meta.businesses || []) if (!bySlug[b]) throw new Error(`posts/${f}: unknown business "${b}"`);
    return { ...meta, slug, businesses: meta.businesses || [], html: raw.slice(m[0].length).trim() };
  })
  .filter((p) => p.date <= new Date().toISOString().slice(0, 10)) // future-dated posts wait for their day
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const readMins = (html) => Math.max(1, Math.round(html.replace(/<[^>]+>|\{\{[^}]+\}\}/g, ' ').split(/\s+/).filter(Boolean).length / 220));

const real = (list) => list.filter((l) => !l.sample);
const LD_TYPES = { restaurants: 'Restaurant', 'cafes-bakeries': 'Bakery', plumbing: 'Plumber', hvac: 'HVACBusiness', electricians: 'Electrician', 'auto-repair': 'AutoRepair', 'salons-barbers': 'BeautySalon', fitness: 'ExerciseGym', 'health-dental': 'MedicalBusiness', legal: 'LegalService', 'real-estate': 'RealEstateAgent', landscaping: 'HomeAndConstructionBusiness', pets: 'LocalBusiness', shopping: 'Store', cleaning: 'HomeAndConstructionBusiness', 'finance-insurance': 'FinancialService', printing: 'PrintShop' };
const ldType = (l) => (l.category === 'health-dental' && /dental|dentist|teeth/i.test(l.name)) ? 'Dentist' : (l.category === 'pets' && /veterinar/i.test(l.name)) ? 'VeterinaryCare' : /brew/i.test(l.name) ? 'Brewery' : (LD_TYPES[l.category] || 'LocalBusiness');
const itemList = (list, name) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: real(list).length, itemListElement: real(list).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.url}/business/${l.slug}/`, name: l.name })) });
const canIndex = (list) => real(list).length >= site.minListingsToIndex;

function fmtTime(t) {
  if (t === '23:59' || t === '24:00') return 'Midnight';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}
const fmtRange = (r) => (r ? r.split('-').map(fmtTime).join(' – ') : 'Closed');

function monogram(name) {
  const skip = new Set(['&', 'and', 'the', 'co.', 'co', 'of']);
  const words = name.split(/\s+/).filter((w) => !skip.has(w.toLowerCase()));
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}
function mark(l, xl) {
  const size = xl ? ' monogram-xl' : '';
  if (!l.logo) return `<span class="monogram${size}" aria-hidden="true">${e(monogram(l.name))}</span>`;
  if (!fs.existsSync(path.join(SRC, 'assets', 'img', 'logos', `${l.slug}.png`))) throw new Error(`${l.slug}: missing logo file`);
  const tone = l.logoTone === 'light' ? ' on-dark' : '';
  const px = xl ? 96 : 50;
  return `<span class="monogram${size} has-logo${tone}"><img src="${e(l.logo)}" alt="" width="${px}" height="${px}"></span>`;
}
const fullAddress = (l) => l.address ? `${l.address}, ${l.townObj.name}, ${l.townObj.state} ${l.zip}` : `${l.townObj.name}, ${l.townObj.state}`;
// The phrase people type: "dentists in Toms River, NJ", not the directory's category label.
const searchPhrase = (c) => {
  const q = c.query || c.name;
  return q.charAt(0).toUpperCase() + q.slice(1);
};
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const andList = (arr) => arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;

// ---------- layout ----------
const NAV = [
  ['/browse/', 'Browse'],
  ['/categories/', 'Categories'],
  ['/towns/', 'Towns'],
  ['/blog/', 'Blog'],
  ['/about/', 'About'],
];

const logo = `<a class="logo" href="/" aria-label="${e(site.name)} home">
  <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4dd9c"/><stop offset=".55" stop-color="#d4ad55"/><stop offset="1" stop-color="#9c7629"/></linearGradient></defs><path d="M16 2.5c-6.1 0-11 4.8-11 10.8C5 21.5 16 29.5 16 29.5s11-8 11-16.2c0-6-4.9-10.8-11-10.8Z" fill="none" stroke="url(#lg)" stroke-width="1.6"/><circle cx="16" cy="13.2" r="4.2" fill="url(#lg)"/></svg>
  <span class="logo-word">Search<em>Local</em></span>
</a>`;

function layout({ title, description, pathname, body, noindex = false, jsonld = [], bodyClass = '', ogType = 'website', extraHead = '' }) {
  const fullTitle = pathname === '/' ? `${site.name} — ${site.tagline} for ${site.region}` : `${title} · ${site.name}`;
  const canonical = site.url + pathname;
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n');
  const nav = NAV.map(([href, label]) => `<a href="${href}"${pathname.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>document.documentElement.classList.add('js')</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(fullTitle)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow'}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#05060a">
<meta name="color-scheme" content="dark">
${pathname === '/' ? '<meta name="msvalidate.01" content="0D2D8CE49A2182C71C0E5827E8FC3F91">' : ''}
<meta name="geo.region" content="US-NJ">
<meta name="geo.placename" content="${e(site.region)}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="en_US">
<meta property="og:site_name" content="${e(site.name)}">
<meta property="og:title" content="${e(fullTitle)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/assets/img/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(site.name)} — ${e(site.tagline)} for ${e(site.region)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(fullTitle)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${site.url}/assets/img/og.jpg">
${extraHead}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/manrope-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/instrument-serif-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/img/street-sky.svg?v=${BUILD_ID}" as="image" type="image/svg+xml" fetchpriority="high">
<style>${CSS}</style>
${ld}
</head>
<body class="${bodyClass || 'page-inner'}">
${scene()}
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" data-header>
  <div class="wrap header-inner">
    ${logo}
    <nav class="nav" aria-label="Primary">${nav}</nav>
    <a class="btn btn-gold btn-sm header-cta" href="/add-your-business/">List your business <span class="free-tag">Free</span></a>
    <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav" data-menu-btn>${icon('menu')}</button>
  </div>
  <div class="mobile-nav" id="mobile-nav" hidden data-mobile-nav>
    <nav class="wrap" aria-label="Mobile">${nav}<a class="btn btn-gold" href="/add-your-business/">List your business — free</a></nav>
  </div>
</header>
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/js/main.js?v=${BUILD_ID}" defer></script>
</body>
</html>`;
}

const CSS = fs.readFileSync(path.join(SRC, 'assets', 'css', 'style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .replace(/\(\s*/g, '(')
  .trim();
const STREET = { sky: skylineLayer(), shops: shopsLayer(), near: nearLayer() };
function scene() {
  const layer = (key, speed) => `<div class="layer layer-${key}" data-layer data-speed="${speed}" data-aspect="${(STREET[key].width / 600).toFixed(4)}" style="background-image:url(/assets/img/street-${key}.svg?v=${BUILD_ID})"></div>`;
  return `<div class="scene" aria-hidden="true">
  <div class="sky"><div class="stars"></div><div class="moon"></div></div>
  ${layer('sky', 0.12)}
  <div class="haze"></div>
  ${layer('shops', 0.5)}
  ${layer('near', 0.95)}
  <div class="scene-dim" data-scene-dim></div>
</div>`;
}

function footer() {
  const topCats = categories.slice(0, 8).map((c) => `<li><a href="/category/${c.slug}/">${e(c.name)}</a></li>`).join('');
  const townLinks = towns.map((t) => `<li><a href="/town/${t.slug}/">${e(t.name)}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        ${logo}
        <p>${e(site.tagline)} for ${e(site.region)}. Free listings for every real local business — no pay-to-rank, no fake reviews, ever.</p>
        <a class="btn btn-ghost btn-sm" href="/add-your-business/">Add your business ${icon('arrow')}</a>
      </div>
      <div class="footer-col"><h2>Categories</h2><ul>${topCats}<li><a href="/categories/">All categories</a></li></ul></div>
      <div class="footer-col"><h2>Towns</h2><ul>${townLinks}</ul></div>
      <div class="footer-col"><h2>SearchLocal</h2><ul>
        <li><a href="/about/">About</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/guidelines/">Listing guidelines</a></li>
        <li><a href="/add-your-business/">Add a business</a></li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="mailto:${e(site.email)}">${e(site.email)}</a></li>
      </ul></div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${e(site.domain)}</span>
      <span>Some listing data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, available under the ODbL.</span>
    </div>
  </div>
</footer>`;
}

// ---------- components ----------
function yelpHref(l) {
  if (l.yelp?.url) return l.yelp.url;
  if (l.sample) return '';
  const loc = `${l.townObj.name}, ${l.townObj.state}`;
  return `https://www.yelp.com/search?find_desc=${encodeURIComponent(l.name)}&find_loc=${encodeURIComponent(loc)}`;
}

function starRow(rating) {
  const r = Math.round(Number(rating) * 2) / 2;
  let html = '<span class="card-stars" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    const diff = r - (i - 1);
    const cls = diff >= 0.75 ? 'is-full' : diff >= 0.25 ? 'is-half' : 'is-empty';
    html += `<span class="card-star ${cls}">${icon('star')}</span>`;
  }
  return `${html}</span>`;
}

function card(l) {
  const href = `/business/${l.slug}/`;
  const yUrl = yelpHref(l);
  const rating = l.yelp?.rating;
  const count = l.yelp?.reviewCount;
  const ratingBlock = rating != null
    ? `<div class="card-rating">${starRow(rating)}<span class="card-rating-score">${Number(rating).toFixed(1)}</span>${count != null ? `<span class="card-rating-count">(${count.toLocaleString('en-US')})</span>` : ''}<span class="card-rating-src">Yelp</span></div>`
    : '';
  const yelpBtn = yUrl
    ? `<a class="card-yelp" href="${e(yUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${e(l.name)} on Yelp">Yelp</a>`
    : '';
  return `<article class="card" data-slug="${e(l.slug)}" href="${href}" data-reveal>
  <a class="card-hit" href="${href}" tabindex="-1" aria-hidden="true"></a>
  <div class="card-head">
    ${mark(l)}
    <span class="card-cat">${icon(l.cat.icon)}${e(l.cat.name)}</span>
    ${l.sample ? '<span class="sample-tag" title="Demonstration listing — not a real business">Sample</span>' : ''}
    ${yelpBtn}
  </div>
  <h3 class="card-title"><a href="${href}">${e(l.name)}</a></h3>
  <p class="card-sum">${e(l.summary)}</p>
  ${ratingBlock}
  <div class="card-foot">
    <span class="card-loc">${icon('pin')}${e(l.townObj.name)}, ${e(l.townObj.state)}</span>
    ${l.hours ? `<span class="status" data-hours="${e(JSON.stringify(l.hours))}"></span>` : ''}
  </div>
  <span class="card-arrow" aria-hidden="true">${icon('arrowUpRight')}</span>
</article>`;
}

const grid = (list) => `<div class="card-grid">${list.map(card).join('')}</div>`;

function crumbs(items) {
  const html = items.map(([href, label], i) => (i === items.length - 1 ? `<span aria-current="page">${e(label)}</span>` : `<a href="${href}">${e(label)}</a>`)).join(`<span class="sep">/</span>`);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([href, label], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: site.url + href })),
  };
  return { html: `<nav class="crumbs" aria-label="Breadcrumb">${html}</nav>`, ld };
}

function pageHero({ eyebrow, title, lead, extra = '', crumbHtml = '', iconName }) {
  return `<section class="page-hero">
  <div class="wrap">
    ${crumbHtml}
    ${iconName ? `<span class="hero-icon">${icon(iconName)}</span>` : ''}
    ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
    <h1 class="display">${title}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${extra}
  </div>
</section>`;
}

const sampleNotice = () =>
  listings.some((l) => l.sample)
    ? `<div class="wrap"><p class="sample-notice">${icon('info')}<span>Listings marked <strong>Sample</strong> are demonstrations, not real businesses. They are hidden from search engines and are being replaced by verified local businesses.</span></p></div>`
    : '';

// ---------- pages ----------
const pages = [];
const indexable = [];
function addPage(pathname, html, { noindex = false } = {}) {
  if (noindex) html = html.replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex,follow">');
  pages.push([pathname, html]);
  if (!noindex) indexable.push(pathname);
}

function home() {
  const featured = listings.filter((l) => l.featured).slice(0, 6);
  const catCount = (slug) => listings.filter((l) => l.category === slug).length;
  const townCount = (slug) => listings.filter((l) => l.town === slug).length;
  const filledCats = [...categories].filter((c) => catCount(c.slug)).sort((a, b) => catCount(b.slug) - catCount(a.slug));
  const filledTowns = towns.filter((t) => townCount(t.slug)).sort((a, b) => townCount(b.slug) - townCount(a.slug));
  const chips = [
    `<a class="chip chip-open" href="/browse/?open=1">${icon('clock')}Open now</a>`,
    ...filledCats.slice(0, 5).map((c) => `<a class="chip" href="/category/${c.slug}/">${icon(c.icon)}${e(c.name)}</a>`),
  ].join('');
  const townChips = filledTowns
    .slice(0, 6)
    .map((t) => `<a class="chip" href="/town/${t.slug}/">${icon('pin')}${e(t.name)}</a>`)
    .join('');
  const marquee = [...filledCats, ...filledCats].map((c) => `<span>${e(c.name)}</span><i aria-hidden="true">◆</i>`).join('');
  const catTiles = filledCats
    .map(
      (c) => `<a class="cat-tile" href="/category/${c.slug}/" data-reveal>
  <span class="cat-icon">${icon(c.icon)}</span>
  <span class="cat-name">${e(c.name)}</span>
  <span class="cat-count">${plural(catCount(c.slug), 'listing')}</span>
  <span class="cat-arrow" aria-hidden="true">${icon('arrow')}</span>
</a>`
    )
    .join('');
  const townTiles = filledTowns
    .map(
      (t, i) => `<a class="town-row" href="/town/${t.slug}/" data-reveal>
  <span class="town-num">${String(i + 1).padStart(2, '0')}</span>
  <span class="town-name">${e(t.name)}</span>
  <span class="town-county">${e(t.county)}, ${e(t.state)}</span>
  <span class="town-count">${plural(townCount(t.slug), 'business', 'businesses')}</span>
  <span class="town-arrow" aria-hidden="true">${icon('arrowUpRight')}</span>
</a>`
    )
    .join('');
  const townOptions = towns.map((t) => `<option value="${t.slug}">${e(t.name)}</option>`).join('');
  const catOptions = categories.map((c) => `<option value="${e(c.name)}"></option>`).join('');

  const faqs = [
    ['Is it really free?', 'Yes. A complete listing — name, address, phone, hours, website link, description and services — costs nothing, and it stays free. We will never charge a business to rank higher in its category.'],
    ['Will this get my business to the top of Google?', 'Nobody can honestly promise that, and we won\'t. What a listing does give you is another accurate, consistent citation of your name, address and phone, a real link to your website, and a page that local customers can find.'],
    ['How do you decide who gets listed?', 'Every listing is a real business with a physical presence or service area here. We check details before anything goes live, and we remove listings that close or stop answering. See the listing guidelines for the full standard.'],
    ['Do you have reviews?', 'Not yet. When we add them, they will come from verified customers only. We will never write, buy or filter reviews for anyone.'],
    ['Can I update my listing later?', 'Anytime. Changed your hours, moved, or added a service? Send the update and we will refresh your page.'],
  ];
  const faqHtml = faqs.map(([q, a]) => `<details class="faq-item" data-reveal><summary>${e(q)}<span class="faq-plus" aria-hidden="true"></span></summary><p>${e(a)}</p></details>`).join('');

  const body = `
<section class="hero">
  <div class="wrap hero-inner">
    <p class="eyebrow eyebrow-pill"><span class="dot" aria-hidden="true"></span>${e(site.tagline)} · ${e(site.region)}</p>
    <h1 class="display hero-title">Find the <em>best</em> <span class="nowrap">of local.</span></h1>
    <p class="lead hero-lead">Search by what you need, filter who's open, and call from the listing. Real businesses — no pay-to-rank, no fake reviews.</p>
    <form class="searchbar" action="/browse/" method="get" role="search">
      <label class="sb-field">
        <span class="sb-label">What</span>
        <span class="sb-input">${icon('search')}<input name="q" type="search" placeholder="Plumber, coffee, barber…" list="cat-list" autocomplete="off"></span>
      </label>
      <span class="sb-div" aria-hidden="true"></span>
      <label class="sb-field">
        <span class="sb-label">Where</span>
        <span class="sb-input">${icon('pin')}<select name="town"><option value="">All of ${e(site.region)}</option>${townOptions}</select></span>
      </label>
      <button class="btn btn-gold sb-btn" type="submit">Search ${icon('arrow')}</button>
      <datalist id="cat-list">${catOptions}</datalist>
    </form>
    <div class="chips"><span class="chips-label">Find</span>${chips}</div>
    ${townChips ? `<div class="chips chips-towns"><span class="chips-label">Towns</span>${townChips}</div>` : ''}
  </div>
  <a class="stroll" href="#browse-cats"><span>Browse categories</span><i aria-hidden="true"></i></a>
</section>

${marquee ? `<div class="marquee" aria-hidden="true"><div class="marquee-track">${marquee}</div></div>` : ''}

<section class="section" id="browse-cats">
  <div class="wrap">
    <div class="section-head">
      <div><p class="eyebrow">Browse by category</p><h2 class="h2">What do you <em>need?</em></h2></div>
      <a class="link-arrow" href="/categories/">All categories ${icon('arrow')}</a>
    </div>
    <div class="cat-grid">${catTiles}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><p class="eyebrow">Start here</p><h2 class="h2">Local, <em>handpicked.</em></h2></div>
      <a class="link-arrow" href="/browse/?open=1">Who's open now ${icon('arrow')}</a>
    </div>
    ${grid(featured)}
    <div class="cta-actions" style="margin-top:28px">
      <a class="btn btn-gold" href="/browse/">Browse every listing ${icon('arrow')}</a>
      <a class="btn btn-ghost" href="/browse/?open=1">${icon('clock')}Open now</a>
    </div>
  </div>
  ${sampleNotice()}
</section>

<section class="section">
  <div class="wrap towns-split">
    <div class="towns-intro" data-reveal>
      <p class="eyebrow">Towns</p>
      <h2 class="h2">Close to <em>home.</em></h2>
      <p class="muted">Pick a town with real listings — we only surface places that already have businesses you can call.</p>
      <a class="btn btn-ghost" href="/towns/">See all towns ${icon('arrow')}</a>
    </div>
    <div class="town-list">${townTiles}</div>
  </div>
</section>

<section class="section stats-band">
  <div class="wrap stats">
    <div class="stat" data-reveal><span class="stat-num">${filledCats.length}</span><span class="stat-label">Active categories</span></div>
    <div class="stat" data-reveal><span class="stat-num">${filledTowns.length}</span><span class="stat-label">Towns with listings</span></div>
    <div class="stat" data-reveal><span class="stat-num">$0</span><span class="stat-label">To list. Forever.</span></div>
    <div class="stat" data-reveal><span class="stat-num">0</span><span class="stat-label">Paid placements</span></div>
  </div>
</section>

<section class="section owners">
  <div class="wrap owners-inner">
    <div class="owners-copy" data-reveal>
      <p class="eyebrow">For business owners</p>
      <h2 class="display owners-title">Free.<br><em>Not freemium.</em><br>Free.</h2>
      <p class="lead">A beautiful, complete listing for your business — and we never sell your spot to the competitor down the street.</p>
      <a class="btn btn-gold btn-lg" href="/add-your-business/">List your business ${icon('arrow')}</a>
    </div>
    <ul class="perks">
      <li data-reveal><span class="perk-icon">${icon('link')}</span><div><h3>A real link to your site</h3><p>A standard, followed link to your website — not buried, not paywalled.</p></div></li>
      <li data-reveal><span class="perk-icon">${icon('target')}</span><div><h3>Consistent details</h3><p>Your name, address and phone exactly as they appear on Google, Apple Maps and Bing.</p></div></li>
      <li data-reveal><span class="perk-icon">${icon('clock')}</span><div><h3>Live hours</h3><p>Customers see whether you're open right now, on every device.</p></div></li>
      <li data-reveal><span class="perk-icon">${icon('shield')}</span><div><h3>A level field</h3><p>No paid ranking. The plumber with the bigger budget doesn't get to bury you.</p></div></li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head center"><div><p class="eyebrow">How it works</p><h2 class="h2">Live in <em>three steps.</em></h2></div></div>
    <ol class="steps">
      <li class="step" data-reveal><span class="step-num">I</span><h3>Tell us about you</h3><p>Name, address, hours, a short description and the services you offer. Five minutes, tops.</p></li>
      <li class="step" data-reveal><span class="step-num">II</span><h3>We verify</h3><p>A real person checks your details against public records and gives you a call if anything is off.</p></li>
      <li class="step" data-reveal><span class="step-num">III</span><h3>You go live</h3><p>Your page publishes with structured data search engines understand, and you can update it anytime.</p></li>
    </ol>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap faq-wrap">
    <div class="faq-intro" data-reveal><p class="eyebrow">Questions</p><h2 class="h2">The <em>honest</em> answers.</h2><p class="muted">Still curious? Write to <a href="mailto:${e(site.email)}">${e(site.email)}</a>.</p></div>
    <div class="faq">${faqHtml}</div>
  </div>
</section>

<section class="section cta-band">
  <div class="wrap cta-inner" data-reveal>
    <h2 class="display">Your town, <em>found.</em></h2>
    <div class="cta-actions">
      <a class="btn btn-gold btn-lg" href="/browse/">Start exploring ${icon('arrow')}</a>
      <a class="btn btn-ghost btn-lg" href="/add-your-business/">Add a business</a>
    </div>
  </div>
</section>`;

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site.name,
      url: site.url,
      potentialAction: { '@type': 'SearchAction', target: `${site.url}/browse/?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: site.url, email: site.email, logo: `${site.url}/assets/img/icon-512.png`, image: `${site.url}/assets/img/og.jpg`, areaServed: { '@type': 'AdministrativeArea', name: site.region }, knowsAbout: categories.map((c) => c.name) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  addPage('/', layout({ title: 'Home', description: `Find real local businesses across ${site.region} — restaurants, trades, salons, health and more. Free listings, no pay-to-rank, no fake reviews.`, pathname: '/', body, jsonld, bodyClass: 'page-home' }));
}

function browse() {
  const townOptions = towns.map((t) => `<option value="${t.slug}">${e(t.name)}</option>`).join('');
  const catOptions = categories.map((c) => `<option value="${c.slug}">${e(c.name)}</option>`).join('');
  const filledCats = categories.filter((c) => listings.some((l) => l.category === c.slug));
  const quickChips = [
    `<a class="chip chip-open" href="/browse/?open=1">${icon('clock')}Open now</a>`,
    ...filledCats.slice(0, 5).map((c) => `<a class="chip" href="/browse/?category=${c.slug}">${icon(c.icon)}${e(c.name)}</a>`),
  ].join('');
  const catHints = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    query: c.query || c.name,
    n: listings.filter((l) => l.category === c.slug).length,
  }));
  const suggestChips = filledCats
    .slice(0, 4)
    .map((c) => `<a class="chip" href="/browse/?category=${c.slug}">${icon(c.icon)}${e(c.name)}</a>`)
    .join('');
  const body = `
${pageHero({
    eyebrow: 'The directory',
    title: 'Browse <em>everything.</em>',
    lead: `Every business in ${e(site.region)}, in one place. Filter by what you need, where you are, and who's open right now.`,
    extra: `<div class="chips">${quickChips}</div>`,
  })}
<section class="section section-tight">
  <div class="wrap">
    <form class="filters" data-filters onsubmit="return false">
      <label class="f-search">${icon('search')}<input type="search" name="q" placeholder="Search businesses or services" aria-label="Search listings"></label>
      <label class="f-select"><span class="sr-only">Category</span><select name="category"><option value="">All categories</option>${catOptions}</select>${icon('chevron')}</label>
      <label class="f-select"><span class="sr-only">Town</span><select name="town"><option value="">All towns</option>${townOptions}</select>${icon('chevron')}</label>
      <label class="f-toggle"><input type="checkbox" name="open"><span class="toggle" aria-hidden="true"></span>Open now</label>
    </form>
    <p class="results-count" aria-live="polite" data-count>${plural(listings.length, 'business', 'businesses')}</p>
    <h2 class="sr-only">Listings</h2>
    <div class="card-grid" data-results>${listings.map(card).join('')}</div>
    <div class="empty" data-empty hidden data-cat-hints='${e(JSON.stringify(catHints))}'>
      <span class="empty-icon">${icon('search')}</span>
      <h3 data-empty-title>Nothing matches — yet.</h3>
      <p data-empty-lead>Try a broader search, or know a great business that belongs here?</p>
      <div class="chips empty-suggest" data-empty-suggest>${suggestChips}</div>
      <div class="cta-actions"><button class="btn btn-ghost" type="button" data-reset>Clear filters</button><a class="btn btn-gold" href="/add-your-business/">Suggest a business</a></div>
    </div>
  </div>
  ${sampleNotice()}
</section>`;
  addPage('/browse/', layout({ title: 'Browse local businesses', description: `Search and filter every local business listed on ${site.name} across ${site.region}.`, pathname: '/browse/', body }), { noindex: !canIndex(listings) });
}

function categoriesIndex() {
  const withListings = [];
  const empty = [];
  for (const c of categories) {
    const n = listings.filter((l) => l.category === c.slug).length;
    (n ? withListings : empty).push({ c, n });
  }
  const tile = ({ c, n }) => `<a class="cat-tile cat-tile-lg${n ? '' : ' is-empty'}" href="/category/${c.slug}/" data-reveal>
  <span class="cat-icon">${icon(c.icon)}</span>
  <span class="cat-name">${e(c.name)}</span>
  <span class="cat-blurb">${e(c.blurb)}</span>
  <span class="cat-count">${n ? plural(n, 'listing') : 'Coming soon'}</span>
  <span class="cat-arrow" aria-hidden="true">${icon('arrow')}</span>
</a>`;
  const tiles = [...withListings, ...empty].map(tile).join('');
  const c = crumbs([['/', 'Home'], ['/categories/', 'Categories']]);
  const body = `${pageHero({ crumbHtml: c.html, eyebrow: 'Categories', title: 'What do you <em>need?</em>', lead: `${withListings.length} categories with live listings — plus more we're filling town by town.` })}
<section class="section section-tight"><div class="wrap"><div class="cat-grid cat-grid-lg">${tiles}</div></div></section>`;
  addPage('/categories/', layout({ title: 'All categories', description: `Browse local businesses in ${site.region} by category.`, pathname: '/categories/', body, jsonld: [c.ld] }));
}

function townsIndex() {
  const tiles = towns
    .map((t) => {
      const list = listings.filter((l) => l.town === t.slug);
      const cats = [...new Set(list.map((l) => l.cat.name))].slice(0, 4);
      return `<a class="town-card" href="/town/${t.slug}/" data-reveal>
  <span class="town-card-county">${e(t.county)}, ${e(t.state)}</span>
  <span class="town-card-name">${e(t.name)}</span>
  <span class="town-card-cats">${cats.map(e).join(' · ') || 'Coming soon'}</span>
  <span class="town-card-foot"><span>${plural(list.length, 'business', 'businesses')}</span>${icon('arrowUpRight')}</span>
</a>`;
    })
    .join('');
  const c = crumbs([['/', 'Home'], ['/towns/', 'Towns']]);
  const body = `${pageHero({ crumbHtml: c.html, eyebrow: 'Towns', title: 'Pick a <em>place.</em>', lead: `We cover ${towns.length} towns across ${e(site.region)} and grow one community at a time.` })}
<section class="section section-tight"><div class="wrap"><div class="town-cards">${tiles}</div></div></section>`;
  addPage('/towns/', layout({ title: 'All towns', description: `Local businesses by town across ${site.region}.`, pathname: '/towns/', body, jsonld: [c.ld] }));
}

function categoryPages() {
  for (const c of categories) {
    const list = listings.filter((l) => l.category === c.slug);
    const townsHere = towns.filter((t) => list.some((l) => l.town === t.slug));
    const filterChips = townsHere.length > 1 ? `<div class="chips chips-filter" data-chip-filter><button class="chip is-active" type="button" data-town="">All towns</button>${townsHere.map((t) => `<button class="chip" type="button" data-town="${t.slug}">${e(t.name)}</button>`).join('')}</div>` : '';
    const others = categories.filter((o) => o.slug !== c.slug).slice(0, 8).map((o) => `<a class="chip" href="/category/${o.slug}/">${icon(o.icon)}${e(o.name)}</a>`).join('');
    const cr = crumbs([['/', 'Home'], ['/categories/', 'Categories'], [`/category/${c.slug}/`, c.name]]);
    const cards = list.map((l) => card(l).replace('<article class="card"', `<article class="card" data-town="${l.town}"`)).join('');
    // Real links to each town's page (the filter chips above are buttons, which crawlers don't follow).
    const townCount = (t) => real(list).filter((l) => l.town === t.slug).length;
    const byTown = townsHere.filter(townCount).map((t) => `<a class="chip" href="/category/${c.slug}/${t.slug}/">${icon('pin')}${e(t.name)} <span class="muted">(${townCount(t)})</span></a>`).join('');
    const townNames = andList(townsHere.filter(townCount).map((t) => t.name));
    const n = real(list).length;
    const lead = n
      ? `${e(c.blurb)} ${n === 1 ? 'One listing' : `${n} listings`} in ${e(townNames)}, each checked against the business's own website for name, address, phone and hours. No paid placement.`
      : e(c.blurb);
    const body = `${pageHero({ crumbHtml: cr.html, iconName: c.icon, eyebrow: `${plural(list.length, 'listing')} · ${e(site.region)}`, title: `${e(c.name)}`, lead, extra: filterChips })}
<section class="section section-tight"><div class="wrap">
  ${list.length ? `<h2 class="sr-only">${e(c.name)} listings</h2><div class="card-grid" data-chip-results>${cards}</div>` : emptyCategory(c.name)}
</div>${list.length ? sampleNotice() : ''}</section>
${byTown ? `<section class="section section-tight related"><div class="wrap"><h2 class="h3">${e(c.name)} by town</h2><div class="chips">${byTown}</div></div></section>` : ''}
<section class="section section-tight related"><div class="wrap"><h2 class="h3">Other categories</h2><div class="chips">${others}</div></div></section>`;
    const phrase = searchPhrase(c);
    const description = n ? `${phrase} in ${site.region}: ${plural(n, 'verified listing')} in ${townNames} with address, phone, hours and website. ${c.blurb}` : `${phrase} in ${site.region}: ${c.blurb}`;
    addPage(`/category/${c.slug}/`, layout({ title: `${phrase} in ${site.region}`, description, pathname: `/category/${c.slug}/`, body, jsonld: real(list).length ? [cr.ld, itemList(list, `${phrase} in ${site.region}`)] : [cr.ld] }), { noindex: !canIndex(list) });
  }
}

// One page per category in a town: the query "restaurants in Toms River, NJ".
// Same 3-listing rule as the county and town pages, so a thin pair stays noindex.
function placePages() {
  for (const c of categories) {
    for (const t of towns) {
      const list = listings.filter((l) => l.category === c.slug && l.town === t.slug);
      if (!list.length) continue;
      const phrase = searchPhrase(c);
      const keyword = `${phrase} in ${t.name}, ${t.state}`;
      const n = real(list).length;
      const cr = crumbs([['/', 'Home'], ['/categories/', 'Categories'], [`/category/${c.slug}/`, c.name], [`/category/${c.slug}/${t.slug}/`, t.name]]);
      const cards = list.map((l) => card(l)).join('');
      const lead = `${e(keyword)}: ${n === 1 ? 'one verified listing' : `${n} verified listings`}, each checked against the business's own website. ${e(c.blurb)}`;
      const body = `${pageHero({ crumbHtml: cr.html, iconName: c.icon, eyebrow: `${e(t.county)}, ${e(t.state)}`, title: `${e(phrase)} in <em>${e(t.name)}.</em>`, lead })}
<section class="section section-tight"><div class="wrap">
  <h2 class="sr-only">${e(keyword)}</h2>
  <div class="card-grid">${cards}</div>
</div>${sampleNotice()}</section>
<section class="section section-tight related"><div class="wrap"><h2 class="h3">Keep looking</h2><div class="chips">
  <a class="chip" href="/category/${c.slug}/">${icon(c.icon)}All ${e(c.name.toLowerCase())}</a>
  <a class="chip" href="/town/${t.slug}/">${icon('pin')}All of ${e(t.name)}</a>
</div></div></section>`;
      const description = `${keyword}: ${plural(n, 'verified listing')} with address, phone, hours and website. ${c.blurb}`;
      addPage(`/category/${c.slug}/${t.slug}/`, layout({ title: keyword, description, pathname: `/category/${c.slug}/${t.slug}/`, body, jsonld: n ? [cr.ld, itemList(list, keyword)] : [cr.ld] }), { noindex: !canIndex(list) });
    }
  }
}

const emptyCategory = (name) => `<div class="empty"><span class="empty-icon">${icon('sparkles')}</span><h3>No ${e(name.toLowerCase())} listed yet.</h3><p>This category is coming soon — listings are free if you know a great local fit.</p><div class="cta-actions"><a class="btn btn-gold" href="/add-your-business/">Add a business</a><a class="btn btn-ghost" href="/browse/">Browse what's live</a></div></div>`;

function townPages() {
  for (const t of towns) {
    const list = listings.filter((l) => l.town === t.slug);
    const catsHere = categories.filter((c) => list.some((l) => l.category === c.slug));
    const filterChips = catsHere.length > 1 ? `<div class="chips chips-filter" data-chip-filter><button class="chip is-active" type="button" data-cat="">Everything</button>${catsHere.map((c) => `<button class="chip" type="button" data-cat="${c.slug}">${icon(c.icon)}${e(c.name)}</button>`).join('')}</div>` : '';
    const cr = crumbs([['/', 'Home'], ['/towns/', 'Towns'], [`/town/${t.slug}/`, t.name]]);
    const cards = list.map((l) => card(l).replace('<article class="card"', `<article class="card" data-cat="${l.category}"`)).join('');
    const nearby = towns.filter((o) => o.slug !== t.slug).map((o) => `<a class="chip" href="/town/${o.slug}/">${icon('pin')}${e(o.name)}</a>`).join('');
    // Real links to each category's page (the filter chips above are buttons, which crawlers don't follow).
    const catCount = (c) => real(list).filter((l) => l.category === c.slug).length;
    const byCat = catsHere.filter(catCount).map((c) => `<a class="chip" href="/category/${c.slug}/${t.slug}/">${icon(c.icon)}${e(searchPhrase(c))} <span class="muted">(${catCount(c)})</span></a>`).join('');
    const catNames = andList(catsHere.filter(catCount).map((c) => c.name.toLowerCase()));
    const n = real(list).length;
    const lead = n
      ? `${plural(n, 'local business', 'local businesses')} in ${e(t.name)}, ${e(t.county)}, ${e(t.state)} — ${e(catNames)} — with verified address, phone, live hours and a link to each business's own website.`
      : `${plural(list.length, 'local business', 'local businesses')} in ${e(t.name)}, ${e(t.state)} — verified details, live hours, and a direct line to the people who run them.`;
    const body = `${pageHero({ crumbHtml: cr.html, eyebrow: `${e(t.county)}, ${e(t.state)}`, title: `${e(t.name)}`, lead, extra: filterChips })}
<section class="section section-tight"><div class="wrap">
  ${list.length ? `<h2 class="sr-only">Businesses in ${e(t.name)}</h2><div class="card-grid" data-chip-results>${cards}</div>` : emptyCategory(`businesses in ${t.name}`)}
</div>${list.length ? sampleNotice() : ''}</section>
${byCat ? `<section class="section section-tight related"><div class="wrap"><h2 class="h3">Categories in ${e(t.name)}</h2><div class="chips">${byCat}</div></div></section>` : ''}
<section class="section section-tight related"><div class="wrap"><h2 class="h3">Nearby towns</h2><div class="chips">${nearby}</div></div></section>`;
    const place = { '@context': 'https://schema.org', '@type': 'City', name: t.name, containedInPlace: { '@type': 'AdministrativeArea', name: `${t.county}, ${t.state}` } };
    const description = n ? `${plural(n, 'local business', 'local businesses')} in ${t.name}, ${t.state}: ${catNames}. Verified address, phone, hours and website for each, free to list.` : `Find local businesses in ${t.name}, ${t.state} — ${catsHere.map((c) => c.name).slice(0, 5).join(', ')} and more.`;
    addPage(`/town/${t.slug}/`, layout({ title: `Local businesses in ${t.name}, ${t.state}`, description, pathname: `/town/${t.slug}/`, body, jsonld: real(list).length ? [cr.ld, { ...itemList(list, `Local businesses in ${t.name}, ${t.state}`), about: place }] : [cr.ld] }), { noindex: !canIndex(list) });
  }
}

function businessPages() {
  for (const l of listings) {
    const t = l.townObj;
    const cr = crumbs([['/', 'Home'], [`/category/${l.cat.slug}/`, l.cat.name], [`/business/${l.slug}/`, l.name]]);
    const addr = fullAddress(l);
    const mapsQ = encodeURIComponent(`${l.name}, ${addr}`);
    const hoursRows = l.hours ? DAYS.map((d) => `<tr data-day="${d}"><th scope="row">${DAY_NAMES[d]}</th><td>${fmtRange(l.hours[d])}</td></tr>`).join('') : '';
    const services = l.services.map((s) => `<li>${icon('check')}${e(s)}</li>`).join('');
    const discounts = Array.isArray(l.discounts) && l.discounts.length
      ? `<article class="panel" data-reveal>
        <h2 class="panel-title">Discount codes</h2>
        <div class="table-wrap"><table class="discount-table">
          <thead><tr><th scope="col">Code</th><th scope="col">Discount</th><th scope="col">Who it's for</th></tr></thead>
          <tbody>${l.discounts.map((d) => `<tr><td>${e(d.code)}</td><td>${e(d.offer)}</td><td>${e(d.who)}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="hours-note">Same codes as on their site. They apply to printing only, and only one code per order.</p>
      </article>`
      : '';
    const mentions = posts.filter((p) => p.businesses.includes(l.slug));
    // Up to three from the same category, then up to three more from the same town: two crawl paths, not one.
    const sameCat = listings.filter((o) => o.slug !== l.slug && o.category === l.category).slice(0, 3);
    const sameTown = listings.filter((o) => o.slug !== l.slug && o.town === l.town && !sameCat.includes(o)).slice(0, 3);
    const similar = [...sameCat, ...sameTown];
    const map = !l.address
      ? `<div class="map map-placeholder"><div class="map-grid" aria-hidden="true"></div><span class="map-pin">${icon('pin')}</span><p>${e(l.serviceArea || `Based in ${t.name}, ${t.state}`)}</p></div>`
      : l.sample
      ? `<div class="map map-placeholder"><div class="map-grid" aria-hidden="true"></div><span class="map-pin">${icon('pin')}</span><p>Map appears on verified listings</p></div>`
      : `<div class="map"><iframe title="Map of ${e(l.name)}" src="https://maps.google.com/maps?q=${mapsQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`;
    const telHref = `tel:${l.phone.replace(/[^\d+]/g, '')}`;
    const website = l.website ? `<a class="btn btn-ghost btn-block" href="${e(l.website)}" target="_blank" rel="noopener">${icon('globe')}Visit website</a>` : '';
    const directions = l.sample || !l.address ? '' : `<a class="btn btn-ghost btn-block" href="https://www.google.com/maps/search/?api=1&query=${mapsQ}" target="_blank" rel="noopener">${icon('navigation')}Get directions</a>`;
    const dockWebsite = l.website
      ? `<a class="biz-dock-btn" href="${e(l.website)}" target="_blank" rel="noopener">${icon('globe')}<span>Website</span></a>`
      : '';
    const dockDirections = l.sample || !l.address
      ? ''
      : `<a class="biz-dock-btn" href="https://www.google.com/maps/search/?api=1&query=${mapsQ}" target="_blank" rel="noopener">${icon('navigation')}<span>Directions</span></a>`;
    const dock = l.sample
      ? ''
      : `<nav class="biz-dock" aria-label="Quick actions">
  <a class="biz-dock-btn biz-dock-call" href="${telHref}">${icon('phone')}<span>Call</span></a>
  ${dockWebsite}
  ${dockDirections}
</nav>`;

    const body = `
<section class="biz-hero">
  <div class="wrap">
    ${cr.html}
    <div class="biz-head">
      ${mark(l, true)}
      <div>
        <div class="biz-tags">
          <a class="tag" href="/category/${l.cat.slug}/">${icon(l.cat.icon)}${e(l.cat.name)}</a>
          <a class="tag" href="/town/${t.slug}/">${icon('pin')}${e(t.name)}, ${e(t.state)}</a>
          ${l.hours ? `<span class="status status-lg" data-hours="${e(JSON.stringify(l.hours))}"></span>` : ''}
          ${l.sample ? '<span class="tag tag-sample">Sample listing</span>' : l.claimed ? '<span class="tag tag-verified">' + icon('shield') + 'Claimed by owner</span>' : '<span class="tag tag-sample" title="Compiled from public information. Not yet claimed by the owner.">Unclaimed</span>'}
        </div>
        <h1 class="display biz-title">${e(l.name)}</h1>
        <p class="lead">${e(l.summary)}</p>
      </div>
    </div>
  </div>
</section>
<section class="section section-tight">
  <div class="wrap biz-layout">
    <div class="biz-main">
      <article class="panel" data-reveal>
        <h2 class="panel-title">About</h2>
        <p class="biz-desc">${e(l.description)}</p>
        ${l.since ? `<p class="biz-since">Serving ${e(t.name)} since <strong>${e(l.since)}</strong></p>` : ''}
      </article>
      <article class="panel" data-reveal>
        <h2 class="panel-title">Services</h2>
        <ul class="services">${services}</ul>
      </article>
      ${discounts}
      <article class="panel" data-reveal>
        <h2 class="panel-title">Location</h2>
        ${map}
        <p class="biz-address">${icon('pin')}${e(addr)}${!l.address && l.serviceArea ? ` · ${e(l.serviceArea)}` : ''}</p>
        ${l.source === 'osm' ? `<p class="biz-source">Details checked against the business's own website. Base data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, ODbL.</p>` : ''}
      </article>
      ${mentions.length ? `<article class="panel" data-reveal>
        <h2 class="panel-title">On the blog</h2>
        <ul class="post-mentions">${mentions.map((p) => `<li><a href="/blog/${p.slug}/">${e(p.title)}</a><span>${fmtDate(p.date)}</span></li>`).join('')}</ul>
      </article>` : ''}
    </div>
    <aside class="biz-side">
      <div class="panel panel-sticky" data-reveal>
        <a class="btn btn-gold btn-block btn-lg" href="${telHref}">${icon('phone')}${e(l.phone)}</a>
        ${website}
        ${directions}
        <div class="hours" data-hours-table>
          <h2 class="panel-title">Hours</h2>
          ${l.hours ? `<table>${hoursRows}</table>
          <p class="hours-note">Times shown in Eastern Time.</p>` : `<p class="hours-note">Hours aren't listed yet. Call ahead before visiting.</p>`}
        </div>
        ${l.claimed || l.sample ? '' : `<p class="unclaimed-note">${icon('info')}<span>This listing was compiled from public information and hasn't been claimed by the owner yet.</span></p>`}
        <a class="claim" href="/add-your-business/?claim=${l.slug}">${icon('edit')}${l.claimed || l.sample ? 'Own this business? Update this listing' : 'Own this business? Claim this listing'}</a>
        ${l.sample ? '' : `<a class="claim claim-remove" href="mailto:${e(site.email)}?subject=${encodeURIComponent('Remove listing: ' + l.name)}&amp;body=${encodeURIComponent('Please remove this listing: ' + site.url + '/business/' + l.slug + '/\n\nMy name and connection to the business:\n')}">${icon('close')}Remove this listing</a>`}
      </div>
    </aside>
  </div>
  ${l.sample ? `<div class="wrap"><p class="sample-notice">${icon('info')}<span><strong>This is a sample listing.</strong> ${e(l.name)} is a demonstration business, not a real company. Its phone number is in the fictional 555-01xx range.</span></p></div>` : ''}
</section>
${similar.length ? `<section class="section section-alt"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Keep exploring</p><h2 class="h2">You might <em>also like.</em></h2></div></div>${grid(similar)}</div></section>` : ''}
${dock}`;

    const jsonld = [cr.ld];
    if (!l.sample) {
      jsonld.push({
        '@context': 'https://schema.org',
        '@type': ldType(l),
        '@id': `${site.url}/business/${l.slug}/#business`,
        name: l.name,
        image: l.logo ? `${site.url}${l.logo}` : `${site.url}/assets/img/og.jpg`,
        logo: l.logo ? `${site.url}${l.logo}` : undefined,
        mainEntityOfPage: `${site.url}/business/${l.slug}/`,
        description: l.description,
        telephone: l.phone,
        email: l.email || undefined,
        url: l.website || undefined,
        sameAs: (() => {
          const urls = [...(l.website ? [l.website] : []), ...(l.yelp?.url ? [l.yelp.url] : [])];
          return urls.length ? urls : undefined;
        })(),
        aggregateRating: l.yelp?.rating != null ? {
          '@type': 'AggregateRating',
          ratingValue: l.yelp.rating,
          reviewCount: l.yelp.reviewCount || undefined,
          bestRating: 5,
          worstRating: 1,
        } : undefined,
        foundingDate: l.since ? String(l.since) : undefined,
        hasMap: l.address ? `https://www.google.com/maps/search/?api=1&query=${mapsQ}` : undefined,
        address: { '@type': 'PostalAddress', streetAddress: l.address || undefined, addressLocality: t.name, addressRegion: t.state, postalCode: l.zip || undefined, addressCountry: 'US' },
        areaServed: l.serviceArea || `${t.name}, ${t.state}`,
        knowsAbout: l.services.length ? l.services : undefined,
        openingHoursSpecification: l.hours ? DAYS.filter((d) => l.hours[d]).map((d) => {
          const [opens, closes] = l.hours[d].split('-');
          return { '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[d], opens, closes };
        }) : undefined,
      });
    }
    const contact = l.sample ? '' : [
      ['business:contact_data:street_address', l.address], ['business:contact_data:locality', t.name], ['business:contact_data:region', t.state],
      ['business:contact_data:postal_code', l.zip], ['business:contact_data:country_name', 'United States'], ['business:contact_data:phone_number', l.phone], ['business:contact_data:email', l.email], ['business:contact_data:website', l.website],
    ].filter(([, v]) => v).map(([k, v]) => `<meta property="${k}" content="${e(v)}">`).join('\n');
    addPage(`/business/${l.slug}/`, layout({ title: `${l.name} — ${l.cat.name} in ${t.name}, ${t.state}`, description: `${l.name} in ${t.name}, ${t.state}. ${l.summary}`, pathname: `/business/${l.slug}/`, body, jsonld, ogType: l.sample ? 'website' : 'business.business', extraHead: contact, bodyClass: l.sample ? 'page-inner' : 'page-inner page-business' }), { noindex: l.sample });
  }
}

function postCard(p) {
  return `<a class="card post-card" href="/blog/${p.slug}/" data-reveal>
  <div class="card-head"><span class="card-cat">${icon('sparkles')}${fmtDate(p.date)} · ${readMins(p.html)} min read</span></div>
  <h3 class="card-title">${e(p.title)}</h3>
  <p class="card-sum">${e(p.description)}</p>
  <div class="card-foot"><span>Read the article</span></div>
  <span class="card-arrow" aria-hidden="true">${icon('arrowUpRight')}</span>
</a>`;
}

function blogPages() {
  const feedLink = `<link rel="alternate" type="application/rss+xml" title="${e(site.name)} blog" href="${site.url}/blog/feed.xml">`;
  const publisher = { '@type': 'Organization', name: site.name, url: site.url, logo: { '@type': 'ImageObject', url: `${site.url}/assets/img/icon-512.png` } };
  const c = crumbs([['/', 'Home'], ['/blog/', 'Blog']]);
  const body = `${pageHero({ crumbHtml: c.html, eyebrow: 'The blog', title: 'Notes from <em>main street.</em>', lead: `Guides to the independent businesses of ${e(site.region)}. Written from what the businesses publish themselves. Nobody pays to be in them.` })}
<section class="section section-tight"><div class="wrap">
  ${posts.length ? `<h2 class="sr-only">Articles</h2><div class="card-grid">${posts.map(postCard).join('')}</div>` : '<p class="muted">The first article is on its way.</p>'}
</div></section>`;
  addPage('/blog/', layout({ title: 'Blog', description: `Guides to independent local businesses in ${site.region}, from SearchLocal.`, pathname: '/blog/', body, extraHead: feedLink, jsonld: [c.ld, { '@context': 'https://schema.org', '@type': 'Blog', name: `${site.name} blog`, url: `${site.url}/blog/`, publisher, blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${site.url}/blog/${p.slug}/`, datePublished: p.date })) }] }), { noindex: !posts.length });

  for (const p of posts) {
    const url = `${site.url}/blog/${p.slug}/`;
    const cr = crumbs([['/', 'Home'], ['/blog/', 'Blog'], [`/blog/${p.slug}/`, p.title]]);
    const html = p.html.replace(/<p>\s*\{\{card:([a-z0-9-]+)\}\}\s*<\/p>|\{\{card:([a-z0-9-]+)\}\}/g, (_, a, b) => {
      const l = bySlug[a || b];
      if (!l) throw new Error(`posts/${p.slug}: unknown card "${a || b}"`);
      return `<div class="card-grid post-embed">${card(l)}</div>`;
    });
    const more = posts.filter((o) => o.slug !== p.slug).slice(0, 3);
    const body = `${pageHero({ crumbHtml: cr.html, eyebrow: `<time datetime="${p.date}">${fmtDate(p.date)}</time> · ${readMins(p.html)} min read`, title: p.h1 || e(p.title), lead: e(p.lead) })}
<section class="section section-tight"><article class="wrap prose post-body">${html}</article></section>
${more.length ? `<section class="section section-alt"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Keep reading</p><h2 class="h2">More from <em>the blog.</em></h2></div><a class="link-arrow" href="/blog/">All articles ${icon('arrow')}</a></div><div class="card-grid">${more.map(postCard).join('')}</div></div></section>` : ''}`;
    const jsonld = [cr.ld, {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      dateModified: p.updated || p.date,
      url,
      mainEntityOfPage: url,
      image: `${site.url}/assets/img/og.jpg`,
      author: { '@type': 'Organization', name: site.name, url: site.url },
      publisher,
      inLanguage: 'en-US',
      wordCount: html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
      about: p.businesses.map((b) => ({ '@id': `${site.url}/business/${b}/#business` })),
      mentions: p.businesses.map((b) => ({ '@type': ldType(bySlug[b]), name: bySlug[b].name, url: `${site.url}/business/${b}/` })),
    }];
    const head = `${feedLink}
<meta property="article:published_time" content="${p.date}">
<meta property="article:modified_time" content="${p.updated || p.date}">`;
    addPage(`/blog/${p.slug}/`, layout({ title: p.title, description: p.description, pathname: `/blog/${p.slug}/`, body, jsonld, ogType: 'article', extraHead: head }));
  }

  const rssDate = (d) => new Date(d + 'T13:00:00Z').toUTCString();
  fs.mkdirSync(path.join(OUT, 'blog'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'blog', 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${e(site.name)} blog</title>
<link>${site.url}/blog/</link>
<description>${e(`Guides to independent local businesses in ${site.region}.`)}</description>
<language>en-us</language>
<atom:link href="${site.url}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map((p) => `<item><title>${e(p.title)}</title><link>${site.url}/blog/${p.slug}/</link><guid>${site.url}/blog/${p.slug}/</guid><pubDate>${rssDate(p.date)}</pubDate><description>${e(p.description)}</description></item>`).join('\n')}
</channel>
</rss>
`);
}

function addBusiness() {
  const catOptions = categories.map((c) => `<option value="${c.slug}">${e(c.name)}</option>`).join('');
  const townOptions = towns.map((t) => `<option value="${t.slug}">${e(t.name)}, ${e(t.state)}</option>`).join('');
  const body = `
${pageHero({ eyebrow: 'For business owners', title: 'Get <em>listed.</em> Free.', lead: 'Five minutes now, a polished page for your business for good. We verify every submission by hand before it goes live.' })}
<section class="section section-tight">
  <div class="wrap add-layout">
    <aside class="add-aside">
      <div class="panel" data-reveal>
        <h2 class="panel-title">What you get</h2>
        <ul class="services services-stack">
          <li>${icon('check')}A dedicated page for your business</li>
          <li>${icon('check')}A followed link to your website</li>
          <li>${icon('check')}Live "open now" hours</li>
          <li>${icon('check')}Structured data search engines read</li>
          <li>${icon('check')}Placement in your category and town</li>
          <li>${icon('check')}Updates whenever you need them</li>
        </ul>
      </div>
      <div class="panel panel-quiet" data-reveal>
        <h2 class="panel-title">What we won't do</h2>
        <p class="muted">Charge you, sell your ranking, write reviews, or promise you page one of Google. Read the <a href="/guidelines/">listing guidelines</a>.</p>
      </div>
    </aside>
    <div class="panel form-panel" data-reveal>
      <form class="form" data-add-form novalidate data-endpoint="${e(site.formEndpoint)}" data-email="${e(site.email)}">
        <fieldset>
          <legend>The business</legend>
          <div class="field field-full"><label for="f-name">Business name</label><input id="f-name" name="name" required maxlength="120" autocomplete="organization"></div>
          <div class="field"><label for="f-cat">Category</label><div class="select-wrap"><select id="f-cat" name="category" required><option value="">Choose one</option>${catOptions}<option value="other">Something else</option></select>${icon('chevron')}</div></div>
          <div class="field"><label for="f-town">Town</label><div class="select-wrap"><select id="f-town" name="town" required><option value="">Choose one</option>${townOptions}<option value="other">Another town</option></select>${icon('chevron')}</div></div>
          <div class="field field-full"><label for="f-addr">Street address</label><input id="f-addr" name="address" required maxlength="160" autocomplete="street-address" placeholder="As it appears on your Google profile"></div>
          <div class="field"><label for="f-phone">Public phone</label><input id="f-phone" name="phone" type="tel" required maxlength="30" autocomplete="tel" placeholder="(732) 000-0000"></div>
          <div class="field"><label for="f-web">Website <span class="opt">optional</span></label><input id="f-web" name="website" type="url" maxlength="200" placeholder="https://"></div>
        </fieldset>
        <fieldset>
          <legend>The details</legend>
          <div class="field field-full"><label for="f-sum">One-line summary</label><input id="f-sum" name="summary" required maxlength="120" placeholder="What you do, in a sentence"><span class="hint" data-counter-for="f-sum"></span></div>
          <div class="field field-full"><label for="f-desc">Description</label><textarea id="f-desc" name="description" rows="5" maxlength="600" placeholder="What makes you worth the drive? Specialties, history, what customers love."></textarea><span class="hint" data-counter-for="f-desc"></span></div>
          <div class="field field-full"><label for="f-services">Services <span class="opt">comma separated</span></label><input id="f-services" name="services" maxlength="300" placeholder="Drain cleaning, water heaters, emergency repair"></div>
          <div class="field field-full"><label for="f-hours">Hours</label><textarea id="f-hours" name="hours" rows="3" maxlength="300" placeholder="Mon–Fri 8–6, Sat 9–2, Sun closed"></textarea></div>
        </fieldset>
        <fieldset>
          <legend>You</legend>
          <div class="field"><label for="f-contact">Your name</label><input id="f-contact" name="contact" required maxlength="80" autocomplete="name"></div>
          <div class="field"><label for="f-email">Your email</label><input id="f-email" name="email" type="email" required maxlength="120" autocomplete="email"><span class="hint">Never shown publicly.</span></div>
          <label class="check field-full"><input type="checkbox" name="owner" required><span class="check-box" aria-hidden="true">${icon('check')}</span><span>I own or manage this business, or have permission to list it.</span></label>
        </fieldset>
        <input type="text" name="company_url" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="form-error" role="alert" data-form-error hidden></p>
        <button class="btn btn-gold btn-lg btn-block" type="submit">Submit for review ${icon('arrow')}</button>
        <p class="form-fine">By submitting you agree that we may publish the business details above. Your personal contact details stay private — see our <a href="/privacy/">privacy policy</a>.</p>
      </form>
      <div class="form-success" data-form-success hidden tabindex="-1">
        <span class="success-mark">${icon('check')}</span>
        <h2 class="h2">Thank <em>you.</em></h2>
        <p class="lead" data-success-text>We've received your listing. A real person will review it, and you'll hear from us before it goes live.</p>
        <a class="btn btn-ghost" href="/">Back to SearchLocal</a>
      </div>
    </div>
  </div>
</section>`;
  addPage('/add-your-business/', layout({ title: 'Add your business — free', description: `List your business on ${site.name} for free. Verified listings for real local businesses in ${site.region}. No pay-to-rank.`, pathname: '/add-your-business/', body }));
}

function prose(pathname, { eyebrow, title, lead, html, docTitle, description }) {
  const body = `${pageHero({ eyebrow, title, lead })}<section class="section section-tight"><div class="wrap prose" data-reveal>${html}</div></section>`;
  addPage(pathname, layout({ title: docTitle, description, pathname, body }));
}

function staticPages() {
  prose('/about/', {
    docTitle: 'About',
    description: `${site.name} is a free, independent directory of real local businesses in ${site.region}.`,
    eyebrow: 'About',
    title: 'Built for the <em>main street.</em>',
    lead: 'A free directory for the businesses that make a town worth living in.',
    html: `<h2>Why we exist</h2>
<p>Finding a good local business online has gotten harder, not easier. Search results fill up with lead-selling middlemen, national chains and listings that haven't been updated in years. The small shops, crews and kitchens that actually serve a town get buried under whoever pays the most.</p>
<p>${e(site.name)} is the opposite of that. Every listing is a real local business. Every listing is free. And no one can pay to move up.</p>
<h2>What we believe</h2>
<ul>
<li><strong>Free means free.</strong> No trial, no upsell to unlock your own phone number.</li>
<li><strong>Accurate beats exhaustive.</strong> We would rather list fifty businesses with correct hours than five thousand with stale ones.</li>
<li><strong>No fake anything.</strong> No invented reviews, no AI-written testimonials, no padding.</li>
<li><strong>Honesty about search.</strong> A listing helps people find you. It is not a guarantee of rankings, and we won't sell it as one.</li>
</ul>
<h2>Where we are</h2>
<p>We're starting in ${e(site.region)} and growing town by town. A town gets its own page once it has enough verified businesses to be genuinely useful — not before.</p>
<p>Questions, corrections, or a business we should know about? <a href="mailto:${e(site.email)}">${e(site.email)}</a>.</p>`,
  });
  prose('/guidelines/', {
    docTitle: 'Listing guidelines',
    description: `The standard every ${site.name} listing meets.`,
    eyebrow: 'Standards',
    title: 'Listing <em>guidelines.</em>',
    lead: 'The short list of rules that keeps this directory worth using.',
    html: `<h2>Who can be listed</h2>
<ul>
<li>A real, operating business with a physical location or a defined service area in a town we cover.</li>
<li>One listing per location. Multi-location businesses list each location separately.</li>
<li>Home-based service businesses are welcome; we can hide your street address and show your service area instead.</li>
</ul>
<h2>What every listing must have</h2>
<ul>
<li>The business name exactly as customers see it — no added keywords or city names.</li>
<li>An address and phone number that match your other public profiles.</li>
<li>Accurate hours. Tell us when they change.</li>
</ul>
<h2>What we don't allow</h2>
<ul>
<li>Lead-generation services posing as local businesses.</li>
<li>Duplicate or keyword-stuffed listings.</li>
<li>Paid placement, of any kind, in any category.</li>
<li>Reviews written by the business, its staff or anyone paid to write them.</li>
</ul>
<h2>Unclaimed listings</h2>
<p>Some listings are added by us from public information — the business's own website, signage, public records and OpenStreetMap's open map data — so neighbors can find them before the owner has heard of us. Those listings say <strong>Unclaimed</strong> until the owner claims them. We never copy listings from other directories, and we never publish a home address.</p>
<h2>Removals</h2>
<p>Every listing page has a <strong>Remove this listing</strong> link. We remove listings that close, stop answering, or break these guidelines. If your business has closed or you want your listing taken down, email <a href="mailto:${e(site.email)}">${e(site.email)}</a> and we'll do it within two business days.</p>`,
  });
  prose('/privacy/', {
    docTitle: 'Privacy',
    description: `How ${site.name} handles information.`,
    eyebrow: 'Privacy',
    title: 'Plain-language <em>privacy.</em>',
    lead: 'Short version: we collect very little, and we sell none of it.',
    html: `<h2>What's public</h2>
<p>Business details you submit for a listing — name, address, phone, website, hours, description and services — are published on the listing page. That's the point of a directory.</p>
<h2>What stays private</h2>
<p>Your personal name and email from the submission form are used only to verify the listing and contact you about it. We don't publish them, sell them or add you to marketing lists.</p>
<h2>Browsing</h2>
<p>We don't run advertising trackers. Maps on verified listing pages are provided by Google Maps and load only on those pages.</p>
<h2>Contact</h2>
<p>To correct or remove anything, email <a href="mailto:${e(site.email)}">${e(site.email)}</a>.</p>`,
  });
  const nf = `${pageHero({ eyebrow: '404', title: 'Off the <em>map.</em>', lead: "This page doesn't exist — or it moved. Let's get you somewhere useful.", extra: `<div class="cta-actions"><a class="btn btn-gold" href="/browse/">Browse businesses ${icon('arrow')}</a><a class="btn btn-ghost" href="/">Home</a></div>` })}`;
  pages.push(['/404.html', layout({ title: 'Page not found', description: 'Page not found.', pathname: '/404.html', body: nf, noindex: true })]);
}

// ---------- write ----------
const BUILD_ID = Date.now().toString(36);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

home();
browse();
categoriesIndex();
townsIndex();
categoryPages();
townPages();
placePages();
businessPages();
blogPages();
addBusiness();
staticPages();

for (const [p, html] of pages) {
  const file = p.endsWith('.html') ? path.join(OUT, p) : path.join(OUT, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });
fs.cpSync(path.join(SRC, 'static'), OUT, { recursive: true });
for (const [k, v] of Object.entries(STREET)) fs.writeFileSync(path.join(OUT, 'assets', 'img', `street-${k}.svg`), v.svg.replace(/(\d+\.\d)\d+/g, '$1').replace(/>\s+</g, '><'));

// Client-side search index for /browse/
const clientData = listings.map((l) => ({
  slug: l.slug, name: l.name, category: l.category, town: l.town,
  text: [l.name, l.cat.name, l.townObj.name, l.summary, l.description, ...l.services].join(' ').toLowerCase(),
}));
fs.mkdirSync(path.join(OUT, 'assets', 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets', 'data', 'listings.json'), JSON.stringify(clientData));

const today = new Date().toISOString().slice(0, 10);
// Real lastmod: a page's date only moves when its content actually changes.
// Hashes live in src/data/lastmod.json, which is committed — always build locally before pushing.
const LASTMOD_FILE = path.join(SRC, 'data', 'lastmod.json');
const lastmod = fs.existsSync(LASTMOD_FILE) ? JSON.parse(fs.readFileSync(LASTMOD_FILE, 'utf8')) : {};
const pageHtml = Object.fromEntries(pages);
// Only the page's own content counts: <title>, description, structured data and <main>. The shared
// header/footer are excluded, otherwise adding one town to the footer stamps every page "changed today".
const ownContent = (html) => {
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = [...head.matchAll(/<title>[\s\S]*?<\/title>|<meta name="description"[^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g)].map((m) => m[0]).join('');
  const main = html.slice(html.indexOf('<main id="main">'), html.indexOf('</main>'));
  return (meta + main).replace(/\?v=[a-z0-9]+/g, '');
};
for (const p of indexable) {
  const h = crypto.createHash('sha1').update(ownContent(pageHtml[p])).digest('hex').slice(0, 16);
  if (!lastmod[p] || lastmod[p].h !== h) lastmod[p] = { h, d: today };
}
for (const p of Object.keys(lastmod)) if (!indexable.includes(p)) delete lastmod[p];
if (!process.env.CI) fs.writeFileSync(LASTMOD_FILE, JSON.stringify(lastmod, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${site.url}${p}</loc><lastmod>${lastmod[p].d}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'CNAME'), site.domain + '\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`Built ${pages.length} pages (${indexable.length} indexable) → dist/`);

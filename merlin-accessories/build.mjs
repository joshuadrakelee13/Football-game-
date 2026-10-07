// Renders the whole site to static HTML from src/content.mjs.
//
//   node merlin-accessories/build.mjs
//
// Every page shares one header, menu, footer and search index, so navigation is
// identical everywhere. Pages are written as <path>/index.html using the live
// site's URL slugs, and every link is relative, so the output works from any
// host or sub-folder.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVE, company, intro, introMore, visitLine, productsIntro, productsLead, whyChoose, newsletter, partners, categories, blum, store,
  spotlights, toolRepair, about, team, delivery, faq, downloads, charts, bulk, slides, promos, brandMenu, legal, contactForm,
  sandingForm, posts, newsLead,
} from './src/content.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const IMG = join(ROOT, 'assets/img');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Images: resolve the file (the extension may be .webp, .jpg or .png) and read its size
// from the file header so every <img> carries width and height.

function sizeOf(buf) {
  try {
    if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const k = buf.toString('ascii', 12, 16);
      if (k === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
      if (k === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
      if (k === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* fall through */ }
  return null;
}
const imgCache = new Map();
function asset(p) {
  if (imgCache.has(p)) return imgCache.get(p);
  const found = [p, `${p}.webp`, `${p}.jpg`, `${p}.png`].find((c) => /\.\w{3,4}$/.test(c) && existsSync(join(IMG, c)));
  if (!found) throw new Error(`Missing image: assets/img/${p}`);
  const out = { path: `assets/img/${found}`, size: sizeOf(readFileSync(join(IMG, found))) };
  imgCache.set(p, out);
  return out;
}
const img = (r, p, alt = '', { cls = '', lazy = true } = {}) => {
  const a = asset(p);
  const dims = a.size ? ` width="${a.size[0]}" height="${a.size[1]}"` : '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${r(a.path)}" alt="${esc(alt)}"${dims}${lazy ? ' loading="lazy" decoding="async"' : ''}>`;
};

// ---------------------------------------------------------------------------
// Site map. Paths are directories relative to the site root ('' is home).

const P = {
  home: '',
  products: 'products/',
  category: (slug) => `products/${slug}/`,
  blum: 'products/architecturalhardware/blum/',
  spotlight: (slug) => `${slug}/`,
  toolrepair: 'toolrepairservice/',
  about: 'about/',
  team: 'meettheteam/',
  news: 'latestnews/',
  post: (slug) => `post/${slug}/`,
  downloads: 'downloads/',
  charts: 'conversioncharts/',
  contact: 'contact/',
  delivery: 'delivery/',
  faq: 'faq-s/',
  brands: 'brands/',
  bulk: 'bulkboxesandpalletdeals/',
  legal: (slug) => `${slug}/`,
};

const linkTarget = (key) => {
  if (key === 'toolrepairservice') return P.toolrepair;
  if (key === 'downloads') return P.downloads;
  if (key === 'products') return P.products;
  if (key === 'bulkboxesandpalletdeals') return P.bulk;
  if (key === 'delivery') return P.delivery;
  if (spotlights.some((s) => s.slug === key)) return P.spotlight(key);
  if (categories.some((c) => c.slug === key)) return P.category(key);
  return P[key] ?? '';
};

// Links copied from the live site are absolute. Pages we have rebuilt resolve to the local
// copy; brochures, the online catalogue and other sites stay absolute and open in a new tab.
const PAGE_SLUGS = new Map([
  ['toolrepairservice', P.toolrepair], ['about', P.about], ['meettheteam', P.team], ['latestnews', P.news], ['downloads', P.downloads],
  ['conversioncharts', P.charts], ['contact', P.contact], ['delivery', P.delivery], ['faq-s', P.faq], ['bulkboxesandpalletdeals', P.bulk],
  ['products', P.products], ['koniguk', P.spotlight('koniguk')], ['moldex', P.spotlight('moldex')], ['soudaclean', P.spotlight('soudaclean')],
  ['madetoordersandingbelts', P.spotlight('madetoordersandingbelts')], ['termsandconditions', P.legal('termsandconditions')],
  ['privacypolicy', P.legal('privacypolicy')], ['cookiepolicy', P.legal('cookiepolicy')],
]);
function resolveHref(url) {
  if (!url) return { local: P.contact };
  if (url.startsWith(LIVE)) {
    const path = url.slice(LIVE.length).replace(/^\/|\/$/g, '');
    if (path === '') return { local: P.home };
    if (PAGE_SLUGS.has(path)) return { local: PAGE_SLUGS.get(path) };
    if (path === 'products/architecturalhardware/blum') return { local: P.blum };
    const m = path.match(/^products\/([a-z]+)$/);
    if (m && categories.some((c) => c.slug === m[1])) return { local: P.category(m[1]) };
    const post = path.match(/^post\/(.+)$/);
    if (post && posts.some((p) => p.slug === post[1])) return { local: P.post(post[1]) };
  }
  return { external: url };
}
const href = (r, url) => { const t = resolveHref(url); return t.local !== undefined ? { href: r(t.local), attrs: '' } : { href: t.external, attrs: ' target="_blank" rel="noopener"' }; };

const downloadsMenu = [
  { path: P.downloads, label: 'Downloads', desc: 'Download our brochures' },
  { path: P.charts, label: 'Conversion Charts', desc: 'Imperial / metric, spanner and washer charts' },
];
const aboutMenu = [
  { path: P.about, label: 'About Merlin', desc: `Over 45 years serving the building industry` },
  { path: P.delivery, label: 'Delivery', desc: 'Local and national delivery' },
  { path: P.team, label: 'Meet the Team', desc: 'The people behind the counter' },
  { path: P.news, label: 'Latest News', desc: 'News, offers and trade guides' },
];

// ---------------------------------------------------------------------------
// Icons: one stroke family so the set reads as a system.

const ICONS = {
  tube: '<path d="M9 3h6v3H9z"/><path d="M8 6h8l-1 13a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/><path d="M8.5 11h7"/>',
  bolt: '<path d="M8 3h8l2 3-2 3H8L6 6z"/><path d="M10 9v12M14 9v12M10 13h4M10 17h4"/>',
  screw: '<path d="M7 3h10v3H7z"/><path d="M9 6h6l-1 12-2 3-2-3z"/><path d="M9.3 9l5.4 2M9.5 12.5l5 2M10 16l3.6 1.4"/>',
  nail: '<path d="M6 4h12"/><path d="M12 4v14l-1 3h2l-1-3"/>',
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3M20.5 12h-3M12 20.5v-3M3.5 12h3"/>',
  helmet: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M3 16h18v2H3z"/><path d="M12 8V5M9 9l-1-3M15 9l1-3"/>',
  drill: '<path d="M4 6h11a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H4z"/><path d="M18 9h3"/><path d="M8 12l-1 8h4l1-8"/>',
  blade: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5l2 4M20.5 12l-4 2M12 20.5l-2-4M3.5 12l4-2"/><circle cx="12" cy="12" r="2"/>',
  gate: '<path d="M4 4v17M20 4v17"/><path d="M4 8h16M4 17h16"/><path d="M8 8v9M12 8v9M16 8v9"/>',
  brick: '<path d="M3 5h18v14H3z"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
  hinge: '<path d="M5 3h5v18H5zM14 3h5v18h-5z"/><path d="M10 7h4M10 12h4M10 17h4"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  ruler: '<path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  mail: '<path d="M3 5h18v14H3z"/><path d="M3 6l9 7 9-7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  linkedin: '<path d="M4 9h4v11H4zM6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h4v1.6c.7-1.1 2-1.9 3.6-1.9 3 0 3.4 2 3.4 4.6V20h-4v-5.8c0-1.3-.3-2.2-1.6-2.2s-1.4 1-1.4 2.2V20h-4z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.8 7.3h.01"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7 9h7M7 13h7M7 16h4"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

// ---------------------------------------------------------------------------
// Shared chrome

function rel(from, to) {
  const depth = from.split('/').filter(Boolean).length;
  const up = '../'.repeat(depth);
  return (up + to) || './';
}

const hoursText = (h) => `Mon – Fri ${h.open} – ${h.close}`;

const logo = (r, cls = 'logo') =>
  `<img class="${cls}" src="${r('assets/img/logo.png')}" alt="${company.name}" width="${asset('logo').size[0]}" height="${asset('logo').size[1]}">`;

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const anchor = slug;

// Unique anchor ids for each sub-range on a page (the live Architectural Hardware page repeats one heading).
for (const c of [...categories, blum]) {
  const seen = new Map();
  for (const g of c.groups) {
    const base = anchor(g.name); const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    g.id = n === 1 ? base : `${base}-${n}`;
  }
}

function socialLinks(extra = '') {
  return [['facebook', company.facebook, 'Facebook'], ['linkedin', company.linkedin, 'LinkedIn'], ['instagram', company.instagram, 'Instagram']]
    .map(([ic, url, label]) => `<a class="social-link${extra}" href="${url}" target="_blank" rel="noopener" aria-label="${label}">${icon(ic)}</a>`).join('');
}

function megaMenu(r, current) {
  const cats = categories.map((c) => `
          <li><a class="mega-link${current === P.category(c.slug) ? ' is-current' : ''}" href="${r(P.category(c.slug))}">
            <span class="mega-icon">${icon(c.icon)}</span>
            <span><strong>${esc(c.name)}</strong><small>${esc(c.lead)}</small></span>
          </a></li>`).join('');
  const spots = spotlights.map((s) => `
          <li><a href="${r(P.spotlight(s.slug))}"><small>${esc(s.kicker.split(' · ')[0])}</small>${esc(s.name)}</a></li>`).join('');
  return `
      <div class="mega" id="menu-products" data-menu-panel>
        <div class="container mega-inner">
          <ul class="mega-grid">${cats}
          </ul>
          <aside class="mega-aside">
            <p class="mega-heading">Featured ranges</p>
            <ul class="mega-spots">${spots}
              <li><a href="${r(P.bulk)}"><small>Volume pricing</small>${esc(bulk.navLabel)}</a></li>
            </ul>
            <a class="mega-card" href="${r(P.toolrepair)}">
              ${icon('wrench')}
              <span><strong>Tool Repair Service</strong><small>${esc(toolRepair.checks.slice(0, 3).join(', '))}</small></span>
            </a>
            <a class="btn btn-ghost btn-block" href="${r(P.products)}">View all products ${icon('arrow')}</a>
            <a class="text-link" href="${store.all}" target="_blank" rel="noopener">Online catalogue ${icon('external')}</a>
          </aside>
        </div>
      </div>`;
}

function dropMenu(id, items, r, current, cls = '') {
  return `
      <div class="drop ${cls}" id="${id}" data-menu-panel>
        <ul>${items.map((i) => `
          <li><a href="${i.url ? i.url : r(i.path)}"${i.url ? ' target="_blank" rel="noopener"' : ''}${current === i.path ? ' aria-current="page"' : ''}><strong>${esc(i.label)}</strong>${i.desc ? `<small>${esc(i.desc)}</small>` : ''}</a></li>`).join('')}
        </ul>
      </div>`;
}

const brandItems = () => [
  ...brandMenu.map((b) => (b.link ? { path: linkTarget(b.link), label: b.name } : { url: b.href, label: b.name })),
  { path: P.brands, label: 'All brands', desc: 'Our trading partnerships' },
];

function header(r, current, section) {
  const is = (s) => (section === s ? ' is-active' : '');
  const cur = (p) => (current === p ? ' aria-current="page"' : '');
  return `
<a class="skip-link" href="#main">Skip to content</a>
<header class="masthead" data-masthead>
  <div class="container masthead-inner">
    <a class="brand" href="${r(P.home)}">${logo(r)}</a>

    <button class="mast-search" type="button" data-search-open aria-label="Search products, brands and pages">
      <span class="mast-search-label">Search products, brands &amp; pages</span>${icon('search')}
    </button>

    <div class="mast-contact">
      <a class="mast-phone" href="${company.phoneHref}">${company.phone}</a>
      <p class="mast-hours">Monday - Friday ${company.hours.office.open} - ${company.hours.office.close}<br>Trade Counter ${company.hours.counter.open} - ${company.hours.counter.close}</p>
      <p class="status" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text"></span></p>
    </div>

    <div class="mast-mobile">
      <button class="icon-button" type="button" data-search-open aria-label="Search">${icon('search')}</button>
      <a class="icon-button" href="${company.phoneHref}" aria-label="Call ${company.phone}">${icon('phone')}</a>
      <button class="icon-button" type="button" data-drawer-open aria-controls="drawer" aria-label="Open menu">${icon('menu')}</button>
    </div>
  </div>
</header>

<nav class="navbar" aria-label="Main" data-navbar>
  <div class="container navbar-inner">
    <a class="navbar-logo" href="${r(P.home)}" aria-label="${company.name} home" tabindex="-1">${logo(r, 'logo logo-sm')}</a>
    <ul class="nav-list">
      <li class="nav-item${is('home')}"><a class="nav-link" href="${r(P.home)}"${cur(P.home)}>Home</a></li>
      <li class="nav-item has-menu has-mega${is('products')}" data-menu>
        <a class="nav-link" href="${r(P.products)}"${cur(P.products)}>Products</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-products" aria-label="Show product categories">${icon('chevron')}</button>
        ${megaMenu(r, current)}
      </li>
      <li class="nav-item${is('repair')}"><a class="nav-link" href="${r(P.toolrepair)}"${cur(P.toolrepair)}>Tool Repair Service</a></li>
      <li class="nav-item has-menu${is('brands')}" data-menu>
        <a class="nav-link" href="${r(P.brands)}"${cur(P.brands)}>Brands</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-brands" aria-label="Show brands">${icon('chevron')}</button>
        ${dropMenu('menu-brands', brandItems(), r, current)}
      </li>
      <li class="nav-item has-menu${is('about')}" data-menu>
        <a class="nav-link" href="${r(P.about)}"${cur(P.about)}>About</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-about" aria-label="Show about pages">${icon('chevron')}</button>
        ${dropMenu('menu-about', aboutMenu, r, current)}
      </li>
      <li class="nav-item has-menu${is('downloads')}" data-menu>
        <a class="nav-link" href="${r(P.downloads)}"${cur(P.downloads)}>Downloads</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-downloads" aria-label="Show downloads">${icon('chevron')}</button>
        ${dropMenu('menu-downloads', downloadsMenu, r, current)}
      </li>
      <li class="nav-item${is('contact')}"><a class="nav-link" href="${r(P.contact)}"${cur(P.contact)}>Contact</a></li>
      <li class="nav-item${is('bulk')}"><a class="nav-link" href="${r(P.bulk)}"${cur(P.bulk)}>${esc(bulk.navLabel).replace(/&amp;/g, '&amp;')}</a></li>
    </ul>
    <div class="navbar-tools">
      <button class="icon-button" type="button" data-search-open aria-label="Search">${icon('search')}</button>
      <a class="navbar-phone" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
    </div>
  </div>
</nav>

<dialog class="drawer" id="drawer" aria-label="Menu">
  <div class="drawer-head">
    <a class="brand" href="${r(P.home)}">${logo(r, 'logo logo-sm')}</a>
    <button class="icon-button" type="button" data-drawer-close aria-label="Close menu">${icon('close')}</button>
  </div>
  <button class="drawer-search" type="button" data-search-open>${icon('search')} Search products, brands &amp; pages</button>
  <nav aria-label="Mobile">
    <a class="drawer-link" href="${r(P.home)}">Home</a>
    <details class="drawer-group"${section === 'products' ? ' open' : ''}>
      <summary>Products ${icon('chevron')}</summary>
      <ul>
        <li><a href="${r(P.products)}"><strong>All products</strong></a></li>${categories.map((c) => `
        <li><a href="${r(P.category(c.slug))}"${cur(P.category(c.slug))}>${icon(c.icon)} ${esc(c.name)}</a></li>`).join('')}${spotlights.map((s) => `
        <li><a href="${r(P.spotlight(s.slug))}"${cur(P.spotlight(s.slug))}>${icon('spark')} ${esc(s.name)}</a></li>`).join('')}
        <li><a href="${store.all}" target="_blank" rel="noopener">${icon('external')} Online catalogue</a></li>
      </ul>
    </details>
    <a class="drawer-link" href="${r(P.toolrepair)}">Tool Repair Service</a>
    <details class="drawer-group"${section === 'brands' ? ' open' : ''}>
      <summary>Brands ${icon('chevron')}</summary>
      <ul>${brandItems().map((i) => `<li><a href="${i.url ? i.url : r(i.path)}"${i.url ? ' target="_blank" rel="noopener"' : ''}${cur(i.path)}>${esc(i.label)}</a></li>`).join('')}</ul>
    </details>
    <details class="drawer-group"${section === 'about' ? ' open' : ''}>
      <summary>About ${icon('chevron')}</summary>
      <ul>${aboutMenu.map((i) => `<li><a href="${r(i.path)}"${cur(i.path)}>${esc(i.label)}</a></li>`).join('')}</ul>
    </details>
    <details class="drawer-group"${section === 'downloads' ? ' open' : ''}>
      <summary>Downloads ${icon('chevron')}</summary>
      <ul>${downloadsMenu.map((i) => `<li><a href="${r(i.path)}"${cur(i.path)}>${esc(i.label)}</a></li>`).join('')}</ul>
    </details>
    <a class="drawer-link" href="${r(P.contact)}">Contact</a>
    <a class="drawer-link" href="${r(P.bulk)}">${bulk.navLabel.replace(/&/g, '&amp;')}</a>
  </nav>
  <div class="drawer-foot">
    <p class="status" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Trade counter ${hoursText(company.hours.counter)}</span></p>
    <a class="btn btn-primary btn-block" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
    <a class="btn btn-ghost btn-block" href="mailto:${company.email}">${icon('mail')} Email us</a>
  </div>
</dialog>

<dialog class="search-dialog" id="search" aria-label="Search">
  <div class="search-box">
    <div class="search-field">
      ${icon('search')}
      <input type="search" placeholder="Search e.g. silicone, post spikes, Makita…" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" aria-label="Search" data-search-input>
      <button class="icon-button" type="button" data-search-close aria-label="Close search">${icon('close')}</button>
    </div>
    <ul class="search-results" id="search-results" role="listbox" data-search-results></ul>
    <p class="search-hint"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></p>
  </div>
</dialog>`;
}

const newsletterBand = (r) => `
<section class="newsletter" aria-labelledby="newsletter-title">
  <div class="container newsletter-inner">
    ${img(r, 'logo-icon', '', { cls: 'newsletter-mark' })}
    <div class="newsletter-copy">
      <h2 id="newsletter-title">${esc(newsletter.heading)}</h2>
      <form class="newsletter-form" data-newsletter data-email="${company.email}">
        <label class="sr-only" for="nl-email">Email address</label>
        <input id="nl-email" type="email" name="email" required placeholder="${esc(newsletter.placeholder)}" autocomplete="email">
        <button class="btn btn-primary" type="submit">Submit</button>
      </form>
    </div>
  </div>
</section>`;

function partnerStrip(r) {
  return `
<section class="section section-tight partners" aria-labelledby="partners-title">
  <div class="container">
    <h2 class="brands-label" id="partners-title">Some of our trading partnerships</h2>
    <ul class="partner-strip">${partners.map((p) => `
      <li>${img(r, p.file, p.name)}</li>`).join('')}
    </ul>
  </div>
</section>`;
}

function footer(r) {
  const col = (title, items) => `
      <div class="footer-col">
        <p class="footer-title">${title}</p>
        <ul>${items.map(([path, label]) => `<li><a href="${r(path)}">${esc(label)}</a></li>`).join('')}</ul>
      </div>`;
  return `
${newsletterBand(r)}

<section class="contact-band">
  <div class="container contact-band-inner">
    <div>
      <h2>${esc(company.yearsLine)}</h2>
      <p>${esc(company.expertLine)}. Monday - Friday ${company.hours.office.open} - ${company.hours.office.close} · Trade Counter ${company.hours.counter.open} - ${company.hours.counter.close}</p>
    </div>
    <div class="contact-band-actions">
      <a class="btn btn-light" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
      <a class="btn btn-outline-light" href="${r(P.contact)}">Send an enquiry</a>
    </div>
  </div>
</section>

<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-col footer-about">
      <a class="brand" href="${r(P.home)}">${logo(r)}</a>
      <p>${esc(company.tagline)}. ${esc(company.yearsLine)}.</p>
      <p class="footer-social-row">${socialLinks()}</p>
    </div>
    ${col('Products', [[P.products, 'All products'], ...categories.map((c) => [P.category(c.slug), c.name])])}
    ${col('Company', [[P.about, 'About'], [P.team, 'Meet the Team'], [P.news, 'Latest News'], [P.delivery, 'Delivery'], [P.contact, 'Contact'], [P.bulk, bulk.navLabel]])}
    ${col('Helpful advice', [[P.faq, "FAQ's"], [P.toolrepair, 'Tool Repair Service'], [P.downloads, 'Downloads'], [P.charts, 'Conversion Charts'], [P.brands, 'Brands']])}
    <div class="footer-col">
      <p class="footer-title">Contact</p>
      <address>
        ${company.address.map(esc).join('<br>')}
      </address>
      <p><a href="${company.phoneHref}">${company.phone.replace(/ /g, '')}</a><br><a href="mailto:${company.email}">${company.email}</a></p>
      <dl class="footer-hours">
        <dt>Opening Hours</dt><dd>Monday to Friday: ${company.hours.office.open} - ${company.hours.office.close}</dd>
        <dt>Trade Counter</dt><dd>${company.hours.counter.open} - ${company.hours.counter.close}</dd>
      </dl>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>© ${new Date().getFullYear()} Merlin Accessories Limited &nbsp;|&nbsp; Company Registration No. ${company.regNo} &nbsp;|&nbsp; VAT No. ${company.vatNo}</p>
    <p class="footer-legal">${legal.map((l) => `<a href="${r(P.legal(l.slug))}">${esc(l.title)}</a>`).join('')}</p>
    <a class="to-top" href="#top">${icon('up')} Back to top</a>
  </div>
</footer>

<nav class="action-bar" aria-label="Quick actions">
  <a href="${company.phoneHref}">${icon('phone')}<span>Call</span></a>
  <a href="${company.mapsHref}" target="_blank" rel="noopener">${icon('pin')}<span>Directions</span></a>
  <a href="mailto:${company.email}">${icon('mail')}<span>Email</span></a>
  <button type="button" data-search-open>${icon('search')}<span>Search</span></button>
</nav>`;
}

function breadcrumbs(r, trail) {
  if (!trail) return '';
  const items = [['', 'Home'], ...trail];
  return `
<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>${items.map(([path, label], i) => i === items.length - 1
    ? `<li><span aria-current="page">${esc(label)}</span></li>`
    : `<li><a href="${r(path)}">${esc(label)}</a></li>`).join('')}
  </ol>
</nav>`;
}

function pageHero(r, { trail, kicker, title, lead, actions = '', iconName }) {
  return `
<section class="page-hero">
  <div class="container">
    ${breadcrumbs(r, trail)}
    <div class="page-hero-inner">
      ${iconName ? `<span class="page-hero-icon">${icon(iconName)}</span>` : ''}
      <div>
        ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
        <h1>${esc(title)}</h1>
        ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
        ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
      </div>
    </div>
  </div>
</section>`;
}

const enquire = (subject) =>
  `mailto:${company.email}?subject=${encodeURIComponent(subject)}`;

function layout({ path, title, description, section, body, head = '', partnersStrip = true }) {
  const r = (to) => rel(path, to);
  const fullTitle = path === '' ? title : `${title} | ${company.name}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#243077">
<link rel="icon" href="${r('assets/img/favicon.png')}" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${r('assets/css/brand.css')}">
<link rel="stylesheet" href="${r('assets/css/site.css')}">
<script type="speculationrules">{"prefetch":[{"where":{"selector_matches":"a[href]:not([href^='mailto']):not([href^='tel']):not([target])"},"eagerness":"moderate"}]}</script>
<script src="${r('assets/js/search-index.js')}" defer></script>
<script src="${r('assets/js/site.js')}" defer></script>
${head}
</head>
<body id="top" data-root="${r('')}"${path === '' ? ' class="is-home"' : ''}>
${header(r, path, section || (path === '' ? 'home' : ''))}
<main id="main" tabindex="-1">
${body(r)}
${partnersStrip ? partnerStrip(r) : ''}
</main>
${footer(r)}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pages

const pages = [];
const page = (p) => pages.push(p);

const categoryCard = (r, c) => `
  <li><a class="cat-card" href="${r(P.category(c.slug))}">
    <span class="cat-icon">${icon(c.icon)}</span>
    <span class="cat-body"><strong>${esc(c.name)}</strong><small>${esc(c.lead)}</small></span>
    <span class="cat-arrow">${icon('arrow')}</span>
  </a></li>`;

const catTile = (r, c) => `
  <li><a class="cat-tile" href="${r(P.category(c.slug))}">
    <span class="cat-tile-media">${c.image ? img(r, c.image, c.name) : icon(c.icon, 'icon icon-xl')}</span>
    <span class="cat-tile-name">${esc(c.name)}</span>
  </a></li>`;

const external = (url) => ` href="${url}" target="_blank" rel="noopener"`;

function newsItem(r, post) {
  const first = post.blocks.find((b) => (b.t === 'p' || b.t === 'h3') && b.text && b.text.length > 40);
  return `
        <li class="news-item">
          <a class="news-cover" href="${r(P.post(post.slug))}" tabindex="-1" aria-hidden="true">${img(r, post.cover, '')}</a>
          <div>
            <p class="news-meta">${dateText(post.date)} · ${esc(post.read)}</p>
            <h3><a href="${r(P.post(post.slug))}">${esc(post.title)}</a></h3>
            <p>${esc(first ? first.text.slice(0, 230) + (first.text.length > 230 ? '…' : '') : '')}</p>
            <a class="text-link" href="${r(P.post(post.slug))}">Read more ${icon('arrow')}</a>
          </div>
        </li>`;
}
const dateText = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const enquiryCard = (subject, what) => `
    <aside class="enquiry-card">
      <h2 class="h3">To enquire or order</h2>
      <p>Call the team on ${company.phone} or email us.</p>
      <div class="enquiry-actions">
        <a class="btn btn-primary" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
        <a class="btn btn-ghost" href="${enquire(subject)}">${icon('mail')} Email us</a>
      </div>
    </aside>`;

// Home -----------------------------------------------------------------------
page({
  path: P.home,
  title: `${company.name} | ${company.tagline} | ${company.town}`,
  description: `${intro} ${introMore}`,
  partnersStrip: false,
  head: `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HardwareStore',
    name: company.name,
    telephone: company.phone,
    email: company.email,
    foundingDate: String(company.since),
    vatID: company.vatNo,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${company.address[0]}, ${company.address[1]}`,
      addressLocality: company.address[2],
      postalCode: company.address[3],
      addressCountry: 'GB',
    },
    openingHours: 'Mo-Fr 07:00-17:00',
    sameAs: [company.facebook, company.linkedin, company.instagram],
  })}</script>`,
  body: (r) => `
<section class="home-top">
  <div class="container">
    <div class="slideshow" data-slideshow role="region" aria-roledescription="carousel" aria-label="Featured offers and services">
      <div class="slides">${slides.map((s, i) => `
        <a class="slide${i === 0 ? ' is-active' : ''}" href="${r(linkTarget(s.link))}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}"${i === 0 ? '' : ' aria-hidden="true" tabindex="-1"'}>
          ${img(r, s.image, s.alt, { lazy: i !== 0 })}
        </a>`).join('')}
      </div>
      <div class="slide-controls">
        <button class="slide-btn" type="button" data-slide-prev aria-label="Previous slide">${icon('prev')}</button>
        <ul class="slide-dots">${slides.map((s, i) => `<li><button type="button" data-slide-dot="${i}" aria-label="Show slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}></button></li>`).join('')}</ul>
        <button class="slide-btn" type="button" data-slide-next aria-label="Next slide">${icon('next')}</button>
        <button class="slide-btn" type="button" data-slide-toggle aria-label="Pause slideshow">${icon('pause')}</button>
      </div>
    </div>

    <ul class="promo-grid">${promos.map((pr) => {
    const h = pr.href ? { href: pr.href, attrs: ' target="_blank" rel="noopener"' } : { href: r(linkTarget(pr.link)), attrs: '' };
    return `
      <li><a class="promo" href="${h.href}"${h.attrs}>
        <span class="promo-media">${img(r, pr.image, pr.alt, { lazy: false })}</span>
      </a></li>`;
  }).join('')}
    </ul>
  </div>
</section>

<section class="section intro">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="kicker">Trade supplier · ${esc(company.town)} · Since ${company.since}</p>
      <h1>${esc(company.tagline)}</h1>
      <p class="lead">${esc(intro)}</p>
      <p class="lead">${esc(introMore)}</p>
      <p class="lead lead-strong">${esc(company.productCount)}</p>
      <button class="hero-search" type="button" data-search-open>
        ${icon('search')}<span>Search products, brands &amp; pages</span><kbd>/</kbd>
      </button>
    </div>
    <aside class="visit-card" aria-label="Trade counter">
      <p class="status status-lg" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Trade counter ${hoursText(company.hours.counter)}</span></p>
      <dl class="hours">
        <div><dt>Trade Counter</dt><dd>${hoursText(company.hours.counter)}</dd></div>
        <div><dt>Office</dt><dd>${hoursText(company.hours.office)}</dd></div>
      </dl>
      <address>${icon('pin')}<span>${company.address.map(esc).join(', ')}</span></address>
      <p class="visit-line">${esc(visitLine)}</p>
      <div class="visit-actions">
        <a class="btn btn-primary" href="${company.phoneHref}">${icon('phone')} Call</a>
        <a class="btn btn-ghost" href="${company.mapsHref}" target="_blank" rel="noopener">${icon('pin')} Directions</a>
      </div>
    </aside>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <p class="kicker">Products</p>
        <h2>${esc(company.productCount)}</h2>
      </div>
      <a class="text-link" href="${r(P.products)}">All products ${icon('arrow')}</a>
    </div>
    <ul class="cat-tile-grid">${categories.map((c) => catTile(r, c)).join('')}
    </ul>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Why Choose Merlin?</p><h2>${esc(company.yearsLine)}</h2></div><a class="text-link" href="${r(P.about)}">Find out more ${icon('arrow')}</a></div>
    <ul class="why-grid">${whyChoose.map((w) => `
      <li><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p>${w.link ? `<a class="text-link" href="${r(linkTarget(w.link))}">Delivery Service ${icon('arrow')}</a>` : ''}</li>`).join('')}
    </ul>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Resources</p><h2>Helpful advice</h2></div></div>
    <ul class="feature-grid">
      <li><a class="feature feature-primary" href="${r(P.toolrepair)}">
        ${icon('wrench', 'icon icon-lg')}
        <h3>Tool Repair Service</h3>
        <p>${esc(toolRepair.lead)}.</p>
        <span class="text-link">Find out more ${icon('arrow')}</span>
      </a></li>
      <li><a class="feature" href="${r(P.downloads)}">
        ${icon('file', 'icon icon-lg')}
        <h3>Downloads</h3>
        <p>Download our brochures, including the Glazing &amp; Building Consumables Catalogue for the Window Industry.</p>
        <span class="text-link">See downloads ${icon('arrow')}</span>
      </a></li>
      <li><a class="feature" href="${r(P.charts)}">
        ${icon('ruler', 'icon icon-lg')}
        <h3>Conversion Charts &amp; Sizing</h3>
        <p>Imperial / metric, spanner, Allen key and flat washer charts, with a quick converter.</p>
        <span class="text-link">Open charts ${icon('arrow')}</span>
      </a></li>
    </ul>
  </div>
</section>

${partnerStrip(r)}

<section class="section section-alt">
  <div class="container split">
    <div>
      <p class="kicker">About Merlin</p>
      <h2>${esc(about.heading)}</h2>
      <p>${esc(intro)}</p>
      <p>${esc(introMore)}</p>
      <p>${esc(visitLine)}</p>
      <div class="hero-actions">
        <a class="btn btn-ghost" href="${r(P.about)}">Find out more</a>
        <a class="btn btn-ghost" href="${r(P.team)}">Meet the team</a>
      </div>
    </div>
    <div>
      <div class="section-head section-head-sm"><h2 class="h3">Latest news</h2><a class="text-link" href="${r(P.news)}">All news ${icon('arrow')}</a></div>
      <ul class="news-list news-list-compact">${posts.slice(0, 2).map((n) => newsItem(r, n)).join('')}</ul>
    </div>
  </div>
</section>`,
});

// Products overview ----------------------------------------------------------
page({
  path: P.products,
  title: 'Products',
  section: 'products',
  description: productsLead,
  body: (r) => `
${pageHero(r, {
    trail: [[P.products, 'Products']],
    kicker: `${categories.length} categories`,
    title: 'Products',
    lead: productsLead,
    actions: `<button class="btn btn-primary" type="button" data-search-open>${icon('search')} Search the range</button>
      <a class="btn btn-ghost" href="${r(P.downloads)}">${icon('file')} Download brochures</a>`,
  })}
<section class="section">
  <div class="container">
    <p class="prose">${esc(productsIntro)}</p>
    <ul class="range-grid">${categories.map((c) => `
      <li class="range-card">
        <a class="range-head" href="${r(P.category(c.slug))}">
          <span class="range-thumb">${c.image ? img(r, c.image, '') : icon(c.icon, 'icon icon-lg')}</span>
          <span><strong>${esc(c.name)}</strong><small>${esc(c.lead)}</small></span>
        </a>
        ${c.groups.length ? `<ul class="range-links">${c.groups.map((g) => `<li><a href="${r(P.category(c.slug))}#${g.id}">${esc(g.name)}</a></li>`).join('')}</ul>` : '<div class="range-links"></div>'}
        <a class="text-link" href="${r(P.category(c.slug))}">View ${esc(c.name)} ${icon('arrow')}</a>
      </li>`).join('')}
    </ul>
  </div>
</section>
<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Products</p><h2>Featured ranges</h2></div></div>
    <ul class="spot-grid">${spotlights.map((s) => `
      <li><a class="spot" href="${r(P.spotlight(s.slug))}"><p class="kicker">${esc(s.kicker)}</p><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><span class="text-link">View ${icon('arrow')}</span></a></li>`).join('')}
      <li><a class="spot spot-dark" href="${r(P.toolrepair)}"><p class="kicker">Service</p><h3>Tool Repair Service</h3><p>${esc(toolRepair.productsText)}</p><span class="text-link">Find out more ${icon('arrow')}</span></a></li>
    </ul>
    <div class="repair-feature">
      ${img(r, toolRepair.productsImage, 'Merlin Accessories Tool Repair Service')}
      <div>
        <h3>Tool Repair Service</h3>
        <p>${esc(toolRepair.productsText)}</p>
        <p>${esc(toolRepair.productsTools)}</p>
        <a class="btn btn-primary" href="${r(P.toolrepair)}">Find out more</a>
      </div>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Online catalogue</p><h2>Browse the online catalogue</h2></div><a class="text-link"${external(store.all)}>All products ${icon('external')}</a></div>
    <p class="prose">${esc(store.note)} Each link below opens that category on the live site.</p>
    <ul class="chips chips-links">${store.categories.map(([s, label]) => `<li><a class="chip"${external(store.base + s)}>${esc(label)}</a></li>`).join('')}
    </ul>
  </div>
</section>`,
});

// Category pages --------------------------------------------------------------
function sideNav(r, current) {
  return `
  <nav class="side-nav" aria-label="Product categories">
    <p class="side-title">Categories</p>
    <ul>${categories.map((c) => `
      <li><a href="${r(P.category(c.slug))}"${current === c.slug ? ' aria-current="page"' : ''}>${icon(c.icon)}<span>${esc(c.name)}</span></a></li>`).join('')}
    </ul>
    <p class="side-title">Featured</p>
    <ul>${spotlights.map((s) => `
      <li><a href="${r(P.spotlight(s.slug))}"${current === s.slug ? ' aria-current="page"' : ''}>${icon('spark')}<span>${esc(s.name)}</span></a></li>`).join('')}
    </ul>
  </nav>`;
}

function groupCard(r, c, g) {
  const cta = g.cta ? (() => {
    const call = /^Call/i.test(g.cta.label);
    if (call) return `<a class="btn btn-primary btn-sm" href="${company.phoneHref}">${icon('phone')} ${esc(g.cta.label)}</a>`;
    const h = href(r, g.cta.href);
    return `<a class="btn btn-primary btn-sm" href="${h.href}"${h.attrs}>${esc(g.cta.label)} ${icon(h.attrs ? 'external' : 'arrow')}</a>`;
  })() : '';
  const bro = g.brochure ? (() => {
    const h = href(r, g.brochure.href);
    return `<a class="btn btn-ghost btn-sm" href="${h.href}"${h.attrs}>${icon('download')} ${esc(g.brochure.label)}</a>`;
  })() : '';
  const extra = g.extra ? (() => { const h = href(r, g.extra.href); return `<a class="btn btn-ghost btn-sm" href="${h.href}"${h.attrs}>${esc(g.extra.label)} ${icon('external')}</a>`; })() : '';
  return `
        <li class="group group-card" id="${g.id}">
          ${g.image ? `<div class="group-media">${img(r, g.image, g.name)}</div>` : ''}
          <div class="group-body">
            <h2 class="h3">${esc(g.name)}</h2>
            ${g.text.map((t) => `<p>${esc(t)}</p>`).join('')}
            ${g.items.length ? `<ul class="item-tags">${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>` : ''}
            ${g.logos.length ? `<ul class="logo-row" aria-label="Brands">${g.logos.map((l) => `<li>${img(r, l.file, l.name)}</li>`).join('')}</ul>` : ''}
            <div class="group-actions">${cta}${bro}${extra}<a class="text-link" href="${enquire(`${c.name} – ${g.name} enquiry`)}">Email us ${icon('arrow')}</a></div>
          </div>
        </li>`;
}

categories.forEach((c, i) => {
  const prev = categories[(i - 1 + categories.length) % categories.length];
  const next = categories[(i + 1) % categories.length];
  page({
    path: P.category(c.slug),
    title: c.name,
    section: 'products',
    description: c.lead,
    body: (r) => `
${pageHero(r, {
      trail: [[P.products, 'Products'], [P.category(c.slug), c.name]],
      kicker: 'Products',
      title: c.name,
      lead: c.lead,
      iconName: c.icon,
      actions: `<a class="btn btn-primary" href="${enquire(`${c.name} enquiry`)}">${icon('mail')} Email us</a>
        <a class="btn btn-ghost" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>`,
    })}
<section class="section">
  <div class="container with-side">
    ${sideNav(r, c.slug)}
    <div class="content">
      ${c.groups.length ? `
      <nav class="jump" aria-label="In this category">
        <p>Jump to</p>
        <ul>${c.groups.map((g) => `<li><a href="#${g.id}">${esc(g.name)}</a></li>`).join('')}</ul>
      </nav>
      <ul class="group-grid">${c.groups.map((g) => groupCard(r, c, g)).join('')}
      </ul>` : ''}

      ${c.clearance ? `
      <div class="notice notice-lg">
        ${icon('tag', 'icon icon-lg')}
        <div>${c.clearance.text.map((t, k) => `<h2 class="h3">${esc(t)}</h2>`).join('')}
        <p><a class="btn btn-primary" href="${company.phoneHref}">${icon('phone')} Call ${company.phone} to enquire</a></p>
        <a class="ebay-link"${external(c.clearance.ebay.href)}>${img(r, c.clearance.ebay.logo, 'eBay')}<span>${esc(c.clearance.ebay.label)} ${icon('external')}</span></a></div>
      </div>` : ''}

      ${(c.sub || []).map((s) => `
      <a class="banner" href="${r(P.blum)}">
        ${icon('hinge', 'icon icon-lg')}
        <span><strong>${esc(s.name)}</strong> ${esc(s.note)}. View Blum hinge, lift and runner systems.</span>
        ${icon('arrow')}
      </a>`).join('')}

      ${(c.brochures || []).length ? `
      <div class="block">
        <h2 class="h3">Brochures</h2>
        <div class="enquiry-actions">${c.brochures.map((b) => `<a class="btn btn-ghost" href="${b.href}" target="_blank" rel="noopener">${icon('download')} ${esc(b.label)}</a>`).join('')}</div>
      </div>` : ''}

      ${(c.featured || []).length ? `
      <div class="block">
        <h2 class="h3">Featured in this category</h2>
        <ul class="spot-grid spot-grid-sm">${c.featured.map((s) => spotlights.find((x) => x.slug === s)).map((s) => `
          <li><a class="spot" href="${r(P.spotlight(s.slug))}"><p class="kicker">${esc(s.kicker)}</p><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><span class="text-link">View ${icon('arrow')}</span></a></li>`).join('')}
        </ul>
      </div>` : ''}

      ${(c.related || []).includes('toolrepairservice') ? `
      <a class="banner" href="${r(P.toolrepair)}">
        ${icon('wrench', 'icon icon-lg')}
        <span><strong>Tool Repair Service:</strong> our in-house technician fixes ${esc(toolRepair.brands.join(', '))} and more.</span>
        ${icon('arrow')}
      </a>` : ''}

      ${enquiryCard(`${c.name} enquiry`, c.name)}

      <nav class="pager" aria-label="More categories">
        <a href="${r(P.category(prev.slug))}" rel="prev">${icon('back')}<span><small>Previous</small>${esc(prev.name)}</span></a>
        <a href="${r(P.category(next.slug))}" rel="next"><span><small>Next</small>${esc(next.name)}</span>${icon('arrow')}</a>
      </nav>
    </div>
  </div>
</section>`,
  });
});

// Blum -------------------------------------------------------------------------
{
  const ah = categories.find((c) => c.slug === 'architecturalhardware');
  page({
    path: P.blum,
    title: 'Blum',
    section: 'products',
    description: blum.hinges.text,
    body: (r) => `
${pageHero(r, {
      trail: [[P.products, 'Products'], [P.category(ah.slug), ah.name], [P.blum, 'Blum']],
      kicker: 'Architectural Hardware',
      title: 'Blum',
      lead: blum.hinges.text,
      iconName: 'hinge',
      actions: `<a class="btn btn-primary" href="${href(r, blum.hinges.brochure.href).href}" target="_blank" rel="noopener">${icon('download')} ${esc(blum.hinges.brochure.label)}</a>
        <a class="btn btn-ghost" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>`,
    })}
<section class="section">
  <div class="container with-side">
    ${sideNav(r, ah.slug)}
    <div class="content">
      <div class="block">
        <h2>${esc(blum.hinges.title)}</h2>
        <p class="prose">To enquire or order call the team on <a href="${company.phoneHref}">${company.phone}</a> or <a href="${r(P.contact)}">contact us here</a></p>
      </div>
      <h2>${esc(blum.others)}</h2>
      <ul class="group-grid">${blum.groups.map((g) => groupCard(r, ah, g)).join('')}
      </ul>
      <p><a class="btn btn-primary" href="${blum.catalogue.href}" target="_blank" rel="noopener">${icon('download')} ${esc(blum.catalogue.label)}</a></p>
      ${enquiryCard('Blum enquiry', 'Blum')}
      <a class="text-link" href="${r(P.category(ah.slug))}">${icon('back')} Back to ${esc(ah.name)}</a>
    </div>
  </div>
</section>`,
  });
}

// Spotlights (Konig, Moldex, Soudaclean, made-to-order sanding belts) ---------------------------------
function formField(label, name, { type = 'text', required = false, options, rows, placeholder = '' } = {}) {
  const req = required ? ' required' : '';
  const lab = `${label}${required ? '*' : ''}`;
  if (options) return `<label><span>${esc(lab)}</span><select name="${name}" data-label="${esc(label)}"${req}><option value="">Select…</option>${options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
  if (rows) return `<label><span>${esc(lab)}</span><textarea name="${name}" data-label="${esc(label)}" rows="${rows}"${req} placeholder="${esc(placeholder)}"></textarea></label>`;
  return `<label><span>${esc(lab)}</span><input name="${name}" data-label="${esc(label)}" type="${type}"${req}${type === 'tel' ? ' autocomplete="tel"' : ''}></label>`;
}

const privacyLine = (r) => `<p class="form-note">By sending this you agree to our <a href="${r(P.legal('privacypolicy'))}">Privacy Policy</a>. It opens in your email app, ready to send.</p>`;

spotlights.forEach((s) => {
  const cat = categories.find((c) => c.slug === s.category);
  const isBelts = s.slug === 'madetoordersandingbelts';
  const isClean = s.slug === 'soudaclean';
  page({
    path: P.spotlight(s.slug),
    title: s.pageTitle || s.name,
    section: 'products',
    description: s.body[0],
    body: (r) => `
${pageHero(r, {
      trail: [[P.products, 'Products'], [P.category(cat.slug), cat.name], [P.spotlight(s.slug), s.pageTitle || s.name]],
      kicker: s.kicker,
      title: s.heading || s.pageTitle || (isClean ? 'Introducing Soudaclean' : s.name),
      lead: s.body[0],
      actions: `<a class="btn btn-primary" href="${enquire(`${s.name} enquiry`)}">${icon('mail')} Email us</a>
        <a class="btn btn-ghost" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>`,
    })}
<section class="section">
  <div class="container with-side">
    ${sideNav(r, s.slug)}
    <div class="content">
      ${s.banner ? `<div class="spot-banner">${img(r, s.banner, 'Soudaclean range', { lazy: false })}</div>` : ''}
      ${s.image ? `<div class="spot-figure">${img(r, s.image, s.name === 'Konig' ? 'Konig Touch Up & Repair products' : 'Moldex PPE products', { lazy: false })}</div>` : ''}
      ${s.listTitle ? `<h2 class="h3">${esc(s.listTitle)}</h2>
      <ul class="tile-list tile-list-check">${s.list.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>` : ''}
      ${(s.extra || []).map((x) => `<div class="block"><h2 class="h3">${esc(x.heading)}</h2><p class="prose">${esc(x.text).replace('01962 842 002', `<a href="${company.phoneHref}">01962 842 002</a>`).replace('contact us here', `<a href="${r(P.contact)}">contact us here</a>`)}</p></div>`).join('')}
      ${s.storeLink ? `<p><a class="btn btn-ghost"${external(s.storeLink.href)}>${esc(s.storeLink.label)} on the online catalogue ${icon('external')}</a></p>` : ''}

      ${isClean ? `
      <div class="offer"><p class="offer-title">${esc(s.offer.title)}</p><p>${esc(s.offer.lead)}</p>
        <ul class="tile-list tile-list-check">${s.offer.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></div>
      <ul class="variant-list">${s.variants.map((v) => `
        <li class="variant" id="${slug(v.name)}">
          <div class="variant-media">${img(r, v.image, v.name)}</div>
          <div class="variant-body">
            <h2 class="h3">${esc(v.name)}</h2>
            <p>${esc(v.text)}</p>
            <h3 class="mini">Properties</h3>
            <ul class="ticks">${v.properties.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            <h3 class="mini">Applications</h3>
            <ul class="ticks">${v.applications.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            <a class="btn btn-ghost btn-sm" href="${v.sheet}" target="_blank" rel="noopener">${icon('download')} Data Sheet · Download ${v.name.replace('Soudaclean ', '')}</a>
          </div>
        </li>`).join('')}
      </ul>` : ''}

      ${isBelts ? `
      <ul class="gallery">${s.images.map((g, k) => `<li>${img(r, g, ['Custom sized sanding belt', 'Custom size sanding belt', 'Large sanding belt'][k])}</li>`).join('')}</ul>
      <h2>${esc(s.heading)}</h2>
      <p class="prose">${esc(s.text)}</p>
      <ol class="steps steps-2">${s.steps.map((st, k) => `<li><span class="step-num">${k + 1}</span><h2 class="h3">${esc(st.title)}</h2><p>${esc(st.text)}</p></li>`).join('')}</ol>
      <form class="enquiry-form" data-form data-email="${company.email}" data-subject="Made to order sanding belt price request">
        <h2 class="h3">${esc(s.formTitle)}</h2>
        <p class="muted">${esc(s.formLead).replace('on or contact', 'on 01962 842002 or contact')}</p>
        <div class="form-row">${formField('Name', 'name', { required: true })}${formField('Company name', 'company')}</div>
        <div class="form-row">${formField('Phone', 'phone', { type: 'tel' })}${formField('Email', 'email', { type: 'email', required: true })}</div>
        <div class="form-row">${formField('Abrasive', 'abrasive', { options: sandingForm.abrasives })}${formField('Application', 'application', { options: sandingForm.applications })}</div>
        <div class="form-row form-row-3">${formField('Grit required', 'grit', { required: true })}${formField('Width (mm)', 'width', { required: true })}${formField('Length (mm)', 'length', { required: true })}</div>
        ${formField('Message', 'message', { rows: 4 })}
        ${privacyLine(r)}
        <button class="btn btn-primary btn-lg" type="submit">${icon('mail')} Request Price</button>
      </form>` : ''}

      ${enquiryCard(`${s.name} enquiry`, s.name)}
      <a class="text-link" href="${r(P.category(cat.slug))}">${icon('back')} Back to ${esc(cat.name)}</a>
    </div>
  </div>
</section>`,
  });
});

// Tool repair -------------------------------------------------------------------
page({
  path: P.toolrepair,
  title: 'Tool Repair Service',
  section: 'repair',
  description: `${toolRepair.lead}. ${toolRepair.intro}`,
  body: (r) => `
${pageHero(r, {
    trail: [[P.toolrepair, 'Tool Repair Service']],
    kicker: 'In-house workshop',
    title: 'Tool Repair Service',
    lead: toolRepair.lead,
    iconName: 'wrench',
    actions: `<a class="btn btn-primary btn-lg" href="${company.phoneHref}">${icon('phone')} Call ${company.phone}</a>
      <a class="btn btn-ghost btn-lg" href="${enquire('Tool repair enquiry')}">${icon('mail')} Email us</a>`,
  })}
<section class="section">
  <div class="container">
    <div class="alert" role="note">${icon('clock')}<p><strong>${esc(toolRepair.notice.title)}</strong> ${esc(toolRepair.notice.text)}</p></div>
    <p class="prose prose-lg">${esc(toolRepair.intro)}</p>
    <ul class="gallery gallery-5">${toolRepair.photos.map((p, k) => `<li>${img(r, p, `Tool repair ${k + 1}`)}</li>`).join('')}</ul>

    <ul class="service-grid">${toolRepair.services.map((sv, k) => `
      <li class="service"><span class="step-num">${k + 1}</span><h2 class="h3">${esc(sv.title)}</h2><p>${esc(sv.text)}</p>${k === 1 ? img(r, toolRepair.motorImage, 'Merlin Accessories Tool Repair Service motor & gearbox repair') : ''}</li>`).join('')}
    </ul>

    <div class="two-col">
      <div class="block">
        <h2 class="h3">The tools we fix</h2>
        <p class="prose">${esc(toolRepair.toolsText)}</p>
        <ul class="item-tags">${toolRepair.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>
      <div class="block">
        <h2 class="h3">The brands we work with</h2>
        <p class="prose">${esc(toolRepair.brandsText)}</p>
        <ul class="logo-row logo-row-lg">${toolRepair.brands.map((b) => `<li>${img(r, toolRepair.brandLogos[b], b)}</li>`).join('')}</ul>
      </div>
    </div>

    <h2>Why Choose Merlin?</h2>
    <ul class="why-grid why-grid-3">${toolRepair.why.map((w) => `<li><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></li>`).join('')}</ul>

    <div class="alert" role="note">${icon('clock')}<p><strong>${esc(toolRepair.notice.title)}</strong> ${esc(toolRepair.notice.text)}</p></div>

    <form class="enquiry-form" id="repair-form" data-form data-email="${company.email}" data-subject="Tool repair enquiry">
      <h2 class="h3">${esc(toolRepair.formTitle)}</h2>
      <p class="muted">${esc(toolRepair.formLead).replace('on or contact', 'on 01962 842002 or contact')}</p>
      <div class="form-row">${formField('Name', 'name', { required: true })}${formField('Company name', 'company')}</div>
      <div class="form-row">${formField('Phone', 'phone', { type: 'tel' })}${formField('Email', 'email', { type: 'email', required: true })}</div>
      ${formField('Brand of tool', 'brand', { options: toolRepair.toolBrandOptions })}
      ${formField('Message / Problem with tool', 'message', { rows: 5, required: true })}
      <p class="form-note">If possible please attach a picture showing us where the problem is located to the email that opens.</p>
      ${privacyLine(r)}
      <button class="btn btn-primary btn-lg" type="submit">${icon('mail')} Submit</button>
    </form>
  </div>
</section>`,
});

// About & team --------------------------------------------------------------------
page({
  path: P.about,
  title: 'About us',
  section: 'about',
  description: `${intro} ${introMore}`,
  body: (r) => `
${pageHero(r, { trail: [[P.about, 'About us']], kicker: `Since ${company.since}`, title: 'About us', lead: about.heading })}
<section class="section">
  <div class="container narrow-prose">
    ${about.paragraphs.map((p) => `<p class="prose prose-lg">${esc(p)}</p>`).join('')}
    <div class="hero-actions">
      <a class="btn btn-primary" href="${r(P.team)}">${icon('people')} Meet the team</a>
      <a class="btn btn-ghost" href="${r(P.products)}">Our products</a>
    </div>
  </div>
</section>
<section class="section section-alt">
  <div class="container">
    <ul class="why-grid why-grid-4">${about.points.map((w) => `
      <li><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p>${w.link ? `<a class="text-link" href="${r(linkTarget(w.link))}">Delivery Service ${icon('arrow')}</a>` : ''}</li>`).join('')}
    </ul>
    <p class="phone-strip"><span>${esc(company.yearsLine)}</span><a href="${company.phoneHref}">${icon('phone')} ${company.phone.replace(/ /g, '')}</a><small>Monday - Friday - ${company.hours.office.open} - ${company.hours.office.close}<br>Trade Counter - ${company.hours.counter.open} - ${company.hours.counter.close}</small></p>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="section-head"><div><p class="kicker">${esc(company.shortName)}</p><h2>${esc(about.storyTitle)}</h2></div></div>
    <ol class="story">${about.timeline.map((t) => `
      <li><span class="story-year">${esc(t.year)}</span><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></li>`).join('')}
    </ol>
    <p><a class="btn btn-ghost" href="${r(P.team)}">${icon('people')} Meet the team</a></p>
  </div>
</section>`,
});

page({
  path: P.team,
  title: 'Meet the Team',
  section: 'about',
  description: team.lead,
  body: (r) => `
${pageHero(r, { trail: [[P.about, 'About us'], [P.team, 'Meet the Team']], kicker: 'About', title: 'Meet the team', lead: team.lead })}
<section class="section">
  <div class="container">
    <ul class="team-grid">${team.members.map((m) => `
      <li class="team-card">
        <span class="team-photo">${img(r, m.photo, m.name)}</span>
        <h2 class="h3">${esc(m.name)}</h2>
        <p class="team-role">${esc(m.role)}</p>
        <p class="team-since">With Merlin since <strong>${m.since}</strong></p>
      </li>`).join('')}
    </ul>
  </div>
</section>`,
});

// News, delivery, FAQ -------------------------------------------------------------------
page({
  path: P.news,
  title: 'Latest News',
  section: 'about',
  description: newsLead,
  body: (r) => `
${pageHero(r, { trail: [[P.news, 'Latest News']], kicker: 'Resources', title: 'Latest News', lead: newsLead, iconName: 'news' })}
<section class="section">
  <div class="container narrow">
    <ul class="news-list">${posts.map((n) => newsItem(r, n)).join('')}</ul>
    <p class="muted">Follow us on <a href="${company.facebook}" target="_blank" rel="noopener">Facebook</a>, <a href="${company.linkedin}" target="_blank" rel="noopener">LinkedIn</a> and <a href="${company.instagram}" target="_blank" rel="noopener">Instagram</a>: ${esc(company.hashtag)}</p>
  </div>
</section>`,
});

function postBody(r, post) {
  return post.blocks.map((b) => {
    switch (b.t) {
      case 'h2': return `<h2>${esc(b.text)}</h2>`;
      case 'h3': return `<h3 class="post-h3">${esc(b.text)}</h3>`;
      case 'h4': case 'h5': case 'h6': return `<h4>${esc(b.text)}</h4>`;
      case 'ul': return `<ul class="ticks">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      case 'img': return `<figure class="post-figure">${img(r, b.src, b.alt)}</figure>`;
      case 'btn': { const h = href(r, b.href); return `<p><a class="btn btn-primary btn-sm" href="${h.href}"${h.attrs}>${esc(b.text)} ${icon(h.attrs ? 'external' : 'arrow')}</a></p>`; }
      case 'group': return `<details class="post-group"><summary>${esc(b.title)}${icon('chevron')}</summary><ul class="ticks">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></details>`;
      case 'tags': return `<ul class="chips">${b.tags.map((t) => `<li class="chip">${esc(t)}</li>`).join('')}</ul>`;
      default: return `<p>${esc(b.text)}</p>`;
    }
  }).join('\n      ');
}

posts.forEach((post) => {
  page({
    path: P.post(post.slug),
    title: post.title,
    section: 'about',
    description: (post.blocks.find((b) => b.t === 'p' && b.text.length > 40) || { text: newsLead }).text.slice(0, 200),
    body: (r) => `
${pageHero(r, { trail: [[P.news, 'Latest News'], [P.post(post.slug), post.title]], kicker: `${dateText(post.date)} · ${post.read}`, title: post.title })}
<section class="section">
  <div class="container narrow post">
    <figure class="post-figure post-cover">${img(r, post.cover, post.title, { lazy: false })}</figure>
    ${postBody(r, post)}
    <div class="block">
      <h2 class="h3">Recent Posts</h2>
      <ul class="ticks">${posts.filter((p) => p.slug !== post.slug).slice(0, 3).map((p) => `<li><a href="${r(P.post(p.slug))}">${esc(p.title)}</a></li>`).join('')}</ul>
      <a class="text-link" href="${r(P.news)}">See all posts ${icon('arrow')}</a>
    </div>
  </div>
</section>`,
  });
});

page({
  path: P.delivery,
  title: delivery.title,
  section: 'about',
  description: `${delivery.sections[0].text} ${delivery.sections[1].text}`,
  body: (r) => `
${pageHero(r, { trail: [[P.delivery, delivery.title]], kicker: 'About', title: delivery.title, iconName: 'truck' })}
<section class="section">
  <div class="container">
    <div class="two-col two-col-media">
      <div>${delivery.sections.map((s) => `<div class="block"><h2>${esc(s.title)}</h2><p class="prose prose-lg">${esc(s.text)}</p></div>`).join('')}
        <a class="btn btn-primary btn-lg" href="${r(P.contact)}">Contact us</a>
      </div>
      <div class="delivery-van">${img(r, delivery.van, delivery.vanAlt)}</div>
    </div>
    <figure class="delivery-map">${img(r, delivery.map, delivery.mapAlt)}<figcaption>${esc(delivery.mapAlt)}</figcaption></figure>
  </div>
</section>`,
});

page({
  path: P.faq,
  title: "FAQ's",
  section: 'about',
  description: faq.lead,
  body: (r) => `
${pageHero(r, { trail: [[P.faq, "FAQ's"]], kicker: 'Helpful advice', title: faq.title, lead: faq.lead, iconName: 'help' })}
<section class="section">
  <div class="container narrow">
    <div class="faq">${faq.items.map((f, k) => `
      <details class="faq-item"${k === 0 ? ' open' : ''}>
        <summary>${esc(f.q)}${icon('chevron')}</summary>
        <div>${esc(f.a).split('\n').map((l) => `<p>${(f.link ? l.replace(f.link.label, `<a href="${r(linkTarget(f.link.to))}">${f.link.label}</a>`) : l).replace('sales@merlinaccessories.com', `<a href="mailto:${company.email}">sales@merlinaccessories.com</a>`).replace('accounts@merlinaccessories.com', `<a href="mailto:${company.accountsEmail}">accounts@merlinaccessories.com</a>`)}</p>`).join('')}</div>
      </details>`).join('')}
    </div>
  </div>
</section>`,
});

// Downloads ---------------------------------------------------------------------------
page({
  path: P.downloads,
  title: 'Downloads',
  section: 'downloads',
  description: downloads.lead,
  body: (r) => `
${pageHero(r, { trail: [[P.downloads, 'Downloads']], kicker: 'Resources', title: 'Downloads', lead: downloads.lead, iconName: 'file' })}
<section class="section">
  <div class="container">
    <ul class="feature-downloads">${downloads.featured.map((d) => `
      <li class="download download-feature">
        <div class="download-cover">${img(r, d.image, d.title)}</div>
        <div><h2 class="h3">${esc(d.title)}</h2>${d.note ? `<p class="muted">${esc(d.note)}</p>` : ''}${d.size ? `<p class="muted">${esc(d.size)}</p>` : ''}
          <a class="btn btn-primary" href="${d.file}" target="_blank" rel="noopener">${icon('download')} ${esc(d.label)}</a></div>
      </li>`).join('')}
    </ul>
    <ul class="download-grid">${downloads.items.map((d) => `
      <li class="download">
        <div class="download-cover">${img(r, d.image, `${d.title} brochure`)}</div>
        <h2 class="h3">${esc(d.title)}</h2>
        <a class="btn btn-primary" href="${d.file}" target="_blank" rel="noopener">${icon('download')} Download</a>
      </li>`).join('')}
    </ul>
  </div>
</section>`,
});

const UNITS = [['mm', 'Millimetres (mm)'], ['cm', 'Centimetres (cm)'], ['m', 'Metres (m)'], ['in', 'Inches (in)'], ['ft', 'Feet (ft)'], ['yd', 'Yards (yd)']];
page({
  path: P.charts,
  title: 'Conversion Charts',
  section: 'downloads',
  description: charts.title,
  body: (r) => `
${pageHero(r, { trail: [[P.charts, 'Conversion Charts']], kicker: 'Resources', title: charts.title, iconName: 'ruler' })}
<section class="section">
  <div class="container">
    <nav class="jump" aria-label="Charts on this page">
      <p>Jump to</p>
      <ul>${charts.items.map((c) => `<li><a href="#${c.id}">${esc(c.title.replace(', countersunk socket and socket cap screw size charts', ' & Allen key sizes'))}</a></li>`).join('')}<li><a href="#converter">Quick converter</a></li></ul>
    </nav>
    <div class="chart-list">${charts.items.map((c) => `
      <figure class="chart" id="${c.id}">${img(r, c.image, c.title)}<figcaption>${esc(c.title)}</figcaption></figure>`).join('')}
    </div>
    <form class="converter" id="converter" data-converter onsubmit="return false">
      <h2 class="h3">Quick converter</h2>
      <div class="converter-row">
        <label><span>Value</span><input type="number" inputmode="decimal" step="any" value="1" data-conv-value></label>
        <label><span>From</span><select data-conv-from>${UNITS.map((u) => `<option value="${u[0]}"${u[0] === 'in' ? ' selected' : ''}>${u[1]}</option>`).join('')}</select></label>
        <button class="icon-button swap" type="button" data-conv-swap aria-label="Swap units">⇄</button>
        <label><span>To</span><select data-conv-to>${UNITS.map((u) => `<option value="${u[0]}"${u[0] === 'mm' ? ' selected' : ''}>${u[1]}</option>`).join('')}</select></label>
      </div>
      <output class="converter-out" data-conv-out aria-live="polite">1 in = 25.4 mm</output>
    </form>
  </div>
</section>`,
});

// Brands ----------------------------------------------------------------------------------
page({
  path: P.brands,
  title: 'Brands',
  section: 'brands',
  description: `Brands and trading partners of ${company.name}.`,
  body: (r) => `
${pageHero(r, { trail: [[P.brands, 'Brands']], kicker: 'Brands', title: 'Our brands', lead: 'Some of our trading partnerships' })}
<section class="section">
  <div class="container">
    <ul class="spot-grid">${brandMenu.map((b) => {
    const h = b.link ? { href: r(linkTarget(b.link)), attrs: '' } : { href: b.href, attrs: ' target="_blank" rel="noopener"' };
    return `
      <li><a class="spot" href="${h.href}"${h.attrs}><p class="kicker">Brand</p><h3>${esc(b.name)}</h3><p>${b.link ? esc(spotlights.find((s) => s.slug === b.link).summary) : 'Soudal sealants, foams and adhesives on the online catalogue.'}</p><span class="text-link">${b.link ? 'View' : 'View on the online catalogue'} ${icon(b.link ? 'arrow' : 'external')}</span></a></li>`;
  }).join('')}
    </ul>
  </div>
</section>
<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Trading partners</p><h2>Some of our trading partnerships</h2></div></div>
    <ul class="partner-grid">${partners.map((p) => `<li>${img(r, p.file, p.name)}<span>${esc(p.name)}</span></li>`).join('')}
    </ul>
  </div>
</section>
<section class="section">
  <div class="container">
    <div class="section-head"><div><p class="kicker">By range</p><h2>Brands by range</h2></div></div>
    <p class="prose">The brands we supply for each range are shown on its product page:</p>
    <ul class="chips chips-links">${categories.filter((c) => c.groups.some((g) => g.logos.length)).map((c) => `<li><a class="chip" href="${r(P.category(c.slug))}">${esc(c.name)}</a></li>`).join('')}</ul>
  </div>
</section>`,
  partnersStrip: false,
});

// Bulk deals --------------------------------------------------------------------------------
page({
  path: P.bulk,
  title: bulk.title,
  section: 'bulk',
  description: bulk.intro,
  body: (r) => `
${pageHero(r, {
    trail: [[P.bulk, bulk.title]], kicker: 'Volume pricing', title: bulk.title, lead: bulk.lead,
    actions: `<a class="btn btn-primary btn-lg" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
      <a class="btn btn-ghost btn-lg" href="${enquire('Bulk / pallet deal enquiry')}">${icon('mail')} Request a quote</a>`,
  })}
<section class="section">
  <div class="container">
    <div class="alert" role="note">${icon('clock')}<p><strong>${esc(toolRepair.notice.title)}</strong> ${esc(toolRepair.notice.text)}</p></div>
    <p class="prose prose-lg">${esc(bulk.intro)}</p>
    <div class="bulk-grid">
      <div class="bulk-media">${img(r, bulk.images.pallet, 'Soudal LMN Silicone Pallet', { lazy: false })}<span class="ship-badge">${esc(bulk.shipping)}</span></div>
      <div>
        <div class="bulk-brand">${img(r, bulk.images.brand, 'Soudal', { lazy: false })}</div>
        <h2>${esc(bulk.productTitle)}</h2>
        <h3>${esc(bulk.whatTitle)}</h3>
        ${bulk.what.map((p) => `<p>${esc(p)}</p>`).join('')}
        <h3>${esc(bulk.coloursTitle)}</h3>
        <ul class="swatches">${bulk.colours.map(([n, f]) => `<li>${img(r, `pages/${f}`, '')}<span>${esc(n)}</span></li>`).join('')}</ul>
        <dl class="facts">${bulk.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
    </div>
    <div class="two-col">
      <div class="block"><h3>${esc(bulk.applicationsTitle)}</h3><ul class="ticks">${bulk.applications.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
      <div class="block"><h3>${esc(bulk.propertiesTitle)}</h3><ul class="ticks">${bulk.properties.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        <div class="enquiry-actions">${bulk.docs.map((d) => `<a class="btn btn-ghost btn-sm" href="${d.href}" target="_blank" rel="noopener">${icon('download')} ${esc(d.label)}</a>`).join('')}</div></div>
    </div>
    <div class="why-buy">
      <h2>${esc(bulk.whyTitle)}</h2>
      <ul class="tile-list tile-list-check">${bulk.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
      <p class="why-call">${esc(bulk.call)} <a href="${company.phoneHref}">${company.phone.replace(/ /g, '')}</a></p>
    </div>
    <div class="alert" role="note">${icon('clock')}<p><strong>${esc(toolRepair.notice.title)}</strong> ${esc(toolRepair.notice.text)}</p></div>
  </div>
</section>`,
});

// Contact ---------------------------------------------------------------------------------
page({
  path: P.contact,
  title: 'Contact',
  section: 'contact',
  description: `Contact ${company.name}: ${company.phone}, ${company.email}, ${company.address.join(', ')}.`,
  body: (r) => `
${pageHero(r, { trail: [[P.contact, 'Contact']], kicker: 'We are here to help', title: 'Contact us', lead: 'Get in touch with the Merlin team' })}
<section class="section">
  <div class="container contact-grid">
    <div class="contact-cards">
      <a class="contact-card" href="${company.phoneHref}">${icon('phone', 'icon icon-lg')}<span><small>Call us</small><strong>${company.phone}</strong></span></a>
      <a class="contact-card" href="mailto:${company.email}">${icon('mail', 'icon icon-lg')}<span><small>Email us</small><strong>${company.email}</strong></span></a>
      <a class="contact-card" href="${company.mapsHref}" target="_blank" rel="noopener">${icon('pin', 'icon icon-lg')}<span><small>Visit us</small><strong>${esc(company.name)}, ${company.address.map(esc).join(', ')}</strong></span></a>
      <div class="hours-card">
        <p class="status status-lg" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Trade counter ${hoursText(company.hours.counter)}</span></p>
        <table class="hours-table" data-hours-table>
          <caption class="sr-only">Opening hours</caption>
          <thead><tr><th scope="col">Opening hours</th><th scope="col">Trade Counter</th><th scope="col">Office</th></tr></thead>
          <tbody>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => {
    const day = (i + 1) % 7;
    const h = (k) => (company.hours[k].days.includes(day) ? `${company.hours[k].open} – ${company.hours[k].close}` : 'Closed');
    return `<tr data-day="${day}"><th scope="row">${d}</th><td>${h('counter')}</td><td>${h('office')}</td></tr>`;
  }).join('')}</tbody>
        </table>
      </div>
      <div class="social-card"><p><strong>${esc(company.hashtag)}</strong></p><p class="social-row">${socialLinks(' social-link-lg')}</p></div>
    </div>

    <form class="enquiry-form" data-form data-email="${company.email}" data-subject="Website enquiry">
      <h2 class="h3">${esc(contactForm.title)}</h2>
      <p class="muted">This opens your email app with your message ready to send.</p>
      <div class="form-row">${formField('Name', 'name', { required: true })}${formField('Company name', 'company')}</div>
      <div class="form-row">${formField('Phone', 'phone', { type: 'tel' })}${formField('Email', 'email', { type: 'email', required: true })}</div>
      ${formField('Message / Order required', 'message', { rows: 5, required: true, placeholder: 'Product, quantity, sizes…' })}
      <div class="form-row">${formField('Size required (if known)', 'size')}${formField('Quantity required (if known)', 'quantity')}</div>
      ${formField('Where did you hear about us?', 'heard', { options: contactForm.heard })}
      ${privacyLine(r)}
      <button class="btn btn-primary btn-lg" type="submit">${icon('mail')} Submit</button>
    </form>
  </div>
  <div class="container">
    <div class="map">
      <iframe title="Map showing Merlin Accessories, Winnall Trading Estate" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=${encodeURIComponent(`${company.name}, ${company.address.join(', ')}`)}&amp;output=embed"></iframe>
    </div>
  </div>
</section>`,
  partnersStrip: false,
});

// Legal pages ---------------------------------------------------------------------------------
legal.forEach((l) => {
  page({
    path: P.legal(l.slug),
    title: l.title,
    section: '',
    description: l.note || l.title,
    partnersStrip: false,
    body: (r) => `
${pageHero(r, { trail: [[P.legal(l.slug), l.title]], kicker: company.name, title: l.title })}
<section class="section">
  <div class="container narrow">
    <p class="prose">${l.note ? esc(l.note).replace('sales@merlinaccessories.com', `<a href="mailto:${company.email}">sales@merlinaccessories.com</a>`) : `The text of our ${esc(l.title)} is not published on the Merlin website yet. For any questions please call <a href="${company.phoneHref}">${company.phone}</a> or email <a href="mailto:${company.email}">${company.email}</a>.`}</p>
    <p class="muted">${esc(company.name)} · Company Registration No. ${company.regNo} · VAT No. ${company.vatNo}</p>
  </div>
</section>`,
  });
});

// ---------------------------------------------------------------------------
// Search index: categories, their sub-ranges, brands, spotlights and pages.

function searchIndex() {
  const entries = [];
  for (const c of categories) {
    entries.push({ t: c.name, d: c.lead, u: P.category(c.slug), k: 'Category', w: c.groups.flatMap((g) => g.logos.map((l) => l.name)).join(' ') });
    for (const g of c.groups) {
      entries.push({ t: g.name, d: `in ${c.name}`, u: `${P.category(c.slug)}#${g.id}`, k: 'Range', w: [...g.text, ...g.logos.map((l) => l.name)].join(' ') });
      for (const it of g.items) entries.push({ t: it, d: `${g.name} · ${c.name}`, u: `${P.category(c.slug)}#${g.id}`, k: 'Product' });
    }
  }
  for (const g of blum.groups) entries.push({ t: `Blum ${g.name}`, d: 'Architectural Hardware · Blum', u: `${P.blum}#${g.id}`, k: 'Range', w: g.text.join(' ') });
  entries.push({ t: 'Blum', d: 'Hinge, lift and runner systems', u: P.blum, k: 'Brand', w: 'hinges onyx black movento aventos clip top' });
  for (const s of spotlights) entries.push({ t: s.name, d: s.summary, u: P.spotlight(s.slug), k: 'Featured', w: [s.kicker, ...(s.list || []), ...s.body, ...(s.variants || []).map((v) => v.name)].join(' ') });
  for (const p of partners) entries.push({ t: p.name, d: 'Trading partner', u: P.brands, k: 'Brand' });
  for (const b of toolRepair.brands) entries.push({ t: b, d: 'Tool Repair Service', u: P.toolrepair, k: 'Brand' });
  for (const p of posts) entries.push({ t: p.title, d: `News · ${dateText(p.date)}`, u: P.post(p.slug), k: 'News', w: p.blocks.map((b) => b.text || (b.items || []).join(' ') || '').join(' ') });
  for (const m of team.members) entries.push({ t: m.name, d: m.role, u: P.team, k: 'Team' });
  for (const d of [...downloads.featured, ...downloads.items]) entries.push({ t: `${d.title} brochure`, d: 'Download (PDF)', u: P.downloads, k: 'Page', w: 'catalogue brochure pdf download' });
  for (const q of faq.items) entries.push({ t: q.q, d: "FAQ's", u: P.faq, k: 'FAQ', w: q.a });
  entries.push(
    { t: 'Tool Repair Service', d: toolRepair.lead, u: P.toolrepair, k: 'Service', w: [...toolRepair.tools, ...toolRepair.services.map((s) => s.title)].join(' ') + ' fix broken mend battery motor gearbox switch trigger' },
    { t: bulk.title, d: bulk.lead, u: P.bulk, k: 'Page', w: 'bulk pallet box volume trade price LMN silicone Soudal' },
    { t: 'Brands', d: 'Our trading partnerships', u: P.brands, k: 'Page' },
    { t: 'Downloads', d: 'Download our brochures', u: P.downloads, k: 'Page', w: 'catalogue brochure pdf glazing window' },
    { t: 'Conversion Charts & Sizing', d: 'Imperial / metric, spanner and washer charts', u: P.charts, k: 'Page', w: 'inch mm metric imperial spanner allen key washer convert' },
    { t: 'Latest News', d: 'News, offers and trade guides', u: P.news, k: 'Page' },
    { t: 'About us', d: `Over 45 years serving the building industry`, u: P.about, k: 'Page', w: 'history story timeline' },
    { t: 'Meet the Team', d: 'The people behind the counter', u: P.team, k: 'Page', w: 'staff people' },
    { t: 'Delivery', d: 'Local and national delivery', u: P.delivery, k: 'Page', w: 'courier van drivers map' },
    { t: "FAQ's", d: 'Frequently asked questions', u: P.faq, k: 'Page', w: 'vat trade account order address opening times' },
    { t: 'Contact & opening hours', d: `${company.phone} · ${company.email}`, u: P.contact, k: 'Page', w: 'phone email address directions map hours open trade counter delivery facebook linkedin instagram' },
    { t: 'Terms & Conditions', d: 'Legal', u: P.legal('termsandconditions'), k: 'Page' },
    { t: 'Privacy Policy', d: 'Legal', u: P.legal('privacypolicy'), k: 'Page' },
    { t: 'Cookie Policy', d: 'Legal', u: P.legal('cookiepolicy'), k: 'Page' },
  );
  return entries;
}

// ---------------------------------------------------------------------------

async function build() {
  // Clear previously generated pages, but never the hand-written sources.
  const generatedDirs = new Set(pages.map((p) => p.path.split('/')[0]).filter(Boolean));
  for (const d of generatedDirs) await rm(join(ROOT, d), { recursive: true, force: true });

  for (const p of pages) {
    const file = join(ROOT, p.path, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, layout(p));
  }
  await mkdir(join(ROOT, 'assets/js'), { recursive: true });
  await writeFile(join(ROOT, 'assets/js/search-index.js'),
    `// Generated by build.mjs. Do not edit.\nwindow.MERLIN_SEARCH = ${JSON.stringify(searchIndex())};\n` +
    `window.MERLIN_HOURS = ${JSON.stringify(company.hours)};\n`);
  console.log(`Built ${pages.length} pages.`);
}

build();

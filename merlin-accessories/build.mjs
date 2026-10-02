// Renders the whole site to static HTML from src/content.mjs.
//
//   node merlin-accessories/build.mjs
//
// Every page shares one header, menu, footer and search index, so navigation is
// identical everywhere. Pages are written as <path>/index.html using the live
// site's URL slugs, and every link is relative, so the output works from any
// host or sub-folder.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  company, intro, supplyLine, categories, spotlights, toolRepair, about, team, news, downloads, bulk, promos,
} from './src/content.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const YEAR = new Date().getFullYear();

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Site map. Paths are directories relative to the site root ('' is home).

const P = {
  home: '',
  products: 'products/',
  category: (slug) => `products/${slug}/`,
  spotlight: (slug) => `${slug}/`,
  toolrepair: 'toolrepairservice/',
  about: 'about/',
  team: 'meettheteam/',
  news: 'latestnews/',
  downloads: 'downloads/',
  charts: 'conversioncharts/',
  contact: 'contact/',
  brands: 'brands/',
  bulk: 'bulkboxesandpalletdeals/',
};

const linkTarget = (key) => {
  if (key === 'toolrepairservice') return P.toolrepair;
  if (key === 'downloads') return P.downloads;
  if (key === 'products') return P.products;
  if (spotlights.some((s) => s.slug === key)) return P.spotlight(key);
  if (categories.some((c) => c.slug === key)) return P.category(key);
  return P[key] ?? '';
};

const downloadsMenu = [
  { path: P.downloads, label: 'Catalogues & Brochures', desc: 'Download our product brochures' },
  { path: P.charts, label: 'Conversion Charts', desc: 'Imperial, metric and screw gauges' },
];
const aboutMenu = [
  { path: P.about, label: 'About Merlin', desc: `Trading in Winchester since ${company.since}` },
  { path: P.team, label: 'Meet the Team', desc: 'The people behind the counter' },
  { path: P.news, label: 'Latest News', desc: 'Updates from Merlin' },
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
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  ruler: '<path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  mail: '<path d="M3 5h18v14H3z"/><path d="M3 6l9 7 9-7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
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
  `<img class="${cls}" src="${r('assets/img/logo.svg')}" alt="${company.name}" width="250" height="56">`;

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function megaMenu(r, current) {
  const cats = categories.map((c) => `
          <li><a class="mega-link${current === P.category(c.slug) ? ' is-current' : ''}" href="${r(P.category(c.slug))}">
            <span class="mega-icon">${icon(c.icon)}</span>
            <span><strong>${esc(c.name)}</strong><small>${esc(c.summary)}</small></span>
          </a></li>`).join('');
  const spots = spotlights.map((s) => `
          <li><a href="${r(P.spotlight(s.slug))}"><small>${esc(s.kicker)}</small>${esc(s.name)}</a></li>`).join('');
  return `
      <div class="mega" id="menu-products" data-menu-panel>
        <div class="container mega-inner">
          <ul class="mega-grid">${cats}
          </ul>
          <aside class="mega-aside">
            <p class="mega-heading">Featured ranges</p>
            <ul class="mega-spots">${spots}
              <li><a href="${r(P.bulk)}"><small>Volume pricing</small>${esc(bulk.title)}</a></li>
            </ul>
            <a class="mega-card" href="${r(P.toolrepair)}">
              ${icon('wrench')}
              <span><strong>Tool Repair Service</strong><small>Battery, motor, gearbox, switch &amp; trigger repairs</small></span>
            </a>
            <a class="btn btn-ghost btn-block" href="${r(P.products)}">View all products ${icon('arrow')}</a>
          </aside>
        </div>
      </div>`;
}

function dropMenu(id, items, r, current, cls = '') {
  return `
      <div class="drop ${cls}" id="${id}" data-menu-panel>
        <ul>${items.map((i) => `
          <li><a href="${r(i.path)}"${current === i.path ? ' aria-current="page"' : ''}><strong>${esc(i.label)}</strong>${i.desc ? `<small>${esc(i.desc)}</small>` : ''}</a></li>`).join('')}
        </ul>
      </div>`;
}

function header(r, current, section) {
  const is = (s) => (section === s ? ' is-active' : '');
  const cur = (p) => (current === p ? ' aria-current="page"' : '');
  const brandsMenu = [
    ...allBrands.map((b) => ({ path: `${P.brands}#${slug(b)}`, label: b })),
  ];
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
        ${dropMenu('menu-brands', brandsMenu, r, current, 'drop-cols')}
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
      <li class="nav-item${is('bulk')}"><a class="nav-link" href="${r(P.bulk)}"${cur(P.bulk)}>Bulk Boxes &amp; Pallet Deals</a></li>
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
      </ul>
    </details>
    <a class="drawer-link" href="${r(P.toolrepair)}">Tool Repair Service</a>
    <a class="drawer-link" href="${r(P.brands)}">Brands</a>
    <details class="drawer-group"${section === 'about' ? ' open' : ''}>
      <summary>About ${icon('chevron')}</summary>
      <ul>${aboutMenu.map((i) => `<li><a href="${r(i.path)}"${cur(i.path)}>${esc(i.label)}</a></li>`).join('')}</ul>
    </details>
    <details class="drawer-group"${section === 'downloads' ? ' open' : ''}>
      <summary>Downloads ${icon('chevron')}</summary>
      <ul>${downloadsMenu.map((i) => `<li><a href="${r(i.path)}"${cur(i.path)}>${esc(i.label)}</a></li>`).join('')}</ul>
    </details>
    <a class="drawer-link" href="${r(P.contact)}">Contact</a>
    <a class="drawer-link" href="${r(P.bulk)}">Bulk Boxes &amp; Pallet Deals</a>
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

function footer(r) {
  const col = (title, items) => `
      <div class="footer-col">
        <p class="footer-title">${title}</p>
        <ul>${items.map(([path, label]) => `<li><a href="${r(path)}">${esc(label)}</a></li>`).join('')}</ul>
      </div>`;
  return `
<section class="contact-band">
  <div class="container contact-band-inner">
    <div>
      <h2>Can't see what you need?</h2>
      <p>We stock far more than we can list. Call the team or drop in to the trade counter.</p>
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
      <p>${esc(company.tagline)}. Supplying the trade from ${esc(company.town)} since ${company.since}.</p>
      <a class="footer-social" href="${company.facebook}" target="_blank" rel="noopener">${icon('facebook')} Facebook</a>
    </div>
    ${col('Products', [[P.products, 'All products'], ...categories.map((c) => [P.category(c.slug), c.name])])}
    ${col('Company', [[P.about, 'About'], [P.team, 'Meet the Team'], [P.news, 'Latest News'], [P.contact, 'Contact']])}
    ${col('Services', [[P.toolrepair, 'Tool Repair Service'], [P.bulk, 'Bulk Boxes & Pallet Deals'], [P.brands, 'Brands'], [P.downloads, 'Downloads'], [P.charts, 'Conversion Charts']])}
    <div class="footer-col">
      <p class="footer-title">Visit us</p>
      <address>
        ${company.address.map(esc).join('<br>')}
      </address>
      <p><a href="${company.phoneHref}">${company.phone}</a><br><a href="mailto:${company.email}">${company.email}</a></p>
      <dl class="footer-hours">
        <dt>Office</dt><dd>${hoursText(company.hours.office)}</dd>
        <dt>Trade Counter</dt><dd>${hoursText(company.hours.counter)}</dd>
      </dl>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>© ${YEAR} ${company.name}. Registered in England, company no. 01448569.</p>
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

function layout({ path, title, description, section, body, head = '' }) {
  const r = (to) => rel(path, to);
  const fullTitle = path === '' ? title : `${title} | ${company.name}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0d2b4e">
<link rel="icon" href="${r('assets/img/favicon.svg')}" type="image/svg+xml">
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
    <span class="cat-body"><strong>${esc(c.name)}</strong><small>${esc(c.summary)}</small></span>
    <span class="cat-arrow">${icon('arrow')}</span>
  </a></li>`;

const brandChips = (list) =>
  `<ul class="chips">${list.map((b) => `<li class="chip">${esc(b)}</li>`).join('')}</ul>`;

const allBrands = [...new Set([...categories.flatMap((c) => c.brands), ...toolRepair.brands])];

// Home -----------------------------------------------------------------------
page({
  path: P.home,
  title: `${company.name} | ${company.tagline} | ${company.town}.`,
  description: intro,
  head: `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HardwareStore',
    name: company.name,
    telephone: company.phone,
    email: company.email,
    foundingDate: String(company.since),
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${company.address[0]}, ${company.address[1]}`,
      addressLocality: company.address[2],
      postalCode: company.address[3],
      addressCountry: 'GB',
    },
    openingHours: 'Mo-Fr 07:00-17:00',
    sameAs: [company.facebook],
  })}</script>`,
  body: (r) => `
<section class="home-top">
  <div class="container">
    <a class="banner-hero" href="${r(P.toolrepair)}">
      <div class="banner-media">
        ${icon('wrench', 'banner-fallback-icon')}
        <img class="slot-img" src="${r('assets/img/banner-tool-repair.jpg')}" alt="" onerror="this.remove()">
        <ul class="banner-brands" aria-label="Brands we repair">${toolRepair.brands.slice(0, 6).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </div>
      <div class="banner-copy">
        <p class="banner-title">Tool repair <span class="script">Service</span></p>
        <ul class="banner-checks">${toolRepair.services.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <span class="pill-btn">Find out more ${icon('play')}</span>
      </div>
    </a>

    <ul class="promo-grid">${promos.map((pr) => `
      <li><a class="promo" href="${r(linkTarget(pr.link))}">
        <span class="promo-head">
          ${pr.logo ? `${logo(r, 'logo logo-promo')}` : `<span class="promo-title">${esc(pr.title)}${pr.script ? ` <span class="script">${esc(pr.script)}</span>` : ''}${pr.sub ? `<span class="promo-sub">${esc(pr.sub)}</span>` : ''}</span>`}
          ${pr.text ? `<span class="promo-text">${esc(pr.text)}</span>` : ''}
        </span>
        <span class="promo-media"><img class="slot-img" src="${r(`assets/img/${pr.image}`)}" alt="" loading="lazy" onerror="this.remove()">${pr.badge ? `<span class="promo-badge">${esc(pr.badge)}</span>` : ''}</span>
        <span class="promo-foot"><span class="stripes" aria-hidden="true"></span>${esc(pr.cta)} ${icon('arrow')}</span>
      </a></li>`).join('')}
    </ul>
  </div>
</section>

<section class="section intro">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="kicker">Trade supplier · ${esc(company.town)} · Since ${company.since}</p>
      <h1>${esc(company.tagline)}</h1>
      <p class="lead">${esc(intro)}</p>
      <p class="lead lead-strong">${esc(company.productCount)}</p>
      <button class="hero-search" type="button" data-search-open>
        ${icon('search')}<span>What are you looking for? Try “silicone” or “post spikes”</span><kbd>/</kbd>
      </button>
    </div>
    <aside class="visit-card" aria-label="Trade counter">
      <p class="status status-lg" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Trade counter ${hoursText(company.hours.counter)}</span></p>
      <dl class="hours">
        <div><dt>Trade Counter</dt><dd>${hoursText(company.hours.counter)}</dd></div>
        <div><dt>Office</dt><dd>${hoursText(company.hours.office)}</dd></div>
      </dl>
      <address>${icon('pin')}<span>${company.address.map(esc).join(', ')}</span></address>
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
        <h2>Shop by category</h2>
      </div>
      <a class="text-link" href="${r(P.products)}">All products ${icon('arrow')}</a>
    </div>
    <ul class="cat-grid">${categories.map((c) => categoryCard(r, c)).join('')}
    </ul>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Services &amp; resources</p><h2>More than a trade counter</h2></div></div>
    <ul class="feature-grid">
      <li><a class="feature feature-primary" href="${r(P.toolrepair)}">
        ${icon('wrench', 'icon icon-lg')}
        <h3>Tool Repair Service</h3>
        <p>${esc(toolRepair.intro.split('. ')[0])}.</p>
        <span class="text-link">How it works ${icon('arrow')}</span>
      </a></li>
      <li><a class="feature" href="${r(P.downloads)}">
        ${icon('file', 'icon icon-lg')}
        <h3>Catalogues &amp; downloads</h3>
        <p>Brochures covering the Window Industry, Gate &amp; Fence, Fasteners &amp; Fixings, Building Hardware and more.</p>
        <span class="text-link">See downloads ${icon('arrow')}</span>
      </a></li>
      <li><a class="feature" href="${r(P.charts)}">
        ${icon('ruler', 'icon icon-lg')}
        <h3>Conversion charts</h3>
        <p>Handy imperial, metric and screw gauge conversions, with a quick converter.</p>
        <span class="text-link">Open charts ${icon('arrow')}</span>
      </a></li>
    </ul>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <p class="brands-label">Supplying the best brands in the trade</p>
    <ul class="brand-strip">${allBrands.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  </div>
</section>

<section class="section section-alt">
  <div class="container split">
    <div>
      <p class="kicker">About Merlin</p>
      <h2>Over 40 years serving the building industry</h2>
      <p>${esc(supplyLine)}</p>
      <div class="hero-actions">
        <a class="btn btn-ghost" href="${r(P.about)}">Our story</a>
        <a class="btn btn-ghost" href="${r(P.team)}">Meet the team</a>
      </div>
    </div>
    <div>
      <div class="section-head section-head-sm"><h2 class="h3">Latest news</h2><a class="text-link" href="${r(P.news)}">All news ${icon('arrow')}</a></div>
      <ul class="news-list news-list-compact">${news.slice(0, 2).map((n) => newsItem(r, n)).join('')}</ul>
    </div>
  </div>
</section>`,
});

function newsItem(r, n) {
  return `
        <li class="news-item">
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.text)}</p>
          ${n.link ? `<a class="text-link" href="${r(linkTarget(n.link))}">Read more ${icon('arrow')}</a>` : ''}
        </li>`;
}

// Products overview ----------------------------------------------------------
page({
  path: P.products,
  title: 'Products',
  section: 'products',
  description: supplyLine,
  body: (r) => `
${pageHero(r, {
    trail: [[P.products, 'Products']],
    kicker: `${categories.length} categories`,
    title: 'Products',
    lead: supplyLine,
    actions: `<button class="btn btn-primary" type="button" data-search-open>${icon('search')} Search the range</button>
      <a class="btn btn-ghost" href="${r(P.downloads)}">${icon('file')} Download catalogues</a>`,
  })}
<section class="section">
  <div class="container">
    <ul class="range-grid">${categories.map((c) => `
      <li class="range-card">
        <a class="range-head" href="${r(P.category(c.slug))}">
          <span class="cat-icon">${icon(c.icon)}</span>
          <span><strong>${esc(c.name)}</strong><small>${esc(c.summary)}</small></span>
        </a>
        ${c.groups.length ? `<ul class="range-links">${c.groups.map((g) => `<li><a href="${r(P.category(c.slug))}#${anchor(g.name)}">${esc(g.name)}</a></li>`).join('')}</ul>` : ''}
        <a class="text-link" href="${r(P.category(c.slug))}">View ${esc(c.name)} ${icon('arrow')}</a>
      </li>`).join('')}
    </ul>
  </div>
</section>
<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><p class="kicker">Featured ranges</p><h2>Spotlight</h2></div></div>
    <ul class="spot-grid">${spotlights.map((s) => `
      <li><a class="spot" href="${r(P.spotlight(s.slug))}"><p class="kicker">${esc(s.kicker)}</p><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><span class="text-link">View range ${icon('arrow')}</span></a></li>`).join('')}
      <li><a class="spot spot-dark" href="${r(P.toolrepair)}"><p class="kicker">Service</p><h3>Tool Repair</h3><p>${esc(toolRepair.brands.join(', '))} and more.</p><span class="text-link">How it works ${icon('arrow')}</span></a></li>
    </ul>
  </div>
</section>`,
});

function anchor(s) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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

function enquiryCard(subject, what) {
  return `
    <aside class="enquiry-card">
      <h2 class="h3">Ask about ${esc(what)}</h2>
      <p>Stock, pricing or something specific? The team will point you to the right product.</p>
      <div class="enquiry-actions">
        <a class="btn btn-primary" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
        <a class="btn btn-ghost" href="${enquire(subject)}">${icon('mail')} Email an enquiry</a>
      </div>
    </aside>`;
}

categories.forEach((c, i) => {
  const prev = categories[(i - 1 + categories.length) % categories.length];
  const next = categories[(i + 1) % categories.length];
  page({
    path: P.category(c.slug),
    title: c.name,
    section: 'products',
    description: c.body,
    body: (r) => `
${pageHero(r, {
      trail: [[P.products, 'Products'], [P.category(c.slug), c.name]],
      kicker: 'Products',
      title: c.name,
      lead: c.body,
      iconName: c.icon,
      actions: `<a class="btn btn-primary" href="${enquire(`${c.name} enquiry`)}">${icon('mail')} Ask about stock</a>
        <a class="btn btn-ghost" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>`,
    })}
<section class="section">
  <div class="container with-side">
    ${sideNav(r, c.slug)}
    <div class="content">
      ${c.groups.length ? `
      <nav class="jump" aria-label="In this category">
        <p>Jump to</p>
        <ul>${c.groups.map((g) => `<li><a href="#${anchor(g.name)}">${esc(g.name)}</a></li>`).join('')}</ul>
      </nav>
      <ul class="group-grid">${c.groups.map((g) => `
        <li class="group" id="${anchor(g.name)}">
          <h2 class="h3">${esc(g.name)}</h2>
          ${g.items.length ? `<ul class="ticks">${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>` : ''}
          <a class="text-link" href="${enquire(`${c.name} – ${g.name} enquiry`)}">Enquire ${icon('arrow')}</a>
        </li>`).join('')}
      </ul>` : `
      <div class="notice">
        ${icon(c.icon, 'icon icon-lg')}
        <div><h2 class="h3">The full ${esc(c.name)} range is at our trade counter</h2>
        <p>Call or email and the team will check stock and pricing for you.</p></div>
      </div>`}

      ${c.brands.length ? `
      <div class="block">
        <h2 class="h3">Brands we stock</h2>
        ${brandChips(c.brands)}
      </div>` : ''}

      ${(c.featured || []).length ? `
      <div class="block">
        <h2 class="h3">Featured in this category</h2>
        <ul class="spot-grid spot-grid-sm">${c.featured.map((slug) => spotlights.find((s) => s.slug === slug)).map((s) => `
          <li><a class="spot" href="${r(P.spotlight(s.slug))}"><p class="kicker">${esc(s.kicker)}</p><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><span class="text-link">View range ${icon('arrow')}</span></a></li>`).join('')}
        </ul>
      </div>` : ''}

      ${(c.related || []).includes('toolrepairservice') ? `
      <a class="banner" href="${r(P.toolrepair)}">
        ${icon('wrench', 'icon icon-lg')}
        <span><strong>Tool not working?</strong> Our workshop repairs DeWalt, Makita, Metabo, HiKOKI, Bosch, Milwaukee and more.</span>
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

// Spotlights -------------------------------------------------------------------
spotlights.forEach((s) => {
  const cat = categories.find((c) => c.slug === s.category);
  page({
    path: P.spotlight(s.slug),
    title: s.name,
    section: 'products',
    description: s.body.join(' '),
    body: (r) => `
${pageHero(r, {
      trail: [[P.products, 'Products'], [P.category(cat.slug), cat.name], [P.spotlight(s.slug), s.name]],
      kicker: s.kicker,
      title: s.name,
      lead: s.body[0],
      actions: `<a class="btn btn-primary" href="${enquire(`${s.name} enquiry`)}">${icon('mail')} Ask about ${esc(s.name)}</a>
        <a class="btn btn-ghost" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>`,
    })}
<section class="section">
  <div class="container with-side">
    ${sideNav(r, s.slug)}
    <div class="content">
      ${s.body.slice(1).map((p) => `<p class="prose">${esc(p)}</p>`).join('')}
      <ul class="tile-list">${s.list.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>
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
  description: toolRepair.intro,
  body: (r) => `
${pageHero(r, {
    trail: [[P.toolrepair, 'Tool Repair Service']],
    kicker: 'In-house workshop',
    title: 'Tool Repair Service',
    lead: toolRepair.intro,
    iconName: 'wrench',
    actions: `<a class="btn btn-primary btn-lg" href="${company.phoneHref}">${icon('phone')} Call ${company.phone}</a>
      <a class="btn btn-ghost btn-lg" href="${enquire('Tool repair enquiry')}">${icon('mail')} Email us</a>`,
  })}
<section class="section">
  <div class="container">
    ${news[0] && news[0].link === 'toolrepairservice' ? `
    <div class="alert" role="note">${icon('clock')}<p><strong>${esc(news[0].title)}.</strong> ${esc(news[0].text)}</p></div>` : ''}
    <ol class="steps">${toolRepair.steps.map((s, i) => `
      <li><span class="step-num">${i + 1}</span><h2 class="h3">${esc(s.title)}</h2><p>${esc(s.text)}</p></li>`).join('')}
    </ol>
    <div class="block">
      <h2 class="h3">What we do</h2>
      <ul class="tile-list tile-list-check">${toolRepair.services.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    <div class="two-col">
      <div class="block">
        <h2 class="h3">Brands we repair</h2>
        ${brandChips([...toolRepair.brands, 'and others'])}
      </div>
      <div class="block">
        <h2 class="h3">Tools we repair</h2>
        <ul class="ticks ticks-cols">${toolRepair.tools.map((t) => `<li>${esc(t)}</li>`).join('')}<li>…and more</li></ul>
      </div>
    </div>
    ${enquiryCard('Tool repair enquiry', 'a repair')}
  </div>
</section>`,
});

// About & team --------------------------------------------------------------------
page({
  path: P.about,
  title: 'About',
  section: 'about',
  description: intro,
  body: (r) => `
${pageHero(r, { trail: [[P.about, 'About']], kicker: `Since ${company.since}`, title: 'About Merlin', lead: about.paragraphs[0] })}
<section class="section">
  <div class="container split">
    <div class="prose">${about.paragraphs.slice(1).map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="hero-actions">
        <a class="btn btn-primary" href="${r(P.team)}">${icon('people')} Meet the team</a>
        <a class="btn btn-ghost" href="${r(P.products)}">Our products</a>
      </div>
    </div>
    <ol class="timeline">${about.timeline.map((t) => `<li><span class="timeline-year">${esc(t.year)}</span><p>${esc(t.text)}</p></li>`).join('')}</ol>
  </div>
</section>`,
});

page({
  path: P.team,
  title: 'Meet the Team',
  section: 'about',
  description: `The team at ${company.name}, Winchester.`,
  body: (r) => `
${pageHero(r, { trail: [[P.about, 'About'], [P.team, 'Meet the Team']], kicker: 'About', title: 'Meet the Team', lead: 'The people behind the trade counter in Winchester.' })}
<section class="section">
  <div class="container">
    <ul class="team-grid">${team.map((m) => `
      <li class="team-card">
        <span class="avatar" aria-hidden="true">${m.name ? esc(m.name.split(' ').map((w) => w[0]).join('')) : icon('people')}</span>
        ${m.name ? `<h2 class="h3">${esc(m.name)}</h2>` : ''}
        <p class="team-role">${esc(m.role)}</p>
        <p class="team-since">With Merlin since ${m.since}</p>
      </li>`).join('')}
    </ul>
  </div>
</section>`,
});

// News, downloads, charts ---------------------------------------------------------------
page({
  path: P.news,
  title: 'Latest News',
  section: 'about',
  description: `News and updates from ${company.name}.`,
  body: (r) => `
${pageHero(r, { trail: [[P.news, 'Latest News']], kicker: 'Resources', title: 'Latest News', iconName: 'news' })}
<section class="section">
  <div class="container narrow">
    <ul class="news-list">${news.map((n) => newsItem(r, n)).join('')}</ul>
    <p class="muted">Follow us on <a href="${company.facebook}" target="_blank" rel="noopener">Facebook</a> for the latest updates.</p>
  </div>
</section>`,
});

page({
  path: P.downloads,
  title: 'Downloads',
  section: 'downloads',
  description: 'Download Merlin Accessories catalogues and brochures.',
  body: (r) => `
${pageHero(r, { trail: [[P.downloads, 'Downloads']], kicker: 'Resources', title: 'Downloads', lead: 'Catalogues and brochures covering our main ranges.', iconName: 'file' })}
<section class="section">
  <div class="container">
    <ul class="download-grid">${downloads.map((d) => `
      <li class="download">
        ${icon('file', 'icon icon-lg')}
        <div><p class="kicker">${esc(d.topic)}</p><h2 class="h3">${esc(d.title)}</h2></div>
        ${d.file
    ? `<a class="btn btn-primary" href="${esc(d.file)}" download>Download PDF</a>`
    : `<a class="btn btn-ghost" href="${enquire(`Please send me the ${d.title} brochure`)}">${icon('mail')} Request a copy</a>`}
      </li>`).join('')}
    </ul>
  </div>
</section>`,
});

page({
  path: P.charts,
  title: 'Conversion Charts',
  section: 'downloads',
  description: 'Handy imperial and metric conversion charts for the trade.',
  body: (r) => `
${pageHero(r, { trail: [[P.charts, 'Conversion Charts']], kicker: 'Resources', title: 'Conversion Charts', lead: 'Handy conversions for the site and the workshop.', iconName: 'ruler' })}
<section class="section">
  <div class="container">
    <form class="converter" data-converter onsubmit="return false">
      <h2 class="h3">Quick converter</h2>
      <div class="converter-row">
        <label><span>Value</span><input type="number" inputmode="decimal" step="any" value="1" data-conv-value></label>
        <label><span>From</span><select data-conv-from>${UNITS.map((u) => `<option value="${u[0]}"${u[0] === 'in' ? ' selected' : ''}>${u[1]}</option>`).join('')}</select></label>
        <button class="icon-button swap" type="button" data-conv-swap aria-label="Swap units">⇄</button>
        <label><span>To</span><select data-conv-to>${UNITS.map((u) => `<option value="${u[0]}"${u[0] === 'mm' ? ' selected' : ''}>${u[1]}</option>`).join('')}</select></label>
      </div>
      <output class="converter-out" data-conv-out aria-live="polite">1 in = 25.4 mm</output>
    </form>

    <nav class="jump" aria-label="Charts on this page">
      <p>Jump to</p>
      <ul><li><a href="#fractions">Inch fractions to mm</a></li><li><a href="#gauges">Screw gauges</a></li><li><a href="#lengths">Feet to metres</a></li></ul>
    </nav>

    <div class="chart-grid">
      <div class="table-card" id="fractions">
        <h2 class="h3">Inch fractions to millimetres</h2>
        <table><thead><tr><th scope="col">Inches</th><th scope="col">Decimal</th><th scope="col">mm</th></tr></thead>
        <tbody>${FRACTIONS.map(([n, d]) => `<tr><th scope="row">${fraction(n, d)}"</th><td>${(n / d).toFixed(4)}</td><td>${(n / d * 25.4).toFixed(2)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="table-card" id="gauges">
        <h2 class="h3">Wood screw gauges</h2>
        <table><thead><tr><th scope="col">Gauge</th><th scope="col">Shank (in)</th><th scope="col">Shank (mm)</th><th scope="col">Metric equivalent</th></tr></thead>
        <tbody>${GAUGES.map(([g, m]) => { const inch = 0.06 + 0.013 * g; return `<tr><th scope="row">No. ${g}</th><td>${inch.toFixed(3)}</td><td>${(inch * 25.4).toFixed(2)}</td><td>${m} mm</td></tr>`; }).join('')}</tbody></table>
        <p class="table-note">Shank diameter from the ANSI gauge formula (0.060" + 0.013" × gauge). Metric equivalents are the nearest common size.</p>
      </div>
      <div class="table-card" id="lengths">
        <h2 class="h3">Feet to metres</h2>
        <table><thead><tr><th scope="col">Feet</th><th scope="col">Metres</th></tr></thead>
        <tbody>${[1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20].map((f) => `<tr><th scope="row">${f} ft</th><td>${(f * 0.3048).toFixed(3)} m</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
  </div>
</section>`,
});

const UNITS = [['mm', 'Millimetres (mm)'], ['cm', 'Centimetres (cm)'], ['m', 'Metres (m)'], ['in', 'Inches (in)'], ['ft', 'Feet (ft)'], ['yd', 'Yards (yd)']];
const FRACTIONS = [[1, 16], [1, 8], [3, 16], [1, 4], [5, 16], [3, 8], [7, 16], [1, 2], [9, 16], [5, 8], [11, 16], [3, 4], [13, 16], [7, 8], [15, 16], [1, 1]];
const GAUGES = [[4, 3], [6, 3.5], [8, 4], [10, 5], [12, 5.5], [14, 6]];
const fraction = (n, d) => (d === 1 ? `${n}` : `${n}/${d}`);

// Brands --------------------------------------------------------------------------------
const brandHome = (b) => categories.filter((c) => c.brands.includes(b));
page({
  path: P.brands,
  title: 'Brands',
  section: 'brands',
  description: `Brands stocked by ${company.name}.`,
  body: (r) => `
${pageHero(r, { trail: [[P.brands, 'Brands']], kicker: 'Brands', title: 'Our brands', lead: 'We source and supply from all of the best brands in the trade.' })}
<section class="section">
  <div class="container">
    <nav class="jump" aria-label="Brands A to Z">
      <p>Jump to</p>
      <ul>${[...allBrands].sort((a, b) => a.localeCompare(b)).map((b) => `<li><a href="#${slug(b)}">${esc(b)}</a></li>`).join('')}</ul>
    </nav>
    <ul class="brand-grid">${[...allBrands].sort((a, b) => a.localeCompare(b)).map((b) => {
    const cats = brandHome(b);
    const repairs = toolRepair.brands.includes(b);
    return `
      <li class="brand-card" id="${slug(b)}">
        <h2 class="h3">${esc(b)}</h2>
        <ul class="brand-links">${cats.map((c) => `<li><a href="${r(P.category(c.slug))}">${icon(c.icon)} ${esc(c.name)}</a></li>`).join('')}${repairs ? `
          <li><a href="${r(P.toolrepair)}">${icon('wrench')} Tool Repair Service</a></li>` : ''}
        </ul>
      </li>`;
  }).join('')}
    </ul>
  </div>
</section>`,
});

// Bulk deals --------------------------------------------------------------------------------
page({
  path: P.bulk,
  title: bulk.title,
  section: 'bulk',
  description: bulk.lead,
  body: (r) => `
${pageHero(r, {
    trail: [[P.bulk, bulk.title]], kicker: 'Volume pricing', title: bulk.title, lead: bulk.lead,
    actions: `<a class="btn btn-primary btn-lg" href="${company.phoneHref}">${icon('phone')} ${company.phone}</a>
      <a class="btn btn-ghost btn-lg" href="${enquire('Bulk / pallet deal enquiry')}">${icon('mail')} Request a quote</a>`,
  })}
<section class="section">
  <div class="container">
    ${bulk.body.map((p) => `<p class="prose">${esc(p)}</p>`).join('')}
    <ul class="spot-grid">${bulk.deals.map((d) => `
      <li><a class="spot" href="${r(linkTarget(d.link))}"><p class="kicker">Bulk deal</p><h3>${esc(d.name)}</h3><p>${esc(d.detail)}</p><span class="text-link">View ${icon('arrow')}</span></a></li>`).join('')}
    </ul>
    ${enquiryCard('Bulk / pallet deal enquiry', 'bulk pricing')}
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
${pageHero(r, { trail: [[P.contact, 'Contact']], kicker: 'Get in touch', title: 'Contact us', lead: 'Call, email or visit our trade counter on the Winnall Trading Estate.' })}
<section class="section">
  <div class="container contact-grid">
    <div class="contact-cards">
      <a class="contact-card" href="${company.phoneHref}">${icon('phone', 'icon icon-lg')}<span><small>Call</small><strong>${company.phone}</strong></span></a>
      <a class="contact-card" href="mailto:${company.email}">${icon('mail', 'icon icon-lg')}<span><small>Email</small><strong>${company.email}</strong></span></a>
      <a class="contact-card" href="${company.mapsHref}" target="_blank" rel="noopener">${icon('pin', 'icon icon-lg')}<span><small>Visit</small><strong>${company.address.map(esc).join(', ')}</strong></span></a>
      <div class="hours-card">
        <p class="status status-lg" data-open-status><span class="status-dot" aria-hidden="true"></span><span class="status-text">Trade counter ${hoursText(company.hours.counter)}</span></p>
        <table class="hours-table" data-hours-table>
          <thead><tr><th scope="col">Day</th><th scope="col">Trade Counter</th><th scope="col">Office</th></tr></thead>
          <tbody>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => {
    const day = (i + 1) % 7;
    const h = (k) => (company.hours[k].days.includes(day) ? `${company.hours[k].open} – ${company.hours[k].close}` : 'Closed');
    return `<tr data-day="${day}"><th scope="row">${d}</th><td>${h('counter')}</td><td>${h('office')}</td></tr>`;
  }).join('')}</tbody>
        </table>
      </div>
    </div>

    <form class="enquiry-form" data-enquiry-form data-email="${company.email}">
      <h2 class="h3">Send an enquiry</h2>
      <p class="muted">Fill this in and it will open in your email app, ready to send.</p>
      <div class="form-row">
        <label><span>Name</span><input name="name" autocomplete="name" required></label>
        <label><span>Company <em>(optional)</em></span><input name="company" autocomplete="organization"></label>
      </div>
      <div class="form-row">
        <label><span>Phone <em>(optional)</em></span><input name="phone" type="tel" autocomplete="tel"></label>
        <label><span>Topic</span><select name="topic">
          <option>General enquiry</option>
          <option>Tool Repair Service</option>
          ${categories.map((c) => `<option>${esc(c.name)}</option>`).join('')}
          <option>Catalogue request</option>
        </select></label>
      </div>
      <label><span>Message</span><textarea name="message" rows="5" required placeholder="Product, quantity, sizes…"></textarea></label>
      <button class="btn btn-primary btn-lg" type="submit">${icon('mail')} Write email</button>
    </form>
  </div>
  <div class="container">
    <div class="map">
      <iframe title="Map showing Merlin Accessories, Winnall Trading Estate" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=${encodeURIComponent(`${company.name}, ${company.address.join(', ')}`)}&amp;output=embed"></iframe>
    </div>
  </div>
</section>`,
});

// ---------------------------------------------------------------------------
// Search index: categories, their sub-ranges, brands, spotlights and pages.

function searchIndex() {
  const entries = [];
  for (const c of categories) {
    entries.push({ t: c.name, d: c.summary, u: P.category(c.slug), k: 'Category', w: [c.body, ...c.brands].join(' ') });
    for (const g of c.groups) {
      entries.push({ t: g.name, d: `in ${c.name}`, u: `${P.category(c.slug)}#${anchor(g.name)}`, k: 'Range', w: g.items.join(' ') });
      for (const it of g.items) entries.push({ t: it, d: `${g.name} · ${c.name}`, u: `${P.category(c.slug)}#${anchor(g.name)}`, k: 'Product' });
    }
  }
  for (const s of spotlights) entries.push({ t: s.name, d: s.summary, u: P.spotlight(s.slug), k: 'Featured', w: [s.kicker, ...s.list, ...s.body].join(' ') });
  for (const b of allBrands) {
    const where = categories.filter((c) => c.brands.includes(b)).map((c) => c.name);
    if (toolRepair.brands.includes(b)) where.push('Tool Repair');
    entries.push({ t: b, d: `Brand · ${where.join(', ')}`, u: `${P.brands}#${slug(b)}`, k: 'Brand' });
  }
  entries.push(
    { t: 'Tool Repair Service', d: 'Repairs for DeWalt, Makita, Metabo, HiKOKI, Bosch, Milwaukee', u: P.toolrepair, k: 'Service', w: [...toolRepair.tools, ...toolRepair.services].join(' ') + ' fix broken mend battery motor gearbox switch trigger' },
    { t: bulk.title, d: bulk.lead, u: P.bulk, k: 'Page', w: 'bulk pallet box volume trade price LMN silicone Soudal' },
    { t: 'Brands', d: 'All the brands we stock', u: P.brands, k: 'Page' },
    { t: 'Downloads', d: 'Catalogues and brochures', u: P.downloads, k: 'Page', w: 'catalogue brochure pdf glazing window' },
    { t: 'Conversion Charts', d: 'Imperial, metric and screw gauges', u: P.charts, k: 'Page', w: 'inch mm metric imperial gauge convert' },
    { t: 'Latest News', d: 'Updates from Merlin', u: P.news, k: 'Page' },
    { t: 'About Merlin', d: `Trading since ${company.since}`, u: P.about, k: 'Page', w: 'history story' },
    { t: 'Meet the Team', d: 'The people behind the counter', u: P.team, k: 'Page', w: 'staff people Mike Carey' },
    { t: 'Contact & opening hours', d: `${company.phone} · ${company.email}`, u: P.contact, k: 'Page', w: 'phone email address directions map hours open trade counter delivery' },
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

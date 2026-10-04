// The app shell: navigation rail, filter bar, and switching between screens.
// Screens live in js/views/ and are loaded when first opened.

import { APP_NAME, IS_DEMO } from './config.js';
import { loadAll } from './db/store.js';
import { html, render } from './ui/html.js';
import { ukDate } from './ui/format.js';

const NAV = [
  { id: 'attention', label: 'Needs attention', path: '#/attention' },
  { id: 'customers', label: 'Customers', path: '#/customers' },
  { id: 'products', label: 'Products and stock', path: '#/products' },
  { id: 'reps', label: 'Reps', path: '#/reps' },
  { id: 'map', label: 'Map', path: '#/map' },
  { sep: true },
  { id: 'import', label: 'Import', path: '#/import' },
  { id: 'settings', label: 'Settings', path: '#/settings' },
];

const VIEWS = {
  attention: () => import('./views/attention.js'),
  customers: () => import('./views/customers.js'),
  customer: () => import('./views/customer.js'),
  products: () => import('./views/products.js'),
  reps: () => import('./views/reps.js'),
  map: () => import('./views/map.js'),
  import: () => import('./views/import.js'),
  settings: () => import('./views/settings.js'),
};

// The rail highlights the parent section for detail screens.
const NAV_PARENT = { customer: 'customers' };

const PERIODS = [
  { id: '12m', label: 'Last 12 months' },
  { id: 'ytd', label: 'This year to date' },
  { id: 'lastmonth', label: 'Last full month' },
  { id: 'all', label: 'All data' },
];

function readFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('filters') || 'null');
    if (saved) return { period: '12m', rep: '', trade: '', ...saved };
  } catch { /* storage may be unavailable */ }
  return { period: '12m', rep: '', trade: '' };
}

export const app = {
  data: null,
  filters: readFilters(),

  async reload() {
    this.data = await loadAll();
    renderShellStatus();
    renderFilters();
  },

  setFilter(name, value) {
    this.filters[name] = value;
    try { sessionStorage.setItem('filters', JSON.stringify(this.filters)); } catch { /* ignore */ }
    route();
  },

  go(path) {
    if (location.hash === path) route();
    else location.hash = path;
  },
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const id = parts[0] && VIEWS[parts[0]] ? parts[0] : 'attention';
  return { id, params: parts.slice(1) };
}

function renderShell() {
  const root = document.getElementById('app');
  render(root, html`
    <a class="skip-link" href="#content">Skip to content</a>
    <div class="shell">
      <nav class="rail" aria-label="Main">
        <div class="rail__brand">
          <div class="rail__brand-name">${APP_NAME}</div>
          <div class="rail__brand-sub">Merlin Accessories, Winchester</div>
        </div>
        <ul class="rail__nav">
          ${NAV.map((n) => n.sep
            ? html`<li class="rail__sep" role="presentation"></li>`
            : html`<li><a href="${n.path}" data-nav="${n.id}">${n.label}</a></li>`)}
        </ul>
        <div class="rail__foot">Data is stored on this computer only.</div>
      </nav>
      <div class="main">
        <header class="topbar">
          <div class="topbar__filters" id="filters"></div>
          <div class="topbar__status" id="status" aria-live="polite"></div>
        </header>
        <main class="content" id="content" tabindex="-1"></main>
      </div>
    </div>
  `);

  document.getElementById('filters').addEventListener('change', (e) => {
    const name = e.target.dataset.filter;
    if (name) app.setFilter(name, e.target.value);
  });
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderFilters() {
  const el = document.getElementById('filters');
  if (!el) return;
  const d = app.data;
  const hasSales = d && d.sales.length > 0;
  const reps = hasSales ? distinct(d.customers.map((c) => d.overrides.get(c.account_code)?.fields?.rep?.value ?? c.rep)) : [];
  const trades = hasSales ? distinct(d.customers.map((c) => d.overrides.get(c.account_code)?.fields?.trade_type?.value ?? c.trade_type)) : [];
  const f = app.filters;
  render(el, html`
    <label>Period
      <select class="select" data-filter="period" ${hasSales ? '' : 'disabled'}>
        ${PERIODS.map((p) => html`<option value="${p.id}" ${p.id === f.period ? 'selected' : ''}>${p.label}</option>`)}
      </select>
    </label>
    <label>Rep
      <select class="select" data-filter="rep" ${reps.length ? '' : 'disabled'}>
        <option value="">All reps</option>
        ${reps.map((r) => html`<option ${r === f.rep ? 'selected' : ''}>${r}</option>`)}
      </select>
    </label>
    <label>Trade type
      <select class="select" data-filter="trade" ${trades.length ? '' : 'disabled'}>
        <option value="">All trade types</option>
        ${trades.map((t) => html`<option ${t === f.trade ? 'selected' : ''}>${t}</option>`)}
      </select>
    </label>
  `);
}

function renderShellStatus() {
  const el = document.getElementById('status');
  if (!el) return;
  const last = app.data?.meta?.lastImport;
  if (IS_DEMO) {
    render(el, html`Fictional data to <strong>${ukDate(last?.salesTo)}</strong>`);
  } else if (!last) {
    render(el, html`No data imported yet`);
  } else {
    render(el, html`Last import <strong>${ukDate(last.date)}</strong>${last.salesTo ? html` · sales to ${ukDate(last.salesTo)}` : ''}`);
  }
}

let routeToken = 0;

async function route() {
  const { id, params } = parseRoute();
  const token = ++routeToken;
  const navId = NAV_PARENT[id] || id;
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === navId) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const content = document.getElementById('content');
  const mod = await VIEWS[id]();
  if (token !== routeToken) return;
  document.title = `${mod.title || 'Merlin Sales'} · ${APP_NAME}`;
  // A fresh element per visit, so a screen's event listeners never pile up.
  const view = document.createElement('div');
  content.replaceChildren(view);
  try {
    await mod.render(view, { params, app });
  } catch (err) {
    console.error(err);
    render(view, html`
      <div class="notice notice--error"><strong>Something went wrong showing this screen.</strong>
      <p>${err.message}</p></div>`);
  }
}

async function start() {
  renderShell();
  try {
    await app.reload();
  } catch (err) {
    console.error(err);
    app.data = { customers: [], overrides: new Map(), sales: [], stock: [], stockPrevious: [], meta: {} };
    renderShellStatus();
    renderFilters();
    const content = document.getElementById('content');
    render(content, html`<div class="notice notice--error"><strong>This browser would not open the app's storage.</strong>
      <p>${err.message}</p><p>Open the app through the local server (see README), not by double-clicking the file, and avoid private browsing windows.</p></div>`);
    return;
  }
  window.addEventListener('hashchange', () => {
    route().then(() => document.getElementById('content')?.focus({ preventScroll: true }));
  });
  await route();
}

start();

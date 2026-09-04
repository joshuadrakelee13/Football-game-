// A small hyperscript helper. Everything is built from real elements rather than
// innerHTML, so club names and player names can never be interpreted as markup.

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'html') el.innerHTML = value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }

  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Relative luminance, for deciding whether a kit colour will actually be visible.
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// Several real clubs play in black or near-black, which disappears entirely against
// this interface's ground. Where that happens, lead with the second kit colour so
// the club is still identifiable.
export function visibleColours(colors = {}) {
  const primary = colors.primary || '#8A94A6';
  const secondary = colors.secondary || '#4A554F';
  if (luminance(primary) < 0.045 && luminance(secondary) > luminance(primary)) {
    return { primary: secondary, secondary: primary };
  }
  return { primary, secondary };
}

// Club identity chip: a colour bar drawn from the real kit, plus the name.
export function clubChip(club, { short = true, you = false } = {}) {
  if (!club) return h('span', { class: 'club-chip' }, h('span', { class: 'name' }, '—'));
  const kit = visibleColours(club.colors);
  return h('span', { class: 'club-chip' + (you || club.isPlayerClub ? ' you' : '') },
    h('i', {
      class: 'club-bar',
      'data-pattern': club.pattern || 'solid',
      style: { '--club-primary': kit.primary, '--club-secondary': kit.secondary },
    }),
    h('span', { class: 'name' }, short ? (club.short || club.name) : club.name),
  );
}

// Rating pill, banded so quality is readable at a glance without reading digits.
export function ratingPill(value, { context = 60 } = {}) {
  const v = Math.round(value);
  const delta = v - context;
  const band = delta >= 6 ? 'elite' : delta >= 1 ? 'good' : delta >= -6 ? 'ok' : 'poor';
  return h('span', { class: `rating ${band}` }, v);
}

export function formGuide(form, size = 5) {
  const recent = (form || []).slice(-size);
  const pad = Array(Math.max(0, size - recent.length)).fill(null);
  return h('span', { class: 'form-guide' },
    ...pad.map(() => h('i', { class: 'empty' }, '')),
    ...recent.map((r) => h('i', { class: r }, r)),
  );
}

export function meter(ratio, tone = '') {
  return h('div', { class: 'meter ' + tone },
    h('i', { style: { width: Math.max(0, Math.min(1, ratio)) * 100 + '%' } }));
}

export function statTile(label, value, { note = null, tone = '' } = {}) {
  return h('div', { class: 'stat-tile' },
    h('div', { class: 'k' }, label),
    h('div', { class: 'v ' + tone }, value),
    note && h('div', { class: 'note' }, note),
  );
}

export function panel(title, body, actions = null) {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h3', null, title), actions),
    body,
  );
}

export function emptyState(text) {
  return h('div', { class: 'empty-state' }, text);
}

// Count a number up rather than snapping to it. Used for money in the HUD.
export function animateNumber(el, from, to, format, duration = 520) {
  if (from === to || !Number.isFinite(from)) { el.textContent = format(to); return; }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

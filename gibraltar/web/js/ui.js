// HUD, pause menu, settings and persistence.

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('gibraltar.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('gibraltar.' + key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

export const DEFAULT_SETTINGS = {
  renderDistance: 1200,
  shadows: true,
  resScale: 1.0,
  fov: 70,
  sensitivity: 1.0,
  invertY: false,
  timeSpeed: 20,
  volume: 0.6,
};

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(store.get('settings', {}) || {}) };
  return s;
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ HUD
export class Hud {
  constructor() {
    this.root = $('hud');
    this.info = $('info');
    this.poiNear = $('poi-near');
    this.prompt = $('prompt');
    this.loading = $('loading');
    this.loadingText = $('loading-text');
    this.legend = $('legend');
    this.toastEl = $('toast');
    this.panel = $('panel');
    this.strip = $('compass-strip');
    this.toastTimer = 0;
    this.showInfo = true;
    this._buildCompass();
  }

  _buildCompass() {
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let d = -180; d <= 540; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const label = names[n] ?? (n % 45 === 0 ? '' : '·');
      html += `<span class="${names[n] ? 'c' : ''}" style="left:${(d + 180) * 2}px">${label || n}</span>`;
    }
    this.strip.innerHTML = html;
  }

  setCompass(heading) {
    // 2 px per degree; strip starts at -180°
    const w = this.strip.parentElement.clientWidth;
    this.strip.style.transform = `translateX(${w / 2 - (heading + 180) * 2}px)`;
  }

  setVisible(v) { this.root.classList.toggle('hidden', !v); }

  setInfo(text) {
    this.info.classList.toggle('hidden', !this.showInfo);
    if (this.showInfo) this.info.textContent = text;
  }

  setLoading(n) {
    this.loading.classList.toggle('hidden', n === 0);
    if (n) this.loadingText.textContent = `Loading ${n} tile layer${n === 1 ? '' : 's'}…`;
  }

  toast(msg, ms = 1800) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  showPanel(html) { this.panel.innerHTML = html; this.panel.classList.remove('hidden'); }
  hidePanel() { this.panel.classList.add('hidden'); }
  get panelOpen() { return !this.panel.classList.contains('hidden'); }
}

export function poiPanel(p, dist) {
  return `<h3>${esc(p.name)}</h3><div class="sub">${esc(p.id)}</div><table>
    <tr><td>Kind</td><td>${esc(p.kind)}</td></tr>
    ${p.description ? `<tr><td>Description</td><td>${esc(p.description)}</td></tr>` : ''}
    <tr><td>Source</td><td>${esc(p.source)}</td></tr>
    <tr><td>Position (GIB-LTM)</td><td>${p.position_m[0].toFixed(1)}, ${p.position_m[1].toFixed(1)} m, z ${p.position_m[2].toFixed(1)} m</td></tr>
    ${dist != null ? `<tr><td>Distance</td><td>${dist.toFixed(1)} m</td></tr>` : ''}
    ${p.in_gibraltar === false ? '<tr><td>Note</td><td>outside Gibraltar (Spain)</td></tr>' : ''}
  </table><div class="close">Press E to close</div>`;
}

export function buildingPanel(b, tile, dist) {
  const conf = b.confidence || 'unknown';
  return `<h3>${esc(b.name || 'Building')}</h3><div class="sub">${esc(b.id)}${b.osm_version ? ' v' + b.osm_version : ''} · tile ${esc(tile)}</div><table>
    <tr><td>Building type</td><td>${esc(b.building ?? '—')}${b.part ? ' (part)' : ''}</td></tr>
    <tr><td>Height</td><td>${b.height_m != null ? b.height_m.toFixed(1) + ' m' : '—'}${b.min_height_m ? ` (from ${b.min_height_m} m)` : ''}</td></tr>
    <tr><td>Height source</td><td>${esc(b.height_source ?? '—')}</td></tr>
    <tr><td>Confidence</td><td class="conf-${esc(conf)}">${esc(conf)}</td></tr>
    <tr><td>Levels</td><td>${b.levels ?? '—'}</td></tr>
    <tr><td>Roof</td><td>${esc(b.roof?.shape ?? b.roof_shape ?? '—')}${b.roof && b.roof.ridge_m != null && b.roof.ridge_m !== b.roof.eave_m
      ? ` (eave ${(+b.roof.eave_m).toFixed(1)} m, ridge ${(+b.roof.ridge_m).toFixed(1)} m)` : ''}</td></tr>
    ${b.roof?.source ? `<tr><td>Roof source</td><td>${esc(b.roof.source)}</td></tr>` : ''}
    ${b.wall_colour_source || b.roof_colour_source ? `<tr><td>Colour source</td><td>walls: ${esc(b.wall_colour_source ?? '—')}, roof: ${esc(b.roof_colour_source ?? '—')}</td></tr>` : ''}
    ${b.facade ? `<tr><td>Façade</td><td>${facadeText(b.facade)}</td></tr>` : ''}
    <tr><td>Footprint area</td><td>${b.footprint_area_m2 != null ? b.footprint_area_m2.toFixed(1) + ' m²' : '—'}</td></tr>
    <tr><td>Ground (min / max)</td><td>${b.ground_min_m?.toFixed?.(1) ?? '—'} / ${b.ground_max_m?.toFixed?.(1) ?? '—'} m</td></tr>
    ${b.override ? `<tr><td>Override</td><td>${esc(JSON.stringify(b.override))}</td></tr>` : ''}
    ${dist != null ? `<tr><td>Distance</td><td>${dist.toFixed(1)} m</td></tr>` : ''}
  </table><div class="close">Press E to close</div>`;
}

function facadeText(f) {
  const ws = String(f.windows_source ?? 'unknown');
  const wsNote = /procedural|default|generated/i.test(ws) ? `${ws} — positions not surveyed` : ws;
  return `Doors: ${f.doors_mapped ?? 0} mapped (OSM), ${f.doors_procedural ?? 0} procedural · ` +
    `Windows: ${f.windows ?? 0} (${esc(wsNote)})`;
}

export function propPanel(p, tile, dist) {
  const title = p.name || (p.kind === 'tree' ? (p.species ? `Tree (${p.species})` : 'Tree') : p.kind.replace(/_/g, ' '));
  return `<h3>${esc(title)}</h3><div class="sub">${esc(p.id)}${p.osm_version ? ' v' + p.osm_version : ''} · tile ${esc(tile)}</div><table>
    <tr><td>Kind</td><td>${esc(p.kind)}</td></tr>
    ${p.name ? `<tr><td>Name</td><td>${esc(p.name)}</td></tr>` : ''}
    ${p.kind === 'tree' ? `<tr><td>Species</td><td>${esc(p.species ?? 'not recorded')}</td></tr>` : ''}
    ${p.height_m != null ? `<tr><td>Height</td><td>${p.height_m} m <span class="muted">(${esc(p.height_source ?? '')})</span></td></tr>` : ''}
    ${p.crown_m != null ? `<tr><td>Crown</td><td>${p.crown_m} m <span class="muted">(${esc(p.crown_source ?? '')})</span></td></tr>` : ''}
    <tr><td>Position (GIB-LTM)</td><td>${p.position_m.map((v) => (+v).toFixed(1)).join(', ')} m</td></tr>
    <tr><td>Source</td><td>${esc(p.source ?? '—')}</td></tr>
    <tr><td>Model</td><td>${esc(p.model ?? 'generic')} — a stand-in shape; the <b>position is mapped</b> from OSM, the look is not</td></tr>
  </table><div class="close">Press E to close</div>`;
}

export function wallPanel(w, tile, dist) {
  const conf = w.confidence || 'unknown';
  return `<h3>${esc(w.name || w.kind || 'Wall')}</h3><div class="sub">${esc(w.id)} · tile ${esc(tile)}</div><table>
    <tr><td>Kind</td><td>${esc(w.kind)}</td></tr>
    ${w.height_m != null ? `<tr><td>Height</td><td>${w.height_m} m</td></tr>` : ''}
    ${w.deck_height_m != null ? `<tr><td>Deck height</td><td>${w.deck_height_m} m</td></tr>` : ''}
    ${w.thickness_m != null ? `<tr><td>Thickness</td><td>${w.thickness_m} m</td></tr>` : ''}
    ${w.length_m != null ? `<tr><td>Length</td><td>${w.length_m} m</td></tr>` : ''}
    <tr><td>Height source</td><td>${esc(w.height_source ?? '—')}</td></tr>
    <tr><td>Confidence</td><td class="conf-${esc(conf)}">${esc(conf)}</td></tr>
    ${dist != null ? `<tr><td>Distance</td><td>${dist.toFixed(1)} m</td></tr>` : ''}
  </table><div class="close">Press E to close</div>`;
}

// ------------------------------------------------------------------ Menu
export class Menu {
  /**
   * @param {object} h handlers: { onResume, onSave, onLoad, onSpawn, onTeleport(poi), onSettings(settings) }
   */
  constructor(settings, pois, attribution, h) {
    this.el = $('menu');
    this.settings = settings;
    this.h = h;
    this.pois = [...pois].sort((a, b) => a.name.localeCompare(b.name));
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.page) this.page(b.dataset.page);
      const act = b.dataset.act;
      if (act === 'resume') h.onResume();
      if (act === 'save') h.onSave();
      if (act === 'load') h.onLoad();
      if (act === 'spawn') h.onSpawn();
      if (b.dataset.poi != null) h.onTeleport(this.pois[+b.dataset.poi]);
    });
    this._bindSettings();
    const search = $('tp-search');
    search.addEventListener('input', () => this._renderTp(search.value));
    search.addEventListener('keydown', (e) => e.stopPropagation());
    this._renderTp('');
    $('credits').innerHTML = `<p>Gibraltar 1:1 walking simulator — web validation viewer.</p><ul>
      ${[...new Set([...attribution, 'Contains modified Copernicus Sentinel data 2026'])].map((a) => `<li>${esc(a)}</li>`).join('')}
      <li>three.js r169 — © 2010–2024 three.js authors (MIT licence, <code>web/vendor/three/LICENSE</code>)</li>
      <li>Sun position: NOAA Solar Calculator algorithm. Sounds are synthesised live in your browser.</li></ul>
      <p class="muted">Terrain heights are IGN MDT05 (5 m grid); terrain colours from Copernicus Sentinel-2 imagery.
      Trees and street furniture are generic stand-in models at their real OpenStreetMap positions. Building heights come from OpenStreetMap tags where present;
      most are estimated defaults — press V to see which.</p>`;
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show() { this.el.classList.remove('hidden'); this.page('main'); }
  hide() { this.el.classList.add('hidden'); }

  page(name) {
    this.el.querySelector('.menu-main').classList.toggle('hidden', name !== 'main');
    for (const p of this.el.querySelectorAll('.page')) p.classList.toggle('hidden', p.id !== 'page-' + name);
    const title = { main: 'Paused', settings: 'Settings', teleport: 'Teleport', controls: 'Controls', credits: 'Credits' }[name];
    this.el.querySelector('h2').textContent = title || 'Paused';
    if (name === 'teleport') setTimeout(() => $('tp-search').focus(), 0);
  }

  _renderTp(q) {
    q = q.trim().toLowerCase();
    const list = this.pois.map((p, i) => [p, i]).filter(([p]) => !q || p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q));
    $('tp-list').innerHTML = list.slice(0, 200).map(([p, i]) =>
      `<button data-poi="${i}">${esc(p.name)}<span class="k">${esc(p.kind)}${p.in_gibraltar === false ? ' · Spain' : ''}</span></button>`).join('') ||
      '<div class="muted">No matches</div>';
  }

  _bindSettings() {
    const s = this.settings;
    const bind = (id, key, parse, fmt) => {
      const el = $(id), out = $(id + '-v');
      const isCheck = el.type === 'checkbox';
      const show = () => { if (out) out.textContent = fmt ? fmt(s[key]) : s[key]; };
      if (isCheck) el.checked = !!s[key]; else el.value = String(s[key]);
      show();
      el.addEventListener(isCheck ? 'change' : 'input', () => {
        s[key] = isCheck ? el.checked : parse(el.value);
        show();
        store.set('settings', s);
        this.h.onSettings(s, key);
      });
    };
    bind('set-render', 'renderDistance', Number);
    bind('set-shadows', 'shadows');
    bind('set-res', 'resScale', Number, (v) => v.toFixed(2) + '×');
    bind('set-fov', 'fov', Number, (v) => v + '°');
    bind('set-sens', 'sensitivity', Number, (v) => v.toFixed(1));
    bind('set-invert', 'invertY');
    bind('set-time', 'timeSpeed', Number);
    bind('set-vol', 'volume', Number, (v) => Math.round(v * 100) + '%');
  }

  syncSetting(id, value) {
    const el = $(id);
    if (el) el.value = String(value);
  }
}

// A tiny safe templating helper. Every interpolated value is escaped unless it is itself the
// result of html`...` (or wrapped with raw()). Customer names come from export files, so
// nothing from the data is ever written into the page unescaped.

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export function raw(s) { return new Safe(String(s)); }

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Safe(out);
}

export function render(el, content) {
  el.innerHTML = part(content);
}

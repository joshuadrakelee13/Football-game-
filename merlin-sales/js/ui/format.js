// UK formatting: £, dd/mm/yyyy, sentence case. Dates are held internally as 'yyyy-mm-dd'.

const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

// Round to pence the way a ledger does, avoiding binary float drift in totals.
export function pence(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export function money(n, { exact = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const v = exact ? pence(n) : Math.round(n);
  const s = (exact ? gbp2 : gbp0).format(Math.abs(v));
  return v < 0 ? `−${s}` : s;
}

export function number(n, { decimals = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const s = (decimals ? dec : int).format(Math.abs(n));
  return n < 0 ? `−${s}` : s;
}

export function percent(n, { signed = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const v = Math.round(n * 100);
  if (signed && v > 0) return `+${v}%`;
  if (v < 0) return `−${Math.abs(v)}%`;
  return `${v}%`;
}

export function ukDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function dateTime(ts) {
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function plural(n, one, many = `${one}s`) {
  return `${number(n)} ${n === 1 ? one : many}`;
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

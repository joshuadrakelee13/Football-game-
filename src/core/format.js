// Display formatting. Money never reaches scientific notation: the ceiling of a
// very long save is a few billion, which reads fine as "£4.2B".

export function money(n) {
  const neg = n < 0;
  const v = Math.abs(n);
  let out;
  if (v >= 1e9) out = trimZero(v / 1e9) + 'B';
  else if (v >= 1e6) out = trimZero(v / 1e6) + 'M';
  else if (v >= 1e3) out = trimZero(v / 1e3) + 'K';
  else out = String(Math.round(v));
  return (neg ? '-£' : '£') + out;
}

// Exact pounds with thousand separators, for ledgers where precision matters.
export function moneyFull(n) {
  const neg = n < 0;
  const v = Math.round(Math.abs(n));
  return (neg ? '-£' : '£') + v.toLocaleString('en-GB');
}

function trimZero(v) {
  const dp = v < 10 ? 1 : 0;
  const s = v.toFixed(dp);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function num(n) {
  return Math.round(n).toLocaleString('en-GB');
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function signed(n) {
  return (n > 0 ? '+' : '') + n;
}

export function pct(n) {
  return Math.round(n) + '%';
}

// "1,000" -> "1.0k" for compact fan counts.
export function compact(n) {
  if (n >= 1e6) return trimZero(n / 1e6) + 'm';
  if (n >= 1e4) return trimZero(n / 1e3) + 'k';
  return num(n);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The calendar works in abstract day offsets from 1 August; this renders them.
export function matchDate(dayOffset, startYear) {
  const d = new Date(Date.UTC(startYear, 7, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function matchDateLong(dayOffset, startYear) {
  const d = new Date(Date.UTC(startYear, 7, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function seasonLabel(startYear) {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

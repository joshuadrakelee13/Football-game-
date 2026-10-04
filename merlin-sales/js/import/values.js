// Turning cell values from an export into clean numbers, codes and postcodes.
// Each parser reports what it had to change, so the import check can count it.

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).replace(/ /g, ' ').trim();
}

export function isBlank(v) {
  return cellText(v) === '';
}

export function isBlankRow(row) {
  return !row || row.every(isBlank);
}

// Parse money or a quantity. Handles £ signs, thousands separators, (brackets) and trailing
// minus signs for negatives, and "CR" suffixes. Returns { value, changes } or { error } or null
// for an empty cell. `changes` lists what was stripped or converted.
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, changes: [] } : { error: true };
  let s = cellText(v);
  if (s === '') return null;
  const changes = [];
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); changes.push('brackets'); }
  if (/(-|−)$/.test(s) && !/^(-|−)/.test(s)) { neg = true; s = s.slice(0, -1).trim(); changes.push('trailing_minus'); }
  if (/\s*cr$/i.test(s)) { neg = true; s = s.replace(/\s*cr$/i, ''); changes.push('cr_suffix'); }
  if (/^(-|−)/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
  if (/[£$€]|GBP/i.test(s)) { s = s.replace(/[£$€]|GBP/gi, '').trim(); changes.push('currency'); }
  if (/^(-|−)/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
  if (/\d,\d{3}/.test(s)) { s = s.replace(/,(?=\d{3}(\D|$))/g, ''); changes.push('thousands'); }
  s = s.replace(/\s+/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { error: true };
  const value = Number(s) * (neg ? -1 : 1);
  return { value: value === 0 ? 0 : value, changes };
}

// Codes (account, invoice, product) are always text. Spaces are trimmed; a number from Excel
// becomes its plain digits. Returns { value, trimmed }.
export function parseCode(v) {
  if (v === null || v === undefined) return { value: '', trimmed: false };
  if (typeof v === 'number') {
    return { value: Number.isInteger(v) ? String(v) : String(v), trimmed: false };
  }
  const raw = String(v).replace(/ /g, ' ');
  const value = raw.trim().replace(/\s{2,}/g, ' ');
  return { value, trimmed: value !== raw };
}

// UK postcode: upper case, single space before the last three characters.
const POSTCODE_RE = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})$/;
export function normalisePostcode(v) {
  const s = cellText(v).toUpperCase().replace(/\s+/g, '');
  if (!s) return { value: '', valid: false };
  const m = s.match(POSTCODE_RE);
  if (!m) return { value: cellText(v).toUpperCase().replace(/\s+/g, ' '), valid: false };
  return { value: `${m[1]} ${m[2]}`, valid: true };
}

// Pence-exact sums: totals are added up in whole pence so they never drift.
export function sumPence(values) {
  let p = 0;
  for (const v of values) p += Math.round((v || 0) * 100);
  return p / 100;
}

// Quantities can be fractional (metres, kilos); sum to 4 decimal places.
export function sumQty(values) {
  let q = 0;
  for (const v of values) q += Math.round((v || 0) * 10000);
  return q / 10000;
}

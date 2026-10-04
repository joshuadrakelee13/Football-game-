// Reading dates. The format is decided once per column from all of its values, so 03/04
// can never be 3 April on one row and 4 March on another.
//
// Supported: dd/mm/yyyy, dd/mm/yy (also with - or .), dd-MMM-yy and dd MMM yyyy,
// yyyy-mm-dd, and Excel serial numbers. Dates are returned as 'yyyy-mm-dd' text.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const NUMERIC_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/;
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/;
const MON_RE = /^(\d{1,2})[\s/-]([A-Za-z]{3,9})\.?[\s/,-]*(\d{2}|\d{4})$/;

export const DATE_FORMATS = {
  dmy: 'dd/mm/yyyy',
  mdy: 'mm/dd/yyyy (US style)',
  iso: 'Excel date cells or yyyy-mm-dd',
  mon: 'dd-MMM-yy',
  serial: 'Excel date numbers',
};

function fullYear(y) {
  const n = Number(y);
  if (y.length === 4) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Excel serial date (1900 date system) to yyyy-mm-dd. 20000 to 80000 covers 1954 to 2119.
export function serialToIso(n) {
  if (typeof n !== 'number' || n < 20000 || n > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const PARSERS = {
  dmy: (s) => { const m = s.match(NUMERIC_RE); return m ? iso(fullYear(m[3]), Number(m[2]), Number(m[1])) : null; },
  mdy: (s) => { const m = s.match(NUMERIC_RE); return m ? iso(fullYear(m[3]), Number(m[1]), Number(m[2])) : null; },
  iso: (s) => { const m = s.match(ISO_RE); return m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : null; },
  mon: (s) => {
    const m = s.match(MON_RE);
    if (!m) return null;
    const mo = MONTHS[m[2].toLowerCase().slice(0, 3)];
    return mo ? iso(fullYear(m[3]), mo, Number(m[1])) : null;
  },
};

function text(v) {
  return String(v ?? '').replace(/ /g, ' ').trim();
}

// Look at every value in a column and decide how to read it.
// Returns { format, ambiguous, parse(value) -> 'yyyy-mm-dd' | null }.
export function decideDateFormat(values) {
  const texts = [];
  let numbers = 0;
  for (const v of values) {
    if (typeof v === 'number') { numbers++; continue; }
    const s = text(v);
    if (s === '') continue;
    if (/^\d{5}(\.\d+)?$/.test(s)) { numbers++; continue; }
    texts.push(s);
  }

  let format = null;
  let ambiguous = false;
  if (texts.length) {
    const ok = {};
    for (const f of Object.keys(PARSERS)) ok[f] = texts.reduce((n, s) => n + (PARSERS[f](s) ? 1 : 0), 0);
    const n = texts.length;
    if (ok.iso === n) format = 'iso';
    else if (ok.mon === n) format = 'mon';
    else if (ok.dmy === n && ok.mdy === n) { format = 'dmy'; ambiguous = true; }
    else if (ok.dmy === n) format = 'dmy';
    else if (ok.mdy === n) format = 'mdy';
    else {
      // Some values will not read whichever format is chosen. Take the format that reads the
      // most, preferring the UK order on a tie; the rest are reported as unreadable dates.
      format = ['dmy', 'mdy', 'iso', 'mon'].reduce((best, f) => (ok[f] > ok[best] ? f : best), 'dmy');
      ambiguous = format === 'dmy' && ok.mdy === ok.dmy;
    }
  } else if (numbers) {
    format = 'serial';
  }

  const parseText = format && format !== 'serial' ? PARSERS[format] : null;
  return {
    format,
    ambiguous,
    hasSerials: numbers > 0,
    parse(v) {
      if (typeof v === 'number') return serialToIso(v);
      const s = text(v);
      if (s === '') return null;
      if (/^\d{5}(\.\d+)?$/.test(s)) return serialToIso(Number(s));
      return parseText ? parseText(s) : null;
    },
  };
}

// Does a value look like a date at all, in any supported format? Used when matching columns.
export function looksLikeDate(v) {
  if (typeof v === 'number') return false;
  const s = text(v);
  if (!s) return false;
  return Object.values(PARSERS).some((p) => p(s));
}

// Cleaning one file: separating real data rows from titles, totals, blank and repeated header
// rows, then reading every value into our fields. Nothing is dropped or changed without being
// counted, so the import check can account for every row (brief section 6.2).

import { FIELDS, FILE_TYPES, normaliseHeading, DEFAULT_CASH_CODES, CASH_NAME_RE } from './fields.js';
import { cellText, isBlank, isBlankRow, parseNumber, parseCode, normalisePostcode } from './values.js';
import { decideDateFormat } from './dates.js';

// Why a row was skipped, in words Simon will read.
export const SKIP_REASONS = {
  above_header: 'Report title or blank row above the column headings',
  blank: 'Blank row',
  repeated_header: 'Repeated column headings (page break)',
  title: 'Report title or page heading inside the data',
  total: 'Total or subtotal row',
  missing: 'A required value is empty',
  bad_date: 'Date could not be read',
  bad_number: 'A number could not be read',
  no_header_invoice: 'Invoice not found in the invoice headers file',
  duplicate_removed: 'Duplicate line removed (you chose to remove duplicates)',
  old_invoice: 'Already held: invoice dated on or before the latest date stored',
  held_invoice: 'Already held: invoice number already stored',
};

// What was changed in rows that were kept.
export const CHANGE_LABELS = {
  currency: 'Currency signs removed',
  thousands: 'Thousands separators removed',
  brackets: 'Negatives in (brackets) read as minus',
  trailing_minus: 'Trailing minus signs read as negatives',
  cr_suffix: 'Values marked CR read as negatives',
  trimmed: 'Spaces trimmed from codes',
  postcode_tidied: 'Postcodes tidied (capitals and spacing)',
};

const TOTAL_RE = /^\s*(grand\s+|sub[\s-]?|page\s+|report\s+|account\s+|customer\s+|period\s+|month(ly)?\s+|group\s+|overall\s+)?totals?\b/i;
const TOTAL_FOR_RE = /\btotals?\s*(for|of|:|=)/i;

function isTotalText(v) {
  const s = cellText(v);
  return s !== '' && (TOTAL_RE.test(s) || TOTAL_FOR_RE.test(s));
}

function isRepeatedHeader(row, headerKeys) {
  let filled = 0, same = 0;
  for (let c = 0; c < headerKeys.length; c++) {
    if (!headerKeys[c]) continue;
    filled++;
    if (normaliseHeading(row[c]) === headerKeys[c]) same++;
  }
  return filled > 0 && same >= Math.max(2, Math.ceil(filled * 0.6));
}

export function isCashAccount(code, name, cashCodes = DEFAULT_CASH_CODES) {
  const c = String(code || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (cashCodes.some((x) => x.toUpperCase() === c)) return true;
  return CASH_NAME_RE.test(String(name || '').trim());
}

// Clean one file.
//   file:    { name, grid, headerRow }
//   typeId:  one of FILE_TYPES
//   mapping: { field: columnIndex }
//   options: { vatChoice: 'divide' | 'net', removeDuplicates, cashCodes }
// Returns { records, skipped, counts, changes, dates, vat, rowsRead, rowsUsed, ... }
export function cleanFile(file, typeId, mapping, options = {}) {
  const type = FILE_TYPES[typeId];
  const grid = file.grid;
  const headerRow = file.headerRow;
  const headerKeys = (grid[headerRow] || []).map(normaliseHeading);
  const col = (row, field) => (mapping[field] === undefined ? '' : row[mapping[field]]);
  const identifiers = type.identifiers.filter((f) => mapping[f] !== undefined);
  const required = type.required.filter((f) => mapping[f] !== undefined);

  const skipped = [];
  const counts = {};
  const changes = {};
  const skip = (rowIndex, reason, detail = '') => {
    counts[reason] = (counts[reason] || 0) + 1;
    skipped.push({ row: rowIndex + 1, reason, detail, text: (grid[rowIndex] || []).map(cellText).filter(Boolean).join(' | ').slice(0, 300) });
  };
  const changed = (what, n = 1) => { changes[what] = (changes[what] || 0) + n; };

  for (let r = 0; r < headerRow; r++) skip(r, 'above_header');

  // Pass 1: decide which rows are data.
  const candidates = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (isBlankRow(row)) { skip(r, 'blank'); continue; }
    if (isRepeatedHeader(row, headerKeys)) { skip(r, 'repeated_header'); continue; }
    // A single filled cell where a record needs several is a page heading, not data.
    const filledCells = row.filter((v) => !isBlank(v)).length;
    if (filledCells === 1 && required.length > 1 && !row.some(isTotalText)) { skip(r, 'title'); continue; }
    const ids = identifiers.map((f) => cellText(col(row, f)));
    const idsEmpty = ids.every((s) => s === '');
    const idIsTotal = identifiers.some((f) => isTotalText(col(row, f)));
    const anyTotal = row.some(isTotalText);
    if (idIsTotal || (anyTotal && idsEmpty)) { skip(r, 'total'); continue; }
    if (idsEmpty) {
      const hasNumber = row.some((v) => typeof v === 'number' || (cellText(v) !== '' && parseNumber(v) && !parseNumber(v).error));
      skip(r, hasNumber ? 'total' : 'title');
      continue;
    }
    candidates.push(r);
  }

  // Pass 2: decide each date column's format from all of its values.
  const dates = {};
  for (const field of type.fields) {
    if (FIELDS[field].kind !== 'date' || mapping[field] === undefined) continue;
    dates[field] = decideDateFormat(candidates.map((r) => col(grid[r], field)));
  }

  // VAT: use net when there is a net column. Otherwise work from the VAT-inclusive value:
  // minus a VAT column if there is one, or as Simon chooses (divide by 1.2, or already net).
  let vat = null;
  if (type.fields.includes('net_value')) {
    if (mapping.net_value !== undefined) vat = { method: 'net' };
    else if (mapping.gross_value !== undefined && mapping.vat_value !== undefined) vat = { method: 'gross_minus_vat' };
    else if (mapping.gross_value !== undefined) vat = { method: options.vatChoice ? `gross_${options.vatChoice}` : 'ask' };
  }

  // Pass 3: read values.
  const records = [];
  for (const r of candidates) {
    const row = grid[r];
    const rec = { _row: r + 1 };
    let problem = null;

    for (const field of type.fields) {
      if (mapping[field] === undefined) continue;
      const kind = FIELDS[field].kind;
      const v = col(row, field);
      if (kind === 'code') {
        const p = parseCode(v);
        if (p.trimmed) changed('trimmed');
        rec[field] = p.value;
      } else if (kind === 'money' || kind === 'number') {
        const p = parseNumber(v);
        if (p === null) rec[field] = null;
        else if (p.error) {
          if (required.includes(field) || field === 'net_value' || field === 'gross_value') { problem = ['bad_number', `${FIELDS[field].label}: "${cellText(v)}"`]; break; }
          rec[field] = null;
        } else {
          for (const c of p.changes) changed(c);
          rec[field] = p.value;
        }
      } else if (kind === 'date') {
        if (isBlank(v)) { rec[field] = null; continue; }
        const d = dates[field].parse(v);
        if (!d) {
          if (required.includes(field)) { problem = ['bad_date', `${FIELDS[field].label}: "${cellText(v)}"`]; break; }
          rec[field] = null;
        } else rec[field] = d;
      } else if (kind === 'postcode') {
        const p = normalisePostcode(v);
        if (p.value && p.value !== cellText(v)) changed('postcode_tidied');
        rec[field] = p.value;
      } else {
        rec[field] = cellText(v);
      }
    }
    if (!problem) {
      const empty = required.find((f) => rec[f] === '' || rec[f] === null || rec[f] === undefined);
      if (empty) problem = ['missing', FIELDS[empty].label];
    }
    if (!problem && vat && vat.method !== 'net') {
      const g = rec.gross_value;
      if (g === null || g === undefined) problem = ['missing', FIELDS.gross_value.label];
      else if (vat.method === 'gross_minus_vat') rec.net_value = Math.round((g - (rec.vat_value || 0)) * 100) / 100;
      else if (vat.method === 'gross_divide') rec.net_value = Math.round((g / 1.2) * 100) / 100;
      else if (vat.method === 'gross_net') rec.net_value = g;
      else rec.net_value = null; // waiting for Simon's answer
    }
    if (!problem && type.fields.includes('net_value') && vat?.method === 'net' && (rec.net_value === null || rec.net_value === undefined)) {
      problem = ['missing', FIELDS.net_value.label];
    }
    if (problem) { skip(r, problem[0], problem[1]); continue; }
    records.push(rec);
  }

  // Customers: prefer the delivery postcode, then a plain postcode, then the invoice postcode.
  if (typeId === 'customers') {
    for (const c of records) {
      const pc = c.delivery_postcode || c.postcode || c.invoice_postcode || '';
      c.postcode_source = c.delivery_postcode ? 'delivery' : c.postcode ? 'postcode' : c.invoice_postcode ? 'invoice' : '';
      c.postcode = pc;
      c.is_cash = isCashAccount(c.account_code, c.name, options.cashCodes);
    }
  }

  // Duplicate lines: same invoice, line, product, quantity and value. Flagged, never
  // silently deleted; removed only if Simon chooses to.
  const duplicates = [];
  if (typeId === 'sales_lines' || typeId === 'invoice_lines') {
    const seen = new Map();
    for (const rec of records) {
      const key = [rec.invoice_no, rec.line_no ?? '', rec.product_code, rec.quantity, rec.net_value].join('\u0001');
      if (seen.has(key)) {
        rec._duplicate = true;
        duplicates.push({ row: rec._row, firstRow: seen.get(key), invoice_no: rec.invoice_no, product_code: rec.product_code, quantity: rec.quantity, net_value: rec.net_value });
      } else seen.set(key, rec._row);
    }
  }
  let kept = records;
  if (options.removeDuplicates && duplicates.length) {
    kept = [];
    for (const rec of records) {
      if (rec._duplicate) skip(rec._row - 1, 'duplicate_removed', `${rec.invoice_no} ${rec.product_code}`);
      else kept.push(rec);
    }
  }

  skipped.sort((a, b) => a.row - b.row);
  return {
    name: file.name,
    typeId,
    records: kept,
    skipped,
    counts,
    changes,
    duplicates,
    vat,
    dates: Object.fromEntries(Object.entries(dates).map(([f, d]) => [f, { format: d.format, ambiguous: d.ambiguous, hasSerials: d.hasSerials }])),
    rowsRead: Math.max(0, grid.length - 1),
    rowsUsed: kept.length,
  };
}

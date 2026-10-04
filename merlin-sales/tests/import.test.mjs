// Importer tests. Run from merlin-sales/: npm test
//
// Totals are checked against figures worked out independently from the raw fixture files
// with deliberately simple code of their own (not the importer's), as the brief asks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XLSX } from './xlsx-node.mjs';
import { analyseFile, runImport, validate, setFileType, applyProfileEntry } from '../js/import/pipeline.js';
import { parseNumber, parseCode, normalisePostcode } from '../js/import/values.js';
import { decideDateFormat } from '../js/import/dates.js';
import { makeProfile, matchProfile } from '../js/import/profiles.js';
import { planSave } from '../js/import/save-plan.js';
import { skippedRowsCsv } from '../js/import/check.js';

const FIX = new URL('./fixtures/', import.meta.url);
const bytes = (name) => readFileSync(new URL(name, FIX));
const load = (name) => analyseFile(XLSX, bytes(name), name);
const run = (names, options) => {
  const files = names.map(load);
  assert.deepEqual(validate(files).blockers, [], 'no blockers');
  return { files, ...runImport(files, options) };
};

// ---------- An independent reading of the raw fixture files ----------

function splitCsv(text) {
  // Minimal CSV reader: enough for the fixtures (quoted fields, doubled quotes).
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') { rows.push([]); continue; }
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

function plainNumber(s) {
  let t = String(s).trim();
  let neg = false;
  if (t.startsWith('(') && t.endsWith(')')) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  t = t.replace('£', '').replace(/,/g, '');
  return Number(t) * (neg ? -1 : 1);
}

function rawSalesCsv() {
  // Data rows are exactly those starting with an invoice or credit note number.
  const rows = splitCsv(readFileSync(new URL('sales-lines.csv', FIX), 'utf8')).filter((r) => /^(INV|CRN)\d+$/.test(r[0]));
  return {
    lines: rows.length,
    pence: rows.reduce((s, r) => s + Math.round(plainNumber(r[7]) * 100), 0),
    qty: rows.reduce((s, r) => s + plainNumber(r[6]), 0),
    invoices: new Set(rows.map((r) => r[0])).size,
    accounts: new Set(rows.map((r) => r[2])).size,
    totalSealLines: rows.filter((r) => r[3] === 'TSL-310').length,
    creditLines: rows.filter((r) => r[0].startsWith('CRN')).length,
    rows,
  };
}

const raw = rawSalesCsv();
const pounds = (pence) => pence / 100;

// ---------- Values ----------

test('numbers: currency, thousands, brackets, trailing minus', () => {
  assert.equal(parseNumber('£1,234.50').value, 1234.5);
  assert.equal(parseNumber('(45.00)').value, -45);
  assert.equal(parseNumber('12.50-').value, -12.5);
  assert.equal(parseNumber('-£3.20').value, -3.2);
  assert.equal(parseNumber('£-3.20').value, -3.2);
  assert.equal(parseNumber('(£1,000.00)').value, -1000);
  assert.equal(parseNumber('1,234,567.89').value, 1234567.89);
  assert.equal(parseNumber('25.00 CR').value, -25);
  assert.equal(parseNumber(''), null);
  assert.ok(parseNumber('n/a').error);
  assert.deepEqual(parseNumber('(£1,000.00)').changes.sort(), ['brackets', 'currency', 'thousands']);
});

test('codes keep leading zeros and lose stray spaces', () => {
  assert.equal(parseCode('000101').value, '000101');
  assert.deepEqual(parseCode(' 000104 '), { value: '000104', trimmed: true });
  assert.equal(parseCode(101).value, '101');
});

test('postcodes are tidied', () => {
  assert.deepEqual(normalisePostcode('so237rj'), { value: 'SO23 7RJ', valid: true });
  assert.equal(normalisePostcode('not a postcode').valid, false);
});

// ---------- Dates ----------

test('dates: the format is decided per column, never per row', () => {
  const d = decideDateFormat(['03/04/2026', '13/04/2026', '28/02/2025']);
  assert.equal(d.format, 'dmy');
  assert.equal(d.ambiguous, false);
  assert.equal(d.parse('03/04/2026'), '2026-04-03'); // 3 April, because 13/04 proves day first
  const us = decideDateFormat(['04/03/2026', '04/13/2026']);
  assert.equal(us.format, 'mdy');
  assert.equal(us.parse('04/03/2026'), '2026-04-03');
});

test('dates: all-ambiguous columns are read the UK way and flagged', () => {
  const d = decideDateFormat(['03/04/2026', '05/06/2026']);
  assert.equal(d.format, 'dmy');
  assert.equal(d.ambiguous, true);
  assert.equal(d.parse('05/06/2026'), '2026-06-05');
});

test('dates: dd/mm/yy, dd-MMM-yy and Excel serial numbers', () => {
  assert.equal(decideDateFormat(['01/02/26', '28/12/25']).parse('01/02/26'), '2026-02-01');
  assert.equal(decideDateFormat(['03-Apr-25', '17-Sep-26']).parse('03-Apr-25'), '2025-04-03');
  assert.equal(decideDateFormat([46022]).parse(46022), '2025-12-31');
  assert.equal(decideDateFormat(['31/02/2026', '01/03/2026']).parse('31/02/2026'), null);
});

// ---------- Identifying files ----------

test('each fixture is identified as the right kind of file', () => {
  const expect = {
    'customers.csv': 'customers',
    'sales-lines.csv': 'sales_lines',
    'sales-lines.xlsx': 'sales_lines',
    'invoice-headers.csv': 'invoice_headers',
    'invoice-lines.csv': 'invoice_lines',
    'stock.csv': 'stock',
    'dates-ambiguous.csv': 'sales_lines',
    'sales-gross.csv': 'sales_lines',
    'sales-net-vat.csv': 'sales_lines',
  };
  for (const [name, type] of Object.entries(expect)) assert.equal(load(name).typeId, type, name);
});

test('the heading row is found below report titles', () => {
  assert.equal(load('customers.csv').headerRow, 3);
  assert.equal(load('sales-lines.csv').headerRow, 3);
});

test('changing the file type re-matches columns, and missing required fields block the import', () => {
  const f = load('stock.csv');
  setFileType(f, 'customers');
  const v = validate([f]);
  assert.ok(v.blockers.length > 0);
  assert.ok(v.missing.get(f.id).includes('name'));
});

// ---------- Combined CSV ----------

test('combined CSV: totals equal an independent reading of the raw file', () => {
  const { check } = run(['customers.csv', 'sales-lines.csv']);
  assert.equal(check.sales.lines, raw.lines);
  assert.equal(check.sales.net, pounds(raw.pence));
  assert.equal(check.sales.quantity, raw.qty);
  assert.equal(check.sales.invoices, raw.invoices);
  assert.equal(check.sales.customers, raw.accounts);
});

test('combined CSV: titles, totals, repeated headers and blanks are skipped and counted', () => {
  const { check } = run(['sales-lines.csv']);
  const f = check.files[0];
  const n = (k) => f.reasons.find((r) => r.key === k)?.n || 0;
  assert.equal(n('above_header'), 3);
  assert.equal(n('repeated_header'), 5);
  assert.equal(n('title'), 5);
  assert.equal(n('total'), 25); // 24 monthly subtotals and the grand total
  assert.equal(n('blank'), 6);
  assert.equal(f.rowsUsed + f.rowsSkipped, f.rowsRead);
  assert.equal(f.rowsUsed, raw.lines);
});

test('a product called "Total Seal" is kept, not treated as a total', () => {
  const { dataset } = run(['sales-lines.csv']);
  assert.equal(dataset.sales.filter((s) => s.product_code === 'TSL-310').length, raw.totalSealLines);
  assert.ok(raw.totalSealLines > 0);
});

test('credit notes are kept and counted separately', () => {
  const { check } = run(['sales-lines.csv']);
  assert.equal(check.sales.credits.lines, raw.creditLines);
  assert.ok(check.sales.credits.net < 0);
  const changes = Object.fromEntries(check.files[0].changes.map((c) => [c.key, c.n]));
  assert.ok(changes.brackets > 0 && changes.trailing_minus > 0 && changes.currency > 0 && changes.thousands > 0);
});

test('duplicate lines are flagged, not deleted, unless Simon chooses to remove them', () => {
  const kept = run(['sales-lines.csv']);
  assert.ok(kept.check.sales.duplicates.lines >= 1);
  assert.equal(kept.check.sales.lines, raw.lines);
  const removed = run(['sales-lines.csv'], { removeDuplicates: true });
  assert.equal(removed.check.sales.lines, raw.lines - kept.check.sales.duplicates.lines);
  const f = removed.check.files[0];
  assert.equal(f.rowsUsed + f.rowsSkipped, f.rowsRead);
});

test('cash sales count in totals, and the CASH account is marked', () => {
  const { check, dataset } = run(['customers.csv', 'sales-lines.csv']);
  const cashPence = raw.rows.filter((r) => r[2] === 'CASH').reduce((s, r) => s + Math.round(plainNumber(r[7]) * 100), 0);
  assert.equal(check.sales.cash.net, pounds(cashPence));
  assert.equal(dataset.customers.find((c) => c.account_code === 'CASH').is_cash, true);
  assert.ok(!check.customers.missingRep.some((c) => c.account_code === 'CASH'));
});

test('sales for accounts missing from the customer file, and customers with no sales, are listed', () => {
  const { check } = run(['customers.csv', 'sales-lines.csv']);
  assert.deepEqual(check.customers.unmatched.map((u) => u.account_code), ['000999']);
  const u = raw.rows.filter((r) => r[2] === '000999');
  assert.equal(check.customers.unmatched[0].lines, u.length);
  assert.deepEqual(check.customers.noSales.map((c) => c.account_code), ['000110']);
});

test('customers: leading zeros kept, spaces trimmed, delivery postcode preferred, gaps listed', () => {
  const { dataset, check } = run(['customers.csv']);
  const c = Object.fromEntries(dataset.customers.map((x) => [x.account_code, x]));
  assert.ok(c['000101'] && c['000104'], 'codes kept as text with zeros, 000104 trimmed');
  assert.equal(c['000101'].postcode, 'ZZ1 1AB');
  assert.equal(c['000101'].postcode_source, 'delivery');
  assert.equal(c['000102'].postcode, 'ZZ1 2AA');
  assert.equal(c['000101'].credit_limit, 5000);
  assert.equal(c['000101'].account_opened, '2015-03-12');
  assert.equal(c['000104'].name, 'Smith, Jones & Co');
  assert.deepEqual(check.customers.missingPostcode.map((x) => x.account_code), ['000105']);
  assert.deepEqual(check.customers.missingRep.map((x) => x.account_code).sort(), ['000105', '000107']);
  assert.deepEqual(check.customers.missingTrade.map((x) => x.account_code).sort(), ['000106', '000107', '000109']);
});

// ---------- Headers + lines ----------

test('invoice headers + lines: joined on invoice number with the same totals', () => {
  const { check } = run(['customers.csv', 'invoice-headers.csv', 'invoice-lines.csv']);
  assert.equal(check.sales.net, pounds(raw.pence));
  assert.equal(check.sales.lines, raw.lines);
  assert.equal(check.sales.invoices, raw.invoices);
  assert.equal(check.joins.invoice.total - check.joins.invoice.matched, 1);
  const lines = check.files.find((f) => f.typeId === 'invoice_lines');
  assert.equal(lines.reasons.find((r) => r.key === 'no_header_invoice').n, 1);
  assert.equal(check.files.find((f) => f.typeId === 'invoice_headers').dates[0].format, 'mon');
  assert.ok(check.suggestedJoins.invoice.agrees);
});

// ---------- Excel ----------

test('Excel: serial dates read, lost leading zeros restored, totals match the raw sheet', () => {
  const wb = XLSX.read(bytes('sales-lines.xlsx'), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }).filter((r) => /^(INV|CRN)\d+$/.test(r[0]));
  const pence = rows.reduce((s, r) => s + Math.round(r[7] * 100), 0);

  const { check, dataset } = run(['customers.csv', 'sales-lines.xlsx']);
  assert.equal(check.sales.net, pounds(pence));
  assert.equal(check.sales.lines, rows.length);
  assert.equal(check.leadingZeros.file, 'sales');
  assert.equal(check.leadingZeros.padTo, 6);
  assert.ok(check.leadingZeros.applied);
  assert.ok(dataset.sales.every((s) => s.account_code.length === 6 || s.account_code === 'CASH'));
  assert.equal(check.joins.account.matched, run(['customers.csv', 'sales-lines.csv']).check.joins.account.matched);
  assert.equal(check.sales.from, run(['sales-lines.csv']).check.sales.from);
  assert.ok(check.suggestedJoins.account.agrees);
});

test('Excel: Simon can turn off restoring leading zeros', () => {
  const { check } = run(['customers.csv', 'sales-lines.xlsx'], { padCodes: false });
  assert.ok(!check.leadingZeros.applied);
  assert.ok(check.joins.account.rate < 0.5);
});

// ---------- Stock ----------

test('stock: value equals the sum of quantity x cost in the file; gaps both ways listed', () => {
  const rows = splitCsv(readFileSync(new URL('stock.csv', FIX), 'utf8')).slice(1).filter((r) => r[0] && r[0] !== 'Totals');
  const pence = rows.reduce((s, r) => s + Math.round(plainNumber(r[3]) * plainNumber(r[4]) * 100), 0);
  const { check } = run(['sales-lines.csv', 'stock.csv']);
  assert.equal(check.stock.lines, rows.length);
  assert.equal(check.stock.value, pounds(pence));
  assert.equal(check.stock.negative.lines, 1);
  assert.deepEqual(check.stock.salesNoStock, ['TAP-ALU-50']);
  assert.equal(check.stock.stockNoSales, 2);
  assert.equal(check.files.find((f) => f.typeId === 'stock').reasons[0].key, 'total');
});

test('stock can be imported on its own', () => {
  const { check, dataset } = run(['stock.csv']);
  assert.equal(dataset.has.sales, false);
  assert.equal(check.stock.salesNoStock, null);
});

// ---------- VAT ----------

test('VAT: a VAT-inclusive file without a VAT column asks, then uses the answer', () => {
  const asked = run(['sales-gross.csv']);
  assert.equal(asked.needsVat, true);
  const divided = run(['sales-gross.csv'], { vatChoice: 'divide' });
  assert.equal(divided.needsVat, false);
  assert.equal(divided.check.sales.net, 95.4); // 61.00 + 15.60 + 18.80
  const asNet = run(['sales-gross.csv'], { vatChoice: 'net' });
  assert.equal(asNet.check.sales.net, 114.48); // 73.20 + 18.72 + 22.56
});

test('VAT: with net, VAT and gross columns the net column is used', () => {
  const { check, needsVat } = run(['sales-net-vat.csv']);
  assert.equal(needsVat, false);
  assert.equal(check.sales.net, 95.4);
});

test('ambiguous dates file: read as dd/mm and flagged', () => {
  const { check } = run(['dates-ambiguous.csv']);
  const d = check.files[0].dates[0];
  assert.equal(d.format, 'dmy');
  assert.equal(d.ambiguous, true);
  assert.equal(check.sales.from, '2025-12-01');
  assert.equal(check.sales.to, '2026-06-05');
});

// ---------- Report ----------

test('totals by month add up to the overall total', () => {
  const { check } = run(['sales-lines.csv']);
  const pence = check.sales.byMonth.reduce((s, m) => s + Math.round(m.net * 100), 0);
  assert.equal(pence / 100, check.sales.net);
  assert.equal(check.sales.byMonth.length, 24);
});

test('the skipped rows download lists every skipped row', () => {
  const { cleaned, dataset, check } = run(['sales-lines.csv']);
  const csv = skippedRowsCsv(cleaned, dataset);
  assert.equal(csv.trim().split('\r\n').length - 1, check.files[0].rowsSkipped);
});

// ---------- Profiles ----------

test('a saved profile recognises the same files and imports them in one step', () => {
  const first = ['customers.csv', 'sales-lines.csv', 'stock.csv'].map(load);
  const profile = makeProfile({ name: 'Merlin ERP standard exports', files: first, options: { removeDuplicates: false } });
  const again = ['stock.csv', 'customers.csv', 'sales-lines.csv'].map(load);
  // Scramble the guesses, as if the importer had guessed wrong, to show the profile decides.
  for (const f of again) setFileType(f, 'invoice_headers');
  const match = matchProfile([profile], again);
  assert.ok(match);
  again.forEach((f, i) => applyProfileEntry(f, match.entries[i]));
  assert.deepEqual(validate(again).blockers, []);
  assert.equal(runImport(again, match.profile.options).check.sales.net, pounds(raw.pence));
  assert.equal(matchProfile([profile], [load('invoice-lines.csv')]), null);
});

// ---------- Saving ----------

const today = '2026-10-03';
const empty = { customers: [], sales: [], stock: [], meta: {} };

test('replace mode replaces sales; append adds only newer invoices not already held', () => {
  const full = run(['customers.csv', 'sales-lines.csv']).dataset;
  const replaced = planSave({ existing: empty, dataset: full, mode: 'replace', today });
  assert.equal(replaced.plan.sales.add.length, raw.lines);
  assert.equal(replaced.plan.lastImport.salesTo, '2026-09-21');

  // Stored: everything up to the end of June 2026. Then the full file is appended.
  const stored = { ...empty, customers: full.customers, sales: full.sales.filter((s) => s.invoice_date <= '2026-06-30') };
  const appended = planSave({ existing: stored, dataset: full, mode: 'append', today });
  const newer = full.sales.filter((s) => s.invoice_date > stored.sales.map((x) => x.invoice_date).sort().at(-1));
  assert.equal(appended.plan.sales.add.length, newer.length);
  assert.equal(appended.summary.sales.skippedOld, stored.sales.length);
  assert.equal(appended.plan.sales.replace, false);

  // An invoice number already held is skipped even if its date is newer.
  const clash = { ...full, sales: [{ ...newer[0], invoice_date: '2026-12-01' }] };
  const held = planSave({ existing: { ...stored, sales: stored.sales.concat([{ ...newer[0] }]) }, dataset: clash, mode: 'append', today });
  assert.equal(held.summary.sales.skippedHeld, 1);
});

test('manual edits are never overwritten; differences from the export are listed', () => {
  const { dataset } = run(['customers.csv']);
  const overrides = new Map([
    ['000101', { account_code: '000101', fields: { trade_type: { value: 'Fabricator', by: 'Simon', at: 1 } } }],
    ['000107', { account_code: '000107', fields: { trade_type: { value: 'Joiner', by: 'Simon', at: 1 } } }],
  ]);
  const { plan, conflicts } = planSave({ existing: empty, dataset, mode: 'replace', overrides, today });
  assert.equal(conflicts.length, 1); // 000101 export says Glazing; 000107 export has no trade type
  assert.equal(conflicts[0].manual, 'Fabricator');
  assert.equal(conflicts[0].imported, 'Glazing');
  assert.ok(!('overrides' in plan), 'the save plan never writes manual edits');
});

test('stock import keeps the previous snapshot and dates the new one', () => {
  const { dataset } = run(['stock.csv']);
  const prev = [{ product_code: 'X', quantity_in_stock: 1 }];
  const { plan } = planSave({ existing: { ...empty, stock: prev, meta: { stockAsAt: '2026-09-01' } }, dataset, mode: 'replace', today });
  assert.equal(plan.stock.asAt, today);
  assert.deepEqual(plan.stock.previous, prev);
  assert.equal(plan.stock.previousAsAt, '2026-09-01');
  assert.equal(plan.sales, undefined, 'a stock-only import leaves sales alone');
});

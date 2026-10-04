// Joining cleaned files into one dataset: customers, sales lines and stock.
//
// Supported shapes (brief section 6.1):
//   customers file + sales lines file, joined on account_code
//   invoice headers file + invoice lines file, joined on invoice_no
//   a single combined sales lines file
//   a stock file, joined to sales lines on product_code (can come on its own)

import { cellText } from './values.js';
import { isCashAccount } from './clean.js';

const CUSTOMER_FIELDS = ['account_code', 'name', 'address1', 'address2', 'address3', 'town', 'county', 'postcode',
  'postcode_source', 'rep', 'trade_type', 'credit_limit', 'payment_terms', 'account_opened', 'contact_name', 'phone', 'email', 'is_cash'];
const SALES_FIELDS = ['invoice_no', 'invoice_date', 'account_code', 'line_no', 'product_code', 'description', 'product_group',
  'quantity', 'net_value', 'cost', 'rep', 'channel'];
const STOCK_FIELDS = ['product_code', 'description', 'product_group', 'quantity_in_stock', 'unit_cost', 'stock_value', 'sell_price',
  'supplier', 'brand', 'reorder_level', 'on_order', 'last_received_date', 'last_sold_date'];

function pickFields(rec, fields) {
  const out = {};
  for (const f of fields) if (rec[f] !== undefined && rec[f] !== '' && rec[f] !== null) out[f] = rec[f];
  return out;
}

// Which pair of columns, one in each file, share the most values? This is the join the
// files suggest on their own; the import check shows it beside the match rate.
export function detectJoin(gridA, headerA, gridB, headerB) {
  // Compare codes without leading zeros, so 000123 in one file meets 123 in the other.
  const key = (v) => {
    const s = cellText(v).toUpperCase();
    return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
  };
  const distinct = (grid, header, c) => {
    const s = new Set();
    for (let r = header + 1; r < grid.length && s.size < 5000; r++) {
      const v = key(grid[r][c]);
      if (v) s.add(v);
    }
    return s;
  };
  const widthA = (gridA[headerA] || []).length;
  const widthB = (gridB[headerB] || []).length;
  const setsA = Array.from({ length: widthA }, (_, c) => distinct(gridA, headerA, c));
  const setsB = Array.from({ length: widthB }, (_, c) => distinct(gridB, headerB, c));
  let best = null;
  for (let a = 0; a < widthA; a++) {
    if (setsA[a].size < 2) continue;
    for (let b = 0; b < widthB; b++) {
      if (setsB[b].size < 2) continue;
      let hit = 0;
      for (const v of setsB[b]) if (setsA[a].has(v)) hit++;
      // The most shared distinct values wins: a key column shares many, a column like
      // "Rep" shares only a handful even when its overlap rate looks high.
      const rate = hit / setsB[b].size;
      if (hit && (!best || hit > best.hit || (hit === best.hit && rate > best.rate))) best = { colA: a, colB: b, rate, hit };
    }
  }
  return best;
}

// Account codes that Excel has turned into numbers lose their leading zeros (000123 -> 123).
// Compare the code lengths in the two files; if one file's numeric codes are consistently
// longer and padding the other file's codes would make them match, say so.
export function checkLeadingZeros(customerCodes, salesCodes) {
  const digits = (codes) => [...codes].filter((c) => /^\d+$/.test(c));
  const lengths = (codes) => {
    const m = new Map();
    for (const c of codes) m.set(c.length, (m.get(c.length) || 0) + 1);
    return m;
  };
  const cust = digits(customerCodes);
  const sales = digits(salesCodes);
  if (!cust.length || !sales.length) return null;
  const custSet = new Set(customerCodes);
  const salesSet = new Set(salesCodes);

  const tryPad = (shortCodes, longCodes, longSet) => {
    const lens = lengths(longCodes);
    const [len, count] = [...lens.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count / longCodes.length < 0.8) return null;
    const affected = shortCodes.filter((c) => c.length < len && !longSet.has(c));
    if (!affected.length) return null;
    const fixed = affected.filter((c) => longSet.has(c.padStart(len, '0')));
    return fixed.length ? { padTo: len, affected: affected.length, fixable: fixed.length } : null;
  };
  const salesShort = tryPad([...new Set(sales)], cust, custSet);
  if (salesShort) return { file: 'sales', ...salesShort };
  const custShort = tryPad([...new Set(cust)], sales, salesSet);
  if (custShort) return { file: 'customers', ...custShort };

  // Different lengths that padding would not fix: still worth a warning.
  const cl = [...lengths(cust).keys()].sort().join('/');
  const sl = [...lengths(sales).keys()].sort().join('/');
  if (cl !== sl) return { file: null, customerLengths: cl, salesLengths: sl, fixable: 0 };
  return null;
}

function padCode(code, len) {
  return /^\d+$/.test(code) && code.length < len ? code.padStart(len, '0') : code;
}

// cleaned: array of results from cleanFile(). options: { padCodes (default true), cashCodes }
export function buildDataset(cleaned, options = {}) {
  const byType = (t) => cleaned.filter((c) => c.typeId === t);
  const notes = [];
  const extraSkips = []; // { file, row, reason, detail }

  // Sales lines from a combined file, or from headers + lines.
  let sales = [];
  for (const f of byType('sales_lines')) sales.push(...f.records.map((r) => ({ ...r, _file: f.name })));

  const headerFiles = byType('invoice_headers');
  const lineFiles = byType('invoice_lines');
  let headerJoin = null;
  if (headerFiles.length && lineFiles.length) {
    const headers = new Map();
    for (const f of headerFiles) for (const h of f.records) if (!headers.has(h.invoice_no)) headers.set(h.invoice_no, h);
    let matched = 0, total = 0;
    for (const f of lineFiles) {
      for (const l of f.records) {
        total++;
        const h = headers.get(l.invoice_no);
        if (!h) {
          extraSkips.push({ file: f.name, row: l._row, reason: 'no_header_invoice', detail: l.invoice_no });
          continue;
        }
        matched++;
        sales.push({
          ...l,
          account_code: h.account_code,
          invoice_date: h.invoice_date,
          customer_name: h.customer_name,
          rep: l.rep || h.rep,
          channel: h.channel,
          _file: f.name,
        });
      }
    }
    headerJoin = { matched, total, rate: total ? matched / total : 0 };
  }

  // Customers
  const customerFiles = byType('customers');
  let customers = [];
  for (const f of customerFiles) customers.push(...f.records);

  // Leading zeros lost by Excel
  let leadingZeros = null;
  if (customers.length && sales.length) {
    leadingZeros = checkLeadingZeros(customers.map((c) => c.account_code), sales.map((s) => s.account_code));
    if (leadingZeros?.fixable && options.padCodes !== false) {
      const len = leadingZeros.padTo;
      const custSet = new Set(customers.map((c) => c.account_code));
      const salesSet = new Set(sales.map((s) => s.account_code));
      if (leadingZeros.file === 'sales') {
        for (const s of sales) { const p = padCode(s.account_code, len); if (p !== s.account_code && custSet.has(p)) s.account_code = p; }
      } else {
        for (const c of customers) { const p = padCode(c.account_code, len); if (p !== c.account_code && salesSet.has(p)) c.account_code = p; }
      }
      leadingZeros.applied = true;
    }
  }

  // Customer file merged by account code (a code listed twice keeps the first, and is noted).
  const custMap = new Map();
  let duplicateCustomers = 0;
  for (const c of customers) {
    if (custMap.has(c.account_code)) { duplicateCustomers++; continue; }
    custMap.set(c.account_code, { ...pickFields(c, CUSTOMER_FIELDS), source: 'customer_file' });
  }

  // Accounts in the sales but not in the customer file still get a customer record, so their
  // sales show up; the import check lists them.
  const unmatched = new Map(); // code -> { lines, net }
  const latestName = new Map();
  for (const s of sales) {
    if (s.customer_name) latestName.set(s.account_code, s.customer_name);
  }
  for (const s of sales) {
    if (custMap.has(s.account_code)) continue;
    const u = unmatched.get(s.account_code) || { account_code: s.account_code, lines: 0, net: 0 };
    u.lines++;
    u.net += s.net_value;
    unmatched.set(s.account_code, u);
  }
  for (const code of unmatched.keys()) {
    const name = latestName.get(code) || code;
    custMap.set(code, {
      account_code: code,
      name,
      is_cash: isCashAccount(code, name, options.cashCodes),
      source: customerFiles.length ? 'sales_only' : 'sales_file',
    });
  }

  // Stock snapshot (product codes are unique; a repeated code keeps the first row).
  const stockMap = new Map();
  let duplicateStock = 0;
  for (const f of byType('stock')) {
    for (const p of f.records) {
      if (stockMap.has(p.product_code)) { duplicateStock++; continue; }
      stockMap.set(p.product_code, pickFields(p, STOCK_FIELDS));
    }
  }

  // Fill missing product groups on sales lines from the stock file.
  let groupsFilled = 0;
  if (stockMap.size) {
    for (const s of sales) {
      if (!s.product_group && stockMap.get(s.product_code)?.product_group) {
        s.product_group = stockMap.get(s.product_code).product_group;
        groupsFilled++;
      }
    }
  }

  const salesOut = sales.map((s) => {
    const o = pickFields(s, SALES_FIELDS);
    if (s._duplicate) o.duplicate = true;
    o.source_file = s._file;
    o.source_row = s._row;
    return o;
  });

  // Match rates for the joins actually used
  let accountJoin = null;
  if (customerFiles.length && sales.length) {
    const matchedLines = sales.filter((s) => !unmatched.has(s.account_code)).length;
    accountJoin = { matched: matchedLines, total: sales.length, rate: matchedLines / sales.length };
  }

  return {
    customers: [...custMap.values()],
    sales: salesOut,
    stock: [...stockMap.values()],
    has: {
      customers: customerFiles.length > 0,
      sales: byType('sales_lines').length > 0 || (headerFiles.length > 0 && lineFiles.length > 0),
      stock: byType('stock').length > 0,
    },
    joins: { account: accountJoin, invoice: headerJoin },
    leadingZeros,
    unmatched: [...unmatched.values()].map((u) => ({ ...u, net: Math.round(u.net * 100) / 100 })),
    duplicateCustomers,
    duplicateStock,
    groupsFilled,
    extraSkips,
    notes,
  };
}

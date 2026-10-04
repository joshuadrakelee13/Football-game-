// The import check (brief section 6.3): the figures Simon compares with Merlin ERP's own
// report before anything is saved. Every figure here is worked out from the dataset rows.

import { FILE_TYPES } from './fields.js';
import { sumPence, sumQty } from './values.js';
import { SKIP_REASONS, CHANGE_LABELS } from './clean.js';
import { DATE_FORMATS } from './dates.js';

export function buildCheck(cleaned, dataset) {
  // Per-file row accounting
  const extraByFile = new Map();
  for (const s of dataset.extraSkips) {
    const list = extraByFile.get(s.file) || [];
    list.push(s);
    extraByFile.set(s.file, list);
  }
  const files = cleaned.map((c) => {
    const extra = extraByFile.get(c.name) || [];
    const reasons = { ...c.counts };
    for (const s of extra) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
    return {
      name: c.name,
      typeId: c.typeId,
      typeLabel: FILE_TYPES[c.typeId].label,
      rowsRead: c.rowsRead,
      rowsUsed: c.rowsUsed - extra.length,
      rowsSkipped: c.skipped.length + extra.length,
      reasons: Object.entries(reasons).map(([key, n]) => ({ key, label: SKIP_REASONS[key] || key, n })).sort((a, b) => b.n - a.n),
      changes: Object.entries(c.changes).map(([key, n]) => ({ key, label: CHANGE_LABELS[key] || key, n })),
      dates: Object.entries(c.dates).map(([field, d]) => ({ field, ...d, label: DATE_FORMATS[d.format] || 'not recognised' })),
      duplicates: c.duplicates.length,
      vat: c.vat,
    };
  });

  const sales = dataset.sales;
  const out = { files, has: dataset.has };

  if (sales.length) {
    const invoices = new Set(sales.map((s) => s.invoice_no));
    const accounts = new Set(sales.map((s) => s.account_code));
    const dates = sales.map((s) => s.invoice_date).sort();
    const months = new Map();
    for (const s of sales) {
      const ym = s.invoice_date.slice(0, 7);
      const m = months.get(ym) || { ym, lines: [], invoices: new Set() };
      m.lines.push(s);
      m.invoices.add(s.invoice_no);
      months.set(ym, m);
    }
    const credits = sales.filter((s) => s.quantity < 0 || s.net_value < 0);
    const cashCodes = new Set(dataset.customers.filter((c) => c.is_cash).map((c) => c.account_code));
    const cash = sales.filter((s) => cashCodes.has(s.account_code));
    const dups = sales.filter((s) => s.duplicate);
    const withCost = sales.filter((s) => typeof s.cost === 'number');
    out.sales = {
      lines: sales.length,
      net: sumPence(sales.map((s) => s.net_value)),
      quantity: sumQty(sales.map((s) => s.quantity)),
      invoices: invoices.size,
      customers: accounts.size,
      from: dates[0],
      to: dates[dates.length - 1],
      byMonth: [...months.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => ({
        ym: m.ym,
        net: sumPence(m.lines.map((s) => s.net_value)),
        quantity: sumQty(m.lines.map((s) => s.quantity)),
        invoices: m.invoices.size,
        lines: m.lines.length,
      })),
      credits: { lines: credits.length, net: sumPence(credits.map((s) => s.net_value)) },
      cash: { lines: cash.length, net: sumPence(cash.map((s) => s.net_value)), accounts: [...cashCodes] },
      duplicates: { lines: dups.length, net: sumPence(dups.map((s) => s.net_value)) },
      cost: withCost.length ? { lines: withCost.length, total: sumPence(withCost.map((s) => s.cost)) } : null,
      noGroup: sales.filter((s) => !s.product_group).length,
      groupsFilled: dataset.groupsFilled,
    };
  }

  // Customers
  const customers = dataset.customers;
  if (customers.length) {
    const real = customers.filter((c) => !c.is_cash);
    const withSales = new Set(sales.map((s) => s.account_code));
    out.customers = {
      count: customers.length,
      fromFile: customers.filter((c) => c.source === 'customer_file').length,
      cash: customers.filter((c) => c.is_cash).map((c) => ({ account_code: c.account_code, name: c.name })),
      unmatched: dataset.has.customers ? dataset.unmatched : [],
      noSales: dataset.has.customers && dataset.has.sales
        ? real.filter((c) => c.source === 'customer_file' && !withSales.has(c.account_code)).map((c) => ({ account_code: c.account_code, name: c.name }))
        : [],
      missingPostcode: real.filter((c) => !c.postcode).map(brief),
      missingRep: real.filter((c) => !c.rep).map(brief),
      missingTrade: real.filter((c) => !c.trade_type).map(brief),
      duplicates: dataset.duplicateCustomers,
    };
  }

  // Stock
  if (dataset.stock.length) {
    const stock = dataset.stock;
    const value = (p) => (typeof p.unit_cost === 'number' ? p.quantity_in_stock * p.unit_cost : (typeof p.stock_value === 'number' ? p.stock_value : 0));
    const soldCodes = new Set(sales.map((s) => s.product_code));
    const stockCodes = new Set(stock.map((p) => p.product_code));
    const negative = stock.filter((p) => p.quantity_in_stock < 0);
    out.stock = {
      lines: stock.length,
      quantity: sumQty(stock.map((p) => p.quantity_in_stock)),
      value: sumPence(stock.map(value)),
      noCost: stock.filter((p) => typeof p.unit_cost !== 'number' && typeof p.stock_value !== 'number').length,
      negative: { lines: negative.length, value: sumPence(negative.map(value)) },
      salesNoStock: sales.length ? [...soldCodes].filter((c) => !stockCodes.has(c)).sort() : null,
      stockNoSales: sales.length ? stock.filter((p) => !soldCodes.has(p.product_code)).length : null,
      duplicates: dataset.duplicateStock,
    };
  }

  out.joins = dataset.joins;
  out.leadingZeros = dataset.leadingZeros;
  return out;
}

function brief(c) {
  return { account_code: c.account_code, name: c.name };
}

// Every skipped row, for the "Download the skipped rows" CSV.
export function skippedRowsCsv(cleaned, dataset) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['File', 'Row', 'Reason', 'Detail', 'Row contents'].join(',')];
  for (const c of cleaned) {
    for (const s of c.skipped) lines.push([c.name, s.row, SKIP_REASONS[s.reason] || s.reason, s.detail, s.text].map(esc).join(','));
  }
  for (const s of dataset.extraSkips) lines.push([s.file, s.row, SKIP_REASONS[s.reason] || s.reason, s.detail, ''].map(esc).join(','));
  return lines.join('\r\n') + '\r\n';
}

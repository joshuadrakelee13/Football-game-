// What an import will change in the stored data, worked out before anything is written.
// js/db/store.js carries the plan out in one transaction.
//
// Modes (brief section 6.4):
//   replace  everything in the import replaces what is stored (stock always replaces)
//   append   "Add newer data": only invoices dated after the latest date already stored are
//            added, and invoices already held are skipped. Customers in the import update
//            their stored record; customers not in the import are kept.
//
// Manual edits (overrides) are never touched. If the import brings a value that differs from
// a manual edit, the manual value stays and the difference is listed for review.

import { FIELDS } from './fields.js';

const EDITABLE = ['name', 'address1', 'address2', 'address3', 'town', 'county', 'postcode', 'rep', 'trade_type',
  'credit_limit', 'payment_terms', 'account_opened', 'contact_name', 'phone', 'email'];

export function planSave({ existing, dataset, mode, overrides = new Map(), today, files = [], profileName = null }) {
  const plan = {};
  const summary = { mode };
  const skipped = []; // { file, row, reason, detail }

  // Sales
  let finalSales = existing.sales;
  if (dataset.has.sales) {
    if (mode === 'append' && existing.sales.length) {
      let latest = '';
      const held = new Set();
      for (const s of existing.sales) {
        if (s.invoice_date > latest) latest = s.invoice_date;
        held.add(s.invoice_no);
      }
      const add = [];
      let old = 0, already = 0;
      for (const s of dataset.sales) {
        if (s.invoice_date <= latest) { old++; skipped.push({ file: s.source_file, row: s.source_row, reason: 'old_invoice', detail: s.invoice_no }); continue; }
        if (held.has(s.invoice_no)) { already++; skipped.push({ file: s.source_file, row: s.source_row, reason: 'held_invoice', detail: s.invoice_no }); continue; }
        add.push(s);
      }
      plan.sales = { replace: false, add };
      summary.sales = { added: add.length, skippedOld: old, skippedHeld: already, latestBefore: latest };
      finalSales = existing.sales.concat(add);
    } else {
      plan.sales = { replace: true, add: dataset.sales };
      summary.sales = { added: dataset.sales.length, replaced: existing.sales.length };
      finalSales = dataset.sales;
    }
  }

  // Customers. With sales-only imports, customers found only in the sales are added if new
  // but never overwrite a stored customer record.
  if (dataset.customers.length) {
    const stored = new Map(existing.customers.map((c) => [c.account_code, c]));
    const put = [];
    const replace = mode !== 'append' && dataset.has.customers;
    let added = 0, updated = 0;
    for (const c of dataset.customers) {
      const old = stored.get(c.account_code);
      if (!old) { put.push(c); added++; continue; }
      if (c.source === 'customer_file') { put.push(replace ? c : { ...old, ...c }); updated++; }
      else if (replace) put.push(old.source === 'customer_file' ? old : c);
    }
    if (replace) {
      // Customers stored before but missing from this customer file are kept only if they
      // still have sales; otherwise the new file is the full list.
      const inImport = new Set(dataset.customers.map((c) => c.account_code));
      const withSales = new Set(finalSales.map((s) => s.account_code));
      for (const old of existing.customers) {
        if (!inImport.has(old.account_code) && withSales.has(old.account_code)) put.push(old);
      }
    }
    plan.customers = { replace, put };
    summary.customers = { added, updated };
  }

  // Stock: a snapshot. The previous one is kept for comparison.
  if (dataset.has.stock) {
    plan.stock = { current: dataset.stock, previous: existing.stock, asAt: today, previousAsAt: existing.meta?.stockAsAt || null };
    summary.stock = { lines: dataset.stock.length };
  }

  // Manual values that differ from what this import brings.
  const conflicts = [];
  for (const c of dataset.customers) {
    const o = overrides.get(c.account_code);
    if (!o) continue;
    for (const [field, entry] of Object.entries(o.fields || {})) {
      if (!EDITABLE.includes(field)) continue;
      const incoming = c[field];
      if (incoming === undefined || incoming === null || incoming === '') continue;
      if (String(incoming).trim().toLowerCase() !== String(entry.value).trim().toLowerCase()) {
        conflicts.push({ account_code: c.account_code, name: c.name, field, label: FIELDS[field]?.label || field, manual: entry.value, imported: incoming });
      }
    }
  }

  const salesDates = finalSales.map((s) => s.invoice_date).sort();
  plan.lastImport = {
    date: today,
    at: Date.now(),
    mode,
    files,
    profile: profileName,
    salesFrom: salesDates[0] || existing.meta?.lastImport?.salesFrom || null,
    salesTo: salesDates[salesDates.length - 1] || existing.meta?.lastImport?.salesTo || null,
  };

  return { plan, summary, conflicts, skipped };
}

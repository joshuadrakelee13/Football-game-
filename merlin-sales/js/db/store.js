// Loads everything the screens need from IndexedDB into memory, and saves imports.
// The rules for what an import changes live in js/import/save-plan.js (plain functions,
// tested in Node); this file only carries them out against the database.

import { getAll, getMeta, write, put } from './db.js';

export async function loadAll() {
  const [customers, overrideList, chunks, stock, stockPrevious, lastImport, stockAsAt, previousStockAsAt] = await Promise.all([
    getAll('customers'),
    getAll('overrides'),
    getAll('sales_chunks'),
    getAll('stock'),
    getAll('stock_previous'),
    getMeta('lastImport'),
    getMeta('stockAsAt'),
    getMeta('previousStockAsAt'),
  ]);
  const sales = [];
  for (const c of chunks) for (const r of c.rows) sales.push(r);
  const overrides = new Map(overrideList.map((o) => [o.account_code, o]));
  return { customers, overrides, sales, stock, stockPrevious, meta: { lastImport, stockAsAt, previousStockAsAt } };
}

const CHUNK = 5000;

function chunksOf(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push({ rows: rows.slice(i, i + CHUNK) });
  return out;
}

// Carry out a save plan from js/import/save-plan.js in a single transaction, so an import
// is either saved whole or not at all.
export async function applySavePlan(plan, log) {
  const stores = ['customers', 'sales_chunks', 'stock', 'stock_previous', 'meta', 'imports'];
  await write(stores, (s) => {
    if (plan.customers) {
      if (plan.customers.replace) s.customers.clear();
      for (const c of plan.customers.put) s.customers.put(c);
    }
    if (plan.sales) {
      if (plan.sales.replace) s.sales_chunks.clear();
      for (const chunk of chunksOf(plan.sales.add)) s.sales_chunks.add(chunk);
    }
    if (plan.stock) {
      s.stock_previous.clear();
      for (const p of plan.stock.previous) s.stock_previous.put(p);
      s.stock.clear();
      for (const p of plan.stock.current) s.stock.put(p);
      s.meta.put({ key: 'stockAsAt', value: plan.stock.asAt });
      s.meta.put({ key: 'previousStockAsAt', value: plan.stock.previousAsAt || null });
    }
    s.meta.put({ key: 'lastImport', value: plan.lastImport });
    s.imports.add(log);
  });
}

export async function saveProfile(profile) {
  return put('profiles', profile);
}

export async function loadProfiles() {
  return getAll('profiles');
}

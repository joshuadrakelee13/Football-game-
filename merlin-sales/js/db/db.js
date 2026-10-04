// IndexedDB storage. Everything Simon imports stays in this browser on this computer.
//
// Stores:
//   meta            key/value: last import, stock "as at" date and similar
//   customers       one record per account, as imported (keyed by account_code)
//   overrides       manual edits, keyed by account_code, never touched by an import
//   sales_chunks    invoice lines, stored in blocks of a few thousand for speed
//   stock           the current stock snapshot (keyed by product_code)
//   stock_previous  the snapshot before it, kept for comparison
//   profiles        saved column mappings ("Merlin ERP standard exports")
//   imports         a log of each import and its check figures
//   geocache        postcode lookups from postcodes.io, so each is looked up once
//   actions         "Called", "Not an issue", "Snooze 30 days" marks
//   notes           customer notes
//   settings        thresholds, rep names, trade types and other preferences
//
// Later: an aged debtors / payments store is added with a version bump (brief section 5.4).

import { DB_NAME, DB_VERSION } from '../config.js';

export const STORES = {
  meta: { keyPath: 'key' },
  customers: { keyPath: 'account_code' },
  overrides: { keyPath: 'account_code' },
  sales_chunks: { keyPath: 'id', autoIncrement: true },
  stock: { keyPath: 'product_code' },
  stock_previous: { keyPath: 'product_code' },
  profiles: { keyPath: 'id' },
  imports: { keyPath: 'id', autoIncrement: true },
  geocache: { keyPath: 'postcode' },
  actions: { keyPath: 'key' },
  notes: { keyPath: 'account_code' },
  settings: { keyPath: 'key' },
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is open in another tab. Close other Merlin Sales tabs and try again.'));
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function get(store, key) {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return txDone(tx);
}

export async function del(store, key) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}

// Run several writes across stores as one transaction: all of it is saved, or none of it.
// `fn` receives an object of object stores, e.g. ({ customers, meta }) => { ... }.
export async function write(storeNames, fn) {
  const db = await openDb();
  const tx = db.transaction(storeNames, 'readwrite');
  const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]));
  fn(stores);
  return txDone(tx);
}

export async function getMeta(key, fallback = null) {
  const rec = await get('meta', key);
  return rec ? rec.value : fallback;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

// "Delete all data from this computer": removes the whole database, not just its contents.
export async function deleteAllData() {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    if (db) db.close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Merlin Sales tabs, then try again.'));
  });
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage may be blocked */ }
}

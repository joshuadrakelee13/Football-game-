// Headless browser check of Simon's app. Run from merlin-sales/: npm run check
//
// Starts the repo's static server, opens the app in Chromium, imports the fake fixture files
// through the real import screen, and checks:
//   - every screen opens without errors
//   - the import check shows the same total the Node tests work out from the raw files
//   - the data is still there after closing and reopening the browser page
//   - the saved mapping recognises the same files next time (one click)
//   - "Delete all data" removes everything
//
// Needs Playwright (installed globally here, or `npm i -D playwright` in this folder).

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { XLSX } from './xlsx-node.mjs';
import { analyseFile, runImport } from '../js/import/pipeline.js';
import { readFileSync } from 'node:fs';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(APP_DIR, '..');
const FIX = join(APP_DIR, 'tests', 'fixtures');
const SHOTS = join(REPO, 'screenshots');
const PORT = 5190 + Math.floor(Math.random() * 50);
const URL_ = `http://127.0.0.1:${PORT}/merlin-sales/`;

function loadPlaywright() {
  const tries = [() => createRequire(import.meta.url)('playwright')];
  try {
    const globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    tries.push(() => createRequire(join(globalRoot, 'noop.js'))('playwright'));
  } catch { /* no global npm */ }
  for (const t of tries) {
    try { return t(); } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. Run: npm i -D playwright');
}

const failures = [];
function ok(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures.push(msg); }
}

// What the Node importer makes of the same files, for comparison with the screen.
const files = ['customers.csv', 'sales-lines.csv', 'stock.csv'];
const expected = runImport(files.map((n) => analyseFile(XLSX, readFileSync(join(FIX, n)), n))).check;
const gbp = (n) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const server = spawn(process.execPath, [join(REPO, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const { chromium } = loadPlaywright();
// A persistent browser profile, so the check can close the whole browser and start it again,
// as Simon would at the end of the day.
const profileDir = mkdtempSync(join(tmpdir(), 'merlin-sales-check-'));
const launch = () => chromium.launchPersistentContext(profileDir, { viewport: { width: 1366, height: 900 } });
let context = await launch();
const errors = [];
mkdirSync(SHOTS, { recursive: true });

async function open(path = '') {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_ + path);
  await page.waitForSelector('h1');
  return page;
}

try {
  console.log('Merlin Sales browser check');
  let page = await open();

  for (const r of ['attention', 'customers', 'products', 'reps', 'map', 'settings', 'import']) {
    await page.goto(`${URL_}#/${r}`);
    await page.waitForFunction((id) => document.querySelector(`[data-nav="${id}"]`)?.getAttribute('aria-current') === 'page', r);
  }
  ok(errors.length === 0, 'every screen opens without errors');
  ok((await page.textContent('#status')).includes('No data imported yet'), 'status says no data yet');

  // First import: drop files, check columns, check totals, import.
  await page.goto(`${URL_}#/import`);
  await page.setInputFiles('#file-input', files.map((f) => join(FIX, f)));
  await page.waitForSelector('[data-action="to-check"]');
  ok(await page.isEnabled('[data-action="to-check"]'), 'columns are matched with no manual steps');
  await page.screenshot({ path: join(SHOTS, 'merlin-import-columns.png'), fullPage: true });
  await page.click('[data-action="to-check"]');
  await page.waitForSelector('#merlin-total');
  const figures = await page.textContent('.figures');
  ok(figures.includes(gbp(expected.sales.net)), `import check shows total net sales ${gbp(expected.sales.net)}`);
  await page.fill('#merlin-total', String(expected.sales.net));
  await page.waitForSelector('.recon__diff.is-zero');
  ok(true, 'typing Merlin’s total shows a zero difference');
  await page.screenshot({ path: join(SHOTS, 'merlin-import-check.png'), fullPage: true });
  ok(await page.isVisible('a[download="skipped-rows.csv"]'), 'skipped rows can be downloaded');
  await page.click('[data-action="import"]');
  await page.waitForSelector('text=Imported and saved on this computer.');
  ok(true, 'import saves');
  ok((await page.textContent('#status')).includes('Last import'), 'last import date shows in the top bar');

  // Close the browser completely and start it again: the data is still there.
  await context.close();
  context = await launch();
  page = await open('#/settings');
  const counts = await page.textContent('.figures');
  ok(counts.includes(String(expected.sales.lines)), `after restarting the browser, ${expected.sales.lines} invoice lines are still stored`);
  ok(await page.isVisible('text=Merlin ERP standard exports'), 'the mapping was saved as a profile');

  // Same files again: recognised, straight to the totals.
  await page.goto(`${URL_}#/import`);
  await page.setInputFiles('#file-input', files.map((f) => join(FIX, f)));
  await page.waitForSelector('text=Recognised as “Merlin ERP standard exports”.');
  ok(await page.isEnabled('[data-action="import"]'), 'next time the same files import in one click');
  await page.click('[data-action="import"]');
  await page.waitForSelector('text=Imported and saved on this computer.');

  // Delete all data.
  await page.goto(`${URL_}#/settings`);
  await page.click('[data-action="ask-delete"]');
  await page.click('[data-action="confirm-delete"]');
  await page.waitForSelector('#dropzone');
  ok((await page.textContent('#status')).includes('No data imported yet'), 'Delete all data removes everything');
  await page.goto(`${URL_}#/settings`);
  await page.waitForSelector('.figures');
  ok(!(await page.isVisible('text=Merlin ERP standard exports')), 'saved mappings are deleted too');

  ok(errors.length === 0, `no errors in the browser console${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (err) {
  failures.push(err.message);
  console.error(err);
} finally {
  await context.close();
  server.kill();
  rmSync(profileDir, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed. Screenshots are in screenshots/.');

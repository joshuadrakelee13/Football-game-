// End-to-end check of the built Merlin site in Chromium.
//
//   node merlin-accessories/build.mjs && node merlin-accessories/tools/check.mjs
//
// Starts the repo's static server, then:
//   - crawls every internal link and fails on any non-200 page or missing #anchor
//   - checks the mega menu opens on hover and closes on leave
//   - checks search finds and opens a result from the keyboard
//   - checks no page scrolls sideways at phone width (390px)
//   - checks every link works when the site is opened from disk (file://)
//   - saves screenshots to screenshots/merlin/ (git-ignored)
//
// Needs Playwright. In Claude Code cloud sessions it is installed globally; elsewhere
// run `npm i -D playwright` first.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SITE, '..');
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/merlin-accessories/`;
const SHOTS = join(REPO, 'screenshots/merlin');

const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const server = spawn(process.execPath, [join(REPO, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
await mkdir(SHOTS, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

const browser = await chromium.launch();
try {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, ignoreHTTPSErrors: true });
  const p = await desk.newPage();
  const jsErrors = [];
  p.on('pageerror', (e) => jsErrors.push(`${p.url()}: ${e.message}`));

  // 1. Crawl
  const seen = new Set(); const queue = [BASE]; const anchors = new Set();
  while (queue.length) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const res = await p.goto(url, { waitUntil: 'domcontentloaded' });
    if (!res || res.status() !== 200) { fail(`${url} returned ${res?.status()}`); continue; }
    for (const href of await p.$$eval('a[href]', (as) => as.map((a) => a.href))) {
      const u = new URL(href); if (u.origin !== new URL(BASE).origin) continue;
      if (u.hash && !['#top', '#main'].includes(u.hash)) anchors.add(u.href);
      u.hash = ''; if (!seen.has(u.href)) queue.push(u.href);
    }
  }
  ok(`crawled ${seen.size} pages`);
  for (const a of anchors) { await p.goto(a); if (!(await p.$(new URL(a).hash))) fail(`missing anchor ${a}`); }
  ok(`checked ${anchors.size} anchors`);

  // 2. Menus and search
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.screenshot({ path: join(SHOTS, 'home.png'), fullPage: true });
  await p.hover('[data-menu] >> nth=0'); await p.waitForTimeout(400);
  if (!(await p.$eval('[data-menu]', (el) => el.classList.contains('is-open')))) fail('mega menu did not open on hover');
  await p.screenshot({ path: join(SHOTS, 'mega-menu.png') });
  await p.mouse.move(5, 850); await p.waitForTimeout(500);
  if (await p.$eval('[data-menu]', (el) => el.classList.contains('is-open'))) fail('mega menu did not close on leave');
  else ok('mega menu opens and closes');

  await p.keyboard.press('/'); await p.keyboard.type('post spikes');
  await Promise.all([p.waitForURL(/gateandfencehardware/), p.keyboard.press('Enter')]);
  ok('search: "post spikes" → Gate & Fence Hardware');

  // 3. Phone width
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  const m = await mob.newPage();
  for (const url of seen) {
    await m.goto(url, { waitUntil: 'domcontentloaded' });
    const w = await m.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) fail(`horizontal scroll at 390px on ${url} (${w}px)`);
  }
  await m.goto(BASE, { waitUntil: 'networkidle' });
  await m.screenshot({ path: join(SHOTS, 'home-phone.png') });
  ok('no sideways scroll at phone width');

  // 4. Opened from disk
  const f = await desk.newPage();
  await f.goto(pathToFileURL(join(SITE, 'index.html')).href);
  const fileLinks = [...new Set((await f.$$eval('a[href]', (as) => as.map((a) => a.href))).filter((h) => h.startsWith('file:')))];
  for (const l of fileLinks) { await f.goto(l); if (!(await f.$('[data-navbar]'))) fail(`file:// link broken: ${l}`); }
  ok(`${fileLinks.length} links work from disk`);

  jsErrors.forEach((e) => fail(`JS error ${e}`));
} finally {
  await browser.close();
  server.kill();
}

console.log(failures.length ? `\n${failures.length} problem(s).` : `\nAll checks passed. Screenshots in ${SHOTS}`);
process.exit(failures.length ? 1 : 0);

#!/usr/bin/env node
// Headless verification of the Gibraltar web viewer (Playwright + Chromium/SwiftShader).
//
//   node gibraltar/web/tools/verify.cjs [screenshot-dir]
//
// Starts serve.mjs on a free port, loads the viewer with ?autotest=1, checks
// streaming, walking physics (speed, ground following, wall / sea / slope
// blocking, jump, crouch), interaction, and takes screenshots of fixed views.
// Prints a JSON summary at the end; exit code 1 on failed checks.

const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const OUT = path.resolve(process.argv[2] || 'web-shots');
fs.mkdirSync(OUT, { recursive: true });
const SERVE = path.join(__dirname, '..', 'serve.mjs');

const results = { checks: [], shots: [], console: [], perf: {} };
function check(name, ok, detail) {
  results.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

function freePort() {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [SERVE], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  await new Promise((r) => server.stdout.once('data', r));
  const BASE = `http://127.0.0.1:${port}/web/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') results.console.push(`${m.type()}: ${m.text().slice(0, 300)}`);
    });
    page.on('pageerror', (e) => results.console.push(`pageerror: ${e.message}`));
    const shot = async (name) => {
      const file = path.join(OUT, name + '.png');
      await page.screenshot({ path: file, timeout: 180000 });
      results.shots.push(file);
      console.log('      shot', file);
    };
    const state = () => page.evaluate(() => __gib.getState());
    const waitReady = () => page.waitForFunction(() => window.__gib && __gib.ready(), null, { timeout: 240000, polling: 500 });
    const goto = async (x, y, heading, pitch = 0) => {
      await page.evaluate(([x, y, h, pt]) => { __gib.teleport(x, y); __gib.look(h, pt); }, [x, y, heading, pitch]);
      await page.waitForTimeout(300);
      await waitReady();
      await page.waitForTimeout(1500);
    };

    // ------------------------------------------------ start screen + menu (normal mode)
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('#btn-start');
    await page.waitForFunction(() => !!window.__gib, null, { timeout: 60000 });
    check('page title', (await page.title()) === 'Gibraltar — 1:1 walking simulator (validation viewer)', await page.title());
    await shot('00-start-screen');
    await page.click('#btn-start'); // pointer lock may be refused headless; that's fine
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const menuOpen = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
    check('Esc opens pause menu', menuOpen);
    await page.click('button[data-page="teleport"]');
    await page.fill('#tp-search', 'light');
    await page.waitForTimeout(300);
    await shot('01-menu-teleport');
    await page.click('#page-teleport button[data-page="main"]');
    await page.click('button[data-page="settings"]');
    await shot('02-menu-settings');

    // ------------------------------------------------ autotest session
    const t0 = Date.now();
    await page.goto(BASE + '?autotest=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.__gib, null, { timeout: 60000 });
    await waitReady();
    results.perf.initialLoadSeconds = (Date.now() - t0) / 1000;
    await page.evaluate(() => { __gib.setTimeFlow(false); __gib.setTime(10); });
    await page.waitForTimeout(2000);
    let s = await state();
    check('spawn at Grand Casemates Square', Math.hypot(s.x + 246.942, s.y - 1648.743) < 0.5 && Math.abs(s.heading - 180) < 0.5,
      `x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} heading=${s.heading} tile=${s.tile}`);
    check('standing on ground at spawn', s.grounded && Math.abs(s.z - s.ground) < 0.01 && Math.abs(s.eyeZ - s.ground - 1.65) < 0.01,
      `feet=${s.z.toFixed(3)} ground=${s.ground.toFixed(3)} (${s.groundKind}) eye=${s.eyeZ.toFixed(3)}`);
    const tilesNow = await page.evaluate(() => __gib.loadedTiles());
    results.perf.tilesLoaded = tilesNow.length;
    results.perf.tilesWithDetail = tilesNow.filter((t) => t.layers.length > 1).length;
    results.perf.colliders = s.colliders;
    check('tile streaming: terrain ≥3 km, detail ~1.2 km', tilesNow.length > 40 && results.perf.tilesWithDetail < tilesNow.length,
      `${tilesNow.length} tiles loaded, ${results.perf.tilesWithDetail} with detail layers, ${s.colliders} colliders`);
    await shot('10-spawn-casemates');

    // ------------------------------------------------ walking with real key events
    await page.evaluate(() => __gib.look(180, 0));
    let a = await state();
    await page.keyboard.down('w');
    await page.waitForTimeout(6000);
    let mid = await state();
    await page.waitForTimeout(3000);
    let b = await state();
    await page.keyboard.up('w');
    const vWalk = Math.hypot(b.x - mid.x, b.y - mid.y) / (b.simTime - mid.simTime);
    check('walk speed ≈1.4 m/s (keyboard W)', Math.abs(vWalk - 1.4) < 0.05,
      `${vWalk.toFixed(3)} m/s over ${(b.simTime - mid.simTime).toFixed(2)} s sim; moved ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} m total`);
    check('feet on ground while walking', b.grounded && Math.abs(b.z - b.ground) < 0.02 && Math.abs(b.eyeZ - b.z - 1.65) < 0.01,
      `feet=${b.z.toFixed(3)} ground=${b.ground.toFixed(3)} eye-feet=${(b.eyeZ - b.z).toFixed(3)}`);
    await page.keyboard.down('Shift'); await page.keyboard.down('w');
    await page.waitForTimeout(5000);
    mid = await state(); await page.waitForTimeout(2500); b = await state();
    await page.keyboard.up('w'); await page.keyboard.up('Shift');
    const vRun = Math.hypot(b.x - mid.x, b.y - mid.y) / (b.simTime - mid.simTime);
    check('run speed ≈4.5 m/s (Shift+W)', Math.abs(vRun - 4.5) < 0.1 || b.blocked, `${vRun.toFixed(3)} m/s (blocked=${b.blocked})`);

    // ------------------------------------------------ deterministic physics via simulate()
    const sim = (x, y, h, secs, inp, opts = {}) => page.evaluate(async ([x, y, h, secs, inp, opts]) => {
      if (x != null) __gib.teleport(x, y);
      for (let i = 0; i < 400 && !__gib.ready(); i++) await new Promise((r) => setTimeout(r, 250));
      __gib.look(h, 0); __gib.crouch(!!opts.crouch);
      return __gib.simulate(secs, inp, opts.every || 1);
    }, [x, y, h, secs, inp, opts]);

    // building wall: from spawn walk WNW into the building osm:way/257441375 (≈32 m away)
    let r = await sim(-246.942, 1648.743, 300, 30, { f: true });
    let insp = await page.evaluate(() => { const r = __gib.inspect(); return r && { kind: r.kind, id: r.id, dist: r.dist, conf: r.rec?.confidence, height: r.rec?.height_m }; });
    const last = r.samples.slice(-3);
    const stalled = Math.hypot(last[2].x - last[0].x, last[2].y - last[0].y) < 1.0;
    check('blocked by building wall', r.blockedSteps > 0 && stalled && insp && insp.kind === 'building' && insp.dist < 0.6,
      `walked ${r.dist.toFixed(2)} m, then held; blocked steps ${r.blockedSteps}; nearest building ${insp?.id} at ${insp?.dist?.toFixed(3)} m (capsule radius 0.30)`);
    check('ground following over 30 s walk', r.maxGroundGap < 0.01 && r.airborneSteps === 0, `max |feet-ground| ${r.maxGroundGap.toFixed(4)} m, airborne steps ${r.airborneSteps}`);
    await sim(null, null, 300, 5, { b: true }); // step back from the wall so it's in view
    await page.evaluate(() => __gib.look(300, 5));
    await page.evaluate(() => __gib.interact());
    await page.waitForTimeout(1500);
    await shot('11-inspect-building');
    const panelText = await page.evaluate(() => document.getElementById('panel').textContent);
    check('building panel shows id, confidence, roof', /osm:way\/\d+/.test(panelText) && /Confidence/.test(panelText) && /Roof/.test(panelText),
      panelText.replace(/\s+/g, ' ').slice(0, 160));
    const hasFacades = await page.evaluate(() => __gib.tiles.manifest.tiles.some((t) => t.layers.facades));
    if (hasFacades) {
      check('building panel shows façade (doors / windows)', /Doors: \d+ mapped \(OSM\), \d+ procedural · Windows: \d+/.test(panelText),
        (panelText.match(/Doors:[^\n]*?surveyed\)|Doors:.{0,80}/) || [''])[0]);
      const fac = await page.evaluate(() => {
        const out = { loaded: 0, maxDist: 0, inCollider: 0 };
        for (const t of __gib.tiles.tiles.values()) {
          if (t.layers.facades?.state === 'loaded') { out.loaded++; out.maxDist = Math.max(out.maxDist, Math.round(t.dist)); }
          if (t.collider && /facades/.test(t.colliderSig)) out.inCollider++;
        }
        return out;
      });
      check('facades stream close (≤600 m + hysteresis) and never collide', fac.loaded > 0 && fac.maxDist <= 800 && fac.inCollider === 0,
        `${fac.loaded} tiles with facades, farthest ${fac.maxDist} m, in collision: ${fac.inCollider}`);
    }
    await page.evaluate(() => __gib.interact()); // close

    // jump
    r = await sim(null, null, 0, 1.2, { jump: true }, { every: 0.05 });
    const apex = Math.max(...r.samples.map((q) => q.z)) - r.start[2];
    check('jump apex ≈0.59 m and lands', apex > 0.5 && apex < 0.65 && r.samples.at(-1).grounded, `apex ${apex.toFixed(3)} m`);
    // crouch
    r = await sim(null, null, 120, 3, { f: true }, { crouch: true });
    s = await state();
    check('crouch: eye 1.0 m, 0.7 m/s', Math.abs(s.eyeZ - s.z - 1.0) < 0.01 && Math.abs(r.dist / 3 - 0.7) < 0.1, `eye-feet ${(s.eyeZ - s.z).toFixed(3)} m, ${(r.dist / 3).toFixed(2)} m/s`);
    await page.evaluate(() => __gib.crouch(false));

    // steep slope on the Rock's west face: walking east (uphill) must stall where slope > 50°
    r = await sim(165, -170, 90, 25, { f: true }, { every: 2.5 });
    const zs = r.samples.map((q) => q.z);
    check('slope limit: cannot climb >50° terrain', zs.at(-1) - zs[4] < 0.5 && r.dist < 20,
      `climbed ${(zs[4] - r.start[2]).toFixed(1)} m in first 12.5 s, then ${(zs.at(-1) - zs[4]).toFixed(2)} m in the next 12.5 s`);

    // sea: walk off a marina pontoon and off Catalan Bay beach
    r = await sim(-827, 1063, 280, 20, { f: true, run: true });
    s = await state();
    check('sea blocks (harbour pontoon)', r.dist < 3 && s.z > 0 && s.grounded, `moved ${r.dist.toFixed(2)} m, feet ${s.z.toFixed(2)} m on ${s.groundKind}`);
    r = await sim(817.7, 996.9, 90, 40, { f: true });
    s = await state();
    check('sea blocks (Catalan Bay beach)', r.dist < 40 && s.z >= -0.5 && s.grounded, `moved ${r.dist.toFixed(2)} m east, stopped at feet ${s.z.toFixed(2)} m, seaBlocked=${s.seaBlocked}`);

    // props (pipeline builds with a "props" layer): a tree trunk blocks, its crown never does, E inspects it
    const hasProps = await page.evaluate(() => __gib.tiles.manifest.tiles.some((t) => t.layers.props));
    if (hasProps) {
      const tree = [-526.888, 1031.692]; // osm:node/6257475790, a free-standing tree near Commonwealth Park
      r = await sim(tree[0] - 6, tree[1], 90, 8, { f: true }, { every: 0.1 });
      const dTree = Math.min(...r.samples.map((q) => Math.hypot(q.x - tree[0], q.y - tree[1])));
      const held = r.samples.filter((q) => q.blocked).length / 10;
      check('tree trunk blocks the player (no walking through)', r.blockedSteps > 0 && dTree > 0.4 && dTree < 0.6,
        `closest approach ${dTree.toFixed(2)} m from trunk centre (capsule 0.30 + trunk ≈0.18), held/sliding round it for ${held.toFixed(1)} s`);
      // face the tree from wherever the player ended up (it may have slid round the trunk)
      insp = await page.evaluate((tree) => {
        const s = __gib.getState();
        const hdg = (Math.atan2(tree[0] - s.x, tree[1] - s.y) * 180 / Math.PI + 360) % 360;
        __gib.look(hdg, 10);
        const r = __gib.inspect(); return r && { kind: r.kind, id: r.id, rec: r.rec };
      }, tree);
      check('E on a tree shows the prop record', insp && insp.kind === 'prop' && insp.rec?.kind === 'tree', `${insp?.kind} ${insp?.id} kind=${insp?.rec?.kind} model=${insp?.rec?.model}`);
      await page.evaluate(() => __gib.interact());
      await page.waitForTimeout(1500);
      await shot('12-inspect-tree');
      await page.evaluate(() => __gib.interact());
      const props = await page.evaluate(() => __gib.loadedTiles().filter((t) => t.layers.includes('props')).length);
      check('props layer streams as a detail layer', props > 0, `${props} tiles with props loaded`);
    }

    // ground height hook
    const gh = await page.evaluate(() => __gib.groundHeightAt(502.881, -158.716));
    check('groundHeightAt(Rock of Gibraltar peak) ≈ 403 m', gh != null && Math.abs(gh - 403) < 15, `${gh?.toFixed?.(2)} m (POI z 402.97)`);

    // ------------------------------------------------ views
    const view = async (name, x, y, h, pt, hour, hud = false) => {
      await page.evaluate(([hour, hud]) => { __gib.setTime(hour); __gib.showHud(hud); }, [hour, hud]);
      await goto(x, y, h, pt);
      const st = await state();
      results.perf[name] = { fps: +st.fps.toFixed(1), frameCpuMs: +st.frameMs.toFixed(1), drawCalls: st.calls, triangles: st.triangles };
      console.log(`      ${name}: x=${st.x.toFixed(1)} y=${st.y.toFixed(1)} feet=${st.z.toFixed(2)} ground=${st.groundKind} ${st.time} sun ${st.sunElevation.toFixed(1)}° fps=${st.fps.toFixed(1)} calls=${st.calls} tris=${st.triangles}`);
      await shot(name);
      return st;
    };
    await view('20-rock-from-harbour-west', -827, 1063, 100, 4, 15);
    const top = await view('21-top-of-rock-looking-north', 502.881, -158.716, 350, -6, 12);
    check('top of the Rock is ~400 m up', top.z > 380, `feet ${top.z.toFixed(1)} m`);
    await view('22-top-of-rock-looking-east-cliff', 502.881, -158.716, 80, -25, 12);
    await view('22b-upper-rock-douglas-lookout-looking-north', 409.2, 105.9, 345, -4, 12);
    await view('23-europa-point-lighthouse', 365.5, -2241.9, 100, 4, 11);
    await view('24-main-street', -327.5, 1140, 10, 2, 12, true);
    await view('25-night-main-street', -327.5, 1140, 10, 2, 23, true);
    await view('26-night-casemates', -246.942, 1648.743, 180, 4, 22);
    await page.evaluate(() => __gib.setConfidence(true));
    await view('27a-confidence-mode-street', -327.5, 1140, 10, 2, 12, true);
    await page.evaluate(() => __gib.viewFrom(-750, 1000, 140, 65, -14));
    await page.waitForTimeout(3000);
    await shot('27b-confidence-mode-town-elevated');
    await page.evaluate(() => { __gib.viewFrom(null); __gib.setConfidence(false); });
    await view('28-airport-runway-from-north-front', 300, 2400, 90, 0, 12);
    // aerial validation views (detached camera)
    await page.evaluate(() => { __gib.setTime(12); __gib.teleport(0, 700); });
    await waitReady();
    for (const [name, x, y, z, h, pt] of [['30-aerial-top-down-north-up', 0, 700, 7500, 0, -89.9], ['31-aerial-from-south', 300, -5500, 1800, 0, -18]]) {
      await page.evaluate(([x, y, z, h, pt]) => __gib.viewFrom(x, y, z, h, pt), [x, y, z, h, pt]);
      await page.waitForTimeout(2500);
      await shot(name);
    }
    await page.evaluate(() => __gib.viewFrom(null));

    const st = await state();
    results.perf.final = { fps: st.fps, geometries: st.geometries };
    results.perf.stats = await page.evaluate(() => __gib.stats());
  } finally {
    await browser.close();
    server.kill();
  }
  const errors = results.console.filter((l) => /^(error|pageerror)/.test(l));
  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  fs.writeFileSync(path.join(OUT, 'verify-summary.json'), JSON.stringify(results, null, 2));
  const failed = results.checks.filter((c) => !c.ok);
  console.log(`\n${results.checks.length - failed.length}/${results.checks.length} checks passed. Summary: ${path.join(OUT, 'verify-summary.json')}`);
  console.log('perf', JSON.stringify(results.perf));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

// Gibraltar 1:1 walking simulator — web validation viewer.
// Entry point: renderer, loop, input, interaction, debug hooks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TileManager } from './tiles.js';
import { Player } from './player.js';
import { Environment } from './sky.js';
import { Ambience } from './audio.js';
import { KIND } from './collision.js';
import { ltmToLonLat, ltmToThree, threeToLtm, tileIndexOf, tileId, headingToYaw, yawToHeading, cardinal } from './geo.js';
import { gibLocal, gibLocalToUtc, fmtLocal } from './sun.js';
import { Hud, Menu, store, loadSettings, poiPanel, buildingPanel, wallPanel } from './ui.js';

const params = new URLSearchParams(location.search);
const AUTOTEST = params.get('autotest') === '1';
const DATA = new URL('../data/build/', location.href).href;

const KIND_NAMES = ['terrain', 'cliff', 'road/path', 'wall', 'pier/quay', 'building wall', 'roof'];

function fatal(msg) {
  document.getElementById('fatal').classList.remove('hidden');
  document.getElementById('fatal-msg').textContent = String(msg);
  console.error(msg);
}

async function main() {
  const startStatus = document.getElementById('start-status');
  let manifest;
  try {
    const res = await fetch(DATA + 'manifest.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${DATA}manifest.json`);
    manifest = await res.json();
  } catch (e) {
    fatal(`Could not load the world description (manifest.json).\n${e.message}\n\n` +
      'Serve the gibraltar/ folder over HTTP (node gibraltar/web/serve.mjs) and open http://127.0.0.1:8080/web/');
    return;
  }
  const settings = loadSettings();
  const SEA = manifest.sea_level_m ?? 0;

  // ------------------------------------------------------------ renderer
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  } catch (e) {
    fatal('WebGL is not available in this browser.\n' + e.message);
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const applyPixelRatio = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.resScale);
  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.15, 30000);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  const env = new Environment(scene, manifest);
  env.setShadows(settings.shadows);
  const tiles = new TileManager(scene, manifest, DATA, { detailRadius: settings.renderDistance, shadows: settings.shadows });
  const world = tiles.collision;
  const player = new Player(world, tiles, SEA);
  const audio = new Ambience();
  audio.setVolume(settings.volume);
  const hud = new Hud();

  // ------------------------------------------------------------ POI markers
  const pois = manifest.pois;
  const markerGeo = (() => {
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6, 1);
    pole.translate(0, 1.2, 0);
    const head = new THREE.OctahedronGeometry(0.28, 0);
    head.translate(0, 2.65, 0);
    return mergeGeometries([pole.toNonIndexed(), head.index ? head.toNonIndexed() : head]);
  })();
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x222222 });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, pois.length);
  markers.name = 'poi-markers';
  const kindColor = (k) => {
    const c = k.split('=')[0];
    return { historic: '#f0b84a', tourism: '#4ab8f0', natural: '#6fd36f', leisure: '#9be07a', amenity: '#c792ea',
      place: '#ffffff', man_made: '#ff8a65', aeroway: '#90a4ae' }[c] || '#dddddd';
  };
  const poiY = pois.map((p) => p.position_m[2]);
  const mtx = new THREE.Matrix4();
  const placeMarker = (i) => {
    const p = pois[i];
    mtx.makeTranslation(p.position_m[0], poiY[i], -p.position_m[1]);
    markers.setMatrixAt(i, mtx);
  };
  pois.forEach((p, i) => { placeMarker(i); markers.setColorAt(i, new THREE.Color(kindColor(p.kind))); });
  markers.instanceMatrix.needsUpdate = true;
  markers.computeBoundingSphere();
  markers.castShadow = false;
  scene.add(markers);

  tiles.onColliderBuilt = (t) => {
    // Drop each POI marker onto the real surface nearest its recorded height.
    const o = t.meta.origin_m;
    let changed = false;
    pois.forEach((p, i) => {
      const [x, y, z] = p.position_m;
      if (x < o[0] || x >= o[0] + 500 || y < o[1] || y >= o[1] + 500) return;
      const s = world.surfaces(x, -y);
      if (!s.length) return;
      s.sort((a, b) => Math.abs(a.y - z) - Math.abs(b.y - z));
      poiY[i] = s[0].y; placeMarker(i); changed = true;
    });
    if (changed) { markers.instanceMatrix.needsUpdate = true; markers.computeBoundingSphere(); }
  };

  // ------------------------------------------------------------ time
  const today = gibLocal(Date.now());
  let gameUtc = gibLocalToUtc(today.year, today.month, today.day, 10);
  if (params.get('time')) gameUtc = gibLocalToUtc(today.year, today.month, today.day, Number(params.get('time')));
  let timeFlow = true;

  // ------------------------------------------------------------ start position
  const sp = manifest.spawn;
  player.spawn = { x: sp.position_m[0], y: sp.position_m[1], z: sp.position_m[2], heading: sp.heading_deg };
  const goSpawn = () => {
    player.teleport(sp.position_m[0], sp.position_m[1], sp.position_m[2]);
    player.yaw = headingToYaw(sp.heading_deg); player.pitch = 0;
  };
  if (params.get('pos')) {
    const [x, y] = params.get('pos').split(',').map(Number);
    player.teleport(x, y);
    player.yaw = headingToYaw(Number(params.get('heading') ?? sp.heading_deg));
  } else goSpawn();
  if (params.get('heading')) player.yaw = headingToYaw(Number(params.get('heading')));

  const posRecord = () => {
    const [x, y, z] = player.ltm;
    return { x, y, z, heading: yawToHeading(player.yaw), pitch: player.pitch, utc: gameUtc, crouched: player.crouched };
  };
  const applyRecord = (r) => {
    if (!r || !Number.isFinite(r.x)) return false;
    player.teleport(r.x, r.y, r.z);
    player.yaw = headingToYaw(r.heading || 0);
    player.pitch = r.pitch || 0;
    if (Number.isFinite(r.utc)) gameUtc = r.utc;
    return true;
  };

  // ------------------------------------------------------------ state
  let started = false, hudVisible = true, showPois = true, confidence = false;
  const input = { f: false, b: false, l: false, r: false, run: false, jump: false };
  let panelAnchor = null;
  let camOverride = null; // debug: detached camera { x, y, z, heading, pitch }

  // ------------------------------------------------------------ menu
  const menu = new Menu(settings, pois, manifest.attribution || [], {
    onResume: () => resume(),
    onSave: () => { hud.toast(store.set('position', posRecord()) ? 'Position saved' : 'Could not save (storage blocked)'); },
    onLoad: () => {
      const r = store.get('position') || store.get('autosave');
      if (applyRecord(r)) { hud.toast('Position loaded'); resume(); } else hud.toast('No saved position yet');
    },
    onSpawn: () => { goSpawn(); resume(); },
    onTeleport: (p) => {
      player.teleport(p.position_m[0], p.position_m[1], p.position_m[2]);
      hud.toast(`Teleporting to ${p.name}…`);
      resume();
    },
    onSettings: (s, key) => {
      if (key === 'renderDistance') tiles.setDetailRadius(s.renderDistance);
      if (key === 'shadows') { tiles.setShadows(s.shadows); env.setShadows(s.shadows); }
      if (key === 'resScale') applyPixelRatio();
      if (key === 'fov') { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      if (key === 'volume') audio.setVolume(s.volume);
    },
  });

  // ------------------------------------------------------------ start / pause
  const startEl = document.getElementById('start');
  const btnStart = document.getElementById('btn-start');
  const btnContinue = document.getElementById('btn-continue');
  startStatus.textContent = `World: ${manifest.tiles.length} tiles, ${manifest.stats?.buildings ?? '?'} buildings, ` +
    `${pois.length} places. Generated ${manifest.generated_utc}.`;
  if (store.get('autosave')) btnContinue.classList.remove('hidden');

  const lockPointer = () => {
    if (AUTOTEST) return;
    try {
      const r = canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* pointer lock unavailable: drag-to-look fallback */ }
  };
  const begin = () => {
    started = true;
    startEl.classList.add('hidden');
    hud.setVisible(hudVisible);
    audio.start();
    lockPointer();
  };
  const resume = () => {
    menu.hide();
    audio.start();
    lockPointer();
  };
  btnStart.addEventListener('click', begin);
  btnContinue.addEventListener('click', () => { applyRecord(store.get('autosave')); begin(); });
  document.addEventListener('pointerlockchange', () => {
    if (!started || AUTOTEST) return;
    if (document.pointerLockElement !== canvas && !menu.open) menu.show();
  });
  canvas.addEventListener('click', () => {
    if (started && !menu.open && document.pointerLockElement !== canvas) lockPointer();
  });
  if (AUTOTEST) begin();

  // ------------------------------------------------------------ input
  const keymap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const playing = () => started && !menu.open;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); hud.showInfo = !hud.showInfo; return; }
    if (e.code === 'Escape') {
      if (!started) return;
      if (menu.open) resume(); else if (document.pointerLockElement !== canvas) menu.show();
      return;
    }
    if (!playing()) return;
    if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
    if (e.repeat) return;
    switch (e.code) {
      case 'Space': input.jump = true; e.preventDefault(); break;
      case 'KeyC': player.crouched = !player.crouched; break;
      case 'KeyE': interact(); break;
      case 'KeyV': confidence = !confidence; tiles.setConfidenceMode(confidence);
        hud.legend.classList.toggle('hidden', !confidence);
        hud.toast(confidence ? 'Data-confidence view ON' : 'Data-confidence view OFF'); break;
      case 'KeyM': showPois = !showPois; markers.visible = showPois; hud.toast(showPois ? 'Place markers shown' : 'Place markers hidden'); break;
      case 'BracketLeft': gameUtc -= 3600e3; hud.toast('Time ' + fmtLocal(gameUtc)); break;
      case 'BracketRight': gameUtc += 3600e3; hud.toast('Time ' + fmtLocal(gameUtc)); break;
      case 'KeyT': timeFlow = !timeFlow; hud.toast(timeFlow ? `Clock running ×${settings.timeSpeed}` : 'Clock paused'); break;
      case 'KeyH': hudVisible = !hudVisible; hud.setVisible(hudVisible); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (keymap[e.code]) input[keymap[e.code]] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
  });
  window.addEventListener('blur', () => { input.f = input.b = input.l = input.r = input.run = false; });

  const look = (dx, dy) => {
    const k = 0.0022 * settings.sensitivity;
    player.yaw -= dx * k;
    player.pitch -= dy * k * (settings.invertY ? -1 : 1);
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
  };
  let dragging = false;
  document.addEventListener('mousemove', (e) => {
    if (!playing()) return;
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
    else if (dragging) look(e.movementX, e.movementY);
  });
  canvas.addEventListener('mousedown', () => { dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });

  // ------------------------------------------------------------ interaction
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const center = new THREE.Vector2(0, 0);

  function lookTarget() {
    raycaster.setFromCamera(center, camera);
    const [px, py] = player.ltm;
    const objs = tiles.meshesNear(px, py, 150, ['buildings', 'walls', 'terrain', 'roads']);
    if (showPois) objs.push(markers);
    const hits = raycaster.intersectObjects(objs, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object === markers) return { type: 'poi', poi: pois[h.instanceId], dist: h.distance, point: h.point };
    const L = h.object.userData.layer;
    if (L === 'buildings' || L === 'walls') {
      const fid = h.object.userData.fid ? Math.round(h.object.userData.fid[h.face.a]) : -1;
      const rec = tiles.featureFor(h.object.userData.tile, L, fid);
      return { type: L === 'buildings' ? 'building' : 'wall', rec, fid, tile: h.object.userData.tile, dist: h.distance, point: h.point };
    }
    return { type: 'ground', dist: h.distance, point: h.point };
  }

  function nearestPoi(maxDist) {
    const [px, py, pz] = player.ltm;
    let best = null, bd = maxDist;
    pois.forEach((p, i) => {
      const d = Math.hypot(p.position_m[0] - px, p.position_m[1] - py, (poiY[i] - pz) * 0.5);
      if (d < bd) { bd = d; best = p; }
    });
    return best ? { poi: best, dist: bd } : null;
  }

  function inspect() {
    const t = lookTarget();
    if (t && t.dist <= 60 && t.type === 'poi') return { kind: 'poi', poi: t.poi, dist: t.dist };
    if (t && t.dist <= 60 && t.type === 'building' && t.rec) return { kind: 'building', rec: t.rec, tile: t.tile, dist: t.dist };
    // a POI within 6 m of what we're looking at, or of the player
    if (t && t.point) {
      for (let i = 0; i < pois.length; i++) {
        const p = pois[i];
        if (Math.hypot(p.position_m[0] - t.point.x, -p.position_m[1] - t.point.z) < 6 && t.dist < 60) return { kind: 'poi', poi: p, dist: t.dist };
      }
    }
    const np = nearestPoi(6);
    if (np) return { kind: 'poi', poi: np.poi, dist: np.dist };
    const p = player.pos;
    const nb = world.nearestBuilding(p.x, p.y + 1.0, p.z, 6, [KIND.BWALL, KIND.BROOF]);
    if (nb && nb.fid >= 0) {
      const rec = tiles.featureFor(nb.collider.id, 'buildings', nb.fid);
      if (rec) return { kind: 'building', rec, tile: nb.collider.id, dist: nb.dist };
    }
    if (t && t.dist <= 60 && t.type === 'wall' && t.rec) return { kind: 'wall', rec: t.rec, tile: t.tile, dist: t.dist };
    return null;
  }

  function interact() {
    if (hud.panelOpen) { hud.hidePanel(); panelAnchor = null; return null; }
    const r = inspect();
    if (!r) { hud.toast('Nothing to inspect here — look at a building or a place marker'); return null; }
    if (r.kind === 'poi') hud.showPanel(poiPanel(r.poi, r.dist));
    else if (r.kind === 'building') hud.showPanel(buildingPanel(r.rec, r.tile, r.dist));
    else hud.showPanel(wallPanel(r.rec, r.tile, r.dist));
    panelAnchor = player.pos.clone();
    return r;
  }

  // ------------------------------------------------------------ sea distance (for audio)
  let seaDist = Infinity;
  function measureSeaDist() {
    const p = player.pos;
    for (const r of [10, 25, 50, 90, 150, 220, 300, 400]) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
        const [lx, ly] = threeToLtm(x, 0, z);
        if (!tiles.isReadyAt(lx, ly)) continue;
        const g = world.ground(x, z, Infinity);
        if (!g || g.y < SEA + 0.3) return r;
      }
    }
    return Infinity;
  }

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let fps = 0, frames = 0, fpsT = 0, hudT = 0, seaT = 0, autosaveT = 0, promptT = 0;
  let lastFrameMs = 0;

  function frame() {
    requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.25);
    const t0 = performance.now();
    frames++; fpsT += rawDt;
    if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }

    const [lx, ly] = player.ltm;
    tiles.update(lx, ly);

    if (playing() || (AUTOTEST && started)) player.update(dt, input);
    else player.update(0, input);
    if (camOverride) {
      const [X, Y, Z] = ltmToThree(camOverride.x, camOverride.y, camOverride.z);
      camera.position.set(X, Y, Z);
      camera.rotation.set(camOverride.pitch / 57.2958, headingToYaw(camOverride.heading), 0, 'YXZ');
    } else player.applyToCamera(camera);

    if (timeFlow && settings.timeSpeed > 0 && !menu.open) gameUtc += dt * 1000 * settings.timeSpeed;
    env.update(gameUtc, camera, player.pos, dt);

    if (panelAnchor && player.pos.distanceTo(panelAnchor) > 20) { hud.hidePanel(); panelAnchor = null; }

    seaT -= dt;
    if (seaT <= 0) { seaDist = measureSeaDist(); seaT = 1; }
    audio.update({ seaDist, altitude: player.pos.y, sunElev: env.sun.elevation, paused: menu.open || !started });

    hudT -= dt;
    if (hudT <= 0 && hudVisible) { updateHud(); hudT = 0.1; }
    hud.setCompass(yawToHeading(player.yaw));

    promptT -= dt;
    if (promptT <= 0 && started) {
      promptT = 0.25;
      const t = lookTarget();
      let txt = '';
      if (t && t.dist <= 60) {
        if (t.type === 'poi') txt = `E — ${t.poi.name}`;
        else if (t.type === 'building' && t.rec) txt = `E — ${t.rec.name || 'building'} (${t.rec.confidence})`;
      }
      hud.prompt.textContent = txt;
    }

    autosaveT += dt;
    if (autosaveT > 30 && started && !player.waiting) { autosaveT = 0; store.set('autosave', posRecord()); }

    renderer.render(scene, camera);
    lastFrameMs = performance.now() - t0;
  }

  function updateHud() {
    const [x, y, z] = player.ltm;
    const [lon, lat] = ltmToLonLat(x, y);
    const [ix, iy] = tileIndexOf(x, y);
    const hdg = yawToHeading(player.yaw);
    const g = player.ground;
    const sp = player.measuredSpeed;
    const loaded = tiles.loadedTiles();
    const nLoading = tiles.loadingCount();
    hud.setLoading(nLoading + (player.waiting ? 1 : 0));
    const lines = [
      `GIB-LTM   x ${x.toFixed(2).padStart(9)} m   y ${y.toFixed(2).padStart(9)} m`,
      `WGS84     ${Math.abs(lat).toFixed(6)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(6)}°${lon >= 0 ? 'E' : 'W'}`,
      `Elevation ${z.toFixed(2)} m  (eye ${(z + player.eye).toFixed(2)} m)`,
      `Ground    ${g ? g.y.toFixed(2) + ' m  ' + KIND_NAMES[g.kind] : player.waiting ? 'loading…' : '—'}${player.sliding ? '  (too steep — sliding)' : ''}`,
      `Tile      ${tileId(ix, iy)}`,
      `Heading   ${hdg.toFixed(0).padStart(3)}° ${cardinal(hdg).padEnd(3)}  pitch ${(player.pitch * 57.2958).toFixed(0)}°`,
      `Speed     ${sp.toFixed(2)} m/s (${(sp * 3.6).toFixed(1)} km/h)${player.crouched ? '  crouched' : ''}`,
      `Time      ${fmtLocal(gameUtc)}  ${timeFlow && settings.timeSpeed ? '×' + settings.timeSpeed : 'paused'}`,
      `Sun       elev ${env.sun.elevation.toFixed(1)}°  az ${env.sun.azimuth.toFixed(0)}°`,
      `FPS       ${fps.toFixed(0)}  (${lastFrameMs.toFixed(1)} ms)  tiles ${loaded.length}${nLoading ? `, loading ${nLoading}` : ''}`,
    ];
    hud.setInfo(lines.join('\n'));
    const np = nearestPoi(Infinity);
    if (np) {
      const p = np.poi;
      const brg = (Math.atan2(p.position_m[0] - x, p.position_m[1] - y) * 57.2958 + 360) % 360;
      const d = Math.hypot(p.position_m[0] - x, p.position_m[1] - y);
      hud.poiNear.textContent = `Nearest place: ${p.name} — ${d < 1000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(2) + ' km'} ${cardinal(brg)}`;
    }
  }

  // ------------------------------------------------------------ debug / test hooks
  window.__gib = {
    getState() {
      const [x, y, z] = player.ltm;
      const [lon, lat] = ltmToLonLat(x, y);
      const [ix, iy] = tileIndexOf(x, y);
      const g = player.ground;
      return {
        x, y, z, eyeZ: z + player.eye, eye: player.eye, lon, lat,
        ground: g ? g.y : null, groundKind: g ? KIND_NAMES[g.kind] : null,
        tile: tileId(ix, iy), heading: yawToHeading(player.yaw), pitchDeg: player.pitch * 57.2958,
        speed: player.measuredSpeed, vel: [player.vel.x, player.vel.y, player.vel.z],
        grounded: player.grounded, sliding: player.sliding, blocked: player.blockedLast,
        waiting: !!player.waiting, crouched: player.crouched,
        simTime: player.simTime, distance: player.distance,
        fps, frameMs: lastFrameMs, time: fmtLocal(gameUtc), utc: gameUtc,
        sunElevation: env.sun.elevation, sunAzimuth: env.sun.azimuth,
        loading: tiles.loadingCount(), colliders: world.colliders.size,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
      };
    },
    teleport(x, y, z = null) { player.teleport(x, y, z); },
    setTime(h) {
      const l = gibLocal(gameUtc);
      gameUtc = gibLocalToUtc(l.year, l.month, l.day, h);
      return fmtLocal(gameUtc);
    },
    setTimeFlow(on) { timeFlow = !!on; },
    loadedTiles: () => tiles.loadedTiles(),
    groundHeightAt(x, y) {
      const [X, , Z] = ltmToThree(x, y, 0);
      tiles.ensureColliderAt(x, y);
      const g = world.ground(X, Z, Infinity, (k) => k !== KIND.BROOF);
      return g ? g.y : null;
    },
    /** Debug: detach the camera to GIB-LTM (x, y, z) looking at heading/pitch; viewFrom(null) re-attaches. */
    viewFrom(x, y, z, heading = 0, pitch = 0) { camOverride = x == null ? null : { x, y, z, heading, pitch }; },
    look(headingDeg, pitchDeg = 0) { player.yaw = headingToYaw(headingDeg); player.pitch = pitchDeg / 57.2958; },
    setInput(o) { Object.assign(input, o); },
    /**
     * Deterministic physics run without rendering: steps the player at 60 Hz for `seconds`
     * with the given input ({f,b,l,r,run,jump}). Returns a trace summary.
     */
    simulate(seconds, inp = {}, sampleEvery = 0.5) {
      const local = { f: false, b: false, l: false, r: false, run: false, jump: false, ...inp };
      const h = 1 / 60, n = Math.round(seconds / h);
      const [sx, sy, sz] = player.ltm;
      const samples = [];
      let maxGap = 0, blockedSteps = 0, airborne = 0;
      for (let i = 0; i < n; i++) {
        if (i % 30 === 0) { const [lx, ly] = player.ltm; tiles.update(lx, ly); }
        player.update(h, local);
        if (player.ground) maxGap = Math.max(maxGap, Math.abs(player.pos.y - player.ground.y) * (player.grounded ? 1 : 0));
        if (player.blockedLast) blockedSteps++;
        if (!player.grounded) airborne++;
        if ((i + 1) % Math.round(sampleEvery / h) === 0) {
          const [x, y, z] = player.ltm;
          samples.push({ t: +((i + 1) * h).toFixed(2), x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3),
            ground: player.ground ? +player.ground.y.toFixed(3) : null, kind: player.ground ? KIND_NAMES[player.ground.kind] : null,
            grounded: player.grounded, blocked: player.blockedLast, sliding: player.sliding });
        }
      }
      const [ex, ey, ez] = player.ltm;
      return { start: [sx, sy, sz], end: [ex, ey, ez], dist: Math.hypot(ex - sx, ey - sy), seconds: n * h,
        maxGroundGap: maxGap, blockedSteps, airborneSteps: airborne, samples };
    },
    crouch(on) { player.crouched = !!on; },
    setConfidence(on) { confidence = !!on; tiles.setConfidenceMode(confidence); hud.legend.classList.toggle('hidden', !confidence); },
    showHud(on) { hudVisible = !!on; hud.setVisible(hudVisible); },
    inspect() {
      const r = inspect();
      if (!r) return null;
      return { kind: r.kind, dist: r.dist, id: (r.poi || r.rec)?.id, name: (r.poi || r.rec)?.name, rec: r.rec || r.poi };
    },
    interact: () => { const r = interact(); return r ? r.kind : null; },
    /** Debug: what is under screen point (ndcX, ndcY in -1..1)? */
    pick(nx, ny) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const far = raycaster.far; raycaster.far = 20000;
      const objs = [];
      for (const t of tiles.tiles.values()) for (const L of Object.values(t.layers)) for (const m of L.meshes || []) objs.push(m);
      const hits = raycaster.intersectObjects(objs, false);
      raycaster.far = far;
      if (!hits.length) return null;
      const h = hits[0], u = h.object.userData;
      const fid = u.fid ? Math.round(u.fid[h.face.a]) : -1;
      const [x, y, z] = threeToLtm(h.point.x, h.point.y, h.point.z);
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      const eyeDir = raycaster.ray.direction;
      return { tile: u.tile, layer: u.layer, mat: u.matName, fid, rec: tiles.featureFor(u.tile, u.layer, fid),
        x, y, z, dist: h.distance, normal: [n.x, n.y, n.z], frontFacing: n.dot(eyeDir) < 0 };
    },
    ready() {
      return !player.waiting && tiles.loadingCount() === 0;
    },
    stats: () => ({ ...tiles.stats }),
    THREE, scene, camera, renderer, player, tiles, world,
  };

  frame();
}

main().catch((e) => fatal(e.stack || e));

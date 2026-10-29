// Tile streaming: loads/unloads tile layers around the player, shares one
// material per glTF material name, builds collision for nearby tiles, and
// handles the "data confidence" recolouring of buildings and walls.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TileCollider, CollisionWorld, kindFor } from './collision.js';
import { tileIndexOf, tileId } from './geo.js';

// Every layer except terrain streams at the detail radius (roads, buildings, walls, props, and
// any layer a future pipeline adds).
// Props that the player bumps into. Everything else (and every tree crown, M_Foliage) is walk-through.
const COSMETIC = new Set(['M_Window', 'M_Door']);
// Layers that take part in collision. Anything else (facades, or a layer a future pipeline
// adds) is loaded as a visual-only detail layer.
const COLLISION_LAYERS = new Set(['terrain', 'roads', 'buildings', 'walls', 'props']);
const FACADE_RADIUS = 600; // ~290k window quads: stream them close
// features.json array that a layer's _FEATURE_ID indexes
const FEATURE_KEY = { buildings: 'buildings', facades: 'buildings', walls: 'walls', props: 'props', roads: 'roads' };
const RECOLOR_LAYERS = ['buildings', 'walls', 'facades'];
const SOLID_PROPS = new Set(['tree', 'bench', 'picnic_table', 'memorial', 'telephone', 'post_box', 'cannon',
  'bus_stop', 'fountain', 'mast', 'flagpole', 'street_lamp', 'bollard', 'info_board', 'recycling']);
const HYSTERESIS = 200;      // m: unload only once this far beyond the load radius
const COLLISION_RADIUS = 350; // m from the tile rectangle
const MAX_CONCURRENT = 4;

// Data-confidence colours (sRGB, converted to linear for the vertex buffer)
const CONF_COLORS = {
  measured: new THREE.Color('#33cc44'),
  derived: new THREE.Color('#f2b01e'),
  estimated: new THREE.Color('#d9473a'),
  none: new THREE.Color('#8a8f96'),
};

export function createMaterials() {
  const mk = (name, roughness, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness, metalness: 0, ...extra });
    return m;
  };
  return {
    M_Terrain: mk('M_Terrain', 0.97),
    M_Cliff: mk('M_Cliff', 0.92),
    M_Road: mk('M_Road', 0.88, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    M_Path: mk('M_Path', 0.9, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    M_Steps: mk('M_Steps', 0.85, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    M_BuildingWall: mk('M_BuildingWall', 0.85),
    M_BuildingRoof: mk('M_BuildingRoof', 0.9),
    M_Wall: mk('M_Wall', 0.92),
    M_Prop: mk('M_Prop', 0.7),
    M_Foliage: mk('M_Foliage', 0.9),
    // cosmetic façade detail (quads a few cm in front of the walls): never collides
    M_Window: mk('M_Window', 0.1, { metalness: 0.25, envMapIntensity: 1.0 }),
    M_Door: mk('M_Door', 0.6),
    default: mk('default', 0.9), // any material name we don't know yet: generic vertex-colour
  };
}

export class TileManager {
  constructor(scene, manifest, baseUrl, opts = {}) {
    this.scene = scene;
    this.manifest = manifest;
    this.base = baseUrl; // URL of data/build/
    this.materials = createMaterials();
    this.loader = new GLTFLoader();
    this.collision = new CollisionWorld();
    this.detailRadius = opts.detailRadius ?? 1200;
    this.terrainRadius = Math.max(3000, this.detailRadius + 600);
    this.shadows = opts.shadows ?? true;
    this.confidenceMode = false;
    this.inflight = 0;
    this.onColliderBuilt = null;
    this.stats = { loadedBytes: 0, loads: 0, unloads: 0, colliderMs: 0 };

    this.tiles = new Map();
    for (const meta of manifest.tiles) {
      const group = new THREE.Group();
      group.name = meta.id;
      group.position.set(meta.origin_m[0], 0, -meta.origin_m[1]);
      group.matrixAutoUpdate = false;
      group.updateMatrix();
      scene.add(group);
      this.tiles.set(meta.id, {
        meta, group, layers: {}, features: null, featuresState: 'none',
        collider: null, colliderSig: '', dist: Infinity,
      });
    }
  }

  setDetailRadius(r) {
    this.detailRadius = r;
    this.terrainRadius = Math.max(3000, r + 600);
  }

  setShadows(on) {
    this.shadows = on;
    for (const t of this.tiles.values())
      for (const L of Object.values(t.layers))
        for (const m of L.meshes || []) { m.castShadow = on && !m.userData.cosmetic; m.receiveShadow = on; }
  }

  tileAt(x, y) {
    const [ix, iy] = tileIndexOf(x, y);
    return this.tiles.get(tileId(ix, iy)) || null;
  }

  /** Is collision ready for walking at GIB-LTM (x, y)? Open-sea tiles (not in manifest) count as ready. */
  isReadyAt(x, y) {
    const t = this.tileAt(x, y);
    return !t || !!t.collider;
  }

  loadingCount() {
    let n = 0;
    for (const t of this.tiles.values()) for (const L of Object.values(t.layers)) if (L.state === 'loading') n++;
    return n + (this.queueLen || 0);
  }

  loadedTiles() {
    const out = [];
    for (const t of this.tiles.values()) {
      const layers = Object.entries(t.layers).filter(([, L]) => L.state === 'loaded').map(([k]) => k);
      if (layers.length) out.push({ id: t.meta.id, layers, collider: !!t.collider, dist: Math.round(t.dist) });
    }
    return out;
  }

  // ----------------------------------------------------------------- streaming
  update(px, py) {
    const queue = [];
    for (const t of this.tiles.values()) {
      const o = t.meta.origin_m;
      const dx = Math.max(o[0] - px, 0, px - (o[0] + 500));
      const dy = Math.max(o[1] - py, 0, py - (o[1] + 500));
      const d = Math.hypot(dx, dy);
      t.dist = d;
      for (const layer of Object.keys(t.meta.layers)) {
        const R = this.radiusFor(layer);
        const L = t.layers[layer];
        let state = L ? L.state : 'none';
        // failed loads (e.g. a build being reinstalled) are retried with backoff
        if (state === 'error' && L.tries < 6 && performance.now() > L.retryAt) state = 'none';
        if (d <= R && state === 'none') queue.push({ t, layer, prio: d + (layer === 'terrain' ? 0 : 60) });
        else if (d > R + HYSTERESIS && (state === 'loaded' || state === 'loading')) this._unloadLayer(t, layer);
      }
      // features.json travels with the detail layers
      if (t.featuresState === 'error' && (t.featTries || 0) < 6 && performance.now() > (t.featRetryAt || 0)) t.featuresState = 'none';
      if (d <= this.detailRadius && t.featuresState === 'none') queue.push({ t, layer: 'features', prio: d + 30 });
      else if (d > this.detailRadius + HYSTERESIS && t.featuresState === 'loaded') { t.features = null; t.featuresState = 'none'; }

      // collision
      if (t.collider && d > COLLISION_RADIUS + 150) {
        this.collision.remove(t.meta.id);
        t.collider = null; t.colliderSig = '';
      }
    }
    queue.sort((a, b) => a.prio - b.prio);
    this.queueLen = queue.length;
    while (this.inflight < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      this.queueLen = queue.length;
      if (job.layer === 'features') this._loadFeatures(job.t);
      else this._loadLayer(job.t, job.layer);
    }
    this._buildOneCollider();
  }

  radiusFor(layer) {
    if (layer === 'terrain') return this.terrainRadius;
    if (layer === 'facades') return Math.min(FACADE_RADIUS, this.detailRadius);
    return this.detailRadius;
  }

  _collisionSig(t) {
    return Object.keys(t.layers).filter((k) => COLLISION_LAYERS.has(k) && t.layers[k].state === 'loaded').sort().join(',');
  }

  _complete(t) {
    // 'error' counts as done so a broken file can't block walking forever
    for (const layer of Object.keys(t.meta.layers)) {
      if (!COLLISION_LAYERS.has(layer)) continue;
      const s = t.layers[layer]?.state;
      if (s !== 'loaded' && s !== 'error') return false;
    }
    // prop collision needs the prop kinds from features.json
    if (t.meta.layers.props && t.featuresState !== 'loaded' && t.featuresState !== 'error') return false;
    return true;
  }

  // Builds at most one collider per call (they take ~5–30 ms each), nearest first.
  _buildOneCollider(force = null) {
    let best = null;
    for (const t of this.tiles.values()) {
      if (t.dist > COLLISION_RADIUS) continue;
      if (!this._complete(t)) continue;
      if (t.collider && t.colliderSig === this._collisionSig(t)) continue;
      if (!best || t.dist < best.dist) best = t;
    }
    if (force) best = force;
    if (!best) return false;
    this.buildCollider(best);
    return true;
  }

  buildCollider(t) {
    const t0 = performance.now();
    const parts = [];
    const v = new THREE.Vector3();
    for (const [layer, L] of Object.entries(t.layers)) {
      if (L.state !== 'loaded' || !COLLISION_LAYERS.has(layer)) continue;
      for (const m of L.meshes) {
        if (m.userData.cosmetic) continue; // windows / doors: walls already block
        m.updateWorldMatrix(true, false);
        const src = m.geometry.attributes.position;
        const pos = new Float32Array(src.count * 3);
        for (let i = 0; i < src.count; i++) {
          v.fromBufferAttribute(src, i).applyMatrix4(m.matrixWorld);
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        }
        let index = m.geometry.index ? m.geometry.index.array : null;
        if (layer === 'props') {
          // only solid furniture and tree trunks collide; crowns (M_Foliage) never do
          if (m.userData.matName !== 'M_Prop' || !m.userData.fid) continue;
          const recs = t.features?.props || [];
          const fid = m.userData.fid;
          const src = index || Array.from({ length: pos.length / 3 }, (_, i) => i);
          const keep = [];
          for (let k = 0; k < src.length; k += 3) {
            const rec = recs[Math.round(fid[src[k]])];
            if (rec && SOLID_PROPS.has(rec.kind)) keep.push(src[k], src[k + 1], src[k + 2]);
          }
          if (!keep.length) continue;
          index = Uint32Array.from(keep);
        }
        parts.push({ pos, index, kind: kindFor(layer, m.userData.matName), fid: m.userData.fid || null });
      }
    }
    const c = new TileCollider(t.meta.id, parts);
    t.collider = c;
    t.colliderSig = this._collisionSig(t);
    this.collision.add(c);
    this.stats.colliderMs = performance.now() - t0;
    if (this.onColliderBuilt) this.onColliderBuilt(t);
    return c;
  }

  /** Force-build colliders for the tile containing (x, y) if all its layers are loaded. */
  ensureColliderAt(x, y) {
    const t = this.tileAt(x, y);
    if (!t || t.collider) return !!t?.collider || !t;
    if (!this._complete(t)) return false;
    this.buildCollider(t);
    return true;
  }

  async _loadFeatures(t) {
    t.featuresState = 'loading';
    this.inflight++;
    try {
      const res = await fetch(this.base + t.meta.features);
      if (!res.ok) throw new Error(`${res.status} ${t.meta.features}`);
      const json = await res.json();
      if (t.featuresState !== 'loading') return; // unloaded meanwhile
      t.features = json;
      t.featuresState = 'loaded';
      if (this.confidenceMode) this._applyConfidence(t);
    } catch (e) {
      console.warn('features load failed (will retry)', t.meta.id, e.message);
      t.featuresState = 'error';
      t.featTries = (t.featTries || 0) + 1;
      t.featRetryAt = performance.now() + 2000 * 2 ** t.featTries;
    } finally {
      this.inflight--;
    }
  }

  async _loadLayer(t, layer) {
    const info = t.meta.layers[layer];
    const L = { state: 'loading', meshes: [], tries: t.layers[layer]?.tries || 0, retryAt: 0 };
    t.layers[layer] = L;
    this.inflight++;
    try {
      const res = await fetch(this.base + info.file);
      if (!res.ok) throw new Error(`${res.status} ${info.file}`);
      const buf = await res.arrayBuffer();
      this.stats.loadedBytes += buf.byteLength;
      const gltf = await this.loader.parseAsync(buf, '');
      if (t.layers[layer] !== L || L.state !== 'loading') { disposeObject(gltf.scene); return; }
      const meshes = [];
      gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) {
        const name = m.material?.name || 'default';
        if (m.material) m.material.dispose();
        m.material = this.materials[name] || this.materials.default;
        m.userData.matName = name;
        m.userData.layer = layer;
        m.userData.tile = t.meta.id;
        const g = m.geometry;
        const fa = g.attributes._feature_id;
        if (fa) { m.userData.fid = fa.array; g.deleteAttribute('_feature_id'); }
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const cosmetic = COSMETIC.has(name);
        m.castShadow = this.shadows && !cosmetic;
        m.receiveShadow = this.shadows;
        m.userData.cosmetic = cosmetic;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        if (!g.attributes.color) {
          // vertex-coloured materials need a colour attribute; default to white
          const white = new Uint8Array(g.attributes.position.count * 4).fill(255);
          g.setAttribute('color', new THREE.BufferAttribute(white, 4, true));
        }
        if (RECOLOR_LAYERS.includes(layer)) m.userData.colorOrig = g.attributes.color;
        // detach from glTF hierarchy (identity transforms in our files), attach to tile group
        m.removeFromParent();
        t.group.add(m);
      }
      L.meshes = meshes;
      L.state = 'loaded';
      t.group.updateMatrixWorld(true);
      this.stats.loads++;
      if (this.confidenceMode && t.features) this._applyConfidence(t);
    } catch (e) {
      console.warn('tile load failed (will retry)', t.meta.id, layer, e.message);
      L.state = 'error';
      L.tries++;
      L.retryAt = performance.now() + 2000 * 2 ** L.tries;
    } finally {
      this.inflight--;
    }
  }

  _unloadLayer(t, layer) {
    const L = t.layers[layer];
    if (!L) return;
    for (const m of L.meshes || []) {
      m.removeFromParent();
      // make sure both colour buffers (original + confidence) are freed on the GPU
      const g = m.geometry, u = m.userData;
      if (u.colorConf && u.colorOrig) g.setAttribute('_colorAlt', g.attributes.color === u.colorConf ? u.colorOrig : u.colorConf);
      g.dispose();
      u.colorConf = null; u.colorOrig = null; u.fid = null;
    }
    L.meshes = [];
    L.state = 'none';
    delete t.layers[layer];
    this.stats.unloads++;
    if (t.collider && COLLISION_LAYERS.has(layer)) { this.collision.remove(t.meta.id); t.collider = null; t.colliderSig = ''; }
  }

  // ----------------------------------------------------------------- confidence view
  setConfidenceMode(on) {
    this.confidenceMode = on;
    for (const t of this.tiles.values()) {
      if (on) { if (t.features) this._applyConfidence(t); }
      else this._restoreColors(t);
    }
  }

  _applyConfidence(t) {
    for (const layer of RECOLOR_LAYERS) {
      const L = t.layers[layer];
      if (!L || L.state !== 'loaded') continue;
      const recs = t.features?.[FEATURE_KEY[layer]];
      if (!recs) continue;
      for (const m of L.meshes) {
        const g = m.geometry;
        if (!m.userData.colorConf) {
          const orig = m.userData.colorOrig;
          const fid = m.userData.fid;
          if (!orig || !fid) continue;
          const n = orig.count;
          const arr = new Uint8Array(n * 4);
          for (let i = 0; i < n; i++) {
            const rec = recs[Math.round(fid[i])];
            const col = CONF_COLORS[rec?.confidence] || CONF_COLORS.none;
            // getX/Y/Z de-normalise, so this works for uint8 RGBA and float RGB alike
            const lum = 0.3 * orig.getX(i) + 0.59 * orig.getY(i) + 0.11 * orig.getZ(i);
            const shade = Math.min(1.15, Math.max(0.65, 0.55 + lum));
            arr[i * 4] = Math.min(255, col.r * shade * 255);
            arr[i * 4 + 1] = Math.min(255, col.g * shade * 255);
            arr[i * 4 + 2] = Math.min(255, col.b * shade * 255);
            arr[i * 4 + 3] = 255;
          }
          m.userData.colorConf = new THREE.BufferAttribute(arr, 4, true);
        }
        g.setAttribute('color', m.userData.colorConf);
      }
    }
  }

  _restoreColors(t) {
    for (const layer of RECOLOR_LAYERS) {
      const L = t.layers[layer];
      if (!L) continue;
      for (const m of L.meshes) if (m.userData.colorOrig) m.geometry.setAttribute('color', m.userData.colorOrig);
    }
  }

  // ----------------------------------------------------------------- picking
  /** Meshes of the given layers in tiles within `range` m (for raycasting). */
  meshesNear(px, py, range, layers) {
    const out = [];
    for (const t of this.tiles.values()) {
      if (t.dist > range) continue;
      for (const layer of layers) for (const m of t.layers[layer]?.meshes || []) out.push(m);
    }
    return out;
  }

  featureFor(tileIdStr, layer, fid) {
    const t = this.tiles.get(tileIdStr);
    if (!t || !t.features || fid < 0) return null;
    return t.features[FEATURE_KEY[layer] || layer]?.[fid] || null;
  }
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

// Collision against the real tile geometry, without any third-party BVH.
//
// For every tile near the player we copy its triangles (in three.js world
// coordinates: X east, Y up, Z south) into flat typed arrays and bucket them
// into a uniform 2-D grid over the ground plane (X/Z), stored CSR-style:
//
//   surface grid  — every triangle that is not vertical. Answers "what is
//                   under / over this point?" with an exact 2-D point-in-
//                   triangle test and barycentric height.
//   wall grid     — steep triangles of buildings, walls and sea cliffs.
//                   Answers "does a sphere at this point touch a wall?"
//
// Queries only ever look at the 1–4 cells around the player, so the cost is
// a few dozen triangle tests per query no matter how big the world is.

export const KIND = {
  TERRAIN: 0,   // M_Terrain — slope limit applies
  CLIFF: 1,     // M_Cliff — coastal skirts
  ROAD: 2,      // M_Road / M_Path / M_Steps in roads.glb — always walkable
  WALL: 3,      // M_Wall in walls.glb
  DECK: 4,      // M_Path in walls.glb (pier / quay decks)
  BWALL: 5,     // M_BuildingWall
  BROOF: 6,     // M_BuildingRoof
  PROP: 7,      // M_Prop in props.glb (tree trunks, benches, kiosks…) — bumps into, never stood on
};

export function kindFor(layer, materialName) {
  switch (materialName) {
    case 'M_Terrain': return KIND.TERRAIN;
    case 'M_Cliff': return KIND.CLIFF;
    case 'M_BuildingWall': return KIND.BWALL;
    case 'M_BuildingRoof': return KIND.BROOF;
    case 'M_Wall': return KIND.WALL;
    case 'M_Prop': return KIND.PROP;
    case 'M_Foliage': return layer === 'walls' ? KIND.WALL : KIND.PROP; // hedges are walls
    default:
      if (layer === 'props') return KIND.PROP;
      if (layer === 'walls') return KIND.DECK;
      if (layer === 'buildings') return KIND.BWALL;
      if (layer === 'terrain') return KIND.TERRAIN;
      return KIND.ROAD;
  }
}

const CELL = 4; // metres
const SURFACE_MIN_NY = 0.12;   // |n.y| above this: a surface you can stand on (< ~83°)
const WALL_MAX_NY = 0.7;       // |n.y| below this: a wall you bump into (> ~45°)

export class TileCollider {
  /**
   * @param {string} id
   * @param {Array<{pos: Float32Array, index: Uint32Array|Uint16Array|null, kind: number, fid: Float32Array|null}>} parts
   *        positions already in world coordinates
   */
  constructor(id, parts) {
    this.id = id;
    let n = 0;
    for (const p of parts) n += (p.index ? p.index.length : p.pos.length / 3) / 3;
    const tri = new Float32Array(n * 9);
    const nrm = new Float32Array(n * 3); // unit normal, oriented to face up (ny >= 0)
    const kind = new Uint8Array(n);
    const fid = new Int32Array(n);
    let t = 0;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of parts) {
      const P = p.pos, I = p.index;
      const cnt = (I ? I.length : P.length / 3) / 3;
      for (let k = 0; k < cnt; k++) {
        const a = I ? I[k * 3] : k * 3, b = I ? I[k * 3 + 1] : k * 3 + 1, c = I ? I[k * 3 + 2] : k * 3 + 2;
        const o = t * 9;
        tri[o] = P[a * 3]; tri[o + 1] = P[a * 3 + 1]; tri[o + 2] = P[a * 3 + 2];
        tri[o + 3] = P[b * 3]; tri[o + 4] = P[b * 3 + 1]; tri[o + 5] = P[b * 3 + 2];
        tri[o + 6] = P[c * 3]; tri[o + 7] = P[c * 3 + 1]; tri[o + 8] = P[c * 3 + 2];
        const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
        const vx = tri[o + 6] - tri[o], vy = tri[o + 7] - tri[o + 1], vz = tri[o + 8] - tri[o + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue; // degenerate
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        nrm[t * 3] = nx / len; nrm[t * 3 + 1] = ny / len; nrm[t * 3 + 2] = nz / len;
        kind[t] = p.kind;
        fid[t] = p.fid ? Math.round(p.fid[a]) : -1;
        for (let j = 0; j < 3; j++) {
          const x = tri[o + j * 3], z = tri[o + j * 3 + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        t++;
      }
    }
    this.count = t;
    this.tri = tri; this.nrm = nrm; this.kind = kind; this.fid = fid;
    this.minX = minX; this.minZ = minZ; this.maxX = maxX; this.maxZ = maxZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
    this.stamp = new Uint32Array(t);
    this.stampId = 1;
    this.surface = this._grid((i) => this.nrm[i * 3 + 1] > SURFACE_MIN_NY && this.kind[i] !== KIND.PROP);
    this.walls = this._grid((i) => {
      const k = this.kind[i];
      return k === KIND.PROP || (this.nrm[i * 3 + 1] < WALL_MAX_NY &&
        (k === KIND.BWALL || k === KIND.WALL || k === KIND.CLIFF || k === KIND.DECK || k === KIND.BROOF));
    });
  }

  _cellRange(i) {
    const o = i * 9, tri = this.tri;
    const x0 = Math.min(tri[o], tri[o + 3], tri[o + 6]), x1 = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const z0 = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), z1 = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    return [
      Math.floor((x0 - this.minX) / CELL), Math.floor((x1 - this.minX) / CELL),
      Math.floor((z0 - this.minZ) / CELL), Math.floor((z1 - this.minZ) / CELL),
    ];
  }

  _grid(accept) {
    const ncell = this.nx * this.nz;
    const counts = new Uint32Array(ncell + 1);
    const ranges = [];
    for (let i = 0; i < this.count; i++) {
      if (!accept(i)) continue;
      const r = this._cellRange(i);
      ranges.push(i, r[0], r[1], r[2], r[3]);
      for (let cz = r[2]; cz <= r[3]; cz++)
        for (let cx = r[0]; cx <= r[1]; cx++) counts[cz * this.nx + cx + 1]++;
    }
    for (let c = 0; c < ncell; c++) counts[c + 1] += counts[c];
    const items = new Uint32Array(counts[ncell]);
    const fill = counts.slice(0, ncell);
    for (let k = 0; k < ranges.length; k += 5) {
      const i = ranges[k];
      for (let cz = ranges[k + 3]; cz <= ranges[k + 4]; cz++)
        for (let cx = ranges[k + 1]; cx <= ranges[k + 2]; cx++) items[fill[cz * this.nx + cx]++] = i;
    }
    return { start: counts, items };
  }

  contains(x, z, pad = 0) {
    return x >= this.minX - pad && x <= this.maxX + pad && z >= this.minZ - pad && z <= this.maxZ + pad;
  }

  /** Calls fn(y, triIndex) for every non-vertical triangle directly above/below (x, z). */
  surfacesAt(x, z, fn) {
    const cx = Math.floor((x - this.minX) / CELL), cz = Math.floor((z - this.minZ) / CELL);
    if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) return;
    const g = this.surface, c = cz * this.nx + cx, tri = this.tri;
    for (let k = g.start[c], e = g.start[c + 1]; k < e; k++) {
      const i = g.items[k], o = i * 9;
      const ax = tri[o], az = tri[o + 2], bx = tri[o + 3], bz = tri[o + 5], qx = tri[o + 6], qz = tri[o + 8];
      const d = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / d;
      const l2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / d;
      const l3 = 1 - l1 - l2;
      const eps = -1e-6;
      if (l1 < eps || l2 < eps || l3 < eps) continue;
      fn(l1 * tri[o + 1] + l2 * tri[o + 4] + l3 * tri[o + 7], i);
    }
  }

  /**
   * Pushes a sphere out of steep triangles. Accumulates a horizontal push into out[0], out[1].
   * Returns number of contacts.
   */
  pushSphere(cx, cy, cz, r, out, stamp) {
    const g = this.walls, tri = this.tri;
    const x0 = Math.max(0, Math.floor((cx - r - this.minX) / CELL)), x1 = Math.min(this.nx - 1, Math.floor((cx + r - this.minX) / CELL));
    const z0 = Math.max(0, Math.floor((cz - r - this.minZ) / CELL)), z1 = Math.min(this.nz - 1, Math.floor((cz + r - this.minZ) / CELL));
    let hits = 0;
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const c = gz * this.nx + gx;
      for (let k = g.start[c], e = g.start[c + 1]; k < e; k++) {
        const i = g.items[k];
        if (this.stamp[i] === stamp) continue;
        this.stamp[i] = stamp;
        closestPointOnTriangle(cx, cy, cz, tri, i * 9, CP);
        const dx = cx - CP[0], dy = cy - CP[1], dz = cz - CP[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        // Horizontal push direction: away from the contact point, or the triangle's
        // horizontal normal when the contact is (nearly) straight above/below.
        let hx = dx, hz = dz, hl = Math.hypot(hx, hz);
        if (hl < 0.05 * Math.max(d, 1e-6)) {
          const nx = this.nrm[i * 3], nz = this.nrm[i * 3 + 2];
          const s = (nx * dx + nz * dz) >= 0 ? 1 : -1;
          hx = nx * s; hz = nz * s; hl = Math.hypot(hx, hz);
          if (hl < 1e-6) continue;
        }
        const pen = r - d;
        out[0] += (hx / hl) * pen;
        out[1] += (hz / hl) * pen;
        hits++;
      }
    }
    return hits;
  }

  /** Nearest triangle of a given kind within `maxDist` of (x, y, z) (used for "building next to me"). */
  nearestOfKind(x, y, z, maxDist, kinds, stamp) {
    const g = this.walls, tri = this.tri;
    const x0 = Math.max(0, Math.floor((x - maxDist - this.minX) / CELL)), x1 = Math.min(this.nx - 1, Math.floor((x + maxDist - this.minX) / CELL));
    const z0 = Math.max(0, Math.floor((z - maxDist - this.minZ) / CELL)), z1 = Math.min(this.nz - 1, Math.floor((z + maxDist - this.minZ) / CELL));
    let best = null, bd = maxDist * maxDist;
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const c = gz * this.nx + gx;
      for (let k = g.start[c], e = g.start[c + 1]; k < e; k++) {
        const i = g.items[k];
        if (this.stamp[i] === stamp || !kinds.includes(this.kind[i])) continue;
        this.stamp[i] = stamp;
        closestPointOnTriangle(x, y, z, tri, i * 9, CP);
        const d2 = (x - CP[0]) ** 2 + (y - CP[1]) ** 2 + (z - CP[2]) ** 2;
        if (d2 < bd) { bd = d2; best = { tri: i, fid: this.fid[i], kind: this.kind[i], dist: Math.sqrt(d2), collider: this }; }
      }
    }
    return best;
  }
}

const CP = new Float64Array(3);

// Real-Time Collision Detection (Ericson), 5.1.5
function closestPointOnTriangle(px, py, pz, t, o, out) {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const bx = t[o + 3], by = t[o + 4], bz = t[o + 5];
  const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
}

/**
 * The set of colliders currently built, with world-level queries.
 * All coordinates are three.js world (X east, Y up, Z south).
 */
export class CollisionWorld {
  constructor() {
    this.colliders = new Map(); // tile id -> TileCollider
    this.stamp = 1;
  }
  add(c) { this.colliders.set(c.id, c); }
  remove(id) { this.colliders.delete(id); }
  has(id) { return this.colliders.has(id); }

  _nextStamp() { this.stamp = (this.stamp + 1) >>> 0; if (this.stamp === 0) this.stamp = 1; return this.stamp; }

  /** All surfaces at (x, z): array of {y, c, i}. */
  surfaces(x, z) {
    const res = [];
    for (const c of this.colliders.values()) {
      if (!c.contains(x, z)) continue;
      c.surfacesAt(x, z, (y, i) => res.push({ y, c, i }));
    }
    return res;
  }

  /** Highest surface whose height is <= maxY (pass Infinity for top-most). Optional kind filter. */
  ground(x, z, maxY = Infinity, filter = null) {
    let best = null;
    for (const c of this.colliders.values()) {
      if (!c.contains(x, z)) continue;
      c.surfacesAt(x, z, (y, i) => {
        if (y > maxY) return;
        if (filter && !filter(c.kind[i])) return;
        if (!best || y > best.y) best = { y, c, i };
      });
    }
    if (best) {
      const c = best.c, i = best.i;
      best.nx = c.nrm[i * 3]; best.ny = c.nrm[i * 3 + 1]; best.nz = c.nrm[i * 3 + 2];
      best.kind = c.kind[i]; best.fid = c.fid[i];
    }
    return best;
  }

  /** Total horizontal push for a sphere. out = [px, pz]. */
  push(x, y, z, r, out) {
    out[0] = 0; out[1] = 0;
    const s = this._nextStamp();
    let hits = 0;
    for (const c of this.colliders.values()) {
      if (!c.contains(x, z, r)) continue;
      hits += c.pushSphere(x, y, z, r, out, s);
    }
    return hits;
  }

  nearestBuilding(x, y, z, maxDist, kinds) {
    const s = this._nextStamp();
    let best = null;
    for (const c of this.colliders.values()) {
      if (!c.contains(x, z, maxDist)) continue;
      const b = c.nearestOfKind(x, y, z, maxDist, kinds, s);
      if (b && (!best || b.dist < best.dist)) best = b;
    }
    return best;
  }

  /** True if a built collider covers (x, z) (the tile under that point is ready for walking). */
  covers(x, z) {
    for (const c of this.colliders.values()) if (c.contains(x, z)) return true;
    return false;
  }
}

// First-person walker at real scale (metres, seconds).
//
// Position is the FEET position in three.js world coordinates (X east, Y up,
// Z south). Collision uses the CollisionWorld built from the loaded tiles:
//   * ground: highest surface not more than STEP_UP above the feet
//   * walls: three stacked spheres pushed horizontally out of steep triangles
//   * slopes: terrain steeper than SLOPE_LIMIT can't be walked up; you slide down
//   * sea: no ground below (terrain is clipped to the coastline) = blocked

import * as THREE from 'three';
import { KIND } from './collision.js';
import { threeToLtm, ltmToThree } from './geo.js';

export const WALK = 1.4, RUN = 4.5, CROUCH_SPEED = 0.7;
export const EYE_STAND = 1.65, EYE_CROUCH = 1.0;
export const GRAVITY = 9.81;
const JUMP_V = 3.4;                 // ≈ 0.59 m jump
const STEP_UP = 0.45;
const SNAP_DOWN = 0.6;              // stay glued to the ground when walking down steps/slopes
const SLOPE_LIMIT_DEG = 50;
const COS_LIMIT = Math.cos(SLOPE_LIMIT_DEG * Math.PI / 180);
const RADIUS = 0.3;
const SPHERES_STAND = [0.75, 1.15, 1.5];
const SPHERES_CROUCH = [0.75];
const ACCEL_GROUND = 14, ACCEL_AIR = 2;
const SEA_WADE = 0.5;               // how far below sea level you may stand on terrain
const SUBSTEP = 1 / 120;

const isSlopeLimited = (k) => k === KIND.TERRAIN || k === KIND.CLIFF;

export class Player {
  constructor(world, tiles, seaLevel = 0) {
    this.world = world;   // CollisionWorld
    this.tiles = tiles;   // TileManager
    this.sea = seaLevel;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.crouched = false;
    this.eye = EYE_STAND;
    this.grounded = false;
    this.sliding = false;
    this.ground = null;
    this.lastValid = new THREE.Vector3();
    this.waiting = null;   // { x, y, zHint, since }
    this.noGround = 0;
    this.blockedLast = false;
    this.simTime = 0;
    this.distance = 0;
    this.measuredSpeed = 0;
    this.spawn = null;     // { x, y, z, heading }
    this._push = [0, 0];
  }

  /** Teleport to GIB-LTM (x, y); placed on the ground once the tile is loaded. */
  teleport(x, y, zHint = null) {
    const [X, , Z] = ltmToThree(x, y, 0);
    this.pos.set(X, zHint ?? 0, Z);
    this.vel.set(0, 0, 0);
    this.waiting = { x, y, zHint, since: performance.now() };
    this.grounded = false;
  }

  get ltm() { return threeToLtm(this.pos.x, this.pos.y, this.pos.z); }

  _tryPlace() {
    const w = this.waiting;
    const [X, , Z] = ltmToThree(w.x, w.y, 0);
    if (!this.tiles.isReadyAt(w.x, w.y)) {
      this.tiles.ensureColliderAt(w.x, w.y);
      if (!this.tiles.isReadyAt(w.x, w.y)) return false;
    }
    const pick = (x, z) => {
      const s = this.world.surfaces(x, z);
      if (!s.length) return null;
      if (w.zHint != null) {
        s.sort((a, b) => Math.abs(a.y - w.zHint) - Math.abs(b.y - w.zHint));
        return s[0].y;
      }
      const ground = s.filter((e) => e.c.kind[e.i] !== KIND.BROOF);
      const use = ground.length ? ground : s;
      return Math.max(...use.map((e) => e.y));
    };
    let y = pick(X, Z), px = X, pz = Z;
    if (y == null || y < this.sea - SEA_WADE) {
      // Over the sea: search outward for the nearest land within 80 m.
      y = null;
      outer: for (let r = 2; r <= 80; r += 2) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const x2 = X + Math.cos(ang) * r, z2 = Z + Math.sin(ang) * r;
          const [lx, ly] = threeToLtm(x2, 0, z2);
          if (!this.tiles.isReadyAt(lx, ly)) continue;
          const h = pick(x2, z2);
          if (h != null && h >= this.sea - SEA_WADE) { y = h; px = x2; pz = z2; break outer; }
        }
      }
    }
    if (y == null) {
      if (performance.now() - w.since > 4000 && this.spawn && (w.x !== this.spawn.x || w.y !== this.spawn.y)) {
        console.warn('No land near teleport target; returning to spawn');
        this.teleport(this.spawn.x, this.spawn.y, this.spawn.z);
      }
      return false;
    }
    this.pos.set(px, y, pz);
    this.vel.set(0, 0, 0);
    this.lastValid.copy(this.pos);
    this.grounded = true;
    this.waiting = null;
    this.ground = this.world.ground(px, pz, y + 0.01);
    return true;
  }

  /** input: { f, b, l, r, run, jump } (jump is consumed) */
  update(dt, input) {
    if (this.waiting) {
      if (!this._tryPlace()) return;
    }
    dt = Math.min(dt, 0.25);
    const n = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / n;
    const x0 = this.pos.x, z0 = this.pos.z;
    for (let i = 0; i < n; i++) this._step(h, input);
    input.jump = false;
    const moved = Math.hypot(this.pos.x - x0, this.pos.z - z0);
    this.distance += moved;
    this.simTime += dt;
    const inst = dt > 0 ? moved / dt : 0;
    this.measuredSpeed += (inst - this.measuredSpeed) * Math.min(1, dt * 5);
    // eye height
    const target = this.crouched ? EYE_CROUCH : EYE_STAND;
    this.eye += (target - this.eye) * Math.min(1, dt * 10);
  }

  _step(h, input) {
    const p = this.pos, v = this.vel, W = this.world;
    // ---- desired horizontal velocity
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    const fwd = (input.f ? 1 : 0) - (input.b ? 1 : 0);
    const side = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    wx += -sy * fwd + cy * side;
    wz += -cy * fwd - sy * side;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const speed = this.crouched ? CROUCH_SPEED : (input.run ? RUN : WALK);
    let tx = wx * speed, tz = wz * speed;

    // steep slope: no walking uphill, slide down
    const g0 = this.ground;
    this.sliding = false;
    if (this.grounded && g0 && isSlopeLimited(g0.kind) && g0.ny < COS_LIMIT) {
      this.sliding = true;
      const hl = Math.hypot(g0.nx, g0.nz) || 1;
      const dx = g0.nx / hl, dz = g0.nz / hl; // downhill
      const u = tx * dx + tz * dz;
      if (u < 0) { tx -= dx * u; tz -= dz * u; }
      const sinT = Math.sqrt(Math.max(0, 1 - g0.ny * g0.ny));
      v.x += dx * GRAVITY * sinT * h * 0.6;
      v.z += dz * GRAVITY * sinT * h * 0.6;
    }

    const acc = (this.grounded ? ACCEL_GROUND : ACCEL_AIR) * h;
    if (!this.sliding || wl > 0) {
      let ex = tx - v.x, ez = tz - v.z;
      const el = Math.hypot(ex, ez);
      if (el > acc) { ex *= acc / el; ez *= acc / el; }
      if (!this.sliding) { v.x += ex; v.z += ez; }
      else { v.x += ex * 0.3; v.z += ez * 0.3; }
    }

    if (input.jump && this.grounded && !this.sliding) {
      v.y = JUMP_V;
      this.grounded = false;
    }
    if (!this.grounded) v.y -= GRAVITY * h;

    // ---- horizontal move + wall pushout
    let nx = p.x + v.x * h, nz = p.z + v.z * h;
    const spheres = this.crouched ? SPHERES_CROUCH : SPHERES_STAND;
    let blocked = false;
    for (let it = 0; it < 4; it++) {
      let bx = 0, bz = 0, bl = 0;
      for (const hs of spheres) {
        if (W.push(nx, p.y + hs, nz, RADIUS, this._push)) {
          const l = Math.hypot(this._push[0], this._push[1]);
          if (l > bl) { bl = l; bx = this._push[0]; bz = this._push[1]; }
        }
      }
      if (bl < 1e-5) break;
      blocked = true;
      // limit the push so stacked contacts can't launch the player
      const lim = Math.min(bl, RADIUS) / bl;
      nx += bx * lim; nz += bz * lim;
      const ux = bx / bl, uz = bz / bl;
      const vn = v.x * ux + v.z * uz;
      if (vn < 0) { v.x -= ux * vn; v.z -= uz * vn; }
    }
    this.blockedLast = blocked;

    // ---- tile readiness: never walk onto a tile whose collision isn't built
    {
      const [lx, ly] = threeToLtm(nx, 0, nz);
      if (!this.tiles.isReadyAt(lx, ly)) { nx = p.x; nz = p.z; v.x = 0; v.z = 0; }
    }

    // ---- ground
    let feetNew = p.y + v.y * h;
    const maxY = this.grounded ? p.y + STEP_UP : Math.max(p.y, feetNew) + 0.05;
    let g = W.ground(nx, nz, maxY);
    const invalid = (gg) => !gg || (gg.y < this.sea - SEA_WADE && gg.kind !== KIND.DECK && gg.kind !== KIND.ROAD);
    if (g && this.grounded && isSlopeLimited(g.kind) && g.ny < COS_LIMIT && g.y > p.y + 0.01) {
      // trying to climb a slope that is too steep: drop the uphill component of the move
      const hl = Math.hypot(g.nx, g.nz) || 1;
      const dx = g.nx / hl, dz = g.nz / hl;
      let mx = nx - p.x, mz = nz - p.z;
      const u = mx * dx + mz * dz;
      if (u < 0) {
        mx -= dx * u; mz -= dz * u;
        const vn = v.x * dx + v.z * dz;
        if (vn < 0) { v.x -= dx * vn; v.z -= dz * vn; }
      }
      const g2 = W.ground(p.x + mx, p.z + mz, maxY);
      if (g2 && !(isSlopeLimited(g2.kind) && g2.ny < COS_LIMIT && g2.y > p.y + 0.05)) { nx = p.x + mx; nz = p.z + mz; g = g2; }
      else if (g2 && g2.y > p.y + 0.05) { nx = p.x; nz = p.z; g = W.ground(nx, nz, maxY); }
      else { nx = p.x + mx; nz = p.z + mz; g = g2; }
    }
    if (invalid(g) && (nx !== p.x || nz !== p.z)) {
      // sea / edge of the world: refuse the horizontal move
      nx = p.x; nz = p.z; v.x = 0; v.z = 0;
      g = W.ground(nx, nz, maxY);
    }
    p.x = nx; p.z = nz;

    if (g) {
      this.noGround = 0;
      if (feetNew <= g.y) {
        p.y = g.y; v.y = 0; this.grounded = true;
      } else if (this.grounded && v.y <= 0 && feetNew - g.y <= SNAP_DOWN) {
        p.y = g.y; v.y = 0; this.grounded = true;
      } else {
        p.y = feetNew; this.grounded = false;
      }
      this.ground = g;
    } else {
      // nothing below at all (shouldn't happen on land). Fall briefly, then rescue.
      this.noGround += h;
      p.y = feetNew;
      this.grounded = false;
      this.ground = null;
      if (this.noGround > 0.5 || p.y < this.sea - 30) this._rescue();
      return;
    }

    // ---- never fall through the world: feet below terrain → put back on top
    const tg = W.ground(p.x, p.z, Infinity, (k) => k === KIND.TERRAIN);
    if (tg && p.y < tg.y - 0.3) {
      p.y = tg.y; v.y = 0; this.grounded = true;
      this.ground = W.ground(p.x, p.z, p.y + 0.01);
    }

    if (this.grounded && !invalid(this.ground)) this.lastValid.copy(p);
  }

  _rescue() {
    this.noGround = 0;
    if (this.lastValid.lengthSq() > 0) {
      this.pos.copy(this.lastValid);
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.ground = this.world.ground(this.pos.x, this.pos.z, this.pos.y + 0.01);
    } else if (this.spawn) {
      this.teleport(this.spawn.x, this.spawn.y, this.spawn.z);
    }
  }

  applyToCamera(cam) {
    cam.position.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

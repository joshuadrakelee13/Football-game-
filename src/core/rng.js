// Seeded pseudo-random number generator.
// Deterministic so saves reload identically and test harnesses are reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same generator as mulberry32, but keeping its state on the owning Rng so it
// can be written to a save file and restored exactly.
function mulberry32Stateful(owner) {
  return function () {
    owner.state = (owner.state + 0x6d2b79f5) >>> 0;
    let t = owner.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.state = seed >>> 0;
    this.calls = 0;
    this._next = mulberry32Stateful(this);
  }

  // Advance and return a float in [0, 1).
  next() {
    this.calls++;
    return this._next();
  }

  // Float in [min, max).
  float(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  // True with probability p.
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Weighted pick. `weights` parallel to `arr`.
  weighted(arr, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Approximately normal via sum of uniforms (Bates). Clamped to +/- 3 sd.
  normal(mean = 0, sd = 1) {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += this.next();
    const z = (sum - 3) / 0.7071;
    return mean + Math.max(-3, Math.min(3, z)) * sd;
  }

  // Mulberry32's entire state is one 32-bit integer, so a save can restore the
  // stream exactly rather than replaying millions of calls to catch up.
  toJSON() {
    return { seed: this.seed, state: this.state, calls: this.calls };
  }

  static fromJSON(data) {
    if (!data) return new Rng();
    const rng = new Rng(data.seed ?? Date.now());
    if (Number.isFinite(data.state)) rng.setState(data.state);
    rng.calls = data.calls || 0;
    return rng;
  }

  setState(state) {
    this.state = state >>> 0;
    this._next = mulberry32Stateful(this);
  }
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

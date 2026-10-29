// Procedural ambient sound with WebAudio — no audio files.
//   surf:     filtered noise with a slow, irregular swell; louder near the sea
//   wind:     band-passed noise with gusts; louder with altitude
//   birds:    short chirp phrases in daytime
//   crickets: pulsed high tones at night

export class Ambience {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.started = false;
    this.nextBird = 0;
    this.nextCricket = 0;
    this.nextSwell = 0;
    this.nextGust = 0;
    this.target = { surf: 0, wind: 0, day: 1 };
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start() {
    if (this.started) { this.ctx?.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch { return; }
    this.started = true;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // 4 s of pink-ish noise, looped
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random() * 3; s.start(0, Math.random() * 3); return s; };

    // surf
    this.surfLP = ctx.createBiquadFilter(); this.surfLP.type = 'lowpass'; this.surfLP.frequency.value = 600; this.surfLP.Q.value = 0.3;
    this.surfSwell = ctx.createGain(); this.surfSwell.gain.value = 0.5;
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
    noise().connect(this.surfLP); this.surfLP.connect(this.surfSwell); this.surfSwell.connect(this.surfGain); this.surfGain.connect(this.master);

    // wind
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 500; this.windBP.Q.value = 0.8;
    this.windGust = ctx.createGain(); this.windGust.gain.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    noise().connect(this.windBP); this.windBP.connect(this.windGust); this.windGust.connect(this.windGain); this.windGain.connect(this.master);

    // creatures bus
    this.lifeGain = ctx.createGain(); this.lifeGain.gain.value = 0.5;
    this.lifeGain.connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /**
   * @param {object} p { seaDist (m, Infinity if unknown), altitude (m), sunElev (deg), paused }
   */
  update(p) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const near = Number.isFinite(p.seaDist) ? Math.max(0, 1 - p.seaDist / 350) : 0;
    const low = Math.max(0, 1 - Math.max(0, p.altitude - 5) / 120);
    const surf = p.paused ? 0 : 0.05 + 0.75 * near * near * (0.3 + 0.7 * low);
    const wind = p.paused ? 0 : 0.04 + 0.5 * Math.min(1, Math.max(0, (p.altitude - 30) / 350));
    this.surfGain.gain.setTargetAtTime(surf, t, 0.8);
    this.windGain.gain.setTargetAtTime(wind, t, 1.2);

    // swells: every 5–11 s, a wave builds and breaks
    if (t > this.nextSwell) {
      const period = 5 + Math.random() * 6;
      const g = this.surfSwell.gain, f = this.surfLP.frequency;
      g.cancelScheduledValues(t); f.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t); f.setValueAtTime(f.value, t);
      g.linearRampToValueAtTime(0.9 + Math.random() * 0.4, t + period * 0.45);
      f.linearRampToValueAtTime(900 + Math.random() * 500, t + period * 0.45);
      g.linearRampToValueAtTime(0.25, t + period);
      f.linearRampToValueAtTime(350, t + period);
      this.nextSwell = t + period;
    }
    if (t > this.nextGust) {
      const d = 2 + Math.random() * 5;
      this.windGust.gain.setTargetAtTime(0.3 + Math.random() * 0.9, t, d / 3);
      this.windBP.frequency.setTargetAtTime(300 + Math.random() * 600, t, d / 3);
      this.nextGust = t + d;
    }
    if (p.paused) return;
    const day = p.sunElev > 2, night = p.sunElev < -4;
    if (day && t > this.nextBird) {
      this._bird(t);
      this.nextBird = t + 1.5 + Math.random() * 6 * (1 + p.altitude / 200);
    }
    if (night && t > this.nextCricket) {
      this._crickets(t);
      this.nextCricket = t + 0.6 + Math.random() * 1.2;
    }
  }

  _bird(t0) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.lifeGain); }
    const out = pan || this.lifeGain;
    const base = 2600 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 5);
    let t = t0 + 0.05;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      const f0 = base * (0.85 + Math.random() * 0.3), dur = 0.05 + Math.random() * 0.1;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.7), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.03 + Math.random() * 0.08;
    }
  }

  _crickets(t0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 4300 + Math.random() * 400;
    g.gain.value = 0;
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * 0.045;
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.008);
      g.gain.linearRampToValueAtTime(0.0, t + 0.03);
    }
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; g.connect(pan); pan.connect(this.lifeGain); } else g.connect(this.lifeGain);
    o.start(t0); o.stop(t0 + pulses * 0.045 + 0.05);
  }
}

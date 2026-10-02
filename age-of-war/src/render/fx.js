// Particles, floating numbers, beams, screen shake and the special attacks.
//
// All of it lives here and none of it lives in the simulation. The engine emits
// a flat list of things that happened on a tick - a hit, a death, a shot landing
// - and this file decides what that looks like. That is why a headless battle
// runs in a couple of hundred milliseconds: with state.emitEvents off, none of
// this exists.

import { STAGE } from '../data/balance.js';
import { TAU } from '../core/math.js';
import { gold as fmtGold } from '../core/format.js';

const MAX_PARTICLES = 420;

export function createFx() {
  return { particles: [], texts: [], beams: [], flashes: [], shake: 0, reduced: false };
}

// ---------------------------------------------------------------------------
// Turning simulation events into things you can see

export function consume(fx, state) {
  for (const e of state.events) {
    switch (e.type) {
      case 'hit':
        burst(fx, e.x, STAGE.groundY - 16, 3, e.side === 0 ? '#F0C27A' : '#F0A27A', 34);
        break;
      case 'death':
        burst(fx, e.x, STAGE.groundY - 14, 12, '#C4462F', 80);
        text(fx, e.x, STAGE.groundY - 40, `+${fmtGold(e.gold)}`, '#F2C75B');
        break;
      case 'swing':
        break;
      case 'muzzle':
        burst(fx, e.x, e.y, 3, '#FFE08A', 60, 0.25);
        break;
      case 'impact':
        burst(fx, e.x, e.y, e.splash > 0 ? 16 : 6, e.splash > 0 ? '#FFB347' : '#E8D9B8', e.splash > 0 ? 130 : 70);
        if (e.splash > 0) ring(fx, e.x, e.y, e.splash);
        break;
      case 'beam':
        fx.beams.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, life: e.life, max: e.life, side: e.side });
        break;
      case 'baseHit':
        burst(fx, baseX(e.side), STAGE.groundY - 40, 5, '#D9A441', 60);
        fx.shake = Math.min(7, fx.shake + 1.6);
        break;
      case 'evolve':
        fx.flashes.push({ life: 0.9, max: 0.9, color: '#FFFFFF' });
        fx.shake = Math.min(9, fx.shake + 3);
        break;
      case 'special':
        break;
      case 'specialLand':
        fx.flashes.push({ life: 0.5, max: 0.5, color: specialColour(e.key) });
        fx.shake = Math.min(14, fx.shake + 9);
        break;
      default:
        break;
    }
  }
}

function baseX(side) {
  return side === 0 ? 110 : STAGE.w - 110;
}

function specialColour(key) {
  switch (key) {
    case 'meteor_shower': return '#FF8A3D';
    case 'arrow_storm': return '#E8D9B8';
    case 'cannon_barrage': return '#FFB347';
    case 'airstrike': return '#FF6B4A';
    default: return '#7FD8FF';
  }
}

// ---------------------------------------------------------------------------

export function burst(fx, x, y, n, color, speed, life = 0.5) {
  if (fx.reduced) return;
  if (fx.particles.length > MAX_PARTICLES) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.35 + Math.random() * 0.8);
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - speed * 0.4,
      life: life * (0.6 + Math.random() * 0.8),
      max: life,
      r: 1.2 + Math.random() * 2,
      color,
    });
  }
}

export function ring(fx, x, y, radius) {
  if (fx.reduced) return;
  fx.particles.push({ ring: true, x, y, r: 3, target: radius, life: 0.34, max: 0.34, color: '#FFD08A' });
}

export function text(fx, x, y, label, color) {
  fx.texts.push({ x, y, label, color, life: 1.1, max: 1.1 });
}

// ---------------------------------------------------------------------------

export function tickFx(fx, dt) {
  const parts = fx.particles;
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.ring) {
      p.r += (p.target - p.r) * dt * 9;
    } else {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > STAGE.groundY - 2) { p.y = STAGE.groundY - 2; p.vy *= -0.32; p.vx *= 0.6; }
    }
    parts[w++] = p;
  }
  parts.length = w;

  w = 0;
  for (const t of fx.texts) {
    t.life -= dt;
    if (t.life <= 0) continue;
    t.y -= 26 * dt;
    fx.texts[w++] = t;
  }
  fx.texts.length = w;

  w = 0;
  for (const b of fx.beams) {
    b.life -= dt;
    if (b.life > 0) fx.beams[w++] = b;
  }
  fx.beams.length = w;

  w = 0;
  for (const f of fx.flashes) {
    f.life -= dt;
    if (f.life > 0) fx.flashes[w++] = f;
  }
  fx.flashes.length = w;

  fx.shake *= Math.pow(0.02, dt);
  if (fx.shake < 0.05) fx.shake = 0;
}

// ---------------------------------------------------------------------------

export function drawFx(ctx, fx, t) {
  for (const b of fx.beams) {
    const k = b.life / b.max;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = b.side === 0 ? '#9FE0FF' : '#FFC79F';
    ctx.lineWidth = 1 + k * 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x1, b.y1);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of fx.particles) {
    const k = Math.max(0, p.life / p.max);
    ctx.globalAlpha = Math.min(1, k);
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.4 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + k), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  for (const tx of fx.texts) {
    const k = tx.life / tx.max;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(tx.label, tx.x, tx.y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.label, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// The white-out that sells an evolution or a special landing.
export function drawFlashes(ctx, fx) {
  for (const f of fx.flashes) {
    const k = f.life / f.max;
    ctx.save();
    ctx.globalAlpha = k * 0.6;
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, STAGE.w, STAGE.h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The specials, mid-telegraph. Each one is a shower of somethings falling on the
// half of the field the enemy is standing in.

export function drawSpecials(ctx, state, t) {
  for (const s of state.specials) {
    const total = s.remaining;
    const foe = state.sides[1 - s.side];
    const from = foe.index === 0 ? 40 : STAGE.w * 0.5;
    const width = STAGE.w * 0.56;
    const k = 1 - Math.max(0, total) / 1.4;

    ctx.save();
    switch (s.key) {
      case 'meteor_shower':
        streaks(ctx, from, width, k, '#FF8A3D', 12, 34);
        break;
      case 'arrow_storm':
        streaks(ctx, from, width, k, '#E8D9B8', 26, 18);
        break;
      case 'cannon_barrage':
        streaks(ctx, from, width, k, '#FFB347', 10, 26);
        break;
      case 'airstrike':
        streaks(ctx, from, width, k, '#FF6B4A', 14, 30);
        break;
      default: {
        // Death Ray: a wall of light rather than anything falling.
        ctx.globalAlpha = 0.25 + Math.sin(t * 30) * 0.12;
        const g = ctx.createLinearGradient(from, 0, from + width, 0);
        g.addColorStop(0, 'rgba(127,216,255,0)');
        g.addColorStop(0.5, 'rgba(127,216,255,0.95)');
        g.addColorStop(1, 'rgba(127,216,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(from, 0, width, STAGE.groundY);
      }
    }
    ctx.restore();
  }
}

function streaks(ctx, from, width, k, color, count, len) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = from + ((i * 137) % width);
    const fall = ((k * 1.6 + (i % 5) * 0.18) % 1) * (STAGE.groundY + 60) - 40;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, fall);
    ctx.lineTo(x - len * 0.35, fall - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

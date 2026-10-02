// One frame.
//
// The renderer reads the battle and never writes to it. Positions are
// interpolated between the last two simulation ticks, which costs four lines and
// is the difference between a smooth army and a juddering one on any display
// that is not exactly 60Hz.
//
// The backdrop follows YOUR age rather than the enemy's, so evolving repaints
// the world around you - which is most of the reward for having done it.

import { lerp, TAU } from '../core/math.js';
import { LANE, STAGE, TURRETS } from '../data/balance.js';
import { unitDef } from '../model/state.js';
import { backdropFor, drawSkyDrift } from './backdrop.js';
import { drawBase, drawTurret, drawUnit } from './figures-draw.js';
import { drawFlashes, drawFx, drawSpecials } from './fx.js';

export function drawScene(ctx, state, fx, alpha, t) {
  const you = state.sides[0];

  ctx.save();
  if (fx.shake > 0.05) {
    ctx.translate(Math.sin(t * 61) * fx.shake, Math.cos(t * 47) * fx.shake * 0.6);
  }

  ctx.drawImage(backdropFor(you.age), 0, 0);
  drawSkyDrift(ctx, you.age, t);

  // Bases, and the turrets bolted to them.
  for (const side of state.sides) {
    const lane = LANE.base[side.index];
    ctx.save();
    ctx.translate(lane.anchorX, STAGE.groundY);
    drawBase(ctx, side.age, side.base.hp / side.base.maxHp, side.index);
    ctx.restore();

    for (const slot of side.slots) {
      if (!slot.turret) continue;
      const def = TURRETS[slot.turret.key];
      const target = aimTarget(state, side, slot, def);
      const aim = target ? Math.atan2(-14, (target.x - slot.x) * lane.dir) * 0.55 : -0.12;
      const recoil = slot.turret.ready ? Math.max(0, 1 - (1 / def.attackSpeed - slot.turret.reload) * 7) : 0;

      ctx.save();
      ctx.translate(slot.x, slot.y);
      ctx.scale(lane.dir, 1);
      if (!slot.turret.ready) ctx.globalAlpha = 0.45;      // still being installed
      drawTurret(ctx, slot.turret.key, side.age, aim, recoil);
      ctx.restore();
    }
  }

  // Units, back rank first so the front line overlaps correctly.
  const all = [];
  for (const side of state.sides) for (const u of side.units) all.push(u);
  all.sort((a, b) => a.yOff - b.yOff);

  for (const u of all) {
    const def = unitDef(u);
    const x = lerp(u.px ?? u.x, u.x, alpha);
    const y = STAGE.groundY + u.yOff;

    // Contact shadow. Cheap, and without it everything floats.
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, def.size.radius * 1.15, def.size.radius * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    drawUnit(ctx, u, def, state.sides[u.side].age, alpha);
    ctx.restore();

    if (u.hp < def.hp) healthBar(ctx, x, y - def.size.height - 9, def.size.radius * 2.1, u.hp / def.hp, u.side);
  }

  // Projectiles.
  for (const p of state.projectiles) {
    ctx.save();
    ctx.fillStyle = p.side === 0 ? '#EFE0C0' : '#F0CBB0';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.splash > 0 ? 4 : 2.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawSpecials(ctx, state, t);
  drawFx(ctx, fx, t);

  ctx.restore();
  drawFlashes(ctx, fx);
}

// ---------------------------------------------------------------------------

function aimTarget(state, side, slot, def) {
  const foe = state.sides[1 - side.index];
  let best = null;
  let bestD = Infinity;
  for (const u of foe.units) {
    const d = Math.abs(u.x - slot.x);
    if (d <= def.range && d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function healthBar(ctx, x, y, w, frac, side) {
  const h = 3;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = frac > 0.55 ? '#5FCB6A' : frac > 0.28 ? '#E8B13A' : '#D9503A';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), h);
  ctx.restore();
}

// A small offscreen portrait of a unit, for the buy buttons. Drawn once at build
// time so the button art is the real art rather than an icon that can drift.
export function unitPortrait(key, size = 52) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.translate(size * 0.5, size * 0.93);
  const scale = Math.min(1, (size * 0.82) / 46);
  g.scale(scale, scale);
  const fake = { key, anim: 'idle', travelled: 0, attackTimer: 0.5, side: 0, yOff: 0, x: 0, px: 0 };
  drawUnit(g, fake, { attackSpeed: 1, size: { radius: 10, height: 34 } }, 0, 0);
  return c;
}

export function turretPortrait(key, age, size = 46) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.translate(size * 0.5, size * 0.9);
  g.scale(1.1, 1.1);
  drawTurret(g, key, age, -0.2, 0);
  return c;
}

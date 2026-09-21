// Ballistic shots and hitscan beams.
//
// A ballistic shot commits to a flight plan at launch and does not home, so a
// slow catapult stone genuinely misses a sprinting Dueler. That miss is a
// feature: it is why short-ranged fast units are worth buying at all.
//
// Modern and future weapons are hitscan instead. A twenty-shots-per-second
// Infantry rendered as projectiles looks like confetti, and late-game fire needs
// to land instantly to feel like the weapon it is.

import { nextId } from '../core/ids.js';
import { TUNING } from '../data/balance.js';
import { unitDef } from '../model/state.js';
import { damageBase, damageUnit, splashDamage } from './combat.js';

export function fireAt(state, side, def, origin, target, foe, kind) {
  const attack = def.attack;
  const targetX = target ? target.x : foe.base.frontX;

  if (attack.kind === 'hitscan') {
    applyHit(state, side, foe, def, targetX, target);
    if (state.emitEvents) {
      state.events.push({
        type: 'beam', side: side.index, x0: origin.x, y0: origin.y,
        x1: targetX, y1: target ? TUNING.stage.groundY - 16 : TUNING.stage.groundY - 40,
        life: attack.beam ?? 0.08, source: kind,
      });
    }
    return;
  }

  const dist = Math.abs(targetX - origin.x);
  const tFlight = Math.max(0.05, dist / attack.speed);
  state.projectiles.push({
    id: nextId(),
    side: side.index,
    key: def.key,
    x0: origin.x, y0: origin.y,
    x1: targetX, y1: TUNING.stage.groundY - (target ? unitDef(target).size.height * 0.4 : 30),
    x: origin.x, y: origin.y,
    t: 0, tFlight,
    arc: (attack.arc ?? 0.15) * dist,
    damage: def.damage, splash: def.splash ?? 0,
    targetId: target ? target.id : null,
    source: kind,
  });
  if (state.emitEvents) {
    state.events.push({ type: 'muzzle', x: origin.x, y: origin.y, side: side.index, source: kind });
  }
}

export function tickProjectiles(state, dt) {
  let any = false;
  for (const p of state.projectiles) {
    p.t += dt;
    const k = Math.min(1, p.t / p.tFlight);
    p.x = p.x0 + (p.x1 - p.x0) * k;
    p.y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * p.arc;
    if (p.t < p.tFlight) continue;

    p.dead = true;
    any = true;
    const side = state.sides[p.side];
    const foe = state.sides[1 - p.side];
    applyHit(state, side, foe, { damage: p.damage, splash: p.splash, key: p.key }, p.x1, findTarget(foe, p));
    if (state.emitEvents) {
      state.events.push({ type: 'impact', x: p.x1, y: p.y1, splash: p.splash, side: p.side, source: p.source });
    }
  }
  if (any) state.projectiles = state.projectiles.filter((p) => !p.dead);
}

// ---------------------------------------------------------------------------

function findTarget(foe, p) {
  // Prefer the unit it was aimed at, if it is still alive and still near where
  // the shot was going to land.
  if (p.targetId !== null) {
    for (const u of foe.units) {
      if (u.id !== p.targetId || u.dead) continue;
      return Math.abs(u.x - p.x1) <= TUNING.hitRadius + unitDef(u).size.radius ? u : null;
    }
  }
  return null;
}

function applyHit(state, side, foe, def, x, preferred) {
  const direct = preferred ?? nearestAt(foe, x);
  if (def.splash > 0) {
    splashDamage(state, foe, x, def.splash, def.damage);
    // A shell that lands short of an empty field still rattles the base.
    if (!direct && withinBase(foe, x, def.splash)) damageBase(state, foe, def.damage);
    return;
  }
  if (direct) {
    damageUnit(state, direct, def.damage);
    return;
  }
  if (withinBase(foe, x, TUNING.hitRadius)) damageBase(state, foe, def.damage);
}

function nearestAt(foe, x) {
  let best = null;
  let bestD = Infinity;
  for (const u of foe.units) {
    if (u.dead) continue;
    const d = Math.abs(u.x - x) - unitDef(u).size.radius;
    if (d < bestD) { bestD = d; best = u; }
  }
  return bestD <= TUNING.hitRadius ? best : null;
}

function withinBase(foe, x, tolerance) {
  return Math.abs(x - foe.base.frontX) <= tolerance + 26;
}

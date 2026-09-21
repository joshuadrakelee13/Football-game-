// Movement, engagement and the front-line rule.
//
// This is the file that decides whether the game feels like Age of War. The rule
// is that a unit can never overtake the ally in front of it: the lane is a queue,
// not a crowd. Get it wrong and you have a different genre - units sliding
// through each other, or a conga line with visible gaps.
//
// Two details do most of the work. Iterating FRONT TO BACK means each follower
// clamps against the leader's already-updated position on this same tick, so the
// column settles instead of breathing. And firing is decided independently of
// moving, so a blocked ranged unit still shoots over the melee wall in front of
// it - which is the whole reason ranged units are worth buying.

import { towards } from '../core/math.js';
import { TUNING } from '../data/balance.js';
import { unitDef } from '../model/state.js';
import { damageBase, damageUnit } from './combat.js';
import { fireAt } from './projectiles.js';

const EPS = 1e-6;

export function tickUnits(state, dt) {
  // Both sides read the field as it stood at the START of the tick, before
  // either of them has moved. Resolving one side and then the other looks
  // harmless and is not: the second side gets to aim at where the first side
  // actually ended up, which is a one-tick information advantage. It is worth
  // about nine percentage points of win rate in a mirror match, and it took a
  // two-hundred-battle harness to notice.
  const snapshot = state.sides.map((side) => {
    const foe = state.sides[1 - side.index];
    const target = frontLiving(foe);
    return {
      target,
      targetX: target ? target.x : foe.base.frontX,
      targetR: target ? unitDef(target).size.radius : 0,
    };
  });

  for (const side of state.sides) {
    const foe = state.sides[1 - side.index];
    const dir = side.dir;
    const { target, targetX, targetR } = snapshot[side.index];

    let ahead = null;    // nearest living ally in front of me

    for (const u of side.units) {
      if (u.dead) continue;
      const def = unitDef(u);
      const r = def.size.radius;
      const gap = Math.abs(targetX - u.x) - r - targetR;

      // Two things can stop me: how close I want to get, and the ally in front.
      //
      // How close I want to get is NOT the same as how far my weapon reaches. A
      // melee unit closes to touching distance but swings far enough to cover the
      // two ranks behind it, so a stack of cheap units all hit the same enemy.
      // That is the swarm every Age of War guide is really describing, and with a
      // single-file queue it is the only way more than one unit ever fights.
      const standoff = def.standoff ?? def.range;
      const engageLimit = targetX - dir * (r + targetR + standoff);
      const allyLimit = ahead
        ? ahead.x - dir * (r + unitDef(ahead).size.radius + TUNING.rankGap)
        : engageLimit;
      let limit = towards(dir, allyLimit, engageLimit);

      // A unit never retreats. Without this clamp a jammed column walks itself
      // backwards off the map, because the ally limit sits behind where the unit
      // already stands.
      limit = dir > 0 ? Math.max(limit, u.x) : Math.min(limit, u.x);

      const stepX = def.moveSpeed * dt * dir;
      const nx = dir > 0 ? Math.min(u.x + stepX, limit) : Math.max(u.x + stepX, limit);

      if (Math.abs(nx - u.x) > EPS) {
        u.travelled += Math.abs(nx - u.x);
        u.x = nx;
        u.anim = 'walk';
      } else {
        u.anim = gap <= def.range + EPS ? 'attack' : 'idle';
      }

      if (gap <= def.range + EPS) {
        u.attackTimer -= dt;
        if (u.attackTimer <= 0) {
          fire(state, side, u, def, target, foe);
          u.attackTimer += 1 / def.attackSpeed;
        }
      } else {
        // Cap the residual so a unit arriving at the line strikes almost at
        // once. Without this, fast-attack units look broken on contact.
        u.attackTimer = Math.min(u.attackTimer, TUNING.readyWindup);
      }

      u.animT += dt;
      ahead = u;
    }
  }
}

// ---------------------------------------------------------------------------

export function frontLiving(side) {
  for (const u of side.units) if (!u.dead) return u;
  return null;
}

function fire(state, side, u, def, target, foe) {
  const origin = { x: u.x + side.dir * def.size.radius, y: TUNING.stage.groundY - def.size.height * 0.55 };

  if (def.attack.kind === 'melee') {
    if (target) damageUnit(state, target, def.damage);
    else damageBase(state, foe, def.damage);
    if (state.emitEvents) {
      state.events.push({ type: 'swing', x: u.x, yOff: u.yOff, side: side.index, key: u.key });
    }
    return;
  }

  fireAt(state, side, def, origin, target, foe, 'unit');
}

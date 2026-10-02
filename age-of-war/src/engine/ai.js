// The opponent.
//
// Not a wave table. It is a priority ladder over the same intents a human
// produces, with no privileged actions and no direct writes to the state, so a
// difficulty setting is a set of multipliers rather than a second game.
//
// The pressure it escalates under comes from its own income growing, not from a
// script saying "minute four: send two knights". That is what makes it feel like
// the original, where the enemy gets steadily more frightening because it is
// getting richer at the same time you are.

import { clamp, lerp } from '../core/math.js';
import { AGES, DIFFICULTY, TUNING, UNITS, slotCost, specialOfAge, turretsOfAge } from '../data/balance.js';
import { unitDef } from '../model/state.js';
import { buyableUnits, canBuySlot, canEvolve, canFireSpecial, canSpawn } from './actions.js';
import { queueIntent } from './intents.js';
import { frontLiving } from './units.js';

const ROLES = ['melee', 'ranged', 'heavy'];
// Where the gold goes, by role. Weighted hard towards the cheap melee wall
// because tools/matchup-test.mjs says that is simply what wins: only about three
// ranks of a column can reach the enemy at once, so a wall that is always there
// beats a heavy unit that is occasionally there. An earlier split of 55/30/15
// lost to a scripted player nineteen times out of twenty.
const BASE_SHARE = { melee: 0.66, ranged: 0.26, heavy: 0.08 };

export function tickAi(state, dt, rng) {
  for (const side of state.sides) {
    if (!side.isAi) continue;
    if (!side.ai) side.ai = createAiState();
    if (state.time < side.ai.nextThinkAt) continue;

    const p = DIFFICULTY[side.profile] ?? DIFFICULTY.normal;
    think(state, side, p, rng);
    // The jitter is the difference between an opponent and a metronome.
    side.ai.nextThinkAt = state.time + p.reaction * rng.float(0.8, 1.25);
  }
}

function createAiState() {
  return { nextThinkAt: 0, spentByRole: { melee: 0, ranged: 0, heavy: 0 }, lastFrontX: null, stalledFor: 0 };
}

// ---------------------------------------------------------------------------

function think(state, side, p, rng) {
  const foe = state.sides[1 - side.index];
  // 380px covers the reach of every turret worth buying, so "pressure" means an
  // enemy actually closing on the base rather than a line holding in midfield.
  const pressure = threatWithin(state, side, 380);
  const aggression = clamp(
    lerp(p.aggr0, p.aggr1, state.time / p.rampSeconds),
    Math.min(p.aggr0, p.aggr1),
    Math.max(p.aggr0, p.aggr1),
  );

  trackStall(side, state);

  // Threat is measured in "enemy units of my own age", because a Club Man and a
  // War Machine differ by three orders of magnitude and a fixed threshold would
  // mean never building a turret in the Stone Age and always building one in the
  // Future Age.
  const relative = pressure / ageThreatUnit(side.age);
  const hpFrac = side.base.hp / side.base.maxHp;
  const crowd = livingCount(foe);
  const special = specialOfAge(side.age);
  const evolve = AGES[side.age].evolveCost;

  // 1. Desperate special. The base is genuinely about to fall, so the experience
  //    is worth more spent now than banked for an age it will never reach.
  //    It needs a real force at the gates, not just a low health bar: a base sits
  //    under 35% for most of a long battle, and firing on every cooldown for ten
  //    minutes is how an AI spends an entire game's experience and never evolves.
  if (hpFrac < 0.35 && crowd >= 3 && relative > p.panicThreat * 0.6 && canFireSpecial(side)) {
    queueIntent(state, { side: side.index, type: 'special' });
    return;
  }

  // 2. Evolve. Ahead of the opportunistic special deliberately: an AI that fires
  //    on cooldown never banks an age, and an earlier version of this one spent
  //    a whole twenty-five minute battle stuck in the Stone Age doing exactly
  //    that. Normal still wants a little gold in hand so it does not evolve into
  //    an age it cannot afford to field anything in.
  if (canEvolve(side) && hasEvolveCushion(side, p)) {
    queueIntent(state, { side: side.index, type: 'evolve' });
    return;
  }

  // 3. Offensive special, out of experience it does not need for the next age.
  //
  //    The stall clause is what stops two evenly matched armies grinding in
  //    midfield until the clock runs out. Turrets cannot reach the middle of the
  //    lane, so a special is the only thing that clears a deadlocked front line -
  //    which is precisely what a human uses it for. Without this the AI only ever
  //    fired defensively, and a third of mirror battles ran to the time limit.
  const stalled = side.ai.stalledFor > 10;
  // The crowd has to be big enough that the special roughly pays for itself in
  // bounties. Set too low, the AI trades its next age for a handful of club men
  // and finishes a whole age behind anyone who simply waited - which is the gap
  // that made it lose nineteen battles in twenty to a scripted player.
  const minCrowd = evolve === null ? 3 : 5;
  if (special && canFireSpecial(side) && crowd >= minCrowd
      && (relative > p.panicThreat || hpFrac < p.panicHp || stalled)
      && hasSpecialSurplus(side, p, special, evolve)
      && enemyWorthHitting(state, side, minCrowd)) {
    queueIntent(state, { side: side.index, type: 'special' });
    return;
  }

  // 4. Fortify - because of a threat, or because it is rich.
  //
  //    The "rich" half matters more than it sounds. Build times cap how fast gold
  //    can be turned into units, so in the late ages income outruns the queue and
  //    the bank just grows. An earlier version would not buy a turret without a
  //    threat, and would not buy a slot while any slot stood empty, so it sat on
  //    a hundred and fifty thousand gold behind one turret and battles ran to the
  //    clock. Surplus gold has to go somewhere, and defence is where.
  const rich = side.gold > queueCapacityCost(side) * p.bankMul;
  if (relative > p.turretThreat || rich) {
    const slot = side.slots.find((s) => !s.turret);
    if (slot) {
      const pick = bestAffordableTurret(side);
      if (pick) {
        queueIntent(state, { side: side.index, type: 'buyTurret', slot: slot.index, key: pick.key });
        return;
      }
    }
  }

  // 5. Another slot, once the ones it has are full, or it is rich enough that an
  //    empty slot it cannot yet fill is still worth owning.
  if ((side.slots.every((s) => s.turret) || rich) && canBuySlot(side)
      && side.gold > slotCost(side.slotsOwned) * p.slotMul) {
    queueIntent(state, { side: side.index, type: 'buySlot' });
    return;
  }

  // 6. Spawn.
  const queueTarget = Math.round(lerp(2, 6, aggression));
  if (side.queue.length < queueTarget) {
    if (p.idleWaste > 0 && rng.chance(p.idleWaste)) return;   // deliberate slack
    const pick = chooseUnit(side, foe, p, rng);
    if (pick) {
      queueIntent(state, { side: side.index, type: 'spawn', key: pick.key });
      side.ai.spentByRole[pick.role] += pick.cost;
    }
  }
}

// Experience the AI can spend on a special without setting back the next age.
// In the last age there is nothing else to save for, so everything is surplus.
function hasSpecialSurplus(side, p, special, evolve) {
  if (evolve === null) return true;
  if (p.specialReserve <= 0) return side.xp >= special.xpCost;
  return side.xp - special.xpCost >= evolve * p.specialReserve;
}

// ---------------------------------------------------------------------------

function chooseUnit(side, foe, p, rng) {
  const affordable = buyableUnits(side).filter((u) => canSpawn(side, u.key));
  if (affordable.length === 0) return null;
  if (p.mistake > 0 && rng.chance(p.mistake)) return rng.pick(affordable);

  const share = { ...BASE_SHARE };

  // Two counter-nudges, both reactive rather than scripted.
  if (rangedHeavy(foe)) share.melee += 0.12;             // rush a ranged army
  if (side.ai.stalledFor > 12) share.heavy += 0.15;      // break a stalled line

  const spent = side.ai.spentByRole;
  const total = spent.melee + spent.ranged + spent.heavy || 1;
  const shareTotal = share.melee + share.ranged + share.heavy;

  let best = null;
  let bestDeficit = -Infinity;
  for (const u of affordable) {
    const role = ROLES.includes(u.role) ? u.role : 'heavy';
    const deficit = share[role] / shareTotal - spent[role] / total;
    if (deficit > bestDeficit) { bestDeficit = deficit; best = u; }
  }
  return best;
}

// Roughly what a full build queue of this age's units would cost. Gold much
// beyond this cannot be spent on units fast enough to matter.
function queueCapacityCost(side) {
  let total = 0;
  let n = 0;
  for (const u of Object.values(UNITS)) {
    if (u.age !== side.age || u.role === 'secret') continue;
    total += u.cost; n++;
  }
  return n ? (total / n) * TUNING.queueCap : 1000;
}

function bestAffordableTurret(side) {
  const list = turretsOfAge(side.age).filter((t) => side.gold >= t.cost);
  return list.length ? list[list.length - 1] : null;
}

// Sum of (dps x hp/1000) for enemy units close to my base. A rough but stable
// read of "how much trouble is walking at me right now".
function threatWithin(state, side, distance) {
  const foe = state.sides[1 - side.index];
  let total = 0;
  for (const u of foe.units) {
    if (u.dead) continue;
    if (Math.abs(u.x - side.base.frontX) > distance) continue;
    const def = unitDef(u);
    total += def.damage * def.attackSpeed * (u.hp / 1000);
  }
  return total;
}

// The threat one melee unit of a given age represents, used to make the AI's
// thresholds scale-free across five ages of wildly different numbers.
function ageThreatUnit(age) {
  let best = null;
  for (const u of Object.values(UNITS)) {
    if (u.age === age && u.role === 'melee') { best = u; break; }
  }
  if (!best) return 1;
  return Math.max(0.01, best.damage * best.attackSpeed * (best.hp / 1000));
}

function livingCount(side) {
  let n = 0;
  for (const u of side.units) if (!u.dead) n++;
  return n;
}

function rangedHeavy(foe) {
  let ranged = 0;
  let all = 0;
  for (const u of foe.units) {
    if (u.dead) continue;
    all += u.hp;
    if (unitDef(u).role === 'ranged') ranged += u.hp;
  }
  return all > 0 && ranged / all >= 0.6;
}

function trackStall(side, state) {
  const front = frontLiving(side);
  const x = front ? front.x : side.base.frontX;
  if (side.ai.lastFrontX !== null && Math.abs(x - side.ai.lastFrontX) < 30) {
    side.ai.stalledFor += 1;
  } else {
    side.ai.stalledFor = 0;
    side.ai.lastFrontX = x;
  }
}

function hasEvolveCushion(side, p) {
  const next = AGES[side.age + 1];
  if (!next) return true;
  // Cheapest unit of the age it is about to enter, so it is not stranded.
  let cheapest = Infinity;
  for (const u of Object.values(UNITS)) {
    if (u.age === side.age + 1 && u.role !== 'secret') cheapest = Math.min(cheapest, u.cost);
  }
  return side.gold >= cheapest * p.evolveGoldFloor;
}

function enemyWorthHitting(state, side, minCrowd) {
  const foe = state.sides[1 - side.index];
  const special = specialOfAge(side.age);
  if (!special) return false;
  let worth = 0;
  let count = 0;
  for (const u of foe.units) {
    if (u.dead) continue;
    count++;
    worth += unitDef(u).xpValue;
  }
  // Worth firing if it roughly pays for itself, and only into a real crowd - but
  // the crowd it takes shrinks in the last age, where the field is thin, the
  // units are enormous and there is no next age competing for the experience.
  return count >= minCrowd && worth >= special.xpCost * 0.8;
}

export { TUNING };

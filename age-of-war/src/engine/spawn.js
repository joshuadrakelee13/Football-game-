// The build queue. Buying a unit does not put it on the field - it puts it in a
// queue, and it walks out when its build timer runs down.
//
// That delay is most of what stops the game being a click-race, and it is why
// the expensive units feel like a commitment rather than a purchase.

import { TUNING, UNITS } from '../data/balance.js';
import { makeUnit } from '../model/state.js';
import { spendGold } from './economy.js';

function doorwayClear(side, key) {
  const rear = side.units[side.units.length - 1];
  if (!rear) return true;
  const need = UNITS[key].size.radius + UNITS[rear.key].size.radius + TUNING.rankGap;
  return Math.abs(rear.x - side.base.frontX) >= need;
}

export function enqueue(side, key) {
  const def = UNITS[key];
  spendGold(side, def.cost);
  side.queue.push({ key, remaining: def.buildTime, total: def.buildTime });
  return true;
}

// Cancelling refunds in full. A deviation from the original, which had no cancel
// at all, but a misclick costing a Tank is not tension, it is just annoying.
export function cancelQueued(side, index) {
  const entry = side.queue[index];
  if (!entry) return false;
  side.queue.splice(index, 1);
  side.gold += UNITS[entry.key].cost;
  return true;
}

export function tickSpawnQueues(state, dt) {
  for (const side of state.sides) {
    const head = side.queue[0];
    if (!head) continue;
    // Only the head of the queue builds, and it stalls rather than being lost if
    // the field is full.
    if (side.units.length >= TUNING.unitCap) continue;
    head.remaining -= dt;
    if (head.remaining > 0) continue;
    // Nor will it walk out on top of the last one. Units never retreat, so a unit
    // that emerged into an occupied doorway would be stuck overlapping its own
    // column for the rest of its life. It waits for the doorway to clear instead,
    // which is also why a jammed army stops spending gold.
    if (!doorwayClear(side, head.key)) continue;

    side.queue.shift();
    const unit = makeUnit(side, head.key);
    side.units.push(unit);            // appended at the BACK, preserving the sort
    state.stats.spawned[side.index]++;
    if (state.emitEvents) state.events.push({ type: 'spawn', side: side.index, key: head.key, x: unit.x });
  }
}

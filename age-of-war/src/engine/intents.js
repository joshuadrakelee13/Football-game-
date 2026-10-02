// Every action, from the player and from the AI alike, arrives here.
//
// One queue, one validator, one applier. The AI has no privileged path into the
// state, which is the only reliable way to keep "the AI is cheating" from
// becoming true by accident.

import { UNITS } from '../data/balance.js';
import { canBuySlot, canBuyTurret, canEvolve, canFireSpecial, canSellTurret, canSpawn } from './actions.js';
import { buySlot, evolve } from './economy.js';
import { cancelQueued, enqueue } from './spawn.js';
import { fireSpecial } from './specials.js';
import { buildTurret, sellTurret } from './turrets.js';

export function queueIntent(state, intent) {
  state.intents.push(intent);
}

export function applyIntents(state) {
  if (state.intents.length === 0) return;
  const pending = state.intents;
  state.intents = [];

  for (const it of pending) {
    const side = state.sides[it.side];
    if (!side) continue;

    switch (it.type) {
      case 'spawn':
        if (canSpawn(side, it.key)) enqueue(side, it.key);
        break;
      case 'cancel':
        cancelQueued(side, it.index);
        break;
      case 'evolve':
        if (canEvolve(side)) evolve(state, side);
        break;
      case 'buySlot':
        if (canBuySlot(side)) buySlot(side);
        break;
      case 'buyTurret':
        if (canBuyTurret(side, it.key, it.slot)) buildTurret(side, it.slot, it.key);
        break;
      case 'sellTurret':
        if (canSellTurret(side, it.slot)) sellTurret(side, it.slot);
        break;
      case 'special':
        if (canFireSpecial(side)) fireSpecial(state, side);
        break;
      default:
        break;
    }
  }
}

// The Super Soldier is the original's secret: it exists in the Future Age but is
// not offered until you have seen the kind of money it costs.
export function checkSecret(state) {
  const you = state.sides[0];
  if (you.secretUnlocked) return;
  if (you.age === 4 && you.gold >= UNITS.super_soldier.cost * 0.5) {
    you.secretUnlocked = true;
    if (state.emitEvents) state.events.push({ type: 'secret' });
  }
}

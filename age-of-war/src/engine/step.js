// One simulation tick. The only function that mutates the battle.
//
// dt is always 1/60. Not "usually" - always. Game speed multiplies how many times
// this is called per frame, never the size of the step, because the moment dt
// varies the browser and the headless harness stop producing the same battle from
// the same seed and every measured balance number becomes a guess.
//
// The ordering below is deliberate. Deaths resolve once, after every source of
// damage, so a unit killed by a turret shell and a sword blow on the same tick
// pays exactly one bounty. And the AI acts on intents queued last tick, giving it
// the same one-tick reaction latency a human has.

import { applyIntents, checkSecret } from './intents.js';
import { tickEconomy } from './economy.js';
import { tickAi } from './ai.js';
import { tickSpawnQueues } from './spawn.js';
import { tickUnits } from './units.js';
import { tickTurrets } from './turrets.js';
import { tickProjectiles } from './projectiles.js';
import { tickSpecials } from './specials.js';
import { resolveDeaths } from './combat.js';
import { checkVictory } from './victory.js';

export const DT = 1 / 60;

export function step(state, dt, rng) {
  if (state.over) return state;

  state.tick++;
  state.time = state.tick * dt;      // derived, never accumulated: no float drift
  if (state.emitEvents) state.events.length = 0;

  applyIntents(state);
  tickEconomy(state, dt);
  tickAi(state, dt, rng);
  tickSpawnQueues(state, dt);
  tickUnits(state, dt);
  tickTurrets(state, dt);
  tickProjectiles(state, dt);
  tickSpecials(state, dt);
  resolveDeaths(state);
  checkSecret(state);
  checkVictory(state);

  return state;
}

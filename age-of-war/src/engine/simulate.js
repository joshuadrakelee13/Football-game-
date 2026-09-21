// The headless driver every harness uses.
//
// No rAF, no rendering, no DOM: just step() in a tight loop until somebody wins.
// A full twelve-minute battle runs in a couple of hundred milliseconds, which is
// what makes it possible to measure balance rather than guess at it.

import { Rng } from '../core/rng.js';
import { TUNING } from '../data/balance.js';
import { createState } from '../model/state.js';
import { DT, step } from './step.js';

export function runGame({ seed = 1, difficulty = 'normal', bothAi = true, policy = null, maxSeconds = TUNING.maxMatchSeconds, onTick = null } = {}) {
  const rng = new Rng(seed);
  const state = createState({ seed, difficulty });
  state.emitEvents = false;

  // In AI-vs-AI both sides run the same brain, so any asymmetry in the results
  // is a bug in the model rather than a difference in skill.
  if (bothAi) {
    state.sides[0].isAi = true;
    state.sides[0].profile = difficulty;
  }

  const maxTicks = Math.ceil(maxSeconds / DT);
  while (!state.over && state.tick < maxTicks) {
    if (policy) policy(state, state.sides[0], rng);
    step(state, DT, rng);
    if (onTick) onTick(state);
  }

  return { state, rng, seconds: state.time, winner: state.over ? state.over.winner : null, reason: state.over ? state.over.reason : 'unfinished' };
}

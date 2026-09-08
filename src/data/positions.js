// Positions, attribute weightings and formations.
//
// A player's Overall is a position-weighted blend of their attributes, which is what
// produces the brief's "striker with great finishing but poor passing": the same raw
// attributes read very differently depending on where someone plays.

import { clamp } from '../core/rng.js';

export const ATTRIBUTES = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique', 'handling', 'reflexes'];

export const ATTRIBUTE_LABELS = {
  pace: 'Pace',
  finishing: 'Finishing',
  passing: 'Passing',
  tackling: 'Tackling',
  physical: 'Physical',
  technique: 'Technique',
  handling: 'Handling',
  reflexes: 'Reflexes',
};

export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

export const POSITION_GROUP = {
  GK: 'Goalkeeper',
  CB: 'Defender', LB: 'Defender', RB: 'Defender',
  CDM: 'Midfielder', CM: 'Midfielder', CAM: 'Midfielder',
  LW: 'Forward', RW: 'Forward', ST: 'Forward',
};

// Weights sum to 1 for each position.
export const POSITION_WEIGHTS = {
  GK:  { handling: 0.35, reflexes: 0.35, physical: 0.15, passing: 0.10, technique: 0.05 },
  CB:  { tackling: 0.32, physical: 0.28, passing: 0.12, pace: 0.13, technique: 0.10, finishing: 0.05 },
  LB:  { tackling: 0.24, pace: 0.24, passing: 0.18, physical: 0.16, technique: 0.13, finishing: 0.05 },
  RB:  { tackling: 0.24, pace: 0.24, passing: 0.18, physical: 0.16, technique: 0.13, finishing: 0.05 },
  CDM: { tackling: 0.28, passing: 0.22, physical: 0.22, technique: 0.14, pace: 0.09, finishing: 0.05 },
  CM:  { passing: 0.30, technique: 0.22, physical: 0.16, tackling: 0.16, pace: 0.10, finishing: 0.06 },
  CAM: { technique: 0.28, passing: 0.26, finishing: 0.16, pace: 0.14, physical: 0.08, tackling: 0.08 },
  LW:  { pace: 0.28, technique: 0.24, finishing: 0.18, passing: 0.16, physical: 0.08, tackling: 0.06 },
  RW:  { pace: 0.28, technique: 0.24, finishing: 0.18, passing: 0.16, physical: 0.08, tackling: 0.06 },
  ST:  { finishing: 0.38, pace: 0.20, physical: 0.18, technique: 0.16, passing: 0.05, tackling: 0.03 },
};

// How much of a player's ability survives being played out of position (1 = natural).
const ADJACENCY = {
  GK: { GK: 1 },
  CB: { CB: 1, LB: 0.85, RB: 0.85, CDM: 0.82 },
  LB: { LB: 1, RB: 0.9, CB: 0.85, LW: 0.8, CDM: 0.75 },
  RB: { RB: 1, LB: 0.9, CB: 0.85, RW: 0.8, CDM: 0.75 },
  CDM: { CDM: 1, CM: 0.92, CB: 0.82, LB: 0.72, RB: 0.72 },
  CM: { CM: 1, CDM: 0.92, CAM: 0.9, LW: 0.75, RW: 0.75 },
  CAM: { CAM: 1, CM: 0.9, LW: 0.85, RW: 0.85, ST: 0.82 },
  LW: { LW: 1, RW: 0.93, CAM: 0.85, ST: 0.8, LB: 0.72 },
  RW: { RW: 1, LW: 0.93, CAM: 0.85, ST: 0.8, RB: 0.72 },
  ST: { ST: 1, CAM: 0.82, LW: 0.8, RW: 0.8 },
};

// Anyone genuinely out of position keeps 60% of their ability; a keeper outfield is a disaster.
export function positionFit(naturalPos, slotPos) {
  if (naturalPos === slotPos) return 1;
  if (naturalPos === 'GK' || slotPos === 'GK') return 0.35;
  return ADJACENCY[naturalPos]?.[slotPos] ?? 0.6;
}

// Weighted sum of attributes against any weight table that sums to 1. The core of
// overallFor, extracted so roleFit can reuse it against a role's weight table instead
// of a position's, without duplicating the loop.
export function blend(attributes, weights) {
  let total = 0;
  for (const key in weights) total += (attributes[key] || 0) * (weights[key] || 0);
  return total;
}

// Overall rating from raw attributes, for a given position.
export function overallFor(attributes, position) {
  return Math.round(blend(attributes, POSITION_WEIGHTS[position]));
}

export const FORMATIONS = {
  '4-4-2': {
    name: '4-4-2',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
    bias: { attack: 1.00, midfield: 0.96, defence: 1.02 },
    note: 'Balanced and orthodox. Two up top, solid bank of four.',
  },
  '4-3-3': {
    name: '4-3-3',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RW', 'ST', 'LW'],
    bias: { attack: 1.08, midfield: 1.04, defence: 0.94 },
    note: 'Front-foot football. Strong midfield, exposed at the back.',
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CDM', 'RW', 'CAM', 'LW', 'ST'],
    bias: { attack: 1.02, midfield: 1.08, defence: 1.00 },
    note: 'Control the middle. Double pivot shields the defence.',
  },
  '3-5-2': {
    name: '3-5-2',
    slots: ['GK', 'CB', 'CB', 'CB', 'RW', 'CM', 'CDM', 'CM', 'LW', 'ST', 'ST'],
    bias: { attack: 1.05, midfield: 1.06, defence: 0.95 },
    note: 'Wing-backs push on. Overloads midfield, vulnerable in wide areas.',
  },
  '5-3-2': {
    name: '5-3-2',
    slots: ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CDM', 'CM', 'ST', 'ST'],
    bias: { attack: 0.90, midfield: 0.96, defence: 1.14 },
    note: 'Sit deep and frustrate. Built for surviving against better sides.',
  },
  '4-5-1': {
    name: '4-5-1',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CDM', 'CM', 'LW', 'ST'],
    bias: { attack: 0.93, midfield: 1.10, defence: 1.05 },
    note: 'Congest the middle. Hard to beat, light in attack.',
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

// Which line of the team each slot contributes to when rating a side.
export const SLOT_LINE = {
  GK: 'gk',
  CB: 'defence', LB: 'defence', RB: 'defence',
  CDM: 'defence', CM: 'midfield', CAM: 'midfield',
  LW: 'attack', RW: 'attack', ST: 'attack',
};

// CDM and CAM straddle two lines; this splits their contribution.
export const SLOT_SPLIT = {
  CDM: { defence: 0.45, midfield: 0.55 },
  CAM: { midfield: 0.55, attack: 0.45 },
  LB: { defence: 0.8, midfield: 0.2 },
  RB: { defence: 0.8, midfield: 0.2 },
  LW: { attack: 0.8, midfield: 0.2 },
  RW: { attack: 0.8, midfield: 0.2 },
  CM: { midfield: 0.85, defence: 0.075, attack: 0.075 },
};

// ---------------------------------------------------------------------------
// Tactical roles and duties.
//
// A role reweights how a player's own attributes translate into his rating for a
// slot — a striker told to play as a Poacher is judged almost entirely on finishing;
// told to play as a Target man, on physicality instead. This is deliberately built as
// a variant of POSITION_WEIGHTS, not a parallel system: every role redistributes a
// fixed slice of the position's own weight from an attribute it de-emphasises to one
// it favours, so every role table still sums to 1 exactly like POSITION_WEIGHTS does.
// ---------------------------------------------------------------------------

// Moves `amount` of weight from `reduceKeys` to `favorKeys`, proportionally drawn off
// whatever `reduceKeys` actually have to give (so a role can never push a weight
// negative), and conserves the total — the result still sums to 1.
function shiftWeights(base, favorKeys, reduceKeys, amount) {
  const out = { ...base };
  const reducible = reduceKeys.reduce((sum, k) => sum + (out[k] || 0), 0);
  const take = Math.min(amount, reducible * 0.7);
  if (take > 0) {
    for (const k of reduceKeys) out[k] = (out[k] || 0) - take * ((out[k] || 0) / reducible);
    for (const k of favorKeys) out[k] = (out[k] || 0) + take / favorKeys.length;
  }
  return out;
}

const ROLE_SHIFT = 0.18;

// 2 roles per slot, deliberately reusing the archetype vocabulary already shown on a
// player's card (src/model/player.js's ARCHETYPES) wherever a natural match exists,
// so the same words mean the same thing whether you're reading a scout report or
// setting a tactic.
export const ROLE_OPTIONS = {
  GK:  ['shot-stopper', 'sweeper-keeper'],
  CB:  ['no-nonsense', 'ball-playing'],
  LB:  ['full-back', 'wing-back'],
  RB:  ['full-back', 'wing-back'],
  CDM: ['destroyer', 'deep-lying-playmaker'],
  CM:  ['ball-winner', 'playmaker'],
  CAM: ['shadow-striker', 'advanced-playmaker'],
  LW:  ['winger', 'inside-forward'],
  RW:  ['winger', 'inside-forward'],
  ST:  ['target-man', 'poacher'],
};

export const ROLE_LABELS = {
  'shot-stopper': 'Shot-stopper', 'sweeper-keeper': 'Sweeper keeper',
  'no-nonsense': 'No-nonsense', 'ball-playing': 'Ball-playing',
  'full-back': 'Full-back', 'wing-back': 'Wing-back',
  'destroyer': 'Destroyer', 'deep-lying-playmaker': 'Deep-lying playmaker',
  'ball-winner': 'Ball-winner', 'playmaker': 'Playmaker',
  'shadow-striker': 'Shadow striker', 'advanced-playmaker': 'Advanced playmaker',
  'winger': 'Winger', 'inside-forward': 'Inside forward',
  'target-man': 'Target man', 'poacher': 'Poacher',
};

const ROLE_SHAPE = {
  GK:  { 'shot-stopper': [['reflexes'], ['passing']], 'sweeper-keeper': [['passing'], ['reflexes']] },
  CB:  { 'no-nonsense': [['tackling', 'physical'], ['passing', 'technique']], 'ball-playing': [['passing', 'technique'], ['tackling', 'physical']] },
  LB:  { 'full-back': [['tackling', 'physical'], ['pace']], 'wing-back': [['pace', 'passing'], ['tackling']] },
  RB:  { 'full-back': [['tackling', 'physical'], ['pace']], 'wing-back': [['pace', 'passing'], ['tackling']] },
  CDM: { 'destroyer': [['tackling', 'physical'], ['passing', 'technique']], 'deep-lying-playmaker': [['passing', 'technique'], ['tackling', 'physical']] },
  CM:  { 'ball-winner': [['tackling', 'physical'], ['passing', 'technique']], 'playmaker': [['passing', 'technique'], ['physical', 'tackling']] },
  CAM: { 'shadow-striker': [['finishing', 'pace'], ['passing']], 'advanced-playmaker': [['passing', 'technique'], ['finishing']] },
  LW:  { 'winger': [['pace'], ['finishing', 'technique']], 'inside-forward': [['finishing', 'technique'], ['pace']] },
  RW:  { 'winger': [['pace'], ['finishing', 'technique']], 'inside-forward': [['finishing', 'technique'], ['pace']] },
  ST:  { 'target-man': [['physical'], ['pace']], 'poacher': [['finishing'], ['passing', 'tackling']] },
};

// Built once, from POSITION_WEIGHTS, rather than hand-typed — guarantees every role
// table sums to exactly 1 the same way POSITION_WEIGHTS does, with no risk of a typo
// leaving a table over- or under-weighted.
export const ROLE_WEIGHTS = {};
for (const slot of POSITIONS) {
  ROLE_WEIGHTS[slot] = {};
  for (const [role, [favor, reduce]] of Object.entries(ROLE_SHAPE[slot] || {})) {
    ROLE_WEIGHTS[slot][role] = shiftWeights(POSITION_WEIGHTS[slot], favor, reduce, ROLE_SHIFT);
  }
}

// How well a player's own attributes suit a role, relative to how they suit the slot
// generically. 1 = neutral (also the exact value for roleKey null, the "no role
// assigned" default) — a mismatched role costs a player rating, a suited one earns it,
// clamped to a deliberately modest band so role choice nudges a lineup rather than
// remaking it.
export function roleFit(player, slot, roleKey) {
  if (!roleKey) return 1;
  const roleWeights = ROLE_WEIGHTS[slot]?.[roleKey];
  const baseWeights = POSITION_WEIGHTS[slot];
  if (!roleWeights || !baseWeights) return 1;
  const baseBlend = blend(player.attributes, baseWeights);
  if (baseBlend <= 0) return 1;
  const roleBlend = blend(player.attributes, roleWeights);
  return clamp(roleBlend / baseBlend, 0.85, 1.15);
}

// ---------------------------------------------------------------------------
// Duty: attack / support / defend. Shifts weight along whichever pair of lines a
// slot naturally straddles — extending SLOT_SPLIT/SLOT_LINE rather than replacing
// them. GK is intentionally absent: a goalkeeper's duty is a no-op.
// ---------------------------------------------------------------------------

export const DUTY_OPTIONS = ['defend', 'support', 'attack'];
export const DUTY_SHIFT = { defend: -0.12, support: 0, attack: 0.12 };

export const ADJACENT_LINE = {
  CB:  { back: 'defence', forward: 'midfield' },
  LB:  { back: 'defence', forward: 'attack' },
  RB:  { back: 'defence', forward: 'attack' },
  CDM: { back: 'defence', forward: 'midfield' },
  CM:  { back: 'defence', forward: 'attack' },
  CAM: { back: 'midfield', forward: 'attack' },
  LW:  { back: 'midfield', forward: 'attack' },
  RW:  { back: 'midfield', forward: 'attack' },
  ST:  { back: 'midfield', forward: 'attack' },
};

// How one player's duty nudges the two lines it points between.
//
// The first version of this redistributed the player's *weight* between lines at
// his own face-value rating — which sounds right, but isn't: in a weighted average,
// adding a contributor only raises the average if his own rating happens to exceed
// what's already there, and lowers it otherwise. Tested against 60 random rosters,
// "attack duty" raised the attack line only 35 times out of 60 — a coin flip, not a
// tactic. That's exactly the practical-not-performative trap: it would have shipped
// looking like a real lever while actually depending on whether this particular
// player happened to be better or worse than his teammates.
//
// Instead, duty works the same way mentality does: a small, unconditional bias per
// player, aggregated across the XI and applied to the final line averages in
// teamRatings — guaranteed monotonic by construction, the same mechanism family as
// formation.bias and mentalityBias, not a new one.
export function dutyLineBias(slot, duty) {
  const pair = ADJACENT_LINE[slot];
  const shift = DUTY_SHIFT[duty];
  if (!pair || !shift) return null;
  const forward = shift > 0;
  return {
    toward: forward ? pair.forward : pair.back,
    away: forward ? pair.back : pair.forward,
    magnitude: Math.abs(shift),
  };
}

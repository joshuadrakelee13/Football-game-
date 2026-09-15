// The full FM-style attribute set, and the machinery that compiles per-position and
// per-role weight tables from small hand-authored profiles instead of 47-wide tables
// hand-typed for 10 positions and 16 roles.
//
// Nothing here is wired into the live game yet. positions.js's own POSITION_WEIGHTS,
// ROLE_WEIGHTS and overallFor are untouched — players still carry the original 8
// attributes (see model/player.js), so FULL_POSITION_WEIGHTS/FULL_ROLE_WEIGHTS below
// have nothing real to rate. This phase builds and proves the compiler; a later phase
// generates players against the full set, and only then does overallFor switch over —
// deliberately alone, since that is the one change that can move a balance number.

import { POSITIONS, ATTR_SCALE } from './positions.js';

// ---------------------------------------------------------------------------
// Visible attributes — 1-20, same scale and meaning as FM's own. 14 technical +
// 14 mental + 8 physical + 11 goalkeeping-exclusive = 47. firstTouch, passing and
// technique are shared between outfield technical and goalkeeping rather than
// duplicated, which is also how FM itself treats those three.
// ---------------------------------------------------------------------------

const TECHNICAL = ['corners', 'crossing', 'dribbling', 'finishing', 'firstTouch', 'freeKicks',
  'heading', 'longShots', 'longThrows', 'marking', 'passing', 'penalties', 'tackling', 'technique'];
const MENTAL = ['aggression', 'anticipation', 'bravery', 'composure', 'concentration', 'decisions',
  'determination', 'flair', 'leadership', 'offTheBall', 'positioning', 'teamwork', 'vision', 'workRate'];
const PHYSICAL = ['acceleration', 'agility', 'balance', 'jumping', 'naturalFitness', 'pace', 'stamina', 'strength'];
const GOALKEEPING = ['aerialReach', 'commandOfArea', 'communication', 'eccentricity', 'handling',
  'kicking', 'oneOnOnes', 'punching', 'reflexes', 'rushingOut', 'throwing'];

export const VISIBLE_ATTRIBUTES = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...GOALKEEPING];

// For the three-column UI grid (a later phase) — which of the four FM categories an
// attribute is shown under. Independent of GROUPS below: category is a display
// concern, GROUPS is about which attributes move together for a position/role, and
// the two axes don't line up (Heading is a Technical attribute on FM's own card, but
// belongs with Jumping/Bravery for the purpose of rating an aerial threat).
export const ATTRIBUTE_CATEGORY = {};
for (const a of TECHNICAL) ATTRIBUTE_CATEGORY[a] = 'technical';
for (const a of MENTAL) ATTRIBUTE_CATEGORY[a] = 'mental';
for (const a of PHYSICAL) ATTRIBUTE_CATEGORY[a] = 'physical';
for (const a of GOALKEEPING) ATTRIBUTE_CATEGORY[a] = 'goalkeeping';

export const VISIBLE_ATTRIBUTE_LABELS = {
  corners: 'Corners', crossing: 'Crossing', dribbling: 'Dribbling', finishing: 'Finishing',
  firstTouch: 'First Touch', freeKicks: 'Free Kick Taking', heading: 'Heading',
  longShots: 'Long Shots', longThrows: 'Long Throws', marking: 'Marking', passing: 'Passing',
  penalties: 'Penalty Taking', tackling: 'Tackling', technique: 'Technique',
  aggression: 'Aggression', anticipation: 'Anticipation', bravery: 'Bravery', composure: 'Composure',
  concentration: 'Concentration', decisions: 'Decisions', determination: 'Determination', flair: 'Flair',
  leadership: 'Leadership', offTheBall: 'Off the Ball', positioning: 'Positioning', teamwork: 'Teamwork',
  vision: 'Vision', workRate: 'Work Rate',
  acceleration: 'Acceleration', agility: 'Agility', balance: 'Balance', jumping: 'Jumping Reach',
  naturalFitness: 'Natural Fitness', pace: 'Pace', stamina: 'Stamina', strength: 'Strength',
  aerialReach: 'Aerial Reach', commandOfArea: 'Command of Area', communication: 'Communication',
  eccentricity: 'Eccentricity', handling: 'Handling', kicking: 'Kicking', oneOnOnes: 'One on Ones',
  punching: 'Punching (Tendency)', reflexes: 'Reflexes', rushingOut: 'Rushing Out (Tendency)',
  throwing: 'Throwing',
};

// ---------------------------------------------------------------------------
// Traits (PPMs) — a representative subset rather than FM's full ~60, gated on
// attribute thresholds and (where it only makes football sense for some positions)
// a position filter. Generation weights the roll so most players carry none.
// ---------------------------------------------------------------------------

export const TRAITS = [
  { id: 'long-shots', label: 'Tries Long Range Shots', gate: (a) => a.longShots >= 14 },
  { id: 'dives-into-tackles', label: 'Dives Into Tackles', gate: (a) => a.tackling >= 14 && a.aggression >= 13 },
  { id: 'no-through-balls', label: 'Plays No Through Balls', gate: (a) => a.passing <= 9 },
  { id: 'comes-deep', label: 'Comes Deep to Get the Ball', gate: (a) => a.vision >= 14,
    positions: ['ST', 'LW', 'RW', 'CAM'] },
  { id: 'gets-forward', label: 'Gets Into Opposition Area', gate: (a) => a.offTheBall >= 14,
    positions: ['CM', 'CDM', 'LB', 'RB'] },
  { id: 'arrives-late', label: 'Arrives Late in the Box', gate: (a) => a.offTheBall >= 15 && a.stamina >= 13,
    positions: ['CM', 'CAM'] },
  { id: 'long-throw', label: 'Long Throw Expert', gate: (a) => a.longThrows >= 15 },
  { id: 'rounds-keeper', label: 'Likes to Round the Keeper', gate: (a) => a.composure >= 15 && a.finishing >= 14,
    positions: ['ST', 'LW', 'RW', 'CAM'] },
  { id: 'runs-with-ball', label: 'Runs With Ball Often', gate: (a) => a.dribbling >= 14 && a.flair >= 13 },
  { id: 'plays-out-defence', label: 'Tries to Play Out of Defence', gate: (a) => a.passing >= 13,
    positions: ['CB', 'LB', 'RB'] },
  { id: 'sweeper-keeper-trait', label: 'Sweeps Up Behind the Defence', gate: (a) => a.rushingOut >= 14,
    positions: ['GK'] },
  { id: 'saves-with-feet', label: 'Likes to Save With Feet', gate: (a) => a.reflexes >= 13, positions: ['GK'] },
];

export const TRAIT_LABELS = Object.fromEntries(TRAITS.map((t) => [t.id, t.label]));

// ---------------------------------------------------------------------------
// Hidden attributes. Note for the record: the programme roadmap estimated "~20" —
// the real, well-documented FM hidden/personality set is 13. Implemented as 13 here
// deliberately, rather than padded to the round estimate with invented ones.
// Determination is NOT here — in FM it is a visible Mental attribute (above).
// ---------------------------------------------------------------------------

export const HIDDEN_ATTRIBUTES = ['adaptability', 'ambition', 'consistency', 'controversy', 'dirtiness',
  'importantMatches', 'injuryProneness', 'loyalty', 'professionalism', 'pressure', 'sportsmanship',
  'temperament', 'versatility'];

export const HIDDEN_ATTRIBUTE_LABELS = {
  adaptability: 'Adaptability', ambition: 'Ambition', consistency: 'Consistency',
  controversy: 'Controversy', dirtiness: 'Dirtiness', importantMatches: 'Important Matches',
  injuryProneness: 'Injury Proneness', loyalty: 'Loyalty', professionalism: 'Professionalism',
  pressure: 'Pressure', sportsmanship: 'Sportsmanship', temperament: 'Temperament',
  versatility: 'Versatility',
};

// ---------------------------------------------------------------------------
// Groups — attributes that move together for the purpose of rating a position or a
// role. Every visible attribute belongs to exactly one group (partitions the 47), so
// a profile can hand a group a single share and have it spread over every member,
// rather than naming all 47 attributes for every position.
// ---------------------------------------------------------------------------

export const GROUPS = {
  shooting: ['finishing', 'longShots', 'penalties', 'freeKicks'],
  creation: ['passing', 'vision', 'crossing', 'flair', 'corners'],
  ballControl: ['technique', 'firstTouch', 'dribbling', 'longThrows'],
  defending: ['tackling', 'marking', 'positioning', 'anticipation'],
  aerial: ['heading', 'jumping', 'bravery'],
  speed: ['pace', 'acceleration', 'agility'],
  power: ['strength', 'stamina', 'balance', 'naturalFitness'],
  workRate: ['workRate', 'teamwork', 'determination', 'aggression'],
  composure: ['decisions', 'concentration', 'composure', 'offTheBall', 'leadership'],
  gkStopping: ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'punching'],
  gkSweeping: ['rushingOut', 'kicking', 'throwing', 'commandOfArea', 'communication', 'eccentricity'],
};

// ---------------------------------------------------------------------------
// The compiler. A profile is { groups: {name: share}, key: {attr: share} } — every
// group's share is split evenly over its members, every key share is added on top
// (an attribute can sit inside a weighted group *and* get an individual boost — a
// centre-back's Marking is both "part of defending" and individually decisive). The
// two halves of a profile must sum to 1 between them; buildWeights throws rather than
// silently normalising, so an authoring slip is caught immediately, not absorbed.
// ---------------------------------------------------------------------------

export function buildWeights(profile, label = '') {
  const weights = {};
  for (const attr of VISIBLE_ATTRIBUTES) weights[attr] = 0;

  for (const [groupName, share] of Object.entries(profile.groups || {})) {
    const members = GROUPS[groupName];
    if (!members) throw new Error(`buildWeights(${label}): unknown group "${groupName}"`);
    const per = share / members.length;
    for (const attr of members) weights[attr] += per;
  }
  for (const [attr, share] of Object.entries(profile.key || {})) {
    if (!(attr in weights)) throw new Error(`buildWeights(${label}): unknown attribute "${attr}"`);
    weights[attr] += share;
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`buildWeights(${label}): weights sum to ${total}, expected 1`);
  }
  for (const [attr, w] of Object.entries(weights)) {
    if (w < -1e-12) throw new Error(`buildWeights(${label}): negative weight on "${attr}"`);
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Position profiles. Each is deliberately authored fresh for realism rather than
// reverse-engineered from the old 8-attribute POSITION_WEIGHTS — the attribute set is
// richer, not just relabelled, and tools/attribute-test.mjs checks the two agree
// directionally (same attribute *family* on top for each position) rather than
// numerically. The eventual live numbers are calibrated separately, once players
// actually carry the full set.
// ---------------------------------------------------------------------------

export const POSITION_PROFILE = {
  GK: {
    key: { reflexes: 0.16, handling: 0.12, commandOfArea: 0.05, oneOnOnes: 0.05 },
    groups: { gkStopping: 0.10, gkSweeping: 0.16, composure: 0.16, power: 0.10, aerial: 0.06, speed: 0.04 },
  },
  CB: {
    key: { marking: 0.05, tackling: 0.04, heading: 0.03 },
    groups: { defending: 0.22, aerial: 0.15, power: 0.14, composure: 0.10, speed: 0.08,
      creation: 0.06, ballControl: 0.06, shooting: 0.02, workRate: 0.05 },
  },
  LB: {
    key: { tackling: 0.03, pace: 0.04 },
    groups: { speed: 0.12, defending: 0.23, power: 0.10, creation: 0.14, ballControl: 0.10,
      workRate: 0.08, composure: 0.08, aerial: 0.06, shooting: 0.02 },
  },
  RB: {
    key: { tackling: 0.03, pace: 0.04 },
    groups: { speed: 0.12, defending: 0.23, power: 0.10, creation: 0.14, ballControl: 0.10,
      workRate: 0.08, composure: 0.08, aerial: 0.06, shooting: 0.02 },
  },
  CDM: {
    key: { tackling: 0.04, positioning: 0.03, decisions: 0.03 },
    groups: { defending: 0.18, power: 0.12, creation: 0.16, ballControl: 0.10, composure: 0.14,
      workRate: 0.10, speed: 0.06, aerial: 0.02, shooting: 0.02 },
  },
  CM: {
    key: { passing: 0.04, decisions: 0.03 },
    groups: { creation: 0.18, ballControl: 0.14, defending: 0.12, power: 0.10, composure: 0.14,
      workRate: 0.10, speed: 0.08, aerial: 0.02, shooting: 0.05 },
  },
  CAM: {
    key: { passing: 0.04, vision: 0.04, finishing: 0.03 },
    groups: { creation: 0.20, ballControl: 0.16, shooting: 0.14, composure: 0.14, speed: 0.10,
      workRate: 0.06, power: 0.05, defending: 0.04 },
  },
  LW: {
    key: { pace: 0.05, dribbling: 0.04 },
    groups: { speed: 0.14, ballControl: 0.18, shooting: 0.16, creation: 0.16, composure: 0.08,
      power: 0.08, workRate: 0.06, defending: 0.04, aerial: 0.01 },
  },
  RW: {
    key: { pace: 0.05, dribbling: 0.04 },
    groups: { speed: 0.14, ballControl: 0.18, shooting: 0.16, creation: 0.16, composure: 0.08,
      power: 0.08, workRate: 0.06, defending: 0.04, aerial: 0.01 },
  },
  ST: {
    key: { finishing: 0.08, composure: 0.03 },
    groups: { shooting: 0.20, speed: 0.14, aerial: 0.10, power: 0.12, ballControl: 0.12,
      creation: 0.08, composure: 0.08, workRate: 0.04, defending: 0.01 },
  },
};

export const FULL_POSITION_WEIGHTS = {};
for (const pos of POSITIONS) {
  FULL_POSITION_WEIGHTS[pos] = buildWeights(POSITION_PROFILE[pos], pos);
}

// ---------------------------------------------------------------------------
// Roles — the same shiftWeights technique positions.js's own ROLE_WEIGHTS uses (move
// a fixed slice of weight from what a role de-emphasises to what it favours,
// proportionally drawn so nothing goes negative), extended to accept group names as
// well as individual attributes, so a role shape stays one readable line instead of
// spelling out every member attribute by hand.
// ---------------------------------------------------------------------------

function resolveNames(names) {
  const out = [];
  for (const n of names) {
    if (GROUPS[n]) out.push(...GROUPS[n]);
    else out.push(n);
  }
  return out;
}

export function shiftWeightsByGroup(base, favorNames, reduceNames, amount) {
  const favor = resolveNames(favorNames);
  const reduce = resolveNames(reduceNames);
  const out = { ...base };
  const reducible = reduce.reduce((sum, k) => sum + (out[k] || 0), 0);
  const take = Math.min(amount, reducible * 0.7);
  if (take > 0) {
    for (const k of reduce) out[k] = (out[k] || 0) - take * ((out[k] || 0) / reducible);
    for (const k of favor) out[k] = (out[k] || 0) + take / favor.length;
  }
  return out;
}

const FULL_ROLE_SHIFT = 0.18;

// Same 16 unique role names as positions.js's ROLE_OPTIONS/ROLE_LABELS (LB/RB share
// full-back/wing-back, LW/RW share winger/inside-forward) — kept in lockstep
// deliberately, since a role picked in the tactics UI has to mean the same thing here.
const FULL_ROLE_SHAPE = {
  GK: {
    'shot-stopper': [['reflexes', 'aerial'], ['gkSweeping']],
    'sweeper-keeper': [['gkSweeping', 'speed'], ['gkStopping']],
  },
  CB: {
    'no-nonsense': [['tackling', 'aerial', 'power'], ['creation', 'ballControl']],
    'ball-playing': [['creation', 'ballControl'], ['aerial', 'power']],
  },
  LB: {
    'full-back': [['defending', 'power'], ['creation']],
    'wing-back': [['speed', 'creation'], ['defending']],
  },
  RB: {
    'full-back': [['defending', 'power'], ['creation']],
    'wing-back': [['speed', 'creation'], ['defending']],
  },
  CDM: {
    'destroyer': [['defending', 'power'], ['creation', 'ballControl']],
    'deep-lying-playmaker': [['creation', 'ballControl'], ['defending', 'power']],
  },
  CM: {
    'ball-winner': [['defending', 'power'], ['creation', 'ballControl']],
    'playmaker': [['creation', 'ballControl'], ['power', 'defending']],
  },
  CAM: {
    'shadow-striker': [['shooting', 'speed'], ['creation']],
    'advanced-playmaker': [['creation', 'ballControl'], ['shooting']],
  },
  LW: {
    'winger': [['speed'], ['shooting', 'ballControl']],
    'inside-forward': [['shooting', 'ballControl'], ['speed']],
  },
  RW: {
    'winger': [['speed'], ['shooting', 'ballControl']],
    'inside-forward': [['shooting', 'ballControl'], ['speed']],
  },
  ST: {
    'target-man': [['aerial', 'power'], ['speed']],
    'poacher': [['shooting'], ['creation', 'defending']],
  },
};

export const FULL_ROLE_WEIGHTS = {};
for (const slot of POSITIONS) {
  FULL_ROLE_WEIGHTS[slot] = {};
  for (const [role, [favor, reduce]] of Object.entries(FULL_ROLE_SHAPE[slot] || {})) {
    FULL_ROLE_WEIGHTS[slot][role] = shiftWeightsByGroup(FULL_POSITION_WEIGHTS[slot], favor, reduce, FULL_ROLE_SHIFT);
  }
}

// Weighted sum with each attribute lifted from 1-20 to 0-99 before it is weighted —
// see positions.js's blend99 for why this has to happen per-term, not on the total.
function blendFull(attributes, weights) {
  let total = 0;
  for (const key in weights) total += (attributes[key] || 0) * ATTR_SCALE * (weights[key] || 0);
  return total;
}

// How well a player suits a specific role in a specific slot, 0-99 — the full-set
// analogue of overallFor, and what a role-suitability display consumes. Falls back to
// the bare position rating when roleKey is null. Inert until a later phase gives
// players the full attribute set to rate — nothing calls this yet.
export function roleRating(player, slot, roleKey) {
  const weights = roleKey ? FULL_ROLE_WEIGHTS[slot]?.[roleKey] : FULL_POSITION_WEIGHTS[slot];
  if (!weights || !player?.attributes) return null;
  return Math.round(blendFull(player.attributes, weights));
}

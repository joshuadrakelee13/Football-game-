// Positions, attribute weightings and formations.
//
// A player's Overall is a position-weighted blend of their attributes, which is what
// produces the brief's "striker with great finishing but poor passing": the same raw
// attributes read very differently depending on where someone plays.

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

// Overall rating from raw attributes, for a given position.
export function overallFor(attributes, position) {
  const weights = POSITION_WEIGHTS[position];
  let total = 0;
  for (const key in weights) total += (attributes[key] || 0) * weights[key];
  return Math.round(total);
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

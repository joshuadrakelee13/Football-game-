// Team tactics: mentality, pressing, tempo, width, opposition focus.
//
// Every dial below is a no-op at its neutral value (0 / false). That is what makes
// the match-engine wiring safe to build incrementally — nothing changes for a club
// until something actually sets it away from neutral, and every factor function here
// is where the numbers live, not scattered through match.js as magic constants.

export const DIAL_KEYS = ['mentality', 'pressing', 'tempo', 'width'];

export function defaultTactics() {
  return { mentality: 0, pressing: 0, tempo: 0, width: 0, oppositionFocus: false };
}

export function clampDial(v) {
  return Math.max(-2, Math.min(2, Math.round(v)));
}

export const DIAL_LABELS = {
  mentality: {
    name: 'Mentality',
    levels: ['Very Defensive', 'Defensive', 'Balanced', 'Attacking', 'Very Attacking'],
  },
  pressing: {
    name: 'Pressing',
    levels: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
  },
  tempo: {
    name: 'Tempo',
    levels: ['Very Slow', 'Slow', 'Balanced', 'Fast', 'Very Fast'],
  },
  width: {
    name: 'Width',
    levels: ['Very Narrow', 'Narrow', 'Balanced', 'Wide', 'Very Wide'],
  },
};

export function dialLevelLabel(dial, value) {
  return DIAL_LABELS[dial].levels[clampDial(value) + 2];
}

// ---------------------------------------------------------------------------
// Mentality: the same mechanism as a formation's own attack/defence bias in
// src/data/positions.js — composed multiplicatively alongside it in teamRatings(),
// not replacing it. Comparable magnitude to formation's own spread (0.90-1.14).
// ---------------------------------------------------------------------------
const MENTALITY_BIAS = {
  '-2': { attack: 0.90, defence: 1.10 },
  '-1': { attack: 0.95, defence: 1.05 },
  '0': { attack: 1.00, defence: 1.00 },
  '1': { attack: 1.05, defence: 0.96 },
  '2': { attack: 1.10, defence: 0.92 },
};

export function mentalityBias(value) {
  return MENTALITY_BIAS[String(clampDial(value))];
}

// ---------------------------------------------------------------------------
// Pressing: raises effective defence at the cost of fitness and discipline. No
// turnover/counter-attack sub-model exists in the match engine, so pressing's usual
// "leaves space in behind" downside is represented only through fatigue and cards,
// not through extra chances conceded — a deliberate simplification, not an oversight.
// ---------------------------------------------------------------------------
const PRESSING_DEFENCE = { '-2': 0.94, '-1': 0.97, '0': 1.00, '1': 1.04, '2': 1.08 };
const PRESSING_FATIGUE = { '-2': 0.85, '-1': 0.92, '0': 1.00, '1': 1.12, '2': 1.24 };
const PRESSING_FOUL = { '-2': 0.85, '-1': 0.92, '0': 1.00, '1': 1.13, '2': 1.28 };

export function pressingDefenceFactor(value) { return PRESSING_DEFENCE[String(clampDial(value))]; }
export function pressingFatigueFactor(value) { return PRESSING_FATIGUE[String(clampDial(value))]; }
export function pressingFoulFactor(value) { return PRESSING_FOUL[String(clampDial(value))]; }

// ---------------------------------------------------------------------------
// Tempo: a volume-for-quality trade. Raises shot count, lowers on-target share (or
// the reverse at low tempo). Deliberately does not touch fatigue — that is pressing's
// signature, and the two need non-overlapping fingerprints for the validation harness
// to be able to tell them apart.
// ---------------------------------------------------------------------------
const TEMPO_VOLUME = { '-2': 0.90, '-1': 0.95, '0': 1.00, '1': 1.07, '2': 1.13 };
const TEMPO_QUALITY = { '-2': 0.018, '-1': 0.009, '0': 0, '1': -0.011, '2': -0.020 };

export function tempoVolumeFactor(value) { return TEMPO_VOLUME[String(clampDial(value))]; }
export function tempoQualityAdjust(value) { return TEMPO_QUALITY[String(clampDial(value))]; }

// ---------------------------------------------------------------------------
// Width: redistributes where goals/assists come from (wide vs central) without
// changing a team's overall attack rating, plus a corners signal. A distinct
// fingerprint from every volume/quality lever above.
// ---------------------------------------------------------------------------
const WIDE_SLOTS = new Set(['LW', 'RW', 'LB', 'RB']);
const CENTRAL_SLOTS = new Set(['CAM', 'CM', 'CDM', 'ST']);

const WIDTH_WIDE_BONUS = { '-2': 0.80, '-1': 0.90, '0': 1.00, '1': 1.12, '2': 1.26 };
const WIDTH_CENTRAL_BONUS = { '-2': 1.16, '-1': 1.08, '0': 1.00, '1': 0.93, '2': 0.85 };
const WIDTH_CORNER = { '-2': 0.82, '-1': 0.91, '0': 1.00, '1': 1.10, '2': 1.22 };

// How involved a slot is in a chance for a given width setting — multiplies the
// existing SCORER_WEIGHT/ASSIST_WEIGHT positional term in match.js's pickWeighted.
export function widthInvolvement(slot, value) {
  const level = String(clampDial(value));
  if (WIDE_SLOTS.has(slot)) return WIDTH_WIDE_BONUS[level];
  if (CENTRAL_SLOTS.has(slot)) return WIDTH_CENTRAL_BONUS[level];
  return 1;
}

export function widthCornerFactor(value) { return WIDTH_CORNER[String(clampDial(value))]; }

// ---------------------------------------------------------------------------
// Duty involvement: how often a player in an attack/defend duty gets the ball in a
// scoring or assisting position, mirroring width's mechanism at the individual level.
// ---------------------------------------------------------------------------
const DUTY_INVOLVEMENT = { defend: 0.85, support: 1.00, attack: 1.15 };

export function dutyInvolvement(duty) {
  return DUTY_INVOLVEMENT[duty] ?? 1;
}

// ---------------------------------------------------------------------------
// Opposition focus: debuffs one named opposing player's contribution for that match
// only (never persisted — the target is recomputed fresh every fixture so it can
// never go stale). Carries a small cost to the focusing side's own defensive
// organisation, so — like every other lever here — it is a trade, not a free lunch.
// ---------------------------------------------------------------------------
export const OPPOSITION_FOCUS_TARGET_DEBUFF = 0.90;
export const OPPOSITION_FOCUS_OWN_DEFENCE_COST = 0.97;

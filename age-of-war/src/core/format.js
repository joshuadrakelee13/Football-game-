// Number formatting for the HUD. Gold runs from 15 to 150,000 across a game, so
// it needs to stay readable at both ends without the column jumping width.

export function gold(n) {
  const v = Math.floor(n);
  if (v >= 1_000_000) return trimZero((v / 1_000_000).toFixed(2)) + 'M';
  if (v >= 10_000) return Math.round(v / 1000) + 'k';
  if (v >= 1000) return trimZero((v / 1000).toFixed(1)) + 'k';
  return String(v);
}

export function xp(n) {
  return gold(n);
}

// Whole numbers with thousand separators, for end-of-game stats.
export function num(n) {
  return Math.round(n).toLocaleString('en-GB');
}

// Elapsed match time as m:ss.
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const pct = (ratio) => `${Math.round(ratio * 100)}%`;

function trimZero(v) {
  return v.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

// What survives a reload: your settings, whether you have unlocked Impossible,
// and your best times. Not a battle in progress - Age of War is one sitting.
//
// Its own namespaced key, so it can never collide with anything else served from
// the same origin.

export const SAVE_KEY = 'aow.save.v1';
export const SAVE_VERSION = 1;

const EMPTY = { impossibleUnlocked: false, wins: 0, losses: 0, best: {}, muted: false };

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...EMPTY };
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return { ...EMPTY };
    return { ...EMPTY, ...data.profile };
  } catch (err) {
    console.warn('Could not read the save', err);
    return { ...EMPTY };
  }
}

export function save(profile) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, profile }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.name === 'QuotaExceededError' ? 'Storage is full' : 'Could not write to storage' };
  }
}

export function recordResult(profile, { difficulty, won, seconds }) {
  const next = { ...profile, best: { ...profile.best } };
  if (won) {
    next.wins++;
    if (difficulty === 'normal') next.impossibleUnlocked = true;
    const prev = next.best[difficulty];
    if (!prev || seconds < prev) next.best[difficulty] = seconds;
  } else {
    next.losses++;
  }
  save(next);
  return next;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); return true; } catch { return false; }
}

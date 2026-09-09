// The inbox: a durable, dated record of things that happened, replacing the old
// pattern where a toast fired once and then the fact it ever happened was gone.
//
// Deliberately a leaf module — it only reads/writes plain fields already on `world`,
// never imports from season.js/transfers.js/youth.js/events.js — so every one of those
// can import this with zero circular-import risk, the same relationship finance.js's
// recordLedger already has with all of them.

const CAP = 400;

// world.inboxSeq lives on world itself rather than a module-level counter (contrast
// model/player.js's nextPlayerId) — a module-level counter resets to 1 on every page
// load regardless of what a loaded save already contains, which would mint colliding
// ids against existing entries.
export function pushInboxEntry(world, { type, tone = 'neutral', title, body, action = null }) {
  world.inbox = world.inbox || [];
  world.inboxSeq = (world.inboxSeq ?? 0) + 1;

  world.inbox.push({
    id: world.inboxSeq,
    type,
    tone,
    title,
    body,
    season: world.seasonNumber,
    // Season-boundary hooks (contract expiry, retirements, rival signings, the season
    // pointer) fire after that season's calendar is already exhausted, so `day` is
    // legitimately absent for them — the UI renders those as season-only, not buggy.
    day: world.calendar[world.matchdayIndex]?.day ?? null,
    read: false,
    action,
  });

  if (world.inbox.length > CAP) world.inbox.splice(0, world.inbox.length - CAP);
}

export function unreadInboxCount(world) {
  return (world.inbox || []).filter((e) => !e.read).length;
}

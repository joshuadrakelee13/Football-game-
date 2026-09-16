// Squad-status promise / transfer-request harness (epic 2, phase 6).
//
// Actual squad status is derived from this season's real appearance rate rather than
// stored, so the risk is a wrong band boundary or a wrong comparison against whatever
// was promised — both checked directly here. checkTransferRequests is inherently
// probabilistic (real unrest builds up over weeks, not on a single tick), so those
// checks measure population rates across many trials rather than asserting a single
// call's outcome, the same discipline the hidden-attribute and release-clause harnesses
// already use for exactly this reason.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import {
  actualSquadStatus, statusShortfall, checkTransferRequests, rejectTransferRequest,
} from '../src/engine/squadStatus.js';
import { generateBids, generateTransferMarket, sellPlayer } from '../src/engine/transfers.js';
import { finalizeSigning } from '../src/engine/negotiation.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} ${detail}`);
};

function makePlayer(overrides) {
  return {
    id: Math.floor(Math.random() * 1e9), name: 'Test Player', age: 24,
    morale: 70, seasonApps: 0, transferListed: false, promisedStatus: null,
    hidden: { ambition: 11, loyalty: 11 },
    ...overrides,
  };
}
function makeClub(squad, overrides) {
  return { squad, isPlayerClub: false, seasonStats: { played: 20 }, ...overrides };
}

// ---------------------------------------------------------------------------
console.log('\nactualSquadStatus -> too few games is unjudgeable, then buckets the appearance rate\n');

{
  const early = makeClub([], { seasonStats: { played: 3 } });
  check('fewer than 8 games played is unjudgeable (null)', actualSquadStatus(early, makePlayer({ seasonApps: 3 })) === null);

  const club = makeClub([], { seasonStats: { played: 20 } });
  check('90% appearance rate -> star', actualSquadStatus(club, makePlayer({ seasonApps: 18 })) === 'star');
  check('70% appearance rate -> important', actualSquadStatus(club, makePlayer({ seasonApps: 14 })) === 'important');
  check('50% appearance rate -> regular', actualSquadStatus(club, makePlayer({ seasonApps: 10 })) === 'regular');
  check('20% appearance rate -> rotation', actualSquadStatus(club, makePlayer({ seasonApps: 4 })) === 'rotation');
  check('5% appearance rate -> backup', actualSquadStatus(club, makePlayer({ seasonApps: 1 })) === 'backup');
}

// ---------------------------------------------------------------------------
console.log('\nstatusShortfall -> null with nothing to compare, otherwise the tier gap\n');

{
  const club = makeClub([]);
  check('no promise at all -> null', statusShortfall(club, makePlayer({ promisedStatus: null, seasonApps: 18 })) === null);
  check('a promise but too early in the season -> null',
    statusShortfall(makeClub([], { seasonStats: { played: 2 } }), makePlayer({ promisedStatus: 'star', seasonApps: 2 })) === null);

  const metPromise = statusShortfall(club, makePlayer({ promisedStatus: 'regular', seasonApps: 18 })); // actual: star
  check('exceeding the promise is a negative (or zero) shortfall, never positive', metPromise <= 0, `shortfall=${metPromise}`);

  const brokenPromise = statusShortfall(club, makePlayer({ promisedStatus: 'star', seasonApps: 1 })); // actual: backup
  check('promised star, actually backup -> shortfall of 4 tiers', brokenPromise === 4, `shortfall=${brokenPromise}`);
}

// ---------------------------------------------------------------------------
console.log('\ncheckTransferRequests -> population rates track morale, ambition/loyalty and broken promises\n');

{
  const rng = new Rng(5201);
  const N = 3000;
  let happyRequests = 0, miserableRequests = 0;
  for (let i = 0; i < N; i++) {
    const happyClub = makeClub([makePlayer({ morale: 85, seasonApps: 12 })]);
    checkTransferRequests({}, happyClub, rng);
    if (happyClub.squad[0].transferListed) happyRequests++;

    const miserableClub = makeClub([makePlayer({ morale: 15, seasonApps: 2 })]);
    checkTransferRequests({}, miserableClub, rng);
    if (miserableClub.squad[0].transferListed) miserableRequests++;
  }
  // Each call is a single low-probability roll (unrest builds up over a season of many
  // such rolls, not one check) — the miserable path's own baseChance is 4%, so the
  // bar here is "measurably, meaningfully higher than a happy player's near-zero",
  // not some much larger number.
  check('a happy, settled player almost never requests a transfer', happyRequests / N < 0.01, `rate=${(happyRequests / N * 100).toFixed(2)}%`);
  check('a miserable player requests one far more often', miserableRequests / N > 0.02,
    `happy=${(happyRequests / N * 100).toFixed(2)}% miserable=${(miserableRequests / N * 100).toFixed(2)}%`);
}

{
  const rng = new Rng(5202);
  const N = 3000;
  let loyalRequests = 0, disloyalRequests = 0;
  for (let i = 0; i < N; i++) {
    // Both miserable (same morale) — only loyalty differs — isolating loyalty's own damping effect.
    const loyalClub = makeClub([makePlayer({ morale: 20, hidden: { ambition: 11, loyalty: 20 } })]);
    checkTransferRequests({}, loyalClub, rng);
    if (loyalClub.squad[0].transferListed) loyalRequests++;

    const disloyalClub = makeClub([makePlayer({ morale: 20, hidden: { ambition: 11, loyalty: 1 } })]);
    checkTransferRequests({}, disloyalClub, rng);
    if (disloyalClub.squad[0].transferListed) disloyalRequests++;
  }
  check('a loyal player tolerates unhappiness far better than a disloyal one',
    disloyalRequests > loyalRequests * 1.5, `loyal=${(loyalRequests / N * 100).toFixed(2)}% disloyal=${(disloyalRequests / N * 100).toFixed(2)}%`);
}

{
  const rng = new Rng(5203);
  const N = 3000;
  let brokenRequests = 0, keptRequests = 0;
  for (let i = 0; i < N; i++) {
    // Content morale, so only the broken-promise path can drive a request.
    const brokenClub = makeClub([makePlayer({ morale: 70, promisedStatus: 'star', seasonApps: 1 })]); // promised star, actually backup
    checkTransferRequests({}, brokenClub, rng);
    if (brokenClub.squad[0].transferListed) brokenRequests++;

    const keptClub = makeClub([makePlayer({ morale: 70, promisedStatus: 'star', seasonApps: 18 })]); // promised star, actually star
    checkTransferRequests({}, keptClub, rng);
    if (keptClub.squad[0].transferListed) keptRequests++;
  }
  check('a clearly broken squad-status promise drives real transfer-request risk', brokenRequests / N > 0.05, `rate=${(brokenRequests / N * 100).toFixed(2)}%`);
  check('a promise that was actually met never triggers this path', keptRequests === 0, `count=${keptRequests}`);
}

// ---------------------------------------------------------------------------
console.log('\ncheckTransferRequests -> already-listed players are left alone, and only your own club gets an inbox entry\n');

{
  const rng = new Rng(5204);
  // pushInboxEntry reads world.calendar/matchdayIndex for the entry's date, so a real
  // buildWorld() world is needed here — the hand-rolled {inbox:[]} stub used above is
  // fine for the pure-mutation checks (nothing there ever reaches pushInboxEntry).
  const world = buildWorld({ seed: 5204 });
  world.inbox = [];

  const already = makeClub([makePlayer({ morale: 1, transferListed: true })]);
  for (let i = 0; i < 50; i++) checkTransferRequests(world, already, rng);
  check('an already-listed player is never re-processed', world.inbox.length === 0, `inbox entries=${world.inbox.length}`);

  let fired = false;
  for (let i = 0; i < 200 && !fired; i++) {
    const c = makeClub([makePlayer({ morale: 1 })], { isPlayerClub: false });
    checkTransferRequests(world, c, rng);
    if (c.squad[0].transferListed) fired = true;
  }
  check('an AI club\'s own miserable player can still become transfer-listed, silently', fired && world.inbox.length === 0,
    `fired=${fired} inboxEntries=${world.inbox.length}`);

  const you = makeClub([makePlayer({ morale: 1 })], { isPlayerClub: true });
  let firedForYou = false;
  for (let i = 0; i < 200 && !firedForYou; i++) {
    world.inbox = [];
    checkTransferRequests(world, you, rng);
    firedForYou = you.squad[0].transferListed;
  }
  check('your own club DOES get an inbox entry when it happens', firedForYou && world.inbox.length === 1, `inboxEntries=${world.inbox.length}`);
}

// ---------------------------------------------------------------------------
console.log('\nrejectTransferRequest -> clears the flag and costs real morale\n');

{
  const player = makePlayer({ transferListed: true, morale: 40 });
  rejectTransferRequest(player);
  check('the transfer-listed flag clears', player.transferListed === false);
  check('morale drops by the full penalty', player.morale === 25, `morale=${player.morale}`);

  const lowMorale = makePlayer({ transferListed: true, morale: 5 });
  rejectTransferRequest(lowMorale);
  check('morale never goes negative', lowMorale.morale === 0, `morale=${lowMorale.morale}`);
}

// ---------------------------------------------------------------------------
console.log('\ngenerateBids / generateTransferMarket -> a transfer request has a real market consequence\n');

{
  const rng = new Rng(5205);
  const world = buildWorld({ seed: 5205 });
  const you = playerClub(world);
  // A weak fringe player who would NEVER clear generateBids' own overall/potential
  // filter on his own merits — only being transfer-listed should get him considered.
  const weakest = [...you.squad].sort((a, b) => a.overall - b.overall)[0];
  weakest.transferListed = true;

  let foundBid = false;
  for (let i = 0; i < 300 && !foundBid; i++) {
    const bids = generateBids(world, rng);
    foundBid = bids.some((b) => b.playerId === weakest.id);
  }
  check('a transfer-listed player who wouldn\'t normally qualify still attracts bids', foundBid);
}

{
  const rng = new Rng(5206);
  const world = buildWorld({ seed: 5206 });
  const you = playerClub(world);
  const rival = Object.values(world.clubs).find((c) => !c.isPlayerClub && c.squad.length > 21);
  const listedPlayer = rival.squad[0];
  listedPlayer.transferListed = true;

  const market = generateTransferMarket(world, rng);
  check('a transfer-listed AI player is guaranteed to appear in the market', market.some((p) => p.id === listedPlayer.id));
}

// ---------------------------------------------------------------------------
console.log('\nfinalizeSigning / sellPlayer -> a promise and any transfer request never leak across a transfer\n');

{
  const world = buildWorld({ seed: 5207 });
  const you = playerClub(world);
  you.transferBudget = 999_000_000;
  you.wageBudget = 9_000_000;
  const sellerClub = world.divisions[you.tier].map((id) => world.clubs[id]).find((c) => !c.isPlayerClub && c.squad.length > 0);
  const aiPlayer = [...sellerClub.squad].sort((a, b) => a.overall - b.overall)[0];
  aiPlayer.promisedStatus = 'star';
  aiPlayer.transferListed = true;

  const session = {
    kind: 'buy', playerId: aiPlayer.id, playerSnapshot: aiPlayer, counterpartyClubId: sellerClub.id,
    agreedFee: aiPlayer.value,
    yourOffer: { fee: aiPlayer.value, sellOnPercent: 0, installmentPreset: null, riseClause: null },
    personalOffer: { wage: aiPlayer.wage, years: 3, promisedStatus: 'regular' },
  };
  const result = finalizeSigning(world, session, new Rng(1));
  check('signing succeeds', result.ok, result.ok ? '' : result.reasons?.join('; '));
  check('the new contract carries only the freshly-offered promise, not the old one',
    result.ok && result.player.promisedStatus === 'regular', `promisedStatus=${result.player?.promisedStatus}`);
  check('any transfer request against the old club is cleared, not inherited',
    result.ok && result.player.transferListed === false);
}

{
  const world = buildWorld({ seed: 5208 });
  const you = playerClub(world);
  const mine = you.squad[0];
  mine.promisedStatus = 'important';
  mine.transferListed = true;
  const buyer = Object.values(world.clubs).find((c) => !c.isPlayerClub);
  const result = sellPlayer(world, you, mine.id, mine.value, buyer.id);
  const atBuyer = buyer.squad.find((p) => p.id === mine.id);
  check('selling a promised, transfer-listed player clears both at the buying club',
    result.ok && atBuyer && atBuyer.promisedStatus === null && atBuyer.transferListed === false,
    atBuyer ? `promisedStatus=${atBuyer.promisedStatus} transferListed=${atBuyer.transferListed}` : 'player not found at buyer');
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All squad-status / transfer-request checks passed\n');

// Release-clause harness (epic 2, phase 3).
//
// A release clause is a flat, pre-agreed buy-out figure: any club can pay exactly that
// to sign the player, no haggling and no right of refusal for the seller. Four things
// need checking in isolation, each cheap to get subtly wrong: who gets offered one and
// how big it is (rollReleaseClause), that an incoming bid for a clause-bearing player of
// yours is pinned to the clause rather than the usual randomised premium (generateBids),
// and that the clause never silently survives onto a brand new contract it was never
// actually part of, in either transfer direction (finalizeSigning, sellPlayer).

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { rollReleaseClause, generateBids, sellPlayer } from '../src/engine/transfers.js';
import { finalizeSigning } from '../src/engine/negotiation.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} ${detail}`);
};

function makePlayer(overrides) {
  return { hidden: { ambition: 11 }, potential: 60, overall: 60, value: 5_000_000, ...overrides };
}

// ---------------------------------------------------------------------------
console.log('\nrollReleaseClause -> who gets one, and how big\n');

{
  const rng = new Rng(4242);
  const low = makePlayer({ hidden: { ambition: 5 }, potential: 60, overall: 60 });   // no headroom, low ambition
  const high = makePlayer({ hidden: { ambition: 20 }, potential: 80, overall: 60 }); // 20 headroom, max ambition

  const N = 5000;
  let lowGrants = 0, highGrants = 0;
  for (let i = 0; i < N; i++) {
    if (rollReleaseClause(low, rng)) lowGrants++;
    if (rollReleaseClause(high, rng)) highGrants++;
  }
  const lowRate = lowGrants / N, highRate = highGrants / N;
  check('an ambitious, high-potential player gets a clause far more often than a low-ambition, no-headroom one',
    highRate > lowRate * 2, `low=${(lowRate * 100).toFixed(1)}% high=${(highRate * 100).toFixed(1)}%`);

  let granted = null;
  for (let i = 0; i < 200 && granted === null; i++) granted = rollReleaseClause(high, rng);
  const value = high.value;
  check('a granted clause is a healthy premium over value (1.3x-2.2x)',
    granted >= value * 1.3 * 0.99 && granted <= value * 2.2 * 1.01, `value=${value} clause=${granted}`);
}

// ---------------------------------------------------------------------------
console.log('\ngenerateBids -> a clause pins the incoming offer, not the usual premium roll\n');

{
  const rng = new Rng(555);
  const world = buildWorld({ seed: 555 });
  const you = playerClub(world);

  // The same target-selection generateBids itself uses, so this is guaranteed to be
  // eligible rather than hoping a random pick clears its overall/potential filter.
  const target = [...you.squad].sort((a, b) => (b.overall + b.potential) - (a.overall + a.potential))[0];
  // Deliberately far below the usual 0.85x-1.45x-of-value premium band, so a pinned
  // offer is unmistakably NOT just a coincidental roll landing in that range.
  target.releaseClause = Math.max(1000, Math.round(target.value * 0.4 / 1000) * 1000);

  let foundBid = null;
  for (let i = 0; i < 500 && !foundBid; i++) {
    const bids = generateBids(world, rng);
    foundBid = bids.find((b) => b.playerId === target.id);
  }
  if (!foundBid) {
    check('found at least one incoming bid for the clause-bearing player within 500 tries', false);
  } else {
    check('a bid for a release-clause player is pinned to exactly the clause amount',
      foundBid.offer === target.releaseClause, `offer=£${foundBid.offer} clause=£${target.releaseClause}`);
    check('the bid is tagged viaReleaseClause', foundBid.viaReleaseClause === true);
  }
}

// ---------------------------------------------------------------------------
console.log('\nfinalizeSigning -> a clause is a term of the NEW contract, never inherited from the old one\n');

{
  const rng = new Rng(909);
  const world = buildWorld({ seed: 909 });
  const you = playerClub(world);
  you.transferBudget = 999_000_000;
  you.wageBudget = 9_000_000;

  // A same-division rival, not just any club in the world — canSign's "not interested
  // in a club this size" reputation gate would otherwise reject even a weak player from
  // a club several tiers above this fresh save's own small starting club.
  const sellerClub = world.divisions[you.tier].map((id) => world.clubs[id]).find((c) => !c.isPlayerClub && c.squad.length > 0);
  const aiPlayer = [...sellerClub.squad].sort((a, b) => a.overall - b.overall)[0];
  // Simulate a clause this player picked up at his CURRENT club — signing him for a
  // new club must not let this leak into his new deal.
  aiPlayer.releaseClause = 7_777_000;

  const baseSession = {
    kind: 'buy',
    playerId: aiPlayer.id,
    playerSnapshot: aiPlayer,
    counterpartyClubId: sellerClub.id,
    agreedFee: aiPlayer.value,
    yourOffer: { fee: aiPlayer.value, sellOnPercent: 0, installmentPreset: null, riseClause: null },
  };

  const noClauseSession = { ...baseSession, personalOffer: { wage: aiPlayer.wage, years: 3 } };
  const resultNoClause = finalizeSigning(world, noClauseSession, rng);
  check('signing without offering a new clause resets releaseClause to null (not inherited)',
    resultNoClause.ok && resultNoClause.player.releaseClause === null,
    resultNoClause.ok ? `releaseClause=${resultNoClause.player.releaseClause}` : resultNoClause.reasons?.join('; '));
}

{
  const rng = new Rng(910);
  const world = buildWorld({ seed: 910 });
  const you = playerClub(world);
  you.transferBudget = 999_000_000;
  you.wageBudget = 9_000_000;

  const sellerClub = world.divisions[you.tier].map((id) => world.clubs[id]).find((c) => !c.isPlayerClub && c.squad.length > 0);
  const aiPlayer = [...sellerClub.squad].sort((a, b) => a.overall - b.overall)[0];
  aiPlayer.releaseClause = null;

  const session = {
    kind: 'buy',
    playerId: aiPlayer.id,
    playerSnapshot: aiPlayer,
    counterpartyClubId: sellerClub.id,
    agreedFee: aiPlayer.value,
    yourOffer: { fee: aiPlayer.value, sellOnPercent: 0, installmentPreset: null, riseClause: null },
    personalOffer: { wage: aiPlayer.wage, years: 3, releaseClause: 12_345_000 },
  };
  const result = finalizeSigning(world, session, rng);
  check('signing WITH an offered clause applies exactly that figure to the new contract',
    result.ok && result.player.releaseClause === 12_345_000,
    result.ok ? `releaseClause=${result.player.releaseClause}` : result.reasons?.join('; '));
}

// ---------------------------------------------------------------------------
console.log('\nsellPlayer -> selling a clause-bearing player of yours clears it at the buying club too\n');

{
  const world = buildWorld({ seed: 111 });
  const you = playerClub(world);
  const mine = you.squad[Math.floor(you.squad.length / 2)];
  mine.releaseClause = 3_333_000;

  const buyer = Object.values(world.clubs).find((c) => !c.isPlayerClub);
  const result = sellPlayer(world, you, mine.id, mine.value, buyer.id);
  const atBuyer = buyer.squad.find((p) => p.id === mine.id);
  check('the buying club\'s copy of a sold clause-bearing player has no clause of its own',
    result.ok && atBuyer && atBuyer.releaseClause === null,
    atBuyer ? `releaseClause=${atBuyer.releaseClause}` : 'player not found at buyer');
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All release-clause checks passed\n');

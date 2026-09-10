// Negotiation harness: unlike the inbox feature, the negotiation system has real
// numbers to get exactly right — sell-on payouts, instalment totals, and rise-clause
// firings are all arithmetic, not copy/feel judgement calls. This checks that
// arithmetic directly, plus a multi-season integration run to catch crashes or
// runaway state that a narrow unit check would miss.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { generatePlayer } from '../src/model/player.js';
import {
  signPlayer, sellPlayer, generateTransferMarket, processExpiringContracts, runAiTransferWindow,
} from '../src/engine/transfers.js';
import { transferBudget, setTransferBudget, setWageBudget } from '../src/engine/finance.js';
import { advanceMatchday, endSeason, nextSeason } from '../src/engine/season.js';
import {
  addSellOnClause, addInstallmentSchedule, addRiseClause,
  recordAppearanceForObligations, checkPromotionRiseClauses, dischargePlayerObligations,
} from '../src/engine/obligations.js';
import { canOpenNegotiation, evaluateFeeOffer, finalizeSigning } from '../src/engine/negotiation.js';

const checks = [];
function check(label, pass, value) {
  checks.push([label, pass, String(value)]);
}

function twoAiClubs(world) {
  const ids = Object.keys(world.clubs).filter((id) => id !== String(world.playerClubId));
  return [world.clubs[ids[0]], world.clubs[ids[1]]];
}

// ---------------------------------------------------------------------------
// Sell-on clauses: fire once, exactly, on the next fee-bearing sale.
// ---------------------------------------------------------------------------
function testSellOnChain() {
  const rng = new Rng(1001);
  const world = buildWorld({ seed: 1001 });
  const [A, B] = twoAiClubs(world);
  const C = Object.values(world.clubs).find((c) => c.id !== A.id && c.id !== B.id && c.id !== world.playerClubId);

  const player = generatePlayer(rng, { tier: 2, position: 'ST', targetOverall: 65 });
  player.contractYears = 3;
  A.squad.push(player);
  B.transferBudget = 5_000_000;
  C.transferBudget = 5_000_000;

  const fee1 = 1_000_000;
  const sale1 = sellPlayer(world, A, player.id, fee1, B.id);
  addSellOnClause(world, { playerId: player.id, holderClubId: A.id, percent: 10 });

  const aBefore = A.transferBudget;
  const bBefore = B.transferBudget;
  const fee2 = 2_000_000;
  const sale2 = sellPlayer(world, B, player.id, fee2, C.id);
  const expectedCut = Math.round(fee2 * 0.10);

  check('sell-on: both sales resolve ok', sale1.ok && sale2.ok, `${sale1.ok}/${sale2.ok}`);
  check('sell-on: holder receives exactly 10% of the next sale', A.transferBudget === aBefore + expectedCut, `${A.transferBudget - aBefore} vs ${expectedCut}`);
  check('sell-on: seller keeps the fee minus the cut', B.transferBudget === bBefore + fee2 - expectedCut, `${B.transferBudget - bBefore} vs ${fee2 - expectedCut}`);
  check('sell-on: clause discharged after firing (no double-fire)', !world.sellOnClauses.some((c) => c.playerId === player.id), world.sellOnClauses.length);
}

// ---------------------------------------------------------------------------
// Instalments: pay out to the exact agreed total, then stop.
// ---------------------------------------------------------------------------
function testInstallments() {
  const rng = new Rng(2002);
  const world = buildWorld({ seed: 2002 });
  const [A, B] = twoAiClubs(world);
  const player = generatePlayer(rng, { tier: 2, position: 'CM', targetOverall: 60 });
  B.squad.push(player);
  B.transferBudget = 5_000_000;

  const totalDeferred = 400_000;
  addInstallmentSchedule(world, {
    playerId: player.id, debtorClubId: B.id, creditorClubId: A.id,
    totalRemaining: totalDeferred, installmentsRemaining: 4, appsPerInstallment: 1,
  });

  const aBefore = A.transferBudget;
  const bBefore = B.transferBudget;
  for (let i = 0; i < 4; i++) recordAppearanceForObligations(world, B, player);

  check('instalments: schedule fully discharged after the agreed number of apps',
    !world.installmentSchedules.some((s) => s.playerId === player.id), world.installmentSchedules.length);
  check('instalments: debtor paid exactly the deferred total, no more',
    B.transferBudget === bBefore - totalDeferred, `${bBefore - B.transferBudget} vs ${totalDeferred}`);
  check('instalments: creditor received exactly the deferred total',
    A.transferBudget === aBefore + totalDeferred, `${A.transferBudget - aBefore} vs ${totalDeferred}`);

  // Further appearances after the schedule is gone must not pay out again.
  const aAfter = A.transferBudget;
  for (let i = 0; i < 5; i++) recordAppearanceForObligations(world, B, player);
  check('instalments: no further payout once discharged', A.transferBudget === aAfter, `${A.transferBudget - aAfter}`);
}

// ---------------------------------------------------------------------------
// Rise clauses: both trigger types fire exactly once, even well past the trigger.
// ---------------------------------------------------------------------------
function testRiseClausePromotion() {
  const world = buildWorld({ seed: 3003 });
  const [A, B] = twoAiClubs(world);
  const rng = new Rng(3003);
  const player = generatePlayer(rng, { tier: 2, position: 'RW', targetOverall: 62 });
  B.squad.push(player);
  B.transferBudget = 5_000_000;

  addRiseClause(world, { playerId: player.id, debtorClubId: B.id, creditorClubId: A.id, amount: 500_000, trigger: { type: 'promotion' } });

  const aBefore = A.transferBudget;
  const bBefore = B.transferBudget;
  checkPromotionRiseClauses(world, [B.id]);
  check('rise clause (promotion): pays the exact agreed amount',
    A.transferBudget === aBefore + 500_000 && B.transferBudget === bBefore - 500_000,
    `${A.transferBudget - aBefore} / ${bBefore - B.transferBudget}`);
  check('rise clause (promotion): discharged after firing', !world.riseClauses.some((c) => c.playerId === player.id), world.riseClauses.length);

  const aAfterFirst = A.transferBudget;
  checkPromotionRiseClauses(world, [B.id]); // same club promoted again — must not pay twice
  check('rise clause (promotion): no double-fire on a repeated check', A.transferBudget === aAfterFirst, `${A.transferBudget - aAfterFirst}`);
}

function testRiseClauseAppearances() {
  const world = buildWorld({ seed: 4004 });
  const [A, B] = twoAiClubs(world);
  const rng = new Rng(4004);
  const player = generatePlayer(rng, { tier: 2, position: 'LB', targetOverall: 58 });
  B.squad.push(player);
  B.transferBudget = 5_000_000;

  addRiseClause(world, { playerId: player.id, debtorClubId: B.id, creditorClubId: A.id, amount: 300_000, trigger: { type: 'appearances', threshold: 5 } });

  const aBefore = A.transferBudget;
  for (let i = 0; i < 10; i++) recordAppearanceForObligations(world, B, player); // well past the threshold
  check('rise clause (appearances): fires exactly once even driven well past threshold',
    A.transferBudget === aBefore + 300_000, `${A.transferBudget - aBefore}`);
  check('rise clause (appearances): discharged after firing', !world.riseClauses.some((c) => c.playerId === player.id), world.riseClauses.length);
}

// ---------------------------------------------------------------------------
// A permanent, fee-less departure discharges every waiting obligation, no payout.
// ---------------------------------------------------------------------------
function testDischargeOnFreeDeparture() {
  const world = buildWorld({ seed: 5005 });
  const [A, B] = twoAiClubs(world);
  const rng = new Rng(5005);
  const player = generatePlayer(rng, { tier: 3, position: 'CB', targetOverall: 50 });
  B.squad.push(player);

  addSellOnClause(world, { playerId: player.id, holderClubId: A.id, percent: 15 });
  addInstallmentSchedule(world, { playerId: player.id, debtorClubId: B.id, creditorClubId: A.id, totalRemaining: 100_000, installmentsRemaining: 2, appsPerInstallment: 1 });
  addRiseClause(world, { playerId: player.id, debtorClubId: B.id, creditorClubId: A.id, amount: 50_000, trigger: { type: 'promotion' } });

  dischargePlayerObligations(world, player.id);
  check('discharge: sell-on removed with no payout', !world.sellOnClauses.some((c) => c.playerId === player.id), world.sellOnClauses.length);
  check('discharge: instalment schedule removed', !world.installmentSchedules.some((s) => s.playerId === player.id), world.installmentSchedules.length);
  check('discharge: rise clause removed', !world.riseClauses.some((c) => c.playerId === player.id), world.riseClauses.length);
}

// ---------------------------------------------------------------------------
// Sell-side (incoming bid) negotiation: the aiRole:'buyer' path of evaluateFeeOffer,
// and a full kind:'sell' finalizeSigning — the exact two code paths
// openSellNegotiation drives, exercised here without the DOM.
// ---------------------------------------------------------------------------
function testSellSideNegotiation() {
  const seed = 7007;
  const rng = new Rng(seed);
  const world = buildWorld({ seed });
  const you = playerClub(world);
  const buyer = Object.values(world.clubs).find((c) => c.id !== you.id);
  buyer.transferBudget = 5_000_000;
  buyer.reputation = Math.max(buyer.reputation, you.reputation + 20);

  const player = you.squad[0];
  const lowOffer = { fee: Math.round(player.value * 0.4), sellOnPercent: 0, installmentPreset: null, riseClause: null };
  const fairOffer = { fee: Math.round(player.value * 1.0), sellOnPercent: 10, installmentPreset: null, riseClause: null };

  const lowResponse = evaluateFeeOffer(world, buyer, 'buyer', player, lowOffer, 1, rng);
  check('sell-side: a below-value asking price is not rejected outright as a buyer',
    lowResponse.result !== 'reject-final', lowResponse.result);

  const fairResponse = evaluateFeeOffer(world, buyer, 'buyer', player, fairOffer, 1, rng);
  check('sell-side: evaluateFeeOffer(aiRole buyer) returns a real verdict',
    ['accept', 'counter', 'reject-final'].includes(fairResponse.result), fairResponse.result);

  const squadBefore = you.squad.length;
  const buyerSquadBefore = buyer.squad.length;
  const sellerBudgetBefore = you.transferBudget;
  const agreedFee = Math.round(player.value * 0.95);
  const session = {
    kind: 'sell', playerId: player.id, counterpartyClubId: buyer.id,
    yourOffer: { fee: agreedFee, sellOnPercent: 10, installmentPreset: null, riseClause: null },
    agreedFee,
  };
  const result = finalizeSigning(world, session, rng);
  check('sell-side: finalizeSigning(kind sell) succeeds', result.ok, JSON.stringify(result.reasons || ''));
  check('sell-side: player actually moves from seller squad to buyer squad',
    you.squad.length === squadBefore - 1 && buyer.squad.some((p) => p.id === player.id),
    `seller ${squadBefore}->${you.squad.length}, buyer has player: ${buyer.squad.some((p) => p.id === player.id)}`);
  check('sell-side: seller transfer budget rose by the agreed fee',
    you.transferBudget === sellerBudgetBefore + agreedFee, `${you.transferBudget - sellerBudgetBefore} vs ${agreedFee}`);
  check('sell-side: a sell-on clause was attached, held by the selling club',
    world.sellOnClauses.some((c) => c.playerId === player.id && c.holderClubId === you.id && c.percent === 10),
    world.sellOnClauses.length);
}

// ---------------------------------------------------------------------------
// Multi-season integration: real negotiated deals with add-ons, mixed into a long
// auto-played save, must not crash and must not leave obligation state unbounded.
// ---------------------------------------------------------------------------
function testMultiSeasonIntegration() {
  const seed = 6006;
  const rng = new Rng(seed);
  const world = buildWorld({ seed });
  const you = playerClub(world);
  let negotiatedDeals = 0;

  for (let season = 1; season <= 5; season++) {
    world.transferMarket = generateTransferMarket(world, rng);
    const target = world.transferMarket.find((p) => p.fromClub && canOpenNegotiation(world, you, p).ok);
    if (target) {
      const sellerClub = world.clubs[target.fromClub];
      const offer = {
        fee: Math.round((target.askingPrice ?? target.value) * 0.85),
        sellOnPercent: 10,
        installmentPreset: { fraction: 0.3, installments: 4, appsPerInstallment: 1 },
        riseClause: { amount: 40_000, trigger: { type: 'appearances', threshold: 10 } },
      };
      const response = evaluateFeeOffer(world, sellerClub, 'seller', target, offer, 1, rng);
      const agreedFee = response.result === 'accept' ? offer.fee : response.counterFee;
      if (agreedFee) {
        const session = {
          kind: 'buy', playerId: target.id, counterpartyClubId: target.fromClub,
          yourOffer: offer, agreedFee, personalOffer: { wage: target.wage, years: 3 },
        };
        const result = finalizeSigning(world, session, rng);
        if (result.ok) {
          negotiatedDeals++;
          world.transferMarket = world.transferMarket.filter((p) => p.id !== target.id);
        }
      }
    }

    let guard = 0;
    while (world.matchdayIndex < world.calendar.length && guard++ < 200) {
      advanceMatchday(world, rng);
    }
    endSeason(world, rng);
    processExpiringContracts(world, rng);
    runAiTransferWindow(world, rng);
    setTransferBudget(you);
    setWageBudget(you);
    nextSeason(world, rng);

    check(`integration season ${season}: transfer budget stays finite and non-negative`,
      Number.isFinite(you.transferBudget) && transferBudget(you) >= 0, you.transferBudget);
    check(`integration season ${season}: obligation arrays stay bounded`,
      world.sellOnClauses.length < 1000 && world.installmentSchedules.length < 1000 && world.riseClauses.length < 1000,
      `${world.sellOnClauses.length}/${world.installmentSchedules.length}/${world.riseClauses.length}`);
  }

  check('integration: at least one negotiated deal with add-ons actually completed across 5 seasons', negotiatedDeals > 0, negotiatedDeals);
}

// ---------------------------------------------------------------------------

console.log('\nNegotiation system: sell-on clauses, instalments, rise clauses\n');

testSellOnChain();
testInstallments();
testRiseClausePromotion();
testRiseClauseAppearances();
testDischargeOnFreeDeparture();
testSellSideNegotiation();
testMultiSeasonIntegration();

let failed = 0;
for (const [label, pass, value] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(70)} ${value}`);
}
console.log('');
if (failed) { console.log(`  ${failed} check(s) failed\n`); process.exit(1); }
console.log('  All negotiation checks passed\n');

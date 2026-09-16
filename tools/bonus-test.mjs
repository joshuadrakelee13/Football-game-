// Bonus clause / generic match-event interface harness (epic 2, phase 5).
//
// Appearance and goal bonuses are deliberately NOT wired by reaching into match
// internals — season.js just calls fireMatchEvent(world, 'onAppearance'|'onGoal', ...)
// at the two points a player already gets an appearance or a goal recorded, and
// obligations.js resolves whatever bonus clauses are listening for that name. This
// harness exercises the payout/cap/cleanup logic directly (the interface itself), then
// confirms season.js's two call sites actually fire during a real match, and that
// finalizeSigning wires a negotiated bonus into a real clause with the right debtor/
// creditor direction.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { advanceMatchday } from '../src/engine/season.js';
import { addBonusClause, fireMatchEvent, dischargePlayerObligations } from '../src/engine/obligations.js';
import { finalizeSigning } from '../src/engine/negotiation.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} ${detail}`);
};

function twoClubWorld(seed) {
  const world = buildWorld({ seed });
  const you = playerClub(world);
  const rival = Object.values(world.clubs).find((c) => !c.isPlayerClub);
  return { world, you, rival };
}

// ---------------------------------------------------------------------------
console.log('\nfireMatchEvent -> pays out per trigger, respects the cap, cleans up once exhausted\n');

{
  const { world, you: debtor, rival: creditor } = twoClubWorld(4101);
  const player = debtor.squad[0];
  addBonusClause(world, {
    playerId: player.id, debtorClubId: debtor.id, creditorClubId: creditor.id,
    eventName: 'onAppearance', amountPerTrigger: 10_000, cap: 25_000,
  });

  const debtorBefore = debtor.transferBudget;
  const creditorBefore = creditor.transferBudget;

  fireMatchEvent(world, 'onAppearance', { playerId: player.id, clubId: debtor.id });
  check('first trigger pays the full per-trigger amount',
    debtor.transferBudget === debtorBefore - 10_000 && creditor.transferBudget === creditorBefore + 10_000,
    `debtor=${debtor.transferBudget} creditor=${creditor.transferBudget}`);

  fireMatchEvent(world, 'onAppearance', { playerId: player.id, clubId: debtor.id });
  check('second trigger pays the full amount again (20k of 25k cap so far)',
    debtor.transferBudget === debtorBefore - 20_000);

  fireMatchEvent(world, 'onAppearance', { playerId: player.id, clubId: debtor.id });
  check('third trigger is trimmed to exactly what remains under the cap (5k, not 10k)',
    debtor.transferBudget === debtorBefore - 25_000, `debtor=${debtor.transferBudget} expected=${debtorBefore - 25_000}`);

  const clauseGone = !(world.bonusClauses || []).some((c) => c.playerId === player.id);
  check('the clause is removed once its cap is fully paid out', clauseGone);

  fireMatchEvent(world, 'onAppearance', { playerId: player.id, clubId: debtor.id });
  check('firing again after the cap is exhausted pays nothing further',
    debtor.transferBudget === debtorBefore - 25_000);
}

// ---------------------------------------------------------------------------
console.log('\nfireMatchEvent -> only the named event, and only the exact player+club, triggers a clause\n');

{
  const { world, you: debtor, rival: creditor } = twoClubWorld(4102);
  const player = debtor.squad[0];
  const otherPlayer = debtor.squad[1];
  addBonusClause(world, {
    playerId: player.id, debtorClubId: debtor.id, creditorClubId: creditor.id,
    eventName: 'onGoal', amountPerTrigger: 5_000, cap: 50_000,
  });

  const before = debtor.transferBudget;
  fireMatchEvent(world, 'onAppearance', { playerId: player.id, clubId: debtor.id }); // wrong event name
  check('a differently-named event never fires a clause listening for something else', debtor.transferBudget === before);

  fireMatchEvent(world, 'onGoal', { playerId: otherPlayer.id, clubId: debtor.id }); // wrong player
  check('a goal by a DIFFERENT player never fires this clause', debtor.transferBudget === before);

  fireMatchEvent(world, 'onGoal', { playerId: player.id, clubId: creditor.id }); // wrong club (not the debtor)
  check('the same player scoring for a club that isn\'t the debtor never fires this clause', debtor.transferBudget === before);

  fireMatchEvent(world, 'onGoal', { playerId: player.id, clubId: debtor.id }); // the real trigger
  check('the exact matching event/player/club combination does fire it', debtor.transferBudget === before - 5_000);
}

// ---------------------------------------------------------------------------
console.log('\naddBonusClause -> a non-positive amount or cap is silently a no-op\n');

{
  const { world, you: debtor, rival: creditor } = twoClubWorld(4103);
  const player = debtor.squad[0];
  addBonusClause(world, { playerId: player.id, debtorClubId: debtor.id, creditorClubId: creditor.id, eventName: 'onGoal', amountPerTrigger: 0, cap: 10_000 });
  addBonusClause(world, { playerId: player.id, debtorClubId: debtor.id, creditorClubId: creditor.id, eventName: 'onGoal', amountPerTrigger: 5_000, cap: 0 });
  check('neither a zero amountPerTrigger nor a zero cap creates a clause', (world.bonusClauses || []).length === 0, `count=${(world.bonusClauses || []).length}`);
}

// ---------------------------------------------------------------------------
console.log('\ndischargePlayerObligations -> clears bonus clauses too\n');

{
  const { world, you: debtor, rival: creditor } = twoClubWorld(4104);
  const player = debtor.squad[0];
  addBonusClause(world, { playerId: player.id, debtorClubId: debtor.id, creditorClubId: creditor.id, eventName: 'onGoal', amountPerTrigger: 1000, cap: 5000 });
  dischargePlayerObligations(world, player.id);
  check('the bonus clause is gone after discharge', !(world.bonusClauses || []).some((c) => c.playerId === player.id));
}

// ---------------------------------------------------------------------------
console.log('\nfinalizeSigning -> a negotiated bonus becomes a real clause with the buyer owing the seller\n');

{
  const { world, you: buyerClub, rival: sellerClub } = twoClubWorld(4105);
  buyerClub.transferBudget = 999_000_000;
  buyerClub.wageBudget = 9_000_000;
  const player = [...sellerClub.squad].sort((a, b) => a.overall - b.overall)[0];

  const session = {
    kind: 'buy',
    playerId: player.id,
    playerSnapshot: player,
    counterpartyClubId: sellerClub.id,
    agreedFee: player.value,
    yourOffer: {
      fee: player.value, sellOnPercent: 0, installmentPreset: null, riseClause: null,
      appearanceBonus: { tag: 'low', amountPerTrigger: 2000, cap: 20_000 },
      goalBonus: { tag: 'high', amountPerTrigger: 8000, cap: 60_000 },
    },
    personalOffer: { wage: player.wage, years: 3 },
  };
  const result = finalizeSigning(world, session, new Rng(1));
  check('the signing itself succeeds', result.ok, result.ok ? '' : result.reasons?.join('; '));

  const appClause = (world.bonusClauses || []).find((c) => c.playerId === player.id && c.eventName === 'onAppearance');
  const goalClause = (world.bonusClauses || []).find((c) => c.playerId === player.id && c.eventName === 'onGoal');
  check('an appearance bonus clause was created with the buyer as debtor, seller as creditor',
    appClause && appClause.debtorClubId === buyerClub.id && appClause.creditorClubId === sellerClub.id && appClause.amountPerTrigger === 2000 && appClause.cap === 20_000);
  check('a goal bonus clause was created the same way',
    goalClause && goalClause.debtorClubId === buyerClub.id && goalClause.creditorClubId === sellerClub.id && goalClause.amountPerTrigger === 8000 && goalClause.cap === 60_000);
}

// ---------------------------------------------------------------------------
console.log('\nseason.js -> a real match actually fires onAppearance for players who played\n');

{
  const rng = new Rng(4106);
  const world = buildWorld({ seed: 4106 });
  const debtor = playerClub(world);
  const creditor = Object.values(world.clubs).find((c) => !c.isPlayerClub);
  // Every one of debtor's likely starters gets a cheap appearance clause — whichever
  // eleven actually take the pitch this matchday, at least one should trigger it.
  for (const p of debtor.squad) {
    addBonusClause(world, { playerId: p.id, debtorClubId: debtor.id, creditorClubId: creditor.id, eventName: 'onAppearance', amountPerTrigger: 1000, cap: 1000 });
  }
  const before = debtor.transferBudget;
  let guard = 0;
  while (world.matchdayIndex < world.calendar.length && guard++ < 10 && debtor.transferBudget === before) {
    advanceMatchday(world, rng);
  }
  check('at least one appearance clause paid out during real matchday simulation', debtor.transferBudget < before, `before=${before} after=${debtor.transferBudget}`);
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All bonus-clause checks passed\n');

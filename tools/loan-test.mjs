// Loan harness (epic 2, phase 4).
//
// A loan moves a player into another club's squad array — the same array everything
// else in the engine already reads for "who actually plays for this club" — while his
// parent club keeps a wage commitment and (usually) the right to recall him. Three
// things are cheap to get subtly wrong here: the wage split has to net out correctly on
// BOTH sides at once, a loan has to resolve at exactly the boundary it promised
// (winter window open, or season end) and nowhere else, and a future-fee obligation or
// option has to convert the loan to a real permanent transfer rather than just quietly
// vanishing. A fourth check guards the regression this phase found by inspection before
// it ever ran: runAiTransferWindow picking a loaned-in player as "weakest, sell him" and
// orphaning the loan record.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { weeklyWages } from '../src/model/club.js';
import { runAiTransferWindow } from '../src/engine/transfers.js';
import {
  sendOnLoan, canRecall, recallLoan, checkLoanReturns, recordLoanAppearance, dischargePlayerLoan,
} from '../src/engine/loans.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} ${detail}`);
};

function pickLowerDivisionSuitor(world, parentClub) {
  // A same-or-lower tier club, distinct from the parent, so canLoanIn's checks have a
  // realistic budget/wage picture to work with rather than a top-flight giant.
  return Object.values(world.clubs).find((c) => !c.isPlayerClub && c.id !== parentClub.id && c.tier >= parentClub.tier);
}

// ---------------------------------------------------------------------------
console.log('\nsendOnLoan -> squad move + wage split nets out on both sides\n');

{
  const world = buildWorld({ seed: 3001 });
  const you = playerClub(world);
  const player = [...you.squad].sort((a, b) => a.overall - b.overall)[0]; // a fringe player
  const loanClub = pickLowerDivisionSuitor(world, you);
  const preWage = player.wage;

  const beforeParentWages = weeklyWages(you);
  const beforeLoanClubWages = weeklyWages(loanClub);

  const result = sendOnLoan(world, you, loanClub, player, { wageSplitPercent: 60, duration: 'season', futureFee: null });
  check('sendOnLoan succeeds', result.ok, result.ok ? '' : result.reasons.join('; '));

  const stillInParentSquad = you.squad.some((p) => p.id === player.id);
  const nowInLoanClubSquad = loanClub.squad.some((p) => p.id === player.id);
  check('the player leaves the parent squad and joins the loan club squad', !stillInParentSquad && nowInLoanClubSquad);

  const loaned = loanClub.squad.find((p) => p.id === player.id);
  check('the loanee is marked onLoanFrom the parent', loaned?.onLoanFrom === you.id);

  const afterParentWages = weeklyWages(you);
  const afterLoanClubWages = weeklyWages(loanClub);
  const expectedParentShare = Math.round(preWage * 0.4);
  const expectedLoanClubShare = Math.round(preWage * 0.6);
  check('the parent club\'s total wage bill drops by only its 40% share (not the full wage)',
    afterParentWages === beforeParentWages - preWage + expectedParentShare,
    `before=${beforeParentWages} after=${afterParentWages} fullWage=${preWage}`);
  check('the loan club\'s wage bill rises by only its 60% share',
    afterLoanClubWages === beforeLoanClubWages + expectedLoanClubShare,
    `before=${beforeLoanClubWages} after=${afterLoanClubWages} share=${expectedLoanClubShare}`);
  const combinedShare = expectedParentShare + expectedLoanClubShare;
  check('the two shares together reconstruct the player\'s full wage', combinedShare === preWage, `combined=${combinedShare} full=${preWage}`);
}

// ---------------------------------------------------------------------------
console.log('\nrecall -> blocked during the settling-in period, allowed after\n');

{
  const world = buildWorld({ seed: 3002 });
  const you = playerClub(world);
  const player = [...you.squad].sort((a, b) => a.overall - b.overall)[0];
  const loanClub = pickLowerDivisionSuitor(world, you);
  const { loan } = sendOnLoan(world, you, loanClub, player, { wageSplitPercent: 50, duration: 'season', futureFee: null });

  check('cannot recall immediately after the loan starts', !canRecall(world, loan).ok);
  const immediateRecall = recallLoan(world, loan.id);
  check('recallLoan itself refuses during the protected period', !immediateRecall.ok);

  world.matchdayIndex = loan.recallProtectedUntilMatchday;
  check('can recall once the protected period has passed', canRecall(world, loan).ok);
  const recallResult = recallLoan(world, loan.id);
  check('recallLoan succeeds once eligible', recallResult.ok);

  const backHome = you.squad.some((p) => p.id === player.id);
  const goneFromLoanClub = !loanClub.squad.some((p) => p.id === player.id);
  check('the recalled player is back in the parent squad and gone from the loan club', backHome && goneFromLoanClub);
  check('the parent club\'s loan wage commitment clears back to zero', (you.loanWageCommitment || 0) === 0, `commitment=${you.loanWageCommitment}`);
}

// ---------------------------------------------------------------------------
console.log('\ncheckLoanReturns -> resolves at exactly the boundary it promised\n');

{
  const world = buildWorld({ seed: 3003 });
  const you = playerClub(world);
  const [winterPlayer, seasonPlayer] = [...you.squad].sort((a, b) => a.overall - b.overall);
  const loanClub = pickLowerDivisionSuitor(world, you);
  sendOnLoan(world, you, loanClub, winterPlayer, { wageSplitPercent: 50, duration: 'winter', futureFee: null });
  sendOnLoan(world, you, loanClub, seasonPlayer, { wageSplitPercent: 50, duration: 'season', futureFee: null });

  checkLoanReturns(world); // the winter-window-opened check — atSeasonEnd defaults false
  check('a "winter" loan returns when the winter check runs', you.squad.some((p) => p.id === winterPlayer.id));
  check('a "season" loan is untouched by the winter check', loanClub.squad.some((p) => p.id === seasonPlayer.id));

  checkLoanReturns(world, { atSeasonEnd: true });
  check('a "season" loan returns at the season-end check', you.squad.some((p) => p.id === seasonPlayer.id));
  check('no loans remain active after season end', (world.loans || []).length === 0, `remaining=${(world.loans || []).length}`);
}

// ---------------------------------------------------------------------------
console.log('\nfuture fee -> an obligation converts the loan to a real permanent transfer\n');

{
  const world = buildWorld({ seed: 3004 });
  const you = playerClub(world);
  const player = [...you.squad].sort((a, b) => a.overall - b.overall)[0];
  const loanClub = pickLowerDivisionSuitor(world, you);
  const { loan } = sendOnLoan(world, you, loanClub, player, {
    wageSplitPercent: 50, duration: 'season',
    futureFee: { type: 'obligation', amount: 250_000, trigger: 'appearances', appsThreshold: 3 },
  });

  for (let i = 0; i < 3; i++) recordLoanAppearance(world, loanClub, loanClub.squad.find((p) => p.id === player.id));

  const converted = loanClub.squad.find((p) => p.id === player.id);
  check('the obligation fires once the appearance threshold is hit', converted && converted.onLoanFrom === null,
    converted ? `onLoanFrom=${converted.onLoanFrom}` : 'player missing');
  check('the loan record is gone once converted', !(world.loans || []).some((l) => l.id === loan.id));
  check('he never returns to the parent squad — the loan became a permanent deal',
    !you.squad.some((p) => p.id === player.id));
  check('the parent club\'s loan wage commitment clears once converted', (you.loanWageCommitment || 0) === 0);
}

// ---------------------------------------------------------------------------
console.log('\nfuture fee -> an unexercised option just lets the loan end normally\n');

{
  const world = buildWorld({ seed: 3005 });
  const you = playerClub(world);
  const player = [...you.squad].sort((a, b) => a.overall - b.overall)[0];
  const loanClub = pickLowerDivisionSuitor(world, you);
  // An absurdly high option price relative to his real value — no heuristic should
  // ever conclude he's worth clearing that bar, so the loan must just end normally.
  sendOnLoan(world, you, loanClub, player, {
    wageSplitPercent: 50, duration: 'season',
    futureFee: { type: 'option', amount: player.value * 100 },
  });
  checkLoanReturns(world, { atSeasonEnd: true });
  check('an option nobody would exercise leaves the player returning to his parent, not bought',
    you.squad.some((p) => p.id === player.id));
}

// ---------------------------------------------------------------------------
console.log('\ndischargePlayerLoan -> a stale loan record can\'t outlive the player leaving the sim\n');

{
  const world = buildWorld({ seed: 3006 });
  const you = playerClub(world);
  const player = [...you.squad].sort((a, b) => a.overall - b.overall)[0];
  const loanClub = pickLowerDivisionSuitor(world, you);
  sendOnLoan(world, you, loanClub, player, { wageSplitPercent: 50, duration: 'season', futureFee: null });
  dischargePlayerLoan(world, player.id);
  check('the loan record is discharged', !(world.loans || []).some((l) => l.playerId === player.id));
  check('the parent\'s loan wage commitment is cleared alongside it', (you.loanWageCommitment || 0) === 0);
}

// ---------------------------------------------------------------------------
console.log('\nrunAiTransferWindow -> never sells a loaned-in player out from under his loan\n');

{
  const rng = new Rng(3007);
  const world = buildWorld({ seed: 3007 });
  const you = playerClub(world);

  // Loan the WEAKEST player in the world to a rival so he is guaranteed to be that
  // club's own weakest squad member too — exactly the pick runAiTransferWindow's own
  // replace-the-weakest logic would otherwise make.
  let globalWeakest = null;
  for (const c of Object.values(world.clubs)) {
    if (c.isPlayerClub) continue;
    for (const p of c.squad) if (!globalWeakest || p.overall < globalWeakest.overall) globalWeakest = p;
  }
  const parentClub = Object.values(world.clubs).find((c) => c.squad.some((p) => p.id === globalWeakest.id));
  const loanClub = Object.values(world.clubs).find((c) => !c.isPlayerClub && c.id !== parentClub.id);
  sendOnLoan(world, parentClub, loanClub, globalWeakest, { wageSplitPercent: 100, duration: 'season', futureFee: null });
  loanClub.transferBudget = 999_000_000;
  loanClub.wageBudget = 9_000_000;

  runAiTransferWindow(world, rng, 4);

  const stillOnLoan = loanClub.squad.some((p) => p.id === globalWeakest.id && p.onLoanFrom === parentClub.id);
  const loanRecordIntact = (world.loans || []).some((l) => l.playerId === globalWeakest.id);
  check('a loaned-in player survives an AI transfer window at his loan club', stillOnLoan);
  check('his loan record is still intact', loanRecordIntact);
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All loan checks passed\n');

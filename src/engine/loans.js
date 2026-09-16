// Loans: a temporary move that keeps the parent club's ownership. The loan club pays
// an agreed share of his wage (the rest stays on the parent's books), can't be recalled
// for a short settling-in period, and can carry an option or obligation to make the
// move permanent later.
//
// Reuses club.squad as the single source of truth for "who a player actually plays
// for" — a loaned player really does move into the loan club's squad array, so
// matchday selection, training and everything else that already reads club.squad needs
// no separate "is this a loan" branch. onLoanFrom/loanWagePercent are denormalised onto
// the player purely so weeklyWages and the UI can read his status without cross-
// referencing world.loans; the loan record there is the actual source of truth for
// terms, and both are always updated together.

import { pushInboxEntry } from './inbox.js';
import { spendTransferFee, receiveTransferFee } from './finance.js';
import { fireSellOnClauses } from './obligations.js';
import { pickBestXI, weeklyWages } from '../model/club.js';
import { isWindowOpen } from './transferWindow.js';

export const LOAN_WAGE_SPLIT_OPTIONS = [0, 25, 50, 75, 100]; // % the LOAN club pays
export const LOAN_DURATIONS = [
  { key: 'winter', label: 'Until January' },
  { key: 'season', label: 'Rest of season' },
];
// A short settling-in period before the parent can pull him back early — matches FM's
// own default loan terms rather than letting a loan be recalled the week it started.
// Expressed in matchdays (this game's own clock tick), not real days, same as every
// other "roughly N weeks" rule in the engine that isn't tied to a fixed calendar date.
const RECALL_PROTECTION_MATCHDAYS = 8;

function nextLoanId(world) {
  world.loanSeq = (world.loanSeq ?? 0) + 1;
  return world.loanSeq;
}

export function canLoanOut(world, parentClub, player) {
  const reasons = [];
  if (player.onLoanFrom) reasons.push('Already out on loan');
  if (parentClub.squad.length <= 16) reasons.push('Squad would drop below 16 players');
  if (!isWindowOpen(world)) reasons.push('The transfer window is closed');
  return { ok: reasons.length === 0, reasons };
}

export function canLoanIn(world, loanClub, player, wageSplitPercent) {
  const reasons = [];
  if (loanClub.squad.length >= 30) reasons.push('Squad is full (30 players)');
  if (!isWindowOpen(world)) reasons.push('The transfer window is closed');
  const share = Math.round(player.wage * wageSplitPercent / 100);
  if (weeklyWages(loanClub) + share > loanClub.wageBudget * 1.15) reasons.push('Wage budget too low');
  return { ok: reasons.length === 0, reasons };
}

// A single accept/reject read rather than round-based haggling: loan business really
// is quicker and less adversarial than a permanent-fee negotiation in practice, since
// there's no transfer fee to disagree over — just whether the move suits both clubs.
// aiRole 'parent': the AI owns the player and is deciding whether to loan him out.
// aiRole 'loanClub': the AI is the destination and is deciding whether to take him.
export function evaluateLoanOffer(world, aiClub, aiRole, player, terms) {
  if (aiRole === 'parent') {
    const isKeyPlayer = player.overall >= (squadRatingOf(aiClub) - 1);
    if (isKeyPlayer) return { ok: false, reason: `${aiClub.short} see him as a key player and won't loan him out.` };
    if (terms.wageSplitPercent < 50) return { ok: false, reason: `${aiClub.short} want at least half his wages covered while he's away.` };
    return { ok: true };
  }
  const check = canLoanIn(world, aiClub, player, terms.wageSplitPercent);
  if (!check.ok) return { ok: false, reason: check.reasons[0] };
  const rivals = aiClub.squad.filter((p) => p.position === player.position).sort((a, b) => a.overall - b.overall);
  if (rivals.length && player.overall <= rivals[0].overall - 3) {
    return { ok: false, reason: `${aiClub.short} don't feel he'd add enough to the squad.` };
  }
  return { ok: true };
}

// A shortlist for the loan-out UI to offer, rather than making the human browse every
// club in the division structure by hand: plausible destinations only — his own tier
// down to two tiers weaker (the classic "out on loan for games" move), excluding
// wherever he already is. Reputation-sorted so the most sensible fits lead the list.
export function loanDestinationCandidates(world, parentClub, player, limit = 8) {
  return Object.values(world.clubs)
    .filter((c) => !c.isPlayerClub && c.id !== parentClub.id && c.tier >= parentClub.tier && c.tier <= parentClub.tier + 2)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, limit);
}

function squadRatingOf(club) {
  if (!club.squad.length) return 0;
  const sorted = [...club.squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  return sorted.reduce((s, p) => s + p.overall, 0) / sorted.length;
}

// terms: { wageSplitPercent, duration: 'winter'|'season', futureFee: { type:'option'|
// 'obligation', amount, trigger:'appearances'|'endOfLoan', appsThreshold? } | null }
export function sendOnLoan(world, parentClub, loanClub, player, terms) {
  const outCheck = canLoanOut(world, parentClub, player);
  if (!outCheck.ok) return { ok: false, reasons: outCheck.reasons };
  const inCheck = canLoanIn(world, loanClub, player, terms.wageSplitPercent);
  if (!inCheck.ok) return { ok: false, reasons: inCheck.reasons };

  parentClub.squad = parentClub.squad.filter((p) => p.id !== player.id);
  const loaned = { ...player, onLoanFrom: parentClub.id, loanWagePercent: terms.wageSplitPercent };
  loanClub.squad.push(loaned);

  parentClub.loanWageCommitment = (parentClub.loanWageCommitment || 0)
    + Math.round(player.wage * (100 - terms.wageSplitPercent) / 100);

  world.loans = world.loans || [];
  const loan = {
    id: nextLoanId(world), playerId: player.id, parentClubId: parentClub.id, loanClubId: loanClub.id,
    wageSplitPercent: terms.wageSplitPercent, returnAt: terms.duration,
    recallProtectedUntilMatchday: world.matchdayIndex + RECALL_PROTECTION_MATCHDAYS,
    futureFee: terms.futureFee || null, appsSinceLoanStart: 0,
    createdSeason: world.seasonNumber,
  };
  world.loans.push(loan);

  parentClub.lineup = pickBestXI(parentClub);
  loanClub.lineup = pickBestXI(loanClub);

  if (parentClub.isPlayerClub || loanClub.isPlayerClub) {
    pushInboxEntry(world, {
      type: 'loan', tone: 'neutral', title: 'Loan agreed',
      body: parentClub.isPlayerClub
        ? `${player.name} joins ${loanClub.name} on loan.`
        : `${player.name} joins you on loan from ${parentClub.name}.`,
    });
  }
  return { ok: true, player: loaned, loan };
}

export function canRecall(world, loan) {
  if (world.matchdayIndex < loan.recallProtectedUntilMatchday) {
    return { ok: false, reason: 'This loan cannot be recalled yet' };
  }
  return { ok: true };
}

export function recallLoan(world, loanId) {
  const loan = (world.loans || []).find((l) => l.id === loanId);
  if (!loan) return { ok: false, reasons: ['Loan not found'] };
  const check = canRecall(world, loan);
  if (!check.ok) return { ok: false, reasons: [check.reason] };
  return endLoan(world, loan, { recalled: true });
}

function endLoan(world, loan, { recalled = false } = {}) {
  const parentClub = world.clubs[loan.parentClubId];
  const loanClub = world.clubs[loan.loanClubId];
  world.loans = (world.loans || []).filter((l) => l.id !== loan.id);
  if (!parentClub || !loanClub) return { ok: true };

  const player = loanClub.squad.find((p) => p.id === loan.playerId);
  if (!player) return { ok: true };

  parentClub.loanWageCommitment = Math.max(0, (parentClub.loanWageCommitment || 0)
    - Math.round(player.wage * (100 - loan.wageSplitPercent) / 100));

  loanClub.squad = loanClub.squad.filter((p) => p.id !== loan.playerId);
  const { onLoanFrom, loanWagePercent, ...returned } = player;
  parentClub.squad.push(returned);
  parentClub.lineup = pickBestXI(parentClub);
  loanClub.lineup = pickBestXI(loanClub);

  if (parentClub.isPlayerClub || loanClub.isPlayerClub) {
    pushInboxEntry(world, {
      type: 'loan', tone: 'neutral', title: recalled ? 'Player recalled' : 'Loan spell ended',
      body: parentClub.isPlayerClub
        ? (recalled ? `${player.name} has been recalled from his loan at ${loanClub.name}.` : `${player.name} returns from his loan at ${loanClub.name}.`)
        : (recalled ? `${player.name} has been recalled by ${parentClub.name} — his loan with you ends early.` : `${player.name} returns to ${parentClub.name} — his loan with you is over.`),
    });
  }
  return { ok: true, player: returned };
}

function convertLoanToPermanent(world, loan, fee) {
  const parentClub = world.clubs[loan.parentClubId];
  const loanClub = world.clubs[loan.loanClubId];
  world.loans = (world.loans || []).filter((l) => l.id !== loan.id);
  if (!parentClub || !loanClub) return;

  const player = loanClub.squad.find((p) => p.id === loan.playerId);
  if (!player) return;

  parentClub.loanWageCommitment = Math.max(0, (parentClub.loanWageCommitment || 0)
    - Math.round(player.wage * (100 - loan.wageSplitPercent) / 100));

  if (fee > 0) {
    spendTransferFee(loanClub, fee, world.seasonNumber, `Permanent transfer (ex-loan): ${player.name}`);
    receiveTransferFee(parentClub, fee, world.seasonNumber, `Permanent transfer (ex-loan): ${player.name}`);
    fireSellOnClauses(world, player.id, player.name, fee, parentClub.id);
  }
  player.onLoanFrom = null;
  player.loanWagePercent = null;
  player.joinedFrom = parentClub.short;

  if (parentClub.isPlayerClub || loanClub.isPlayerClub) {
    pushInboxEntry(world, {
      type: 'loan', tone: parentClub.isPlayerClub ? 'gold' : 'neutral', title: 'Loan made permanent',
      body: loanClub.isPlayerClub
        ? `${player.name}'s loan move has become permanent.`
        : `${player.name}'s loan at ${loanClub.name} has become a permanent transfer.`,
    });
  }
}

// Called from the same per-appearance hook obligations.js's own rise-clause/instalment
// tracking uses — an obligation-to-buy on an appearances trigger needs to fire mid-loan,
// not wait for the loan to naturally end.
export function recordLoanAppearance(world, club, player) {
  if (!player.onLoanFrom) return;
  const loan = (world.loans || []).find((l) => l.playerId === player.id && l.loanClubId === club.id);
  if (!loan || !loan.futureFee) return;
  loan.appsSinceLoanStart = (loan.appsSinceLoanStart || 0) + 1;
  if (loan.futureFee.type === 'obligation' && loan.futureFee.trigger === 'appearances'
      && loan.appsSinceLoanStart >= loan.futureFee.appsThreshold) {
    convertLoanToPermanent(world, loan, loan.futureFee.amount);
  }
}

// Called at each natural loan boundary: when the winter window opens (for 'winter'
// loans) and always at season end (a safety net for any 'winter' loan that slipped
// through, and the real trigger for every 'season' loan). An obligation on an
// end-of-loan trigger always converts; an option is resolved by a simple, honest
// heuristic — exercised only if he's now clearly worth more than the pre-agreed price —
// rather than an interactive prompt, since this always fires mid-simulation, often deep
// inside an autoplay/sim-ahead run with no natural place to pause for a human decision.
export function checkLoanReturns(world, { atSeasonEnd = false } = {}) {
  const due = (world.loans || []).filter((l) => l.returnAt === 'winter' || atSeasonEnd);
  for (const loan of due) {
    if (loan.futureFee?.type === 'obligation' && loan.futureFee.trigger === 'endOfLoan') {
      convertLoanToPermanent(world, loan, loan.futureFee.amount);
      continue;
    }
    if (loan.futureFee?.type === 'option') {
      const loanClub = world.clubs[loan.loanClubId];
      const player = loanClub?.squad.find((p) => p.id === loan.playerId);
      if (player && player.value > loan.futureFee.amount * 1.1) {
        convertLoanToPermanent(world, loan, loan.futureFee.amount);
        continue;
      }
    }
    endLoan(world, loan);
  }
}

// Any permanent, fee-less departure needs its active loan torn up rather than left
// pointing at a player who no longer exists on either club's books — mirrors
// obligations.js's own dischargePlayerObligations for exactly the same reason.
export function dischargePlayerLoan(world, playerId) {
  const loan = (world.loans || []).find((l) => l.playerId === playerId);
  if (!loan) return;
  const parentClub = world.clubs[loan.parentClubId];
  if (parentClub) {
    const loanClub = world.clubs[loan.loanClubId];
    const player = loanClub?.squad.find((p) => p.id === playerId);
    if (player) {
      parentClub.loanWageCommitment = Math.max(0, (parentClub.loanWageCommitment || 0)
        - Math.round(player.wage * (100 - loan.wageSplitPercent) / 100));
    }
  }
  world.loans = (world.loans || []).filter((l) => l.playerId !== playerId);
}

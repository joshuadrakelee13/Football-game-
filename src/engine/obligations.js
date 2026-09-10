// Sell-on clauses, instalment schedules and rise clauses: the durable side-effects of
// a negotiated transfer that outlive the deal itself.
//
// Deliberately a leaf module, like finance.js's recordLedger — it only reads/writes
// plain fields on `world` and calls spendTransferFee/receiveTransferFee/pushInboxEntry,
// never anything in transfers.js/negotiation.js — so every one of those can import this
// with zero circular-import risk.
//
// All three obligation types are keyed by the stable player id, never attached to the
// player object or to a specific club — that is what lets a sell-on clause correctly
// follow a player through any number of later sales with no extra bookkeeping: the
// record just stays where it is, regardless of who currently holds the player.

import { spendTransferFee, receiveTransferFee } from './finance.js';
import { pushInboxEntry } from './inbox.js';

function nextObligationId(world) {
  world.obligationSeq = (world.obligationSeq ?? 0) + 1;
  return world.obligationSeq;
}

function findPlayer(world, clubId, playerId) {
  return world.clubs[clubId]?.squad.find((p) => p.id === playerId) || null;
}

// ---------------------------------------------------------------------------
// Creation — called by negotiation.js once a deal with add-ons is finalised.
// ---------------------------------------------------------------------------

export function addSellOnClause(world, { playerId, holderClubId, percent }) {
  world.sellOnClauses = world.sellOnClauses || [];
  world.sellOnClauses.push({
    id: nextObligationId(world), playerId, holderClubId, percent,
    createdSeason: world.seasonNumber,
  });
}

export function addInstallmentSchedule(world, { playerId, debtorClubId, creditorClubId, totalRemaining, installmentsRemaining, appsPerInstallment }) {
  if (totalRemaining <= 0 || installmentsRemaining <= 0) return;
  world.installmentSchedules = world.installmentSchedules || [];
  world.installmentSchedules.push({
    id: nextObligationId(world), playerId, debtorClubId, creditorClubId,
    totalRemaining, installmentsRemaining, appsPerInstallment: Math.max(1, appsPerInstallment),
    appsSinceLastPayout: 0, createdSeason: world.seasonNumber,
  });
}

export function addRiseClause(world, { playerId, debtorClubId, creditorClubId, amount, trigger }) {
  if (amount <= 0) return;
  world.riseClauses = world.riseClauses || [];
  world.riseClauses.push({
    id: nextObligationId(world), playerId, debtorClubId, creditorClubId, amount,
    trigger: { ...trigger, appsSinceSigning: 0 }, createdSeason: world.seasonNumber,
  });
}

// ---------------------------------------------------------------------------
// Sell-on clauses — fire once, on the very next fee-bearing sale, then discharge.
// Not a perpetual tax on every future sale: this is the common real-world shape of a
// sell-on clause, and it avoids an ever-growing liability list across a long save.
// ---------------------------------------------------------------------------

// Called from sellPlayer/signPlayer right after the seller receives their fee. A
// clause is a claim on THIS sale's proceeds, not an extra charge to the buyer, so the
// seller's own receipt is reduced by the same amount paid out to the clause holder.
export function fireSellOnClauses(world, playerId, playerName, fee, sellingClubId) {
  const clauses = (world.sellOnClauses || []).filter((c) => c.playerId === playerId);
  if (!clauses.length) return;
  world.sellOnClauses = (world.sellOnClauses || []).filter((c) => c.playerId !== playerId);

  for (const clause of clauses) {
    if (clause.holderClubId === sellingClubId) continue; // can't owe yourself
    const holder = world.clubs[clause.holderClubId];
    const seller = world.clubs[sellingClubId];
    if (!holder || !seller) continue;
    const cut = Math.round((fee * clause.percent) / 100);
    if (cut <= 0) continue;

    spendTransferFee(seller, cut, world.seasonNumber, `Sell-on clause to ${holder.short}: ${playerName}`);
    receiveTransferFee(holder, cut, world.seasonNumber, `Sell-on clause from ${seller.short}: ${playerName}`);

    if (holder.isPlayerClub || seller.isPlayerClub) {
      pushInboxEntry(world, {
        type: 'sell_on', tone: holder.isPlayerClub ? 'gold' : 'neutral',
        title: 'Sell-on clause triggered',
        body: holder.isPlayerClub
          ? `Your ${clause.percent}% sell-on clause on ${playerName} has paid out — ${seller.name} sold him on.`
          : `A ${clause.percent}% sell-on clause on ${playerName} costs you a share of the fee.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Instalments and appearance-milestone rise clauses — both track progress local to
// the obligation record itself (not player.apps/seasonApps/careerApps: none of those
// are right — one never resets, one resets every season boundary and would silently
// break a schedule spanning two seasons). Called from the same hook player.apps++
// already fires from, gated to the debtor club so only appearances FOR THE CLUB THAT
// OWES THE MONEY count. An unresolved schedule simply freezes, rather than errors, if
// the debtor sells the player on before the milestone is hit — a deliberate scope cut,
// not a bug: no "debt converts to lump sum on resale" logic.
// ---------------------------------------------------------------------------

export function recordAppearanceForObligations(world, club, player) {
  const schedules = (world.installmentSchedules || []).filter(
    (s) => s.playerId === player.id && s.debtorClubId === club.id,
  );
  for (const schedule of schedules) {
    schedule.appsSinceLastPayout++;
    if (schedule.appsSinceLastPayout >= schedule.appsPerInstallment) {
      payInstallment(world, schedule, player);
    }
  }

  const rises = (world.riseClauses || []).filter(
    (c) => c.playerId === player.id && c.debtorClubId === club.id && c.trigger.type === 'appearances',
  );
  for (const clause of rises) {
    clause.trigger.appsSinceSigning = (clause.trigger.appsSinceSigning || 0) + 1;
    if (clause.trigger.appsSinceSigning >= clause.trigger.threshold) {
      fireRiseClause(world, clause, player);
    }
  }
}

function payInstallment(world, schedule, player) {
  schedule.appsSinceLastPayout = 0;
  schedule.installmentsRemaining--;
  // Recomputed fresh from what's actually left, so the final instalment exactly
  // zeroes the remainder rather than drifting from a fixed number baked in at creation.
  const amount = schedule.installmentsRemaining > 0
    ? Math.floor(schedule.totalRemaining / (schedule.installmentsRemaining + 1))
    : schedule.totalRemaining;
  schedule.totalRemaining -= amount;

  const debtor = world.clubs[schedule.debtorClubId];
  const creditor = world.clubs[schedule.creditorClubId];
  if (debtor && amount > 0) spendTransferFee(debtor, amount, world.seasonNumber, `Instalment for ${player.name}`);
  if (creditor && amount > 0) receiveTransferFee(creditor, amount, world.seasonNumber, `Instalment received: ${player.name}`);

  if (schedule.installmentsRemaining <= 0) {
    world.installmentSchedules = (world.installmentSchedules || []).filter((s) => s.id !== schedule.id);
  }

  if (debtor?.isPlayerClub || creditor?.isPlayerClub) {
    pushInboxEntry(world, {
      type: 'installment', tone: creditor?.isPlayerClub ? 'gold' : 'neutral',
      title: 'Instalment paid',
      body: creditor?.isPlayerClub
        ? `An instalment for ${player.name}'s transfer has landed.`
        : `An instalment is due for ${player.name}'s transfer.`,
    });
  }
}

function fireRiseClause(world, clause, player) {
  world.riseClauses = (world.riseClauses || []).filter((c) => c.id !== clause.id);
  const debtor = world.clubs[clause.debtorClubId];
  const creditor = world.clubs[clause.creditorClubId];
  if (!debtor || !creditor) return;

  const name = player?.name || 'a player';
  spendTransferFee(debtor, clause.amount, world.seasonNumber, `Rise clause for ${name}`);
  receiveTransferFee(creditor, clause.amount, world.seasonNumber, `Rise clause from ${debtor.short}`);

  if (debtor.isPlayerClub || creditor.isPlayerClub) {
    pushInboxEntry(world, {
      type: 'rise_clause', tone: creditor.isPlayerClub ? 'gold' : 'neutral',
      title: 'Rise clause triggered',
      body: creditor.isPlayerClub
        ? `A rise clause on ${name} has paid out.`
        : `A rise clause on ${name} has been triggered — an extra fee is due.`,
    });
  }
}

// Promotion rise clauses are keyed purely to the debtor club being promoted — not to
// the player still being on their books, matching how a real "if promoted, pay X"
// clause usually reads. Called once at season-end promotion resolution.
export function checkPromotionRiseClauses(world, promotedClubIds) {
  const promoted = new Set(promotedClubIds);
  const due = (world.riseClauses || []).filter(
    (c) => c.trigger.type === 'promotion' && promoted.has(c.debtorClubId),
  );
  for (const clause of due) {
    const player = findPlayer(world, clause.debtorClubId, clause.playerId);
    fireRiseClause(world, clause, player);
  }
}

// Any permanent, fee-less departure (an expired contract nobody re-signs) discharges
// every waiting obligation on that player with no payout — processExpiringContracts
// already deletes such players from the simulation outright, so a clause waiting on
// "the next sale" would otherwise become permanently orphaned dead data.
export function dischargePlayerObligations(world, playerId) {
  world.sellOnClauses = (world.sellOnClauses || []).filter((c) => c.playerId !== playerId);
  world.installmentSchedules = (world.installmentSchedules || []).filter((s) => s.playerId !== playerId);
  world.riseClauses = (world.riseClauses || []).filter((c) => c.playerId !== playerId);
}

// Round-based transfer negotiation: a fee haggled with the selling club (with
// optional sell-on/instalment/rise-clause add-ons), then separate personal terms
// agreed with the player himself. Every UI-facing signing goes through this module;
// canSign/signPlayer/sellPlayer (transfers.js) stay the low-level primitives it calls
// once terms are actually agreed.

import { clamp } from '../core/rng.js';
import { canSign, askingPrice, divisionStrength, signPlayer, sellPlayer } from './transfers.js';
import { transferBudget, canAffordWage } from './finance.js';
import { ratingForPrestige, squadRating } from '../model/club.js';
import { wageOf } from '../model/player.js';
import { addSellOnClause, addInstallmentSchedule, addRiseClause } from './obligations.js';

export const MAX_FEE_ROUNDS = 4;
export const MAX_PERSONAL_ROUNDS = 4;
export const MIN_ACCEPTABLE_RATIO = 0.6;

// Looser than canSign: lets a negotiation OPEN hoping for a discount off the asking
// price, rather than requiring the full sticker price to already fit the budget.
// canSign itself is the exact gate used at the real, agreed fee once talks conclude.
export function canOpenNegotiation(world, club, player) {
  const fee = player.askingPrice ?? player.value;
  return canSign(world, club, player, { fee: fee * MIN_ACCEPTABLE_RATIO });
}

// ---------------------------------------------------------------------------
// Fee negotiation
// ---------------------------------------------------------------------------

// One evaluator for both directions: an AI club responding to your bid for one of
// their players (aiRole 'seller'), and an AI club responding to your counter after
// THEY bid for one of yours (aiRole 'buyer'). Same function, not a parallel
// implementation — that's what makes the incoming-bids negotiation upgrade cheap.
export function evaluateFeeOffer(world, aiClub, aiRole, player, offer, round, rng) {
  const reference = player.askingPrice || player.value || 1;
  let ratio = offer.fee / reference;

  // Add-ons shift how palatable a headline fee is: a sell-on percentage is an
  // ongoing stake that makes a lower fee easier to swallow; instalments defer the
  // cash, which is worth less than money now; a rise clause is a future bonus.
  if (offer.sellOnPercent) ratio += offer.sellOnPercent * 0.006;
  if (offer.installmentPreset) ratio -= 0.03;
  if (offer.riseClause) ratio += 0.015;

  return aiRole === 'seller'
    ? evaluateAsSeller(aiClub, player, ratio, offer, round, rng)
    : evaluateAsBuyer(aiClub, player, ratio, offer, round, rng);
}

function evaluateAsSeller(sellerClub, player, ratio, offer, round, rng) {
  const gap = player.overall - squadRating(sellerClub);
  // A little jitter keeps this from being a perfectly solvable formula — the same
  // offer to the same club won't always land on exactly the same side of the line.
  const jitter = rng ? rng.float(-0.04, 0.04) : 0;
  const importanceTarget = (gap >= 3 ? 1.30 : gap >= -3 ? 1.10 : 0.95) + jitter;

  if (ratio < MIN_ACCEPTABLE_RATIO) {
    return { result: 'reject-final', reason: `${sellerClub.short} call that offer insulting and end the conversation.` };
  }
  if (ratio >= importanceTarget) {
    return { result: 'accept', reason: `${sellerClub.short} accept the offer.` };
  }
  if (round >= MAX_FEE_ROUNDS) {
    return { result: 'reject-final', reason: `${sellerClub.short} end the talks — you never got close enough.` };
  }
  const reference = player.askingPrice || player.value;
  const targetFee = reference * importanceTarget;
  const step = clamp(0.5 + round * 0.15, 0.5, 0.9);
  const counterFee = round1000(offer.fee + (targetFee - offer.fee) * step);
  return { result: 'counter', reason: `${sellerClub.short} come back with a higher number.`, counterFee: Math.max(counterFee, offer.fee + 1000) };
}

function evaluateAsBuyer(buyerClub, player, ratio, offer, round, rng) {
  const budget = transferBudget(buyerClub);
  const reference = player.askingPrice || player.value || 1;
  const affordableRatio = budget / reference;
  const reputationPull = ratingForPrestige(buyerClub.reputation);
  // How keen this club is, relative to reference value — bigger, better-resourced
  // clubs stretch further for a player they actually rate.
  const jitter = rng ? rng.float(-0.04, 0.04) : 0;
  const keenness = (player.overall <= reputationPull ? 1.25 : player.overall <= reputationPull + 9 ? 1.05 : 0.9) + jitter;
  const ceiling = Math.min(affordableRatio, keenness);

  if (ratio > Math.max(1.8, ceiling * 1.6)) {
    return { result: 'reject-final', reason: `${buyerClub.short} end talks — nowhere close to what they'll pay.` };
  }
  if (ratio <= ceiling) {
    return { result: 'accept', reason: `${buyerClub.short} agree to pay that.` };
  }
  if (round >= MAX_FEE_ROUNDS || offer.fee > budget * 1.4) {
    return { result: 'reject-final', reason: `${buyerClub.short} walk away — too rich for them.` };
  }
  const targetFee = reference * ceiling;
  const step = clamp(0.5 + round * 0.15, 0.5, 0.9);
  const counterFee = round1000(offer.fee - (offer.fee - targetFee) * step);
  return { result: 'counter', reason: `${buyerClub.short} offer less than that.`, counterFee: Math.max(1000, counterFee) };
}

function round1000(n) {
  return Math.round(n / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Personal terms
// ---------------------------------------------------------------------------

// Extends renewalDemand's ambition/morale model with a club-comparison factor:
// joining a bigger club than his current/previous one discounts the demand slightly
// (the appeal of the project); joining a smaller one raises it. Neutral for a
// same-club renewal (isNewSigning false) — screen-squad.js's existing single-click
// renew flow is untouched and never calls this.
export function personalTermsDemand(world, club, player, isNewSigning, fromClubId = null) {
  const marketWage = wageOf(player);
  const ambition = 1 + Math.max(0, player.overall - 55) * 0.012;
  const moraleFactor = player.morale < 45 ? 1.25 : player.morale > 78 ? 0.95 : 1.08;

  let clubFactor = 1;
  if (isNewSigning) {
    const fromClub = fromClubId ? world.clubs[fromClubId] : null;
    const stepUp = club.reputation - (fromClub?.reputation ?? club.reputation);
    clubFactor = clamp(1 - stepUp * 0.004, 0.85, 1.2);
  }

  const demand = Math.round((marketWage * ambition * moraleFactor * clubFactor) / 50) * 50;
  return { wage: Math.max(marketWage, demand), years: player.age >= 31 ? 1 : player.age >= 28 ? 2 : 3 };
}

export function evaluatePersonalTermsOffer(world, club, player, wage, years, round, rng = null, fromClubId = null) {
  const demand = personalTermsDemand(world, club, player, true, fromClubId);
  const ratio = wage / demand.wage;
  const jitter = rng ? rng.float(-0.03, 0.03) : 0;

  if (ratio < 0.55) {
    return { result: 'reject-final', reason: `${player.name}'s agent ends the conversation — nowhere near enough.`, demand };
  }
  if (ratio >= 0.92 + jitter) {
    return { result: 'accept', reason: `${player.name} agrees to the deal.`, demand };
  }
  if (round >= MAX_PERSONAL_ROUNDS) {
    return { result: 'reject-final', reason: `${player.name}'s agent walks away — too far apart on wages.`, demand };
  }
  const step = clamp(0.5 + round * 0.15, 0.5, 0.9);
  const counterWage = Math.round((wage + (demand.wage - wage) * step) / 50) * 50;
  return { result: 'counter', reason: `${player.name} wants more than that.`, counterWage: Math.max(counterWage, wage + 50), demand };
}

// ---------------------------------------------------------------------------
// Finalising — the only function that calls signPlayer/sellPlayer once every stage
// has agreed. Nothing touches club.squad or any budget before this.
// ---------------------------------------------------------------------------

export function finalizeSigning(world, session, rng) {
  const { kind, playerId, counterpartyClubId, agreedFee, yourOffer } = session;
  // The agreed fee is the TOTAL deal value; only the upfront portion is actually
  // charged/received now via signPlayer/sellPlayer — the rest moves later, in slices,
  // as the instalment schedule pays out. Computed once here so the immediate charge
  // and the schedule's total can never drift apart or double-count each other.
  const deferredValue = yourOffer?.installmentPreset
    ? Math.round((agreedFee || 0) * yourOffer.installmentPreset.fraction)
    : 0;
  const upfrontFee = (agreedFee || 0) - deferredValue;

  if (kind === 'buy') {
    const buyerClub = world.clubs[world.playerClubId];
    const sellerClub = counterpartyClubId ? world.clubs[counterpartyClubId] : null;
    const player = sellerClub
      ? sellerClub.squad.find((p) => p.id === playerId)
      : (world.freeAgents || []).find((p) => p.id === playerId)
        || (world.transferMarket || []).find((p) => p.id === playerId);
    if (!player) return { ok: false, reasons: ['That player is no longer available.'] };

    const wage = session.personalOffer?.wage;
    const years = session.personalOffer?.years;
    const result = signPlayer(world, buyerClub, player, rng, { fee: upfrontFee, wage, years });
    if (!result.ok) return result;

    attachAddOns(world, session, result.player.id, buyerClub.id, sellerClub?.id, deferredValue);
    return { ...result, fee: agreedFee ?? result.fee };
  }

  // kind === 'sell'
  const sellerClub = world.clubs[world.playerClubId];
  const buyerClub = world.clubs[counterpartyClubId];
  const player = sellerClub.squad.find((p) => p.id === playerId);
  if (!player || !buyerClub) return { ok: false, reasons: ['That deal is no longer available.'] };

  const result = sellPlayer(world, sellerClub, playerId, upfrontFee, buyerClub.id);
  if (!result.ok) return result;

  attachAddOns(world, session, playerId, buyerClub.id, sellerClub.id, deferredValue);
  return { ...result, fee: agreedFee ?? result.fee };
}

function attachAddOns(world, session, playerId, buyerClubId, sellerClubId, deferredValue) {
  const { yourOffer } = session;
  if (!sellerClubId || !yourOffer) return; // no add-ons on a free-agent signing — nobody to hold them

  if (yourOffer.sellOnPercent) {
    addSellOnClause(world, { playerId, holderClubId: sellerClubId, percent: yourOffer.sellOnPercent });
  }
  if (yourOffer.installmentPreset && deferredValue > 0) {
    const { installments, appsPerInstallment } = yourOffer.installmentPreset;
    addInstallmentSchedule(world, {
      playerId, debtorClubId: buyerClubId, creditorClubId: sellerClubId,
      totalRemaining: deferredValue, installmentsRemaining: installments, appsPerInstallment,
    });
  }
  if (yourOffer.riseClause) {
    addRiseClause(world, {
      playerId, debtorClubId: buyerClubId, creditorClubId: sellerClubId,
      amount: yourOffer.riseClause.amount, trigger: yourOffer.riseClause.trigger,
    });
  }
}

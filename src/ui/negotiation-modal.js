// The negotiation flow: a fee haggled with the selling club (skipped for a free
// agent, or for a synthetic market listing with no real club behind it — see the
// `hasNegotiableFee` note below), then a separate personal-terms stage with the
// player himself, before anything is actually signed.

import { h } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import {
  canOpenNegotiation, evaluateFeeOffer, personalTermsDemand, evaluatePersonalTermsOffer,
  finalizeSigning, MAX_FEE_ROUNDS, MAX_PERSONAL_ROUNDS,
} from '../engine/negotiation.js';
import { canSign } from '../engine/transfers.js';
import { openModal, closeModal } from './modal.js';
import { persist, render, game, retargetPlayerContext } from '../main.js';
import { toast } from './toast.js';
import { registrationStatus } from '../engine/registration.js';
import { SQUAD_STATUS_LABELS } from '../engine/squadStatus.js';

const SELL_ON_OPTIONS = [0, 10, 20, 30];
const INSTALLMENT_OPTIONS = [
  { key: 'none', label: 'All upfront', preset: null },
  { key: 'a', label: '40% over 4 apps', preset: { fraction: 0.4, installments: 4, appsPerInstallment: 1 } },
  { key: 'b', label: '40% over 8 apps', preset: { fraction: 0.4, installments: 4, appsPerInstallment: 2 } },
];
const RISE_OPTIONS = [
  { key: 'none', label: 'No rise clause', build: null },
  { key: 'promo', label: '+15% on promotion', build: (fee) => ({ amount: Math.round(fee * 0.15), trigger: { type: 'promotion' } }) },
  { key: 'apps', label: '+10% after 20 apps', build: (fee) => ({ amount: Math.round(fee * 0.10), trigger: { type: 'appearances', threshold: 20 } }) },
];
// Written into the NEW contract, offered as a sweetener during personal terms rather
// than haggled over — a wary or ambitious target is easier to convince when he already
// knows his own way out. Presets are a multiple of his value rather than a flat number,
// since the same clause size means very different things for a squad player and a star.
const RELEASE_CLAUSE_OPTIONS = [
  { key: 'none', label: 'None', multiplier: null },
  { key: 'low', label: '1.5× value', multiplier: 1.5 },
  { key: 'mid', label: '2× value', multiplier: 2 },
  { key: 'high', label: '3× value', multiplier: 3 },
];
// Fee-stage add-ons, same shape as a rise clause: a per-trigger payout the buyer owes
// the seller, fired against the generic onAppearance/onGoal match-event interface
// (obligations.js) rather than anything reaching into match internals — so whatever
// later replaces today's minute-by-minute engine only has to keep emitting those two
// events, not touch this code at all. Capped as a share of the fee, not a flat number,
// for the same reason release clauses scale off value: the size that's meaningful for
// a squad player is trivial for a star, and vice versa.
const APPEARANCE_BONUS_OPTIONS = [
  { key: 'none', label: 'None', build: null },
  { key: 'low', label: '0.3% of fee per appearance, capped at 15% of fee', build: (fee) => ({ tag: 'low', amountPerTrigger: round1000(fee * 0.003), cap: round1000(fee * 0.15) }) },
  { key: 'high', label: '0.6% of fee per appearance, capped at 25% of fee', build: (fee) => ({ tag: 'high', amountPerTrigger: round1000(fee * 0.006), cap: round1000(fee * 0.25) }) },
];
const GOAL_BONUS_OPTIONS = [
  { key: 'none', label: 'None', build: null },
  { key: 'low', label: '1% of fee per goal, capped at 20% of fee', build: (fee) => ({ tag: 'low', amountPerTrigger: round1000(fee * 0.01), cap: round1000(fee * 0.20) }) },
  { key: 'high', label: '2% of fee per goal, capped at 30% of fee', build: (fee) => ({ tag: 'high', amountPerTrigger: round1000(fee * 0.02), cap: round1000(fee * 0.30) }) },
];
// Only the tiers worth promising at signing — nobody convinces a player to join by
// promising him he'll be a rotation option, that's just the default expectation, not a
// sweetener. Breaking whichever of these IS promised is what squadStatus.js's own
// transfer-request check watches for over the following season.
const SQUAD_STATUS_OPTIONS = [
  { key: 'none', label: 'No promise' },
  { key: 'star', label: SQUAD_STATUS_LABELS.star },
  { key: 'important', label: SQUAD_STATUS_LABELS.important },
  { key: 'regular', label: SQUAD_STATUS_LABELS.regular },
];

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function openBuyNegotiation(world, buyerClub, player) {
  const check = canOpenNegotiation(world, buyerClub, player);
  if (!check.ok) { toast('Cannot open talks', check.reasons[0], { tone: 'danger' }); return; }

  const sellerClubId = player.fromClub || null;
  // Only a real club's own squad player is negotiable — a synthetic market listing
  // (fromClub null but a real asking price) or a free agent has no counterparty to
  // haggle with, so those go straight to personal terms at the fixed fee/free.
  const hasNegotiableFee = !!sellerClubId;
  const askingFee = player.askingPrice ?? player.value;

  const session = {
    kind: 'buy',
    stage: hasNegotiableFee ? 'fee' : 'personal',
    playerId: player.id,
    playerSnapshot: player,
    counterpartyClubId: sellerClubId,
    round: 1,
    yourOffer: { fee: askingFee, sellOnPercent: 0, installmentPreset: null, riseClause: null, appearanceBonus: null, goalBonus: null },
    agreedFee: hasNegotiableFee ? null : askingFee,
    clubResponse: null,
    personalOffer: null,
    personalResponse: null,
  };
  renderSession(world, session);
}

// A release clause is a standing offer to the whole league at a fixed figure: no
// haggling, and the selling club has no discretion to refuse — so this skips the fee
// stage entirely rather than routing through evaluateFeeOffer's normal seller logic,
// which is built around a club that CAN say no.
export function openReleaseClauseNegotiation(world, buyerClub, player) {
  const fee = player.releaseClause;
  const check = canSign(world, buyerClub, player, { fee });
  if (!check.ok) { toast('Cannot trigger clause', check.reasons[0], { tone: 'danger' }); return; }

  const session = {
    kind: 'buy',
    stage: 'personal',
    playerId: player.id,
    playerSnapshot: player,
    counterpartyClubId: player.fromClub || null,
    round: 1,
    yourOffer: { fee, sellOnPercent: 0, installmentPreset: null, riseClause: null, appearanceBonus: null, goalBonus: null },
    agreedFee: fee,
    clubResponse: null,
    personalOffer: null,
    personalResponse: null,
    viaReleaseClause: true,
  };
  renderSession(world, session);
}

export function openSellNegotiation(world, sellerClub, bid) {
  const player = sellerClub.squad.find((p) => p.id === bid.playerId);
  if (!player) return;
  const session = {
    kind: 'sell',
    stage: 'fee',
    playerId: player.id,
    playerSnapshot: player,
    counterpartyClubId: bid.buyerId,
    round: 1,
    yourOffer: { fee: bid.offer, sellOnPercent: 0, installmentPreset: null, riseClause: null, appearanceBonus: null, goalBonus: null },
    agreedFee: null,
    clubResponse: null,
    personalOffer: null,
    personalResponse: null,
    originalBid: bid,
  };
  renderSession(world, session);
}

function renderSession(world, session) {
  if (session.stage === 'fee') return renderOfferBuilder(world, session);
  if (session.stage === 'personal') return renderPersonalTerms(world, session);
  if (session.stage === 'complete') return renderComplete(world, session);
  return renderWalkedAway(world, session);
}

// ---------------------------------------------------------------------------
// Stage 1: fee
// ---------------------------------------------------------------------------

function renderOfferBuilder(world, session) {
  const player = session.playerSnapshot;
  const counterparty = session.counterpartyClubId ? world.clubs[session.counterpartyClubId] : null;
  const offer = session.yourOffer;

  openModal({
    title: `Negotiate: ${player.name}`,
    wide: true,
    body: h('div', null,
      h('p', { style: { color: 'var(--text-2)', fontSize: '13px', marginTop: 0 } },
        session.kind === 'buy' ? `Negotiating with ${counterparty.name}.` : `${counterparty.name} want to sign ${player.name}.`,
        ` Round ${session.round} of ${MAX_FEE_ROUNDS}.`),

      session.clubResponse ? responseBanner(session.clubResponse) : null,

      h('div', { class: 'field' },
        h('label', { class: 'eyebrow' }, 'Fee'),
        h('input', {
          id: 'neg-fee', type: 'number', step: 1000, value: offer.fee,
          style: fieldStyle,
        }),
        h('div', { class: 'formation-picker', style: { marginTop: '8px' } },
          quickAdjust('-10%', () => { offer.fee = round1000(offer.fee * 0.9); renderOfferBuilder(world, session); }),
          quickAdjust('Match asking', () => { offer.fee = player.askingPrice ?? player.value; renderOfferBuilder(world, session); }),
          quickAdjust('+10%', () => { offer.fee = round1000(offer.fee * 1.1); renderOfferBuilder(world, session); }),
        ),
      ),

      h('div', { style: { display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' } },
        addOnRow('Sell-on clause', SELL_ON_OPTIONS.map((pct) => ({
          key: String(pct), label: pct === 0 ? 'None' : `${pct}%`, active: offer.sellOnPercent === pct,
          onclick: () => { offer.sellOnPercent = pct; renderOfferBuilder(world, session); },
        }))),
        addOnRow('Instalments', INSTALLMENT_OPTIONS.map((opt) => ({
          key: opt.key, label: opt.label, active: samePreset(offer.installmentPreset, opt.preset),
          onclick: () => { offer.installmentPreset = opt.preset; renderOfferBuilder(world, session); },
        }))),
        addOnRow('Rise clause', RISE_OPTIONS.map((opt) => ({
          key: opt.key, label: opt.label, active: sameRise(offer.riseClause, opt.key),
          onclick: () => { offer.riseClause = opt.build ? opt.build(offer.fee) : null; renderOfferBuilder(world, session); },
        }))),
        addOnRow('Appearance bonus', APPEARANCE_BONUS_OPTIONS.map((opt) => ({
          key: opt.key, label: opt.label, active: sameBonusOption(offer.appearanceBonus, opt.key),
          onclick: () => { offer.appearanceBonus = opt.build ? opt.build(offer.fee) : null; renderOfferBuilder(world, session); },
        }))),
        addOnRow('Goal bonus', GOAL_BONUS_OPTIONS.map((opt) => ({
          key: opt.key, label: opt.label, active: sameBonusOption(offer.goalBonus, opt.key),
          onclick: () => { offer.goalBonus = opt.build ? opt.build(offer.fee) : null; renderOfferBuilder(world, session); },
        }))),
      ),
    ),
    actions: [
      h('button', { class: 'btn ghost', onclick: () => closeModal() }, 'Walk away'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const el = document.getElementById('neg-fee');
          offer.fee = Math.max(1000, Math.round(Number(el.value) || offer.fee));
          submitFeeOffer(world, session);
        },
      }, session.clubResponse?.result === 'counter' ? 'Send revised offer' : 'Make offer'),
    ],
  });
}

function submitFeeOffer(world, session) {
  const player = session.playerSnapshot;
  const counterparty = world.clubs[session.counterpartyClubId];
  const aiRole = session.kind === 'buy' ? 'seller' : 'buyer';
  const response = evaluateFeeOffer(world, counterparty, aiRole, player, session.yourOffer, session.round, game.rng);
  session.clubResponse = response;

  if (response.result === 'accept') {
    session.agreedFee = session.yourOffer.fee;
    session.round = 1;
    session.stage = session.kind === 'buy' ? 'personal' : 'complete';
    return renderSession(world, session);
  }
  if (response.result === 'reject-final') {
    session.stage = 'walked-away';
    return renderSession(world, session);
  }
  // counter — pre-fill their number so resubmitting unchanged means accepting it
  session.yourOffer = { ...session.yourOffer, fee: response.counterFee };
  session.round++;
  if (session.round > MAX_FEE_ROUNDS) { session.stage = 'walked-away'; return renderSession(world, session); }
  return renderOfferBuilder(world, session);
}

// ---------------------------------------------------------------------------
// Stage 2: personal terms (buy only — free agents land here directly)
// ---------------------------------------------------------------------------

function renderPersonalTerms(world, session) {
  const player = session.playerSnapshot;
  const isFreeAgent = !session.counterpartyClubId;
  const buyerClub = playerClub(world);
  const demand = personalTermsDemand(world, buyerClub, player, true, session.counterpartyClubId);
  if (!session.personalOffer) session.personalOffer = { wage: demand.wage, years: demand.years, releaseClause: null, promisedStatus: null };
  const offer = session.personalOffer;

  openModal({
    title: `Personal terms: ${player.name}`,
    wide: true,
    body: h('div', null,
      h('p', { style: { color: 'var(--text-2)', fontSize: '13px', marginTop: 0 } },
        session.viaReleaseClause ? `Release clause triggered — fee fixed at ${money(session.agreedFee)}.`
          : isFreeAgent ? 'Free transfer.' : `Fee agreed at ${money(session.agreedFee)}.`,
        ` Now agree terms with the player. Round ${session.round} of ${MAX_PERSONAL_ROUNDS}.`),

      session.personalResponse ? responseBanner(session.personalResponse, session.personalResponse.counterWage) : null,

      h('div', { class: 'grid cols-2', style: { gap: 'var(--space-4)' } },
        h('div', { class: 'field' },
          h('label', { class: 'eyebrow' }, 'Wage (per week)'),
          h('input', { id: 'neg-wage', type: 'number', step: 50, value: offer.wage, style: fieldStyle }),
        ),
        h('div', null,
          h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Contract length'),
          h('div', { class: 'formation-picker' }, ...[1, 2, 3, 4, 5].map((y) =>
            h('button', {
              class: 'formation-option' + (offer.years === y ? ' active' : ''),
              onclick: () => { offer.years = y; renderPersonalTerms(world, session); },
            }, `${y} yr`),
          )),
        ),
      ),

      h('div', { style: { display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' } },
        addOnRow('Release clause', RELEASE_CLAUSE_OPTIONS.map((opt) => {
          const amount = opt.multiplier === null ? null : round1000(player.value * opt.multiplier);
          return {
            key: opt.key, label: opt.label, active: offer.releaseClause === amount,
            onclick: () => { offer.releaseClause = amount; renderPersonalTerms(world, session); },
          };
        })),
        addOnRow('Squad status promise', SQUAD_STATUS_OPTIONS.map((opt) => ({
          key: opt.key, label: opt.label, active: (offer.promisedStatus ?? 'none') === opt.key,
          onclick: () => { offer.promisedStatus = opt.key === 'none' ? null : opt.key; renderPersonalTerms(world, session); },
        }))),
      ),
    ),
    actions: [
      h('button', { class: 'btn ghost', onclick: () => closeModal() }, 'Walk away'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const el = document.getElementById('neg-wage');
          offer.wage = Math.max(150, Math.round(Number(el.value) || offer.wage));
          submitPersonalOffer(world, session);
        },
      }, session.personalResponse?.result === 'counter' ? 'Send revised terms' : 'Offer terms'),
    ],
  });
}

function submitPersonalOffer(world, session) {
  const player = session.playerSnapshot;
  const buyerClub = playerClub(world);
  const response = evaluatePersonalTermsOffer(
    world, buyerClub, player, session.personalOffer.wage, session.personalOffer.years,
    session.round, game.rng, session.counterpartyClubId,
  );
  session.personalResponse = response;

  if (response.result === 'accept') {
    session.stage = 'complete';
    return renderSession(world, session);
  }
  if (response.result === 'reject-final') {
    session.stage = 'walked-away';
    return renderSession(world, session);
  }
  session.personalOffer = { ...session.personalOffer, wage: response.counterWage };
  session.round++;
  if (session.round > MAX_PERSONAL_ROUNDS) { session.stage = 'walked-away'; return renderSession(world, session); }
  return renderPersonalTerms(world, session);
}

// ---------------------------------------------------------------------------
// Stage 3: confirm, or walk away
// ---------------------------------------------------------------------------

function renderComplete(world, session) {
  const player = session.playerSnapshot;
  const counterparty = session.counterpartyClubId ? world.clubs[session.counterpartyClubId] : null;

  openModal({
    title: 'Deal agreed',
    body: h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' } },
        summaryStat('Player', player.name),
        summaryStat('Fee', session.agreedFee ? money(session.agreedFee) : 'Free'),
        session.kind === 'buy' && session.personalOffer ? summaryStat('Wage', money(session.personalOffer.wage) + '/wk') : null,
        session.kind === 'buy' && session.personalOffer ? summaryStat('Contract', `${session.personalOffer.years} yr`) : null,
        session.kind === 'buy' && session.personalOffer?.releaseClause
          ? summaryStat('Release clause', money(session.personalOffer.releaseClause)) : null,
        session.kind === 'buy' && session.personalOffer?.promisedStatus
          ? summaryStat('Promised', SQUAD_STATUS_LABELS[session.personalOffer.promisedStatus]) : null,
      ),
      addOnSummary(session.yourOffer, counterparty),
    ),
    actions: [
      h('button', { class: 'btn ghost', onclick: () => closeModal() }, 'Cancel'),
      h('button', {
        class: 'btn primary',
        onclick: () => completeDeal(world, session),
      }, session.kind === 'buy' ? 'Confirm signing' : 'Confirm sale'),
    ],
  });
}

function completeDeal(world, session) {
  const result = finalizeSigning(world, session, game.rng);
  closeModal();
  if (!result.ok) {
    toast('Deal fell through', result.reasons[0], { tone: 'danger' });
    persist(); render();
    return;
  }
  if (session.kind === 'buy') {
    world.transferMarket = (world.transferMarket || []).filter((p) => p.id !== session.playerId);
    world.freeAgents = (world.freeAgents || []).filter((p) => p.id !== session.playerId);
    toast('Signed', `${result.player.name} joins for ${result.fee ? money(result.fee) : 'nothing'}`
      + (session.viaReleaseClause ? ' (release clause triggered)' : ''), { tone: 'gold' });
    // If a Player context is still open on this exact player (opened him, then
    // negotiated from inside that context), it was pointing at a market/free-agent
    // listing that no longer exists — retarget it to where he actually lives now,
    // rather than resolving to "no longer available" on the very next render.
    retargetPlayerContext(session.playerId, { kind: 'squad', clubId: playerClub(world).id });
    // Registration is advisory, not a signing block (a Premier League club really
    // can buy a 26th senior player, it just can't register him) — so the earliest
    // useful moment to flag it is right after the deal that tipped the squad over,
    // not silently waiting for the deadline-day inbox notice.
    const status = registrationStatus(playerClub(world));
    if (status.required && !status.ok) {
      toast('Squad registration', status.issues.join(' · '), { tone: 'danger' });
    }
  } else {
    world.pendingBids = (world.pendingBids || []).filter((b) => b !== session.originalBid);
    toast('Sold', `${session.playerSnapshot.name} leaves for ${money(result.fee)}`, { tone: 'gold' });
  }
  persist(); render();
}

function renderWalkedAway(world, session) {
  openModal({
    title: 'Talks have broken down',
    body: h('p', { style: { color: 'var(--text-2)', margin: 0 } },
      session.clubResponse?.reason || session.personalResponse?.reason || 'No agreement could be reached.'),
    actions: [h('button', { class: 'btn primary', onclick: () => closeModal() }, 'Close')],
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fieldStyle = {
  width: '100%', padding: '8px', background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--line)', borderRadius: 'var(--radius)',
};

function responseBanner(response, counterWage = null) {
  const tone = response.result === 'accept' ? 'good' : response.result === 'counter' ? '' : 'bad';
  return h('div', {
    style: {
      marginBottom: 'var(--space-3)', padding: '10px 12px', borderRadius: 'var(--radius)',
      border: '1px solid var(--line)', fontSize: '13px',
      color: tone === 'good' ? 'var(--pitch)' : tone === 'bad' ? 'var(--danger)' : 'var(--text-2)',
    },
  },
    response.reason,
    response.counterFee ? ` They want ${money(response.counterFee)}.` : '',
    counterWage ? ` He wants ${money(counterWage)}/week.` : '',
  );
}

function addOnRow(label, options) {
  return h('div', null,
    h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, label),
    h('div', { class: 'formation-picker' }, ...options.map((opt) =>
      h('button', { class: 'formation-option' + (opt.active ? ' active' : ''), onclick: opt.onclick }, opt.label),
    )),
  );
}

function summaryStat(k, v) {
  return h('div', null, h('div', { class: 'eyebrow' }, k), h('div', { class: 'mono', style: { fontSize: '15px' } }, v));
}

function addOnSummary(offer, counterparty) {
  const parts = [];
  if (offer?.sellOnPercent) parts.push(`${counterparty?.short || 'They'} keep a ${offer.sellOnPercent}% sell-on clause.`);
  if (offer?.installmentPreset) parts.push(`${Math.round(offer.installmentPreset.fraction * 100)}% of the fee is paid in instalments.`);
  if (offer?.riseClause) {
    parts.push(offer.riseClause.trigger.type === 'promotion'
      ? 'A rise clause pays extra on promotion.'
      : `A rise clause pays extra after ${offer.riseClause.trigger.threshold} appearances.`);
  }
  if (offer?.appearanceBonus) parts.push(`${money(offer.appearanceBonus.amountPerTrigger)} per appearance, up to ${money(offer.appearanceBonus.cap)}.`);
  if (offer?.goalBonus) parts.push(`${money(offer.goalBonus.amountPerTrigger)} per goal, up to ${money(offer.goalBonus.cap)}.`);
  if (!parts.length) return null;
  return h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px' } }, parts.join(' '));
}

function quickAdjust(label, onclick) {
  return h('button', { class: 'formation-option', onclick }, label);
}

function round1000(n) {
  return Math.max(1000, Math.round(n / 1000) * 1000);
}

function samePreset(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.fraction === b.fraction && a.installments === b.installments && a.appsPerInstallment === b.appsPerInstallment;
}

function sameRise(current, key) {
  if (!current) return key === 'none';
  return current.trigger.type === (key === 'promo' ? 'promotion' : 'appearances');
}

function sameBonusOption(current, key) {
  if (!current) return key === 'none';
  return current.tag === key;
}

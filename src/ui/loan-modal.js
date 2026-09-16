// Loan negotiation: a single accept/reject read against the terms the human proposes,
// not the round-based haggle negotiation-modal.js runs for a fee — there's no price to
// disagree over, just whether the move suits both clubs (see loans.js's own note on
// evaluateLoanOffer for why that's a fair simplification).

import { h } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import {
  LOAN_WAGE_SPLIT_OPTIONS, LOAN_DURATIONS, evaluateLoanOffer, sendOnLoan, loanDestinationCandidates,
} from '../engine/loans.js';
import { openModal, closeModal } from './modal.js';
import { persist, render, retargetPlayerContext } from '../main.js';
import { toast } from './toast.js';

const FUTURE_FEE_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'option', label: 'Option to buy' },
  { key: 'obligation', label: 'Obligation to buy' },
];

function round1000(n) {
  return Math.max(1000, Math.round(n / 1000) * 1000);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function openLoanOutModal(world, parentClub, player) {
  const candidates = loanDestinationCandidates(world, parentClub, player);
  if (!candidates.length) { toast('No loan destinations', 'No club at a suitable level wants to talk.', { tone: 'danger' }); return; }

  const state = {
    destinationId: candidates[0].id,
    wageSplitPercent: 50,
    duration: 'season',
    futureFeeType: 'none',
    futureFeeAmount: round1000(player.value * 1.2),
    appsThreshold: 10,
  };
  renderLoanOutModal(world, parentClub, player, candidates, state);
}

export function openLoanEnquiryModal(world, parentClub, player) {
  const loanClub = playerClub(world);
  const state = {
    wageSplitPercent: 50,
    duration: 'season',
    futureFeeType: 'none',
    futureFeeAmount: round1000(player.value * 1.2),
    appsThreshold: 10,
  };
  renderLoanEnquiryModal(world, parentClub, loanClub, player, state);
}

// ---------------------------------------------------------------------------
// Loaning one of your own players out
// ---------------------------------------------------------------------------

function renderLoanOutModal(world, parentClub, player, candidates, state) {
  const destination = world.clubs[state.destinationId];
  openModal({
    title: `Loan out: ${player.name}`,
    wide: true,
    body: h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Destination club'),
      h('div', { class: 'formation-picker', style: { marginBottom: 'var(--space-4)', flexWrap: 'wrap' } },
        ...candidates.map((c) => h('button', {
          class: 'formation-option' + (state.destinationId === c.id ? ' active' : ''),
          onclick: () => { state.destinationId = c.id; renderLoanOutModal(world, parentClub, player, candidates, state); },
        }, c.short))),
      termsBuilder(world, player, state, () => renderLoanOutModal(world, parentClub, player, candidates, state)),
    ),
    actions: [
      h('button', { class: 'btn ghost', onclick: () => closeModal() }, 'Cancel'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const terms = buildTerms(state);
          const check = evaluateLoanOffer(world, destination, 'loanClub', player, terms);
          closeModal();
          if (!check.ok) { toast('Loan declined', check.reason, { tone: 'danger' }); return; }
          const result = sendOnLoan(world, parentClub, destination, player, terms);
          if (!result.ok) { toast('Loan fell through', result.reasons[0], { tone: 'danger' }); return; }
          toast('Loan agreed', `${player.name} joins ${destination.name} on loan.`, { tone: 'gold' });
          retargetPlayerContext(player.id, { kind: 'squad', clubId: destination.id });
          persist(); render();
        },
      }, `Propose to ${destination.short}`),
    ],
  });
}

// ---------------------------------------------------------------------------
// Enquiring about a loan for one of an AI club's own players
// ---------------------------------------------------------------------------

function renderLoanEnquiryModal(world, parentClub, loanClub, player, state) {
  openModal({
    title: `Enquire about a loan: ${player.name}`,
    wide: true,
    body: h('div', null,
      h('p', { style: { color: 'var(--text-2)', fontSize: '13px', marginTop: 0 } },
        `Currently at ${parentClub.name}. Propose loan terms below.`),
      termsBuilder(world, player, state, () => renderLoanEnquiryModal(world, parentClub, loanClub, player, state)),
    ),
    actions: [
      h('button', { class: 'btn ghost', onclick: () => closeModal() }, 'Cancel'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const terms = buildTerms(state);
          const check = evaluateLoanOffer(world, parentClub, 'parent', player, terms);
          closeModal();
          if (!check.ok) { toast('Loan declined', check.reason, { tone: 'danger' }); return; }
          const result = sendOnLoan(world, parentClub, loanClub, player, terms);
          if (!result.ok) { toast('Loan fell through', result.reasons[0], { tone: 'danger' }); return; }
          toast('Loan agreed', `${player.name} joins you on loan from ${parentClub.name}.`, { tone: 'gold' });
          retargetPlayerContext(player.id, { kind: 'squad', clubId: loanClub.id });
          persist(); render();
        },
      }, 'Propose loan'),
    ],
  });
}

// ---------------------------------------------------------------------------
// Shared terms builder (wage split / duration / future fee)
// ---------------------------------------------------------------------------

function termsBuilder(world, player, state, rerender) {
  return h('div', { style: { display: 'grid', gap: 'var(--space-4)' } },
    h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Wage the loan club pays'),
      h('div', { class: 'formation-picker' }, ...LOAN_WAGE_SPLIT_OPTIONS.map((pct) => h('button', {
        class: 'formation-option' + (state.wageSplitPercent === pct ? ' active' : ''),
        onclick: () => { state.wageSplitPercent = pct; rerender(); },
      }, `${pct}%`))),
    ),
    h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Duration'),
      h('div', { class: 'formation-picker' }, ...LOAN_DURATIONS.map((d) => h('button', {
        class: 'formation-option' + (state.duration === d.key ? ' active' : ''),
        onclick: () => { state.duration = d.key; rerender(); },
      }, d.label))),
    ),
    h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Future fee'),
      h('div', { class: 'formation-picker' }, ...FUTURE_FEE_OPTIONS.map((opt) => h('button', {
        class: 'formation-option' + (state.futureFeeType === opt.key ? ' active' : ''),
        onclick: () => { state.futureFeeType = opt.key; rerender(); },
      }, opt.label))),
      state.futureFeeType !== 'none' ? h('div', { class: 'grid cols-2', style: { gap: 'var(--space-3)', marginTop: 'var(--space-3)' } },
        h('div', { class: 'field' },
          h('label', { class: 'eyebrow' }, 'Fee'),
          h('input', {
            type: 'number', step: 1000, value: state.futureFeeAmount,
            style: fieldStyle,
            oninput: (e) => { state.futureFeeAmount = Math.max(1000, Math.round(Number(e.target.value) || 0)); },
          }),
        ),
        state.futureFeeType === 'obligation' ? h('div', { class: 'field' },
          h('label', { class: 'eyebrow' }, 'Triggers after N appearances'),
          h('input', {
            type: 'number', step: 1, value: state.appsThreshold,
            style: fieldStyle,
            oninput: (e) => { state.appsThreshold = Math.max(1, Math.round(Number(e.target.value) || 1)); },
          }),
        ) : h('p', { style: { color: 'var(--text-3)', fontSize: '12px', margin: 0, alignSelf: 'center' } },
          'Resolved at the end of the loan — exercised only if he still looks worth it.'),
      ) : null,
    ),
  );
}

function buildTerms(state) {
  let futureFee = null;
  if (state.futureFeeType === 'option') {
    futureFee = { type: 'option', amount: state.futureFeeAmount };
  } else if (state.futureFeeType === 'obligation') {
    futureFee = { type: 'obligation', amount: state.futureFeeAmount, trigger: 'appearances', appsThreshold: state.appsThreshold };
  }
  return { wageSplitPercent: state.wageSplitPercent, duration: state.duration, futureFee };
}

const fieldStyle = {
  width: '100%', padding: '9px 10px', borderRadius: 'var(--radius)',
  border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px',
};

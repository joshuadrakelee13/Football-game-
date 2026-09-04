// Random events, presented as a decision rather than an announcement.

import { h } from './dom.js';
import { openModal, closeModal } from './modal.js';
import { resolveEvent } from '../engine/events.js';
import { game } from '../main.js';
import { toast } from './toast.js';

export function showEvent(event) {
  return new Promise((resolve) => {
    const toneClass = event.tone === 'bad' ? 'danger' : event.tone === 'good' ? 'pitch' : 'info';

    openModal({
      title: event.title,
      dismissible: false,
      body: h('div', null,
        h('span', { class: 'tag ' + toneClass, style: { marginBottom: '12px', display: 'inline-flex' } },
          event.tone === 'bad' ? 'Problem' : event.tone === 'good' ? 'Opportunity' : 'Decision'),
        h('p', { style: { color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' } },
          event.body),
        h('div', { class: 'choice-list' }, ...event.choices.map((choice, i) =>
          h('button', {
            class: 'choice',
            onclick: () => {
              const outcome = resolveEvent(game.world, i);
              closeModal();
              if (outcome?.outcome) toast(event.title, outcome.outcome, { tone: event.tone === 'bad' ? 'danger' : '' });
              resolve(outcome);
            },
          },
            h('span', { class: 'label' }, choice.label),
            choice.detail ? h('span', { class: 'detail' }, choice.detail) : null,
          ),
        )),
      ),
    });
  });
}

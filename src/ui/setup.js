// The opening screen: name your club, or pick up where you left off.

import { h, mount } from './dom.js';
import { money } from '../core/format.js';
import { newGame, continueGame } from '../main.js';
import { PLAYER_CLUB_STARTING_TRANSFER_BUDGET, PLAYER_CLUB_STARTING_WAGE_BUDGET } from '../model/club.js';

export function renderSetup(root, { hasSave }) {
  root.dataset.shell = '';
  const nameInput = h('input', {
    id: 'club-name', type: 'text', value: 'Riverside FC', maxlength: 28,
    autocomplete: 'off', spellcheck: 'false',
  });
  const managerInput = h('input', {
    id: 'manager-name', type: 'text', placeholder: 'Your name', maxlength: 28,
    autocomplete: 'off', spellcheck: 'false',
  });

  const start = () => {
    const clubName = nameInput.value.trim() || 'Riverside FC';
    const managerName = managerInput.value.trim() || 'The Manager';
    newGame({ clubName, managerName });
  };

  mount(root,
    h('div', { class: 'setup' },
      h('div', { class: 'setup-card' },
        h('div', { class: 'brand' }, 'Football ', h('em', null, 'Club'), ' Tycoon'),
        h('p', { class: 'tagline' },
          'Take a club with two thousand seats and no money, and drag it all the way to the Premier League.'),

        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'Your club')),
          h('div', { class: 'panel-body' },
            h('div', { class: 'field' },
              h('label', { class: 'eyebrow' }, 'Club name'),
              nameInput,
              h('div', { class: 'hint' }, 'You take a place in League Two among the real 92.'),
            ),
            h('div', { class: 'field' },
              h('label', { class: 'eyebrow' }, 'Manager name'),
              managerInput,
            ),

            h('div', { class: 'starting-facts' },
              fact('League', 'League Two'),
              fact('Stadium', '2,000 seats'),
              fact('Fans', '1,000'),
              fact('Reputation', '10 / 100'),
              fact('Transfer budget', money(PLAYER_CLUB_STARTING_TRANSFER_BUDGET)),
              fact('Wage budget', money(PLAYER_CLUB_STARTING_WAGE_BUDGET) + '/wk'),
            ),

            h('button', { class: 'btn primary block lg', onclick: start }, 'Start a new save'),
            hasSave
              ? h('button', {
                  class: 'btn ghost block', style: { marginTop: '8px' },
                  onclick: () => { if (!continueGame()) window.location.reload(); },
                }, 'Continue your existing save')
              : null,
          ),
        ),

        h('p', { style: { color: 'var(--text-faint)', fontSize: '11.5px', marginTop: '20px', lineHeight: 1.6 } },
          'An unofficial fan project. Club and competition names belong to their owners; every player in the game is fictional and procedurally generated.'),
      ),
    ),
  );

  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  managerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
}

function fact(k, v) {
  return h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
}

// The application shell: the left rail, the HUD ticker, and the screen container.

import { h, mount, clear, formGuide, animateNumber, visibleColours } from './dom.js';
import { money, compact, ordinal, seasonLabel } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { weeklyWages, squadRating, squadMorale } from '../model/club.js';
import { transferBudget } from '../engine/finance.js';
import { standings } from '../engine/league.js';
import { SCREENS, SCREEN_ORDER } from './screens.js';
import { CONTEXTS } from './contexts.js';
import {
  game, goTo, newGame, continueGame, persist, exportSave, importSave, abandonGame,
  goBack, jumpToContextDepth, setContextTab,
} from '../main.js';
import { openModal, closeModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';

let lastTransferBudget = null;

export function renderShell(root) {
  if (root.dataset.shell === '1') { renderHud(); renderRail(); return; }
  root.dataset.shell = '1';

  mount(root,
    h('div', { id: 'app' },
      h('nav', { id: 'rail' },
        h('div', { class: 'rail-brand', id: 'rail-brand' }),
        h('div', { class: 'rail-nav', id: 'rail-nav' }),
        h('div', { class: 'rail-foot', id: 'rail-foot' }),
      ),
      h('div', { id: 'main' },
        h('header', { id: 'hud' }),
        h('div', { id: 'screen' }),
      ),
    ),
  );

  renderRail();
  renderHud();
}

// ---------------------------------------------------------------------------

function renderRail() {
  const world = game.world;
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];

  const kit = visibleColours(you.colors);
  mount(document.getElementById('rail-brand'),
    h('div', {
      class: 'crest',
      style: { background: `linear-gradient(155deg, ${kit.primary}, ${kit.secondary})` },
    }, you.abbr || you.short?.slice(0, 3).toUpperCase() || ''),
    h('div', { class: 'id' },
      h('span', { class: 'club' }, you.name),
      h('span', { class: 'division' }, `${div.name} · ${seasonLabel(world.startYear)}`),
    ),
  );

  const nav = document.getElementById('rail-nav');
  mount(nav, ...SCREEN_ORDER.map((key) => {
    const screen = SCREENS[key];
    const badgeCount = screen.badge ? screen.badge(world) : 0;
    return h('button', {
      class: 'nav-item' + (game.screen === key ? ' active' : ''),
      onclick: () => goTo(key),
      title: screen.name,
    },
      h('span', { class: 'icon' }, screen.icon),
      h('span', { class: 'label' }, screen.name),
      badgeCount > 0 ? h('span', { class: 'badge' }, badgeCount) : null,
    );
  }));

  mount(document.getElementById('rail-foot'),
    h('button', { class: 'btn ghost sm', onclick: openSaveMenu }, 'Save & data'),
  );
}

// ---------------------------------------------------------------------------

export function renderHud() {
  const world = game.world;
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];

  const table = standings(world.tables[you.tier], (id) => world.clubs[id]?.name || id);
  const row = table.find((r) => r.clubId === you.id);
  const position = row ? table.indexOf(row) + 1 : null;

  const wages = weeklyWages(you);
  const wageRatio = wages / Math.max(1, you.wageBudget);
  const morale = squadMorale(you);

  const hud = document.getElementById('hud');
  clear(hud);

  const transferBudgetEl = h('span', { class: 'v money' }, money(transferBudget(you)));

  hud.appendChild(h('div', { class: 'hud-stats' },
    stat('Position', position ? ordinal(position) : '—', { sub: div.short }),
    h('div', { class: 'hud-stat' },
      h('span', { class: 'k' }, 'Transfer budget'),
      transferBudgetEl,
    ),
    stat('Wages', `${money(wages)}/wk`, { tone: wageRatio > 1 ? 'bad' : wageRatio > 0.92 ? '' : 'good' }),
    stat('Fans', compact(you.fans)),
    stat('Reputation', Math.round(you.reputation)),
    stat('Morale', moraleWord(morale), { tone: morale >= 65 ? 'good' : morale < 42 ? 'bad' : '' }),
    stat('Squad', squadRating(you).toFixed(1)),
    h('div', { class: 'hud-stat' },
      h('span', { class: 'k' }, 'Form'),
      h('span', { class: 'v' }, formGuide(you.form, 5)),
    ),
  ));

  hud.appendChild(h('div', { class: 'hud-actions' },
    h('button', { class: 'btn primary', onclick: () => goTo('overview') }, 'Matchday'),
  ));

  // Counts up rather than snapping, so a signing or a sale registers.
  const currentBudget = transferBudget(you);
  if (lastTransferBudget !== null && lastTransferBudget !== currentBudget) {
    animateNumber(transferBudgetEl, lastTransferBudget, currentBudget, money);
  }
  lastTransferBudget = currentBudget;
}

function stat(label, value, { tone = '', sub = null } = {}) {
  return h('div', { class: 'hud-stat' },
    h('span', { class: 'k' }, label),
    h('span', { class: 'v ' + tone }, value),
  );
}

function moraleWord(m) {
  if (m >= 78) return 'Excellent';
  if (m >= 64) return 'Good';
  if (m >= 50) return 'Fair';
  if (m >= 36) return 'Poor';
  return 'Rock bottom';
}

// ---------------------------------------------------------------------------

export function setActiveScreen(key) {
  const screen = SCREENS[key];
  if (!screen) return;
  const host = document.getElementById('screen');
  if (!host) return;
  host.scrollTop = 0;
  mount(host, game.contextStack.length ? renderContextView(game.world, game.contextStack) : screen.render(game.world));
  renderRail();
  renderHud();
}

// ---------------------------------------------------------------------------
// Object contexts — the drilled-into view, replacing the screen's own content
// exactly the way FM's main area changes for whatever you're looking at while
// the shell around it stays put. See ui/contexts.js for the per-type registry.
// ---------------------------------------------------------------------------

function renderContextView(world, stack) {
  const top = stack.at(-1);
  const def = CONTEXTS[top.type];
  if (!def) return null;

  const tabs = def.tabs(world, top);
  // Resolved lazily and memoised onto the entry on first render, rather than at
  // openContext() time, since tabs() can depend on world state that only the
  // render pass has freshly read.
  if (!top.tab) top.tab = tabs[0]?.key ?? null;

  return h('div', null,
    contextBar(world, stack, def),
    tabs.length > 1 ? tabStrip(tabs, top.tab) : null,
    def.render(world, top),
  );
}

function contextBar(world, stack, def) {
  const top = stack.at(-1);
  return h('div', { class: 'context-bar' },
    h('button', { class: 'context-back', onclick: () => goBack() }, '← Back'),
    h('div', { class: 'context-crumbs' },
      h('button', { class: 'context-crumb', onclick: () => goTo(game.screen) }, SCREENS[game.screen]?.name ?? ''),
      ...stack.flatMap((entry, i) => [
        h('span', { class: 'context-crumb-sep' }, '›'),
        i === stack.length - 1
          ? h('span', { class: 'context-crumb current' }, def.title(world, top))
          : h('button', { class: 'context-crumb', onclick: () => jumpToContextDepth(i) }, CONTEXTS[entry.type]?.title(world, entry) ?? ''),
      ]),
    ),
  );
}

function tabStrip(tabs, activeKey) {
  return h('div', { class: 'context-tabs' }, ...tabs.map((t) =>
    h('button', {
      class: 'context-tab' + (t.key === activeKey ? ' active' : ''),
      onclick: () => setContextTab(t.key),
    }, t.label),
  ));
}

// ---------------------------------------------------------------------------

function openSaveMenu() {
  openModal({
    title: 'Save and data',
    body: h('div', null,
      h('p', { style: { marginTop: 0, color: 'var(--text-2)' } },
        'Your progress saves automatically after every matchday. You can also copy a save out and paste it back in on another browser.'),
      h('div', { class: 'field' },
        h('label', { class: 'eyebrow' }, 'Save data'),
        h('textarea', {
          id: 'save-json', rows: 5, readonly: true,
          style: {
            width: '100%', background: 'var(--surface-2)', color: 'var(--text-3)',
            border: '1px solid var(--line)', borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '8px', resize: 'vertical',
          },
        }, exportSave()),
      ),
      h('div', { class: 'field' },
        h('label', { class: 'eyebrow' }, 'Restore a save'),
        h('textarea', {
          id: 'import-json', rows: 3, placeholder: 'Paste save data here',
          style: {
            width: '100%', background: 'var(--surface-2)', color: 'var(--text)',
            border: '1px solid var(--line)', borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '8px', resize: 'vertical',
          },
        }),
      ),
    ),
    actions: [
      h('button', {
        class: 'btn danger',
        onclick: async () => {
          closeModal();
          const ok = await confirmDialog('Start again?', 'This deletes your current save permanently. There is no way back.', 'Delete save');
          if (ok) abandonGame();
        },
      }, 'Delete save'),
      h('button', {
        class: 'btn',
        onclick: () => {
          const el = document.getElementById('save-json');
          el.select();
          navigator.clipboard?.writeText(el.value).then(
            () => toast('Copied', 'Save data is on your clipboard.'),
            () => toast('Select and copy manually'),
          );
        },
      }, 'Copy save'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const raw = document.getElementById('import-json').value.trim();
          if (!raw) return;
          try {
            importSave(raw);
            closeModal();
            toast('Save restored');
          } catch (err) {
            toast('Could not restore', err.message, { tone: 'danger' });
          }
        },
      }, 'Restore'),
    ],
  });
}

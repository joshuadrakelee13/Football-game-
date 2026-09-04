// Modal dialogs. Always dismissible unless a decision is genuinely required.

import { h, mount } from './dom.js';

let activeCloser = null;

export function openModal({ title, body, actions = [], wide = false, dismissible = true }) {
  closeModal();
  const host = document.getElementById('overlays');

  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (dismissible && e.target === backdrop) closeModal(); },
  },
    h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-head' },
        h('h2', null, title),
        dismissible && h('button', { class: 'btn ghost sm', onclick: () => closeModal() }, 'Close'),
      ),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, ...actions) : null,
    ),
  );

  const onKey = (e) => { if (e.key === 'Escape' && dismissible) closeModal(); };
  document.addEventListener('keydown', onKey);
  activeCloser = () => { document.removeEventListener('keydown', onKey); backdrop.remove(); };

  mount(host, backdrop);
  return backdrop;
}

export function closeModal() {
  if (activeCloser) { activeCloser(); activeCloser = null; }
}

export function confirmDialog(title, message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    openModal({
      title,
      body: h('p', { style: { margin: 0, color: 'var(--text-2)' } }, message),
      actions: [
        h('button', { class: 'btn ghost', onclick: () => { closeModal(); resolve(false); } }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { closeModal(); resolve(true); } }, confirmLabel),
      ],
    });
  });
}

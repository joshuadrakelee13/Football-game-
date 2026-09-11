// Small floating panels anchored to whatever was clicked, rather than centred
// like a modal. A context menu (a one-shot list of actions that closes on
// click) and the role/duty popover (stateful, re-renders itself in place) are
// different components that share the same positioning/dismissal mechanics —
// factored out here as openAnchoredPanel, with openContextMenu built on top.
//
// Panels mount into #overlays (a sibling of #root, per index.html) so they
// survive a full render() of the screen underneath untouched, exactly like
// modal.js's modals do — only the ANCHOR element (living inside #root) can go
// stale across a render(), which is why callers that re-open a popover after
// mutating state (see role-duty.js) must re-resolve their anchor fresh each
// time rather than holding onto the original element reference.

import { h, mount } from './dom.js';

let activePanel = null;
let activeCloser = null;

export function closeAnchoredPanel() {
  if (activePanel) { activePanel.remove(); activePanel = null; }
  if (activeCloser) { activeCloser(); activeCloser = null; }
}

export function openAnchoredPanel(anchorEl, renderBody, { extraClass = '' } = {}) {
  closeAnchoredPanel();
  if (!anchorEl) return null;
  const host = document.getElementById('overlays') || document.body;

  const panel = h('div', { class: 'anchored-panel ' + extraClass });
  mount(panel, renderBody(closeAnchoredPanel));
  host.appendChild(panel);
  position(panel, anchorEl);
  activePanel = panel;

  const onOutside = (e) => {
    if (e.type === 'keydown') { if (e.key === 'Escape') closeAnchoredPanel(); return; }
    if (!panel.contains(e.target)) closeAnchoredPanel();
  };
  // Deferred a tick: the click that opened this panel is still bubbling up to
  // `document` when this runs — attaching synchronously would close the panel
  // on the very click that just opened it.
  const timer = setTimeout(() => {
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onOutside);
  }, 0);
  activeCloser = () => {
    clearTimeout(timer);
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('keydown', onOutside);
  };

  return panel;
}

function position(panel, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 8;

  let top = rect.bottom + margin;
  if (top + panelRect.height > window.innerHeight - margin) {
    top = rect.top - panelRect.height - margin; // flip above when it would overflow the bottom
  }
  top = Math.max(margin, top);

  let left = rect.left;
  if (left + panelRect.width > window.innerWidth - margin) {
    left = window.innerWidth - panelRect.width - margin; // clamp to stay on-screen
  }
  left = Math.max(margin, left);

  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
}

// items: { label, onClick(anchorEl), tone?, divider? }. The anchorEl is threaded
// through onClick so an item (e.g. "Change role/duty") can open a second
// anchored panel off the same trigger element.
export function openContextMenu(anchorEl, items) {
  return openAnchoredPanel(anchorEl, (close) => items.map((item) => item.divider
    ? h('div', { class: 'context-menu-divider' })
    : h('button', {
        class: 'context-menu-item' + (item.tone ? ' ' + item.tone : ''),
        onclick: () => { close(); item.onClick(anchorEl); },
      }, item.label),
  ), { extraClass: 'context-menu' });
}

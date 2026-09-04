// Transient notifications. Deliberately quiet: they slide in from the right and
// leave on their own.

import { h } from './dom.js';

const HOST_ID = 'toasts';
const MAX_VISIBLE = 4;

export function toast(title, body = null, { tone = '', duration = 4200 } = {}) {
  const host = document.getElementById(HOST_ID);
  if (!host) return;

  while (host.children.length >= MAX_VISIBLE) host.removeChild(host.firstChild);

  const el = h('div', { class: 'toast ' + tone },
    h('div', { class: 'title' }, title),
    body && h('div', { class: 'body' }, body),
  );
  host.appendChild(el);

  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export const toastGood = (t, b) => toast(t, b, { tone: '' });
export const toastMoney = (t, b) => toast(t, b, { tone: 'gold' });
export const toastBad = (t, b) => toast(t, b, { tone: 'danger' });

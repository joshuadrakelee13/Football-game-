// Site behaviour. Everything here is an enhancement: every page and link works
// without it.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.body.dataset.root || './';
  const navbar = $('[data-navbar]');
  const masthead = $('[data-masthead]');

  // The nav bar sticks once the masthead scrolls away; the mega menu hangs from
  // its bottom edge. ------------------------------------------------------------
  const syncHeader = () => {
    navbar.classList.toggle('is-stuck', masthead.getBoundingClientRect().bottom <= 0);
    document.documentElement.style.setProperty('--header-bottom', `${navbar.getBoundingClientRect().bottom}px`);
  };
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });
  window.addEventListener('resize', syncHeader);

  // Dropdowns: open on hover (with a short grace period so diagonal mouse moves
  // don't close them), on click of the chevron, and with the keyboard. --------
  const menus = $$('[data-menu]');
  const toggleOf = (m) => $('[aria-expanded]', m);
  const setOpen = (m, open) => {
    m.classList.toggle('is-open', open);
    toggleOf(m).setAttribute('aria-expanded', String(open));
    if (open) { syncHeader(); menus.forEach((o) => o !== m && setOpen(o, false)); }
  };
  const hoverable = matchMedia('(hover: hover) and (pointer: fine)');
  menus.forEach((m) => {
    let timer;
    m.addEventListener('mouseenter', () => { if (!hoverable.matches) return; clearTimeout(timer); timer = setTimeout(() => setOpen(m, true), 80); });
    m.addEventListener('mouseleave', () => { if (!hoverable.matches) return; clearTimeout(timer); timer = setTimeout(() => setOpen(m, false), 220); });
    toggleOf(m).addEventListener('click', () => setOpen(m, !m.classList.contains('is-open')));
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && m.classList.contains('is-open')) { setOpen(m, false); toggleOf(m).focus(); }
      if (e.key === 'ArrowDown' && e.target === toggleOf(m)) {
        e.preventDefault(); setOpen(m, true); $('[data-menu-panel] a', m)?.focus();
      }
    });
    m.addEventListener('focusout', (e) => { if (!m.contains(e.relatedTarget)) setOpen(m, false); });
  });
  document.addEventListener('click', (e) => menus.forEach((m) => !m.contains(e.target) && setOpen(m, false)));

  // Mobile drawer --------------------------------------------------------------
  const drawer = $('#drawer');
  const lightDismiss = (dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $$('[data-drawer-open]').forEach((b) => b.addEventListener('click', () => drawer.showModal()));
  $$('[data-drawer-close]').forEach((b) => b.addEventListener('click', () => drawer.close()));
  lightDismiss(drawer);

  // Search ---------------------------------------------------------------------
  const dlg = $('#search');
  const input = $('[data-search-input]');
  const list = $('[data-search-results]');
  const index = (window.MERLIN_SEARCH || []).map((e) => ({ ...e, hay: `${e.t} ${e.d} ${e.w || ''}`.toLowerCase(), title: e.t.toLowerCase() }));
  const ORDER = ['Category', 'Featured', 'Service', 'Range', 'Product', 'Brand', 'Page'];
  const SUGGESTED = ['Silicone', 'Post Spikes', 'Tool Repair Service', 'Conversion Charts', 'Contact & opening hours'];
  let active = 0;

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const highlight = (text, terms) => {
    let out = escapeHtml(text);
    terms.forEach((t) => { if (t) out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); });
    return out;
  };
  const score = (e, terms) => {
    let s = 0;
    for (const t of terms) {
      if (!e.hay.includes(t)) return 0;
      if (e.title === t) s += 100;
      else if (e.title.startsWith(t)) s += 40;
      else if (e.title.includes(t)) s += 20;
      else s += 5;
    }
    return s + (ORDER.length - ORDER.indexOf(e.k));
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/s$/, '')); // "screws" finds "screw"
    let results;
    if (!terms.length) {
      results = SUGGESTED.map((t) => index.find((e) => e.t === t)).filter(Boolean).map((e) => ({ ...e, k: 'Suggested' }));
    } else {
      const seen = new Set();
      results = index.map((e) => [e, score(e, terms)]).filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1]).map(([e]) => e)
        .filter((e) => { const key = e.t + e.u; if (seen.has(key)) return false; seen.add(key); return true; })
        .slice(0, 14);
    }
    active = 0;
    if (!results.length) {
      list.innerHTML = `<li class="search-empty">No matches for “${escapeHtml(input.value)}”. We stock far more than we list —
        <a class="text-link" href="tel:+441962842002">call 01962 842 002</a> or <a class="text-link" href="${root}contact/">send an enquiry</a>.</li>`;
      return;
    }
    let lastGroup = null;
    list.innerHTML = results.map((e, i) => {
      const group = terms.length ? null : 'Suggested';
      const head = group && group !== lastGroup ? `<li class="search-group" role="presentation">${group}</li>` : '';
      lastGroup = group;
      return `${head}<li role="presentation"><a role="option" id="sr-${i}" href="${root}${e.u}" aria-selected="${i === 0}">
        <span><strong>${highlight(e.t, terms)}</strong><small>${highlight(e.d, terms)}</small></span>
        <span class="search-tag">${e.k === 'Suggested' ? 'Go' : e.k}</span></a></li>`;
    }).join('');
    input.setAttribute('aria-activedescendant', 'sr-0');
  };

  const move = (delta) => {
    const opts = $$('[role="option"]', list);
    if (!opts.length) return;
    opts[active]?.setAttribute('aria-selected', 'false');
    active = (active + delta + opts.length) % opts.length;
    opts[active].setAttribute('aria-selected', 'true');
    opts[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[active].id);
  };

  const openSearch = () => {
    if (drawer.open) drawer.close();
    menus.forEach((m) => setOpen(m, false));
    if (!dlg.open) dlg.showModal();
    input.select();
    render();
  };
  $$('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
  $('[data-search-close]').addEventListener('click', () => dlg.close());
  lightDismiss(dlg);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    // A search input swallows the first Escape to clear itself; close instead.
    if (e.key === 'Escape') { e.preventDefault(); dlg.close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    if (e.key === 'Enter') { const a = $$('[role="option"]', list)[active]; if (a) { e.preventDefault(); a.click(); } }
  });
  // Close the dialog when a result points at the page we're already on.
  list.addEventListener('click', (e) => { if (e.target.closest('a')) dlg.close(); });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault(); openSearch();
    }
  });

  // Open / closed status, in UK time. ------------------------------------------
  const hours = window.MERLIN_HOURS;
  if (hours) {
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const nowUK = () => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date()).map((p) => [p.type, p.value]));
      return { day: DAYS.indexOf(parts.weekday), mins: Number(parts.hour) * 60 + Number(parts.minute) };
    };
    const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const describe = (h) => {
      const { day, mins } = nowUK();
      const open = h.days.includes(day) && mins >= toMins(h.open) && mins < toMins(h.close);
      if (open) {
        const left = toMins(h.close) - mins;
        return { open, text: left <= 60 ? `Open now · closes in ${left} min` : `Open now · until ${h.close}` };
      }
      for (let i = 0; i < 8; i++) {
        const d = (day + i) % 7;
        if (h.days.includes(d) && (i > 0 || mins < toMins(h.open))) {
          const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : DAYS[d];
          return { open, text: `Closed · opens ${when} ${h.open}` };
        }
      }
      return { open, text: 'Closed' };
    };
    const paint = () => {
      const s = describe(hours.counter);
      $$('[data-open-status]').forEach((el) => {
        el.classList.toggle('is-open', s.open);
        el.classList.toggle('is-closed', !s.open);
        $('.status-text', el).textContent = `Trade counter: ${s.text}`;
      });
      const today = nowUK().day;
      $$('[data-hours-table] tr[data-day]').forEach((tr) => tr.classList.toggle('is-today', Number(tr.dataset.day) === today));
    };
    paint();
    setInterval(paint, 60_000);
  }

  // Unit converter --------------------------------------------------------------
  const conv = $('[data-converter]');
  if (conv) {
    const MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, yd: 914.4 };
    const value = $('[data-conv-value]', conv);
    const from = $('[data-conv-from]', conv);
    const to = $('[data-conv-to]', conv);
    const out = $('[data-conv-out]', conv);
    const fmt = (n) => Number(n.toPrecision(6)).toLocaleString('en-GB', { maximumFractionDigits: 4 });
    const update = () => {
      const v = parseFloat(value.value);
      out.textContent = Number.isFinite(v) ? `${fmt(v)} ${from.value} = ${fmt((v * MM[from.value]) / MM[to.value])} ${to.value}` : 'Enter a number';
    };
    conv.addEventListener('input', update);
    $('[data-conv-swap]', conv).addEventListener('click', () => { [from.value, to.value] = [to.value, from.value]; update(); });
    update();
  }

  // Enquiry form: composes an email in the visitor's mail app. --------------------
  const form = $('[data-enquiry-form]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const lines = [f.message, '', '—', `Name: ${f.name}`];
      if (f.company) lines.push(`Company: ${f.company}`);
      if (f.phone) lines.push(`Phone: ${f.phone}`);
      const subject = `${f.topic} – ${f.name}${f.company ? ` (${f.company})` : ''}`;
      location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    });
    // Preselect the topic from ?topic= links.
    const t = new URLSearchParams(location.search).get('topic');
    if (t) { const opt = [...form.topic.options].find((o) => o.text === t); if (opt) opt.selected = true; }
  }

  // Back to top without leaving a #top in the URL.
  $$('.to-top').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0 }); $('#main').focus({ preventScroll: true }); }));
})();

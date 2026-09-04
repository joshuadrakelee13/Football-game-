// The match overlay: an animated commentary feed with a live scoreline, or the
// finished result instantly. Both read the same event stream from the engine.

import { h, mount, clear, clubChip, visibleColours } from './dom.js';
import { money, num } from '../core/format.js';
import { buildCommentary, minuteLabel } from '../engine/commentary.js';
import { attendanceFor } from '../engine/finance.js';
import { game } from '../main.js';

const LINE_DELAY = 260;      // between ordinary lines
const MAJOR_DELAY = 620;     // a goal deserves a beat

export function showMatch(digest, world, { instant = false } = {}) {
  return new Promise((resolve) => {
    const result = digest.playerMatch;
    const homeClub = world.clubs[result.homeClubId] || world.europeClubs?.[result.homeClubId];
    const awayClub = world.clubs[result.awayClubId] || world.europeClubs?.[result.awayClubId];
    const lines = buildCommentary(result, game.rng, homeClub, awayClub);

    const host = document.getElementById('overlays');
    let cancelled = false;
    let timer = null;

    const homeGoalsEl = h('span', { class: 'goals' }, '0');
    const awayGoalsEl = h('span', { class: 'goals' }, '0');
    const clockEl = h('span', null, "0'");
    const feed = h('div', { class: 'commentary' });
    const statsHost = h('div', { class: 'match-stats' });

    const finish = () => {
      if (timer) clearTimeout(timer);
      cancelled = true;
      renderStats(statsHost, result, homeClub, awayClub, world);
      homeGoalsEl.textContent = result.homeGoals;
      awayGoalsEl.textContent = result.awayGoals;
      clockEl.textContent = 'Full time';
      clockEl.parentElement?.querySelector('.live-dot')?.remove();
      mount(footHost,
        h('button', { class: 'btn primary lg', onclick: close }, 'Continue'),
      );
      // Make sure every line is present when skipping.
      if (feed.childElementCount < lines.length) {
        clear(feed);
        for (const line of lines) feed.appendChild(commentaryLine(line));
        feed.scrollTop = feed.scrollHeight;
      }
    };

    const close = () => {
      if (timer) clearTimeout(timer);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve();
    };

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); cancelled ? close() : finish(); }
    };

    const footHost = h('div', { class: 'match-foot' },
      h('button', { class: 'btn ghost', onclick: () => finish() }, 'Skip to result'),
    );

    const overlay = h('div', { class: 'match-overlay' },
      h('div', { class: 'match-scoreboard' },
        h('div', { class: 'team home' },
          h('i', { class: 'bar', style: { background: visibleColours(homeClub?.colors).primary } }),
          h('span', { class: 'club-name' }, homeClub?.short || '—'),
        ),
        h('div', { class: 'scoreline' }, homeGoalsEl, h('span', { class: 'dash' }, '–'), awayGoalsEl),
        h('div', { class: 'team away' },
          h('i', { class: 'bar', style: { background: visibleColours(awayClub?.colors).primary } }),
          h('span', { class: 'club-name' }, awayClub?.short || '—'),
        ),
        h('div', { class: 'match-clock' },
          !instant ? h('i', { class: 'live-dot' }) : null,
          clockEl,
        ),
      ),
      h('div', { class: 'match-body' }, feed, statsHost),
      footHost,
    );

    mount(host, overlay);
    document.addEventListener('keydown', onKey);

    if (instant) { finish(); return; }

    // Play the feed back one line at a time.
    let i = 0;
    const step = () => {
      if (cancelled) return;
      if (i >= lines.length) { finish(); return; }
      const line = lines[i++];

      feed.appendChild(commentaryLine(line));
      feed.scrollTop = feed.scrollHeight;
      clockEl.textContent = minuteLabel(line.minute) || "0'";

      if (line.type === 'goal') {
        const el = line.isHome ? homeGoalsEl : awayGoalsEl;
        el.textContent = line.isHome ? line.homeGoals : line.awayGoals;
        el.classList.remove('pulse');
        void el.offsetWidth; // restart the animation
        el.classList.add('pulse');
      }

      timer = setTimeout(step, line.major ? MAJOR_DELAY : LINE_DELAY);
    };
    timer = setTimeout(step, 320);
  });
}

function commentaryLine(line) {
  return h('div', { class: `commentary-line ${line.type}${line.major ? ' major' : ''}` },
    h('span', { class: 'minute' }, minuteLabel(line.minute)),
    h('span', { class: 'text' }, line.text),
  );
}

function renderStats(host, result, homeClub, awayClub, world) {
  const s = result.stats;
  const gate = homeClub?.squad && !result.neutralVenue ? attendanceFor(homeClub, awayClub, world) : null;

  mount(host,
    h('div', { class: 'eyebrow', style: { marginBottom: '16px' } }, 'Match statistics'),
    statBar('Possession', s.possession[0], s.possession[1], '%'),
    statBar('Shots', s.shots[0], s.shots[1]),
    statBar('On target', s.onTarget[0], s.onTarget[1]),
    statBar('Corners', s.corners[0], s.corners[1]),
    statBar('Fouls', s.fouls[0], s.fouls[1]),
    (s.yellows[0] + s.yellows[1] + s.reds[0] + s.reds[1]) > 0
      ? statBar('Cards', s.yellows[0] + s.reds[0], s.yellows[1] + s.reds[1]) : null,

    result.penalties
      ? h('p', { style: { marginTop: '20px', color: 'var(--gold)', fontSize: '13px' } },
          `Won on penalties ${result.penalties.home}–${result.penalties.away}.`)
      : null,
    result.wentToExtraTime
      ? h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px' } }, 'After extra time.')
      : null,

    gate ? h('p', { style: { marginTop: '20px', color: 'var(--text-3)', fontSize: '12px' } },
      `Attendance ${num(gate.attendance)}${gate.soldOut ? ' — a sell-out' : ''} at ${homeClub.stadium}.`) : null,

    scorerList('Scorers', result.home.scorers, homeClub),
    scorerList('Scorers', result.away.scorers, awayClub),
  );
}

function statBar(label, home, away, suffix = '') {
  const total = Math.max(1, home + away);
  return h('div', { class: 'stat-bar' },
    h('div', { class: 'row' },
      h('span', null, home + suffix),
      h('span', { class: 'label' }, label),
      h('span', null, away + suffix),
    ),
    h('div', { class: 'track' },
      h('i', { class: 'home', style: { width: (home / total * 100) + '%' } }),
      h('i', { class: 'away', style: { width: (away / total * 100) + '%' } }),
    ),
  );
}

function scorerList(label, scorers, club) {
  if (!scorers?.length || !club) return null;
  const byId = new Map((club.squad || []).map((p) => [p.id, p]));
  return h('div', { style: { marginTop: '14px' } },
    h('div', { class: 'eyebrow', style: { marginBottom: '5px' } }, club.short),
    ...scorers.map((s) => h('div', { style: { fontSize: '12.5px', color: 'var(--text-2)' } },
      `${byId.get(s.playerId)?.name || 'Unknown'} ${s.minute}'`,
      s.kind === 'penalty' ? h('span', { style: { color: 'var(--text-faint)' } }, ' (pen)') : null,
    )),
  );
}

// The match overlay: an animated commentary feed with a live scoreline, or the
// finished result instantly. Both read the same event stream from the engine.

import { h, mount, clear, clubChip, visibleColours } from './dom.js';
import { money, num } from '../core/format.js';
import { buildCommentary, buildCommentaryDelta, createCommentaryState, minuteLabel } from '../engine/commentary.js';
import { advanceSession, finishSession, syncSideTactics, setLiveRoleDuty, makeSub } from '../engine/match.js';
import { attendanceFor } from '../engine/finance.js';
import { ROLE_OPTIONS, ROLE_LABELS, DUTY_OPTIONS } from '../data/positions.js';
import { DIAL_KEYS, DIAL_LABELS, dialLevelLabel } from '../data/tactics.js';
import { game } from '../main.js';

const LINE_DELAY = 260;      // between ordinary lines
const MAJOR_DELAY = 620;     // a goal deserves a beat
const LIVE_CHECKPOINTS = [15, 30, 45, 60, 75, 90]; // matches considerSubs's own cadence

export function showMatch(digest, world, { instant = false } = {}) {
  return new Promise((resolve) => {
    const result = digest.playerMatch;
    const homeClub = world.clubs[result.homeClubId] || world.europeClubs?.[result.homeClubId];
    const awayClub = world.clubs[result.awayClubId] || world.europeClubs?.[result.awayClubId];
    const lines = buildCommentary(result, game.rng, homeClub, awayClub);
    const yourClubId = world.playerClubId;

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
        for (const line of lines) feed.appendChild(commentaryLine(line, yourClubId));
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

      feed.appendChild(commentaryLine(line, yourClubId));
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

// A live, pausable league fixture. Unlike showMatch (which always receives an
// already-fully-simulated result and just animates the pre-baked event stream),
// this drives the engine itself in 15-minute checkpoints via advanceSession,
// stopping mandatorily at half time and on request at any other checkpoint to let
// the player adjust their own tactics — and those adjustments feed straight back
// into the session via syncSideTactics before play resumes, so the second half is
// actually simulated differently, not just narrated differently.
//
// Resolves with the final result object, the same shape showMatch's caller
// receives — season.js's resolvePlayerMatchSession applies it identically either way.
export function showLiveMatch(pendingSession, world) {
  return new Promise((resolve) => {
    const { session } = pendingSession;
    const homeClub = session.homeClub;
    const awayClub = session.awayClub;
    const playerSide = homeClub.isPlayerClub ? session.home : session.away;
    const yourClubId = world.playerClubId;
    const commentaryState = createCommentaryState(session.rng);
    const resultContext = { neutralVenue: session.options.neutralVenue };

    const host = document.getElementById('overlays');
    let cancelled = false;   // skip-to-result: stop animating, jump straight to the end
    let timer = null;
    let pauseRequested = false;
    let checkpointIndex = 0;
    let finalResult = null;
    let paused = false;      // the pause/half-time panel is open — Escape/Space should not skip past it

    const homeGoalsEl = h('span', { class: 'goals' }, '0');
    const awayGoalsEl = h('span', { class: 'goals' }, '0');
    const clockEl = h('span', null, "0'");
    const feed = h('div', { class: 'commentary' });
    const statsHost = h('div', { class: 'match-stats' });
    const pauseHost = h('div', null);

    const appendLine = (line) => {
      feed.appendChild(commentaryLine(line, yourClubId));
      feed.scrollTop = feed.scrollHeight;
      clockEl.textContent = minuteLabel(line.minute) || clockEl.textContent;
      if (line.type === 'goal') {
        const el = line.isHome ? homeGoalsEl : awayGoalsEl;
        el.textContent = line.isHome ? line.homeGoals : line.awayGoals;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    };

    const showFinalStats = (result) => {
      finalResult = result;
      renderStats(statsHost, result, homeClub, awayClub, world);
      homeGoalsEl.textContent = result.homeGoals;
      awayGoalsEl.textContent = result.awayGoals;
      clockEl.textContent = 'Full time';
      clockEl.parentElement?.querySelector('.live-dot')?.remove();
      mount(pauseHost);
      mount(footHost, h('button', { class: 'btn primary lg', onclick: close }, 'Continue'));
    };

    const close = () => {
      if (timer) clearTimeout(timer);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(finalResult);
    };

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        if (finalResult) close();
        else if (paused) return; // the pause panel has its own explicit Resume button
        else if (!cancelled) skipToResult();
      }
    };

    // Plays a batch of lines one at a time, then calls onDone — same pacing as
    // showMatch's own animation.
    const playLines = (lines, onDone) => {
      let i = 0;
      const step = () => {
        if (cancelled) { onDone(); return; }
        if (i >= lines.length) { onDone(); return; }
        const line = lines[i++];
        appendLine(line);
        timer = setTimeout(step, line.major ? MAJOR_DELAY : LINE_DELAY);
      };
      timer = setTimeout(step, 200);
    };

    const skipToResult = () => {
      if (timer) clearTimeout(timer);
      cancelled = true;
      mount(pauseHost);
      const before = session.events.length;
      const result = finishSession(session);
      const remaining = session.events.slice(before);
      const lines = buildCommentaryDelta(remaining, session.rng, homeClub, awayClub, resultContext, commentaryState);
      for (const line of lines) appendLine(line);
      showFinalStats(result);
    };

    const runCheckpoint = () => {
      if (cancelled) return;
      if (checkpointIndex >= LIVE_CHECKPOINTS.length) {
        const before = session.events.length;
        const result = finishSession(session);
        const remaining = session.events.slice(before);
        const lines = buildCommentaryDelta(remaining, session.rng, homeClub, awayClub, resultContext, commentaryState);
        playLines(lines, () => showFinalStats(result));
        return;
      }
      const target = LIVE_CHECKPOINTS[checkpointIndex++];
      const before = session.events.length;
      advanceSession(session, target);
      const newEvents = session.events.slice(before);
      const lines = buildCommentaryDelta(newEvents, session.rng, homeClub, awayClub, resultContext, commentaryState);
      playLines(lines, () => {
        if (cancelled) return;
        const shouldPause = target === 45 || pauseRequested;
        pauseRequested = false;
        resetPauseButton();
        if (shouldPause) openPause(target === 45, target);
        else runCheckpoint();
      });
    };

    const openPause = (mandatory, minute) => {
      paused = true;
      const renderPanel = () => {
        mount(pauseHost, livePausePanel({
          mandatory, minute, session, playerSide, homeClub, awayClub,
          onChange: renderPanel,
          onResume: () => { paused = false; mount(pauseHost); runCheckpoint(); },
        }));
      };
      renderPanel();
    };

    // A single request queued for the *next* checkpoint, not a toggle — once it's
    // consumed (above, whether or not it actually opened a pause) the button needs
    // to go back to its normal state so a later checkpoint can be paused too.
    const resetPauseButton = () => {
      pauseBtn.textContent = 'Pause at next break';
      pauseBtn.disabled = false;
    };
    const pauseBtn = h('button', {
      class: 'btn ghost',
      onclick: () => { pauseRequested = true; pauseBtn.textContent = 'Pausing at next break…'; pauseBtn.disabled = true; },
    }, 'Pause at next break');

    const footHost = h('div', { class: 'match-foot' },
      pauseBtn,
      h('button', { class: 'btn ghost', onclick: skipToResult }, 'Skip to result'),
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
        h('div', { class: 'match-clock' }, h('i', { class: 'live-dot' }), clockEl),
      ),
      h('div', { class: 'match-body' }, feed, statsHost),
      footHost,
      pauseHost,
    );

    mount(host, overlay);
    document.addEventListener('keydown', onKey);
    runCheckpoint();
  });
}

// ---------------------------------------------------------------------------
// Live pause / half-time panel
// ---------------------------------------------------------------------------

function livePausePanel({ mandatory, minute, session, playerSide, homeClub, awayClub, onChange, onResume }) {
  const club = playerSide.club;

  const setDial = (key, value) => {
    club.tactics[key] = value;
    syncSideTactics(playerSide);
    onChange();
  };

  const setRoleDuty = (playerId, patch) => {
    setLiveRoleDuty(playerSide, playerId, patch);
    syncSideTactics(playerSide);
    onChange();
  };

  const subOff = (entry) => {
    makeSub(session.minute, playerSide, session.rng, session.push, entry, false);
    onChange();
  };

  return h('div', { class: 'modal-backdrop live-pause' },
    h('div', { class: 'modal wide' },
      h('div', { class: 'modal-head' },
        h('h2', null, mandatory ? 'Half Time' : `Paused — ${minute}'`),
        h('span', { class: 'mono', style: { color: 'var(--text-3)', fontSize: '13px' } },
          `${homeClub.short} ${session.home.goals}–${session.away.goals} ${awayClub.short}`),
      ),
      h('div', { class: 'modal-body', style: { display: 'grid', gap: 'var(--space-5)' } },
        h('p', { style: { margin: 0, color: 'var(--text-3)', fontSize: '12.5px' } },
          `Adjusting ${club.short}'s tactics here changes the rest of this match, not just how it's described — the same numbers a full match uses.`),
        livePauseDials(club, setDial),
        livePauseXI(playerSide, session, setRoleDuty, subOff),
      ),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn primary lg', onclick: onResume }, mandatory ? 'Start second half' : 'Resume'),
      ),
    ),
  );
}

function livePauseDials(club, setDial) {
  return h('div', null,
    h('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, 'Tactics'),
    h('div', { style: { display: 'grid', gap: 'var(--space-3)' } },
      ...DIAL_KEYS.map((key) => {
        const value = club.tactics[key];
        const label = DIAL_LABELS[key];
        return h('div', null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } },
            h('span', { style: { fontSize: '12.5px', color: 'var(--text-2)' } }, label.name),
            h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--text-3)' } }, dialLevelLabel(key, value)),
          ),
          h('div', { class: 'formation-picker' }, ...[-2, -1, 0, 1, 2].map((v) =>
            h('button', {
              class: 'formation-option' + (value === v ? ' active' : ''),
              style: { minWidth: '34px', textAlign: 'center' },
              onclick: () => setDial(key, v),
            }, v > 0 ? '+' + v : String(v)),
          )),
        );
      }),
    ),
  );
}

function livePauseXI(side, session, setRoleDuty, subOff) {
  const bench = side.bench.filter((p) => p.position !== 'GK');
  const subsLeft = Math.max(0, 5 - side.subsUsed);

  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' } },
      h('div', { class: 'eyebrow' }, 'Current XI'),
      h('span', { style: { fontSize: '11.5px', color: 'var(--text-3)' } }, `${subsLeft} substitution${subsLeft === 1 ? '' : 's'} left`),
    ),
    h('div', { style: { display: 'grid', gap: '10px' } },
      ...side.onPitch.map((entry) => livePauseXIRow(entry, side, setRoleDuty, subOff, subsLeft > 0 && bench.length > 0)),
    ),
  );
}

function livePauseXIRow(entry, side, setRoleDuty, subOff, canSub) {
  const player = entry.player;
  const roles = ROLE_OPTIONS[entry.slot] || [];

  return h('div', { style: { border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '10px 12px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
      h('div', null,
        h('span', { style: { fontWeight: 500, fontSize: '13px' } }, player.name),
        h('span', { style: { color: 'var(--text-3)', fontSize: '11.5px', marginLeft: '8px' } }, entry.slot),
      ),
      canSub ? h('button', { class: 'btn ghost sm', onclick: () => subOff(entry) }, 'Sub off') : null,
    ),
    h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' } },
      h('div', null,
        h('div', { style: { fontSize: '10.5px', color: 'var(--text-faint)', marginBottom: '4px' } }, 'ROLE'),
        h('div', { class: 'formation-picker' },
          h('button', {
            class: 'formation-option' + (!entry.role ? ' active' : ''),
            onclick: () => setRoleDuty(player.id, { role: null }),
          }, 'Natural'),
          ...roles.map((role) => h('button', {
            class: 'formation-option' + (entry.role === role ? ' active' : ''),
            onclick: () => setRoleDuty(player.id, { role }),
          }, ROLE_LABELS[role])),
        ),
      ),
      entry.slot !== 'GK' ? h('div', null,
        h('div', { style: { fontSize: '10.5px', color: 'var(--text-faint)', marginBottom: '4px' } }, 'DUTY'),
        h('div', { class: 'formation-picker' },
          ...DUTY_OPTIONS.map((duty) => h('button', {
            class: 'formation-option' + (entry.duty === duty ? ' active' : ''),
            onclick: () => setRoleDuty(player.id, { duty }),
          }, duty[0].toUpperCase() + duty.slice(1))),
        ),
      ) : null,
    ),
  );
}

function commentaryLine(line, yourClubId) {
  // A goal for you and a goal against you must not look the same at a glance.
  const side = line.clubId == null ? '' : line.clubId === yourClubId ? ' ours' : ' theirs';
  return h('div', { class: `commentary-line ${line.type}${line.major ? ' major' : ''}${side}` },
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

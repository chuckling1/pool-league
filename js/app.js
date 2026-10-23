import { createStore, isConfigured } from './store.js';
import { defaultLeague } from './config.js';
import { GAME_TYPES, gameType, computeStandings, headToHead } from './stats.js';
import { renderMarkdown } from './markdown.js';

const LEAGUE_KEY = 'pool-league-code';
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RULES = [
  { id: 'house', label: 'House rules', file: 'rules/house-rules.md' },
  { id: '8-ball', label: '8-Ball', file: 'rules/8-ball.md' },
  { id: '9-ball', label: '9-Ball', file: 'rules/9-ball.md' },
  { id: 'cutthroat', label: 'Cutthroat', file: 'rules/cutthroat.md' },
];

const $ = (sel) => document.querySelector(sel);
const main = $('#main');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  league: null,
  loaded: false,
  players: [],
  games: [],
  filter: 'all',
  log: { type: '8-ball', selected: [], winner: null, saving: false },
  rulesTab: 'house',
  rulesCache: {},
  h2h: ['', ''],
};
let store = null;

// ---------- league code ----------

const normalizeLeague = (s) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const isValidLeague = (s) => /^[a-z0-9-]{4,40}$/.test(s);

function readLeague() {
  const fromUrl = new URLSearchParams(location.search).get('league');
  let code = fromUrl ? normalizeLeague(fromUrl) : null;
  if (!code) {
    try { code = localStorage.getItem(LEAGUE_KEY); } catch { /* ignore */ }
  }
  if (!code && defaultLeague) code = normalizeLeague(defaultLeague);
  return code && isValidLeague(code) ? code : null;
}

function joinLeague(code) {
  try { localStorage.setItem(LEAGUE_KEY, code); } catch { /* ignore */ }
  const url = new URL(location.href);
  url.searchParams.set('league', code);
  history.replaceState(null, '', url);
  start(code);
}

function shareUrl() {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('league', state.league);
  return url.toString();
}

// ---------- helpers ----------

const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? 'Unknown';
const sortedPlayers = () => [...state.players].sort((a, b) => a.name.localeCompare(b.name));
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtPct = (p) => (p === 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));
const fmtStreak = (s) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '');

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

const currentTab = () => {
  const t = location.hash.slice(1);
  return ['standings', 'log', 'rules'].includes(t) ? t : 'standings';
};

// ---------- views ----------

function renderJoin() {
  $('#tabs').hidden = true;
  $('#share-btn').hidden = true;
  $('#league-name').textContent = '';
  main.innerHTML = `
    <section class="card join">
      <h2>Join your league</h2>
      <p class="muted">Enter the league code your group uses. Pick a new code to start your own league.</p>
      <form id="join-form" class="row">
        <input id="join-code" placeholder="e.g. office-pool" autocomplete="off" autocapitalize="off" required>
        <button type="submit">Join</button>
      </form>
      <p class="muted small">Letters, numbers and dashes, 4 to 40 characters. Anyone with the code can log games, so share it only with your group.</p>
    </section>`;
}

function renderStandings() {
  const rows = computeStandings(state.players, state.games, state.filter);
  const filters = [{ id: 'all', label: 'All' }, ...GAME_TYPES]
    .map((f) => `<button class="chip ${state.filter === f.id ? 'on' : ''}" data-action="filter" data-id="${f.id}">${f.label}</button>`)
    .join('');

  const table = rows.length
    ? `<table class="standings">
        <thead><tr><th>#</th><th class="left">Player</th><th>W</th><th>L</th><th>Pct</th><th>Streak</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td class="left name">${esc(r.name)}</td>
            <td>${r.wins}</td><td>${r.losses}</td>
            <td>${fmtPct(r.pct)}</td>
            <td class="${r.streak > 0 ? 'hot' : 'cold'}">${fmtStreak(r.streak)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : `<p class="empty">No games yet. <a href="#log">Log the first one</a>.</p>`;

  const options = (sel) => `<option value="">Pick a player</option>` + sortedPlayers()
    .map((p) => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const [a, b] = state.h2h;
  let h2hResult = '';
  if (a && b && a !== b) {
    const h = headToHead(state.games, a, b);
    const types = Object.entries(h.byType)
      .map(([t, v]) => `<span>${gameType(t)?.label ?? t}: ${v.a}–${v.b}</span>`).join('');
    h2hResult = h.a + h.b
      ? `<div class="h2h-score"><strong>${esc(nameOf(a))}</strong> ${h.a} – ${h.b} <strong>${esc(nameOf(b))}</strong></div>
         <div class="h2h-types muted small">${types}</div>`
      : `<p class="muted">These two haven't played each other yet.</p>`;
  }

  const recent = [...state.games].sort((x, y) => y.playedAt - x.playedAt).slice(0, 15);
  const recentList = recent.length
    ? `<ul class="recent">${recent.map((g) => {
        const losers = g.players.filter((p) => p !== g.winner).map((p) => esc(nameOf(p))).join(', ');
        const canDelete = Date.now() - g.playedAt < DELETE_WINDOW_MS;
        return `<li>
          <div>
            <span class="tag">${gameType(g.type)?.label ?? esc(g.type)}</span>
            <strong>${esc(nameOf(g.winner))}</strong> beat ${losers}
          </div>
          <div class="meta">
            <span class="muted small">${fmtDate(g.playedAt)}</span>
            ${canDelete ? `<button class="link danger" data-action="delete-game" data-id="${esc(g.id)}">Undo</button>` : ''}
          </div>
        </li>`;
      }).join('')}</ul>`
    : `<p class="muted">Nothing logged yet.</p>`;

  main.innerHTML = `
    <section class="card">
      <div class="chips">${filters}</div>
      ${table}
    </section>
    <section class="card">
      <h2>Head to head</h2>
      <div class="row">
        <select data-action="h2h" data-slot="0">${options(a)}</select>
        <span class="vs">vs</span>
        <select data-action="h2h" data-slot="1">${options(b)}</select>
      </div>
      ${h2hResult}
    </section>
    <section class="card">
      <h2>Recent games</h2>
      ${recentList}
      <p class="muted small">Mistake? A game can be undone for 24 hours after it's logged.</p>
    </section>`;
}

function renderLog() {
  const { type, selected, winner, saving } = state.log;
  const t = gameType(type);
  const types = GAME_TYPES
    .map((g) => `<button class="chip ${type === g.id ? 'on' : ''}" data-action="log-type" data-id="${g.id}">${g.label}</button>`)
    .join('');
  const players = sortedPlayers()
    .map((p) => `<button class="chip player ${selected.includes(p.id) ? 'on' : ''}" data-action="log-player" data-id="${esc(p.id)}">${esc(p.name)}</button>`)
    .join('');
  const winners = selected
    .map((id) => `<button class="chip winner ${winner === id ? 'on' : ''}" data-action="log-winner" data-id="${esc(id)}">🏆 ${esc(nameOf(id))}</button>`)
    .join('');
  const need = t.min === t.max ? `${t.min} players` : `${t.min} to ${t.max} players`;
  const ready = selected.length >= t.min && selected.length <= t.max && winner && !saving;

  main.innerHTML = `
    <section class="card">
      <h2>1. Game</h2>
      <div class="chips">${types}</div>
    </section>
    <section class="card">
      <h2>2. Who played? <span class="muted small">(${need})</span></h2>
      <div class="chips">${players || '<span class="muted">Add your first player below.</span>'}</div>
      <form id="add-player" class="row">
        <input id="new-player" placeholder="New player name" maxlength="30" autocomplete="off">
        <button type="submit" class="ghost">Add</button>
      </form>
    </section>
    <section class="card">
      <h2>3. Who won?</h2>
      <div class="chips">${winners || '<span class="muted">Pick the players first.</span>'}</div>
    </section>
    <button class="big" data-action="save-game" ${ready ? '' : 'disabled'}>${saving ? 'Saving…' : 'Save game'}</button>`;
}

async function renderRules() {
  const tabs = RULES
    .map((r) => `<button class="chip ${state.rulesTab === r.id ? 'on' : ''}" data-action="rules-tab" data-id="${r.id}">${r.label}</button>`)
    .join('');
  main.innerHTML = `
    <section class="card">
      <div class="chips">${tabs}</div>
      <article id="rules-body" class="rules"><p class="muted">Loading…</p></article>
    </section>`;

  const rule = RULES.find((r) => r.id === state.rulesTab);
  try {
    if (!state.rulesCache[rule.id]) {
      const res = await fetch(rule.file);
      if (!res.ok) throw new Error(res.status);
      state.rulesCache[rule.id] = renderMarkdown(await res.text());
    }
    const body = $('#rules-body');
    if (body && currentTab() === 'rules' && state.rulesTab === rule.id) body.innerHTML = state.rulesCache[rule.id];
  } catch {
    const body = $('#rules-body');
    if (body) body.innerHTML = `<p class="muted">Couldn't load ${esc(rule.file)}.</p>`;
  }
}

function render() {
  if (!state.league) return renderJoin();
  const tab = currentTab();
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (tab === 'rules') return renderRules();
  if (!state.loaded) {
    main.innerHTML = `<p class="empty muted">Loading league…</p>`;
    return;
  }
  if (tab === 'log') return renderLog();
  renderStandings();
}

// ---------- actions ----------

async function saveGame() {
  const { type, selected, winner } = state.log;
  state.log.saving = true;
  render();
  try {
    await store.addGame({ type, players: [...selected], winner });
    state.log = { type, selected: [], winner: null, saving: false };
    toast(`Saved: ${nameOf(winner)} wins`);
    location.hash = '#standings';
  } catch (err) {
    console.error(err);
    state.log.saving = false;
    toast("Couldn't save the game. Try again.");
    render();
  }
}

main.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  const { action, id } = btn.dataset;
  const log = state.log;

  if (action === 'filter') state.filter = id;
  if (action === 'rules-tab') state.rulesTab = id;
  if (action === 'log-type') {
    log.type = id;
    const t = gameType(id);
    if (log.selected.length > t.max) log.selected = log.selected.slice(-t.max);
    if (!log.selected.includes(log.winner)) log.winner = null;
  }
  if (action === 'log-player') {
    const t = gameType(log.type);
    if (log.selected.includes(id)) {
      log.selected = log.selected.filter((p) => p !== id);
      if (log.winner === id) log.winner = null;
    } else if (log.selected.length >= t.max) {
      // 1-on-1 games: swap out the earliest pick so tapping just works.
      if (t.max === 2) log.selected = [log.selected[1], id];
      else return toast(`${t.label} is up to ${t.max} players`);
      if (!log.selected.includes(log.winner)) log.winner = null;
    } else {
      log.selected.push(id);
    }
  }
  if (action === 'log-winner') log.winner = id;
  if (action === 'save-game') return saveGame();
  if (action === 'delete-game') {
    const g = state.games.find((x) => x.id === id);
    if (!g || !confirm(`Undo ${nameOf(g.winner)}'s ${gameType(g.type)?.label ?? ''} win?`)) return;
    try {
      await store.deleteGame(id);
      toast('Game removed');
    } catch (err) {
      console.error(err);
      toast("Couldn't remove it. Games can only be undone within 24 hours.");
    }
    return;
  }
  render();
});

main.addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-action="h2h"]');
  if (!sel) return;
  state.h2h[Number(sel.dataset.slot)] = sel.value;
  render();
});

main.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'join-form') {
    const code = normalizeLeague($('#join-code').value);
    if (!isValidLeague(code)) return toast('Use 4 to 40 letters, numbers or dashes');
    return joinLeague(code);
  }
  if (e.target.id === 'add-player') {
    const name = $('#new-player').value.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!name) return;
    const existing = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    try {
      const id = existing ? existing.id : await store.addPlayer(name);
      const t = gameType(state.log.type);
      if (!state.log.selected.includes(id) && state.log.selected.length < t.max) state.log.selected.push(id);
      if (existing) toast(`${existing.name} is already in the league`);
      render();
      $('#new-player')?.focus();
    } catch (err) {
      console.error(err);
      toast("Couldn't add that player.");
    }
  }
});

$('#share-btn').addEventListener('click', async () => {
  const url = shareUrl();
  try {
    if (navigator.share) await navigator.share({ title: 'Pool League', url });
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch { /* user cancelled */ }
});

window.addEventListener('hashchange', render);

// ---------- start ----------

async function start(code) {
  state.league = code;
  state.loaded = false;
  $('#league-name').textContent = `League: ${code}`;
  $('#tabs').hidden = false;
  $('#share-btn').hidden = false;
  $('#demo-banner').hidden = isConfigured;
  render();
  try {
    store = await createStore(code, ({ players, games }) => {
      state.players = players;
      state.games = games;
      state.loaded = true;
      // Re-rendering the log form mid-typing would wipe the input, so skip it there.
      if (currentTab() !== 'log' || !document.activeElement?.matches('input')) render();
    }, (err) => {
      console.error(err);
      toast("Couldn't reach the database.");
    });
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="empty">Couldn't connect to the database. Check js/config.js.</p>`;
  }
}

const initial = readLeague();
if (initial) start(initial); else render();

export const GAME_TYPES = [
  { id: '8-ball', label: '8-Ball', min: 2, max: 2 },
  { id: '9-ball', label: '9-Ball', min: 2, max: 2 },
  { id: 'cutthroat', label: 'Cutthroat', min: 3, max: 5 },
];

export const gameType = (id) => GAME_TYPES.find((t) => t.id === id);

// One win for the winner and one loss for everyone else in the game,
// so a cutthroat game with 3 players counts as 1 W and 2 Ls.
export function computeStandings(players, games, type = 'all') {
  const rows = new Map(players.map((p) => [p.id, { id: p.id, name: p.name, wins: 0, losses: 0, streak: 0 }]));
  const relevant = games
    .filter((g) => type === 'all' || g.type === type)
    .sort((a, b) => a.playedAt - b.playedAt);

  for (const g of relevant) {
    for (const pid of g.players) {
      const r = rows.get(pid);
      if (!r) continue;
      const won = pid === g.winner;
      if (won) r.wins++; else r.losses++;
      r.streak = won ? Math.max(r.streak, 0) + 1 : Math.min(r.streak, 0) - 1;
    }
  }

  return [...rows.values()]
    .filter((r) => r.wins + r.losses > 0)
    .map((r) => ({ ...r, played: r.wins + r.losses, pct: r.wins / (r.wins + r.losses) }))
    .sort((a, b) => b.pct - a.pct || b.wins - a.wins || a.name.localeCompare(b.name));
}

// Counts only games both players were in and one of them won.
export function headToHead(games, a, b) {
  const result = { a: 0, b: 0, byType: {} };
  for (const g of games) {
    if (!g.players.includes(a) || !g.players.includes(b)) continue;
    const side = g.winner === a ? 'a' : g.winner === b ? 'b' : null;
    if (!side) continue;
    result[side]++;
    const t = (result.byType[g.type] ??= { a: 0, b: 0 });
    t[side]++;
  }
  return result;
}

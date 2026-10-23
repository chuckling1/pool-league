import { firebaseConfig } from './config.js';

const FIREBASE_VERSION = '10.12.2';

export const isConfigured =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE');

// Both stores expose the same interface:
//   addPlayer(name) -> id, addGame({type, players, winner}), deleteGame(id)
// and call onChange({players, games}) whenever data changes.
export function createStore(league, onChange, onError) {
  return isConfigured
    ? firebaseStore(league, onChange, onError)
    : demoStore(league, onChange);
}

async function firebaseStore(league, onChange, onError) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);

  const db = fs.getFirestore(initializeApp(firebaseConfig));
  const playersCol = fs.collection(db, 'leagues', league, 'players');
  const gamesCol = fs.collection(db, 'leagues', league, 'games');

  let players = [];
  let games = [];
  const emit = () => onChange({ players, games });

  fs.onSnapshot(playersCol, (snap) => {
    players = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));
    emit();
  }, onError);

  fs.onSnapshot(gamesCol, (snap) => {
    games = snap.docs.map((d) => {
      const x = d.data({ serverTimestamps: 'estimate' });
      return {
        id: d.id,
        type: x.type,
        players: x.players,
        winner: x.winner,
        playedAt: x.playedAt ? x.playedAt.toMillis() : Date.now(),
      };
    });
    emit();
  }, onError);

  return {
    async addPlayer(name) {
      const ref = await fs.addDoc(playersCol, { name, createdAt: fs.serverTimestamp() });
      return ref.id;
    },
    addGame({ type, players, winner }) {
      return fs.addDoc(gamesCol, { type, players, winner, playedAt: fs.serverTimestamp() });
    },
    deleteGame(id) {
      return fs.deleteDoc(fs.doc(gamesCol, id));
    },
  };
}

function demoStore(league, onChange) {
  const key = `pool-league-demo:${league}`;
  let data = { players: [], games: [] };
  try {
    data = JSON.parse(localStorage.getItem(key)) || data;
  } catch { /* storage unavailable: keep in memory */ }

  const newId = () => Math.random().toString(36).slice(2, 12);
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
    onChange({ players: [...data.players], games: [...data.games] });
  };
  setTimeout(save, 0);

  return {
    async addPlayer(name) {
      const id = newId();
      data.players.push({ id, name });
      save();
      return id;
    },
    async addGame({ type, players, winner }) {
      data.games.push({ id: newId(), type, players, winner, playedAt: Date.now() });
      save();
    },
    async deleteGame(id) {
      data.games = data.games.filter((g) => g.id !== id);
      save();
    },
  };
}

// 学習記録の保存（端末内の localStorage）
const KEY = 'chess-step-up/v1';

const empty = () => ({ puzzles: {}, lessons: {}, games: { win: 0, loss: 0, draw: 0, byLevel: {} }, settings: { level: 2, color: 'w' } });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 保存できない環境でもアプリは動く */ }
}

export const store = {
  get: () => state,

  puzzleResult(id, correctFirstTry) {
    const p = state.puzzles[id] || { attempts: 0, solved: false, clean: false };
    p.attempts += 1;
    p.solved = true;
    if (p.attempts === 1) p.clean = correctFirstTry;
    p.lastClean = correctFirstTry;
    p.at = Date.now();
    state.puzzles[id] = p;
    save();
  },

  lessonDone(id) {
    state.lessons[id] = { done: true, at: Date.now() };
    save();
  },

  gameResult(result, level) {
    state.games[result] += 1;
    const b = state.games.byLevel[level] || { win: 0, loss: 0, draw: 0 };
    b[result] += 1;
    state.games.byLevel[level] = b;
    save();
  },

  setSetting(k, v) { state.settings[k] = v; save(); },

  reset() { state = empty(); save(); },
};

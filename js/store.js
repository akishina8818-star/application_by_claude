// 学習記録の保存（端末内の localStorage）
const KEY = 'chess-step-up/v1';

const empty = () => ({ puzzles: {}, lessons: {}, openings: {}, games: { win: 0, loss: 0, draw: 0, byLevel: {} }, settings: { level: 2, color: 'w' } });

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

  // 定跡：学んだ（最後まで見た）/ 練習結果
  openingStudied(id) {
    const o = state.openings[id] || { studied: false, drills: 0, clean: 0, streak: 0 };
    o.studied = true;
    state.openings[id] = o;
    save();
  },
  openingDrill(id, mistakes) {
    const o = state.openings[id] || { studied: false, drills: 0, clean: 0, streak: 0 };
    o.drills += 1;
    if (mistakes === 0) { o.clean += 1; o.streak += 1; } else o.streak = 0;
    o.at = Date.now();
    state.openings[id] = o;
    save();
  },

  // 対局の途中保存（アプリを閉じても続きから指せる）
  saveGame(g) { state.savedGame = { ...g, at: Date.now() }; save(); },
  loadGame() { return state.savedGame || null; },
  clearGame() { if (state.savedGame) { delete state.savedGame; save(); } },

  setSetting(k, v) { state.settings[k] = v; save(); },

  reset() { state = empty(); save(); },
};

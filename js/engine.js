// 練習対局用の小さなチェスエンジン（アルファベータ探索 + 駒の位置評価）
// 初級〜中級の練習相手として、レベルに応じて強さを変える。
import { Chess } from '../vendor/chess.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// 白から見た駒の位置ボーナス（a8→h1 の順）
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

const MATE = 100000;

// ここから先は高速化のため chess.js の内部表現（0x88 盤）を直接使う。
// 内部の手: { from, to, piece, captured, promotion, flags }（from/to は 0x88 の番号）
const sqName = (sq) => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));

// 手番側から見た評価値
function evaluate(chess) {
  const board = chess._board;
  let score = 0;
  let nonPawn = 0;
  let wk = -1, bk = -1;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (!p) continue;
    if (p.type !== 'p' && p.type !== 'k') nonPawn += VAL[p.type];
    else if (p.type === 'k') { if (p.color === 'w') wk = sq; else bk = sq; }
  }
  const endgame = nonPawn <= 1600;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (!p) continue;
    const r = sq >> 4, f = sq & 7;
    const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
    const table = p.type === 'k' && endgame ? PST.kEnd : PST[p.type];
    const v = VAL[p.type] + table[idx];
    score += p.color === 'w' ? v : -v;
  }
  // 終盤：優勢側は相手キングを隅へ追い込み、自分のキングを近づける
  if (endgame && wk >= 0 && bk >= 0) {
    const dist = Math.abs((wk >> 4) - (bk >> 4)) + Math.abs((wk & 7) - (bk & 7));
    if (score > 200) score += (14 - dist) * 6;
    else if (score < -200) score -= (14 - dist) * 6;
  }
  return chess._turn === 'w' ? score : -score;
}

function orderMoves(moves) {
  for (const m of moves) {
    let s = 0;
    if (m.captured) s += 10 * VAL[m.captured] - VAL[m.piece];
    if (m.promotion) s += VAL[m.promotion];
    m._s = s;
  }
  return moves.sort((a, b) => b._s - a._s);
}

class Search {
  constructor(maxNodes) { this.nodes = 0; this.maxNodes = maxNodes; this.stopped = false; }

  quiesce(chess, alpha, beta, depth) {
    this.nodes++;
    const stand = evaluate(chess);
    if (stand >= beta) return beta;
    if (alpha < stand) alpha = stand;
    if (depth <= 0) return alpha;
    const caps = orderMoves(chess._moves({ legal: true }).filter((m) => m.captured || m.promotion));
    for (const m of caps) {
      chess._makeMove(m);
      const score = -this.quiesce(chess, -beta, -alpha, depth - 1);
      chess._undoMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(chess, depth, alpha, beta, ply) {
    if (this.nodes > this.maxNodes) { this.stopped = true; return 0; }
    this.nodes++;
    const moves = chess._moves({ legal: true });
    if (moves.length === 0) return chess._isKingAttacked(chess._turn) ? -MATE + ply : 0;
    if (chess._halfMoves >= 100) return 0;
    if (depth <= 0) return this.quiesce(chess, alpha, beta, 4);
    for (const m of orderMoves(moves)) {
      chess._makeMove(m);
      const score = -this.negamax(chess, depth - 1, -beta, -alpha, ply + 1);
      chess._undoMove();
      if (this.stopped) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // ルート：全手の評価を返す（前回の順位で並べると枝刈りが効く）
  root(chess, depth, prev) {
    let moves = orderMoves(chess._moves({ legal: true }));
    if (prev) {
      const rank = new Map(prev.map((r, i) => [r.uci, i]));
      moves.sort((a, b) => (rank.get(toUci(a)) ?? 999) - (rank.get(toUci(b)) ?? 999));
    }
    const results = [];
    for (const m of moves) {
      chess._makeMove(m);
      const score = -this.negamax(chess, depth - 1, -MATE - 1, MATE + 1, 1);
      chess._undoMove();
      if (this.stopped) break;
      results.push({ uci: toUci(m), score });
    }
    return results;
  }
}

// レベル設定：探索の深さと「ゆらぎ」（強いほど最善手を選ぶ）
export const LEVELS = [
  { id: 1, name: '入門', desc: 'ルールを覚えた人向け。ときどき駒をただで渡します', depth: 1, noise: 220, blunder: 0.25 },
  { id: 2, name: '初級', desc: '駒をただでは渡しません', depth: 2, noise: 60, blunder: 0.05 },
  { id: 3, name: '中級入口', desc: '簡単な戦術を見逃しません', depth: 3, noise: 15, blunder: 0 },
  { id: 4, name: '中級', desc: 'もう一段深く読みます。勝てたら中級の力', depth: 4, noise: 0, blunder: 0 },
];

export function chooseMove(fen, levelId = 2) {
  const level = LEVELS.find((l) => l.id === levelId) || LEVELS[1];
  const chess = new Chess(fen);
  if (chess._moves({ legal: true }).length === 0) return null;
  const results = deepen(chess, level.depth, 120000);
  const best = results[0];
  // メイトがあれば必ず指す
  if (best.score > MATE - 100) return best.uci;

  let pool;
  if (Math.random() < level.blunder) pool = results.slice(0, Math.min(results.length, 6));
  else pool = results.filter((r) => r.score >= best.score - level.noise);
  return pool[Math.floor(Math.random() * pool.length)].uci;
}

// ヒント用：最善手（ゆらぎなし）
export function bestMove(fen, depth = 3) {
  const chess = new Chess(fen);
  if (chess._moves({ legal: true }).length === 0) return null;
  return deepen(chess, depth, 150000)[0].uci;
}

// 反復深化：ノード上限を超えたら、ひとつ浅い深さの結果を使う
function deepen(chess, depth, maxNodes) {
  let results = null;
  for (let d = 1; d <= depth; d++) {
    const s = new Search(maxNodes);
    const r = s.root(chess, d, results);
    if (s.stopped && results) break;
    results = r.sort((a, b) => b.score - a.score);
    if (results[0].score > MATE - 100) break;
  }
  return results;
}

function toUci(m) {
  return sqName(m.from) + sqName(m.to) + (m.promotion || '');
}

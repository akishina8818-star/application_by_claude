// パズル自動生成スクリプト（開発用）
// 初級者どうしのような「ミスを含む」対局を Stockfish に指させ、
// 相手のミスの直後に「ただ一つの勝ち手」がある局面をパズルとして集める。
// 使い方: node tools/generate-puzzles.mjs [出力ファイル] [最大対局数]
//   STOCKFISH=/usr/games/stockfish（既定）
import fs from 'node:fs';
import { Chess } from '../vendor/chess.js';
import { openEngine, val } from './uci.mjs';

const OUT = process.argv[2] || 'js/data/puzzles-gen.js';
const MAX_GAMES = Number(process.argv[3] || 3000);
const PROGRESS = OUT + '.progress.json';

// テーマごとの目標数
const SHARE = Number(process.env.SHARE || 1);
const QUOTA0 = {
  mate1: 45, mate2: 45, mate3: 20, hanging: 35, fork: 45, pin: 30,
  skewer: 20, discovered: 25, endgame: 35, tactic: 40,
};
const QUOTA = Object.fromEntries(Object.entries(QUOTA0).map(([k, v]) => [k, Math.ceil(v * SHARE)]));

const OPENINGS = [
  'e4 e5 Nf3 Nc6 Bc4 Bc5', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'e4 e5 Nf3 Nc6 Bb5 a6', 'e4 e5 Nf3 Nc6 d4 exd4',
  'e4 e5 Nf3 d6 d4', 'e4 e5 Nc3 Nf6', 'e4 e5 f4', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3',
  'e4 c5 Nc3 Nc6', 'e4 e6 d4 d5', 'e4 c6 d4 d5', 'e4 d5 exd5 Qxd5 Nc3', 'e4 Nf6 e5 Nd5',
  'e4 d6 d4 Nf6 Nc3 g6', 'd4 d5 c4 e6 Nc3 Nf6', 'd4 d5 c4 c6', 'd4 d5 c4 dxc4', 'd4 Nf6 c4 g6 Nc3 Bg7',
  'd4 Nf6 c4 e6 Nc3 Bb4', 'd4 d5 Bf4', 'd4 d5 Nf3 Nf6 e3', 'd4 f5', 'c4 e5 Nc3 Nf6', 'Nf3 d5 g3',
  'e4 e5 Nf3 Nf6', 'e4 e5 d4 exd4 Qxd4 Nc6', 'e4 e5 Bc4 Nf6', 'e4 g6 d4 Bg7', 'e4 b6', 'd4 e5',
  'e4 e5 Nf3 Nc6 Nc3 Nf6', 'e4 e5 Nf3 Nc6 Bc4 Be7', 'e4 c5 c3', 'b3 e5', 'f4 d5', 'e3 e5', 'd3 d5',
];

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };

function material(c, color) {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
function pieceCount(c) {
  let n = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') n++;
  return n;
}
const uciMove = (c, u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
const other = (col) => (col === 'w' ? 'b' : 'w');

// ---------- テーマ判定 ----------
const FILES = 'abcdefgh';
const sq = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? FILES[f] + (r + 1) : null);
const fr = (s) => [FILES.indexOf(s[0]), Number(s[1]) - 1];
const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
DIRS.q = [...DIRS.b, ...DIRS.r];

function isDefended(c, square, color) { return c.attackers(square, color).length > 0; }

// 動いた駒が2つ以上の「狙う価値のある」駒を攻撃しているか
function detectFork(c, to, us) {
  const piece = c.get(to);
  if (!piece) return false;
  const them = other(us);
  let targets = 0;
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== them || p.type === 'p') continue;
      if (!c.attackers(p.square, us).includes(to)) continue;
      if (p.type === 'k' || VAL[p.type] > VAL[piece.type] || !isDefended(c, p.square, them)) targets++;
    }
  }
  return targets >= 2;
}

// 長い駒の先に、相手の駒が2つ並んでいるか（ピン / スキュア）
function detectLine(c, to, us) {
  const piece = c.get(to);
  if (!piece || !DIRS[piece.type]) return null;
  const them = other(us);
  const [f0, r0] = fr(to);
  for (const [df, dr] of DIRS[piece.type]) {
    let f = f0 + df, r = r0 + dr, first = null;
    while (sq(f, r)) {
      const p = c.get(sq(f, r));
      if (p) {
        if (!first) { if (p.color !== them) break; first = p; }
        else {
          if (p.color !== them) break;
          if (first.type !== 'k' && (p.type === 'k' || VAL[p.type] > VAL[first.type])) return 'pin';
          if ((first.type === 'k' || VAL[first.type] > VAL[p.type]) && p.type !== 'p') return 'skewer';
          break;
        }
      }
      f += df; r += dr;
    }
  }
  return null;
}

// 駒がどいたことで、後ろの長い駒の攻撃が通ったか
function detectDiscovered(before, after, from, us) {
  const them = other(us);
  for (const row of after.board()) {
    for (const t of row) {
      if (!t || t.color !== them || t.type === 'p') continue;
      const nowAtt = after.attackers(t.square, us);
      const beforeAtt = before.attackers(t.square, us);
      for (const a of nowAtt) {
        if (beforeAtt.includes(a)) continue;
        const ap = after.get(a);
        if (!ap || !DIRS[ap.type] || a === after.history({ verbose: true }).slice(-1)[0]?.to) continue;
        // from が a と t の間にあるか
        const [fa, ra] = fr(a), [ft, rt] = fr(t.square), [ff, rf] = fr(from);
        const between = (Math.min(fa, ft) <= ff && ff <= Math.max(fa, ft) && Math.min(ra, rt) <= rf && rf <= Math.max(ra, rt))
          && ((fa - ff) * (rt - rf) === (ft - ff) * (ra - rf));
        if (between) return true;
      }
    }
  }
  return false;
}

function classify(startFen, line, mateIn) {
  if (mateIn) return mateIn <= 3 ? 'mate' + mateIn : null;
  const c = new Chess(startFen);
  const us = c.turn();
  if (pieceCount(c) <= 3) return 'endgame';
  const before = new Chess(c.fen());
  const m = uciMove(c, line[0]);
  if (detectDiscovered(before, c, m.from, us)) return 'discovered';
  if (detectFork(c, m.to, us)) return 'fork';
  const ln = detectLine(c, m.to, us);
  if (ln) return ln;
  // 2手目以降のフォーク
  for (let i = 1; i < line.length; i++) {
    const mv = uciMove(c, line[i]);
    if (i % 2 === 0 && detectFork(c, mv.to, us)) return 'fork';
  }
  if (line.length === 1 && m.captured && !isDefended(before, m.to, other(us))) return 'hanging';
  return 'tactic';
}

// ---------- 正解手順の作成 ----------
async function buildLine(eng, fen) {
  const c = new Chess(fen);
  const us = c.turn();
  const mat0 = material(c, us);
  const line = [];
  let mateIn = 0;
  for (let k = 0; k < 4; k++) {
    const r = await eng.analyse(c.fen(), { depth: 16, multipv: 2 });
    const [best, second] = r;
    if (!best) return null;
    if (k === 0) {
      if (best.type === 'mate' && best.v > 0) mateIn = best.v;
      else if (best.type !== 'cp' || best.v < 200) return null;
    }
    let unique;
    if (best.type === 'mate' && best.v > 0) {
      unique = best.v === 1 || !second || !(second.type === 'mate' && second.v > 0 && second.v <= best.v + 1);
    } else {
      if (mateIn) return null; // メイト手順のはずがメイトでなくなった
      unique = !second || val(best) - val(second) >= 200;
      if (val(best) < 150) unique = false;
    }
    if (!unique) { if (k === 0) return null; line.pop(); break; }
    line.push(best.move);
    uciMove(c, best.move);
    if (c.isCheckmate()) return { line, mateIn };
    if (!mateIn && material(c, us) - mat0 >= 2 && k >= 0) {
      // 駒得が確定したか（相手の最善応手のあとも維持できるか）を確認
      const r2 = await eng.analyse(c.fen(), { depth: 14, multipv: 1 });
      const reply = r2[0];
      if (!reply) break;
      const c2 = new Chess(c.fen());
      uciMove(c2, reply.move);
      if (material(c2, us) - mat0 >= 2) break; // 取り返されない
    }
    if (c.isGameOver()) break;
    const r2 = await eng.analyse(c.fen(), { depth: 16, multipv: 1 });
    if (!r2[0]) break;
    line.push(r2[0].move);
    uciMove(c, r2[0].move);
  }
  if (line.length % 2 === 0) line.pop();
  if (!line.length) return null;
  if (mateIn) return null; // メイトまで届かなかった
  // 結果が十分に良いか
  const end = new Chess(fen);
  for (const u of line) uciMove(end, u);
  const gain = material(end, us) - mat0;
  if (gain < 2) return null;
  return { line, mateIn: 0, gain };
}

// ---------- 対局の生成 ----------
async function main() {
  const eng = await openEngine(undefined, { threads: Number(process.env.THREADS || 2), hash: 128 });
  const prog = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : { games: 0, puzzles: [] };
  const seen = new Set(prog.puzzles.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
  const count = () => {
    const n = {};
    for (const p of prog.puzzles) n[p.theme] = (n[p.theme] || 0) + 1;
    return n;
  };
  const full = () => { const n = count(); return Object.keys(QUOTA).every((t) => (n[t] || 0) >= QUOTA[t]); };

  while (prog.games < MAX_GAMES && !full()) {
    prog.games++;
    eng.newGame();
    const c = new Chess();
    const op = OPENINGS[Math.floor(Math.random() * OPENINGS.length)].split(' ');
    const take = Math.max(1, Math.floor(op.length * (0.5 + Math.random() * 0.5)));
    for (const san of op.slice(0, take)) c.move(san);
    // ミスの多さ（初級者〜中級者の対局を真似る）
    const sloppiness = 0.15 + Math.random() * 0.25;
    let prev = null;
    for (let ply = 0; ply < 140 && !c.isGameOver(); ply++) {
      const fen = c.fen();
      const r = await eng.analyse(fen, { nodes: 25000, multipv: 3 });
      if (!r.length) break;
      // パズル候補：直前の相手の手で形勢が大きく傾いた
      if (prev && prev.length) {
        const before = -val(prev[0]);
        const now = val(r[0]);
        const cand = now - before >= 250 && before <= 150 && (now >= 250 || (r[0].type === 'mate' && r[0].v > 0));
        const key = fen.split(' ').slice(0, 2).join(' ');
        // 取られた駒を取り返すだけの手は簡単すぎるので除外
        const lastMv = c.history({ verbose: true }).slice(-1)[0];
        const recapture = lastMv && r[0].move.slice(2, 4) === lastMv.to;
        if (cand && !recapture && !seen.has(key)) {
          seen.add(key);
          const res = await buildLine(eng, fen);
          if (res) {
            const theme = classify(fen, res.line, res.mateIn);
            const n = count();
            if (theme && (n[theme] || 0) < QUOTA[theme]) {
              const last = c.history({ verbose: true }).slice(-1)[0];
              prog.puzzles.push({ fen, solution: res.line, theme, last: last ? last.from + last.to : null });
              process.stdout.write(`[${prog.games}] ${theme} ${JSON.stringify(count())}\n`);
            }
          }
        }
      }
      // 次の一手を選ぶ
      let move;
      const x = Math.random();
      if (x < sloppiness * 0.45) {
        const legal = c.moves({ verbose: true });
        const m = legal[Math.floor(Math.random() * legal.length)];
        move = m.from + m.to + (m.promotion || '');
      } else if (x < sloppiness) {
        move = r[Math.floor(Math.random() * r.length)].move;
      } else move = r[0].move;
      uciMove(c, move);
      prev = r;
      // 片方が大差なら打ち切り（ただし終盤のパズルも集めたいので、駒が減ったら続ける）
      if (Math.abs(val(r[0])) > 1500 && pieceCount(c) > 4) break;
    }
    if (prog.games % 5 === 0) fs.writeFileSync(PROGRESS, JSON.stringify(prog));
  }
  fs.writeFileSync(PROGRESS, JSON.stringify(prog));
  eng.quit();
  console.log('done', prog.games, 'games', JSON.stringify(count()));
}
main();

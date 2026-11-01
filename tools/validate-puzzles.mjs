// パズル検証スクリプト（開発用）
// 使い方: node tools/validate-puzzles.mjs
//   STOCKFISH（既定 /usr/games/stockfish）にネイティブ版か npm stockfish の src/stockfish.js を指定。
//   ONLY=hand / ONLY=gen で対象を絞れる。
// 各パズルについて、合法手か・正解手が最善か・別解がないかを Stockfish で確認する。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Chess } from '../vendor/chess.js';
import { PUZZLES as HAND } from '../js/data/puzzles.js';
import { GENERATED } from '../js/data/puzzles-gen.js';

const PUZZLES = process.env.ONLY === 'gen' ? GENERATED : process.env.ONLY === 'hand' ? HAND : [...HAND, ...GENERATED];

const SF = process.env.STOCKFISH || '/usr/games/stockfish';
const DEPTH = Number(process.env.DEPTH || 18);

const proc = SF.endsWith('.js') ? spawn('node', [SF], { cwd: path.dirname(SF) }) : spawn(SF);
let buf = '';
let waiter = null;
proc.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (waiter) waiter(line);
  }
});
const send = (s) => proc.stdin.write(s + '\n');

function waitFor(pred, onLine) {
  return new Promise((res) => {
    waiter = (line) => { onLine?.(line); if (pred(line)) { waiter = null; res(line); } };
  });
}

async function analyse(fen, multipv = 3) {
  send(`setoption name MultiPV value ${multipv}`);
  send('ucinewgame');
  send(`position fen ${fen}`);
  const lines = {};
  const p = waitFor((l) => l.startsWith('bestmove'), (l) => {
    const m = l.match(/ multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/);
    if (m && l.includes(` depth `)) lines[m[1]] = { type: m[2], v: Number(m[3]), move: m[4] };
  });
  send(`go depth ${DEPTH}`);
  await p;
  return Object.values(lines);
}

// 比較用の数値（大きいほど手番側に良い）
const val = (s) => (s.type === 'mate' ? (s.v > 0 ? 100000 - s.v * 100 : -100000 - s.v * 100) : s.v);

async function main() {
  send('uci');
  await waitFor((l) => l === 'uciok');
  send('isready');
  await waitFor((l) => l === 'readyok');

  let problems = 0;
  for (const pz of PUZZLES) {
    const issues = [];
    const notes = [];
    let chess;
    try { chess = new Chess(pz.fen); } catch (e) { issues.push('FEN不正: ' + e.message); }
    if (chess) {
      for (let i = 0; i < pz.solution.length; i++) {
        const uci = pz.solution[i];
        const fen = chess.fen();
        const res = await analyse(fen, i % 2 === 0 ? 3 : 2);
        res.sort((a, b) => val(b) - val(a));
        const best = res[0];
        const mine = res.find((r) => r.move === uci);
        const fmt = (r) => `${r.move}(${r.type === 'mate' ? '#' + r.v : r.v})`;
        if (i % 2 === 0) {
          if (!mine) issues.push(`手${i}: ${uci} が上位3手にない。最善 ${res.map(fmt).join(' ')}`);
          else if (val(mine) < val(best)) issues.push(`手${i}: ${uci} より良い手 ${fmt(best)}`);
          // 最後の手のメイトは、アプリがどのメイト手も正解にするので別解とみなさない
          const finalMate = i === pz.solution.length - 1 && mine?.type === 'mate' && mine.v === 1;
          const others = finalMate ? [] : res.filter((r) => r.move !== uci && !(pz.alts?.[i] || []).includes(r.move));
          const close = others.filter((r) => mine && (r.type === 'mate' && mine.type === 'mate' ? r.v === mine.v : Math.abs(val(r) - val(mine)) < 120));
          if (close.length) issues.push(`手${i}: 別解の可能性 ${close.map(fmt).join(' ')}（正解 ${mine && fmt(mine)}）`);
          notes.push(`手${i} ${uci}: ${res.map(fmt).join(' ')}`);
        } else {
          const okMoves = [uci, ...(pz.alts?.[i] || [])];
          if (!okMoves.includes(best.move)) notes.push(`応手${i}: 最善は ${fmt(best)}（設定 ${uci}）`);
        }
        for (const a of pz.alts?.[i] || []) {
          const c2 = new Chess(fen);
          try { c2.move({ from: a.slice(0, 2), to: a.slice(2, 4), promotion: a[4] }); } catch { issues.push(`手${i}: 別手 ${a} が非合法`); }
        }
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
        } catch { issues.push(`手${i}: ${uci} が非合法`); break; }
      }
      if (pz.theme.startsWith('mate') && !chess.isCheckmate()) issues.push('最後がメイトになっていない');
      if (pz.solution.length % 2 === 0) issues.push('最後の手がプレイヤーの手ではない');
    }
    const status = issues.length ? 'NG' : 'OK';
    if (issues.length) problems++;
    console.log(`[${status}] ${pz.id}`);
    for (const s of issues) console.log('   ! ' + s);
    if (process.env.VERBOSE || issues.length) for (const s of notes) console.log('     ' + s);
  }
  send('quit');
  console.log(problems ? `\n${problems} 件の問題あり` : '\nすべてOK');
  process.exit(problems ? 1 : 0);
}
main();

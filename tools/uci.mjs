// UCI エンジン（Stockfish）を操作する小さなラッパー（開発用）
// STOCKFISH に .js を指定すると node で、それ以外はネイティブ実行ファイルとして起動する。
import { spawn } from 'node:child_process';
import path from 'node:path';

export async function openEngine(bin = process.env.STOCKFISH || '/usr/games/stockfish', { threads = 1, hash = 64 } = {}) {
  const isJs = bin.endsWith('.js');
  const proc = isJs ? spawn('node', [bin], { cwd: path.dirname(bin) }) : spawn(bin);
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
  const waitFor = (pred, onLine) => new Promise((res) => {
    waiter = (line) => { onLine?.(line); if (pred(line)) { waiter = null; res(line); } };
  });
  send('uci');
  await waitFor((l) => l === 'uciok');
  if (!isJs) { send(`setoption name Threads value ${threads}`); send(`setoption name Hash value ${hash}`); }
  send('isready');
  await waitFor((l) => l === 'readyok');

  let multipvSet = 0;
  return {
    // 手番側から見たスコアの配列（良い順）: { type: 'cp'|'mate', v, move, pv: [] }
    async analyse(fen, { depth = 14, multipv = 2, nodes } = {}) {
      if (multipv !== multipvSet) { send(`setoption name MultiPV value ${multipv}`); multipvSet = multipv; }
      send(`position fen ${fen}`);
      const lines = {};
      const p = waitFor((l) => l.startsWith('bestmove'), (l) => {
        const m = l.match(/ multipv (\d+) score (cp|mate) (-?\d+).*? pv (.+)$/);
        if (m && l.includes(' depth ') && !l.includes('bound')) {
          const pv = m[4].split(' ');
          lines[m[1]] = { type: m[2], v: Number(m[3]), move: pv[0], pv };
        }
      });
      send(nodes ? `go nodes ${nodes}` : `go depth ${depth}`);
      await p;
      return Object.values(lines).sort((a, b) => val(b) - val(a));
    },
    newGame() { send('ucinewgame'); },
    quit() { send('quit'); },
  };
}

// 比較用の数値（大きいほど手番側に良い）
export const val = (s) => (s.type === 'mate' ? (s.v > 0 ? 100000 - s.v * 100 : -100000 - s.v * 100) : s.v);

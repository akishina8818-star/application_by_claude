// 定跡データの検証（開発用）: node tools/validate-openings.mjs
// 手順が合法か、学ぶ側の手が悪手（最善より大きく悪い手）でないかを Stockfish で確認する。
// 「落とし穴」の変化は、相手側の手はわざと悪手なので検査しない。
import { Chess } from '../vendor/chess.js';
import { OPENINGS } from '../js/data/openings.js';
import { openEngine, val } from './uci.mjs';

const DEPTH = Number(process.env.DEPTH || 16);
const LOSS = Number(process.env.LOSS || 90); // 最善手からこれ以上悪い手は要確認
const eng = await openEngine(undefined, { threads: 4, hash: 128 });
let bad = 0;
const ids = new Set();

for (const fam of OPENINGS) {
  for (const line of fam.lines) {
    if (ids.has(line.id)) { console.log(`NG 重複ID ${line.id}`); bad++; }
    ids.add(line.id);
    const c = new Chess();
    const sans = line.moves.split(/\s+/);
    const issues = [];
    for (let i = 0; i < sans.length; i++) {
      const fen = c.fen();
      let mv;
      try { mv = c.move(sans[i]); } catch { issues.push(`手${i} ${sans[i]} が非合法`); break; }
      const learnerMove = (c.turn() === 'w' ? 'b' : 'w') === fam.side;
      const checkThis = line.trap ? learnerMove : true;
      if ((line.dubious || []).includes(i)) continue;
      if (!checkThis) continue;
      const res = await eng.analyse(fen, { depth: DEPTH, multipv: 1 });
      const best = res[0];
      const uci = mv.from + mv.to + (mv.promotion || '');
      if (best.move === uci) continue;
      const after = await eng.analyse(c.fen(), { depth: DEPTH, multipv: 1 });
      const mine = after[0] ? -val(after[0]) : (c.isCheckmate() ? 100000 : 0);
      const loss = val(best) - mine;
      if (loss > LOSS) issues.push(`手${i} ${sans[i]}: 最善 ${best.move} より ${loss} 悪い`);
    }
    for (const k of Object.keys(line.notes || {})) if (Number(k) >= sans.length) issues.push(`notes[${k}] が手数を超えている`);
    const endEval = c.isCheckmate() ? 'メイト' : (await eng.analyse(c.fen(), { depth: DEPTH, multipv: 1 }))[0];
    const evalText = typeof endEval === 'string' ? endEval : `${c.turn()}から見て ${endEval.type === 'mate' ? '#' + endEval.v : endEval.v}`;
    console.log(`[${issues.length ? 'NG' : 'OK'}] ${line.id}（最終 ${evalText}）`);
    for (const s of issues) console.log('   ! ' + s);
    if (issues.length) bad++;
  }
}
eng.quit();
console.log(bad ? `${bad} 件の問題` : 'すべてOK');
process.exit(bad ? 1 : 0);

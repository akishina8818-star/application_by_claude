// レッスン検証スクリプト（開発用）: node tools/validate-lessons.mjs
// 各ステップの局面が作れるか、課題の正解手が合法か、矢印・マス名が正しいかを確認する。
import { Chess } from '../vendor/chess.js';
import { LESSONS } from '../js/data/lessons.js';

const SQ = /^[a-h][1-8]$/;
let bad = 0;
for (const l of LESSONS) {
  l.steps.forEach((st, i) => {
    const where = `${l.id}#${i}`;
    let c;
    try {
      if (st.fen) c = new Chess(st.fen);
      else {
        c = new Chess();
        for (const san of (st.moves || '').split(/\s+/).filter(Boolean)) c.move(san);
      }
    } catch (e) { console.log(`NG ${where}: 局面エラー ${e.message}`); bad++; return; }
    for (const a of st.arrows || []) if (!SQ.test(a.slice(0, 2)) || !SQ.test(a.slice(2, 4))) { console.log(`NG ${where}: 矢印 ${a}`); bad++; }
    for (const m of st.marks || []) if (!SQ.test(m)) { console.log(`NG ${where}: マス ${m}`); bad++; }
    if (st.task) {
      for (const u of st.task.accept) {
        const c2 = new Chess(c.fen());
        try { c2.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); }
        catch { console.log(`NG ${where}: 非合法手 ${u}`); bad++; }
      }
      if (st.orientation && st.orientation !== c.turn()) console.log(`注意 ${where}: 向きと手番が違う`);
      if (!st.orientation && c.turn() === 'b') console.log(`注意 ${where}: 黒番だが盤の向きが白`);
    }
  });
}
console.log(bad ? `${bad} 件の問題` : 'すべてOK');
process.exit(bad ? 1 : 0);

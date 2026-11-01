// 生成したパズル（*.progress.json）に日本語のタイトル・ヒント・解説を付けて
// js/data/puzzles-gen.js に書き出す（開発用）。
// 使い方: node tools/finalize-puzzles.mjs 出力1.progress.json [出力2.progress.json …]
import fs from 'node:fs';
import { Chess } from '../vendor/chess.js';
import { PUZZLES as HAND } from '../js/data/puzzles.js';

const NAME = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = ['mate1', 'hanging', 'fork', 'pin', 'skewer', 'discovered', 'mate2', 'tactic', 'endgame', 'mate3'];

const handKeys = new Set(HAND.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
const raw = [];
const seen = new Set();
for (const f of process.argv.slice(2)) {
  for (const p of JSON.parse(fs.readFileSync(f, 'utf8')).puzzles) {
    const key = p.fen.split(' ').slice(0, 2).join(' ');
    if (seen.has(key) || handKeys.has(key)) continue;
    seen.add(key);
    raw.push(p);
  }
}

function sanLine(fen, line) {
  const c = new Chess(fen);
  let no = Number(fen.split(' ')[5]);
  let out = '';
  line.forEach((u, i) => {
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
    if (m.color === 'w') out += `${i ? ' ' : ''}${no}.${m.san}`;
    else { out += i === 0 ? `${no}…${m.san}` : ` ${m.san}`; no++; }
  });
  return { text: out, end: c };
}

function gainText(fen, line) {
  const c = new Chess(fen);
  const us = c.turn();
  let won = 0, lost = 0;
  const gotNames = [];
  for (const u of line) {
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
    if (m.captured) {
      if (m.color === us) { won += VAL[m.captured]; gotNames.push(NAME[m.captured]); }
      else lost += VAL[m.captured];
    }
    if (m.promotion) { if (m.color === us) won += VAL[m.promotion] - 1; else lost += VAL[m.promotion] - 1; }
  }
  const net = won - lost;
  const main = gotNames.sort((a, b) => VAL[keyOf(b)] - VAL[keyOf(a)])[0];
  return { net, main };
}
const keyOf = (name) => Object.keys(NAME).find((k) => NAME[k] === name);

const out = [];
const counters = {};
for (const p of raw) {
  const c = new Chess(p.fen);
  const first = c.move({ from: p.solution[0].slice(0, 2), to: p.solution[0].slice(2, 4), promotion: p.solution[0][4] || 'q' });
  const piece = NAME[first.piece];
  const userMoves = Math.ceil(p.solution.length / 2);
  const { text } = sanLine(p.fen, p.solution);
  const { net, main } = gainText(p.fen, p.solution);
  const capturedFirst = first.captured ? NAME[first.captured] : null;

  let title, hint, why;
  switch (p.theme) {
    case 'mate1': title = `${piece}で一撃`; hint = 'チェックをかけられる手をすべて調べましょう。相手キングの逃げ道はどこですか？'; why = '相手キングの逃げ道がすべてふさがっています。'; break;
    case 'mate2': title = '2手で詰ませる'; hint = '最初の手もチェックです。相手の応手が限られる手を探しましょう。'; why = '1手目で相手の応手を限定してから詰ませます。'; break;
    case 'mate3': title = '3手で詰ませる'; hint = 'チェックを続けて、キングを逃げ場のない場所へ追い込みましょう。'; why = 'チェックを続けて相手に考える余裕を与えないのがポイントです。'; break;
    case 'hanging': title = `浮いている${capturedFirst || '駒'}`; hint = '守られていない相手の駒はありませんか？'; why = '相手が守りを忘れた駒をそのまま取ります。取る前に「本当にただか」を確かめる習慣も大切です。'; break;
    case 'fork': title = `${piece}の両取り`; hint = `${piece}で、2つの駒を同時に狙えるマスを探しましょう。`; why = `${piece}が2つの駒を同時に攻撃（フォーク）し、相手は両方を守れません。`; break;
    case 'pin': title = `${piece}のピン`; hint = '相手の駒が一直線に並んでいます。その線を長い駒で狙いましょう。'; why = 'ピンされた駒は動けない（動くと後ろの駒を取られる）ので、それを利用して駒得します。'; break;
    case 'skewer': title = `${piece}の串刺し`; hint = '価値の高い駒の後ろに、別の駒が隠れています。'; why = '前の大駒がどくと、後ろの駒を取れます（スキュア）。'; break;
    case 'discovered': title = 'どいて開く攻撃'; hint = '駒を動かすと、その後ろにいる長い駒の利きが通ります。'; why = '動いた駒と後ろの駒、2つの攻撃が同時に生まれます（ディスカバードアタック）。'; break;
    case 'endgame': title = '終盤の決め手'; hint = '駒が少ない局面でも、チェック・取り・脅しの順に調べましょう。'; why = '終盤でも戦術がそのまま勝敗を決めます。'; break;
    default: title = capturedFirst ? `${capturedFirst}を狙え` : 'チャンスを逃すな'; hint = 'チェック・取り・脅しの順に候補手を調べましょう。'; why = '相手の直前の手のミスをとがめる一手です。';
  }
  const result = p.theme.startsWith('mate') ? 'チェックメイトです。'
    : net >= 9 ? `差し引き${net}点の大きな駒得です。`
    : main && net > 0 ? `${main}を得して、差し引き${net}点の駒得になります。` : '形勢が大きく傾きます。';
  const level = p.theme === 'mate1' || p.theme === 'hanging' ? 1 : (p.theme === 'mate3' || userMoves >= 3) ? 3 : userMoves === 2 || p.theme === 'mate2' ? 2 : 2;
  counters[p.theme] = (counters[p.theme] || 0) + 1;
  out.push({
    id: `g-${p.theme}-${counters[p.theme]}`,
    theme: p.theme,
    level,
    title,
    fen: p.fen,
    last: p.last || undefined,
    solution: p.solution,
    hint,
    explain: `正解：${text}。${why}${result}`,
  });
}
out.sort((a, b) => ORDER.indexOf(a.theme) - ORDER.indexOf(b.theme) || a.level - b.level);

const body = out.map((p) => '  ' + JSON.stringify(p)).join(',\n');
fs.writeFileSync('js/data/puzzles-gen.js',
  `// 自動生成パズル（tools/generate-puzzles.mjs → tools/finalize-puzzles.mjs）\n` +
  `// Stockfish で「ただ一つの勝ち手」を確認済み。手で編集しないこと。\n` +
  `export const GENERATED = [\n${body}\n];\n`);
const n = {};
for (const p of out) n[p.theme] = (n[p.theme] || 0) + 1;
console.log(out.length, JSON.stringify(n));

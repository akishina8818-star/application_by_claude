// チェス ステップアップ — 画面の切り替えと各画面
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { store } from './store.js';
import { LESSONS } from './data/lessons.js';
import { PUZZLES, THEMES } from './data/puzzles.js';
import { LEVELS } from './engine.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sideLabel = (c) => (c === 'w' ? '白番' : '黒番');

// ---------- エンジン（別スレッド。使えなければ画面スレッドで） ----------
const engine = (() => {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  try {
    worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (p) { pending.delete(e.data.id); e.data.error ? p.reject(e.data.error) : p.resolve(e.data.move); }
    };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  const local = async (type, fen, level) => {
    const m = await import('./engine.js');
    await new Promise((r) => setTimeout(r, 30));
    return type === 'hint' ? m.bestMove(fen, 3) : m.chooseMove(fen, level);
  };
  return {
    ask(type, fen, level) {
      if (!worker) return local(type, fen, level);
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type, fen, level });
        // 応答がなければ画面スレッドで計算
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); local(type, fen, level).then(resolve, reject); }
        }, 15000);
      });
    },
  };
})();

function applyUci(chess, uci) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
}

function chessFromStep(st) {
  if (st.fen) return new Chess(st.fen);
  const c = new Chess();
  let last = null;
  for (const san of (st.moves || '').split(/\s+/).filter(Boolean)) last = c.move(san);
  c._lessonLast = last;
  return c;
}

// ---------- ルーター ----------
const routes = [
  [/^$|^home$/, renderHome],
  [/^lessons$/, renderLessons],
  [/^lesson-([\w-]+)$/, (m) => renderLesson(m[1])],
  [/^puzzles$/, renderPuzzleThemes],
  [/^puzzles-([\w-]+)$/, (m) => renderPuzzle(m[1])],
  [/^play$/, renderPlay],
  [/^progress$/, renderProgress],
];

let cleanup = null;
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (cleanup) { cleanup(); cleanup = null; }
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      const tab = h.split('-')[0] || 'home';
      document.querySelectorAll('.tabbar a').forEach((a) => {
        const t = a.getAttribute('href').slice(1);
        const on = t === tab || (t === 'lessons' && tab === 'lesson');
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      fn(m);
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#home';
}
window.addEventListener('hashchange', route);

// ---------- 集計 ----------
function stats() {
  const s = store.get();
  const solved = PUZZLES.filter((p) => s.puzzles[p.id]?.solved);
  const clean = PUZZLES.filter((p) => s.puzzles[p.id]?.clean);
  const lessonsDone = LESSONS.filter((l) => s.lessons[l.id]?.done);
  return { s, solved, clean, lessonsDone };
}

function bar(value, max) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return `<span class="bar" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}"><span style="width:${pct}%"></span></span>`;
}

// ---------- ホーム ----------
function renderHome() {
  const { s, solved, clean, lessonsDone } = stats();
  const nextLesson = LESSONS.find((l) => !s.lessons[l.id]?.done);
  const nextPuzzle = PUZZLES.find((p) => !s.puzzles[p.id]?.solved);
  const stages = ['基礎', '戦術', 'エンドゲーム', '中級'];
  const g = s.games;
  const rate = solved.length ? Math.round((clean.length / solved.length) * 100) : null;

  view.innerHTML = `
    <section class="hero">
      <p class="eyebrow">初級から中級へ</p>
      <h1>今日の一手を<br>積み上げよう</h1>
      <p class="lede">レッスンで形を学び、パズルで目を鍛え、対局で使ってみる。この3つをくり返すのが上達の近道です。</p>
    </section>

    <section class="next">
      ${nextLesson ? `
      <a class="next-item primary" href="#lesson-${nextLesson.id}">
        <span class="kicker">次のレッスン・${esc(nextLesson.stage)}</span>
        <span class="next-title">${esc(nextLesson.title)}</span>
        <span class="next-sub">${esc(nextLesson.summary)}</span>
      </a>` : `
      <a class="next-item primary" href="#lessons">
        <span class="kicker">レッスン</span>
        <span class="next-title">全レッスン修了！</span>
        <span class="next-sub">気になる回を復習しましょう。</span>
      </a>`}
      <a class="next-item" href="#puzzles${nextPuzzle ? '-' + nextPuzzle.theme : ''}">
        <span class="kicker">パズル</span>
        <span class="next-title">${nextPuzzle ? esc(THEMES[nextPuzzle.theme].name) + 'に挑戦' : '全問クリア！'}</span>
        <span class="next-sub">${solved.length} / ${PUZZLES.length} 問クリア</span>
      </a>
      <a class="next-item" href="#play">
        <span class="kicker">対局</span>
        <span class="next-title">コンピュータと練習</span>
        <span class="next-sub">${g.win}勝 ${g.loss}敗 ${g.draw}分</span>
      </a>
    </section>

    <section class="block">
      <h2>上達の道のり</h2>
      <ol class="road">
        ${stages.map((st) => {
          const ls = LESSONS.filter((l) => l.stage === st);
          const done = ls.filter((l) => s.lessons[l.id]?.done).length;
          const state = done === ls.length ? 'done' : done > 0 ? 'doing' : '';
          return `<li class="${state}"><span class="road-name">${st}</span>${bar(done, ls.length)}<span class="road-count">${done}/${ls.length}</span></li>`;
        }).join('')}
      </ol>
    </section>

    <section class="block stats-row">
      <div><span class="num">${lessonsDone.length}</span><span class="lbl">修了レッスン</span></div>
      <div><span class="num">${solved.length}</span><span class="lbl">クリアしたパズル</span></div>
      <div><span class="num">${rate === null ? '–' : rate + '%'}</span><span class="lbl">一発正解率</span></div>
    </section>
  `;
}

// ---------- レッスン一覧 ----------
function renderLessons() {
  const { s } = stats();
  const stages = [...new Set(LESSONS.map((l) => l.stage))];
  view.innerHTML = `
    <header class="page-head"><h1>レッスン</h1><p>短い説明と、実際に指してみる課題で学びます。</p></header>
    ${stages.map((st) => `
      <section class="block">
        <h2 class="stage">${st}</h2>
        <ul class="list">
          ${LESSONS.filter((l) => l.stage === st).map((l) => `
            <li><a href="#lesson-${l.id}" class="row">
              <span class="row-main"><span class="row-title">${esc(l.title)}</span><span class="row-sub">${esc(l.summary)}</span></span>
              <span class="chip ${s.lessons[l.id]?.done ? 'ok' : ''}">${s.lessons[l.id]?.done ? '修了' : l.steps.length + 'ステップ'}</span>
            </a></li>`).join('')}
        </ul>
      </section>`).join('')}
  `;
}

// ---------- レッスン本体 ----------
function renderLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) { location.hash = '#lessons'; return; }
  let idx = 0;
  let solved = false;

  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="#lessons">← レッスン一覧</a>
      <h1>${esc(lesson.title)}</h1>
    </header>
    <div class="steps" aria-label="ステップ"></div>
    <div class="board-wrap"><div id="lesson-board"></div></div>
    <div class="panel">
      <p class="lesson-text"></p>
      <div class="task" hidden></div>
      <div class="actions">
        <button type="button" class="btn ghost" id="prev">戻る</button>
        <button type="button" class="btn" id="next">次へ</button>
      </div>
    </div>
  `;
  const board = new Board($('#lesson-board'), { onMove: onUserMove });
  const textEl = $('.lesson-text');
  const taskEl = $('.task');
  const stepsEl = $('.steps');
  let chess = null;

  function show() {
    const st = lesson.steps[idx];
    solved = false;
    chess = chessFromStep(st);
    const last = chess._lessonLast;
    board.setOrientation(st.orientation || 'w');
    board.interactive = !!st.task;
    board.setAnnotations({ arrows: st.arrows || [], marks: st.marks || [] });
    board.setHint(null);
    board.setPosition(chess, { lastMove: last ? { from: last.from, to: last.to } : null });
    textEl.innerHTML = st.text;
    if (st.task) {
      taskEl.hidden = false;
      taskEl.className = 'task';
      taskEl.innerHTML = `<span class="task-label">課題・${sideLabel(chess.turn())}</span><span class="task-msg">${esc(st.task.prompt)}</span>`;
    } else {
      taskEl.hidden = true;
    }
    stepsEl.innerHTML = lesson.steps.map((_, i) => `<span class="${i < idx ? 'past' : i === idx ? 'now' : ''}"></span>`).join('');
    $('#prev').disabled = idx === 0;
    const isLast = idx === lesson.steps.length - 1;
    $('#next').textContent = isLast ? '修了する' : '次へ';
    $('#next').disabled = !!st.task && !solved;
  }

  function onUserMove(uci) {
    const st = lesson.steps[idx];
    if (!st.task || solved) return;
    const ok = st.task.accept.some((a) => a === uci || a === uci.slice(0, 4));
    if (ok) {
      const mv = applyUci(chess, uci);
      solved = true;
      board.interactive = false;
      board.setAnnotations({ arrows: [], marks: [] });
      board.setPosition(chess, { lastMove: { from: mv.from, to: mv.to } });
      taskEl.className = 'task good';
      taskEl.innerHTML = `<span class="task-label">正解</span><span class="task-msg">${esc(st.task.success)}</span>`;
      $('#next').disabled = false;
    } else {
      board.flash(uci.slice(2, 4));
      taskEl.className = 'task bad';
      taskEl.innerHTML = `<span class="task-label">もう一度</span><span class="task-msg">${esc(st.task.prompt)}。ヒント：上の説明をもう一度読んでみましょう。</span>`;
      board.render();
    }
  }

  $('#prev').onclick = () => { if (idx > 0) { idx--; show(); } };
  $('#next').onclick = () => {
    if (idx < lesson.steps.length - 1) { idx++; show(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    store.lessonDone(lesson.id);
    const theme = lesson.puzzleTheme;
    const nextL = LESSONS[LESSONS.indexOf(lesson) + 1];
    $('.panel').innerHTML = `
      <p class="done-head">「${esc(lesson.title)}」修了！</p>
      <p class="lesson-text">学んだ形は、パズルで何度も解くと実戦で見えるようになります。</p>
      <div class="actions col">
        ${theme ? `<a class="btn" href="#puzzles-${theme}">${esc(THEMES[theme].name)}のパズルを解く</a>` : ''}
        ${nextL ? `<a class="btn ${theme ? 'ghost' : ''}" href="#lesson-${nextL.id}">次のレッスン：${esc(nextL.title)}</a>` : `<a class="btn ghost" href="#lessons">レッスン一覧へ</a>`}
      </div>`;
  };
  show();
}

// ---------- パズル：テーマ一覧 ----------
function renderPuzzleThemes() {
  const { s, solved } = stats();
  view.innerHTML = `
    <header class="page-head"><h1>パズル</h1><p>${solved.length} / ${PUZZLES.length} 問クリア。テーマを選ぶか、おまかせで解きましょう。</p></header>
    <a class="next-item primary wide" href="#puzzles-mix">
      <span class="kicker">おまかせ</span>
      <span class="next-title">未クリア・間違えた問題から出題</span>
    </a>
    <section class="block">
      <ul class="list">
        ${Object.entries(THEMES).map(([key, t]) => {
          const ps = PUZZLES.filter((p) => p.theme === key);
          const done = ps.filter((p) => s.puzzles[p.id]?.solved).length;
          return `<li><a href="#puzzles-${key}" class="row">
            <span class="row-main"><span class="row-title">${esc(t.name)}</span><span class="row-sub">${esc(t.desc)}</span>${bar(done, ps.length)}</span>
            <span class="chip ${done === ps.length ? 'ok' : ''}">${done}/${ps.length}</span>
          </a></li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

// ---------- パズル本体 ----------
function puzzleQueue(theme) {
  const s = store.get();
  if (theme === 'mix') {
    const unsolved = PUZZLES.filter((p) => !s.puzzles[p.id]?.solved);
    const missed = PUZZLES.filter((p) => s.puzzles[p.id]?.solved && !s.puzzles[p.id]?.lastClean);
    const pool = [...unsolved, ...missed];
    const list = pool.length ? pool : [...PUZZLES];
    return list.sort(() => Math.random() - 0.5);
  }
  const ps = PUZZLES.filter((p) => p.theme === theme);
  // 未クリアを先に
  return [...ps.filter((p) => !s.puzzles[p.id]?.solved), ...ps.filter((p) => s.puzzles[p.id]?.solved)];
}

function renderPuzzle(theme) {
  if (theme !== 'mix' && !THEMES[theme]) { location.hash = '#puzzles'; return; }
  const queue = puzzleQueue(theme);
  let qi = 0;
  let pz, chess, step, mistakes, done, hintLevel;

  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="#puzzles">← テーマ一覧</a>
      <h1>${theme === 'mix' ? 'おまかせ' : esc(THEMES[theme].name)}</h1>
    </header>
    <div class="puzzle-meta"><span class="turn"></span><span class="pz-title"></span><span class="pz-count"></span></div>
    <div class="board-wrap"><div id="pz-board"></div></div>
    <div class="panel">
      <div class="task"></div>
      <p class="lesson-text explain" hidden></p>
      <div class="actions">
        <button type="button" class="btn ghost" id="hint">ヒント</button>
        <button type="button" class="btn ghost" id="answer">答えを見る</button>
        <button type="button" class="btn" id="nextpz" hidden>次の問題</button>
      </div>
    </div>
  `;
  const board = new Board($('#pz-board'), { onMove: onUserMove });
  const taskEl = $('.panel .task');
  const explainEl = $('.explain');
  let timer = null;

  function load() {
    pz = queue[qi % queue.length];
    chess = new Chess(pz.fen);
    step = 0; mistakes = 0; done = false; hintLevel = 0;
    board.setOrientation(chess.turn());
    board.interactive = true;
    board.locked = false;
    board.setAnnotations({});
    board.setHint(null);
    board.setPosition(chess);
    $('.turn').textContent = sideLabel(chess.turn());
    $('.turn').className = 'turn ' + chess.turn();
    $('.pz-title').textContent = pz.title;
    $('.pz-count').textContent = `${(qi % queue.length) + 1} / ${queue.length}`;
    const moves = Math.ceil(pz.solution.length / 2);
    const goal = pz.theme === 'mate1' ? '1手で詰ませよう' : pz.theme === 'mate2' ? '2手で詰ませよう' : `${THEMES[pz.theme].name}で得をしよう（${moves}手）`;
    setTask('', `${sideLabel(chess.turn())}：${goal}`);
    explainEl.hidden = true;
    $('#hint').hidden = false; $('#answer').hidden = false; $('#nextpz').hidden = true;
  }

  function setTask(kind, msg, label) {
    taskEl.className = 'task ' + kind;
    taskEl.innerHTML = `${label ? `<span class="task-label">${label}</span>` : ''}<span class="task-msg">${esc(msg)}</span>`;
  }

  function isCorrect(uci) {
    const exp = pz.solution[step];
    if (uci === exp || uci.slice(0, 4) === exp) return true;
    if ((pz.alts?.[step] || []).includes(uci)) return true;
    // 最後の手がメイトなら、別のメイト手も正解にする
    if (step === pz.solution.length - 1) {
      const c = new Chess(chess.fen());
      applyUci(c, uci);
      if (c.isCheckmate()) return true;
    }
    return false;
  }

  function onUserMove(uci) {
    if (done) return;
    if (!isCorrect(uci)) {
      mistakes++;
      board.flash(uci.slice(2, 4));
      board.render();
      setTask('bad', mistakes >= 2 ? `ちがいます。${pz.hint}` : 'ちがいます。もう一度考えてみましょう。', 'もう一度');
      return;
    }
    const mv = applyUci(chess, uci);
    board.setHint(null);
    board.setPosition(chess, { lastMove: { from: mv.from, to: mv.to } });
    step++;
    if (step >= pz.solution.length || chess.isCheckmate()) return finish(true);
    // 相手の応手
    board.locked = true;
    setTask('good', '正解！ 相手の手を待っています…', 'いい手');
    timer = setTimeout(() => {
      const reply = applyUci(chess, pz.solution[step]);
      step++;
      board.locked = false;
      board.setPosition(chess, { lastMove: { from: reply.from, to: reply.to } });
      setTask('', `相手は ${reply.san}。続きを指しましょう。`);
    }, 650);
  }

  function finish(byUser) {
    done = true;
    board.interactive = false;
    const clean = byUser && mistakes === 0 && hintLevel === 0;
    store.puzzleResult(pz.id, clean);
    if (byUser) setTask('good', clean ? '一発正解！' : 'クリア！ 次は一発で解けるように復習しましょう。', '正解');
    else setTask('', '答えを確認しましょう。この問題は「おまかせ」で再び出題されます。', '答え');
    explainEl.hidden = false;
    explainEl.textContent = pz.explain;
    $('#hint').hidden = true; $('#answer').hidden = true; $('#nextpz').hidden = false;
  }

  $('#hint').onclick = () => {
    if (done) return;
    hintLevel++;
    if (hintLevel === 1) setTask('', pz.hint, 'ヒント');
    else { board.setHint(pz.solution[step].slice(0, 2)); setTask('', `${pz.hint} 光っている駒を動かします。`, 'ヒント'); }
  };
  $('#answer').onclick = () => {
    if (done) return;
    board.locked = true;
    const playRest = () => {
      if (step >= pz.solution.length) { board.locked = false; return finish(false); }
      const mv = applyUci(chess, pz.solution[step]);
      step++;
      board.setPosition(chess, { lastMove: { from: mv.from, to: mv.to } });
      timer = setTimeout(playRest, 700);
    };
    clearTimeout(timer);
    playRest();
  };
  $('#nextpz').onclick = () => { qi++; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  cleanup = () => clearTimeout(timer);
  load();
}

// ---------- 対局 ----------
const DRILLS = [
  { id: 'normal', name: '通常の対局', fen: null, desc: '初期配置から' },
  { id: 'kq', name: 'Q＋K 対 K', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', desc: 'クイーンで詰ませる練習', color: 'w' },
  { id: 'kr', name: 'R＋K 対 K', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', desc: 'ルークで詰ませる練習', color: 'w' },
  { id: 'kp', name: 'ポーン1つを成らせる', fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', desc: 'キングの先導とオポジション', color: 'w' },
];

function renderPlay() {
  const s = store.get();
  let level = s.settings.level || 2;
  let color = s.settings.color || 'w';
  let drill = 'normal';

  view.innerHTML = `
    <header class="page-head"><h1>対局</h1><p>コンピュータ相手に、学んだことを使ってみましょう。</p></header>
    <section class="block setup">
      <h2>相手の強さ</h2>
      <div class="choice" id="levels">
        ${LEVELS.map((l) => `<button type="button" class="opt" data-level="${l.id}"><span class="opt-name">${l.name}</span><span class="opt-sub">${l.desc}</span></button>`).join('')}
      </div>
      <h2>練習の種類</h2>
      <div class="choice two" id="drills">
        ${DRILLS.map((d) => `<button type="button" class="opt" data-drill="${d.id}"><span class="opt-name">${d.name}</span><span class="opt-sub">${d.desc}</span></button>`).join('')}
      </div>
      <h2>自分の色</h2>
      <div class="seg" id="colors">
        <button type="button" data-color="w">白（先手）</button>
        <button type="button" data-color="b">黒（後手）</button>
      </div>
      <button type="button" class="btn big" id="start">対局を始める</button>
    </section>
  `;
  const sync = () => {
    view.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === level)));
    view.querySelectorAll('[data-drill]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.drill === drill)));
    const d = DRILLS.find((x) => x.id === drill);
    view.querySelectorAll('[data-color]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.color === color));
      b.disabled = !!d.color && b.dataset.color !== d.color;
    });
  };
  view.querySelector('#levels').onclick = (e) => { const b = e.target.closest('[data-level]'); if (b) { level = Number(b.dataset.level); store.setSetting('level', level); sync(); } };
  view.querySelector('#drills').onclick = (e) => {
    const b = e.target.closest('[data-drill]');
    if (!b) return;
    drill = b.dataset.drill;
    const d = DRILLS.find((x) => x.id === drill);
    if (d.color) color = d.color;
    sync();
  };
  view.querySelector('#colors').onclick = (e) => { const b = e.target.closest('[data-color]'); if (b && !b.disabled) { color = b.dataset.color; store.setSetting('color', color); sync(); } };
  view.querySelector('#start').onclick = () => startGame(level, color, DRILLS.find((d) => d.id === drill));
  sync();
}

function startGame(level, color, drill) {
  const chess = drill.fen ? new Chess(drill.fen) : new Chess();
  const lv = LEVELS.find((l) => l.id === level);
  let over = false;
  let thinking = false;
  let token = 0;

  view.innerHTML = `
    <header class="page-head compact">
      <button type="button" class="back linkish" id="leave">← 設定に戻る</button>
      <h1>${esc(drill.name)}</h1>
    </header>
    <div class="puzzle-meta"><span class="turn"></span><span class="pz-title">相手：${esc(lv.name)}</span><span class="pz-count" id="status"></span></div>
    <div class="board-wrap"><div id="game-board"></div></div>
    <div class="panel">
      <div class="task" id="gmsg"></div>
      <ol class="movelist" id="moves" aria-label="棋譜"></ol>
      <div class="actions">
        <button type="button" class="btn ghost" id="undo">待った</button>
        <button type="button" class="btn ghost" id="ghint">ヒント</button>
        <button type="button" class="btn ghost" id="resign">投了</button>
      </div>
      <div class="confirm" id="confirm" hidden>
        <span>投了しますか？</span>
        <button type="button" class="btn small" id="resign-yes">投了する</button>
        <button type="button" class="btn small ghost" id="resign-no">続ける</button>
      </div>
    </div>
  `;
  const board = new Board($('#game-board'), { orientation: color, onMove: onUserMove });
  const msg = (kind, text, label) => {
    const el = $('#gmsg');
    el.className = 'task ' + kind;
    el.innerHTML = `${label ? `<span class="task-label">${label}</span>` : ''}<span class="task-msg">${esc(text)}</span>`;
  };

  function refresh(last) {
    board.setPosition(chess, { lastMove: last ? { from: last.from, to: last.to } : null });
    $('.turn').textContent = chess.turn() === color ? 'あなたの番' : '相手の番';
    $('.turn').className = 'turn ' + chess.turn();
    const hist = chess.history();
    const startNo = drill.fen ? Number(drill.fen.split(' ')[5]) : 1;
    const blackFirst = (drill.fen ? drill.fen.split(' ')[1] : 'w') === 'b';
    const items = [];
    let i = 0, no = startNo;
    if (blackFirst && hist.length) { items.push(`<li><span class="no">${no}.</span><span>…</span><span>${esc(hist[0])}</span></li>`); i = 1; no++; }
    for (; i < hist.length; i += 2, no++) items.push(`<li><span class="no">${no}.</span><span>${esc(hist[i])}</span><span>${esc(hist[i + 1] || '')}</span></li>`);
    $('#moves').innerHTML = items.join('');
    $('#moves').scrollTop = $('#moves').scrollHeight;
    $('#undo').disabled = over || hist.length === 0;
  }

  function checkEnd() {
    if (!chess.isGameOver()) return false;
    over = true;
    board.interactive = false;
    let result, text;
    if (chess.isCheckmate()) {
      const userWon = chess.turn() !== color;
      result = userWon ? 'win' : 'loss';
      text = userWon ? 'チェックメイト！ あなたの勝ちです。' : 'チェックメイトされました。どこで形勢が変わったか、棋譜を見直しましょう。';
    } else {
      result = 'draw';
      text = chess.isStalemate() ? 'ステイルメイトで引き分けです。勝っている側は相手の逃げ道に注意！'
        : chess.isThreefoldRepetition() ? '同じ局面が3回出たので引き分けです。'
        : chess.isInsufficientMaterial() ? '詰ませる駒が足りないので引き分けです。'
        : '50手ルールで引き分けです。';
    }
    store.gameResult(result, level);
    msg(result === 'win' ? 'good' : result === 'loss' ? 'bad' : '', text, result === 'win' ? '勝ち' : result === 'loss' ? '負け' : '引き分け');
    showAgain();
    return true;
  }

  function showAgain() {
    $('.actions').innerHTML = `<button type="button" class="btn" id="again">もう一局</button><button type="button" class="btn ghost" id="back2">設定へ</button>`;
    $('#again').onclick = () => startGame(level, color, drill);
    $('#back2').onclick = renderPlay;
  }

  async function engineMove() {
    if (over) return;
    thinking = true;
    board.locked = true;
    msg('', '考えています…');
    const my = ++token;
    try {
      const uci = await engine.ask('move', chess.fen(), level);
      if (my !== token || over) return;
      await new Promise((r) => setTimeout(r, 250));
      if (my !== token) return;
      const mv = applyUci(chess, uci);
      refresh(mv);
      if (!checkEnd()) msg('', chess.inCheck() ? 'チェックされています！' : `相手は ${mv.san}。あなたの番です。`);
    } catch {
      msg('bad', 'コンピュータの計算に失敗しました。「待った」で戻すか、もう一局始めてください。');
    } finally {
      if (my === token) { thinking = false; board.locked = false; }
    }
  }

  function onUserMove(uci) {
    if (over || thinking || chess.turn() !== color) return;
    const mv = applyUci(chess, uci);
    board.setHint(null);
    refresh(mv);
    if (!checkEnd()) engineMove();
  }

  $('#undo').onclick = () => {
    if (over) return;
    token++; thinking = false; board.locked = false;
    chess.undo();
    if (chess.turn() !== color) chess.undo();
    const h = chess.history({ verbose: true });
    refresh(h[h.length - 1]);
    if (chess.turn() !== color) engineMove();
    else msg('', '1手戻しました。');
  };
  $('#ghint').onclick = async () => {
    if (over || thinking || chess.turn() !== color) return;
    msg('', 'ヒントを考えています…');
    const uci = await engine.ask('hint', chess.fen(), level);
    if (!uci || over) return;
    board.setHint(uci.slice(0, 2));
    board.setAnnotations({ arrows: [uci.slice(0, 4)], marks: [] });
    msg('', '矢印がコンピュータのおすすめです。理由を考えてから指してみましょう。', 'ヒント');
    const clear = () => board.setAnnotations({});
    board.onMove = (u) => { clear(); onUserMove(u); board.onMove = onUserMove; };
  };
  $('#resign').onclick = () => { if (!over) $('#confirm').hidden = false; };
  $('#resign-no').onclick = () => { $('#confirm').hidden = true; };
  $('#resign-yes').onclick = () => {
    $('#confirm').hidden = true;
    over = true; token++; board.interactive = false;
    store.gameResult('loss', level);
    msg('bad', '投了しました。次はもう少し粘ってみましょう。', '負け');
    showAgain();
  };
  $('#leave').onclick = () => { token++; renderPlay(); };
  cleanup = () => { token++; };

  refresh(null);
  if (chess.turn() !== color) engineMove();
  else msg('', drill.fen ? `${drill.desc}。あなたの番です。` : 'あなたの番です。中央を取り、駒を展開しましょう。');
}

// ---------- 記録 ----------
function renderProgress() {
  const { s, solved, clean, lessonsDone } = stats();
  const g = s.games;
  view.innerHTML = `
    <header class="page-head"><h1>記録</h1><p>記録はこの端末の中だけに保存されます。</p></header>
    <section class="block stats-row">
      <div><span class="num">${lessonsDone.length}<small>/${LESSONS.length}</small></span><span class="lbl">修了レッスン</span></div>
      <div><span class="num">${solved.length}<small>/${PUZZLES.length}</small></span><span class="lbl">クリアしたパズル</span></div>
      <div><span class="num">${solved.length ? Math.round((clean.length / solved.length) * 100) + '%' : '–'}</span><span class="lbl">一発正解率</span></div>
    </section>
    <section class="block">
      <h2>テーマ別の正解率</h2>
      <table class="tbl">
        <thead><tr><th>テーマ</th><th>クリア</th><th>一発正解</th></tr></thead>
        <tbody>
          ${Object.entries(THEMES).map(([k, t]) => {
            const ps = PUZZLES.filter((p) => p.theme === k);
            const sv = ps.filter((p) => s.puzzles[p.id]?.solved).length;
            const cl = ps.filter((p) => s.puzzles[p.id]?.clean).length;
            const weak = sv > 0 && cl / sv < 0.5;
            return `<tr><td>${esc(t.name)}${weak ? ' <span class="chip warn">要復習</span>' : ''}</td><td>${sv}/${ps.length}</td><td>${sv ? Math.round((cl / sv) * 100) + '%' : '–'}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>
    <section class="block">
      <h2>対局成績</h2>
      <table class="tbl">
        <thead><tr><th>相手</th><th>勝</th><th>負</th><th>分</th></tr></thead>
        <tbody>
          ${LEVELS.map((l) => { const b = g.byLevel[l.id] || { win: 0, loss: 0, draw: 0 }; return `<tr><td>${l.name}</td><td>${b.win}</td><td>${b.loss}</td><td>${b.draw}</td></tr>`; }).join('')}
        </tbody>
      </table>
      <p class="note">目安：「中級入口」に安定して勝てるようになったら、「中級」に挑戦しましょう。</p>
    </section>
    <section class="block">
      <button type="button" class="btn ghost" id="reset">記録をリセット</button>
      <div class="confirm" id="reset-confirm" hidden>
        <span>すべての記録を消しますか？</span>
        <button type="button" class="btn small danger" id="reset-yes">消す</button>
        <button type="button" class="btn small ghost" id="reset-no">やめる</button>
      </div>
      <p class="note credit">駒の画像：Colin M.L. Burnett（BSDライセンス）。ルール判定：chess.js（BSD-2）。</p>
    </section>
  `;
  $('#reset').onclick = () => { $('#reset-confirm').hidden = false; };
  $('#reset-no').onclick = () => { $('#reset-confirm').hidden = true; };
  $('#reset-yes').onclick = () => { store.reset(); renderProgress(); };
}

// ---------- 起動 ----------
route();

if ('serviceWorker' in navigator && !window.__NO_SW__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 対応していない環境では無視 */ });
  });
}

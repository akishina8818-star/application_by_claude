// チェス ステップアップ — 画面の切り替えと各画面
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sound } from './audio.js';
import { store } from './store.js';
import { LESSONS } from './data/lessons.js';
import { PUZZLES as HAND_PUZZLES, THEMES } from './data/puzzles.js';
import { GENERATED } from './data/puzzles-gen.js';
import { LEVELS } from './engine.js';
import { OPENINGS, OPENING_GROUPS, ALL_LINES } from './data/openings.js';

const $ = (sel, root = document) => root.querySelector(sel);
const PUZZLES = [...HAND_PUZZLES, ...GENERATED];
const SESSION_SIZE = 10;
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
  [/^openings$/, renderOpenings],
  [/^opening-([\w-]+)$/, (m) => renderOpeningFamily(m[1])],
  [/^op-learn-([\w-]+)$/, (m) => renderOpeningLearn(m[1])],
  [/^op-drill-([\w-]+)$/, (m) => renderOpeningDrill(m[1])],
  [/^op-review$/, () => renderOpeningDrill(null)],
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
        const on = t === tab || (t === 'lessons' && tab === 'lesson') || (t === 'openings' && (tab === 'opening' || tab === 'op'));
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
      <a class="next-item" href="#openings">
        <span class="kicker">定跡</span>
        <span class="next-title">オープニングを覚える</span>
        <span class="next-sub">${ALL_LINES.filter((l) => openingStatus(l.id) === 'mastered').length} / ${ALL_LINES.length} 変化を習得</span>
      </a>
      <a class="next-item wide-cell" href="#play">
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
      sound.play('good');
      taskEl.innerHTML = `<span class="task-label">正解</span><span class="task-msg">${esc(st.task.success)}</span>`;
      $('#next').disabled = false;
    } else {
      board.flash(uci.slice(2, 4));
      taskEl.className = 'task bad';
      sound.play('bad');
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
        ${nextL ? `<a class="btn ${theme ? 'ghost' : ''}" href="#lesson-${nextL.id}">次のレッスン：${esc(nextL.title)}</a>` : ''}
        <a class="btn ghost" href="#lessons">レッスン一覧に戻る</a>
        <a class="btn ghost" href="#home">ホームに戻る</a>
      </div>`;
    $('.steps').innerHTML = lesson.steps.map(() => '<span class="past"></span>').join('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  show();
}

// ---------- パズル：テーマ一覧 ----------
function renderPuzzleThemes() {
  const { s, solved } = stats();
  view.innerHTML = `
    <header class="page-head"><h1>パズル</h1><p>${solved.length} / ${PUZZLES.length} 問クリア。1セット10問です。テーマを選ぶか、おまかせで解きましょう。</p></header>
    <a class="next-item primary wide" href="#puzzles-mix">
      <span class="kicker">おまかせ</span>
      <span class="next-title">未クリア・間違えた問題から出題</span>
    </a>
    <section class="block">
      <ul class="list">
        ${Object.entries(THEMES).filter(([key]) => PUZZLES.some((p) => p.theme === key)).map(([key, t]) => {
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
// 1セット10問。最後まで解いたら結果画面を出す（くり返しにはしない）。
function puzzleQueue(theme, onlyMissed = false) {
  const s = store.get();
  const st = (p) => s.puzzles[p.id];
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  if (onlyMissed) return onlyMissed;
  if (theme === 'mix') {
    const unsolved = PUZZLES.filter((p) => !st(p)?.solved);
    const missed = PUZZLES.filter((p) => st(p)?.solved && !st(p)?.lastClean);
    // まずは間違えた問題、次にやさしい順の未クリア問題
    const pool = [...shuffle(missed), ...shuffle(unsolved).sort((a, b) => a.level - b.level)];
    return (pool.length ? pool : shuffle([...PUZZLES])).slice(0, SESSION_SIZE);
  }
  const ps = PUZZLES.filter((p) => p.theme === theme).sort((a, b) => a.level - b.level);
  const unsolved = ps.filter((p) => !st(p)?.solved);
  const missed = ps.filter((p) => st(p)?.solved && !st(p)?.lastClean);
  const pool = [...unsolved, ...missed];
  return (pool.length ? pool : shuffle(ps)).slice(0, SESSION_SIZE);
}

function renderPuzzle(theme, presetQueue = null) {
  if (theme !== 'mix' && !THEMES[theme]) { location.hash = '#puzzles'; return; }
  const queue = puzzleQueue(theme, presetQueue);
  const results = [];
  let qi = 0;
  let pz, chess, step, mistakes, done, hintLevel;
  const themeName = theme === 'mix' ? 'おまかせ' : THEMES[theme].name;

  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="#puzzles">← テーマ一覧</a>
      <h1>${esc(themeName)}</h1>
    </header>
    <div class="session-bar" aria-hidden="true"></div>
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

  function sessionBar() {
    $('.session-bar').innerHTML = queue.map((_, i) => {
      const r = results[i];
      return `<span class="${r === undefined ? (i === qi ? 'now' : '') : r ? 'ok' : 'miss'}"></span>`;
    }).join('');
  }

  function load() {
    pz = queue[qi];
    chess = new Chess(pz.fen);
    step = 0; mistakes = 0; done = false; hintLevel = 0;
    board.setOrientation(chess.turn());
    board.interactive = true;
    board.locked = false;
    board.setAnnotations({});
    board.setHint(null);
    board.setPosition(chess, { lastMove: pz.last ? { from: pz.last.slice(0, 2), to: pz.last.slice(2, 4) } : null });
    $('.turn').textContent = sideLabel(chess.turn());
    $('.turn').className = 'turn ' + chess.turn();
    $('.pz-title').textContent = pz.title;
    $('.pz-count').textContent = `${qi + 1} / ${queue.length}`;
    const moves = Math.ceil(pz.solution.length / 2);
    const goal = pz.theme === 'mate1' ? '1手で詰ませよう'
      : pz.theme === 'mate2' ? '2手で詰ませよう'
      : pz.theme === 'mate3' ? '3手で詰ませよう'
      : moves > 1 ? `駒得する手順を見つけよう（${moves}手）` : '駒得する一手を見つけよう';
    setTask('', `${sideLabel(chess.turn())}：${goal}`, pz.last ? '相手が指した直後です' : '');
    explainEl.hidden = true;
    $('#hint').hidden = false; $('#answer').hidden = false; $('#nextpz').hidden = true;
    $('#nextpz').textContent = qi === queue.length - 1 ? '結果を見る' : '次の問題';
    sessionBar();
  }

  function setTask(kind, msg, label) {
    if (kind === 'good') sound.play(label === '正解' ? 'done' : 'good');
    else if (kind === 'bad') sound.play('bad');
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
    results[qi] = clean;
    store.puzzleResult(pz.id, clean);
    if (byUser) setTask('good', clean ? '一発正解！' : 'クリア！ 次は一発で解けるように復習しましょう。', '正解');
    else setTask('', '答えを確認しましょう。この問題は後で復習として出題されます。', '答え');
    explainEl.hidden = false;
    explainEl.textContent = pz.explain;
    $('#hint').hidden = true; $('#answer').hidden = true; $('#nextpz').hidden = false;
    sessionBar();
  }

  function summary() {
    clearTimeout(timer);
    const cleanN = results.filter(Boolean).length;
    const missed = queue.filter((_, i) => !results[i]);
    const remaining = theme === 'mix'
      ? PUZZLES.filter((p) => !store.get().puzzles[p.id]?.solved).length
      : PUZZLES.filter((p) => p.theme === theme && !store.get().puzzles[p.id]?.solved).length;
    const msg = cleanN === queue.length ? '全問一発正解！ すばらしい！'
      : cleanN >= queue.length * 0.7 ? 'よくできました。間違えた形を復習すると定着します。'
      : 'まずは間違えた問題をもう一度。くり返すほど形が見えるようになります。';
    view.innerHTML = `
      <header class="page-head compact">
        <a class="back" href="#puzzles">← テーマ一覧</a>
        <h1>${esc(themeName)}・結果</h1>
      </header>
      <section class="result">
        <p class="result-score"><span class="num">${cleanN}</span><span class="of">/ ${queue.length} 問 一発正解</span></p>
        <div class="session-bar big">${queue.map((_, i) => `<span class="${results[i] ? 'ok' : 'miss'}"></span>`).join('')}</div>
        <p class="lesson-text">${msg}</p>
      </section>
      <div class="actions col">
        ${missed.length ? `<button type="button" class="btn" id="retry">間違えた ${missed.length} 問をやり直す</button>` : ''}
        ${remaining ? `<button type="button" class="btn ${missed.length ? 'ghost' : ''}" id="more">次の${Math.min(SESSION_SIZE, remaining)}問に進む（残り${remaining}問）</button>` : ''}
        <a class="btn ghost" href="#puzzles">テーマ一覧に戻る</a>
        <a class="btn ghost" href="#home">ホームに戻る</a>
      </div>
    `;
    $('#retry')?.addEventListener('click', () => renderPuzzle(theme, missed));
    $('#more')?.addEventListener('click', () => renderPuzzle(theme));
    window.scrollTo(0, 0);
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
  $('#nextpz').onclick = () => {
    if (qi >= queue.length - 1) return summary();
    qi++; load(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  cleanup = () => clearTimeout(timer);
  load();
}

// ---------- 定跡 ----------
// 状態：未学習 → 学習済み（最後まで見た）→ 練習中 → 習得（2回連続ノーミス）
function openingStatus(id) {
  const o = store.get().openings?.[id];
  if (!o) return 'new';
  if (o.streak >= 2) return 'mastered';
  if (o.drills > 0) return 'practicing';
  return o.studied ? 'studied' : 'new';
}
const STATUS_LABEL = { new: '未学習', studied: '学習済み', practicing: '練習中', mastered: '習得' };
const LEVEL_LABEL = { 1: '初級', 2: '中級', 3: '上級' };
const findLine = (id) => ALL_LINES.find((l) => l.id === id);
const sideName = (c) => (c === 'w' ? '白' : '黒');

function lineMoves(line) {
  const c = new Chess();
  return line.moves.split(/\s+/).map((san) => c.move(san));
}
function moveLabel(mv, i) {
  const no = Math.floor(i / 2) + 1;
  return i % 2 === 0 ? `${no}.${mv.san}` : `${no}…${mv.san}`;
}

function renderOpenings() {
  const mastered = ALL_LINES.filter((l) => openingStatus(l.id) === 'mastered').length;
  view.innerHTML = `
    <header class="page-head"><h1>定跡</h1><p>${OPENINGS.length}の定跡・${ALL_LINES.length}の変化。「学ぶ」で手順と意味を確認し、「練習」で自分の手を何も見ずに指せるようにしましょう。</p></header>
    <a class="next-item primary wide" href="#op-review">
      <span class="kicker">復習・ランダム</span>
      <span class="next-title">まだ習得していない変化を練習</span>
      <span class="next-sub">${mastered} / ${ALL_LINES.length} 変化を習得（2回連続ノーミスで習得）</span>
    </a>
    ${OPENING_GROUPS.map((g) => `
      <section class="block">
        <h2 class="stage">${esc(g.name)}</h2>
        <ul class="list">
          ${OPENINGS.filter((o) => o.group === g.id).map((o) => {
            const done = o.lines.filter((l) => openingStatus(l.id) === 'mastered').length;
            return `<li><a href="#opening-${o.id}" class="row">
              <span class="row-main">
                <span class="row-title">${esc(o.name)}</span>
                <span class="row-sub">${esc(o.summary)}</span>
                <span class="row-tags"><span class="tag-mini">${LEVEL_LABEL[o.level]}</span><span class="tag-mini">${sideName(o.side)}番</span><span class="tag-mini">${o.lines.length}変化</span></span>
              </span>
              <span class="chip ${done === o.lines.length ? 'ok' : ''}">${done}/${o.lines.length}</span>
            </a></li>`;
          }).join('')}
        </ul>
      </section>`).join('')}
  `;
}

function renderOpeningFamily(id) {
  const fam = OPENINGS.find((o) => o.id === id);
  if (!fam) { location.hash = '#openings'; return; }
  const first = fam.lines[0];
  const preview = new Chess();
  const mvs = first.moves.split(/\s+/);
  // 定跡の名前がつく局面（最初の3〜6手）を見せる
  const showN = Math.min(mvs.length, fam.group === 'traps' ? 4 : 6);
  let last = null;
  for (const san of mvs.slice(0, showN)) last = preview.move(san);
  const groupName = OPENING_GROUPS.find((g) => g.id === fam.group).name;
  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="#openings">← 定跡一覧</a>
      <h1>${esc(fam.name)}</h1>
      <p class="en">${esc(fam.en)} · ${esc(fam.eco)} · ${esc(groupName)}</p>
    </header>
    <div class="board-wrap small"><div id="fam-board"></div></div>
    <p class="lesson-text">${esc(fam.summary)}</p>
    <section class="block">
      <h2>変化</h2>
      <ul class="list lines">
        ${fam.lines.map((l) => {
          const st = openingStatus(l.id);
          const n = l.moves.split(/\s+/).length;
          return `<li class="line-row">
            <div class="row-main">
              <span class="row-title">${esc(l.name)}${l.trap ? ' <span class="chip warn">罠</span>' : ''}</span>
              <span class="row-sub mono">${esc(lineMoves(l).slice(0, 8).map(moveLabel).join(' '))}${n > 8 ? ' …' : ''}</span>
            </div>
            <div class="line-actions">
              <span class="chip ${st === 'mastered' ? 'ok' : ''}">${STATUS_LABEL[st]}</span>
              <a class="btn small ghost" href="#op-learn-${l.id}">学ぶ</a>
              <a class="btn small" href="#op-drill-${l.id}">練習</a>
            </div>
          </li>`;
        }).join('')}
      </ul>
    </section>
  `;
  const board = new Board($('#fam-board'), { orientation: fam.side, interactive: false });
  board.setPosition(preview, { lastMove: last ? { from: last.from, to: last.to } : null });
}

function renderOpeningLearn(lineId) {
  const line = findLine(lineId);
  if (!line) { location.hash = '#openings'; return; }
  const fam = line.family;
  const mvs = lineMoves(line);
  const fens = [new Chess().fen()];
  { const c = new Chess(); for (const m of mvs) { c.move(m.san); fens.push(c.fen()); } }
  let p = 0;

  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="#opening-${fam.id}">← ${esc(fam.name)}</a>
      <h1>${esc(line.name)}</h1>
    </header>
    <div class="puzzle-meta"><span class="turn ${fam.side}">${sideName(fam.side)}番で学ぶ</span><span class="pz-title">学ぶ</span><span class="pz-count" id="ply"></span></div>
    <div class="board-wrap"><div id="learn-board"></div></div>
    <div class="panel">
      <div class="task" id="note"></div>
      <ol class="moves-chips" id="chips"></ol>
      <div class="actions nav">
        <button type="button" class="btn ghost" id="first" aria-label="最初へ">⏮</button>
        <button type="button" class="btn ghost" id="back" aria-label="1手戻る">◀</button>
        <button type="button" class="btn" id="fwd" aria-label="1手進む">▶ 次の手</button>
        <button type="button" class="btn ghost" id="last" aria-label="最後へ">⏭</button>
      </div>
      <a class="btn" id="to-drill" href="#op-drill-${line.id}" hidden>この変化を練習する</a>
    </div>
  `;
  const board = new Board($('#learn-board'), { orientation: fam.side, interactive: false });
  $('#chips').innerHTML = mvs.map((m, i) => `<li><button type="button" data-p="${i + 1}" class="${(i % 2 === 0 ? 'w' : 'b') === fam.side ? 'mine' : ''}">${esc(moveLabel(m, i))}</button></li>`).join('');
  $('#chips').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { p = Number(b.dataset.p); show(); } };

  function show() {
    const c = new Chess(fens[p]);
    const last = p > 0 ? mvs[p - 1] : null;
    const next = mvs[p];
    board.setAnnotations({ arrows: next ? [next.from + next.to] : [], marks: [] });
    board.setPosition(c, { lastMove: last ? { from: last.from, to: last.to } : null });
    $('#ply').textContent = `${p} / ${mvs.length}`;
    const noteEl = $('#note');
    if (p === 0) {
      noteEl.className = 'task';
      noteEl.innerHTML = `<span class="task-label">はじめに</span><span class="task-msg">${esc(fam.summary)} 矢印は次の手です。「次の手」で1手ずつ進めましょう。</span>`;
    } else {
      const note = line.notes?.[p - 1];
      const mine = (((p - 1) % 2 === 0) ? 'w' : 'b') === fam.side;
      noteEl.className = 'task' + (mine ? '' : ' opp');
      noteEl.innerHTML = `<span class="task-label">${esc(moveLabel(last, p - 1))}・${mine ? 'あなたの手' : '相手の手'}</span><span class="task-msg">${esc(note || (mine ? '定跡どおりの自然な手です。' : '相手の定跡手です。'))}</span>`;
    }
    view.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('now', Number(b.dataset.p) === p));
    view.querySelector(`#chips [data-p="${p}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#first').disabled = $('#back').disabled = p === 0;
    $('#fwd').disabled = $('#last').disabled = p === mvs.length;
    const end = p === mvs.length;
    $('#to-drill').hidden = !end;
    if (end) store.openingStudied(line.id);
  }
  $('#first').onclick = () => { p = 0; show(); };
  $('#back').onclick = () => { if (p > 0) { p--; show(); } };
  $('#fwd').onclick = () => { if (p < mvs.length) { p++; show(); } };
  $('#last').onclick = () => { p = mvs.length; show(); };
  show();
}

function pickReviewLine(excludeId) {
  const pool = ALL_LINES.filter((l) => l.id !== excludeId);
  const weight = (l) => ({ practicing: 4, studied: 4, new: 2, mastered: 1 })[openingStatus(l.id)];
  const total = pool.reduce((a, l) => a + weight(l), 0);
  let r = Math.random() * total;
  for (const l of pool) { r -= weight(l); if (r <= 0) return l; }
  return pool[0];
}

function renderOpeningDrill(lineId, forcedSide) {
  const review = !lineId;
  const line = review ? pickReviewLine(null) : findLine(lineId);
  if (!line) { location.hash = '#openings'; return; }
  startDrill(line, forcedSide || line.family.side, review);
}

function startDrill(line, side, review) {
  const fam = line.family;
  if (!side) side = fam.side;
  const mvs = lineMoves(line);
  const chess = new Chess();
  let idx = 0, mistakes = 0, wrongHere = 0, timer = null, done = false;

  view.innerHTML = `
    <header class="page-head compact">
      <a class="back" href="${review ? '#openings' : '#opening-' + fam.id}">← ${review ? '定跡一覧' : esc(fam.name)}</a>
      <h1>${review ? '復習：' : ''}${esc(fam.name)}</h1>
      <p class="en">${esc(line.name)}</p>
    </header>
    <div class="puzzle-meta">
      <span class="turn ${side}">${sideName(side)}で練習</span>
      <span class="pz-title">練習</span>
      <div class="seg mini" id="sides" role="group" aria-label="練習する色">
        <button type="button" data-side="w" aria-pressed="${side === 'w'}">白</button>
        <button type="button" data-side="b" aria-pressed="${side === 'b'}">黒</button>
      </div>
    </div>
    <div class="steps" id="drill-steps"></div>
    <div class="board-wrap"><div id="drill-board"></div></div>
    <div class="panel">
      <div class="task" id="dmsg"></div>
      <p class="lesson-text explain" id="dnote" hidden></p>
      <div class="actions" id="dactions">
        <button type="button" class="btn ghost" id="dhint">ヒント</button>
        <a class="btn ghost" href="#op-learn-${line.id}">学ぶに戻る</a>
      </div>
    </div>
  `;
  const board = new Board($('#drill-board'), { orientation: side, onMove: onUserMove });
  const msg = (kind, text, label) => {
    const el = $('#dmsg');
    if (kind === 'good') sound.play(label === '完了' || label === '勝ち' ? 'done' : 'good');
    else if (kind === 'bad') sound.play('bad');
    el.className = 'task ' + kind;
    el.innerHTML = `${label ? `<span class="task-label">${esc(label)}</span>` : ''}<span class="task-msg">${esc(text)}</span>`;
  };
  const steps = () => {
    const mine = mvs.map((_, i) => i).filter((i) => (i % 2 === 0 ? 'w' : 'b') === side);
    $('#drill-steps').innerHTML = mine.map((i) => `<span class="${i < idx ? 'past' : i === idx ? 'now' : ''}"></span>`).join('');
  };
  view.querySelector('#sides').onclick = (e) => {
    const b = e.target.closest('[data-side]');
    if (b && b.dataset.side !== side) { clearTimeout(timer); startDrill(line, b.dataset.side, review); }
  };

  const isMine = (i) => (i % 2 === 0 ? 'w' : 'b') === side;
  function advance() {
    steps();
    if (idx >= mvs.length) return finish();
    if (isMine(idx)) {
      board.locked = false;
      wrongHere = 0;
      if (idx === 0 || !isMine(idx - 1)) {
        const prev = idx > 0 ? mvs[idx - 1] : null;
        const note = prev ? line.notes?.[idx - 1] : null;
        msg('', prev ? `相手は ${moveLabel(prev, idx - 1)}。${note ? note + ' ' : ''}定跡の次の手は？` : '最初の一手を指しましょう。', 'あなたの番');
      }
      return;
    }
    board.locked = true;
    timer = setTimeout(() => {
      const m = mvs[idx];
      chess.move(m.san);
      board.setAnnotations({});
      board.setPosition(chess, { lastMove: { from: m.from, to: m.to } });
      idx++;
      advance();
    }, idx === 0 ? 300 : 550);
  }

  function onUserMove(uci) {
    if (done || !isMine(idx)) return;
    const exp = mvs[idx];
    const expUci = exp.from + exp.to + (exp.promotion || '');
    if (uci === expUci || (uci.slice(0, 4) === expUci.slice(0, 4) && !exp.promotion)) {
      chess.move(exp.san);
      board.setAnnotations({});
      board.setHint(null);
      board.setPosition(chess, { lastMove: { from: exp.from, to: exp.to } });
      const note = line.notes?.[idx];
      msg('good', '定跡どおりです。', `${moveLabel(exp, idx)}　正解`);
      const dn = $('#dnote');
      dn.hidden = !note;
      if (note) dn.textContent = `${moveLabel(exp, idx)}：${note}`;
      idx++;
      advance();
      return;
    }
    mistakes++; wrongHere++;
    board.flash(uci.slice(2, 4));
    board.render();
    if (wrongHere >= 2) {
      board.setAnnotations({ arrows: [exp.from + exp.to], marks: [] });
      msg('bad', `定跡は ${exp.san} です。矢印のとおりに指しましょう。${line.notes?.[idx] ? '理由：' + line.notes[idx] : ''}`, 'ちがいます');
    } else {
      msg('bad', 'この定跡の手ではありません。もう一度考えてみましょう。', 'ちがいます');
    }
  }

  $('#dhint').onclick = () => {
    if (done || !isMine(idx)) return;
    mistakes++;
    const exp = mvs[idx];
    board.setHint(exp.from);
    msg('', `光っている駒を動かします（${{ p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' }[exp.piece]}）。`, 'ヒント');
  };

  function finish() {
    done = true;
    board.locked = true;
    store.openingDrill(line.id, mistakes);
    const st = openingStatus(line.id);
    const nextInFam = fam.lines[fam.lines.indexOf(line) + 1];
    msg(mistakes === 0 ? 'good' : '', mistakes === 0
      ? (st === 'mastered' ? 'ノーミス！ この変化を「習得」しました。' : 'ノーミス！ もう1回ノーミスで「習得」です。')
      : `最後まで指せました。ミス・ヒント ${mistakes} 回。ノーミスを目指してもう一度！`, mistakes === 0 ? '完了' : '完了');
    $('#dactions').className = 'actions col';
    $('#dactions').innerHTML = `
      <button type="button" class="btn" id="again">${review ? '次の変化を復習する' : 'もう一度練習する'}</button>
      ${!review && nextInFam ? `<a class="btn ghost" href="#op-learn-${nextInFam.id}">次の変化を学ぶ：${esc(nextInFam.name)}</a>` : ''}
      ${review ? `<button type="button" class="btn ghost" id="same">同じ変化をもう一度</button>` : ''}
      <a class="btn ghost" href="#opening-${fam.id}">${esc(fam.name)}に戻る</a>
      <a class="btn ghost" href="#openings">定跡一覧に戻る</a>`;
    $('#again').onclick = () => (review ? startDrill(pickReviewLine(line.id), null, true) : startDrill(line, side, false));
    $('#same')?.addEventListener('click', () => startDrill(line, side, true));
  }

  board.setOrientation(side);
  board.setPosition(chess);
  cleanup = () => clearTimeout(timer);
  advance();
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
    if (kind === 'good') sound.play(label === '完了' || label === '勝ち' ? 'done' : 'good');
    else if (kind === 'bad') sound.play('bad');
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
      <h2>定跡</h2>
      <table class="tbl">
        <thead><tr><th>分類</th><th>学習</th><th>習得</th></tr></thead>
        <tbody>
          ${OPENING_GROUPS.map((g) => {
            const ls = ALL_LINES.filter((l) => l.family.group === g.id);
            const studied = ls.filter((l) => openingStatus(l.id) !== 'new').length;
            const m = ls.filter((l) => openingStatus(l.id) === 'mastered').length;
            return `<tr><td>${esc(g.name)}</td><td>${studied}/${ls.length}</td><td>${m}/${ls.length}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>
    <section class="block">
      <h2>テーマ別の正解率</h2>
      <table class="tbl">
        <thead><tr><th>テーマ</th><th>クリア</th><th>一発正解</th></tr></thead>
        <tbody>
          ${Object.entries(THEMES).filter(([k]) => PUZZLES.some((p) => p.theme === k)).map(([k, t]) => {
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
function initSoundButtons() {
  const bgmBtn = document.getElementById('bgm-btn');
  const sfxBtn = document.getElementById('sfx-btn');
  if (!bgmBtn || !sfxBtn) return;
  const sync = () => {
    bgmBtn.setAttribute('aria-pressed', String(sound.bgm));
    sfxBtn.setAttribute('aria-pressed', String(sound.sfx));
  };
  bgmBtn.onclick = () => sound.setBgm(!sound.bgm);
  sfxBtn.onclick = () => sound.setSfx(!sound.sfx);
  sound.onChange(sync);
  sync();
  sound.armAutoResume();
}
initSoundButtons();
route();

// iPhoneアプリ（Capacitor）ではファイルがアプリに入っているので、サービスワーカーは不要
if (window.Capacitor) document.documentElement.classList.add('native');
if ('serviceWorker' in navigator && !window.__NO_SW__ && !window.Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 対応していない環境では無視 */ });
  });
}

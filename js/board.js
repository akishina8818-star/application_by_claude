// タップ操作のチェス盤
// new Board(el, { orientation, canMove(color), onMove(uci) })
//   onMove は true を返すと盤面を更新、false なら元に戻す。
import { PIECES } from './pieces.js';

const FILES = 'abcdefgh';

export class Board {
  constructor(el, opts = {}) {
    this.el = el;
    this.orientation = opts.orientation || 'w';
    this.onMove = opts.onMove || null;
    this.interactive = opts.interactive !== false;
    this.chess = null;
    this.selected = null;
    this.lastMove = null;
    this.arrows = [];
    this.marks = [];
    this.hintSquare = null;
    this.locked = false;
    this.el.classList.add('board');
    this.el.setAttribute('role', 'grid');
    this.el.innerHTML = '<div class="board-squares"></div><svg class="board-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div class="promo" hidden></div>';
    this.sqWrap = this.el.querySelector('.board-squares');
    this.svg = this.el.querySelector('.board-arrows');
    this.promoEl = this.el.querySelector('.promo');
    this.sqWrap.addEventListener('click', (e) => {
      const sqEl = e.target.closest('[data-sq]');
      if (sqEl) this.tap(sqEl.dataset.sq);
    });
  }

  setPosition(chess, { lastMove = null } = {}) {
    this.chess = chess;
    this.lastMove = lastMove;
    this.selected = null;
    this.render();
  }

  setOrientation(o) { this.orientation = o; this.render(); }
  setAnnotations({ arrows = [], marks = [] } = {}) { this.arrows = arrows; this.marks = marks; this.render(); }
  setHint(sq) { this.hintSquare = sq; this.render(); }

  squares() {
    const ranks = this.orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = this.orientation === 'w' ? FILES.split('') : FILES.split('').reverse();
    const out = [];
    for (const r of ranks) for (const f of files) out.push(f + r);
    return out;
  }

  render() {
    if (!this.chess) return;
    const targets = new Set();
    if (this.selected) for (const m of this.chess.moves({ square: this.selected, verbose: true })) targets.add(m.to);
    const checkSq = this.chess.inCheck() ? this.findKing(this.chess.turn()) : null;
    const sqs = this.squares();
    let html = '';
    sqs.forEach((sq, i) => {
      const fi = FILES.indexOf(sq[0]);
      const ri = Number(sq[1]);
      const dark = (fi + ri) % 2 === 0;
      const p = this.chess.get(sq);
      const cls = ['sq', dark ? 'dark' : 'light'];
      if (this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq)) cls.push('last');
      if (this.selected === sq) cls.push('sel');
      if (targets.has(sq)) cls.push(p ? 'target-cap' : 'target');
      if (this.marks.includes(sq)) cls.push('mark');
      if (checkSq === sq) cls.push('check');
      if (this.hintSquare === sq) cls.push('hint');
      const col = i % 8, row = Math.floor(i / 8);
      let coord = '';
      if (col === 0) coord += `<span class="coord rank">${ri}</span>`;
      if (row === 7) coord += `<span class="coord file">${sq[0]}</span>`;
      const label = p ? `${sq} ${pieceName(p)}` : sq;
      const piece = p ? `<img class="piece" alt="" draggable="false" src="${PIECES[p.color + p.type]}">` : '';
      html += `<div class="${cls.join(' ')}" data-sq="${sq}" role="gridcell" aria-label="${label}">${coord}${piece}</div>`;
    });
    this.sqWrap.innerHTML = html;
    this.drawArrows();
  }

  findKing(color) {
    for (const row of this.chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
    return null;
  }

  center(sq) {
    let f = FILES.indexOf(sq[0]);
    let r = 8 - Number(sq[1]);
    if (this.orientation === 'b') { f = 7 - f; r = 7 - r; }
    return [f * 100 + 50, r * 100 + 50];
  }

  drawArrows() {
    let s = '<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrow-head"/></marker></defs>';
    for (const a of this.arrows) {
      const [x1, y1] = this.center(a.slice(0, 2));
      const [x2, y2] = this.center(a.slice(2, 4));
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ex = x2 - ((x2 - x1) / len) * 28;
      const ey = y2 - ((y2 - y1) / len) * 28;
      s += `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" class="arrow" marker-end="url(#ah)"/>`;
    }
    this.svg.innerHTML = s;
  }

  tap(sq) {
    if (!this.interactive || this.locked || !this.chess || !this.onMove) return;
    const p = this.chess.get(sq);
    const turn = this.chess.turn();
    if (this.selected) {
      if (sq === this.selected) { this.selected = null; this.render(); return; }
      const moves = this.chess.moves({ square: this.selected, verbose: true }).filter((m) => m.to === sq);
      if (moves.length) {
        const from = this.selected;
        this.selected = null;
        if (moves.some((m) => m.promotion)) this.askPromotion(turn, (pr) => this.commit(from + sq + pr));
        else this.commit(from + sq);
        return;
      }
      if (p && p.color === turn) { this.selected = sq; this.render(); return; }
      this.selected = null; this.render(); return;
    }
    if (p && p.color === turn) { this.selected = sq; this.hintSquare = null; this.render(); }
  }

  commit(uci) {
    this.render();
    this.onMove(uci);
  }

  askPromotion(color, cb) {
    this.promoEl.innerHTML = ['q', 'r', 'b', 'n']
      .map((t) => `<button type="button" data-p="${t}" aria-label="${pieceName({ type: t })}に成る"><img alt="" src="${PIECES[color + t]}"></button>`)
      .join('');
    this.promoEl.hidden = false;
    const handler = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      this.promoEl.hidden = true;
      this.promoEl.removeEventListener('click', handler);
      cb(b.dataset.p);
    };
    this.promoEl.addEventListener('click', handler);
  }

  flash(sq, cls = 'bad') {
    const el = this.sqWrap.querySelector(`[data-sq="${sq}"]`);
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 600);
  }
}

export function pieceName(p) {
  return { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' }[p.type];
}

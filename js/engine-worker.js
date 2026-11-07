// エンジンを別スレッドで動かし、画面が固まらないようにする
import { chooseMove, bestMove } from './engine.js';

self.onmessage = (e) => {
  const { id, type, fen, level } = e.data;
  try {
    const move = type === 'hint' ? bestMove(fen, 3) : chooseMove(fen, level);
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

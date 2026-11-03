// オフラインでも使えるように、アプリのファイルを端末に保存する
// ファイルを更新したら VERSION を上げること
const VERSION = 'v3';
const CACHE = `chess-step-up-${VERSION}`;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/board.js',
  './js/engine.js',
  './js/engine-worker.js',
  './js/pieces.js',
  './js/store.js',
  './js/data/lessons.js',
  './js/data/puzzles.js',
  './js/data/puzzles-gen.js',
  './js/data/openings.js',
  './vendor/chess.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chess-step-up-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // フォントなど外部のファイル：ネット優先、だめならキャッシュ
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  // アプリ本体：キャッシュ優先（オフライン対応）
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});

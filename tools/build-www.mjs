// iOSアプリ用に、Webアプリのファイルを www/ に集める（npm run build）
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'www';
const ITEMS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'vendor', 'icons'];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const item of ITEMS) fs.cpSync(item, path.join(OUT, item), { recursive: true });
console.log('www/ を作成しました:', ITEMS.join(', '));

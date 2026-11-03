# チェス ステップアップ

チェスの**初級から中級**へレベルアップするための学習アプリ（PWA）です。
iPhone の Safari で開いて「ホーム画面に追加」すると、アプリのように全画面・オフラインで使えます。

## できること

| 画面 | 内容 |
|---|---|
| レッスン | 駒の価値、オープニングの3原則、考える手順、フォーク、ピンとスキュア、ディスカバード、メイトパターン、ポーンエンドゲーム、計画の立て方（全9本）。説明を読み、実際に盤で指す課題つき |
| 定跡 | 29の定跡・44の変化（1.e4/1.d4の白番、黒の応手、序盤の落とし穴）。「学ぶ」で1手ずつ矢印と解説つきで確認、「練習」で自分の手を記憶で指す（白黒切替可）。2回連続ノーミスで「習得」。ランダム復習あり |
| パズル | 11テーマ・256問（1〜3手メイト、浮き駒、フォーク、ピン、スキュア、ディスカバード、守り駒の除去、エンドゲーム、総合）。1セット10問で、最後に結果画面。ヒント2段階、答え表示、解説つき。「おまかせ」で間違えた・未クリアの問題を復習 |
| 対局 | コンピュータと4段階（入門・初級・中級入口・中級）で対局。待った・ヒント（おすすめ手を矢印表示）。Q+K対K、R+K対K、ポーンエンドの練習も |
| 記録 | レッスン修了数、テーマ別の一発正解率（苦手テーマに「要復習」表示）、レベル別の対局成績 |

記録は端末内（localStorage）に保存されます。

## iPhone で使う

1. 公開URL（GitHub Pages など）を Safari で開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンから起動（一度開けばオフラインでも動きます）

### GitHub Pages で公開する手順

1. このブランチを `main` にマージする
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
3. `main` に push すると `.github/workflows/pages.yml` が自動で公開します（URL は Actions の実行結果に表示）

※ 無料プランで Pages を使うにはリポジトリが public である必要があります。

## 構成

ビルド不要の素の HTML / CSS / JavaScript（ES Modules）です。

```
index.html              画面の骨組み
css/app.css             デザイン（ライト/ダーク対応）
js/app.js               画面の切り替えと各画面
js/board.js             タップ操作のチェス盤
js/engine.js            練習対局用のエンジン（アルファベータ探索）
js/engine-worker.js     エンジンを別スレッドで動かす
js/data/lessons.js      レッスンの内容
js/data/puzzles.js      パズルの内容
js/data/openings.js     定跡の内容
vendor/chess.js         ルール判定ライブラリ chess.js 1.0.0（BSD-2）
sw.js                   オフライン用サービスワーカー
tools/                  開発用の検証スクリプト
```

ローカルで確認: `python3 -m http.server` を実行して http://localhost:8000 を開く。

## コンテンツの追加と検証

### パズルの自動生成

Stockfish に「ミスを含む対局」を指させ、ミスの直後に**ただ一つの勝ち手**がある局面を集めています。

```
sudo apt-get install stockfish                       # /usr/games/stockfish
node tools/generate-puzzles.mjs out.js 3000          # out.js.progress.json に集まる（中断・再開可）
node tools/finalize-puzzles.mjs tools/generated/*.json out.js.progress.json   # js/data/puzzles-gen.js を作る
node tools/validate-puzzles.mjs                      # 全問を再検証
```
別解が見つかった局面は `tools/puzzle-exclude.json` に入れると除外されます。

### 手作りパズル

- パズルは `js/data/puzzles.js` に追加します。手順は UCI 形式（例: `e2e4`）で、プレイヤーの手と相手の応手を交互に書きます。
- `tools/validate-puzzles.mjs` は Stockfish を使って、正解手が最善か・別解がないかを確認します。
  既定では `/usr/games/stockfish` を使います（`STOCKFISH=` で変更可）。
- `node tools/validate-openings.mjs` で定跡の手順の合法性と、学ぶ側の手が悪手でないかを Stockfish で確認できます（あえて教える悪手は `dubious` に指定）。
- `node tools/validate-lessons.mjs` でレッスンの局面と課題の合法性を確認できます。
- ファイルを更新したら `sw.js` の `VERSION` を上げてください（端末のキャッシュが更新されます）。

## クレジット

- 駒の画像: Colin M.L. Burnett（cburnett セット、BSD / GPL / GFDL）
- ルール判定: [chess.js](https://github.com/jhlywa/chess.js)（BSD-2-Clause）

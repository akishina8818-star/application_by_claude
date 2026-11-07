# iPhone へのインストール手順（無料・7日間）

このアプリは GitHub の Mac で自動的にビルドされ、署名なしのアプリファイル（`.ipa`）ができます。
それを **パソコン（Windows か Mac）** を使って、自分の Apple ID で署名してインストールします。

> 無料の Apple ID で入れたアプリは **7日間** で起動できなくなります。もう一度同じ手順で入れ直せば、また7日間使えます（記録はそのまま残ります）。

---

## 1. アプリファイル（.ipa）をダウンロードする

1. パソコンのブラウザで GitHub にログインする
2. リポジトリ `akishina8818-star/application_by_claude` の **Actions** タブを開く
3. 左の一覧から **Build iOS app (unsigned IPA)** を選び、いちばん上の緑のチェックが付いた実行を開く
4. ページ下の **Artifacts** にある **ChessStepUp-ipa** をクリックしてダウンロード
5. ダウンロードした zip を展開すると `ChessStepUp-unsigned.ipa` が出てくる

## 2. Sideloadly でインストールする（Windows / Mac どちらでも）

1. https://sideloadly.io から Sideloadly をダウンロードしてインストール
   - **Windows の場合**：Apple 公式サイト版の **iTunes** と **iCloud** も必要です（Microsoft Store 版ではないもの。Sideloadly のサイトにリンクがあります）
2. iPhone を USB ケーブルでパソコンにつなぐ
   - iPhone に「このコンピュータを信頼しますか？」と出たら **信頼** を選ぶ
3. Sideloadly を起動し、`ChessStepUp-unsigned.ipa` を左のアイコン部分にドラッグ
4. **Apple account** 欄に自分の Apple ID（メールアドレス）を入力して **Start**
5. Apple ID のパスワード（2ファクタ認証のコード）を聞かれたら入力
6. 「Done」と出たら完了。iPhone のホーム画面に「チェス」が出ます

## 3. iPhone 側の設定（初回のみ）

1. **デベロッパモードをオンにする**（iOS 16 以降）
   設定 → プライバシーとセキュリティ → いちばん下の **デベロッパモード** → オン → 再起動 → 「オンにする」
2. **自分の Apple ID を信頼する**
   設定 → 一般 → **VPNとデバイス管理** → 自分の Apple ID → **信頼**
3. ホーム画面の「チェス」をタップして起動

## 7日たったら

同じ手順 2 をもう一度行うだけで、さらに7日間使えます。アプリの記録（パズルの成績など）は消えません。
Sideloadly の「Automatic refresh」を設定すると、パソコンと iPhone が同じ Wi-Fi にあるときに自動で更新できます。

---

## （参考）Mac と Xcode を使う場合

1. このリポジトリを Mac にダウンロードし、ターミナルで `npm ci` → `npm run ios:sync`
2. `ios/App/App.xcodeproj` を Xcode で開く
3. 左の **App** → **Signing & Capabilities** → **Team** で自分の Apple ID（Personal Team）を選ぶ
   - 「Bundle Identifier が使えない」と出たら、`io.github.akishina8818.chessstepup` の末尾を少し変える
4. 上部の実行先に自分の iPhone を選んで ▶（Run）

## よくあるトラブル

| 症状 | 対処 |
|---|---|
| 「信頼されていないデベロッパ」と出て開けない | 手順 3-2 で自分の Apple ID を信頼する |
| アイコンをタップしてもすぐ閉じる | 手順 3-1 のデベロッパモードがオンか確認。7日過ぎていたら入れ直す |
| Sideloadly でエラー（App ID 上限） | 無料 Apple ID は1週間に作れるアプリIDの数に制限があります。少し時間をおいて再挑戦 |
| 音が出ない | iPhone のマナーモードを解除し、アプリ右上の BGM・効果音ボタンを確認 |

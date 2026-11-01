// パズルデータ
// solution: UCI形式の手順。偶数番目（0,2,4…）がプレイヤーの手、奇数番目が相手の応手。
// alts: { 手順の番号: [正解として認める別の手] }
// すべての局面は tools/validate-puzzles.mjs でエンジン検証済み。

export const THEMES = {
  mate1:      { name: '1手メイト',       desc: '一手でチェックメイトを決める' },
  mate2:      { name: '2手メイト',       desc: 'チェックや犠牲で2手で詰ませる' },
  mate3:      { name: '3手メイト',       desc: 'チェックを続けて追い込む' },
  hanging:    { name: '浮き駒を取る',     desc: '守られていない駒を見逃さない' },
  fork:       { name: 'フォーク',         desc: '1つの駒で2つ以上を同時に狙う' },
  pin:        { name: 'ピン',             desc: '動けない駒をつくって狙う' },
  skewer:     { name: 'スキュア（串刺し）', desc: '前の大駒をどかして後ろを取る' },
  discovered: { name: 'ディスカバード',   desc: '駒をどけて隠れた攻撃を出す' },
  defender:   { name: '守り駒の除去',     desc: '守っている駒を消してから攻める' },
  endgame:    { name: 'エンドゲーム',     desc: '少ない駒で勝ち切る技術' },
  tactic:     { name: '総合問題',         desc: 'いろいろな戦術の実戦問題' },
};

export const PUZZLES = [
  // ---------- 1手メイト ----------
  {
    id: 'm1-backrank', theme: 'mate1', level: 1,
    title: 'がら空きの最下段',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['a1a8'],
    hint: '黒キングの前にある3つのポーンが、逆にキングの逃げ道をふさいでいます。',
    explain: 'Ra8#。黒キングは自分のポーンが邪魔で前に逃げられません。これが「バックランクメイト」です。自分のキングにも逃げ道（ルフト）を作っておく大切さがわかります。',
  },
  {
    id: 'm1-scholar', theme: 'mate1', level: 1,
    title: 'f7の弱点',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    solution: ['h5f7'],
    hint: 'f7のマスはキングしか守っていません。そこを2つの駒で狙っています。',
    explain: 'Qxf7#（スカラーズメイト）。f7はキングだけが守る弱点で、クイーンをビショップc4が支えているのでキングは取り返せません。黒は3手目に …g6 や …Qe7 で守るべきでした。',
  },
  {
    id: 'm1-smothered', theme: 'mate1', level: 2,
    title: '窒息メイト',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    solution: ['g5f7'],
    hint: '黒キングのまわりは自分の駒で埋まっています。ナイトはそれを飛び越えられます。',
    explain: 'Nf7#（スマザードメイト）。キングのまわりが味方の駒でふさがれていて、ナイトのチェックはさえぎれません。',
  },
  {
    id: 'm1-fool', theme: 'mate1', level: 1,
    title: '最短のメイト',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    solution: ['d8h4'],
    hint: '白はキングの前のfポーンとgポーンを両方動かしてしまいました。e1–h4の斜めを見てください。',
    explain: 'Qh4#（フールズメイト）。キングの前のポーンを不用意に動かすと、斜めの筋が開いてしまいます。',
  },
  {
    id: 'm1-g7', theme: 'mate1', level: 1,
    title: 'g7へのキス',
    fen: '5rk1/5p1p/5BpQ/8/8/8/5PPP/6K1 w - - 0 1',
    solution: ['h6g7'],
    hint: 'クイーンがキングの隣に入っても、ビショップが支えていれば取られません。',
    explain: 'Qg7#。ビショップf6がクイーンを守っているので、キングはクイーンを取れません。キングの真横にクイーンを付ける形は「キス・オブ・デス」と呼ばれます。',
  },
  {
    id: 'm1-kq', theme: 'mate1', level: 1,
    title: 'キングとクイーンの連携',
    fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1',
    solution: ['h2h8'],
    hint: 'a7とb7は白キングが押さえています。残るのは8段目です。',
    explain: 'Qh8#。白キングがa7・b7を押さえ、クイーンが8段目全体を支配します。端に追い詰めたキングは、キングとクイーンの連携で詰ませます。',
  },
  {
    id: 'm1-kr', theme: 'mate1', level: 1,
    title: 'ルークで端を閉じる',
    fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    solution: ['a1a8'],
    hint: '白キングがg7とh7を押さえています。',
    explain: 'Ra8#。キングどうしが向かい合い（オポジション）、ルークが最後の段を閉じる基本形です。',
  },
  {
    id: 'm1-black-backrank', theme: 'mate1', level: 1,
    title: '黒番：逆襲のバックランク',
    fen: '6k1/5ppp/8/8/3N4/8/r4PPP/6K1 b - - 0 1',
    solution: ['a2a1'],
    hint: '白のナイトは1段目を守れません。',
    explain: '…Ra1#。白キングもポーンで閉じこめられています。ナイトは1段目に戻ってさえぎることができません。',
  },

  // ---------- 2手メイト ----------
  {
    id: 'm2-philidor', theme: 'mate2', level: 3,
    title: 'クイーン捨てからの窒息',
    fen: '4r2k/6pp/7N/8/2Q5/8/6PP/6K1 w - - 0 1',
    solution: ['c4g8', 'e8g8', 'h6f7'],
    hint: 'g8に駒を呼び込めば、キングは完全に閉じこめられます。',
    explain: '1.Qg8+! Rxg8（ナイトがg8を守っているのでキングでは取れない）2.Nf7#。クイーンを捨ててルークをg8に呼び込み、窒息メイトの形を作りました。',
  },
  {
    id: 'm2-deflect', theme: 'mate2', level: 2,
    title: 'ルークを引きはがす',
    fen: '2r3k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1',
    solution: ['d2d8', 'c8d8', 'd1d8'],
    hint: '最下段を守っているのは黒ルーク1つだけです。そのルークに仕事を増やしましょう。',
    explain: '1.Qd8+! Rxd8 2.Rxd8#。クイーンを捨てて、最下段を守るルークをどかしました（ディフレクション）。',
  },
  {
    id: 'm2-black-smother', theme: 'mate2', level: 3,
    title: '黒番：g1への呼び込み',
    fen: '6k1/8/8/2q5/8/7n/6PP/4R2K b - - 0 1',
    solution: ['c5g1', 'e1g1', 'h3f2'],
    hint: 'ナイトがg1を守っています。白ルークをg1に呼び込むと…？',
    explain: '1…Qg1+! 2.Rxg1 Nf2#。前の「クイーン捨てからの窒息」と同じ形を黒番で。パターンは盤のどこでも、どちらの色でも使えます。',
  },

  // ---------- フォーク ----------
  {
    id: 'fork-royal', theme: 'fork', level: 1,
    title: 'ナイトの両取り',
    fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    solution: ['d5c7', 'e8d7', 'c7a8'],
    alts: { 1: ['e8d8', 'e8e7', 'e8f8'] },
    hint: 'チェックしながら、もう1つの駒も狙えるマスがあります。',
    explain: '1.Nxc7+! キングとa8のルークを同時に攻撃（フォーク）。キングが逃げたあと 2.Nxa8 でルークを取ります。チェック付きのフォークは相手に選択肢を与えません。',
  },
  {
    id: 'fork-queen', theme: 'fork', level: 1,
    title: 'クイーンの十字砲火',
    fen: 'r5k1/p5pp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
    solution: ['d1d5', 'g8h8', 'd5a8'],
    alts: { 1: ['g8f8'] },
    hint: '中央のマスから、キングとa8のルークの両方を同時に狙えます。',
    explain: '1.Qd5+! 斜めでキング、反対の斜めでa8ルークを攻撃。2.Qxa8+ でルークを取ります。守られていない駒（浮き駒）はフォークの標的です。',
  },
  {
    id: 'fork-knight-q', theme: 'fork', level: 2,
    title: 'f6からの一撃',
    fen: '6k1/3q1p1p/6p1/8/4N3/8/5PPP/6K1 w - - 0 1',
    solution: ['e4f6', 'g8g7', 'f6d7'],
    alts: { 1: ['g8f8', 'g8h8'] },
    hint: 'ナイトがチェックできるマスの中に、クイーンにも届くマスがあります。',
    explain: '1.Nf6+! キングとd7のクイーンへのフォーク。2.Nxd7 でクイーンを取ります。ナイトの動きは見落としやすいので、相手にされないよう自分も注意しましょう。',
  },
  {
    id: 'fork-black-c2', theme: 'fork', level: 1,
    title: '黒番：c3からの両取り',
    fen: '4k3/5ppp/8/3n4/8/8/R3KPPP/8 b - - 0 1',
    solution: ['d5c3', 'e2d3', 'c3a2'],
    alts: { 1: ['e2d2', 'e2e1', 'e2f3', 'e2e3', 'e2f1'] },
    hint: 'ナイトでキングとルークを同時に攻撃できるマスを探しましょう。',
    explain: '1…Nc3+! キングとa2ルークのフォーク。キングが逃げたら 2…Nxa2 でルークを取ります。チェックと同時に何を狙えるか、ナイトの行き先を全部調べる習慣をつけましょう。',
  },
  {
    id: 'fork-pawn', theme: 'fork', level: 2,
    title: 'ポーンの両取り',
    fen: 'r1bqk2r/ppp2ppp/3b1n2/8/3PP3/2P2N2/1P2BPP1/R1BQ1RK1 w kq - 0 1',
    solution: ['e4e5'],
    hint: 'いちばん価値の低い駒で、2つの駒を同時に狙ってみましょう。',
    explain: '1.e5! ポーンがf6のナイトとd6のビショップを同時に攻撃します。e5はd4のポーンが守っているので、黒はどちらかの駒を失います。ポーンのフォークは最も「安い」両取りです。',
  },

  // ---------- ピン ----------
  {
    id: 'pin-queen', theme: 'pin', level: 2,
    title: 'クイーンを縫いとめる',
    fen: '6k1/6pp/8/3q4/8/1P6/5PPP/5BK1 w - - 0 1',
    solution: ['f1c4', 'd5c4', 'b3c4'],
    hint: '黒のクイーンとキングが同じ斜めの線に並んでいます。',
    explain: '1.Bc4! クイーンがキングにピンされて動けません。黒は 1…Qxc4 2.bxc4 とクイーンを差し出すしかありません。ビショップはポーンb3に守られています。',
  },
  {
    id: 'pin-file', theme: 'pin', level: 1,
    title: 'eファイルのピン',
    fen: '4k3/ppp2ppp/8/4q3/8/8/PPPN1KPP/R7 w - - 0 1',
    solution: ['a1e1'],
    hint: '黒のキングとクイーンが同じ縦の列に並んでいます。',
    explain: '1.Re1! クイーンがeファイルでキングにピンされます。…Qxe1+ にはKxe1、キングが逃げれば Rxe5。どちらでもクイーンを得します。ルークはキングf2に守られています。',
  },
  {
    id: 'pin-pawn-attack', theme: 'pin', level: 2,
    title: '動けない駒を攻める',
    fen: '4k3/pp3ppp/2n5/1B6/3P4/8/PP3PPP/4K3 w - - 0 1',
    solution: ['d4d5'],
    hint: 'c6のナイトはキングの前でピンされていて動けません。ピンされた駒は、さらに攻めるのが鉄則です。',
    explain: '1.d5! ピンされて動けないナイトをポーンで攻撃します。「ピンされた駒には追い打ちをかけよ」。黒は駒を1つ失います。',
  },

  // ---------- スキュア ----------
  {
    id: 'skewer-bishop', theme: 'skewer', level: 2,
    title: '斜めの串刺し',
    fen: 'r7/5p2/2k3p1/8/5P2/8/2B3P1/6K1 w - - 0 1',
    solution: ['c2e4', 'c6d6', 'e4a8'],
    alts: { 1: ['c6b6', 'c6c5', 'c6c7', 'c6d7', 'c6b5'] },
    hint: '黒キングとa8のルークは同じ斜めの線の上にいます。',
    explain: '1.Be4+! キングが逃げると、後ろのa8ルークがあらわになり 2.Bxa8。価値の高い駒を前にして串刺しにするのがスキュアです（ピンの逆）。',
  },
  {
    id: 'skewer-rook', theme: 'skewer', level: 2,
    title: '横一列の串刺し',
    fen: '8/5p2/q2k4/6p1/8/6P1/5PK1/7R w - - 0 1',
    solution: ['h1h6', 'd6d5', 'h6a6'],
    alts: { 1: ['d6c5', 'd6c7', 'd6d7', 'd6e7', 'd6e5'] },
    hint: '黒キングとクイーンが6段目に並んでいます。',
    explain: '1.Rh6+! キングが6段目から逃げると、2.Rxa6 でクイーンを取ります。',
  },

  // ---------- ディスカバード ----------
  {
    id: 'disc-knight', theme: 'discovered', level: 2,
    title: '開き王手',
    fen: '4k3/ppp2ppp/8/q3N3/2P5/8/PP2RPPP/6K1 w - - 0 1',
    solution: ['e5c6', 'e8d7', 'c6a5'],
    alts: { 1: ['e8f8'] },
    hint: 'ナイトがどくと、ルークが黒キングにチェックをかけます。ナイトはどこへ行くと得でしょう？',
    explain: '1.Nc6+! ナイトが動くとルークのチェック（ディスカバードチェック）が出ます。黒はチェックに対応するしかなく、2.Nxa5 でクイーンを取ります。',
  },
  {
    id: 'disc-bishop', theme: 'discovered', level: 2,
    title: 'ビショップがどけば',
    fen: '3q2k1/ppp2ppp/8/8/8/3B4/PPP2PPP/3R2K1 w - - 0 1',
    solution: ['d3h7', 'g8h7', 'd1d8'],
    alts: { 1: ['g8f8', 'g8h8'] },
    hint: 'ビショップの後ろでルークが黒クイーンを狙っています。チェックしながらどきましょう。',
    explain: '1.Bxh7+! チェックしながらビショップがどき、dファイルのルークがクイーンを攻撃。2.Rxd8+ でクイーンを取ります。チェックでないと …Qxd1+ と逆に取られるので注意。',
  },

  // ---------- 守り駒の除去 ----------
  {
    id: 'defender-f6', theme: 'defender', level: 3,
    title: 'h7を守る駒を消す',
    fen: 'r1bq1rk1/ppp2ppp/3p1n2/6N1/8/3Q4/PB3PPP/R4RK1 w - - 0 1',
    solution: ['b2f6'],
    hint: 'クイーンとナイトがh7を狙っていますが、f6のナイトが守っています。',
    explain: '1.Bxf6! h7を守っていたナイトを取り除きます。…Qxf6 や …gxf6 なら 2.Qxh7#（ナイトg5がクイーンを支える）。メイトを防ぐには …h6 や …g6 しかなく、白はナイトを丸得します。',
  },

  // ---------- エンドゲーム ----------
  {
    id: 'end-breakthrough', theme: 'endgame', level: 3,
    title: 'ポーンの突破',
    fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1',
    solution: ['b5b6', 'c7b6', 'a5a6', 'b7a6', 'c5c6'],
    alts: { 1: ['a7b6'] },
    hint: 'まん中のポーンを捨てて道を開きましょう。黒キングは遠くて間に合いません。',
    explain: '1.b6! cxb6 2.a6! bxa6 3.c6 でポーンがクイーンになります（1…axb6 には 2.c6!）。3対3でも、ポーン捨てで突破できる有名な形です。',
  },
];

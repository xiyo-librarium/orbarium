# Orbarium で作業するときに

世界のどこかの土地を選び、雨・太陽・土・生き物との関係を一から作っていく循環シミュレーション。
本番は https://orbarium.x1y0.net 。ゲームの中身と決めごとの詳細は README.md にまとめてある（作る前に該当の節を読む）。

## やりとりのしかた
- 返答は日本語で、結論から短く。
- ゲームの中の文言も短く。説明文で分からせるより、見た目（色・数字・アイコン・動き）で示す。
- 迷う設計の分かれ目は、作る前に選択肢を並べて聞く。「今は考えたい」と言われた構想は実装しない。

## 守ること
- 序章の東京の部屋は、実在の場所をもとに位置と数字をぼかしてある。元の場所が分かる住所・座標・地名・建物名を、コード・コミット・README・画像に入れない。地球儀のピンも都市の単位まで丸める。
- 航空写真（Google・Esri など）は商用のゲームで使えない条件なので使わない（README の「実データ」の節）。

## 置き場所
- `public/` がそのまま公開される静的サイト（ビルドなし、依存なし）。three.js r187 は `public/vendor/` に同梱し、importmap で読む。
- 本番 `/` の入口は `public/index.html`、画面の中身は `public/game/`。前の置き場所 `/next/` への古いリンクは `public/_redirects` で `/` へ転送する。
- 前の版は記念に `/classic/` に残す。前の版だけの物は `public/classic/`（`index.html`・`classic.css`・`js/app.js`・`js/globe.js`）にまとめてある。消さない。
- 計算の中心は本番と前の版で共有（`public/js/`）：`public/js/world.js`（土地・建物・見積もり・太陽光の向き）、`public/js/engine.js`（季節を進める）、`public/js/content.js`（メール・出来事・気候の文章）。 日差しの向き（`public/js/iso.js` の `sunVector`・`dirName`）も共有。
- 画面：`public/game/main.js`（操作・カード・編集・地球儀の流れ）、`stage.js`（敷地の3D）、`house.js`（家・屋根・雨樋・太陽光の見た目）、`globe.js`、`view.js`（光・天気）、`trees.js`、`book.js`（ノート・メール）、`game.css`。

## 動かす
- ローカル：`python3 -m http.server 8000 -d public`
- URL の切り替え：`/`（地球儀から）、`?play`（続きから）、`?play&new=med`（メデジンを新しく）、`?shot` `?proto`（試験用）、`?globe=atlas`、`?travel=alen`（土地は med・ubud・alen・yama・taos）、`&glow=0〜1`（地球儀の明るさを試す）、`&flyms=`（地球儀の飛ぶ時間を試す）、`&in=dark`（土地の画面を黒から明ける。地球儀から来たとき）、`&fast=1`（季節の天気の早回しを飛ばす）、`?wxper=ms`（早回しの1日の長さ）
- 保存のキー：`orbarium-1`、引き継ぎ `orbarium-carry`、地図帳 `orbarium-atlas`（前の版は別のキー）。前のキー `orbarium-next-…` は、開いたときに新しいキーへ移して消す

## 確かめる
- 決まりごと：`node tools/rules_test.mjs`、自動で遊ぶ：`node tools/bots.mjs`
- 本番の画面をブラウザで（Playwright。実データは `tools/mock_real.py` が差し替える。画像は /tmp/orb_flow/）：
  - `python3 tools/browser/flow_test.py`（地球儀→メール→メデジン→季節→アレンテージョまで一周）、`invite_test.py`（章の終わりの招待→もう少しここにいる→［次の土地へ］→ノートのメール→ウブド）、`room_test.py`（壁を下げて床の線をなぞる→間仕切りと自動の扉→間仕切りを押して扉に→✓）
  - `globe_look.py`（地球儀の明るさ3段と、寄っていく動きのコマと動画）
  - `roof_test.py r1 alen` のように土地を渡すと、その土地の工法で試す
  - `edit_test.py`（編集モード：仮→✕で戻る／✓で一度に払う）、`season_test.py`、`move_test.py`、`batt_ui.py`、`pick_test.py`、`roof_test.py`、`contig.py`（連続した窓・生け垣）
  - 引数に `phone` を含めるとスマホの画面幅で試す（例：`python3 tools/browser/flow_test.py phone1`）
- 前の版：`python3 tools/ui_test.py`、`python3 tools/cutoff_test.py`
- 画面を変えたら、スクリーンショットを自分の目で見てから出す。

## 出す
- main に push すると Cloudflare Workers に自動で出る（`wrangler.jsonc`、`./public` をそのまま配信）。
- 出たかの確認：
  ```
  gh api repos/xiyo-librarium/orbarium/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | .name + " " + .status + " " + (.conclusion//"")'
  ```

## コードの約束（つまずきやすい所）
- 座標：world の x → three の x、world の y（南向き）→ three の z、高さ → three の y。
- ブロックは `{ t, at: s.turn }` を `"x,y,z"` のキーで持つ。置く・外す・動かすは `W.put` / `W.remove` / `W.moveBlock`。
- 編集はすべて仮：`act()` が編集を始め、編集中は保存しない。`endEdit(true)` で元に戻す履歴を1つにまとめて払い、`endEdit(false)` で元に戻す。
- 3Dで押した物は `userData.pick` の種類（building・tank・batt・pump・coop・beds…）で見分ける。家具や置いた物を引きずるときは、カメラが回らないよう捕捉の段階で止める。
- 家の中の壁は建物の `inner`（`"h:x,y"` の辺に 'wall' か 'door'）。部屋は `W.rooms(d)`。壁を下げているとき、床の上のドラッグは間仕切り（家具の上なら家具、床の外なら視点）
- 太陽光は屋根の向きと傾きで月ごとの割合（`pvFactor`）が変わり、engine で `pvF[d.m]` を掛ける。
- 季節を進めると、その間の毎日の天気（`flags.weatherYear`）を早回しで見せてから報告を出す。

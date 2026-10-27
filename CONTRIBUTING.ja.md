# 貢献の手引き

[English](CONTRIBUTING.md)（英語が正本）

提案・不具合の報告・プルリクエストを歓迎します。日本語でも英語でも構いません。

## 1. 部品にする前に：図はデッキの中で描く

たいていの図は部品にしなくて済みます。デッキはインライン SVG を描き、`data-step`・印・モーフ・カメラ（Studio の動きの素。Studio の[約束事](https://github.com/egatari/egatari-studio/blob/main/docs/contract.ja.md)）で動かせます。1 つのデッキでそれ以上が要るなら、**デッキの中の部品**（`<デッキ>/components/<名前>/index.js`）を書きます。Studio の組み立てはそこを先に探します。Studio の `motion-components` スキルが手順を案内します。

実際の授業で使い、ほかの授業にも役立ちそうになったら、ここに提案してください。

## 2. Issue で提案する

[提案](https://github.com/egatari/components/issues/new?template=proposal.yml)を開きます。テンプレートが聞くこと：

| 欄 | 理由 |
|---|---|
| **例** | デッキの中のインライン SVG の図、または画像（スケッチ・スクリーンショット・板書の写真） |
| **使った授業・発表** | ここの部品は、実際の授業から生まれたもの |
| **データの形（案）** | 書く人（や AI）が書くもの：子の JSON か字と、属性 |
| **最終状態** | 最後の段階に見えるもの。印刷と、動きを止めたときの姿になる |
| **インライン SVG と動きの素では足りない理由** | 部品はどの教材も信頼して動かすコード。それだけの理由が要る |
| **権利** | 例と見本に入る文章・データ・画像・コードの出典とライセンス |
| **静止したときに読めなければならないもの** | 印刷・読む面・スクリーンリーダーで |
| **ほかの分野・授業での使い道** | 部品は 1 つの授業のためのものではない |

**名前は管理者が Issue の段階で決めます**（`m-<名前>`、部品庫の名前 `^[a-z][a-z0-9-]{0,63}$`）。コードを取り込む前です。名前は変えません。教材が名前を記録するので、別の部品に使い回すこともしません。

## 3. プルリクエスト

提案が受け入れられ名前が決まったら、`components/<名前>/` を足すプルリクエストを開きます。見せ方の種類（最初が既定。シード値はない）、箱と線の図、伝えたいことの宣言は[共通の決まり](docs/conventions.ja.md)（下書き）に従います。

- [ ] `index.js` が `<m-<名前>>` を定義し、[部品の約束事](https://github.com/egatari/egatari-studio/blob/main/docs/contract.ja.md)に従う：`render(k, t)` は段階と時刻だけで画面を決める（`setTimeout`・`requestAnimationFrame`・`Date`・シードのない乱数を使わない。`t = Infinity` が最終状態）、色はテーマの変数だけ（`var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)`）、データの形を `static shape` で宣言、デッキ固有の文言・数値を持たない
- [ ] コードを実行する書き方がない（`npm test` の `tools/scan-code.mjs`）：`eval`・`Function`・`constructor`・文字列のタイマー・`import`・`innerHTML` などを使わない。作者が書く式は JavaScript として実行せず `tools/expr.js` で計算する（`node tools/expr-sync.mjs` で写し、その `USERS` に部品を足す。[SECURITY.md](SECURITY.md)）
- [ ] `README.md`：frontmatter の `name`・`version`（そのパーツ自身の版 X.Y.Z。1.x のパーツは最後に出た部品庫の版）・`series`（`common`＝標準パーツ・`academic`・`business`・`kokugo`・`info`・`social`・`music`・`english`）・`tier`（段：`standard` 標準・`specialized` 専門・`extra` 特殊。専門は `set`（束）も：`stats` 統計・`math` 数学・`maps` 地図・`kokugo` 国語・`english` 英語・`music` 音楽・`business` ビジネス・`tools` 道具）・あれば `display`（タグと別の名前、`<日本語> / <英語>`）・`summary`・`steps`・`props` と、いつ使うかの本文
- [ ] `demo.html`：1〜3 枚の見本のデッキ（見せ方の種類があれば、それを並べた 1 枚を足す）。文章とデータは自作・パブリックドメイン・架空のもの
- [ ] `tools/test-shape.mjs` に形の違うデータの例を 1 行
- [ ] `node tools/catalog.mjs` で CATALOG.md を作り直す（手で直さない）
- [ ] `npm test` が通り、書き出された画像（段階の途中と最終状態）を目で見た
- [ ] `CHANGELOG.md` の `## Unreleased` に 1 行

今ある部品を直すとき：使っている教材を壊さないこと。今あるデータの描き方（配置・時間・段階の数）が変わる直しは、少なくともマイナーの版にします。プルリクエストにそう書いてください。

## 試験

```bash
npm test                                   # すべて
node tools/test-all.mjs --only test-components
node tools/test-components.mjs bars        # 見本 1 つ（画像は components/bars/out/shots/）
```

試験は、固定したコミットの Egatari Studio（`tools/studio.json` にコミットの sha をすべて書く。`tools/studio.mjs` が `.studio/` に取ってきて、checkout の後に確かめる）で見本を組みます。手元の Studio で試すときは `EGATARI_STUDIO=<作業用の写しのパス>` を指定します（ここの部品をそこへ写します）。Studio が部品の約束事を変えたら、固定するコミットをそれを含む Studio のコミット（リリースのタグのコミット、または `main` のコミット）に移します。sha はいつも同じコードです。手順は RELEASING.md の「Moving the Studio pin」。

## リリース

リリースのタグは管理者だけが付けます：[RELEASING.md](RELEASING.md)。タグは付け替えません。

## ライセンス

貢献したものは [MIT ライセンス](LICENSE)で公開されることに同意したものとします。

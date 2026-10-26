---
name: m-score
series: music
summary: 楽譜（五線譜）を 1 音・和音ずつ、または 1 小節ずつ出して音も鳴らす。ABC 記譜法で書く
steps: 音符・和音・休符 1 つ＝1 段階。by="measure" なら 1 小節＝1 段階
purposes: music
variants: light
props: by, names
---

子の JSON：`{"abc": "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F | G2 G2 |]"}`

- `abc`：ABC 記譜法。`M:` 拍子、`L:` 基本の長さ、`Q:1/4=96` 速さ、`K:` 調、`[CEG]` 和音、`z` 休符、`-` タイ
- `names`：符頭の下に `solfa`（ドレミ）・`abc`・`iroha`（ハニホ）。既定は `none`
- `by="measure"`：1 小節ずつ（音は小節の中で順に鳴る）

<!-- llm: omit -->
作る人向けの注

- **組み立てのときの描画**（部品庫 2.0 §4.1）：作り手が `abc` を abcjs（`add_classes: true`）で描き、`abcSvg`・`abcMap`・`renderer` を足す。再生のときに abcjs は持たない。足していないデータは札になる。`static build = {fields: {abc: "abcjs"}}`
- **abcMap**：`tempo`（四分音符 / 分）と `notes`（譜面の順）。音符ごとに `cls`（その要素だけが持つ abcjs の class 全部、`"abcjs-v0 abcjs-mm1 abcjs-n2"`）、`measure`（小節の通しの番号。abcjs の `mm`）、`pitch`（`["C4"]`、和音は複数、休符は `[]`）、`beat`（小節の頭からの拍、四分音符 = 1）、`dur`（拍）、`box`（符頭の箱 `[x, y, w, h]`、SVG の座標）、`tie`（前の音符からタイでつながる：鳴らさない）。`beams`・`ties`：連桁とタイが結ぶ音符の番号の組（abcjs の SVG にはつながりの印がないので組み立てが記録する）
- **SVG は信用しない**：innerHTML・DOMParser を使わず、許した要素（svg g path rect line polyline polygon circle ellipse text tspan）と属性（形・class・`currentColor`/`none` の色）だけで組み直す。`<style>`・`<title>`・ほかの色・参照・イベントは捨てる
- **出し方**：音符・休符は `cls` の要素。小節線はその小節の最後の音符と出る。abcjs は連桁 1 組を 1 つの path に `beams` の順で描くので k 番目の連桁は `beams[k]` の最初の音符と、タイの path は `ties` の終わりの音符の順に（つなぎ × 音の高さの数）並ぶのでつなぎの先の音符と出る。数が合わなければ小節の最初の音符と出て `console.warn`。スラーは小節の最初の音符と。五線・音部記号・調号・拍子は段階 0 から
- **音**（仕様 §8.4）：`events(k)` は音の高さ 1 つに 1 つの `note`（`vel` 0.7、和音は同じ `t`）。タイは先の音符の分まで `dur` を延ばす（段階をまたいで鳴る）。休符とタイの先は鳴らさない
- 段は abcjs の `abcjs-l…` ごとに分け、段の下に名前の帯（26 px、和音は高い音が上の行。名前が重なる小節は、その小節の名前を全部ジグザグに：奇数番目の音符は上の段、偶数番目は下の段）を入れて、幅と高さに収まる倍率で描く。五線の間が 7 px より狭くなる・名前が重なると `console.warn`
- abcjs の字（速さ・題名・歌詞）は小さいので、組み立ては `%%printtempo false` と `T:` なしで描く（見本もそう）
- 今の段階の音符は `--emph`、前は `--fg`。授業の表示では先の音符を `--preview-opacity` で薄く
- 見本の楽譜：fixtures/*.json は abcjs 6.7.2（MIT、Paul Rosen and Gregory Dyke）で描いたもの（fixtures/LICENSE-abcjs.txt）。曲は作った練習と、かえるの合唱（ドイツ民謡、パブリックドメイン）
<!-- llm: end -->

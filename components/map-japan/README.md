---
name: m-map-japan
series: social
summary: 日本の 47 都道府県の地図。地域の強調、統計の塗り分け（階級は 3 つまで）、点、矢印、経度・緯度の重ね描きを段階ごとに出す
steps: 項目の step の最大（既定はすべて段階 1。地図そのものは最初の段階で出る）
purposes: spatial
variants: fade, sweep, draw
props: layout, labels, show, unit, digits, legend, dur
data-credit: 地図データ：Natural Earth（パブリックドメイン）を加工
---

地理・歴史の授業で、場所を示すときに使う。子の JSON（どれも `step` `at` `tone` を持てる）：

- `regions`：`id`（JIS の番号 `"01"`〜`"47"`）か `group`（八地方区分：`hokkaido` `tohoku` `kanto` `chubu` `kinki` `chugoku` `shikoku` `kyushu`）。`label` で名前を変える
- `values`：`{"13": 1406, …}` と `classes`（階級の下限、3 つまで。例 `[0, 100, 300]`）で塗り分け。値は入る地域の上と凡例に書く
- `points`：`lon` `lat`（または `code` で県庁の位置）、`label`、`anchor`
- `flows`：`from` `to`（番号か `[経度, 緯度]`）の矢印。`label` `value` `bend`
- `shapes`：`polygon` か `line`（`[[経度, 緯度], …]`）。`label` `dash`

`labels`：`focus`（強調した地域の名前、既定）・`all`・`none`。`layout="true"` で南西諸島と小笠原を本当の位置に。

地図データ：Natural Earth（パブリックドメイン）を加工。

<!-- llm: omit -->
注意

- 領土は日本政府の立場のとおり：北方領土（国後・択捉・色丹・歯舞）は北海道、竹島は島根県、尖閣諸島は沖縄県（docs/map-design.md §4.5）。データに固定した性質で、授業ごとに切り替えることはできない
- 地図データは `tools/map/build-japan.mjs` が Natural Earth 5.1.1 の 1:10m（`ne_10m_admin_1_states_provinces` と、竹島のために `ne_10m_admin_0_countries_jpn`）から作り、`index.js` の BEGIN/END map-japan-data の間に書く。手で直さない。作り直し方は `tools/map/README.md`
- Natural Earth の admin-1 は奄美群島を沖縄県に入れているので、鹿児島県に直している。北方領土は admin-1 ではサハリン州なので北海道に移している
- 図法は正角円錐図法（標準緯線 30°・42°、中央経線 136°E）。`layout="inset"`（既定）では南西諸島（沖縄県と奄美群島）を左上の枠に同じ縮尺で、小笠原諸島・沖ノ鳥島・南鳥島を右下の枠に 0.3 倍の縮尺で描く
- 形が消える小さな島（竹島・魚釣島・沖ノ鳥島・南鳥島）は点で描き、その都道府県の色で塗る
- 段階：地図（陸地と枠）は最初の段階で出て、その段階の項目は 0.5 秒後から。項目の `step` の既定は 1
- 塗り分けの色は `color-mix(in oklab, var(--term) p%, var(--bg))`（濃い階級は `var(--fg)` との混ぜ）。割合はテーマの色から、隣り合う階級のコントラストが 3:1 以上になるように選ぶ（`tools/test-classes.mjs` が既定・国語・ビジネスのテーマで測る）。3:1 を保てるのは 3 階級まで（白から黒までが 21:1 で、4 階級には 27:1 が要る）なので、`classes` は 3 つまで
- 値・名前の字は地の色の札の上に `--fg` で書く（塗りの濃さによらず 4.5:1 以上）。値は地域の中に入るときだけ書く（入らない地域は色と凡例で読む）。名前は中に入らなければ、まわりの海に置いて引き出し線を引く
- 塗り分けた地域を `regions` でも挙げると、塗りつぶさずに太い縁で強調する
- 各都道府県の陸の `path` に `data-mark="JP-13"` のような印がある（Studio のカメラ `{zoom:JP-13}` で寄れる）
- 見せ方：`fade`（フェード）・`sweep`（同じ段階の中で西から東へ順に。全体で `fade` の長さの中）・`draw`（地域と重ね描きは輪郭を引いてから塗り、輪郭は塗り終わると消える）。どれも位置は動かない。矢印はどの見せ方でも線を引いていく
- 授業の表示（`?mode=lecture`）では、先の段階の項目を薄く（0.45）見せる
- 見本の人口は総務省統計局「令和2年国勢調査 人口速報集計結果」（2020 年 10 月 1 日現在）を万人に丸めたもの
<!-- llm: end -->

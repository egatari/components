# Kana stroke data (ひらがな・カタカナ)

Stroke-order data for 166 kana, for the stroke-order part (`m-kakijun`):

- the 92 basic kana (ひらがな 46 + カタカナ 46);
- 濁音・半濁音: が〜ぼ, ぱ〜ぽ, ガ〜ボ, パ〜ポ and ヴ (51);
- small kana: ぁぃぅぇぉっゃゅょゎ, ァィゥェォッャュョヮ, ヵヶ (22);
- the long-vowel mark ー (horizontal writing only).

Not included: ゐ ゑ ヰ ヱ (historical kana), the vertical-writing form of ー, and punctuation.

The data comes in **two files under two licences**:

| File | Licence | What it holds |
|------|---------|---------------|
| `kana.json` | MIT (ours) | order and counts, how each stroke ends (とめ・はね・はらい), 結び loops, small-kana placement, notes |
| `strokes.ofl.json` | SIL OFL 1.1 | the shapes: each stroke's outline and centreline, **derived from strokesvg (Klee One)** — see [`LICENSE-strokes.md`](LICENSE-strokes.md) |
| `OFL.txt`, `LICENSE-strokesvg.txt`, `strokes-CHANGES.md` | — | the licence texts for the shapes and our changes to them |
| `proto.html` | — | the reveal, all 166 characters (built by `node tools/kana-proto.mjs`) |
| `review-sheet.html` / `.pdf` | — | A4 sheet for a 書写 teacher: order, direction, とめ・はね・はらい (`node tools/kana-sheet.mjs --pdf`) |

Tools: `tools/kana-import-strokesvg.mjs` (strokesvg SVGs → `strokes.ofl.json`), `tools/test-kana-data.mjs` (validates
both files), `tools/kana-order-check.mjs` (compares strokesvg's order and direction with our own earlier lines),
`tools/kana-proto-check.mjs` (checks the reveal in headless Chrome and renders frames), `tools/kana-svgpath.mjs`.

## `kana.json` (MIT)

```jsonc
{
  "version": "0.1.0",
  "box": 100,                 // the 0–100 square, y down (the em of the font the shapes come from)
  "license": "MIT",
  "shapes": "strokes.ofl.json …",
  "sources": { "school-hiragana": { … }, "school-katakana": { … } },
  "references": ["…"],
  "chars": {
    "は": {
      "count": 3,
      "strokes": [               // in writing order — the same order as in strokes.ofl.json
        {"end": "hane"},
        {"end": "tome"},
        {"end": "harai", "loop": true}
      ],
      "source": "school-hiragana",
      "verified": false,        // true once checked against a named textbook page / by a teacher
      "note": "…"               // optional: what is least certain
    },
    "ぁ": { …, "base": "あ", "place": {"yoko": [a, b, c, d, e, f], "tate": [ … ]} }
  }
}
```

- **`end`**: `tome` (とめ), `hane` (はね) or `harai` (はらい).
- **`loop`** (`true`): a 結び (the stroke closes a small loop by crossing itself): す・な・ぬ・ね・は・ほ・ま・み・む・よ and
  their derived forms (ず・ば・ぱ・ぼ・ぽ・ょ). Every 結び turns **clockwise on screen** (y down), the same way as な's,
  which the owner checked; the test checks it on the shapes' centrelines.
- **`base`**: derived characters (濁音・半濁音・small kana) name the character they build on.
- **`place`** (small kana): two SVG matrices `matrix(a b c d e f)` (a uniform scale and a move) applied to the shapes:
  **yoko** puts the small kana inside the **lower-left quarter** of the square, **tate** inside the **upper-right
  quarter**, each with a 3-unit margin. `tate` is `yoko` moved by (+50, −50): translation only (Klee One's own
  vertical forms of the small kana are its horizontal ones moved, so nothing else is needed).
- The earlier hand-made centrelines (`d`) and ink widths (`w`) are no longer in the file; they are in the git
  history (last in commit e95cf2e).

## `strokes.ofl.json` (SIL OFL 1.1)

```jsonc
{
  "_license": { "notice": "…", "copyright": ["Copyright 2020 The Klee Project Authors (…)", "Copyright (c) 2024 Kyle"],
                "license": "SIL Open Font License 1.1", "licenseFile": "OFL.txt", "modifications": "…" },
  "source": { "repository": "https://github.com/zhengkyl/strokesvg", "commit": "e4c2c910…", "transform": "×100/1024" },
  "box": 100,
  "brush": 12.5,             // the width of the round brush that draws each centreline
  "derived": { "っ": {"base": "つ", "matrix": [ … ]}, … },
  "chars": { "あ": [ [["<outline>", "<centreline>"]], … ] }   // strokes → pieces → [outline, centreline]
}
```

The licence notice is **inside the file**, so it travels with the bytes into every lesson that uses it. Coordinates
are in the same 0–100 box as `kana.json`, rounded to 0.1. A stroke that crosses itself (e.g. the 結び of あ, す, な …)
comes in pieces, each clipped by its own part of the outline; the pieces of one stroke advance together by the same
length. Our changes (OFL, see `strokes-CHANGES.md`): the 半濁点 redrawn to start at the bottom and go clockwise
(光村図書『こくご一（上）』p.27 半濁点, p.37 句点: 「下中心から時計回り」); っ ッ ゎ ヮ ヵ ヶ derived from つ ツ わ ワ カ ケ by
scaling, checked against Klee One's small glyphs; the precision.

**Size** (`strokes.ofl.json`): all 166 characters 172,573 bytes raw, 63,062 gzip (41,565 brotli); the 92 basic kana
alone 88,331 raw, 34,629 gzip (30,148 brotli). Subsetting per lesson comes later (components 2.0 build hook).

## The reveal (`proto.html`)

strokesvg's method: for each stroke, a thick round-capped centreline (`brush` wide) clipped by that stroke's own
outline, drawn by `stroke-dashoffset`; finished strokes are shown in full. Each clip holds only its own stroke, so
nothing of a later stroke can show early (bleed 0 by construction; checked). While a stroke is being drawn, each
piece's clip also leaves out the half-disc behind the start of its centreline, so the round cap never shows a fleck
behind the point where the stroke begins (it did at the start of the redrawn 半濁点, which starts on its own ink).

**Accessibility**: the drawing is `aria-hidden="true"`; the `svg` has `role="img"` and the real kana as its name,
e.g. `aria-label="あ（書き順）"`.

## Order check

`node tools/kana-order-check.mjs` compares, for every stroke, strokesvg's centreline (where it draws ink) with our own
earlier hand-made line of the same stroke (from git history): the same stroke must be the nearest, and run the same
way. All 166 characters / 477 strokes agree (with the redrawn 半濁点; strokesvg's own 半濁点 started at the top and went
anticlockwise).

## Sources for order and count

- **Order**: the order generally taught in Japanese primary 国語・書写 textbooks (1年, 五十音).
  It was written from the author's knowledge and has **not** yet been checked character by character
  against a named textbook page, so every character has `"verified": false`. The review sheet is the
  instrument for that check.
- **Count**: all 92 counts agree with public school charts (小学生コンパス, ひらがな / カタカナの書き順 一覧:
  <https://eleschool-compass.com/contents/kakijun/hiragana.html>,
  <https://eleschool-compass.com/contents/kakijun/katakana.html>; only the numbers were compared).
  School splits: き 4, さ 3, そ 1, ふ 4, り 2, ゆ 2.
- **文部省『筆順指導の手びき』(1958)** covers the 881 教育漢字 (文化遺産オンライン's description); as far as
  could be checked it has no kana table, so it is cited only for the shared principles (上から下へ、左から右へ).
  Its table of contents was not seen directly.
- 国際交流基金『日本語教育通信』45号「授業のヒント かなの書き方の指導」: kana follow the same order rules as
  kanji; printed type and 教科書体 handwriting differ for さ・ゆ・ふ・り.

## Out of scope (for now)

- ゐ ゑ ヰ ヱ (historical kana): not included.
- The vertical-writing form of ー, and punctuation.

## Least certain (also marked with `note` in the data and in red on the sheet)

ヲ (order 一・一・ノ), セ and ヤ (the hook at the end of stroke 1), ア (end of stroke 1), マ (where stroke 2
meets stroke 1), も (upward はね at the end of stroke 1), む (end of stroke 2), ひ (end), ふ (stroke 3),
て (end), を (shape of stroke 2), ゆ (the end of stroke 1). Ending labels also marked uncertain: ら (stroke 1), や (strokes 1 and 2), ル and レ (はらい or はね), へ・ヘ (はらい or
とめ), き・さ・な (an end that turns back briefly in the glyph, labelled とめ), た・に (a very short はね). Derived characters inherit their base's note.

# Kana stroke data (ひらがな・カタカナ)

Original stroke data for the 92 basic kana (ひらがな 46 + カタカナ 46), meant to feed a future
stroke-order component (`m-kakijun`). It is not a component yet.

| File | What it is |
|------|------------|
| `kana.json` | The data (MIT, like the rest of this repository) |
| `review-sheet.html` / `review-sheet.pdf` | A4 sheet for a 書写 teacher to check order, direction, とめ・はね・はらい and shape |
| `../../tools/kana-sheet.mjs` | Rebuilds the sheet: `node tools/kana-sheet.mjs --pdf` (run `node tools/studio.mjs` once first for the browser) |
| `../../tools/test-kana-data.mjs` | Validates `kana.json`: `node tools/test-kana-data.mjs` (not yet in `test-all`) |
| `../../tools/kana-path.mjs` | Small SVG path reader shared by the scripts |
| `proto.html` | Prototype of the stroke-by-stroke reveal over the font Klee One (あ〜ほ). Built by `node tools/kana-proto.mjs`; needs the font at `data/kana/font/KleeOne-SemiBold.ttf` (gitignored, not in the repository yet) or `?font=<url>` |
| `../../tools/kana-proto-check.mjs` | Measures the reveal in headless Chrome (coverage, leaks onto later strokes) and renders frames: `node tools/kana-proto-check.mjs OUTDIR --frames` |

## Licence and provenance

Every stroke was drawn by hand as centreline coordinates on a 0–100 grid. No font outline, KanjiVG
(CC BY-SA), AnimCJK (Arphic / LGPL), strokesvg / Klee One (OFL) or other stroke dataset was copied,
traced or used as a template. Only facts were taken from outside: the number of strokes and their
order. The shapes follow the proportions of 教科書体 handwriting (strokes separated where school
handwriting separates them: き・さ・ふ・り・ゆ), not a decorative font.

**Characters marked `"glyphFit": "Klee One 1.100"` (あ〜ほ, 30 characters).**
線の順と向きのデータは独自に作ったもの。Klee One の字形に合うよう位置を合わせただけで、字形の輪郭は含まない。
In English: the stroke order and direction data are our own. For these characters the existing hand-made
centrelines were moved by eye (control points edited by hand while looking at the glyph rendered at 500 px
with the lines on top) so that each runs along the middle of the corresponding stroke of Klee One; stroke
counts and order were kept. No outline was extracted, skeletonised or traced, and no path point was computed
from glyph pixels; rendered pixels were used only to measure how well a brush along the lines covers the glyph
(`tools/kana-proto-check.mjs`). The 0–100 box is the font's em square: x 0–100 = 0–1000 units, and y 0 is the
typo ascender (880), so the glyph is drawn with `<text x="0" y="88" font-size="100">` in a `0 0 100 100` box.

## Format

```jsonc
{
  "version": "0.1.0",
  "box": 100,                 // coordinates are in a 0–100 square, y down
  "license": "MIT",
  "sources": {                // where order and count come from (referenced by each char)
    "school-hiragana": { "label": "…", "order": "…", "count": "…" },
    "school-katakana": { … }
  },
  "references": ["…"],        // background references (free text)
  "chars": {
    "あ": {
      "count": 3,
      "strokes": [
        {"d": "M24 31 Q48 29 74 25", "end": "tome"},
        …
      ],
      "source": "school-hiragana",
      "verified": false,      // true once the order has been checked against a named textbook page / by a teacher
      "glyphFit": "Klee One 1.100", // optional: the lines were positioned to run along this font's glyph
      "note": "…"             // optional: what is least certain about this character
    }
  }
}
```

- **`strokes`** are in writing order. Each `d` is an SVG path of the stroke's **centreline**, drawn in the
  writing direction (the first point is where the brush or pencil goes down), so a component can animate it
  with `stroke-dasharray` / `stroke-dashoffset`. Commands used: `M L Q C` (absolute); the reader also accepts
  `H V T S Z` and relative forms.
- **`end`** is how the stroke ends: `tome` (とめ), `hane` (はね) or `harai` (はらい). A component can taper
  a `harai`, and keep a `tome` blunt.
  - For **`hane` the short flick is part of the path**: the last segment of `d` is the hook itself
    (e.g. い: `… 36 77 L42 70`). A component that draws its own hook can drop that last segment.
- **`start`** (optional, reserved): a string describing how the stroke starts, if a later version needs
  it. No character uses it yet.
- Strokes that share a start point (ウ・ロ・ワ) start at exactly the same coordinates.

### Validation (`tools/test-kana-data.mjs`)

- the 92 expected characters are present and nothing else;
- `count === strokes.length`, and `count` equals the school stroke count listed in the test;
- every `d` parses, every `end` is one of the three values, every sampled point stays inside `0..box`;
- each `source` names an entry of `sources`.

## Reveal prototype (`proto.html`, あ〜ほ)

The visible glyph is Klee One (Fontworks, SIL OFL 1.1), drawn as SVG `<text>`, with a light-grey copy under it
as a guide. It is shown through an SVG mask built only from our centrelines, in three layers:

1. a **wide** round brush (13 units) along the drawn part of each stroke (`stroke-dasharray` / `pathLength="1"`),
   wide enough to cover the glyph's stroke including its ends;
2. a black **guard** (12 units) along the part of each stroke not yet drawn, so a wide brush passing over a later
   stroke (a crossing, or a stroke close by) does not show it early;
3. a **narrow** brush (9 units) along the drawn part again, on top of the guards, so a drawn stroke stays whole
   where a guard crosses it.

After the last stroke there are no guards, so the full glyph shows (checked: 100 % of the glyph's pixels for all 30).
What still shows early is the ink two strokes share where they cross (e.g. あ, き, せ, ね, ぬ): a mask cannot split
it. Per-character widths can be set in `proto-brush.json` (`{"あ": [13, 12, 13]}`); none is needed now.

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

- ゐ ゑ ヰ ヱ (historical kana) and ヴ.
- Small kana (ぁ ぃ ぅ ぇ ぉ っ ゃ ゅ ょ ゎ and katakana) — the same strokes scaled and placed low-left in the
  square; a component can derive them.
- 濁点・半濁点 (゛ ゜) — best added later as separate marks (two short strokes / one small circle drawn last,
  at the upper right) rather than as 50+ extra characters.
- 長音符 ー and punctuation.

## Least certain (also marked with `note` in the data and in red on the sheet)

ヲ (order 一・一・ノ), セ and ヤ (the hook at the end of stroke 1), ア (end of stroke 1), マ (where stroke 2
meets stroke 1), も (upward はね at the end of stroke 1), む (end of stroke 2), ひ (end), ふ (stroke 3),
て (end), を (shape of stroke 2), ゆ (the turn in stroke 1).

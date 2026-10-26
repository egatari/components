# Kana stroke data (ひらがな・カタカナ)

Original stroke data for 166 kana, used by the stroke-order component `m-kakijun` (`components/kakijun/`; its
index.js carries a compact copy written by `tools/kana-embed.mjs`, and `tools/test-kakijun.mjs` checks the copy):

- the 92 basic kana (ひらがな 46 + カタカナ 46);
- 濁音・半濁音: が〜ぼ, ぱ〜ぽ, ガ〜ボ, パ〜ポ and ヴ (51);
- small kana: ぁぃぅぇぉっゃゅょゎ, ァィゥェォッャュョヮ, ヵヶ (22);
- the long-vowel mark ー (horizontal writing only).

Not included: ゐ ゑ ヰ ヱ (historical kana), the vertical-writing form of ー, and punctuation.

| File | What it is |
|------|------------|
| `kana.json` | The data (MIT, like the rest of this repository) |
| `review-sheet.html` / `review-sheet.pdf` | A4 sheet for a 書写 teacher to check order, direction, とめ・はね・はらい and shape |
| `../../tools/kana-sheet.mjs` | Rebuilds the sheet: `node tools/kana-sheet.mjs --pdf` (run `node tools/studio.mjs` once first for the browser) |
| `../../tools/test-kana-data.mjs` | Validates `kana.json`: `node tools/test-kana-data.mjs` (not yet in `test-all`) |
| `../../tools/kana-path.mjs` | Small SVG path reader shared by the scripts |
| `proto.html` | Prototype of the stroke-by-stroke reveal over the font Egatari Kana, derived from Klee One (all 166 characters). Built by `node tools/kana-proto.mjs`; needs the font subset at `data/kana/font/EgatariKana-SemiBold-kana.woff2` (gitignored as a file; the font is in the repository only inside `components/kakijun/index.js`, see "The font") or `?font=<url>`; `?place=tate` shows small kana in vertical-writing placement |
| `../../tools/kana-proto-check.mjs` | Measures the reveal in headless Chrome (coverage, leaks onto later strokes) and renders frames: `node tools/kana-proto-check.mjs OUTDIR --frames` |

## Licence and provenance

Every stroke was drawn by hand as centreline coordinates on a 0–100 grid. No font outline, KanjiVG
(CC BY-SA), AnimCJK (Arphic / LGPL), strokesvg / Klee One (OFL) or other stroke dataset was copied,
traced or used as a template. Only facts were taken from outside: the number of strokes and their
order. The shapes follow the proportions of 教科書体 handwriting (strokes separated where school
handwriting separates them: き・さ・ふ・り・ゆ), not a decorative font.

**Characters marked `"glyphFit": "Klee One 1.100"` (all 166 characters).**
線の順と向きのデータは独自に作ったもの。Klee One の字形に合うよう位置を合わせただけで、字形の輪郭は含まない。
In English: the stroke order and direction data are our own. For these characters the existing hand-made
centrelines were moved by eye (control points edited by hand while looking at the glyph rendered at 500 px
with the lines on top) so that each runs along the middle of the corresponding stroke of Klee One; stroke
counts and order were kept. No outline was extracted, skeletonised or traced, and no path point was computed
from glyph pixels; rendered pixels were used only to measure how well a brush along the lines covers the glyph
(`tools/kana-proto-check.mjs`). The 0–100 box is the font's em square: x 0–100 = 0–1000 units, and y 0 is the
typo ascender (880), so the glyph is drawn with `<text x="0" y="88" font-size="100">` in a `0 0 100 100` box.

How the derived characters were made (our data only; the glyph was looked at, never measured into points):

- **濁音・半濁音** reuse their base character's strokes unchanged (the test checks this) where Klee One's glyph
  matches; only ダ needed one stroke moved (`"refit"` says which). The 濁点 are two short strokes from upper left
  to lower right, the 半濁点 one circle (started at the bottom, going clockwise — see below), both written last and
  placed by hand on each glyph.
- **Small kana** were first derived from their base by a scale and offset (x and y scaled separately) of our own
  lines, set by eye to the small glyph's extent, then adjusted by hand where Klee One's small form differs
  (ぁ, ゎ, ゃ, ぉ, ァ, ッ and the ends of ィ, ゥ, ョ, ヶ).
- **ー** is one stroke, left to right.

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
        {"d": "M21 28.5 Q45 27 69 22", "end": "tome", "w": [5.8, 4.7, 6.3]},   // w: ink width per third
        …
      ],
      "source": "school-hiragana",
      "verified": false,      // true once the order has been checked against a named textbook page / by a teacher
      "glyphFit": "Klee One 1.100", // optional: the lines were positioned to run along this font's glyph
      "base": "か",           // derived characters only (濁音・半濁音・small kana): the character they build on
      "refit": "…",           // optional, 濁音・半濁音 only: which base strokes were moved for this glyph
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
- Strokes that share a start point (ウ・ロ・ワ and their derived forms) start at exactly the same coordinates.
- 濁点・半濁点 strokes come last and end with `tome`.
- **Circles** (checked by the owner, 2026-10-26):
  - 半濁点 ゜ (ぱぴぷぺぽ・パピプペポ): starts at the **bottom** and goes **clockwise** (bottom → left → top → right).
    The path starts and ends at the bottom point.
  - Not in the set, recorded for later: ○ (丸, the symbol) also starts at the bottom and goes clockwise;
    〇 (零, the kanji numeral) starts at the **top** and goes **anticlockwise**.
- **`loop`** (optional, `true`) marks a stroke with a 結び (a small loop the stroke closes by crossing itself):
  す・な・ぬ・ね・は・ほ・ま・み・む・よ and their derived forms (ず・ば・ぱ・ぼ・ぽ・ょ). Every 結び turns **clockwise on
  screen** (y down), the same way as な's, which the owner checked: in よ・は・ほ・ま the vertical comes down through
  the crossing, turns left along the bottom of the loop, comes up, and crosses to the right along its top into the
  final stroke. (Before 2026-10-26, よ・は・ほ・ま and their derived forms turned anticlockwise; fixed.)
- **`w`** (optional, on every stroke now): the stroke's **ink width** in 0–100 units, three numbers for the first,
  middle and last third of the stroke's length (so a はらい that thins can narrow). Measured, not drawn: the area of
  the glyph's ink nearest to this centreline in that third, divided by the third's length (rendered at 500 px;
  clamped to 3.5–9). It is a number per segment, not geometry; no outline is stored. A component uses it to size the
  brushes that follow the stroke's own ink (see "Reveal prototype"). Because ink at a crossing is counted for the
  nearer line, `w` can read a little low in the third that holds a crossing; for た・だ・れ・わ・キ・ギ・ケ・ゲ・チ・ヂ・モ・ワ,
  where that hid drawn ink, each third uses the width measured away from other strokes (ink within 7 units of another
  centreline left out), or else the larger of its own width and the stroke's typical width.
- **`place`** (small kana only): `{"yoko": [a, b, c, d, e, f], "tate": [...]}`, two SVG matrices
  (`matrix(a b c d e f)`, here a uniform scale and a move) that put the small kana in the square: in horizontal
  writing (**yoko**) inside the **lower-left quarter**, in vertical writing (**tate**) inside the **upper-right
  quarter**, each with a 3-unit margin. The glyph and our lines are drawn through the **same** matrix, so the stroke
  data itself stays in glyph coordinates. `tate` is `yoko` moved by (+50, −50): translation only. Klee One has
  `vert` alternates for all 22 small kana, and they are the horizontal outlines moved (by about +12 to +16 across
  and −7 to −14 down; ゃ also has 6 of its 125 points moved slightly), so they carry nothing that translation does not;
  a component does not need the `vert` feature. The scale fits the union of the glyph's outline box (read from the
  font's metrics) and our lines widened by 4 units into the 44-unit quarter, centred.

### Validation (`tools/test-kana-data.mjs`)

- the 166 expected characters are present and nothing else;
- `count === strokes.length`, and `count` equals the school stroke count listed in the test (濁音 = base + 2,
  半濁音 = base + 1, small kana = base, ー = 1);
- derived characters name the right `base`, and a 濁音・半濁音 without `refit` starts with exactly its base's strokes;
- every `d` parses, every `end` is one of the three values, every sampled point stays inside `0..box`;
- each `source` names an entry of `sources`;
- every small kana has `place`; tate = yoko moved by (+50, −50); our lines (widened by 4 units) lie inside the right
  quarter in both modes (the rendered ink is checked in the browser by `kana-proto-check.mjs`, see below);
- every `loop` stroke crosses itself and every loop it closes turns clockwise on screen, like な.

## Reveal prototype (`proto.html`)

The visible glyph is **Egatari Kana**, a font derived from Klee One (SIL OFL 1.1; see "The font" below), drawn as SVG `<text>`, with a light-grey copy under it
as a guide. It is shown through an SVG mask built only from our centrelines, in three layers:

1. a **wide** round brush (13 units) along the drawn part of each stroke (`stroke-dasharray` / `pathLength="1"`),
   wide enough to cover the glyph's stroke including its ends;
2. a black **guard** along the part of each stroke not yet drawn, so a wide brush passing over a later stroke
   (a crossing, or a stroke close by) does not show it early: width **`w` + 1.75** per third of the stroke;
3. a **narrow** brush along the drawn part again, on top of the guards, so a drawn stroke stays whole where a guard
   crosses it: width **`w` + 1.25** per third of the stroke.

`w` is the stroke's measured ink width (below). Following each stroke's own ink, the narrow brush hardly reaches past
the drawn stroke's ink, so at a crossing the later stroke shows little more than the ink the two strokes share.
(Without `w`, fixed widths are used: guard 12, narrow 9 — the first version.) The two margins were chosen by
measuring "bleed" and "hidden ink" over a set of characters with many crossings (see below).

After the last stroke there are no guards, so the full glyph shows (checked: 100 % of the glyph's pixels for all 166).
What still shows early is the ink two strokes share where they cross (e.g. あ, き, せ, ね, ぬ): a mask cannot split
it.

Measured by `kana-proto-check.mjs` after each whole stroke k (pixels at 500 px; 25 px = 1 unit²):
- **bleed**: ink of a later stroke that shows outside the drawn strokes' own ink band (farther than half the local
  measured width + 0.4 from every drawn centreline) — the slivers beside a crossing;
- **hidden**: ink of a drawn stroke that does not show (a guard wider than the narrow brush can hide it). Per-character widths can be set in `proto-brush.json` (`{"あ": [13, 12, 13]}`); none is needed now.

`kana-proto-check.mjs` also renders each small kana through `place.yoko` and `place.tate` and checks that its ink
lies inside the right quarter (all 22 pass).

## The font: Egatari Kana (derived from Klee One, SIL OFL 1.1)

The part shows the glyphs of a font **derived from Klee One** (Fontworks Inc., SIL Open Font License 1.1, version
1.100, from github.com/google/fonts `ofl/kleeone`, commit 130fcfb0ff422fec96b335616b2ca99f91914792). The part `m-kakijun`
carries it as a base64 WOFF2 inside `components/kakijun/index.js` (with `components/kakijun/OFL.txt` and the
repository's `NOTICE`); as a file it is not in the repository, and the prototype loads it from `data/kana/font/`
(gitignored). `tools/kana-embed.mjs` writes it into the part from there (sha256 checked).

- Family **Egatari Kana**, PostScript name `EgatariKana-SemiBold` (files `EgatariKana-SemiBold-kana.woff2` and
  `EgatariKana-Regular-kana.woff2`), so it cannot shadow or collide with Klee One on the same page and does not
  carry the "Klee" trademark of Fontworks Inc.; use this family name in CSS `@font-face`. Name IDs 1, 3, 4, 6, 16
  and 17 changed, and name ID 7 (the trademark sentence) removed; the copyright line
  (ID 0: "Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee)") and the licence
  (IDs 13, 14) are kept. Ship it with Klee One's `OFL.txt`. Klee One declares no Reserved Font Name.
- The copyright line is attribution, not use of the mark. Write "Derived from Klee One (SIL OFL 1.1)" wherever the
  font is credited.

### FONTLOG

Egatari Kana — Derived from Klee One (SIL OFL 1.1).

- 2026-10-26 — OS/2 `achVendID` set to `NONE` (was `FWKS`, Fontworks' vendor code): a modified version does not
  claim to come from Fontworks.
- 2026-10-26 — Renamed "Egatari Kana" (was "Klee One Egatari Kana" for a few hours, not published); name ID 7
  removed.
- 2026-10-26 — Subset of Klee One SemiBold 1.100 to the 166 characters of `kana.json` plus `、。・「」` and the
  full-width space (202 glyphs, with their `vert` alternates), WOFF2; family renamed as above.
  **No glyph outline was changed.** Reviewed by the owner (round 2):
  - と: the owner asked for strokes 1 and 2 to touch. In Klee One they already touch: と is a single contour
    in which stroke 1 runs into stroke 2. What looked separate was our animation (stroke 1's line stopped short
    of stroke 2); stroke 1's centreline now runs into stroke 2 (と, ど). No font change.
  - ク・タ: the owner asked for stroke 1 to overshoot stroke 2 less (now about 5.0 units in ク and 4.6 in タ above
    the top edge of stroke 2's bar). In Klee One, strokes 1 and 2 of ク and タ (and グ, ダ) are **one merged
    contour**, so they cannot be moved or shortened as whole contours; per the review rule the outline was not
    edited point by point. **The owner accepted ク and タ as Klee One draws them** (round 4); no outline change.

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
て (end), を (shape of stroke 2), ゆ (the end of stroke 1). Ending labels marked uncertain after the Klee One
fit: ら (the short turn at the end of stroke 1), や (stroke 2's short end line, stroke 1's はね), ル and レ
(はらい or はね), へ・ヘ (はらい or とめ), き・さ・な (short end lines kept as とめ), た・に (very short はね).
Derived characters inherit their base's note.

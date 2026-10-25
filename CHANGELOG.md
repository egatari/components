# Changelog

Versions follow [README.md § Releases and versions](README.md#releases-and-versions). Tags are never moved.

## Unreleased

### Added

- `m-predict` (series `common`): predict, then reveal. A question and 2–6 choices (step 0), the class's counts as horizontal bars in the `m-bars` look (step 1), and the answer at `answer-step` (default 2): the right choice framed with 「✓ 正解」 and the `note`, the others dimmed but readable. The first component that takes viewer input (spec §8.4 "Viewer input", docs/input-components.ja.md): the presenter counts a show of hands with −1/+1 buttons (48 px high) or by typing into a field, on the stage or (through Studio) from the presenter's view with `input(choice, count)`; `counts()` and an `egatari-input` event let Studio follow; a learner clicks a choice to mark their own prediction. Input is viewer state (spec §8.4, egatari-spec 241770f): the counts and the learner's prediction stay while the viewer is on the slide, forward to the answer step and back, so the reveal shows the class's counts and whether the prediction was right; they go back to the author's `counts` on `ctx.reset` (Studio v0.5.0: entering from another slide, a jump) and, for earlier Studio, when `deck:pos` says the slide was entered from another slide. Never in video (`?mode=video` builds no controls); print shows the author's counts with the controls hidden, and the screen keeps the viewer's afterwards. `static viewerInput = true` in index.js, carried into manifest.json as `components.predict.viewerInput` (CATALOG marks it 「入力あり」). Optional `poll="p1"`: the live poll's counts from `ctx.live.poll(id)` when the player allows them (live §2.5). Variants `fade`, `draw`. `tools/test-predict.mjs` (in `tools/test-all.mjs`); the digits-in-the-field case waits for Studio v0.5.0 (#69) and is skipped with the pinned v0.4.3
- Interactive parts (操作できるパーツ, docs/conventions.md §6): `static interactive = true` in the index.js of `m-predict`, `m-kobun` and `m-menu` (one line each; their drawing and READMEs are unchanged), written to manifest.json as `components.<name>.interactive` (and `viewerInput` for `m-predict`) by `tools/release.mjs`. `tools/lint.mjs` fails a part whose index.js has an `input()` method, click/pointer/key/input/change listeners, creates links or controls, or takes links as data without the flag, and `viewerInput` without `interactive`. Marked by text and a dashed frame, not colour alone: 「操作できる」 next to the name in CATALOG.md, a 「操作できる / Interactive」 badge (first in the body) and a dashed `--accent2` frame on the part's intro slide in the gallery, and a 「操作できる」 badge as the first element of the body of each part's first demo slide (not in the h2, which Studio uses as the slide's title and key)
- `purposes.json`: `predict` (予想してから確かめる / Predict, then check). **Proposal, needs the owner's review:** it adds a new-deck tile (`tile: "own"`, label 予想して確かめる / Predict, then check, icon `predict`, examples 手を挙げて数える・答えを開く / show of hands, then the answer)

### Security

- `tools/map` (build-time only, not in the release): adm-zip 0.6.1 through an npm `overrides` entry (Dependabot alerts on mapshaper's dependency); the rebuilt map data is unchanged. `.github/dependabot.yml` with a 7-day cooldown (14 for majors); the tool is installed with `npm ci --ignore-scripts`; SECURITY.md § Dependencies

### Later (candidates, not in this release)

- `m-compare` `by="row"`; an "outside every set" region for `m-venn`; a project-plan demo for `m-timeline` lanes

## 1.6.0 - 2026-10-25

### Added

- `purposes.json`: `tile` (`"own"`, `{"into": id}` or `"none"`), `label`, `icon` and `examples` for each purpose, so that Egatari Studio builds its new-deck tiles from the manifest instead of its own list. 15 tiles: the 14 of 2026-10-24 and `spatial` (場所・地図). `ranking` folds into `compare`; `grouping`, `text-structure` and `parameter` have no tile. Checked by `tools/lint.mjs`

### Changed

- People-facing text calls the purposes 「伝えたいこと」 / "What to convey" (was 言いたいこと); the ids are unchanged

## 1.5.0 - 2026-10-25

### Changed

- `m-curves`, `m-scatter`, `m-map-japan`: `anchor` also accepts `top` and `bottom`, as names for `above` and `below` (AI authors guess them)

### Added

- `m-map-japan` (new series `social`): the 47 prefectures of Japan for geography and history lessons. Regions by JIS code or the 八地方区分 (`group`), a choropleth (default 4 classes, up to 5; classes evenly spaced in OKLab lightness, boundaries always drawn, class ranges in the legend, values on the regions where they fit only with `show="value"`; legend ranges like 「500 以上」), points, arrows (`via`: waypoints the arrow passes through, e.g. to keep a sea route offshore; `labelAt`) and author-drawn lon/lat shapes, each with `step` `at` `tone`. The map itself is shown from step 0. The territory dots 竹島, 尖閣諸島, 沖ノ鳥島 and 南鳥島 are always named. Insets for 南西諸島 (a frame tight to the islands, left of 九州) and 小笠原 with 沖ノ鳥島・南鳥島 (0.5×), captioned 「縮尺は本図と異なる」, beside a main map that fills the element's height (or in the main map's empty corners in small elements); `layout="true"` for true positions. A hidden list gives the final state's text (regions, every value, labels). `data-mark="JP-<code>"` on each prefecture for Studio's camera; variants `fade`, `sweep`, `draw`. Map data: Natural Earth 5.1.1 (public domain), modified, built by `tools/map/build-japan.mjs` with the Japanese government's position on the territories fixed in the data (docs/map-design.md §4.5) and ownership checks at build time. New series `social` and purpose `spatial` (場所・地図)
- `tools/test-classes.mjs`: choropleth legends in the default, kokugo and business themes, with 4 and 5 classes: adjacent classes ≥ 0.08 apart in OKLab lightness and evenly spaced, the lightest class ≥ 3:1 against the background or outlined, every region's boundary drawn. `npm test` also checks the map block's sha256 (`tools/map/build-japan.mjs --check`, no network)

## 1.4.1 - 2026-10-25

### Fixed

- `m-kanbun` (issue #3): the columns now fit the element's height and width. Before, the layout came from `size` alone (60 px by default) and ignored the element's height, so a 五言 line (about 690 px with kunten) overflowed the slide whatever `style="height:…"` the author wrote; an AI author in the nightly evaluation changed the height three times without converging. When the longest column (with 振り仮名・送り仮名・返り点・句読点) exceeds the element's height by more than 6 px, or the columns and the 書き下し文 exceed its width, the character size and the column pitch go down together, 1 px at a time, to 42 px at the least (振り仮名・送り仮名・返り点 stay 24 px; below 42 a 返り点 comes closer than 4 px to the next column's 送り仮名). If it still does not fit, a `console.warn` gives the missing px and what to do. When the text fits at `size`, nothing changes (the demo is pixel-identical). A 再読文字's second-reading number moves above its 送り仮名 when the characters are small. The README says in one pack-visible sentence (+23 B) that the size follows the element and that a poem that still does not fit is split (2 句 per slide), not given another height. `tools/test-kanbun-fit.mjs` (in `tools/test-all.mjs`): a 五言 two-line text at 260 px fits (inside the slide and the element, text ≥ 24 px, no overlaps), and a 9-character line at 260 px stops at 42 and warns

### Changed

- CATALOG.md, the gallery and CONTRIBUTING name the `common` series 標準パーツ / Standard parts (the series id `common` and README frontmatter are unchanged)

## 1.4.0 - 2026-10-25

### Changed

- `m-kanbun`: **the number of steps changes.** The reading-order phase (`order`) is now one step per line (column, one 句 of a poem) instead of one step for the whole text: the default `phases="kunten order kaki"` gives kunten 1 + one step per column read + kaki 1. A new step starts wherever the reading moves to another column (where `cues(k)` used to fire; a return to an earlier column by 返り点 or a 再読文字 starts a step of its own). Each step lasts (characters read in it) × `slot` + 0.3 s; `slot` is unchanged and earlier columns stay marked. **Lessons moving to this version must re-align their narration `[n]` (one `[n]` per 句).** `order-by="all"` keeps the old single step, with the same drawing and timing as 1.3.0. The README says it in one pack-visible sentence; the demo's first and third slides show per-line steps, the second keeps `order-by="all"`. `DECK.kanbun.stepGroups` gives the grouping (tested in `tools/test-kokugo.mjs`)

### Fixed

- `m-kanbun` (issue #2): at the end of a reading-order step, the current-character highlight (red frame and red glyph) and the bright arc fade out during the step's last 0.3 s, so the picture at the step's declared length equals its final state (before, they stayed until the next step)
- `m-kobun`: the translation step (0.6 s) staggered its lines by 0.12 s each, so with more than two sentences the last lines were still fading in after the step ended; the stagger is now shortened to fit the step (unchanged for one or two sentences)
- `tools/test-duration.mjs`: no component is listed as known any more (`m-kanbun` and `m-kobun` pass)

## 1.3.0 - 2026-10-25

### Added

- `m-curves`: series `step` (the step at which the line is drawn; series sharing a step draw together; steps = the largest step; default unchanged, series i at step i + 1), series `tone` (the colour field of the other components), `labelAt` (the x value where the line's name goes) and `anchor` values `right` `left` `above` `below` (the words of `m-scatter`'s point labels). The demo has a third slide (demand and supply drawn in one step, a `below` name). Existing lessons draw exactly as before: `color`, `at` (as the x of the name, only when `labelAt` is absent) and `anchor` `start` `middle` `end` still work and are documented only in the README's maintainer notes
- docs/conventions.md §3: chart parts share one series vocabulary (`label`, `tone`, `step`, `at` = start s within the step, `anchor`, `labelAt`)

### Changed

- READMEs of `m-curves` and `m-scatter`: one wording for series, steps and label sides. `m-curves` says how its steps are counted (one series = one step, in order, unless `step`); `m-scatter` no longer says its axes are "the same as `m-curves`" (in the README and in its data-shape note), it lists them. AI authors had mixed the two schemas (`"anchor": "below"` and `"step"` on `m-curves` series, nightly evaluation 2026-10-25)
- `tools/test-components.mjs`: a renderer difference it passes (identical component DOM) is logged with the component, position and pixel count, the two screenshots are kept (`renderer_s*_k*_A/B.png`), and a summary line lists them all

## 1.2.1 - 2026-10-25

### Fixed

- Demos of `m-compare`, `m-cycle`, `m-fishbone`, `m-pie`, `m-timeline`, `m-tree` and `m-venn`: the captions of the variants slide are 27 px (they are body text outside the figure; Egatari Studio's quality check flagged 24–26 px as `smallText`). `tools/test-components.mjs` now checks body text outside figures against 27 px
- READMEs of `m-scatter`, `m-pie`, `m-cycle`, `m-fishbone`, `m-timeline`, `m-tree`: mentions of other components are a sentence of their own or a closing parenthetical, or are dropped where they were consistency notes, so that Studio's pack keeps the attribute descriptions when the named component is not in the pack (docs/conventions.md §4.1.1)
- `tools/test-components.mjs`: when the determinism check's screenshots still differ after a retry, it compares the components' DOM; if the DOM is identical the difference is Chrome's rendering (seen on CI's Linux and Windows at rounded corners), and the check passes with a note
- `RELEASING.md`: release notes give the README byte change of `m-bars`, `m-flow`, `m-menu`, `m-curves`, `m-quad` and `m-kpi` (Egatari Studio's free-plan AI pack carries them and sits near its size cap)

## 1.2.0 - 2026-10-25

### Added

- Shared conventions for components (`docs/conventions.md`, `docs/conventions.ja.md`): presentation variants and the lesson seed (spec §8.4), box-and-line diagrams, chart attribute names, purpose declarations
- `purposes.json`: the purposes a slide may want to say, with default step patterns. Every README declares `purposes:` (checked by `tools/lint.mjs`); CATALOG.md gains a purpose and variant column and a "by purpose" table; `manifest.json` carries `purposes` and each component's `purposes` and `variants` (the tarball is unchanged in layout)
- `tools/variant.js`, copied into components with variants by `tools/variant-sync.mjs` (checked by `npm test`); `tools/test-variant.mjs` (the choice), `tools/test-seed0.mjs` (variant 0 is pixel-identical to the last release)
- `m-kpi`: variants `count` (default, unchanged), `rise`, `flip`, `underline`, chosen by `variant`, `seed` or the lesson's `data-egatari-seed`. A lesson without a seed draws the same pixels as before. `count="false"` turns a counting variant into `rise` (with a `console.info`)
- `m-compare` (series common, purpose `compare`): two or three things side by side in a table. A column per side with its heading, a row per criterion, and an optional difference per row (`diff` in a right-hand column, `better` framing the better value). Steps: one side, then the other, then the differences. Variants `fade` (default), `slide`, `reveal`
- `m-venn` (series common, purpose `overlap`): a Venn diagram of two or three sets (fixed symmetric layout, not area-proportional), with items placed inside each region (`A`, `AB`, `ABC`, …). Steps: one set at a time, then the overlaps highlighted with their items (`overlaps="each"`: one overlap per step). Variants `fade` (default), `draw`
- `m-tree` (series common, purpose `hierarchy`): a hierarchy or classification tree laid out from the data (no coordinates; parents centred over their children, subtrees packed by their per-level contours). `orient` down or right, `link` elbow or straight, steps `by="level"` (default) or `by="node"`, optional dashed `edges`; variants `fade`, `draw`, `grow`
- `m-fishbone` (series common, purpose `cause-effect`): a cause-and-effect (Ishikawa) diagram laid out from the data: effect head on the right, main bones alternating above and below, causes and sub-causes as labelled ticks. Steps `order="causes-first"` (default; one main bone per step, the head last) or `order="effect-first"`; optional dashed `edges`; causes may carry `tex` and a `note`; variants `fade`, `draw`, `grow`
- `m-scatter` (series `common`, purpose `correlation`): a scatter plot. Groups of points (series) appear one step each, then a trend line (`"linear"`: least squares over all points or chosen series, or two points written in `pts`). Axis attributes `xr yr xt yt xf yf xl yl` have the names and meaning of `m-curves` (ranges and ticks are chosen from the data when left out). Labelled points, a marker shape per series, series and trend names above the plot (`{r}` `{a}` `{b}` in a trend name become the correlation, slope and intercept). Variants `fade` (default), `sweep`, `grow`
- `m-pie` (series `common`, purpose `part-whole`): pie and donut charts (`donut`). Labels inside large slices, outside with leader lines otherwise; values with `unit`/`digits` and percentages that add up to 100 (`show`, `pct-digits`); text in the donut's hole (`center`, `{total}`). The whole pie in one step by default; `per-step` reveals it slice by slice. Variants `fade` (default), `sweep`, `grow`
- `m-bars`: `stack="true"` draws each group's values stacked in one bar (stacked bars): the bar grows to the total while the series fill it from the bottom, the total is written at the end of the bar and each value inside its part when it fits; series names beside the last bar (vertical) or above the first (horizontal). Without `stack` the drawing is unchanged (the demo's first three slides are pixel-identical to before)
- `m-timeline` (series common, purpose `timeline`): a timeline laid out from the data (no coordinates). Events (`when`: a number, `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"`) sit on the axis with their date and label in boxes alternating above and below (`orient="v"`: left and right; two rows when crowded); periods (`end`) are bands in lanes under the axis, overlapping periods stack in separate lanes automatically, and `lane` groups them into named lanes (a `lane` event without `end` is a milestone ◆ in its lane); band and milestone labels may have several lines; `whenLabel` replaces the computed date text (明治元年) while `when` keeps the position; `end` is exclusive. `scale` `time` (default) or `even`; ticks when there are periods. One event per step in time order (`per-step`, node `step`); the axis appears with the first event. Variants `fade` (default), `draw`, `grow`
- `m-cycle` (series common, purpose `cycle`): stages in array order on a circle (an ellipse in a wide box) from 12 o'clock, clockwise, joined by arrows along the circle; the arrow from the last stage back to the first comes with the last stage. Optional `center` label. 3 to 8 stages. One stage per step (`per-step`, node `step`). Variants `fade` (default), `draw`, `grow`

### Changed

- `m-flow`: edge labels without a `tone`, and the text of `muted` boxes, are drawn in `--fg` instead of `--muted` (the box border stays `--muted`). They read too pale on a projector. **This changes how existing lessons look when rebuilt with v1.2.0** (owner-approved, issue #1). Edges themselves were already `--fg` and are unchanged
- `m-cycle`, `m-timeline`: a `note` inside an `emph` box is drawn in `--fg` (`--muted` on `--emph-tint` is below 4.5:1)
- `m-curves`, `m-quad` and `m-kpi`: series `common` (were `academic`, `business` and `business`). Only the catalogue and the AI pack's grouping change; tag names and drawing are unchanged

## 1.1.0 - 2026-10-24

### Fixed

- `m-kanbun`: reading-order numbers of two or more digits (10 and up) no longer spill out of their box into the character next to them. Only their font size is reduced (for example 24 px to 18.5 px at the default size) so that the text fits the box; the box, its position and everything about one-digit numbers are unchanged (a lesson whose kanbun has at most nine reading events draws the same pixels as before). This changes how existing two-digit numbers are drawn, so it needs a minor version at least. Every reading-order number also carries `data-annot` (the small-annotation mark of Egatari Studio's quality check, which then does not apply its 24 px minimum text size to it). Checked by `tools/test-kanbun-num.mjs`
- `m-kobun`: the conjugation card the viewer opened also closes when the runtime passes `ctx.reset` to `render` (Egatari Studio re-entering a step after the viewer touched a component; contract §3), as it already did when `k` changes. Without `ctx.reset` and with the same `k` the card stays open. Normal stepping draws the same pixels as before. Checked by `tools/test-kobun-reset.mjs`
- `m-codetree`: `render` no longer leaves the state of an earlier call on elements that are not drawn (opacity 0), so the DOM, attributes included, no longer depends on the order of `render` calls. What was left: the position (`x1 y1 x2 y2`, `x`, `y`) and the bit of the dashed branch and the `×` for an unknown code, the bracket path (`d`), the swatch and label `x` and the label text of a pixel run that is not shown yet, and the text of the "so far" line above the window. They are now removed (or emptied) when not drawn, which is how they were created. Nothing visible changes: the screenshots of the demos at every step are byte-identical to before. Checked by `tools/test-codetree-dom.mjs` (`render(a)` then `render(b)` against a fresh `render(b)`: same DOM, same pixels)

## 1.0.3 - 2026-10-20

### Security

- **1.0.0 and 1.0.1 are yanked; use 1.0.2.** Both let `m-sweep` and `m-curves` run a lesson's expressions as JavaScript (fixed in 1.0.2). Their tags and release assets are untouched (a tag is never moved); this release's `manifest.json` carries the withdrawal in a new field, `yanked`: `{"1.0.0": {"replacement": "1.0.2", "reason": …, "date": …}, "1.0.1": …}` (Egatari spec §6: the release stays available, the manifest marks it withdrawn and names the replacement). An editor that opens a lesson recording a yanked version should offer a rebuild with the replacement and must not substitute it silently; it may still play the old version isolated from its own origin ([SECURITY.md](SECURITY.md))

### Added

- `yanked.json` (the source of the manifest's `yanked`), checked by `tools/release.mjs` and `tools/test-yanked.mjs`

No component changed: every file is identical to v1.0.2.

## 1.0.2 - 2026-10-20

### Security

- `m-sweep` (`f`) and `m-curves` (each series' `f`) no longer run their expressions as JavaScript (`new Function`; any code in a lesson's attribute or data ran, even in a Core document). They now use a small arithmetic parser (`tools/expr.js`, copied into both components): numbers, the component's variables, the listed `Math` functions and constants, `+ - * / % **`, comparisons, `&& || !`, `? :` and parentheses. Anything else is refused with a `SyntaxError` and the component shows its inline placeholder. Values of every expression the demos, Studio's examples and docs used are identical to v1.0.1 ([SECURITY.md](SECURITY.md), Egatari spec §6)
- `tools/scan-code.mjs` (in `npm test` and CI): fails on `eval`, `Function`, `constructor` access, string arguments to `setTimeout` / `setInterval`, `import`, `document.write`, `javascript:` and HTML sinks in component code (one listed exception: constant SVG icons in `m-menu`)
- `SECURITY.md`: the expression grammar, the code scan, the audit of every component and how to report a vulnerability

### Changed

- `m-sweep` and `m-curves` are wrapped in a function scope (their helpers are no longer globals)
- Tests: `tools/test-expr.mjs` (allowed and refused expressions, values identical to v1.0.1, limits, determinism, the code scan), `tools/expr-sync.mjs --check` (the copies equal `tools/expr.js`), and refused expressions in the browser (`tools/test-shape.mjs`)

## 1.0.1 - 2026-10-20

- `m-kanbun` demo: the 『史記』 slide uses `size="56"` so that the figure fits above the conclusion (Studio's quality check reported R-fit, 20 px)
- `m-sweep`: a demo (`demo.html`, two slides); every component now has one
- Tests build the demos with Egatari Studio v0.4.3 (was v0.4.2)
- `.gitattributes`: component files are checked out byte for byte on every OS
- `manifest.json`: per-file and component sha256 values are identity hashes (Egatari spec §6: line endings normalized for text files, leading BOM removed); the tarball's sha256 stays byte-exact. All files are LF without BOM, so the v1.0.0 values already meet this definition

## 1.0.0 - 2026-10-20

First release as a separate repository. The 14 components (`m-bars`, `m-codetree`, `m-collect`, `m-curves`, `m-flow`, `m-gendai`, `m-kanbun`, `m-kobun`, `m-kpi`, `m-market`, `m-menu`, `m-quad`, `m-seq`, `m-sweep`) moved from Egatari Studio with their history; every file is byte-identical to `components/` in Studio v0.4.3 (commit 8419183), so lessons built with Studio up to v0.4.3 record the same `index.js` hashes.

- Tests (`npm test`) build every demo with a pinned Egatari Studio release and check rendering, determinism, text size and overlap, and wrong-shaped data; CI on Linux, macOS and Windows
- Releases: a deterministic tarball and `manifest.json` with the sha256 of the tarball and of every file
- Proposals through an issue template; `CONTRIBUTING.md` (English and Japanese)

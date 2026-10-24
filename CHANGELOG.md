# Changelog

Versions follow [README.md § Releases and versions](README.md#releases-and-versions). Tags are never moved.

## Unreleased

### Added

- Shared conventions for components (`docs/conventions.md`, `docs/conventions.ja.md`): presentation variants and the lesson seed (spec §8.4), box-and-line diagrams, chart attribute names, purpose declarations
- `purposes.json`: the purposes a slide may want to say, with default step patterns. Every README declares `purposes:` (checked by `tools/lint.mjs`); CATALOG.md gains a purpose and variant column and a "by purpose" table; `manifest.json` carries `purposes` and each component's `purposes` and `variants` (the tarball is unchanged in layout)
- `tools/variant.js`, copied into components with variants by `tools/variant-sync.mjs` (checked by `npm test`); `tools/test-variant.mjs` (the choice), `tools/test-seed0.mjs` (variant 0 is pixel-identical to the last release)
- `m-kpi`: variants `count` (default, unchanged), `rise`, `flip`, `underline`, chosen by `variant`, `seed` or the lesson's `data-egatari-seed`. A lesson without a seed draws the same pixels as before. `count="false"` turns a counting variant into `rise` (with a `console.info`)
- `m-compare` (series common, purpose `compare`): two or three things side by side in a table. A column per side with its heading, a row per criterion, and an optional difference per row (`diff` in a right-hand column, `better` framing the better value). Steps: one side, then the other, then the differences. Variants `fade` (default), `slide`, `reveal`
- `m-venn` (series common, purpose `overlap`): a Venn diagram of two or three sets (fixed symmetric layout, not area-proportional), with items placed inside each region (`A`, `AB`, `ABC`, …). Steps: one set at a time, then the overlaps highlighted with their items (`overlaps="each"`: one overlap per step). Variants `fade` (default), `draw`
- `m-tree` (series common, purpose `hierarchy`): a hierarchy or classification tree laid out from the data (no coordinates; parents centred over their children, subtrees packed by their per-level contours). `orient` down or right, `link` elbow or straight, steps `by="level"` (default) or `by="node"`, optional dashed `edges`; variants `fade`, `draw`, `grow`
- `m-fishbone` (series common, purpose `cause-effect`): a cause-and-effect (Ishikawa) diagram laid out from the data: effect head on the right, main bones alternating above and below, causes and sub-causes as labelled ticks. Steps `order="causes-first"` (default; one main bone per step, the head last) or `order="effect-first"`; optional dashed `edges`; variants `fade`, `draw`, `grow`
- `m-scatter` (series `common`, purpose `correlation`): a scatter plot. Groups of points (series) appear one step each, then a trend line (`"linear"`: least squares over all points or chosen series, or two points written in `pts`). Axis attributes `xr yr xt yt xf yf xl yl` have the names and meaning of `m-curves` (ranges and ticks are chosen from the data when left out). Labelled points, a marker shape per series, series and trend names above the plot (`{r}` `{a}` `{b}` in a trend name become the correlation, slope and intercept). Variants `fade` (default), `sweep`, `grow`
- `m-pie` (series `common`, purpose `part-whole`): pie and donut charts (`donut`). Labels inside large slices, outside with leader lines otherwise; values with `unit`/`digits` and percentages that add up to 100 (`show`, `pct-digits`); text in the donut's hole (`center`, `{total}`). The whole pie in one step by default; `per-step` reveals it slice by slice. Variants `fade` (default), `sweep`, `grow`
- `m-bars`: `stack="true"` draws each group's values stacked in one bar (stacked bars): the bar grows to the total while the series fill it from the bottom, the total is written at the end of the bar and each value inside its part when it fits; series names beside the last bar (vertical) or above the first (horizontal). Without `stack` the drawing is unchanged (the demo's first three slides are pixel-identical to before)
- `m-timeline` (series common, purpose `timeline`): a timeline laid out from the data (no coordinates). Events (`when`: a number, `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"`) sit on the axis with their date and label in boxes alternating above and below (`orient="v"`: left and right; two rows when crowded); periods (`end`) are bands in lanes under the axis, overlapping periods stack in separate lanes automatically, and `lane` groups them into named lanes (a `lane` event without `end` is a milestone ◆ in its lane). `scale` `time` (default) or `even`; ticks when there are periods. One event per step in time order (`per-step`, node `step`); the axis appears with the first event. Variants `fade` (default), `draw`, `grow`
- `m-cycle` (series common, purpose `cycle`): stages in array order on a circle (an ellipse in a wide box) from 12 o'clock, clockwise, joined by arrows along the circle; the arrow from the last stage back to the first comes with the last stage. Optional `center` label. 3 to 8 stages. One stage per step (`per-step`, node `step`). Variants `fade` (default), `draw`, `grow`

### Changed

- `m-curves` and `m-quad`: series `common` (were `academic` and `business`). Only the catalogue and the AI pack's grouping change; tag names and drawing are unchanged

### Fixed

- `m-scatter`: a trend written as two points (`pts`) is drawn between exactly those points, so a vertical line (both x equal) is no longer collapsed to nothing; a trend line entirely outside the axes is no longer drawn (it was drawn unclipped beyond the plot) and gets no name above the figure (still a `console.warn`). `trend.pts` must be exactly two `[x, y]` number pairs (shape). The least-squares line draws the same pixels as before
- `m-bars`: with `stack="true"` and `count="true"`, the step now lasts until the values inside the parts and the series names have faded in (0.35 s more), so the declared end of the step is the readable final state. Without `stack`, or without `count`, nothing changes (the demo's screenshots are byte-identical)
- `m-compare`: a row whose `values` are not one per side, or whose `better` is not a side number, is refused at mount (placeholder with the reason) instead of silently dropping or ignoring values. `m-venn`: a region with `C` (`C`, `AC`, `BC`, `ABC`) in a two-set diagram is refused the same way instead of its items silently disappearing. Checked by `tools/test-shape.mjs`

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

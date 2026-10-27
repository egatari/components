# m-score changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

The first version of m-score: it was never released in 1.x (branch `m-score`, last 1.x-form commit cc0e60a).

- `egatariParts.define({name: "score", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-score"})`, extending
  `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "score"`.
  The DOM is byte-identical to the pre-2.0 commit cc0e60a on its demo at every step (tools/test-c2-identity.mjs, which
  takes that commit as m-score's baseline: tools/parts.mjs `C2_BASELINE_OF`).
- Build-time rendering in the spec's form (§6.2): `static build = {fields: {abc: "abcjs"}}`; elements are selected by the
  build-assigned `data-note`, `data-beam`, `data-measure` and `data-arc` only.
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (the readable layer and the default aria-label); the step count
  never depended on it.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Reports: abcSvg and abcMap that do not match are `ctx.report("data", "[score] …")`; a staff drawn below 0.9×,
  overlapping names and a score taller than the element are `ctx.report("size", "[score] …")`; an unknown `names` value
  is `ctx.report("attr", "[score] …")` (collected by `plan()`, reported in `mount`). The pre-2.0 commit used
  `console.warn("m-score: …")`. abcMap errors still throw (base contains them).
- The preview view is `ctx.preview` alone (pre-2.0 also accepted `ctx.mode === "lecture"`).
- `static sc` (the score data, read by tools/test-score.mjs through `partClass`) is unchanged.
- Rendered output (egatari-spec 8a410b0, §6.2): `abcSvg` is read through the spec's rendered-markup list
  (`schema/rendered-markup-1.json`, svg; the part's `MARKUP` equals it, tools/test-score.mjs compares them with the
  spec file at a pinned commit): `style` only as listed declarations set with `setProperty`, `fill` / `stroke` only
  `none` / `currentColor` and only on drawing elements, no URL-valued attribute; anything else is dropped (an element
  with its subtree) and reported once, `ctx.report("data", "[score] abcSvg: dropped …")`. The data carries
  `renderers: {abcjs: {version, options}}` at its top (was `renderer: {name, version, options}`); the fixtures and demo
  are rendered again with `foregroundColor: "currentColor"` and hold only admitted markup (fill / stroke moved from `g`
  down to the drawing elements). The 2.0 part on the new demo is pixel-identical to cc0e60a on its own demo at every
  frame of the identity test.
- Missing output (spec §6.2): data with `abc` only (not rendered at build time) shows the ABC source as plain text, has
  no steps and no sound, and is reported once, `ctx.report("data", "[score] abc not rendered at build time …")` (was:
  the data-shape placeholder). The shape requires `abc`; `abcSvg` and `abcMap` come together.
- Ids: none written.

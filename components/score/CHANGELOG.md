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
- Ids: none written.

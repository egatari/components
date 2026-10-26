# m-kakijun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "kakijun", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-kakijun"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "kakijun"`.
  The embedded egatari-variant block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo and on
  `tools/fixtures/c2-identity/kakijun.html` at every step (tools/test-c2-identity.mjs).
- The two data blocks are unchanged, byte for byte: kakijun-data (MIT) and the stroke shapes between
  `/* BEGIN OFL-1.1 data … */` and `/* END OFL-1.1 data */` with `"_license"` first. The licence stays `MIT AND OFL-1.1`.
- Reports instead of `console.warn("m-kakijun: …")`, all from `mount` with the 1.13.0 messages: a character without stroke
  data and ー in vertical writing `ctx.report("data", "[kakijun] …")`, `per`, `writing` or `grid` values it does not take
  `ctx.report("attr", …)`, and boxes that do not fit or small-kana labels that do not fit beside them
  `ctx.report("size", …)`. `plan()`, which gives the step count, still reads only the attributes and collects its notes
  for `mount`.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- The part's code now runs in strict mode (1.13.0's had no `"use strict"`).
- Ids: the clip paths keep 1.13.0's names, `m-kakijun-clip-<n>` and `m-kakijun-clip-<n>h`, from the part's own counter
  (deterministic). Renaming them `kakijun-2-0-0-clip-<n>` (spec §6.1 Identifiers) needs a rewrite in the identity test's
  `ID_REWRITES`, which waits for a standards decision.

## 1.13.0

As released in the library's 1.13.0.

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
- Subset at build time (spec §6.2): `static build = {subset: {data: "OFL-1.1 data:chars", key: "char"}}` (the `chars`
  of the JSON between the OFL-1.1 data markers) and `static glyphs = "0123456789とめはねらい"` (the stroke numbers and
  ending labels it draws). A producer keeps only the characters the lesson uses and records `subset: {keys, sha256}`
  (`tools/subset-produce.mjs` is the stand-in; `tools/test-subset.mjs`). A character whose strokes a subset left out
  (e.g. after a tier A edit of `text`) is drawn plainly, like a character without data, and reported as `data`.
- The collected notes are forwarded with a literal code per `ctx.report` call (lint checks each); no change in what is
  reported.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- The part's code now runs in strict mode (1.13.0's had no `"use strict"`).
- Ids: the clip paths are renamed `kakijun-2-0-0-clip-<n>` (1.13.0: `m-kakijun-clip-<n>`), and their start-cap masks
  `kakijun-2-0-0-clip-<n>h` (1.13.0: `m-kakijun-clip-<n>h`), from the part's own counter (deterministic; spec §6.1
  Identifiers). The rewrite is in the identity test's `ID_REWRITES` (`kakijun`).

## 1.13.0

As released in the library's 1.13.0.

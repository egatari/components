# m-tree changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "tree", version: "2.0.0", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-tree"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` / `previewOpacity`; `static partName = "tree"`. The embedded variant block is gone (`base.variant`).
  The DOM is byte-identical to 1.13.0 at every step (tools/test-c2-identity.mjs, with the formulas rendered at build time on the 2.0 side).
- Formulas are rendered at build time (Egatari spec §6.2), no longer by KaTeX at play time: `static build = {fields: {"nodes[].tex": "katex"}, options: {katex: {output: "html"}}}`. The producer adds `texHtml` beside each `tex` and `renderers: {katex: {version, options}}` at the top of the data (the shape now allows both). The part reads `texHtml` through `markup-reader` 1.0.0 (exactly the elements, attributes and style declarations of egatari-spec's `schema/rendered-markup-1.json`; anything else is dropped and reported once as `ctx.report("data", "[tree] …")`) into the same frame 1.13.0 drew (`foreignObject.smath` with an inline-block `div`), so the formula's DOM is that of 1.13.0's.
- Without `texHtml` (a file built without the renderer, or after a tier A edit of a `tex`) the `tex` source is shown as plain text in the same frame and reported once: `ctx.report("data", "[tree] tex … not rendered at build time …")` (1.13.0 showed the source as text only when KaTeX was missing).
- Known differences from 1.13.0, all inside formulas and only through `tex`: `\color`, `\textcolor`, `\colorbox`, `\fcolorbox`, `\boxed` / `\fbox` borders, `\pmb`'s shadow and the transparency that makes `\phantom` / `\hphantom` / `\vphantom` (and mhchem's spacing) invisible are not in the spec's list today, so they are dropped and reported; `\hlE` `\hlT` `\hlM` (classes, spec §8.0) are kept. KaTeX writes `class=""` on some spans and an `<svg>`'s style as text when it draws in the page (1.13.0), and neither when it renders to markup: the identity test compares these as equal (proposed `KATEX_EMPTY_CLASS`, `KATEX_SVG_STYLE`). The `\htmlClass` `\htmlId` `\htmlData` commands of spec §8.0 now work (1.13.0 drew them as errors: no trust at play time).
- A tree that does not fit is reported with `ctx.report("size", "[tree] …")` (1.13.0: `console.warn`).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Identity fixture `tools/fixtures/c2-identity/tree.html` (the v1.13.0 demo has no `tex`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.

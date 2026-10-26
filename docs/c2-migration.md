# Migrating a part to components 2.0 (alpha.2 recipe)

A checklist for moving one element part from `DECK.define` (1.x) to `egatariParts.define` (2.0, Egatari spec §6.1, §8.4,
as of egatari-spec b7520a8). Parts are migrated in parallel, and **a migration touches only the part's own folder**
(`components/<name>/`) plus, when needed, its own fixture `tools/fixtures/c2-identity/<name>.html`. Every list the tools
need is derived from the parts themselves (below), so there is no shared list to edit. The pilots are `components/bars`
(simple) and `components/menu` (position events, visited, fragments): read
`git diff v1.13.0 -- components/bars components/menu` first.

The rule of alpha.2: **the 2.0 part draws byte-identical DOM to its v1.13.0 version.** `tools/test-c2-identity.mjs`
checks it on the v1.13.0 demo (and the part's fixture) at every step (35 %, 70 %, end), in the talk and preview views
and after a tour of every slide. Change behaviour in a later version, not while migrating.

## Checklist

1. **The define wrapper.** Replace `DECK.define("m-<name>", class extends DECK.MotionElement { … });` (and any
   `(function(){ … })()` around it) with

   ```js
   egatariParts.define({name: "<name>", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-<name>"}, function(deps){
   "use strict";
   var base = deps.base;
   // module-level helpers and constants, as before
   return class extends base.MotionElement {
     static partName = "<name>";   // = the meta name; base prefixes reports with it (lint checks it)
     …
   };
   });
   ```

   - `name` is the folder (`bars`), `element` the tag (`m-bars`), `version` exactly `2.0.0`, `static partName` = `name`.
   - `requires` lists exactly the parts the code uses, at exact versions: `base: "1.0.0"` always; `plot: "1.0.0"` if it
     draws axes; `expr: "1.0.0"` if it evaluates expressions (m-sweep, m-curves: drop the embedded `egatari-expr` block and
     use `deps.expr.compile`). `shape` comes through base; list it only if the part calls it itself.
   - The factory returns the class (the registry defines it and freezes it).
2. **`extends base.MotionElement`.** It has DECK's `steps`, `from`, `props`, `data`, data-shape check and empty
   `mount`/`render`/`duration`/`cues`, and it contains exceptions (spec §6.1 Containment: one `ctx.report("error",
   "[<partName>] <phase>: …")`, the placeholder, steps from the attribute), so remove try/catch that only kept the
   player alive.
3. **Steps never depend on the context** (spec §8.4, b7520a8). `steps` (and whatever it calls, such as a `plan()`) reads
   only the element's attributes and content: never `ctx`, the language, the mode or the size. Choices by language or
   mode belong in `mount` and `render`. Known case: m-keyboard's `plan()` picks the default note names by `DECK.ja`;
   move that choice out of `plan()` into `mount` (the names do not change the step count).
4. **Variants and preview.** Delete the embedded `---- BEGIN egatari-variant …` block and call `base.variant(this)`
   (names from `static variants`) where the part called `VARIANT.of(this)`. Replace the inline read
   `parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity"))` (+ the 0.45 fallback) with
   `base.previewOpacity(this)`. `ctx.mode === "lecture"` no longer exists: use `ctx.preview` alone.
5. **Helpers.** `DECK.el`, `DECK.mtext`, `DECK.lerp`, `DECK.prog` → `base.el`, `base.mtext`, `base.lerp`, `base.prog`;
   `DECK.clamp01` → `base.clamp`; `DECK.ease(x)` → `base.prog(x, 0, 1)`; `DECK.Plot` → `deps.plot.Plot`. A local alias
   `var D = DECK` can become `var D = base` when only these helpers are used through it.
6. **Reports.** `console.warn` about the lesson's data or the author's markup (a wrong value, a missing label, an element
   too small) → `ctx.report(kind, "[<name>] …")` (`kind` a short code such as `data`, `size`, `range`; keep the English
   message). That needs a ctx: report from `mount`, `render` or `layout`. Warnings only a developer can act on stay
   `console.warn("[<name>] …")`. Throws for data that fits the shape but not the rules may stay: base contains them.
7. **Language.** `DECK.ja` → `ctx.lang.startsWith("ja")`, read in `mount` and kept on the instance (`this.ja`); see 3.
8. **Position events.** A `document.addEventListener("deck:pos", …)` listener becomes
   - `layout(ctx)` when it re-measured text or sizes (the player calls it on resize, font load and when the slide shows,
     then renders again), and/or
   - work done in `render` when `ctx.entered` is true, when it refreshed viewer state that can only change while the
     viewer is on another slide (m-menu's visited marks).
9. **Navigation and viewer state.** `DECK.seek(i, k, t)` / `DECK.go(i, k)` → `ctx.go(slideKey, stepKey?)`;
   `DECK.slides` → `ctx.slides` (`[{key, title, steps}]`, `steps` = the slide's largest numbered step key, 0 if none,
   `concl` not counted; find a slide by key, not by index or element); `DECK.visited(i)` → `ctx.visited(slideKey)`;
   `DECK.mode` → `ctx.mode` (from `mount`); `DECK.resolveFragment` → parse the fragment in the part (`slideOf` in
   `components/menu/index.js`: `#<key>`, `#<key>:<stepKey>` refused above `steps`, legacy `#N`, `%`-escapes).
10. **Errors.** `DECK.componentErrors.push(…)` → `ctx.report(kind, "[<name>] …")`.
11. **Test exports** (`DECK.<name> = {parse, …}`, e.g. m-codetree, m-kanbun, m-kobun, m-gendai, m-syntax):
    - **real logic** that tests (or other parts) use moves to a **library part** of its own, `<name>-core`
      (`codetree-core`, `kanbun-core`, …): `egatariParts.define({name: "<name>-core", version: "1.0.0", requires: {…}},
      …)` without `element`, its own folder with a README (`kind: library`, it gets its own CATALOG.md line), required by
      the element part at its exact version. Run `node tools/catalog.mjs` to add its line (CATALOG.md is generated: on a
      merge conflict there, run it again rather than merging by hand);
    - otherwise a static on the class, `static testing = {parse: parse};`, for this part's own tests only.
    No part reads `testing`, another part's or its own (lint). Tests read it through the registry
    (`EGATARI_PARTS_SHIM.get(name, version)`) or without a browser through `partClass` in `tools/parts.mjs`.
12. **Identifiers.** An id the part writes into the document (style elements, `clipPath`, `mask`, gradients) is named
    `<name>-<version with dashes>-…` and is deterministic (spec §6.1): a counter of the part's own, never `Math.random`,
    time or another part's counter (`++D.Plot.n` in m-curves). Ids inside the component's DOM change its outerHTML, so
    each rewrite must be in the identity test's table `ID_REWRITES` (`tools/test-c2-identity.mjs`) and nothing else is
    allowed. The table already holds the decided ones: `plot-1-0-0-clip<n>` (plot), `curves-2-0-0-<n>` (m-curves masks,
    was `mc<n>`), `heatmap-2-0-0-legend-<n>` (m-heatmap, was `m-heatmap-legend-<n>`). A new rewrite needs a standards
    decision first. Ids outside the component (m-menu's `<style id="menu-2-0-0-css">` in `<head>`) are renamed without
    an entry.
13. **README and changelog.** Frontmatter `version: 2.0.0` (this is what makes the part count as migrated). Add the part's
    own `components/<name>/CHANGELOG.md` with a `## 2.0.0` section: what moved (reports, language, events), every id
    rewrite, and any known difference. Do not edit the repository's CHANGELOG.md or gallery.html for a migration (the
    release summarises the parts' changelogs; a migration does not change the gallery).
14. **Clean.** No `DECK`, `window`, `globalThis`, `import` or `require` left, and no `.testing` read (`node tools/lint.mjs`;
    comments are ignored). `node tools/scan-code.mjs` must pass (an `ALLOW` entry keeps the same counts).
15. **A fixture when the demo is not enough.** If the part has behaviour the v1.13.0 demo does not reach (m-menu's
    out-of-range step links), add `tools/fixtures/c2-identity/<name>.html`, a small deck the identity test builds both
    ways and compares like the demo.

## Derived, never listed

- **Migrated parts**: `migratedNames()` in `tools/parts.mjs` = parts whose `index.js` calls `egatariParts.define` with an
  `element` and whose README frontmatter says `version: 2.x`. Used by `tools/test-c2-identity.mjs`, `tools/studio.mjs`
  (the overlay serves them through the shim), `tools/test-dom-order.mjs`, `tools/gallery.mjs`,
  `tools/variant-sync.mjs` and `tools/expr-sync.mjs` (a migrated part leaves their `USERS` by itself, and a copied block
  left in it is an error).
- **Classes read without a browser** (`tools/pack-bytes.mjs`, `tools/test-part-shape.mjs`): `partClass()` in
  `tools/parts.mjs` reads both forms.
- **Gallery marks**: a migrated part's `index.js` is not "changed" unless it changed between the baseline and v1.13.0.

## Check

```sh
node tools/lint.mjs && node tools/scan-code.mjs && node tools/variant-sync.mjs --check && node tools/expr-sync.mjs --check
node tools/test-c2-identity.mjs --only <name>      # byte-identical to v1.13.0
node tools/test-dom-order.mjs --only <name>        # through the shim; also says the part is defined through the registry
node tools/test-all.mjs                            # the 1.x tests now run the part through the shim
```

The 1.x tests keep working unchanged: `tools/studio.mjs` overlays a migrated part into the pinned Studio as the registry
shim, its requirements and the part (`c2Bundle` in `tools/parts.mjs`; test only, never released). If a 1.x test looked
at a console warning that is now a report, match the report instead (the shim's bridge prints
`[egatariParts] m-<name> (<slide>): <kind>: [<name>] …`; see `tools/test-map-small.mjs`).

## Not in alpha.2

The six parts that draw math with `svgMath` (KaTeX at play time) wait for build-time `tex` (spec §6.2), in alpha.3:
**m-collect, m-cycle, m-fishbone, m-flow, m-timeline, m-tree**. Do not migrate them yet.

## Known gap

`#<key>:concl` on a slide without a conclusion: `ctx.slides` does not say whether a slide has one, so m-menu accepts it
(and marks the card visited), where 1.x refused it. The fixture leaves this case out.

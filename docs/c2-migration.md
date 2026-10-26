# Migrating a part to components 2.0 (alpha.2 recipe)

A checklist for moving one element part from `DECK.define` (1.x) to `egatariParts.define` (2.0, Egatari spec §6.1, §8.4).
Parts can be migrated in parallel: each touches only its own folder, plus one line in a test list where noted. The pilots
are `components/bars` (simple) and `components/menu` (deck:pos, visited, fragments); read their diffs against `v1.13.0`
first (`git diff v1.13.0 -- components/bars/index.js components/menu/index.js`).

The rule of alpha.2: **the 2.0 part draws byte-identical DOM to its v1.13.0 version.** `tools/test-c2-identity.mjs` checks
it on the v1.13.0 demo at every step (35 %, 70 %, end), in the talk and preview views and after a tour of every slide.
Change behaviour in a later release, not while migrating.

## Checklist

1. **The define wrapper.** Replace `DECK.define("m-<name>", class extends DECK.MotionElement { … });` (and any
   `(function(){ … })()` around it) with

   ```js
   egatariParts.define({name: "<name>", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-<name>"}, function(deps){
   "use strict";
   var base = deps.base;
   // module-level helpers and constants, as before
   return class extends base.MotionElement { … };
   });
   ```

   - `name` is the folder (`bars`), `element` the tag (`m-bars`), `version` exactly `2.0.0`.
   - `requires` lists exactly the parts the code uses, at exact versions: `base: "1.0.0"` always; `plot: "1.0.0"` if it
     draws axes; `expr: "1.0.0"` if it evaluates expressions (m-sweep, m-curves: drop the embedded `egatari-expr` block and
     use `deps.expr.compile`, and remove the part from `USERS` in `tools/expr-sync.mjs`). `shape` comes through base; do not
     list it unless the part calls it itself.
   - The factory returns the class (the registry defines it and freezes it). Nothing else is exported.
2. **`extends base.MotionElement`.** It has DECK's `steps`, `from`, `props`, `data`, data-shape check and empty
   `mount`/`render`/`duration`/`cues`, and it contains exceptions (spec §6.1 Containment), so remove any try/catch that
   only existed to keep the player alive.
3. **Variants and preview.** Delete the embedded `---- BEGIN egatari-variant …` block and call `base.variant(this)`
   (names from `static variants`) where the part called `VARIANT.of(this)`; remove the part from `USERS` in
   `tools/variant-sync.mjs`. Replace the inline read
   `parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity"))` (+ the 0.45 fallback) with
   `base.previewOpacity(this)`. `ctx.mode === "lecture"` no longer exists: use `ctx.preview` alone.
4. **Helpers.** `DECK.el`, `DECK.mtext`, `DECK.lerp`, `DECK.prog` → `base.el`, `base.mtext`, `base.lerp`, `base.prog`;
   `DECK.clamp01` → `base.clamp`; `DECK.ease(x)` → `base.prog(x, 0, 1)`; `DECK.Plot` → `deps.plot.Plot`. A local alias
   `var D = DECK` can simply become `var D = base` when only these helpers are used through it.
5. **Reports.** `console.warn` about the lesson's data or the author's markup (a wrong value, a missing label, an element
   too small) → `ctx.report(kind, "[<name>] …")` (`kind` a short code such as `data`, `size`, `range`; keep the English
   message). That needs a ctx: report from `mount`, `render` or `layout`, not from `steps` or a getter. Warnings that only
   a developer can act on stay `console.warn("[<name>] …")`. Exceptions for data that fits the shape but not the rules
   (1.x threw so that DECK showed the placeholder) may stay throws: base's containment reports them and shows the
   placeholder.
6. **Language.** `DECK.ja` → `ctx.lang.startsWith("ja")`, read in `mount` and kept on the instance (`this.ja`).
7. **Position events.** A `document.addEventListener("deck:pos", …)` listener becomes
   - `layout(ctx)` when it re-measured text or sizes (the player calls it on resize, font load and when the slide shows,
     then renders again), and/or
   - work done in `render` when `ctx.entered` is true, when it refreshed viewer state that can only change while the viewer
     is on another slide (m-menu's visited marks).
8. **Navigation and viewer state.** `DECK.seek(i, k, t)` / `DECK.go(i, k)` → `ctx.go(slideKey, stepKey?)`;
   `DECK.slides` → `ctx.slides` (`[{key, title}]`; find a slide by key, not by index or element); `DECK.visited(i)` →
   `ctx.visited(slideKey)`; `DECK.mode` → `ctx.mode` (from `mount`); `DECK.resolveFragment` → parse the fragment in the
   part (see `slideOf` in `components/menu/index.js`: `#<key>`, `#<key>:<stepKey>`, legacy `#N`).
9. **Errors.** `DECK.componentErrors.push(…)` → `ctx.report(kind, "[<name>] …")`.
10. **Test exports.** `DECK.<name> = {parse, …}` for tests → a static on the returned class (`static testing = {parse: parse};`,
    see "Needs a decision" below); the tests then read it through the registry (`EGATARI_PARTS_SHIM.get(name, version)`) or,
    without a browser, by running the part in `node:vm` with a stub `egatariParts`.
11. **Identifiers.** An id the part writes into the document (style elements, `clipPath`, `mask`, gradients) must be
    unique across parts and versions and deterministic (spec §6.1 Identifiers): `<name>-<version with dashes>-…`
    (m-menu's style element is `menu-2-0-0-css`). Ids inside the component's DOM change its outerHTML, so they are a
    deviation from v1.13.0 that the identity test must be told about (only plot's clip ids are allowed today; see below).
    A counter is fine; `Math.random`, time and another part's counter (`++D.Plot.n` in m-curves) are not.
12. **README.** Frontmatter `version: 2.0.0`; nothing else changes for authors.
13. **Clean.** No `DECK`, `window`, `globalThis`, `import` or `require` left (`node tools/lint.mjs` refuses them; comments
    are ignored). `node tools/scan-code.mjs` must pass (if the 1.x file had an `ALLOW` entry, it keeps the same counts).

## Check

```sh
node tools/lint.mjs && node tools/scan-code.mjs
node tools/test-c2-identity.mjs --only <name>      # byte-identical to v1.13.0
node tools/test-dom-order.mjs --only <name>        # through the shim; also says the part is defined through the registry
node tools/test-all.mjs                            # the 1.x tests now run the part through the shim
```

The 1.x tests keep working unchanged: `tools/studio.mjs` overlays a migrated part into the pinned Studio as the registry
shim, its requirements and the part (`tools/parts.mjs` `c2Bundle`; test only, never released). If a 1.x test looked at a
console warning that is now a report, match the report instead (the shim's bridge prints
`[egatariParts] m-<name> (<slide>): <kind>: [<name>] …`; see `tools/test-map-small.mjs`).

## Not in alpha.2

The six parts that draw math with `svgMath` (KaTeX at play time) wait for build-time `tex` (spec §6.2), in alpha.3:
**m-collect, m-cycle, m-fishbone, m-flow, m-timeline, m-tree**. Do not migrate them yet.

## Needs a decision (standards)

- **Test exports.** An element part's factory must return its class (§6.1), so `DECK.<name>` test exports cannot be "the
  factory return" as such. Proposed: a static on the class (`static testing = {…}`), never read by players; or a separate
  library part when another part would share it (m-kanbun's reading-order code).
- **Ids inside the component's DOM.** m-curves (`mc<n>` masks, numbered with `DECK.Plot.n`) and m-heatmap
  (`m-heatmap-legend-<n>` gradients) write ids that §6.1 wants prefixed with name and version. Prefixing breaks byte
  identity with v1.13.0. Proposed: allow "ids a part writes, renamed to `<name>-<x-y-z>-…`" as a documented deviation, as
  for plot's clip ids, and teach the identity test to map them.
- **Language before mount.** m-keyboard chooses its default note names by language in `plan()`, which `steps` calls
  before `mount`; `ctx.lang` only arrives with `mount`. Either the part moves that choice into `mount` (the names do not
  change the step count), or a part needs the language before `mount` (e.g. `ctx.lang` also passed to `steps`).
- **Step links in fragments.** `ctx.slides` has no step counts, so a part that parses `#<key>:<stepKey>` (m-menu) cannot
  tell a step key that is out of range from a valid one; 1.x (`DECK.resolveFragment`) did not mark such a card visited.
  Adding the steps (or the concl step) to `ctx.slides` would close the gap.
- **Report prefix.** base prefixes containment reports with the tag without `m-` (the registry name by this
  repository's rule); a part outside this repository whose tag does not start with `m-` gets the whole tag.

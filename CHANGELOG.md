# Changelog

Versions follow [README.md § Releases and versions](README.md#releases-and-versions). Tags are never moved.

## Unreleased

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

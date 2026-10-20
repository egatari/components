# Changelog

Versions follow [README.md § Releases and versions](README.md#releases-and-versions). Tags are never moved.

## Unreleased

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

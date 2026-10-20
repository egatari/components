# Egatari components

[日本語](README.ja.md)

Animated figures (Web Components) for [Egatari Studio](https://github.com/egatari/egatari-studio): bars that grow step by step, flow diagrams that assemble, curves drawn one by one, kanbun read in order, and more. Studio builds them into Egatari lessons ([format](https://github.com/egatari/egatari-spec)): one HTML file that plays offline.

The list is in **[CATALOG.md](CATALOG.md)**. Each component lives in `components/<name>/`:

| File | What it is |
|---|---|
| `index.js` | the custom element `<m-<name>>` (it follows Studio's [component contract](https://github.com/egatari/egatari-studio/blob/main/docs/contract.md#3-components-web-components)) |
| `README.md` | frontmatter (`name`, `series`, `summary`, `steps`, `props`) and how to use it |
| `demo.html` | a 1–2 slide sample deck |

## Using them

You do not install anything from here. Each Studio release carries a copy of the components it was tested with (`vendor/components/<name>/<version>/`, pinned in `components.lock.json`). Studio maintainers bring in a new release with

```bash
npm run components:update -- v1.0.0
```

which downloads the release tarball, checks it against `manifest.json` and keeps every version it has ever brought in, so that a lesson built with an older version can still be rebuilt exactly.

## Releases and versions

- A release is a tag `vX.Y.Z` with two assets: `egatari-components-vX.Y.Z.tar.gz` (every component's files and `LICENSE`) and `manifest.json` (`name`, `version`, the SHA-256 of the tarball, and the SHA-256 of every file, including each `index.js`). The release notes repeat the tarball's SHA-256. The tarball's hash is byte-exact; the per-file hashes are identity hashes as in [spec §6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles): for text files, CRLF and lone CR become LF and a leading UTF-8 BOM is removed before hashing, so a checkout on any system gives the same hash. Files are stored with LF.
- **Tags are never moved or reused.** A fix is a new version.
- An Egatari file records each registry component as `{name, version, sha256}`, where `sha256` covers `index.js` only ([spec §6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles)). Changing a component's `index.js` (other than its line endings) changes its hash, so editors can tell which version a lesson needs.
- Version numbers: a change that can alter how an existing lesson looks (layout, timing, steps) is a minor or major version; a major version also breaks the data a lesson writes.

How a release is made: [RELEASING.md](RELEASING.md).

## Proposing a component

Open a [proposal issue](https://github.com/egatari/components/issues/new?template=proposal.yml). It asks for an example, the lesson you used it in, a draft of the data, the final state, why inline SVG with Studio's motion primitives is not enough, the rights to everything in it, what must stay readable when static, and where else it would help. The maintainer decides the name at that stage. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

Bugs in a component: [bug report](https://github.com/egatari/components/issues/new?template=bug.yml). Bugs in the editor, the build or a deck go to [Egatari Studio](https://github.com/egatari/egatari-studio/issues).

## Tests

```bash
npm test
```

Node 22 or later and Chrome, Edge or Playwright's Chromium. The tests build every demo with a pinned release of Egatari Studio ([tools/studio.json](tools/studio.json)); the first run clones it into `.studio/` and runs `npm ci` there (the only network access). They check, for each demo: no console errors, a screenshot of each step (mid-motion and final), determinism (the same position draws the same pixels after jumping elsewhere and back), text at least 24 px, no overlapping text or text outside the slide; and that wrong-shaped data shows an inline placeholder instead of throwing. CI runs them on Linux, macOS and Windows.

## History

These components were developed inside Egatari Studio (formerly motion-academic-slides) and moved here with their history in October 2026; v1.0.0 is byte-identical to `components/` in Studio v0.4.3 (commit 8419183).

## License

[MIT](LICENSE), the same as Egatari Studio. The demos' texts are the authors' own, public domain (classical Chinese and Japanese texts) or fictional (company names and numbers).

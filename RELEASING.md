# Releasing

Only the maintainer releases. To withdraw a release, add it to `yanked.json` under `releases`, or a part's version under `parts.<name>` (with a later replacement) and make a new version: published assets and tags are not touched. **A tag is never moved, deleted and recreated, or reused.** If a release is wrong, make the next version.

**A published part version never gets a second hash.** Once a release, a pre-release included, has published `name@version`, that part's code (`index.js`) never changes under that version: any change to it bumps the part's version (README `version:`, the `egatariParts.define` meta, a section in the part's `CHANGELOG.md`), even when the catalogue version does not change (part versions differ from the catalogue's by design, spec §6.1). `published.json` records every published `name@version` with its identity hash, from 2.0.0-rc.1 on; `node tools/published.mjs` (in `npm test`, and `tools/release.mjs` refuses to run otherwise) fails when a recorded version's code has changed.

1. On `main`, with CI green: set `version` in `package.json` to `X.Y.Z`, move `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z - <date>`, run `node tools/published.mjs --record` (adds the new part versions to `published.json`), commit and push. Wait for CI to be green on all three systems.
2. Make the assets from a clean checkout of that commit:
   ```bash
   git status --short            # nothing
   npm test
   node tools/release.mjs X.Y.Z  # dist/egatari-components-vX.Y.Z.tar.gz, dist/manifest.json, and the sha256 line
   ```
3. Tag and release (the notes end with the tarball's sha256 line that `tools/release.mjs` printed). Before the sha line, the notes say how many bytes the READMEs of `m-bars`, `m-flow`, `m-menu`, `m-curves`, `m-quad` and `m-kpi` changed since the previous release (Egatari Studio's free-plan AI pack carries them and sits near its size cap):
   ```bash
   for n in bars flow menu curves quad kpi; do echo "m-$n $(( $(wc -c < components/$n/README.md) - $(git show vPREV:components/$n/README.md | wc -c) ))"; done
   ```
   The pack-visible bytes of every part as Studio's dev counts them (README outside `llm: omit`, frontmatter, prop docs, shape summary): `node tools/pack-bytes.mjs --base vPREV`.

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   gh release create vX.Y.Z dist/egatari-components-vX.Y.Z.tar.gz dist/manifest.json --title vX.Y.Z --notes-file <notes>
   ```
4. Check what was published: download both assets and compare the tarball's sha256 with `manifest.json` and the notes:
   ```bash
   gh release download vX.Y.Z -D /tmp/check && shasum -a 256 /tmp/check/*.tar.gz && grep -A2 '"tarball"' /tmp/check/manifest.json
   ```
5. In Egatari Studio: `npm run components:update -- vX.Y.Z`, then Studio's tests, then a pull request there.

The tarball is deterministic (`tools/tar.mjs`: sorted entries, fixed modes and times, no user names, fixed gzip header), so `node tools/release.mjs X.Y.Z` on the tagged commit gives the same file again (with the same Node major version; zlib may compress differently in another). The manifest's per-file sha256 values do not depend on compression.

## Moving the Studio pin

The tests build, run and check every demo with one commit of Egatari Studio, pinned in `tools/studio.json` (now `03eaf0607598b993eb020f8e619caa53526bc771`, Studio's `main` on 2026-10-26; before that, the v0.4.3 tag's commit `8419183`). A release is tested with the pin it has; moving the pin is its own change, not part of a release.

1. Resolve the full sha: `git ls-remote https://github.com/egatari/egatari-studio main` (or a tag: `refs/tags/vX.Y.Z^{}`). Write it to `commit` (all 40 characters) and say where it came from in `ref` (or `tag`); `tools/studio.mjs` refuses a short sha.
2. `rm -rf .studio && npm test`. `tools/studio.mjs` fetches exactly that commit (a shallow fetch by sha), checks `HEAD` against it and runs `npm ci` there. Newer Studio (after v0.4.x, including the current pin) reads components from `vendor/components/<name>/<version>/` with `components.lock.json`; the overlay writes the components here as version `0.0.0-test` and makes it the default.
3. If Studio's `playwright-core` version changed (its `package-lock.json`), change the version in `.github/workflows/test.yml` to match.
4. Tests that compare with the previous release (`tools/test-default-variant.mjs`) build both sides with the same pinned Studio, so a new pin does not by itself make them differ. If screenshots of a step differ only through the runtime while the component DOM is identical, handle it as `tools/test-components.mjs` handles renderer differences (pass with a note); never loosen a DOM check.

# Releasing

Only the maintainer releases. To withdraw a release, add it to `yanked.json` (with a later replacement) and make a new version: published assets and tags are not touched. **A tag is never moved, deleted and recreated, or reused.** If a release is wrong, make the next version.

1. On `main`, with CI green: set `version` in `package.json` to `X.Y.Z`, move `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z - <date>`, commit and push. Wait for CI to be green on all three systems.
2. Make the assets from a clean checkout of that commit:
   ```bash
   git status --short            # nothing
   npm test
   node tools/release.mjs X.Y.Z  # dist/egatari-components-vX.Y.Z.tar.gz, dist/manifest.json, and the sha256 line
   ```
3. Tag and release (the notes end with the tarball's sha256 line that `tools/release.mjs` printed):
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

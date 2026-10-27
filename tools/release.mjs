// Make the release assets for a version (run on a clean checkout of the commit to tag; CI runs it with --check):
//   node tools/release.mjs 1.0.0 [--out dist]
// Writes
//   dist/egatari-components-v1.0.0.tar.gz   LICENSE and components/<name>/… as <name>/… (every file of each component except out/)
//   dist/manifest.json                       {name, version, tag, repository, license, tarball: {file, sha256, bytes},
//                                             purposes: [{id, ja, en, steps: {ja, en}, reserved?}] (purposes.json's list),
//                                             components: {<name>: {kind: "element", tag, version (the part's own version, README frontmatter version:),
//                                               tier ("standard" | "specialized" | "extra", README frontmatter tier:), set (specialized parts only: stats, math,
//                                               maps, kokugo, english, music, business, tools), display? (README frontmatter display:,
//                                               "<ja> / <en>", when the part has a name other than its tag), build? and glyphs? (the class's
//                                               static build and glyphs, Egatari spec §6.2: fields to render, data to subset, characters
//                                               drawn at play time), series, purposes, variants, interactive?, viewerInput?, clock? (true when index.js declares
//                                               static interactive / viewerInput / clock = true; left out otherwise), preview? ("none" when index.js
//                                               declares static preview = "none": the part shows nothing ahead under preview), license (an SPDX expression,
//                                               only for a part whose README frontmatter has license: other than the repository's MIT), sha256 (of index.js), files: {<path>: sha256}}
//                                               and, for a 2.0 library part (egatariParts.define without element: base, expr),
//                                               {kind: "library", version, requires: {<name>: <exact version>}, license?, sha256, files}},
//                                             (version is the part's; the manifest's own version is the catalogue version, package.json)
//                                             yanked: {<version>: {replacement, reason, date}}  (from yanked.json; Egatari spec §6: a withdrawn release stays available),
//                                             files: {<path in the tarball>: sha256}}
// Per-file and component sha256 values are identity hashes (line endings normalized for text files, Egatari spec §6); the tarball's is byte-exact.
// The tarball is deterministic (tools/tar.mjs): the same files give the same bytes.
// Egatari Studio's `npm run components:update -- v1.0.0` downloads both, checks the tarball's sha256 against the manifest
// and every file against its sha256, and copies the components to vendor/components/<name>/1.0.0/.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, partNames, componentFiles } from './studio.mjs';
import { partMeta, partClass } from './parts.mjs';
import { writeTarGz, readTarGz } from './tar.mjs';
import { identityBytes, normalizeEol } from './identity.mjs';
import { frontmatter, lint, flags } from './lint.mjs';

export const NAME = 'egatari-components';
export const REPOSITORY = 'https://github.com/egatari/components';
const sha = (b) => createHash('sha256').update(b).digest('hex');
// Identity hash (Egatari spec §6): line endings normalized (CRLF and lone CR to LF, leading UTF-8 BOM removed) for text files.
// Every per-file sha256 in manifest.json and each component's sha256 (of index.js) are identity hashes; the tarball's sha256 is byte-exact.
const idSha = (p, b) => sha(identityBytes(p, b));

// yanked.json: releases a registry withdraws (spec §6). Their tags and assets stay as they are; the newest manifest says so.
export function readYanked(version) {
  const y = JSON.parse(fs.readFileSync(path.join(ROOT, 'yanked.json'), 'utf8'));
  const cmp = (a, b) => { const x = a.split('.').map(Number), z = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== z[i]) return x[i] - z[i]; return 0; };
  for (const [v, e] of Object.entries(y)) {
    if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`yanked.json: ${v} is not X.Y.Z`);
    if (!e || typeof e !== 'object' || Object.keys(e).sort().join() !== 'date,reason,replacement') throw new Error(`yanked.json: ${v} needs exactly replacement, reason, date`);
    if (!/^\d+\.\d+\.\d+$/.test(e.replacement) || cmp(e.replacement, v) <= 0) throw new Error(`yanked.json: ${v}: replacement ${e.replacement} must be a later version`);
    if (y[e.replacement]) throw new Error(`yanked.json: ${v}: replacement ${e.replacement} is itself yanked`);
    if (cmp(e.replacement, version) > 0) throw new Error(`yanked.json: ${v}: replacement ${e.replacement} is newer than ${version}`);
    if (typeof e.reason !== 'string' || !e.reason || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`yanked.json: ${v}: reason or date missing`);
    if (v === version) throw new Error(`yanked.json: ${v} is the release being made`);
  }
  return Object.fromEntries(Object.keys(y).sort(cmp).map((v) => [v, y[v]]));
}

export function release(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version ${version} is not X.Y.Z`);
  const errs = lint(ROOT);
  if (errs.length) throw new Error('lint:\n  ' + errs.join('\n  '));
  const entries = [['LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE'))]];
  const components = {};
  for (const name of partNames()) {
    const files = {};
    for (const f of componentFiles(name)) {
      const b = fs.readFileSync(path.join(ROOT, 'components', name, f));
      entries.push([`${name}/${f}`, b]);
      files[f] = idSha(f, b);
    }
    const js = fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8');
    const fl = flags(js), meta = partMeta(js);
    const fm = frontmatter(fs.readFileSync(path.join(ROOT, 'components', name, 'README.md'), 'utf8'));
    const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
    const code = sha(normalizeEol(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'))));
    if (meta && !meta.element) {
      // a 2.0 library part (base, expr): no tag, series or purposes; what it requires, with exact versions
      components[name] = { kind: 'library', version: fm.version, requires: { ...(meta.requires || {}) }, ...(fm.license ? { license: fm.license } : {}), sha256: code, files };
      continue;
    }
    const C = partClass(js, `${name}/index.js`) || {};
    components[name] = { kind: 'element', tag: `m-${name}`, version: fm.version, tier: fm.tier, ...(fm.set ? { set: fm.set } : {}), ...(fm.display ? { display: fm.display } : {}),
      ...(C.build ? { build: JSON.parse(JSON.stringify(C.build)) } : {}), ...(typeof C.glyphs === 'string' ? { glyphs: C.glyphs } : {}), ...(meta ? { requires: { ...(meta.requires || {}) } } : {}), series: fm.series, ...(fm.license ? { license: fm.license } : {}), purposes: list(fm.purposes), variants: list(fm.variants), ...(fl.interactive ? { interactive: true } : {}), ...(fl.viewerInput ? { viewerInput: true } : {}), ...(fl.clock ? { clock: true } : {}), ...(fl.group ? { group: fl.group } : {}), ...(fl.preview ? { preview: fl.preview } : {}), ...(fl.tile ? { tile: fl.tile } : {}), sha256: code, files };
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const gz = writeTarGz(entries);
  const file = `${NAME}-v${version}.tar.gz`;
  const manifest = {
    name: NAME, version, tag: `v${version}`, repository: REPOSITORY, license: 'MIT',
    tarball: { file, sha256: sha(gz), bytes: gz.length },
    // purposes.json rides in the manifest, not the tarball: Studio's updater takes only LICENSE and component folders
    purposes: JSON.parse(fs.readFileSync(path.join(ROOT, 'purposes.json'), 'utf8')).purposes,
    components,
    yanked: readYanked(version),
    files: Object.fromEntries(entries.map(([p, b]) => [p, idSha(p, b)])),
  };
  // the tarball reads back to exactly these files
  const back = readTarGz(gz);
  if (back.size !== entries.length || entries.some(([p, b]) => !back.has(p) || !Buffer.from(back.get(p)).equals(Buffer.from(b)))) throw new Error('the tarball does not read back to the same files');
  return { gz, file, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const oi = args.indexOf('--out');
  const out = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'dist'));
  const version = args.find((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1)) || JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const a = release(version), b = release(version);
  if (!Buffer.from(a.gz).equals(Buffer.from(b.gz))) { console.error('release: the tarball is not deterministic'); process.exit(1); }
  if (check) {
    console.log(`release --check: ${a.file} ${a.manifest.tarball.sha256} (${Object.keys(a.manifest.components).length} components, ${Object.keys(a.manifest.files).length} files, deterministic)`);
  } else {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, a.file), a.gz);
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(a.manifest, null, 2) + '\n');
    console.log(`${path.join(out, a.file)}\n${path.join(out, 'manifest.json')}\nsha256 ${a.manifest.tarball.sha256}  ${a.file}`);
  }
}

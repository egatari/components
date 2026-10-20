// Make the release assets for a version (run on a clean checkout of the commit to tag; CI runs it with --check):
//   node tools/release.mjs 1.0.0 [--out dist]
// Writes
//   dist/egatari-components-v1.0.0.tar.gz   LICENSE and components/<name>/… as <name>/… (every file of each component except out/)
//   dist/manifest.json                       {name, version, tag, repository, license, tarball: {file, sha256, bytes},
//                                             components: {<name>: {tag, series, sha256 (of index.js), files: {<path>: sha256}}},
//                                             files: {<path in the tarball>: sha256}}
// The tarball is deterministic (tools/tar.mjs): the same files give the same bytes.
// Egatari Studio's `npm run components:update -- v1.0.0` downloads both, checks the tarball's sha256 against the manifest
// and every file against its sha256, and copies the components to vendor/components/<name>/1.0.0/.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, componentNames, componentFiles } from './studio.mjs';
import { writeTarGz, readTarGz } from './tar.mjs';
import { frontmatter, lint } from './lint.mjs';

export const NAME = 'egatari-components';
export const REPOSITORY = 'https://github.com/egatari/components';
const sha = (b) => createHash('sha256').update(b).digest('hex');

export function release(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version ${version} is not X.Y.Z`);
  const errs = lint(ROOT);
  if (errs.length) throw new Error('lint:\n  ' + errs.join('\n  '));
  const entries = [['LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE'))]];
  const components = {};
  for (const name of componentNames()) {
    const files = {};
    for (const f of componentFiles(name)) {
      const b = fs.readFileSync(path.join(ROOT, 'components', name, f));
      entries.push([`${name}/${f}`, b]);
      files[f] = sha(b);
    }
    const fm = frontmatter(fs.readFileSync(path.join(ROOT, 'components', name, 'README.md'), 'utf8'));
    components[name] = { tag: `m-${name}`, series: fm.series, sha256: files['index.js'], files };
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const gz = writeTarGz(entries);
  const file = `${NAME}-v${version}.tar.gz`;
  const manifest = {
    name: NAME, version, tag: `v${version}`, repository: REPOSITORY, license: 'MIT',
    tarball: { file, sha256: sha(gz), bytes: gz.length },
    components,
    files: Object.fromEntries(entries.map(([p, b]) => [p, sha(b)])),
  };
  // the tarball reads back to exactly these files
  const back = readTarGz(gz);
  if (back.size !== entries.length || entries.some(([p, b]) => !back.has(p) || sha(back.get(p)) !== sha(b))) throw new Error('the tarball does not read back to the same files');
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

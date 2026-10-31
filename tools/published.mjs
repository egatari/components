// A published part version never gets a second hash (RELEASING.md; Egatari spec §6.1): published.json records, for every
// name@version a release has published (pre-releases included, from 2.0.0-rc.1 on), the identity hash of its index.js
// (line endings normalized, as manifest.json's sha256).
//   node tools/published.mjs            check: every part whose name@version is recorded has that hash (in tools/test-all.mjs)
//   node tools/published.mjs --record   add the current parts (RELEASING.md, before tagging); a recorded entry is never changed
//   node tools/published.mjs --seed <tag>   record the parts as they were at a tag (git), for releases made before this file
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeEol } from './identity.mjs';
import { partMeta } from './parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'published.json');
const sha = (b) => createHash('sha256').update(normalizeEol(b)).digest('hex');

// {name@version: sha256} of the parts in components/ (or at a git tag)
export function currentParts(tag) {
  const names = tag
    ? execFileSync('git', ['ls-tree', '--name-only', `${tag}:components`], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'index.js')));
  const out = {};
  for (const n of names) {
    const b = tag ? execFileSync('git', ['show', `${tag}:components/${n}/index.js`], { cwd: ROOT }) : fs.readFileSync(path.join(ROOT, 'components', n, 'index.js'));
    const m = partMeta(b.toString('utf8'));
    if (!m || m.name !== n || !m.version) throw new Error(`${n}: no egatariParts.define meta with this name and a version`);
    out[`${n}@${m.version}`] = sha(b);
  }
  return out;
}

export function readPublished() { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { parts: {} }; }

export function problems(cur = currentParts(), pub = readPublished()) {
  return Object.entries(cur).filter(([k, h]) => pub.parts[k] && pub.parts[k] !== h)
    .map(([k]) => `${k} was published with another hash: bump the part's version (README version:, the define meta, its CHANGELOG)`);
}

function record(cur) {
  const pub = readPublished(), e = problems(cur, pub);
  if (e.length) throw new Error(e.join('\n'));
  const parts = { ...pub.parts, ...cur };
  fs.writeFileSync(FILE, JSON.stringify({ parts: Object.fromEntries(Object.keys(parts).sort().map((k) => [k, parts[k]])) }, null, 2) + '\n');
  console.log(`published.json: ${Object.keys(parts).length} part versions`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), si = a.indexOf('--seed');
  if (si >= 0) record(currentParts(a[si + 1]));
  else if (a.includes('--record')) record(currentParts());
  else {
    const e = problems();
    if (e.length) { console.error(e.join('\n')); process.exit(1); }
    console.log(`published: ok (${Object.keys(readPublished().parts).length} recorded part versions)`);
  }
}

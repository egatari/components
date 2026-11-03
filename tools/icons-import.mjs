// Imports Tabler Icons (outline, MIT) into the library part `icons`: the pinned npm tarball is downloaded (or read from
// --tarball), its sha256 checked against PIN, and tabler-nodes-outline.json written as the data block between
// /*@egatari-block icons*/ and /*@egatari-block-end*/ in components/icons/index.js (every byte outside the markers stays).
// Brand icons (brand-*: trademarks; the MIT licence covers the drawing, not the mark) and filled icons are left out.
// Paths only: the 24 px viewBox, 2 px stroke and round caps and joins are fixed in the part's code. A path with
// fill="currentColor" is written with a leading "+" (filled and stroked), one with fill="currentColor" stroke="none" with "*".
// Also writes components/icons/names.txt (every name, one per line, for the quality check's "did you mean") and
// components/icons/LICENSE-tabler.txt. To update Tabler, change PIN (an explicit bump) and run again.
// Search words per language (#160), the same shape for every language: components/icons/<lang>.json is
// {"_tabler": <version>, "_lang": <lang>, "<name>": [words, most common first], ...}. en.json is written here from Tabler's
// tags; the other languages are written by hand (ja.json: the core icons) and only checked. Not part of index.js, so a
// lesson's subset never carries them; the editor reads them to search for an icon by a word.
//   node tools/icons-import.mjs [--tarball <icons-x.y.z.tgz>]
//   node tools/icons-import.mjs --check     the block, names.txt, the notice and the word files agree (no network)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT } from './studio.mjs';
import { blockOf, NAME_KEY } from './subset-produce.mjs';

export const PIN = { version: '3.49.0', sha256: 'aa3042907eb0bdb079fd70733e2d75f785683d4726279128a0ca2343099f7074' };
const DIR = path.join(ROOT, 'components', 'icons');
const FILE = path.join(DIR, 'index.js');
const NOTICE = (v) => `Tabler Icons ${v} (https://tabler.io/icons, npm @tabler/icons), outline style, brand icons left out. Copyright (c) 2020-2026 Paweł Kuna. MIT License; see LICENSE-tabler.txt next to this file. Egatari: only each path's d is kept ("+": also filled, "*": filled, not stroked).`;

export function encode(nodes) {
  const out = { _notice: NOTICE(PIN.version) };
  for (const name of Object.keys(nodes).sort()) {
    if (name.startsWith('brand-')) continue;
    if (!NAME_KEY.test(name)) throw new Error(`icons: ${name} is not a name`);
    out[name] = nodes[name].map(([tag, a]) => {
      if (tag !== 'path' || typeof a.d !== 'string') throw new Error(`icons: ${name}: a ${tag} without d`);
      const extra = Object.keys(a).filter((k) => k !== 'd').sort().map((k) => k + '=' + a[k]).join(',');
      if (!extra) return a.d;
      if (extra === 'fill=currentColor') return '+' + a.d;
      if (extra === 'fill=currentColor,stroke=none') return '*' + a.d;
      throw new Error(`icons: ${name}: path attributes ${extra}`);
    });
  }
  return out;
}

// One member per line, so that a diff of a bump shows the icons that changed
const serialise = (o) => '{' + Object.keys(o).map((k) => JSON.stringify(k) + ':' + JSON.stringify(o[k])).join(',\n') + '}';

// The word files next to the part: every <lang>.json
const LANG_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]+)*)\.json$/;
export function wordErrors(file, w, names, version) {
  const errs = [], lang = file.replace(/\.json$/, ''), have = new Set(names);
  if (w._tabler !== version) errs.push(`${file}: _tabler ${w._tabler} is not PIN ${version}`);
  if (w._lang !== lang) errs.push(`${file}: _lang ${w._lang} is not ${lang}`);
  const keys = Object.keys(w).filter((k) => !k.startsWith('_'));
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort())) errs.push(`${file}: names not in order`);
  for (const k of keys) {
    const v = w[k];
    if (!have.has(k)) errs.push(`${file}: ${k} is not an icon of Tabler ${version}`);
    else if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string' || !x.trim() || x !== x.trim()) || new Set(v).size !== v.length) errs.push(`${file}: ${k}: words must be distinct, non-empty strings`);
  }
  return errs;
}
const wordFiles = () => fs.readdirSync(DIR).filter((f) => LANG_FILE.test(f)).sort();

function check() {
  const js = fs.readFileSync(FILE, 'utf8'), data = JSON.parse(blockOf(js, 'icons').json);
  const names = Object.keys(data).filter((k) => !k.startsWith('_'));
  const txt = fs.readFileSync(path.join(DIR, 'names.txt'), 'utf8').split('\n').filter(Boolean);
  const errs = [];
  if (data._notice !== NOTICE(PIN.version)) errs.push('the block\'s _notice is not that of PIN ' + PIN.version);
  if (JSON.stringify(txt) !== JSON.stringify(names)) errs.push('names.txt is not the block\'s names in order');
  if (names.some((n) => n.startsWith('brand-') || !NAME_KEY.test(n))) errs.push('a brand-* or malformed name in the block');
  if (!fs.readFileSync(path.join(DIR, 'LICENSE-tabler.txt'), 'utf8').includes('Paweł Kuna')) errs.push('LICENSE-tabler.txt');
  const langs = wordFiles();
  if (!langs.includes('en.json')) errs.push('en.json is missing');
  for (const f of langs) errs.push(...wordErrors(f, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), names, PIN.version));
  for (const e of errs) console.error('icons-import --check: ' + e);
  if (!errs.length) console.log(`icons-import --check: ok (Tabler ${PIN.version}, ${names.length} icons, block ${(Buffer.byteLength(blockOf(js, 'icons').json) / 1024).toFixed(0)} KB, words ${langs.map((f) => f.replace('.json', '')).join(' ')})`);
  return errs.length ? 1 : 0;
}

async function run(tarball) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-import-'));
  let buf;
  if (tarball) buf = fs.readFileSync(tarball);
  else {
    const r = await fetch(`https://registry.npmjs.org/@tabler/icons/-/icons-${PIN.version}.tgz`);
    if (!r.ok) throw new Error(`download: ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== PIN.sha256) throw new Error(`sha256 ${got} is not the pinned ${PIN.sha256}`);
  const tgz = path.join(work, 'icons.tgz');
  fs.writeFileSync(tgz, buf);
  execFileSync('tar', ['xzf', tgz, '-C', work, 'package/tabler-nodes-outline.json', 'package/icons.json', 'package/LICENSE', 'package/package.json']);
  const pkg = JSON.parse(fs.readFileSync(path.join(work, 'package', 'package.json'), 'utf8'));
  if (pkg.version !== PIN.version || pkg.license !== 'MIT') throw new Error(`package.json: ${pkg.version} ${pkg.license}`);
  const data = encode(JSON.parse(fs.readFileSync(path.join(work, 'package', 'tabler-nodes-outline.json'), 'utf8')));
  const js = fs.readFileSync(FILE, 'utf8'), b = blockOf(js, 'icons');
  fs.writeFileSync(FILE, js.slice(0, b.start) + serialise(data) + js.slice(b.end));
  fs.writeFileSync(path.join(DIR, 'names.txt'), Object.keys(data).filter((k) => !k.startsWith('_')).join('\n') + '\n');
  fs.copyFileSync(path.join(work, 'package', 'LICENSE'), path.join(DIR, 'LICENSE-tabler.txt'));
  const meta = JSON.parse(fs.readFileSync(path.join(work, 'package', 'icons.json'), 'utf8')), en = { _tabler: PIN.version, _lang: 'en' };
  for (const n of Object.keys(data).filter((k) => !k.startsWith('_'))) {
    const tags = [...new Set(((meta[n] && meta[n].tags) || []).map((t) => String(t).trim()).filter(Boolean))];
    if (tags.length) en[n] = tags;
  }
  fs.writeFileSync(path.join(DIR, 'en.json'), serialise(en) + '\n');
  fs.rmSync(work, { recursive: true, force: true });
  return check();
}

const args = process.argv.slice(2);
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(args.includes('--check') ? check() : await run(args.includes('--tarball') ? args[args.indexOf('--tarball') + 1] : null));

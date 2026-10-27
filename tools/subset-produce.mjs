// The stand-in for the producer's subset step (Egatari spec §6.2 Subset), as Studio's build will do it, and the reference for
// whoever writes that: a part declares `static build = {subset: {data, key}}`; the producer keeps only the entries whose
// keys occur in the lesson's text and records `subset: {keys, sha256}` in the part's index.components entry (whose sha256
// stays that of the published part). An editor applies the same subset to its own trusted copy and compares the bytes.
//
// `data` names data embedded in the part's code as "<label>:<field>": the JSON between the markers `/* BEGIN <label>` (a
// comment running to its `*/`) and `/* END <label> */`, and in it the object `<field>`, whose own keys are the subset keys
// (m-kakijun: "OFL-1.1 data:chars", key "char": one entry per character). Everything else in the part is left as it is: the
// code, the markers, the notice in the BEGIN comment (spec §6.1 Notices) and every other field of the block, `_license` first.
//
// The block is written in one canonical form, so that the same kept keys always give the same bytes: the top-level fields
// in their order, one per line as `"name": <JSON>`, but `<field>` with one `"key": <JSON>` entry per line, in the order of
// the full block. The published block is in that form already (tools/kana-embed.mjs), so keeping every key gives the
// published part byte for byte.
//   kept keys   the block's keys that occur in the lesson's text, in the block's order, as one string (spec: "the kept keys")
//   sha256      the identity hash (tools/identity.mjs: line endings normalized) of the subset index.js as written into the file
//
//   node tools/subset-produce.mjs <part folder or index.js> --lesson <deck.html> [--lesson <narration.md> …] [-o <out.js>]
//     prints {name, version, sha256 (the published part), subset: {keys, sha256}, bytes: {full, subset}} and writes the
//     subset code with -o
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { partClass, partMeta } from './parts.mjs';
import { normalizeEol } from './identity.mjs';

export const sha256 = (s) => createHash('sha256').update(normalizeEol(Buffer.from(s, 'utf8'))).digest('hex');

// The part's subset declaration: {data, key, label, field}, or null when it declares none
export function subsetSpec(js) {
  const C = partClass(js);
  const b = C && C.build && C.build.subset;
  if (!b) return null;
  const m = /^(.+):([A-Za-z_$][\w$]*)$/.exec(String(b.data || ''));
  if (!m || typeof b.key !== 'string') throw new Error(`subset: build.subset ${JSON.stringify(b)} is not {data: "<label>:<field>", key}`);
  return { data: b.data, key: b.key, label: m[1], field: m[2] };
}

// Where the block is: js.slice(start, end) is its JSON
export function blockOf(js, label) {
  const begin = '/* BEGIN ' + label, endMark = '/* END ' + label + ' */';
  const b = js.indexOf(begin);
  if (b < 0 || js.indexOf(begin, b + 1) >= 0) throw new Error(`subset: the part needs exactly one "${begin}" marker`);
  const close = js.indexOf('*/', b);
  const end = js.indexOf(endMark, close);
  if (close < 0 || end < 0 || js.indexOf(endMark, end + 1) >= 0) throw new Error(`subset: no single "${endMark}" after "${begin}"`);
  return { start: close + 2, end, json: js.slice(close + 2, end) };
}

// The canonical form of the block (see the top of this file); the text before and after the JSON (newlines) is kept by blockOf
export function canonical(obj, field) {
  return '{' + Object.keys(obj).map((k) => {
    if (k !== field) return JSON.stringify(k) + ': ' + JSON.stringify(obj[k]);
    const e = Object.entries(obj[k]).map(([x, v]) => JSON.stringify(x) + ': ' + JSON.stringify(v));
    return JSON.stringify(k) + ': {' + (e.length ? '\n' + e.join(',\n') + '\n' : '') + '}';
  }).join(',\n') + '}';
}

// The part's code with the block's <field> cut down to `keys` (a string or set of characters; keys the block does not have
// are ignored). Returns {code, keys}: keys = the kept keys in the block's order, as one string.
export function subsetCode(js, keys) {
  const spec = subsetSpec(js);
  if (!spec) throw new Error('subset: the part declares no build.subset');
  const want = new Set(typeof keys === 'string' ? Array.from(keys) : keys);
  const { start, end, json } = blockOf(js, spec.label);
  const lead = json.match(/^\s*/)[0], tail = json.match(/\s*$/)[0];
  const obj = JSON.parse(json);
  const map = obj[spec.field];
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error(`subset: the block has no object "${spec.field}"`);
  const kept = Object.keys(map).filter((k) => want.has(k));
  obj[spec.field] = Object.fromEntries(kept.map((k) => [k, map[k]]));
  return { code: js.slice(0, start) + lead + canonical(obj, spec.field) + tail + js.slice(end), keys: kept.join('') };
}

// The characters of the lesson's text: every file given (deck.html, narration.md), comments and <style> left out. Tags,
// attribute names and entities are ASCII, so the kana and kanji that remain are the slides' text, the parts' own data
// (attributes such as m-kakijun's text="…", JSON children) and the narration; a few characters too many only keep a few
// more entries, never fewer.
export function lessonChars(texts) {
  const set = new Set();
  for (const t of texts) {
    const s = String(t).replace(/<!--[\s\S]*?-->/g, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
    for (const c of s) set.add(c);
  }
  return set;
}

// The whole step: the subset code and what the index records
export function produce(js, texts) {
  const { code, keys } = subsetCode(js, lessonChars(texts));
  return { code, keys, sha256: sha256(code), full: sha256(js) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let part = null, out = null;
  const lessons = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lesson') lessons.push(args[++i]);
    else if (args[i] === '-o') out = args[++i];
    else part = args[i];
  }
  if (!part || !lessons.length) { console.error('node tools/subset-produce.mjs <part folder or index.js> --lesson <deck.html> [--lesson <narration.md>] [-o <out.js>]'); process.exit(2); }
  const file = fs.statSync(part).isDirectory() ? path.join(part, 'index.js') : part;
  const js = fs.readFileSync(file, 'utf8');
  const meta = partMeta(js) || {};
  const r = produce(js, lessons.map((f) => fs.readFileSync(f, 'utf8')));
  if (out) fs.writeFileSync(out, r.code);
  console.log(JSON.stringify({ name: meta.name, version: meta.version, sha256: r.full, subset: { keys: r.keys, sha256: r.sha256 },
    bytes: { full: Buffer.byteLength(js), subset: Buffer.byteLength(r.code) } }, null, 1));
}

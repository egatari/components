// The stand-in for the producer's subset step (Egatari spec §6.2 Subset, egatari-spec ce96072; subset by name 87175aa), as Studio's build will do it,
// and the reference for whoever writes that: a part declares `static build = {subset: {data, key}}` (or an array of such
// entries); the producer keeps only the entries whose keys occur in the lesson's text and records `subset: {keys, sha256}` in
// the part's index.components entry (whose sha256 stays that of the published part). An editor applies the same subset to
// its own trusted copy and compares the bytes.
//
// `data` is `block:<name>` (<name> ^[a-z][a-z0-9-]{0,63}$): the JSON value in the part's code between the comments
// /*@egatari-block <name>*/ and /*@egatari-block-end*/, whose members (an object) or items (an array of objects, by the
// field `key`) are keyed by `key`. (A field of the lesson's data is the other form; this stand-in has no part that uses it.)
// The block is re-serialised canonically: JSON.stringify of the kept value, members in their original order, no added
// whitespace; members whose names begin with "_" (the licence notice, m-kakijun's _box …) are kept unchanged and first.
// Every byte outside the markers stays as it was.
//   kept keys   the keys kept in any `char` block, in code point order, as one string (spec: "the kept keys"; "" if none)
//   names       for a part with a `match: "name"` entry: the names kept in any such block, in code point order, as an array.
//               A name entry's keys match NAME_KEY; the lesson's text is split at every character outside a-z, 0-9 and "-",
//               and a key is kept when it equals a token exactly (so chart-bar-popular does not keep chart-bar); the
//               entry's `keep` names are always kept
//   sha256      the identity hash (tools/identity.mjs: line endings normalized) of the subset index.js as written into the file
//
//   node tools/subset-produce.mjs <part folder or index.js> --lesson <deck.html> [--lesson <narration.md> …] [-o <out.js>]
//     prints {name, version, sha256 (the published part), subset: {keys, names?, sha256}, bytes: {full, subset}} and writes the
//     subset code with -o
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { partDeclarations, partMeta } from './parts.mjs';
import { normalizeEol } from './identity.mjs';

export const sha256 = (s) => createHash('sha256').update(normalizeEol(Buffer.from(s, 'utf8'))).digest('hex');

export const BLOCK_NAME = /^[a-z][a-z0-9-]{0,63}$/;
export const BLOCK = (name) => `/*@egatari-block ${name}*/`;
export const BLOCK_END = '/*@egatari-block-end*/';
export const NAME_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cpOrder = (a, b) => { const x = Array.from(a), y = Array.from(b); for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; } return x.length - y.length; };

// The part's subset declarations (an element class's static build, or a library factory's returned build): [{data, key, block, match, keep}] (block: the name, for data "block:<name>"; match "char"
// (the default) or "name"; keep: the names a "name" entry always keeps), [] when it declares none
export function subsetSpecs(js) {
  const b = (partDeclarations(js).build || {}).subset;
  if (!b) return [];
  return (Array.isArray(b) ? b : [b]).map((e) => {
    if (!e || typeof e.data !== 'string' || typeof e.key !== 'string') throw new Error(`subset: build.subset entry ${JSON.stringify(e)} is not {data, key}`);
    const m = /^block:(.*)$/.exec(e.data);
    if (!m) throw new Error(`subset: ${e.data}: a lesson data path (this stand-in subsets only block:<name> data)`);
    if (!BLOCK_NAME.test(m[1])) throw new Error(`subset: block name ${JSON.stringify(m[1])} does not match ${BLOCK_NAME}`);
    const match = e.match === undefined ? 'char' : e.match;
    if (match !== 'char' && match !== 'name') throw new Error(`subset: ${e.data}: match ${JSON.stringify(e.match)} is not "char" or "name"`);
    if (e.keep !== undefined && (match !== 'name' || !Array.isArray(e.keep) || !e.keep.every((k) => typeof k === 'string' && NAME_KEY.test(k))))
      throw new Error(`subset: ${e.data}: keep is an array of names (${NAME_KEY}) on a match: "name" entry`);
    return { data: e.data, key: e.key, block: m[1], match, keep: e.keep || [] };
  });
}

// Where block <name> is: js.slice(start, end) is its JSON (exactly one begin marker; the first end marker after it)
export function blockOf(js, name) {
  const begin = BLOCK(name), b = js.indexOf(begin);
  if (b < 0 || js.indexOf(begin, b + 1) >= 0) throw new Error(`subset: the part needs exactly one ${begin}`);
  const end = js.indexOf(BLOCK_END, b + begin.length);
  if (end < 0) throw new Error(`subset: no ${BLOCK_END} after ${begin}`);
  const nested = js.indexOf('/*@egatari-block ', b + begin.length);
  if (nested >= 0 && nested < end) throw new Error(`subset: ${begin} is not closed before the next block`);
  return { start: b + begin.length, end, json: js.slice(b + begin.length, end) };
}

// The kept value: an object keeps its "_" members (first, unchanged) and the members whose names are kept; an array keeps
// the items whose `key` field is kept. Returns {value, kept: [keys]}
export function keep(value, key, want) {
  if (Array.isArray(value)) {
    const items = value.filter((x) => x && typeof x === 'object' && want.has(String(x[key])));
    return { value: items, kept: items.map((x) => String(x[key])) };
  }
  if (!value || typeof value !== 'object') throw new Error('subset: a block is an object or an array');
  const names = Object.keys(value), meta = names.filter((k) => k.startsWith('_')), kept = names.filter((k) => !k.startsWith('_') && want.has(k));
  return { value: Object.fromEntries([...meta, ...kept].map((k) => [k, value[k]])), kept };
}

// The part's code with every declared block cut down: `char` entries to `keys` (a string or set of characters), `name`
// entries to `names` (an array or set of tokens) and their `keep`; keys a block does not have are ignored. Returns
// {code, keys, names}: keys = the keys kept in any char block, in code point order, as one string; names = the names kept in
// any name block, in code point order (null when the part has no name entry).
export function subsetCode(js, keys, names = []) {
  const specs = subsetSpecs(js);
  if (!specs.length) throw new Error('subset: the part declares no build.subset');
  const chars = new Set(typeof keys === 'string' ? Array.from(keys) : keys), tokens = new Set(names), kc = new Set(), kn = new Set();
  let code = js;
  for (const sp of specs) {
    const { start, end, json } = blockOf(code, sp.block);
    const value = JSON.parse(json);
    if (sp.match === 'name') {
      const bad = (Array.isArray(value) ? value.map((x) => x && String(x[sp.key])) : Object.keys(value).filter((k) => !k.startsWith('_'))).filter((k) => !NAME_KEY.test(k));
      if (bad.length) throw new Error(`subset: block ${sp.block}: keys ${JSON.stringify(bad.slice(0, 5))} are not names (${NAME_KEY})`);
    }
    const r = keep(value, sp.key, sp.match === 'name' ? new Set([...tokens, ...sp.keep]) : chars);
    r.kept.forEach((k) => (sp.match === 'name' ? kn : kc).add(k));
    code = code.slice(0, start) + JSON.stringify(r.value) + code.slice(end);
  }
  return { code, keys: [...kc].sort(cpOrder).join(''), names: specs.some((sp) => sp.match === 'name') ? [...kn].sort(cpOrder) : null };
}

// The characters of the lesson's text: every file given (deck.html, narration.md), comments and <style> left out. Tags,
// attribute names and entities are ASCII, so the kana and kanji that remain are the slides' text, the parts' own data
// (attributes such as m-kakijun's text="…", JSON children) and the narration; a few characters too many only keep a few
// more entries, never fewer.
const lessonText = (t) => String(t).replace(/<!--[\s\S]*?-->/g, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
export function lessonChars(texts) {
  const set = new Set();
  for (const t of texts) for (const c of lessonText(t)) set.add(c);
  return set;
}

// The tokens of the lesson's text for name entries: the same text as lessonChars, split at every character outside a-z, 0-9
// and "-" (case is not folded)
export function lessonTokens(texts) {
  const set = new Set();
  for (const t of texts) for (const w of lessonText(t).split(/[^a-z0-9-]+/)) if (w) set.add(w);
  return set;
}

// The whole step: the subset code and what the index records (names only for a part with a name entry)
export function produce(js, texts) {
  const { code, keys, names } = subsetCode(js, lessonChars(texts), lessonTokens(texts));
  return { code, keys, ...(names ? { names } : {}), sha256: sha256(code), full: sha256(js) };
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
  console.log(JSON.stringify({ name: meta.name, version: meta.version, sha256: r.full, subset: { keys: r.keys, ...(r.names ? { names: r.names } : {}), sha256: r.sha256 },
    bytes: { full: Buffer.byteLength(js), subset: Buffer.byteLength(r.code) } }, null, 1));
}

// The stand-in for the producer's subset step (Egatari spec §6.2 Subset, egatari-spec ce96072; subset by name 87175aa; library parts 3d4ead0; lesson text, string keys and bad declarations 6f2670b), as Studio's build will do it,
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
//     (a .md lesson file is narration, counted as written; any other is the slide source)
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
    const bad = value.find((x) => !x || typeof x !== 'object' || typeof x[key] !== 'string');
    if (bad !== undefined) throw new Error(`subset: an item ${JSON.stringify(bad).slice(0, 60)} has no string ${key} (keys are strings)`);
    const items = value.filter((x) => want.has(x[key]));
    return { value: items, kept: items.map((x) => x[key]) };
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
      const bad = (Array.isArray(value) ? value.map((x) => x && x[sp.key]) : Object.keys(value).filter((k) => !k.startsWith('_'))).filter((k) => typeof k !== 'string' || !NAME_KEY.test(k));
      if (bad.length) throw new Error(`subset: block ${sp.block}: keys ${JSON.stringify(bad.slice(0, 5))} are not names (${NAME_KEY})`);
    }
    const r = keep(value, sp.key, sp.match === 'name' ? new Set([...tokens, ...sp.keep]) : chars);
    r.kept.forEach((k) => (sp.match === 'name' ? kn : kc).add(k));
    code = code.slice(0, start) + JSON.stringify(r.value) + code.slice(end);
  }
  return { code, keys: [...kc].sort(cpOrder).join(''), names: specs.some((sp) => sp.match === 'name') ? [...kn].sort(cpOrder) : null };
}

// The lesson's text (spec §6.2, egatari-spec 6f2670b), piece by piece, the pieces joined by a line feed:
//   counted      text nodes and attribute values of the slide source (character references decoded); the narration as
//                written; the data passed to parts (<script type="application/json"> children) as parsed JSON: member names,
//                string values and numbers (String(n)), in document order (invalid JSON: one piece, as written); the
//                part's glyphs
//   not counted  comments, tag and attribute names, other <script> and <style> contents
// A lesson is a list of sources: {html: "…"} (deck.html), {narration: "…"} (narration.md), or a string (= html).
// Character references as an HTML parser yields them (WHATWG HTML §13.2.5.72–80): the full named table
// (tools/html-entities.json; the longest name that matches, legacy names also without ";", but in an attribute value not
// when the name lacks ";" and the next character is "=" or alphanumeric), numeric references with or without ";" (0,
// surrogates and values past U+10FFFF become U+FFFD, 0x80–0x9F the windows-1252 characters). Unknown references stay.
const ENT = JSON.parse(fs.readFileSync(new URL('./html-entities.json', import.meta.url), 'utf8'));
const ENT_MAX = Math.max(...Object.keys(ENT).map((k) => k.length));
const W1252 = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039,
  0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161,
  0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
export function decodeRefs(s, attr = false) {
  let out = '', i = 0;
  while (i < s.length) {
    const a = s.indexOf('&', i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    i = a + 1;
    const num = /^#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?/.exec(s.slice(i, i + 40));
    if (num) {
      let n = num[1] !== undefined ? parseInt(num[1], 16) : parseInt(num[2], 10);
      if (n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) || !Number.isFinite(n)) n = 0xfffd;
      else if (W1252[n]) n = W1252[n];
      out += String.fromCodePoint(n);
      i += num[0].length;
      continue;
    }
    let hit = null;
    for (let len = Math.min(ENT_MAX, s.length - i); len > 0; len--) { const k = s.slice(i, i + len); if (Object.prototype.hasOwnProperty.call(ENT, k) && k !== '_source') { hit = k; break; } }
    if (hit && !(attr && !hit.endsWith(';') && /[=A-Za-z0-9]/.test(s[i + hit.length] || ''))) { out += ENT[hit]; i += hit.length; }
    else out += '&';
  }
  return out;
}
export function jsonPieces(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => jsonPieces(x, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.push(k); jsonPieces(v[k], out); }
  return out;
}
export function htmlPieces(html) {
  const out = [], s = String(html).replace(/\r\n?/g, '\n'), re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let at = 0, m;
  const text = (t) => { if (t) out.push(decodeRefs(t)); };
  while ((m = re.exec(s))) {
    text(s.slice(at, m.index));
    at = re.lastIndex;
    if (!m[2]) continue;   // a comment
    const tag = m[2].toLowerCase(), attrs = {};
    for (const a of m[3].matchAll(/([^\s=/>"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
      if (a[2] === undefined) continue;
      const v = a[3] ?? a[4] ?? a[5];
      attrs[a[1].toLowerCase()] = v;
      out.push(decodeRefs(v, true));
    }
    if (!m[1] && (tag === 'script' || tag === 'style')) {
      const close = s.toLowerCase().indexOf('</' + tag, at), body = s.slice(at, close < 0 ? s.length : close);
      if (tag === 'script' && /^application\/json$/i.test((attrs.type || '').trim())) {
        let v, okJson = true;
        try { v = JSON.parse(body); } catch { okJson = false; }
        if (okJson) jsonPieces(v, out); else out.push(body);
      }
      at = close < 0 ? s.length : close;
      re.lastIndex = at;
    }
  }
  text(s.slice(at));
  return out;
}
export function lessonText(sources, glyphs = '') {
  const pieces = [];
  for (const src of sources) {
    if (typeof src === 'string' || src.html !== undefined) pieces.push(...htmlPieces(typeof src === 'string' ? src : src.html));
    else if (src.narration !== undefined) pieces.push(String(src.narration));
    else throw new Error('subset: a lesson source is {html} or {narration}');
  }
  if (glyphs) pieces.push(glyphs);
  return pieces.join('\n');
}
export const lessonChars = (sources, glyphs) => new Set(lessonText(sources, glyphs));
// The tokens for name entries: the same text split at every character outside a-z, 0-9 and "-" (case is not folded)
export const lessonTokens = (sources, glyphs) => new Set(lessonText(sources, glyphs).split(/[^a-z0-9-]+/).filter(Boolean));

// The whole step, as a lesson producer does it: the subset code and what the index records (names only for a part with a
// name entry). A bad declaration (spec: the producer warns and keeps the part whole) returns {code: js, warning} and no
// subset; registry-side tools (icons-import --check, release, tests) call subsetCode, which throws, and reject the part.
export function produce(js, sources) {
  let r;
  try { r = subsetCode(js, lessonChars(sources, partDeclarations(js).glyphs), lessonTokens(sources, partDeclarations(js).glyphs)); }
  catch (e) { return { code: js, warning: String(e.message), sha256: sha256(js), full: sha256(js) }; }
  return { code: r.code, keys: r.keys, ...(r.names ? { names: r.names } : {}), sha256: sha256(r.code), full: sha256(js) };
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
  const r = produce(js, lessons.map((f) => (/\.md$/i.test(f) ? { narration: fs.readFileSync(f, 'utf8') } : { html: fs.readFileSync(f, 'utf8') })));
  if (r.warning) console.error(`subset-produce: warning: ${r.warning}; the part is kept whole (no subset)`);
  if (out) fs.writeFileSync(out, r.code);
  console.log(JSON.stringify({ name: meta.name, version: meta.version, sha256: r.full, ...(r.warning ? {} : { subset: { keys: r.keys, ...(r.names ? { names: r.names } : {}), sha256: r.sha256 } }),
    bytes: { full: Buffer.byteLength(js), subset: Buffer.byteLength(r.code) } }, null, 1));
}

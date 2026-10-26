// Parity of the shape library part (components/shape, components 2.0) with the pinned Studio's DECK.shape (kit/shape.js;
// tools/studio.json), without a browser (both are pure). Every function gives the same result, text for text:
//   check(schema, value)   on every component's declared shapes (static shape.schema and the shape of json props), with their
//                          examples and many altered values (wrong types, members removed, unknown and misspelt members,
//                          empty, short and long arrays, values outside an enum, NaN and Infinity), so every why (type,
//                          required, anyOf, enum, minItems, maxItems, unknown) and every message is compared
//   describe(schema, depth), brief(schema)   on the same shapes;  gotOf, typeOf, near, dataLike   on many values
//   node tools/test-part-shape.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio, pinLabel, componentNames } from './studio.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const S = await studio();
// the reference: kit/shape.js as Studio loads it (DECK.shape)
const refCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(S.dir, 'kit', 'shape.js'), 'utf8'), refCtx, { filename: 'kit/shape.js' });
const REF = refCtx.DECK.shape;
// the part, through the test-only registry
const partCtx = vm.createContext({ console: { warn() {} }, HTMLElement: class {}, customElements: { get() {}, define() {} } });
partCtx.globalThis = partCtx;
vm.runInContext(read('tools/registry-shim.js'), partCtx, { filename: 'tools/registry-shim.js' });
vm.runInContext(read('components/shape/index.js'), partCtx, { filename: 'components/shape/index.js' });
const SH = partCtx.EGATARI_PARTS_SHIM.get('shape', '1.0.0');
ok(SH && Object.keys(SH).join() === Object.keys(REF).join(), `shape returns DECK.shape's members (${Object.keys(REF).join(', ')})`);

// the shapes the components declare today (read as tools/pack-bytes.mjs reads them: a stub DECK.define)
const shapes = [];
for (const name of componentNames()) {
  let cls = null;
  const D = { define: (n, c) => { cls = c; }, MotionElement: class {} };
  const ctx = vm.createContext({ DECK: D, window: { DECK: D }, console: { warn() {} } });
  try { vm.runInContext(read(`components/${name}/index.js`), ctx, { filename: `${name}/index.js` }); } catch { /* a part that needs a browser to load */ }
  if (!cls) continue;
  const sh = cls.shape;
  if (sh && sh.schema) shapes.push({ where: `m-${name} shape`, schema: sh.schema, example: sh.example });
  for (const [p, d] of Object.entries(cls.props || {})) if (d && d.shape) shapes.push({ where: `m-${name} prop ${p}`, schema: d.shape, example: d.example !== undefined ? d.example : d.default });
}
// a few written here, for what the components do not use
shapes.push({ where: 'test enum', schema: { enum: ['a', 'b', 1] }, example: 'a' });
shapes.push({ where: 'test anyOf', schema: { type: 'object', properties: { f: { type: 'string' }, pts: { type: 'array', items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } } }, anyOf: [{ required: ['f'] }, { required: ['pts'] }], additionalProperties: false }, example: { f: 'x' } });
shapes.push({ where: 'test types', schema: { type: ['string', 'number', 'null'] }, example: 1 });
shapes.push({ where: 'test integer', schema: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'integer' } }, example: [1, 2] });
shapes.push({ where: 'test none', schema: null, example: 1 });

// values altered from an example: every member replaced, removed or misspelt, arrays emptied and grown
const WRONG = [null, 'x', '1.5', 1, 1.5, -0, NaN, Infinity, true, [], {}, [1], { label: 1 }, undefined];
function variants(v, depth = 0) {
  const out = [v, ...WRONG];
  if (depth > 3) return out;
  if (Array.isArray(v)) {
    out.push([], v.slice(0, 1), v.concat(v, v, v), v.map(() => null));
    if (v.length) for (const w of variants(v[0], depth + 1)) out.push([w, ...v.slice(1)]);
  } else if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    out.push({ ...v, lable: 'x' }, { ...v, valu: 1 }, { ...v, fn: 'x' });
    for (const k of keys) {
      const { [k]: _, ...rest } = v;
      out.push(rest, { ...rest, [k.slice(0, -1) || 'z']: v[k] }, { ...rest, [k + 's']: v[k] });
      for (const w of variants(v[k], depth + 1)) out.push({ ...v, [k]: w });
    }
  }
  return out;
}
const J = (x) => JSON.stringify(x, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v === undefined ? '(undefined)' : v));
let n = 0;
const diffs = [];
const same = (what, a, b) => { n++; if (J(a) !== J(b) && diffs.length < 5) diffs.push(`${what}: part ${J(a)} vs DECK ${J(b)}`); };
const whys = new Set();
for (const s of shapes) {
  for (const d of [undefined, 0, 1, 2, 3]) same(`${s.where} describe ${d}`, SH.describe(s.schema, d), REF.describe(s.schema, d));
  same(`${s.where} brief`, SH.brief(s.schema), REF.brief(s.schema));
  const ex = s.example !== undefined ? JSON.parse(JSON.stringify(s.example)) : null;
  for (const v of variants(ex)) {
    const a = SH.check(s.schema, v), b = REF.check(s.schema, v);
    same(`${s.where} check ${J(v)}`, a, b);
    same(`${s.where} check at path`, SH.check(s.schema, v, 'data'), REF.check(s.schema, v, 'data'));
    if (b) whys.add(b.why);
  }
}
const VALUES = [null, undefined, 0, -0, 1, 1.5, -2, NaN, Infinity, -Infinity, '', 'abc', 'a'.repeat(40), '"quoted"', true, false, [], [1, 2, 3], {}, { a: 1, b: 2, c: 3, d: 4, e: 5 }, () => 1, Symbol.iterator];
for (const v of VALUES) { same(`gotOf ${String(typeof v === 'symbol' ? 'symbol' : J(v))}`, SH.gotOf(v), REF.gotOf(v)); same('typeOf', SH.typeOf(v), REF.typeOf(v)); }
const NAMES = ['label', 'value', 'values', 'f', 'pts', 'tone', 'step', 'series', 'groups', 'from', 'to', 'x', 'y'];
for (const k of ['lable', 'valu', 'value', 'fn', 'Label', 'pt', 'points', 'tones', 'stp', 'serie', 'grp', 'x', 'zzz', '', 'fromm', 'y2']) same(`near ${k}`, SH.near(k, NAMES), REF.near(k, NAMES));
for (const m of ['S.map is not a function', 'x is not iterable', "Cannot read properties of undefined (reading 'length')", 'boom', '', null, 'Reduce of empty array with no initial value', 'Invalid array length', 'q is not defined']) same(`dataLike ${m}`, SH.dataLike(m), REF.dataLike(m));

console.log(`(reference: ${pinLabel()} kit/shape.js)`);
ok(shapes.length >= 30, `${shapes.length} shapes (the components' static shape and json-prop shapes, and 5 written here)`);
ok(['type', 'required', 'enum', 'minItems', 'maxItems', 'unknown', 'anyOf'].every((w) => whys.has(w)), `the altered values reach every kind of mismatch (${[...whys].sort().join(', ')})`);
ok(diffs.length === 0, `check, describe, brief, gotOf, typeOf, near and dataLike ≡ DECK.shape (${n} comparisons, text for text)` + (diffs.length ? '\n     ' + diffs.join('\n     ') : ''));

console.log(fails ? `\n${fails} failure(s)` : '\ntest-part-shape: ok');
process.exit(fails ? 1 : 0);

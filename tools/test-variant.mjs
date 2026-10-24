// The variant chooser (tools/variant.js, docs/conventions.md §1.4), without a browser:
// seed 0 gives variant 0; the choice is deterministic and roughly uniform; adding a variant changes only the seeds where the
// new one wins; attributes are read in the order variant → seed → data-egatari-seed → 0; bad seeds and names warn.
//   node tools/test-variant.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

const warns = [];
const root = { attrs: {}, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; } };
const classes = {};
const ctx = { console: { warn: (m) => warns.push(m) }, document: { documentElement: root }, customElements: { get: (n) => classes[n] }, Math, String, JSON };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tools', 'variant.js'), 'utf8') + '\nthis.VARIANT = VARIANT;', ctx);
const V = ctx.VARIANT;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL ' + m); } };

const names = ['count', 'rise', 'flip', 'underline'];
ok(V.pick(0, 'm-kpi', names) === 'count', 'seed 0 gives variant 0');
ok(V.pick(7, 'm-kpi', names) === V.pick(7, 'm-kpi', names), 'deterministic');
const N = 20000, tally = {};
for (let s = 1; s <= N; s++) { const v = V.pick(s, 'm-kpi', names); tally[v] = (tally[v] || 0) + 1; }
for (const v of names) ok(Math.abs(tally[v] / N - 0.25) < 0.02, `roughly uniform: ${v} ${(tally[v] / N).toFixed(3)}`);
let moved = 0;
for (let s = 1; s <= N; s++) { const a = V.pick(s, 'm-kpi', names), b = V.pick(s, 'm-kpi', [...names, 'new']); if (a !== b) { moved++; ok(b === 'new', 'a change only to the new variant'); } }
ok(Math.abs(moved / N - 0.2) < 0.02, `adding a 5th variant moves about 1/5 (${(moved / N).toFixed(3)})`);
let same = 0;
for (let s = 1; s <= 2000; s++) if (V.pick(s, 'm-kpi', names) === V.pick(s, 'm-bars', names)) same++;
ok(same / 2000 < 0.4, `components choose independently (${(same / 2000).toFixed(3)} agree)`);

class K { static variants = names; }
classes['m-kpi'] = K;
const el = (attrs) => Object.assign(Object.create(K.prototype), { tagName: 'M-KPI', getAttribute: (n) => (n in attrs ? attrs[n] : null) });
root.attrs = {};
ok(V.of(el({})) === 'count', 'no seed anywhere: variant 0');
root.attrs = { 'data-egatari-seed': '7' };
ok(V.of(el({})) === V.pick(7, 'm-kpi', names), 'lesson seed');
ok(V.of(el({ seed: '9' })) === V.pick(9, 'm-kpi', names), 'component seed overrides the lesson seed');
ok(V.of(el({ seed: '0' })) === 'count', 'component seed 0 overrides a lesson seed');
ok(V.of(el({ seed: '9', variant: 'flip' })) === 'flip', 'variant overrides any seed');
warns.length = 0;
ok(V.of(el({ variant: 'spin' })) === 'count' && warns.length === 1, 'unknown variant: warning and variant 0');
for (const bad of ['-1', '1.5', 'x', '4294967296', '']) {
  warns.length = 0; root.attrs = { 'data-egatari-seed': bad };
  ok(V.of(el({})) === 'count' && warns.length === 1, `bad lesson seed ${JSON.stringify(bad)}: warning and seed 0`);
}
root.attrs = { 'data-egatari-seed': '4294967295' };
ok(V.seed(el({})) === 4294967295, 'largest seed');
const r1 = V.rng(el({ seed: '3' }), 'order'), r2 = V.rng(el({ seed: '3' }), 'order');
const xs = [r1(), r1(), r1()];
ok(xs.join() === [r2(), r2(), r2()].join() && xs.every((x) => x >= 0 && x < 1), 'seeded generator');
console.log(fail ? `\n${fail} failure(s)` : 'test-variant: ok');
process.exit(fail ? 1 : 0);

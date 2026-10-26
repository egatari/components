// The variant chooser (tools/variant.js, docs/conventions.md §1.4), without a browser: a part's variant is its `variant`
// attribute when that names one of its `static variants`, otherwise the first name. There is no seed (spec §8.4 since
// egatari-spec 28d8801): `seed` and `data-egatari-seed` are ignored without a warning; an unknown name warns.
// Checked for every component in tools/variant-sync.mjs USERS, with its own static variants.
//   node tools/test-variant.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';
import { VARIANT_PARTS as USERS } from './variant-sync.mjs';

const warns = [];
const root = { attrs: {}, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; } };
const classes = {};
const ctx = { console: { warn: (m) => warns.push(m) }, document: { documentElement: root }, customElements: { get: (n) => classes[n] }, Math, String, JSON };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tools', 'variant.js'), 'utf8') + '\nthis.VARIANT = VARIANT;', ctx);
const V = ctx.VARIANT;
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL ' + m); } };

ok(Object.keys(V).join() === 'of', 'VARIANT has only of (no seed, pick, rng or hash)');
for (const name of USERS) {
  const js = fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8');
  const m = js.match(/static\s+variants\s*=\s*\[([^\]]*)\]/);
  ok(!!m, `m-${name}: static variants`);
  if (!m) continue;
  const names = m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const tag = 'm-' + name;
  classes[tag] = class { static variants = names; };
  const el = (attrs) => ({ tagName: tag.toUpperCase(), getAttribute: (k) => (k in attrs ? attrs[k] : null) });
  warns.length = 0; root.attrs = {};
  ok(V.of(el({})) === names[0] && !warns.length, `${tag}: nothing written → the first variant, ${names[0]}`);
  root.attrs = { 'data-egatari-seed': '7' };
  ok(V.of(el({})) === names[0] && !warns.length, `${tag}: a lesson's data-egatari-seed is ignored`);
  ok(V.of(el({ seed: '9' })) === names[0] && !warns.length, `${tag}: a seed attribute is ignored`);
  root.attrs = {};
  for (const v of names) ok(V.of(el({ variant: v, seed: '3' })) === v && !warns.length, `${tag}: variant="${v}" → ${v}`);
  ok(V.of(el({ variant: 'spin' })) === names[0] && warns.length === 1, `${tag}: unknown variant: one warning and the first variant`);
}
classes['m-none'] = class {};
warns.length = 0;
ok(V.of({ tagName: 'M-NONE', getAttribute: () => null }) === null && !warns.length, 'a part without variants: null');
console.log(fail ? `\n${fail} failure(s)` : `test-variant: ok (${n} checks, ${USERS.length} components)`);
process.exit(fail ? 1 : 0);

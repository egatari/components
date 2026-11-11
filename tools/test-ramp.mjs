// node tools/test-ramp.mjs: base's ramp(t, old) gives var(--ramp-k, old) at the five stops and a color-mix in oklab of the two
// neighbouring stops between them, every stop falling back to old; rampStops(el) gives the five values or null (no browser)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {ROOT} from './studio.mjs';
let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
let props = {};
const context = vm.createContext({console, HTMLElement: class {},
  getComputedStyle: () => ({getPropertyValue: (k) => props[k] ?? ''})});
let factory = null;
context.egatariParts = {define: (meta, f) => { if (meta.name === 'base') factory = f; }};
vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', 'base', 'index.js'), 'utf8'), context);
const base = factory({shape: {check: () => null}});
const {ramp, rampStops} = base;
const O = 'color-mix(in oklab, var(--term) 50%, var(--bg))';
ok(ramp(0, O) === `var(--ramp-1, ${O})` && ramp(1, O) === `var(--ramp-5, ${O})`, 'the ends are --ramp-1 and --ramp-5 with the old colour as fallback');
ok(ramp(0.25, 'X') === 'var(--ramp-2, X)' && ramp(0.5, 'X') === 'var(--ramp-3, X)' && ramp(0.75, 'X') === 'var(--ramp-4, X)', 'the inner stops are at t = 0.25, 0.5, 0.75');
ok(ramp(0.6, 'X') === 'color-mix(in oklab, var(--ramp-3, X) 60.0%, var(--ramp-4, X))', 'between stops: color-mix in oklab of the neighbours, weighted by distance');
ok(ramp(-2, 'X') === ramp(0, 'X') && ramp(3, 'X') === ramp(1, 'X') && ramp(NaN, 'X') === ramp(0, 'X'), 't is clamped to 0…1 (NaN gives 0)');
ok([0.1, 0.3, 0.9].every((t) => (ramp(t, 'X').match(/, X\)/g) || []).length === 2), 'both stops of a mix fall back to old (a theme without ramps gives exactly old)');
props = {};
ok(rampStops({}) === null, 'rampStops: null when the theme sets no ramp');
props = {'--ramp-1': '#000', '--ramp-2': '#111', '--ramp-3': '#222', '--ramp-4': '#333'};
ok(rampStops({}) === null, 'rampStops: null when one stop is missing');
props['--ramp-5'] = ' #444 ';
ok(JSON.stringify(rampStops({})) === JSON.stringify(['#000', '#111', '#222', '#333', '#444']), 'rampStops: the five values, trimmed');
if (fails) { console.log(`test-ramp: ${fails} FAIL`); process.exit(1); }
console.log('test-ramp: ok');

// The geometry of m-numberline (its `static geom`), without a browser: values written as numbers or fractions ("1/3"),
// tick positions and labels (fractions over a common denominator, decimals without trailing zeros, the real minus sign),
// sub-ticks, two lines aligned at 0, labels split into text and stacked fractions, thinning of tick labels, the levels of
// overlapping ranges and jumps, the shared part of ranges, and the height of a jump's arc.
//   node tools/test-numberline.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

function load(name) {
  const classes = {};
  const DECK = { define: (tag, C) => { classes[tag] = C; }, MotionElement: class {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), { DECK, console, Math, String, JSON, Number, Array, Object, Error, isFinite });
  return classes['m-' + name];
}
const G = load('numberline').geom;
let fail = 0, n = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const eq = (got, want, msg) => {
  n++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const good = typeof want === 'number' ? near(got, want) : g === w;
  if (!good) { fail++; console.log(`FAIL ${msg}: got ${g}, want ${w}`); }
};
const M = '−';
const labels = (line) => G.ticks(line).filter((t) => t.major).map((t) => t.label);

// ---- values ----
eq(G.val(G.parse('1/3')), 1 / 3, 'parse "1/3"');
eq(G.val(G.parse('-2/5')), -0.4, 'parse "-2/5"');
eq(G.val(G.parse(M + '1.5')), -1.5, 'parse "−1.5" (minus sign)');
eq(G.parse(0.25), { n: 1, d: 4 }, 'parse 0.25 as 1/4');
eq(G.parse('abc'), null, 'parse "abc" is null');
eq(G.parse('1/0'), null, 'parse "1/0" is null');

// ---- tick labels ----
eq(labels({ from: 0, to: 1, step: '1/3' }), ['0', '1/3', '2/3', '1'], 'thirds 0..1');
eq(labels({ from: 0, to: 2, step: '1/3' }), ['0', '1/3', '2/3', '1', '4/3', '5/3', '2'], 'thirds 0..2 (improper fractions, integers as integers)');
eq(labels({ from: '1/2', to: 2, step: '1/4' }), ['2/4', '3/4', '1', '5/4', '6/4', '7/4', '2'], 'quarters from 1/2 (common denominator 4)');
eq(labels({ from: 0, to: 1, step: 0.1 }), ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1'], 'tenths without trailing zeros');
eq(labels({ from: 2.3, to: 2.4, step: 0.01 }).slice(0, 3), ['2.3', '2.31', '2.32'], 'hundredths');
eq(labels({ from: -3, to: 3, step: 1 }), [M + '3', M + '2', M + '1', '0', '1', '2', '3'], 'negative numbers with the minus sign');
eq(labels({ from: -1, to: 1, step: '1/2' }), [M + '1', M + '1/2', '0', '1/2', '1'], 'negative fractions');
eq(labels({ from: 0, to: 10, step: 3 }), ['0', '3', '6', '9'], 'the end that is not on a tick gets no tick');
eq(G.ticks({ from: 0, to: 1, step: '1/3' }).map((t) => t.v)[1], 1 / 3, 'the tick at 1/3 is exact');
eq(G.ticks({ from: 0, to: 1, step: 0.1 })[3].r, { n: 3, d: 10 }, '0.3 is exactly 3/10');
{
  const t = G.ticks({ from: 0, to: 1, step: 1, sub: 10 });
  eq(t.length, 11, 'sub 10: 2 major + 9 minor ticks');
  eq(t.filter((x) => x.half).map((x) => x.v), [0.5], 'sub 10: the half tick is at 0.5');
}
eq(labels({ from: 0, to: 100 }).length, 11, 'no step: 10 nice intervals');

// ---- horizontal placement ----
{
  const [a] = G.spans([{ from: 0, to: 10 }], 100, 1100);
  eq(a.x(3), 400, 'one line: x(3) on 0..10 over 100..1100');
  const [p, q] = G.spans([{ from: 0, to: 300 }, { from: 0, to: 3 }], 100, 1100);
  eq(p.x(150), q.x(1.5), 'two lines 0..300 and 0..3: 150 above 1.5');
  eq(p.x(0), q.x(0), 'two lines aligned at 0');
  const [r, s] = G.spans([{ from: -5, to: 5 }, { from: 0, to: 10 }], 0, 1000);
  eq(r.x(0), 500, 'two lines −5..5 and 0..10: 0 in the middle');
  eq(s.x(0), r.x(0), '… and the second line starts at the same 0');
  eq(s.b, 1000, '… and ends at the right edge');
  const [u, v] = G.spans([{ from: 1, to: 5 }, { from: 0, to: 4 }], 0, 1000);
  eq([u.z, u.a, u.b, v.a, v.b], [null, 0, 1000, 0, 1000], 'a line without 0: both full width, not aligned');
}

// ---- labels with fractions ----
eq(G.split('×2/3'), [{ t: '×' }, { num: '2', den: '3' }], 'split "×2/3"');
eq(G.split('x > -2'), [{ t: 'x > ' + M + '2' }], 'hyphen before a number becomes the minus sign');
eq(G.split('-1/4'), [{ t: M }, { num: '1', den: '4' }], 'negative fraction: minus then the stacked fraction');
eq(G.hasFrac('1200'), false, 'no fraction in "1200"');
eq(G.width('1/3', 24) < G.width('13', 24) + 12, true, 'a stacked fraction is about as wide as its widest part');

// ---- thinning tick labels ----
{
  const items = Array.from({ length: 41 }, (_, i) => ({ i, x: i * 25, w: 30 }));
  eq(G.thin(items), 2, '41 labels 25 px apart, 30 px wide: every 2nd');
  eq(G.thin(items.map((o) => ({ ...o, w: 12 }))), 1, 'narrow labels (13 px apart): all');
  eq(G.thin(items.map((o) => ({ ...o, w: 70 }))), 5, '70 px wide: every 5th');
}

// ---- overlapping ranges and their shared part ----
eq(G.levels([{ lo: -1, hi: Infinity }, { lo: -Infinity, hi: 3 }]), [0, 1], 'x > −1 and x ≦ 3 overlap: two levels');
eq(G.levels([{ lo: 0, hi: 2 }, { lo: 3, hi: 5 }]), [0, 0], 'apart: one level');
eq(G.levels([{ lo: 0, hi: 2 }, { lo: 2, hi: 4 }]), [0, 0], 'touching at one point: one level');
eq(G.levels([{ lo: 0, hi: 10 }, { lo: 1, hi: 2 }, { lo: 5, hi: 6 }, { lo: 1.5, hi: 5.5 }]), [0, 1, 1, 2], 'three overlapping: three levels');
eq(G.levels([{ lo: 0, hi: 10 }, { lo: 1, hi: 2 }], [1, 0]), [1, 0], 'order: the narrow one first gets the lower level');
eq(G.shared([{ lo: -1, hi: Infinity, incl: [false, false] }, { lo: -Infinity, hi: 3, incl: [true, true] }]), { lo: -1, hi: 3, incl: [false, true] }, 'shared part −1 < x ≦ 3');
eq(G.shared([{ lo: 0, hi: 1, incl: [true, true] }, { lo: 2, hi: 3, incl: [true, true] }]), null, 'no shared part');
eq(G.shared([{ lo: 0, hi: 2, incl: [true, true] }, { lo: 2, hi: 4, incl: [true, true] }]), { lo: 2, hi: 2, incl: [true, true] }, 'closed ranges touching: the point 2');
eq(G.shared([{ lo: 0, hi: 2, incl: [true, false] }, { lo: 2, hi: 4, incl: [true, true] }]), null, 'open at the touching point: none');
eq(G.shared([{ lo: 0, hi: 2, incl: [true, true] }]), null, 'one range: no shared part');

// ---- jump arcs ----
eq(G.arcAt(0, 100, 40, 49, 51), 40, 'the arc is h high in the middle');
eq(G.arcAt(0, 100, 40, 200, 300) === Infinity, true, 'no arc outside its span');
eq(G.arcAt(100, 0, 40, 0, 100) < 1, true, 'a leftward arc comes down to the line at its ends');

console.log(fail ? `\n${fail} of ${n} failed` : `test-numberline: ${n} ok`);
process.exit(fail ? 1 : 0);

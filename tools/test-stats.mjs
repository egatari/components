// The statistics of m-hist and m-boxplot (their `static stats`), without a browser: mean, median (odd and even n), mode
// (one, several, none), counting into classes (以上・未満, decimal widths), the frequency-table mean / mode / median class,
// and quartiles by the three methods (jp: the median of each half, leaving out the median when n is odd — 中2・数学Ⅰ;
// inc / exc: spreadsheet QUARTILE.INC / QUARTILE.EXC), with the 1.5 × IQR fences. Textbook-style examples.
//   node tools/test-stats.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

// Load a component's index.js with a minimal DECK and return its class
function load(name) {
  const classes = {};
  const DECK = { define: (tag, C) => { classes[tag] = C; }, MotionElement: class {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), { DECK, console, Math, String, JSON, Number, Array, Object, Error });
  return classes['m-' + name];
}
let fail = 0, n = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const eq = (got, want, msg) => {
  n++;
  const good = Array.isArray(want) ? Array.isArray(got) && got.length === want.length && got.every((v, i) => near(v, want[i])) : typeof want === 'number' ? near(got, want) : got === want;
  if (!good) { fail++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const throws = (f, msg) => { n++; try { f(); fail++; console.log(`FAIL ${msg}: no error`); } catch { /* expected */ } };

// ---- m-hist ----
const H = load('hist').stats;
const book = [3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 18];          // 11 values (odd)
const book10 = [3, 5, 6, 7, 8, 9, 10, 12, 13, 15];            // 10 values (even)
eq(H.median([12, 5, 9, 18, 7, 3, 13, 8, 15, 6, 10]), 9, 'median, odd n, unsorted input');
eq(H.median(book10), 8.5, 'median, even n: the mean of the two middle values');
eq(H.median([4]), 4, 'median of one value');
eq(H.mean([4, 6, 7, 7, 8, 9, 10]), 51 / 7, 'mean');
// the m-hist demo (架空の 20 人)
const throwing = [25, 31, 22, 38, 25, 16, 29, 42, 27, 25, 33, 19, 24, 36, 22, 28, 34, 25, 21, 30];
eq(H.mean(throwing), 27.6, 'demo: mean 27.6');
eq(H.median(throwing), 26, 'demo: median 26');
eq(H.modes(throwing), [25], 'demo: mode 25');
eq(H.modes([1, 2, 2, 3, 3]), [2, 3], 'two modes, smallest first');
eq(H.modes([1, 2, 3]), [], 'no mode when every value appears once');
eq(H.modes([7]), [7], 'one value is its own mode');
// classes: start + i·width 以上, start + (i+1)·width 未満
eq(H.binOf(10, 5, 5), 1, 'a value on a boundary goes to the upper class (以上)');
eq(H.binOf(9.999, 5, 5), 0, 'just below a boundary stays in the lower class (未満)');
eq(H.binOf(0.3, 0, 0.1), 3, 'decimal widths: 0.3 is in the 4th class of width 0.1');
eq(H.counts([12, 25, 8, 17, 21, 14, 9, 28, 16, 19, 23, 15], 5, 5, 5), [2, 2, 4, 2, 2], 'counting into classes (demo, 12 values)');
// frequency table (m-hist demo: 50 m 走, 40 人)
const mids = H.mids(7, 0.5, 7), cnt = [2, 5, 9, 12, 7, 4, 1];
eq(mids, [7.25, 7.75, 8.25, 8.75, 9.25, 9.75, 10.25], 'class marks (階級値)');
eq(H.tableMean(mids, cnt), 346.5 / 40, 'table mean = Σ(階級値 × 度数) / n');
eq(H.binModes(mids, cnt), [8.75], 'table mode = 階級値 of the largest class');
const md = H.tableMedian(7, 0.5, cnt);
eq([md.from, md.to], [8.5, 9.0], 'table median class: the 20th and 21st values are in 8.5〜9.0');
eq(H.tableMedian(0, 10, [1, 1]).at, 10, 'table median between two classes: their boundary');
eq(H.tableMedian(0, 10, [1, 3, 1]).bin, 1, 'table median class, odd n');
eq(H.cumulative([2, 5, 9]), [2, 7, 16], 'cumulative frequency');

// ---- m-boxplot ----
const B = load('boxplot').stats;
const q = (v, m) => { const r = B.quartiles(v, m); return [r.min, r.q1, r.med, r.q3, r.max]; };
// jp (中2・数学Ⅰ): halves without the median when n is odd
eq(q(book, 'jp'), [3, 6, 9, 13, 18], 'jp, n = 11: halves 3 5 6 7 8 | 10 12 13 15 18');
eq(q(book10, 'jp'), [3, 6, 8.5, 12, 15], 'jp, n = 10: halves 3 5 6 7 8 | 9 10 12 13 15');
eq(q([1, 2, 3, 4, 5, 6, 7, 8, 9], 'jp'), [1, 2.5, 5, 7.5, 9], 'jp, n = 9: halves of 4');
eq(q([1, 2, 3, 4, 5, 6, 7, 8], 'jp'), [1, 2.5, 4.5, 6.5, 8], 'jp, n = 8: halves of 4');
eq(q([2, 4, 9], 'jp'), [2, 2, 4, 9, 9], 'jp, n = 3');
eq(q([5], 'jp'), [5, 5, 5, 5, 5], 'jp, n = 1');
eq(q([12, 5, 9, 18, 7, 3, 13, 8, 15, 6, 10]), [3, 6, 9, 13, 18], 'jp is the default, unsorted input');
const r11 = B.quartiles(book, 'jp');
eq([r11.iq1, r11.imed, r11.iq3], [2, 5, 8], 'jp, n = 11: positions in the sorted row');
eq(r11.halves.flat(), [0, 4, 6, 10], 'jp, n = 11: the halves leave out the median');
// inc (QUARTILE.INC): position (n − 1)p from 0
eq(q(book, 'inc'), [3, 6.5, 9, 12.5, 18], 'inc, n = 11');
eq(q(book10, 'inc'), [3, 6.25, 8.5, 11.5, 15], 'inc, n = 10');
// exc (QUARTILE.EXC): position (n + 1)p from 1
eq(q(book, 'exc'), [3, 6, 9, 13, 18], 'exc, n = 11');
eq(q(book10, 'exc'), [3, 5.75, 8.5, 12.25, 15], 'exc, n = 10');
eq(q([1, 2, 3], 'exc'), [1, 1, 2, 3, 3], 'exc, n = 3');
throws(() => B.quartiles([1, 2], 'exc'), 'exc needs 3 or more values');
throws(() => B.quartiles([1, 2, 3], 'excel'), 'unknown method');
// fences: 1.5 × IQR
const f = B.fences(B.quartiles([3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 28], 'jp'), [3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 28]);
eq([f.lo, f.hi, f.wlo, f.whi], [-4.5, 23.5, 3, 15], 'fences 6 − 10.5 and 13 + 10.5; whiskers to 3 and 15');
eq(f.out, [28], '28 is an outlier');
const g = B.fences(B.quartiles(book, 'jp'), book);
eq(g.out, [], 'no outlier in the textbook example');
// the m-boxplot demo (B 組)
const bk = [50, 56, 60, 62, 65, 67, 68, 70, 71, 73, 74, 76, 79, 82, 99];
eq(q(bk, 'jp'), [50, 62, 70, 76, 99], 'demo B 組');
eq(B.fences(B.quartiles(bk), bk).out, [99], 'demo B 組: 99 is an outlier (76 + 21 = 97)');

console.log(fail ? `\n${fail} of ${n} failed` : `test-stats: ${n} ok`);
process.exit(fail ? 1 : 0);

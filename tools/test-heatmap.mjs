// m-heatmap: the colour scale, row normalisation, label thinning and steps without a browser (its `static calc`), then in a
// browser with the pinned Egatari Studio, in the default, kokugo and business themes:
//   - every cell's number reaches 4.5:1 against its own cell (the text colour picked per cell from --fg / --bg), over a full
//     sequential ramp in each tone and a full diverging ramp, plus the demo-like matrices
//   - cell fills use only theme colours (var(--…) or color-mix of them)
//   - steps and durations per build (rows, whole, cells), highlights at their steps
//   - more than 12×12: numbers off with a warning; too many labels: every k-th label with a warning, labels ≥ 24 px;
//     long column labels turn vertical
//   - the readable layer is a table of the values (header row + one row per label)
//   node tools/test-heatmap.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio } from './studio.mjs';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ---- without a browser ----
const classes = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'heatmap', 'index.js'), 'utf8'),
  { DECK: { define: (t, C) => { classes[t] = C; }, MotionElement: class {} }, console, Math, String, JSON, Number, Array, Object, Error, isFinite });
const C = classes['m-heatmap'].calc;

// row normalisation (confusion matrix): each row sums to 1; a zero row stays 0
const N = C.normalizeRows([[45, 3, 2], [6, 38, 6], [0, 0, 0]]);
ok(near(N[0][0], 0.9) && near(N[1][1], 0.76) && near(N[0][2], 0.04), `normalizeRows: 45/50 = 0.9, 38/50 = 0.76 (${N[0]})`);
ok(N.slice(0, 2).every((r) => near(r.reduce((a, v) => a + v, 0), 1)), 'normalizeRows: rows sum to 1');
ok(N[2].every((v) => v === 0), 'normalizeRows: a zero row stays 0');

// domain and mapping
let d = C.domain([[2, 8], [5, 10]], 'sequential', 0, null);
ok(d.lo === 0 && d.hi === 10 && d.c === 5, `sequential domain from 0 to the maximum (${JSON.stringify(d)})`);
ok(near(C.frac(5, 'sequential', d), 0.5) && C.frac(10, 'sequential', d) === 1 && C.frac(0, 'sequential', d) === 0, 'sequential: 0 → 0, 5 → 0.5, 10 → 1');
ok(C.frac(12, 'sequential', d) === 1 && C.frac(-3, 'sequential', d) === 0, 'sequential: outside the range clamps');
d = C.domain([[-3, 1], [0.5, 2]], 'sequential', 0, null);
ok(d.lo === -3 && d.hi === 2, 'sequential domain keeps a negative minimum');
d = C.domain([[1, 0.6], [-0.2, 1]], 'diverging', 0, null);
ok(d.lo === -1 && d.hi === 1 && d.c === 0, `diverging domain symmetric around 0 (${JSON.stringify(d)})`);
d = C.domain([[0.3, 0.6]], 'diverging', 0.5, null);
ok(near(d.lo, 0.3) && near(d.hi, 0.7) && d.c === 0.5, `diverging around center 0.5 (${JSON.stringify(d)})`);
d = C.domain([[0.3]], 'diverging', 0, [-1, 1]);
ok(near(C.frac(-0.5, 'diverging', d), -0.5) && near(C.frac(0.25, 'diverging', d), 0.25) && C.frac(0, 'diverging', d) === 0, 'diverging range [-1, 1]: −0.5 → −0.5 (low side), 0.25 → 0.25, 0 → 0');
ok(C.frac(-2, 'diverging', d) === -1 && C.frac(3, 'diverging', d) === 1, 'diverging clamps at ±1');

// the text colour per cell: whatever p, --fg or --bg reaches 4.5:1 (p moved out of the mid band when needed)
const THEMES = { default: { bg: [255, 255, 255], fg: [34, 34, 34], tones: [[0x1f, 0x4e, 0x8c], [0xc5, 0x05, 0x16], [0x74, 0x44, 0x00]] } };
for (const [name, th] of Object.entries(THEMES)) for (const tone of th.tones) {
  let worst = 99, moved = 0;
  for (let i = 0; i <= 100; i++) {
    const o = C.pick(tone, th.bg, th.fg, i / 100), col = C.mix(tone, th.bg, o.p);
    worst = Math.min(worst, C.contrast(col, o.text === 'fg' ? th.fg : th.bg));
    if (Math.abs(o.p - i / 100) > 1e-9) moved = Math.max(moved, Math.abs(o.p - i / 100));
  }
  ok(worst >= 4.5, `pick (${name}, tone ${tone}): every p gives ≥ 4.5:1 (worst ${worst.toFixed(2)})`);
  ok(moved <= 0.2, `pick (${name}, tone ${tone}): p moved by at most 0.2 (${moved.toFixed(3)})`);
}
ok(C.pick([0x1f, 0x4e, 0x8c], [255, 255, 255], [34, 34, 34], 0).text === 'fg' && C.pick([0x1f, 0x4e, 0x8c], [255, 255, 255], [34, 34, 34], 1).text === 'bg', 'pick: dark text on the background colour, light text on the full tone');

// label thinning and rotation
const est = (s) => C.est(s, 24);
let L = C.layout({ W: 1180, H: 440, rows: ['ねこ', 'いぬ', 'うさぎ'], cols: ['ねこ', 'いぬ', 'うさぎ'], legend: ['100%', '50%', '0%'], xl: '予測', yl: '正解' });
ok(L.kc === 1 && L.kr === 1 && L.fs === 26 && L.orient === 'h', `3×3: every label, 26 px, horizontal (${L.kc}, ${L.kr}, ${L.fs}, ${L.orient})`);
const many = Array.from({ length: 40 }, (_, i) => 'w' + i);
L = C.layout({ W: 1180, H: 440, rows: many, cols: many, legend: ['1', '0.5', '0'] });
ok(L.kr > 1 && L.kc > 1 && L.fs >= 24, `40×40 in 440 px: thinned (every ${L.kc} / ${L.kr}), ${L.fs} px`);
ok(L.kr * L.cs >= 24 * 1.25 - 1e-6, `40×40: row label pitch ${(L.kr * L.cs).toFixed(1)} px ≥ 30 px`);
ok(L.notes.length === 2 && /every \d+(st|nd|rd|th) column/.test(L.notes[0]), `40×40: two warnings (${L.notes.join(' | ')})`);
ok(JSON.stringify(C.shown(10, 3)) === '[0,3,6,9]', 'shown(10, 3): every 3rd label from the first');
const longCols = ['とても長い列の名前その一', 'とても長い列の名前その二', 'とても長い列の名前その三', 'とても長い列の名前その四', 'とても長い列の名前その五', 'とても長い列の名前その六'];
L = C.layout({ W: 1180, H: 440, rows: ['a', 'b', 'c'], cols: longCols, legend: ['1', '0'] });
ok(L.orient === 'v' && L.kc === 1, `long column labels: vertical, all shown (${L.orient}, every ${L.kc})`);
L = C.layout({ W: 1180, H: 440, rows: ['a', 'b', 'c'], cols: longCols, legend: ['1', '0'], rotate: '0' });
ok(L.orient === 'h' && L.kc > 1, `rotate="0": horizontal, thinned (every ${L.kc})`);
ok(est('12') < est('ねこ') && near(C.est('−0.5', 10, 0.7), 28, 1e-6), 'est: digits narrower than kana; cell numbers at 0.7 em, the minus sign too');

// number size: ≥ 24 px or none
ok(C.numberSize(120, ['45', '90%'], 2) >= 24, 'numberSize: two lines fit in 120 px');
ok(C.numberSize(40, ['−0.35'], 1) === 0, 'numberSize: −0.35 does not fit 40 px at 24 px → 0 (off)');
ok(C.numberSize(98, ['−0.35'], 1) >= 24, 'numberSize: −0.35 fits 98 px');

// steps
let s = C.steps(3, 3, 'rows', []);
ok(s.steps === 3 && s.cell[0][2] === 1 && s.cell[2][0] === 3, `rows: one row per step (${s.steps} steps)`);
s = C.steps(3, 3, 'rows', [[0, 1], [2, 2]]);
ok(s.steps === 4 && s.hl.every((h) => h.st === 4), 'rows: highlights together after the rows');
s = C.steps(4, 4, 'whole', [[0, 1]]);
ok(s.steps === 1 && s.hl[0].st === 1 && s.cell[3][3] === 1, 'whole: everything at step 1');
s = C.steps(4, 4, 'cells', [[0, 1], [2, 2], [3, 0]]);
ok(s.steps === 4 && s.hl.map((h) => h.st).join() === '2,3,4' && s.cell[3][3] === 1, 'cells: grid at step 1, one highlight per step');
s = C.steps(4, 4, 'cells', [[0, 1, 5]]);
ok(s.steps === 5 && s.hl[0].st === 5, 'a highlight with its own step');

// ---- in a browser ----
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-heatmap-')));
fs.mkdirSync(work, { recursive: true });
const ramp = Array.from({ length: 11 }, (_, i) => +(i / 10).toFixed(1));
const el = (attrs, data, h = 300) => `<m-heatmap ${attrs} style="height:${h}px"><script type="application/json">${JSON.stringify(data)}</script></m-heatmap>`;
const cols11 = ramp.map((_, i) => 'c' + i);
const slides = [
  // 0: full sequential ramps in each tone (numbers on), 1: a full diverging ramp
  ['term', 'emph', 'accent2'].map((t) => el(`id="seq-${t}" tone="${t}" digits="1"`, { rows: ['r'], cols: cols11, values: [ramp] }, 140)).join('\n'),
  el('id="div" scale="diverging" range="[-1,1]" digits="1"', { rows: ['−', '+'], cols: cols11, values: [ramp.map((v) => -v), ramp] }, 230),
  el('id="conf" normalize="row" show="both" diag="on" xl="予測" yl="正解"', { rows: ['ねこ', 'いぬ', 'うさぎ'], cols: ['ねこ', 'いぬ', 'うさぎ'], values: [[45, 3, 2], [6, 38, 6], [1, 4, 45]] }, 430),
  el('id="cells" digits="2"', { rows: ['a', 'b', 'c', 'd'], cols: ['a', 'b', 'c', 'd'], values: [[0.6, 0.1, 0.2, 0.1], [0.4, 0.3, 0.2, 0.1], [0.1, 0.1, 0.7, 0.1], [0.1, 0, 0.6, 0.3]], highlight: [[2, 2], [3, 2], [0, 0, 6]] }, 430),
  el('id="big"', { rows: Array.from({ length: 40 }, (_, i) => 'w' + i), cols: Array.from({ length: 40 }, (_, i) => 'w' + i), values: Array.from({ length: 40 }, (_, r) => Array.from({ length: 40 }, (_, c) => Math.abs(Math.sin(r * 0.3 + c * 0.17)))) }, 430),
  el('id="long"', { rows: ['a', 'b', 'c'], cols: longCols, values: [[1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1], [1, 3, 5, 2, 4, 6]] }, 430),
];
const deck = (theme) => `<!DOCTYPE html>
<html lang="ja" data-theme="${theme}"><head><meta charset="utf-8"><title>m-heatmap test</title></head><body><div id="stage">
${slides.map((b, i) => `<section class="slide noconcl" id="s-h${i}"><h2>ヒートマップ ${i}</h2><div class="body">${b}</div></section>`).join('\n')}
</div></body></html>`;

const b = await S.browser.launch();
try {
  for (const theme of ['default', 'kokugo', 'business']) {
    const src = path.join(work, `heatmap-${theme}-src.html`), out = path.join(work, `heatmap-${theme}.html`);
    fs.writeFileSync(src, deck(theme));
    S.build(src, out);
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const warns = [], errors = [];
    p.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(S.browser.fileUrl(out));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    const r = await p.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const g = cv.getContext('2d', { willReadFrequently: true });
      const rgb = (s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
      const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const out = { cells: [], fills: [], steps: {}, dur: {}, labels: {}, table: {}, hl: {} };
      for (let i = 0; i < DECK.slides.length; i++) {
        const s = DECK.slides[i];
        DECK.seek(i, s._max, Infinity);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const c of s._comps) {
          out.steps[c.id] = c.steps;
          out.dur[c.id] = Array.from({ length: c.steps + 2 }, (_, k) => c.duration(k));
          const texts = [...c.querySelectorAll('svg text')];
          out.labels[c.id] = { n: texts.length, min: Math.min(...texts.map((t) => parseFloat(t.getAttribute('font-size')))), rotated: texts.filter((t) => /rotate\(-90/.test(t.getAttribute('transform') || '')).length,
            rowLabels: texts.filter((t) => t.getAttribute('text-anchor') === 'end').length };
          const svg = c.querySelector('svg');
          const cellGroups = [...svg.children[1].children];
          for (const cg of cellGroups) {
            const rect = cg.querySelector('rect'), fill = getComputedStyle(rect).fill, style = rect.getAttribute('style') || '';
            out.fills.push(style);
            for (const t of cg.querySelectorAll('text')) out.cells.push({ id: c.id, txt: t.textContent, cr: +cr(rgb(getComputedStyle(t).fill), rgb(fill)).toFixed(2), fill });
          }
          const tb = c.querySelector('.sr-only table');
          out.table[c.id] = tb ? { rows: tb.querySelectorAll('tr').length, cells: tb.querySelectorAll('td').length, first: (tb.querySelector('td') || {}).textContent, hl: [...tb.querySelectorAll('td')].filter((x) => /強調/.test(x.textContent)).length } : null;
          // highlight frames per step (opacity of the frame groups at each step's end)
          const frames = [...svg.children[2].children];
          out.hl[c.id] = [];
          for (let k = 0; k <= c.steps; k++) { c.render(k, Infinity, {}); out.hl[c.id].push(frames.filter((f) => +f.getAttribute('opacity') === 1).length); }
          c.render(c.steps, Infinity, {});
        }
      }
      return out;
    });
    await p.close();
    ok(errors.length === 0, `${theme}: no console errors (${errors.join(' | ')})`);
    const low = r.cells.filter((x) => x.cr < 4.5);
    ok(r.cells.length > 60 && low.length === 0, `${theme}: all ${r.cells.length} cell numbers ≥ 4.5:1 against their cell${low.length ? ': ' + low.map((x) => `${x.id} "${x.txt}" ${x.cr}`).join(', ') : ''} (lowest ${Math.min(...r.cells.map((x) => x.cr))})`);
    ok(r.fills.every((f) => /^fill:(var\(--(bg|term|emph|accent2)\)|color-mix\(in oklab, var\(--(term|emph|accent2)\) [\d.]+%, var\(--bg\)\));$/.test(f)), `${theme}: cell fills are theme colours or color-mix of them (${[...new Set(r.fills.filter((f) => !/var\(--/.test(f)))].join(', ')})`);
    if (theme !== 'default') continue;
    // steps and durations
    ok(r.steps.conf === 3 && r.dur.conf.join() === '0,0.8,0.8,0.8,0', `normalize="row": build rows, 3 steps, 0.8 s each (${r.steps.conf}: ${r.dur.conf})`);
    ok(r.steps['seq-term'] === 1, 'whole: 1 step');
    ok(r.steps.cells === 6 && r.hl.cells.join() === '0,0,1,2,2,2,3', `cells: grid, then one highlight per step; the third at its own step 6 (${r.hl.cells})`);
    ok(r.hl.conf.join() === '0,1,2,3', `diag: the diagonal frame comes with its row (${r.hl.conf})`);
    // numbers, labels, warnings
    ok(!r.cells.some((x) => x.id === 'big'), '40×40: no numbers in the cells');
    ok(warns.some((w) => /40×40 cells is more than 12×12/.test(w)), '40×40: warns that numbers are off');
    ok(warns.some((w) => /40 rows are too many to label/.test(w)) && warns.some((w) => /40 columns are too many to label/.test(w)), '40×40: warns about thinned labels');
    ok(r.labels.big.min >= 24 && r.labels.big.rowLabels < 40 && r.labels.big.rowLabels >= 5, `40×40: labels ≥ 24 px, ${r.labels.big.rowLabels} of 40 row labels`);
    ok(r.labels.long.rotated === 6 && r.labels.long.min >= 24, `long column labels drawn vertically (${r.labels.long.rotated}), ≥ 24 px`);
    ok(r.cells.filter((x) => x.id === 'conf').length === 18, 'show="both": count and percent in each of the 9 cells');
    ok(r.cells.some((x) => x.id === 'conf' && x.txt === '90%') && r.cells.some((x) => x.id === 'conf' && x.txt === '76%'), 'confusion matrix: 45/50 → 90%, 38/50 → 76%');
    ok(r.cells.some((x) => x.id === 'div' && x.txt === '−1.0'), 'negative numbers with the minus sign (−)');
    // readable layer
    ok(r.table.conf && r.table.conf.rows === 4 && r.table.conf.cells === 9 && r.table.conf.first === '45（90%）', `readable layer: a table of the values (${JSON.stringify(r.table.conf)})`);
    ok(r.table.cells && r.table.cells.hl === 3, 'readable layer marks the highlighted cells');
  }
} finally { await b.close(); }
console.log(fails ? `\ntest-heatmap: ${fails} of ${n} failed` : `test-heatmap: ok (${n} checks)`);
process.exit(fails ? 1 : 0);

// Parity of the plot library part (components/plot, components 2.0) with the pinned Studio's DECK.Plot (kit/deck.js;
// tools/studio.json), in a browser: for many boxes and options (ranges, ticks, digits, axis names, noY, margins, negative
// ticks, a box given by id) the drawn SVG is the same markup (outerHTML, with the clip number written as #), and the
// returned object agrees: W, H, m, x(v), y(v), clip, d(f, a, b, n), poly(pts). The clip paths are numbered by each copy's own
// counter from 1, as DECK.Plot numbers them.
//   node tools/test-part-plot.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, pinLabel } from './studio.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-part-plot-')));
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>plot</title></head>
<body><div id="stage">
<section class="slide noconcl" id="s-a"><h2>plot</h2><div class="body"><div id="host"></div></div></section>
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
S.build(path.join(work, 'deck.html'), out);
const html = fs.readFileSync(out, 'utf8'), end = html.lastIndexOf('</body>');
const inject = ['tools/registry-shim.js', 'components/shape/index.js', 'components/base/index.js', 'components/plot/index.js'].map((f) => `<script>\n${read(f)}\n</script>\n`).join('');
fs.writeFileSync(out, html.slice(0, end) + inject + html.slice(end));

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, bypassCSP: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(S.browser.fileUrl(out) + '?mode=video');
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const P = EGATARI_PARTS_SHIM.get('plot', '1.0.0').Plot, host = document.getElementById('host');
    const n0 = P.n;
    const OPTS = [
      { xr: [0, 10], yr: [0, 1] },
      { xr: [0, 10], yr: [0, 1], xt: [0, 2, 4, 6, 8, 10], yt: [0, 0.5, 1], yf: 1, xl: '時間 *t*', yl: '確率 *p*' },
      { xr: [-3, 3], yr: [-1.5, 1.5], xt: [-3, -1.5, 0, 1.5, 3], yt: [-1, 0, 1], xf: 1, yf: 0, xl: '*x*', xl2: '（単位なし）', yl: '*f*(*x*)' },
      { xr: [0, 100], yr: [0, 50], xt: [0, 50, 100], yt: [0, 25, 50], noY: true, m: { l: 40, r: 10, t: 10, b: 40 } },
      { xr: [1, 2], yr: [10, 20], xt: [1, 1.25, 1.5, 1.75, 2], xf: 2, yt: [10, 15, 20], yf: 0, xl: 'a_1 + b^2', m: { l: 100, r: 30, t: 20, b: 80 } },
      { xr: [0, 1e6], yr: [-5, 5], xt: [0, 500000, 1000000], yt: [-5, 0, 5], xl2: '万円' },
    ];
    const SIZES = [[640, 360], [400, 300], [1000, 420], [200, 150]];
    const F = [(x) => x * x, Math.sin, (x) => 1 / (1 + Math.exp(-x)), (x) => (x < 0 ? -x : 2 * x)];
    const run = (Plot) => {
      const res = [];
      let j = 0;
      for (const [w, h] of SIZES) for (const o of OPTS) {
        const box = document.createElement('div'); box.style.cssText = `width:${w}px;height:${h}px`; box.id = 'pbox' + j++;
        host.appendChild(box);
        const p = Plot(j % 2 ? box : box.id, JSON.parse(JSON.stringify(o)));
        const xs = [o.xr[0], (o.xr[0] + o.xr[1]) / 2, o.xr[1], o.xr[0] - 1], ys = [o.yr[0], (o.yr[0] + o.yr[1]) / 2, o.yr[1]];
        res.push({
          svg: box.innerHTML.replace(/clip\d+/g, 'clip#'), W: p.W, H: p.H, m: p.m, clip: p.clip.replace(/clip\d+/, 'clip#'), keys: Object.keys(p).join(),
          x: xs.map(p.x), y: ys.map(p.y), d: F.map((f) => p.d(f, o.xr[0], o.xr[1], 24)), poly: p.poly([[o.xr[0], o.yr[0]], [o.xr[1], o.yr[1]], [(o.xr[0] + o.xr[1]) / 2, o.yr[0]]]),
          id: (box.querySelector('clipPath') || {}).id,
        });
        box.remove();
      }
      return res;
    };
    const d0 = DECK.Plot.n, a = run(DECK.Plot), b = run(P);
    return { n: a.length, same: JSON.stringify(a) === JSON.stringify(b), firstDiff: a.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(b[i])), a0: a[1], b0: b[1],
      ids: [b[0].id, b[1].id, b[b.length - 1].id], n0, n1: P.n, deckIds: [a[0].id, a[a.length - 1].id], d0, frozenPlot: Object.isFrozen(EGATARI_PARTS_SHIM.get('plot', '1.0.0')) };
  });
  console.log(`(reference: ${pinLabel()} kit/deck.js DECK.Plot)`);
  ok(errors.length === 0, 'no exception or console error' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.same, `Plot ≡ DECK.Plot: the same SVG markup and returned values on ${r.n} boxes × options` + (r.same ? '' : `\n     first difference at ${r.firstDiff}:\n     DECK ${JSON.stringify(r.a0).slice(0, 600)}\n     plot ${JSON.stringify(r.b0).slice(0, 600)}`));
  ok(r.n0 === 0 && r.ids[0] === 'clip1' && r.ids[1] === 'clip2' && r.ids[2] === `clip${r.n}` && r.n1 === r.n, `plot numbers its clip paths from clip1 by its own counter, as DECK.Plot does (DECK: ${r.deckIds.join('…')} after ${r.d0} before)`);
  ok(r.frozenPlot, 'the value {Plot} is frozen by the registry');
} finally { await browser.close(); }

console.log(fails ? `\n${fails} failure(s)` : '\ntest-part-plot: ok');
process.exit(fails ? 1 : 0);

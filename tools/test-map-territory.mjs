// m-map-japan's territory rule (docs/map-design.md §5.3, owner's decision for v1.8.0), at many sizes, built with the pinned Egatari Studio.
//   - by default (islands="main") there is no 小笠原諸島 inset, and 北方領土・竹島・尖閣諸島 are drawn (present, inside the element,
//     not hidden) at every size of the grid: heights 200–700 px, widths 300–1184 px, layout="inset" and "true", with and without labels
//   - layout="true" also draws 沖ノ鳥島 and 南鳥島, and names 竹島・尖閣諸島・沖ノ鳥島・南鳥島
//   - islands="all" at 300, 380 and 520 px high (and 300×200, 260×160) either names 沖ノ鳥島 and 南鳥島 in the inset or leaves the
//     inset out with a warning
//   - an author point with a label on a territory island replaces the built-in dot and name (one dot, one name; layout="true" with
//     the four extremities, and islands="all" with a point on 南鳥島), and the readable layer has one entry per island
//   - the readable layer lists exactly the territories that are drawn
// Checked in the final state (every step at t = Infinity) and at step 0.
//   node tools/test-map-territory.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-map-territory-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0, oks = 0;
const ok = (cond, msg) => { if (cond) oks++; else { console.log('FAIL ' + msg); fails++; } };

const HEIGHTS = [200, 260, 320, 380, 440, 500, 560, 620, 700];
const WIDTHS = [300, 420, 640, 900, 1184];
const EXTREMES = { points: [
  { lon: 148.7522, lat: 45.5572, label: '択捉島（北端）', step: 1 }, { lon: 153.9867, lat: 24.2831, label: '南鳥島（東端）', step: 2 },
  { lon: 136.0697, lat: 20.4253, label: '沖ノ鳥島（南端）', step: 3 }, { lon: 122.9325, lat: 24.4514, label: '与那国島（西端）', step: 4 }] };
const REGION = { regions: [{ group: 'kinki', tone: 'term', step: 1 }, { id: '01', step: 2 }] };
const cases = [];
for (const h of HEIGHTS) for (const w of WIDTHS) for (const layout of ['inset', 'true']) for (const labels of ['focus', 'none'])
  cases.push({ kind: 'grid', name: `${layout}, ${w}×${h}, labels=${labels}`, attrs: `layout="${layout}" labels="${labels}"`, style: `width:${w}px;height:${h}px`, data: REGION, layout });
for (const [h, ws] of [[300, [420, 1184]], [380, [420, 1184]], [520, [420, 1184]], [200, [300]], [160, [260]]]) for (const w of ws)
  cases.push({ kind: 'all', name: `islands="all", ${w}×${h}`, attrs: 'islands="all"', style: `width:${w}px;height:${h}px`, data: REGION, layout: 'inset' });
for (const h of [300, 440, 520])
  cases.push({ kind: 'extremes', name: `layout="true" with the four extremities, ${h} px`, attrs: 'layout="true" labels="none"', style: `height:${h}px`, data: EXTREMES, layout: 'true' });
cases.push({ kind: 'author', name: 'islands="all" with a point on 南鳥島', attrs: 'islands="all" labels="none"', style: 'height:440px',
  data: { points: [{ lon: 153.9867, lat: 24.2831, label: '南鳥島（東端）', step: 1 }] }, layout: 'inset' });

const src = path.join(work, 'map-territory.html'), out = path.join(work, 'map-territory.out.html');
fs.writeFileSync(src, `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head>\n<meta charset="utf-8">\n<title>m-map-japan territories</title>\n</head>\n<body>\n<div id="stage">\n${cases.map((c, i) =>
  `<section class="slide">\n  <h2>地図 ${i + 1}</h2>\n  <div class="body">\n    <m-map-japan ${c.attrs} style="${c.style}">\n      <script type="application/json">${JSON.stringify(c.data)}</script>\n    </m-map-japan>\n  </div>\n</section>`).join('\n')}\n</div>\n</body>\n</html>\n`);
S.build(src, out);

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = await page.evaluate((i) => {
      const sl = DECK.slides[i], el = sl._comps[0], max = sl._max;
      const shown = (e) => { for (let q = e; q && q !== el; q = q.parentNode) if (q.getAttribute && q.hasAttribute('opacity') && !(+q.getAttribute('opacity') > 0)) return false; return true; };
      const inBox = (x, y) => { const cr = el.getBoundingClientRect(), sv = el.querySelector('svg').getBoundingClientRect(); return sv.left + x >= cr.left - 0.5 && sv.left + x <= cr.right + 0.5 && sv.top + y >= cr.top - 0.5 && sv.top + y <= cr.bottom + 0.5; };
      const rectIn = (b) => { const cr = el.getBoundingClientRect(); return b.left >= cr.left - 1 && b.top >= cr.top - 1 && b.right <= cr.right + 1 && b.bottom <= cr.bottom + 1; };
      // 北方四島（各島の中の 1 点）
      const HOPPO = { 択捉島: [147.9, 45.0], 国後島: [145.9, 44.1], 色丹島: [146.75, 43.8], 志発島: [146.17, 43.52] };
      const state = (when) => {
        const drawn = new Set(), named = new Set(), bad = [];
        const hk = [...el.querySelectorAll('path[data-mark="JP-01"]')];
        const hoppo = Object.entries(HOPPO).filter(([n, [lon, lat]]) => {
          const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]);
          const ok = inBox(p[0], p[1]) && hk.some((h) => shown(h) && h.isPointInFill(pt));
          if (!ok) bad.push(`${when}: ${n} is not drawn at (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`);
          return ok;
        });
        if (hoppo.length === 4) drawn.add('北方領土');
        for (const d of el.querySelectorAll('[data-territory]')) {
          const cx = +d.getAttribute('cx'), cy = +d.getAttribute('cy');
          if (shown(d) && inBox(cx, cy)) drawn.add(d.getAttribute('data-territory'));
        }
        for (const t of el.querySelectorAll('text')) if (shown(t) && rectIn(t.getBoundingClientRect())) named.add(t.textContent);
        return { drawn: [...drawn], named: [...named], bad };
      };
      DECK.seek(i, 0, Infinity);
      const s0 = state('step 0');
      DECK.seek(i, max, Infinity);
      const sN = state('final');
      const sr = [...el.querySelectorAll('.sr-only')].map((e) => e.textContent).join('；').split('；');
      const texts = [...el.querySelectorAll('text')].map((t) => t.textContent);
      return { s0, sN, sr, texts, size: [el.clientWidth, el.clientHeight] };
    }, i);
    const T = ['北方領土', '竹島', '尖閣諸島'], FAR = ['沖ノ鳥島', '南鳥島'];
    for (const [when, s] of [['step 0', r.s0], ['final', r.sN]]) {
      ok(s.bad.length === 0, `${c.name}: ${s.bad.join('; ')}`);
      for (const t of T) ok(s.drawn.includes(t), `${c.name} (${when}): ${t} is not drawn`);
      if (c.layout === 'true') for (const t of FAR) ok(s.drawn.includes(t), `${c.name} (${when}): ${t} is not drawn`);
    }
    // the readable layer lists what is drawn (the final state), once per island
    const builtIn = (x) => /(北海道|島根県|沖縄県|東京都)）$/.test(x);
    const layer = (t) => r.sr.filter((x) => x.startsWith(t + '（') && builtIn(x)).length;
    const author = (t) => r.sr.some((x) => x.startsWith(t) && !builtIn(x));
    for (const t of T.concat(FAR)) {
      const drawn = r.sN.drawn.includes(t), inLayer = layer(t) + (author(t) ? 1 : 0);
      ok(drawn ? inLayer === 1 : inLayer === 0, `${c.name}: readable layer has ${inLayer} entries for ${t}, drawn: ${drawn} (${r.sr.join('；')})`);
    }
    if (c.kind === 'grid' && c.layout === 'inset') {
      ok(!r.texts.includes('小笠原諸島') && !FAR.some((t) => r.sN.drawn.includes(t)), `${c.name}: the 小笠原諸島 inset is drawn by default`);
    }
    if (c.layout === 'true' && c.kind === 'grid') {
      for (const t of ['竹島', '尖閣諸島'].concat(FAR)) ok(r.s0.named.includes(t) && r.sN.named.includes(t), `${c.name}: ${t} is not named`);
    }
    if (c.kind === 'all') {
      const shownInset = r.texts.includes('小笠原諸島') || FAR.some((t) => r.sN.drawn.includes(t));
      const warned = warnings.some((w) => w.includes(`(${r.size[0]}×${r.size[1]} px)`) && w.includes('小笠原諸島 inset'));
      if (shownInset) for (const t of FAR) ok(r.s0.named.includes(t) && r.sN.named.includes(t), `${c.name}: the inset is drawn but ${t} is not named`);
      else ok(warned, `${c.name}: the inset is left out without a warning`);
      console.log(`     ${c.name}: ${shownInset ? 'inset drawn, 沖ノ鳥島・南鳥島 named' : 'inset left out with a warning'}`);
    }
    if (c.kind === 'extremes' || c.kind === 'author') {
      const labels = c.data.points.map((p) => p.label);
      for (const l of labels) ok(r.sN.named.includes(l), `${c.name}: "${l}" is not drawn`);
      for (const t of c.kind === 'extremes' ? FAR : ['南鳥島']) {
        ok(!r.sN.named.includes(t), `${c.name}: the built-in name ${t} is drawn next to the author's point`);
        ok(r.s0.named.includes(t), `${c.name}: ${t} is not named at step 0 (before the author's point)`);
        ok(r.sN.drawn.includes(t) && layer(t) === 0, `${c.name}: ${t}: one dot and one readable entry (the author's)`);
      }
    }
  }
  ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();
} finally {
  await browser.close();
}
console.log(`${cases.length} maps (${HEIGHTS.length} heights × ${WIDTHS.length} widths × 2 layouts × 2 label settings, and ${cases.length - HEIGHTS.length * WIDTHS.length * 4} others), ${oks} checks passed`);
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('OK: m-map-japan territories');

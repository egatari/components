// m-map-japan's territory rule (docs/map-design.md §5.3, owner's decision for v1.8.0), at many sizes, built with the pinned Egatari Studio.
//   - by default (islands="main") there is no 小笠原諸島 inset, and 北方領土・竹島・尖閣諸島 are drawn (present, inside the element,
//     not hidden) at every size of the grid: heights 200–700 px, widths 300–1184 px, layout="inset" and "true", with and without labels
//   - layout="true" also draws 沖ノ鳥島・南鳥島・父島・硫黄島, and names 竹島・尖閣諸島・沖ノ鳥島・南鳥島・父島・硫黄島 (or warns that a name cannot fit)
//   - islands="all" at 300, 380 and 520 px high (and 300×200, 260×160) either names 沖ノ鳥島 and 南鳥島 in the inset or leaves the
//     inset out with a warning
//   - an author point with a label on a territory island replaces the built-in dot and name (one dot, one name; layout="true" with
//     the four extremities, and islands="all" with a point on 南鳥島), and the readable layer has one entry per island
//   - the readable layer lists exactly the territories that are drawn
//   - labels and leader lines stay out of the inset frames and their captions (except a label of something inside that frame):
//     every map above, the demo's 八地方区分 slide, and 八地方区分 with labels at 6 heights × 4 widths, also with islands="all"
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
const GROUPS = { regions: ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'].map((g, i) => ({ group: g, tone: `series-${i % 4 + 1}`, step: i + 1 })) };
cases.push({ kind: 'regions', name: 'the demo\'s 八地方区分 slide', attrs: 'aria-label="八地方区分の地図"', style: 'height:440px', data: GROUPS, layout: 'inset' });
for (const h of [240, 300, 360, 440, 520, 600]) for (const w of [420, 640, 900, 1184]) for (const isl of ['main', 'all'])
  cases.push({ kind: 'regions', name: `八地方区分, islands="${isl}", ${w}×${h}`, attrs: `islands="${isl}"`, style: `width:${w}px;height:${h}px`, data: GROUPS, layout: 'inset' });
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
      // frames (rect, stroke-width 2, no fill), captions (--muted text), label chips (rect rx=6) and leader lines (stroke-width 1.5), final state
      const svgR = el.querySelector('svg').getBoundingClientRect();
      const box = (e) => { const b = e.getBoundingClientRect(); return { x: b.left - svgR.left, y: b.top - svgR.top, w: b.width, h: b.height }; };
      const frames = [...el.querySelectorAll('rect[fill="none"][stroke-width="2"]')].map((e) => ({ x: +e.getAttribute('x'), y: +e.getAttribute('y'), w: +e.getAttribute('width'), h: +e.getAttribute('height') }));
      const caps = [...el.querySelectorAll('text[fill="var(--muted)"]')].filter(shown).map((e) => ({ ...box(e), t: e.textContent }));
      const hit = (b, q) => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y;
      const at = (p, q) => p[0] > q.x && p[0] < q.x + q.w && p[1] > q.y && p[1] < q.y + q.h;
      const clash = [];
      const IN_FRAME = ['尖閣諸島', '沖ノ鳥島', '南鳥島', '父島', '硫黄島'];
      for (const r of el.querySelectorAll('rect[rx="6"]')) {
        if (!shown(r)) continue;
        const t = r.parentNode.querySelector('text')?.textContent || '', b = { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
        frames.forEach((f, j) => { if (hit(b, f) && !(IN_FRAME.includes(t) && b.x >= f.x && b.x + b.w <= f.x + f.w && b.y >= f.y && b.y + b.h <= f.y + f.h)) clash.push(`label "${t}" on inset frame ${j}`); });
        caps.forEach((q) => { if (hit(b, q)) clash.push(`label "${t}" on the caption "${q.t}"`); });
      }
      for (const pth of el.querySelectorAll('path[stroke-width="1.5"]')) {
        if (!shown(pth)) continue;
        const n = (pth.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
        if (n.length !== 4) continue;
        const a = [n[0], n[1]], b = [n[2], n[3]];
        for (let u = 0; u <= 40; u++) {
          const p = [a[0] + (b[0] - a[0]) * u / 40, a[1] + (b[1] - a[1]) * u / 40];
          frames.forEach((f, j) => { if (!at(a, f) && at(p, f)) clash.push(`leader from (${a.map((v) => v.toFixed(0))}) into inset frame ${j}`); });
          caps.forEach((q) => { if (at(p, q)) clash.push(`leader from (${a.map((v) => v.toFixed(0))}) across the caption "${q.t}"`); });
        }
      }
      return { s0, sN, sr, texts, size: [el.clientWidth, el.clientHeight], clash: [...new Set(clash)] };
    }, i);
    ok(r.clash.length === 0, `${c.name}: ${r.clash.join('; ')}`);
    const T = ['北方領土', '竹島', '尖閣諸島'], FAR = ['沖ノ鳥島', '南鳥島'], OGA = ['父島', '硫黄島'];
    for (const [when, s] of [['step 0', r.s0], ['final', r.sN]]) {
      ok(s.bad.length === 0, `${c.name}: ${s.bad.join('; ')}`);
      for (const t of T) ok(s.drawn.includes(t), `${c.name} (${when}): ${t} is not drawn`);
      if (c.layout === 'true') for (const t of FAR.concat(OGA)) ok(s.drawn.includes(t), `${c.name} (${when}): ${t} is not drawn`);
    }
    // the readable layer lists what is drawn (the final state), once per island
    const builtIn = (x) => /(北海道|島根県|沖縄県|東京都)）$/.test(x);
    const layer = (t) => r.sr.filter((x) => x.startsWith(t + '（') && builtIn(x)).length;
    const author = (t) => r.sr.some((x) => x.startsWith(t) && !builtIn(x));
    for (const t of T.concat(FAR, c.layout === 'true' ? OGA : [])) {
      const drawn = r.sN.drawn.includes(t), inLayer = layer(t) + (author(t) ? 1 : 0);
      ok(drawn ? inLayer === 1 : inLayer === 0, `${c.name}: readable layer has ${inLayer} entries for ${t}, drawn: ${drawn} (${r.sr.join('；')})`);
    }
    if (c.kind === 'grid' && c.layout === 'inset') {
      ok(!r.texts.includes('小笠原諸島') && !FAR.some((t) => r.sN.drawn.includes(t)), `${c.name}: the 小笠原諸島 inset is drawn by default`);
    }
    if (c.layout === 'true' && c.kind === 'grid') {
      for (const t of ['竹島', '尖閣諸島'].concat(FAR)) ok(r.s0.named.includes(t) && r.sN.named.includes(t), `${c.name}: ${t} is not named`);
      // 父島・硫黄島: named, or a warning names the one that cannot fit
      for (const t of OGA) if (!r.sN.named.includes(t)) console.log(`     ${c.name}: ${t} not named (warned)`);
      for (const t of OGA) ok(r.s0.named.includes(t) && r.sN.named.includes(t) || warnings.some((w) => w.includes(`(${r.size[0]}×${r.size[1]} px)`) && w.includes('the name ' + t)), `${c.name}: ${t} is neither named nor warned`);
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
  console.log(`     labels left out for lack of room (warned): ${warnings.filter((w) => w.includes('no room for the label')).length}`);
  ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();
} finally {
  await browser.close();
}
console.log(`${cases.length} maps (${HEIGHTS.length} heights × ${WIDTHS.length} widths × 2 layouts × 2 label settings, 49 八地方区分 maps, and ${cases.length - HEIGHTS.length * WIDTHS.length * 4 - 49} others), ${oks} checks passed`);
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('OK: m-map-japan territories');

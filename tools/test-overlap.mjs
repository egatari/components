// m-flow and m-quad keep their own text apart (#140, from a deck an AI model wrote where labels landed on each other), built
// with the pinned Egatari Studio from tools/fixtures/overlap/overlap.html (the demos never reach these cases). On every slide,
// at its last step and end, with the rendered text boxes (on screen for texts and points; getBBox in the svg units for m-flow's
// edge text against lines; 1 px of slack):
//   1. no two texts of a part overlap
//   2. m-flow: no edge text touches the line of another edge (2 px of clearance), and a pair of edges between the same two
//      boxes in opposite directions with no shift is drawn apart (auto shift)
//   3. m-quad: no quadrant name touches a point or a point's name
//   4. no ctx.report and no page error
//   node tools/test-overlap.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-overlap-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'overlap.out.html');
S.build(path.join(ROOT, 'tools', 'fixtures', 'overlap', 'overlap.html'), out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], warns = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => DECK.slides.length);
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(async (i) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      DECK.go(i, DECK.slides[i]._max, false); await frame();
      const c = DECK.slides[i].querySelector('m-flow, m-quad'), kind = c.localName;
      const box = (e) => { const b = e.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; };
      const scr = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const meet = (a, b, gp) => a[0] < b[2] + gp && a[2] > b[0] - gp && a[1] < b[3] + gp && a[3] > b[1] - gp;
      const texts = [...c.querySelectorAll('svg text')].filter((t) => t.textContent.trim() && !t.closest('foreignObject'));
      const o = { kind, title: DECK.slides[i].querySelector('h2').textContent, overlaps: [], onLine: [], quadHits: [] };
      // 1. texts of the part, pairwise
      for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
        if (texts[a].contains(texts[b]) || texts[b].contains(texts[a])) continue;
        if (meet(scr(texts[a]), scr(texts[b]), -1)) o.overlaps.push(texts[a].textContent + ' / ' + texts[b].textContent);
      }
      if (kind === 'm-flow') {
        // 2. edge text against the other edges' lines; the pair's lines apart
        const segHits = (s, r) => { const [[x, y], [x2, y2]] = s, dx = x2 - x, dy = y2 - y; let t0 = 0, t1 = 1;
          const p = [-dx, dx, -dy, dy], q = [x - r[0], r[2] - x, y - r[1], r[3] - y];
          for (let k = 0; k < 4; k++) { if (p[k] === 0) { if (q[k] < 0) return false; continue; } const u = q[k] / p[k]; if (p[k] < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
          return true; };
        c.edges.forEach((e, j) => {
          [e.lab, e.amt].filter(Boolean).forEach((t) => {
            const b = box(t), r = [b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2];
            c.edges.forEach((f, k) => { if (k !== j && !f.poly && segHits([f.p0, f.p1], r)) o.onLine.push(t.textContent + ' on ' + (f.lab ? f.lab.textContent : 'edge ' + k)); });
          });
        });
        const d = c.data.edges;
        o.apart = d.map((e, j) => { const k = d.findIndex((f) => f.from === e.to && f.to === e.from); if (k < 0 || e.shift || d[k].shift) return null;
          const A = c.edges[j], B = c.edges[k], mA = [(A.p0[0] + A.p1[0]) / 2, (A.p0[1] + A.p1[1]) / 2], mB = [(B.p0[0] + B.p1[0]) / 2, (B.p0[1] + B.p1[1]) / 2];
          return Math.hypot(mA[0] - mB[0], mA[1] - mB[1]); }).filter((v) => v !== null);
      } else {
        // 3. quadrant names against the points and their names
        const names = [...c.quadG.querySelectorAll('text')];
        c.pts.forEach((p) => {
          const cb = scr(p.g.querySelector('circle')), lab = p.g.querySelector('text'), lb = scr(lab);
          names.forEach((nm) => { const nb = scr(nm); if (meet(nb, cb, 0) || meet(nb, lb, 0)) o.quadHits.push(nm.textContent + ' / ' + lab.textContent); });
        });
      }
      o.reports = (DECK.componentErrors || []).filter((x) => x.kind === 'report').map((x) => x.code + ' ' + x.msg);
      return o;
    }, i);
    const at = `slide ${i + 1} (${r.kind}, ${r.title})`;
    ok(!r.overlaps.length, `${at}: no two texts overlap${r.overlaps.length ? ': ' + r.overlaps.join(' | ') : ''}`);
    if (r.kind === 'm-flow') {
      ok(!r.onLine.length, `${at}: no edge text on another edge's line${r.onLine.length ? ': ' + r.onLine.join(' | ') : ''}`);
      if (r.apart.length) ok(r.apart.every((v) => v >= 16), `${at}: opposite edges without shift are drawn apart (${r.apart.map((v) => v.toFixed(1)).join(', ')} px between their middles)`);
    } else ok(!r.quadHits.length, `${at}: no quadrant name on a point or its name${r.quadHits.length ? ': ' + r.quadHits.join(' | ') : ''}`);
    if (i === n - 1) ok(!r.reports.length, `no ctx.report${r.reports.length ? ': ' + r.reports.join(' | ') : ''}`);
  }
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}
if (fails) { console.log(`test-overlap: ${fails} failure(s)`); process.exit(1); }
console.log('test-overlap: ok');

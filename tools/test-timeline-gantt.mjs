// m-timeline's project-plan (Gantt) features, measured in the browser on the final state:
//   - `after` arrows start at the predecessor's end (its right end at the middle, or the edge facing the dependent within
//     32 px of the end) and end at the dependent item's start (its left end at the middle, or, when it starts on the
//     predecessor's end day and cannot be entered from the side, down onto its edge within 26 px of the start; a milestone:
//     its corner), with room for the arrowhead; every segment is horizontal or vertical; no vertical segment crosses another item's band
//   - `progress`: the fill is progress % of the band's length, from its start
//   - `today`: the line is at the date's position (measured against a band that contains the date)
//   - `unit="day" | "week" | "month"`: tick labels at least 24 px and never overlapping; weekends shaded in day mode
// Built with the pinned Egatari Studio (tools/studio.mjs). The demo's project-plan slide and a few made-up cases.
//   node tools/test-timeline-gantt.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-timeline-gantt-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// made-up cases (after the demo's slides): day ticks with weekends, month ticks over two years, a dependent starting on
// its predecessor's end day, a short predecessor whose name is written after it, v orientation
const tl = (attrs, nodes, h = 430) => `<section class="slide"><h2>x</h2><div class="body"><m-timeline ${attrs} style="height:${h}px"><script type="application/json">${JSON.stringify({ nodes })}</script></m-timeline></div></section>`;
const extra = [
  tl('unit="day" today="2026-11-10"', [
    { id: 'a', label: '準備', when: '2026-11-02', end: '2026-11-09', lane: '作業', progress: 50 },
    { id: 'b', label: '本番', when: '2026-11-09', end: '2026-11-27', lane: '作業', after: ['a'], progress: 25 },
    { id: 'c', label: '片付け', when: '2026-11-27', end: '2026-12-01', lane: '作業', after: ['b'] }]),
  tl('unit="month"', [
    { id: 'a', label: '調査', when: '2026-01', end: '2026-09', lane: '研究' },
    { id: 'b', label: '開発', when: '2026-09', end: '2027-10', lane: '研究', after: ['a'] },
    { id: 'm', label: '報告', when: '2027-11', lane: '研究', after: ['b'] }]),
  tl('unit="week"', [
    { id: 'a', label: '設計の見直し', when: '2026-10-05', end: '2026-10-08', lane: '設計' },
    { id: 'x', label: '並行の作業', when: '2026-10-12', end: '2026-12-01', lane: '設計' },
    { id: 'b', label: '実装', when: '2026-10-08', end: '2026-11-20', lane: '開発', after: ['a'], progress: 40 }]),
  tl('orient="v" unit="week" today="2026-10-20"', [
    { id: 'a', label: '設計', when: '2026-10-05', end: '2026-10-19' },
    { id: 'b', label: '実装', when: '2026-10-19', end: '2026-11-16', after: ['a'], progress: 60 }], 450),
];
const demo = fs.readFileSync(path.join(ROOT, 'components', 'timeline', 'demo.html'), 'utf8');
const src = path.join(S.compDir('timeline'), 'gantt-test.html'), out = path.join(work, 'gantt-test.out.html');
fs.writeFileSync(src, demo.replace(/<\/div>\s*<\/body>/, extra.join('\n') + '\n</div>\n</body>'));
try { S.build(src, out); } finally { fs.rmSync(src); }

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const res = await page.evaluate(async () => {
    const out = [];
    const near = (a, b, e = 0.6) => Math.abs(a - b) <= e;
    for (let i = 0; i < DECK.slides.length; i++) {
      const s = DECK.slides[i];
      for (const c of s._comps) {
        if (c.localName !== 'm-timeline' || !(c.deps.length || c.today || c.L.weekends.length || c.L.lanesIt.some((o) => o.pct !== null) || c.getAttribute('unit'))) continue;
        DECK.seek(i, s._max, Infinity);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = { slide: i, hz: c.hz, deps: [], prog: [], today: null, ticks: [], weekends: c.L.weekends.length, unit: c.getAttribute('unit') };
        const rec = new Map(c.lanes.map((l) => [l.o.n.id, l]));
        const box = (l) => (l.rect ? { x: +l.rect.getAttribute('x'), y: +l.rect.getAttribute('y'), w: +l.rect.getAttribute('width'), h: +l.rect.getAttribute('height') } : { ...l.r });
        for (const d of c.deps) {
          const A = rec.get(d.from), B = rec.get(d.to), a = box(A), b = box(B), p = d.pts, q0 = p[0], qn = p[p.length - 1];
          const msg = [];
          // start: the predecessor's end
          // either the right end (band) or right tip (milestone) at the middle, or the edge facing the dependent near the end
          // (within 32 px of a band's end; a milestone's bottom or top corner); a band whose name is written after it: the edge only
          const [u, cc] = c.hz ? q0 : [q0[1], q0[0]], [au, aw, ac, ah] = c.hz ? [a.x, a.w, a.y, a.h] : [a.y, a.h, a.x, a.w];
          const atEnd = near(u, au + aw) && near(cc, ac + ah / 2);
          const atEdge = (near(cc, ac) || near(cc, ac + ah)) && (A.rect ? u <= au + aw - 7.5 && u >= au + aw - 32 : near(u, au + aw / 2));
          if (!(atEdge || (atEnd && A.o.where !== 'after'))) msg.push(`start ${q0} is not the end of ${d.from}`);
          if (atEdge) r.edgeStarts = (r.edgeStarts || 0) + 1;
          // end: the dependent's start, at its middle, entering along the time axis
          // or, entering across the time axis, the dependent's facing edge near its start (a milestone: its corner)
          const pn = p[p.length - 2], [eu, ec] = c.hz ? qn : [qn[1], qn[0]], [pu, pc] = c.hz ? pn : [pn[1], pn[0]], [bu, bw, bc, bh] = c.hz ? [b.x, b.w, b.y, b.h] : [b.y, b.h, b.x, b.w];
          const along = near(eu, bu) && near(ec, bc + bh / 2) && near(pc, ec) && pu < eu - 16;
          const across = near(pu, eu) && Math.abs(pc - ec) >= 22 && (B.rect ? (near(ec, bc) || near(ec, bc + bh)) && eu >= bu + 4 && eu <= bu + 26 : near(eu, bu + bw / 2) && (near(ec, bc) || near(ec, bc + bh)));
          if (!along && !across) msg.push(`end ${qn} is not the start of ${d.to}, or its last segment leaves no room for the arrowhead`);
          if (across) r.topEnds = (r.topEnds || 0) + 1;
          for (let j = 1; j < p.length; j++) if (!near(p[j][0], p[j - 1][0], 0.01) && !near(p[j][1], p[j - 1][1], 0.01)) msg.push(`segment ${j} is not at a right angle`);
          // vertical segments: no other band crossed
          for (let j = 1; j < p.length; j++) {
            const v = c.hz ? near(p[j][0], p[j - 1][0], 0.01) : near(p[j][1], p[j - 1][1], 0.01);
            if (!v) continue;
            for (const l of c.lanes) {
              if (l === A || l === B || !l.rect) continue;
              const o = box(l), [x, y0, y1] = c.hz ? [p[j][0], Math.min(p[j][1], p[j - 1][1]), Math.max(p[j][1], p[j - 1][1])] : [p[j][1], Math.min(p[j][0], p[j - 1][0]), Math.max(p[j][0], p[j - 1][0])];
              const [lo, hi, c0, c1] = c.hz ? [o.x, o.x + o.w, o.y, o.y + o.h] : [o.y, o.y + o.h, o.x, o.x + o.w];
              if (x > lo && x < hi && y1 > c0 && y0 < c1) msg.push(`crosses the band of ${l.o.n.id}`);
            }
          }
          r.deps.push({ from: d.from, to: d.to, n: p.length, msg });
        }
        for (const l of c.lanes) if (l.o.pct !== null && l.rect) {
          const b = box(l), len = c.hz ? b.w : b.h, w = l.o.progU[1] - l.o.progU[0], el = l.o.progEl;
          const bb = el ? el.getBBox() : { width: 0, height: 0 };
          r.prog.push({ id: l.o.n.id, pct: l.o.pct, want: len * l.o.pct / 100, got: w, drawn: (c.hz ? bb.width : bb.height) + 2, start: l.o.progU[0], bandStart: c.hz ? b.x : b.y });
        }
        if (c.today) {
          // the band that contains today: its position by days
          const t = c.getAttribute('today'), day = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
          const l = c.lanes.find((l) => l.rect && day(String(l.o.n.when)) <= day(t) && day(t) <= day(String(l.o.n.end)));
          const b = box(l), u0 = (c.hz ? b.x : b.y) - 1.5, u1 = (c.hz ? b.x + b.w : b.y + b.h) + 1.5;
          const want = u0 + (u1 - u0) * (day(t) - day(String(l.o.n.when))) / (day(String(l.o.n.end)) - day(String(l.o.n.when)));
          const ln = c.today.line, got = c.hz ? +ln.getAttribute('x1') : +ln.getAttribute('y1');
          r.today = { want, got, vertical: c.hz ? ln.getAttribute('x1') === ln.getAttribute('x2') : ln.getAttribute('y1') === ln.getAttribute('y2'), text: c.today.g.querySelector('text').textContent };
        }
        const tt = [...c.axis.ticks.querySelectorAll('text')].map((e) => ({ s: e.textContent, fs: parseFloat(getComputedStyle(e).fontSize), b: e.getBoundingClientRect() }));
        for (let j = 1; j < tt.length; j++) { const p = tt[j - 1].b, q = tt[j].b; if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0) r.ticks.push(`overlap ${tt[j - 1].s} / ${tt[j].s}`); }
        tt.forEach((x) => { if (x.fs < 24) r.ticks.push(`small ${x.s} ${x.fs}px`); });
        r.nTicks = tt.length; r.tickTexts = tt.map((x) => x.s).join(' ');
        out.push(r);
      }
    }
    return out;
  });
  // the final state of each measured figure, for looking at (work folder)
  for (const r of res) {
    await page.evaluate((i) => DECK.seek(i, DECK.slides[i]._max, Infinity), r.slide);
    await page.evaluate(() => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f))));
    await page.screenshot({ path: path.join(work, `s${r.slide}_end.png`) });
  }
  for (const r of res) {
    const tag = `slide ${r.slide}${r.unit ? ` unit=${r.unit}` : ''}${r.hz ? '' : ' v'}`;
    for (const d of r.deps) ok(!d.msg.length, `${tag}: arrow ${d.from} → ${d.to} (${d.n} points)${d.msg.length ? ': ' + d.msg.join('; ') : ''}`);
    for (const p of r.prog) ok(Math.abs(p.got - p.want) < 0.01 && Math.abs(p.drawn - p.got) < 0.6 && Math.abs(p.start - p.bandStart) < 0.01, `${tag}: progress ${p.id} ${p.pct}% = ${p.got.toFixed(2)} px of the band (want ${p.want.toFixed(2)}, drawn ${p.drawn.toFixed(2)})`);
    if (r.today) ok(Math.abs(r.today.got - r.today.want) < 0.6 && r.today.vertical && /^(今日|Today)$/.test(r.today.text), `${tag}: today line at ${r.today.got.toFixed(1)} (want ${r.today.want.toFixed(1)}), labelled ${r.today.text}`);
    ok(!r.ticks.length && r.nTicks >= 2, `${tag}: ${r.nTicks} tick labels, none overlapping or below 24 px (${r.tickTexts})${r.ticks.length ? ': ' + r.ticks.join('; ') : ''}`);
    if (r.unit === 'day') ok(r.weekends >= 3, `${tag}: ${r.weekends} weekends shaded`);
  }
  // the cases: the detour and the edge start are exercised
  ok(res.some((r) => r.edgeStarts), 'an arrow leaves from the edge near the end of its predecessor (another band starts there, or the name is written after it)');
  ok(res.filter((r) => r.deps.length).length >= 4, `arrows measured on ${res.filter((r) => r.deps.length).length} figures`);
  ok(errors.length === 0, 'no console error or warning' + (errors.length ? ': ' + errors.join(' | ') : ''));
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

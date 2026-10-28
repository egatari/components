// layout(ctx) (spec §8.4 Layout; design G1) in m-timer and m-predict, built with the pinned Egatari Studio. The player calls
// layout on laid-out size changes, font loading and when the slide shows, then renders again. Studio scales the stage only
// with a transform, so a part's box changes only when the page lays it out anew (a column next to text whose fonts finish
// decoding after mount). The pinned Studio does not call layout yet, so the test calls it with a hand-made ctx:
//   1. the same size: layout changes nothing (no mutation in the part)
//   2. a new width and height: one svg at the new size, the part's children in the same order as after mount, the live region
//      kept (one); reports only of the size code, with the part's prefix (820 px is narrower than the demos); viewer input kept
//      (m-predict: counts and the learner's prediction, one set of controls per choice; m-timer: the extension, and the
//      clock shows it)
//   3. a box of size 0 (display:none): layout keeps the last drawing
//   node tools/test-layout.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-layout-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const browser = await S.browser.launch();
try {
  for (const name of ['predict', 'timer']) {
    const out = path.join(work, `${name}.out.html`);
    S.build(path.join(ROOT, 'components', name, 'demo.html'), out);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(S.browser.fileUrl(out));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(async (name) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const reports = [];
      const ctx = { mode: 'talk', lang: document.documentElement.lang, instant: true, entered: false, report: (code, msg) => reports.push(code + ' ' + msg) };
      const own = (c, m) => { let p = Object.getPrototypeOf(c); while (p && !Object.prototype.hasOwnProperty.call(p, m)) p = Object.getPrototypeOf(p); return p[m]; };
      const i = DECK.slides.findIndex((s) => s.querySelector('m-' + name));
      DECK.go(i, 1, false); await frame();
      const c = DECK.slides[i].querySelector('m-' + name), o = { has: typeof c.layout === 'function' };
      // viewer input
      if (name === 'predict') { c.input(0, 30); c.choose(1); }
      else { let tot = 0; own(c, 'render').call(c, 1, 10, { mode: 'talk', extend: (d) => (tot += d) }); c.extend(60); }
      const state = () => (name === 'predict' ? c.counts().join() + '/' + c._pick : String(c._ext[1]) + '/' + c.clock.textContent);
      o.state0 = state();
      // 1. the same size
      const seen = [], ob = new MutationObserver((ms) => seen.push(...ms)); ob.observe(c, { attributes: true, childList: true, subtree: true, characterData: true });
      c.layout(ctx); seen.push(...ob.takeRecords()); ob.disconnect();
      o.sameWrites = seen.length;
      // 2. a new size
      const kids = () => [...c.children].map((e) => e.localName + (e.className && typeof e.className === 'string' ? '.' + e.className : '')).join(' ');
      const order0 = kids(), svg0 = c.querySelector('svg');
      c.style.width = '820px'; c.style.height = (c.clientHeight + 40) + 'px';
      const W = c.clientWidth, H = c.clientHeight;
      c.layout(ctx);
      const svgs = c.querySelectorAll(':scope > svg');
      o.size = { W, H, svgW: +svgs[0].getAttribute('width'), svgH: +svgs[0].getAttribute('height'), svgs: svgs.length, order: kids() === order0, kids: kids(), fresh: svgs[0] !== svg0 };
      o.say = c.querySelectorAll(name === 'predict' ? '.pd-say' : '.tm-say').length;
      if (name === 'predict') o.ctl = { ctl: c.querySelectorAll('.pd-ctl').length, pick: c.querySelectorAll('.pd-pick').length, n: c.rows.length };
      o.state1 = state();
      o.reports = reports.slice();
      // 3. size 0
      const svg1 = c.querySelector('svg'); c.style.display = 'none'; c.layout(ctx); o.hidden = c.querySelector('svg') === svg1; c.style.display = 'block';
      return o;
    }, name);
    ok(r.has, `${name}: has layout(ctx)`);
    ok(r.sameWrites === 0, `${name}: layout at the same size changes nothing (${r.sameWrites} mutation(s))`);
    const z = r.size;
    ok(z.svgs === 1 && z.order && z.fresh && z.svgW === z.W && z.svgH === z.H, `${name}: layout at a new size draws one svg at ${z.W}×${z.H}, the children in the same order (${z.svgs} svg, ${z.svgW}×${z.svgH}; ${z.kids})`);
    ok(r.say === 1, `${name}: one live region after layout (${r.say})`);
    if (r.ctl) ok(r.ctl.ctl === r.ctl.n && r.ctl.pick === r.ctl.n, `${name}: one set of controls per choice after layout (${r.ctl.ctl} counters, ${r.ctl.pick} picks, ${r.ctl.n} choices)`);
    ok(r.state1 === r.state0, `${name}: viewer input survives layout (${r.state0} → ${r.state1})`);
    ok(r.reports.every((x) => x.startsWith(`size [${name}] `)), `${name}: layout reports with ctx, size code and prefix only (${r.reports.length}${r.reports.length ? ': ' + r.reports.join(' | ') : ''})`);
    ok(r.hidden, `${name}: layout in a box of size 0 keeps the drawing`);
    ok(!errors.length, `${name}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (fails) { console.log(`test-layout: ${fails} failure(s)`); process.exit(1); }
console.log('test-layout: ok');

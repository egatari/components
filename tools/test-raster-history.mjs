// m-tree, m-venn, m-numberline: the pixels of (i, k, t) do not depend on how often the same picture was drawn before (#1101).
// The DOM after render(k, t) was always the same, but Chrome draws a shape that is rasterized again without being rebuilt (because
// something near it changed) with a different outline from its 2nd raster on (software GPU, as on CI's Linux and Windows): tens of
// edge pixels of rounded boxes, circles and arcs. Whether that happened depended on how many frames were painted between calls,
// so Egatari Studio's determinism check, its call-order check (kit/check.mjs D) and test-step-reset failed now and then.
// The parts now rebuild their shapes at the end of render (same attribute values), so every raster after a render is a first one.
// For every demo step: (A) open, seek(i, k, 0.5), shoot; (B) then draw (k, Infinity) and (k, 0.5) again, a frame painted after each,
// several times, shoot; (C) open, click the part (the runtime then redraws it with ctx.reset), seek(i, k, 0.5), shoot.
// A, B and C must agree to at most MAX clearly different pixels (RGB difference > 48). Built with the pinned Egatari Studio.
// The check bites on a software rasterizer (CI's Linux: before the fix 45–87 pixels, every run, at the steps Studio's CI reported).
// MAX = 24 leaves room for a smaller effect of a hardware GPU (macOS, Metal): the ends of m-numberline's straight ticks, up to 16 pixels,
// with or without the fix (within Studio's tolerance of 40).
//   node tools/test-raster-history.mjs [work folder] [--only tree,venn]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : null;
const NAMES = ['tree', 'venn', 'numberline'].filter((n) => !only || only.includes(n));
const S = await studio();
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-raster-history-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const MAX = 24, T = 0.5, REPEAT = 4;
const HIDE = '#dt-cb,#deck-toast,#deck-back,.deck-tools{display:none!important}';
const CLIP = { x: 0, y: 0, width: 1280, height: 720 };

const browser = await S.browser.launch();
try {
  for (const name of NAMES) {
    const out = path.join(work, name + '.html');
    S.build(path.join(ROOT, 'components', name, 'demo.html'), out);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const open = async () => {
      await page.goto(S.browser.fileUrl(out));
      await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
      await page.addStyleTag({ content: HIDE });
      await page.evaluate(() => document.fonts.ready);
    };
    const settle = () => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const seek = async (i, k, t) => { await page.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [i, k, t]); await settle(); };
    const shot = async () => { await settle(); return page.screenshot({ clip: CLIP, animations: 'disabled', caret: 'hide' }); };
    const differ = async (a, b) => (a.equals(b) ? 0 : page.evaluate(async ([a, b]) => {
      const ld = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
      const [ia, ib] = await Promise.all([ld(a), ld(b)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let j = 0; j < da.length; j += 4) if (Math.abs(da[j] - db[j]) + Math.abs(da[j + 1] - db[j + 1]) + Math.abs(da[j + 2] - db[j + 2]) > 48) n++;
      return n;
    }, [a.toString('base64'), b.toString('base64')]));
    await open();
    const plan = await page.evaluate(() => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length })).filter((s) => s.comps));
    const bad = [];
    let checked = 0;
    for (const s of plan) {
      for (let k = 1; k <= s.max; k++) {
        await open();
        await seek(s.i, k, T);
        const A = await shot();
        for (let r = 0; r < REPEAT; r++) { await seek(s.i, k, null); await seek(s.i, k, T); }
        const B = await shot();
        await open();
        await seek(s.i, k, T);
        const at = await page.evaluate((i) => { const b = DECK.slides[i]._comps[0].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, s.i);
        await page.mouse.click(at.x, at.y);
        await page.mouse.move(0, 0);
        await seek(s.i, k, T);
        const C = await shot();
        const nb = await differ(A, B), nc = await differ(A, C);
        checked++;
        if (nb > MAX || nc > MAX) {
          bad.push(`s${s.i}k${k} (redrawn: ${nb}, after a click and ctx.reset: ${nc})`);
          fs.writeFileSync(path.join(work, `${name}-s${s.i}k${k}-A.png`), A);
          fs.writeFileSync(path.join(work, `${name}-s${s.i}k${k}-B.png`), B);
          fs.writeFileSync(path.join(work, `${name}-s${s.i}k${k}-C.png`), C);
        }
      }
    }
    ok(!bad.length, `${name}: ${checked} steps at t = ${T}: the same pixels after the step was drawn again ${REPEAT} times, and after a click and ctx.reset (at most ${MAX} pixels differ)` + (bad.length ? '\n     ' + bad.join('\n     ') + `\n     shots: ${work}` : ''));
    ok(!errors.length, `${name}: no console error` + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

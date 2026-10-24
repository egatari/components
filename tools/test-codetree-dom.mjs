// m-codetree: the DOM and the pixels after render(k, t) do not depend on which step was drawn before.
// For every demo slide and every step b: render(a) then render(b) (every a) must leave exactly the DOM of a fresh render(b),
// attributes and text included, and the same pixels. Built with the pinned Egatari Studio (tools/studio.mjs).
//   node tools/test-codetree-dom.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-codetree-dom-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'demo.out.html');
S.build(path.join(ROOT, 'components', 'codetree', 'demo.html'), out);
const browser = await S.browser.launch();
const TIMES = [Infinity, 2.1];   // the end of a step, and the middle of its motion
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async () => {
    await page.goto(S.browser.fileUrl(out));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
  };
  // a canonical text of the component's DOM: tag, sorted attributes, text, children (the stale attributes show up here)
  const dump = (si) => page.evaluate((si) => {
    const c = DECK.slides[si]._comps[0];
    const walk = (e, d) => {
      // style: the browser's own serialization (the attribute text keeps the spacing it was first written with)
      const attrs = [...e.attributes].map((a) => a.name + '=' + (a.name === 'style' ? e.style.cssText : a.value)).sort().join(' ');
      let s = ' '.repeat(d) + e.tagName.toLowerCase() + ' [' + attrs + ']';
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('');
      if (own) s += ' "' + own + '"';
      return [s, ...[...e.children].map((x) => walk(x, d + 1))].join('\n');
    };
    return walk(c, 0);
  }, si);
  const render = (si, k, t) => page.evaluate(([si, k, t]) => { DECK.seek(si, 0, 0); DECK.slides[si]._comps[0].render(k, t); }, [si, k, t]);
  // Pixels: the DOM is compared exactly (above); the shots only have to agree to antialiasing noise. The same DOM is not always rasterized to the same
  // bits (a few hundred edge pixels of strokes and text, up to about 30 levels, depending on what was painted before), so two shots are the same when no
  // 8 x 8 block of the two shots differs in its mean by more than TOL (single edge pixels may differ a lot on a software renderer; a block mean does not).
  // An element that should be hidden but is drawn changes the mean of the blocks it covers by far more (full contrast over a stroke or a glyph).
  // The component is hidden and shown again before a shot, which drops most of the paint history. A fresh component is a second mount in the same page.
  const TOL = 40, BLOCK = 8;
  const shot = async (si) => {
    await page.evaluate((si) => { const c = DECK.slides[si]._comps[0], d = c.style.display; c.style.display = 'none'; c.offsetHeight; c.style.display = d; }, si);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return (await page.locator(`.slide >> nth=${si}`).locator('m-codetree').screenshot()).toString('base64');
  };
  const same = (a, b) => page.evaluate(async ([a, b, tol, blk]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d; });
    const [x, y] = await Promise.all([load(a), load(b)]);
    if (x.width !== y.width || x.height !== y.height) return false;
    const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const p = px(x), q = px(y), W = x.width, H = x.height;
    for (let by = 0; by < H; by += blk) for (let bx = 0; bx < W; bx += blk) {
      let sum = 0, n = 0;
      for (let yy = by; yy < Math.min(H, by + blk); yy++) for (let xx = bx; xx < Math.min(W, bx + blk); xx++) {
        const i = (yy * W + xx) * 4;
        sum += Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])); n++;
      }
      if (sum / n > tol) return false;
    }
    return true;
  }, [a, b, TOL, BLOCK]);
  await open();
  const info = await page.evaluate(() => DECK.slides.map((s) => ({ steps: s._comps[0].steps, hasSlide: !!s })));
  ok(info.length >= 3, 'the demo has ' + info.length + ' slides with a m-codetree');
  for (let si = 0; si < info.length; si++) {
    const n = info[si].steps;
    let bad = 0, firstBad = '';
    const kinds = new Set();
    for (const t of TIMES) for (let b = 0; b <= n; b++) {
      // a fresh component: mount it again (its SVG is rebuilt from the data)
      await page.evaluate((si) => { const c = DECK.slides[si]._comps[0]; c.textContent = ''; c.mount(); }, si);
      await render(si, b, t);
      const direct = await dump(si), directPix = await shot(si);
      for (let a = 0; a <= n; a++) {
        if (a === b) continue;
        await render(si, a, Infinity);
        await render(si, b, t);
        const d = await dump(si), px = await shot(si);
        const pxSame = await same(px, directPix);
        if (d !== direct || !pxSame) {
          bad++;
          if (process.env.VERBOSE) { const A = direct.split('\n'), B = d.split('\n'); A.forEach((x, j) => { if (x !== B[j]) kinds.add(x.replace(/^ +/, '').slice(0, 90) + '  ->  ' + String(B[j]).replace(/^ +/, '').slice(0, 110)); }); if (!pxSame) kinds.add('PIXELS'); }
          if (!firstBad) {
            const A = direct.split('\n'), B = d.split('\n'), i = A.findIndex((x, j) => x !== B[j]);
            firstBad = `a=${a} b=${b} t=${t}: ${d !== direct ? 'DOM line ' + i + '\n       fresh: ' + A[i] + '\n       after: ' + B[i] : ''}${!pxSame ? ' PIXELS differ' : ''}`;
          }
        }
      }
    }
    if (kinds.size) console.log([...kinds].join('\n'));
    ok(bad === 0, `slide ${si}: render(a) then render(b) equals a fresh render(b), DOM and pixels, for all a, b (${n + 1} steps, t = Infinity and mid-step)` + (bad ? `\n     ${bad} differences; first: ${firstBad}` : ''));
  }
  ok(errors.length === 0, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

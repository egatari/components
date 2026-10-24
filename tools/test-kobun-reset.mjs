// m-kobun: the conjugation card the viewer opened is closed when the runtime enters a step again with ctx.reset (Egatari Studio contract §3),
// and stays open when the same step is drawn again without it (a later frame of the step's own playback). A different step closes it as before.
// Built with the pinned Egatari Studio (tools/studio.mjs).
//   node tools/test-kobun-reset.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-kobun-reset-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'demo.out.html');
S.build(path.join(ROOT, 'components', 'kobun', 'demo.html'), out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  // open the card of the first auxiliary verb of slide 0 at step 2 (a click, as the viewer does), then draw again
  const r = await page.evaluate(() => {
    const c = DECK.slides[0]._comps[0], k = 2, shown = () => c.pop.style.display === 'block' && c.pop.textContent.length > 0;
    DECK.seek(0, k, Infinity);
    const w = c.querySelector('.kb-aux');
    w.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const o = { opened: shown() };
    c.render(k, Infinity); o.sameKStays = shown();
    c.render(k, Infinity, {}); o.emptyCtxStays = shown();
    c.render(k, Infinity, { reset: false }); o.resetFalseStays = shown();
    c.render(k, Infinity, { mode: 'talk', instant: true }); o.otherCtxStays = shown();
    c.render(k, Infinity, { reset: true }); o.resetCloses = !shown() && c._open === null;
    w.dispatchEvent(new MouseEvent('click', { bubbles: true })); o.reopened = shown();
    c.render(k + 1, Infinity); o.otherKCloses = !shown();
    return o;
  });
  ok(r.opened, 'a click on an auxiliary verb opens its card');
  ok(r.sameKStays, 'render(k, t) at the same k keeps the card open');
  ok(r.emptyCtxStays && r.resetFalseStays && r.otherCtxStays, 'a ctx without reset (or reset: false) keeps it open');
  ok(r.resetCloses, 'render(k, t, {reset: true}) at the same k closes it');
  ok(r.reopened, 'it can be opened again after a reset');
  ok(r.otherKCloses, 'a different k still closes it');
  ok(errors.length === 0, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

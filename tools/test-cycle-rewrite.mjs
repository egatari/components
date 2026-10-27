// m-cycle writes an attribute only when its value changes (1.13.1). Writing the same value again still makes Chrome repaint,
// and on macOS re-entering the same step then moved two edge pixels of a box (Studio's tools/test-step-reset.mjs, cycle s1k5,
// with the DOM byte-identical). Checked here without pixels, so on every platform: on each m-cycle slide of the demo, at the
// last step and at every step, entering the same step again (DECK.go) makes no attribute mutation in the part, and its DOM
// stays the same.
//   node tools/test-cycle-rewrite.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-cycle-rewrite-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'demo.out.html');
S.build(path.join(ROOT, 'components', 'cycle', 'demo.html'), out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const pos = await page.evaluate(() => DECK.slides.flatMap((s, i) => (s.querySelector('m-cycle') ? Array.from({ length: s._max + 1 }, (_, k) => [i, k]) : [])));
  ok(pos.length > 0, `the demo has m-cycle slides (${pos.length} steps)`);
  let checked = 0;
  for (const [i, k] of pos) {
    const r = await page.evaluate(async ([i, k]) => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      DECK.go(i, k, false); await frame();
      const parts = [...DECK.slides[i].querySelectorAll('m-cycle')];
      const before = parts.map((p) => p.innerHTML);
      const seen = [];
      const obs = parts.map((p) => { const o = new MutationObserver((ms) => ms.forEach((m) => seen.push(`${m.target.localName}[${m.attributeName}]`))); o.observe(p, { attributes: true, subtree: true }); return o; });
      DECK.go(i, k, false); await frame();
      obs.forEach((o) => { seen.push(...o.takeRecords().map((m) => `${m.target.localName}[${m.attributeName}]`)); o.disconnect(); });
      return { writes: seen, same: parts.every((p, n) => p.innerHTML === before[n]) };
    }, [i, k]);
    ok(r.writes.length === 0 && r.same, `slide ${i + 1} step ${k}: entering the same step again writes no attribute (${r.writes.length}${r.writes.length ? ': ' + [...new Set(r.writes)].slice(0, 6).join(', ') : ''}) and keeps the DOM`);
    checked++;
  }
  ok(checked === pos.length, `checked ${checked} steps`);
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}
if (fails) { console.log(`test-cycle-rewrite: ${fails} failure(s)`); process.exit(1); }
console.log('test-cycle-rewrite: ok');

// m-orbit in a browser (pinned Studio, the part through the registry shim): the person on Earth turns with the Moon
//   1. a step between two positions with the same observer angle keeps the person still (start 1 → visit [2] with 8
//      positions: both are held at evening, 90°)
//   2. a step that passes position 0 (new moon) adds one full turn: 7 → 1 (270° → 450°) and 2 → 1 (90° → 450°)
//   3. a step that does not pass position 0 turns forward only: 0 → 3 (0° → 135°)
//   node tools/test-orbit.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { c2Bundle } from './parts.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-orbit-')));
fs.mkdirSync(path.join(work, 'components', 'orbit'), { recursive: true });
fs.writeFileSync(path.join(work, 'components', 'orbit', 'index.js'), c2Bundle(ROOT, 'orbit'));

// [start, visit, expected observer angle at the start and at the end of step 1]
const CASES = [[1, [2], 90, 90], [7, [1], 270, 450], [2, [1], 90, 450], [0, [3], 0, 135]];
const src = path.join(work, 'deck.html'), out = path.join(work, 'deck.out.html');
fs.writeFileSync(src, `<!DOCTYPE html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>m-orbit</title></head><body><div id="stage">
${CASES.map(([s, v], i) => `<section class="slide noconcl"><h2>case ${i}</h2><div class="body"><m-orbit style="height:440px"><script type="application/json">${JSON.stringify({ start: s, visit: v })}</script></m-orbit></div></section>`).join('\n')}
</div></body></html>`);
S.build(src, out);

const b = await S.browser.launch();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => [...document.querySelectorAll('m-orbit')].map((el, i) => {
    const dur = el.duration(1), angle = () => 90 - +/rotate\(([-\d.]+)\)/.exec(el.person.getAttribute('transform'))[1];
    return [0, 0.25, 0.5, 0.75, 1].map((f) => { DECK.seek(i, 1, f === 1 ? Infinity : f * dur); return angle(); });
  }));
  CASES.forEach(([s, v, a0, a1], i) => {
    const w = r[i], mono = w.every((x, j) => j === 0 || x >= w[j - 1] - 1e-6);
    const tag = `start ${s} → visit [${v}]`;
    ok(Math.abs(w[0] - a0) < 0.01 && Math.abs(w[4] - a1) < 0.01, `${tag}: the person turns ${a0}° → ${a1}° (got ${w.map((x) => x.toFixed(1)).join(', ')})`);
    ok(mono, `${tag}: never turns back`);
    if (a0 === a1) ok(w.every((x) => Math.abs(x - a0) < 0.01), `${tag}: stays still through the step`);
  });
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} finally {
  await b.close();
}
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK');

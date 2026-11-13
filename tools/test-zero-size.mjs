// node tools/test-zero-size.mjs [--only particles,kpi]: a part whose element is 0 px wide (a hidden panel, a collapsed preview) or
// 0 × 0 must still mount and draw: its demo, with every part in it squeezed to that size, gets ready within 30 s (no hang), throws
// no page error, and sets no negative SVG size (Chrome logs "A negative value is not valid" for <rect width> or <circle r>).
// Each step is drawn mid-step and final. The list is the parts hardened so far (components 2.8.0: m-particles); add a part when
// its sizes are clamped.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { LAUNCH } from './shot-helpers.mjs';

const HARDENED = ['particles', 'diverge', 'checklist', 'callout'];
const oi = process.argv.indexOf('--only'), NAMES = oi >= 0 ? process.argv.splice(oi, 2)[1].split(',') : HARDENED;
const READY_MS = 30000;
const S = await studio();
const b = await S.browser.launch(LAUNCH);
let fails = 0;
for (const name of NAMES) {
  const demo = fs.readFileSync(path.join(ROOT, 'components', name, 'demo.html'), 'utf8');
  const tags = [...new Set([...demo.matchAll(/<(m-[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const mode of ['0 wide', '0 × 0']) {
    const zero = 'width:0!important;min-width:0!important;max-width:0!important;' + (mode === '0 × 0' ? 'height:0!important;min-height:0!important;max-height:0!important;' : '');
    const cd = S.compDir(name), f = path.join(cd, 'zero-size-demo.html'), out = path.join(cd, 'out', 'zero-size-demo.html');
    fs.writeFileSync(f, demo.replace('</head>', `<style>${tags.map((t) => `${t}{${zero}overflow:hidden}`).join('')}</style></head>`));
    const errs = [];
    try {
      S.build(f, out);
      const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
      p.on('console', (m) => { if (m.type() === 'error' && /negative value/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
      p.on('pageerror', (e) => errs.push('page error: ' + String(e.message).split('\n')[0]));
      try {
        await p.goto(S.browser.fileUrl(out), { timeout: READY_MS });
        await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: READY_MS });
        await p.evaluate(() => DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) { DECK.seek(i, k, 0.3); DECK.seek(i, k, Infinity); } }));
      } catch (e) { errs.push('not ready within 30 s (hang?): ' + String(e.message).split('\n')[0]); }
      await p.close().catch(() => {});
    } catch (e) { errs.push('build: ' + String(e.message).split('\n')[0]); }
    finally { fs.rmSync(f, { force: true }); }
    const u = [...new Set(errs)];
    if (u.length) fails++;
    console.log(`${u.length ? 'FAIL' : 'ok  '} ${name} (${mode})${u.length ? ': ' + u.slice(0, 4).join(' | ') : ''}`);
  }
}
await b.close();
console.log(fails ? `\nFAIL: ${fails}` : `\ntest-zero-size: ok (${NAMES.join(', ')})`);
process.exit(fails ? 1 : 0);

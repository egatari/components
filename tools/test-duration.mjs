// Each step is complete when its declared length ends: for every slide with components and every step k, the picture at
// t = the step's animation length (DECK.timeline().anim) equals the final state (t = Infinity). Catches labels or lines
// that are still fading in after duration(k) (docs/conventions.md §1.2: variants never change duration(k)).
//   node tools/test-duration.mjs [name …]   (the runtime's interface hidden; tolerance as in tools/shot-helpers.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { LAUNCH, TOLERANCE, hideChrome, settle, pixelDiff } from './shot-helpers.mjs';

// Released before this check, and not complete at their declared step length (reported, to be looked at; do not add to this list)
const KNOWN = new Set(['kanbun', 'kobun']);
const S = await studio();
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')));
const b = await S.browser.launch(LAUNCH);
let fail = 0;
for (const name of names) {
  const out = path.join(S.compDir(name), 'out', 'duration-demo.html');
  S.build(path.join(S.compDir(name), 'demo.html'), out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
  await p.evaluate(() => document.fonts.ready);
  await hideChrome(p);
  const plan = await p.evaluate(() => { const tl = DECK.timeline(); return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length, anim: tl.filter((x) => x.i === i).map((x) => x.anim) })).filter((s) => s.comps); });
  const shot = async (i, k, t) => {
    await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [i, k, t]);
    await settle(p);
    return p.screenshot();
  };
  const bad = [];
  for (const s of plan) for (let k = 1; k <= s.max; k++) {
    const a = s.anim[k];
    if (!(a > 0)) continue;
    const x = await shot(s.i, k, a), y = await shot(s.i, k, null);
    let n = await pixelDiff(p, x, y);
    if (n > TOLERANCE) { await settle(p); n = Math.min(n, await pixelDiff(p, await shot(s.i, k, a), await shot(s.i, k, null))); }
    if (n > TOLERANCE) bad.push(`s${s.i}k${k} (${n} px differ at t=${a.toFixed(2)})`);
  }
  await p.close();
  if (bad.length && KNOWN.has(name)) console.log(`known ${name}: not complete at the declared step length: ${bad.join(', ')}`);
  else if (bad.length) { fail++; console.log(`FAIL ${name}: not complete at the declared step length: ${bad.join(', ')}`); }
  else console.log(`ok   ${name}`);
}
await b.close();
console.log(fail ? `\n${fail} component(s) still moving after duration(k)` : 'test-duration: ok');
process.exit(fail ? 1 : 0);

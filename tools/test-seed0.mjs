// Variant 0 does not change by a single pixel (docs/conventions.md §1.6). For every component with variants that existed in
// the baseline release, build the baseline's demo.html twice, once with the baseline's index.js and once with the current one,
// and compare screenshots at each step (35 %, 70 % and the final state). A lesson without a seed must look the same
// (the runtime's interface hidden, and the anti-aliasing tolerance of tools/shot-helpers.mjs).
//   node tools/test-seed0.mjs [shots dir]      baseline: the release before package.json's version (tools/baseline.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';
import { USERS } from './variant-sync.mjs';
import { baseline } from './baseline.mjs';
import { LAUNCH, TOLERANCE, hideChrome, settle, pixelDiff } from './shot-helpers.mjs';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const { base } = baseline();
if (!base) { console.log('test-seed0: no earlier release tag (fetch tags: git fetch --tags), nothing to compare'); process.exit(0); }
const shotsRoot = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-seed0-')));
const S = await studio();
const b = await S.browser.launch(LAUNCH);
let fail = 0, n = 0;
for (const name of USERS) {
  let oldJs, demo;
  try { oldJs = git('show', `${base}:components/${name}/index.js`); demo = git('show', `${base}:components/${name}/demo.html`); }
  catch { console.log(`-- ${name}: not in ${base} (new component, nothing to compare)`); continue; }
  const cd = S.compDir(name), cur = fs.readFileSync(path.join(cd, 'index.js'), 'utf8');
  const shots = {};
  for (const [which, js] of [['base', oldJs], ['head', cur]]) {
    fs.writeFileSync(path.join(cd, 'index.js'), js);
    fs.writeFileSync(path.join(cd, 'seed0-demo.html'), demo);
    const out = path.join(cd, 'out', 'seed0-demo.html');
    S.build(path.join(cd, 'seed0-demo.html'), out);
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto(S.browser.fileUrl(out));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
    await p.evaluate(() => document.fonts.ready);
    await hideChrome(p);
    const plan = await p.evaluate(() => { const tl = DECK.timeline(); return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length, anim: tl.filter((x) => x.i === i).map((x) => x.anim) })).filter((s) => s.comps); });
    shots[which] = {};
    for (const s of plan) for (let k = 0; k <= s.max; k++) {
      const a = s.anim[k];
      for (const t of a > 0 ? [a * 0.35, a * 0.7, null] : [null]) {
        await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [s.i, k, t]);
        await settle(p);
        const key = `s${s.i}_k${k}_${t === null ? 'end' : t.toFixed(2)}`;
        const png = await p.screenshot();
        fs.mkdirSync(path.join(shotsRoot, name, which), { recursive: true });
        fs.writeFileSync(path.join(shotsRoot, name, which, key + '.png'), png);
        shots[which][key] = png;
      }
    }
    await p.close();
  }
  fs.writeFileSync(path.join(cd, 'index.js'), cur);
  fs.rmSync(path.join(cd, 'seed0-demo.html'));
  const keys = Object.keys(shots.base);
  // pixel-identical in practice (byte-identical on macOS); Chrome's anti-aliasing may vary by a few pixels between page loads elsewhere
  const cmp = await b.newPage();
  const diff = [];
  for (const k of keys) if (!shots.head[k] || (await pixelDiff(cmp, shots.head[k], shots.base[k])) > TOLERANCE) diff.push(k);
  await cmp.close();
  if (Object.keys(shots.head).length !== keys.length) diff.push('(different number of frames)');
  n++;
  if (diff.length) { fail++; console.log(`FAIL ${name}: differs from ${base} at ${diff.join(', ')} (shots: ${path.join(shotsRoot, name)})`); }
  else console.log(`ok   ${name}: ${keys.length} frames identical to ${base}`);
}
await b.close();
console.log(fail ? `\n${fail} component(s) changed variant 0` : `test-seed0: ok (${n} component(s), baseline ${base})`);
process.exit(fail ? 1 : 0);

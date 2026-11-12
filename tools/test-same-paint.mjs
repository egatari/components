// node tools/test-same-paint.mjs [shots folder] [--only flow,tree]: m-flow, m-tree, m-fishbone and m-quad paint the same pixels as the release before,
// on their demo pages, in each of Egatari Studio's themes and in a dark theme. The data-part marks for Studio's geometry check
// (components 2.8.0) are attributes only; this test makes sure they changed nothing that is painted.
// The baseline is the newest release tag not newer than package.json's version that does not point at HEAD (before the release
// commit that is v2.7.0; after it, still v2.7.0 until the next release). The baseline part goes through the same registry shim bundle
// as the current one (as in tools/test-default-variant.mjs), with the current demo. Studio has no dark stage theme (the stage's
// colours carry meaning, spec §8.4), so "dark" is the default theme with dark values for every role, set before the build.
// Frames: each step at 35 %, 70 % and its final state; equal within tools/shot-helpers.mjs's anti-aliasing tolerance.
// After each seek the capture waits for every font the frame asks for (layout forced, then document.fonts until it is "loaded").
// Two kinds of failure, counted apart: "pixel mismatch" (the guarantee is broken) and "aborted: <stage>" (the run could not
// finish, e.g. a page that did not get ready in time on a loaded machine; nothing was compared). No retries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';
import { partMeta } from './parts.mjs';
import { LAUNCH, TOLERANCE, hideChrome, settle, pixelDiff } from './shot-helpers.mjs';

const oi = process.argv.indexOf('--only'), only = oi >= 0 ? process.argv.splice(oi, 2)[1].split(',') : null;
const NAMES = ['flow', 'tree', 'fishbone', 'quad'].filter((x) => !only || only.includes(x));
const THEMES = ['default', 'kokugo', 'business', 'dark'];
const DARK = ':root:root{--bg:#15171c!important;--fg:#e8e6e1!important;--muted:#9a9a9a!important;--line:#4a4d55!important;--term:#7fb2ff!important;'
  + '--emph:#ff8a7a!important;--accent2:#e6c15a!important;--term-tint:#1d2a40!important;--emph-tint:#3a2220!important;'
  + '--series-1:#7fb2ff!important;--series-2:#ff8a7a!important;--series-3:#8fd18f!important;--series-4:#e6c15a!important}';
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const head = git('rev-parse', 'HEAD').trim();
const base = git('tag', '--list', 'v*').split('\n').map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  .filter((t) => cmpV(t.slice(1), R) <= 0 && git('rev-list', '-n', '1', t).trim() !== head).sort((a, b) => cmpV(a.slice(1), b.slice(1))).pop();
if (!base) { console.log('test-same-paint: no earlier release tag (fetch tags: git fetch --tags), nothing to compare'); process.exit(0); }
const shotsRoot = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-same-paint-')));
const S = await studio();
const b = await S.browser.launch(LAUNCH);
const READY_MS = process.env.CI ? 60000 : 30000;
// every font the current frame uses: force layout so new text requests its fonts, then wait until none is loading
const fontsLoaded = (p) => p.evaluate(async () => { document.body.getBoundingClientRect(); do await document.fonts.ready; while (document.fonts.status !== 'loaded'); });
let fail = 0, aborted = 0, n = 0;
for (const name of NAMES) {
  let oldPart;
  try { oldPart = git('show', `${base}:components/${name}/index.js`); } catch { console.log(`-- ${name}: not in ${base}`); continue; }
  const cd = S.compDir(name), cur = fs.readFileSync(path.join(cd, 'index.js'), 'utf8');
  const curPart = fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8');
  const reqOf = (js) => (js.match(/requires:\s*\{[^}]*\}/) || [''])[0];
  if (partMeta(oldPart) && reqOf(oldPart) && reqOf(oldPart) !== reqOf(curPart)) oldPart = oldPart.replace(reqOf(oldPart), reqOf(curPart));
  const oldJs = partMeta(oldPart) && cur.split(curPart).length === 2 ? cur.split(curPart).join(oldPart) : oldPart;
  const demo = fs.readFileSync(path.join(ROOT, 'components', name, 'demo.html'), 'utf8');
  try {
    for (const theme of THEMES) {
      let stage = 'build base';
      try {
      const src = demo.replace(/(<html[^>]*\sdata-theme=")[^"]*"/, `$1${theme === 'dark' ? 'default' : theme}"`)
        .replace('</head>', theme === 'dark' ? `<style>${DARK}</style></head>` : '</head>');
      const shots = {};
      for (const [which, js] of [['base', oldJs], ['head', cur]]) {
        stage = `build ${which}`;
        fs.writeFileSync(path.join(cd, 'index.js'), js);
        const f = path.join(cd, 'same-paint-demo.html'), out = path.join(cd, 'out', 'same-paint-demo.html');
        fs.writeFileSync(f, src);
        S.build(f, out);
        stage = `load ${which}`;
        const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
        await p.goto(S.browser.fileUrl(out), { timeout: READY_MS });
        stage = `ready ${which}`;
        await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: READY_MS });
        await fontsLoaded(p);
        await hideChrome(p);
        const plan = await p.evaluate(() => { const tl = DECK.timeline(); return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length, anim: tl.filter((x) => x.i === i).map((x) => x.anim) })).filter((s) => s.comps); });
        shots[which] = {};
        for (const s of plan) for (let k = 0; k <= s.max; k++) {
          const a = s.anim[k];
          for (const t of a > 0 ? [a * 0.35, a * 0.7, null] : [null]) {
            const key = `s${s.i}_k${k}_${t === null ? 'end' : t.toFixed(2)}`;
            stage = `capture ${which} ${key}`;
            await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [s.i, k, t]);
            await fontsLoaded(p);
            await settle(p);
            const png = await p.screenshot();
            fs.mkdirSync(path.join(shotsRoot, name, theme, which), { recursive: true });
            fs.writeFileSync(path.join(shotsRoot, name, theme, which, key + '.png'), png);
            shots[which][key] = png;
          }
        }
        await p.close();
      }
      stage = 'compare';
      const keys = Object.keys(shots.base), cmp = await b.newPage(), diff = [];
      for (const k of keys) if (!shots.head[k] || (await pixelDiff(cmp, shots.head[k], shots.base[k])) > TOLERANCE) diff.push(k);
      await cmp.close();
      if (Object.keys(shots.head).length !== keys.length) diff.push('(different number of frames)');
      n++;
      if (diff.length) { fail++; console.log(`FAIL ${name} (${theme}): pixel mismatch with ${base} at ${diff.join(', ')} (shots: ${path.join(shotsRoot, name, theme)})`); }
      else console.log(`ok   ${name} (${theme}): ${keys.length} frames identical to ${base}`);
      } catch (e) {
        aborted++; n++;
        console.log(`FAIL ${name} (${theme}): aborted: ${stage}: ${String(e && e.message || e).split('\n')[0]}`);
        for (const pg of b.contexts().flatMap((c) => c.pages())) await pg.close().catch(() => {});
      }
    }
  } finally {
    fs.writeFileSync(path.join(cd, 'index.js'), cur);
    fs.rmSync(path.join(cd, 'same-paint-demo.html'), { force: true });
  }
}
await b.close();
console.log(fail || aborted ? `\nFAIL: ${fail} pixel mismatch, ${aborted} aborted, of ${n}` : `\ntest-same-paint: ok (${n} part × theme runs, baseline ${base})`);
process.exit(fail || aborted ? 1 : 0);

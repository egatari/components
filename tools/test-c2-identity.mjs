// Identity of migrated parts (components 2.0, alpha.2): a part moved to egatariParts.define draws exactly what its 1.x
// version drew. For each migrated element part (a 2.0 part with an element; tools/parts.mjs migratedNames):
//   1.x   the part's demo.html of the baseline release (v1.13.0), built with the pinned Studio (tools/studio.json) and the
//         part's v1.13.0 index.js (DECK.define), the 1.x way
//   2.0   the same demo, built with the same Studio and, as the part's index.js, the registry shim, the parts it requires in
//         dependency order and the part (tools/parts.mjs c2Bundle; the shim's bridge lets DECK drive it with the 2.0 ctx)
// Both decks are played the same way, in the talk view and in the preview (lecture) view: every slide with components, every
// step k from 0 to the slide's last, at 35 % and 70 % of the step's length (the longest duration(k) of its components) and
// at its end (t = ∞). At every frame the components' DOM (outerHTML of every component on the slide) must be byte-identical.
// The only deviations allowed are the documented ones:
//   - warnings that moved to ctx.report or got a [name] prefix: not in the DOM, so nothing to allow here;
//   - plot's clip ids (plot-1-0-0-clip3 where DECK.Plot wrote clip3, spec §6.1 Identifiers): in the 2.0 DOM the prefix is
//     removed before comparing, after checking that every clip id has it.
// Then, in the talk view, viewer state (e.g. m-menu's visited marks, spec §8.4 ctx.visited): after a tour that goes to every
// slide in order (DECK.go), each slide with components is gone to again at its last step, and compared at its end.
// Also: the 2.0 part is defined through the registry (status ok) and driven by DECK; no console error on either side; the
// 2.0 part makes no ctx.report on its own demo.
//   node tools/test-c2-identity.mjs [work dir] [--only name,name]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, studio, pinLabel } from './studio.mjs';
import { migratedNames, partMetas, c2Bundle } from './parts.mjs';

export const BASELINE = 'v1.13.0';
const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args.splice(oi, 2)[1].split(',').map((n) => n.replace(/^m-/, ''))) : null;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const git = (spec) => execFileSync('git', ['show', spec], { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
const MODES = ['talk', 'lecture'];
const FRACTIONS = [0.35, 0.7];

const S = await studio();
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-c2-identity-')));
fs.mkdirSync(work, { recursive: true });
const metas = partMetas(ROOT);
const names = migratedNames(ROOT).filter((n) => !only || only.has(n));
ok(names.length > 0, `migrated element parts: ${names.join(', ') || 'none'} (baseline ${BASELINE}, Studio ${pinLabel()})`);

// A deck whose folder has components/<name>/index.js (Studio reads a component from the deck's folder before its vendor copy)
function build(name, which, code) {
  const dir = path.join(work, name, which);
  fs.mkdirSync(path.join(dir, 'components', name), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), git(`${BASELINE}:components/${name}/demo.html`));
  fs.writeFileSync(path.join(dir, 'components', name, 'index.js'), code);
  const out = path.join(dir, 'deck.out.html');
  S.build(path.join(dir, 'deck.html'), out);
  return out;
}

// Remove the documented deviation (plot's prefixed clip ids) from a 2.0 DOM; count ids without the prefix
const PLOT = metas.plot ? `${metas.plot.name}-${metas.plot.version.replace(/\./g, '-')}-` : null;
function normalize(html) {
  if (!PLOT) return { html, bare: 0 };
  let bare = 0;
  for (const m of html.matchAll(/(?:id="|url\(#)([\w-]*?)clip\d+/g)) if (m[1] !== PLOT) bare++;
  return { html: html.split(PLOT + 'clip').join('clip'), bare };
}

const browser = await S.browser.launch();
try {
  for (const name of names) {
    const m = metas[name], key = `${name}@${m.version}`;
    let v1, v2;
    try {
      v1 = build(name, 'v1', git(`${BASELINE}:components/${name}/index.js`));
      v2 = build(name, 'v2', c2Bundle(ROOT, name));
    } catch (e) { ok(false, `m-${name}: build: ${String(e.stderr || e.message).slice(0, 400)}`); continue; }
    const errors = { v1: [], v2: [] };
    const open = async (which, url, mode) => {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      p.on('pageerror', (e) => errors[which].push(e.message));
      p.on('console', (x) => { if (x.type() === 'error') errors[which].push(x.text()); });
      await p.goto(S.browser.fileUrl(url));
      await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
      await p.evaluate(() => document.fonts.ready);
      if (mode !== 'talk') await p.evaluate((md) => { DECK.mode = md; document.documentElement.setAttribute('data-mode', md); }, mode);
      return p;
    };
    let tourMarks = 0, frames = 0, bare = 0, status = null, reports = null, comps = 0;
    const bad = [];
    for (const mode of MODES) {
      const [a, b] = [await open('v1', v1, mode), await open('v2', v2, mode)];
      // the frames to play: from the 1.x deck (the 2.0 deck must have the same slides and steps)
      const plan = await a.evaluate((F) => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length })).filter((s) => s.comps > 0), FRACTIONS);
      const plan2 = await b.evaluate(() => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length })).filter((s) => s.comps > 0));
      if (JSON.stringify(plan) !== JSON.stringify(plan2)) bad.push(`${mode}: slides and steps differ: 1.x ${JSON.stringify(plan)} 2.0 ${JSON.stringify(plan2)}`);
      for (const s of plan) for (let k = 0; k <= s.max; k++) {
        // the step's length: the longest duration of its components at their own step (spec §8.4 Steps of a component)
        const d = await a.evaluate(([i, k]) => Math.max(0, ...DECK.slides[i]._comps.map((c) => { const kc = Math.max(0, Math.min(c.steps, k - c.from + 1)); return kc >= 1 && kc <= c.steps ? +c.duration(kc) || 0 : 0; })), [s.i, k]);
        const ts = d > 0 ? [...FRACTIONS.map((f) => +(f * d).toFixed(4)), null] : [null];
        for (const t of ts) {
          const grab = (p) => p.evaluate(([i, k, t]) => { DECK.seek(i, k, t === null ? Infinity : t); return DECK.slides[i]._comps.map((c) => c.outerHTML); }, [s.i, k, t]);
          const x = await grab(a), y = await grab(b);
          frames++; comps += x.length;
          const n = y.map(normalize);
          bare += n.reduce((q, z) => q + z.bare, 0);
          const yj = n.map((z) => z.html).join('\n'), xj = x.join('\n');
          if (xj !== yj) {
            let j = 0; while (j < xj.length && xj[j] === yj[j]) j++;
            const from = Math.max(0, j - 80);
            bad.push(`${mode} slide ${s.i} step ${k} t=${t === null ? '∞' : t}: 1.x …${JSON.stringify(xj.slice(from, j + 100))}\n       2.0 …${JSON.stringify(yj.slice(from, j + 100))}`);
          }
        }
      }
      if (mode === 'talk') {
        // the tour: go to every slide (marks it visited), then back to each slide with components
        const tour = async (p) => {
          const out = [];
          await p.evaluate(async () => { for (let j = 0; j < DECK.slides.length; j++) { DECK.go(j, 0, false); await new Promise((r) => setTimeout(r, 20)); } });
          for (const s of plan) out.push(await p.evaluate(async ([i, k]) => { DECK.go(i, k, false); await new Promise((r) => setTimeout(r, 20)); DECK.seek(i, k, Infinity); return DECK.slides[i]._comps.map((c) => c.outerHTML).join('\n'); }, [s.i, s.max]));
          return out;
        };
        const x = await tour(a), y = (await tour(b)).map((h) => normalize(h).html);
        plan.forEach((s, j) => { frames++; comps += s.comps; if (x[j] !== y[j]) { let q = 0; while (q < x[j].length && x[j][q] === y[j][q]) q++; bad.push(`after the tour, slide ${s.i} step ${s.max}: 1.x …${JSON.stringify(x[j].slice(Math.max(0, q - 80), q + 100))}\n       2.0 …${JSON.stringify(y[j].slice(Math.max(0, q - 80), q + 100))}`); } });
        tourMarks += await b.evaluate(() => document.querySelectorAll('.mm-visited').length);
        status = await b.evaluate((key) => EGATARI_PARTS_SHIM.status(key), key);
        reports = await b.evaluate(() => EGATARI_PARTS_SHIM.reports().map((r) => r.code + ': ' + r.msg));
      }
      await a.close(); await b.close();
    }
    ok(status === 'ok', `m-${name}: ${key} is defined through the registry shim in the 2.0 deck (${status})`);
    ok(bad.length === 0, `m-${name}: DOM byte-identical to ${BASELINE} at every frame: ${frames} frames (${comps} component DOMs; ${MODES.join(', ')} × steps × 35 %, 70 %, end; and after a tour of every slide${tourMarks ? `, ${tourMarks} visited marks` : ''})`
      + (bad.length ? `\n     ${bad.length} differ; first: ${bad[0]}` : ''));
    ok(bare === 0, `m-${name}: no clip id without the part's name and version` + (bare ? ` (${bare})` : ''));
    ok(errors.v1.length === 0 && errors.v2.length === 0, `m-${name}: no console error (1.x ${errors.v1.length}, 2.0 ${errors.v2.length})` + (errors.v2.length ? ': ' + errors.v2[0] : errors.v1.length ? ': ' + errors.v1[0] : ''));
    ok(reports && reports.length === 0, `m-${name}: no ctx.report on its demo` + (reports && reports.length ? ': ' + reports.join(' | ') : ''));
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-c2-identity: ok');
process.exit(fails ? 1 : 0);

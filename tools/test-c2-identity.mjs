// Identity of migrated parts (components 2.0, alpha.2): a part moved to egatariParts.define draws exactly what its 1.x
// version drew. For each migrated element part (tools/parts.mjs migratedNames: derived from the parts, never listed):
//   1.x   a deck built with the pinned Studio (tools/studio.json) and the part's v1.13.0 index.js (DECK.define), the 1.x way
//         (a part never released in 1.x, m-score: its own last pre-2.0 commit instead, tools/parts.mjs C2_BASELINE_OF; the 2.0
//         side then plays the part's current demo, and the frames are compared by pixels: see C2_BASELINE_OF for why)
//   2.0   the same deck built with the same Studio and, as the part's index.js, the registry shim, the parts it requires in
//         dependency order and the part (tools/parts.mjs c2Bundle; the shim's bridge lets DECK drive it with the 2.0 ctx)
// The decks: the part's demo.html of v1.13.0, and tools/fixtures/c2-identity/<name>.html when the part has one (cases the
// demo does not reach; one file per part, so that parts are migrated without touching a shared file).
// Both builds are played the same way, in the talk view and in the preview (lecture) view: every slide with components,
// every step k from 0 to the slide's last, at 35 % and 70 % of the step's length (the longest duration(k) of its components)
// and at its end (t = ∞); then, in the talk view, after a tour that goes to every slide (DECK.go), each slide with
// components again at its last step (viewer state such as m-menu's visited marks, spec §8.4 ctx.visited).
// At every frame the components' DOM (outerHTML of every component on the slide) must be byte-identical, except for the
// id rewrites in ID_REWRITES below, and nothing else (warnings that became ctx.report are not in the DOM).
// Also: the 2.0 part is defined through the registry (status ok); no console error on either side; no ctx.report on its demo.
//
// Parts with build-time rendered fields (spec §6.2: static build = {fields: {<path>: "katex"}}; m-collect, m-cycle, m-fishbone,
// m-flow, m-timeline, m-tree): the 1.x deck is built as written (its part rendered the tex with KaTeX at play time); the 2.0
// deck is the same source after the stand-in producer (tools/katex-produce.mjs, run by tools/studio.mjs build) rendered the
// declared fields with the KaTeX the pinned Studio pins. The DOM must still be byte-identical, with one more allowed
// deviation, DATA_REWRITE below: the text of the element's <script type="application/json"> holds the producer's additions,
// so it is compared as data instead of bytes: the 2.0 data without the additions (<field>Html beside each declared field, the
// top-level renderers record) must equal the 1.x data. The 2.0 page must also have no KaTeX at all (players never render).
// A part whose v1.13.0 demo builds its data in a page script at play time (m-collect: no data exists at build time, so there
// is nothing to render) names, in its fixture, the reason the fixture replaces the demo:
//   <!-- c2-identity-replaces-demo: <reason> -->
// The fixture is then the deck compared (built both ways from the same source), and the demo is not.
//   node tools/test-c2-identity.mjs [work dir] [--only name,name]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, studio, pinLabel } from './studio.mjs';
import { LAUNCH, hideChrome, settle, pixelDiff } from './shot-helpers.mjs';
import { migratedNames, partMetas, c2Bundle, requiresClosure, C2_BASELINE, c2Baseline } from './parts.mjs';
import { katexParts, at } from './katex-produce.mjs';

export const BASELINE = C2_BASELINE;
// The only allowed deviations: ids a part writes into its DOM, renamed with the part's name and version (spec §6.1
// Identifiers, standards decision of egatari-spec b7520a8). For a part, its own rules and those of every part it requires
// apply (plot's apply to every part that draws with plot). v1: the 1.x id, v2: the 2.0 id (regular expressions, matched
// where an id is written or referred to: id="…", url(#…), href="#…"). The numbers may differ (2.0 counters are per part,
// 1.x ones were shared), so each distinct id is replaced by its rule and its order of first appearance in the frame, on
// both sides. Each rewrite is also noted in the part's own CHANGELOG (components/<name>/CHANGELOG.md).
export const ID_REWRITES = {
  plot: [{ v1: 'clip\\d+', v2: 'plot-1-0-0-clip\\d+', why: 'plot clip paths (DECK.Plot: clip<n>)' }],
  curves: [{ v1: 'mc\\d+', v2: 'curves-2-0-0-\\d+', why: 'm-curves masks (1.x: mc<n> on DECK.Plot\'s counter)' }],
  heatmap: [{ v1: 'm-heatmap-legend-\\d+', v2: 'heatmap-2-0-0-legend-\\d+', why: 'm-heatmap legend gradient' }],
  venn: [{ v1: 'm-venn-\\d+', v2: 'venn-2-0-0-\\d+', why: 'm-venn clip paths (1.x: m-venn-<n>-in<i>, -out<i>)' }],
  kakijun: [{ v1: 'm-kakijun-clip-\\d+h?', v2: 'kakijun-2-0-0-clip-\\d+h?', why: 'm-kakijun stroke clip paths (and their start-cap masks, <n>h)' }],
};
// The second allowed deviation, for parts that declare build fields (above). Approved by standards (egatari-spec 56ae5da).
export const DATA_REWRITE = { why: 'the data script of a part with build fields carries the producer\'s additions (spec §6.2): compared as data without them' };
// The third, for the same parts: KaTeX's DOM builder (katex.render, 1.x at play time) writes class="" on a span without
// classes, where its markup builder (renderToString, the producer's output) writes no class attribute. Inside the formula
// frames (<foreignObject class="smath">) an empty class on a span is therefore removed before comparing, on both sides.
// Approved by standards (egatari-spec 56ae5da).
export const KATEX_EMPTY_CLASS = { why: 'katex.render writes class="" on spans without classes, renderToString writes none' };
// The fourth, for the same parts: katex.render sets the style of an <svg> it draws (stretchy arrows, \oiint) as text with
// setAttribute ("width:0.957em"), while the reader sets each declaration with setProperty (spec §6.2), which the browser
// writes "width: 0.957em;". Inside the formula frames, an <svg>'s style attribute is compared as its declarations.
// Approved by standards (egatari-spec 56ae5da).
export const KATEX_SVG_STYLE = { why: 'katex.render writes an svg style as text, the reader one declaration at a time' };
const svgStyleOut = (f) => f.replace(/(<svg\b[^>]*?\sstyle=")([^"]*)(")/g, (all, a, v, c) => a + v.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.replace(/\s*:\s*/, ': ')).join('; ') + ';' + c);
const SMATH = /<foreignObject\b[^>]*\bclass="smath"[^>]*>[\s\S]*?<\/foreignObject>/g;
const emptyClassOut = (h) => { let n = 0; const out = h.replace(SMATH, (f) => svgStyleOut(f.replace(/<span class=""/g, () => { n++; return '<span'; }))); return { html: out, n }; };
const JSON_SCRIPTS = /(<script type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/g;
// The data without what the producer adds: <key>Html beside every declared field, and the top-level renderers record
function unproduced(data, fields) {
  const d = JSON.parse(JSON.stringify(data));
  if (d && typeof d === 'object' && !Array.isArray(d)) delete d.renderers;
  for (const f of fields) for (const { holder, key } of at(d, f)) delete holder[key + 'Html'];
  return d;
}
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
// Parts first written for 2.x (no folder in the baseline, e.g. m-orbit) have nothing to be identical to: listed, not compared
const inBaseline = (n) => { try { execFileSync('git', ['cat-file', '-e', `${BASELINE}:components/${n}/index.js`], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
const all = migratedNames(ROOT).filter((n) => !only || only.has(n));
const names = all.filter(inBaseline), fresh = all.filter((n) => !inBaseline(n));
ok(names.length > 0, `migrated element parts: ${names.join(', ') || 'none'} (baseline ${BASELINE}, Studio ${pinLabel()})`);
if (fresh.length) console.log(`--   new in 2.x, not in ${BASELINE} (nothing to compare): ${fresh.join(', ')}`);

// A deck whose folder has components/<name>/index.js (Studio reads a component from the deck's folder before its vendor copy)
function build(name, deck, which, src, code, opts) {
  const dir = path.join(work, name, deck, which);
  fs.mkdirSync(path.join(dir, 'components', name), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), src);
  fs.writeFileSync(path.join(dir, 'components', name, 'index.js'), code);
  const out = path.join(dir, 'deck.out.html');
  S.build(path.join(dir, 'deck.html'), out, opts);
  return out;
}

const AT = '(?<=id="|url\\(#|href="#)';
function rewriter(rules, side) {
  const res = rules.map((r, j) => ({ j, re: new RegExp(AT + '(?:' + r[side] + ')', 'g') }));
  return (html) => {
    let n = 0;
    for (const { j, re } of res) {
      const seen = new Map();
      html = html.replace(re, (id) => { n++; if (!seen.has(id)) seen.set(id, seen.size + 1); return `«id ${j}.${seen.get(id)}»`; });
    }
    return { html, n };
  };
}

const KP = katexParts();
const browser = await S.browser.launch(LAUNCH);
try {
  for (const name of names) {
    const m = metas[name], key = `${name}@${m.version}`;
    const rules = requiresClosure(name, metas).flatMap((n) => ID_REWRITES[n] || []);
    const r1 = rewriter(rules, 'v1'), r2 = rewriter(rules, 'v2');
    const CB = c2Baseline(name), B = CB.rev, BL = B === BASELINE ? B : `pre-2.0 ${B.slice(0, 7)}`, PIX = CB.compare === 'pixels';
    const demo2 = CB.demo === 'current' ? fs.readFileSync(path.join(ROOT, 'components', name, 'demo.html'), 'utf8') : null;
    const decks = [['demo', git(`${B}:components/${name}/demo.html`)]];
    const fx = path.join(ROOT, 'tools', 'fixtures', 'c2-identity', `${name}.html`);
    if (fs.existsSync(fx)) {
      const src = fs.readFileSync(fx, 'utf8'), rd = src.match(/<!--\s*c2-identity-replaces-demo:\s*([\s\S]*?)-->/);
      if (rd) { decks.shift(); console.log(`     m-${name}: ${path.relative(ROOT, fx)} replaces the ${BL} demo: ${rd[1].trim().replace(/\s+/g, ' ')}`); }
      decks.push([path.relative(ROOT, fx), src]);
    }
    const kp = KP[`m-${name}`];
    let status = null, reports = null;
    for (const [deck, src] of decks) {
      const label = deck === 'demo' ? `${BL} demo` : deck;
      let v1, v2;
      try {
        v1 = build(name, deck === 'demo' ? 'demo' : 'fixture', 'v1', src, git(`${B}:components/${name}/index.js`), { produce: false });
        v2 = build(name, deck === 'demo' ? 'demo' : 'fixture', 'v2', deck === 'demo' && demo2 !== null ? demo2 : src, c2Bundle(ROOT, name));
      } catch (e) { ok(false, `m-${name} (${label}): build: ${String(e.stderr || e.message).slice(0, 400)}`); continue; }
      const errors = { v1: [], v2: [] };
      const open = async (which, url, mode) => {
        const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        p.on('pageerror', (e) => errors[which].push(e.message));
        p.on('console', (x) => { if (x.type() === 'error') errors[which].push(x.text()); });
        await p.goto(S.browser.fileUrl(url));
        await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
        await p.evaluate(() => document.fonts.ready);
        if (PIX) await hideChrome(p);
        if (mode !== 'talk') await p.evaluate((md) => { DECK.mode = md; document.documentElement.setAttribute('data-mode', md); }, mode);
        return p;
      };
      let tourMarks = 0, frames = 0, comps = 0, rewritten = 0, dataCompared = 0, emptyClasses = 0;
      const pending = [];   // compare 'pixels': the frames to compare once both pages are done
      let maxDiff = 0, exact = 0;
      // compare 'pixels': a screenshot of each component of the slide (base64, joined)
      const shots = async (p, i) => {
        await settle(p);
        const boxes = await p.evaluate((i) => DECK.slides[i]._comps.map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), i);
        const out = [];
        for (const clip of boxes) out.push(clip.width > 0 && clip.height > 0 ? await p.screenshot({ clip }) : null);
        return out;
      };
      const bad = [];
      // DATA_REWRITE: the data scripts compared as data (2.0 without the producer's additions = 1.x), then left out of the bytes
      const dataOut = (where, x, y) => {
        const dx = [...x.matchAll(JSON_SCRIPTS)].map((m) => m[2]), dy = [...y.matchAll(JSON_SCRIPTS)].map((m) => m[2]);
        let ok2 = dx.length === dy.length;
        for (let j = 0; ok2 && j < dx.length; j++) {
          try { ok2 = JSON.stringify(JSON.parse(dx[j])) === JSON.stringify(unproduced(JSON.parse(dy[j]), kp.fields)); } catch { ok2 = dx[j] === dy[j]; }
        }
        if (!ok2) bad.push(`${where}: the 2.0 data without the producer's additions differs from the 1.x data`);
        dataCompared += dx.length;
        const blank = (h) => h.replace(JSON_SCRIPTS, '$1«data»$3');
        return [blank(x), blank(y)];
      };
      const compare = (where, x, y) => {
        if (kp) {
          [x, y] = dataOut(where, x, y);
          const ex = emptyClassOut(x), ey = emptyClassOut(y);
          x = ex.html; y = ey.html; emptyClasses += ex.n + ey.n;
        }
        if (PIX) { frames++; pending.push({ where, x, y }); return; }
        const a = r1(x), b = r2(y);
        rewritten += b.n;
        frames++;
        if (a.html !== b.html || a.n !== b.n) {
          let j = 0; while (j < a.html.length && a.html[j] === b.html[j]) j++;
          const from = Math.max(0, j - 80);
          bad.push(`${where}: 1.x …${JSON.stringify(a.html.slice(from, j + 100))}\n       2.0 …${JSON.stringify(b.html.slice(from, j + 100))}`);
        }
      };
      for (const mode of MODES) {
        const [a, b] = [await open('v1', v1, mode), await open('v2', v2, mode)];
        // the frames to play: from the 1.x deck (the 2.0 deck must have the same slides and steps)
        const planOf = (p) => p.evaluate(() => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length })).filter((s) => s.comps > 0));
        const plan = await planOf(a), plan2 = await planOf(b);
        if (JSON.stringify(plan) !== JSON.stringify(plan2)) bad.push(`${mode}: slides and steps differ: 1.x ${JSON.stringify(plan)} 2.0 ${JSON.stringify(plan2)}`);
        for (const s of plan) for (let k = 0; k <= s.max; k++) {
          // the step's length: the longest duration of its components at their own step (spec §8.4 Steps of a component)
          const d = await a.evaluate(([i, k]) => Math.max(0, ...DECK.slides[i]._comps.map((c) => { const kc = Math.max(0, Math.min(c.steps, k - c.from + 1)); return kc >= 1 && kc <= c.steps ? +c.duration(kc) || 0 : 0; })), [s.i, k]);
          const ts = d > 0 ? [...FRACTIONS.map((f) => +(f * d).toFixed(4)), null] : [null];
          for (const t of ts) {
            const grab = async (p) => {
              const html = await p.evaluate(([i, k, t]) => { DECK.seek(i, k, t === null ? Infinity : t); return DECK.slides[i]._comps.map((c) => c.outerHTML).join('\n'); }, [s.i, k, t]);
              return PIX ? shots(p, s.i) : html;
            };
            compare(`${mode} slide ${s.i} step ${k} t=${t === null ? '∞' : t}`, await grab(a), await grab(b));
            comps += s.comps;
          }
        }
        if (mode === 'talk') {
          // the tour: go to every slide (marks it visited), then back to each slide with components
          const tour = async (p) => {
            const out = [];
            await p.evaluate(async () => { for (let j = 0; j < DECK.slides.length; j++) { DECK.go(j, 0, false); await new Promise((r) => setTimeout(r, 20)); } });
            for (const s of plan) {
              const html = await p.evaluate(async ([i, k]) => { DECK.go(i, k, false); await new Promise((r) => setTimeout(r, 20)); DECK.seek(i, k, Infinity); return DECK.slides[i]._comps.map((c) => c.outerHTML).join('\n'); }, [s.i, s.max]);
              out.push(PIX ? await shots(p, s.i) : html);
            }
            return out;
          };
          const x = await tour(a), y = await tour(b);
          plan.forEach((s, j) => { compare(`after the tour, slide ${s.i} step ${s.max}`, x[j], y[j]); comps += s.comps; });
          tourMarks += await b.evaluate(() => document.querySelectorAll('.mm-visited').length);
          if (kp && await b.evaluate(() => typeof window.katex !== 'undefined')) bad.push('the 2.0 page has KaTeX (players never render, spec §6.2)');
          if (deck === 'demo' || status === null) {
            status = await b.evaluate((key) => EGATARI_PARTS_SHIM.status(key), key);
            reports = await b.evaluate(() => EGATARI_PARTS_SHIM.reports().map((r) => r.code + ': ' + r.msg));
          }
        }
        await a.close(); await b.close();
      }
      // pixels: 0-pixel identity (the identity rule, egatari-spec ce96072 decision: byte identity where a part's data format is
      // unchanged, 0 pixels against the last commit before the change where the spec changed it); pixelDiff as tools/shot-helpers.mjs
      if (pending.length) {
        const cmp = await browser.newPage();
        for (const { where, x, y } of pending) {
          if (x.length !== y.length) { bad.push(`${where}: ${x.length} components on the 1.x side, ${y.length} on the 2.0 side`); continue; }
          for (let j = 0; j < x.length; j++) {
            const d = !x[j] || !y[j] ? (x[j] || y[j] ? Infinity : 0) : await pixelDiff(cmp, x[j], y[j]);
            if (d > 0) bad.push(`${where}: component ${j}: ${d} pixels differ`);
            maxDiff = Math.max(maxDiff, d); if (d === 0) exact++;
          }
        }
        await cmp.close();
      }
      ok(bad.length === 0, `m-${name} (${label}${demo2 !== null && deck === 'demo' ? ' and, on the 2.0 side, the current demo' : ''}): ${PIX ? 'pixel-identical (0 pixels differ)' : 'DOM byte-identical'} to ${BL} at every frame: ${frames} frames (${comps} component DOMs; ${MODES.join(', ')} × steps × 35 %, 70 %, end; and after a tour of every slide${tourMarks ? `, ${tourMarks} visited marks` : ''}${rewritten ? `; ${rewritten} ids rewritten as allowed` : ''}${dataCompared ? `; ${dataCompared} data scripts equal as data (DATA_REWRITE)` : ''}${emptyClasses ? `; ${emptyClasses} empty KaTeX classes left out (KATEX_EMPTY_CLASS)` : ''}${PIX ? `; ${exact} compared` : ''})`
        + (bad.length ? `\n     ${bad.length} differ; first: ${bad[0]}` : ''));
      ok(errors.v1.length === 0 && errors.v2.length === 0, `m-${name} (${label}): no console error (1.x ${errors.v1.length}, 2.0 ${errors.v2.length})` + (errors.v2.length ? ': ' + errors.v2[0] : errors.v1.length ? ': ' + errors.v1[0] : ''));
    }
    ok(status === 'ok', `m-${name}: ${key} is defined through the registry shim in the 2.0 deck (${status})`);
    ok(reports && reports.length === 0, `m-${name}: no ctx.report on its demo` + (reports && reports.length ? ': ' + reports.join(' | ') : ''));
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-c2-identity: ok');
process.exit(fails ? 1 : 0);

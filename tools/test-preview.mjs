// Answers under preview (docs/conventions.md §1.2, spec §8.4, Player P1). Each demo.html is built with the pinned Studio and
// every component instance is rendered directly with a context that carries `preview: true` (the pinned Studio may not pass
// it yet), next to the same render without it. The theme's --preview-opacity is set to a value other than the 0.45 fallback,
// so a part that hard-codes its faintness fails.
//   (a) a part that answers draws more at its step 0 with preview than without (pixels), every element it changes is at most
//       --preview-opacity (opacity multiplied up to the part), and at least one is exactly --preview-opacity;
//   (b) a part that declares `static preview = "none"` draws exactly the same DOM with and without preview, at every step
//       (middle and end);
//   (c) every component either passes (a) in at least one demo instance or is declared exempt.
// Also writes, per demo slide, screenshots of the lecture view (the pinned Studio's `l` mode) at each step: <shots>/<name>/.
//   node tools/test-preview.mjs [shots dir] [name …]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, componentNames } from './studio.mjs';
import { flags } from './lint.mjs';
import { LAUNCH, hideChrome, settle, pixelDiff } from './shot-helpers.mjs';

const args = process.argv.slice(2);
const shotsRoot = path.resolve(args[0] && !componentNames().includes(args[0]) ? args.shift() : fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-preview-')));
const names = args.length ? args : componentNames();
const OPACITY = 0.4;   // not the 0.45 fallback
const S = await studio();
const b = await S.browser.launch(LAUNCH);
const failed = [];
const answered = new Set();
const notes = [];
for (const name of names) {
  const exempt = flags(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8')).preview === 'none';
  const out = path.join(S.compDir(name), 'out', 'demo.html');
  S.build(path.join(S.compDir(name), 'demo.html'), out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('error: ' + m.text()); });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
  await p.evaluate(() => document.fonts.ready);
  await hideChrome(p);
  await p.evaluate((v) => document.documentElement.style.setProperty('--preview-opacity', String(v)), OPACITY);
  const plan = await p.evaluate((tag) => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.map((c, j) => ({ j, tag: c.localName, steps: c.steps })).filter((c) => c.tag === tag) })).filter((s) => s.comps.length), 'm-' + name);
  const issues = [];
  for (const s of plan) {
    await p.evaluate((i) => DECK.seek(i, 0, Infinity), s.i);
    for (const c of s.comps) {
      const where = `slide ${s.i} #${c.j}`;
      // render the instance at (k, t) with or without preview; returns its DOM and its leaves' effective opacity
      const draw = (k, t, preview) => p.evaluate(([i, j, k, t, preview]) => {
        const sl = DECK.slides[i], el = sl._comps[j];
        const ctx = { mode: 'talk', slide: sl, instant: t === null, deck: DECK };
        if (preview) ctx.preview = true;
        el.render(k, t === null ? Infinity : t, ctx);
        const leaves = [], ids = window.__pvIds ||= new WeakMap();
        window.__pvN ||= 0;
        const skip = (e) => e.closest('defs, clipPath, mask, title, style, script, marker');
        for (const e of el.querySelectorAll('*')) {
          if (skip(e) || (e.children.length && e.localName !== 'text')) continue;
          if (e.closest('text') && e.closest('text') !== e) continue;
          let o = 1;
          for (let x = e; x; x = x.parentElement) {
            const cs = getComputedStyle(x);
            if (cs.display === 'none') { o = 0; break; }
            o *= +cs.opacity;
            if (x === el) break;
          }
          if (getComputedStyle(e).visibility === 'hidden') o = 0;
          const st = getComputedStyle(e);
          if (!ids.has(e)) ids.set(e, ++window.__pvN);
          leaves.push({ id: ids.get(e), tag: e.localName, text: (e.textContent || '').trim().slice(0, 20), o, sig: e.outerHTML + '|' + st.opacity + st.strokeDashoffset + st.color + st.backgroundColor + st.fill + st.stroke });
        }
        return { html: el.innerHTML, leaves };
      }, [s.i, c.j, k, t, preview]);
      // the whole page (a part may draw outside its own box, e.g. m-kobun's vertical writing); only this instance is re-rendered
      const shot = async () => { await settle(p); return p.screenshot(); };
      if (exempt) {
        // (b) nothing ahead: the same DOM at every step, middle and end
        for (let k = 0; k <= c.steps; k++) {
          const d = await p.evaluate(([i, j, k]) => DECK.slides[i]._comps[j].duration(k), [s.i, c.j, k]);
          for (const t of d > 0 ? [d * 0.5, null] : [null]) {
            const n = await draw(k, t, false), q = await draw(k, t, true);
            if (n.html !== q.html) issues.push(`${where}: declared preview "none" but draws differently under preview at k=${k}${t === null ? '' : ' t=' + t.toFixed(2)}`);
          }
        }
      } else if (c.steps < 1) {
        notes.push(`${name} ${where}: no later steps in this instance (steps = 0), nothing to preview`);
      } else {
        // (a) at step 0, more is drawn under preview, at --preview-opacity
        const n = await draw(0, null, false), an = await shot();
        const q = await draw(0, null, true), aq = await shot();
        const px = await pixelDiff(p, an, aq);
        // leaves are matched by identity (a part may rebuild some elements on every render, e.g. m-gendai's underline segments)
        const before = new Map(n.leaves.map((L) => [L.id, L]));
        const changed = q.leaves.filter((L) => { const m = before.get(L.id); return (!m || Math.abs(L.o - m.o) > 0.005 || L.sig !== m.sig) && L.o > 0.01; });
        const bright = changed.filter((L) => L.o > OPACITY + 0.01);
        const exact = changed.filter((L) => Math.abs(L.o - OPACITY) <= 0.01);
        const bad = [];
        if (px < 30) bad.push(`draws nothing more at step 0 under preview (${px} px differ)`);
        if (bright.length) bad.push(`${bright.length} element(s) brighter than --preview-opacity, e.g. <${bright[0].tag}> "${bright[0].text}" at ${bright[0].o.toFixed(3)}`);
        if (!exact.length) bad.push(`no element at --preview-opacity (${OPACITY}); faint values seen: ${[...new Set(changed.map((L) => L.o.toFixed(3)))].slice(0, 6).join(', ') || 'none'}`);
        if (bad.length) issues.push(...bad.map((x) => `${where}: ${x}`));
        else answered.add(name);
        await draw(0, null, false);
      }
    }
    // lecture-view screenshots (what a viewer sees with the pinned Studio's preview of later steps)
    const dir = path.join(shotsRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    await p.evaluate(() => { DECK.mode = 'lecture'; document.documentElement.setAttribute('data-mode', 'lecture'); });
    for (let k = 0; k <= s.max; k++) {
      await p.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [s.i, k]);
      await settle(p);
      await p.screenshot({ path: path.join(dir, `s${s.i}_k${k}.png`) });
    }
    await p.evaluate(() => { DECK.mode = 'talk'; document.documentElement.setAttribute('data-mode', 'talk'); });
  }
  if (!plan.length) issues.push('no instance in demo.html');
  if (errs.length) issues.push(...errs);
  // (c) answers or is declared exempt
  if (!exempt && !answered.has(name) && !issues.length) issues.push('neither answers under preview nor declares static preview = "none"');
  console.log(`${issues.length ? 'FAIL' : 'ok  '} ${name}${exempt ? ' (preview "none")' : ''}`);
  for (const x of issues) console.log('     ' + x);
  if (issues.length) failed.push(name);
  await p.close();
}
await b.close();
for (const x of notes) console.log('note: ' + x);
console.log(failed.length ? `\nFAIL: ${failed.join(', ')}\nshots: ${shotsRoot}` : `\nOK (shots: ${shotsRoot})`);
process.exit(failed.length ? 1 : 0);

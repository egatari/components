// Every part's DOM after a step does not depend on the order of the calls that led there (docs/contract.md §3).
// For each demo slide and each step k at its end (t = Infinity), in the talk view and in the lecture (preview) view:
//   straight  a freshly loaded deck, then seek(k)
//   detour    then seek(k + 1), seek(0), seek(k)   (k + 1 is clamped to the slide's last step)
// The components' DOM (outerHTML of every part on the slide: tags, attribute strings and text, byte for byte) must be equal.
// No pixels and no tolerance: a stale attribute (one set by an earlier render and not set again) or a differently written
// style string fails. Built with the pinned Egatari Studio (tools/studio.mjs).
// Migrated parts (components 2.0: m-bars, m-menu, …) run through the registry shim, as the overlay serves them
// (tools/studio.mjs, tools/parts.mjs c2Bundle); for them this also checks that the part is defined through the registry.
//   node tools/test-dom-order.mjs [work folder] [--only name,name]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT, componentNames } from './studio.mjs';
import { partMetas } from './parts.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args.splice(oi, 2)[1].split(',').map((n) => n.replace(/^m-/, ''))) : null;
const S = await studio();
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-dom-order-')));
fs.mkdirSync(work, { recursive: true });
const names = componentNames().filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')) && (!only || only.has(n)));
const MODES = ['talk', 'lecture'];
const PAGES = 4;   // pages loaded in parallel (each case needs a fresh deck)

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const browser = await S.browser.launch();
try {
  for (const name of names) {
    const out = path.join(work, name, 'demo.html');
    S.build(path.join(S.compDir(name), 'demo.html'), out);
    const url = S.browser.fileUrl(out);
    const pages = await Promise.all(Array.from({ length: PAGES }, () => browser.newPage({ viewport: { width: 1280, height: 720 } })));
    const errors = [];
    for (const p of pages) {
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    }
    const open = async (p, mode) => {
      await p.goto(url);
      await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
      await p.evaluate(() => document.fonts.ready);
      if (mode !== 'talk') await p.evaluate((m) => { DECK.mode = m; document.documentElement.setAttribute('data-mode', m); }, mode);
    };
    const dom = (p, si) => p.evaluate((si) => DECK.slides[si]._comps.map((c) => c.outerHTML).join('\n'), si);
    const seek = (p, si, k) => p.evaluate(([si, k]) => DECK.seek(si, k, Infinity), [si, k]);
    await open(pages[0], 'talk');
    const meta = partMetas(ROOT)[name];
    if (meta && meta.element) {
      const st = await pages[0].evaluate((key) => window.EGATARI_PARTS_SHIM ? EGATARI_PARTS_SHIM.status(key) : 'no registry', `${name}@${meta.version}`);
      ok(st === 'ok', `m-${name}: ${name}@${meta.version} runs through the registry shim (${st})`);
    }
    const slides = await pages[0].evaluate(() => DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length })).filter((s) => s.comps > 0));
    const cases = [];
    for (const mode of MODES) for (const s of slides) for (let k = 0; k <= s.max; k++) cases.push({ mode, si: s.i, k, max: s.max });
    const bad = [];
    let next = 0;
    await Promise.all(pages.map(async (p) => {
      while (next < cases.length) {
        const c = cases[next++];
        await open(p, c.mode);
        await seek(p, c.si, c.k);
        const a = await dom(p, c.si);
        await seek(p, c.si, Math.min(c.max, c.k + 1));
        await seek(p, c.si, 0);
        await seek(p, c.si, c.k);
        const b = await dom(p, c.si);
        if (a !== b) {
          // the first differing element, for the message
          let i = 0; while (i < a.length && a[i] === b[i]) i++;
          const tag = a.slice(Math.max(a.lastIndexOf('<', i), 0)).match(/^<[a-z0-9-]+/i), from = Math.max(0, i - 60);
          bad.push(`${c.mode} slide ${c.si} step ${c.k}, in ${tag ? tag[0] + '>' : '?'}: straight …${JSON.stringify(a.slice(from, i + 80))}\n       detour   …${JSON.stringify(b.slice(from, i + 80))}`);
        }
      }
    }));
    await Promise.all(pages.map((p) => p.close()));
    ok(bad.length === 0, `m-${name}: DOM at (k, end) equal straight and after k+1, 0, k (${cases.length} cases: ${slides.length} slides × ${MODES.join(', ')})`
      + (bad.length ? `\n     ${bad.length} differ; first: ${bad[0]}` : ''));
    ok(errors.length === 0, `m-${name}: no console error` + (errors.length ? ': ' + errors[0] : ''));
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

// m-kakijun, built with the pinned Egatari Studio:
//   1. the data in components/kakijun/index.js equals the data files: kakijun-data (MIT) = data/kana/kana.json (count, ends,
//      place) with each stroke's inked length; kakijun-strokes (OFL) = data/kana/strokes.ofl.json, verbatim, its "_license"
//      first; the licence files are in the part's folder (tools/kana-embed.mjs --check)
//   2. the final state of every one of the 166 characters covers 100 % of its outlines, and nothing outside them
//      (target: every outline filled; ink = pixels darker than the middle grey; 1 px of antialiasing allowed)
//   3. no bleed while drawing: in the middle of stroke j (j = 1 and the middle stroke), the ink lies inside the outlines of
//      strokes 1..j
//   4. small kana: the ink lies inside the lower-left quarter of the box in horizontal writing and the upper-right quarter
//      in vertical writing (writing="tate")
//   5. steps: one per character, or one per stroke with per="stroke"; a character without data warns and is drawn plainly;
//      the accessible name and the readable layer are the real kana; the drawing is aria-hidden
//   node tools/test-kakijun.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';
import { readEmbedded, inkLength, LICENSE_FILES } from './kana-embed.mjs';

const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-kakijun-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---- 1. embedded data ----
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'kana.json'), 'utf8'));
const ofl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'strokes.ofl.json'), 'utf8'));
const emb = readEmbedded();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CHARS = Object.keys(data.chars);
const diff = CHARS.filter((ch) => {
  const c = data.chars[ch], e = emb.kana[ch];
  const want = { count: c.count, strokes: c.strokes.map((s, i) => ({ end: s.end, len: inkLength(ofl.chars[ch][i]) })), ...(c.place ? { place: c.place } : {}) };
  return !e || !same(e, want) || ofl.chars[ch].length !== c.count;
});
ok(!diff.length && Object.keys(emb.kana).length === CHARS.length, `kakijun-data equals kana.json for all ${CHARS.length} characters, stroke counts equal the shapes'` + (diff.length ? ' (differs: ' + diff.join('') + ')' : ''));
const deep = (o) => JSON.stringify(o, Object.keys(o).sort());
ok(same(Object.keys(emb.strokes), Object.keys(ofl)) && Object.keys(ofl).every((k) => same(emb.strokes[k], ofl[k])), 'kakijun-strokes equals data/kana/strokes.ofl.json (same keys, same values)');
ok(/\nvar STROKES = \{"_license": \{/.test(emb.strokesBlock) && same(emb.strokes._license, ofl._license) && /OFL 1\.1, see OFL\.txt/.test(emb.strokesBlock.split('\n')[0]), 'the OFL block is marked "OFL 1.1, see OFL.txt" and starts with the "_license" object, verbatim');
ok(LICENSE_FILES.every((f) => fs.existsSync(path.join(ROOT, 'components', 'kakijun', f))) && !fs.readdirSync(path.join(ROOT, 'components', 'kakijun')).some((f) => /klee/i.test(f)), `the part's folder has ${LICENSE_FILES.join(', ')}, and no file name with "Klee"`);
const ke = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'kana-embed.mjs'), '--check'], { encoding: 'utf8' });
ok(ke.status === 0, 'tools/kana-embed.mjs --check: ' + (ke.stdout + ke.stderr).trim().split('\n').join(' | '));

// ---- the test deck ----
const S = await studio();
const SMALL = CHARS.filter((ch) => data.chars[ch].place);
const B = 240, PER = 3;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const slides = [];
const add = (kind, text, attrs, h = B + 80) => slides.push({ kind, text, html: `<section class="slide noconcl"><h2>${kind}</h2><div class="body"><m-kakijun text="${text}" size="${B}" ${attrs} style="height:${h}px"></m-kakijun></div></section>` });
for (const c of chunk(CHARS, PER)) add('cover', c.join(''), 'grid="none" ghost="off" nums="off" per="stroke"');
// small kana one per slide (in vertical writing the boxes of a column touch, so a neighbour's ink would be measured too)
for (const ch of SMALL) add('yoko', ch, 'grid="none" ghost="off" nums="off"');
for (const ch of SMALL) add('tate', ch, 'grid="none" ghost="off" nums="off" writing="tate"');
slides.push({ kind: 'steps', html: '<section class="slide noconcl"><h2>steps</h2><div class="body"><m-kakijun id="k-char" text="あガ" style="height:300px"></m-kakijun></div></section>' });
slides.push({ kind: 'steps', html: '<section class="slide noconcl"><h2>steps</h2><div class="body"><m-kakijun id="k-stroke" text="あガ" per="stroke" ends="on" variant="pen" style="height:300px"></m-kakijun></div></section>' });
slides.push({ kind: 'unknown', html: '<section class="slide noconcl"><h2>unknown</h2><div class="body"><m-kakijun id="k-unknown" text="漢字あ" style="height:300px"></m-kakijun></div></section>' });
const src = path.join(work, 'kakijun.html'), out = path.join(work, 'kakijun.out.html');
fs.writeFileSync(src, `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head>\n<meta charset="utf-8">\n<title>m-kakijun test</title>\n</head>\n<body>\n<div id="stage">\n${slides.map((s) => s.html).join('\n')}\n</div>\n</body>\n</html>\n`);
S.build(src, out);

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const dec = await browser.newPage();
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.addStyleTag({ content: '.kj-ideal [data-ink] { visibility: hidden !important; }' });
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // PNG → ink mask (1 = darker than the middle grey), decoded by the browser
  const ink = async (png) => {
    const r = await dec.evaluate(async (src) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
      const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data, o = new Uint8Array(img.width * img.height);
      for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) < 128 ? 1 : 0;
      let s = ''; for (let i = 0; i < o.length; i += 8192) s += String.fromCharCode(...o.subarray(i, i + 8192));
      return [btoa(s), img.width];
    }, png.toString('base64'));
    return { px: Buffer.from(r[0], 'base64'), w: r[1] };
  };
  const M = 20;   // margin around a box: a shape may reach a little outside the 0–100 square
  const cellsOf = (i) => page.evaluate((i) => { const c = DECK.slides[i]._comps[0], r = c.getBoundingClientRect(); return c.cells.map((x) => ({ ...x, X: r.left + x.x, Y: r.top + x.y })); }, i);
  const shot = async (c, name) => { const png = await page.screenshot({ clip: { x: c.X - M, y: c.Y - M, width: c.size + 2 * M, height: c.size + 2 * M } }); fs.writeFileSync(path.join(work, name + '.png'), png); return ink(png); };
  // the target: outlines of strokes 0..upto of cell j filled black, the drawing hidden
  const ideal = (i, j, upto) => page.evaluate(([i, j, upto]) => {
    const comp = DECK.slides[i]._comps[0], g = comp.querySelector(`[data-ink="${j}"]`), NS = 'http://www.w3.org/2000/svg';
    const o = document.createElementNS(NS, 'g'); o.setAttribute('class', 'kj-target'); o.setAttribute('transform', g.getAttribute('transform'));
    g.parentNode.querySelectorAll('path[data-o]').forEach((p) => { if (+p.getAttribute('data-o') <= upto) { const q = document.createElementNS(NS, 'path'); q.setAttribute('d', p.getAttribute('d')); q.setAttribute('fill', '#000'); o.appendChild(q); } });
    g.parentNode.appendChild(o); comp.classList.add('kj-ideal');
  }, [i, j, upto]);
  const unideal = (i) => page.evaluate((i) => { const comp = DECK.slides[i]._comps[0]; comp.classList.remove('kj-ideal'); comp.querySelectorAll('.kj-target').forEach((e) => e.remove()); }, i);
  // pixels of A not in G (dilated by 1 px: antialiasing), and of G not in A
  const compare = (A, G) => {
    const { w } = G, h = G.px.length / w, near = (P, p) => { const x = p % w, y = (p / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && P[Y * w + X]) return true; } return false; };
    let g = 0, miss = 0, extra = 0;
    for (let p = 0; p < G.px.length; p++) {
      if (G.px[p]) { g++; if (!A.px[p] && !near(A.px, p)) miss++; }
      else if (A.px[p] && !near(G.px, p)) extra++;
    }
    return { g, miss, extra };
  };
  const cover = [], bleed = [], place = [];
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i];
    if (!['cover', 'yoko', 'tate'].includes(sl.kind)) continue;
    await page.evaluate((i) => { const s = DECK.slides[i]; DECK.seek(i, s._max, Infinity); }, i);
    await settle();
    const cells = await cellsOf(i);
    if (sl.kind === 'cover') {
      const A = []; for (const [j, c] of cells.entries()) A.push(await shot(c, `cover-${c.ch}-final`));
      for (const [j, c] of cells.entries()) {
        await ideal(i, j, 99); await settle();
        const G = await shot(c, `cover-${c.ch}-target`); await unideal(i);
        const r = compare(A[j], G); cover.push([c.ch, r]);
      }
      // the middle of stroke 1 and of the middle stroke
      for (const [j, c] of cells.entries()) {
        for (const s of [...new Set([0, Math.floor((c.strokes.length - 1) / 2)])]) {
          const st = c.strokes[s];
          await page.evaluate(([i, k, t]) => DECK.seek(i, k, t), [i, st.step, st.t0 + st.dur / 2]);
          await settle();
          const A2 = await shot(c, `bleed-${c.ch}-${s + 1}`);
          await ideal(i, j, s); await settle();
          const G2 = await shot(c, `bleed-${c.ch}-${s + 1}-target`); await unideal(i);
          bleed.push([c.ch, s + 1, compare(A2, G2).extra]);
        }
      }
    } else {
      const [c] = cells, { px, w } = await shot(c, `${sl.kind}-${c.ch}`);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let p = 0; p < px.length; p++) if (px[p]) { const x = (p % w) - M, y = Math.floor(p / w) - M; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const h = c.size / 2, [qx, qy] = sl.kind === 'yoko' ? [0, h] : [h, 0];
      place.push([c.ch, sl.kind, x1 >= 0 && x0 >= qx && x1 + 1 <= qx + h && y0 >= qy && y1 + 1 <= qy + h, [x0, y0, x1 + 1, y1 + 1].map((v) => +(v / c.size * 100).toFixed(1))]);
    }
  }
  const badCover = cover.filter(([, r]) => r.miss || r.extra || r.g < 500);
  const totMiss = cover.reduce((a, [, r]) => a + r.miss, 0), totExtra = cover.reduce((a, [, r]) => a + r.extra, 0);
  ok(cover.length === CHARS.length && !badCover.length, `final state covers 100 % of the outlines and nothing outside them, all ${cover.length} characters (missed ${totMiss} px, outside ${totExtra} px)` + (badCover.length ? ': ' + badCover.map(([ch, r]) => `${ch} missed ${r.miss} / outside ${r.extra} of ${r.g} px`).join(', ') : ''));
  const badBleed = bleed.filter((x) => x[2] > 0);
  ok(bleed.length >= CHARS.length && !badBleed.length, `no bleed: in the middle of a stroke the ink stays inside the outlines drawn so far (${bleed.length} states)` + (badBleed.length ? ': ' + badBleed.map((x) => `${x[0]} stroke ${x[1]}: ${x[2]} px`).join(', ') : ''));
  for (const mode of ['yoko', 'tate']) {
    const r = place.filter((x) => x[1] === mode), bad = r.filter((x) => !x[2]);
    ok(r.length === SMALL.length && !bad.length, `${mode}: all ${r.length} small kana inside the ${mode === 'yoko' ? 'lower-left' : 'upper-right'} quarter` + (bad.length ? ': ' + bad.map((x) => x[0] + ' ' + JSON.stringify(x[3])).join(', ') : ''));
  }
  // ---- 5. steps, unknown characters, accessibility ----
  const st = await page.evaluate(() => {
    const g = (id) => document.getElementById(id), u = g('k-unknown');
    return { char: g('k-char').steps, stroke: g('k-stroke').steps, unknown: u.steps, plain: [...u.querySelectorAll('text')].map((t) => t.textContent).join(''),
      srChar: g('k-char').querySelector('.sr-only').textContent, label: g('k-char').getAttribute('aria-label'),
      hidden: [...document.querySelectorAll('m-kakijun')].every((c) => [...c.querySelectorAll('svg')].every((s) => s.closest('[aria-hidden="true"]'))) };
  });
  ok(st.char === 2, `per="char": one step per character (あガ → ${st.char})`);
  ok(st.stroke === 7, `per="stroke": one step per stroke (あ 3 + ガ 4 → ${st.stroke})`);
  ok(st.unknown === 3 && st.plain.includes('漢') && st.plain.includes('字'), `a character without data is one step, drawn as plain text (${st.unknown} steps)`);
  ok(warnings.some((w) => /no stroke data for "漢"/.test(w)) && warnings.some((w) => /no stroke data for "字"/.test(w)), 'a character without data gives a console.warn');
  ok(/あ 3画/.test(st.srChar) && /ガ 4画/.test(st.srChar), `readable layer has the characters and stroke counts ("${st.srChar}")`);
  ok(st.label === 'あガ（書き順）' && st.hidden, `the accessible name is the real kana ("${st.label}"), the drawing is aria-hidden`);
  ok(!errors.length, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await browser.close(); }
console.log(fails ? `\ntest-kakijun: ${fails} failure(s)` : '\ntest-kakijun: ok');
process.exit(fails ? 1 : 0);

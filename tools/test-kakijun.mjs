// m-kakijun, built with the pinned Egatari Studio:
//   1. the stroke data embedded in components/kakijun/index.js equals data/kana/kana.json (count, d, end, w, place), the paths
//      use only M L Q C (the part's own sampler), and the font block decodes to the Egatari Kana subset (tools/kana-embed.mjs --check)
//   2. the last step of every one of the 166 characters shows ≥ 99 % of the glyph (as tools/kana-proto-check.mjs measures it:
//      glyph ink seen through the part's mask / glyph ink with the mask removed; ink = pixels darker than the middle grey)
//   3. small kana: the ink lies inside the lower-left quarter of the box in horizontal writing and the upper-right quarter
//      in vertical writing (writing="tate")
//   4. steps: one per character, or one per stroke with per="stroke"; a character without data warns and is drawn plainly
//   node tools/test-kakijun.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';
import { readEmbedded } from './kana-embed.mjs';

const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-kakijun-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---- 1. embedded data and font ----
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'kana.json'), 'utf8'));
const emb = readEmbedded();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diff = Object.keys(data.chars).filter((ch) => {
  const c = data.chars[ch], e = emb[ch];
  const want = { count: c.count, strokes: c.strokes.map((s) => ({ d: s.d, end: s.end, ...(s.w !== undefined ? { w: s.w } : {}) })), ...(c.place ? { place: c.place } : {}) };
  return !e || !same(e, want);
});
ok(!diff.length && Object.keys(emb).length === Object.keys(data.chars).length, `embedded data equals kana.json for all ${Object.keys(data.chars).length} characters${diff.length ? ' (differs: ' + diff.join('') + ')' : ''}`);
const badCmd = Object.entries(emb).filter(([, c]) => c.strokes.some((s) => /[^MLQC\d\s.,-]/.test(s.d) || !/^M/.test(s.d))).map(([ch]) => ch);
ok(!badCmd.length, 'every path uses only absolute M L Q C' + (badCmd.length ? ': ' + badCmd.join('') : ''));
const ke = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'kana-embed.mjs'), '--check'], { encoding: 'utf8' });
ok(ke.status === 0, 'tools/kana-embed.mjs --check: ' + (ke.stdout + ke.stderr).trim().split('\n').join(' | '));

// ---- the test deck ----
const S = await studio();
const CHARS = Object.keys(data.chars);
const SMALL = CHARS.filter((ch) => data.chars[ch].place);
const B = 240, PER = 3;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const slides = [];
const add = (kind, text, attrs, h = B + 80) => slides.push({ kind, text, html: `<section class="slide noconcl"><h2>${kind}</h2><div class="body"><m-kakijun text="${text}" size="${B}" ${attrs} style="height:${h}px"></m-kakijun></div></section>` });
for (const c of chunk(CHARS, PER)) add('cover', c.join(''), 'grid="none" ghost="off" nums="off"');
// small kana one per slide (in vertical writing the boxes of a column touch, so a neighbour's ink would be measured too)
for (const ch of SMALL) add('yoko', ch, 'grid="none" ghost="off" nums="off"');
for (const ch of SMALL) add('tate', ch, 'grid="none" ghost="off" nums="off" writing="tate"');
slides.push({ kind: 'steps', text: 'あガ', html: '<section class="slide noconcl"><h2>steps</h2><div class="body"><m-kakijun id="k-char" text="あガ" style="height:300px"></m-kakijun></div></section>' });
slides.push({ kind: 'steps', text: 'あガ', html: '<section class="slide noconcl"><h2>steps</h2><div class="body"><m-kakijun id="k-stroke" text="あガ" per="stroke" ends="on" variant="pen" style="height:300px"></m-kakijun></div></section>' });
slides.push({ kind: 'unknown', text: '字', html: '<section class="slide noconcl"><h2>unknown</h2><div class="body"><m-kakijun id="k-unknown" text="漢字あ" style="height:300px"></m-kakijun></div></section>' });
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
  await page.evaluate(() => document.fonts.ready);
  ok(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Egatari Kana' && f.status === 'loaded')), 'the font Egatari Kana is loaded from the part');
  const settle = () => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  // PNG → ink mask (1 = darker than the middle grey), decoded by the browser
  const ink = async (png) => {
    const b64 = await dec.evaluate(async (src) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
      const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data, o = new Uint8Array(img.width * img.height);
      for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) < 128 ? 1 : 0;
      let s = ''; for (let i = 0; i < o.length; i += 8192) s += String.fromCharCode(...o.subarray(i, i + 8192));
      return [btoa(s), img.width];
    }, png.toString('base64'));
    return { px: Buffer.from(b64[0], 'base64'), w: b64[1] };
  };
  // the cells of slide i in the final state, in page coordinates
  const cellsAt = async (i) => {
    await page.evaluate((i) => { const s = DECK.slides[i]; DECK.seek(i, s._max, Infinity); }, i);
    await settle();
    return page.evaluate((i) => { const c = DECK.slides[i]._comps[0], r = c.getBoundingClientRect(); return c.cells.map((x) => ({ ...x, X: r.left + x.x, Y: r.top + x.y })); }, i);
  };
  const M = 20;   // margin around a box: a glyph may reach a little outside its em square
  const cover = [], place = [];
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i];
    if (!['cover', 'yoko', 'tate'].includes(sl.kind)) continue;
    const cells = await cellsAt(i);
    const shots = async (tag) => Promise.all(cells.map(async (c, j) => {
      const png = await page.screenshot({ clip: { x: c.X - M, y: c.Y - M, width: c.size + 2 * M, height: c.size + 2 * M } });
      fs.writeFileSync(path.join(work, `${sl.kind}-${i}-${j}-${tag}.png`), png);   // for looking at a failure
      return ink(png);
    }));
    const A = await shots('final');
    if (sl.kind === 'cover') {
      await page.evaluate((i) => DECK.slides[i]._comps[0].querySelectorAll('g[mask]').forEach((g) => g.removeAttribute('mask')), i);
      await settle();
      const G = await shots('glyph');
      cells.forEach((c, j) => {
        let n = 0, seen = 0;
        for (let p = 0; p < G[j].px.length; p++) if (G[j].px[p]) { n++; if (A[j].px[p]) seen++; }
        cover.push([c.ch, n ? (100 * seen) / n : 0, n]);
      });
    } else {
      cells.forEach((c, j) => {
        const { px, w } = A[j];
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let p = 0; p < px.length; p++) if (px[p]) { const x = (p % w) - M, y = Math.floor(p / w) - M; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const h = c.size / 2, [qx, qy] = sl.kind === 'yoko' ? [0, h] : [h, 0];
        const inside = x1 >= 0 && x0 >= qx && x1 + 1 <= qx + h && y0 >= qy && y1 + 1 <= qy + h;
        place.push([c.ch, sl.kind, inside, [x0, y0, x1 + 1, y1 + 1].map((v) => +(v / c.size * 100).toFixed(1))]);
      });
    }
  }
  const low = cover.filter(([, p, n]) => !(p >= 99) || n < 50);
  const min = cover.reduce((a, b) => (b[1] < a[1] ? b : a), ['', 101]);
  ok(cover.length === CHARS.length && !low.length, `final state shows ≥ 99 % of the glyph for all ${cover.length} characters (lowest ${min[0]} ${min[1].toFixed(2)} %)` + (low.length ? ': ' + low.map(([ch, p, n]) => `${ch} ${p.toFixed(2)} % of ${n} px`).join(', ') : ''));
  for (const mode of ['yoko', 'tate']) {
    const r = place.filter((x) => x[1] === mode), bad = r.filter((x) => !x[2]);
    ok(r.length === SMALL.length && !bad.length, `${mode}: all ${r.length} small kana inside the ${mode === 'yoko' ? 'lower-left' : 'upper-right'} quarter` + (bad.length ? ': ' + bad.map((x) => x[0] + ' ' + JSON.stringify(x[3])).join(', ') : ''));
  }
  // ---- 4. steps, unknown characters ----
  const st = await page.evaluate(() => {
    const g = (id) => document.getElementById(id);
    const u = g('k-unknown');
    return { char: g('k-char').steps, stroke: g('k-stroke').steps, unknown: u.steps, plain: [...u.querySelectorAll('text:not([data-glyph])')].map((t) => t.textContent).join(''),
      sr: u.querySelector('.sr-only').textContent, srChar: g('k-char').querySelector('.sr-only').textContent, label: g('k-char').getAttribute('aria-label'),
      // text a screen reader can reach (outside aria-hidden): no Private Use Area character
      pua: [...document.querySelectorAll('m-kakijun')].some((c) => /[\uE000-\uF8FF]/.test((c.getAttribute('aria-label') || '') + c.querySelector('.sr-only').textContent)),
      hidden: [...document.querySelectorAll('m-kakijun')].every((c) => [...c.querySelectorAll('text[data-glyph]')].every((t) => t.closest('[aria-hidden="true"]'))) };
  });
  ok(st.char === 2, `per="char": one step per character (あガ → ${st.char})`);
  ok(st.stroke === 7, `per="stroke": one step per stroke (あ 3 + ガ 4 → ${st.stroke})`);
  ok(st.unknown === 3 && st.plain.includes('漢') && st.plain.includes('字'), `a character without data is one step, drawn as plain text (${st.unknown} steps, "${st.plain}")`);
  ok(warnings.some((w) => /no stroke data for "漢"/.test(w)) && warnings.some((w) => /no stroke data for "字"/.test(w)), 'a character without data gives a console.warn');
  ok(/あ 3画/.test(st.srChar) && /ガ 4画/.test(st.srChar), `readable layer has the characters and stroke counts ("${st.srChar}")`);
  ok(st.label === 'あガ（書き順）' && !st.pua && st.hidden, `the accessible name is the real kana ("${st.label}"), no Private Use Area character in the readable text, every glyph under aria-hidden`);
  ok(!errors.length, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await browser.close(); }
console.log(fails ? `\ntest-kakijun: ${fails} failure(s)` : '\ntest-kakijun: ok');
process.exit(fails ? 1 : 0);

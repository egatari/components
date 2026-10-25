// Text contrast (docs/conventions.md §2.3): in the final state of every demo slide, every SVG text of a component reaches
// at least 4.5:1 against what is under it (its fill and accumulated opacity, over the filled shapes drawn before it,
// over --bg), in each of Egatari Studio's themes (the demo is built once per theme). Shapes a component marks with
// class="outline" (graphical outlines that carry meaning, e.g. m-hist's second group drawn dashed over the first) reach 3:1
// against what is around them (WCAG 1.4.11).
//   node tools/test-contrast.mjs [name …]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';

const S = await studio();
const THEMES = ['default', 'kokugo', 'business'];
const MIN = 4.5;
// Known theme issue (Egatari Studio's themes, not these components): the business theme's --emph on its --emph-tint is
// about 4.34:1. Reported for the theme, listed here and not counted as a component failure; remove when the theme is fixed
const THEME_KNOWN = { business: ['--emph'] };
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')));
const b = await S.browser.launch();
let fail = 0;
for (const name of names) for (const theme of THEMES) {
  // the demo with this theme, built next to it (written over each time; out/ is not in git)
  const src = path.join(S.compDir(name), 'out', `contrast-${theme}-src.html`), out = path.join(S.compDir(name), 'out', `contrast-${theme}.html`);
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, fs.readFileSync(path.join(S.compDir(name), 'demo.html'), 'utf8').replace(/(<html[^>]*\sdata-theme=")[^"]*"/, `$1${theme}"`));
  S.build(src, out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const res = await p.evaluate(async () => {
    const out = [];
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true });
    // any CSS colour (oklch, color-mix, var() already resolved by getComputedStyle) as sRGB, by painting one pixel
    const rgb = (s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
    const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const opa = (el, stop) => { let a = 1; for (let x = el; x && x !== stop; x = x.parentElement) { const o = x.getAttribute && x.getAttribute('opacity'); a *= (o === null ? 1 : +o) * +getComputedStyle(x).opacity; } return a; };
    for (let i = 0; i < DECK.slides.length; i++) {
      const s = DECK.slides[i]; if (!s._comps.length) continue;
      DECK.seek(i, s._max, Infinity);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const c of s._comps) for (const e of c.querySelectorAll('text')) {
        const txt = e.textContent.trim(); if (!txt) continue;
        const op = opa(e, c);
        if (op < 0.05) continue;   // not shown
        const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        // background: --bg, then every filled shape under the text centre that is drawn before the text, in document order
        let bg = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff');
        for (const sh of c.querySelectorAll('rect, circle, ellipse, path')) {
          if (sh.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING) continue;   // drawn after the text
          const cs = getComputedStyle(sh); if (cs.fill === 'none' || cs.fill === 'transparent') continue;
          const q = sh.getBoundingClientRect(); if (!(cx > q.left && cx < q.right && cy > q.top && cy < q.bottom)) continue;
          if (sh.tagName !== 'rect') { const pt = sh.ownerSVGElement.createSVGPoint(); pt.x = cx; pt.y = cy; if (!sh.isPointInFill(pt.matrixTransform(sh.getScreenCTM().inverse()))) continue; }
          const a = +cs.fillOpacity * opa(sh, c); if (a <= 0) continue;
          const f = rgb(cs.fill); bg = f.map((v, j) => v * a + bg[j] * (1 - a));
        }
        const fill = rgb(getComputedStyle(e).fill), eff = fill.map((v, j) => v * op + bg[j] * (1 - op));
        const tokens = {}; for (const k of ['--emph', '--term', '--fg', '--muted']) tokens[k] = rgb(getComputedStyle(document.documentElement).getPropertyValue(k).trim()).join();
        const token = Object.keys(tokens).find((k) => tokens[k] === fill.join()) || '';
        out.push({ slide: i, txt: txt.slice(0, 24), fill: getComputedStyle(e).fill, token, op: +op.toFixed(2), cr: +cr(eff, bg).toFixed(2), min: 4.5 });
      }
      // Outlines a component marks with class="outline" (e.g. m-hist's bars, the second group dashed over the first):
      // the stroke on its top edge (30 % from the left) reaches 3:1 (WCAG 1.4.11) against what is around it there, i.e. --bg and
      // the filled shapes drawn before it, with the translucent fills drawn after it laid over both
      for (const c of s._comps) for (const sh of c.querySelectorAll('.outline')) {
        const op = opa(sh, c), q0 = sh.getBoundingClientRect();
        if (op < 0.05 || q0.width < 2 || q0.height < 2) continue;
        const cx = q0.left + q0.width * 0.3, cy = q0.top + 1;   // off the middle, where a marker (a polygon vertex) may sit
        let under = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff');
        const over = [];
        for (const o of c.querySelectorAll('rect, circle, ellipse, path')) {
          if (o === sh) continue;
          const cs = getComputedStyle(o); if (cs.fill === 'none' || cs.fill === 'transparent') continue;
          const q = o.getBoundingClientRect(); if (!(cx > q.left && cx < q.right && cy > q.top && cy < q.bottom)) continue;
          if (o.tagName !== 'rect') { const pt = o.ownerSVGElement.createSVGPoint(); pt.x = cx; pt.y = cy; if (!o.isPointInFill(pt.matrixTransform(o.getScreenCTM().inverse()))) continue; }
          const a = +cs.fillOpacity * opa(o, c); if (a <= 0) continue;
          const f = rgb(cs.fill);
          if (sh.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_PRECEDING) under = f.map((v, j) => v * a + under[j] * (1 - a));
          else over.push([f, a]);
        }
        const st = rgb(getComputedStyle(sh).stroke);
        let line = st.map((v, j) => v * op + under[j] * (1 - op)), around = under;
        for (const [f, a] of over) { line = f.map((v, j) => v * a + line[j] * (1 - a)); around = f.map((v, j) => v * a + around[j] * (1 - a)); }
        out.push({ slide: i, txt: 'outline (' + sh.tagName + (sh.getAttribute('stroke-dasharray') ? ', dashed' : '') + ')', fill: getComputedStyle(sh).stroke, token: '', op: +op.toFixed(2), cr: +cr(line, around).toFixed(2), min: 3 });
      }
    }
    return out;
  });
  await p.close();
  const below = res.filter((x) => x.cr < x.min), known = (THEME_KNOWN[theme] || []);
  const themeLow = below.filter((x) => known.includes(x.token)), low = below.filter((x) => !known.includes(x.token));
  if (themeLow.length) console.log(`theme ${name} (${theme}): ${themeLow.length} text(s) in ${known.join(', ')} below ${MIN}:1 (theme issue, not counted): ${[...new Set(themeLow.map((x) => x.cr))].join(', ')}:1`);
  const nOut = res.filter((x) => x.min === 3).length, nText = res.length - nOut;
  if (low.length) { fail++; console.log(`FAIL ${name} (${theme}): ${low.length} of ${res.length} texts / outlines below ${MIN}:1 (texts) or 3:1 (outlines)`); for (const x of low) console.log(`   s${x.slide} "${x.txt}" ${x.fill} opacity ${x.op} → ${x.cr}:1`); }
  else console.log(`ok   ${name} (${theme}): ${nText} texts${nOut ? `, ${nOut} outlines (3:1)` : ''}`);
}
await b.close();
console.log(fail ? `\n${fail} demo build(s) with text below ${MIN}:1` : 'test-contrast: ok');
process.exit(fail ? 1 : 0);

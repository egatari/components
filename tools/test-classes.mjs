// Choropleth classes (docs/map-design.md §5.4): in the final state of every demo slide, the colours of adjacent classes in a
// legend (rect[data-class="i"] of a component, i = 0, 1, …) are at least 3:1 apart (WCAG contrast ratio, measured as
// tools/test-contrast.mjs measures text), in each of Egatari Studio's themes (the demo is built once per theme).
//   node tools/test-classes.mjs [name …]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';

const S = await studio();
const THEMES = ['default', 'kokugo', 'business'];
const MIN = 3;
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => {
  const f = path.join(ROOT, 'components', n, 'index.js');
  return fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')) && fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('data-class');
});
const b = await S.browser.launch();
let fail = 0, seen = 0;
for (const name of names) for (const theme of THEMES) {
  const src = path.join(S.compDir(name), 'out', `classes-${theme}-src.html`), out = path.join(S.compDir(name), 'out', `classes-${theme}.html`);
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
    const rgb = (s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
    const lum = (c) => { const f = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (let i = 0; i < DECK.slides.length; i++) {
      const s = DECK.slides[i]; if (!s._comps.length) continue;
      DECK.seek(i, s._max, Infinity);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      s._comps.forEach((c, j) => {
        const sw = [...c.querySelectorAll('rect[data-class]')].sort((a, b) => +a.getAttribute('data-class') - +b.getAttribute('data-class'));
        const cols = sw.map((e) => rgb(getComputedStyle(e).fill));
        for (let k = 1; k < cols.length; k++) out.push({ slide: i, comp: j, a: k - 1, b: k, cr: +cr(cols[k - 1], cols[k]).toFixed(2), fill: getComputedStyle(sw[k]).fill });
      });
    }
    return out;
  });
  await p.close();
  seen += res.length;
  const low = res.filter((x) => x.cr < MIN);
  if (low.length) { fail++; console.log(`FAIL ${name} (${theme}):`); for (const x of low) console.log(`   s${x.slide} comp ${x.comp}: classes ${x.a}/${x.b} ${x.cr}:1 (${x.fill})`); }
  else console.log(`ok   ${name} (${theme}): ${res.length} adjacent pair(s), lowest ${res.length ? Math.min(...res.map((x) => x.cr)) : '-'}:1`);
}
await b.close();
if (!seen && names.length) { console.log('FAIL no legend classes found in the demos'); fail++; }
console.log(fail ? `\n${fail} demo build(s) with adjacent classes below ${MIN}:1` : 'test-classes: ok');
process.exit(fail ? 1 : 0);

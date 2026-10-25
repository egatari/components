// Choropleth classes (docs/map-design.md §5.4, as revised by the standards review of 2026-10-25). In the final state of every
// demo slide, and of a generated deck with 4 and 5 classes, in each of Egatari Studio's themes (default, kokugo, business):
//   - the legend's class colours (rect[data-class="i"], i = 0, 1, …) are evenly spaced in OKLab lightness, adjacent classes
//     at least 0.08 apart (and the spacings within 0.02 of each other);
//   - the lightest class is at least 3:1 against --bg, or it is outlined (its legend swatch and its regions on the map have a
//     stroke at least 3:1 against --bg);
//   - prefecture boundaries are always drawn (every choropleth region, g[data-class] path, has a stroke).
//   node tools/test-classes.mjs [name …]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';

const S = await studio();
const THEMES = ['default', 'kokugo', 'business'];
const DL = 0.08, EVEN = 0.02, CR = 3;
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => {
  const f = path.join(ROOT, 'components', n, 'index.js');
  return fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')) && fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('data-class');
});
// a deck with 4 and 5 classes for each component (made-up values; the component draws them from its README's data shape)
const extra = (name) => {
  const v = {}; for (let i = 1; i <= 47; i++) v[String(i).padStart(2, '0')] = (i * 37) % 100;
  const one = (cls) => `<m-${name} legend="架空" style="height:440px"><script type="application/json">${JSON.stringify({ classes: cls, values: v })}</script></m-${name}>`;
  return `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>階級</title></head>\n<body><div id="stage">\n` +
    `<section class="slide noconcl"><h2>4 階級</h2><div class="body">${one([0, 25, 50, 75])}</div></section>\n` +
    `<section class="slide noconcl"><h2>5 階級</h2><div class="body">${one([0, 20, 40, 60, 80])}</div></section>\n</div></body></html>\n`;
};
const b = await S.browser.launch();
let fail = 0, seen = 0;
for (const name of names) for (const theme of THEMES) for (const kind of ['demo', 'classes']) {
  const src = path.join(S.compDir(name), 'out', `classes-${kind}-${theme}-src.html`), out = path.join(S.compDir(name), 'out', `classes-${kind}-${theme}.html`);
  fs.mkdirSync(path.dirname(src), { recursive: true });
  const html = kind === 'demo' ? fs.readFileSync(path.join(S.compDir(name), 'demo.html'), 'utf8') : extra(name);
  fs.writeFileSync(src, html.replace(/(<html[^>]*\sdata-theme=")[^"]*"/, `$1${theme}"`));
  S.build(src, out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const warns = [];
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text()); });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const res = await p.evaluate(async () => {
    const out = [];
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
    const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const L = (c) => { const r = lin(c[0]), gg = lin(c[1]), bb = lin(c[2]); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * bb), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * bb), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * bb); return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s; };
    const bg = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff');
    for (let i = 0; i < DECK.slides.length; i++) {
      const s = DECK.slides[i]; if (!s._comps.length) continue;
      DECK.seek(i, s._max, Infinity);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      s._comps.forEach((c, j) => {
        const sw = [...c.querySelectorAll('rect[data-class]')].sort((a, b) => +a.getAttribute('data-class') - +b.getAttribute('data-class'));
        if (!sw.length) return;
        const fills = sw.map((e) => rgb(getComputedStyle(e).fill)), Ls = fills.map(L), dls = Ls.slice(1).map((x, k) => Ls[k] - x);
        const stroke = (e) => { const st = getComputedStyle(e).stroke; return !st || st === 'none' ? 0 : cr(rgb(st), bg); };
        const lightPaths = [...c.querySelectorAll('g[data-class="0"] path')];
        const regions = [...c.querySelectorAll('g[data-class] path')];
        out.push({ slide: i, comp: j, n: sw.length, Ls: Ls.map((x) => +x.toFixed(3)), dls: dls.map((x) => +x.toFixed(3)),
          lightCr: +cr(fills[0], bg).toFixed(2), lightSwatchStroke: +stroke(sw[0]).toFixed(2), lightPathStroke: lightPaths.length ? +Math.min(...lightPaths.map(stroke)).toFixed(2) : 0,
          unstroked: regions.filter((e) => { const st = getComputedStyle(e).stroke; return !st || st === 'none' || +getComputedStyle(e).strokeWidth === 0; }).length });
      });
    }
    return out;
  });
  await p.close();
  seen += res.length;
  const bad = [];
  for (const x of res) {
    const where = `${kind} s${x.slide} comp ${x.comp} (${x.n} classes, L ${x.Ls.join(' ')})`;
    if (x.n > 1 && Math.min(...x.dls) < DL) bad.push(`${where}: adjacent classes ΔL ${Math.min(...x.dls)} < ${DL}`);
    if (x.n > 2 && Math.max(...x.dls) - Math.min(...x.dls) > EVEN) bad.push(`${where}: uneven lightness steps ${x.dls.join(' ')}`);
    if (x.lightCr < CR && (x.lightSwatchStroke < CR || x.lightPathStroke < CR)) bad.push(`${where}: lightest class ${x.lightCr}:1 against --bg and not outlined (swatch stroke ${x.lightSwatchStroke}:1, regions ${x.lightPathStroke}:1)`);
    if (x.unstroked) bad.push(`${where}: ${x.unstroked} region(s) without a boundary`);
  }
  if (warns.length) bad.push(`console: ${warns.join(' | ')}`);
  if (bad.length) { fail++; console.log(`FAIL ${name} (${theme}, ${kind}):`); for (const x of bad) console.log('   ' + x); }
  else console.log(`ok   ${name} (${theme}, ${kind}): ${res.map((x) => `${x.n} classes ΔL ≥ ${Math.min(...x.dls)}`).join('; ')}`);
}
await b.close();
if (!seen && names.length) { console.log('FAIL no legend classes found'); fail++; }
console.log(fail ? `\n${fail} build(s) failed` : 'test-classes: ok');
process.exit(fail ? 1 : 0);

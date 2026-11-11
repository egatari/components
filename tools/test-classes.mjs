// Choropleth classes (docs/map-design.md §5.4, as revised by the standards review of 2026-10-25). In the final state of every
// demo slide, and of a generated deck with 4 and 5 classes, in each of Egatari Studio's themes (default, kokugo, business):
//   - the legend's class colours (rect[data-class="i"], i = 0, 1, …) are evenly spaced in OKLab lightness, adjacent classes
//     at least 0.08 apart (and the spacings within 0.02 of each other);
//   - the lightest class is at least 3:1 against --bg, or it is outlined (its legend swatch and its regions on the map have a
//     stroke at least 3:1 against --bg);
//   - prefecture boundaries are always drawn (every choropleth region, g[data-class] path, has a stroke);
//   - colour ramps (spec §8.4): without ramps each class paints the same 8-bit sRGB as its 2.0 colour (the fallback inside
//     var(--ramp-k, …)); in 'default+ramp' (default plus --ramp-1…5) class i paints the ramp at i/(n−1) (±1.5 of the oklab mix
//     of the neighbouring stops), lightness and evenness being the theme's (not checked there). Regions paint as their swatch.
//   node tools/test-classes.mjs [name …]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';

const S = await studio();
const THEMES = ['default', 'kokugo', 'business', 'default+ramp'];
const RAMP = ['#f7f3e3', '#f4c56a', '#e07b39', '#8e3b46', '#2b2350'];
const RAMP_CSS = `<style>:root{${RAMP.map((c, i) => `--ramp-${i + 1}:${c}`).join(';')}}</style>`;
const DL = 0.08, EVEN = 0.02, CR = 3;
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => {
  const f = path.join(ROOT, 'components', n, 'index.js');
  return fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')) && fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('data-class');
});
// a deck with 4 and 5 classes for each component (made-up values; the component draws them from its README's data shape)
const extra = (name) => {
  // m-map-japan: the 47 prefectures; m-map-world: 47 countries
  const WORLD = 'JPN CHN KOR IND IDN AUS NZL USA CAN MEX BRA ARG CHL PER COL GBR FRA DEU ITA ESP POL UKR RUS TUR IRN SAU EGY NGA ZAF KEN ETH DZA MAR VNM THA PHL MYS PAK KAZ MNG SWE NOR FIN GRL VEN BOL MDG'.split(' ');
  const v = {}; for (let i = 1; i <= 47; i++) v[name === 'map-world' ? WORLD[i - 1] : String(i).padStart(2, '0')] = (i * 37) % 100;
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
  const themed = html.replace(/(<html[^>]*\sdata-theme=")[^"]*"/, `$1${theme.replace('+ramp', '')}"`);
  fs.writeFileSync(src, theme.endsWith('+ramp') ? themed.replace('</head>', RAMP_CSS + '</head>') : themed);
  S.build(src, out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const warns = [];
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text()); });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const res = await p.evaluate(async (RAMP) => {
    const out = [];
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
    const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const L = (c) => { const r = lin(c[0]), gg = lin(c[1]), bb = lin(c[2]); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * bb), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * bb), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * bb); return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s; };
    const bg = rgb(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff');
    const unramp = (s) => { const m = /var\(--ramp-\d, /.exec(s); if (!m) return s; let d = 0; for (let j = m.index + m[0].length; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { if (d === 0) return s.slice(m.index + m[0].length, j); d--; } } return s; };
    const fillOf = (e) => ((e.getAttribute('style') || '').match(/(?:^|;)\s*fill:\s*([^;]*)/) || [])[1] || e.getAttribute('fill') || '';
    const paintIn = (host, css) => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('style', 'fill:' + css); host.appendChild(r); const v = rgb(getComputedStyle(r).fill); r.remove(); return v; };
    const toLab = (c) => { const r = lin(c[0]), gg = lin(c[1]), bb = lin(c[2]); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * bb), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * bb), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * bb); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]; };
    const fromLab = (o) => { const l = Math.pow(o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2], 3), m = Math.pow(o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2], 3), s = Math.pow(o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2], 3); const f = (x) => { x = Math.max(0, Math.min(1, x)); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); }; return [f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), f(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)]; };
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rampAt = (t) => { const x = Math.max(0, Math.min(1, t)) * 4, k = Math.min(3, Math.floor(x + 1e-9)), w = 1 - (x - k), a = toLab(hex(RAMP[k])), b2 = toLab(hex(RAMP[k + 1])); return fromLab([0, 1, 2].map((i) => b2[i] + (a[i] - b2[i]) * w)); };
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
        const svg = c.querySelector('svg');
        const sameAsOld = fills.filter((f, k) => f.join() === paintIn(svg, unramp(fillOf(sw[k]))).join()).length;
        const ramped = sw.filter((e) => /--ramp-/.test(fillOf(e))).length;
        const rampOff = fills.map((f, k) => { const w = rampAt(sw.length > 1 ? k / (sw.length - 1) : 1); return Math.max(...f.map((v, i) => Math.abs(v - w[i]))); });
        const regionOff = regions.filter((e) => { const k = +e.closest('g[data-class]').getAttribute('data-class'); return rgb(getComputedStyle(e).fill).join() !== fills[k].join(); }).length;
        out.push({ slide: i, comp: j, n: sw.length, Ls: Ls.map((x) => +x.toFixed(3)), dls: dls.map((x) => +x.toFixed(3)),
          lightCr: +cr(fills[0], bg).toFixed(2), lightSwatchStroke: +stroke(sw[0]).toFixed(2), lightPathStroke: lightPaths.length ? +Math.min(...lightPaths.map(stroke)).toFixed(2) : 0,
          sameAsOld, ramped, rampOff: +Math.max(...rampOff).toFixed(2), regionOff,
          unstroked: regions.filter((e) => { const st = getComputedStyle(e).stroke; return !st || st === 'none' || +getComputedStyle(e).strokeWidth === 0; }).length });
      });
    }
    return out;
  }, RAMP);
  await p.close();
  seen += res.length;
  const bad = [];
  for (const x of res) {
    const where = `${kind} s${x.slide} comp ${x.comp} (${x.n} classes, L ${x.Ls.join(' ')})`;
    const R = theme.endsWith('+ramp');
    if (!R && x.sameAsOld !== x.n) bad.push(`${where}: ${x.n - x.sameAsOld} class(es) paint differently from the 2.0 colour without ramps`);
    if (R && x.n > 1 && (x.ramped !== x.n || x.rampOff > 1.5)) bad.push(`${where}: classes not on the ramp (${x.ramped} of ${x.n} use it, off by ${x.rampOff})`);
    if (x.regionOff) bad.push(`${where}: ${x.regionOff} region(s) paint differently from their legend swatch`);
    if (R) { if (x.unstroked) bad.push(`${where}: ${x.unstroked} region(s) without a boundary`); continue; }
    if (x.n > 1 && Math.min(...x.dls) < DL) bad.push(`${where}: adjacent classes ΔL ${Math.min(...x.dls)} < ${DL}`);
    if (x.n > 2 && Math.max(...x.dls) - Math.min(...x.dls) > EVEN) bad.push(`${where}: uneven lightness steps ${x.dls.join(' ')}`);
    if (x.lightCr < CR && (x.lightSwatchStroke < CR || x.lightPathStroke < CR)) bad.push(`${where}: lightest class ${x.lightCr}:1 against --bg and not outlined (swatch stroke ${x.lightSwatchStroke}:1, regions ${x.lightPathStroke}:1)`);
    if (x.unstroked) bad.push(`${where}: ${x.unstroked} region(s) without a boundary`);
  }
  if (warns.length) bad.push(`console: ${warns.join(' | ')}`);
  if (bad.length) { fail++; console.log(`FAIL ${name} (${theme}, ${kind}):`); for (const x of bad) console.log('   ' + x); }
  else console.log(`ok   ${name} (${theme}, ${kind}): ${res.map((x) => theme.endsWith('+ramp') ? `${x.n} classes on the ramp (±${x.rampOff})` : `${x.n} classes ΔL ≥ ${Math.min(...x.dls)}, ${x.sameAsOld} same as 2.0`).join('; ')}`);
}
await b.close();
if (!seen && names.length) { console.log('FAIL no legend classes found'); fail++; }
console.log(fail ? `\n${fail} build(s) failed` : 'test-classes: ok');
process.exit(fail ? 1 : 0);

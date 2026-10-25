// m-map-japan in small boxes (300 px and 240 px high, and a narrow column), built with the pinned Egatari Studio.
// At every step (mid-step and end) and in the final state:
//   1. no console error (warnings are allowed: a piece that does not fit is dropped with a warning)
//   2. no negative or NaN size (width, height, r, rx, ry, font-size, stroke-width) and no NaN in any attribute
//   3. nothing drawn outside the element
//   4. text ≥ 24 px (except text marked data-annot)
//   5. the territory names of the drawn islands (竹島, 尖閣諸島; 沖ノ鳥島 and 南鳥島 are drawn only with islands="all" or layout="true",
//      tools/test-map-territory.mjs) are written, or a warning names the missing one
// Also the m-bars of the nightly deck that logged "<rect> attribute height: A negative value" (2026-10-25, japan-population):
// orient="h" with no height, so the element is 0 px high; it must warn instead and keep every size ≥ 0.
//   node tools/test-map-small.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-map-small-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const POINTS = { points: [
  { lon: 141.35, lat: 43.06, label: '札幌', step: 1 }, { lon: 139.69, lat: 35.68, label: '東京', step: 1 },
  { lon: 139.64, lat: 35.44, label: '横浜', step: 1 }, { lon: 136.91, lat: 35.18, label: '名古屋', step: 2 },
  { lon: 135.50, lat: 34.69, label: '大阪', step: 2 }, { lon: 130.40, lat: 33.59, label: '福岡', step: 2 }] };
const CHORO = { values: { 13: 1405, 14: 924, 27: 884, 23: 754, 11: 734, 12: 628, 28: 547, '01': 522, 40: 514, 31: 55, 47: 147 },
  classes: [0, 100, 300, 500, 800], regions: [{ id: '13', label: '東京', step: 2 }, { id: '27', label: '大阪', step: 2 }] };
const CASES = [
  ['points', '', POINTS],
  ['points, labels="none"', 'labels="none"', POINTS],
  ['choropleth + legend', 'legend="人口" unit="万人" show="value"', CHORO],
  ['choropleth + legend, labels="none"', 'labels="none" legend="人口" unit="万人"', CHORO],
];
const SIZES = [['300 px', 'height:300px'], ['240 px', 'height:240px'], ['300 px × 420 px', 'height:300px;width:420px']];
const slides = [];
for (const [sz, style] of SIZES) for (const [what, attrs, data] of CASES)
  slides.push({ name: `${what}, ${sz}`, html: `<section class="slide">\n  <h2>地図（${what}、${sz}）</h2>\n  <div class="body">\n    <m-map-japan ${attrs} style="${style}">\n      <script type="application/json">${JSON.stringify(data)}</script>\n    </m-map-japan>\n  </div>\n</section>` });
slides.push({ name: 'm-bars without a height (nightly 2026-10-25)', bars: true, html: `<section class="slide">\n  <h2>人口の多い順</h2>\n  <div class="body">\n    <m-bars orient="h" max="1500" unit="万人" per-step="2">\n      <script type="application/json">${JSON.stringify({ series: [{ label: '人口' }], groups: [['東京都', 1405], ['神奈川県', 924], ['大阪府', 884], ['愛知県', 754], ['埼玉県', 734], ['千葉県', 628]].map(([label, value], i) => ({ label, value, step: (i >> 1) + 1 })) })}</script>\n    </m-bars>\n  </div>\n</section>` });
const src = path.join(work, 'map-small.html'), out = path.join(work, 'map-small.out.html');
fs.writeFileSync(src, `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head>\n<meta charset="utf-8">\n<title>m-map-japan small</title>\n</head>\n<body>\n<div id="stage">\n${slides.map((s) => s.html).join('\n')}\n</div>\n</body>\n</html>\n`);
S.build(src, out);

const NAMES = ['竹島', '尖閣諸島'];
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < slides.length; i++) {
    const bad = await page.evaluate((i) => {
      const c = DECK.slides[i]._comps[0], max = DECK.slides[i]._max, bad = [];
      const SIZE = ['width', 'height', 'r', 'rx', 'ry', 'font-size', 'stroke-width'];
      const shown = (e) => { for (let q = e; q && q !== c; q = q.parentNode) if (q.getAttribute && (q.getAttribute('opacity') === '0' || +q.getAttribute('opacity') === 0 && q.hasAttribute('opacity'))) return false; return true; };
      const check = (when) => {
        const cr = c.getBoundingClientRect();
        for (const e of c.querySelectorAll('svg, svg *')) {
          for (const a of e.getAttributeNames()) {
            const v = e.getAttribute(a);
            if (/NaN|Infinity/.test(v)) bad.push(`${when}: <${e.localName}> ${a}="${v.slice(0, 40)}"`);
            if (SIZE.includes(a) && v !== '' && !/%$/.test(v) && !(parseFloat(v) >= 0)) bad.push(`${when}: <${e.localName}> ${a}="${v}" is negative`);
          }
          if (e.localName === 'text' && !e.closest('[data-annot]') && !(parseFloat(e.getAttribute('font-size') || getComputedStyle(e).fontSize) >= 24))
            bad.push(`${when}: text "${e.textContent}" is smaller than 24 px`);
          if (e.localName === 'svg' || e.localName === 'g' || !shown(e) || c.localName !== 'm-map-japan') continue;
          const r = e.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          if (r.left < cr.left - 1 || r.top < cr.top - 1 || r.right > cr.right + 1 || r.bottom > cr.bottom + 1)
            bad.push(`${when}: <${e.localName}> ${e.textContent ? '"' + e.textContent + '" ' : ''}outside the element (${[r.left - cr.left, r.top - cr.top, r.right - cr.right, r.bottom - cr.bottom].map((x) => x.toFixed(1)).join(', ')})`);
        }
      };
      for (let k = 0; k <= max; k++) for (const t of [0.35, 0.7, Infinity]) { if (k === 0 && t !== Infinity) continue; DECK.seek(i, k, t); check(`step ${k} t=${t}`); }
      const names = [...c.querySelectorAll('text')].filter(shown).map((e) => e.textContent);
      return { bad: [...new Set(bad)], names, dropped: c.dropped || [] };
    }, i);
    ok(bad.bad.length === 0, `${slides[i].name}: sizes ≥ 0, no NaN, inside the element, text ≥ 24 px` + (bad.bad.length ? ': ' + bad.bad.slice(0, 4).join('; ') : ''));
    if (slides[i].bars) { ok(warnings.some((w) => w.startsWith('m-bars:')), `${slides[i].name}: warns that the element is too small`); continue; }
    const missing = NAMES.filter((n) => !bad.names.includes(n));
    const unwarned = missing.filter((n) => !warnings.some((w) => w.includes(n)));
    ok(unwarned.length === 0, `${slides[i].name}: territory names ${missing.length ? 'missing (' + missing.join('、') + ') ' + (unwarned.length ? 'without a warning' : 'with a warning') : 'all written'}`);
  }
  ok(errors.length === 0, 'no console error' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  if (warnings.length) console.log('     warnings: ' + [...new Set(warnings)].join(' | '));
  await page.close();
} finally {
  await browser.close();
}
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK: m-map-japan in small boxes');

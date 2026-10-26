// m-map-world: the Japanese government's position (docs/map-design.md §4.5), the names (§4.8) and small sizes, built with the
// pinned Egatari Studio.
//   - names: the embedded list equals tools/map/atlas-names.csv (ATLAS_name for every ADM0_A3), and the 13 names that differ
//     from Natural Earth's NAME_JA are the atlas names (台湾, 北朝鮮, 中国, 韓国, …), never NAME_JA, in labels and the readable layer
//   - at heights 200–700 px × widths 300–1184 px, labels focus / none, step 0 and the final state:
//       北方領土 (択捉島・国後島・色丹島・志発島) lie in the drawn land of Japan (path[data-mark="JPN"]), inside the element;
//       竹島・尖閣諸島・沖ノ鳥島・南鳥島 are drawn as dots of Japan; 帰属未定地 (豊原・得撫島・占守島) lies in the XUD path,
//       which is filled with --bg, and in no coloured path even when Russia is coloured; the four dashed boundary lines are drawn;
//       the readable layer lists the territories once each
//   - coloured Japan colours the Northern Territories and the island dots; coloured China colours Taiwan the same; values colour
//     Taiwan by its own value; XUD in regions / values is refused with a warning
//   - small elements (240 / 300 px high, 420 px wide; points, values with a legend, flows): no console error, no negative or NaN
//     size, nothing outside the element, text ≥ 24 px
//   - a flow whose short way crosses the seam (30°W) warns
//   node tools/test-map-world.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio } from './studio.mjs';

let fails = 0, oks = 0;
const ok = (cond, msg) => { if (cond) oks++; else { console.log('FAIL ' + msg); fails++; } };

// ---- names (no browser)
const js = fs.readFileSync(path.join(ROOT, 'components', 'map-world', 'index.js'), 'utf8');
const blk = js.slice(js.indexOf('var MAP = {'), js.indexOf('// ---- END map-world-data'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(blk, ctx);
const LIST = Object.fromEntries(ctx.MAP.list.map((c) => [c[0], c[2]]));
const csv = fs.readFileSync(path.join(ROOT, 'tools', 'map', 'atlas-names.csv'), 'utf8').replace(/\r\n?/g, '\n').trim().split('\n');
const parse = (line) => { const out = []; let f = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { out.push(f); f = ''; } else f += c; } out.push(f); return out; };
const head = parse(csv[0]), col = (n) => head.indexOf(n);
const TABLE = {}, NE = {};
for (const l of csv.slice(1)) { const r = parse(l); TABLE[r[col('ADM0_A3')]] = r[col('ATLAS_name')]; NE[r[col('ADM0_A3')]] = r[col('NE_NAME_JA')]; }
for (const [id, name] of Object.entries(LIST)) ok(id === 'XUD' ? name === '' : TABLE[id] === name, `names: ${id} is "${name}", atlas-names.csv has "${TABLE[id]}"`);
ok(Object.keys(LIST).length === Object.keys(TABLE).length, `names: ${Object.keys(LIST).length} features, the table has ${Object.keys(TABLE).length} rows`);
const RENAMED = { CHN: '中国', KOR: '韓国', PRK: '北朝鮮', TWN: '台湾', HKG: 'ホンコン', MNG: 'モンゴル', THA: 'タイ', MLI: 'マリ', CAF: '中央アフリカ', KOS: 'コソボ',
  KNA: 'セントクリストファー・ネービス', VCT: 'セントビンセント・グレナディーン諸島', PGA: 'スプラトリー諸島',
  VGB: 'イギリス領バージン諸島', VIR: 'アメリカ領バージン諸島' };
for (const [id, n] of Object.entries(LIST)) ok(!/ヴ/.test(n), `names: ${id} ${n} has ヴ (write it with バ行, as the atlases do)`);
const differ = Object.keys(LIST).filter((id) => id !== 'XUD' && LIST[id] !== NE[id]).sort();
ok(JSON.stringify(differ) === JSON.stringify(Object.keys(RENAMED).sort()), `names: the names that differ from NAME_JA are ${differ.join(', ')}`);
for (const [id, n] of Object.entries(RENAMED)) ok(LIST[id] === n, `names: ${id} is ${LIST[id]}, expected ${n}`);
for (const [id, n] of Object.entries({ USA: 'アメリカ合衆国', GBR: 'イギリス', RUS: 'ロシア', JPN: '日本', ATA: '南極大陸' })) ok(LIST[id] === n, `names: ${id} is ${LIST[id]}, expected ${n}`);

// ---- the maps
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-map-world-')));
fs.mkdirSync(work, { recursive: true });
const HEIGHTS = [200, 260, 320, 440, 560, 700], WIDTHS = [300, 420, 640, 900, 1184];
const COLOURED = { regions: [{ id: 'JPN', tone: 'emph', step: 1 }, { id: 'RUS', tone: 'series-2', step: 2 }, { id: 'CHN', tone: 'series-3', step: 2 }] };
const cases = [];
for (const h of HEIGHTS) for (const w of WIDTHS) for (const labels of ['focus', 'none'])
  cases.push({ kind: 'grid', name: `${w}×${h}, labels=${labels}`, attrs: `labels="${labels}"`, style: `width:${w}px;height:${h}px`, data: COLOURED });
cases.push({ kind: 'grid', name: 'graticule, 1184×440', attrs: 'grid="graticule"', style: 'height:440px', data: COLOURED });
cases.push({ kind: 'names', name: 'names in labels and the readable layer', attrs: 'labels="all"', style: 'height:600px',
  data: { regions: ['CHN', 'TWN', 'KOR', 'PRK', 'MNG', 'THA', 'USA', 'GBR'].map((id) => ({ id, step: 1 })) } });
cases.push({ kind: 'taiwan-regions', name: 'China coloured as a country', attrs: '', style: 'height:440px', data: { regions: [{ id: 'CHN', tone: 'emph' }] } });
cases.push({ kind: 'taiwan-categories', name: 'China in a category', attrs: '', style: 'height:440px', data: { categories: [{ label: '区分', ids: ['CHN', 'JPN'] }] } });
cases.push({ kind: 'taiwan-values', name: 'values for China and Taiwan', attrs: 'legend="架空"', style: 'height:440px', data: { values: { CHN: 10, TWN: 50, RUS: 30 }, classes: [0, 20, 40] } });
cases.push({ kind: 'xud', name: 'XUD in regions and values', attrs: '', style: 'height:440px', data: { regions: [{ id: 'XUD' }], values: { XUD: 5, JPN: 7 } } });
// overseas parts by geography: each region coloured alone; places on a continent are coloured iff the region is theirs
const GROUPS = ['asia', 'europe', 'africa', 'north-america', 'south-america', 'oceania'];
for (const g of GROUPS) cases.push({ kind: 'group', group: g, name: `region ${g} alone`, attrs: '', style: 'height:600px', data: { regions: [{ group: g, tone: 'emph' }] } });
cases.push({ kind: 'antarctica', name: 'Antarctica named with labels="all"', attrs: 'labels="all"', style: 'height:600px', data: {} });
cases.push({ kind: 'seam', name: 'a flow across the seam', attrs: '', style: 'height:440px', data: { flows: [{ from: [-74.0, 40.7], to: [-0.13, 51.5] }] } });
const SMALL = [
  ['points', '', { points: [{ lon: 139.69, lat: 35.69, label: '東京', step: 1 }, { lon: -0.13, lat: 51.51, label: 'ロンドン', step: 1 }, { lon: -74.0, lat: 40.7, label: 'ニューヨーク', step: 2 }, { lon: 151.21, lat: -33.87, label: 'シドニー', step: 2 }] }],
  ['values + legend', 'legend="架空" unit="点" show="value"', { values: { JPN: 72, CHN: 48, USA: 75, BRA: 36, AUS: 64, RUS: 38, IND: 18, ZAF: 29 }, classes: [0, 20, 40, 60], regions: [{ id: 'JPN', step: 2 }] }],
  ['flows + equator', 'grid="equator" labels="none"', { points: [{ lon: 139.69, lat: 35.69, label: '東京' }], flows: [{ from: [139.69, 35.69], to: [103.82, 1.35], label: '矢印', step: 1 }, { from: 'JPN', to: 'AUS', step: 2 }] }],
  ['categories', 'legend="区分"', { categories: [{ label: '区分 A', ids: ['asia'], step: 1 }, { label: '区分 B', ids: ['africa', 'EGY'], step: 2 }] }],
];
for (const [sz, style] of [['300 px', 'height:300px'], ['240 px', 'height:240px'], ['300 px × 420 px', 'height:300px;width:420px'], ['200 px × 300 px', 'height:200px;width:300px']])
  for (const [what, attrs, data] of SMALL) cases.push({ kind: 'small', name: `${what}, ${sz}`, attrs, style, data });

const src = path.join(work, 'map-world.html'), out = path.join(work, 'map-world.out.html');
fs.writeFileSync(src, `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head>\n<meta charset="utf-8">\n<title>m-map-world</title>\n</head>\n<body>\n<div id="stage">\n${cases.map((c, i) =>
  `<section class="slide">\n  <h2>地図 ${i + 1}</h2>\n  <div class="body">\n    <m-map-world ${c.attrs} style="${c.style}">\n      <script type="application/json">${JSON.stringify(c.data)}</script>\n    </m-map-world>\n  </div>\n</section>`).join('\n')}\n</div>\n</body>\n</html>\n`);
S.build(src, out);

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = await page.evaluate((i) => {
      const sl = DECK.slides[i], el = sl._comps[0], max = sl._max;
      const shown = (e) => { for (let q = e; q && q !== el; q = q.parentNode) if (q.getAttribute && q.hasAttribute('opacity') && !(+q.getAttribute('opacity') > 0)) return false; return true; };
      const svg = el.querySelector('svg');
      const inBox = (x, y) => { const cr = el.getBoundingClientRect(), sv = svg.getBoundingClientRect(); return sv.left + x >= cr.left - 0.5 && sv.left + x <= cr.right + 0.5 && sv.top + y >= cr.top - 0.5 && sv.top + y <= cr.bottom + 0.5; };
      const fillOf = (e) => getComputedStyle(e).fill;
      const HOPPO = { 択捉島: [147.9, 45.0], 国後島: [145.9, 44.1], 色丹島: [146.75, 43.8], 志発島: [146.17, 43.52] };
      const XUD = { 豊原: [142.73, 46.96], 得撫島: [150.0, 45.9], 占守島: [156.3, 50.75] };
      const bg = getComputedStyle(el).getPropertyValue('--bg').trim();
      const probeBg = document.createElement('div'); probeBg.style.color = bg; el.appendChild(probeBg); const bgRgb = getComputedStyle(probeBg).color; probeBg.remove();
      // the coloured paths (anything filled, other than the base land, the XUD path and the lines)
      const coloured = () => [...svg.querySelectorAll('path')].filter((p) => !p.hasAttribute('data-mark') && fillOf(p) !== 'none' && shown(p) && +getComputedStyle(p).fillOpacity > 0);
      const state = (when) => {
        const drawn = new Set(), bad = [];
        const jp = [...svg.querySelectorAll('path[data-mark="JPN"]')];
        const hp = Object.entries(HOPPO).filter(([n, [lon, lat]]) => { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); const k = inBox(p[0], p[1]) && jp.some((h) => shown(h) && h.isPointInFill(pt)); if (!k) bad.push(`${when}: ${n} is not in the land of Japan`); return k; });
        if (hp.length === 4) drawn.add('北方領土');
        for (const d of svg.querySelectorAll('circle[data-territory]')) if (shown(d) && inBox(+d.getAttribute('cx'), +d.getAttribute('cy'))) drawn.add(d.getAttribute('data-territory'));
        const xp = svg.querySelector('path[data-mark="XUD"]');
        const xudIn = xp && Object.entries(XUD).every(([n, [lon, lat]]) => { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); const k = shown(xp) && xp.isPointInFill(pt) && inBox(p[0], p[1]); if (!k) bad.push(`${when}: ${n} is not in the XUD path`); return k; });
        if (xudIn && fillOf(xp) === bgRgb) drawn.add('帰属未定地'); else if (xp) bad.push(`${when}: the XUD path is filled ${fillOf(xp)}, not --bg ${bgRgb}`);
        for (const [n, [lon, lat]] of Object.entries(XUD)) { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); for (const q of coloured()) if (q.isPointInFill(pt)) bad.push(`${when}: ${n} (帰属未定地) is in a coloured path (${fillOf(q)})`); }
        for (const [n, [lon, lat]] of Object.entries(XUD)) { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); for (const q of svg.querySelectorAll('path[data-mark="RUS"]')) if (q.isPointInFill(pt)) bad.push(`${when}: ${n} is in the land of Russia`); }
        const lines = [...svg.querySelectorAll('path[data-boundary]')].filter((p) => shown(p) && p.getAttribute('stroke-dasharray'));
        if (lines.length !== 4) bad.push(`${when}: ${lines.length} dashed boundary lines of 帰属未定地, expected 4`);
        for (const l of lines) { const n = (l.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number); if (!inBox(n[0], n[1]) || !inBox(n[2], n[3])) bad.push(`${when}: a boundary line is outside the element`); }
        // the colour of a point's coloured path (the topmost)
        const colourAt = (lon, lat) => { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); const hit = coloured().filter((q) => q.isPointInFill(pt)); return hit.length ? fillOf(hit[hit.length - 1]) : null; };
        const dotFill = Object.fromEntries([...svg.querySelectorAll('g circle')].filter((d) => shown(d) && d.closest('g') !== svg.firstChild).map((d) => [`${d.getAttribute('cx')},${d.getAttribute('cy')}`, fillOf(d)]));
        const texts = [...svg.querySelectorAll('text')].filter(shown).map((t) => t.textContent);
        const PLACES = { パリ: [2.35, 48.86, 'europe'], マドリード: [-3.7, 40.4, 'europe'], フランス領ギアナ: [-53.0, 4.0, 'south-america'], レユニオン: [55.5, -21.1, 'africa'],
          'カナリア諸島（フエルテベントゥラ島）': [-13.95, 28.55, 'africa'], ハワイ島: [-155.5, 19.6, 'north-america'], アラスカ: [-150, 64, 'north-america'], ヌーク付近: [-45, 66, 'north-america'],
          グリーンランド東部: [-25, 74, 'north-america'], 東京: [139.5, 36.0, 'asia'], シドニー: [146, -33, 'oceania'], ニューカレドニア: [165.5, -21.4, 'oceania'],
          モスクワ: [37.6, 55.75, 'europe'], ウラジオストク付近: [133, 45, 'europe'], カイロ: [31.2, 29.5, 'africa'], ブラジリア: [-47.9, -15.8, 'south-america'],
          スバールバル諸島: [16, 78.6, 'europe'], 南極大陸: [150, -80, ''], '南極大陸（西）': [-60, -82, ''] };
        const places = Object.fromEntries(Object.entries(PLACES).map(([n, [lon, lat, g]]) => [n, { g, c: (() => { const p = el.ll(lon, lat), pt = new DOMPoint(p[0], p[1]); return coloured().some((q) => q.isPointInFill(pt)); })() }]));
        return { places, drawn: [...drawn], bad, colour: { kunashiri: colourAt(145.9, 44.1), taipei: colourAt(121.0, 23.7), beijing: colourAt(116.4, 39.9), tokyo: colourAt(139.5, 36.0) }, texts, dots: dotFill };
      };
      DECK.seek(i, 0, Infinity);
      const s0 = state('step 0');
      DECK.seek(i, max, Infinity);
      const sN = state('final');
      const sr = [...el.querySelectorAll('.sr-only')].map((e) => e.textContent).join('；').split('；');
      // small-size checks: sizes, NaN, outside, text size, at every step (mid and end)
      const SIZE = ['width', 'height', 'r', 'rx', 'ry', 'font-size', 'stroke-width'], geo = [];
      const cr = el.getBoundingClientRect();
      for (let k = 0; k <= max; k++) for (const t of [0.35, Infinity]) {
        if (k === 0 && t !== Infinity) continue;
        DECK.seek(i, k, t);
        for (const e of el.querySelectorAll('svg, svg *')) {
          for (const a of e.getAttributeNames()) {
            const v = e.getAttribute(a);
            if (/NaN|Infinity/.test(v)) geo.push(`step ${k}: <${e.localName}> ${a}="${v.slice(0, 40)}"`);
            if (SIZE.includes(a) && v !== '' && !(parseFloat(v) >= 0)) geo.push(`step ${k}: <${e.localName}> ${a}="${v}" is negative`);
          }
          if (e.localName === 'text' && !(parseFloat(e.getAttribute('font-size')) >= 24)) geo.push(`text "${e.textContent}" is smaller than 24 px`);
          if (e.localName === 'svg' || e.localName === 'g' || !shown(e)) continue;
          const b = e.getBoundingClientRect();
          if (!b.width && !b.height) continue;
          if (b.left < cr.left - 1 || b.top < cr.top - 1 || b.right > cr.right + 1 || b.bottom > cr.bottom + 1) geo.push(`step ${k}: <${e.localName}> ${e.textContent ? '"' + e.textContent + '" ' : ''}outside the element`);
        }
      }
      return { s0, sN, sr, geo: [...new Set(geo)], size: [el.clientWidth, el.clientHeight] };
    }, i);
    const TERR = ['北方領土', '竹島', '尖閣諸島', '沖ノ鳥島', '南鳥島', '帰属未定地'];
    for (const [when, s] of [['step 0', r.s0], ['final', r.sN]]) {
      ok(s.bad.length === 0, `${c.name}: ${s.bad.slice(0, 4).join('; ')}`);
      for (const t of TERR) ok(s.drawn.includes(t), `${c.name} (${when}): ${t} is not drawn`);
    }
    for (const t of ['北方領土', '竹島', '尖閣諸島', '沖ノ鳥島', '南鳥島']) ok(r.sr.filter((x) => x.startsWith(t + '（')).length === 1, `${c.name}: the readable layer has not exactly one entry for ${t} (${r.sr.join('；')})`);
    ok(r.sr.filter((x) => x.startsWith('帰属未定地（')).length === 1, `${c.name}: the readable layer has no entry for 帰属未定地`);
    ok(r.geo.length === 0, `${c.name}: ${r.geo.slice(0, 4).join('; ')}`);
    if (c.kind === 'grid') {
      ok(r.sN.colour.kunashiri && r.sN.colour.kunashiri === r.sN.colour.tokyo, `${c.name}: 国後島 is coloured ${r.sN.colour.kunashiri}, 本州 ${r.sN.colour.tokyo}`);
      ok(r.sN.colour.taipei && r.sN.colour.taipei === r.sN.colour.beijing, `${c.name}: China is coloured but Taiwan is ${r.sN.colour.taipei} (China ${r.sN.colour.beijing})`);
      ok(!r.s0.colour.kunashiri, `${c.name}: Japan is coloured at step 0`);
    }
    if (c.kind === 'names') {
      for (const n of ['中国', '台湾', '韓国', '北朝鮮', 'モンゴル', 'タイ', 'アメリカ合衆国', 'イギリス']) ok(r.sr.includes(n), `names: the readable layer lacks ${n} (${r.sr.slice(0, 8).join('；')})`);
      const neNames = Object.keys(RENAMED).map((id) => NE[id]).concat(['中華人民共和国', '中華民国', '大韓民国', '朝鮮民主主義人民共和国', 'サハリン州']);
      for (const n of neNames) ok(!r.sN.texts.includes(n) && !r.sr.some((x) => x.includes(n)), `names: "${n}" is shown`);
      for (const n of ['中国', '韓国', 'アメリカ合衆国']) ok(r.sN.texts.includes(n), `names: "${n}" is not written on the map (${r.sN.texts.join(' ')})`);
    }
    if (c.kind === 'taiwan-regions' || c.kind === 'taiwan-categories') ok(r.sN.colour.taipei && r.sN.colour.taipei === r.sN.colour.beijing, `${c.name}: Taiwan ${r.sN.colour.taipei}, China ${r.sN.colour.beijing}`);
    if (c.kind === 'taiwan-values') ok(r.sN.colour.taipei && r.sN.colour.beijing && r.sN.colour.taipei !== r.sN.colour.beijing, `${c.name}: Taiwan ${r.sN.colour.taipei} should differ from China ${r.sN.colour.beijing}`);
    if (c.kind === 'group') {
      for (const [n, x] of Object.entries(r.sN.places)) ok(x.c === (x.g === c.group), `${c.name}: ${n} (${x.g || 'no region'}) is ${x.c ? '' : 'not '}coloured`);
      if (c.group === 'south-america') ok(r.sr.some((x) => x.startsWith('南アメリカ州（') && x.includes('フランス領ギアナ')), `${c.name}: the readable layer does not list フランス領ギアナ`);
    }
    if (c.kind === 'antarctica') ok(r.sN.texts.includes('南極大陸'), `${c.name}: 南極大陸 is not written (${r.sN.texts.length} names)`);
    if (c.kind === 'xud') ok(warnings.some((w) => w.includes('XUD (帰属未定地)')), `${c.name}: no warning`);
    if (c.kind === 'seam') ok(warnings.some((w) => w.includes('30°W')), `${c.name}: no warning about the seam`);
  }
  ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));
  const left = [...new Set(warnings.filter((w) => /too small|no room/.test(w)))];
  console.log(`     warnings about room (small elements): ${left.length}`);
  await page.close();
} finally {
  await browser.close();
}
console.log(`${cases.length} maps, ${oks} checks passed`);
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('OK: m-map-world territories, names and small sizes');

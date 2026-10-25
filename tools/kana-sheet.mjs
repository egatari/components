// Builds the printable review sheet for data/kana/kana.json (A4, for a 書写 teacher).
//   node tools/kana-sheet.mjs            write data/kana/review-sheet.html
//   node tools/kana-sheet.mjs --pdf      also render data/kana/review-sheet.pdf (needs `node tools/studio.mjs` once)
//   node tools/kana-sheet.mjs --png DIR  also save each page as PNG into DIR (for checking the shapes)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './studio.mjs';
import { samplePath, pathLength, pointAt } from './kana-path.mjs';

const DIR = path.join(ROOT, 'data', 'kana');
const data = JSON.parse(fs.readFileSync(path.join(DIR, 'kana.json'), 'utf8'));
const END = { tome: 'とめ', hane: 'はね', harai: 'はらい' };
// Shades for strokes 1..n: they differ in lightness as well as hue; the numbers carry the order
const SHADE = ['#1d2a57', '#1f6f63', '#a4561c', '#7b3d86'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => Math.round(v * 10) / 10;
const CIRC = '①②③④⑤⑥';

function arrow(p, color) {
  // a small chevron on the stroke, pointing in the writing direction
  const s = 4.2, { x, y, dx, dy } = p, nx = -dy, ny = dx;
  const tip = [x + dx * s, y + dy * s], a = [x - dx * s + nx * s, y - dy * s + ny * s], b = [x - dx * s - nx * s, y - dy * s - ny * s];
  return `<path d="M${f1(a[0])} ${f1(a[1])} L${f1(tip[0])} ${f1(tip[1])} L${f1(b[0])} ${f1(b[1])}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M${f1(a[0])} ${f1(a[1])} L${f1(tip[0])} ${f1(tip[1])} L${f1(b[0])} ${f1(b[1])}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function cell(ch, c) {
  const strokes = c.strokes.map((s, i) => ({ ...s, i, color: SHADE[i % SHADE.length], pts: samplePath(s.d) }));
  let svg = '<rect x="0" y="0" width="100" height="100" fill="#fff" stroke="#999" stroke-width="0.6"/>'
    + '<path d="M50 0V100M0 50H100" stroke="#bbb" stroke-width="0.5" stroke-dasharray="2 2"/>';
  for (const s of strokes) svg += `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const s of strokes) {
    const L = pathLength(s.pts), fr = L > 110 ? [0.4, 0.78] : L > 30 ? [0.55] : [];
    for (const f of fr) svg += arrow(pointAt(s.pts, f), s.color);
  }
  // Numbers sit just before each start point (against the writing direction), moved round it when they would
  // cover another number (e.g. ウ・ロ・ワ, where two strokes start at the same corner)
  const placed = [];
  for (const s of strokes) {
    const [x0, y0] = s.pts[0], d = pointAt(s.pts, Math.min(1, 6 / pathLength(s.pts)));
    let best = null;
    for (const deg of [0, 45, -45, 90, -90, 135, -135, 180]) {
      const a = Math.atan2(-d.dy, -d.dx) + (deg * Math.PI) / 180, x = x0 + Math.cos(a) * 7.5, y = y0 + Math.sin(a) * 7.5;
      if (x < -1.5 || y < -1.5 || x > 101.5 || y > 101.5) continue;
      const clash = placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < 11);
      if (!clash) { best = [x, y]; break; }
      best ??= [x, y];
    }
    placed.push(best);
    const [x, y] = best;
    svg += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x0)}" y2="${f1(y0)}" stroke="${s.color}" stroke-width="0.8"/>`
      + `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.2" fill="${s.color}" stroke="#fff" stroke-width="0.8"/>`
      + `<text x="${f1(x)}" y="${f1(y + 2.5)}" text-anchor="middle" font-size="7.2" font-weight="700" fill="#fff">${s.i + 1}</text>`;
  }
  // small kana: drawn through their horizontal-writing placement (lower-left quarter), like the part shows them
  if (c.place) {
    const grid = svg.indexOf('/>', svg.indexOf('M50 0V100')) + 2;   // after the frame and the centre lines
    svg = svg.slice(0, grid) + `<g transform="matrix(${c.place.yoko.join(' ')})">` + svg.slice(grid) + '</g>';
  }
  const ends = strokes.map((s) => `${CIRC[s.i]}${END[s.end]}`).join(' ');
  const src = data.sources[c.source]?.label ?? c.source;
  return `<div class="cell${c.verified ? '' : ' unv'}">
  <div class="head"><span class="ch">${esc(ch)}</span><span class="cnt">${c.count}画</span></div>
  <svg viewBox="-8 -8 116 116" role="img" aria-label="${esc(ch)} ${c.count}画">${svg}</svg>
  <div class="ends">${ends}</div>
  <div class="src">よりどころ：${esc(src.replace(/^小学校国語（1年）で一般に指導される(.)仮名の筆順$/, '教科書の一般的な筆順'))}${c.verified ? '' : '（<b>未照合</b>）'}</div>
  ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
  <div class="chk">□ よい　□ 直す：</div>
</div>`;
}

// Basic kana by script, then the derived ones (濁音・半濁音, small kana and ー); each group starts a new page
const SMALL = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー]/u;
const DERIVED = (k, v) => v.base !== undefined || k === 'ー';
const groups = [
  ['ひらがな', ([k, v]) => /[ぁ-ゟ]/u.test(k) && !DERIVED(k, v)],
  ['カタカナ', ([k, v]) => /[゠-ヿ]/u.test(k) && !DERIVED(k, v)],
  ['濁音・半濁音', ([k, v]) => DERIVED(k, v) && !SMALL.test(k)],
  ['小書きの仮名・長音符', ([k]) => SMALL.test(k)],
];
let body = '';
groups.forEach(([name, test], i) => {
  const list = Object.entries(data.chars).filter(test);
  body += `<h2${i ? ' class="page"' : ''}>${name}（${list.length}字）</h2><div class="grid">${list.map(([k, v]) => cell(k, v)).join('\n')}</div>`;
});

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>仮名の筆順データ 確認表</title>
<style>
:root { --ink: #1a1a1a; --sub: #555; --line: #999; --bg: #fff; }
@page { size: A4; margin: 10mm 10mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; font-size: 9.5pt; line-height: 1.5; }
main { max-width: 190mm; margin: 0 auto; padding: 0 16px; }
@media print { main { padding: 0; } }
h1 { font-size: 15pt; margin: 0 0 2mm; }
h2 { font-size: 12pt; margin: 4mm 0 2mm; border-bottom: 1px solid var(--ink); break-after: avoid; }
h2.page { break-before: page; }
.lead p { margin: 0 0 1.5mm; }
.check { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 2mm 0; }
.check div { border: 1px solid var(--line); padding: 1.5mm 2mm; }
.check b { display: block; font-size: 10.5pt; }
.legend { font-size: 8.5pt; color: var(--sub); }
.legend svg { width: 9mm; height: 9mm; vertical-align: middle; }
.reviewer { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1.2px solid var(--ink); margin: 3mm 0; }
.reviewer div { border: 0.6px solid var(--line); padding: 1.5mm 2mm; min-height: 10mm; }
.reviewer .wide { grid-column: 1 / 3; min-height: 26mm; }
.reviewer span { font-size: 8.5pt; color: var(--sub); }
.src-list { font-size: 8pt; color: var(--sub); margin: 1mm 0 0; padding-left: 4mm; }
.grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm 1.6mm; }
@media (max-width: 600px) { .grid { grid-template-columns: repeat(3, 1fr); } .check { grid-template-columns: 1fr 1fr; } }
.cell { border: 0.6px solid #ccc; padding: 1mm; break-inside: avoid; font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif; }
.cell .head { display: flex; justify-content: space-between; align-items: baseline; }
.cell .ch { font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-size: 14pt; font-weight: 600; }
.cell .cnt { font-size: 9pt; font-weight: 700; }
.cell svg { display: block; width: 100%; height: auto; }
.cell svg text { font-family: "Hiragino Sans", "Yu Gothic", sans-serif; }
.cell .ends { font-size: 7pt; line-height: 1.35; }
.cell .src { font-size: 5.8pt; color: var(--sub); line-height: 1.3; }
.cell .note { font-size: 6pt; color: #8a1c1c; line-height: 1.3; }
.cell .chk { font-size: 7pt; border-top: 0.5px dashed #bbb; margin-top: 0.8mm; padding-top: 0.5mm; height: 7mm; }
</style></head><body><main>
<h1>仮名の筆順データ 確認表（${Object.keys(data.chars).length}字：基本の仮名92字、濁音・半濁音51字、小書きの仮名22字、ー）</h1>
<div class="lead">
<p>Egatari の部品（筆順を動かして見せる図）で使う、ひらがな・カタカナの筆順データの確認をお願いするための表です。字の線はフォントを写したものではなく、一画ずつ手で描いた中心線です（教科書体に近いフォント Klee One の字形に重なるよう、位置だけを目で合わせています）。書写の先生の目で、教科書の楷書の仮名として通用するかを見てください。</p>
<p>各字の枠の中の <b>丸の数字</b> が書き始めの位置と画の順、線の上の <b>小さな矢印（＞）</b> が書く向きです。画ごとに線の濃さと色味を変えていますが、順番は数字で読み取ってください。枠の下に、画ごとの終わり方（とめ・はね・はらい）を書いています。</p>
</div>
<div class="check">
<div><b>① 順</b>画の順番が教科書と同じか。</div>
<div><b>② 向き</b>書き始めの位置と、書く向き（矢印）が正しいか。</div>
<div><b>③ とめ・はね・はらい</b>枠の下の終わり方が正しいか。</div>
<div><b>④ 形</b>画の長さ・傾き・つながり・字の中での位置が、楷書の仮名として自然か。</div>
</div>
<p class="legend">直す字は、枠の下の「□ 直す」に印をつけ、余白に赤で書き込んでください。「<b>未照合</b>」は、筆順を特定の教科書の頁と一字ずつ照らし合わせていないことを示します（画数は公開の一覧と照合済み）。赤字の注記がある字は、作った側でも特に自信のない字です。</p>
<div class="reviewer">
<div><span>確認した人（お名前・所属）</span></div>
<div><span>確認した日</span></div>
<div class="wide"><span>全体へのご意見（字形の傾向、直してほしい点など）</span></div>
</div>
<p class="legend"><b>筆順・画数のよりどころ</b></p>
<ul class="src-list">
${Object.values(data.sources).map((s) => `<li>${esc(s.label)}：${esc(s.order)} ${esc(s.count)}</li>`).join('\n')}
${data.references.map((r) => `<li>${esc(r)}</li>`).join('\n')}
</ul>
${body}
<p class="legend">データ: data/kana/kana.json（version ${esc(data.version)}、MIT ライセンス）。座標は 0〜100 の正方形、y は下向き。</p>
</main></body></html>
`;
const out = path.join(DIR, 'review-sheet.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(ROOT, out));

const want = (f) => process.argv.includes(f);
if (want('--pdf') || want('--png')) {
  const { launch } = await import(pathToFileURL(path.join(ROOT, '.studio', 'kit', 'browser.mjs')).href);
  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(out).href);
  await page.evaluate(() => document.fonts.ready);
  if (want('--pdf')) {
    await page.pdf({ path: path.join(DIR, 'review-sheet.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log('wrote data/kana/review-sheet.pdf');
  }
  const i = process.argv.indexOf('--png');
  if (i > 0) {
    const dir = process.argv[i + 1];
    fs.mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: path.join(dir, 'sheet-full.png'), fullPage: true });
    console.log('wrote', path.join(dir, 'sheet-full.png'));
  }
  await browser.close();
}

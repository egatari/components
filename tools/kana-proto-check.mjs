// Checks the reveal of data/kana/proto.html in headless Chrome, and renders frames for review.
//   node tools/kana-proto-check.mjs OUTDIR [--frames] [--chars あいう] [--startcut 0]
// Needs `node tools/studio.mjs` once (for the browser).
//
// Per character (500 px; ink = dark pixels):
//   coverage  after the last stroke, the reveal against all outlines filled: missing (outline, not shown) and
//             excess (shown, not in an outline) pixels — anti-aliasing seams only
//   bleed     after k strokes (k = 1..n-1), pixels shown that are clearly outside the outlines of strokes 1..k
//             (0 by construction: each stroke is clipped by its own outline)
//   hidden    after k strokes, pixels clearly inside the outlines of strokes 1..k that do not show
//   fleck     just after a stroke starts (5% drawn): new pixels that lie behind the start of a piece's centreline
//             (more than 0.5 behind a line across it at its start: the round cap reaching back) or farther than
//             brush/2 + 1.5 from the drawn part of its centrelines
//   placement small kana through place.yoko / place.tate: the ink lies in the lower-left / upper-right quarter
// Writes OUTDIR/report.json; with --frames also frames after each stroke, a page per row group, GIFs and the
// small kana in vertical-writing placement.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';
import { sample, densify } from './kana-svgpath.mjs';

const args = process.argv.slice(2);
const OUT = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--chars', '--startcut'].includes(args[i - 1])) || 'kana-proto-out');
const FRAMES = args.includes('--frames');
const only = args.includes('--chars') ? args[args.indexOf('--chars') + 1] : null;
const STARTCUT = args.includes('--startcut') ? args[args.indexOf('--startcut') + 1] : '1';
fs.mkdirSync(OUT, { recursive: true });
const { launch, fileUrl } = await import(path.join(ROOT, '.studio', 'kit', 'browser.mjs'));

const kana = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'kana.json'), 'utf8')).chars;
const ofl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'strokes.ofl.json'), 'utf8'));
const chars = Object.entries(kana).filter(([ch]) => !only || only.includes(ch));
const PROTO = fileUrl(path.join(ROOT, 'data', 'kana', 'proto.html'));
const S = 500, U = S / 100, BR = ofl.brush;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
const dec = await browser.newPage();
async function open(pg) {
  await pg.goto(PROTO + '?ch=あ&startcut=' + STARTCUT);
  await pg.waitForFunction(() => document.body.dataset.ready === '1');
}
async function show(pg, q, file) {
  await pg.evaluate((o) => window.show(o), q);
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const w = pg.viewportSize().width;
  return pg.screenshot({ clip: { x: 0, y: 0, width: w, height: w }, ...(file ? { path: file } : {}) });
}
await open(page);
async function lum(png) {
  const b64 = await dec.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data, o = new Uint8Array(img.width * img.height);
    for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
    let s = ''; for (let i = 0; i < o.length; i += 8192) s += String.fromCharCode(...o.subarray(i, i + 8192));
    return btoa(s);
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}
const shot = async (q) => lum(await show(page, { grid: 0, guide: 0, place: 'none', ...q }));
// drawn part of a stroke at fraction f: each piece up to f * (longest piece's length), as points (0–100 units)
function drawnPoints(pieces, f) {
  const lines = pieces.map(([, c]) => densify(sample(c, 24), 0.3));
  const lens = lines.map((l) => (l.length - 1) * 0.3);
  const max = Math.max(...lens);
  return lines.flatMap((l) => l.slice(0, Math.max(1, Math.floor((f * max) / 0.3) + 1)));
}

const report = {}, placeFail = [];
for (const [ch, c] of chars) {
  const n = c.count, strokes = ofl.chars[ch];
  const OUTL = await shot({ ch, view: 'outline' });
  const Ks = [];
  for (let k = 1; k <= n; k++) Ks.push(await shot({ ch, view: 'ink', k }));
  let missing = 0, excess = 0, ink = 0;
  for (let p = 0; p < S * S; p++) {
    const o = OUTL[p] < 128, v = Ks[n - 1][p] < 128;
    if (o) ink++;
    if (o && !v) missing++;
    if (v && !o) excess++;
  }
  const bleed = [], hidden = [];
  for (let k = 1; k < n; k++) {
    const T = await shot({ ch, view: 'ideal', k });
    let b = 0, h = 0;
    for (let p = 0; p < S * S; p++) { const v = Ks[k - 1][p] < 128; if (v && T[p] > 200) b++; if (!v && T[p] < 60) h++; }
    bleed.push(b); hidden.push(h);
  }
  // fleck: the first 5% of each stroke
  const fleck = [];
  for (let i = 0; i < n; i++) {
    const before = i ? Ks[i - 1] : null, A = await shot({ ch, view: 'ink', k: i + 0.05 });
    const pts = drawnPoints(strokes[i], 0.05);
    const starts = strokes[i].map(([, cl]) => { const q = densify(sample(cl, 24), 0.3); const a = q[0], b = q[Math.min(4, q.length - 1)]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a, (b[0] - a[0]) / L, (b[1] - a[1]) / L]; });
    let cnt = 0;
    for (let p = 0; p < S * S; p++) {
      if (A[p] >= 128 || (before && before[p] < 128)) continue;
      const x = ((p % S) + 0.5) / U, y = (Math.floor(p / S) + 0.5) / U;
      let dmin = Infinity; for (const q of pts) { const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (dd < dmin) dmin = dd; }
      const behind = starts.some(([a, ux, uy]) => Math.hypot(x - a[0], y - a[1]) <= BR / 2 + 1 && (x - a[0]) * ux + (y - a[1]) * uy < -0.5);
      if (behind || Math.sqrt(dmin) > BR / 2 + 1.5) cnt++;
    }
    fleck.push(cnt);
  }
  const r = (report[ch] = { strokes: n, inkPx: ink, coverage: +(100 * (ink - missing) / ink).toFixed(2), missingPx: missing, excessPx: excess, bleedPx: bleed, hiddenPx: hidden, fleckPx: fleck });
  if (c.place) {
    r.place = {};
    for (const [mode, qx, qy] of [['yoko', 0, 50], ['tate', 50, 0]]) {
      const P = await shot({ ch, view: 'outline', place: mode });
      let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (let p = 0; p < S * S; p++) if (P[p] < 200) { const x = p % S, y = Math.floor(p / S); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const box = [x0 / U, y0 / U, (x1 + 1) / U, (y1 + 1) / U].map((v) => +v.toFixed(1));
      const inside = box[0] >= qx && box[2] <= qx + 50 && box[1] >= qy && box[3] <= qy + 50;
      r.place[mode] = { inkBox: box, inside };
      if (!inside) placeFail.push(`${ch} ${mode} ${JSON.stringify(box)}`);
    }
  }
  console.log(`${ch}  cover ${r.coverage}%  missing ${missing}  excess ${excess}  bleed ${JSON.stringify(bleed)}  hidden ${JSON.stringify(hidden)}  fleck ${JSON.stringify(fleck)}`);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const nPlaced = Object.values(report).filter((r) => r.place).length;
if (nPlaced) console.log(placeFail.length ? `placement: ${placeFail.length} outside their quarter: ${placeFail.join('; ')}` : `placement: all ${nPlaced} small kana inside their quarter (yoko lower-left, tate upper-right)`);

if (FRAMES) {
  const fdir = path.join(OUT, 'frames'); fs.mkdirSync(fdir, { recursive: true });
  const small = await browser.newPage({ viewport: { width: 240, height: 240 } });
  await open(small);
  await small.addStyleTag({ content: 'body.one svg { width: 240px !important; height: 240px !important; }' });
  const ff = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  const rows = [], tateRows = [];
  for (const [ch, c] of chars) {
    const n = c.count, files = [];
    for (let k = 1; k <= n; k++) { const f = path.join(fdir, `${ch}-${k}.png`); await show(page, { ch, k }, f); files.push(f); }
    rows.push([ch, n, files]);
    if (c.place) {
      const tf = [];
      for (let k = 1; k <= n; k++) { const f = path.join(fdir, `${ch}-tate-${k}.png`); await show(page, { ch, k, place: 'tate' }, f); tf.push(f); }
      tateRows.push([ch, n, tf]);
    }
    if (ff) {
      const adir = path.join(OUT, 'anim', ch); fs.mkdirSync(adir, { recursive: true });
      const ks = [];
      for (let s = 0; s < n; s++) { for (let t = 0; t < 1; t += 1 / 14) ks.push(s + t); for (let h = 0; h < 4; h++) ks.push(s + 1); }
      for (let h = 0; h < 12; h++) ks.push(n);
      let i = 0;
      for (const k of ks) await show(small, { ch, k }, path.join(adir, String(i++).padStart(4, '0') + '.png'));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(adir, '%04d.png'),
        '-vf', 'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse', path.join(OUT, `anim-${ch}.gif`)]);
    }
  }
  const GROUPS = {
    'a-row': 'あいうえおアイウエオ', 'ka-row': 'かきくけこカキクケコ', 'sa-row': 'さしすせそサシスセソ',
    'ta-row': 'たちつてとタチツテト', 'na-row': 'なにぬねのナニヌネノ', 'ha-row': 'はひふへほハヒフヘホ',
    'ma-row': 'まみむめもマミムメモ', 'ya-row': 'やゆよヤユヨ', 'ra-row': 'らりるれろラリルレロ', 'wa-row': 'わをんワヲン',
    'dakuten-hira-ga-za': 'がぎぐげござじずぜぞ', 'dakuten-hira-da-ba': 'だぢづでどばびぶべぼ',
    'dakuten-kata-ga-za': 'ガギグゲゴザジズゼゾ', 'dakuten-kata-da-ba-vu': 'ダヂヅデドバビブベボヴ',
    'handakuten': 'ぱぴぷぺぽパピプペポ', 'small-hira': 'ぁぃぅぇぉっゃゅょゎ', 'small-kata-choon': 'ァィゥェォッャュョヮヵヶー',
  };
  const done = new Set(), pages = [];
  for (const [name, list] of Object.entries(GROUPS)) { const rs = rows.filter(([ch]) => list.includes(ch)); rs.forEach(([ch]) => done.add(ch)); if (rs.length) pages.push([name, rs]); }
  const rest = rows.filter(([ch]) => !done.has(ch)); if (rest.length) pages.push(['other', rest]);
  if (tateRows.length) pages.push(['small-tate', tateRows]);
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  for (const [name, rs] of pages) {
    const body = rs.map(([ch, n, files]) => `<div class="r"><b>${ch}</b>${files.map((f, k) => `<figure><img src="${fileUrl(f)}"><figcaption>${k + 1 === n ? '完成' : k + 1 + '画目まで'}</figcaption></figure>`).join('')}</div>`).join('');
    const html = path.join(OUT, `page-${name}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:12px 12px 24px;font:13px system-ui;background:#fff}
.r{display:flex;align-items:center;gap:8px;margin:0 0 6px}.r b{font-size:28px;width:40px}figure{margin:0;text-align:center}
img{width:150px;height:150px;border:1px solid #ccc}figcaption{font-size:11px;color:#555}</style>${body}`);
    await sheet.goto(fileUrl(html));
    await sheet.screenshot({ path: path.join(OUT, `page-${name}.png`), fullPage: true });
  }
}
await browser.close();
console.log('kana-proto-check: wrote ' + OUT);

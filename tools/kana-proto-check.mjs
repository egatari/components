// Measures the reveal of data/kana/proto.html in headless Chrome, and renders frames for review.
//   node tools/kana-proto-check.mjs OUTDIR [--frames] [--chars あいう]
// Needs `node tools/studio.mjs` once (for the browser) and the font at data/kana/font/ (see kana-proto.mjs).
//
// Pixels are used only to MEASURE (small kana are measured unplaced, in glyph coordinates; their placement is
// checked separately): per character, the glyph (500 px, ink = dark pixels) and each stroke's
// brush mask are rendered by Chrome; then
//   coverage  = glyph ink inside the union of all brushes / glyph ink           (should be 100 %)
//   owner(p)  = the stroke whose centreline is nearest to ink pixel p           (approximation)
//   leak(k)   = ink showing after strokes 1..k that is owned by a later stroke; 'outside crossing' counts only
//               the part farther than LEAK_TOL from every drawn centreline (should be ~0)
//   hidden(k) = ink of drawn strokes that is NOT showing after k strokes (guards too wide; should be ~0)
//   needW(i)  = 2 x (largest distance from centreline i to an ink pixel it owns) = brush width that would cover it
// Writes OUTDIR/report.json and prints a table. With --frames, also writes per-character strips
// (after stroke 1, 2, ..., complete), grid pages and GIFs (ffmpeg, if present) into OUTDIR.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';
import { samplePath } from './kana-path.mjs';

const args = process.argv.slice(2);
const OUT = path.resolve(args.find((a) => !a.startsWith('--') && !/^[぀-ヿ]+$/.test(a)) || 'kana-proto-out');
const FRAMES = args.includes('--frames');
const only = args.includes('--chars') ? args[args.indexOf('--chars') + 1] : null;
fs.mkdirSync(OUT, { recursive: true });
const { launch, fileUrl } = await import(path.join(ROOT, '.studio', 'kit', 'browser.mjs'));

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'kana.json'), 'utf8'));
const chars = Object.entries(data.chars).filter(([ch, c]) => c.glyphFit && (!only || only.includes(ch)));
const PROTO = fileUrl(path.join(ROOT, 'data', 'kana', 'proto.html'));
const S = 500, U = S / 100;
const LEAK_TOL = 4.5;
const CLEAR = 7;   // units: ink this close to another stroke's centreline is not used to measure a stroke's width   // units from a drawn centreline: closer than this, a later stroke's ink is shared ink (a crossing)

const browser = await launch();
const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
const dec = await browser.newPage();
// load the page (and the font) once; window.show() redraws
async function open(pg) {
  await pg.goto(PROTO + '?ch=あ' + (process.env.KANA_MODE ? '&mode=' + process.env.KANA_MODE : ''));
  await pg.waitForFunction(() => document.body.dataset.ready === '1');
}
async function show(pg, q, file) {
  await pg.evaluate((o) => window.show(o), q);
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const w = pg.viewportSize().width;
  return pg.screenshot({ clip: { x: 0, y: 0, width: w, height: w }, ...(file ? { path: file } : {}) });
}
const shot = (q) => show(page, q);
await open(page);
// PNG -> luminance bytes (decoded by the browser)
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
// distance from (x, y) to a polyline, and the arc length at the nearest point
function distArc(pts, x, y) {
  let best = Infinity, at = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, l = Math.sqrt(L);
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < best) { best = d; at = acc + t * l; }
    acc += l;
  }
  return [best, at];
}
const arcLen = (pts) => { let a = 0; for (let i = 1; i < pts.length; i++) a += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return a; };
function distTo(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < best) best = d;
  }
  return best;
}

const report = {}, placeFail = [];
const HAS_STROKES = fs.existsSync(path.join(ROOT, 'data', 'kana', 'font', 'strokes-map.json'));
for (const [ch, c] of chars) {
  const n = c.strokes.length, pts = c.strokes.map((s) => samplePath(s.d, 48));
  const G = await lum(await shot({ ch, view: 'glyph', guide: 0, grid: 0, place: 'none' }));
  const M = [], K = [];
  for (let i = 0; i < n; i++) M.push(await lum(await shot({ ch, view: 'brush', from: i, to: i + 1, place: 'none' })));
  // what actually shows after k strokes: the reveal itself (no guide, no grid), ink = dark pixels -> 255
  for (let k = 1; k <= n; k++) K.push((await lum(await shot({ ch, view: 'ink', k, grid: 0, guide: 0, place: 'none' }))).map((v) => (v < 128 ? 255 : 0)));
  // against the per-stroke glyphs (when the font has them): what should show after k strokes is strokes 1..k whole.
  // bleedG = showing but not in that target (clearly), hiddenG = in the target (clearly) but not showing
  const bleedG = Array(n).fill(0), hiddenG = Array(n).fill(0);
  if (c.g !== undefined || HAS_STROKES) for (let k = 1; k < n; k++) {
    const T = await lum(await shot({ ch, view: 'ideal', k, grid: 0, guide: 0, place: 'none' }));
    for (let p = 0; p < S * S; p++) {
      if (K[k - 1][p] >= 128 && T[p] > 200) bleedG[k]++;
      if (T[p] < 60 && K[k - 1][p] < 128) hiddenG[k]++;
    }
  }
  let ink = 0, covered = 0, excess = 0;
  for (let p = 0; p < S * S; p++) if (G[p] >= 128 && K[n - 1][p] >= 128) excess++;   // shows at the end but is not in the glyph
  const leak = Array(n).fill(0), leakOut = Array(n).fill(0), hidden = Array(n).fill(0);
  const needW = Array(n).fill(0), owned = Array(n).fill(0), missing = [];
  const dists = Array.from({ length: n }, () => []);
  // ink width per stroke (owned ink area / centreline length) and per third of the stroke's length
  const lens = pts.map(arcLen), area = Array(n).fill(0), area3 = Array.from({ length: n }, () => [0, 0, 0]);
  // the same, away from other strokes (ink within CLEAR of another centreline and the centreline length there are
  // left out), so a crossing does not make a stroke look thin
  const areaX = Array.from({ length: n }, () => [0, 0, 0]), lenX = pts.map((q, i) => {
    const out = [0, 0, 0];
    let acc = 0;
    for (let k = 1; k < q.length; k++) {
      const l = Math.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]), mx = (q[k][0] + q[k - 1][0]) / 2, my = (q[k][1] + q[k - 1][1]) / 2;
      const clear = pts.every((r, j) => j === i || distTo(r, mx, my) > CLEAR);
      if (clear) out[Math.min(2, Math.floor(3 * (acc + l / 2) / lens[i]))] += l;
      acc += l;
    }
    return out;
  });
  const inkPix = [], dist3 = Array.from({ length: n }, () => [[], [], []]);
  for (let p = 0; p < S * S; p++) {
    if (G[p] >= 128) continue;                       // not ink
    ink++;
    const x = ((p % S) + 0.5) / U, y = (Math.floor(p / S) + 0.5) / U;
    const da = pts.map((q) => distArc(q, x, y)), d = da.map((v) => v[0]);
    const o = d.indexOf(Math.min(...d)); owned[o]++; dists[o].push(d[o]);
    { const t = Math.min(2, Math.floor(3 * da[o][1] / lens[o])); area[o]++; area3[o][t]++; dist3[o][t].push(d[o]);
      if (d.every((v, j) => j === o || v > CLEAR)) areaX[o][t]++; }
    inkPix.push([p, o, d, da.map((v) => v[1])]);
    if (K[n - 1][p] >= 128) covered++; else missing.push([+x.toFixed(1), +y.toFixed(1)]);
    // after k strokes (k = 1..n-1)
    for (let k = 1; k < n; k++) {
      const vis = K[k - 1][p] >= 128;
      if (vis && o >= k) {
        leak[k]++;                                                    // ink of a later stroke is showing
        if (Math.min(...d.slice(0, k)) > LEAK_TOL) leakOut[k]++;      // ... and it is not the shared ink of a crossing
      }
      if (!vis && o < k) hidden[k]++;                                 // ink of a drawn stroke is not showing
    }
  }
  const wMeas = area.map((a, i) => +(a / (U * U) / lens[i]).toFixed(1));
  // band width per third: twice the 95th percentile of the owned ink's distance to the centreline
  const wBand3 = dist3.map((ts) => ts.map((a) => { if (!a.length) return 0; a.sort((u, v) => u - v); return +(2 * a[Math.floor(a.length * 0.95)]).toFixed(1); }));
  // ink width per third from the median distance (uniform band of width w around its centreline: median = w / 4)
  const wMed3 = dist3.map((ts) => ts.map((a) => { if (!a.length) return 0; return +(4 * a[Math.floor(a.length * 0.5)]).toFixed(1); }));
  const w3x = areaX.map((t, i) => t.map((a, j) => (lenX[i][j] > 2 ? +(a / (U * U) / lenX[i][j]).toFixed(1) : null)));
  const w3 = area3.map((t, i) => t.map((a) => +(a / (U * U) / (lens[i] / 3)).toFixed(1)));
  // bleed after k strokes: ink of a later stroke that shows OUTSIDE the drawn strokes' own ink band (farther than
  // half the local measured width + 0.4 from each drawn centreline)
  const bleed = Array(n).fill(0);
  const halfAt = (i, arc) => w3[i][Math.min(2, Math.floor(3 * arc / lens[i]))] / 2 + 0.4;
  for (const [p, o, d, arcs] of inkPix) for (let k = 1; k < n; k++) {
    if (o < k || K[k - 1][p] < 128) continue;
    let inside = false;
    for (let i = 0; i < k; i++) if (d[i] <= halfAt(i, arcs[i])) { inside = true; break; }
    if (!inside) bleed[k]++;
  }
  for (let i = 0; i < n; i++) {
    const a = dists[i].sort((u, v) => u - v);
    needW[i] = a.length ? +(2 * a[Math.min(a.length - 1, Math.floor(a.length * 0.999))]).toFixed(1) : 0;
  }
  // where the missing ink is (clustered coarsely, for fixing)
  const where = {};
  for (const [x, y] of missing) { const key = `${Math.round(x / 5) * 5},${Math.round(y / 5) * 5}`; where[key] = (where[key] || 0) + 1; }
  report[ch] = {
    strokes: n, inkPx: ink, coverage: +(100 * covered / ink).toFixed(2), missingPx: missing.length, excessPx: excess,
    missingAt: Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 6),
    missingBox: missing.length ? [Math.min(...missing.map((m) => m[0])), Math.min(...missing.map((m) => m[1])), Math.max(...missing.map((m) => m[0])), Math.max(...missing.map((m) => m[1]))] : null,
    // per step k = 1..n-1 (pixels at 500 px; 25 px = 1 unit²)
    leakPx: leak.slice(1), leakOutsideCrossingPx: leakOut.slice(1), hiddenDrawnPx: hidden.slice(1),
    needWidth: needW, inkWidth: wMeas, bleedVsStrokesPx: bleedG.slice(1), hiddenVsStrokesPx: hiddenG.slice(1), inkWidth3: w3, bandWidth3: wBand3, medWidth3: wMed3, clearWidth3: w3x, bleedPx: bleed.slice(1),
  };
  const r = report[ch];
  // small kana: the rendered ink, through each placement, must lie inside its quarter
  if (c.place) {
    r.place = {};
    for (const [mode, qx, qy] of [['yoko', 0, 50], ['tate', 50, 0]]) {
      const P = await lum(await shot({ ch, view: 'glyph', guide: 0, grid: 0, place: mode }));
      let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (let p = 0; p < S * S; p++) if (P[p] < 200) { const x = p % S, y = Math.floor(p / S); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const box = [x0 / U, y0 / U, (x1 + 1) / U, (y1 + 1) / U].map((v) => +v.toFixed(1));
      const inside = box[0] >= qx && box[2] <= qx + 50 && box[1] >= qy && box[3] <= qy + 50;
      r.place[mode] = { inkBox: box, inside };
      if (!inside) placeFail.push(`${ch} ${mode} ${JSON.stringify(box)}`);
    }
  }
  console.log(`${ch}  cover ${r.coverage}%  excess ${r.excessPx}px  missing ${r.missingPx}px ${r.missingPx ? JSON.stringify(r.missingAt) + ' box ' + JSON.stringify(r.missingBox) : ''}  leak ${JSON.stringify(r.leakPx)} outside-crossing ${JSON.stringify(r.leakOutsideCrossingPx)}  hidden ${JSON.stringify(r.hiddenDrawnPx)}  bleed ${JSON.stringify(r.bleedPx)}  w ${JSON.stringify(wMeas)}  needW ${JSON.stringify(needW)}`);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const nPlaced = Object.values(report).filter((r) => r.place).length;
if (nPlaced) console.log(placeFail.length ? `placement: ${placeFail.length} outside their quarter: ${placeFail.join('; ')}` : `placement: all ${nPlaced} small kana inside their quarter (yoko lower-left, tate upper-right)`);

if (FRAMES) {
  const fdir = path.join(OUT, 'frames'); fs.mkdirSync(fdir, { recursive: true });
  const small = await browser.newPage({ viewport: { width: 240, height: 240 } });
  await open(small);
  await small.addStyleTag({ content: 'body.one svg { width: 240px !important; height: 240px !important; }' });
  const rows = [], tateRows = [];
  for (const [ch, c] of chars) {
    const n = c.strokes.length, files = [];
    for (let k = 1; k <= n; k++) {
      const f = path.join(fdir, `${ch}-${k}.png`);
      await show(page, { ch, k }, f); files.push(f);
    }
    rows.push([ch, n, files]);
    if (c.place) {
      const tf = [];
      for (let k = 1; k <= n; k++) { const f = path.join(fdir, `${ch}-tate-${k}.png`); await show(page, { ch, k, place: 'tate' }, f); tf.push(f); }
      tateRows.push([ch, n, tf]);
    }
    // animation frames -> GIF
    const ff = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
    if (ff) {
      const adir = path.join(OUT, 'anim', ch); fs.mkdirSync(adir, { recursive: true });
      let i = 0;
      const ks = [];
      for (let s = 0; s < n; s++) { for (let t = 0; t < 1; t += 1 / 12) ks.push(s + t); for (let h = 0; h < 4; h++) ks.push(s + 1); }
      for (let h = 0; h < 12; h++) ks.push(n);
      for (const k of ks) {
        await show(small, { ch, k }, path.join(adir, String(i++).padStart(4, '0') + '.png'));
      }
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(adir, '%04d.png'),
        '-vf', 'split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse', path.join(OUT, `anim-${ch}.gif`)]);
    }
  }
  // grid pages, one per gojūon row group: one row per character (strokes left to right)
  const GROUPS = {
    'a-row': 'あいうえおアイウエオ', 'ka-row': 'かきくけこカキクケコ', 'sa-row': 'さしすせそサシスセソ',
    'ta-row': 'たちつてとタチツテト', 'na-row': 'なにぬねのナニヌネノ', 'ha-row': 'はひふへほハヒフヘホ',
    'ma-row': 'まみむめもマミムメモ', 'ya-row': 'やゆよヤユヨ', 'ra-row': 'らりるれろラリルレロ', 'wa-row': 'わをんワヲン',
    'dakuten-hira-ga-za': 'がぎぐげござじずぜぞ', 'dakuten-hira-da-ba': 'だぢづでどばびぶべぼ',
    'dakuten-kata-ga-za': 'ガギグゲゴザジズゼゾ', 'dakuten-kata-da-ba-vu': 'ダヂヅデドバビブベボヴ',
    'handakuten': 'ぱぴぷぺぽパピプペポ', 'small-hira': 'ぁぃぅぇぉっゃゅょゎ', 'small-kata-choon': 'ァィゥェォッャュョヮヵヶー',
  };
  const done = new Set(), pages = [];
  for (const [name, list] of Object.entries(GROUPS)) {
    const rs = rows.filter(([ch]) => list.includes(ch)); rs.forEach(([ch]) => done.add(ch));
    if (rs.length) pages.push([name, rs]);
  }
  const rest = rows.filter(([ch]) => !done.has(ch));
  if (rest.length) pages.push(['other', rest]);
  if (tateRows.length) pages.push(['small-tate', tateRows]);
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  for (const [name, rs] of pages) {
    const body = rs.map(([ch, n, files]) => `<div class="r"><b>${ch}</b>${files.map((f, k) =>
      `<figure><img src="${fileUrl(f)}"><figcaption>${k + 1 === n ? '完成' : k + 1 + '画目まで'}</figcaption></figure>`).join('')}</div>`).join('');
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

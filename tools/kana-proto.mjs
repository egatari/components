// Builds data/kana/proto.html: a prototype of the stroke-by-stroke reveal for the characters of
// data/kana/kana.json that carry "glyphFit" (fitted to Klee One).
//   node tools/kana-proto.mjs
// The visible glyph comes from the font "Egatari Kana", derived from Klee One (SIL OFL 1.1). It is NOT in the repository yet:
// the page loads the kana subset "Egatari Kana" (derived from Klee One, SIL OFL 1.1, renamed; see data/kana/README.md)
// from data/kana/font/EgatariKana-SemiBold-kana.woff2 (gitignored) or from ?font=<url>.
// Small kana carry "place": {yoko, tate} (SVG matrices); the glyph and our lines are drawn through the same matrix.
//   &place=yoko|tate|none   placement of small kana (default yoko)
// For each stroke, a thick round brush runs along OUR centreline (stroke-dasharray) inside an SVG mask,
// so the glyph appears stroke by stroke in our order and direction. No outline data is stored.
//
// URL parameters (used by tools/kana-proto-check.mjs):
//   ?ch=あ&k=1.5   one big character, state after k strokes (fractional = part of stroke ceil(k))
//   &guide=0       no light-grey guide      &view=glyph   glyph only (no mask)
//   &view=mask&k=1     the whole mask after k strokes, white on black (no glyph)
//   &view=brush&from=0&to=2   only the wide brush of strokes from..to-1, white on black
//   &font=<url>    where to load the font (Egatari Kana) from
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './studio.mjs';

const DIR = path.join(ROOT, 'data', 'kana');
const data = JSON.parse(fs.readFileSync(path.join(DIR, 'kana.json'), 'utf8'));
const chars = Object.fromEntries(Object.entries(data.chars).filter(([, c]) => c.glyphFit)
  .map(([ch, c]) => [ch, { s: c.strokes.map((s) => s.d), e: c.strokes.map((s) => s.end), w: c.strokes.map((s) => s.w ?? null), ...(c.place ? { p: c.place } : {}) }]));
// Per-stroke glyphs (Private Use Area code points in the OFL font, see tools/kana-stroke-glyphs.py): when the font
// folder has strokes-map.json, each character lists its stroke glyphs and the page reveals them one by one.
const mapFile = path.join(DIR, 'font', 'strokes-map.json');
const STROKE_MAP = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')).chars : {};
for (const [ch, cps] of Object.entries(STROKE_MAP)) if (chars[ch] && cps.length === chars[ch].s.length) chars[ch].g = cps;
const fit = [...new Set(Object.values(data.chars).map((c) => c.glyphFit).filter(Boolean))].join(', ');

// Brush widths (0–100 units): wide brush per stroke (default; a number or an array per character in
// data/kana/proto-brush.json overrides it), narrow brush and guard (see cell() in the page).
// With measured ink widths ("w": three widths along the stroke), the narrow brush and the guard follow the
// stroke's own ink: narrow = w + narrowExtra, guard = w + guardExtra, per third of the stroke's length.
// Without "w" they fall back to the fixed narrow / guard widths.
const BRUSH = { default: 13, narrow: 9, guard: 12, narrowExtra: 1.25, guardExtra: 1.75, overrides: {} };
if (process.env.KANA_NX) BRUSH.narrowExtra = +process.env.KANA_NX;
if (process.env.KANA_GX) BRUSH.guardExtra = +process.env.KANA_GX;
if (process.env.KANA_NOW) BRUSH.ignoreW = true;
if (process.env.KANA_WX) BRUSH.wideExtra = +process.env.KANA_WX;
const brushFile = path.join(DIR, 'proto-brush.json');
if (fs.existsSync(brushFile)) Object.assign(BRUSH.overrides, JSON.parse(fs.readFileSync(brushFile, 'utf8')));

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kana reveal prototype</title>
<style>
  :root { --ink: #1d2a57; --guide: #d9dce3; --grid: #e9a0a0; --bg: #fff; }
  html, body { margin: 0; background: var(--bg); color: #222; font: 14px/1.5 system-ui, sans-serif; }
  main { padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.note { margin: 0 0 12px; color: #555; max-width: 60em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  figure { margin: 0; border: 1px solid #ccc; border-radius: 6px; padding: 6px; cursor: pointer; background: #fff; }
  figcaption { font-size: 12px; color: #666; text-align: center; }
  svg { display: block; width: 100%; height: auto; }
  body.one main { padding: 0; }
  body.one svg { width: 500px; height: 500px; }
  body.one figure { border: 0; padding: 0; border-radius: 0; }
</style>
</head>
<body>
<main id="main"></main>
<script>
const CHARS = ${JSON.stringify(chars)};
const BRUSH = ${JSON.stringify(BRUSH)};
const FIT = ${JSON.stringify(fit)};
const q = new URLSearchParams(location.search);
const FONT_URL = q.get('font') || ${JSON.stringify(Object.keys(STROKE_MAP).length ? 'font/EgatariKana-SemiBold-strokes.woff2' : 'font/EgatariKana-SemiBold-kana.woff2')};
// mode=glyphs (default where per-stroke glyphs exist) or mode=w (one glyph, brushes sized by w)
const MODE = q.get('mode') || 'glyphs';
const FAMILY = 'Egatari Kana';
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const width = (ch, i) => { const o = BRUSH.overrides[ch]; return Array.isArray(o) ? (o[i] ?? BRUSH.default) : (o ?? BRUSH.default); };
let uid = 0;

// One character: guide (light grey glyph), then the glyph in ink seen through a mask of brushes.
// One character: guide (light grey glyph), then the glyph in ink seen through a mask. The mask has three layers:
//   1. wide brushes (W) along the drawn part of each stroke: cover the whole glyph stroke, ends included;
//   2. black guards (G) along the NOT yet drawn part of each stroke: where a wide brush passes over a later
//      stroke (a crossing, or a stroke running close by), the later stroke stays hidden;
//   3. narrow brushes (N) along the drawn part again, on top of the guards: the drawn stroke stays visible
//      where a guard crosses it.
// All three follow our centrelines only (no outline data). After the last stroke there are no guards.
function cell(ch, { guide = true, view = 'reveal', grid = true, place = 'yoko' } = {}) {
  const P = CHARS[ch].p && place !== 'none' ? CHARS[ch].p[place] : null;
  const g = (child, extra = {}) => { const e = el('g', { ...(P ? { transform: 'matrix(' + P.join(' ') + ')' } : {}), ...extra }); e.appendChild(child); return e; };
  const id = 'm' + (uid++);
  // accessible name: the real kana; the drawing inside is hidden from assistive tech (it may use PUA code points)
  const svg = el('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': ch + '（書き順）' });
  if (view === 'mask' || view === 'brush') svg.appendChild(el('rect', { width: 100, height: 100, fill: '#000' }));
  else if (grid) {
    svg.appendChild(el('rect', { x: 0.25, y: 0.25, width: 99.5, height: 99.5, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 0.5 }));
    svg.appendChild(el('path', { d: 'M50 0V100M0 50H100', stroke: 'var(--grid)', 'stroke-width': 0.4, 'stroke-dasharray': '1.5 1.5', fill: 'none' }));
  }
  const text = (fill) => { const t = el('text', { x: 0, y: 88, 'font-size': 100, 'font-family': FAMILY, fill }); t.textContent = ch; return t; };
  const ink = view === 'ink' || view === 'ideal';   // the reveal without guide and grid, for measuring
  const ideal = view === 'ideal';                  // strokes 1..k as whole stroke glyphs, unmasked (the target)
  if (ink) view = 'reveal';
  if (guide && !ink && view === 'reveal') svg.appendChild(g(text('var(--guide)'), { 'aria-hidden': 'true' }));
  const line = (d, w, color) => el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 });
  const S = CHARS[ch].s;
  // narrow brushes and guards come in segments [a, b] of the stroke's length, each with its own width
  const W = CHARS[ch].w;
  const segs = (i, extra, fixed) => (W[i] && !BRUSH.ignoreW
    ? W[i].map((w, j) => [j / W[i].length, (j + 1) / W[i].length, w + extra])
    : [[0, 1, fixed]]);
  // wide brush: fixed width (13), or w + wideExtra per segment when wideExtra is set
  const wide = S.map((d, i) => (BRUSH.wideExtra !== undefined ? segs(i, BRUSH.wideExtra, width(ch, i)) : [[0, 1, width(ch, i)]]).map(([a, b, w]) => ({ a, b, p: line(d, w, '#fff') })));
  const guard = S.map((d, i) => segs(i, BRUSH.guardExtra, BRUSH.guard).map(([a, b, w]) => ({ a, b, p: line(d, w, '#000') })));
  const narrow = S.map((d, i) => segs(i, BRUSH.narrowExtra, BRUSH.narrow).map(([a, b, w]) => ({ a, b, p: line(d, w, '#fff') })));
  // per-stroke glyphs: stroke i is its own glyph, shown through its own mask (its wide brush, the guard on its own
  // remaining part — for a stroke that crosses itself — and its narrow brush). No other stroke is in that glyph, so
  // nothing of a later stroke can show. A finished stroke is drawn without a mask.
  const G = CHARS[ch].g;
  if (G && (MODE === 'glyphs' || ideal) && view === 'reveal') {
    const defs = el('defs'); svg.appendChild(defs);
    const groups = S.map((_, i) => {
      const m = el('mask', { id: id + 's' + i, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 100, height: 100 });
      const lg = el('g'); [...wide[i], ...guard[i], ...narrow[i]].forEach((x) => lg.appendChild(x.p)); m.appendChild(lg); defs.appendChild(m);
      const t = el('text', { x: 0, y: 88, 'font-size': 100, 'font-family': FAMILY, fill: 'var(--ink)', 'aria-hidden': 'true', style: 'user-select:none;-webkit-user-select:none' });
      t.textContent = String.fromCodePoint(parseInt(G[i], 16));
      const grp = g(t, { 'aria-hidden': 'true' }); svg.appendChild(grp); return grp;
    });
    const part = (p, lo, hi) => { const len = hi - lo; p.setAttribute('stroke-dasharray', Math.max(len, 0) + ' 2'); p.setAttribute('stroke-dashoffset', -lo); p.style.visibility = len > 1e-6 ? 'visible' : 'hidden'; };
    const set = (k) => S.forEach((_, i) => {
      const f = Math.max(0, Math.min(1, k - i));
      for (const s of wide[i]) part(s.p, s.a, Math.min(s.b, f));
      for (const s of narrow[i]) part(s.p, s.a, Math.min(s.b, f));
      for (const s of guard[i]) part(s.p, Math.max(s.a, f), s.b);
      if (ideal) { groups[i].style.visibility = f >= 1 ? 'visible' : 'hidden'; groups[i].removeAttribute('mask'); return; }
      groups[i].style.visibility = f > 0 ? 'visible' : 'hidden';
      if (f >= 1) groups[i].removeAttribute('mask'); else groups[i].setAttribute('mask', 'url(#' + id + 's' + i + ')');
    });
    return { svg, set, n: S.length };
  }
  const layers = el('g');
  if (view === 'brush') wide.flat().forEach((x) => layers.appendChild(x.p));
  else [...wide.flat().map((x) => x.p), ...guard.flat().map((x) => x.p), ...narrow.flat().map((x) => x.p)].forEach((p) => layers.appendChild(p));
  if (view === 'mask' || view === 'brush') svg.appendChild(g(layers));
  else {
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 100, height: 100 });
    mask.appendChild(layers);
    const defs = el('defs'); defs.appendChild(mask); svg.appendChild(defs);
    // the mask is in the glyph's own coordinates: it is referenced by the transformed group
    svg.appendChild(g(text('var(--ink)'), view !== 'glyph' ? { mask: 'url(#' + id + ')', 'aria-hidden': 'true' } : { 'aria-hidden': 'true' }));
  }
  // a zero-length dash would still paint a round cap, so empty parts are hidden
  // part [lo, hi] of a path
  const part = (p, lo, hi) => { const len = hi - lo; p.setAttribute('stroke-dasharray', Math.max(len, 0) + ' 2'); p.setAttribute('stroke-dashoffset', -lo); p.style.visibility = len > 1e-6 ? 'visible' : 'hidden'; };
  // state: k strokes done (fractional = part of the next one); from: strokes before it are left out (view=brush)
  const set = (k, from = 0) => S.forEach((_, i) => {
    const f = i < from ? 0 : Math.max(0, Math.min(1, k - i));
    for (const s of wide[i]) part(s.p, s.a, Math.min(s.b, f));
    for (const s of narrow[i]) part(s.p, s.a, Math.min(s.b, f));          // drawn part of this segment
    for (const s of guard[i]) part(s.p, Math.max(s.a, f), s.b);           // part not yet drawn
  });
  return { svg, set, n: S.length };
}

function animate(c, ch) {
  const tmp = el('svg'); document.body.appendChild(tmp);
  const L = CHARS[ch].s.map((d) => { const p = el('path', { d }); tmp.appendChild(p); return p.getTotalLength(); });
  tmp.remove();
  const dur = L.map((l) => 350 + l * 9), gap = 250;
  let t0 = null;
  c.set(0);
  const step = (t) => {
    t0 ??= t; let e = t - t0, k = 0;
    for (let i = 0; i < c.n; i++) {
      if (e < dur[i]) { k = i + e / dur[i]; break; }
      e -= dur[i]; k = i + 1;
      if (e < gap) break; e -= gap;
    }
    c.set(k);
    if (k < c.n) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

(async () => {
  const face = new FontFace(FAMILY, 'url(' + JSON.stringify(FONT_URL) + ')');
  document.fonts.add(face);
  try { await face.load(); } catch (e) { document.getElementById('main').textContent = FAMILY + ' not found at ' + FONT_URL + ' (put EgatariKana-SemiBold-kana.woff2 in data/kana/font/ or pass ?font=)'; return; }
  const main = document.getElementById('main');
  // single-character view; window.show() redraws without reloading the font (used by kana-proto-check.mjs)
  window.show = (o) => {
    main.innerHTML = '';
    document.body.classList.add('one');
    const ch = o.ch, view = o.view || 'reveal';
    const c = cell(ch, { guide: String(o.guide) !== '0', view, grid: String(o.grid) !== '0', place: o.place || 'yoko' });
    const fig = document.createElement('figure'); fig.appendChild(c.svg); main.appendChild(fig);
    if (view === 'brush') c.set(+(o.to ?? c.n), +(o.from ?? 0));
    else if (view === 'glyph') c.set(c.n);
    else if (view === 'ink' || view === 'ideal') c.set(+(o.k ?? c.n));
    else c.set(+(o.k ?? c.n));
    window.cur = c;
  };
  if (q.has('ch')) { window.show(Object.fromEntries(q)); document.body.dataset.ready = '1'; return; }
  main.innerHTML = '<h1>かなの筆順（Klee One の字形を、独自の中心線で順に見せる試作）</h1><p class="note">字形: Egatari Kana（Klee One (SIL OFL 1.1) から派生：かなだけを取り出し、名前を変えたもの）. 線の順と向き: data/kana/kana.json (MIT, ' + FIT + ' に位置合わせ). クリックで再生。</p>';
  const grid = document.createElement('div'); grid.className = 'grid'; main.appendChild(grid);
  for (const ch of Object.keys(CHARS)) {
    const c = cell(ch, { place: q.get('place') || 'yoko' });
    const fig = document.createElement('figure'); fig.appendChild(c.svg);
    const cap = document.createElement('figcaption'); cap.textContent = ch + ' ' + c.n + '画'; fig.appendChild(cap);
    fig.addEventListener('click', () => animate(c, ch));
    grid.appendChild(fig); c.set(c.n);
    setTimeout(() => animate(c, ch), 300);
  }
  document.body.dataset.ready = '1';
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIR, 'proto.html'), html);
console.log('kana-proto: wrote data/kana/proto.html (' + Object.keys(chars).length + ' characters)');

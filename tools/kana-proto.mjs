// Builds data/kana/proto.html: the stroke-by-stroke reveal of all kana, with the shapes of data/kana/strokes.ofl.json
// (from strokesvg, derived from Klee One; SIL OFL 1.1) and the order / placement of data/kana/kana.json (MIT).
//   node tools/kana-proto.mjs
// The method (strokesvg's): each stroke is drawn as a thick round-capped centreline, clipped by that stroke's own
// outline, and advanced with stroke-dashoffset; a finished stroke is shown in full. A stroke that crosses itself comes
// in pieces, each clipped by its own part of the outline; the pieces advance together by the same length.
// Nothing of another stroke can show, because each clip holds only its own stroke.
//
// The start of a stroke: a round cap reaches `brush/2` behind the point where the dash starts. Where a centreline
// starts on or near the stroke's own ink, that half-disc showed as a fleck before the stroke had properly begun.
// While a stroke is being drawn, each piece's clip therefore leaves out the half-disc behind its start (radius
// brush/2, on the far side of a line across the centreline at its start). A finished stroke uses its full outline.
//
// URL parameters (used by tools/kana-proto-check.mjs):
//   ?ch=あ&k=1.5        one big character after k strokes (fractional = part of stroke ceil(k))
//   &view=ink          the reveal without guide and grid (for measuring)   &view=outline  all outlines filled
//   &view=ideal&k=2    the outlines of strokes 1..k filled (the target after k strokes)
//   &place=yoko|tate|none   placement of small kana (default yoko)    &guide=0  &grid=0
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './studio.mjs';

const DIR = path.join(ROOT, 'data', 'kana');
const data = JSON.parse(fs.readFileSync(path.join(DIR, 'kana.json'), 'utf8'));
const ofl = JSON.parse(fs.readFileSync(path.join(DIR, 'strokes.ofl.json'), 'utf8'));
const CHARS = Object.fromEntries(Object.entries(data.chars).map(([ch, c]) => [ch, { s: ofl.chars[ch], ...(c.place ? { p: c.place } : {}) }]));

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kana stroke order</title>
<style>
  :root { --ink: #1d2a57; --guide: #d9dce3; --grid: #e9a0a0; --bg: #fff; }
  html, body { margin: 0; background: var(--bg); color: #222; font: 14px/1.5 system-ui, sans-serif; }
  main { padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.note { margin: 0 0 12px; color: #555; max-width: 60em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
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
// Shapes: strokesvg (https://github.com/zhengkyl/strokesvg), derived from Klee One. SIL Open Font License 1.1.
// ${ofl._license.copyright.join(' / ')}
const CHARS = ${JSON.stringify(CHARS)};
const BRUSH = ${ofl.brush};
const q = new URLSearchParams(location.search);
const START_CUT = q.get('startcut') !== '0';   // ?startcut=0 shows the round cap behind the start (for comparison)
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
let uid = 0;

function cell(ch, { guide = true, view = 'reveal', grid = true, place = 'yoko' } = {}) {
  const C = CHARS[ch];
  const P = C.p && place !== 'none' ? C.p[place] : null;
  const id = 'k' + (uid++);
  // the accessible name is the real kana; the drawing is hidden from assistive technology
  const svg = el('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': ch + '（書き順）' });
  if (grid && view === 'reveal') {
    svg.appendChild(el('rect', { x: 0.25, y: 0.25, width: 99.5, height: 99.5, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 0.5, 'aria-hidden': 'true' }));
    svg.appendChild(el('path', { d: 'M50 0V100M0 50H100', stroke: 'var(--grid)', 'stroke-width': 0.4, 'stroke-dasharray': '1.5 1.5', fill: 'none', 'aria-hidden': 'true' }));
  }
  const g = el('g', { 'aria-hidden': 'true', ...(P ? { transform: 'matrix(' + P.join(' ') + ')' } : {}) });
  svg.appendChild(g);
  const defs = el('defs'); g.appendChild(defs);
  // the guide: all outlines in light grey
  if (guide && view === 'reveal') for (const st of C.s) for (const [o] of st) g.appendChild(el('path', { d: o, fill: 'var(--guide)' }));
  if (view === 'outline' || view === 'ideal') {
    const shapes = C.s.map((st) => { const sg = el('g'); for (const [o] of st) sg.appendChild(el('path', { d: o, fill: 'var(--ink)' })); g.appendChild(sg); return sg; });
    const set = (k) => shapes.forEach((sg, i) => { sg.style.visibility = view === 'outline' || i < Math.floor(k + 1e-9) ? 'visible' : 'hidden'; });
    return { svg, set, n: C.s.length };
  }
  const strokes = C.s.map((st, i) => {
    const pieces = st.map(([o, c], j) => {
      const cid = id + 's' + i + 'p' + j;
      const clip = el('clipPath', { id: cid });
      clip.appendChild(el('path', { d: o }));
      defs.appendChild(clip);
      const line = el('path', { d: c, fill: 'none', stroke: 'var(--ink)', 'stroke-width': BRUSH, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'clip-path': 'url(#' + cid + ')' });
      g.appendChild(line);
      return { line, clip, len: 0 };
    });
    return pieces;
  });
  // measure lengths (needs the element in a document)
  const measure = () => {
    for (const ps of strokes) for (const pc of ps) {
      pc.len = pc.line.getTotalLength();
      // cut the clip to the half-plane ahead of the start: no round cap behind the start point
      const a = pc.line.getPointAtLength(0), b = pc.line.getPointAtLength(Math.min(1, pc.len));
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, r = BRUSH / 2 + 0.3;
      // everything except the half-disc behind the start (even-odd: a large square with the half-disc cut out)
      let half = 'M-200 -200H300V300H-200Z';
      for (let k = 0; k <= 16; k++) {
        const t = -Math.PI / 2 + (Math.PI * k) / 16;   // from one side, round the back, to the other side
        const px = a.x + r * (-ux * Math.cos(t) - uy * Math.sin(t)), py = a.y + r * (-uy * Math.cos(t) + ux * Math.sin(t));
        half += (k ? 'L' : 'M') + px.toFixed(2) + ' ' + py.toFixed(2);
      }
      half += 'Z';
      const hid = pc.clip.id + 'h';
      const hc = el('clipPath', { id: hid }); hc.appendChild(el('path', { d: half, 'clip-rule': 'evenodd' })); defs.appendChild(hc);
      pc.startCut = 'url(#' + hid + ')';
    }
  };
  // k strokes done; the pieces of a stroke advance by the same length (that of its longest piece times f)
  const set = (k) => strokes.forEach((ps, i) => {
    const f = Math.max(0, Math.min(1, k - i)), max = Math.max(...ps.map((p) => p.len));
    for (const pc of ps) {
      const drawn = Math.min(pc.len, f * max);
      const outline = pc.clip.firstChild;
      if (f >= 1) { pc.line.removeAttribute('stroke-dasharray'); pc.line.removeAttribute('stroke-dashoffset'); pc.line.style.visibility = 'visible'; outline.removeAttribute('clip-path'); continue; }
      if (pc.startCut && START_CUT) outline.setAttribute('clip-path', pc.startCut);
      pc.line.setAttribute('stroke-dasharray', pc.len + ' ' + (pc.len + 1000));
      pc.line.setAttribute('stroke-dashoffset', pc.len - drawn);
      pc.line.style.visibility = drawn > 0 ? 'visible' : 'hidden';
    }
  });
  return { svg, set, n: C.s.length, measure, strokes };
}

function animate(c) {
  const L = c.strokes.map((ps) => Math.max(...ps.map((p) => p.len)));
  const dur = L.map((l) => 300 + l * 8), gap = 250;
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

const main = document.getElementById('main');
window.show = (o) => {
  main.innerHTML = '';
  document.body.classList.add('one');
  const view = o.view || 'reveal';
  const c = cell(o.ch, { guide: String(o.guide) !== '0' && view === 'reveal', view: view === 'ink' ? 'reveal' : view, grid: String(o.grid) !== '0' && view === 'reveal', place: o.place || 'yoko' });
  const fig = document.createElement('figure'); fig.appendChild(c.svg); main.appendChild(fig);
  if (c.measure) c.measure();
  c.set(+(o.k ?? c.n));
  window.cur = c;
};
if (q.has('ch')) { window.show(Object.fromEntries(q)); document.body.dataset.ready = '1'; }
else {
  main.innerHTML = '<h1>かなの筆順</h1><p class="note">字形: strokesvg (zhengkyl) — Klee One から派生、SIL Open Font License 1.1。筆順・画数: data/kana/kana.json (MIT)。クリックで再生。</p>';
  const grid = document.createElement('div'); grid.className = 'grid'; main.appendChild(grid);
  for (const ch of Object.keys(CHARS)) {
    const c = cell(ch, { place: q.get('place') || 'yoko' });
    const fig = document.createElement('figure'); fig.appendChild(c.svg);
    const cap = document.createElement('figcaption'); cap.textContent = ch + ' ' + c.n + '画'; fig.appendChild(cap);
    grid.appendChild(fig); c.measure(); c.set(c.n);
    fig.addEventListener('click', () => animate(c));
  }
  document.body.dataset.ready = '1';
}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIR, 'proto.html'), html);
console.log('kana-proto: wrote data/kana/proto.html (' + Object.keys(CHARS).length + ' characters, ' + html.length + ' bytes)');

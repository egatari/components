// Compares the stroke order and direction of data/kana/strokes.ofl.json with our own centrelines (the hand-made
// `d` lines, read from git history: kana.json at REV, default the last commit that still had them).
//   node tools/kana-order-check.mjs [REV]
// For every character: the stroke counts must agree; for each stroke i, strokesvg's centreline (the part inside
// its outline) must lie nearest to our stroke i (not to another of our strokes), and run the same way (its start
// nearer our start than our end). Prints the characters that disagree.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';
import { parse, sample, densify } from './kana-svgpath.mjs';

const REV = process.argv[2] || '8ca7119';
const ours = JSON.parse(execFileSync('git', ['-C', ROOT, 'show', `${REV}:data/kana/kana.json`], { encoding: 'utf8' })).chars;
const ofl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'strokes.ofl.json'), 'utf8')).chars;

const inside = (poly, [x, y]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
// outline -> list of rings (an outline may have several contours; even-odd inside test)
function rings(d) {
  const segs = parse(d), out = [];
  let cur = [];
  for (const s of segs) { if (s.c === 'M' && cur.length) { out.push(sample(cur, 8)); cur = []; } cur.push(s); }
  if (cur.length) out.push(sample(cur, 8));
  return out;
}
const inOutline = (rs, p) => rs.reduce((c, r) => (inside(r, p) ? !c : c), false);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (pts, p) => Math.min(...pts.map((q) => dist(p, q)));

const problems = [], stats = { chars: 0, strokes: 0 };
for (const [ch, strokes] of Object.entries(ofl)) {
  stats.chars++;
  const o = ours[ch];
  if (!o) { problems.push(`${ch}: not in our data at ${REV}`); continue; }
  if (o.strokes.length !== strokes.length) { problems.push(`${ch}: ${strokes.length} strokes in strokesvg, ${o.strokes.length} in ours`); continue; }
  const our = o.strokes.map((s) => densify(sample(s.d, 16)));
  strokes.forEach((pieces, i) => {
    stats.strokes++;
    // the centreline of the first piece, inside the stroke's outline (all pieces' outlines)
    const rs = pieces.flatMap(([out]) => [rings(out)]);
    const line = densify(sample(pieces[0][1], 24)).filter((p) => rs.some((r) => inOutline(r, p)));
    if (line.length < 2) { problems.push(`${ch} stroke ${i + 1}: centreline not inside its outline`); return; }
    const score = our.map((q) => line.reduce((a, p) => a + nearest(q, p), 0) / line.length);
    const best = score.indexOf(Math.min(...score));
    if (best !== i) problems.push(`${ch} stroke ${i + 1}: lies nearest our stroke ${best + 1} (mean ${score[best].toFixed(1)} vs ${score[i].toFixed(1)})`);
    const q = our[i], s0 = line[0];
    if (dist(s0, q[0]) > dist(s0, q[q.length - 1]) + 2) problems.push(`${ch} stroke ${i + 1}: runs the other way (starts near our end)`);
  });
}
console.log(`kana-order-check: ${stats.chars} characters, ${stats.strokes} strokes compared with our lines at ${REV}`);
if (problems.length) { console.log(problems.length + ' disagreement(s):\n  ' + problems.join('\n  ')); process.exitCode = 1; }
else console.log('order and direction agree for every stroke');

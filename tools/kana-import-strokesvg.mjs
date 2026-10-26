// Imports the stroke shapes of zhengkyl/strokesvg (kana SVGs derived from Klee One, SIL OFL 1.1) into
// data/kana/strokes.ofl.json, a separately licensed (OFL) data file. The SVG files are read as text only.
//   node tools/kana-import-strokesvg.mjs REPO_DIR [--commit HASH]
// For each character: its strokes in writing order; each stroke is a list of pieces [outline, centreline]
// (a stroke that crosses itself comes in pieces, each clipped by its own part of the outline). The outline is the
// clip shape, the centreline the animated path (drawn with a round brush, BRUSH units wide).
// Coordinates: strokesvg's 1024 box (the em) is scaled by 100/1024 to our 0–100 box, rounded to 0.1.
// Our changes (OFL, listed in data/kana/strokes-CHANGES.md):
//   - 半濁点 (ぱぴぷぺぽ・パピプペポ): the circle's centreline is redrawn to start at the bottom centre and go
//     clockwise (光村図書『こくご一（上）』p.27, p.37: 下中心から時計回り); its outline is kept;
//   - っ ッ ゎ ヮ ヵ ヶ (not in strokesvg): derived from つ ツ わ ワ カ ケ by a uniform scale and a move into the
//     small-kana box (see SMALL below);
//   - precision: 0.1 in 0–100 units.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';
import { parse, scale, transform, serialize, sample, reverse } from './kana-svgpath.mjs';

const args = process.argv.slice(2);
const REPO = args.find((a) => !a.startsWith('--'));
if (!REPO) { console.error('usage: node tools/kana-import-strokesvg.mjs REPO_DIR [--commit HASH]'); process.exit(2); }
let COMMIT = args.includes('--commit') ? args[args.indexOf('--commit') + 1] : null;
if (!COMMIT) { try { COMMIT = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { COMMIT = 'unknown'; } }
const K = 100 / 1024, DP = 1;
const BRUSH = +(128 * K).toFixed(2);

// --- a tiny XML reader (strokesvg's files are svgo output: elements and attributes only) ----------------------
function xml(text) {
  const root = { tag: '#root', attrs: {}, kids: [] }, stack = [root];
  const re = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const [, close, tag, rest, self] = m;
    if (close) { stack.pop(); continue; }
    const attrs = {};
    for (const a of rest.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node = { tag, attrs, kids: [] };
    stack[stack.length - 1].kids.push(node);
    if (!self) stack.push(node);
  }
  return root;
}
const find = (n, pred) => { if (pred(n)) return n; for (const k of n.kids) { const r = find(k, pred); if (r) return r; } return null; };
const all = (n, pred, out = []) => { if (pred(n)) out.push(n); for (const k of n.kids) all(k, pred, out); return out; };

const norm = (d) => serialize(scale(parse(d), K), DP);

function readChar(file) {
  const doc = xml(fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, ''));
  const byId = {};
  for (const n of all(doc, (x) => x.attrs.id)) byId[n.attrs.id] = n;
  const clipShape = (clipAttr) => {
    const id = clipAttr.match(/#([^)]+)/)[1];
    const use = find(byId[id], (x) => x.tag === 'use');
    const ref = (use.attrs.href || use.attrs['xlink:href']).slice(1);
    return byId[ref].attrs.d;
  };
  const strokesG = find(doc, (x) => x.tag === 'g' && x.attrs['data-strokesvg'] === 'strokes');
  const strokes = strokesG.kids.map((el) => {
    const i = +((el.attrs.style || '').match(/--i:\s*(\d+)/) || [])[1];
    const pieces = (el.tag === 'g' ? el.kids.filter((k) => k.tag === 'path') : [el]).map((p) => [norm(clipShape(p.attrs['clip-path'])), norm(p.attrs.d)]);
    return { i, pieces };
  });
  strokes.sort((a, b) => a.i - b.i);
  strokes.forEach((s, k) => { if (s.i !== k) throw new Error(`${file}: stroke order --i ${s.i} at ${k}`); });
  return strokes.map((s) => s.pieces);
}

// --- 半濁点: a new centreline from the ring's own size, bottom centre, clockwise on screen -----------------------
const HANDAKU = 'ぱぴぷぺぽパピプペポ';
function redoCircle(stroke) {
  // one piece: [outline, centreline]; the ring's centre and mid radius from the outline's points
  const pts = sample(parse(stroke[0][0]), 24);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dists = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)).sort((a, b) => a - b);
  const rOut = dists[dists.length - 1], rIn = dists[Math.floor(dists.length * 0.05)];
  const r = (rOut + rIn) / 2;
  // bottom -> left -> top -> right -> bottom (clockwise on screen, y down), and a little past the start so the
  // round brush closes the ring; four cubic quarter-arcs
  const k = 0.5523 * r;
  const segs = [
    { c: 'M', v: [cx, cy + r] },
    { c: 'C', v: [cx - k, cy + r, cx - r, cy + k, cx - r, cy] },
    { c: 'C', v: [cx - r, cy - k, cx - k, cy - r, cx, cy - r] },
    { c: 'C', v: [cx + k, cy - r, cx + r, cy - k, cx + r, cy] },
    { c: 'C', v: [cx + r, cy + k, cx + k, cy + r, cx, cy + r] },
    { c: 'C', v: [cx - k * 0.35, cy + r, cx - r * 0.33, cy + r * 0.97, cx - r * 0.5, cy + r * 0.87] },
  ];
  return [[stroke[0][0], serialize(segs, DP)]];
}

// --- small kana not in strokesvg: uniform scale + move of the base character's shapes --------------------------
// The target box `to` is Klee One's own small glyph (its outline box, read from the font's metrics, 0–100 units);
// the base character's outline box is scaled uniformly to fit it and centred on it.
const SMALL = {
  っ: { base: 'つ', to: [18.1, 48.5, 76.6, 89.2] },
  ッ: { base: 'ツ', to: [26.5, 41.1, 76.1, 92.2] },
  ゎ: { base: 'わ', to: [20.8, 30.9, 79.3, 92.3] },
  ヮ: { base: 'ワ', to: [27.5, 39.0, 74.4, 93.1] },
  ヵ: { base: 'カ', to: [21.1, 29.9, 73.2, 92.1] },
  ヶ: { base: 'ケ', to: [21.0, 31.9, 78.3, 91.6] },
};
function boxOf(strokes) {
  const pts = strokes.flatMap((st) => st.flatMap(([o]) => sample(parse(o), 12)));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}
function smallFrom(baseStrokes, { to }) {
  const from = boxOf(baseStrokes);
  const s = Math.min((to[2] - to[0]) / (from[2] - from[0]), (to[3] - to[1]) / (from[3] - from[1]));
  const e = (to[0] + to[2]) / 2 - s * (from[0] + from[2]) / 2, f = (to[1] + to[3]) / 2 - s * (from[1] + from[3]) / 2;
  const M = [s, 0, 0, s, e, f];
  return { m: M.map((v) => +v.toFixed(4)), strokes: baseStrokes.map((st) => st.map(([o, c]) => [serialize(transform(parse(o), M), DP), serialize(transform(parse(c), M), DP)])) };
}

// --- run --------------------------------------------------------------------------------------------------------
const kana = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kana', 'kana.json'), 'utf8')).chars;
const chars = {}, derived = {};
for (const ch of Object.keys(kana)) {
  const file = path.join(REPO, 'dist', ch.codePointAt(0) >= 0x30a0 ? 'katakana' : 'hiragana', ch + '.svg');
  if (!fs.existsSync(file)) continue;
  const strokes = readChar(file);
  if (HANDAKU.includes(ch)) strokes[strokes.length - 1] = redoCircle(strokes[strokes.length - 1]);
  chars[ch] = strokes;
}
for (const [ch, rule] of Object.entries(SMALL)) {
  const r = smallFrom(chars[rule.base], rule);
  chars[ch] = r.strokes; derived[ch] = { base: rule.base, matrix: r.m };
}
const ordered = Object.fromEntries(Object.keys(kana).filter((c) => chars[c]).map((c) => [c, chars[c]]));
const out = {
  _license: {
    notice: 'Kana stroke shapes derived from strokesvg (https://github.com/zhengkyl/strokesvg), whose kana SVGs are derived from the Klee One font. Licensed under the SIL Open Font License, Version 1.1; see OFL.txt next to this file (https://openfontlicense.org/).',
    copyright: ['Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee)', 'Copyright (c) 2024 Kyle'],
    copyrightNote: 'The first line is the Klee One font\'s (the source of the shapes), as in its OFL.txt; the second is strokesvg\'s (https://github.com/zhengkyl/strokesvg), as in its LICENSE.',
    license: 'SIL Open Font License 1.1',
    licenseFile: 'OFL.txt',
    modifications: 'Egatari: coordinates scaled to a 0–100 box and rounded to 0.1; 半濁点 of ぱぴぷぺぽ・パピプペポ redrawn to start at the bottom centre and go clockwise; っ ッ ゎ ヮ ヵ ヶ derived from つ ツ わ ワ カ ケ by scaling; see strokes-CHANGES.md.',
  },
  source: { repository: 'https://github.com/zhengkyl/strokesvg', commit: COMMIT, files: 'dist/hiragana/*.svg, dist/katakana/*.svg', transform: 'x, y times 100/1024 (strokesvg viewBox 0 0 1024 1024 -> 0 0 100 100)' },
  box: 100,
  brush: BRUSH,
  format: 'chars[ch] = strokes in writing order; a stroke = pieces [[outline, centreline], ...]; draw each centreline with a round brush `brush` wide, clipped by its outline; the pieces of one stroke advance together by the same length',
  derived,
  chars: ordered,
};
// compact JSON: one character per line
const body = Object.entries(out.chars).map(([c, s]) => `  ${JSON.stringify(c)}: ${JSON.stringify(s)}`).join(',\n');
const head = JSON.stringify({ ...out, chars: undefined }, null, 1).replace(/\n}$/, '');
const text = `${head},\n "chars": {\n${body}\n }\n}\n`;
JSON.parse(text);
const file = path.join(ROOT, 'data', 'kana', 'strokes.ofl.json');
fs.writeFileSync(file, text);
console.log(`kana-import-strokesvg: ${Object.keys(ordered).length} characters (strokesvg ${COMMIT.slice(0, 12)}), wrote ${path.relative(ROOT, file)} (${text.length} bytes)`);

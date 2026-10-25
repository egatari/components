// Validates data/kana/kana.json (not yet part of test-all):
//   - the file shape (version, box 100, sources, chars)
//   - the expected 166 characters are all present, and nothing else: the 92 basic kana, 濁音 (base + 2 strokes),
//     半濁音 (base + 1), ヴ, the small kana (same count as their base) and ー
//   - each character: count === strokes.length, count matches the expected school stroke count
//   - derived characters name their base ("base"); a 濁音・半濁音 starts with exactly its base's strokes, unless
//     its own glyph needed a re-fit (then only the count is checked)
//   - glyphFit, when present, is a non-empty string
//   - every small kana has "place": {yoko, tate}, two SVG matrices (uniform scale, no rotation); tate is yoko moved
//     by (+50, −50); our lines widened by 4 units, through each matrix, lie inside the lower-left quarter (yoko) or
//     the upper-right quarter (tate) of the 0–100 square (the rendered ink is checked by kana-proto-check.mjs)
//   - every stroke marked "loop": true (結び) crosses itself, and every loop it closes turns clockwise on screen
//     (y down), the same way as な's 結び (the reference the owner checked)
//   - every stroke: d parses (M L H V Q T C S Z only), end is tome|hane|harai, every sampled point stays in 0..box
//   - source names an entry in sources
// Run: node tools/test-kana-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './studio.mjs';
import { samplePath } from './kana-path.mjs';

const file = path.join(ROOT, 'data', 'kana', 'kana.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);

// Expected stroke counts (facts, cross-checked against a public school chart; see data/kana/README.md)
const EXPECT = {
  あ: 3, い: 2, う: 2, え: 2, お: 3, か: 3, き: 4, く: 1, け: 3, こ: 2, さ: 3, し: 1, す: 2, せ: 3, そ: 1,
  た: 4, ち: 2, つ: 1, て: 1, と: 2, な: 4, に: 3, ぬ: 2, ね: 2, の: 1, は: 3, ひ: 1, ふ: 4, へ: 1, ほ: 4,
  ま: 3, み: 2, む: 3, め: 2, も: 3, や: 3, ゆ: 2, よ: 2, ら: 2, り: 2, る: 1, れ: 2, ろ: 1, わ: 2, を: 3, ん: 1,
  ア: 2, イ: 2, ウ: 3, エ: 3, オ: 3, カ: 2, キ: 3, ク: 2, ケ: 3, コ: 2, サ: 3, シ: 3, ス: 2, セ: 2, ソ: 2,
  タ: 3, チ: 3, ツ: 3, テ: 3, ト: 2, ナ: 2, ニ: 2, ヌ: 2, ネ: 4, ノ: 1, ハ: 2, ヒ: 2, フ: 1, ヘ: 1, ホ: 4,
  マ: 2, ミ: 3, ム: 2, メ: 2, モ: 3, ヤ: 2, ユ: 2, ヨ: 3, ラ: 2, リ: 2, ル: 2, レ: 1, ロ: 3, ワ: 2, ヲ: 3, ン: 2,
};
const BASIC = { ...EXPECT };
// 濁音 (2 marks), 半濁音 (1 circle), ヴ, small kana (same strokes as the base), ー
const DAKU = 'がぎぐげござじずぜぞだぢづでどばびぶべぼガギグゲゴザジズゼゾダヂヅデドバビブベボヴ';
const HANDAKU = 'ぱぴぷぺぽパピプペポ';
const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ',
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ', ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ヮ: 'ワ', ヵ: 'カ', ヶ: 'ケ' };
const baseOf = (ch) => ch.normalize('NFD')[0];
const BASE = {};
for (const ch of DAKU) { BASE[ch] = baseOf(ch); EXPECT[ch] = BASIC[baseOf(ch)] + 2; }
for (const ch of HANDAKU) { BASE[ch] = baseOf(ch); EXPECT[ch] = BASIC[baseOf(ch)] + 1; }
for (const [ch, b] of Object.entries(SMALL)) { BASE[ch] = b; EXPECT[ch] = BASIC[b]; }
EXPECT['ー'] = 1;
const ENDS = new Set(['tome', 'hane', 'harai']);

// Loops closed by a stroke crossing itself: signed area of each (shoelace, y down: > 0 = clockwise on screen)
function selfLoops(pts) {
  const cross = (a, b, c, d) => {
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-9) return false;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  const areas = [];
  for (let i = 0; i < pts.length - 1; i++) for (let j = i + 2; j < pts.length - 1; j++) {
    if (!cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) continue;
    const poly = pts.slice(i + 1, j + 1);
    let A = 0;
    poly.forEach((a, k) => { const b = poly[(k + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; });
    areas.push(A / 2);
  }
  return areas;
}

if (typeof data.version !== 'string') fail('version must be a string');
if (data.box !== 100) fail('box must be 100');
if (!data.sources || typeof data.sources !== 'object') fail('sources missing');
const box = data.box;
const chars = data.chars || {};
for (const ch of Object.keys(EXPECT)) if (!(ch in chars)) fail(`${ch}: missing`);
for (const ch of Object.keys(chars)) if (!(ch in EXPECT)) fail(`${ch}: not one of the expected characters`);

let strokes = 0;
for (const [ch, c] of Object.entries(chars)) {
  if (!Array.isArray(c.strokes) || !c.strokes.length) { fail(`${ch}: strokes must be a non-empty array`); continue; }
  if (c.count !== c.strokes.length) fail(`${ch}: count ${c.count} but ${c.strokes.length} strokes`);
  if (ch in EXPECT && c.count !== EXPECT[ch]) fail(`${ch}: count ${c.count}, expected ${EXPECT[ch]}`);
  if (!c.source || !(c.source in (data.sources || {}))) fail(`${ch}: source "${c.source}" not in sources`);
  if (typeof c.verified !== 'boolean') fail(`${ch}: verified must be true or false`);
  if (ch in BASE && c.base !== BASE[ch]) fail(`${ch}: base must be "${BASE[ch]}"`);
  if (!(ch in BASE) && c.base !== undefined) fail(`${ch}: has a base but is not a derived character`);
  if ((DAKU + HANDAKU).includes(ch) && chars[BASE[ch]] && !c.refit) {
    const b = chars[BASE[ch]].strokes;
    b.forEach((s, i) => { if (!c.strokes[i] || c.strokes[i].d !== s.d || c.strokes[i].end !== s.end) fail(`${ch} stroke ${i + 1}: differs from its base ${BASE[ch]} (set "refit" if the glyph needs it)`); });
  }
  if (ch in SMALL) {
    const P = c.place;
    if (!P || !Array.isArray(P.yoko) || !Array.isArray(P.tate) || P.yoko.length !== 6 || P.tate.length !== 6) fail(`${ch}: place must be {yoko: [6 numbers], tate: [6 numbers]}`);
    else {
      const [a, b, cc, dd, e, f] = P.yoko;
      if (b !== 0 || cc !== 0 || a !== dd || !(a > 0 && a < 1)) fail(`${ch}: place.yoko must be a uniform scale below 1 and a move`);
      if (P.tate[0] !== a || P.tate[3] !== dd || P.tate[1] !== 0 || P.tate[2] !== 0 || Math.abs(P.tate[4] - (e + 50)) > 1e-6 || Math.abs(P.tate[5] - (f - 50)) > 1e-6) fail(`${ch}: place.tate must be place.yoko moved by (+50, -50)`);
      for (const [mode, [qx0, qy0]] of [['yoko', [0, 50]], ['tate', [50, 0]]]) {
        const [s0, , , , tx, ty] = P[mode];
        for (const st of c.strokes) for (const [x, y] of samplePath(st.d)) {
          const X = x * s0 + tx, Y = y * s0 + ty, r = 4 * s0;
          if (X - r < qx0 || X + r > qx0 + 50 || Y - r < qy0 || Y + r > qy0 + 50) { fail(`${ch}: ${mode} placement leaves its quarter at (${X.toFixed(1)}, ${Y.toFixed(1)})`); break; }
        }
      }
    }
  } else if (c.place !== undefined) fail(`${ch}: only small kana have place`);
  if (c.refit !== undefined && (typeof c.refit !== "string" || !c.refit)) fail(`${ch}: refit must be a non-empty string when present`);
  if (c.glyphFit !== undefined && (typeof c.glyphFit !== 'string' || !c.glyphFit)) fail(`${ch}: glyphFit must be a non-empty string when present`);
  c.strokes.forEach((s, i) => {
    strokes++;
    const at = `${ch} stroke ${i + 1}`;
    if (!ENDS.has(s.end)) fail(`${at}: end "${s.end}" is not tome|hane|harai`);
    if (s.start !== undefined && typeof s.start !== 'string') fail(`${at}: start must be a string when present`);
    let pts;
    try { pts = samplePath(s.d); } catch (e) { fail(`${at}: path does not parse (${e.message})`); return; }
    if (pts.length < 2) fail(`${at}: path has no length`);
    const out = pts.find(([x, y]) => x < 0 || y < 0 || x > box || y > box);
    if (out) fail(`${at}: point (${out[0].toFixed(1)}, ${out[1].toFixed(1)}) is outside the box`);
    if (s.loop !== undefined && s.loop !== true) fail(`${at}: loop must be true when present`);
    if (s.loop) {
      const areas = selfLoops(pts);
      if (!areas.length) fail(`${at}: marked loop but does not cross itself`);
      if (areas.some((a) => a <= 0)) fail(`${at}: loop turns anticlockwise; 結び turn clockwise on screen, like な`);
    }
  });
}

if (errors.length) {
  console.error(`test-kana-data: ${errors.length} problem(s)\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`test-kana-data: ok (${Object.keys(chars).length} characters, ${strokes} strokes)`);

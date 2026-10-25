// Validates data/kana/kana.json (not yet part of test-all):
//   - the file shape (version, box 100, sources, chars)
//   - the expected 92 characters (ひらがな46 + カタカナ46) are all present, and nothing else
//   - each character: count === strokes.length, count matches the expected school stroke count
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
const ENDS = new Set(['tome', 'hane', 'harai']);

if (typeof data.version !== 'string') fail('version must be a string');
if (data.box !== 100) fail('box must be 100');
if (!data.sources || typeof data.sources !== 'object') fail('sources missing');
const box = data.box;
const chars = data.chars || {};
for (const ch of Object.keys(EXPECT)) if (!(ch in chars)) fail(`${ch}: missing`);
for (const ch of Object.keys(chars)) if (!(ch in EXPECT)) fail(`${ch}: not one of the 92 basic kana`);

let strokes = 0;
for (const [ch, c] of Object.entries(chars)) {
  if (!Array.isArray(c.strokes) || !c.strokes.length) { fail(`${ch}: strokes must be a non-empty array`); continue; }
  if (c.count !== c.strokes.length) fail(`${ch}: count ${c.count} but ${c.strokes.length} strokes`);
  if (ch in EXPECT && c.count !== EXPECT[ch]) fail(`${ch}: count ${c.count}, expected ${EXPECT[ch]}`);
  if (!c.source || !(c.source in (data.sources || {}))) fail(`${ch}: source "${c.source}" not in sources`);
  if (typeof c.verified !== 'boolean') fail(`${ch}: verified must be true or false`);
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
  });
}

if (errors.length) {
  console.error(`test-kana-data: ${errors.length} problem(s)\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`test-kana-data: ok (${Object.keys(chars).length} characters, ${strokes} strokes)`);

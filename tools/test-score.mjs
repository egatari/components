// m-score's score data (its `static sc`), without a browser, on the abcjs fixtures (components/score/fixtures/*.json):
//   1. the frozen SVG is read into a tree of allowed elements and attributes only (no script, style, title, foreign
//      content, event handlers, links or colours other than currentColor / none), entities decoded
//   2. abcMap parsing and errors (pitch names, tempo, dur, by)
//   3. step grouping: one note, chord or rest per step (by="note"), one measure per step (by="measure")
//   4. sound events: pitch, dur in seconds from beats and tempo, chords at one t, notes of a measure at their beat,
//      rests and tie continuations silent, a tied note sounding on through the next note (past the end of its step)
//   5. which notes each SVG element appears with (every note found; bar lines with the last note of their measure,
//      beams with the first note under them, ties with the note they end on)
//   6. note names (solfa, abc, iroha; chords top to bottom) and their placement under the noteheads (x from the box,
//      a crowded name moves down a row, nothing overlaps); the readable layer's text
//   7. the demo carries the fixtures unchanged
//   node tools/test-score.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

const classes = {};
const DECK = { define: (tag, C) => { classes[tag] = C; }, MotionElement: class {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'score', 'index.js'), 'utf8'), { DECK, console, Math, String, JSON, Number, Array, Object, Error, parseInt, isFinite });
const SC = classes['m-score'].sc;
const FX = {};
for (const n of ['doremi', 'rhythm', 'kaeru', 'chords']) FX[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'score', 'fixtures', n + '.json'), 'utf8'));

let fail = 0, n = 0;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const eq = (got, want, msg) => {
  n++;
  const good = typeof want === 'number' ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (!good) { fail++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log('FAIL ' + msg); } };
const throws = (f, re, msg) => { n++; try { f(); fail++; console.log(`FAIL ${msg}: no error`); } catch (e) { if (!re.test(e.message)) { fail++; console.log(`FAIL ${msg}: ${e.message}`); } } };
const walk = (node, f) => { f(node); node.kids.forEach((k) => walk(k, f)); };

// ---- 1. the frozen SVG ----
const evil = SC.parseSvg('<?xml version="1.0"?><!-- c --><svg width="100" height="50" onload="x()" style="a"><style>g{}</style><title>t</title>'
  + '<script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:x"><path d="M0 0"/></a>'
  + '<g class="abcjs-note abcjs-n0" fill="#ff0000" stroke="currentColor" onclick="x()"><path d="M 1 2 L 3 4z" fill="url(#p)" class="abcjs-notehead"/></g>'
  + '<text x="1" y="2" font-size="20">A &amp; B &#x266F;<tspan>&quot;</tspan></text><image href="x.png"/><path d="M0 0" transform="translate(1 2) scale(2)"/></svg>');
const tags = [], attrs = new Set();
walk(evil, (x) => { tags.push(x.tag); Object.keys(x.a).forEach((a) => attrs.add(a)); });
eq(tags, ['svg', 'g', 'path', 'text', 'tspan', 'path'], 'only allowed elements, unknown ones dropped with their content');
ok(!attrs.has('onload') && !attrs.has('onclick') && !attrs.has('style') && !attrs.has('href'), 'no event handler, style or link attribute');
eq(Object.entries(evil.kids[0].a).sort(), [['class', 'abcjs-note abcjs-n0'], ['stroke', 'currentColor']], 'colours other than currentColor / none are dropped');
eq(evil.kids[0].kids[0].a.fill, undefined, 'fill="url(…)" is dropped');
eq(evil.kids[1].text + evil.kids[1].kids[0].text, 'A & B ♯"', 'entities are decoded in text');
eq(evil.kids[2].a.transform, 'translate(1 2) scale(2)', 'transform kept');
throws(() => SC.parseSvg('<g></g>'), /no <svg>/, 'no svg element');
for (const [name, fx] of Object.entries(FX)) {
  const t = SC.parseSvg(fx.abcSvg); let paths = 0;
  walk(t, (x) => { if (x.tag === 'path') paths++; });
  ok(paths > 20 && +t.a.width > 0 && +t.a.height > 0, `${name}: the abcjs SVG is read (${paths} paths, ${t.a.width}×${t.a.height})`);
}

// ---- 2. abcMap ----
const map = (notes, tempo = 120) => ({ tempo, notes });
const N = (o) => ({ cls: 'abcjs-v0 abcjs-mm0 abcjs-n0', m: 0, pitch: ['C4'], beat: 0, dur: 1, ...o });
throws(() => SC.plan(map([N({ pitch: ['H4'] })]), 'note'), /pitch "H4" is not a pitch/, 'H4 is not a pitch');
throws(() => SC.plan(map([N({})], 0), 'note'), /tempo/, 'tempo must be > 0');
throws(() => SC.plan(map([N({ dur: 0 })]), 'note'), /dur must be > 0/, 'dur must be > 0');
throws(() => SC.plan(map([N({ cls: 'note0' })]), 'note'), /cls must be abcjs classes/, 'cls must be abcjs classes');
throws(() => SC.plan(map([]), 'note'), /notes is empty/, 'no notes');
throws(() => SC.plan(map([N({})]), 'bar'), /by="bar"/, 'by must be note or measure');
throws(() => SC.plan(null, 'note'), /abcMap is missing/, 'no abcMap');
eq(SC.parsePitch('F#4').midi, 66, 'F#4 = 66');
eq(SC.parsePitch('Bb3').midi, 58, 'Bb3 = 58');
eq(SC.parsePitch('C##4').midi, 62, 'C##4 = 62');
eq(SC.parsePitch('C4').midi, 60, 'C4 = 60');

// ---- 3. steps ----
const want = { doremi: [16, 4], rhythm: [14, 6], kaeru: [33, 8], chords: [4, 2] };
for (const [name, [byNote, byMeasure]] of Object.entries(want)) {
  eq(SC.plan(FX[name].abcMap, 'note').steps.length, byNote, `${name}: ${byNote} steps by note`);
  eq(SC.plan(FX[name].abcMap, 'measure').steps.length, byMeasure, `${name}: ${byMeasure} steps by measure`);
}
const kM = SC.plan(FX.kaeru.abcMap, 'measure');
eq(kM.steps[6].notes.length, 8, 'kaeru measure 7 has its 8 eighth notes in one step');
eq(kM.steps.map((s) => s.len), Array(8).fill(+(4 * 60 / 104).toFixed(6)), 'kaeru: every measure lasts 4 beats at 104 per minute');

// ---- 4. events ----
const d = SC.plan(FX.doremi.abcMap, 'note');
eq(SC.events(d, 1), [{ t: 0, sound: 'note', pitch: 'C4', dur: 0.625, vel: 0.7 }], 'doremi step 1: C4 for one beat at 96 (0.625 s)');
eq(SC.events(d, 8).map((e) => e.pitch), ['C5'], 'doremi step 8: the upper C is C5');
eq(SC.events(d, 0), [], 'step 0 has no sound');
eq(SC.events(d, 17), [], 'no step 17');
const c = SC.plan(FX.chords.abcMap, 'note');
const e2 = SC.events(c, 2);
eq(e2.map((e) => e.pitch), ['F4', 'A4', 'C5'], 'chords step 2: F A C sound together');
ok(e2.every((e) => e.t === 0 && near(e.dur, 1.5)), 'a chord is several notes at the same t (half note at 80 = 1.5 s)');
eq(SC.events(c, 3).map((e) => e.pitch), ['G4', 'B4', 'D5'], 'chords step 3: G B D');
const r = SC.plan(FX.rhythm.abcMap, 'note'), q = 60 / 88;
eq(r.notes[6].p.length, 0, 'rhythm note 7 is a rest');
eq(SC.events(r, 7), [], 'a rest is silent');
eq(r.steps[6].len, q, 'a rest step lasts its length');
eq(SC.events(r, 3), [{ t: 0, sound: 'note', pitch: 'G4', dur: +(q / 2).toFixed(6), vel: 0.7 }], 'an eighth note lasts half a beat');
ok(r.notes[12].tie, 'rhythm note 13 continues the tie');
eq(SC.events(r, 12)[0].dur, +(3 * q).toFixed(6), 'the tied half note sounds on through the next quarter (3 beats)');
eq(r.steps[11].len, 2 * q, '… while its step lasts 2 beats (it sounds past the end of the step)');
eq(SC.events(r, 13), [], 'the tie continuation does not sound again');
const ev7 = SC.events(kM, 7);
eq(ev7.map((e) => e.pitch).join(' '), 'C4 C4 D4 D4 E4 E4 F4 F4', 'kaeru measure 7 by measure: its 8 notes');
eq(ev7.map((e) => e.t), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => +(i * 30 / 104).toFixed(6)), '… each at its beat');
eq(SC.events(kM, 5).map((e) => e.t), [0, +(2 * 60 / 104).toFixed(6)], 'kaeru measure 5 by measure: C on beats 1 and 3, rests silent');

// ---- 5. which notes each element appears with ----
for (const [name, fx] of Object.entries(FX)) {
  const pl = SC.plan(fx.abcMap, 'note'), a = SC.assign(SC.parseSvg(fx.abcSvg), pl);
  eq(a.missing, [], `${name}: every note of abcMap is an element of the SVG`);
  eq(a.parts.filter((p) => p.note).length, pl.notes.length, `${name}: one element per note`);
  const lastOf = {};
  pl.notes.forEach((x) => { lastOf[x.m] = x.i; });
  const bars = a.parts.filter((p) => /\babcjs-bar\b/.test(p.node.a.class || ''));
  ok(bars.length >= Object.keys(lastOf).length && bars.every((b) => b.i === lastOf[SC.where(b.node.a.class.split(' ')).mm]), `${name}: bar lines appear with the last note of their measure`);
  const fixed = a.parts.filter((p) => p.i === null).map((p) => p.node.a.class || '');
  ok(fixed.some((s) => /abcjs-staff\b/.test(s)) && fixed.some((s) => /abcjs-clef/.test(s)) && fixed.some((s) => /abcjs-time-signature/.test(s)), `${name}: staff, clef and time signature are there from step 0`);
}
{
  const pl = SC.plan(FX.kaeru.abcMap, 'note'), a = SC.assign(SC.parseSvg(FX.kaeru.abcSvg), pl);
  const beams = a.parts.filter((p) => /abcjs-beam-elem/.test(p.node.a.class || '')).map((p) => p.i);
  eq(beams, [22, 26], 'kaeru: the two beams appear with the first eighth note under each');
  const pr = SC.plan(FX.rhythm.abcMap, 'note'), ar = SC.assign(SC.parseSvg(FX.rhythm.abcSvg), pr);
  eq(ar.parts.filter((p) => /abcjs-tie/.test(p.node.a.class || '')).map((p) => p.i), [12], 'rhythm: the tie appears with the note it ends on');
}

// ---- 6. names ----
const p66 = SC.parsePitch('F#4'), pb = SC.parsePitch('Bb3');
eq([SC.label(p66, 'solfa'), SC.label(p66, 'abc'), SC.label(p66, 'iroha')], ['ファ♯', 'F♯', '嬰ヘ'], 'F#4: ファ♯ / F♯ / 嬰ヘ');
eq([SC.label(pb, 'solfa'), SC.label(pb, 'iroha')], ['シ♭', '変ロ'], 'Bb3: シ♭ / 変ロ');
eq(SC.label(SC.parsePitch('C4'), 'none'), null, 'names="none"');
const cn = SC.names(c, 'solfa');
eq(cn[0].rows.map((x) => x.s), ['ソ', 'ミ', 'ド'], 'a chord lists its names from the top note down');
eq(cn[0].x, FX.chords.abcMap.notes[0].box[0] + FX.chords.abcMap.notes[0].box[2] / 2, 'a name sits under the middle of its notehead box');
eq(SC.names(r, 'solfa').length, 11, 'rhythm: no names for the 2 rests and the tie continuation');
const est = (s, size) => [...s].length * size;
const overlaps = (labels) => labels.some((x, i) => labels.some((y, j) => j > i && x.row === y.row && Math.abs(x.x - y.x) < (est(x.s, 26) + est(y.s, 26)) / 2));
const kn = SC.names(SC.plan(FX.kaeru.abcMap, 'note'), 'solfa');
const pk = SC.place(kn, 1.6, 0, 26, est);
ok(!pk.overlap && !overlaps(pk.labels) && pk.rows >= 2, `kaeru at 1.6×: the crowded eighth-note names move to lower rows, none overlap (rows ${pk.rows})`);
const pd = SC.place(SC.names(d, 'solfa'), 1.38, 0, 26, est);
ok(pd.rows === 1 && !pd.overlap, 'doremi at 1.38×: one row of names');
ok(SC.place(kn, 0.3, 0, 26, est).overlap, 'too small: the overlap is reported (the part warns)');
eq(SC.place(cn, 2, 10, 26, est).labels.map((x) => x.row).slice(0, 3), [0, 1, 2], 'a chord takes one row per note');
eq(SC.readable(kM, 'solfa', true).split('｜').slice(0, 2), ['ド レ ミ ファ', 'ミ レ ド'], 'readable layer: kaeru begins 「ド レ ミ ファ｜ミ レ ド」');
eq(SC.readable(c, 'abc', false), '(C・E・G) (F・A・C)｜(G・B・D) (C・E・G)', 'readable layer: chords in brackets (abc)');
eq(SC.readable(r, 'solfa', true).split('｜')[2], 'ソ 休み', 'readable layer: a rest is 休み');

// ---- 7. demo data = fixtures ----
const demo = fs.readFileSync(path.join(ROOT, 'components', 'score', 'demo.html'), 'utf8');
const blocks = [...demo.matchAll(/<script type="application\/json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
eq(blocks.map((b) => b.abcSvg === undefined ? null : Object.keys(FX).find((k) => JSON.stringify(FX[k]) === JSON.stringify(b))), ['doremi', 'rhythm', 'kaeru', 'chords'], 'the demo carries the four fixtures unchanged');

console.log(fail ? `\ntest-score: ${fail} of ${n} failed` : `test-score: ok (${n} checks)`);
process.exit(fail ? 1 : 0);

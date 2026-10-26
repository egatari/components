// m-score's score data (its `static sc`), without a browser, on the abcjs fixtures (components/score/fixtures/*.json):
//   1. the frozen SVG is read into a tree of allowed elements and attributes only (no script, style, title, foreign
//      content, event handlers, links or colours other than currentColor / none), entities decoded
//   2. abcMap parsing and errors (pitch names, tempo, dur, measure, beams, ties, by); the fixtures have the §4.1 fields
//   3. step grouping: one note, chord or rest per step (by="note"), one measure per step (by="measure")
//   4. sound events: pitch, dur in seconds from beats and tempo, chords at one t, notes of a measure at their beat,
//      rests and tie continuations silent, a tied note sounding on through the next note (past the end of its step)
//   5. which notes each SVG element appears with (every note found; bar lines with the last note of their measure,
//      the k-th beam path with the first note of abcMap.beams[k], tie paths with the note they end on from abcMap.ties;
//      a record that does not match the SVG is reported)
//   5b. ties and slurs on the test-only fixture fixtures/ties.json (chords, a chain, across a line break): the order abcjs
//      draws their pieces (SC.arcOrder), checked against the classes abcjs writes on each piece
//   6. note names (solfa, abc, iroha; chords top to bottom) and their placement under the noteheads (x from the box;
//      a measure with a collision zigzags all its names, odd notes up and even notes down; nothing overlaps); the readable layer's text
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
const demo = fs.readFileSync(path.join(ROOT, 'components', 'score', 'demo.html'), 'utf8');
const demoHas = (name) => demo.includes(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'score', 'fixtures', name + '.json'), 'utf8')).abcMap.notes).replace(/</g, '\\u003c'));
const TIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'score', 'fixtures', 'ties.json'), 'utf8'));   // test only, not in the demo
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
const N = (o) => ({ cls: 'abcjs-v0 abcjs-mm0 abcjs-n0', measure: 0, pitch: ['C4'], beat: 0, dur: 1, ...o });
throws(() => SC.plan(map([N({ pitch: ['H4'] })]), 'note'), /pitch "H4" is not a pitch/, 'H4 is not a pitch');
throws(() => SC.plan(map([N({})], 0), 'note'), /tempo/, 'tempo must be > 0');
throws(() => SC.plan(map([N({ dur: 0 })]), 'note'), /dur must be > 0/, 'dur must be > 0');
throws(() => SC.plan(map([N({ cls: 'note0' })]), 'note'), /cls must be abcjs classes/, 'cls must be abcjs classes');
throws(() => SC.plan(map([]), 'note'), /notes is empty/, 'no notes');
throws(() => SC.plan(map([N({})]), 'bar'), /by="bar"/, 'by must be note or measure');
throws(() => SC.plan(null, 'note'), /abcMap is missing/, 'no abcMap');
throws(() => SC.plan(map([N({ measure: undefined, m: 0 })]), 'note'), /measure must be/, 'the field is measure (not m)');
throws(() => SC.plan({ ...map([N({}), N({})]), beams: [[1, 0]] }, 'note'), /beams must be lists of increasing note indices/, 'beams: increasing indices');
throws(() => SC.plan({ ...map([N({}), N({})]), ties: [[0, 5]] }, 'note'), /ties must be/, 'ties: indices inside notes');
throws(() => SC.plan({ ...map([N({}), N({})]), ties: [[0]] }, 'note'), /ties must be/, 'ties: at least two notes');
throws(() => SC.plan({ ...map([N({}), N({})]), slurs: [[1]] }, 'note'), /slurs must be/, 'slurs: at least two notes');
eq(SC.plan({ ...map([N({}), N({ beat: 1 })]), ties: [[0, 1]] }, 'note').sound, [1, 0], 'ties alone (without tie: true) make the second note a continuation: the first sounds 2 beats at 120');
for (const [name, fx] of Object.entries({ ...FX, ties: TIES })) ok(fx.abcMap.notes.every((x) => 'measure' in x && !('m' in x)) && Array.isArray(fx.abcMap.beams) && Array.isArray(fx.abcMap.ties) && Array.isArray(fx.abcMap.slurs), `${name}: fixture has measure, beams and ties (§4.1 of 2026-10-26)`);
eq(FX.kaeru.abcMap.beams, [[22, 23, 24, 25], [26, 27, 28, 29]], 'kaeru: the build recorded the two beam groups of measure 7');
eq(FX.rhythm.abcMap.beams, [[2, 3], [7, 8], [9, 10]], 'rhythm: three beam groups');
eq(FX.rhythm.abcMap.ties, [[11, 12]], 'rhythm: one tie');
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
  eq(a.mismatch, [], `${name}: beams and ties in abcMap match the beam and tie paths of abcSvg`);
  const bars = a.parts.filter((p) => /\babcjs-bar\b/.test(p.node.a.class || ''));
  ok(bars.length >= Object.keys(lastOf).length && bars.every((b) => b.i === lastOf[SC.where(b.node.a.class.split(' ')).mm]), `${name}: bar lines appear with the last note of their measure`);
  const fixed = a.parts.filter((p) => p.i === null).map((p) => p.node.a.class || '');
  ok(fixed.some((s) => /abcjs-staff\b/.test(s)) && fixed.some((s) => /abcjs-clef/.test(s)) && fixed.some((s) => /abcjs-time-signature/.test(s)), `${name}: staff, clef and time signature are there from step 0`);
}
{
  const pl = SC.plan(FX.kaeru.abcMap, 'note'), a = SC.assign(SC.parseSvg(FX.kaeru.abcSvg), pl);
  const beams = a.parts.filter((p) => /abcjs-beam-elem/.test(p.node.a.class || '')).map((p) => p.i);
  eq(beams, [22, 26], 'kaeru: the k-th beam path appears with the first note of beams[k]');
  const pr = SC.plan(FX.rhythm.abcMap, 'note'), ar = SC.assign(SC.parseSvg(FX.rhythm.abcSvg), pr);
  eq(ar.parts.filter((p) => /abcjs-tie/.test(p.node.a.class || '')).map((p) => p.i), [12], 'rhythm: the tie appears with the note it ends on (from ties)');
  eq(ar.parts.filter((p) => /abcjs-beam-elem/.test(p.node.a.class || '')).map((p) => p.i), [2, 7, 9], 'rhythm: three beams, each with its first note');
  const bad = SC.assign(SC.parseSvg(FX.rhythm.abcSvg), SC.plan({ ...FX.rhythm.abcMap, beams: [[2, 3]] }, 'note'));
  ok(bad.mismatch.length === 1 && /beams: 1 in abcMap, 3 in abcSvg/.test(bad.mismatch[0]), 'a build record that does not match the SVG is reported (' + bad.mismatch[0] + ')');
}

// ---- 5b. ties and slurs (fixtures/ties.json, test only): ties in chords, a chain of ties, a tie and a slur from one note,
// a chord tie and a slur across a line break (abcjs draws each in two pieces). The order rule is SC.arcOrder; the classes abcjs
// writes on each piece (abcjs-start-m…-n…, abcjs-end-m…-n… or -edge, abcjs-tie / abcjs-legato) are the independent check here
{
  const fx = TIES, pl = SC.plan(fx.abcMap, 'note');
  eq(fx.abcMap.ties, [[0, 1], [2, 3, 4], [5, 6], [10, 11], [13, 14]], 'ties: chord tie, chain of three, tie under a slur, chord tie across the line break, plain tie');
  eq(fx.abcMap.slurs, [[5, 6, 7, 8], [10, 11, 12]], 'slurs: one on the first line, one across the line break');
  eq(SC.events(pl, 1).map((e) => [e.pitch, e.dur]), [['C4', 2.5], ['E4', 2.5]], 'a tied chord sounds both notes for both halves (4 beats at 96 = 2.5 s)');
  eq(SC.events(pl, 2), [], '… and its continuation is silent');
  eq(SC.events(pl, 3).map((e) => e.dur), [2.5], 'a chain of ties (2 + 1 + 1 beats) sounds once for 4 beats');
  eq([SC.events(pl, 4), SC.events(pl, 5)], [[], []], '… the rest of the chain is silent');
  eq(SC.events(pl, 11).map((e) => [e.pitch, e.dur]), [['G4', 2.5], ['C5', 2.5]], 'a chord tied across the line break sounds on through the next line');
  const tree = SC.parseSvg(fx.abcSvg), a = SC.assign(tree, pl);
  eq([a.mismatch, a.missing], [[], []], 'every tie and slur path is accounted for');
  // the note at (line, m, n) from the note elements' classes
  const at = {};
  a.parts.filter((p) => p.note).forEach((p) => { const w = SC.where(p.node.a.class.split(' ')); at[w.l + ':' + w.m + ':' + w.n] = p.i; });
  const arcs = a.parts.filter((p) => /abcjs-slur/.test(p.node.a.class || ''));
  const got = arcs.map((p) => p.i);
  eq(got, [1, 1, 3, 4, 6, 5, 11, 10, 11, 10, 11, 11, 14], 'each piece appears with its note: ties with the note they lead to, slurs with their first note');
  let checked = 0;
  arcs.forEach((p) => {
    const c = p.node.a.class, w = SC.where(c.split(' '));
    const st = /abcjs-start-m(\d+)-n(\d+)/.exec(c), en = /abcjs-end-m(\d+)-n(\d+)/.exec(c);
    if (/abcjs-legato/.test(c) && st) { checked++; ok(p.i === at[w.l + ':' + st[1] + ':' + st[2]], `slur piece ${c}: with its first note`); }
    if (/abcjs-tie/.test(c) && st && en) { checked++; ok(p.i === at[w.l + ':' + en[1] + ':' + en[2]], `tie piece ${c}: with the note it ends on`); }
  });
  ok(checked === 7, `the 7 pieces whose classes name both ends agree with abcjs's classes (${checked})`);
  const order = SC.arcOrder(pl, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 1, 12: 1, 13: 1, 14: 1 });
  eq(order[0].map((x) => x.kind + x.from + (x.kind === 'tie' ? '.' + x.r : '')), ['tie0.0', 'tie0.1', 'tie2.0', 'tie3.0', 'tie5.0', 'slur5', 'tie10.0', 'slur10', 'tie10.1'],
    'line 1: by start note; at one note the lowest pitch\'s tie, then the slur, then the other pitches\' ties');
  eq(order[1].map((x) => x.kind + x.from + (x.kind === 'tie' ? '.' + x.r : '')), ['slur10', 'tie10.0', 'tie10.1', 'tie13.0'],
    'line 2: the pieces continued from line 1 first (slurs, then ties low to high), then the arcs starting on line 2');
  const noSlurs = SC.assign(tree, SC.plan({ ...fx.abcMap, slurs: [] }, 'note'));
  ok(noSlurs.mismatch.length === 2 && noSlurs.mismatch.every((m) => /ties and slurs on staff line [01]/.test(m)), 'a record without the slurs does not match the SVG on either line: reported');
  ok(demoHas('kaeru') && !demoHas('ties'), 'the ties fixture is a test fixture only, not in the demo');
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
// zigzag: a measure with any collision puts all its names in a zigzag (1st, 3rd, … on the upper row, 2nd, 4th, … on the lower);
// measures without collisions stay on one row
// kaeru has two staff lines (notes 0–13 and 14–32); the part places each line's names on its own, as here
const kl1 = kn.filter((x) => x.i <= 13), kl2 = kn.filter((x) => x.i >= 14);
for (const sc of [1.4, 1.6, 1.75]) {
  const p1 = SC.place(kl1, sc, 0, 26, est), pk = SC.place(kl2, sc, 0, 26, est);
  const m7 = pk.labels.filter((x) => x.i >= 22 && x.i <= 29).map((x) => x.row);
  eq([p1.zig, pk.zig], [[], [6]], `kaeru at ${sc}×: only measure 7 (the eighth notes) is crowded`);
  eq(m7, [0, 1, 0, 1, 0, 1, 0, 1], `kaeru at ${sc}×: measure 7's names zigzag, odd notes up, even notes down`);
  ok(p1.labels.concat(pk.labels.filter((x) => x.i < 22 || x.i > 29)).every((x) => x.row === 0), `kaeru at ${sc}×: every other measure stays on one row`);
  ok(!pk.overlap && !overlaps(pk.labels) && !overlaps(p1.labels) && pk.rows === 2 && p1.rows === 1, `kaeru at ${sc}×: no names overlap; 2 rows on the second line, 1 on the first`);
}
{
  // a made-up measure where only the last two names collide: the whole measure zigzags, not just the colliding name
  const it = [0, 100, 200, 300, 330].map((x, i) => ({ i, m: 0, x, rows: [{ s: 'ファ' }] })).concat([{ i: 5, m: 1, x: 500, rows: [{ s: 'ド' }] }]);
  const pz = SC.place(it, 1, 0, 26, est);
  eq(pz.labels.map((x) => x.row), [0, 1, 0, 1, 0, 0], 'one collision at the end of a measure zigzags the whole measure; the next measure stays on one row');
  // chords: the lower half of the zigzag starts below the measure's tallest chord
  const ch = [0, 20].map((x, i) => ({ i, m: 0, x, rows: [{ s: 'ソ' }, { s: 'ミ' }, { s: 'ド' }] }));
  eq(SC.place(ch, 1, 0, 26, est).labels.map((x) => x.row), [0, 1, 2, 3, 4, 5], 'crowded chords: the second chord\'s names start below the first chord\'s');
}
const pd = SC.place(SC.names(d, 'solfa'), 1.38, 0, 26, est);
ok(pd.rows === 1 && !pd.overlap && pd.zig.length === 0, 'doremi at 1.38×: one row of names, no zigzag');
ok(SC.place(kn, 0.3, 0, 26, est).overlap, 'too small: the overlap is reported (the part warns)');
eq(SC.place(cn, 2, 10, 26, est).labels.map((x) => x.row).slice(0, 3), [0, 1, 2], 'a chord takes one row per note');
eq(SC.readable(kM, 'solfa', true).split('｜').slice(0, 2), ['ド レ ミ ファ', 'ミ レ ド'], 'readable layer: kaeru begins 「ド レ ミ ファ｜ミ レ ド」');
eq(SC.readable(c, 'abc', false), '(C・E・G) (F・A・C)｜(G・B・D) (C・E・G)', 'readable layer: chords in brackets (abc)');
eq(SC.readable(r, 'solfa', true).split('｜')[2], 'ソ 休み', 'readable layer: a rest is 休み');

// ---- 7. demo data = fixtures ----
const blocks = [...demo.matchAll(/<script type="application\/json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
eq(blocks.map((b) => b.abcSvg === undefined ? null : Object.keys(FX).find((k) => JSON.stringify(FX[k]) === JSON.stringify(b))), ['doremi', 'rhythm', 'kaeru', 'chords'], 'the demo carries the four fixtures unchanged');

console.log(fail ? `\ntest-score: ${fail} of ${n} failed` : `test-score: ok (${n} checks)`);
process.exit(fail ? 1 : 0);

// m-keyboard's keys (its `static kb`), without a browser: black-key positions and widths (in white-key widths; C#/D# split
// the C–E group into fifths, F#/G#/A# the F–B group into sevenths, as on a real keyboard), key names (solfa, abc, none;
// ♯ and ♭), the sound events per step (a chord at one t, a scale with increasing t, pitches, dur to the next t or 0.8 s,
// vel 0.7, the step's length to the end of the last note) and range parsing errors.
//   node tools/test-keyboard.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

const classes = {};
const DECK = { define: (tag, C) => { classes[tag] = C; }, MotionElement: class {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'keyboard', 'index.js'), 'utf8'), { DECK, console, Math, String, JSON, Number, Array, Object, Error });
const KB = classes['m-keyboard'].kb;

let fail = 0, n = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const eq = (got, want, msg) => {
  n++;
  const good = typeof want === 'number' ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (!good) { fail++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log('FAIL ' + msg); } };
const throws = (f, re, msg) => { n++; try { f(); fail++; console.log(`FAIL ${msg}: no error`); } catch (e) { if (!re.test(e.message)) { fail++; console.log(`FAIL ${msg}: ${e.message}`); } } };

// ---- key names ----
eq(KB.parseKey('C4').midi, 60, 'C4 = MIDI 60');
eq(KB.parseKey('A4').midi, 69, 'A4 = MIDI 69');
eq(KB.parseKey('C#4').midi, 61, 'C#4 = 61');
eq(KB.parseKey('Db4').midi, 61, 'Db4 = 61');
eq(KB.parseKey('F♯3').name, 'F#3', 'F♯3 is written F#3');
eq(KB.parseKey('B♭4').name, 'Bb4', 'B♭4 is written Bb4');
eq(KB.parseKey('B3').midi + 1, KB.parseKey('C4').midi, 'B3 is just below C4');
for (const bad of ['H4', 'C', 'c4', 'E#4', 'B#3', 'Fb4', 'Cb5', 'C##4', '']) eq(KB.parseKey(bad), null, `"${bad}" is not a key name`);

// ---- range ----
const r = KB.parseRange('C4-C6');
eq([r.lo.midi, r.hi.midi], [60, 84], 'C4-C6');
eq(KB.parseRange('F3-F4').lo.name, 'F3', 'F3-F4 (starts on F)');
eq(KB.parseRange('C3 - C6').hi.midi, 84, 'spaces and 3 octaves');
throws(() => KB.parseRange('C4'), /two key names/, 'one key');
throws(() => KB.parseRange(''), /two key names/, 'empty');
throws(() => KB.parseRange('C4-H5'), /two key names/, 'H5');
throws(() => KB.parseRange('C#4-C6'), /white keys/, 'starts on a black key');
throws(() => KB.parseRange('C4-Bb5'), /white keys/, 'ends on a black key');
throws(() => KB.parseRange('C4-B4'), /11 semitones.*1–3 octaves/, 'less than an octave');
throws(() => KB.parseRange('C4-C4'), /0 semitones/, 'one key only');
throws(() => KB.parseRange('C6-C4'), /-24 semitones/, 'backwards');
throws(() => KB.parseRange('C2-D5'), /38 semitones/, 'more than 3 octaves');
ok(!!KB.parseRange('C4-C5') && !!KB.parseRange('C3-C6'), '1 and 3 octaves are accepted');

// ---- geometry (unit = one white key) ----
const g = KB.keys(KB.parseRange('C4-C5'));
eq(g.n, 8, 'C4-C5 has 8 white keys');
eq(g.all.length, 13, 'C4-C5 has 13 keys');
const black = g.all.filter((k) => !k.white);
eq(black.map((k) => k.midi), [61, 63, 66, 68, 70], 'black keys C# D# F# G# A#');
const cx = Object.fromEntries(black.map((k) => [k.midi, k.cx]));
eq(cx[61], 0.9, 'C# centre: 3 whites in fifths, slot 2 (0.9)');
eq(cx[63], 2.1, 'D# centre: slot 4 (2.1)');
eq(cx[66], 3 + 6 / 7, 'F# centre: 4 whites in sevenths, slot 2');
eq(cx[68], 5, 'G# centre: on the G–A boundary');
eq(cx[70], 3 + 22 / 7, 'A# centre: slot 6');
ok(cx[61] < 1 && cx[63] > 2, 'C# and D# lean outwards from their boundaries');
ok(cx[66] < 4 && cx[70] > 6, 'F# and A# lean outwards from their boundaries');
for (const k of black) {
  eq(k.w, 0.58, `MIDI ${k.midi}: black key 0.58 of a white key wide`);
  eq(k.x + k.w / 2, k.cx, `MIDI ${k.midi}: x + w/2 = centre`);
  ok(k.x > k.below && k.x + k.w < k.below + 2, `MIDI ${k.midi}: over the line between its two white keys`);
  ok(Math.abs(k.cx - (k.below + 1)) < 0.15, `MIDI ${k.midi}: within 0.15 of that line`);
}
// neighbouring black keys never touch; whites tile with no gap
for (let i = 1; i < black.length; i++) ok(black[i].x - (black[i - 1].x + black[i - 1].w) > 0.3, `black keys ${black[i - 1].midi} and ${black[i].midi} apart`);
g.whites.forEach((w, i) => { eq(w.x, i, `white ${w.midi} at ${i}`); eq(w.w, 1, `white ${w.midi} width 1`); });
// the same pattern in every octave, from a range starting on another white key
const g2 = KB.keys(KB.parseRange('D3-G5'));
const byPc = {};
for (const k of g2.all.filter((x) => !x.white)) (byPc[k.pc] ||= []).push(k.cx - k.below);
for (const [pc, v] of Object.entries(byPc)) ok(v.every((x) => near(x, v[0])), `pc ${pc}: same offset in every octave (${v.map((x) => x.toFixed(3)).join(', ')})`);
ok(!g2.all.some((k) => k.midi === 49), 'D3-G5: no C#3 (below the range)');
eq(g2.n, 18, 'D3-G5 has 18 white keys');

// ---- names ----
const lab = (s, names) => KB.label(KB.parseKey(s), names);
eq(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].map((s) => lab(s, 'solfa')), ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'], 'solfa');
eq(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].map((s) => lab(s, 'abc')), ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 'abc');
eq(lab('C#4', 'solfa'), 'ド♯', 'C#4 solfa');
eq(lab('C#4', 'abc'), 'C♯', 'C#4 abc');
eq(lab('Db4', 'solfa'), 'レ♭', 'Db4 solfa');
eq(lab('Bb3', 'abc'), 'B♭', 'Bb3 abc');
eq(lab('F#5', 'solfa'), 'ファ♯', 'F#5 solfa');
eq(lab('C4', 'none'), null, 'none');
eq(g.whites.map((w) => KB.whiteLetter(w.midi)).join(''), 'CDEFGABC', 'white keys of C4-C5');

// ---- events ----
const chord = KB.notes({ keys: ['C4', 'E4', 'G4'] });
eq(chord.map((e) => e.t), [0, 0, 0], 'chord: one t');
eq(chord.map((e) => e.pitch), ['C4', 'E4', 'G4'], 'chord: pitches');
ok(chord.every((e) => e.sound === 'note' && e.vel === 0.7 && e.dur === 0.8), 'chord: note, vel 0.7, dur 0.8');
eq(KB.length({ keys: ['C4', 'E4', 'G4'] }), 0.8, 'chord: step length 0.8');
const scaleStep = { keys: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], t: [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2] };
const scale = KB.notes(scaleStep);
ok(scale.every((e, i) => i === 0 || e.t > scale[i - 1].t), 'scale: t increasing');
eq(scale.map((e) => e.pitch), scaleStep.keys, 'scale: pitches');
eq(scale.map((e) => e.dur), [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.8], 'scale: each note reaches the next t, the last 0.8');
eq(KB.length(scaleStep), 5.0, 'scale: step length = 4.2 + 0.8');
eq(KB.notes({ keys: ['C4', 'C#4'], t: [0, 0.8], dur: 1.5 }).map((e) => e.dur), [1.5, 1.5], 'step dur wins');
eq(KB.notes({ keys: ['C4'] }, 2).map((e) => e.dur), [2], 'top-level dur');
eq(KB.length({ keys: ['C4', 'E4'], t: [0, 1], dur: 2 }), 3, 'length = last t + dur');
eq(KB.notes({ keys: ['C♯4'] })[0].pitch, 'C#4', 'pitch written with #');
// broken chord then chord: notes at the same t share the next later t
eq(KB.notes({ keys: ['C4', 'E4', 'G4', 'C5'], t: [0, 0, 0.5, 0.5] }).map((e) => e.dur), [0.5, 0.5, 0.8, 0.8], 'two chords: first to the second, second 0.8');

console.log(fail ? `\nFAIL: ${fail} of ${n}` : `test-keyboard: ${n} checks ok`);
process.exit(fail ? 1 : 0);

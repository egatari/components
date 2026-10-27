// m-score's score data (its `static sc`), without a browser, on the abcjs fixtures (components/score/fixtures/*.json):
//   1. the frozen SVG is read into a tree of allowed elements and attributes only (no script, style, title, foreign
//      content, event handlers, links or colours other than currentColor / none), entities decoded
//   2. abcMap parsing and errors (pitch names, tempo, dur, measure, beams, arcs, by); held pitches from tie arcs; the fixtures have the §4.1 fields
//   3. step grouping: one note, chord or rest per step (by="note"), one measure per step (by="measure")
//   4. sound events: pitch, dur in seconds from beats and tempo, chords at one t, notes of a measure at their beat,
//      rests and tie continuations silent, a tied note sounding on through the next note (past the end of its step)
//   5. which notes each SVG element appears with (every note found; bar lines with the last note of their measure,
//      the k-th beam path with the first note of abcMap.beams[k], arc lines by data-arc;
//      a record that does not match the SVG is reported)
//   5b. ties and slurs on the test-only fixture fixtures/ties.json (chords, a chain, across a line break, one pitch of a
//      chord): arc lines picked by data-arc only, checked against the classes abcjs writes on each piece; sound per pitch
//   6. note names (solfa, abc, iroha; chords top to bottom) and their placement under the noteheads (x from the box;
//      a measure with a collision zigzags all its names, odd notes up and even notes down; nothing overlaps); the readable layer's text
//   7. the demo carries the fixtures unchanged
//   node tools/test-score.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './studio.mjs';
import { partClass } from './parts.mjs';

// the part's class read without a browser (tools/parts.mjs partClass: a stub registry; the score data needs no DOM)
const SC = partClass(fs.readFileSync(path.join(ROOT, 'components', 'score', 'index.js'), 'utf8'), 'score/index.js').sc;
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
eq(SC.plan(map([N({ cls: 'anything' }), N({ cls: undefined, beat: 1 })]), 'note').steps.length, 2, 'cls is the adapter\'s record: the part does not read it');
throws(() => SC.plan(map([]), 'note'), /notes is empty/, 'no notes');
throws(() => SC.plan(map([N({})]), 'bar'), /by="bar"/, 'by must be note or measure');
throws(() => SC.plan(null, 'note'), /abcMap is missing/, 'no abcMap');
throws(() => SC.plan(map([N({ measure: undefined, m: 0 })]), 'note'), /measure must be/, 'the field is measure (not m)');
throws(() => SC.plan({ ...map([N({}), N({})]), beams: [[1, 0]] }, 'note'), /beams must be lists of increasing note indices/, 'beams: increasing indices');
const A = (arcs, notes = [N({}), N({ beat: 1 })]) => ({ ...map(notes), arcs });
throws(() => SC.plan(A([{ kind: 'bind', from: 0, to: 1, n: 0 }]), 'note'), /kind must be "tie" or "slur"/, 'arcs: kind tie or slur');
throws(() => SC.plan(A([{ kind: 'slur', from: 1, to: 0, n: 0 }]), 'note'), /from < to/, 'arcs: from before to');
throws(() => SC.plan(A([{ kind: 'slur', from: 0, to: 5, n: 0 }]), 'note'), /from < to/, 'arcs: indices inside notes');
throws(() => SC.plan(A([{ kind: 'slur', from: 0, to: 1, n: 0 }, { kind: 'slur', from: 0, to: 1, n: 0 }]), 'note'), /\.n must be a number used once/, 'arcs: n used once');
throws(() => SC.plan(A([{ kind: 'tie', from: 0, to: 1, n: 0 }]), 'note'), /a tie needs a pitch/, 'arcs: a tie needs its pitch');
throws(() => SC.plan(A([{ kind: 'tie', from: 0, to: 1, pitch: 'E4', n: 0 }]), 'note'), /a tie needs a pitch .* that both notes have/, 'arcs: the tie\'s pitch is in both notes');
eq(SC.plan(A([{ kind: 'tie', from: 0, to: 1, pitch: 'C4', n: 0 }]), 'note').sound, [[1], [0]], 'a tie arc makes its pitch at `to` a continuation: the first note sounds 2 beats at 120');
eq(SC.plan(A([{ kind: 'tie', from: 0, to: 1, pitch: 'C4', n: 0 }], [N({ pitch: ['C4', 'E4'] }), N({ beat: 1, pitch: ['C4', 'E4'] })]), 'note').sound, [[1, 0.5], [0, 0.5]],
  'a tie on one pitch of a chord: only that pitch is held, the other pitch sounds again');
eq(SC.plan(A([{ kind: 'slur', from: 0, to: 1, n: 0 }]), 'note').sound, [[0.5], [0.5]], 'a slur does not change the sound');
ok(SC.plan(map([N({ tie: true }), N({ beat: 1, tie: true })]), 'note').sound[1][0] === 0.5, 'the old note-level tie: true is not read');
for (const [name, fx] of Object.entries({ ...FX, ties: TIES })) ok(fx.abcMap.notes.every((x) => 'measure' in x && !('m' in x) && !('tie' in x)) && Array.isArray(fx.abcMap.beams) && Array.isArray(fx.abcMap.arcs) && !('ties' in fx.abcMap) && !('slurs' in fx.abcMap), `${name}: fixture has measure, beams and arcs, no tie / ties / slurs (§4.1)`);
eq(FX.kaeru.abcMap.beams, [[22, 23, 24, 25], [26, 27, 28, 29]], 'kaeru: the build recorded the two beam groups of measure 7');
eq(FX.rhythm.abcMap.beams, [[2, 3], [7, 8], [9, 10]], 'rhythm: three beam groups');
eq(FX.rhythm.abcMap.arcs, [{ kind: 'tie', from: 11, to: 12, pitch: 'G4', n: 0 }], 'rhythm: one tie arc');
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
ok(r.notes[12].tie && r.notes[12].p[0].held, 'rhythm note 13 continues the tie (from the tie arc)');
eq(SC.events(r, 12)[0].dur, +(3 * q).toFixed(6), 'the tied half note sounds on through the next quarter (3 beats)');
eq(r.steps[11].len, 2 * q, '… while its step lasts 2 beats (it sounds past the end of the step)');
eq(SC.events(r, 13), [], 'the tie continuation does not sound again');
const ev7 = SC.events(kM, 7);
eq(ev7.map((e) => e.pitch).join(' '), 'C4 C4 D4 D4 E4 E4 F4 F4', 'kaeru measure 7 by measure: its 8 notes');
eq(ev7.map((e) => e.t), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => +(i * 30 / 104).toFixed(6)), '… each at its beat');
eq(SC.events(kM, 5).map((e) => e.t), [0, +(2 * 60 / 104).toFixed(6)], 'kaeru measure 5 by measure: C on beats 1 and 3, rests silent');

// ---- 5. which notes each element appears with (by the build's data- tags only) ----
// abcjs's own classes, read here only as an independent check of the tags (the part never reads them)
const where = (c) => { const g = (re) => { const x = re.exec(c || ''); return x ? +x[1] : null; }; return { l: g(/\babcjs-l(\d+)\b/), m: g(/\babcjs-m(\d+)\b/), mm: g(/\babcjs-mm(\d+)\b/), n: g(/\babcjs-n(\d+)\b/), v: g(/\babcjs-v(\d+)\b/) }; };
const stripClasses = (svg) => svg.replace(/ class="([^"]*)"/g, (all, c) => { const k = c.split(/\s+/).filter((x) => x && !/^abcjs-/.test(x)); return k.length ? ` class="${k.join(' ')}"` : ''; });
const tagOf = (p) => ['data-note', 'data-beam', 'data-measure', 'data-arc'].find((t) => p.node.a[t] !== undefined) || null;
for (const [name, fx] of Object.entries(FX)) {
  const pl = SC.plan(fx.abcMap, 'note'), a = SC.assign(SC.parseSvg(fx.abcSvg), pl);
  eq([a.missing, a.mismatch], [[], []], `${name}: every note, beam, bar line and arc line is tagged and known`);
  const notes = a.parts.filter((p) => p.note);
  eq(notes.length, pl.notes.length, `${name}: one element per note`);
  ok(notes.every((p) => { const w = where(p.node.a.class), c = fx.abcMap.notes[p.i].cls; return c === `abcjs-v${w.v} abcjs-mm${w.mm} abcjs-n${w.n}`; }), `${name}: data-note picks the same element as the adapter's cls record`);
  const lastOf = {};
  pl.notes.forEach((x) => { lastOf[x.m] = x.i; });
  const bars = a.parts.filter((p) => p.node.a['data-measure'] !== undefined);
  ok(bars.length === Object.keys(lastOf).length && bars.every((b) => b.i === lastOf[+b.node.a['data-measure']] && /\babcjs-bar\b/.test(b.node.a.class)), `${name}: one bar line a measure (data-measure), with the last note of its measure`);
  const fixed = a.parts.filter((p) => p.i === null).map((p) => p.node.a.class || '');
  ok(fixed.some((s) => /abcjs-staff\b/.test(s)) && fixed.some((s) => /abcjs-clef/.test(s)) && fixed.some((s) => /abcjs-time-signature/.test(s)), `${name}: staff, clef and time signature (untagged) are there from step 0`);
  // without any abcjs class the part assigns every element the same way (the classes are not read)
  const b = SC.assign(SC.parseSvg(stripClasses(fx.abcSvg)), pl);
  eq([b.mismatch, b.missing, b.parts.map((p) => [p.i, p.top, !!p.note, tagOf(p)])], [[], [], a.parts.map((p) => [p.i, p.top, !!p.note, tagOf(p)])], `${name}: with every abcjs-* class stripped, the same elements appear at the same notes`);
}
ok(!/class="[^"]*abcjs-/.test(stripClasses(FX.kaeru.abcSvg)), 'the stripped SVG has no abcjs-* class left');
{
  const pl = SC.plan(FX.kaeru.abcMap, 'note'), a = SC.assign(SC.parseSvg(FX.kaeru.abcSvg), pl);
  const beams = a.parts.filter((p) => p.node.a['data-beam'] !== undefined);
  eq(beams.map((p) => p.i), [22, 26], 'kaeru: data-beam k appears with the first note of beams[k]');
  ok(beams.every((p) => /abcjs-beam-elem/.test(p.node.a.class)), '… and those are abcjs\'s beam paths');
  const pr = SC.plan(FX.rhythm.abcMap, 'note'), ar = SC.assign(SC.parseSvg(FX.rhythm.abcSvg), pr);
  eq(ar.parts.filter((p) => p.node.a['data-arc'] !== undefined).map((p) => p.i), [12], 'rhythm: the tie line (data-arc 0) appears with the note it leads to');
  eq(ar.parts.filter((p) => p.node.a['data-beam'] !== undefined).map((p) => p.i), [2, 7, 9], 'rhythm: three beams, each with its first note');
  // untagged or unknown elements are reported (and then shown from step 0, never guessed)
  const untag = (svg, attr, v) => svg.replace(` ${attr}="${v}"`, '');
  const n3 = SC.assign(SC.parseSvg(untag(FX.rhythm.abcSvg, 'data-note', 3)), pr);
  eq([n3.missing, n3.mismatch], [[3], ['no element has data-note for abcMap.notes[3]']], 'a note element without data-note is reported');
  ok(n3.parts.some((p) => p.i === null && p.node.a.class && /abcjs-n1\b/.test(p.node.a.class) && /abcjs-mm1\b/.test(p.node.a.class)), '… and that element is shown from step 0 (not guessed from its classes)');
  const b1 = SC.assign(SC.parseSvg(untag(FX.rhythm.abcSvg, 'data-beam', 1)), pr);
  eq(b1.mismatch, ['no element has data-beam="1"'], 'a beam without data-beam is reported');
  const m2 = SC.assign(SC.parseSvg(FX.rhythm.abcSvg.replace('data-measure="2"', 'data-measure="99"')), pr);
  eq(m2.mismatch, ['data-measure="99" is not a measure of abcMap.notes'], 'an unknown data-measure is reported');
  const bad = SC.assign(SC.parseSvg(FX.rhythm.abcSvg), SC.plan({ ...FX.rhythm.abcMap, beams: [[2, 3]] }, 'note'));
  eq(bad.mismatch, ['data-beam="1" is not an index of abcMap.beams', 'data-beam="2" is not an index of abcMap.beams'], 'beams in abcMap that do not match the tagged paths are reported');
  const dup = SC.assign(SC.parseSvg(FX.rhythm.abcSvg.replace('data-note="4"', 'data-note="3"')), pr);
  ok(dup.mismatch.includes('data-note="3" is used twice') && dup.missing.includes(4), 'a data-note used twice is reported');
}

// ---- 5b. ties and slurs (fixtures/ties.json, test only): ties in a chord, a chain of ties, a tie and a slur from one note,
// a chord tie and a slur across a line break (drawn in two pieces), a tie on one pitch of a chord ([C-EG] [CEG]).
// The part picks arc lines only by data-arc; the classes abcjs writes on each piece are the independent check here
{
  const fx = TIES, pl = SC.plan(fx.abcMap, 'note');
  const ak = (a) => a.kind + ' ' + a.from + '→' + a.to + (a.pitch ? ' ' + a.pitch : '');
  eq(fx.abcMap.arcs.map(ak), ['tie 0→1 C4', 'tie 0→1 E4', 'tie 2→3 G4', 'tie 3→4 G4', 'tie 5→6 A4', 'slur 5→8', 'tie 10→11 C5', 'tie 10→11 G4', 'slur 10→12', 'tie 13→14 C5', 'tie 15→16 C4'],
    'arcs: a tie per pitch (chord, chain, under a slur, across the line break, one pitch of a chord) and two slurs');
  eq(fx.abcMap.arcs.map((a) => a.n), fx.abcMap.arcs.map((_, k) => k), 'arcs: n numbers them');
  eq(SC.events(pl, 1).map((e) => [e.pitch, e.dur]), [['C4', 2.5], ['E4', 2.5]], 'a tied chord sounds both notes for both halves (4 beats at 96 = 2.5 s)');
  eq(SC.events(pl, 2), [], '… and its continuation is silent');
  eq(SC.events(pl, 3).map((e) => e.dur), [2.5], 'a chain of ties (2 + 1 + 1 beats) sounds once for 4 beats');
  eq([SC.events(pl, 4), SC.events(pl, 5)], [[], []], '… the rest of the chain is silent');
  eq(SC.events(pl, 11).map((e) => [e.pitch, e.dur]), [['G4', 2.5], ['C5', 2.5]], 'a chord tied across the line break sounds on through the next line');
  eq(SC.events(pl, 16).map((e) => [e.pitch, e.dur]), [['C4', 2.5], ['E4', 1.25], ['G4', 1.25]], '[C-EG]: C sounds for both chords, E and G for their own half note');
  eq(SC.events(pl, 17).map((e) => [e.pitch, e.dur]), [['E4', 1.25], ['G4', 1.25]], '[CEG] after [C-EG]: E and G sound again, C does not');
  eq(SC.names(pl, 'solfa').filter((n) => n.i === 16)[0].rows.map((x) => x.s), ['ソ', 'ミ'], 'no name under the held C of the second chord');
  ok(SC.readable(pl, 'solfa', true).endsWith('（ド・ミ・ソ） （〜・ミ・ソ）'), 'readable layer: the held pitch of a chord is 〜');
  const tree = SC.parseSvg(fx.abcSvg), a = SC.assign(tree, pl);
  eq([a.mismatch, a.missing], [[], []], 'every arc line has a data-arc of abcMap.arcs');
  const lines = a.parts.filter((p) => /abcjs-slur/.test(p.node.a.class || ''));
  eq(a.parts.filter((p) => p.node.a['data-arc'] !== undefined).length, lines.length, 'every abcjs arc line carries data-arc');
  ok(lines.length === 13 && lines.every((p) => p.node.a['data-arc'] !== undefined), `the build tagged all ${lines.length} arc lines (the hidden duplicate slur line was dropped)`);
  const byArc = {};
  lines.forEach((p) => { (byArc[p.node.a['data-arc']] = byArc[p.node.a['data-arc']] || []).push(p.i); });
  eq(Object.keys(byArc).sort((x, y) => x - y).map((k) => k + ':' + byArc[k].join(',')), ['0:1', '1:1', '2:3', '3:4', '4:6', '5:5', '6:11,11', '7:11,11', '8:10', '9:14', '10:16'],
    'each arc\'s lines appear with its note: ties with `to`, slurs with `from`; the chord tie across the break has 2 lines a pitch, the slur across it only its second line');
  // independent check: abcjs's own classes on the lines that name both ends
  const at = {};
  a.parts.filter((p) => p.note).forEach((p) => { const w = where(p.node.a.class); at[w.l + ':' + w.m + ':' + w.n] = p.i; });
  let checked = 0;
  lines.forEach((p) => {
    const c = p.node.a.class, w = where(c);
    const st = /abcjs-start-m(\d+)-n(\d+)/.exec(c), en = /abcjs-end-m(\d+)-n(\d+)/.exec(c);
    if (/abcjs-legato/.test(c) && st) { checked++; ok(p.i === at[w.l + ':' + st[1] + ':' + st[2]], `slur line ${c}: with its first note`); }
    if (/abcjs-tie/.test(c) && st && en) { checked++; ok(p.i === at[w.l + ':' + en[1] + ':' + en[2]], `tie line ${c}: with the note it ends on`); }
  });
  ok(checked === 8, `the 8 lines whose classes name both ends agree with abcjs's classes (${checked})`);
  // the part reads nothing but data-arc: without it, the arc lines are reported, never guessed from class or order
  const bare = SC.parseSvg(fx.abcSvg.replace(/ data-arc="\d+"/g, ''));
  const b2 = SC.assign(bare, pl);
  eq(b2.mismatch, ['no element has data-arc for abcMap.arcs n 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10'], 'arc lines without data-arc: every arc without a line is reported');
  ok(b2.parts.filter((p) => /abcjs-slur/.test(p.node.a.class || '')).every((p) => p.i === null), '… and the untagged lines are shown from step 0, not guessed');
  const wrong = SC.assign(tree, SC.plan({ ...fx.abcMap, arcs: fx.abcMap.arcs.slice(0, 5) }, 'note'));
  ok(wrong.mismatch.some((m) => /data-arc="7" is not an n of abcMap.arcs/.test(m)), 'a data-arc without its arc is reported');
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

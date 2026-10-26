// m-score's fixtures and demo: renders ABC with abcjs in headless Chrome, as Studio's build will (components 2.0 design §4.1),
// and writes components/score/fixtures/<name>.json = {abc, abcSvg, abcMap, renderer} and components/score/demo.html.
// It is the stand-in for the build hook and the reference for whoever writes it: everything abcjs-specific (classes, the
// order abcjs draws arcs in, its quirks) lives here and in components/score/fixtures/ABCJS-ADAPTER.md, never in the part.
//   npm install abcjs@6.7.2 in a scratch folder outside this repository (abcjs is not a dependency of this repository), then
//   ABCJS_DIR=<that folder>/node_modules/abcjs node tools/score-fixtures.mjs          write the fixtures and the demo
// The browser is the pinned Egatari Studio's launcher (tools/studio.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';

const ABCJS = process.env.ABCJS_DIR;
if (!ABCJS || !fs.existsSync(path.join(ABCJS, 'dist', 'abcjs-basic.js'))) { console.error('set ABCJS_DIR to an installed abcjs package (npm install abcjs@6.7.2 outside this repository)'); process.exit(2); }
const VERSION = JSON.parse(fs.readFileSync(path.join(ABCJS, 'package.json'), 'utf8')).version;
if (VERSION !== '6.7.2') console.warn(`abcjs ${VERSION}: the fixtures and ABCJS-ADAPTER.md were made with 6.7.2`);
const DIR = path.join(ROOT, 'components', 'score');
const H = '%%printtempo false\n';   // abcjs writes the tempo at about 20 units, below the 24 px floor: the slide says it instead
const TUNES = [
  { name: 'doremi', staffwidth: 760, abc: 'X:1\nM:4/4\nL:1/4\n' + H + 'Q:1/4=96\nK:C\nC D E F | G A B c | c B A G | F E D C |]' },
  { name: 'rhythm', staffwidth: 760, abc: 'X:1\nM:2/4\nL:1/8\n' + H + 'Q:1/4=88\nK:C\nG2 G2 | GG G2 | G2 z2 | GG GG | G4- | G2 z2 |]' },
  { name: 'kaeru', staffwidth: 640, abc: 'X:1\nM:4/4\nL:1/4\n' + H + 'Q:1/4=104\nK:C\nC D E F | E D C2 | E F G A | G F E2 |\nC z C z | C z C z | C/C/D/D/ E/E/F/F/ | E D C2 |]' },
  // test fixture only (not in demo.html): ties in a chord, a chain of ties, a tie and a slur from one note, a chord tie and a
  // slur across a line break, a tie on one note of a chord ([C-EG] [CEG])
  { name: 'ties', staffwidth: 640, test: true, abc: 'X:1\nM:4/4\nL:1/4\n' + H + 'Q:1/4=96\nK:C\n[CE]2- [CE]2 | G2- G- G | (A- A B c) | e2 ([Gc]2- |\n[Gc]2 B) c- | c4 | [C-EG]2 [CEG]2 |]' },
  { name: 'chords', staffwidth: 520, abc: 'X:1\nM:4/4\nL:1/2\n' + H + 'Q:1/4=80\nK:C\n[CEG] [FAc] | [GBd] [CEG] |]' },
];
const DEMO = [
  ['doremi', 'ドレミの音階', 'names="solfa"', 'ドから上のドまで上がって、また下がる音階の楽譜', 220, '→ ドレミファソラシド：線と間を 1 つずつ上がる'],
  ['rhythm', 'リズムのれんしゅう（2/4 拍子）', '', '四分音符・八分音符・四分休符・タイのリズムの楽譜', 240, '→ 八分音符 2 つで四分音符 1 つ分。タイでつないだ音は切らずにのばす'],
  ['kaeru', 'かえるの合唱（ドイツ民謡）', 'by="measure" names="solfa"', 'かえるの合唱の楽譜 8 小節', 420, '→ 1 小節ずつ：同じ形のくり返しを見つけよう'],
  ['chords', '主要三和音（Ⅰ・Ⅳ・Ⅴ・Ⅰ）', 'names="solfa"', 'ハ長調の和音 ドミソ、ファラド、ソシレ、ドミソ', 400, '→ どの和音も、線か間に 3 つの音を重ねる'],
];

// In the page: render one tune and read abcjs's own data (see ABCJS-ADAPTER.md for each rule)
function adapt({ abc, staffwidth }) {
  const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  const d = document.getElementById('d'); d.textContent = '';
  const tune = ABCJS.renderAbc('d', abc, { add_classes: true, staffwidth })[0];
  tune.setUpAudio();   // fills midiPitches (the sounding pitch, after the key signature and accidentals)
  const tq = tune.metaText.tempo, tempo = tq ? tq.bpm * tq.duration.reduce((a, x) => a + x, 0) * 4 : 120;
  const r3 = (x) => Math.round(x * 1e3) / 1e3;
  const notes = [], els = [];
  let beat = 0, trip = 1;
  const name = (e, q, i) => {
    // letter and octave from abcjs's diatonic step (0 = C4), accidental from the sounding MIDI pitch
    const p = e.pitches[q], oct = Math.floor(p.pitch / 7) + 4, li = ((p.pitch % 7) + 7) % 7;
    const nat = 12 * (oct + 1) + NAT[li];
    let mid = e.midiPitches && e.midiPitches[q] ? e.midiPitches[q].pitch : null;
    if (mid === null) {   // a tied continuation has no midiPitches: the same sounding pitch as the note the tie comes from
      for (let j = i - 1; j >= 0 && mid === null; j--) { const k = notes[j].steps.indexOf(p.pitch); if (k >= 0) mid = notes[j].midi[k]; }
      if (mid === null) mid = nat;
    }
    const acc = mid - nat;
    return { s: LET[li] + (acc === 1 ? '#' : acc === -1 ? 'b' : acc === 2 ? '##' : acc === -2 ? 'bb' : '') + oct, midi: mid };
  };
  tune.lines.forEach((L) => (L.staff || []).slice(0, 1).forEach((S) => S.voices.slice(0, 1).forEach((V) => V.forEach((e) => {
    if (e.el_type === 'bar') {
      // a bar line closes the measure it ends: data-measure from abcjs's abcjs-mm class on it (the part reads no class)
      const bg = e.abselem && e.abselem.elemset && e.abselem.elemset[0], bm = bg && /\babcjs-mm(\d+)\b/.exec(bg.getAttribute('class') || '');
      if (bm) bg.setAttribute('data-measure', bm[1]);
      beat = 0; return;
    }
    if (e.el_type !== 'note') return;
    if (e.startTriplet) trip = e.tripletMultiplier || 1;
    const g = e.abselem.elemset[0], c = g.getAttribute('class');
    const cv = (k) => +(new RegExp('\\babcjs-' + k + '(\\d+)\\b').exec(c) || [])[1];
    const dur = e.duration * 4 * trip;
    const heads = [...g.querySelectorAll('.abcjs-notehead')];
    const bx = (heads.length ? heads : [g]).map((h) => h.getBBox());
    const x0 = Math.min(...bx.map((q) => q.x)), y0 = Math.min(...bx.map((q) => q.y)), x1 = Math.max(...bx.map((q) => q.x + q.width)), y1 = Math.max(...bx.map((q) => q.y + q.height));
    const i = notes.length;
    const ps = e.rest ? [] : e.pitches.map((_, q) => name(e, q, i));
    e._idx = i;
    g.setAttribute('data-note', String(i));   // the note's or rest's <g>: the part finds it by this, never by abcjs-v / -mm / -n
    notes.push({ out: { cls: 'abcjs-v' + cv('v') + ' abcjs-mm' + cv('mm') + ' abcjs-n' + cv('n'), measure: cv('mm'), pitch: ps.map((x) => x.s), beat: r3(beat), dur: r3(dur), box: [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v * 100) / 100) },
      steps: e.rest ? [] : e.pitches.map((p) => p.pitch), midi: ps.map((x) => x.midi), e });
    beat += dur;
    if (e.endTriplet) trip = 1;
  }))));
  // beams: abcjs draws one path per beam group, in voice.beams order (the k-th abcjs-beam-elem path is beams[k])
  const beams = [];
  tune.lines.forEach((L) => { if (!L.staffGroup) return; L.staffGroup.voices.slice(0, 1).forEach((V) => (V.beams || []).forEach((b) => {
    if (b === 'bar' || !b.elems) return;
    const ix = b.elems.map((a) => a.abcelem && a.abcelem._idx).filter((x) => x !== undefined);
    if (ix.length) beams.push(ix);
  })); });
  // data-beam: the k-th abcjs-beam-elem path in document order is beams[k] (drawBeam draws one path per group, in voice.beams order)
  const beamEls = [...d.querySelectorAll('.abcjs-beam-elem')];
  if (beamEls.length !== beams.length) throw new Error(`${beamEls.length} beam paths but ${beams.length} beam groups`);
  beamEls.forEach((el, k) => el.setAttribute('data-beam', String(k)));
  // arcs from the parsed notes: a tie per pitch (startTie on pitch q of note i, ended by the next note whose pitch with the
  // same diatonic step has endTie, as abcjs matches them), a slur per startSlur / endSlur label (on the note or a pitch)
  const arcs = [], openTie = [], openSlur = {};
  const lab = (x) => (typeof x === 'object' && x !== null ? x.label : x);
  notes.forEach((n, i) => {
    const e = n.e;
    if (e.rest) return;
    e.pitches.forEach((p, q) => {
      if (p.endTie) {
        const k = openTie.findIndex((t) => t.step === p.pitch);
        const t = k >= 0 ? openTie.splice(k, 1)[0] : openTie.shift();
        if (t) arcs.push({ kind: 'tie', from: t.from, to: i, pitch: n.out.pitch[q] });
      }
      if (p.startTie) openTie.push({ from: i, step: p.pitch });
    });
    const ends = [].concat(e.endSlur || [], ...e.pitches.map((p) => p.endSlur || []));
    const starts = [].concat(e.startSlur || [], ...e.pitches.map((p) => p.startSlur || []));
    ends.forEach((x) => { const a = openSlur[lab(x)]; if (a !== undefined) { arcs.push({ kind: 'slur', from: a, to: i }); delete openSlur[lab(x)]; } });
    starts.forEach((x) => { openSlur[lab(x)] = i; });
  });
  arcs.sort((a, b) => a.from - b.from || a.to - b.to || (a.kind === b.kind ? 0 : a.kind === 'tie' ? -1 : 1) || String(a.pitch).localeCompare(String(b.pitch)));
  arcs.forEach((a, k) => { a.n = k; });
  // tag every drawn arc piece with data-arc. abcjs keeps each drawn arc as a TieElem in the voice's otherchildren, with its
  // path in elemset; anchor1 / anchor2 are the noteheads at its ends. A TieElem does not say whether it is a tie or a slur,
  // and a piece cut by a line break has only one anchor (abcjs recreates the open arcs at each new line). So: a piece with
  // both anchors matches the one arc between those notes (a tie also by pitch); a piece with one anchor can match a tie and a
  // slur at the same note, and then abcjs's creation order decides (ABCJS-ADAPTER.md): on the line where they start, the
  // lowest pitch's tie comes before the slur; at the start of the next line, recreated slurs come before ties.
  const headInfo = (h) => { const e = h.parent.abcelem, i = e._idx; const q = h.parent.heads ? h.parent.heads.indexOf(h) : -1; return { i, pitch: i !== undefined && q >= 0 ? notes[i].out.pitch[q] : null }; };
  const pieces = [];
  tune.lines.forEach((L) => { if (!L.staffGroup) return; L.staffGroup.voices.slice(0, 1).forEach((V) => (V.otherchildren || []).forEach((te) => {
    if (!te || te.type !== 'TieElem' || !te.elemset || !te.elemset[0]) return;
    pieces.push({ el: te.elemset[0], a1: te.anchor1 ? headInfo(te.anchor1) : null, a2: te.anchor2 ? headInfo(te.anchor2) : null });
  })); });
  const problems = [], used = new Set();
  pieces.forEach((p) => {
    const side = p.a1 && p.a2 ? 'ab' : p.a1 ? 'a' : 'b';
    let cand = arcs.filter((a) => !used.has(a.n + side)
      && (!p.a1 || (a.from === p.a1.i && (a.kind === 'slur' || a.pitch === p.a1.pitch)))
      && (!p.a2 || (a.to === p.a2.i && (a.kind === 'slur' || a.pitch === p.a2.pitch))));
    if (cand.length > 1 && side !== 'ab') cand = cand.filter((a) => a.kind === (side === 'a' ? 'tie' : 'slur'));
    if (cand.length !== 1) { problems.push(`${p.el.getAttribute('class')}: ${cand.length} arcs match`); return; }
    used.add(cand[0].n + side);
    p.el.setAttribute('data-arc', String(cand[0].n));
  });
  // drop a piece drawn on exactly the same path as an earlier one (the slur leaving a tied chord at a line break shares the
  // lowest pitch's tie path): it cannot be seen, and the part must not have to know about it
  const seen = new Set(); let dropped = 0;
  pieces.forEach((p) => { const k = p.el.getAttribute('d'); if (seen.has(k)) { p.el.remove(); dropped++; } else seen.add(k); });
  return { svg: d.querySelector('svg').outerHTML, map: { tempo, notes: notes.map((n) => n.out), beams, arcs }, problems, dropped, pieces: pieces.length };
}

const S = await studio();
const b = await S.browser.launch();
const out = {};
try {
  const p = await b.newPage();
  await p.setContent('<!doctype html><div id="d"></div>');
  await p.addScriptTag({ path: path.join(ABCJS, 'dist', 'abcjs-basic.js') });
  for (const T of TUNES) {
    const r = await p.evaluate(adapt, T);
    if (r.problems.length) throw new Error(`${T.name}: ${r.problems.join('; ')}`);
    out[T.name] = { abc: T.abc, abcSvg: r.svg, abcMap: r.map, renderer: { name: 'abcjs', version: VERSION, options: { add_classes: true, staffwidth: T.staffwidth } } };
    fs.writeFileSync(path.join(DIR, 'fixtures', T.name + '.json'), JSON.stringify(out[T.name], null, 1) + '\n');
    console.log(`${T.name}: ${r.map.notes.length} notes, ${r.map.arcs.length} arcs, ${r.pieces} arc pieces (${r.dropped} hidden duplicate dropped), ${r.svg.length} bytes of SVG`);
  }
} finally { await b.close(); }

// the demo: the fixtures inline, as the build would provide them (not the test-only ones)
const fx = (n) => JSON.stringify(out[n]).replace(/</g, '\\u003c');
const slides = DEMO.map(([n, h, attrs, label, ht, concl]) => `<section class="slide">
  <h2>${h}</h2>
  <div class="body">
    <m-score ${attrs ? attrs + ' ' : ''}aria-label="${label}" style="height:${ht}px">
      <script type="application/json">${fx(n)}</script>
    </m-score>
  </div>
  <div class="concl"><span>${concl}</span></div>
</section>`).join('\n\n');
fs.writeFileSync(path.join(DIR, 'demo.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>m-score の見本</title>
<!-- 組み方：node kit/build.mjs components/score/demo.html -o components/score/out/demo.html -->
<!-- 楽譜のデータ（abcSvg・abcMap）は、組み立てが abc から描いて足すものと同じ形（fixtures/*.json と同じ。tools/score-fixtures.mjs が abcjs ${VERSION} で描いた） -->
<style>
</style>
</head>
<body>
<div id="stage">

${slides}

</div>
</body>
</html>
`);
console.log('demo.html: ' + DEMO.length + ' slides');

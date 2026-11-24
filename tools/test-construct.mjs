// m-construct: the geometry the part computes (meeting points, arcs, angles), the reports, the invariant measures, and
// deterministic seeking; then the demo in a browser (ja, en): no overlaps, text ≥ 24 px inside the element, no reports
//   node tools/test-construct.mjs [work dir] | --node
import fs from 'node:fs';
import path from 'node:path';
import {harness, walk, close} from './stats-test-helpers.mjs';
import {ROOT} from './studio.mjs';
import {c2Bundle} from './parts.mjs';

const PB = {points: {A: [-3, 0], B: [3, 0]}, ops: [
  {seg: ['A', 'B']}, {arc: {c: 'A', r: 4}, note: 'A を中心に弧'}, {arc: {c: 'B', r: 4}, note: 'B を中心に弧'},
  {meet: ['arc1', 'arc2'], name: ['P', 'Q'], note: '交点 P、Q'}, {line: ['P', 'Q'], tone: 'emph', note: '直線 PQ'},
  {meet: ['line1', 'seg1'], name: 'M'}, {equal: [['A', 'M'], ['M', 'B']], ticks: 2}, {angle: ['B', 'M', 'P'], show: 'mark'}]};
const {ok, make, finish, Part} = harness('construct', PB);
const dims = {clientWidth: 1184, clientHeight: 440};
const near = (p, q, tol = 1e-9) => p && q && close(p[0], q[0], tol) && close(p[1], q[1], tol);

// 1. the perpendicular bisector: P above, Q below, both on x = 0; M the midpoint; PQ ⟂ AB
{
  const {el, reports} = make(PB, {}, dims);
  const g = el.geo(0);
  ok(reports.length === 0, 'bisector: no reports: ' + JSON.stringify(reports));
  ok(el.steps === 8 && el.duration(1) === 1.2 && el.duration(9) === 0, 'bisector: 8 steps (one per op), dur 1.2');
  ok(near(g.pts.P, [0, Math.sqrt(7)]) && near(g.pts.Q, [0, -Math.sqrt(7)]), 'bisector: P = (0, √7) is the upper meeting point, Q = (0, −√7)');
  ok(near(g.pts.M, [0, 0]), 'bisector: M is the midpoint of AB');
  const arc = g.objs.find((o) => o.id === 'arc1');
  ok(arc.pieces.length === 2 && arc.pieces.every((p) => p[1] - p[0] === 44), 'bisector: arc1 is drawn as two pieces of 44° around P and Q');
  ok(Part.preview === undefined, 'bisector: the part previews later steps (not an answer)');
}
// 2. the angle bisector: ∠XOC = ∠COY
{
  const AB = {points: {O: [0, 0], X: [7, 0], Y: [4.2, 5.6]}, ops: [
    {ray: ['O', 'X']}, {ray: ['O', 'Y']}, {arc: {c: 'O', r: 3}}, {meet: ['ray1', 'arc1'], name: 'A'}, {meet: ['ray2', 'arc1'], name: 'B'},
    {arc: {c: 'A', r: 2.6}}, {arc: {c: 'B', r: 2.6}}, {meet: ['arc2', 'arc3'], name: 'C'}, {ray: ['O', 'C']}]};
  const {el, reports} = make(AB, {}, dims), g = el.geo(0);
  const ang = (p) => Math.atan2(p[1], p[0]) * 180 / Math.PI;
  ok(reports.length === 0 && close(ang(g.pts.C), ang([4.2, 5.6]) / 2, 1e-9), `angle bisector: ∠XOC = ∠COY (${ang(g.pts.C).toFixed(4)}°)`);
  ok(close(Math.hypot(...g.pts.C), 2.683281573 + 2.227105745, 1e-6), 'angle bisector: C is the far meeting point (the upper one)');
  const arc1 = g.objs.find((o) => o.id === 'arc1');
  ok(arc1.pieces.length === 1, 'angle bisector: the arc about O is one piece across both sides (gap under 20°)');
}
// 3. an equilateral triangle from two circles through each other's centre
{
  const {el, reports} = make({points: {A: [0, 0], B: [4, 0]}, ops: [{circle: {c: 'A', through: 'B'}}, {circle: {c: 'B', through: 'A'}}, {meet: ['circle1', 'circle2'], name: 'C'}]}, {}, dims);
  const g = el.geo(0);
  ok(reports.length === 0 && close(Math.hypot(g.pts.C[0], g.pts.C[1]), 4, 1e-12) && close(Math.hypot(g.pts.C[0] - 4, g.pts.C[1]), 4, 1e-12) && g.pts.C[1] > 0, 'equilateral: AC = BC = AB = 4, C above');
}
// 4. line and circle, line and line (parallel), tangent circles
{
  const {el} = make({points: {O: [0, 0], A: [-5, 1], B: [5, 1]}, ops: [{circle: {c: 'O', r: 2}}, {line: ['A', 'B']}, {meet: ['line1', 'circle1'], name: ['P', 'Q']}]}, {}, dims);
  const g = el.geo(0);
  ok(near(g.pts.P, [-Math.sqrt(3), 1]) && near(g.pts.Q, [Math.sqrt(3), 1]), 'line and circle: P, Q in the line\'s direction from A');
  const par = make({points: {A: [0, 0], B: [4, 0], C: [0, 1], D: [4, 1]}, ops: [{line: ['A', 'B']}, {line: ['C', 'D']}, {meet: ['line1', 'line2'], name: 'X'}]}, {}, dims);
  ok(par.reports.some((r) => r.code === 'data' && r.msg.includes('do not meet') && r.msg.includes('parallel')), 'parallel lines report "do not meet"');
  const seg = make({points: {A: [0, 0], B: [1, 0], C: [3, -1], D: [3, 1]}, ops: [{seg: ['A', 'B']}, {seg: ['C', 'D']}, {meet: ['seg1', 'seg2'], name: 'X'}]}, {}, dims);
  ok(seg.reports.some((r) => r.code === 'data' && r.msg.includes('do not meet')), 'segments that end before they cross report');
  const tan = make({points: {A: [0, 0], B: [4, 0]}, ops: [{circle: {c: 'A', r: 2}}, {circle: {c: 'B', r: 2}}, {meet: ['circle1', 'circle2'], name: ['P', 'Q']}]}, {}, dims);
  ok(tan.reports.some((r) => r.code === 'data' && r.msg.includes('one point only')) && near(tan.el.geo(0).pts.P, [2, 0]), 'touching circles: one point (2, 0) and a report for the second name');
}
// 5. reports: arcs too small, unknown names with a near name, a meeting point named nothing, bad attributes
{
  const far = make({points: {A: [-3, 0], B: [3, 0]}, ops: [{arc: {c: 'A', r: 2}}, {arc: {c: 'B', r: 2}}, {meet: ['arc1', 'arc2'], name: ['P', 'Q']}]}, {}, dims);
  ok(far.reports.some((r) => r.code === 'data' && r.msg.includes('do not meet') && r.msg.includes('larger than 3')), 'arcs too small: "do not meet … larger than 3": ' + JSON.stringify(far.reports));
  const typo = make({points: {A: [0, 0], B: [3, 0]}, ops: [{seg: ['A', 'C']}, {meet: ['sg1', 'seg1'], name: 'X'}]}, {}, dims);
  ok(typo.reports.some((r) => r.msg.includes('"C" is not a point yet')), 'an unknown point reports');
  ok(typo.reports.some((r) => r.msg.includes('"sg1" is not a line or circle id')), 'an unknown id reports');
  const typo2 = make({points: {A: [0, 0], B: [3, 0]}, ops: [{seg: ['A', 'B']}, {line: ['A', 'B']}, {meet: ['seg1', 'lin1'], name: 'X'}]}, {}, dims);
  ok(typo2.reports.some((r) => r.msg.includes('did you mean "line1"')), 'an unknown id suggests the near one');
  ok(make({points: {A: [0, 0], B: [3, 0]}, ops: [{circle: {c: 'A', r: 1}}, {circle: {c: 'B', r: 3}}, {meet: ['circle1', 'circle2']}]}, {}, dims).reports.some((r) => r.msg.includes('needs "name"')), 'a meet without a name reports');
  ok(make(PB, {size: 20, dur: 0, mode: 'x'}, dims).reports.filter((r) => r.code === 'attr').length === 3, 'bad size, dur and mode report');
  for (const b of [null, {}, {ops: [{bogus: 1}]}, {...PB, extra: 1}]) {
    const r = make(b, {}, dims);
    ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b));
  }
  ok(make(PB, {}, {clientWidth: 280, clientHeight: 120}).reports.some((r) => r.code === 'size'), 'a small element reports size');
}
// 6. invariant: the inscribed angle stays 60° while P moves; the sum of a triangle's angles stays 180°
const INS = {points: {O: [0, 0]}, ops: [{circle: {c: 'O', r: 4}}, {point: 'A', on: 'circle1', deg: 210}, {point: 'B', on: 'circle1', deg: 330},
  {point: 'P', on: 'circle1', deg: 90}, {seg: ['A', 'B']}, {seg: ['P', 'A']}, {seg: ['P', 'B']}, {angle: ['A', 'P', 'B']}],
  move: 'P', visit: [140, 40, 160], measure: {angle: ['A', 'P', 'B']}};
const TRI = {points: {A: [-4, 0], B: [4, 0], C: [-1, 4]}, ops: [{polygon: ['A', 'B', 'C']}, {seg: ['A', 'B']}, {seg: ['B', 'C']}, {seg: ['C', 'A']},
  {angle: ['B', 'A', 'C']}, {angle: ['C', 'B', 'A']}, {angle: ['A', 'C', 'B']}], move: 'C', visit: [[2.5, 3], [0.5, 6], [-2.5, 2]],
  measure: {sum: [['B', 'A', 'C'], ['C', 'B', 'A'], ['A', 'C', 'B']]}};
{
  const {el, reports} = make(INS, {mode: 'invariant'}, dims);
  ok(reports.length === 0 && el.steps === 3, 'inscribed: 3 steps, no reports: ' + JSON.stringify(reports));
  let same = true;
  for (let s = 0; s <= 3; s += 0.125) same &&= el.measureAt(el.geo(s)).total === 60;
  ok(same, 'inscribed: ∠APB = 60° at every position and between them');
  ok(close(el.duration(1), 1.2) && close(el.duration(2), 1.2 * 100 / 90), 'inscribed: a longer move on the circle takes longer');
  ok(/どの位置でも 60°/.test(el.getAttribute('aria-label')), 'inscribed: read as "どの位置でも 60°": ' + el.getAttribute('aria-label'));
  const en = make(INS, {mode: 'invariant'}, dims, 'en').el;
  ok(/is 60° at every position/.test(en.getAttribute('aria-label')), 'inscribed (en): ' + en.getAttribute('aria-label'));
}
{
  const {el, reports} = make(TRI, {mode: 'invariant'}, dims);
  let sums = true, parts = true;
  for (let s = 0; s <= 3; s += 0.1) { const m = el.measureAt(el.geo(s)); sums &&= m.total === 180; parts &&= m.parts.reduce((a, b) => a + b, 0) === 180; }
  ok(reports.length === 0 && sums && parts, 'triangle: the sum is 180° and the rounded parts add up to 180 at every moment');
  const bad = make({...TRI, visit: [90]}, {mode: 'invariant'}, dims);
  ok(bad.reports.some((r) => r.msg.includes('visit[0] must be [x, y]')), 'a free point visited by degrees reports');
  const meetMove = make({...PB, move: 'P', visit: [[0, 1]], measure: {angle: ['A', 'P', 'B']}}, {mode: 'invariant'}, dims);
  ok(meetMove.reports.some((r) => r.msg.includes('is a meeting point and cannot move')), 'moving a meeting point reports');
}
// 7. deterministic seeking, finite geometry, text ≥ 24 px, preview draws more at step 0 (steps) and ghosts ahead (invariant)
for (const [label, data, attrs] of [['steps', PB, {}], ['inscribed', INS, {mode: 'invariant'}], ['triangle', TRI, {mode: 'invariant'}]]) {
  for (const lang of ['ja', 'en']) {
    const {el} = make(data, attrs, dims, lang);
    ok(el.getAttribute('role') === 'img' && el.svg.getAttribute('aria-hidden') === 'true', `${label} ${lang}: image role, hidden SVG`);
    ok(make(data, {...attrs, 'aria-label': 'Author'}, dims, lang).el.getAttribute('aria-label') === 'Author', `${label} ${lang}: author label kept`);
    let det = true, finite = true, complete = true;
    for (let k = 0; k <= el.steps; k++) for (const t of [0, el.duration(k) / 2, Infinity]) {
      el.render(k, t, {}); const html = el.innerHTML;
      el.render(el.steps, Infinity, {}); el.render(0, 0, {}); el.render(k, t, {}); det &&= el.innerHTML === html;
      finite &&= !/NaN|undefined|Infinity/.test(el.svg.outerHTML);
      el.render(k, Infinity, {}); const end = el.innerHTML; el.render(k, el.duration(k), {}); complete &&= end === el.innerHTML;
    }
    ok(det && finite && complete, `${label} ${lang}: deterministic seeking, finite geometry, durations complete`);
    el.render(el.steps, Infinity, {});
    ok(walk(el.svg).filter((e) => e.localName === 'text').every((e) => +e.getAttribute('font-size') >= 24), `${label} ${lang}: all text ≥ 24 px`);
    el.render(0, 0, {}); const plain = walk(el.svg).length;
    el.render(0, 0, {preview: true}); const more = walk(el.svg).length;
    ok(more > plain, `${label} ${lang}: preview draws later steps faintly at step 0 (${plain} → ${more} nodes)`);
  }
}
// 8. a vertical slide: the notes go under the figure
{
  const {el, reports} = make(PB, {}, {clientWidth: 600, clientHeight: 900});
  ok(reports.length === 0 && el.L.py > el.L.fh && el.L.px === 0, 'narrow element: the notes go under the figure');
}
// the browser check builds the demo in the work dir: put the part there through the registry shim (a new part is not in the
// pinned Studio's copy of the library)
if (!process.argv.includes('--node')) {
  const work = path.resolve(process.argv[2] || path.join(ROOT, 'components', 'construct', 'out', 'test'));
  fs.mkdirSync(path.join(work, 'components', 'construct'), {recursive: true});
  fs.writeFileSync(path.join(work, 'components', 'construct', 'index.js'), c2Bundle(ROOT, 'construct'));
}
await finish();

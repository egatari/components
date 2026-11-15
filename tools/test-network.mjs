// node tools/test-network.mjs [work dir] | --node
import {harness, walk} from './stats-test-helpers.mjs';
const data = {
  nodes: [{id: 'A', x: 0, y: 0}, {id: 'B', x: 4, y: 0}, {id: 'C', x: 2, y: 3}, {id: 'D', x: 6, y: 3}],
  edges: [{from: 'A', to: 'B', w: 4}, {from: 'A', to: 'C', w: 3}, {from: 'B', to: 'C', w: 2}, {from: 'B', to: 'D', w: 5}, {from: 'C', to: 'D', w: 6}],
  frontierKind: 'queue', total: {label: '経路の長さ', unit: 'km'},
  steps: [
    {current: 'A', visited: ['A'], frontier: ['B', 'C'], parent: {B: 'A', C: 'A'}, note: 'A の隣を待ち行列へ'},
    {current: 'B', visited: ['A', 'B'], frontier: ['C', 'D'], parent: {D: 'B'}},
    {current: 'D', visited: ['A', 'B', 'D'], frontier: ['C'], take: [['A', 'B'], ['B', 'D']], total: 9, note: '見つけた経路'},
  ],
};
const {ok, make, common, finish, Part} = harness('network', data);
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 3 && Part.preview === 'none', 'three steps, no answer preview, no reports: ' + JSON.stringify(reports));
c.render(1, Infinity);
const A = c.nodes.find((o) => o.n.id === 'A'), B = c.nodes.find((o) => o.n.id === 'B'), C = c.nodes.find((o) => o.n.id === 'C');
ok(A.cur.getAttribute('opacity') === '1.000' && B.fr.getAttribute('opacity') === '1.000' && A.vis.getAttribute('opacity') === '0.350', 'step 1: current A, frontier B, A visited');
c.render(3, 0);
ok(Object.values(c.chosen).every((x) => x.el.getAttribute('opacity') === '0.000'), 'step 3 start: taken edges not yet drawn');
c.render(3, Infinity);
ok(Object.values(c.chosen).every((x) => x.el.getAttribute('opacity') === '1.000') && c.totalText.textContent === '経路の長さ 9 km', 'step 3 end: both edges drawn, total 9 km');
ok(c.duration(3) === 0.6 * 2 && c.duration(1) === 0.3, 'durations: two edges × dur; state change = dur/2');
ok(c.getAttribute('aria-label').includes('A–B') && c.getAttribute('aria-label').includes('経路の長さ 9 km'), 'accessible summary has chosen edges and total');
const wrong = make({...data, steps: [...data.steps.slice(0, 2), {...data.steps[2], total: 8}]});
ok(wrong.reports.some((r) => r.code === 'data' && r.msg.includes('sum to 9')), 'total ≠ weight sum reports data');
const nocheck = make({...data, total: {...data.total, check: false}, steps: [...data.steps.slice(0, 2), {...data.steps[2], total: 8}]});
ok(!nocheck.reports.some((r) => r.code === 'data'), 'total.check false skips the sum check');
const unknown = make({...data, steps: [{current: 'Z', take: [['A', 'D']], drop: [['A', 'B']]}]});
ok(['unknown node "Z"', 'no edge A–D', 'was not chosen'].every((s) => unknown.reports.some((r) => r.code === 'data' && r.msg.includes(s))), 'unknown id, missing edge and bad drop report data');
const tour = make({nodes: [{id: 'P', x: 0, y: 0}, {id: 'Q', x: 3, y: 0}, {id: 'R', x: 3, y: 4}], complete: true,
  steps: [{take: [['P', 'Q'], ['Q', 'R'], ['R', 'P']], total: 12}, {drop: [['R', 'P']], take: [['R', 'Q']]}]});
ok(tour.reports.length === 0 && tour.el.steps === 2, 'complete graph: any pair may be taken; drop then take: ' + JSON.stringify(tour.reports));
const dir = make({...data, directed: true});
ok(dir.reports.some((r) => r.msg.includes('no edge') ) === false, 'directed graph accepts edges in their direction');
const pq = make({...data, frontierKind: 'pq', steps: [{current: 'A', frontier: [['C', 3], ['B', 4]]}]});
pq.el.render(1, Infinity);
ok(pq.el.slots[0].text.textContent === 'C 3' && pq.el.capText.textContent === '優先度付きキュー', 'priority queue shows keys');
const close2 = make({...data, nodes: [{id: 'A', x: 0, y: 0}, {id: 'B', x: 0.01, y: 0}, {id: 'C', x: 2, y: 3}, {id: 'D', x: 6, y: 3}]});
ok(close2.reports.some((r) => r.code === 'layout' && r.msg.includes('overlap')), 'overlapping nodes report layout');
for (const bad of [null, {}, {nodes: [], steps: [{}]}, {...data, extra: 1}, {...data, nodes: Array.from({length: 25}, (_, i) => ({id: 'n' + i, x: i, y: 0}))}]) {
  const r = make(bad); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(bad).slice(0, 60));
}
const attrs = make(data, {dur: -1, size: 20});
ok(attrs.reports.filter((r) => r.code === 'attr').length === 2 && attrs.el.props.size === 24, 'bad props report/default');
for (const lang of ['ja', 'en']) {
  const r = make(data, {}, {clientHeight: 480}, lang); common(r.el, lang);
  ok(r.reports.length === 0, lang + ' fits, no reports after seeking every step: ' + JSON.stringify(r.reports));
}
await finish();

// node tools/test-vector.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
const ex = {range: [-4, 4, -3, 3], vectors: [{id: 'a', v: [2, 1], label: '*a*'}, {id: 'b', v: [-1, 2], label: '*b*'}], ops: [{sum: ['a', 'b'], as: 'c', label: '*a* + *b*'}, {dot: ['a', 'b'], value: 0}]};
const {ok, make, common, finish, Part} = harness('vector', ex);
const dims = {clientWidth: 1100, clientHeight: 400};
const {el: c, reports} = make(ex, {}, dims);
ok(reports.length === 0 && c.steps === 3 && Part.preview === 'none', 'vectors, sum, dot = 3 steps; no preview: ' + JSON.stringify(reports));
const lines = (el) => el.plan().steps.map((s) => s.lines.join(' | '));
ok(JSON.stringify(lines(c)) === JSON.stringify(['*a* = (2, 1) | *b* = (−1, 2)', '*a* + *b* = (1, 3)', '*a*·*b* = 2×(−1) + 1×2 = 0']), 'formula lines: ' + JSON.stringify(lines(c)));
c.render(0, 0); ok(c.arrows.a.g.getAttribute('opacity') === '0', 'k = 0: nothing drawn');
c.render(2, Infinity); ok(c.opG[1].res.g.getAttribute('opacity') === '1' && c.opG[1].help.g.getAttribute('opacity') === '1', 'step 2: the moved b and the sum');
c.render(3, Infinity); ok(c.opG[1].help.g.getAttribute('opacity') === '0' && c.opG[1].res.g.getAttribute('opacity') === '1', 'step 3: the sum stays, its helper goes');
const bad = (data, s) => make(data, {}, dims).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(bad({...ex, ops: [{sum: ['a', 'b'], value: [1, 2]}]}, 'computes [1, 3]'), 'a wrong sum reports');
ok(bad({...ex, ops: [{dot: ['a', 'b'], value: 1}]}, 'computes 0'), 'a wrong dot reports');
ok(bad({...ex, ops: [{sum: ['a', 'z']}]}, 'unknown vector "z"'), 'an unknown id reports');
ok(!bad({vectors: [{id: 'a', v: [1, 3]}, {id: 'b', v: [3, 1]}], ops: [{proj: ['a', 'b'], value: [1.8, 0.6]}]}, 'computes'), 'projection (1.8, 0.6) passes');
const mx = make({vectors: [{id: 'v', v: [1, 1]}], matrix: [[2, 1], [1, 2]], show: ['unit', 'eigen']}, {}, dims);
const ms = mx.el.plan().steps[1];
ok(mx.reports.length === 0 && Math.abs(ms.det - 3) < 1e-12 && ms.ev.length === 2 && ms.lines.some((l) => l.includes('固有値 3、1')), 'matrix: det 3, eigenvalues 3 and 1: ' + JSON.stringify(ms.lines));
ok(bad({vectors: [{id: 'v', v: [1, 0]}], matrix: [[0, -1], [1, 0]], show: ['eigen']}, 'complex eigenvalues'), 'a rotation reports complex eigenvalues');
const bs = make({vectors: [{id: 'a', v: [2, 1]}], basis: [[1, 1], [-1, 1]]}, {}, dims);
ok(bs.el.plan().steps[1].lines[1] === '*a* = 1.5*b*_1 − 0.5*b*_2', 'basis: new coordinates: ' + bs.el.plan().steps[1].lines[1]);
ok(bad({vectors: [{id: 'a', v: [2, 1]}], basis: [[1, 1], [2, 2]]}, 'parallel'), 'a parallel basis reports');
ok(bad({vectors: [{id: 'a', v: [2, 1]}], basis: [[1, 1], [-1, 1]], matrix: [[1, 0], [0, 1]]}, 'one of them'), 'matrix with basis reports');
for (const b2 of [null, {}, {vectors: []}, {...ex, extra: 1}]) { const r = make(b2); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b2)); }
ok(make(ex, {dur: -1, size: 20}).reports.filter((r) => r.code === 'attr').length === 2, 'bad props report/default');
for (const lang of ['ja', 'en']) { const r = make(ex, {}, dims, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
common(mx.el, 'matrix', {vectors: [{id: 'v', v: [1, 1]}], matrix: [[2, 1], [1, 2]], show: ['unit', 'eigen']});
common(bs.el, 'basis', {vectors: [{id: 'a', v: [2, 1]}], basis: [[1, 1], [-1, 1]]});
await finish();

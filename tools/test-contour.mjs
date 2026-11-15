// node tools/test-contour.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
const ex = {f: 'x**2 + 3*y**2', range: {x: [-3, 3], y: [-2, 2]}, levels: [1, 2, 4, 8], gradient: {at: [[1, 1]]}, path: [[2.5, 1.5], [1.5, 0.3], [0.9, 0.06]], monotone: true};
const {ok, make, common, finish, Part} = harness('contour', ex, {libs: ['expr', 'contour-core']});
const dims = {clientWidth: 1100, clientHeight: 440};
const {el: c, reports} = make(ex, {}, dims);
ok(reports.length === 0 && c.steps === 8 && Part.preview === 'none', '4 levels + gradient + 3 path points = 8 steps: ' + JSON.stringify(reports));
ok(make(ex, {by: 'all'}, dims).el.steps === 5, 'by="all": the levels in one step');
const g = c.plan().grads[0].g;
ok(Math.abs(g[0] - 2) < 1e-6 && Math.abs(g[1] - 6) < 1e-6, 'gradient of x² + 3y² at (1, 1) is (2, 6): ' + g);
ok(c.plan().fp.map((v) => +v.toFixed(4)).join() === '13,2.52,0.8208', 'f along the path');
c.render(8, Infinity); ok(c.iterRows.map((e) => e.textContent).join('|') === '反復 0：f = 13|反復 1：f = 2.52|反復 2：f = 0.821' && /emph/.test(c.iterRows[2].getAttribute('style')), 'the panel lists f per iterate, the current one marked: ' + c.iterRows.map((e) => e.textContent));
c.render(0, 0); ok(c.levelG.every((x) => x.getAttribute('opacity') === '0.000') && c.iterRows.every((e) => e.getAttribute('opacity') === '0'), 'k = 0: nothing yet');
const bad = (data, s) => make(data, {}, dims).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(bad({...ex, path: [[0.5, 0], [2, 1]]}, 'f goes up at iteration 1'), 'monotone reports a rise');
ok(bad({...ex, f: 'fetch(x)'}, 'f:'), 'an unsafe formula reports');
ok(bad({...ex, grid: {nx: 2, ny: 2, values: [[0, 1], [1, 2]]}}, 'not both'), 'f with grid reports');
// a grid: the plane v = x on [0, 4] × [0, 2]; level 2 is the line x = 2, the gradient is (1, 0)
const gx = {grid: {nx: 5, ny: 3, values: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]]}, range: {x: [0, 4], y: [0, 2]}, levels: [2], gradient: {at: [[1.5, 1]]}};
const gg = make(gx, {}, dims);
ok(gg.reports.length === 0 && Math.abs(gg.el.plan().grads[0].g[0] - 1) < 1e-9 && Math.abs(gg.el.plan().grads[0].g[1]) < 1e-9, 'grid: bilinear gradient (1, 0): ' + JSON.stringify(gg.reports));
ok(bad({...gx, grid: {nx: 5, ny: 3, values: [[0, 1]]}}, 'ny × nx'), 'a malformed grid reports');
for (const b2 of [null, {}, {range: ex.range, levels: [1]}, {...ex, extra: 1}]) { const r = make(b2); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b2)); }
ok(make(ex, {dur: -1, size: 20, by: 'x'}).reports.filter((r) => r.code === 'attr').length === 3, 'bad props report/default');
for (const lang of ['ja', 'en']) { const r = make(ex, {}, dims, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
common(gg.el, 'grid', gx);
await finish();

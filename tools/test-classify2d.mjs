// node tools/test-classify2d.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
const ex = {axes: {x: {label: 'x₁', range: [0, 4]}, y: {label: 'x₂', range: [0, 3]}}, classes: [{id: 0, label: 'A'}, {id: 1, label: 'B'}],
  points: [[1, 1, 0], [1.2, 2, 0], [2.8, 1.1, 1], [3.1, 2.4, 1]], grid: {nx: 5, ny: 4, labels: '0*2 1*3 0*2 1*3 0*2 1*3 0*3 1*2'}};
const {ok, make, common, finish, Part} = harness('classify2d', ex, {libs: ['contour-core']});
const dims = {clientWidth: 1100, clientHeight: 440};
const {el: c, reports} = make(ex, {}, dims);
ok(reports.length === 0 && c.steps === 2 && Part.preview === 'none', 'points → regions = 2 steps: ' + JSON.stringify(reports));
ok(c.regionG.children.length === 8 && c.boundaryG.children.length === 1, 'regions merged into one rectangle per run (8 runs) and one boundary path');
const bad = (data, s) => make(data, {}, dims).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(bad({...ex, grid: {nx: 5, ny: 4, labels: '0*3'}}, 'nx × ny = 20'), 'a short labels run reports');
ok(bad({...ex, points: [[1, 1, 7]]}, 'class 7'), 'an unknown class reports');
ok(bad({...ex, sv: [9]}, 'sv: 9'), 'an sv index out of range reports');
// fields: a plane p = x / 4 has its 0.5 contour at x = 2
const plane = Array.from({length: 4}, () => [0, 0.25, 0.5, 0.75, 1]);
const f = make({...ex, fields: [{name: 'proba', values: plane, levels: [0.5]}]}, {}, dims);
const path = f.el.fieldG[0].children.find((e) => e.localName === 'path');
ok(f.reports.length === 0 && f.el.steps === 3 && path && path.getAttribute('d').split(/[ML]/).filter(Boolean).every((p) => Math.abs(+p.split(' ')[0] - f.el.geo.X(2)) < 0.11), 'proba 0.5 contour is the line x = 2');
// voronoi: two seeds split the box at the bisector
const v = make({...ex, grid: undefined, voronoi: {seeds: [[1, 1.5, 0], [3, 1.5, 1]]}}, {}, dims);
ok(v.reports.length === 0 && v.el.vorG.children.filter((e) => e.localName === 'path').length === 2, 'voronoi: one cell per seed');
// tree: splits inside parent cells, then leaves
const tree = {nodes: [{id: 'n0', feature: 0, threshold: 2, left: 'n1', right: 'n2'}, {id: 'n1', class: 0}, {id: 'n2', feature: 1, threshold: 1.5, left: 'n3', right: 'n4'}, {id: 'n3', class: 1}, {id: 'n4', class: 0}]};
const t = make({...ex, grid: undefined, tree}, {}, dims);
ok(t.reports.length === 0 && t.el.steps === 4, 'tree: points, 2 splits, leaves = 4 steps: ' + JSON.stringify(t.reports));
t.el.render(3, Infinity); const s2 = t.el.splitEls[1];
ok(Math.abs(+s2.getAttribute('x1') - t.el.geo.X(2)) < 0.1 && Math.abs(+s2.getAttribute('x2') - t.el.geo.X(4)) < 0.1, 'the second split runs across its parent cell only (x from 2 to 4)');
ok(bad({...ex, grid: undefined, tree: {nodes: [{id: 'n0', feature: 0, threshold: 9, left: 'a', right: 'b'}, {id: 'a', class: 0}, {id: 'b', class: 1}]}}, 'not inside its cell'), 'a threshold outside the cell reports');
// k-means: checks and steps
const pts = [[0, 0], [0, 1], [4, 0], [4, 1]];
const km = {iters: [{centroids: [[0, 0], [1, 1]], assign: [0, 1, 1, 1]}, {centroids: [[0, 0], [8 / 3, 2 / 3]], assign: [0, 0, 1, 1]}, {centroids: [[0, 0.5], [4, 0.5]], assign: [0, 0, 1, 1]}]};
const k = make({axes: ex.axes, points: pts, kmeans: km}, {}, dims);
ok(k.reports.length === 0 && k.el.steps === 6, 'k-means: points + assign/update ×2 + assign = 6 steps: ' + JSON.stringify(k.reports));
k.el.render(2, Infinity); ok(k.el.ptEls[1].getAttribute('style') === 'fill:var(--series-2)', 'assign step colours points by cluster');
ok(bad({axes: ex.axes, points: pts, kmeans: {iters: [{centroids: [[0, 0], [1, 1]], assign: [1, 1, 1, 1]}]}}, 'not the nearest centroid'), 'a wrong assignment reports');
ok(bad({axes: ex.axes, points: pts, kmeans: {iters: [km.iters[0], {...km.iters[1], centroids: [[0, 0], [3, 3]]}]}}, 'should be the mean'), 'a wrong mean reports');
for (const b2 of [null, {}, {axes: ex.axes}, {...ex, extra: 1}]) { const r = make(b2); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b2)); }
ok(make(ex, {dur: -1, size: 20, marker: 1}).reports.filter((r) => r.code === 'attr').length === 3, 'bad props report/default');
for (const lang of ['ja', 'en']) { const r = make(ex, {}, dims, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
common(t.el, 'tree', {...ex, grid: undefined, tree});
common(k.el, 'kmeans', {axes: ex.axes, points: pts, kmeans: km});
// the helper itself (uv run): the demo generator's five outputs pass the part's checks, and --tree-out is m-tree data
if (!process.argv.includes('--no-helper')) {
  const {execFileSync} = await import('node:child_process'), fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  let lines = null;
  try { lines = execFileSync('uv', ['run', '-q', 'tools/classify2d-demo.py'], {encoding: 'utf8'}).trim().split('\n').map((l) => JSON.parse(l)); } catch (e) { lines = null; }
  if (lines) {
    ok(lines.length === 5 && lines.every((d) => make(d, {}, dims).reports.length === 0), 'sk2ega: logistic, SVM, 1-NN, tree and k-means outputs pass the part\'s checks');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk2ega-')), csv = path.join(dir, 'd.csv'), out = path.join(dir, 't.json');
    fs.writeFileSync(csv, 'a,b,c\n0,0,X\n0,1,X\n1,0,Y\n1,1,Y\n2,0,Y\n');
    execFileSync('uv', ['run', '-q', 'tools/sk2ega.py', 'tree', csv, '--fit', 'DecisionTreeClassifier(max_depth=1)', '--tree-out', out], {encoding: 'utf8'});
    const tj = JSON.parse(fs.readFileSync(out, 'utf8'));
    ok(tj.nodes.length === 3 && tj.nodes[1].parent === 'n0' && tj.nodes[1].branch === '≤' && tj.nodes[2].branch === '>', '--tree-out writes m-tree nodes with parent and branch: ' + JSON.stringify(tj));
    let refused = false; try { execFileSync('uv', ['run', '-q', 'tools/sk2ega.py', 'svm', csv, '--fit', '__import__("os").system("true")'], {stdio: 'pipe'}); } catch (e) { refused = true; }
    ok(refused, '--fit refuses anything but Name(key=literal)');
    fs.rmSync(dir, {recursive: true, force: true});
  } else console.log('skip sk2ega (uv not available)');
}
await finish();

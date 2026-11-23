// node tools/test-flow.mjs: m-flow's edges start on their source box and end on the facing side of their target box,
// within the box, for fan-out, fan-in, stacked, diagonal, two-way and diamond layouts (no browser); and the automatic layout
// of 2.2.0 (nodes without x, y, w, h): ranks, order, dir, back edges, and its reports
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {ROOT} from './studio.mjs';
let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
class Node {
  constructor(tag = 'm-flow') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 330; this._text = ''; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { this.children.push(n); n.parentElement = this; return n; }
  insertBefore(n) { return this.appendChild(n); }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBBox() { return {x: 0, y: 0, width: 0, height: 0}; }
  getComputedTextLength() { return 0; }
  get textContent() { return this._text + this.children.map((n) => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
}
const registry = {};
const context = vm.createContext({HTMLElement: Node, console,
  getComputedStyle: () => ({fontFamily: 'BIZ UDPGothic', getPropertyValue: () => ''}),
  document: {createElementNS: (_, tag) => new Node(tag), createElement: (tag) => new Node(tag), createTextNode: (s) => { const n = new Node('#text'); n._text = s; return n; }},
  egatariParts: {define: (meta, factory) => { registry[meta.name] = factory(Object.fromEntries(Object.keys(meta.requires || {}).map((n) => [n, registry[n]]))); }}
});
for (const name of ['shape', 'base', 'markup-reader', 'flow']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
const Part = registry.flow;
const make = (data, attrs = {}) => {
  const el = new Part(); el.setAttribute('lang', 'ja');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const script = el.appendChild(new Node('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data);
  const reports = []; el.mount({lang: 'ja', report: (code, msg) => reports.push({code, msg})});
  return {el, reports};
};
const near = (p, n, d) => p[0] >= n.x - d && p[0] <= n.x + n.w + d && p[1] >= n.y - d && p[1] <= n.y + n.h + d;
const inside = (v, lo, hi) => v >= lo - 1e-6 && v <= hi + 1e-6;
// The end lies 6 px off the side facing the source, between that side's ends; the start lies on the source's outline (6 px off)
function check(name, data) {
  const {el, reports} = make(data), by = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const bad = [];
  data.edges.forEach((e, i) => {
    const E = el.edges[i], A = by[e.from], B = by[e.to];
    if (!E) { bad.push(`${e.from}→${e.to} not drawn`); return; }
    const [x, y] = E.p1;
    const onSide = Math.abs(x - (B.x - 6)) < 1e-6 || Math.abs(x - (B.x + B.w + 6)) < 1e-6 ? inside(y, B.y, B.y + B.h)
      : Math.abs(y - (B.y - 6)) < 1e-6 || Math.abs(y - (B.y + B.h + 6)) < 1e-6 ? inside(x, B.x, B.x + B.w) : false;
    if (!onSide) bad.push(`${e.from}→${e.to} ends at ${x.toFixed(1)},${y.toFixed(1)}, not on a side of ${e.to}`);
    if (!near(E.p0, A, 6 + 1e-6) || near(E.p0, A, 6 - 1e-6) && !(A.shape === 'diamond')) bad.push(`${e.from}→${e.to} starts at ${E.p0.map((v) => v.toFixed(1))}, not on ${e.from}'s outline`);
  });
  ok(!bad.length && !reports.length, name + (bad.length ? ': ' + bad.join('; ') : '') + (reports.length ? ' reports: ' + reports.map((r) => r.msg).join('; ') : ''));
  return el;
}
// The owner's deck (components 2.6.0 bug): one source, five wide flat targets stacked with 13 px gaps
const owner = {nodes: [{id: 'a', label: 'A', x: 0, y: 5, w: 260, h: 80}, {id: 'b', label: 'B', x: 0, y: 125, w: 260, h: 80}, {id: 'c', label: 'C', x: 0, y: 245, w: 260, h: 80},
  ...[0, 65, 130, 195, 260].map((y, i) => ({id: i < 4 ? 'g' + (i + 1) : 'x', label: 'T' + i, x: 760, y, w: 420, h: 52}))],
  edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}, {from: 'b', to: 'g1'}, {from: 'b', to: 'g2'}, {from: 'b', to: 'g3'}, {from: 'b', to: 'g4'}, {from: 'b', to: 'x', dash: true}]};
const el = check('owner deck: fan-out to five stacked wide targets', owner);
ok([2, 3, 4, 5, 6].every((i, j) => Math.abs(el.edges[i].p1[1] - ([0, 65, 130, 195, 260][j] + 26)) < 1e-6), 'owner deck: each arrow ends at the middle of its target\'s left side');
const flip = (d) => ({nodes: d.nodes.map((n) => ({...n, x: 1180 - n.x - n.w})), edges: d.edges});
check('fan-out to the left', flip(owner));
// boxes as wide as the source rows are tall, so the rows stay apart (m-flow 2.1.2 reports overlapping boxes)
const swap = (d) => ({nodes: d.nodes.map((n) => ({...n, x: n.y, y: n.x / 4, w: n.h, h: n.w / 6})), edges: d.edges});
check('fan-out downward (stacked rows)', swap(owner));
check('fan-in', {nodes: owner.nodes, edges: owner.edges.slice(2).map((e) => ({from: e.to, to: e.from}))});
check('diagonal and two-way pairs', {nodes: [{id: 'p', label: 'P', x: 20, y: 20, w: 200, h: 70}, {id: 'q', label: 'Q', x: 500, y: 200, w: 300, h: 60}, {id: 'r', label: 'R', x: 900, y: 10, w: 200, h: 70}],
  edges: [{from: 'p', to: 'q'}, {from: 'q', to: 'p'}, {from: 'q', to: 'r'}, {from: 'p', to: 'r'}]});
check('diamond source and target', {nodes: [{id: 'd', label: '?', x: 20, y: 100, w: 200, h: 120, shape: 'diamond'}, {id: 'y', label: 'Y', x: 700, y: 0, w: 400, h: 50}, {id: 'n', label: 'N', x: 700, y: 260, w: 400, h: 50}],
  edges: [{from: 'd', to: 'y'}, {from: 'd', to: 'n'}, {from: 'y', to: 'd'}]});
// data-part markers for Studio's geometry check: box shapes, edge groups with ends, the edge line, labels with their owner
{
  const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
  const {el} = make({nodes: [{id: 'a', label: 'A', x: 0, y: 0, w: 200, h: 60}, {id: 'b', label: 'B\nC', x: 600, y: 0, w: 200, h: 90, shape: 'diamond'}, {id: 'c', label: 'D', x: 0, y: 220, w: 200, h: 60}],
    edges: [{from: 'a', to: 'b', label: 'x'}, {from: 'a', to: 'b', label: 'y', shift: 20, amount: 3}, {from: 'b', to: 'a', loop: 'bottom', label: 'z'}, {from: 'a', to: 'c'}]});
  const all = []; walk(el, (n) => all.push(n));
  const part = (k) => all.filter((n) => n.attrs['data-part'] === k);
  const boxes = part('box'), edges = part('edge'), labels = part('label');
  ok(boxes.length === 3 && boxes.map((n) => n.localName).join() === 'rect,polygon,rect' && boxes.map((n) => n.attrs['data-part-id']).join() === 'a,b,c',
    'data-part="box" on each box shape (rect, polygon) with the node id');
  ok(edges.length === 4 && edges.every((n) => n.localName === 'g') && edges.map((n) => n.attrs['data-part-id']).join() === 'a\u2192b,a\u2192b#2,b\u2192a,a\u2192c'
    && edges.map((n) => n.attrs['data-part-from'] + n.attrs['data-part-to']).join() === 'ab,ab,ba,ac', 'data-part="edge" on each edge <g>: id from→to (#2 for the second), data-part-from and data-part-to');
  ok(edges.every((g) => { const ls = g.children.filter((c) => 'data-part-line' in c.attrs); return ls.length === 1 && /^(line|path)$/.test(ls[0].localName) && ls[0] === g.children[0]; }),
    'each edge has exactly one data-part-line (its line, not the arrowhead)');
  const of = (k) => labels.filter((n) => n.attrs['data-part-of'] === k).map((n) => n.attrs['data-part-id']).join();
  ok(labels.every((n) => n.localName === 'text') && of('box') === 'a,b,b,c' && of('edge') === 'a\u2192b,a\u2192b#2,a\u2192b#2,b\u2192a',
    'data-part="label" on every text with its owner id and data-part-of (box or edge)');
  ok(!all.some((n) => 'data-part-halo' in n.attrs), 'no text has a halo, so none is marked data-part-halo');
}
{
  const {reports} = make({nodes: [{id: 'a', label: 'A', x: 0, y: 0, w: 200, h: 40}, {id: 'b', label: 'B', x: 600, y: 0, w: 200, h: 40}], edges: [{from: 'a', to: 'b', shift: 30}]});
  ok(reports.length === 1 && reports[0].code === 'layout' && /leaves the side/.test(reports[0].msg), 'an end pushed off its side by shift is reported (layout)');
}
// ---- automatic layout (2.2.0): no node has x, y, w, h
{
  const auto = (data, attrs) => {
    const {el, reports} = make(data, attrs), at = Object.fromEntries(el.nodes.map((o) => [o.n.id, o.n]));
    return {el, reports, at, laid: {nodes: el.nodes.map((o) => o.n), edges: data.edges}};
  };
  const cx = (n) => n.x + n.w / 2, cy = (n) => n.y + n.h / 2;
  // no two boxes closer than 40 px (along the axis that separates them), all inside the element
  const apart = (nodes, W = 1184, H = 330) => nodes.every((a, i) => a.x >= 0 && a.y >= 0 && a.x + a.w <= W + 1e-6 && a.y + a.h <= H + 1e-6
    && nodes.slice(i + 1).every((b) => Math.max(b.x - a.x - a.w, a.x - b.x - b.w) >= 40 - 1e-6 || Math.max(b.y - a.y - a.h, a.y - b.y - b.h) >= 40 - 1e-6));
  // the edge-end check of the hand-placed fixtures, on the laid-out boxes
  const ends = (name, data, attrs) => {
    const {el, reports, laid} = auto(data, attrs), by = Object.fromEntries(laid.nodes.map((n) => [n.id, n])), bad = [];
    data.edges.forEach((e, i) => {
      const E = el.edges[i], A = by[e.from], B = by[e.to];
      if (E.poly) return;
      const [x, y] = E.p1;
      const onSide = Math.abs(x - (B.x - 6)) < 1e-6 || Math.abs(x - (B.x + B.w + 6)) < 1e-6 ? inside(y, B.y, B.y + B.h)
        : Math.abs(y - (B.y - 6)) < 1e-6 || Math.abs(y - (B.y + B.h + 6)) < 1e-6 ? inside(x, B.x, B.x + B.w) : false;
      if (!onSide) bad.push(`${e.from}→${e.to} ends off ${e.to}`);
      if (!near(E.p0, A, 6 + 1e-6)) bad.push(`${e.from}→${e.to} starts off ${e.from}`);
    });
    ok(!bad.length && !reports.length && apart(laid.nodes), name + (bad.length ? ': ' + bad.join('; ') : '') + (reports.length ? ' reports: ' + reports.map((r) => r.msg).join('; ') : '')
      + (apart(laid.nodes) ? '' : ': boxes closer than 40 px or outside the element'));
    return auto(data, attrs);
  };
  const N = (...ids) => ids.map((id) => ({id, label: id.toUpperCase()}));
  // the flow chart of the demo, written without coordinates
  const sum = {nodes: [{id: 'init', label: '*S* ← 0, *i* ← 1'}, {id: 'dec', label: '*i* ≤ *n* ?', shape: 'diamond'}, {id: 'add', label: '*S* ← *S* + *i*'},
    {id: 'inc', label: '*i* ← *i* + 1'}, {id: 'out', label: '*S* を出力'}],
    edges: [{from: 'init', to: 'dec'}, {from: 'dec', to: 'add', label: 'はい'}, {from: 'add', to: 'inc'}, {from: 'inc', to: 'dec', label: 'くり返す'}, {from: 'dec', to: 'out', label: 'いいえ'}]};
  {
    const one = JSON.stringify(auto(sum).laid.nodes), two = JSON.stringify(auto(JSON.parse(JSON.stringify(sum))).laid.nodes);
    ok(one === two, 'auto layout is deterministic (same data, same boxes)');
    const {el} = make(sum); el.mount({lang: 'ja', report: () => {}});
    ok(JSON.stringify(el.nodes.map((o) => o.n)) === one, 'auto layout: mounting again gives the same boxes (the data keeps no coordinates)');
  }
  {
    const {at} = ends('auto: chain', {nodes: N('a', 'b', 'c'), edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}]});
    ok(at.a.x < at.b.x && at.b.x < at.c.x && cy(at.a) === cy(at.b) && cy(at.b) === cy(at.c), 'auto chain: one rank each, left to right, on one line');
    ok(Math.abs(at.a.x - (1184 - at.c.x - at.c.w)) < 1e-6 && Math.abs((at.b.x - at.a.x - at.a.w) - (at.c.x - at.b.x - at.b.w)) < 1e-6, 'auto chain: spread evenly, centred');
  }
  {
    const {at} = ends('auto: fan-out', {nodes: N('a', 'b', 'c', 'd'), edges: [{from: 'a', to: 'b'}, {from: 'a', to: 'c'}, {from: 'a', to: 'd'}]});
    ok(at.b.x === at.c.x && at.c.x === at.d.x && at.b.y < at.c.y && at.c.y < at.d.y && Math.abs(cy(at.a) - cy(at.c)) < 1e-6, 'auto fan-out: the targets share a rank in data order, the source level with the middle one');
    ok(at.b.w === at.c.w && at.c.w === at.d.w, 'auto fan-out: boxes in a rank share their width');
  }
  {
    const {at} = ends('auto: fan-in', {nodes: N('a', 'b', 'c'), edges: [{from: 'a', to: 'c'}, {from: 'b', to: 'c'}]});
    ok(at.a.x === at.b.x && at.a.y < at.b.y && at.c.x > at.a.x && Math.abs(cy(at.c) - (cy(at.a) + cy(at.b)) / 2) < 1e-6, 'auto fan-in: the sources share rank 0, the target between them');
  }
  {
    // barycentre: data order would cross the edges (b→e, c→d); the sweep swaps d and e
    const {at} = auto({nodes: N('a', 'b', 'c', 'd', 'e'), edges: [{from: 'a', to: 'b'}, {from: 'a', to: 'c'}, {from: 'b', to: 'e'}, {from: 'c', to: 'd'}]});
    ok(at.e.y < at.d.y, 'auto order: the barycentre sweep puts e (child of b) above d (child of c)');
  }
  {
    const tw = (s) => registry.base.textWidth(s, 26, {font: 'BIZ UDPGothic', mark: true});
    const {at, el} = ends('auto: diamond decision with yes and no', {nodes: [{id: 'q', label: '在庫はある？', shape: 'diamond'}, {id: 'y', label: '出荷する'}, {id: 'n', label: '取り寄せる'}],
      edges: [{from: 'q', to: 'y', label: 'はい'}, {from: 'q', to: 'n', label: 'いいえ'}]});
    ok(Math.abs(at.q.w - Math.ceil(2 * (tw('在庫はある？') + 32))) < 1e-6 && at.q.h > at.y.h, 'auto diamond: twice the text width (with padding), taller than a box');
    ok(at.y.y < at.n.y && at.y.x === at.n.x && at.y.x - at.q.x - at.q.w >= tw('いいえ') * 24 / 26 + 24, 'auto diamond: yes above no in the next rank, with room for the edge text');
    ok(el.edges.every((o) => o.lab), 'auto diamond: both edge texts drawn');
  }
  {
    const {at, el, reports} = auto(sum);
    ok(!reports.length && apart(auto(sum).laid.nodes), 'auto: the sum flow chart lays out with no report (no overlap, no free-place report)');
    ok(at.init.x < at.dec.x && at.dec.x < at.add.x && at.add.x === at.out.x && at.add.x < at.inc.x, 'auto: ranks init | dec | add, out | inc');
    ok(!!el.edges[3].poly && el.edges.filter((o) => o.poly).length === 1, 'auto: the back edge inc → dec (no loop) is drawn as a loop; the others straight');
    const P = el.edges[3].poly.pts, bottom = Math.max(...Object.values(at).map((n) => n.y + n.h));
    ok(P[1][1] > bottom && P[2][1] > bottom && P[1][1] <= 330, 'auto: the loop runs below every box, inside the element');
  }
  {
    const {el} = auto({nodes: N('a', 'b'), edges: [{from: 'a', to: 'b', label: 'x'}, {from: 'b', to: 'a', amount: 5}]});
    ok(el.edges.every((o) => !o.poly) && Math.abs(el.edges[0].p1[1] - el.edges[1].p0[1]) > 15, 'auto: a two-way pair stays two straight, shifted lines (not a loop)');
  }
  {
    const {at, el} = ends('auto: orient="down"', {nodes: N('a', 'b', 'c', 'd'), edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}, {from: 'b', to: 'd'}, {from: 'c', to: 'a'}]}, {orient: 'down'});
    ok(at.a.y < at.b.y && at.b.y < at.c.y && at.c.y === at.d.y && at.c.x < at.d.x && cx(at.a) === cx(at.b), 'auto down: ranks top to bottom, a rank left to right');
    ok(at.c.h === at.d.h, 'auto down: boxes in a rank share their height');
    ok(!!el.edges[3].poly && el.edges[3].poly.pts[1][0] < Math.min(at.a.x, at.b.x, at.c.x), 'auto down: the back edge c → a loops on the left (c has d to its right)');
  }
  {
    const {el, reports} = auto({nodes: [{id: 'a', label: 'A', x: 0, y: 0, w: 200, h: 60}, {id: 'b', label: 'B'}, {id: 'c', label: 'C', x: 400}], edges: [{from: 'a', to: 'b'}]});
    ok(reports.length === 1 && reports[0].code === 'data' && /"b", "c"/.test(reports[0].msg) && !el.nodes.length && !el.edges.length,
      'mixed coordinates are reported (data), naming the nodes without all four, and nothing is drawn');
  }
  {
    const many = {nodes: N(...'abcdefghij'.split('')), edges: 'abcdefghi'.split('').map((c, i) => ({from: c, to: 'abcdefghij'[i + 1]}))};
    const {reports, laid} = auto(many);
    ok(reports.length === 1 && reports[0].code === 'layout' && /10 ranks/.test(reports[0].msg) && /orient="down"/.test(reports[0].msg), 'auto: a chain too long for the width is reported (layout), suggesting orient="down"');
    ok(laid.nodes.every((n, i) => !i || n.x - laid.nodes[i - 1].x - laid.nodes[i - 1].w >= 40 - 1e-6) && laid.nodes.every((n) => n.w >= 120), 'auto: too long, the boxes keep their size and 40 px gaps (text is not shrunk)');
    const tall = auto({nodes: N('a', 'b', 'c', 'd', 'e'), edges: ['b', 'c', 'd', 'e'].map((t) => ({from: 'a', to: t}))}, {orient: 'right'});
    ok(tall.reports.length === 1 && /4 boxes side by side/.test(tall.reports[0].msg), 'auto: a rank too tall for the height is reported (layout)');
  }
  {
    const {reports} = auto({nodes: N('a', 'b'), edges: [{from: 'a', to: 'b'}]}, {orient: 'up'});
    ok(reports.length === 1 && reports[0].code === 'data' && /orient="up"/.test(reports[0].msg), 'auto: an unknown orient is reported (right is used)');
  }
  {
    // dir (the HTML text-direction attribute) is not read: dir="down" lays out left to right, with no report
    const {at, reports} = auto({nodes: N('a', 'b'), edges: [{from: 'a', to: 'b'}]}, {dir: 'down'});
    ok(!reports.length && at.a.x < at.b.x && at.a.y === at.b.y, 'auto: the attribute dir is not read (orient is)');
  }
  // rank-skipping edges: a → c beside a → b → c would cross b; it runs outside the boxes, with room kept for it
  {
    const all = (el) => el.nodes.map((o) => o.n);
    const hitsBox = (el, i) => {
      const E = el.edges[i], pts = E.poly ? E.poly.pts : [E.p0, E.p1];
      return all(el).filter((n) => pts.slice(1).some((p, k) => {
        const a = pts[k], r = [n.x, n.y, n.x + n.w, n.y + n.h];
        for (let t = 0; t <= 1; t += 1 / 200) { const x = a[0] + (p[0] - a[0]) * t, y = a[1] + (p[1] - a[1]) * t; if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return true; }
        return false;
      })).map((n) => n.id);
    };
    const skip = {nodes: N('a', 'b', 'c'), edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}, {from: 'a', to: 'c', label: 'まとめて', pulse: true}]};
    for (const orient of ['right', 'down']) {
      const {el, reports, laid} = auto(skip, {orient});
      const pts = el.edges[2].poly && el.edges[2].poly.pts;
      ok(!reports.length && !!pts && !hitsBox(el, 2).length && apart(laid.nodes), `auto ${orient}: the rank-skipping edge a → c runs around b (a polyline that meets no box), no report`
        + (hitsBox(el, 2).length ? ': crosses ' + hitsBox(el, 2) : '') + (reports.length ? ': ' + reports.map((r) => r.msg) : ''));
      const lab = el.edges[2].lab, near = pts && Math.min(...pts.map((p) => Math.hypot(+lab.attrs.x - p[0], +lab.attrs.y - p[1])));
      ok(pts && (orient === 'right' ? pts[1][1] < Math.min(...laid.nodes.map((n) => n.y)) && +lab.attrs.y < pts[1][1] : pts[1][0] < Math.min(...laid.nodes.map((n) => n.x)) && +lab.attrs.x < pts[1][0]),
        `auto ${orient}: it runs on the ${orient === 'right' ? 'top' : 'left'} side, its label outside the path`);
      ok(el.edges[2].dots.length > 0 && !!el.edges[2].poly, `auto ${orient}: its pulse runs along the routed path`);
    }
    // the decision chart: two rank skips and a back edge, none meets a box
    const chart = {nodes: [{id: 's', label: '受付'}, {id: 'q', label: '急ぎ？', shape: 'diamond'}, {id: 'a', label: '調べる'}, {id: 'b', label: '答える'}, {id: 'e', label: '終わり'}],
      edges: [{from: 's', to: 'q'}, {from: 'q', to: 'a', label: 'いいえ'}, {from: 'a', to: 'b'}, {from: 'b', to: 'e'}, {from: 'q', to: 'e', label: 'はい'}, {from: 'b', to: 'a', label: '足りない'}]};
    const {el, reports} = auto(chart);
    ok(!reports.length && el.edges.every((_, i) => !hitsBox(el, i).length), 'auto: a chart with a rank skip, a two-way pair and labels: no line meets a box, no report'
      + (reports.length ? ': ' + reports.map((r) => r.msg) : '') + el.edges.map((_, i) => hitsBox(el, i).length ? ` edge ${i} crosses ${hitsBox(el, i)}` : '').join(''));
    // a straight skip that meets no box stays straight: b is beside the line, not on it
    const aside = auto({nodes: N('a', 'x', 'b', 'c'), edges: [{from: 'a', to: 'x'}, {from: 'a', to: 'b'}, {from: 'x', to: 'c'}, {from: 'b', to: 'c'}]});
    ok(aside.el.edges.every((o) => !o.poly), 'auto: edges that do not skip ranks stay straight');
    // no room: both ends have a box on both sides in their ranks, so the skip cannot run around; reported, naming the edge
    const boxed = {nodes: N('p', 'a', 'q', 'r', 'm', 's', 't', 'c', 'u'),
      edges: [{from: 'p', to: 'r'}, {from: 'a', to: 'm'}, {from: 'q', to: 's'}, {from: 'r', to: 't'}, {from: 'm', to: 'c'}, {from: 's', to: 'u'}, {from: 'a', to: 'c'}]};
    const nr = auto(boxed, {orient: 'right'}), msg = nr.reports.map((r) => r.code + ' ' + r.msg).join('; ');
    ok(nr.reports.some((r) => r.code === 'layout' && /"a" → "c"/.test(r.msg) && /no room/.test(r.msg)), 'auto: a rank skip with no free side is reported (layout), naming the edge: ' + msg);
  }
  console.log(fails ? `\nFAIL: ${fails}` : '\ntest-flow: ok');
  process.exitCode = fails ? 1 : 0;
}

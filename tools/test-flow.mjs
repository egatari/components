// node tools/test-flow.mjs: m-flow's edges start on their source box and end on the facing side of their target box,
// within the box, for fan-out, fan-in, stacked, diagonal, two-way and diamond layouts (no browser)
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
const make = (data) => {
  const el = new Part(); el.setAttribute('lang', 'ja');
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
const swap = (d) => ({nodes: d.nodes.map((n) => ({...n, x: n.y, y: n.x / 4, w: n.h * 2, h: n.w / 6})), edges: d.edges});
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
  console.log(fails ? `\nFAIL: ${fails}` : '\ntest-flow: ok');
  process.exitCode = fails ? 1 : 0;
}

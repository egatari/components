// node tools/test-data-part.mjs: the data-part marks that Studio's geometry check measures, in m-tree, m-fishbone and m-quad
// (m-flow's are in tools/test-flow.mjs). Boxes, marks, edges with from/to and exactly one line, labels with their owner,
// and data-part-at="outside" on texts placed outside their box (no browser)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {ROOT} from './studio.mjs';
let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
class Node {
  constructor(tag = 'm-x') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 520; this._text = ''; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return k in this.attrs; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  // like the DOM, appending a node moves it from its old parent
  appendChild(n) { if (n.parentElement) n.parentElement.removeChild(n); this.children.push(n); n.parentElement = this; return n; }
  insertBefore(n) { return this.appendChild(n); }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentElement = null; }
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
for (const name of ['shape', 'base', 'markup-reader', 'tree', 'fishbone', 'quad']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
const make = (name, data, attrs = {}) => {
  const el = new registry[name](); el.setAttribute('lang', 'ja');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const script = el.appendChild(new Node('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data);
  const reports = []; el.mount({lang: 'ja', report: (code, msg) => reports.push({code, msg})});
  const all = []; (function walk(n) { all.push(n); n.children.forEach(walk); })(el);
  const part = (k) => all.filter((n) => n.attrs['data-part'] === k);
  return {el, reports, all, part};
};
const ids = (ns) => ns.map((n) => n.attrs['data-part-id']).join();
const ends = (ns) => ns.map((n) => n.attrs['data-part-from'] + '>' + n.attrs['data-part-to']).join();
const oneLine = (g) => { const ls = []; (function walk(n) { if ('data-part-line' in n.attrs) ls.push(n); n.children.forEach(walk); })(g); return ls; };
const labels = (r, of, at) => r.part('label').filter((n) => n.attrs['data-part-of'] === of && (n.attrs['data-part-at'] || '') === at);
const A = '→';

// m-tree
{
  const r = make('tree', {nodes: [{id: 'r', label: '根'}, {id: 'a', label: 'A', parent: 'r', note: '注記'}, {id: 'b', label: 'B', parent: 'r', branch: 'はい'}],
    edges: [{from: 'a', to: 'b', label: '比べる'}]});
  ok(ids(r.part('box')) === 'r,a,b' && r.part('box').every((n) => n.localName === 'rect'), 'm-tree: data-part="box" on each node <rect> with the node id');
  const es = r.part('edge');
  ok(es.every((g) => g.localName === 'g') && ids(es) === `r${A}a,r${A}b,a${A}b` && ends(es) === 'r>a,r>b,a>b', 'm-tree: parent–child lines and the other connection are edges (<g>) with from→to ids, from and to');
  ok(es.every((g) => oneLine(g).length === 1 && oneLine(g)[0].localName === 'path'), 'm-tree: each edge has exactly one data-part-line <path>');
  ok(ids(labels(r, 'box', '')) === 'r,a,b' && ids(labels(r, 'box', 'outside')) === 'a', 'm-tree: names are labels of their box; the note is outside its box');
  ok(ids(labels(r, 'edge', '')).split(',').sort().join() === [`a${A}b`, `r${A}b`].sort().join(), 'm-tree: the branch name and the connection label are labels of their edge');
  ok(!r.reports.length, 'm-tree: no reports' + (r.reports.length ? ': ' + r.reports.map((x) => x.msg).join('; ') : ''));
}

// m-fishbone
{
  const r = make('fishbone', {effect: {label: '遅れ', note: '注'}, nodes: [{id: 'p', label: '人', note: '人の注'}, {id: 'p1', label: '人手', parent: 'p'}, {id: 'p1a', label: '休み', parent: 'p1'}, {id: 'p1b', label: '新人', parent: 'p1'},
    {id: 'm', label: '機械'}, {id: 'm1', label: '故障', parent: 'm'}], edges: [{from: 'p1b', to: 'm1', label: 'つながり'}]});
  ok(ids(r.part('box')) === '@head,p,m' && r.part('box').every((n) => n.localName === 'rect'), 'm-fishbone: boxes are the effect (@head) and the main bones');
  const es = r.part('edge'), by = Object.fromEntries(es.map((g) => [g.attrs['data-part-id'], g]));
  ok([`@tail${A}@head`, `p${A}@spine`, `m${A}@spine`, `p1${A}p`, `p1a${A}p1`, `p1b${A}p1`, `m1${A}m`, `p1b${A}m1`].every((k) => by[k]) && es.length === 8,
    'm-fishbone: the spine, main bones (to @spine), causes (to their parent) and the connection are edges: ' + ids(es));
  ok(oneLine(by[`@tail${A}@head`]).length === 1 && oneLine(by[`p1a${A}p1`]).length === 2 && oneLine(by[`p1b${A}p1`]).length === 1 && oneLine(by[`p1${A}p`]).length === 1,
    'm-fishbone: one data-part-line per edge, and the slanted line to the sub-causes is in the first sub-cause\'s edge');
  ok(ids(labels(r, 'box', '')) === '@head,p,m' && ids(labels(r, 'box', 'outside')) === '@head,p', 'm-fishbone: box names are labels of their box; the box notes are outside');
  ok(ids(labels(r, 'edge', '')).split(',').sort().join() === ['p1', 'p1a', 'p1b', 'm1', `p1b${A}m1`].sort().join(), 'm-fishbone: each cause\'s text is the label of its own edge, and the connection\'s label of its edge');
  ok(!r.reports.length, 'm-fishbone: no reports' + (r.reports.length ? ': ' + r.reports.map((x) => x.msg).join('; ') : ''));
  const bad = make('fishbone', {effect: {label: '遅れ'}, nodes: [{id: '@x', label: '人'}, {id: 'c', label: 'c', parent: '@x'}]});
  ok(bad.reports.some((x) => x.code === 'data' && /starts with @/.test(x.msg)), 'm-fishbone: a node id starting with @ is reported (data)');
}

// m-quad
{
  const r = make('quad', {x: {lo: '低', hi: '高'}, y: {lo: '低', hi: '高'}, quads: {tr: '右上'}, items: [{x: 0.2, y: 0.3, label: 'A'}, {x: 0.7, y: 0.6, label: 'B', to: {x: 0.8, y: 0.9, label: 'B 後'}}, {x: 0.4, y: 0.8, label: 'C'}]});
  ok(ids(r.part('mark')) === 'p1,p2,p3' && r.part('mark').every((n) => n.localName === 'circle') && !r.part('box').length, 'm-quad: each point\'s circle is data-part="mark" p1, p2, p3 (no boxes)');
  const es = r.part('edge');
  ok(es.length === 1 && ids(es) === `p2${A}@moved` && ends(es) === 'p2>@moved' && oneLine(es[0]).length === 1 && oneLine(es[0])[0].localName === 'line', 'm-quad: the move is an edge from p2 to @moved with one data-part-line');
  ok(ids(labels(r, 'mark', 'outside')) === 'p1,p2,p2,p3' && !labels(r, 'mark', '').length, 'm-quad: point names and the move target\'s name are outside labels of their mark');
  ok(r.part('label').length === 4, 'm-quad: axis and quadrant names are not marked');
}
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-data-part: ok');
process.exitCode = fails ? 1 : 0;

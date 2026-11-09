// Mapping model, real base/shape/SVG in Node, then the demo through pinned Studio.
//   node tools/test-mapping.mjs [work dir]
//   node tools/test-mapping.mjs --node   (no browser required)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio } from './studio.mjs';

let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
const coin = {outcomes: [{label: '表表', x: 2}, {label: '表裏', x: 1}, {label: '裏表', x: 1}, {label: '裏裏', x: 0}]};
const weighted = {outcomes: [{label: 'a', x: 2, p: 0.2}, {label: 'b', x: -1, p: 0.3}, {label: 'c', x: 2, p: 0.5}]};

// Same minimal DOM surface as test-particles: run the real dependency factories and base guards.
class SvgNode {
  constructor(tag = 'm-mapping') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 440; this._text = ''; }
  get childNodes() { return this.children; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(n) { this.children.push(n); n.parentElement = this; return n; }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); }
  closest() { return this.getAttribute('lang') ? this : null; }
  get textContent() { return this._text + this.children.map((n) => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get outerHTML() { return `<${this.localName} ${JSON.stringify(this.attrs)}>${this._text}${this.innerHTML}</${this.localName}>`; }
  get innerHTML() { return this.children.map((n) => n.outerHTML).join(''); }
}
const registry = {};
const context = vm.createContext({HTMLElement: SvgNode, console, getComputedStyle: () => ({fontFamily: 'BIZ UDPGothic'}),
  document: {createElementNS: (_, tag) => new SvgNode(tag), createElement: (tag) => new SvgNode(tag)},
  egatariParts: {define: (meta, factory) => { registry[meta.name] = factory(Object.fromEntries(Object.keys(meta.requires || {}).map((n) => [n, registry[n]]))); }}
});
for (const name of ['shape', 'base', 'mapping']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
const make = (data = coin, attrs = {}, dims = {}, lang = 'ja') => {
  const el = new registry.mapping();
  Object.assign(el, dims);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (data !== undefined) { const script = el.appendChild(new SvgNode('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data); }
  const reports = [], ctx = {lang, report: (code, msg) => reports.push({code, msg})};
  el.mount(ctx);
  return {el, reports, ctx};
};
const {el: c, reports} = make();
const p = c.plan();
ok(c.steps === 4 && registry.mapping.steps === 4 && registry.mapping.preview === 'none', 'four steps, no answer preview');
ok(p.groups.map((g) => g.x).join() === '0,1,2', 'distinct values sorted numerically');
ok(p.groups.map((g) => g.count).join() === '1,2,1' && p.groups.map((g) => g.p).join() === '0.25,0.5,0.25', 'counts and probability sums group duplicate values');
ok(p.outcomes.every((o) => o.p === 0.25) && p.fractions && c.fmt(0.25) === '1/4' && c.fmt(0.5) === '1/2', 'omitted probabilities are equal and default to reduced fractions');
ok(reports.length === 0, 'coin model fits without reports');
const label = c.getAttribute('aria-label');
ok(label.includes('表表→2') && label.includes('表裏→1') && label.includes('裏表→1') && label.includes('裏裏→0') && label.includes('P(X=0)=1/4') && label.includes('P(X=1)=1/2') && label.includes('P(X=2)=1/4'), 'final accessible name lists every mapping and distribution value');
ok(c.getAttribute('role') === 'img' && c.svg.getAttribute('aria-hidden') === 'true', 'image role and hidden SVG');
ok(make(coin, {'aria-label': 'Author description'}).el.getAttribute('aria-label') === 'Author description', 'author accessible name retained');
const en = make({...coin, name: 'Y', unit: 'g'}, {}, {}, 'en').el;
ok(en.getAttribute('aria-label').startsWith('Random variable Y') && en.svg.textContent.includes('Value of Y') && en.svg.textContent.includes('2 outcomes') && en.svg.textContent.includes('Total 1') && en.value(2) === '2g', 'ctx.lang, variable name and unit used in final text');
ok(make(coin, {lang: 'JA-jp'}, {}, 'en').el.T.outcomes === '起こりうる結果' && make(coin, {lang: 'en'}, {}, 'ja').el.T.outcomes === 'Outcomes', 'element language takes priority, Japanese matching is case insensitive');
const w = make(weighted);
ok(w.reports.length === 0 && !w.el.plan().fractions && w.el.fmt(0.7) === '0.70' && w.el.plan().groups[1].count === 2 && w.el.plan().groups[1].p === 0.7, 'weighted outcomes use decimal probability sums');
ok(make({...weighted, fractions: true}).el.fmt(0.7) === '7/10' && make({...coin, fractions: false}).el.fmt(0.25) === '0.25', 'fractions override works both ways');
ok(!make({...coin, fractions: false}).el.plan().showP && w.el.plan().showP, 'probabilities shown when explicit or fractions enabled');
ok(make({outcomes: [{label: 'a', x: 0, p: 0.5}, {label: 'b', x: 1, p: 0.5}]}).el.plan().fractions, 'explicit equal probabilities also default to fractions');
const mixed = make({outcomes: [{label: 'a', x: 0, p: 0.25}, {label: 'b', x: 1}]});
ok(mixed.reports.some((r) => r.code === 'data' && /mixed p/.test(r.msg)) && mixed.el.plan().outcomes[1].p === 0, 'mixed probabilities reported and missing values become zero');
const bad = make({outcomes: [{label: 'a', x: 0, p: 0.4}, {label: 'b', x: 1, p: 0.4}]});
ok(bad.reports.some((r) => r.code === 'data' && /sum is 0.8/.test(r.msg)) && bad.el.plan().groups.every((g) => g.p === 0.4) && bad.el.totalText().endsWith('0.8'), 'non-unit sum reported without normalization');
ok(make({outcomes: [{label: 'a', x: 0, p: 0.5}, {label: 'b', x: 1, p: 0.5000000001}]}).reports.length === 0, 'unit sum accepts the specified tolerance');
const rounded = make({outcomes: [{label: 'a', x: 0, p: 0.5}, {label: 'b', x: 1, p: 0.5001}]});
ok(rounded.el.totalText().endsWith('1.0001') && rounded.reports.some((r) => r.code === 'data'), 'invalid total never rounds to one');
const zero = make({outcomes: [{label: 'a', x: 1, p: 0}, {label: 'b', x: 1, p: 0}]});
ok(zero.el.plan().groups.length === 1 && zero.el.plan().groups[0].p === 0 && zero.reports.some((r) => r.code === 'data'), 'one distinct value and zero total remain defined');
const outOfRange = make({outcomes: [{label: 'a', x: 0, p: -0.2}, {label: 'b', x: 1, p: 1.2}]});
ok(outOfRange.reports.some((r) => r.code === 'data' && /between 0 and 1/.test(r.msg)) && outOfRange.el.plan().outcomes[0].p === -0.2, 'out-of-range probabilities reported and retained');
const literal = make({outcomes: [{label: 'a_b*', x: -2}, {label: 'c^d', x: 3}]});
ok(literal.el.svg.textContent.includes('a_b*') && literal.el.svg.textContent.includes('c^d'), 'outcome labels remain literal text');
const invalidAttrs = make(coin, {dur: -1, stagger: -2, digits: 11, size: 23});
ok(invalidAttrs.reports.filter((r) => r.code === 'attr').length === 4 && invalidAttrs.el.props.dur === 1 && invalidAttrs.el.props.size === 0, 'invalid attributes reported with safe defaults');
const die = {outcomes: Array.from({length: 6}, (_, i) => ({label: String(i + 1), x: (i + 1) % 2 === 0 ? 1 : 0}))};
ok(make({...die, fractions: false}).reports.length === 0, 'six-outcome example fits when individual probabilities are hidden');
ok(make(die, {}, {clientHeight: 610}).reports.length === 0, 'six two-line outcomes fit with sufficient height');
ok(make(die, {}, {clientWidth: 1100, clientHeight: 160}).reports.some((r) => r.code === 'size'), 'insufficient height is reported');
ok(make(coin, {}, {clientWidth: 300}).reports.some((r) => r.code === 'size'), 'insufficient width is reported');
const twelve = {outcomes: Array.from({length: 12}, (_, i) => ({label: String(i), x: i}))};
const tall = make(twelve, {}, {clientHeight: 1300});
ok(tall.reports.length === 0 && tall.el.plan().groups[4].tone === 'series-1', 'twelve distinct values supported with sufficient space and cyclic colours');
const nonUniform = make({outcomes: [{label: 'a', x: 0}, {label: 'b', x: 1}, {label: 'c', x: 4}]}).el;
const by = nonUniform.boxes.map((b) => +b.frame.getAttribute('y'));
ok(Math.abs((by[0] - by[1]) / (by[1] - by[2]) - 1 / 3) < 1e-9, 'vertical positions use numerical distances');
ok(make({outcomes: [{label: 'a', x: 0}, {label: 'b', x: 0.001}, {label: 'c', x: 4}]}).reports.some((r) => r.code === 'size'), 'closely spaced value boxes report size');

for (const [id, el] of [['coin', c], ['weighted', w.el], ['zero', zero.el], ['range', outOfRange.el], ['twelve', tall.el]]) {
  let deterministic = true, finite = true, duration = true, preview = true;
  for (let k = 0; k <= 4; k++) for (const t of [0, el.duration(k) / 2, Infinity]) {
    el.render(k, t, {preview: false}); const html = el.innerHTML;
    el.render(4, Infinity); el.render(0, 0); el.render(k, t, {preview: false}); deterministic &&= html === el.innerHTML;
    el.render(k, t, {preview: true}); preview &&= html === el.innerHTML;
    finite &&= !/NaN|undefined|Infinity/.test(el.svg.outerHTML);
    el.render(k, Infinity); const end = el.innerHTML; el.render(k, el.duration(k)); duration &&= end === el.innerHTML;
  }
  ok(deterministic && finite && duration && preview, `${id}: seek order, finite geometry, duration completion and preview exemption`);
}
c.render(1, Infinity);
ok(c.outcomeLayer.getAttribute('opacity') === '1' && c.valueLayer.getAttribute('opacity') === '0' && c.distribution.getAttribute('opacity') === '0', 'step 1 shows only outcomes');
c.render(2, 0.1);
ok(c.arrows[0].path.getAttribute('opacity') === '1' && c.arrows[1].path.getAttribute('opacity') === '0', 'step 2 staggers arrows');
c.render(3, Infinity);
ok(c.boxes.every((b) => b.summary.getAttribute('opacity') === '1') && c.distribution.getAttribute('opacity') === '0' && c.arrows.every((a) => a.path.getAttribute('style').includes(a.tone)), 'step 3 shows grouped counts and colours before bars');
c.render(4, Infinity);
ok(Math.abs(+c.bars[1].bar.getAttribute('width') - 2 * +c.bars[0].bar.getAttribute('width')) <= 0.2 && c.distribution.getAttribute('opacity') === '1', 'final bars represent the grouped probabilities');
const walk = (e) => [e, ...e.children.flatMap(walk)];
ok(walk(c.svg).filter((e) => e.localName === 'text').every((e) => +e.getAttribute('font-size') >= 24), 'all SVG text is at least 24px');
for (const data of [null, {}, {outcomes: []}, {outcomes: [{label: 'a', x: 0}]}, {outcomes: [...twelve.outcomes, {label: 'extra', x: 12}]},
  {outcomes: [{label: 'a', x: '1'}, {label: 'b', x: 2}]}, {outcomes: [{label: 'a', x: 0, extra: true}, {label: 'b', x: 2}]},
  {...coin, extra: true}, {...coin, fractions: 'true'}, {outcomes: [{label: 'a', x: null}, {label: 'b', x: 1}]}]) {
  const r = make(data);
  ok(r.el.steps === 0 && !r.el.svg && r.reports.length === 1 && r.reports[0].code === 'data', `shape rejects ${JSON.stringify(data)}`);
}
if (process.argv.includes('--node')) {
  console.log(fails ? `\nFAIL: ${fails}` : '\ntest-mapping (Node model and SVG): ok');
  process.exit(fails ? 1 : 0);
}
console.log('Node checks complete; checking the demo in a browser.');
const S = await studio();
const work = path.resolve(process.argv[2] || path.join(ROOT, 'components/mapping/out/test'));
fs.mkdirSync(work, {recursive: true});
const src = path.join(work, 'deck.html'), out = path.join(work, 'deck.out.html');
const demo = fs.readFileSync(path.join(ROOT, 'components/mapping/demo.html'), 'utf8');
// Include the same three examples in English to exercise real font metrics as well.
const english = demo.match(/<div id="stage">([\s\S]*)<\/div>\s*<\/body>/)[1].replaceAll('<section class="slide', '<section lang="en" class="slide');
fs.writeFileSync(src, demo.replace('</div>\n</body>', english + '</div>\n</body>'));
S.build(src, out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready);
  await page.evaluate(() => document.fonts.ready);
  const results = await page.evaluate(() => [...document.querySelectorAll('m-mapping')].map((c, i) => {
    let history = true;
    for (let k = 0; k <= 4; k++) {
      DECK.seek(i, k, Infinity); const html = c.innerHTML;
      DECK.seek(i, 4, Infinity); DECK.seek(i, 0, 0); DECK.seek(i, k, Infinity); history &&= html === c.innerHTML;
    }
    DECK.seek(i, 4, Infinity);
    const texts = [...c.querySelectorAll('text')].map((e) => ({s: e.textContent, box: e.getBoundingClientRect(), size: +getComputedStyle(e).fontSize.replace('px', '')}));
    const overlaps = texts.flatMap((a, j) => texts.slice(j + 1).filter((b) => Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 2 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 4).map((b) => a.s + ' / ' + b.s));
    const box = c.getBoundingClientRect();
    return {history, overlaps, fits: texts.every((t) => t.size >= 24 && t.box.left >= box.left && t.box.right <= box.right && t.box.top >= box.top && t.box.bottom <= box.bottom),
      role: c.getAttribute('role'), label: c.getAttribute('aria-label'), finite: !/NaN|undefined/.test(c.svg.outerHTML)};
  }));
  for (const [i, r] of results.entries()) ok(r.history && r.fits && !r.overlaps.length && r.finite && r.role === 'img' && r.label.includes('P(X='), `browser example ${i}: deterministic, accessible, ≥24px, contained, no overlaps (${r.overlaps.join('; ')})`);
  for (let i = 0; i < results.length; i++) {
    await page.evaluate((i) => DECK.seek(i, 4, Infinity), i);
    await page.screenshot({path: path.join(work, `final-${i}.png`)});
  }
  ok(errors.length === 0, 'browser has no page errors: ' + errors.join('; '));
  const records = await page.evaluate(() => DECK.componentErrors || []);
  ok(records.length === 0, 'demo has no component reports: ' + JSON.stringify(records));
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-mapping: ok');
process.exit(fails ? 1 : 0);

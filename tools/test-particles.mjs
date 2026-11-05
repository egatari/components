// m-particles through the registry and pinned Studio: parsing, conservation, atom identity,
// fixed-size particles, arbitrary seeks, accessible final state and preview handling.
//   node tools/test-particles.mjs [work dir]
//   node tools/test-particles.mjs --node  (model and SVG logic only; full run also needs a browser)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio } from './studio.mjs';
import { partClass } from './parts.mjs';
let fails = 0;
const ok = (v, msg) => { console.log((v ? 'ok   ' : 'FAIL ') + msg); if (!v) fails++; };
const water = {reactants: [{formula: 'H2', n: 2}, {formula: 'O2', n: 1}], products: [{formula: 'H2O', n: 2}]};
const reaction = (a, b) => ({reactants: a.map(([formula, n]) => ({formula, n})), products: b.map(([formula, n]) => ({formula, n}))});
const cases = [
  ['default', '', {}],
  ['no-data', '', null],
  ['state-en', 'lang="en"', {}],
  ['reverse', 'motion="false" volume="true" count="30"', {states: ['gas', 'liquid', 'solid'], labels: ['蒸気', null, '氷']}],
  ['single', 'count="6"', {states: ['solid']}],
  ['sublimation', '', {states: ['solid', 'gas', 'solid']}],
  ['water', 'mode="reaction"', water],
  ['iron', 'mode="reaction"', reaction([['Fe', 1], ['S', 1]], [['FeS', 1]])],
  ['carbon', 'mode="reaction" lang="en"', reaction([['C', 1], ['O2', 1]], [['CO2', 1]])],
  ['shape-override', 'mode="reaction"', {reactants: [{formula: 'CO2', n: 1, shape: 'bent'}], products: [{formula: 'CO2', n: 1, shape: 'linear'}]}],
  ['ammonia', 'mode="reaction"', reaction([['NH3', 1]], [['NH3', 1]])],
  ['methane', 'mode="reaction"', reaction([['CH4', 1]], [['CH4', 1]])],
  ['unbalanced', 'mode="reaction"', reaction([['H2', 2], ['O2', 1]], [['H2O', 1]])],
  ['invalid', 'mode="reaction"', reaction([['Ca(OH)2', 1]], [['CaO2H2', 1]])],
  ['charge', 'mode="reaction"', reaction([['Na+', 1]], [['Na', 1]])],
  ['zero', 'mode="reaction"', reaction([['H0', 1]], [['H', 1]])],
  ['coefficient', 'mode="reaction"', reaction([['H2', 0]], [['H2', 1]])],
  ['limit', 'mode="reaction"', reaction([['H2', 12]], [['H', 24]])],
  ['over', 'mode="reaction"', reaction([['H2', 13]], [['H', 24]])],
  ['elements', 'mode="reaction"', reaction([['HHeLiBeBCN', 1]], [['HHeLiBeBCN', 1]])],
  ['repeat', 'mode="reaction"', reaction([['CH3COOH', 1]], [['C2H4O2', 1]])],
  ['multi-digit', 'mode="reaction"', reaction([['C12H12', 1]], [['C12H12', 1]])],
  ['custom', 'mode="reaction" aria-label="Author description"', {...water, labels: {before: '出発', apart: '原子', after: '生成物', atoms: '個数：'}}],
  ['six', 'mode="reaction"', reaction([['HHeLiBeBC', 1]], [['HHeLiBeBC', 1]])],
];
// Pure model checks run before launching the browser, so a missing browser does not hide parser failures.
const C = partClass(fs.readFileSync(path.join(ROOT, 'components/particles/index.js'), 'utf8'));
const model = (data, props = {}) => {
  const el = new C();
  Object.defineProperty(el, 'data', {value: data || {}}); el.props = {...Object.fromEntries(Object.entries(C.props).map(([k, d]) => [k, d.default])), ...props};
  el.W = 1184; el.H = 440;
  return el;
};
for (const [id, attrs, data] of cases) {
  const el = model(data, {mode: attrs.includes('mode="reaction"') ? 'reaction' : 'state'}), p = el.plan();
  const invalid = ['invalid', 'charge', 'zero', 'coefficient', 'over', 'elements'].includes(id);
  ok(p.fatal === invalid, `${id}: model accepts only supported data`);
  if (p.reaction && !p.fatal) {
    ok(p.balanced === (id !== 'unbalanced'), `${id}: conservation checked from parsed element counts`);
    ok(el.steps === 3, `${id}: reaction has exactly three steps`);
  }
}
const wm = model(water, {mode: 'reaction'}).plan();
ok(wm.eq === '2H_2 + O_2 → 2H_2O' && wm.totals[0].H === 4 && wm.totals[1].O === 2, 'water equation and atom counts computed exactly');
const repeated = model(reaction([['CH3COOH', 1]], [['C2H4O2', 1]]), {mode: 'reaction'}).plan();
ok(repeated.totals[0].C === 2 && repeated.totals[0].H === 4 && repeated.totals[0].O === 2, 'repeated element symbols accumulate');
for (const formula of ['h2', '2H2', 'H02', 'H2O!', 'H2 O', '', 'H1000000000000000000000']) {
  ok(model(reaction([[formula, 1]], [['H2', 1]]), {mode: 'reaction'}).plan().fatal, `invalid formula ${JSON.stringify(formula)} is refused in full`);
}
for (const count of [6, 16, 30]) {
  const el = model({}, {count});
  const layouts = ['solid', 'liquid', 'gas'].map((s) => el.arrangement(s));
  ok(layouts.every((a) => a.length === count && a.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))), `${count} particles: all arrangements keep the inventory and finite coordinates`);
  ok(JSON.stringify(layouts[1]) === JSON.stringify(el.arrangement('liquid')), `${count} particles: liquid jitter is deterministic`);
  const extent = (a) => Math.max(...a.map((q) => q.x)) - Math.min(...a.map((q) => q.x));
  ok(extent(layouts[2]) > extent(layouts[0]) * 2, `${count} particles: gas is more spread out than solid`);
  ok(layouts.every((a) => a.every((q) => q.x >= 19 && q.x <= el.W - 19 && q.y >= 63 && q.y <= el.H - 108)), `${count} particles: all centers remain inside the container`);
}
const sm = model({states: ['gas', 'solid']});
ok(sm.steps === 1 && model({states: ['solid']}).steps === 0 && model({}).steps === 2, 'state steps count consecutive transitions');
const mm = model({});
const pair = mm.molecule(['H', 'H'], 21), bent = mm.molecule(['H', 'H', 'O'], 21, 'bent');
ok(Math.abs(Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) - 42) < 1e-9, 'diatomic molecules have touching atoms');
ok([0, 1].every((i) => Math.abs(Math.hypot(bent[i].x - bent[2].x, bent[i].y - bent[2].y) - 42) < 1e-9), 'three-atom molecule places the single-count element centrally with touching neighbours');
const collinear = (points) => {
  const [a, b, c] = points;
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-6;
};
const moleculePoints = (formula, shape) => {
  const m = {formula, n: 1, ...(shape ? {shape} : {})};
  const el = model({reactants: [m], products: [m]}, {mode: 'reaction'});
  return el.moleculeLayout(el.plan().sides[0], 500, 21).slots;
};
ok(collinear(moleculePoints('CO2')), 'CO2 default centres are collinear');
for (const formula of ['H2O', 'H2S', 'SO2']) ok(!collinear(moleculePoints(formula)), `${formula} default is bent`);
ok(collinear(moleculePoints('N2O')), 'unknown three-atom molecules default to linear');
ok(!collinear(moleculePoints('CO2', 'bent')) && collinear(moleculePoints('H2O', 'linear')), 'explicit shape overrides both linear and bent defaults');
for (const [formula, center, neighbours] of [['NH3', 'N', 3], ['CH4', 'C', 4]]) {
  const points = moleculePoints(formula), c = points.find((p) => p.e === center), outer = points.filter((p) => p !== c);
  ok(outer.length === neighbours && outer.every((p) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - 42) < 1e-6), `${formula}: central ${center} touches every surrounding H`);
  const angles = outer.map((p) => Math.atan2(p.y - c.y, p.x - c.x)).sort((a, b) => a - b);
  ok(angles.every((a, i) => Math.abs((angles[(i + 1) % angles.length] - a + 2 * Math.PI) % (2 * Math.PI) - 2 * Math.PI / neighbours) < 1e-6), `${formula}: surrounding atoms are evenly spaced in a flat ${neighbours === 3 ? 'trigonal layout' : 'cross'}`);
}
for (const formula of ['H2', 'O2', 'N2', 'Cl2', 'HCl']) {
  const [a, b] = moleculePoints(formula);
  ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 42) < 1e-6, `${formula}: diatomic default remains a touching pair`);
}
ok(JSON.stringify(moleculePoints('NH3', 'chain').map(({x, y}) => [x, y])) === JSON.stringify(moleculePoints('He4').map(({x, y}) => [x, y])), 'explicit chain overrides the radial default with the existing compact layout');
const extent = (points, axis) => Math.max(...points.map((q) => q[axis])) - Math.min(...points.map((q) => q[axis]));
const minimumDistance = (points) => Math.min(...points.flatMap((q, i) => points.slice(i + 1).map((a) => Math.hypot(q.x - a.x, q.y - a.y))));
const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
  const u = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
};
for (let count = 6; count <= 30; count++) for (const volume of [false, true]) {
  const el = model({}, {count, volume}), solid = el.arrangement('solid'), liquid = el.arrangement('liquid'), gas = el.arrangement('gas');
  const tag = `${count} particles, volume=${volume}`;
  ok([solid, liquid].every((a) => a.length === count && minimumDistance(a) >= 38 - 1e-6) && minimumDistance(gas) >= 2.6 * 19, `${tag}: close states never overlap; gas has substantially larger gaps`);
  ok(extent(liquid, 'x') > extent(solid, 'x') && extent(liquid, 'y') < extent(solid, 'y'), `${tag}: liquid is wider and lower than solid`);
  ok([solid, liquid].every((a) => Math.abs(Math.max(...a.map((q) => q.y)) + 19 - (el.stateBox('solid').y + el.stateBox('solid').height - 1.5)) < 1e-6), `${tag}: solid and liquid sit on the floor`);
  ok(new Set(gas.map((q) => q.x.toFixed(2))).size === count && new Set(gas.map((q) => q.y.toFixed(2))).size === count && extent(gas, 'x') > el.stateBox('gas').width * 0.7 && extent(gas, 'y') > el.stateBox('gas').height * 0.45, `${tag}: gas is scattered across the box rather than arranged in rows`);
  for (const [state, points, length] of [['liquid', liquid, 18], ['gas', gas, 24]]) {
    const box = el.stateBox(state), arrows = points.map((_, i) => el.motionArrow(points, i, length, box));
    ok(arrows.filter(Boolean).every((mark) => {
      const [a, b] = mark.segments[0];
      return Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - length) < 1e-6;
    }), `${tag}, ${state}: arrows keep their full ${length}px length`);
    ok(points.every((q) => q.x - 19 >= box.x && q.x + 19 <= box.x + box.width && q.y - 19 >= box.y && q.y + 19 <= box.y + box.height) && arrows.filter(Boolean).length >= (state === 'gas' ? count : Math.ceil(count / 2)) && arrows.every((mark, i) => !mark || mark.segments.every(([a, b]) => [a, b].every((q) => q.x >= box.x + 1 && q.x <= box.x + box.width - 1 && q.y >= box.y + 1 && q.y <= box.y + box.height - 1) && points.every((q, j) => i === j || segmentDistance(q, a, b) >= 20.19))), `${tag}, ${state}: visible arrows stay inside the box and outside all other particles (at least half the liquid particles)`);
  }
  for (const [from, to] of [[solid, liquid], [liquid, gas]]) {
    const box = el.stateBox('solid');
    // Use a single box here; the changing-width case is covered by the renderer checks below.
    if (volume) continue;
    const frames = [0.25, 0.5, 0.75].map((e) => el.separateParticles(from.map((q, i) => ({x: q.x * (1 - e) + to[i].x * e, y: q.y * (1 - e) + to[i].y * e})), box));
    ok(frames.every((points) => minimumDistance(points) >= 38 - 0.002), `${tag}: interpolated frames keep circles apart`);
  }
}
const square = model({}).arrangement('solid');
ok(new Set(square.map((q) => q.x)).size === 4 && new Set(square.map((q) => q.y)).size === 4, '16 particles form a complete 4 × 4 solid');
for (const n of [7, 11, 13, 17, 19, 23, 29]) {
  const points = model({}, {count: n}).arrangement('solid'), rows = new Map();
  points.forEach((q) => { if (!rows.has(q.y)) rows.set(q.y, []); rows.get(q.y).push(q.x); });
  ok([...rows.values()].every((xs) => Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 592) < 1e-6), `${n} particles: incomplete solid rows are centred`);
}

// Exercise the real base, shape checker and SVG renderer with a minimal DOM surface in Node.
// Browser checks below additionally verify the player bridge and real DOM behaviour.
class SvgNode {
  constructor(tag = 'm-particles') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 440; this._text = ''; }
  get childNodes() { return this.children; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(n) { this.children.push(n); n.parentElement = this; return n; }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); }
  closest() { return this.getAttribute('lang') ? this : {getAttribute: () => 'ja'}; }
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
for (const name of ['shape', 'base', 'particles']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
for (const [id, attrs, data] of cases) {
  const c = new registry.particles();
  for (const a of attrs.matchAll(/([a-z-]+)="([^"]*)"/g)) c.setAttribute(a[1], a[2]);
  if (data !== null) { const script = c.appendChild(new SvgNode('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data); }
  const reports = [], ctx = {lang: 'ja', report: (code, msg) => reports.push({code, msg})};
  c.mount(ctx);
  const p = c.plan(), nodes = c.atoms?.slice();
  let deterministic = true, spacing = true;
  for (let k = 0; k <= c.steps; k++) {
    c.render(k, Infinity, ctx); const html = c.innerHTML;
    c.render(c.steps, Infinity, ctx); c.render(0, 0, ctx); c.render(k, Infinity, ctx);
    deterministic &&= html === c.innerHTML;
    c.render(k, c.duration(k), ctx); deterministic &&= html === c.innerHTML;
    c.render(k, c.duration(k) / 2, ctx);
    if (c.currentParticles) spacing &&= minimumDistance(c.currentParticles) >= 38 - 0.002;
  }
  c.render(c.steps, Infinity, ctx);
  ok(!reports.some((r) => r.code === 'error') && deterministic && !/NaN|undefined/.test(c.svg?.outerHTML || ''), `${id}: real SVG renderer is deterministic, finishes within duration and has no contained error`);
  if (p.reaction && !p.fatal && p.balanced) {
    ok(c.atoms.every((n, i) => n === nodes[i] && c.source[i].e === c.destinations[i].e && n.getAttribute('transform') === `translate(${c.destinations[i].x.toFixed(3)} ${c.destinations[i].y.toFixed(3)})`) && new Set(c.destinations).size === nodes.length, `${id}: atom node identity and one-to-one source/product mapping survive rendering`);
  }
  if (id === 'default' || id === 'no-data') ok(c.steps === 2 && c.particles.length === 16 && c.getAttribute('aria-label').includes('固体→液体→気体'), `${id}: default inventory and final-state aria-label`);
  if (id === 'water') ok(c.getAttribute('aria-label').includes('2H₂ + O₂ → 2H₂O') && c.getAttribute('aria-label').includes('H 4 → 4'), 'real renderer exposes the final equation and counts');
  if (id === 'carbon') ok(collinear(c.target), 'rendered CO2 centres are collinear');
  if (id === 'water') ok(!collinear(c.target.slice(0, 3)), 'rendered H2O is bent');
  if (id === 'shape-override') ok(!collinear(c.source) && collinear(c.target), 'renderer applies per-molecule shape overrides independently on both sides');
  if (id === 'carbon') ok(c.getAttribute('aria-label').includes('Atoms:'), 'element lang selects English');
  if (id === 'custom') ok(c.getAttribute('aria-label') === 'Author description', 'author aria-label retained');
  if (id === 'unbalanced') ok(reports.some((r) => r.code === 'data' && /H 4 → 2/.test(r.msg) && /O 2 → 1/.test(r.msg)), 'unbalanced equation reports original counts through ctx.report');
  if (!p.fatal && !p.reaction) {
    ok(spacing, `${id}: rendered intermediate particles never overlap, including changing volume`);
    ok(c.particles.every((g) => g.children[0].getAttribute('r') === '19'), `${id}: larger 19px particles keep their radius in every state`);
    if (id === 'default' || id === 'no-data') ok(c.stateName.textContent === '液体 → 気体（沸騰）', `${id}: the transition is one complete caption`);
    if (id === 'state-en') ok(c.stateName.textContent === 'Liquid → Gas (boiling)', 'English transition caption includes both states and the change');
    c.render(0, Infinity, ctx);
    if (id === 'default') ok(c.stateName.textContent === '固体', 'step zero has only the initial state name');
    if (id === 'default') {
      c.render(1, Infinity, ctx);
      const liquidMarks = c.motionPaths.filter(Boolean), liquidStroke = c.marks[0].getAttribute('stroke-width'), liquidStyle = c.marks[0].getAttribute('style');
      ok(liquidMarks.length >= 8 && liquidMarks.every((m) => Math.abs(Math.hypot(m.segments[0][1].x - m.segments[0][0].x, m.segments[0][1].y - m.segments[0][0].y) - 18) < 1e-6), 'renderer draws readable 18px liquid arrows');
      c.render(2, Infinity, ctx);
      ok(c.marks.every((m) => m.getAttribute('stroke-width') === liquidStroke && m.getAttribute('style') === liquidStyle && liquidStyle.includes('stroke:var(--fg)')), 'liquid and gas arrows share the same stroke');
    }
    c.render(c.steps, Infinity, ctx);
  }
  if (p.reaction && !p.fatal) {
    ok(c.radius >= 24 && minimumDistance(c.separated) >= 3 * c.radius, `${id}: larger atoms have at least one radius of clear space when separated`);
    ok(Math.abs((Math.min(...c.separated.map((q) => q.x)) + Math.max(...c.separated.map((q) => q.x))) / 2 - c.W / 2) < 1e-6, `${id}: separated atoms are centred`);
    ok(c.stageName.textContent === '' && c.beforeName.textContent === c.words.before && c.afterName.textContent === c.words.after, `${id}: final labels occur only over their groups`);
    const sep = c.T.states[0] === '固体' ? '、' : ', ';
    ok(c.countsLine.textContent === c.words.atoms + p.counts.join(sep) && c.countsLine.getAttribute('text-anchor') === 'middle' && +c.countsLine.getAttribute('x') === c.W / 2, `${id}: count sentence has exact punctuation and is centred`);
    const center = (a) => (Math.min(...a.map((q) => q.y)) + Math.max(...a.map((q) => q.y))) / 2;
    ok(Math.abs(center(c.source) - c.reactionLayout.arrowY) < 1e-6 && Math.abs(center(c.target) - c.reactionLayout.arrowY) < 1e-6, `${id}: reaction arrow is aligned with both molecule groups`);
    ok(+c.equationName.getAttribute('y') - c.reactionLayout.pictureBottom <= 48 && +c.countsLine.getAttribute('y') - +c.equationName.getAttribute('y') <= 48, `${id}: equation and counts sit directly below the picture`);
    if (p.balanced) {
      c.render(2, Infinity, ctx);
      ok(c.stageName.textContent === c.words.apart && +c.stageName.getAttribute('y') === +c.beforeName.getAttribute('y') && c.beforeName.getAttribute('opacity') === '0', `${id}: separation uses the same top caption position`);
      c.render(3, Infinity, ctx);
    }
    if (['water', 'iron', 'carbon'].includes(id)) ok(Math.abs((c.reactionLayout.captionY - 24 + +c.countsLine.getAttribute('y') + 8) / 2 - c.H / 2) < 1e-6, `${id}: the complete final figure is vertically centred`);
  }
  if (!p.fatal && id !== 'unbalanced') ok(reports.length === 0, `${id}: no ctx.report on valid data (${reports.map((r) => r.msg).join(' | ')})`);
}
for (const data of [{reactants: [{formula: 'H2O', n: 1, shape: 'round'}], products: [{formula: 'H2O', n: 1}]}, null, {states: 'solid'}, {states: []}, {labels: {before: 1}}, {reactants: [{formula: 'H2', n: '2'}]}]) {
  const c = new registry.particles(), script = c.appendChild(new SvgNode('script'));
  script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data);
  const reports = [];
  c.mount({lang: 'ja', report: (code, msg) => reports.push({code, msg})});
  ok(c.steps === 0 && !c.svg && reports.length === 1 && reports[0].code === 'data', `wrong-shaped JSON ${JSON.stringify(data)} is contained before mount`);
}
if (process.argv.includes('--node')) { console.log(fails ? `\nFAIL: ${fails}` : '\ntest-particles (Node model and SVG): ok'); process.exit(fails ? 1 : 0); }
console.log('Node model and SVG checks complete; checking browser rendering next.');

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-particles-')));
fs.mkdirSync(work, {recursive: true});
const src = path.join(work, 'deck.html'), out = path.join(work, 'deck.out.html');
fs.writeFileSync(src, `<!DOCTYPE html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>Particles test</title></head><body><div id="stage">${cases.map(([id, attrs, data]) => `<section class="slide noconcl"><h2>${id}</h2><div class="body"><m-particles id="${id}" ${attrs} style="height:440px">${data === null ? '' : `<script type="application/json">${JSON.stringify(data)}</script>`}</m-particles></div></section>`).join('\n')}</div></body></html>`);
S.build(src, out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready);
  const r = await page.evaluate(() => {
    const result = {};
    [...document.querySelectorAll('m-particles')].forEach((c, i) => {
      const p = c.plan(), ja = c.getAttribute('lang') !== 'en';
      const seek = (k, t = Infinity) => { DECK.seek(i, k, t); };
      const snapshots = [];
      const nodes = [...c.querySelectorAll('[data-atom]')];
      let sameNodes = true, history = true, finite = true;
      for (let k = 0; k <= c.steps; k++) {
        for (const t of [0, c.duration(k) / 2, Infinity]) {
          seek(k, t);
          sameNodes &&= nodes.every((n, j) => c.querySelectorAll('[data-atom]')[j] === n);
          finite &&= !/NaN|undefined/.test(c.svg.outerHTML);
        }
        seek(k); const dom = c.innerHTML;
        snapshots.push({n: c.querySelectorAll('[data-particle]').length, radii: [...c.querySelectorAll('[data-particle] circle')].map((x) => x.getAttribute('r')), width: c.box?.getAttribute('width')});
        seek(c.steps); seek(0); seek(k); history &&= dom === c.innerHTML;
      }
      seek(c.steps);
      const idMap = p.reaction && !p.fatal && p.balanced ? c.source.every((a, j) => a.e === c.destinations[j].e) && new Set(c.destinations).size === c.source.length && c.destinations.every((a) => c.target.includes(a)) : null;
      const finalPositions = p.reaction && !p.fatal && p.balanced ? nodes.every((n, j) => n.getAttribute('transform') === `translate(${c.destinations[j].x.toFixed(3)} ${c.destinations[j].y.toFixed(3)})`) : null;
      const normal = c.innerHTML;
      c.render(c.steps, Infinity, {preview: true, lang: ja ? 'ja' : 'en'});
      const preview = normal === c.innerHTML;
      result[c.id] = {steps: c.steps, fatal: p.fatal, notes: p.notes, balanced: p.balanced, totals: p.totals, elements: p.elements, eq: p.eq, label: c.getAttribute('aria-label'), role: c.getAttribute('role'), hidden: c.svg.getAttribute('aria-hidden'), snapshots, sameNodes, history, finite, idMap, finalPositions, preview, marks: c.marks?.map((n) => n.getAttribute('d')), countsEmph: [...c.querySelectorAll('tspan')].filter((n) => n.style.fill === 'var(--emph)').map((n) => n.textContent)};
    });
    return {cases: result, reports: EGATARI_PARTS_SHIM.reports().map((x) => ({code: x.code, msg: x.msg}))};
  });
  const c = r.cases;
  ok(c.default.steps === 2 && c['no-data'].steps === 2 && c.reverse.steps === 2 && c.single.steps === 0 && c.water.steps === 3, 'step counts: consecutive states, one state, and three reaction stages');
  for (const [id, count] of [['default', 16], ['reverse', 30], ['single', 6], ['sublimation', 16]]) {
    const x = c[id];
    ok(x.snapshots.every((s) => s.n === count && s.radii.every((r) => r === '19')), `${id}: particle count and radius stay fixed across all states`);
  }
  ok(c.reverse.snapshots[0].width > c.reverse.snapshots[2].width && c.default.snapshots[0].width === c.default.snapshots[2].width, 'volume changes only the optional container width');
  ok(c.reverse.marks.every((s) => !s), 'motion=false suppresses motion marks');
  for (const id of ['water', 'iron', 'carbon', 'limit', 'repeat', 'multi-digit', 'six']) {
    ok(c[id].balanced && c[id].idMap && c[id].sameNodes && c[id].finalPositions, `${id}: each product atom is a unique original atom of the same element; DOM nodes survive every seek`);
  }
  ok(c.repeat.totals[0].C === 2 && c.repeat.totals[0].H === 4 && c.repeat.totals[0].O === 2 && c['multi-digit'].totals[0].C === 12, 'formulas parse repeated symbols and multi-digit counts');
  ok(c.water.eq === '2H_2 + O_2 → 2H_2O' && c.iron.eq === 'Fe + S → FeS', 'equations use mtext subscripts and omit coefficient one');
  ok(!c.unbalanced.balanced && c.unbalanced.countsEmph.length === 2 && r.reports.some((x) => x.code === 'data' && /H 4 → 2/.test(x.msg) && /O 2 → 1/.test(x.msg)), 'unbalanced data reports each count, highlights mismatches and is never corrected');
  for (const id of ['invalid', 'charge', 'zero', 'coefficient', 'over', 'elements']) ok(c[id].fatal && c[id].notes.length > 0, `${id}: unsupported formula or exceeded limit reported without an invented model`);
  ok(c.water.label.includes('2H₂ + O₂ → 2H₂O') && c.water.label.includes('H 4 → 4') && c.default.label.includes('固体→液体→気体') && c.default.label.includes('16'), 'accessible names describe the final state and conserved counts');
  ok(c.custom.label === 'Author description' && c.carbon.label.includes('Atoms:'), 'author aria-label preserved; element language selects English');
  ok(Object.values(c).every((x) => x.role === 'img' && x.hidden === 'true' && x.history && x.finite && x.preview), 'all cases: accessible SVG, pure seeks, finite geometry and declared preview exemption');
  const unexpected = r.reports.filter((x) => x.code !== 'data');
  ok(unexpected.length === 0, 'no unexpected reports: ' + unexpected.map((x) => x.msg).join(' | '));
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-particles: ok');
process.exit(fails ? 1 : 0);

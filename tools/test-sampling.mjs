// Seeded sampling model and SVG; then Japanese/English demo in pinned Studio.
// node tools/test-sampling.mjs [work dir] | --node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio } from './studio.mjs';
let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
const close = (a, b) => Math.abs(a - b) < 1e-10;
const bag = {balls: {'赤': 3, '青': 2}, of: '赤', n: 4, replace: false, repeat: 40, seed: 1};
const die = {values: [1, 2, 3, 4, 5, 6], n: 2, replace: true, repeat: 40, seed: 3};
// Same minimal DOM surface as test-particles: run the real dependency factories and base guards.
class SvgNode {
  constructor(tag = 'm-sampling') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 440; this._text = ''; }
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
const context = vm.createContext({HTMLElement: SvgNode, console, getComputedStyle: (e) => ({fontFamily: e.getAttribute('lang') === 'en' ? 'Source Sans 3' : 'BIZ UDPGothic'}),
  document: {createElementNS: (_, tag) => new SvgNode(tag), createElement: (tag) => new SvgNode(tag)},
  egatariParts: {define: (meta, factory) => { registry[meta.name] = factory(Object.fromEntries(Object.keys(meta.requires || {}).map((n) => [n, registry[n]]))); }}
});
for (const name of ['shape', 'base', 'plot', 'sampling']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
const make = (data = bag, attrs = {}, dims = {}, lang = 'ja') => {
  const el = new registry.sampling();
  Object.assign(el, dims);
  el.setAttribute('lang', lang);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (data !== undefined) { const script = el.appendChild(new SvgNode('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data); }
  const reports = [], ctx = {lang, report: (code, msg) => reports.push({code, msg})};
  el.mount(ctx);
  return {el, reports, ctx};
};
const {el: c, reports} = make();
const m = c.model;
ok(c.steps === 4 && registry.sampling.steps === 4 && registry.sampling.preview === 'none', 'four steps and no answer preview');
ok(reports.length === 0, 'default bag fits without reports: ' + JSON.stringify(reports));
ok(JSON.stringify(m.samples) === JSON.stringify(make().el.model.samples), 'same seed gives identical samples across mounts');
ok(JSON.stringify(m.samples) !== JSON.stringify(make({...bag, seed: 9}).el.model.samples), 'different seed changes samples');
ok(m.samples.every((s) => new Set(s.ids).size === m.n), 'without replacement has no duplicate item identities');
const replace = make({...bag, replace: true, repeat: 200});
ok(replace.el.model.samples.some((s) => new Set(s.ids).size < m.n), 'with replacement repeats identities over many samples');
ok(m.samples.every((s) => close(s.value, s.ids.filter((id) => m.items[id].label === '赤').length / m.n)), 'sample proportions computed correctly');
ok(close(m.population, 3 / 5) && close(m.average, m.samples.reduce((a, s) => a + s.value, 0) / m.repeat), 'population proportion and average sample statistic correct');
const dice = make(die);
ok(dice.reports.length === 0 && dice.el.model.samples.every((s) => close(s.value, s.ids.reduce((a, id) => a + die.values[id], 0) / die.n)), 'card samples fit and means are correct');
ok(close(dice.el.model.population, 3.5), 'population mean correct');
const tickLabels = (el) => el.plotLayer.children.filter((e) => e.localName === 'text').slice(1, -1).map((e) => e.textContent);
ok(tickLabels(dice.el).join(',') === '1,2,3,4,5,6', 'small integer population uses integer ticks');
ok(tickLabels(c).join(',') === '0,0.25,0.5,0.75,1', 'proportion keeps quarter ticks');
for (const [values, expected] of [[[0.1, 0.9], '0.2,0.4,0.6,0.8'], [[-30, 70], '0,50'], [[1, 300], '100,200,300']]) {
  ok(tickLabels(make({values, n: 1}).el).join(',') === expected, 'mean uses 1–2–5 ticks for ' + values);
}
ok(!dice.el.populationLayer.children.some((e) => e.localName === 'text' && /1[・,]/.test(e.textContent)), 'values omit the visual composition row');
ok(c.populationLayer.children.some((e) => e.textContent === '赤 3・青 2'), 'Japanese ball composition is one string without separator spacing');
ok(dice.el.getAttribute('aria-label').includes('1・2・3・4・5・6'), 'values remain in the accessible population summary');
const clamped = make({...bag, n: 99});
ok(clamped.el.model.n === 5 && clamped.reports.some((r) => r.code === 'data' && /n must/.test(r.msg)), 'n above population reported and clamped without replacement');
const repeated = make({...bag, replace: true, n: 9}, {}, {clientWidth: 2600});
ok(repeated.el.model.n === 9 && repeated.el.model.samples.every((s) => s.ids.length === 9), 'with replacement allows n above population size');
const unknown = make({balls: {teal: 2, blue: 3}, of: 'teal', n: 2});
ok(unknown.reports.some((r) => r.code === 'data' && /unknown colour teal/.test(r.msg)) && unknown.el.svg.outerHTML.includes('--obj-gray') && unknown.el.svg.textContent.includes('teal'), 'unknown colour reported, drawn gray with name');
const prototypeColour = make({balls: {constructor: 2, blue: 3}, of: 'constructor', n: 2});
ok(prototypeColour.reports.some((r) => r.code === 'data' && /unknown colour constructor/.test(r.msg)) && prototypeColour.el.model.items[0].color.includes('--obj-gray'), 'prototype property names are unknown colours');
const english = make({balls: {red: 3, blue: 2}, of: 'red', n: 4}, {}, {}, 'en');
ok(english.reports.length === 0 && english.el.T.without === 'without replacement' && english.el.svg.textContent.includes('replacement') && english.el.svg.textContent.includes('Sample proportion'), 'ctx.lang selects English drawing: ' + JSON.stringify(english.reports));
ok(english.el.populationLayer.children.some((e) => e.textContent === 'red 3, blue 2'), 'English ball composition uses comma spacing');
const aria = c.getAttribute('aria-label');
ok(aria.includes('母集団: 赤 3・青 2') && aria.includes('戻さない（非復元抽出）') && aria.includes('n = 4、40 回') && aria.includes('母集団 0.60') && aria.includes('標本統計量の平均'), 'final accessible label includes population, rule, n, repeat, population value and average statistic');
ok(english.el.getAttribute('aria-label').includes('mean of sample statistics') && english.el.getAttribute('aria-label').includes('population 0.60'), 'English accessible summary');
ok(c.getAttribute('role') === 'img' && c.svg.getAttribute('aria-hidden') === 'true', 'image role and hidden SVG');
ok(make(bag, {'aria-label': 'Author description'}).el.getAttribute('aria-label') === 'Author description', 'author accessible label retained');
const attrs = make(bag, {dur: -1, stagger: -1, fast: 0, size: 23});
ok(attrs.reports.filter((r) => r.code === 'attr').length === 4 && attrs.el.props.dur === 1 && attrs.el.props.stagger === 0.25 && attrs.el.props.fast === 2.5 && attrs.el.fs === 26, 'invalid props reported with defaults');
const limits = make({...bag, n: 0, repeat: 201, digits: -1, seed: 0.5});
ok(limits.el.model.n === 1 && limits.el.model.repeat === 200 && limits.el.model.digits === 0 && limits.reports.filter((r) => r.code === 'data').length === 4, 'JSON limits reported and clamped, invalid seed defaults');
ok(make({...die, stat: 'proportion'}).reports.some((r) => r.code === 'data' && /incompatible/.test(r.msg)), 'incompatible statistic reported');
ok(make({...bag, of: 'purple'}).el.model.population === 0, 'absent target gives reported zero proportion');
ok(make({...bag, of: undefined}).el.model.of === '赤', 'omitted target defaults to first colour');
ok(make(bag, {}, {clientWidth: 300, clientHeight: 160}).reports.some((r) => r.code === 'size'), 'insufficient element size reported');
const stack = make({values: [1, 1], n: 1, repeat: 200});
ok(stack.el.dots.every((d) => +d.el.getAttribute('r') === 5) && stack.reports.some((r) => r.code === 'size' && /minimum 5px/.test(r.msg)), 'oversized dot stack stops at 5px then reports');
const shrink = make({values: [1, 1], n: 1, repeat: 22});
ok(+shrink.el.dots[0].el.getAttribute('r') < 8 && +shrink.el.dots[0].el.getAttribute('r') >= 5 && shrink.reports.length === 0, 'stack shrinks to fit without reports when possible');
const reduced = make({...bag, repeat: 1});
const decimal = make({values: [-2.5, 0.1, 7.3], n: 2, replace: false});
const extreme = make({values: [Number.MAX_VALUE, Number.MAX_VALUE], n: 3, replace: true}, {}, {clientWidth: 6000});
ok(Number.isFinite(extreme.el.model.population) && Number.isFinite(extreme.el.model.average) && extreme.el.model.samples.every((s) => Number.isFinite(s.value)) && !/NaN|Infinity/.test(extreme.el.svg.outerHTML), 'extreme finite values keep means and geometry finite');
const near = make({values: [0, 0.001, 1], n: 1, repeat: 20});
ok(near.el.dots.every((a, i, all) => all.slice(i + 1).every((b) => Math.abs(a.x - b.x) >= 2 * +a.el.getAttribute('r') + 2 || a.y !== b.y)), 'nearby values stack on separate levels without shifting x');
for (const [name, el] of [['bag', c], ['replace', replace.el], ['die', dice.el], ['one', reduced.el], ['decimal', decimal.el], ['equal', shrink.el], ['extreme', extreme.el]]) {
  let history = true, finite = true, complete = true, preview = true;
  const samples = JSON.stringify(el.model.samples);
  for (let k = 0; k <= 4; k++) for (const t of [0, el.duration(k) / 2, Infinity]) {
    el.render(k, t, {preview: false}); const html = el.innerHTML;
    el.render(4, Infinity); el.render(0, 0); el.render(k, t, {preview: false}); history &&= html === el.innerHTML;
    el.render(k, t, {preview: true}); preview &&= html === el.innerHTML;
    finite &&= !/NaN|undefined|Infinity/.test(el.svg.outerHTML);
    el.render(k, Infinity); const end = el.innerHTML; el.render(k, el.duration(k)); complete &&= end === el.innerHTML;
  }
  ok(history && finite && complete && preview && samples === JSON.stringify(el.model.samples), name + ': deterministic seeking, finite geometry, duration completion, preview exemption and immutable samples');
}
c.render(1, Infinity);
ok(c.populationLayer.getAttribute('opacity') === '1' && c.sampleLayer.getAttribute('opacity') === '0' && c.plotLayer.getAttribute('opacity') === '0', 'step 1: population and rule only');
c.render(2, 0.1);
ok(c.drawn[0].g.getAttribute('opacity') === '1' && c.drawn[1].g.getAttribute('opacity') === '0' && c.originals[m.samples[0].ids[0]].g.getAttribute('opacity') === '0', 'step 2: stagger draws, no-replacement leaves a gap');
replace.el.render(2, 0.1);
ok(replace.el.originals.every((o) => o.g.getAttribute('opacity') === '1'), 'with replacement leaves all originals');
c.render(3, Infinity);
ok(c.statLayer.getAttribute('opacity') === '1' && c.dots.filter((d) => d.el.getAttribute('opacity') === '1').length === 1 && c.originals.every((o) => o.g.getAttribute('opacity') === '1'), 'step 3: first statistic and dot; population restored after recording');
c.render(4, c.props.fast / 2);
const midCount = c.dots.filter((d) => d.el.getAttribute('opacity') === '1').length;
ok(midCount > 1 && midCount < m.repeat && c.statValue.textContent === c.statText(m.samples[midCount - 1]), 'step 4: dots accumulate in order and row shows latest recorded sample');
c.render(4, Infinity);
ok(c.dots.every((d) => d.el.getAttribute('opacity') === '1') && c.finalLayer.getAttribute('opacity') === '1' && c.originals.every((o) => o.g.getAttribute('opacity') === '1') && c.statValue.textContent === c.statText(m.samples.at(-1)), 'final: every dot, marker, caption, latest sample and full bag');
const walk = (e) => [e, ...e.children.flatMap(walk)];
ok(walk(c.svg).filter((e) => e.localName === 'text').every((e) => +e.getAttribute('font-size') >= 24), 'all text at least 24px');
for (const lang of ['ja', 'en']) for (const [i, data] of [bag, {...bag, replace: true}, die].entries()) {
  const localized = lang === 'en' && data.balls ? {...data, balls: {red: 3, blue: 2}, of: 'red'} : data;
  for (const size of [24, 26, 32]) {
    const {el, reports} = make(localized, {size}, {clientWidth: size === 32 ? 1500 : 1184, clientHeight: size === 32 ? 560 : 440}, lang);
    const lines = el.plotLayer.children.filter((e) => e.localName === 'text').slice(-2).concat(el.finalLayer.children.filter((e) => e.localName === 'text').slice(0, 1));
    ok(lines.slice(1).every((e, j) => +e.getAttribute('y') - +lines[j].getAttribute('y') >= 1.45 * size + 3.99), `${lang} example ${i}, ${size}px: footer baselines clear full font boxes`);
    const dots = el.dots.map((d) => ({...d, r: +d.el.getAttribute('r')}));
    ok(reports.length === 0 && dots.every((d) => d.r >= 5 && d.y - d.r >= el.plotTop) && dots.every((a, j) => dots.slice(j + 1).every((b) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 1)), `${lang} example ${i}, ${size}px: dots fit, radius ${dots[0].r}px, no collisions: ${JSON.stringify(reports)}`);
  }
}
for (const data of [null, {}, {n: 2}, {values: [1, '2'], n: 2}, {values: [1], n: 1}, {...die, extra: true}, {...bag, replace: 'true'}, {...bag, stat: 'median'}]) {
  const r = make(data);
  ok(r.el.steps === 0 && !r.el.svg && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(data));
}
for (const data of [{balls: {red: -1, blue: 3}, n: 1}, {balls: {red: 31}, n: 1}, {balls: {}, n: 1}, {...bag, values: [1, 2]}]) {
  const r = make(data); r.el.render(4, Infinity);
  ok(!r.el.model && r.reports.some((r) => r.code === 'data') && !r.reports.some((r) => r.code === 'error'), 'invalid population reports without sampling: ' + JSON.stringify(data));
}
if (process.argv.includes('--node')) {
  console.log(fails ? `\nFAIL: ${fails}` : '\ntest-sampling (Node model and SVG): ok');
  process.exit(fails ? 1 : 0);
}
console.log('Node checks complete; checking the demo in a browser.');
const S = await studio();
const work = path.resolve(process.argv[2] || path.join(ROOT, 'components/sampling/out/test'));
fs.mkdirSync(work, {recursive: true});
const demo = fs.readFileSync(path.join(ROOT, 'components/sampling/demo.html'), 'utf8');
const decks = ['ja', 'en'].map((lang) => {
  const src = path.join(work, `deck-${lang}.html`), out = path.join(work, `deck-${lang}.out.html`);
  const html = lang === 'en' ? demo.replace('<html lang="ja"', '<html lang="en"').replaceAll('赤', 'red').replaceAll('青', 'blue') : demo;
  fs.writeFileSync(src, html);
  S.build(src, out);
  return {lang, out};
});
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const {lang, out} of decks) {
    await page.goto(S.browser.fileUrl(out));
    await page.waitForFunction(() => window.DECK && DECK.ready);
    await page.evaluate(() => document.fonts.ready);
    const results = await page.evaluate(() => [...document.querySelectorAll('m-sampling')].map((c, i) => {
      let history = true;
      for (let k = 0; k <= 4; k++) {
        DECK.seek(i, k, Infinity); const html = c.innerHTML;
        DECK.seek(i, 4, Infinity); DECK.seek(i, 0, 0); DECK.seek(i, k, Infinity); history &&= html === c.innerHTML;
      }
      DECK.seek(i, 4, Infinity);
      const texts = [...c.querySelectorAll('text')].map((e) => ({s: e.textContent, box: e.getBoundingClientRect(), size: +getComputedStyle(e).fontSize.replace('px', '')}));
      const overlaps = texts.flatMap((a, j) => texts.slice(j + 1).filter((b) => Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 2 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 4).map((b) => a.s + ' / ' + b.s));
      const box = c.getBoundingClientRect();
      const dots = c.dots.map((d) => ({r: +d.el.getAttribute('r'), box: d.el.getBoundingClientRect()}));
      const dotsFit = dots.every((d) => d.r >= 5 && d.box.left >= box.left && d.box.right <= box.right && d.box.top >= box.top && d.box.bottom <= box.bottom && texts.every((t) => {
        const x = (d.box.left + d.box.right) / 2, y = (d.box.top + d.box.bottom) / 2;
        return Math.hypot(x - Math.max(t.box.left, Math.min(x, t.box.right)), y - Math.max(t.box.top, Math.min(y, t.box.bottom))) >= d.box.width / 2;
      }));
      return {history, overlaps, fits: texts.every((t) => t.size >= 24 && t.box.left >= box.left && t.box.right <= box.right && t.box.top >= box.top && t.box.bottom <= box.bottom),
        dotsFit, radius: Math.min(...dots.map((d) => d.r)),
        role: c.getAttribute('role'), label: c.getAttribute('aria-label'), finite: !/NaN|undefined/.test(c.svg.outerHTML)};
    }));
    for (const [i, r] of results.entries()) ok(r.history && r.fits && r.dotsFit && !r.overlaps.length && r.finite && r.role === 'img' && (r.label.includes('標本統計量の平均') || r.label.includes('mean of sample statistics')), `browser ${lang} example ${i}: deterministic, accessible, ≥24px, contained, no overlaps, dot radius ${r.radius}px (${r.overlaps.join('; ')})`);
    for (let i = 0; i < results.length; i++) {
      await page.evaluate((i) => DECK.seek(i, 4, Infinity), i);
      await page.screenshot({path: path.join(work, `final-${lang}-${i}.png`)});
    }
    ok(results.every((r) => r.label.includes(lang === 'en' ? 'mean of sample statistics' : '標本統計量の平均')), lang + ': summary uses deck language');
    ok(errors.length === 0, 'browser has no page errors: ' + errors.join('; '));
    const records = await page.evaluate(() => DECK.componentErrors || []);
    ok(records.length === 0, 'demo has no component reports: ' + JSON.stringify(records));
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-sampling: ok');
process.exit(fails ? 1 : 0);

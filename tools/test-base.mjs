// Parity of the base library part (components/base, components 2.0) with what parts use today: each helper gives the same
// output as the pinned Studio's DECK version (tools/studio.json, kit/deck.js) on a set of inputs, in a browser, so that
// alpha.2 can move parts from DECK to base with byte-identical rendering.
//   lerp, prog, clamp   ≡ DECK.lerp, DECK.prog, DECK.clamp01 (Object.is, on a grid including ±0, ±Infinity and NaN);
//                       prog(x, 0, 1) ≡ DECK.ease(x), which base does not export (m-flow and m-kpi use it)
//   el, mtext           ≡ DECK.el, DECK.mtext (outerHTML and namespace; attributes, var() colours, style merging, markup)
//   MotionElement       ≡ DECK.MotionElement for two classes with the same declarations: steps, from, props, data,
//                         mount / render / duration / cues, the warnings, and props / data caching
//   variant(el)         ≡ VARIANT.of(el) of tools/variant.js (names from static variants, or passed), with the same warnings
//   previewOpacity(el)  ≡ the read the parts write today (parseFloat of --preview-opacity, else 0.45) for set, unset and bad values
//   the data check      MotionElement's check before mount (spec §6.1 Data shapes; with the shape part) ≡ what DECK did for
//                       the same classes and data (setupSlide → compProblem / compFail): the same problem record (kind, path,
//                       why, expected, got, key, near, shape, example, …), the same placeholder text, the same fallback steps,
//                       the report code (attr / data) and message ("[<name>] data (<kind>): " + DECK's console summary); and with data that fits, the part's own steps / mount /
//                       render / duration / cues run unchanged
//   node tools/test-base.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, pinLabel } from './studio.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The data-check cases: a class declaration (static shape, props) and the element's attributes and children
const CASES = [
  ['ok', 'schema', '', '<script type="application/json">{"groups": [{"label": "a", "value": 1}, {"label": "b", "value": 2}]}</script>'],
  ['type', 'schema', '', '<script type="application/json">{"groups": {"label": "a"}}</script>'],
  ['array-not-object', 'schema', '', '<script type="application/json">[{"label": "a", "value": 1}]</script>'],
  ['required', 'schema', '', '<script type="application/json">{"groups": [{"value": 1}]}</script>'],
  ['unknown-near', 'schema', '', '<script type="application/json">{"groups": [{"label": "a", "valu": 1}]}</script>'],
  ['enum', 'schema', '', '<script type="application/json">{"groups": [{"label": "a", "value": 1, "tone": "red"}]}</script>'],
  ['minItems', 'schema', '', '<script type="application/json">{"groups": []}</script>'],
  ['maxItems', 'schema', 'steps="3"', '<script type="application/json">{"groups": [{"label": "a", "value": 1}, {"label": "b", "value": 1}, {"label": "c", "value": 1}, {"label": "d", "value": 1}, {"label": "e", "value": 1}]}</script>'],
  ['unit-ok', 'schema', '', '<script type="application/json">{"groups": [{"label": "a", "value": 1}], "unit": "円"}</script>'],
  ['number-string', 'schema', 'steps="2"', '<script type="application/json">{"groups": [{"label": "a", "value": "1.5"}]}</script>'],
  ['missing', 'schema', '', ''],
  ['json', 'schema', '', '<script type="application/json">{"groups": [</script>'],
  ['attrJson', 'schema', 'range="[0,"', '<script type="application/json">{"groups": [{"label": "a", "value": 1}]}</script>'],
  ['attr', 'schema', 'range="[0, &quot;x&quot;]"', '<script type="application/json">{"groups": [{"label": "a", "value": 1}]}</script>'],
  ['text-ok', 'text', '', '春はあけぼの'],
  ['notText', 'text', '', '<script type="application/json">["a"]</script>'],
  ['empty', 'text', '', '  '],
  ['links-ok', 'links', '', '<a href="#s-a">A</a>'],
  ['notLinks', 'links', '', '<script type="application/json">[]</script>'],
  ['noLinks', 'links', '', '<span>no link</span>'],
];
const CLASSES = `
var SCHEMA = {schema: {type: "object", required: ["groups"], additionalProperties: false,
  properties: {groups: {type: "array", minItems: 1, maxItems: 4, items: {type: "object", required: ["label"], additionalProperties: false,
    properties: {label: {type: "string"}, value: {type: "number"}, values: {type: "array", items: {type: "number"}}, tone: {enum: ["emph", "term"]}}}},
    unit: {type: "string"}, max: {type: "number"}}}, example: {groups: [{label: "1 年目", value: 3}]}};
var SHAPES = {schema: SCHEMA, text: {text: true, example: "本文"}, links: {links: true, example: "<a href=\\"#s\\">目次</a>"}};
var KINDS = ${JSON.stringify(CASES.map((c) => c[1]))};
function make(Base, kind){
  return class extends Base {
    static shape = SHAPES[kind];
    static props = {range: {type: "json", default: [0, 1], shape: {type: "array", minItems: 2, maxItems: 2, items: {type: "number"}}}, unit: {type: "string", default: ""}};
    get steps(){ return this.data && this.data.groups ? this.data.groups.length : 1; }
    mount(ctx){ this._mounted = (this._mounted || 0) + 1; this.setAttribute("data-mounted", "1"); }
    render(k, t, ctx){ this._rendered = (this._rendered || 0) + 1; }
    duration(k){ return 1.25; }
    cues(k){ return [0.5]; }
  };
}
var BASE = EGATARI_PARTS_SHIM.get("base", "1.0.0");
KINDS.forEach(function(kind, i){ customElements.define("x-d" + i, make(DECK.MotionElement, kind)); customElements.define("x-b" + i, make(BASE.MotionElement, kind)); });
`;
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-base-')));
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>base</title></head>
<body><div id="stage">
<section class="slide noconcl" id="s-a"><h2>base</h2><div class="body"><div id="host"></div></div></section>
<section class="slide noconcl" id="s-g"><h2>data</h2><div class="body">${CASES.map((c, i) => `<x-d${i} id="d${i}" aria-label="${c[0]}" ${c[2]}>${c[3]}</x-d${i}>`).join('\n')}</div></section>
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
S.build(path.join(work, 'deck.html'), out);
// the shim and base after the deck's own scripts (deck.js), before the load event; tools/variant.js as the reference
const html = fs.readFileSync(out, 'utf8'), end = html.lastIndexOf('</body>');
const inject = [read('tools/registry-shim.js'), read('components/shape/index.js'), read('components/base/index.js'), read('tools/variant.js') + '\nwindow.VARIANT = VARIANT;', CLASSES].map((s) => `<script>\n${s}\n</script>\n`).join('');
fs.writeFileSync(out, html.slice(0, end) + inject + html.slice(end));

const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, bypassCSP: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const pageWarns = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') pageWarns.push(m.text()); });
  await page.goto(S.browser.fileUrl(out) + '?mode=video');
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const B = EGATARI_PARTS_SHIM.get('base', '1.0.0'), res = {};
    res.keys = Object.keys(B);
    const same = (a, b) => Object.is(a, b);
    const host = document.getElementById('host');
    // ------------------------------------------------ numbers
    const nums = [-Infinity, -2, -1, -0.5, -0, 0, 1e-9, 0.1, 0.25, 0.35, 0.5, 0.7, 0.999, 1, 1.2, 2, 10, Infinity, NaN];
    let n = 0, bad = [];
    for (const x of nums) { n++; if (!same(B.clamp(x), DECK.clamp01(x))) bad.push(['clamp', x]); }
    for (const a of [-3, 0, 1.5, 100]) for (const b of [-1, 0, 2.25, 1e6]) for (const e of nums) { n++; if (!same(B.lerp(a, b, e), DECK.lerp(a, b, e))) bad.push(['lerp', a, b, e]); }
    for (const t of nums) for (const s of [-1, 0, 0.2, 0.35, 1]) for (const d of [-1, 0, 0.3, 0.45, 0.7, 1.4, Infinity]) { n++; if (!same(B.prog(t, s, d), DECK.prog(t, s, d))) bad.push(['prog', t, s, d]); }
    // DECK.ease (m-flow, m-kpi) is not in base: prog(x, 0, 1) is the same function
    for (const x of nums) { n++; if (!same(B.prog(x, 0, 1), DECK.ease(x))) bad.push(['ease', x]); }
    res.nums = { n, bad: bad.slice(0, 5).map(String), nbad: bad.length };
    // ------------------------------------------------ el
    const ELS = [
      ['g', {}], ['rect', { x: -1, y: 2.5, width: 0, height: 0.25 }], ['line', { x1: 0, y1: 0, x2: 10, y2: 10, stroke: 'var(--fg)', 'stroke-width': 1.5 }],
      ['path', { d: 'M0,0L1,1', fill: 'var(--term)', stroke: '#000' }], ['circle', { r: 3, fill: 'none', stroke: 'var(--emph)', style: 'opacity:.5' }],
      ['text', { x: 3, y: 4, color: 'var(--muted)', 'text-anchor': 'middle' }], ['stop', { offset: '0%', 'stop-color': 'var(--series-1)', style: '' }],
      ['rect', { fill: 'var(--bg)', stroke: 'var(--line)', color: 'var(--fg)', 'stop-color': 'var(--term)', style: 'x:1' }], ['tspan', { class: 'mi', 'font-style': 'italic' }],
      ['foreignObject', { width: 10, height: 10 }], ['svg', { viewBox: '0 0 10 10', class: 'plotsvg' }], ['rect', { opacity: 0, 'data-x': true, title: '<&>"' }],
    ];
    const elOut = (lib) => ELS.map(([tag, attrs]) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'g'); const e = lib.el(tag, attrs, p); const e2 = lib.el(tag, attrs); return [e.namespaceURI, e.parentNode === p, p.innerHTML, e2.outerHTML, e2.parentNode === null]; });
    res.el = { n: ELS.length, same: JSON.stringify(elOut(B)) === JSON.stringify(elOut(DECK)) };
    // ------------------------------------------------ mtext
    const STR = ['x', '', '*x*', '*x*_i', 'a^2+b^2', '*f*(*x*) = *x*^2', 'x_', 'x^', '**', '***', '_1_2', '^-1', 'σ^2 / *n*', '平均 *μ*', 'β_0 + β_1*x*', '*a*_*b*', '100%', '−3.5'];
    const ATTRS = [undefined, {}, { 'text-anchor': 'middle' }, { 'font-size': 30, fill: 'var(--term)' }, { fill: 'var(--muted)', style: 'font-weight:700' }];
    const mOut = (lib) => { const out = []; for (const s of STR) for (const a of ATTRS) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const t = lib.mtext(p, 12.5, 30, s, a && Object.assign({}, a)); out.push([t.parentNode === p, p.innerHTML]); } return out; };
    res.mtext = { n: STR.length * ATTRS.length, same: JSON.stringify(mOut(B)) === JSON.stringify(mOut(DECK)) };
    // ------------------------------------------------ MotionElement
    const decl = (C) => class extends C {
      static props = { n: { type: 'number', default: 3 }, on: { type: 'bool', default: true }, j: { type: 'json', default: [1] }, s: { type: 'string', default: 'a' }, u: { default: null } };
      static steps = 4;
    };
    const plain = (C) => class extends C {};
    customElements.define('x-deck-me', decl(DECK.MotionElement)); customElements.define('x-base-me', decl(B.MotionElement));
    customElements.define('x-deck-plain', plain(DECK.MotionElement)); customElements.define('x-base-plain', plain(B.MotionElement));
    const CASES = [
      { attrs: {} }, { attrs: { steps: '2' } }, { attrs: { steps: '0' } }, { attrs: { steps: '-1' } }, { attrs: { steps: '1.5' } }, { attrs: { steps: 'x' } }, { attrs: { steps: ' ' } }, { attrs: { steps: ' 3 ' } },
      { attrs: { 'data-from': '0' } }, { attrs: { 'data-from': '1' } }, { attrs: { 'data-from': '3' } }, { attrs: { 'data-from': 'y' } },
      { attrs: { n: '5', on: 'false', j: '{"a": [1, 2]}', s: 'b' } }, { attrs: { n: 'abc', on: '', j: 'null', s: '' } }, { attrs: { on: 'true', n: '' } },
      { kids: ['<script type="application/json">{"v": [1, 2, 3]}</script>'] }, { kids: ['<script type=" Application/JSON ">[1]</script>'] },
      { kids: ['<script type="application/json">1</script>', '<script type="application/json">2</script>'] }, { kids: ['<script type="text/plain">1</script>', '<p>no</p>'] },
      { kids: ['<div><script type="application/json">{"deep": 1}</script></div>'] }, { kids: ['<script type="application/json" id="x">"s"</script>'] },
    ];
    const mk = (tag, c) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(c.attrs || {})) e.setAttribute(k, v); e.innerHTML = (c.kids || []).join(''); host.appendChild(e); return e; };
    const warnLog = [];
    const W = console.warn;
    const probe = (kind) => CASES.map((c) => {
      const tag = `x-${kind}-me`, e = mk(tag, c), w0 = warnLog.length;
      const strip = (s) => s.split(`x-${kind}-`).join('x-');
      let props, data, err = null;
      try { props = JSON.stringify(e.props); } catch (x) { props = 'throws ' + x.name; }
      try { data = JSON.stringify(e.data); } catch (x) { data = 'throws ' + x.name; }
      const cached = (() => { try { return e.props === e.props && (e.data === e.data); } catch (x) { return 'throws'; } })();
      const out = [e.steps, e.from, props, data, cached, e.mount({}), e.render(1, 0, {}), e.duration(1), e.cues(1), err];
      const pl = mk(`x-${kind}-plain`, c);
      // DECK reads every component's data when it sets up a slide (compProblem), as base's data check does: read it here first
      try { pl.data; } catch (x) { /* compared through props/data above */ }
      out.push(pl.steps, pl.from, JSON.stringify(pl.props));
      out.push(warnLog.slice(w0).map(strip));
      e.remove(); pl.remove();
      return out;
    });
    console.warn = (m) => warnLog.push(String(m));
    let deckMe, baseMe;
    try { deckMe = probe('deck'); baseMe = probe('base'); } finally { console.warn = W; }
    res.me = { n: CASES.length, same: JSON.stringify(deckMe) === JSON.stringify(baseMe), warned: warnLog.length, diff: CASES.map((c, i) => JSON.stringify(deckMe[i]) === JSON.stringify(baseMe[i]) ? null : [JSON.stringify(c), JSON.stringify(deckMe[i]), JSON.stringify(baseMe[i])]).filter(Boolean).slice(0, 2),
      proto: ['mount', 'render', 'duration', 'cues'].every((m) => typeof B.MotionElement.prototype[m] === 'function') && B.MotionElement.prototype instanceof HTMLElement && !(B.MotionElement.prototype instanceof DECK.MotionElement) };
    // ------------------------------------------------ variant
    const VN = [['fade', 'sweep', 'draw'], ['one'], []];
    const vres = [];
    VN.forEach((names, i) => {
      const tag = 'x-var-' + i;
      customElements.define(tag, class extends B.MotionElement { static variants = names.length ? names : undefined; });
      for (const v of [null, ...names, 'spin', '', 'FADE']) {
        const e = document.createElement(tag);
        if (v !== null) e.setAttribute('variant', v);
        e.setAttribute('seed', '7');
        const w = []; console.warn = (m) => w.push(String(m));
        let a, b, c;
        try { a = VARIANT.of(e); b = B.variant(e); c = B.variant(e, names); } finally { console.warn = W; }
        vres.push([tag, v, a, b, c, w.length % 3 === 0 && w.slice(0, w.length / 3).join() === w.slice(w.length / 3, 2 * w.length / 3).join() && w.slice(0, w.length / 3).join() === w.slice(2 * w.length / 3).join(), w.length]);
      }
    });
    res.variant = { n: vres.length, bad: vres.filter((x) => !(x[2] === x[3] && x[3] === x[4] && x[5])), warned: vres.filter((x) => x[6]).length };
    // a part whose class is not (yet) the registered element: variant reads the element's own class, not customElements
    const Unreg = class extends B.MotionElement { static variants = ['b', 'a']; };
    customElements.define('x-var-own', Unreg);
    const own = new Unreg(); own.setAttribute('variant', 'a');
    res.variantOwn = B.variant(own) === 'a' && B.variant(own, ['a', 'z']) === 'a' && B.variant(own, ['z']) === 'z';
    // ------------------------------------------------ previewOpacity
    const ref = (e) => { let PV = parseFloat(getComputedStyle(e).getPropertyValue('--preview-opacity')); if (!(PV >= 0 && PV <= 1)) PV = 0.45; return PV; };
    const VALS = [null, '0.3', '1', '0', '.6', ' 0.6 ', '1.5', '-0.1', 'abc', '30%', 'calc(0.2)', '0.25px', 'initial'];
    const pres = VALS.map((v) => { const e = document.createElement('div'); if (v !== null) e.style.setProperty('--preview-opacity', v); host.appendChild(e); const a = B.previewOpacity(e), b = ref(e); e.remove(); return [v, a, b, Object.is(a, b)]; });
    const outer = document.createElement('div'); outer.style.setProperty('--preview-opacity', '0.2'); const inner = document.createElement('span'); outer.appendChild(inner); host.appendChild(outer);
    res.preview = { n: pres.length, bad: pres.filter((x) => !x[3]), unsetIs: pres[0][1], inherited: B.previewOpacity(inner) };
    outer.remove();
    return res;
  });
  // the data check: DECK checked the x-d<i> elements of slide s-g when it started; base checks x-b<i> made from the same source
  const D = await page.evaluate((cases) => {
    const pick = (r) => { const o = {}; for (const k of Object.keys(r).sort()) if (!['slide', 'key', 'id', 'index', 'tag', 'label', 'phase', 'dataLike'].includes(k)) o[k] = r[k]; return JSON.parse(JSON.stringify(o)); };
    const host = document.getElementById('host');
    return cases.map((c, i) => {
      const d = document.getElementById('d' + i), rec = DECK.componentErrors.find((x) => x.tag === 'x-d' + i) || null;
      const tmp = document.createElement('div');
      tmp.innerHTML = `<x-b${i} aria-label="${c[0]}" ${c[2]}>${c[3]}</x-b${i}>`;
      const b = tmp.firstElementChild; host.appendChild(b);
      const reports = [];
      const ctx = { lang: 'ja', mode: 'video', preview: false, slide: 's-a', instant: true, reset: false, entered: true, slides: [], go() {}, visited() { return false; }, report: (code, message) => reports.push([code, message]) };
      const steps = b.steps;
      b.mount(ctx); b.mount(ctx);
      const ren = b.render(1, Infinity, ctx), dur = b.duration(1), cues = b.cues(1);
      const out = { name: c[0], deck: { problem: rec && pick(rec), steps: d.steps, text: (d.querySelector('.m-error') || {}).textContent || null, mounted: d.hasAttribute('data-mounted') },
        base: { problem: b._shapeProblem && pick(b._shapeProblem), steps, text: (b.querySelector('.m-error') || {}).textContent || null, mounted: b.hasAttribute('data-mounted'),
          reports, rendered: b._rendered || 0, mountedTimes: b._mounted || 0, dur, cues: JSON.stringify(cues) } };
      b.remove();
      return out;
    });
  }, CASES);
  console.log(`(reference: ${pinLabel()} kit/deck.js DECK.*, tools/variant.js VARIANT.of)`);
  ok(errors.length === 0, 'no exception or console error' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.keys.join() === 'MotionElement,el,lerp,prog,clamp,mtext,variant,previewOpacity', `base returns exactly ${r.keys.join(', ')}`);
  ok(r.nums.nbad === 0, `clamp ≡ DECK.clamp01, lerp ≡ DECK.lerp, prog ≡ DECK.prog, prog(x, 0, 1) ≡ DECK.ease(x) (${r.nums.n} inputs${r.nums.nbad ? '; differ: ' + r.nums.bad.join(' | ') : ''})`);
  ok(r.el.same, `el ≡ DECK.el (${r.el.n} tag/attribute sets, with and without a parent)`);
  ok(r.mtext.same, `mtext ≡ DECK.mtext (${r.mtext.n} strings × attributes)`);
  ok(r.me.same && r.me.warned > 0, `MotionElement ≡ DECK.MotionElement: steps, from, props, data, defaults, caching and warnings (${r.me.n} cases, ${r.me.warned} warnings compared)` + (r.me.diff.length ? '\n     ' + r.me.diff.map((d) => d.join('\n     ')).join('\n     ') : ''));
  ok(r.me.proto, 'base.MotionElement extends HTMLElement (not DECK.MotionElement) and has mount, render, duration, cues');
  ok(r.variant.bad.length === 0 && r.variant.warned > 0, `variant(el) ≡ variant(el, names) ≡ VARIANT.of(el), with the same warnings (${r.variant.n} cases)` + (r.variant.bad.length ? ': ' + JSON.stringify(r.variant.bad[0]) : ''));
  ok(r.variantOwn, 'variant reads the element\'s own class (static variants) or the names passed, not customElements by tag');
  ok(r.preview.bad.length === 0 && r.preview.inherited === 0.2, `previewOpacity ≡ the parts' own read (${r.preview.n} values; unset → ${r.preview.unsetIs}; inherited from an ancestor)` + (r.preview.bad.length ? ': ' + JSON.stringify(r.preview.bad) : ''));
  const norm = (t, i, k) => t && t.split(`x-${k}${i}`).join('x-?');
  let dataOk = 0;
  D.forEach((x, i) => {
    const dp = JSON.stringify(x.deck.problem), bp = JSON.stringify(x.base.problem);
    const bad = x.deck.problem !== null;
    const warn = bad ? pageWarns.find((w) => w.startsWith(`[deck] x-d${i} (s-g): `)) : null;
    // the report: a spec §8.4 code (attr for attr / attrJson, data for any other kind) and "[<name>] data (<kind>): " before
    // DECK's console summary
    const code = bad ? (['attr', 'attrJson'].includes(x.deck.problem.kind) ? 'attr' : 'data') : null;
    const same = dp === bp && x.deck.steps === x.base.steps && norm(x.deck.text, i, 'd') === norm(x.base.text, i, 'b') && x.deck.mounted === x.base.mounted
      && (bad ? x.base.reports.length === 1 && x.base.reports[0][0] === code && warn === `[deck] x-d${i} (s-g): ${x.base.reports[0][1].replace(`[x-b${i}] data (${x.deck.problem.kind}): `, '')}`
          && x.base.reports[0][1].startsWith(`[x-b${i}] data (${x.deck.problem.kind}): `) && x.base.rendered === 0 && x.base.dur === 0 && x.base.cues === 'null'
        : x.base.reports.length === 0 && x.base.mountedTimes === 2 && x.base.rendered === 1 && x.base.dur === 1.25 && x.base.cues === '[0.5]');
    if (same) dataOk++;
    else console.log(`     ${x.name}: DECK ${JSON.stringify(x.deck)}\n     ${' '.repeat(x.name.length)}  base ${JSON.stringify(x.base)}\n     warn ${warn}`);
  });
  const nBad = D.filter((x) => x.deck.problem).length;
  // every kind of data problem gives a vocabulary code and the part's prefix
  const VOCAB = ['data', 'attr', 'range', 'size', 'layout', 'theme', 'error'];
  const byKind = {};
  D.forEach((x, i) => { if (x.deck.problem) for (const [c, m] of x.base.reports) (byKind[x.deck.problem.kind] ||= []).push(VOCAB.includes(c) && m.startsWith(`[x-b${i}] data (${x.deck.problem.kind}): `) ? c : `BAD ${c} ${m}`); });
  const KINDS9 = ['shape', 'missing', 'json', 'attr', 'attrJson', 'notText', 'empty', 'notLinks', 'noLinks'];
  ok(KINDS9.every((k) => byKind[k] && byKind[k].length && byKind[k].every((c) => c === (k === 'attr' || k === 'attrJson' ? 'attr' : 'data'))) && Object.keys(byKind).every((k) => KINDS9.includes(k)),
    `a data problem of each kind reports a spec §8.4 code and "[<name>] data (<kind>): " (${KINDS9.map((k) => k + ' → ' + [...new Set(byKind[k] || ['none'])].join('/')).join(', ')})`);
  ok(dataOk === D.length && nBad >= 14, `the data check ≡ DECK's: ${D.length} cases (${nBad} that do not fit: the same record, placeholder text, fallback steps, report kind and message = DECK's console summary; nothing drawn; ${D.length - nBad} that fit: the part's own steps, mount, render, duration and cues)`);
} finally { await browser.close(); }

console.log(fails ? `\n${fails} failure(s)` : '\ntest-base: ok');
process.exit(fails ? 1 : 0);

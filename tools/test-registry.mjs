// The test-only parts registry (tools/registry-shim.js; Egatari spec §6.1) and the 2.0 library parts' meta:
//   1. without a browser (node:vm, stub HTMLElement / customElements): parts resolve in dependency order with their
//      dependencies' values; a forward reference is refused (and defining the part later does not revive it); two versions
//      of base coexist under name@version and each dependant gets the one it names; versions match exactly (no ranges, no
//      nearest version); a factory throw records a failure for that part and its dependants, and a failed element part
//      gets the text-equivalent fallback; an element is defined once (the first version keeps the name); egatariParts has
//      only define; base and expr load through the registry, and expr is tools/expr.js
//   2. in a browser, on a deck built by the pinned Studio (tools/studio.json): a test element part extending
//      base.MotionElement is driven by DECK's seek loop through the shim's bridge, with the 2.0 ctx (lang, slides, slide key,
//      preview, entered, go, report) and no ctx.deck; layout(ctx) is called and followed by a render; a failing element
//      part shows its text equivalent and nothing else on the slide is affected
//   node tools/test-registry.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, studio, libraryNames } from './studio.mjs';
import { partMeta, dependencyOrder } from './parts.mjs';
import { lintMeta } from './lint.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SHIM = read('tools/registry-shim.js');

// ---------------------------------------------------------------- 1. resolver (no browser)
function sandbox() {
  const defined = new Map(), warns = [];
  class HTMLElement {}
  const G = {
    HTMLElement, console: { warn: (m) => warns.push(String(m)) }, Object, JSON, String, Array, Function, Error, SyntaxError, Math, Number,
    customElements: { get: (n) => defined.get(n), define: (n, c) => { if (defined.has(n)) throw new Error('already defined: ' + n); defined.set(n, c); } },
    document: { documentElement: { lang: 'ja' } },
  };
  G.globalThis = G;
  const ctx = vm.createContext(G);
  vm.runInContext(SHIM, ctx, { filename: 'tools/registry-shim.js' });
  const run = (src, filename = 'test.js') => vm.runInContext(src, ctx, { filename });
  return { ctx, run, defined, warns, S: ctx.EGATARI_PARTS_SHIM, P: ctx.egatariParts };
}
{
  const { run, S, P } = sandbox();
  ok(Object.keys(P).join() === 'define' && Object.isFrozen(P), 'egatariParts exposes define and nothing else (frozen)');
  run(`
    var calls = [];
    egatariParts.define({name: "a", version: "1.0.0"}, function(d){ calls.push(["a", Object.keys(d).join()]); return {v: "a1"}; });
    egatariParts.define({name: "b", version: "1.0.0", requires: {a: "1.0.0"}}, function(d){ calls.push(["b", d.a.v]); return {v: "b1+" + d.a.v}; });
    egatariParts.define({name: "c", version: "2.1.0", requires: {a: "1.0.0", b: "1.0.0"}}, function(d){ calls.push(["c", d.a.v + "," + d.b.v]); return {v: "c"}; });
  `);
  ok(JSON.stringify(run('calls')) === JSON.stringify([['a', ''], ['b', 'a1'], ['c', 'a1,b1+a1']]), 'dependency order: each factory is called once, with exactly its requires as {name: value}');
  ok(S.order().join() === 'a@1.0.0,b@1.0.0,c@2.1.0' && S.get('c', '2.1.0').v === 'c', 'values are kept under name@version');
}
{
  const { run, S } = sandbox();
  run(`
    var ran = [];
    egatariParts.define({name: "early", version: "1.0.0", requires: {late: "1.0.0"}}, function(){ ran.push("early"); return {}; });
    egatariParts.define({name: "late", version: "1.0.0"}, function(){ ran.push("late"); return {}; });
    egatariParts.define({name: "after", version: "1.0.0", requires: {early: "1.0.0"}}, function(){ ran.push("after"); return {}; });
  `);
  const f = S.failures();
  ok(S.status('early@1.0.0') === 'failed' && f[0].code === 'missing' && /not defined before/.test(f[0].message), 'a forward reference is refused (missing; its factory never runs)');
  ok(S.status('late@1.0.0') === 'ok' && S.status('early@1.0.0') === 'failed', 'defining the required part later does not revive the refused one');
  ok(S.status('after@1.0.0') === 'failed' && f.some((x) => x.key === 'after@1.0.0' && x.code === 'dependency'), 'a part requiring a failed part fails too (dependency)');
  ok(run('ran.join()') === 'late', 'no factory of a failed part ran');
}
{
  const { run, S } = sandbox();
  run(`
    egatariParts.define({name: "base", version: "2.0.0"}, function(){ return {id: "base 2.0.0"}; });
    egatariParts.define({name: "base", version: "2.1.0"}, function(){ return {id: "base 2.1.0"}; });
    egatariParts.define({name: "p", version: "1.0.0", requires: {base: "2.0.0"}}, function(d){ return {got: d.base.id}; });
    egatariParts.define({name: "q", version: "1.0.0", requires: {base: "2.1.0"}}, function(d){ return {got: d.base.id}; });
  `);
  ok(S.get('base', '2.0.0').id === 'base 2.0.0' && S.get('base', '2.1.0').id === 'base 2.1.0', 'two versions of base coexist under base@2.0.0 and base@2.1.0');
  ok(S.get('p', '1.0.0').got === 'base 2.0.0' && S.get('q', '1.0.0').got === 'base 2.1.0', 'each dependant gets the version it names');
  run(`
    egatariParts.define({name: "r", version: "1.0.0", requires: {base: "2.0.1"}}, function(){ return {}; });
    egatariParts.define({name: "s", version: "1.0.0", requires: {base: "^2.0.0"}}, function(){ return {}; });
    egatariParts.define({name: "t", version: "1.0.0", requires: {base: "2.0"}}, function(){ return {}; });
    egatariParts.define({name: "u", version: "2.0"}, function(){ return {}; });
  `);
  const f = Object.fromEntries(S.failures().map((x) => [x.key, x]));
  ok(f['r@1.0.0'] && f['r@1.0.0'].code === 'missing' && /base@2\.0\.0, base@2\.1\.0/.test(f['r@1.0.0'].message), 'exact versions: base 2.0.1 is not matched by 2.0.0 or 2.1.0 (missing, the defined versions named)');
  ok(f['s@1.0.0'] && f['s@1.0.0'].code === 'range' && f['t@1.0.0'] && f['t@1.0.0'].code === 'range', 'a range (^2.0.0) or a partial version (2.0) in requires is refused');
  ok(f['u@2.0'] && f['u@2.0'].code === 'meta', 'a part whose own version is not exact is refused');
  run(`egatariParts.define({name: "base", version: "2.0.0"}, function(){ return {id: "again"}; });`);
  ok(S.get('base', '2.0.0').id === 'base 2.0.0' && S.failures().some((x) => x.code === 'duplicate'), 'defining the same name@version twice keeps the first');
}
{
  const { run, S, defined, warns } = sandbox();
  run(`
    egatariParts.define({name: "base", version: "2.0.0"}, function(){ return {B: HTMLElement}; });
    egatariParts.define({name: "boom", version: "1.0.0", requires: {base: "2.0.0"}}, function(){ throw new TypeError("no data"); });
    egatariParts.define({name: "m-boom", version: "1.0.0", requires: {base: "2.0.0"}, element: "m-boom"}, function(){ throw new Error("cannot draw"); });
    egatariParts.define({name: "m-dep", version: "1.0.0", requires: {boom: "1.0.0"}, element: "m-dep"}, function(d){ return class extends d.base.B {}; });
    egatariParts.define({name: "m-ok", version: "1.0.0", requires: {base: "2.0.0"}, element: "m-ok"}, function(d){ return class extends d.base.B { get who(){ return "1.0.0"; } }; });
    egatariParts.define({name: "m-ok", version: "1.1.0", requires: {base: "2.0.0"}, element: "m-ok"}, function(d){ return class extends d.base.B { get who(){ return "1.1.0"; } }; });
    egatariParts.define({name: "m-notclass", version: "1.0.0", element: "m-notclass"}, function(){ return {}; });
  `);
  const f = Object.fromEntries(S.failures().map((x) => [x.key, x]));
  ok(f['boom@1.0.0'] && f['boom@1.0.0'].code === 'factory' && /TypeError: no data/.test(f['boom@1.0.0'].message), 'a factory throw is caught and recorded (factory, with the error)');
  ok(f['m-boom@1.0.0'] && f['m-boom@1.0.0'].code === 'factory' && defined.has('m-boom') && defined.get('m-boom').prototype instanceof run('HTMLElement'), 'a failed element part gets the fallback element (its text equivalent)');
  ok(f['m-dep@1.0.0'] && f['m-dep@1.0.0'].code === 'dependency' && defined.has('m-dep'), 'a dependant of a failed part fails and falls back too');
  ok(warns.some((w) => /m-boom@1\.0\.0: factory: cannot draw/.test(w)), 'the failure is reported (console.warn)');
  ok(S.status('base@2.0.0') === 'ok' && S.status('m-ok@1.0.0') === 'ok', 'nothing else is affected');
  ok(new (defined.get('m-ok'))().who === '1.0.0' && S.status('m-ok@1.1.0') === 'ok' && new (S.get('m-ok', '1.1.0'))().who === '1.1.0', 'an element is defined once: the first version keeps the name, the second is kept under its name@version');
  ok(f['m-notclass@1.0.0'] && f['m-notclass@1.0.0'].code === 'element', 'an element part whose factory returns no element class fails');
}
// freezing (spec §6.1: the registry freezes each value shallowly; parts must not modify another part's exports)
{
  const { run, S } = sandbox();
  run(`
    egatariParts.define({name: "lib", version: "1.0.0"}, function(){ return {n: 1, inner: {m: 1}, f: function(){ return 1; }}; });
    egatariParts.define({name: "writer", version: "1.0.0", requires: {lib: "1.0.0"}}, function(d){ "use strict"; d.lib.n = 2; return {}; });
    egatariParts.define({name: "adder", version: "1.0.0", requires: {lib: "1.0.0"}}, function(d){ "use strict"; d.lib.extra = 1; return {}; });
    egatariParts.define({name: "sloppy", version: "1.0.0", requires: {lib: "1.0.0"}}, function(d){ d.lib.f = null; delete d.lib.n; return {}; });
    egatariParts.define({name: "deep", version: "1.0.0", requires: {lib: "1.0.0"}}, function(d){ "use strict"; d.lib.inner.m = 5; return {}; });
    egatariParts.define({name: "m-cls", version: "1.0.0", element: "m-cls"}, function(){ return class extends HTMLElement { static variants = ["a"]; }; });
  `);
  const lib = S.get('lib', '1.0.0'), f = Object.fromEntries(S.failures().map((x) => [x.key, x]));
  ok(Object.isFrozen(lib) && lib.n === 1 && !('extra' in lib) && typeof lib.f === 'function', 'a part\'s value is frozen: another part cannot change, add or delete its members');
  ok(f['writer@1.0.0'] && f['writer@1.0.0'].code === 'factory' && /TypeError/.test(f['writer@1.0.0'].message) && f['adder@1.0.0'] && f['adder@1.0.0'].code === 'factory', 'a strict-mode factory that writes to a dependency fails (TypeError), and is recorded');
  ok(S.status('sloppy@1.0.0') === 'ok' && lib.n === 1, 'a sloppy-mode write is ignored');
  ok(S.status('deep@1.0.0') === 'ok' && lib.inner.m === 5 && !Object.isFrozen(lib.inner), 'the freeze is shallow (as specified)');
  ok(Object.isFrozen(S.get('m-cls', '1.0.0')), 'an element part\'s class is frozen too (its statics stay as declared)');
}
// lint of 2.0 metas: the registry name is the folder, element the tag
{
  const js = (n, e) => `egatariParts.define({name: "${n}", version: "2.0.0", requires: {base: "1.0.0"}, element: "${e}"}, f);`;
  const errs = (n, e) => lintMeta('bars', js(n, e), partMeta(js(n, e)));
  ok(errs('bars', 'm-bars').length === 0 && errs('m-bars', 'm-bars').some((x) => /folder name/.test(x)) && errs('bars', 'm-bar').some((x) => /must be "m-bars"/.test(x)), 'lint: name is the folder (bars) and element the tag (m-bars)');
  ok(lintMeta('bars', 'egatariParts.define({name: "bars", version: "2.0.0", requires: {base: "^1.0.0"}, element: "m-bars"}, f); DECK.el;', { name: 'bars', version: '2.0.0', requires: { base: '^1.0.0' }, element: 'm-bars' }).length === 2, 'lint: a range in requires and DECK in the code are refused');
}
// the library parts of this repository load through the registry
{
  const { run, S } = sandbox();
  const metas = Object.fromEntries(libraryNames().map((n) => [n, partMeta(read(`components/${n}/index.js`))]));
  const libs = dependencyOrder(metas);
  ok(['shape', 'base', 'plot', 'expr'].every((n) => libs.includes(n)) && libs.indexOf('shape') < libs.indexOf('base') && libs.indexOf('base') < libs.indexOf('plot'), `library parts in dependency order: ${libs.join(', ')} (base → shape, plot → base)`);
  for (const n of libs) {
    const js = read(`components/${n}/index.js`), m = partMeta(js);
    run(js, `components/${n}/index.js`);
    ok(S.status(`${n}@${m.version}`) === 'ok', `${n}@${m.version} defines without failure in dependency order`);
  }
  const base = S.get('base', '1.0.0');
  ok(base && Object.keys(base).join() === 'MotionElement,el,lerp,prog,clamp,mtext,variant,previewOpacity', 'base returns exactly {MotionElement, el, lerp, prog, clamp, mtext, variant, previewOpacity}');
  ok(['shape', 'base', 'plot', 'expr'].every((n) => Object.isFrozen(S.get(n, '1.0.0'))), 'every library part\'s value is frozen by the registry');
  ok(Object.keys(S.get('shape', '1.0.0')).join() === 'check,describe,gotOf,typeOf,dataLike,near,brief' && Object.keys(S.get('plot', '1.0.0')).join() === 'Plot', 'shape returns DECK.shape\'s members, plot returns {Plot}');
  const ex = S.get('expr', '1.0.0');
  const ref = vm.createContext({ Math, Object, Array, SyntaxError, Error, Number, String });
  vm.runInContext(read('tools/expr.js') + '\nthis.EXPR = EXPR;', ref);
  const same = ['u*u + c', 'Math.exp(-c*u)', 'x >= 0 ? 0.9*x : -0.1*x', '2 ** 3 ** c'].every((src) => {
    const vars = ['u', 'c', 'x'], a = ex.compile(src, { vars }), b = ref.EXPR.compile(src, { vars });
    return [[0, 1, 2], [1.5, -2, 0.5], [-3, 0.25, -1]].every((v) => Object.is(a(...v), b(...v)));
  });
  let refused = false;
  try { ex.compile('globalThis.x', { vars: ['u'] }); } catch (e) { refused = e.name === 'SyntaxError'; }
  ok(ex && Object.keys(ex).join() === Object.keys(ref.EXPR).join() && same && refused, 'expr returns tools/expr.js\'s EXPR (same members, same values, refuses globalThis.x)');
}

// ---------------------------------------------------------------- 2. bridge to the pinned Studio (browser)
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-registry-')));
fs.mkdirSync(work, { recursive: true });
const PROBE = `egatariParts.define({name: "c2probe", version: "0.0.1", requires: {base: "1.0.0"}, element: "m-c2probe"}, function(d){
  var base = d.base;
  return class extends base.MotionElement {
    static props = {label: {type: "string", default: "既定"}};
    get steps(){ return 2; }
    mount(ctx){ this._log = [["mount", Object.keys(ctx).sort().join()]]; this._svg = base.el("svg", {viewBox: "0 0 100 40"}, this); }
    layout(ctx){ this._log.push(["layout", ctx.slide]); }
    render(k, t, ctx){
      this._log.push(["render", k, t === Infinity ? "inf" : +t.toFixed(3), ctx.slide, ctx.mode, ctx.preview, ctx.entered, ctx.lang, "deck" in ctx, ctx.slides.length]);
      this._svg.textContent = "";
      base.mtext(this._svg, 4, 30, this.props.label + " k=" + k, {});
      if (k === 2 && !this._reported){ this._reported = true; ctx.report("probe", "step 2 reached"); }
      this._ctx = ctx;
    }
  };
});`;
const FAILING = `egatariParts.define({name: "c2fail", version: "0.0.1", requires: {base: "1.0.0"}, element: "m-c2fail"}, function(){ throw new Error("probe failure"); });`;
fs.writeFileSync(path.join(work, 'deck.html'), `<!DOCTYPE html>
<html lang="en" data-theme="default">
<head><meta charset="utf-8"><title>registry</title></head>
<body><div id="stage">
<section class="slide noconcl" id="s-first"><h2>First</h2><div class="body"><p>a</p></div></section>
<section class="slide noconcl" id="s-probe"><h2>Probe</h2><div class="body"><m-c2probe id="probe" aria-label="probe" label="hello" style="display:block;height:120px"></m-c2probe>
<m-c2fail id="failing" aria-label="the text equivalent of the failing part" style="display:block;height:80px"><script type="application/json">{"x": 1}</script></m-c2fail><p data-step="1" id="other">other</p></div></section>
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
try { S.build(path.join(work, 'deck.html'), out); ok(true, 'build the deck with the pinned Studio'); } catch (e) { ok(false, 'build: ' + String(e.stderr || e.message)); }
const html = fs.readFileSync(out, 'utf8'), end = html.lastIndexOf('</body>');
const inject = [SHIM, read('components/shape/index.js'), read('components/base/index.js'), PROBE, FAILING].map((s) => `<script>\n${s}\n</script>\n`).join('');
fs.writeFileSync(out, html.slice(0, end) + inject + html.slice(end));
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, bypassCSP: true });
  const errors = [], warns = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
  await page.goto(S.browser.fileUrl(out) + '?mode=video');
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const p = document.getElementById('probe');
    const i = DECK.slides.findIndex((s) => s.id === 's-probe');
    DECK.seek(0, 0, Infinity);
    p._log = p._log.slice(0, 1);
    DECK.seek(i, 1, 0.2);
    DECK.seek(i, 1, Infinity);
    DECK.seek(i, 2, Infinity);
    const log1 = JSON.parse(JSON.stringify(p._log));
    p.style.height = '140px';
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await new Promise((res) => setTimeout(res, 50));
    const log2 = JSON.parse(JSON.stringify(p._log.slice(log1.length)));
    const text = p.querySelector('text') && p.querySelector('text').textContent, other = getComputedStyle(document.getElementById('other')).opacity;
    const vis = [p._ctx.visited('s-first'), p._ctx.visited('s-probe'), p._ctx.visited('nowhere')];
    p._ctx.go('s-probe');
    vis.push(p._ctx.visited('s-probe'));
    const went = p._ctx.go('s-first');
    const pos = DECK.state();
    const f = document.getElementById('failing');
    return { i, max: DECK.slides[i]._max, inComps: DECK.slides[i]._comps.includes(p), failInComps: DECK.slides[i]._comps.includes(f), log1, log2, went, pos, vis,
      text, slides: p._ctx.slides, frozen: Object.isFrozen(p._ctx.slides),
      fail: { box: !!f.querySelector('.m-error'), text: (f.querySelector('.m-error') || {}).textContent, script: !!f.querySelector('script') },
      other,
      reports: EGATARI_PARTS_SHIM.reports(), errs: DECK.componentErrors.map((x) => ({ tag: x.tag, kind: x.kind, code: x.code })), failures: EGATARI_PARTS_SHIM.failures(), bridged: EGATARI_PARTS_SHIM.bridged() };
  });
  ok(errors.length === 0, 'no exception or console error' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.bridged && r.inComps && !r.failInComps, 'the 2.0 part is one of DECK\'s components on its slide (bridged); the failed one is not');
  ok(r.max === 2, `the slide's steps come from the part (max ${r.max})`);
  ok(r.log1[0][0] === 'mount' && r.log1[0][1] === 'entered,go,instant,lang,live,mode,preview,report,reset,slide,slides,visited', `mount gets the 2.0 ctx and no deck (${r.log1[0][1]})`);
  const renders = r.log1.filter((x) => x[0] === 'render');
  ok(renders.length >= 3 && renders.every((x) => x[3] === 's-probe' && x[4] === 'video' && x[5] === false && x[7] === 'en' && x[8] === false && x[9] === 2), 'render gets slide = the key, mode, preview, lang from <html lang>, slides, and no ctx.deck');
  ok(renders[0][6] === true && renders.slice(1).every((x) => x[6] === false), 'entered is true on the first render after entering the slide, false after');
  ok(renders.some((x) => x[1] === 1 && x[2] === 0.2) && renders.some((x) => x[1] === 2 && x[2] === 'inf'), 'DECK\'s seek loop drives render(k, t)');
  ok(r.text === 'hello k=2', 'the part draws with base.el / base.mtext and reads props');
  ok(r.reports.length === 1 && r.reports[0].code === 'probe' && r.errs.some((x) => x.tag === 'm-c2probe' && x.kind === 'report' && x.code === 'probe'), 'ctx.report reaches DECK.componentErrors');
  ok(r.log2.length >= 2 && r.log2[0][0] === 'layout' && r.log2[0][1] === 's-probe' && r.log2[1][0] === 'render' && r.log2[1][1] === 2, 'a size change calls layout(ctx) and then render at the last (k, t)');
  ok(r.went === true && r.pos.slide === 1, 'ctx.go(slideKey) moves the deck');
  ok(JSON.stringify(r.vis) === '[true,false,false,true]', `ctx.visited(slideKey) is DECK.visited as a boolean: shown slide true, not yet shown false, unknown false, true after going there (${JSON.stringify(r.vis)})`);
  ok(r.frozen && r.slides.map((s) => s.key + ':' + s.title).join() === 's-first:First,s-probe:Probe', 'ctx.slides is [{key, title}], read-only');
  ok(r.fail.box && r.fail.text === 'the text equivalent of the failing part' && r.fail.script, 'a failing element part shows its text equivalent (aria-label) and keeps its data');
  ok(r.failures.some((x) => x.key === 'c2fail@0.0.1' && x.code === 'factory'), 'its failure is recorded');
  ok(r.other === '1', 'the rest of the slide still steps (the data-step item is shown at step 2)');
  ok(warns.some((w) => /c2fail@0\.0\.1: factory: probe failure/.test(w)), 'and warned on the console');
} finally { await browser.close(); }

console.log(fails ? `\n${fails} failure(s)` : '\ntest-registry: ok');
process.exit(fails ? 1 : 0);

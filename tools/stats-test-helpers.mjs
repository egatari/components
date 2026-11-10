// Shared real-factory DOM and browser checks for the three small statistics parts.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {ROOT, studio} from './studio.mjs';
export const close = (a, b, tolerance = 1e-10) => Math.abs(a - b) <= tolerance;
export const walk = (e) => [e, ...e.children.flatMap(walk)];
class SvgNode {
  constructor(tag = 'test-part') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 440; this._text = ''; }
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
export function harness(name, example) {
  let fails = 0;
  const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
  const registry = {};
  const context = vm.createContext({HTMLElement: SvgNode, console,
    getComputedStyle: (e) => ({fontFamily: e.getAttribute('lang') === 'en' ? 'Source Sans 3' : 'BIZ UDPGothic'}),
    document: {createElementNS: (_, tag) => new SvgNode(tag), createElement: (tag) => new SvgNode(tag)},
    egatariParts: {define: (meta, factory) => { registry[meta.name] = factory(Object.fromEntries(Object.keys(meta.requires || {}).map((n) => [n, registry[n]]))); }}
  });
  for (const part of ['shape', 'base', 'plot', name]) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', part, 'index.js'), 'utf8'), context);
  const make = (data = example, attrs = {}, dims = {}, lang = 'ja') => {
    const el = new registry[name](); el.localName = 'm-' + name; el.tagName = el.localName.toUpperCase();
    Object.assign(el, dims); el.setAttribute('lang', lang);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    const script = el.appendChild(new SvgNode('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data);
    const reports = [], ctx = {lang, report: (code, msg) => reports.push({code, msg})}; el.mount(ctx);
    return {el, reports, ctx};
  };
  const common = (el, label, sample = example) => {
    ok(el.getAttribute('role') === 'img' && el.svg.getAttribute('aria-hidden') === 'true', label + ': image role and hidden SVG');
    ok(make(sample, {'aria-label': 'Author description'}).el.getAttribute('aria-label') === 'Author description', label + ': author label preserved');
    ok(walk(el.svg).filter((e) => e.localName === 'text').every((e) => +e.getAttribute('font-size') >= 24), label + ': all text ≥24px');
    ok(make(sample, {}, {clientWidth: 280, clientHeight: 120}).reports.some((r) => r.code === 'size'), label + ': small box reports size');
    let deterministic = true, finite = true, complete = true, preview = true;
    const model = JSON.stringify(el.model);
    for (let k = 0; k <= el.steps; k++) for (const t of [0, el.duration(k) / 2, Infinity]) {
      el.render(k, t, {preview: false}); const html = el.innerHTML;
      el.render(el.steps, Infinity); el.render(0, 0); el.render(k, t, {preview: false}); deterministic &&= el.innerHTML === html;
      el.render(k, t, {preview: true}); preview &&= el.innerHTML === html;
      finite &&= !/NaN|undefined|Infinity/.test(el.svg.outerHTML);
      el.render(k, Infinity); const end = el.innerHTML; el.render(k, el.duration(k)); complete &&= end === el.innerHTML;
    }
    ok(deterministic && finite && complete && preview && JSON.stringify(el.model) === model, label + ': deterministic seeking, finite geometry, durations complete, immutable model and no answer preview');
  };
  const finish = async () => {
    if (!process.argv.includes('--node')) await browserCheck(name, ok);
    console.log(fails ? `\nFAIL: ${fails}` : `\ntest-${name}${process.argv.includes('--node') ? ' (Node model and SVG)' : ''}: ok`);
    process.exitCode = fails ? 1 : 0;
  };
  return {ok, make, common, finish, Part: registry[name]};
}
async function browserCheck(name, ok) {
  const S = await studio();
  const work = path.resolve(process.argv[2] || path.join(ROOT, 'components', name, 'out', 'test'));
  fs.mkdirSync(work, {recursive: true});
  const demo = fs.readFileSync(path.join(ROOT, 'components', name, 'demo.html'), 'utf8');
  const decks = ['ja', 'en'].map((lang) => {
    const src = path.join(work, `deck-${lang}.html`), out = path.join(work, `deck-${lang}.out.html`);
    fs.writeFileSync(src, demo.replace('<html lang="ja"', `<html lang="${lang}"`)); S.build(src, out);
    return {lang, out};
  });
  const browser = await S.browser.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 720}}), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const {lang, out} of decks) {
      await page.goto(S.browser.fileUrl(out)); await page.waitForFunction(() => window.DECK && DECK.ready);
      await page.evaluate(() => document.fonts.ready);
      const results = await page.evaluate((name) => [...document.querySelectorAll('m-' + name)].map((c, i) => {
        const problems = [], box = c.getBoundingClientRect(); let history = true;
        const visible = (e) => { for (let p = e; p && p !== c; p = p.parentElement) if (+getComputedStyle(p).opacity < 0.01) return false; return true; };
        for (let k = 0; k <= c.steps; k++) for (const t of [0, c.duration(k) / 2, Infinity]) {
          DECK.seek(i, k, t); const html = c.innerHTML;
          DECK.seek(i, c.steps, Infinity); DECK.seek(i, 0, 0); DECK.seek(i, k, t); history &&= html === c.innerHTML;
          const texts = [...c.querySelectorAll('text')].filter(visible).map((e) => ({s: e.textContent, box: e.getBoundingClientRect(), size: parseFloat(getComputedStyle(e).fontSize)}));
          for (const [j, a] of texts.entries()) {
            if (a.size < 24 || a.box.left < box.left - 1 || a.box.right > box.right + 1 || a.box.top < box.top - 1 || a.box.bottom > box.bottom + 1) problems.push(`k=${k},t=${t}: outside/small ${a.s}`);
            for (const b of texts.slice(j + 1)) if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 2 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 4) problems.push(`k=${k},t=${t}: ${a.s} / ${b.s}`);
          }
        }
        DECK.seek(i, c.steps, Infinity);
        return {history, problems, role: c.getAttribute('role'), aria: c.getAttribute('aria-label'), finite: !/NaN|undefined|Infinity/.test(c.svg.outerHTML)};
      }), name);
      for (const [i, r] of results.entries()) {
        ok(r.history && r.finite && r.role === 'img' && !!r.aria && !r.problems.length, `browser ${lang} ${i}: deterministic, accessible, contained ≥24px, no overlaps: ${r.problems.join('; ')}`);
        await page.evaluate(({i, name}) => DECK.seek(i, document.querySelectorAll('m-' + name)[i].steps, Infinity), {i, name});
        await page.screenshot({path: path.join(work, `final-${lang}-${i}.png`)});
      }
      ok(errors.length === 0, `browser ${lang}: no page errors: ${errors.join('; ')}`);
      ok((await page.evaluate(() => DECK.componentErrors || [])).length === 0, `browser ${lang}: no component reports`);
    }
  } finally { await browser.close(); }
}

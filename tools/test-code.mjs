// node tools/test-code.mjs [work dir] | --node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {ROOT, studio} from './studio.mjs';
import {walk} from './stats-test-helpers.mjs';
let fails = 0;
const ok = (value, msg) => { console.log((value ? 'ok   ' : 'FAIL ') + msg); if (!value) fails++; };
class Node {
  constructor(tag = 'm-code') { this.localName = tag; this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.style = {}; this.clientWidth = 1184; this.clientHeight = 440; this._text = ''; }
  get childNodes() { return this.children; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(n) { this.children.push(n); n.parentElement = this; return n; }
  removeChild(n) { this.children.splice(this.children.indexOf(n), 1); }
  get textContent() { return this._text + this.children.map((n) => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get outerHTML() { return `<${this.localName} ${JSON.stringify(this.attrs)}>${this._text}${this.innerHTML}</${this.localName}>`; }
  get innerHTML() { return this.children.map((n) => n.outerHTML).join(''); }
}
const registry = {};
const context = vm.createContext({HTMLElement: Node, console,
  getComputedStyle: (e) => ({fontFamily: e.getAttribute('lang') === 'en' ? 'Source Sans 3' : 'BIZ UDPGothic', getPropertyValue: () => e.getAttribute('preview-opacity') ?? ''}),
  document: {createElementNS: (_, tag) => new Node(tag), createElement: (tag) => new Node(tag)},
  egatariParts: {define: (meta, factory) => { registry[meta.name] = factory(Object.fromEntries(Object.keys(meta.requires || {}).map((n) => [n, registry[n]]))); }}
});
for (const name of ['shape', 'base', 'code']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), context);
const Part = registry.code, example = JSON.parse(JSON.stringify(Part.shape.example));
const make = (data = example, attrs = {}, dims = {}, lang = 'ja') => {
  const el = new Part(); Object.assign(el, dims); el.setAttribute('lang', lang);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const script = el.appendChild(new Node('script')); script.setAttribute('type', 'application/json'); script.textContent = JSON.stringify(data);
  const reports = [], ctx = {lang, report: (code, msg) => reports.push({code, msg})}; el.mount(ctx);
  return {el, reports};
};
const texts = (e) => walk(e).filter((n) => n.localName === 'text');
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 5 && Part.preview === undefined, 'example fits; 3 notes + code + output; default preview');
ok(c.getAttribute('role') === 'img' && c.svg.getAttribute('aria-hidden') === 'true', 'image role, hidden SVG');
ok(c.getAttribute('aria-label') === 'Python のコード 3 行と出力; pandas を読み込む; CSV を表として読む; 店ごとの平均', 'concise final Japanese label and ordered notes');
ok(make(example, {'aria-label': 'Author label'}).el.getAttribute('aria-label') === 'Author label', 'author label retained');
const pre = c.children.find((n) => n.localName === 'pre');
ok(pre.className === 'sr-only' && pre.textContent.includes(example.code) && pre.textContent.endsWith(example.output) && pre.getAttribute('style').includes('clip-path:inset(50%)') && pre.getAttribute('tabindex') === '0' && pre.getAttribute('role') === 'document', 'full code/output in reachable hidden pre');
c.render(1, Infinity);
ok(c.codeLayer.getAttribute('opacity') === '1' && c.notes.every((n) => n.g.getAttribute('opacity') === '0') && c.outputLayer.getAttribute('opacity') === '0', 'first step shows whole program alone');
c.render(2, Infinity);
ok(c.bands[0].getAttribute('opacity') === '1' && c.numbers[0].getAttribute('style').includes('--emph') && c.notes[0].g.getAttribute('opacity') === '1', 'second step highlights line 1 and shows its note');
c.render(3, Infinity);
ok(c.bands[0].getAttribute('opacity') === '0' && c.bands[1].getAttribute('opacity') === '1' && c.notes[0].labels[0].getAttribute('style').includes('--muted'), 'earlier band gone; earlier note stays muted');
c.render(c.steps, Infinity);
ok(c.outputLayer.getAttribute('opacity') === '1' && c.bands.every((b) => b.getAttribute('opacity') === '0') && c.notes.every((n) => n.g.getAttribute('opacity') === '1' && n.labels.every((e) => e.getAttribute('style').includes('--fg'))), 'final/print state: all notes and output, no bands');
const noOutput = {code: 'a = 1\nb = 2\nprint(a + b)', steps: [{lines: [1, 2], note: 'Set both values'}, {lines: [3], note: 'Add and print'}]};
const range = make(noOutput).el;
ok(range.steps === 3 && make({code: 'pass', steps: []}).el.steps === 1 && make({code: 'pass', steps: [], output: ''}).el.steps === 2, 'step counts without output, no notes and empty supplied output');
range.render(2, Infinity);
ok(+range.bands[0].getAttribute('height') === 2 * range.geometry.row && range.numbers.slice(0, 2).every((n) => n.getAttribute('style').includes('--emph')), 'two endpoints form an inclusive band');
for (const lines of [[0], [-1], [4], [2, 1], [1, 4]]) {
  const bad = make({...noOutput, steps: [{lines, note: 'Bad range'}]});
  bad.el.render(2, Infinity);
  ok(bad.reports.some((r) => r.code === 'range') && bad.el.bands[0].getAttribute('opacity') === '0', 'invalid range reports and cannot highlight: ' + lines);
}
for (const lang of ['ja', 'en']) for (const size of [0, 24, 32]) {
  const r = make(example, {size}, {clientWidth: size === 32 ? 1600 : 1184, clientHeight: size === 32 ? 600 : 440}, lang);
  ok(!r.reports.length && texts(r.el.svg).every((n) => +n.getAttribute('font-size') >= 24), lang + ' size ' + size + ': fits, all text ≥24px');
  ok(r.el.notes.every((n, i, a) => !i || n.top >= a[i - 1].top + a[i - 1].height + 8), lang + ': note boxes never overlap');
}
const repeated = make({code: 'x = 1', steps: [1, 2, 3].map(() => ({lines: [1], note: 'One note on this same line'}))}, {}, {}, 'en');
ok(!repeated.reports.length && repeated.el.notes.every((n, i, a) => !i || n.top > a[i - 1].top + a[i - 1].height), 'notes targeting the same line stack and extend connectors');
for (const outputPos of ['below', 'right', 'auto']) {
  const r = make(example, {outputPos}, {clientHeight: 600});
  ok(!r.reports.length && r.el.geometry.right === (outputPos !== 'below'), 'requested output position ' + outputPos);
}
const below = make({code: 'x = 1\n'.repeat(8) + 'print(x)', steps: [], output: '1'}, {}, {clientHeight: 800});
ok(!below.el.geometry.right && !below.reports.length, 'auto uses below for longer program');
const overflow = make({code: Array.from({length: 20}, () => 'x'.repeat(100)).join('\n'), steps: [], output: Array.from({length: 10}, () => 'output').join('\n')}, {outputPos: 'right'}, {clientHeight: 900});
ok(overflow.reports.filter((r) => r.code === 'layout').length === 2 && overflow.el.numbers.length === 16 && texts(overflow.el.codeLayer).some((n) => n.textContent.includes('…')) && texts(overflow.el.outputLayer).some((n) => n.textContent.includes('…')), 'long code/output reported and cut to line and width limits with ellipses');
ok(overflow.el.children.find((n) => n.localName === 'pre').textContent.includes('x'.repeat(100)), 'truncation preserves full accessible program');
range.render(range.steps, range.props.dur / 2);
ok(+range.bands[1].getAttribute('opacity') > 0 && range.notes[0].labels[0].getAttribute('style').includes('--muted'), 'without output, the last note still highlights its lines during its step');
range.render(range.steps, Infinity);
ok(range.bands.every((b) => b.getAttribute('opacity') === '0') && range.notes.every((n) => n.labels.every((e) => e.getAttribute('style').includes('--fg'))), 'without output, completed final state has all notes and no bands');
const clippedHeight = make({code: 'x = 1\n'.repeat(15) + 'print(x)', steps: []});
ok(clippedHeight.reports.some((r) => r.code === 'layout') && clippedHeight.el.numbers.length < 16 && texts(clippedHeight.el.codeLayer).some((n) => n.textContent.includes('…')), 'height truncation reports and marks the last visible line');
const tiny = make(example, {}, {clientWidth: 80, clientHeight: 40}); tiny.el.render(5, Infinity);
ok(tiny.reports.some((r) => r.code === 'size') && tiny.el.svg.children.length === 0, 'unusable box reports size without drawing overlapping panels');
const noRoom = make({code: 'pass', steps: Array.from({length: 10}, () => ({lines: [1], note: 'Note'}))});
ok(noRoom.reports.some((r) => r.code === 'layout') && noRoom.el.notes.some((n) => !n.fits && !n.labels.length), 'notes out of room report and omit overflowing boxes');
ok(make(example, {}, {clientWidth: 280, clientHeight: 120}).reports.some((r) => r.code === 'size'), 'small box reports size');
const invalid = make(example, {dur: -1, size: 23, outputPos: 'left'});
ok(invalid.reports.filter((r) => r.code === 'attr').length === 3 && invalid.el.props.dur === .6 && invalid.el.fs === 24, 'bad props report/default');
for (const lang of ['python', 'r', 'shell', 'js', 'javascript', 'PYTHON']) {
  const token = /js|javascript/.test(lang) ? '//' : '#';
  const r = make({lang, code: `x = "${token} literal" ${token} comment\nprint(x)`, steps: []}).el;
  const ts = texts(r.codeLayer);
  ok(ts.some((n) => n.textContent === token + ' comment' && n.getAttribute('style').includes('--muted')) && ts.some((n) => n.textContent.includes(token + ' literal') && n.getAttribute('style').includes('--fg')), 'comments outside quoted strings only: ' + lang);
}
const triple = make({lang: 'python', code: 's = """text\n# string\n""" # comment', steps: []}).el;
ok(texts(triple.codeLayer).some((n) => n.textContent === '# string' && n.getAttribute('style').includes('--fg')) && texts(triple.codeLayer).some((n) => n.textContent === '# comment' && n.getAttribute('style').includes('--muted')), 'Python multiline strings do not become comments');
const en = make(example, {}, {}, 'en').el;
ok(en.getAttribute('aria-label').startsWith('Python: 3 lines of code and output') && en.outputLayer.textContent.includes('Output') && en.outputLayer.textContent.includes('▶ Run'), 'English label, output and run label');
for (const data of [null, {}, {code: 1, steps: []}, {code: 'pass', steps: [{lines: ['1'], note: 'Bad'}]}, {code: 'pass', steps: [{lines: [1, 2, 3], note: 'Bad'}]}, {...example, extra: 1}]) {
  const r = make(data); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'invalid shape rejected: ' + JSON.stringify(data));
}
let deterministic = true, finite = true, duration = true;
for (let k = 0; k <= c.steps; k++) for (const t of [0, .3, Infinity]) for (const ctx of [{}, {preview: true}, {mode: 'lecture'}]) {
  c.render(k, t, ctx); const html = c.innerHTML;
  c.render(c.steps, Infinity); c.render(0, 0); c.render(k, t, ctx); deterministic &&= html === c.innerHTML;
  finite &&= !/NaN|Infinity|undefined/.test(c.svg.outerHTML);
  c.render(k, Infinity, ctx); const final = c.innerHTML; c.render(k, c.duration(k), ctx); duration &&= final === c.innerHTML;
}
ok(deterministic && finite && duration, 'deterministic seeking and finite geometry; durations finish all motion');
for (const opacity of ['0', '0.23', '1', '']) {
  const p = make(example, {'preview-opacity': opacity}).el; p.render(0, 0, {preview: true});
  const expected = opacity === '' ? '.45' : opacity;
  ok(+p.codeLayer.getAttribute('opacity') === +expected && p.notes.every((n) => +n.g.getAttribute('opacity') === +expected) && +p.outputLayer.getAttribute('opacity') === +expected, 'theme preview opacity ' + (opacity || 'fallback'));
}
if (!process.argv.includes('--node')) await browserCheck();
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-code: ok');
process.exitCode = fails ? 1 : 0;

async function browserCheck() {
  const S = await studio(), work = path.resolve(process.argv[2] || path.join(ROOT, 'components/code/out/test'));
  fs.mkdirSync(work, {recursive: true});
  const demo = fs.readFileSync(path.join(ROOT, 'components/code/demo.html'), 'utf8');
  const decks = ['ja', 'en'].map((lang) => {
    const src = path.join(work, `deck-${lang}.html`), out = path.join(work, `deck-${lang}.out.html`);
    fs.writeFileSync(src, demo.replace('<html lang="ja"', `<html lang="${lang}"`)); S.build(src, out); return {lang, out};
  });
  const browser = await S.browser.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 720}}), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const {lang, out} of decks) {
      await page.goto(S.browser.fileUrl(out)); await page.waitForFunction(() => window.DECK && DECK.ready); await page.evaluate(() => document.fonts.ready);
      const results = await page.evaluate(() => [...document.querySelectorAll('m-code')].map((c, i) => {
        const problems = [], box = c.getBoundingClientRect(); let history = true;
        const visible = (e) => { for (let p = e; p && p !== c; p = p.parentElement) if (+getComputedStyle(p).opacity < .01) return false; return true; };
        for (let k = 0; k <= c.steps; k++) for (const t of [0, c.duration(k) / 2, Infinity]) for (const preview of [false, true]) {
          DECK.seek(i, k, t); c.render(k, t, {preview}); const html = c.innerHTML;
          c.render(c.steps, Infinity); c.render(0, 0); c.render(k, t, {preview}); history &&= html === c.innerHTML;
          const texts = [...c.querySelectorAll('text')].filter(visible).map((e) => ({s: e.textContent, box: e.getBoundingClientRect(), size: parseFloat(getComputedStyle(e).fontSize)}));
          for (const [j, a] of texts.entries()) {
            if (a.size < 24 || a.box.left < box.left - 1 || a.box.right > box.right + 1 || a.box.top < box.top - 1 || a.box.bottom > box.bottom + 1) problems.push(`k=${k},t=${t}: outside/small ${a.s}`);
            for (const b of texts.slice(j + 1)) if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 2 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 4) problems.push(`k=${k},t=${t}: ${a.s} / ${b.s}`);
          }
        }
        c.render(c.steps, Infinity);
        return {history, problems, role: c.getAttribute('role'), aria: c.getAttribute('aria-label'), pre: c.querySelector('pre').textContent.includes(c.data.code)};
      }));
      for (const [i, r] of results.entries()) {
        ok(r.history && r.role === 'img' && r.aria && r.pre && !r.problems.length, `browser ${lang} ${i}: accessible, deterministic, contained text, no overlaps: ${r.problems.join('; ')}`);
        await page.evaluate((i) => DECK.seek(i, document.querySelectorAll('m-code')[i].steps, Infinity), i);
        await page.screenshot({path: path.join(work, `final-${lang}-${i}.png`)});
      }
      ok(errors.length === 0, `browser ${lang}: no page errors`);
      ok((await page.evaluate(() => DECK.componentErrors || [])).length === 0, `browser ${lang}: no component reports`);
    }
  } finally { await browser.close(); }
}

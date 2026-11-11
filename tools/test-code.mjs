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
ok(c.getAttribute('role') === 'figure' && c.svg.getAttribute('aria-hidden') === 'true', 'figure role, hidden SVG');
ok(c.getAttribute('aria-label') === 'Python のコード 3 行と出力; pandas を読み込む; CSV を表として読む; 店ごとの平均', 'concise final Japanese label and ordered notes');
ok(make(example, {'aria-label': 'Author label'}).el.getAttribute('aria-label') === 'Author label', 'author label retained');
const pre = c.children.find((n) => n.localName === 'pre');
ok(pre.className === 'sr-only' && pre.textContent.includes(example.code) && pre.textContent.endsWith(example.output) && pre.getAttribute('style').includes('clip-path:inset(50%)') && pre.getAttribute('tabindex') === null && pre.getAttribute('role') === null, 'full code/output in a hidden, non-focusable pre inside the figure');
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
ok(overflow.reports.filter((r) => r.code === 'layout').length === 3 && overflow.el.numbers.length === 16 && texts(overflow.el.codeLayer).some((n) => n.textContent.includes('…')) && texts(overflow.el.outputLayer).some((n) => n.textContent.includes('…')), 'line count, width and output report separately; visible text has ellipses');
ok(overflow.el.children.find((n) => n.localName === 'pre').textContent.includes('x'.repeat(100)), 'truncation preserves full accessible program');
range.render(range.steps, range.props.dur / 2);
ok(+range.bands[1].getAttribute('opacity') > 0 && range.notes[0].labels[0].getAttribute('style').includes('--muted'), 'without output, the last note still highlights its lines during its step');
range.render(range.steps, Infinity);
ok(range.bands.every((b) => b.getAttribute('opacity') === '0') && range.notes.every((n) => n.labels.every((e) => e.getAttribute('style').includes('--fg'))), 'without output, completed final state has all notes and no bands');
const clippedHeight = make({code: 'x = 1\n'.repeat(15) + 'print(x)', steps: []});
ok(clippedHeight.reports.some((r) => r.code === 'layout') && clippedHeight.el.numbers.length < 16 && texts(clippedHeight.el.codeLayer).some((n) => n.textContent.includes('…')), 'height truncation reports and marks the last visible line');
const tiny = make(example, {}, {clientWidth: 80, clientHeight: 40}); tiny.el.render(5, Infinity);
ok(tiny.reports.some((r) => r.code === 'size') && tiny.el.codeLayer.textContent.includes('…') && tiny.el.svg.getAttribute('style').includes('overflow:hidden'), 'unusable box reports size and retains a clipped ellipsis');
const noRoom = make({code: 'pass', steps: Array.from({length: 10}, () => ({lines: [1], note: 'Note'}))});
ok(!noRoom.reports.length && noRoom.el.noteLayout === 'band' && noRoom.el.notes.every((n) => n.labels.length), 'notes that cannot stack beside code switch to a compact band');
ok(make(example, {}, {clientWidth: 280, clientHeight: 120}).reports.some((r) => r.code === 'size'), 'small box reports size');
// Eval B: real Python lines, compact note bands and actionable, independent reports.
const python = {
  lang: 'python',
  code: ['from sklearn.tree import DecisionTreeClassifier', 'from sklearn.model_selection import cross_val_score', 'X, y = load_data()', 'model = DecisionTreeClassifier(max_depth=3, random_state=0)', 'scores = cross_val_score(model, X, y, cv=5)', 'print(scores)', 'print(scores.mean())'].join('\n'),
  steps: [{lines: [1, 2], note: '必要な道具を準備'}, {lines: [3, 4], note: '深さを決めて学習'}, {lines: [5, 7], note: '分割して精度を検証'}]
};
ok(python.code.split('\n')[3].length === 59, 'regression fixture has a 59-character line');
for (const height of [380, 440]) {
  const r = make(python, {}, {clientHeight: height});
  ok(!r.reports.length && r.el.noteLayout === 'band' && r.el.numbers.length === 7 && r.el.geometry.row === 34, '59-character Python, 7 lines at ' + height + 'px fits the band without reports');
  r.el.render(3, Infinity);
  ok(r.el.notes.filter((n) => +n.g.getAttribute('opacity') > 0).length === 1 && r.el.notes[1].g.textContent.includes('3–4 行目') && +r.el.bands[1].getAttribute('opacity') === 1, 'band replaces earlier notes and retains line-range highlighting');
  r.el.render(r.el.steps, Infinity);
  ok(+r.el.finalNotes.getAttribute('opacity') === 1 && r.el.finalNotes.textContent.includes('1–2：必要') && r.el.finalNotes.textContent.includes('5–7：分割') && r.el.notes.every((n) => +n.g.getAttribute('opacity') === 0), 'print shows each note with its line range, in the band');
}
const bandEn = make({...python, steps: [{lines: [3, 4], note: 'Set the tree depth'}]}, {}, {}, 'en').el;
bandEn.render(2, .3);
ok(bandEn.notes[0].g.textContent.includes('lines 3–4'), 'English band has a line-range marker');
const withOutput = {...python, output: '0.91\n0.92'};
const outputBelow = make(withOutput, {outputPos: 'below'});
ok(!outputBelow.el.geometry.right && outputBelow.reports.some((r) => /7 lines; this height fits 4 \(more than a slide body under a heading \(about 440 px\) holds; 440 px fits 4 lines.*split the slide\)/.test(r.msg)), 'explicit below output: needs 520px, more than a slide body, so the report names lines, not a height');
const lower = make(withOutput, {outputPos: 'below'}, {clientHeight: 380});
ok(lower.reports.some((r) => /7 lines; this height fits 2 .*440 px fits 4 lines/.test(r.msg)) && !lower.reports.some((r) => /give the element/.test(r.msg)), '380px with below output: capacity, and lines at 440px instead of a height');
const sixty = make({...python, code: Array(7).fill('x'.repeat(60)).join('\n')});
ok(!sixty.reports.length && sixty.el.noteLayout === 'band' && !sixty.el.codeLayer.textContent.includes('…'), '60-character lines use the band width without truncation');
const enoughBelow = make(withOutput, {outputPos: 'below'}, {clientHeight: 520});
const besideOut = make(withOutput);
ok(besideOut.el.geometry.right, 'a short output goes beside wide code when it fits the width');
ok(!enoughBelow.reports.length && +enoughBelow.el.outputLayer.children[0].getAttribute('y') > enoughBelow.el.notes[0].top + enoughBelow.el.notes[0].height, 'wide Python and two-line output fit at the reported height; output follows band');
const medium = {code: Array(9).fill('x'.repeat(45)).join('\n'), steps: [{lines: [3, 4], note: 'A short note'}], output: '1\n2'};
const nine = make(medium);
ok(!nine.reports.length && nine.el.noteLayout === 'band' && nine.el.geometry.right && nine.el.numbers.length === 9, '440px holds nine code lines, a note band and two-line output on the right');
const wideOutput = make({code: 'x'.repeat(50), steps: Array.from({length: 4}, () => ({lines: [1], note: 'Short'})), output: 'x'.repeat(20)});
ok(!wideOutput.reports.length && wideOutput.el.noteLayout === 'band' && wideOutput.el.geometry.right, 'band output uses available right-side width beyond 30% instead of truncating unnecessarily');
const table = [[380, 7], [440, 9], [540, 12], [680, 16]];
for (const [height, n] of table) {
  const r = make({...medium, code: Array(n).fill('x'.repeat(45)).join('\n')}, {}, {clientHeight: height});
  ok(!r.reports.length && r.el.numbers.length === n, 'documented height ' + height + 'px fits ' + n + ' band-mode lines with output right');
}
const sixteen = make({...medium, code: Array(16).fill('x'.repeat(45)).join('\n')});
ok(sixteen.reports.some((r) => r.msg === '[code] 16 lines; this height fits 9 (more than a slide body under a heading (about 440 px) holds; 440 px fits 9 lines with these notes: show fewer lines, shorten notes or split the slide)') && sixteen.el.numbers.length === 9, '16 lines at 440px: capacity, no height beyond a slide body');
const wide = make({code: 'x'.repeat(90), steps: [{lines: [1], note: 'Short'}]});
ok(wide.reports.length === 1 && /longest line is 90 characters; this width fits 77 at 24px/.test(wide.reports[0].msg) && wide.el.codeLayer.textContent.includes('…'), '90-character code reports numeric width capacity and remains drawn');
const longNote = make({...python, steps: [{lines: [1], note: '長い説明'.repeat(50)}]});
ok(longNote.reports.some((r) => /note 1 is too long for the band \(\d+ px of \d+\); shorten it to about \d+ characters/.test(r.msg)) && longNote.el.notes[0].g.textContent.endsWith('…'), 'long band note reports index, measured width, capacity and target length; draws ellipsis');
const manyNotes = make({...python, steps: Array.from({length: 30}, (_, i) => ({lines: [1], note: '説明その' + i}))}, {}, {clientHeight: 380});
manyNotes.el.render(manyNotes.el.steps, Infinity);
ok(manyNotes.reports.some((r) => /30 final notes need \d+ band rows \(\d+ px\); this height fits \d+ .*showing the last note/.test(r.msg)) && manyNotes.el.finalNotes.textContent.includes('1：説明その29') && !manyNotes.el.finalNotes.textContent.includes('説明その0'), 'final list overflow reports required band height and keeps only the last note');
// Eval C: one height formula for code + final list + output; advice never exceeds a slide body.
const sideOut = make({...python, output: '[0.93 0.95 0.91 0.96 0.94]'});
const so = sideOut.el.outputLayer.children[0];
ok(!sideOut.reports.length && sideOut.el.geometry.side && +so.getAttribute('y') > sideOut.el.geometry.codeH && +so.getAttribute('x') > sideOut.el.notes[0].g.children[0].getAttribute('width'), 'auto output under wide code sits beside the note band (7 lines + 1 output row fit 440px)');
const eight = {...python, code: python.code + '\nprint(len(scores))', steps: [{lines: [1, 2], note: '道具を読み込む'}, {lines: [3, 4], note: 'モデルを作る'}, {lines: [5], note: '5 分割で検証'}, {lines: [6, 8], note: '結果を表示'}], output: '[0.93 0.95 0.91 0.96 0.94]\n0.938'};
const e8 = make(eight, {}, {clientHeight: 380});
ok(e8.reports.length && e8.reports.every((r) => !/give the element about (\d+)/.test(r.msg) || +RegExp.$1 <= 440), '8 lines + 4 notes + output: no advice beyond 440px: ' + e8.reports.map((r) => r.msg).join(' | '));
const six = {lang: 'python', code: Array.from({length: 6}, (_, i) => 'total = total + values[' + i + '] * weights[' + i + ']  # add step').join('\n'), steps: Array.from({length: 6}, (_, i) => ({lines: [i + 1], note: '合計に ' + (i + 1) + ' 個目を足す処理'}))};
let checked = 0;
for (const data of [python, six, {...python, output: '0.91'}, {...six, output: '21'}, {...six, steps: six.steps.slice(0, 3)}])
  for (const lang of ['ja', 'en'])
    for (const h of [260, 300, 340, 380]) {
      const r = make(data, {}, {clientHeight: h}, lang);
      for (const m of r.reports.map((x) => /give the element about (\d+) px/.exec(x.msg)).filter(Boolean)) {
        const again = make(data, {}, {clientHeight: +m[1]}, lang);
        ok(+m[1] <= 440 && !again.reports.some((x) => x.code === 'layout' && /lines; this height|final notes/.test(x.msg)), 'advised ' + m[1] + 'px (from ' + h + 'px, ' + lang + ') fits code and the final list');
        checked++;
      }
    }
ok(checked >= 6, 'height advice checked in ' + checked + ' cases');
const sixR = make(six, {}, {clientHeight: 440});
sixR.el.render(sixR.el.steps, Infinity);
ok(!sixR.reports.length && sixR.el.noteLayout === 'band' && sixR.el.geometry.listRows >= 2 && sixR.el.finalNotes.textContent.includes('6：'), '6 lines + 6 notes fit 440px with a multi-row final list (' + sixR.el.geometry.listRows + ' rows)');
for (const el of [bandEn, nine.el, outputBelow.el, manyNotes.el]) {
  let stable = true;
  for (let k = 0; k <= el.steps; k++) for (const t of [0, .3, Infinity]) for (const preview of [false, true]) {
    el.render(k, t, {preview}); const html = el.innerHTML;
    el.render(el.steps, Infinity); el.render(0, 0); el.render(k, t, {preview});
    stable &&= html === el.innerHTML && !/NaN|Infinity|undefined/.test(el.svg.outerHTML);
  }
  ok(stable, 'band layout is finite and deterministic through arbitrary seeks and preview');
}
const invalid = make(example, {dur: -1, size: 23, outputPos: 'left'});
ok(invalid.reports.filter((r) => r.code === 'attr').length === 3 && invalid.el.props.dur === .6 && invalid.el.fs === 24, 'bad props report/default');
const runs = (e) => walk(e).filter((n) => n.localName === 'tspan').map((n) => [n.textContent, (/--(muted|accent2|term)\b/.exec(n.getAttribute('style') || '') || [, 'fg'])[1]]);
const has = (e, text, role) => runs(e).some(([t, r]) => t === text && r === role);
for (const lang of ['python', 'r', 'shell', 'js', 'javascript', 'PYTHON']) {
  const token = /js|javascript/.test(lang) ? '//' : '#';
  const r = make({lang, code: `x = "${token} literal" ${token} comment\nprint(x)`, steps: []}).el;
  ok(has(r.codeLayer, token + ' comment', 'muted') && has(r.codeLayer, `"${token} literal"`, 'accent2'), 'comments outside quoted strings only; strings accent2: ' + lang);
}
const triple = make({lang: 'python', code: 's = """text\n# string\n""" # comment', steps: []}).el;
ok(has(triple.codeLayer, '# string', 'accent2') && has(triple.codeLayer, '# comment', 'muted'), 'Python multiline strings do not become comments');
const kw = make({lang: 'python', code: 'for x in xs:  # loop\n    if x is None: forx = "if"\nimport pandas as pd', steps: []}).el;
ok(['for', 'in', 'if', 'is', 'None', 'import', 'as'].every((w) => has(kw.codeLayer, w, 'term')) && !has(kw.codeLayer, 'forx', 'term') && has(kw.codeLayer, '"if"', 'accent2'), 'keywords term outside strings and comments; identifiers stay fg');
ok(texts(kw.codeLayer).filter((n) => /^\d+$/.test(n.textContent) === false).some((n) => n.textContent === '    if x is None: forx = "if"'), 'one text per line keeps the whole line (tabs/spaces kept)');
const plain = make({lang: 'sql', code: 'select 1 # x', steps: []}).el;
ok(runs(plain.codeLayer).every(([, r]) => r === 'fg'), 'unknown languages are not coloured');
const js = make({lang: 'js', code: 'const t = `a\n// b`; // c\nlet ok = true', steps: []}).el;
ok(has(js.codeLayer, '`a', 'accent2') && has(js.codeLayer, '// b`', 'accent2') && has(js.codeLayer, '// c', 'muted') && has(js.codeLayer, 'const', 'term') && has(js.codeLayer, 'true', 'term'), 'JS templates span lines; keywords coloured');
const nested = make({...example, steps: [{lines: [[2, 3]], note: '範囲'}]});
ok(!nested.reports.length && nested.el.notes[0].a === 2 && nested.el.notes[0].b === 3 && nested.el.notes[0].valid, '[[2, 3]] reads as the range [2, 3]');
const twoRanges = make({...example, steps: [{lines: [[1, 2], [3, 3]], note: '二つ'}]});
ok(twoRanges.reports.filter((r) => r.code === 'range').length === 1 && /one range per step/.test(twoRanges.reports[0].msg ?? JSON.stringify(twoRanges.reports[0])) && !twoRanges.el.notes[0].valid, 'two nested ranges: one range report');
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
        ok(r.history && r.role === 'figure' && r.aria && r.pre && !r.problems.length, `browser ${lang} ${i}: accessible, deterministic, contained text, no overlaps: ${r.problems.join('; ')}`);
        await page.evaluate((i) => DECK.seek(i, document.querySelectorAll('m-code')[i].steps, Infinity), i);
        await page.screenshot({path: path.join(work, `final-${lang}-${i}.png`)});
      }
      ok(errors.length === 0, `browser ${lang}: no page errors`);
      ok((await page.evaluate(() => DECK.componentErrors || [])).length === 0, `browser ${lang}: no component reports`);
    }
  } finally { await browser.close(); }
}

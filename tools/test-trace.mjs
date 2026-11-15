// node tools/test-trace.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const sum = {lang: 'python', code: 'xs = [3, 1, 2]\ntotal = 0\nfor x in xs:\n    total += x\nprint(total)', source: {tool: 'egatari-trace 0.1', python: '3.13.1', sha256: '', truncated: false},
  steps: [{line: 1, vars: {xs: [3, 1, 2]}}, {line: 2, vars: {xs: [3, 1, 2], total: 0}, note: '合計を 0 から'}, {line: 3, vars: {xs: [3, 1, 2], total: 0, x: 3}}, {line: 4, vars: {xs: [3, 1, 2], total: 3, x: 3}},
    {line: 3, vars: {xs: [3, 1, 2], total: 3, x: 1}}, {line: 5, vars: {xs: [3, 1, 2], total: 3, x: 1}, out: '3\n'}]};
const {ok, make, common, finish, Part} = harness('trace', sum, {libs: ['code-core'], role: 'figure'});
const {el: c, reports} = make(sum, {}, {clientWidth: 1100, clientHeight: 440});
ok(reports.length === 0 && c.steps === 6 && Part.preview === 'none', 'six trace lines = six steps; no preview of later steps: ' + JSON.stringify(reports));
const varText = (el) => el.varSlots.map((o) => o.name.textContent + o.value.textContent).filter(Boolean);
c.render(0, 0); ok(varText(c).length === 0 && c.band.getAttribute('opacity') === '0' && c.counter.textContent === '0 / 6', 'k = 0: code only, empty variables');
c.render(4, Infinity);
ok(JSON.stringify(varText(c)) === JSON.stringify(['xs = [3, 1, 2]', 'total = 3', 'x = 3']), 'step 4: the full state after line 4: ' + JSON.stringify(varText(c)));
const bold = (el) => el.varSlots.filter((o) => /font-weight:700/.test(o.value.getAttribute('style') || '')).map((o) => o.name.textContent.trim());
ok(JSON.stringify(bold(c)) === JSON.stringify(['total =']), 'step 4: only total is marked as changed');
const lit = (el) => el.vrows.filter((o) => /emph/.test(o.num.getAttribute('style'))).map((o) => o.line);
ok(JSON.stringify(lit(c)) === '[4]', 'step 4: line 4 is the current line');
c.render(6, Infinity); ok(c.outLabels[0].textContent === '3', 'step 6: output so far');
c.render(5, Infinity); ok(c.outLabels[0].textContent === '', 'step 5: no output yet');
// by="time": one step, cues per trace line
const tm = make(sum, {by: 'time', rate: '2'}, {clientWidth: 1100, clientHeight: 440}).el;
ok(tm.steps === 1 && tm.duration(1) === 3 && JSON.stringify(tm.cues(1)) === '[0,0.5,1,1.5,2,2.5]', 'by=time: one step of 3 s with a cue per line');
tm.render(1, 1.6); ok(tm.counter.textContent === '4 / 6', 'by=time: t = 1.6 s shows trace line 4');
// value formatting in Python's spelling; 2-D lists one row each
const v = make({...sum, steps: [{line: 1, vars: {a: 'x', b: true, c: null, d: {repr: '2.0'}, e: [[1, 2], [3, 4]], f: {k: 1}}}]}, {}, {clientWidth: 1100, clientHeight: 440}).el;
v.render(1, Infinity);
ok(JSON.stringify(varText(v)) === JSON.stringify(["a = 'x'", 'b = True', 'c = None', 'd = 2.0', 'e = [[1, 2],', ' [3, 4]]', "f = {'k': 1}"]), 'Python spelling, repr and 2-D rows: ' + JSON.stringify(varText(v)));
// checks
const bad = (data, s) => make(data, {}, {clientWidth: 1100, clientHeight: 440}).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(bad({...sum, steps: [{line: 9, vars: {}}]}, 'outside 1–5'), 'a line beyond the code reports');
ok(bad({...sum, steps: [{line: 1, vars: {s: 'x'.repeat(41)}}]}, 'over 40 characters'), 'a long string reports');
ok(bad({...sum, steps: [{line: 1, vars: {l: Array(13).fill(0)}}]}, 'over 12 items'), 'a long list reports');
ok(bad({...sum, steps: [{line: 1, vars: {r: {repr: 1}}}]}, '{"repr"} takes one string'), 'a bad repr reports');
ok(bad({...sum, show: ['nope']}, 'show: "nope"'), 'an unknown show name reports');
ok(bad({...sum, steps: [{line: 1, vars: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7}}]}, 'choose them with show'), 'more than 6 variables report');
ok(bad({...sum, steps: [{line: 5, vars: {}, out: '1\n2\n3\n4\n5\n6\n7\n8\n9\n'}]}, 'at most 8'), 'more than 8 output lines report');
for (const b2 of [null, {}, {code: 'x'}, {...sum, extra: 1}, {...sum, steps: [{vars: {}}]}]) { const r = make(b2); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b2).slice(0, 60)); }
ok(make(sum, {dur: -1, rate: 0, size: 20}).reports.filter((r) => r.code === 'attr').length === 3, 'bad props report/default');
// long code scrolls with the current line in view
const long = {lang: 'python', code: Array.from({length: 16}, (_, i) => 'v' + i + ' = ' + i).join('\n'), steps: Array.from({length: 16}, (_, i) => ({line: i + 1, vars: {['v' + i]: i}})), show: ['v0', 'v15']};
const lg = make(long, {}, {clientWidth: 1100, clientHeight: 440});
ok(lg.reports.length === 0 && lg.el.geometry.windowed, '16 lines in 440 px scroll: ' + JSON.stringify(lg.reports));
lg.el.render(16, Infinity); ok(lg.el.vrows[15].text.getAttribute('opacity') === '1.000' && lg.el.markTop.textContent.startsWith('⋮'), 'the last line is in view with a ⋮ marker above');
// readable layer
const pre = c.children.find((n) => n.localName === 'pre'), tbl = c.children.find((n) => n.localName === 'table');
ok(pre && pre.getAttribute('data-readable') === '' && pre.textContent.includes('print(total)') && pre.textContent.endsWith('3'), 'pre[data-readable] has the code and output');
ok(tbl && tbl.getAttribute('data-readable') === '' && tbl.children.length === 4, 'table[data-readable] has the final variables');
for (const lang of ['ja', 'en']) { const r = make(sum, {}, {clientWidth: 1100, clientHeight: 440}, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
// the tracer itself (uv run): the demo's sum program gives the expected trace
if (!process.argv.includes('--no-tracer')) {
  let out = null;
  try { out = JSON.parse(execFileSync('uv', ['run', '-q', 'tools/trace.py', 'tools/trace-demo/sum.py'], {encoding: 'utf8'})); } catch (e) { out = null; }
  if (out) {
    ok(out.steps.length === 10 && out.steps[3].line === 4 && out.steps[3].vars.total === 3 && out.steps[9].out === '6\n' && out.source.truncated === false && /^[0-9a-f]{64}$/.test(out.source.sha256), 'tracer: sum.py gives 10 steps, full state per step and the output');
    ok(make(out).reports.length === 0, 'tracer output passes the part\'s checks');
  } else console.log('skip tracer (uv not available)');
}
await finish();

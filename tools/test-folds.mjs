// node tools/test-folds.mjs [work dir] | --node
import {harness, close, walk} from './stats-test-helpers.mjs';
const data = {k: 5, errors: [.21, .18, .25, .19, .22], labels: ['1', '2', '3', '4', '5']};
const {ok, make, common, finish, Part} = harness('folds', data);
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 6 && Part.preview === 'none', 'k+1 steps, no answer preview, default fits');
ok(close(c.model.mean, .21), 'mean error uses all k errors');
ok(c.rows.length === 5 && c.rows.every((o, i) => o.blocks.length === 5 && o.blocks.filter((b) => b.validation).length === 1 && o.blocks[i].validation), 'each row validates its matching single block');
ok(c.rows.every((o) => o.blocks.every((b) => b.rect.getAttribute('style').includes(b.validation ? '--emph-tint' : '--term-tint') && (b.validation ? b.rect.getAttribute('style').includes('--emph)') : b.rect.getAttribute('stroke') === 'none'))), 'validation fill + outline, training tint');
ok(c.rows.every((o) => o.g.textContent.includes('検') && o.g.textContent.includes('学')), 'wide blocks have letters as well as colour');
for (let step = 0; step <= 6; step++) {
  c.render(step, Infinity);
  ok(c.rows.every((o, i) => +o.g.getAttribute('opacity') === (i < step ? 1 : 0)) && +c.finalLayer.getAttribute('opacity') === (step === 6 ? 1 : 0), 'row visibility at step ' + step);
}
ok(c.finalLayer.textContent === '平均 0.21' && c.finalLayer.children.some((e) => e.localName === 'line'), 'final mean below rule');
ok(c.getAttribute('aria-label').includes('分割 5: 検証（検・枠） 5') && c.getAttribute('aria-label').includes('平均 0.21'), 'accessible label describes splits and final mean');
const en = make(data, {}, {}, 'en');
ok(en.reports.length === 0 && en.el.header.textContent.includes('train (T)') && en.el.header.textContent.includes('validate (V, outline)') && en.el.finalLayer.textContent === 'mean 0.21' && en.el.getAttribute('aria-label').includes('fold 1'), 'English legend, final mean and accessible splits');
const omitted = make({k: 2});
ok(omitted.reports.length === 0 && omitted.el.steps === 3 && omitted.el.model.labels.join(',') === '1,2' && omitted.el.model.errors === null && omitted.el.finalLayer.children.length === 0, 'omitted labels and errors: numbered blocks, no invented errors');
const narrow = make({k: 10}, {}, {clientWidth: 420, clientHeight: 700}, 'en');
ok(narrow.el.rows.every((o) => !o.g.textContent.includes('T') && !o.g.textContent.includes('V')) && narrow.el.header.textContent.includes('outline'), 'blocks below 40px omit letters; outlined validation explained in legend');
for (const k of [2, 3, 10]) {
  const r = make({k, errors: Array(k).fill(.1)}, {}, {clientHeight: 700});
  ok(r.reports.length === 0 && r.el.steps === k + 1 && close(r.el.model.mean, .1), 'dynamic steps and mean for k=' + k); common(r.el, 'k=' + k, {k, errors: Array(k).fill(.1)});
}
for (const bad of [{k: 1}, {k: 11}, {k: 2.5}, {...data, errors: [.1]}, {...data, errors: Array(6).fill(.1)}, {...data, errors: [-1, 0, 0, 0, 0]}, {...data, labels: ['a']}]) {
  const r = make(bad); r.el.render(6, Infinity);
  ok(!r.el.model && r.reports.some((r) => r.code === 'data') && !r.reports.some((r) => r.code === 'error'), 'semantic validation: ' + JSON.stringify(bad));
}
for (const bad of [null, {}, {k: '5'}, {...data, errors: ['.2']}, {...data, labels: [1, 2]}, {...data, extra: 1}]) {
  const r = make(bad); ok(r.el.steps === 0 && !r.el.svg && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(bad));
}
const invalid = make(data, {dur: 0, size: 22});
ok(invalid.reports.filter((r) => r.code === 'attr').length === 2 && invalid.el.props.dur === 1 && invalid.el.fs === 26, 'invalid props reported/defaulted');
for (const lang of ['ja', 'en']) for (const size of [24, 26, 32]) {
  const r = make(data, {size}, {clientHeight: size === 32 ? 560 : 440}, lang);
  ok(r.reports.length === 0, lang + ' size ' + size + ' fits'); common(r.el, lang + ' size ' + size);
}
for (const k of [2, 5, 10]) for (const hasErrors of [false, true]) {
  const sample = {k, ...(hasErrors ? {errors: Array(k).fill(.1)} : {})};
  const minimum = Math.ceil(99.4 + k * 32 + (hasErrors ? 56.1 : 4));
  const fits = make(sample, {}, {clientHeight: minimum});
  ok(!fits.reports.length && fits.el.geometry.minHeight === minimum && fits.el.geometry.row >= 32 && !fits.el.geometry.letters && fits.el.rows.every((r) => !/[学検]/.test(r.g.textContent)), 'k=' + k + ' minimum ' + minimum + 'px, errors=' + hasErrors + ': 32px rows omit block letters, preserve legend');
  const short = make(sample, {}, {clientHeight: minimum - 1});
  ok(short.reports.some((r) => r.code === 'size' && r.msg.includes('k = ' + k + ' needs at least ' + minimum + ' px height') && r.msg.includes('element has ' + (minimum - 1) + ' px')), 'one pixel below minimum reports k, required height and actual height');
}
const compact = make(data, {}, {clientHeight: 340}, 'en');
ok(!compact.reports.length && compact.el.geometry.row > 32 && compact.el.geometry.row < c.geometry.row && !compact.el.geometry.letters && compact.el.header.textContent.includes('outline'), '340px shrinks rows and drops letters before reporting; English legend still explains validation');
const labels = make({...data, labels: Array(5).fill('A very long block name')});
ok(labels.reports.some((r) => r.code === 'size' && /label 1 needs \d+ px; block fits \d+ px/.test(r.msg)), 'long block labels report their index and numeric width limits');
const legend = make(data, {}, {clientWidth: 280});
ok(legend.reports.some((r) => /legend needs \d+ px width; element has 280 px/.test(r.msg)), 'legend reports numeric required and actual width');
ok(walk(c.svg).filter((e) => e.localName === 'rect').every((e) => +e.getAttribute('width') > 0), 'all blocks have positive widths');
// 2.1.0: per-sample splits
const strat = {samples: [0, 0, 0, 1, 0, 0, 0, 1].map((c) => ({class: c})), classes: [{id: 0, label: 'A'}, {id: 1, label: 'B'}], splitter: 'StratifiedKFold',
  splits: [{test: [0, 1, 2, 3]}, {test: [4, 5, 6, 7]}]};
const sm = make(strat, {}, {clientWidth: 1100, clientHeight: 400});
ok(sm.reports.length === 0 && sm.el.steps === 3 && sm.el.sm.role[0].join('') === '22221111', 'samples mode: test cells and the train complement: ' + JSON.stringify(sm.reports));
const smBad = (data, s) => make(data, {}, {clientWidth: 1100, clientHeight: 400}).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(smBad({...strat, splits: [{test: [0, 1, 2, 3]}, {test: [3, 4, 5, 6, 7]}]}, 'sample 3 is in the test set of 2 splits'), 'KFold types: a sample tested twice reports');
ok(smBad({...strat, splits: [{test: [0, 1, 2, 4]}, {test: [3, 5, 6, 7]}]}, 'StratifiedKFold keeps about 1'), 'stratified: class counts off by 1 or more report');
ok(smBad({samples: ['P', 'P', 'Q', 'Q'].map((g) => ({group: g})), splitter: 'GroupKFold', splits: [{test: [0, 2]}, {test: [1, 3]}]}, 'group "P" is in both'), 'GroupKFold: a split group reports');
ok(smBad({samples: [1, 2, 3, 4].map((t) => ({t})), splitter: 'TimeSeriesSplit', splits: [{test: [1], train: [2]}]}, 'trains on the past'), 'TimeSeriesSplit: training after the test reports');
ok(!smBad({samples: [1, 2, 3, 4].map((t) => ({t})), splitter: 'TimeSeriesSplit', splits: [{test: [2], train: [0, 1]}, {test: [3], train: [0, 1, 2]}]}, 'test set'), 'TimeSeriesSplit: unused samples allowed');
ok(smBad({...strat, splits: [{test: [0, 1, 2, 3, 99]}]}, 'samples 0–7'), 'an index out of range reports');
common(sm.el, 'samples', strat);
if (!process.argv.includes('--no-helper')) {
  const {execFileSync} = await import('node:child_process');
  let lines = null;
  try { lines = execFileSync('uv', ['run', '-q', 'tools/folds-demo.py'], {encoding: 'utf8'}).trim().split('\n').map((l) => JSON.parse(l)); } catch (e) { lines = null; }
  if (lines) ok(lines.length === 3 && lines.every((d) => make(d, {}, {clientWidth: 1100, clientHeight: 400}).reports.length === 0), 'sk2ega model_selection: StratifiedKFold, GroupKFold, TimeSeriesSplit pass the checks');
  else console.log('skip sk2ega (uv not available)');
}
await finish();

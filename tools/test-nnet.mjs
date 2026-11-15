// node tools/test-nnet.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
const data = {layers: [{n: 2, label: '入力', names: ['*x*_1', '*x*_2']}, {n: 1, label: '出力', act: 'step', form: 'split'}],
  weights: [[[1, 1]]], biases: [[-1.5]], values: {x: [1, 1], z: [[0.5]], a: [[1]]}};
const {ok, make, common, finish, Part} = harness('nnet', data);
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 3 && Part.preview === 'none', 'perceptron: x, z, a = 3 steps; no answer preview: ' + JSON.stringify(reports));
const o = c.neurons[1][0];
c.render(2, Infinity);
ok(o.zT.getAttribute('opacity') === '1.000' && o.aT.getAttribute('opacity') === '0.000' && o.fn.textContent === 'ステップ' && o.fn.getAttribute('opacity') === '1.000', 'split: step 2 lights Σ with z, f still shows its name');
c.render(3, Infinity);
ok(o.aT.getAttribute('opacity') === '1.000' && o.aT.textContent === '1.00' && o.zT.textContent === '0.50', 'split: step 3 lights a = 1.00');
const wrongZ = make({...data, values: {...data.values, z: [[0.7]]}});
ok(wrongZ.reports.some((r) => r.code === 'data' && r.msg.includes('z is 0.7 but W·a + b = 0.5')), 'z ≠ W·a + b reports both numbers');
const wrongA = make({...data, values: {...data.values, a: [[0]]}});
ok(wrongA.reports.some((r) => r.code === 'data' && r.msg.includes('a is 0 but step(z) = 1')), 'a ≠ f(z) reports both numbers');
const dims = make({...data, weights: [[[1, 1, 1]]]});
ok(dims.reports.some((r) => r.msg.includes('weights must be')), 'weight dimensions are checked');
const deep = {layers: [{n: 3}, {n: 12, act: 'relu'}, {n: 2, act: 'softmax'}]};
const d2 = make(deep, {}, {clientHeight: 540});
ok(d2.reports.length === 0 && d2.el.model.cols[1].includes(-1) && d2.el.model.cols[1].length <= 8, 'a 12-neuron layer shows an ellipsis neuron (≤ 8 slots)');
const rounded = {layers: [{n: 2}, {n: 2, act: 'sigmoid'}], weights: [[[0.31, -0.42], [0.57, 0.12]]], biases: [[0.1, -0.2]],
  values: {x: [0.5, 1.2], z: [[-0.25, 0.23]], a: [[0.44, 0.56]]}};
ok(!make(rounded).reports.some((r) => r.code === 'data'), 'values rounded to 2 decimals pass within their precision');
const back = make({...data, steps: [{show: 'x'}, {layer: 1, phase: 'delta'}]});
ok(back.reports.some((r) => r.msg.includes('reserved')), 'backpropagation phases are reserved and reported');
const opened = make({...data, layers: [data.layers[0], {...data.layers[1], form: 'combined'}], steps: [{show: 'x'}, {layer: 1, phase: 'a'}, {open: 1}, {focus: [1, 0]}]});
opened.el.render(2, Infinity); const before = opened.el.neurons[1][0].body.getAttribute('width');
opened.el.render(3, Infinity); const after = opened.el.neurons[1][0].body.getAttribute('width');
ok(+after > +before && opened.el.neurons[1][0].div.getAttribute('opacity') === '1.000', 'open widens the neuron into Σ | f');
opened.el.render(4, Infinity);
ok(opened.el.wlabels[0].g.getAttribute('opacity') === '1.000' && opened.el.noteText.textContent.startsWith('z = 1.00×1.00 + 1.00×1.00 − 1.50 = 0.50'), 'focus shows the weights and the weighted sum');
for (const bad of [null, {}, {layers: [{n: 2}]}, {...data, extra: 1}]) {
  const r = make(bad); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(bad));
}
const attrs = make(data, {dur: -1, size: 20, edges: 'thick'});
ok(attrs.reports.filter((r) => r.code === 'attr').length === 3, 'bad props report/default');
for (const lang of ['ja', 'en']) { const r = make(data, {}, {clientHeight: 440}, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
common(opened.el, 'opened', {...data, layers: [data.layers[0], {...data.layers[1], form: 'combined'}], steps: [{show: 'x'}, {layer: 1, phase: 'a'}, {open: 1}, {focus: [1, 0]}]});
await finish();

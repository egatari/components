// node tools/test-balance.mjs [work dir] | --node
import {harness, close, walk} from './stats-test-helpers.mjs';
const data = {values: [0, 1, 2, 3], probs: [.1, .3, .4, .2], name: 'X'};
const {ok, make, common, finish, Part} = harness('balance', data);
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 3 && Part.steps === 3 && Part.preview === 'none', 'three steps, no answer preview, default fits');
ok(close(c.model.expected, 1.7) && close(c.model.total, 1), 'expectation is sum of value × probability');
ok(c.model.formula === '0×0.1 + 1×0.3 + 2×0.4 + 3×0.2 = 1.7' && c.formulaText.children.some((e) => e.localName === 'tspan'), 'numeric sum drawn through mtext');
ok(c.bars.every((o, i) => close(o.h / c.bars[0].h, data.probs[i] / data.probs[0]) && o.text.textContent === String(data.probs[i])), 'heights proportional to probability; direct labels');
ok(c.ticks.join(',') === '0,1,2,3', 'nice integer ticks over original values');
c.render(1, Infinity);
ok(c.weightLayer.getAttribute('opacity') === '1' && c.beam.getAttribute('transform').startsWith('rotate(0 ') && c.fulcrum.getAttribute('transform') === `translate(${c.start} 0)` && c.finalLayer.getAttribute('opacity') === '0', 'step 1: horizontal weights and leftmost fulcrum');
c.render(2, 0);
const startAngle = +c.beam.getAttribute('transform').match(/rotate\(([^ ]+)/)[1];
ok(startAngle > 0 && startAngle <= 8, 'step 2: heavier right side tilts clockwise within 8°');
c.render(2, c.props.dur / 2);
const middleAngle = +c.beam.getAttribute('transform').match(/rotate\(([^ ]+)/)[1];
ok(close(+c.fulcrum.getAttribute('transform').match(/translate\(([^ ]+)/)[1], (c.start + c.end) / 2) && middleAngle > 0 && middleAngle < startAngle, 'fulcrum slides toward E as moment and tilt diminish');
c.render(2, Infinity);
ok(c.beam.getAttribute('transform').startsWith('rotate(0 ') && c.fulcrum.getAttribute('transform') === `translate(${c.end} 0)` && c.finalLayer.getAttribute('opacity') === '0', 'beam levels exactly at E before formula');
c.render(3, Infinity);
ok(c.finalLayer.getAttribute('opacity') === '1' && c.finalLayer.textContent.includes('E[X] = 1.7'), 'final expectation label and formula');
ok(c.getAttribute('aria-label').includes('期待値 E[X] = 1.7') && c.getAttribute('aria-label').includes('3: 確率 0.2') && c.getAttribute('aria-label').includes('確率の合計 1'), 'accessible final expectation, full weights and total');
const en = make(data, {}, {}, 'en');
ok(en.reports.length === 0 && en.el.getAttribute('aria-label').includes('Expectation is the balance point') && en.el.getAttribute('aria-label').includes('probability 0.2'), 'English accessible interpretation');
const negative = make({values: [-2, 0, 3], probs: [.2, .5, .3]});
ok(negative.reports.length === 0 && close(negative.el.model.expected, .5) && negative.el.model.formula.startsWith('(-2)×0.2'), 'negative values: correct expectation and parenthesized terms');
const zero = make({values: [0, 1, 2], probs: [0, 1, 0]});
ok(zero.reports.length === 0 && zero.el.bars[0].h === 0 && zero.el.bars[2].h === 0 && zero.el.model.expected === 1, 'zero probabilities supported');
const invalidTotal = make({...data, probs: [.1, .1, .1, .1]});
ok(invalidTotal.reports.some((r) => r.code === 'data' && r.msg.includes('sum to 1')) && close(invalidTotal.el.model.total, .4) && close(invalidTotal.el.model.expected, .6) && invalidTotal.el.bars.every((o) => o.text.textContent === '0.1'), 'bad total reports but retains raw probabilities and sum of products');
const tolerance = make({values: [0, 1], probs: [.5, .5000000005]});
ok(!tolerance.reports.some((r) => r.code === 'data'), 'probability total accepts ±1e-9 tolerance');
const long = make({values: [0, 1, 2, 3, 4, 5, 6], probs: [0, 0, 0, 0, 0, 0, 1]}, {}, {clientWidth: 2200, clientHeight: 800});
ok(long.el.model.expected === 6 && long.el.model.formula === '0×0 + 1×0 + 2×0 + 3×0 + 4×0 + 5×0 + … = 6' && long.el.getAttribute('aria-label').includes('6: 確率 1'), 'long formula shows first six terms and ellipsis while calculation/accessible weights include all');
const six = make({values: [0, 1, 2, 3, 4, 5], probs: [0, 0, 0, 0, 0, 1]});
ok(!six.el.model.formula.includes('…'), 'six terms stay complete');
const unsorted = make({values: [3, 0, 2, 1], probs: [.2, .1, .4, .3]});
ok(close(unsorted.el.model.expected, 1.7) && unsorted.el.start < unsorted.el.bars[0].x, 'input order does not change numerical positions or leftmost start');
const literal = make({...data, name: '*Y*_1'});
ok(literal.el.finalLayer.textContent.includes('E[*Y*_1]'), 'variable name remains literal text');
const digits = make({values: [0, 1], probs: [2 / 3, 1 / 3]}, {digits: 3});
ok(digits.el.model.formula.endsWith('= 0.333'), 'digits controls expectation rounding');
for (const bad of [{values: [0, 0], probs: [.5, .5]}, {values: [0, 1, 2], probs: [.5, .5]}, {values: [0, 1], probs: [-.1, 1.1]}]) {
  const r = make(bad); r.el.render(3, Infinity);
  ok(!r.el.model && r.reports.some((r) => r.code === 'data') && !r.reports.some((r) => r.code === 'error'), 'invalid distribution reports safely: ' + JSON.stringify(bad));
}
for (const bad of [null, {}, {values: [0], probs: [1]}, {values: [0, '1'], probs: [.5, .5]}, {...data, extra: true}, {values: Array(13).fill(1), probs: Array(13).fill(1 / 13)}]) {
  const r = make(bad); ok(r.el.steps === 0 && !r.el.svg && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(bad));
}
const attrs = make(data, {dur: -1, size: 23, digits: 11});
ok(attrs.reports.filter((r) => r.code === 'attr').length === 3 && attrs.el.props.dur === 1.5 && attrs.el.props.digits === 2 && attrs.el.fs === 26, 'bad props report/default');
ok(make({values: [0, .001, 1], probs: [.3, .3, .4]}).reports.some((r) => r.code === 'size'), 'close bars and labels report size');
const extreme = make({values: [-1e300, 1e300], probs: [.5, .5]}, {}, {clientWidth: 2400, clientHeight: 1000});
ok(extreme.el.model.expected === 0 && !/NaN|Infinity/.test(extreme.el.svg.outerHTML), 'scaled geometry and mean remain finite for extreme values');
for (const lang of ['ja', 'en']) for (const size of [24, 26, 32]) {
  const r = make(data, {size}, {clientHeight: size === 32 ? 560 : 440}, lang);
  ok(r.reports.length === 0, lang + ' size ' + size + ' fits'); common(r.el, lang + ' size ' + size);
}
common(negative.el, 'negative values', {values: [-2, 0, 3], probs: [.2, .5, .3]});
common(zero.el, 'zero probabilities', {values: [0, 1, 2], probs: [0, 1, 0]});
ok(walk(c.svg).some((e) => e.localName === 'path'), 'triangular fulcrum exists');
await finish();

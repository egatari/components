// node tools/test-ci.mjs [work dir] | --node
import {harness, close, walk} from './stats-test-helpers.mjs';
const data = {mu: 50, sigma: 10, n: 25, reps: 40, level: 0.95, seed: 2};
const {ok, make, common, finish, Part} = harness('ci', data);
const {el: c, reports} = make(), m = c.model;
ok(reports.length === 0 && c.steps === 3 && Part.steps === 3 && Part.preview === 'none', 'three steps, no answer preview, default example fits');
ok(close(m.z, 1.96) && close(m.half, 3.92), 'known-sigma z half-width = 1.96 × 10 / sqrt(25)');
ok(close(m.intervals[0].mean, 54.08342166639979) && m.hits === 38, 'seed 2 Box–Muller paired normals: reference first mean and 38/40 coverage');
ok(m.intervals.every((o) => close(o.lo, o.mean - m.half) && close(o.hi, o.mean + m.half) && o.hit === (o.lo <= m.mu && o.hi >= m.mu)), 'all intervals and containment computed from sample mean and known sigma');
ok(JSON.stringify(m.intervals) === JSON.stringify(make().el.model.intervals), 'same seed reproduces intervals');
ok(JSON.stringify(m.intervals) !== JSON.stringify(make({...data, seed: 9}).el.model.intervals), 'different seed changes intervals');
ok(Number.isFinite(make({...data, level: 1 - Number.EPSILON / 2}).el.model.z), 'near-one confidence level avoids rounding the quantile probability to one');
const shifted = make({...data, mu: -5, sigma: 20});
ok(shifted.el.model.intervals.every((o, i) => close(o.mean, -5 + 2 * (m.intervals[i].mean - 50))) && shifted.el.model.hits === m.hits, 'normal samples obey location/scale transformation');
for (const [level, z] of [[.9, 1.645], [.95, 1.96], [.99, 2.576], [.8, 1.2815515655446004], [.999, 3.2905267314919255], [.01, .012533469508069276]]) {
  ok(close(make({...data, level}).el.model.z, z, 1e-8), 'z or inverse-normal approximation for level ' + level);
}
c.render(1, Infinity);
ok(c.axisLayer.getAttribute('opacity') === '1' && c.intervals.every((o) => o.g.getAttribute('opacity') === '0'), 'step 1: only axis and μ');
ok(close(c.duration(2), 3 * c.props.dur + c.props.fast), 'step 2 duration: first 3 slow, then fast total');
c.render(2, c.props.dur);
ok(c.intervals[0].g.getAttribute('opacity') === '1' && c.intervals[1].g.getAttribute('opacity') === '0', 'first interval completes alone after dur');
c.render(2, 3 * c.props.dur + c.props.fast / 2);
const mid = c.intervals.filter((o) => +o.g.getAttribute('opacity') > 0).length;
ok(mid > 3 && mid < data.reps, 'remaining intervals accumulate within fast seconds');
c.render(2, Infinity);
ok(c.intervals.every((o) => o.g.getAttribute('opacity') === '1' && o.segment.getAttribute('style').includes('--term')) && c.finalLayer.getAttribute('opacity') === '0', 'step 2: all intervals, summary still hidden');
c.render(3, Infinity);
ok(c.finalLayer.textContent.includes('38 / 40（95 %）') && c.intervals.every((o, i) => o.segment.getAttribute('style').includes(m.intervals[i].hit ? '--term' : '--emph') && +o.segment.getAttribute('stroke-width') === (m.intervals[i].hit ? 2 : 4)), 'final: observed count, misses emph and thicker');
ok(c.getAttribute('aria-label').includes('38 / 40') && c.getAttribute('aria-label').includes('μ = 50') && c.getAttribute('aria-label').includes('n = 25'), 'accessible final coverage, population mean and sample size');
const en = make(data, {}, {}, 'en');
ok(en.reports.length === 0 && en.el.getAttribute('aria-label').includes('about 95% of repeated intervals contain μ') && en.el.finalLayer.textContent === 'contain μ: 38 / 40 (95 %)', 'English interpretation and observed count');
const one = make({...data, reps: 1});
ok(one.reports.length === 0 && one.el.duration(2) === one.el.props.dur, 'single interval: no fast tail');
const two = make({...data, reps: 2});
ok(two.el.duration(2) === 2 * two.el.props.dur, 'two intervals: slow phase only');
for (const reps of [3, 4, 200]) {
  const r = make({...data, reps}, {}, {clientHeight: reps === 200 ? 1500 : 440});
  ok(r.reports.length === 0 && r.el.model.intervals.length === reps, 'boundary repetition count ' + reps);
  common(r.el, 'reps=' + reps, {...data, reps});
}
const larger = make({...data, n: 10001, reps: 201}, {}, {clientHeight: 1600});
ok(larger.reports.length === 0 && larger.el.model.n === 10001 && larger.el.model.reps === 201, 'positive integer sample/repetition counts have no arbitrary upper cap');
const defaults = make({mu: 50, sigma: 10, n: 25});
ok(defaults.el.model.seed === 2 && defaults.el.model.reps === 40 && defaults.el.model.level === .95, 'optional defaults');
const badProps = make(data, {dur: -1, fast: 0, size: 23});
ok(badProps.reports.filter((r) => r.code === 'attr').length === 3 && badProps.el.props.dur === 1 && badProps.el.props.fast === 2.5 && badProps.el.fs === 26, 'invalid props reported/defaulted');
ok(make({...data, seed: .5}).reports.some((r) => r.code === 'data') && make({...data, seed: .5}).el.model.seed === 2, 'invalid seed reported/defaulted');
for (const patch of [{sigma: 0}, {sigma: -1}, {n: 0}, {n: 1.5}, {n: 1e20}, {reps: 0}, {reps: 1e20}, {reps: 1.5}, {level: 0}, {level: 1}, {mu: 1e308, sigma: 1e308}]) {
  const r = make({...data, ...patch}); r.el.render(3, Infinity);
  ok(!r.el.model && r.reports.some((r) => r.code === 'data') && !r.reports.some((r) => r.code === 'error'), 'invalid numeric data reports without render exception: ' + JSON.stringify(patch));
}
for (const bad of [null, {}, {...data, sigma: '10'}, {...data, n: true}, {...data, extra: 1}]) {
  const r = make(bad); ok(r.el.steps === 0 && !r.el.svg && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(bad));
}
for (const lang of ['ja', 'en']) for (const size of [24, 26, 32]) {
  const r = make(data, {size}, {clientHeight: size === 32 ? 500 : 440}, lang);
  ok(r.reports.length === 0, lang + ' size ' + size + ' fits'); common(r.el, lang + ' size ' + size);
}
ok(walk(c.axisLayer).filter((e) => e.localName === 'text').length >= 3, 'axis has numerical ticks and μ label');
await finish();

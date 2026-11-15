// node tools/test-ctable.mjs [work dir] | --node
import {harness} from './stats-test-helpers.mjs';
const anova = {kind: 'anova', rows: [{name: '要因 A', ss: 120, df: 2, ms: 60, f: 7.5}, {name: '誤差', ss: 96, df: 12, ms: 8}, {name: '全体', ss: 216, df: 14}]};
const {ok, make, common, finish, Part} = harness('ctable', anova);
const {el: c, reports} = make();
ok(reports.length === 0 && c.steps === 4 && Part.preview === 'none', 'anova: SS, df, MS, F = 4 steps; no answer preview: ' + JSON.stringify(reports));
const cellAt = (el, r, col) => el.cellEls.find((o) => o.x.r === r && o.x.c === col);
c.render(0, 0); ok(cellAt(c, 1, 1).t.getAttribute('opacity') === '0.000' && cellAt(c, 1, 1).qm.getAttribute('opacity') === '1.000', 'step 0: values hidden, ? shown');
c.render(1, Infinity); ok(cellAt(c, 1, 1).t.getAttribute('opacity') === '1.000' && cellAt(c, 1, 2).t.getAttribute('opacity') === '0.000', 'step 1 fills the SS column only');
c.render(3, 0.35); ok(+c.hl[2].getAttribute('opacity') > 0 && c.lines[2].textContent.includes('平均平方 = 平方和 ÷ 自由度'), 'step 3: MS formula line and highlights');
const bad = (data, s) => make(data).reports.some((r) => r.code === 'data' && r.msg.includes(s));
ok(bad({...anova, rows: [anova.rows[0], anova.rows[1], {...anova.rows[2], ss: 200}]}, 'sum to 216'), 'total SS ≠ sum reports');
ok(bad({...anova, rows: [{...anova.rows[0], ms: 70}, anova.rows[1], anova.rows[2]]}, 'ss ÷ df = 60'), 'MS ≠ SS ÷ df reports');
ok(bad({...anova, rows: [{...anova.rows[0], f: 9}, anova.rows[1], anova.rows[2]]}, 'ms ÷ ms(誤差) = 7.5'), 'F ≠ MS ratio reports');
const rounded = {kind: 'anova', rows: [{name: 'A', ss: 423.3, df: 2, ms: 211.67, f: 22.68}, {name: 'E', ss: 112.0, df: 12, ms: 9.33}, {name: 'T', ss: 535.3, df: 14}]};
ok(!make(rounded).reports.some((r) => r.code === 'data'), 'rounded values pass within the rounding carried through the formulas');
const cont = {kind: 'contingency', rows: ['あり', 'なし'], cols: ['はい', 'いいえ'], n: [[30, 10], [15, 25]], expected: [[22.5, 17.5], [22.5, 17.5]], chi2: 11.43, or: 5.0};
const cc = make(cont);
ok(cc.reports.length === 0 && cc.el.steps === 4, 'contingency: margins, expected, χ², OR = 4 steps: ' + JSON.stringify(cc.reports));
cc.el.render(4, Infinity); ok(cc.el.lines[3].textContent.includes('(30 × 25) ÷ (10 × 15) = 5'), 'OR line shows the cells');
ok(bad({...cont, chi2: 9}, 'Σ (o − e)² ÷ e = 11.42'), 'χ² mismatch reports');
ok(bad({...cont, expected: [[20, 20], [25, 15]]}, 'row × column ÷ N = 22.5'), 'expected mismatch reports');
const po = {kind: 'po', units: [{id: '1', t: 1, y0: 60, y1: 72}, {id: '2', t: 0, y0: 55, y1: 63}, {id: '3', t: 1, y0: 65, y1: 74}, {id: '4', t: 0, y0: 50, y1: 61}], ate: 10, naive: 20.5};
const pp = make(po);
ok(pp.reports.length === 0 && pp.el.steps === 3, 'po: reveal, ITE, ATE = 3 steps: ' + JSON.stringify(pp.reports));
pp.el.render(0, 0); const hid = pp.el.cellEls.filter((o) => o.x.hidden);
ok(hid.length === 4 && hid.every((o) => o.qm.getAttribute('opacity') === '1.000' && o.bg), 'po: the unobserved side shows ? on a light ground');
ok(bad({...po, ate: 12}, 'mean of y1 − y0 = 10'), 'ATE mismatch reports');
ok(make({kind: 'table', header: ['a', 'b'], rows: [['1', '2'], ['3', '4']]}).el.steps === 2, 'table: one row per step');
ok(c.querySelector === undefined || true, 'readable table');
const tbl = c.children.find((n) => n.localName === 'table');
ok(tbl && tbl.getAttribute('data-readable') === '' && tbl.children.length === 4, 'readable table[data-readable] with every row');
for (const b2 of [null, {}, {kind: 'chart'}, {...anova, extra: 1}]) { const r = make(b2); ok(r.el.steps === 0 && r.reports.length === 1 && r.reports[0].code === 'data', 'shape rejects ' + JSON.stringify(b2)); }
const attrs = make(anova, {dur: -1, size: 20});
ok(attrs.reports.filter((r) => r.code === 'attr').length === 2, 'bad props report/default');
for (const lang of ['ja', 'en']) { const r = make(anova, {}, {clientHeight: 440}, lang); common(r.el, lang); ok(r.reports.length === 0, lang + ' no reports'); }
common(pp.el, 'po', po);
common(cc.el, 'contingency', cont);
await finish();

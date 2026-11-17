// #47 (components 2.15): axis parts other than m-curves report values outside a range that was not written, the same way as
// m-curves 2.3.1 (tools/test-curves-range.mjs): ctx.report("range", …) with the values' range and the fix. A written range that
// cuts the drawing is taken as intended (no report), and values inside the default range are not reported.
//   m-sweep 2.2.0: yr (default [0, 10]), once per value
//   m-seq 2.1.0: yr (default [0, 1]; attribute or JSON) for dens, xr (default: the ends of xs) for marks
//   node tools/test-range-default.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-range-default-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const slide = (id, el) => `<section class="slide noconcl" id="${id}">
  <h2>${id}</h2>
  <div class="body">${el}</div>
</section>`;
const deck = (body) => `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>既定の範囲の外</title></head>
<body><div id="stage">
${body}
</div></body></html>
`;
const run = async (b, name, body) => {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deck(body));
  const out = path.join(work, name + '.out.html');
  S.build(path.join(dir, 'deck.html'), out);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const log = [];
  p.on('pageerror', (e) => log.push(e.message));
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const reports = await p.evaluate(() => {
    DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) DECK.seek(i, k, Infinity); });
    return (window.EGATARI_PARTS_SHIM ? EGATARI_PARTS_SHIM.reports() : []).map((r) => r.code + ': ' + r.msg);
  });
  await p.close();
  return { reports, log };
};
const pick = (r, tag) => r.reports.filter((x) => x.includes('[' + tag + ']'));
const show = (a) => (a.length ? ': ' + a.join(' | ') : '');
const logs = [];
const b = await S.browser.launch();
try {
  // m-sweep: u*u + c on [-3, 3] runs from 0 to 9 + c, so c = 0 stays inside the default [0, 10] and c = 4 does not
  const sw = (attrs) => `<m-sweep aria-label="形" f="u*u + c" values="[0, 4]" ${attrs} style="height:300px"></m-sweep>`;
  let r = await run(b, 'sweep-no-yr', slide('s-sweep', sw('')));
  let a = pick(r, 'sweep'); logs.push(...r.log);
  ok(a.length === 1, 'm-sweep, yr not written, the line for c = 4 goes above 10: one report (' + a.length + ')' + show(a));
  ok(a.length === 1 && /^range: \[sweep\] c = 4: \d+ of 301 points are outside yr \[0,10\] \(the default; values from 4 to 13\).*Write yr/.test(a[0]), 'it is a range report that names the value, yr, the values\' range and the fix');
  r = await run(b, 'sweep-yr', slide('s-sweep-yr', sw('yr="[0,8]"'))); logs.push(...r.log);
  ok(pick(r, 'sweep').length === 0, 'm-sweep, yr written: no report, even though both lines are cut at 8' + show(pick(r, 'sweep')));
  r = await run(b, 'sweep-inside', slide('s-sweep-in', `<m-sweep aria-label="形" f="u*u + c" values="[0, 1]" style="height:300px"></m-sweep>`)); logs.push(...r.log);
  ok(pick(r, 'sweep').length === 0, 'm-sweep, yr not written, lines inside [0, 10]: no report' + show(pick(r, 'sweep')));

  // m-seq (values 架空): dens up to 1.8 is outside the default yr [0, 1]; a mark at 5 is outside xs [0, 4]
  const SEQ = (extra) => `{"xs": [0, 1, 2, 3, 4], "steps": [{"dens": [0.1, 0.4, 0.6, 0.4, 0.1], "readout": {"n": 0}}, {"dens": [0.0, 0.3, 1.8, 0.3, 0.0], "readout": {"n": 1}, "mark": 5}]${extra}}`;
  const sq = (attrs, extra) => `<m-seq aria-label="分布" ${attrs} style="height:300px"><script type="application/json">${SEQ(extra)}</script></m-seq>`;
  r = await run(b, 'seq-no-range', slide('s-seq', sq('', ''))); logs.push(...r.log);
  a = pick(r, 'seq');
  ok(a.length === 2, 'm-seq, neither range written: one report about yr and one about xr (' + a.length + ')' + show(a));
  ok(a.some((x) => /^range: \[seq\] 1 of 10 dens values are outside yr \[0,1\] \(the default; values from 0 to 1\.8\).*Write yr/.test(x)), 'the yr report counts the dens values outside and gives their range');
  ok(a.some((x) => /^range: \[seq\] 1 of 1 marks are outside xr \[0,4\] \(the default, the ends of xs; values from 5 to 5\).*Write xr/.test(x)), 'the xr report names the marks and the ends of xs');
  r = await run(b, 'seq-attr', slide('s-seq-attr', sq('yr="[0,1]" xr="[0,4]"', ''))); logs.push(...r.log);
  ok(pick(r, 'seq').length === 0, 'm-seq, both ranges written as attributes: no report' + show(pick(r, 'seq')));
  r = await run(b, 'seq-json', slide('s-seq-json', sq('', ', "yr": [0, 1], "xr": [0, 4]'))); logs.push(...r.log);
  ok(pick(r, 'seq').length === 0, 'm-seq, both ranges written in the JSON: no report' + show(pick(r, 'seq')));
  ok(logs.length === 0, 'no page error' + show(logs));
} finally { await b.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

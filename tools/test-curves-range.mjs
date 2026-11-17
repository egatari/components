// m-curves 2.3.0–2.3.1: when xr or yr is not written (the default [0, 1]) and a line goes outside it, the part reports it once per
// series and axis with ctx.report("range", …), so Studio's check can show a warning; a written range is taken as intended (no
// report), and a line inside the default range is not reported.
//   node tools/test-curves-range.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-curves-range-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// Fictional values (架空)
const THREE = '[{"label": "A", "pts": [[0, 0.67], [1, 2.1]]}, {"label": "B", "pts": [[0, 3.2], [1, 14.0]]}, {"label": "C", "f": "0.5 * x"}]';
const slide = (id, attrs, data) => `<section class="slide noconcl" id="${id}">
  <h2>${id}</h2>
  <div class="body"><m-curves aria-label="線" ${attrs} style="height:300px"><script type="application/json">${data}</script></m-curves></div>
</section>`;
const deck = (body) => `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>m-curves の範囲</title></head>
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
const b = await S.browser.launch();
try {
  const no = await run(b, 'no-yr', slide('s-no-yr', 'xr="[0,1]"', THREE));
  const curves = no.reports.filter((r) => /\[curves\]/.test(r));
  ok(curves.length === 2, 'yr not written, two series outside [0, 1]: two reports (' + curves.length + ')' + (curves.length ? ': ' + curves.join(' | ') : ''));
  ok(curves.every((r) => /^range: \[curves\] series [01] /.test(r) && /outside yr \[0,1\]/.test(r) && /Write yr/.test(r)), 'each is a range report that names the series, yr and the fix');
  ok(curves.some((r) => /series 1 .*from 3\.2 to 14/.test(r)), 'the report gives the range of the values (3.2 to 14)');
  const yes = await run(b, 'yr', slide('s-yr', 'xr="[0,1]" yr="[0,2]"', THREE));
  ok(!yes.reports.some((r) => /\[curves\]/.test(r)), 'yr written: no report, even though B is cut at 2' + (yes.reports.length ? ': ' + yes.reports.join(' | ') : ''));
  const inside = await run(b, 'inside', slide('s-inside', '', '[{"label": "C", "f": "0.5 * x"}, {"label": "D", "pts": [[0.2, 0.1], [0.8, 0.9]]}]'));
  ok(!inside.reports.some((r) => /\[curves\]/.test(r)), 'neither range written, lines inside [0, 1]: no report');
  const xo = await run(b, 'no-xr', slide('s-no-xr', 'yr="[0,10]"', '[{"label": "E", "pts": [[0, 1], [5, 2]]}]'));
  const xr = xo.reports.filter((r) => /\[curves\]/.test(r));
  ok(xr.length === 1 && /outside xr \[0,1\]/.test(xr[0]), 'xr not written, points past x = 1: one report about xr');
  ok(no.log.concat(yes.log, inside.log, xo.log).length === 0, 'no page error');
} finally { await b.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

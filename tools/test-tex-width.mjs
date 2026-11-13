// node tools/test-tex-width.mjs: a TeX label in m-tree and m-fishbone stays inside its box, also with wide symbols
// (\Longleftrightarrow, \text{WWWWWWWW}). Before components 2.9.0 the box was sized by an estimate of 0.62 em per character,
// and such labels stuck out by 9–63 px (found by Studio's geometry check, geoLabelOutsideBox; fixtures from Studio's
// seeded run, handoff geo-seed-2026-11-13). The boxes are found by their data-part marks (components 2.8.0).
import fs from 'node:fs';
import path from 'node:path';
import { studio } from './studio.mjs';
import { LAUNCH } from './shot-helpers.mjs';

const WIDE = '\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow';
const slides = [
  ['tree', `<m-tree style="height:420px"><script type="application/json">{"nodes": [{"id": "r", "tex": "${WIDE}"}, {"id": "a", "tex": "\\\\text{WWWWWWWW}", "parent": "r"}, {"id": "b", "label": "短い", "parent": "r"}]}</script></m-tree>`],
  ['tree', `<m-tree orient="right" style="height:420px"><script type="application/json">{"nodes": [{"id": "r", "tex": "\\\\text{MMMMWWWW}"}, {"id": "a", "tex": "${WIDE}", "parent": "r"}]}</script></m-tree>`],
  ['fishbone', `<m-fishbone style="height:440px"><script type="application/json">{"effect": {"tex": "\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow"}, "nodes": [{"id": "a", "tex": "\\\\text{WWWWWWWW}"}, {"id": "a1", "label": "寝坊", "parent": "a"}, {"id": "b", "label": "交通"}, {"id": "b1", "label": "電車", "parent": "b"}]}</script></m-fishbone>`],
];
const deck = `<!DOCTYPE html>
<html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>TeX label widths</title></head><body><div id="stage">
${slides.map(([, html], i) => `<section class="slide noconcl" id="s-tex${i}"><h2>TeX ${i}</h2><div class="body">${html}</div></section>`).join('\n')}
</div></body></html>`;

const S = await studio();
const cd = S.compDir('tree'), f = path.join(cd, 'tex-width-deck.html'), out = path.join(cd, 'out', 'tex-width-deck.html');
fs.writeFileSync(f, deck);
let fails = 0;
try {
  S.build(f, out);
  const b = await S.browser.launch(LAUNCH);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 60000 });
  for (let i = 0; i < slides.length; i++) {
    const res = await p.evaluate(async (i) => {
      DECK.seek(i, DECK.slides[i]._max, Infinity);
      await document.fonts.ready;
      const part = document.querySelectorAll('section.slide')[i].querySelector('m-tree, m-fishbone'), out = [];
      for (const lab of part.querySelectorAll('[data-part="label"][data-part-of="box"]')) {
        const k = lab.querySelector('.katex') || (lab.classList && lab.classList.contains('katex') ? lab : null);
        if (!k) continue;
        const id = lab.getAttribute('data-part-id'), box = part.querySelector(`[data-part="box"][data-part-id="${CSS.escape(id)}"]`);
        if (!box) { out.push({ id, missing: true }); continue; }
        const a = k.getBoundingClientRect(), r = box.getBoundingClientRect();
        out.push({ id, left: +(r.left - a.left).toFixed(1), right: +(a.right - r.right).toFixed(1) });
      }
      return out;
    }, i);
    const name = slides[i][0];
    if (!res.length) { console.log(`FAIL ${name} slide ${i}: no TeX label with a box was found`); fails++; continue; }
    for (const x of res) {
      const bad = x.missing || x.left > 1 || x.right > 1;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${name} slide ${i} ${x.id}: ${x.missing ? 'no box' : `sticks out ${Math.max(0, x.left)} px left, ${Math.max(0, x.right)} px right`}`);
      if (bad) fails++;
    }
  }
  await b.close();
} finally { fs.rmSync(f, { force: true }); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-tex-width: ok');
process.exit(fails ? 1 : 0);

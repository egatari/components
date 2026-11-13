// node tools/test-tex-width.mjs: a TeX label in m-tree, m-fishbone, m-cycle and m-timeline stays inside its box (or frame), also with wide symbols
// (\Longleftrightarrow, \text{WWWWWWWW}). Before components 2.9.0 the box was sized by an estimate of 0.62 em per character,
// and such labels stuck out by 9–63 px (found by Studio's geometry check, geoLabelOutsideBox; fixtures from Studio's
// seeded run, handoff geo-seed-2026-11-13). m-tree and m-fishbone boxes are found by their data-part marks (components 2.8.0); m-cycle
// and m-timeline measured the formula at mount, before KaTeX's fonts had loaded, so the formula overflowed its frame and box:
// for them each formula must stay inside its frame, and (m-cycle) inside the box that contains the frame's centre.
import fs from 'node:fs';
import path from 'node:path';
import { studio } from './studio.mjs';
import { LAUNCH } from './shot-helpers.mjs';

const WIDE = '\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow';
const slides = [
  ['tree', `<m-tree style="height:420px"><script type="application/json">{"nodes": [{"id": "r", "tex": "${WIDE}"}, {"id": "a", "tex": "\\\\text{WWWWWWWW}", "parent": "r"}, {"id": "b", "label": "短い", "parent": "r"}]}</script></m-tree>`],
  ['tree', `<m-tree orient="right" style="height:420px"><script type="application/json">{"nodes": [{"id": "r", "tex": "\\\\text{MMMMWWWW}"}, {"id": "a", "tex": "${WIDE}", "parent": "r"}]}</script></m-tree>`],
  ['fishbone', `<m-fishbone style="height:440px"><script type="application/json">{"effect": {"tex": "\\\\Longleftrightarrow\\\\Longleftrightarrow\\\\Longleftrightarrow"}, "nodes": [{"id": "a", "tex": "\\\\text{WWWWWWWW}"}, {"id": "a1", "label": "寝坊", "parent": "a"}, {"id": "b", "label": "交通"}, {"id": "b1", "label": "電車", "parent": "b"}]}</script></m-fishbone>`],
  ['cycle', `<m-cycle style="height:460px"><script type="application/json">{"center": {"tex": "\\\\text{WWWW}"}, "nodes": [{"tex": "${WIDE}"}, {"label": "実行"}, {"tex": "\\\\text{MMMMWWWW}"}, {"label": "改善"}]}</script></m-cycle>`],
  ['timeline', `<m-timeline style="height:420px"><script type="application/json">{"nodes": [{"id": "a", "tex": "${WIDE}", "when": "1868"}, {"id": "b", "tex": "\\\\text{WWWWWWWW}", "when": "1889"}, {"id": "c", "label": "短い", "when": "1900"}]}</script></m-timeline>`],
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
      const part = document.querySelectorAll('section.slide')[i].querySelector('m-tree, m-fishbone, m-cycle, m-timeline'), out = [];
      if (part.localName === 'm-cycle' || part.localName === 'm-timeline') {
        // each formula inside its frame; in m-cycle also inside the smallest rect that contains the frame's centre
        const rects = [...part.querySelectorAll('rect')].map((r) => r.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        part.querySelectorAll('foreignObject').forEach((fo, n) => {
          const k = fo.querySelector('.katex'); if (!k) return;
          const a = k.getBoundingClientRect(), f = fo.getBoundingClientRect();
          out.push({ id: 'frame ' + n, left: +(f.left - a.left).toFixed(1), right: +(a.right - f.right).toFixed(1) });
          if (part.localName === 'm-cycle') {
            const cx = (f.left + f.right) / 2, cy = (f.top + f.bottom) / 2;
            const box = rects.filter((r) => r.left <= cx && cx <= r.right && r.top <= cy && cy <= r.bottom).sort((p, q) => p.width * p.height - q.width * q.height)[0];
            if (box) out.push({ id: 'box ' + n, left: +(box.left - a.left).toFixed(1), right: +(a.right - box.right).toFixed(1) });
          }
        });
        return out;
      }
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

// m-score reads no abcjs class: the demo built as is and the demo with every abcjs-* class stripped from abcSvg behave the
// same in a browser (pinned Egatari Studio): the same steps, events and note names, and the same DOM at every step (mid-step
// and final, talk and lecture preview), apart from the class attributes themselves; no console warning or error in either.
//   node tools/test-score-noclass.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-score-noclass-')));
fs.mkdirSync(work, { recursive: true });
const src = path.join(S.compDir('score'), 'demo.html');
const html = fs.readFileSync(src, 'utf8');
const strip = (svg) => svg.replace(/ class="([^"]*)"/g, (all, c) => { const k = c.split(/\s+/).filter((x) => x && !/^abcjs-/.test(x)); return k.length ? ` class="${k.join(' ')}"` : ''; });
let blocks = 0;
const bare = html.replace(/(<script type="application\/json">)([\s\S]*?)(<\/script>)/g, (all, a, j, b) => {
  const d = JSON.parse(j); d.abcSvg = strip(d.abcSvg); blocks++;
  return a + JSON.stringify(d).replace(/</g, '\\u003c') + b;
});
fs.writeFileSync(path.join(work, 'bare.html'), bare);
S.build(src, path.join(work, 'out-full.html'));
S.build(path.join(work, 'bare.html'), path.join(work, 'out-bare.html'));

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
ok(blocks === 4 && !/class=\\"[^"\\]*abcjs-/.test(bare), `the stripped demo has no abcjs-* class in its ${blocks} scores`);
const b = await S.browser.launch();
const run = async (file) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const log = [];
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') log.push(m.text()); });
  p.on('pageerror', (e) => log.push(e.message));
  await p.goto(S.browser.fileUrl(file));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await p.evaluate(() => [...document.querySelectorAll('m-score')].map((el) => {
    const clean = () => el.querySelector('svg').outerHTML.replace(/ class="[^"]*"/g, '');
    const out = { steps: el.steps, events: [], names: [...el.querySelectorAll('svg > g:last-of-type text')].map((t) => t.textContent), dom: [] };
    for (let k = 0; k <= el.steps; k++) {
      out.events.push(JSON.stringify(el.events(k)));
      el.render(k, 0.1, { mode: 'talk' }); out.dom.push(clean());
      el.render(k, Infinity, { mode: 'talk' }); out.dom.push(clean());
      el.render(k, Infinity, { mode: 'talk', preview: true }); out.dom.push(clean());
    }
    return out;
  }));
  await p.close();
  return { r, log };
};
try {
  const full = await run(path.join(work, 'out-full.html')), noc = await run(path.join(work, 'out-bare.html'));
  ok(full.r.length === 4 && noc.r.length === 4, 'four scores in each');
  full.r.forEach((f, j) => {
    const n = noc.r[j];
    ok(f.steps === n.steps, `score ${j + 1}: same steps (${f.steps})`);
    ok(JSON.stringify(f.events) === JSON.stringify(n.events), `score ${j + 1}: same events at every step`);
    ok(JSON.stringify(f.names) === JSON.stringify(n.names) && f.names.length > 0 === (j !== 1), `score ${j + 1}: same note names (${f.names.length})`);
    const diff = f.dom.findIndex((d, q) => d !== n.dom[q]);
    ok(diff < 0, `score ${j + 1}: same DOM at every step, mid-step, final and under preview, apart from classes` + (diff >= 0 ? ` (first difference at render ${diff})` : ''));
  });
  ok(full.log.length === 0 && noc.log.length === 0, 'no console warning or error' + (full.log.concat(noc.log).length ? ': ' + full.log.concat(noc.log)[0] : ''));
} finally { await b.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

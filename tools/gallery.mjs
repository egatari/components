// The gallery (gallery.html): one deck with every component's demo slides, each component introduced by a slide made from
// its README frontmatter (summary, purposes, variants). It is made from the demos, so it is never edited by hand.
//   node tools/gallery.mjs            rewrite gallery.html
//   node tools/gallery.mjs --check    only check that gallery.html is up to date (npm test)
//   node tools/gallery.mjs --build    also build it with the pinned Egatari Studio and write out/gallery/:
//                                     gallery.html (the deck: → to step) and sheet.html (every slide's mid-step and final
//                                     state on one page, from screenshots)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, componentNames } from './studio.mjs';
import { baseline, git } from './baseline.mjs';
import { frontmatter, list, purposeIds, SERIES_LABEL } from './lint.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ids = purposeIds(ROOT);
// New and changed components (index.js or demo.html) since the release before this one come first, marked on their first slide
const { base, label: next } = baseline();
const changed = new Set(base ? git('diff', '--name-only', base, '--', 'components').split('\n').filter((p) => /\/(index\.js|demo\.html)$/.test(p)).map((p) => p.split('/')[1]) : []);
const existed = (name) => !!base && git('cat-file', '-t', `${base}:components/${name}/index.js`).trim() === 'blob';
const status = (name) => (!base ? '' : !existed(name) ? '新しい' : changed.has(name) ? '変わった' : '');
const order = componentNames().map((name) => ({ name, st: status(name) }));
const rank = { '新しい': 0, '変わった': 1, '': 2 };
order.sort((a, b) => rank[a.st] - rank[b.st]);
const styles = [], scripts = [], slides = [], index = [];
for (const { name, st: mark } of order) {
  const dir = path.join(ROOT, 'components', name);
  const f = frontmatter(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'));
  const demo = fs.readFileSync(path.join(dir, 'demo.html'), 'utf8').replace(/\r\n?/g, '\n');
  const st = demo.match(/<style>([\s\S]*?)<\/style>/);
  if (st && st[1].trim()) styles.push(`/* ${f.name} */\n${st[1].trim()}`);
  // a demo may fill its data from a plain script outside its slides (m-collect, m-seq): carry it over, in its own scope
  const outside = demo.replace(/<section class="slide"[\s\S]*?<\/section>/g, '');
  for (const m of outside.matchAll(/<script>([\s\S]*?)<\/script>/g)) scripts.push(`<script>/* ${f.name} */\n(function(){\n${m[1].trim()}\n})();\n</script>`);
  const secs = demo.match(/<section class="slide"[\s\S]*?<\/section>/g) || [];
  const purposes = list(f.purposes).map((p) => (ids.get(p) || {}).ja || p).join('・');
  const variants = list(f.variants);
  index.push({ name: f.name, n: secs.length, mark });
  slides.push(`<section class="slide">
  <h2>${esc(f.name)}${mark ? `（${mark}${next ? `、${next}` : ''}）` : ''}</h2>
  <div class="body">
    <p>${esc(f.summary)}</p>
    <ul>
      <li>伝えたいこと：${esc(purposes)}</li>
      <li>見せ方：${variants.length ? esc(variants.join('・')) : '1 種類'}</li>
      <li>系列：${esc(SERIES_LABEL[f.series] || f.series)}　見本のスライド：${secs.length} 枚</li>
    </ul>
  </div>
</section>`, ...secs.map((s) => s.trim()));
}
const total = index.reduce((a, x) => a + x.n + 1, 0) + 1;
const html = `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>部品の一覧（見本）</title>
<!-- tools/gallery.mjs が各部品の demo.html と README.md から作る。手で直さない。数値・会社はすべて架空か公の事実 -->
<style>
${styles.join('\n')}
</style>
</head>
<body>
${scripts.join('\n')}
<div id="stage">

<section class="slide">
  <h2>部品の一覧（${index.length} 個、${total} 枚）</h2>
  <div class="body">
    <p>部品ごとに、説明の 1 枚と見本のスライドが続きます。→ で段階を進めます。</p>
    <p>${index.map((x) => esc(x.name) + (x.mark ? `（${x.mark}）` : '')).join('　')}</p>
  </div>
</section>

${slides.join('\n\n')}

</div>
</body>
</html>
`;
const OUT = path.join(ROOT, 'gallery.html');
const args = process.argv.slice(2);
if (args.includes('--check')) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === html;
  console.log(same ? `gallery.html is up to date (${index.length} components)` : 'gallery.html is out of date: run node tools/gallery.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, html);
console.log(`gallery.html: ${index.length} components, ${total} slides`);

if (args.includes('--build')) {
  const { studio } = await import('./studio.mjs');
  const S = await studio();
  const out = path.join(ROOT, 'out', 'gallery');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
  // build from inside the Studio copy, where every component is overlaid
  const src = path.join(S.dir, 'gallery-src.html');
  fs.writeFileSync(src, html);
  S.build(src, path.join(out, 'gallery.html'));
  const b = await S.browser.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto(S.browser.fileUrl(path.join(out, 'gallery.html')));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  const plan = await p.evaluate(() => { const tl = DECK.timeline(); return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length, title: (s.querySelector('h2') || {}).textContent || '', anim: tl.filter((x) => x.i === i).map((x) => x.anim) })); });
  const rows = [];
  for (const s of plan) {
    const frames = [];
    const shoot = async (k, t, label) => {
      await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [s.i, k, t]);
      await p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const f = `s${String(s.i).padStart(3, '0')}_k${k}_${label}.png`;
      await p.screenshot({ path: path.join(out, 'shots', f) });
      frames.push({ f, label: `段階 ${k}${label === 'end' ? '（最後）' : '（途中）'}` });
    };
    if (s.comps) {
      // the middle of the busiest step, then the final state
      let km = 1; for (let k = 1; k <= s.max; k++) if ((s.anim[k] || 0) > (s.anim[km] || 0)) km = k;
      if (s.max >= 1 && s.anim[km] > 0) await shoot(km, s.anim[km] * 0.5, 'mid');
    }
    await shoot(s.max, null, 'end');
    rows.push(`<section><h2>${s.i + 1}. ${esc(s.title)}</h2><div class="row">${frames.map((x) => `<figure><img src="shots/${x.f}" loading="lazy" alt="${esc(s.title)} ${x.label}"><figcaption>${x.label}</figcaption></figure>`).join('')}</div></section>`);
  }
  await b.close();
  fs.rmSync(src);
  fs.writeFileSync(path.join(out, 'sheet.html'), `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>部品の一覧（画像）</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d9dde5}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--fg:#e8ebf1;--muted:#a3abba;--line:#323844}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:22px;margin:0 0 4px}p{color:var(--muted);margin:0 0 24px}
section{border-top:1px solid var(--line);padding:16px 0}h2{font-size:17px;margin:0 0 10px}
.row{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;flex:1 1 420px;max-width:640px}
img{width:100%;height:auto;border:1px solid var(--line);border-radius:6px;display:block}figcaption{font-size:13px;color:var(--muted);margin-top:4px}
</style></head><body>
<h1>部品の一覧（画像）</h1>
<p>gallery.html の各スライドの、いちばん動く段階の途中と最後の状態。動きは gallery.html を開いて → で見る。${index.length} 個の部品、${plan.length} 枚。</p>
${rows.join('\n')}
</body></html>
`);
  console.log(`${path.join(out, 'gallery.html')}\n${path.join(out, 'sheet.html')}${errs.length ? '\nconsole: ' + errs.slice(0, 5).join(' | ') : ''}`);
}

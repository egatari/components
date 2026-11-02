// m-cards in a browser (pinned Studio, the part through the registry shim), beyond the demo:
//   1. accessibility: the svg is role=list, each card role=listitem with an aria-label of badge, title and text; icons and
//      arrows are aria-hidden
//   2. a text that does not fit is cut with … (the last line) and reported once as layout, naming the card; the rest fit
//   3. an unknown icon draws the dashed placeholder and is reported once as data with the closest names; a bad hilite is
//      reported as attr
//   4. grid with arrows: 4 cards are 2×2, the arrows run 1→2 (right), 2→3 (from under 2, along the gap, down into 3), 3→4 (right); 5 cards are 3×2
//   5. numbers stay with their counters when wrapping (「5 分」 is never split)
//   node tools/test-cards.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { c2Bundle } from './parts.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-cards-')));
fs.mkdirSync(path.join(work, 'components', 'cards'), { recursive: true });
fs.writeFileSync(path.join(work, 'components', 'cards', 'index.js'), c2Bundle(ROOT, 'cards'));

const cards = (attrs, data) => `<m-cards ${attrs}><script type="application/json">${JSON.stringify(data)}</script></m-cards>`;
const LONG = '店に来た人の困りごとを 5 分で聞き取り、聞いたことを 1 枚の紙にまとめて、週に 1 回、担当の 3 人で話し合ってから、1 週間以内に答えを返す。答えられないときは、その理由と次の連絡の日を伝える';
const SLIDES = [
  cards('nums style="height:300px"', { cards: [{ icon: 'user', title: '聞く', text: '相手の困りごとを聞く' }, { icon: 'usr', title: '考える', text: LONG }, { title: '試す', text: '店に来た人の困りごとを 5 分で聞き取る' }] }),
  cards('layout="grid" arrows hilite="9" style="height:420px"', { cards: [{ n: 'A', title: '一' }, { n: 'B', title: '二' }, { n: 'C', title: '三' }, { n: 'D', title: '四' }] }),
  cards('layout="grid" style="height:420px"', { cards: [1, 2, 3, 4, 5].map((i) => ({ title: 'カード ' + i })) }),
];
const src = path.join(work, 'deck.html'), out = path.join(work, 'deck.out.html');
fs.writeFileSync(src, `<!DOCTYPE html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>m-cards</title></head><body><div id="stage">
${SLIDES.map((s, i) => `<section class="slide noconcl"><h2>case ${i}</h2><div class="body">${s}</div></section>`).join('\n')}
</div></body></html>`);
S.build(src, out);

const b = await S.browser.launch();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('m-cards')], res = [];
    els.forEach((el, i) => {
      DECK.seek(i, el.steps, Infinity);
      const svg = el.querySelector('svg'), items = [...svg.querySelectorAll('[role=listitem]')];
      const box = (g) => { const bb = g.querySelector('rect').getBBox(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; };
      res.push({ role: svg.getAttribute('role'), labels: items.map((g) => g.getAttribute('aria-label')), boxes: items.map(box),
        texts: items.map((g) => [...g.querySelectorAll('text')].map((t) => t.textContent)),
        iconsHidden: [...svg.querySelectorAll('g.icon')].every((g) => g.getAttribute('aria-hidden') === 'true'),
        missing: [...svg.querySelectorAll('[data-missing]')].map((g) => g.getAttribute('data-missing')),
        arrows: [...svg.querySelectorAll('path[aria-hidden=true]')].filter((p) => !p.closest('g.icon')).map((p) => p.getAttribute('d')) });
    });
    return { res, reports: EGATARI_PARTS_SHIM.reports().map((x) => x.code + ': ' + x.msg) };
  });
  const [a, g, g5] = r.res;
  // 1
  ok(a.role === 'list' && a.labels.length === 3 && a.labels[0] === '1 聞く 相手の困りごとを聞く' && a.iconsHidden && g.arrows.length === 3,
    `role list, listitems with labels (${JSON.stringify(a.labels[0])}), icons and arrows aria-hidden`);
  // 2
  const lines1 = a.texts[1].slice(2);
  const lay = r.reports.filter((x) => x.startsWith('layout:'));
  ok(lines1.at(-1).endsWith('…') && lay.length === 1 && /card 2 does not fit/.test(lay[0]) && !a.texts[0].some((s) => s.endsWith('…')), `card 2's long text is cut with … (${lines1.length} lines) and reported once: ${lay[0]}`);
  // 3
  const dat = r.reports.filter((x) => x.startsWith('data:'));
  ok(JSON.stringify(a.missing) === '["usr"]' && dat.length === 1 && /^data: \[cards\] unknown icon 'usr' \(did you mean .*\buser\b.*\?\)$/.test(dat[0]), `unknown icon: placeholder and ${JSON.stringify(dat)}`);
  const att = r.reports.filter((x) => x.startsWith('attr:'));
  ok(att.length === 1 && /hilite="9"/.test(att[0]), `bad hilite reported: ${att[0]}`);
  // 4
  const B = g.boxes, near = (p, q) => Math.abs(p - q) < 1;
  ok(near(B[0].y, B[1].y) && near(B[2].y, B[3].y) && B[2].y > B[0].y + B[0].h && near(B[0].x, B[2].x) && B[1].x > B[0].x + B[0].w, 'grid of 4: 2×2');
  const tip = (d) => d.split(/[ML]/).filter(Boolean).map((p) => p.split(',').map(Number));
  // the row-change arrow (2→3) is one path of M, V, H and L: from under the last card of the first row, along the gap, down into the first card of the second row
  const route = (d) => { const out = []; let x = 0, y = 0; for (const m of d.matchAll(/([MLHV])([^MLHV]*)/g)){ const v = m[2].split(/[ ,]+/).filter(Boolean).map(Number); if (m[1] === 'H') x = v[0]; else if (m[1] === 'V') y = v[0]; else { x = v[0]; y = v[1]; } out.push([x, y]); } return out; };
  const [r1, , r3] = g.arrows.map(tip), d2 = route(g.arrows[1]), d2tip = d2.reduce((m, q) => q[1] > m[1] ? q : m), inX = (q, b) => q[0] > b.x && q[0] < b.x + b.w;
  ok(r1[1][0] > r1[0][0] && r3[1][0] > r3[0][0] && r1[1][0] > B[0].x + B[0].w && r1[1][0] < B[1].x &&
    inX(d2[0], B[1]) && inX(d2tip, B[2]) && d2.every((q) => q[1] > B[1].y + B[1].h && q[1] < B[2].y),
    'arrows in Z order: 1→2 right in the gap, 2→3 from under card 2 along the gap down into card 3, 3→4 right');
  const B5 = g5.boxes;
  ok(B5.length === 5 && near(B5[0].y, B5[2].y) && near(B5[3].y, B5[4].y) && B5[3].y > B5[0].y, 'grid of 5: 3×2');
  // 5
  const all = a.texts.flat();
  const split = all.filter((s) => /\d$/.test(s) && !/^\d$/.test(s));   // (a badge is one digit)
  ok(!split.length && all.some((s) => s.includes('5 分')), `numbers stay with their counters: ${JSON.stringify(a.texts[2].slice(1))}` + (split.length ? ' / split: ' + JSON.stringify(split) : ''));
  ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await b.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\ntest-cards: ok');
process.exit(fails ? 1 : 0);

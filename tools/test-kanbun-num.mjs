// m-kanbun の読む順の番号（.kb-num）の試験：二桁（10 以上）の番号が箱からはみ出して、字の箱（.kb-ch）に重ならないこと（誤差 1px）。
// 一桁の番号は従来のまま（箱の位置・幅・字の大きさ。画素の一致は PR に記録）。固定した版の Egatari Studio（tools/studio.json）で組んで、ブラウザで確かめる
//   node tools/test-kanbun-num.mjs [作業フォルダ]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-kanbun-num-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// 20 字（返り点なし。読む順は 1 から 20）と、9 字（一桁だけ）。size="56" は箱の幅が変わる別の大きさ
const T20 = ['天地玄黄宇', '宙洪荒日月', '盈昃辰宿列', '張寒来暑往'].join('\n');
const T9 = ['天地玄黄', '宇宙洪荒日'].join('\n');
const deck = path.join(work, 'deck.html');
fs.writeFileSync(deck, `<!DOCTYPE html>
<html lang="ja" data-theme="kokugo">
<head><meta charset="utf-8"><title>m-kanbun の番号</title></head>
<body><div id="stage">
<section class="slide noconcl"><h2>20 字</h2><div class="body"><m-kanbun style="height:430px">${T20}</m-kanbun></div></section>
<section class="slide noconcl"><h2>20 字（size 56）</h2><div class="body"><m-kanbun size="56" style="height:430px">${T20}</m-kanbun></div></section>
<section class="slide noconcl"><h2>9 字</h2><div class="body"><m-kanbun style="height:430px">${T9}</m-kanbun></div></section>
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
S.build(deck, out);
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  ok(errors.length === 0, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
  const r = await page.evaluate(() => DECK.slides.map((s, i) => {
    DECK.seek(i, s._max, Infinity);
    const c = s._comps[0], g = c.geom, rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const chars = [...c.querySelectorAll('.kb-ch')].map(rect);
    const nums = [...c.querySelectorAll('.kb-num')].map((e) => {
      const rg = document.createRange(); rg.selectNodeContents(e);
      const cs = getComputedStyle(e);
      return { n: e.textContent, box: rect(e), text: rect2(rg), fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight), align: cs.textAlign };
    });
    function rect2(rg) { const b = rg.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }
    return { S: g.S, L: g.L, chars, nums };
  }));
  const hit = (a, b, tol) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tol;
  r.slice(0, 2).forEach((s, i) => {
    ok(s.nums.length === 20 && s.nums.map((x) => x.n).join() === Array.from({ length: 20 }, (_, j) => j + 1).join(), `slide ${i}: 20 numbers 1..20`);
    const bad = [];
    for (const n of s.nums) for (const [j, ch] of s.chars.entries()) if (hit(n.text, ch, 1)) bad.push(`${n.n} over char ${j + 1}`);
    ok(bad.length === 0, `slide ${i}: no number overlaps a character box (1px tolerance)` + (bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''));
    const wide = s.nums.filter((n) => n.text.r - n.text.l > n.box.r - n.box.l + 0.5).map((n) => n.n);
    ok(wide.length === 0, `slide ${i}: every number's text fits its box` + (wide.length ? ': ' + wide.join(',') : ''));
    const two = s.nums.filter((n) => n.n.length > 1);
    ok(two.every((n) => n.box.r - n.box.l === s.L), `slide ${i}: two-digit boxes keep the width L (${s.L}px)`);
  });
  // 一桁の番号は変えない：箱は字の左（幅 L）、字の大きさと行の高さは max(24, round(S*0.4)) px、中央ぞろえ
  const geometry = (s, nums) => nums.every((n) => Math.abs(n.fs - Math.max(24, Math.round(s.S * 0.4))) < 1e-6 && n.lh === Math.max(24, Math.round(s.S * 0.4)) && n.align === 'center' && n.box.r - n.box.l === s.L);
  r.forEach((s, i) => ok(geometry(s, s.nums.filter((n) => n.n.length === 1)), `slide ${i}: one-digit numbers keep font-size, line-height, width and alignment`));
  // 番号の箱は、読む字の箱のすぐ左に幅 L で置く（返り点のない見本なので、n 番目の番号は n 番目の字）。9 字には一桁しかない
  r.forEach((s, i) => ok(s.nums.every((n, j) => Math.abs(n.box.r - s.chars[j].l) < 0.01 && n.box.r - n.box.l === s.L), `slide ${i}: each number box sits just left of its character, L wide`));
  ok(r[2].nums.length === 9 && r[2].nums.every((n) => n.n.length === 1), 'slide 2: nine one-digit numbers');
} finally { await browser.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

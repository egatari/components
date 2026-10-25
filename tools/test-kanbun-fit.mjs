// m-kanbun を要素の大きさに収める試験（issue #3）：要素の高さ・幅に収まらないとき、字の大きさと字の送りを一緒に下げて収める
// （下限は size=42。振り仮名・送り仮名・返り点は 24px のまま）。下限でも収まらなければ console.warn で知らせる。
// 固定した版の Egatari Studio（tools/studio.json）で組んで、ブラウザで確かめる
//   node tools/test-kanbun-fit.mjs [作業フォルダ]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-kanbun-fit-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const slide = (title, attrs, text) => `<section class="slide noconcl"><h2>${title}</h2><div class="body"><m-kanbun ${attrs}>\n${text}\n</m-kanbun></div></section>`;
const deck = (slides) => `<!DOCTYPE html>
<html lang="ja" data-theme="kokugo">
<head><meta charset="utf-8"><title>m-kanbun を要素に収める</title></head>
<body><div id="stage">
${slides.join('\n')}
</div></body></html>
`;
// 収まる：五言 2 句（高さ 260px）、再読文字と振り仮名（高さ 300px）、4 句を幅 700px に（幅で縮む）、size のままで収まるもの（変えない）
const FIT = [
  ['五言 2 句、高さ 260px', 'style="height:260px"', '春眠不{=ず}レ覚(エ)レ暁(ヲ)\n処処聞(ク)[二]啼鳥(ヲ)[一]', { shrunk: true }],
  ['再読文字と置き字、高さ 300px', 'style="height:300px"', '未(ダ|ず)[レ]知(ラ)[レ]生(ヲ)、\n焉{いづく}(ンゾ)知(ラン)[レ]死(ヲ)\n学(ビテ)而{-}時(ニ)習(フ)[レ]之(ヲ)', { shrunk: true }],
  ['4 句、幅 700px', 'style="height:430px;width:700px"', '春眠不{=ず}レ覚(エ)レ暁(ヲ)\n処処聞(ク)[二]啼鳥(ヲ)[一]\n夜来風雨(ノ)声\n花落(ツルコト)知(ル)多少', { shrunk: true }],
  ['size のまま', 'style="height:430px"', '春眠不{=ず}レ覚(エ)レ暁(ヲ)\n処処聞(ク)[二]啼鳥(ヲ)[一]', { size: 60 }],
];
// 収まらない：1 行 9 字（高さ 260px）。下限の size=42 で止まり、足りない px を知らせる
const NOFIT = [['1 行 9 字、高さ 260px', 'style="height:260px"', '夜来風雨声、\n花落(ツ)ルコト知(ル)多少(ゾ)。']];

const browser = await S.browser.launch();
async function run(name, slides) {
  const src = path.join(work, name + '.html'), out = path.join(work, name + '.out.html');
  fs.writeFileSync(src, deck(slides.map(([t, a, x]) => slide(t, a, x))));
  S.build(src, out);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const warns = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const r = [];
  for (let i = 0; i < slides.length; i++) {
    await page.evaluate((i) => DECK.seek(i, DECK.slides[i]._max, Infinity), i);
    await page.screenshot({ path: path.join(work, `${name}_s${i}.png`) });
    r.push(await page.evaluate((i) => {
      const sl = DECK.slides[i], c = sl._comps[0], E = c.getBoundingClientRect(), R = sl.getBoundingClientRect();
      // 字（漢字・振り仮名・送り仮名・返り点・句読点・番号）の枠。番号は data-annot（小さくてよい注記）なので大きさは見ない
      const spans = [...c.querySelectorAll('.kb-ch, .kb-ruby, .kb-ok, .kb-kaeri, .kb-punct, .kb-num')].map((e) => {
        const rg = document.createRange(); rg.selectNodeContents(e); const b = rg.getBoundingClientRect();
        return { s: e.className + ' ' + e.textContent, annot: e.hasAttribute('data-annot'), fs: parseFloat(getComputedStyle(e).fontSize), l: b.left, t: b.top, r: b.right, b: b.bottom };
      });
      return { S: c.geom.S, E: { l: E.left, t: E.top, r: E.right, b: E.bottom }, R: { l: R.left, t: R.top, r: R.right, b: R.bottom }, spans };
    }, i));
  }
  await page.close();
  return { r, warns, errors };
}

try {
  const A = await run('fit', FIT);
  ok(A.errors.length === 0, 'fit: no console error' + (A.errors.length ? ': ' + A.errors[0] : ''));
  ok(A.warns.length === 0, 'fit: no warning' + (A.warns.length ? ': ' + A.warns[0] : ''));
  A.r.forEach((s, i) => {
    const [title, , , want] = FIT[i];
    if (want.size) ok(s.S === want.size, `${title}: size stays ${want.size} (got ${s.S})`);
    if (want.shrunk) ok(s.S < 60 && s.S >= 42, `${title}: size reduced to ${s.S} (42 ≤ size < 60)`);
    const out = s.spans.filter((x) => x.l < s.R.l || x.r > s.R.r || x.t < s.R.t || x.b > s.R.b).map((x) => x.s);
    ok(out.length === 0, `${title}: every character inside the slide` + (out.length ? ': ' + out.slice(0, 4).join(', ') : ''));
    // 要素の箱：下は 6px（最後の仮名の字の枠の余白、FIT_SLACK）まで、右と左ははみ出さない
    const outE = s.spans.filter((x) => !x.annot && (x.b > s.E.b + 6 || x.r > s.E.r + 0.5 || x.l < s.E.l - 0.5)).map((x) => `${x.s} (${(x.b - s.E.b).toFixed(1)}px below)`);
    ok(outE.length === 0, `${title}: inside the element (${(s.E.r - s.E.l).toFixed(0)}×${(s.E.b - s.E.t).toFixed(0)})` + (outE.length ? ': ' + outE.slice(0, 4).join(', ') : ''));
    const small = s.spans.filter((x) => !x.annot && x.fs < 24).map((x) => `${x.s} ${x.fs}px`);
    ok(small.length === 0, `${title}: kanji, kana and kaeriten ≥ 24px` + (small.length ? ': ' + small.slice(0, 4).join(', ') : ''));
    const hit = [];
    for (let a = 0; a < s.spans.length; a++) for (let b = a + 1; b < s.spans.length; b++) {
      const p = s.spans[a], q = s.spans[b];
      if (Math.min(p.r, q.r) - Math.max(p.l, q.l) > 2 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 2) hit.push(`${p.s} / ${q.s}`);
    }
    ok(hit.length === 0, `${title}: no two characters overlap (2px tolerance)` + (hit.length ? ': ' + hit.slice(0, 4).join(', ') : ''));
  });
  const B = await run('nofit', NOFIT);
  ok(B.errors.length === 0, 'nofit: no console error' + (B.errors.length ? ': ' + B.errors[0] : ''));
  ok(B.r[0].S === 42, `nofit: stops at size 42 (got ${B.r[0].S})`);
  ok(B.warns.length === 1 && /size=42/.test(B.warns[0]) && /\d+px 足りない/.test(B.warns[0]), 'nofit: one warning with the missing px' + (B.warns.length ? ': ' + B.warns[0] : ''));
} finally { await browser.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

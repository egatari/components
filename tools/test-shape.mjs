// 部品のデータの形（static shape）の試験：どの部品にも形の違うデータを渡したデッキを、固定した版の Egatari Studio（tools/studio.json）で組んで開き、
// 例外を出さず、その場に札（.m-error）を出し、DECK.componentErrors に（mount の前の）data の段で載ること。描くときの例外も同じに扱われること。
// 品質チェック・修正依頼の言葉（kit/check-messages.mjs）は Studio の試験（tools/test-shape.mjs）が見る
//   node tools/test-shape.mjs [作業フォルダ]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, componentNames } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-shape-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// 部品ごとの形の違うデータ（新しい部品はここに 1 行足す。m-sweep はデータを属性 values で受け取る）
const WRONG = {
  'm-bars': '<script type="application/json">{"group": [{"label": "1 年目", "value": 1}]}</script>',
  'm-codetree': '<script type="application/json">{"codes": [{"run": 2, "white": "0111"}], "bits": "0111"}</script>',
  'm-compare': '<script type="application/json">{"sides": [{"label": "A 案"}], "rows": [{"values": ["3 日"]}]}</script>',
  'm-collect': '<script type="application/json">{"chips": [{"label": "表"}], "targets": [{"label": "表の数"}]}</script>',
  'm-curves': '<script type="application/json">{"xr": [0, 10], "series": [{"label": "需要", "fn": "10 - u"}]}</script>',
  'm-fishbone': '<script type="application/json">{"nodes": [{"id": "p", "label": "人"}]}</script>',
  'm-flow': '<script type="application/json">{"nodes": [{"id": "a", "label": "観測"}]}</script>',
  'm-kpi': '<script type="application/json">{"cards": [{"label": "時間", "value": "62"}]}</script>',
  'm-market': '<script type="application/json">[{"key": "TAM", "value": 3000}]</script>',
  'm-quad': '<script type="application/json">{"items": [{"label": "A 社", "x": "0.2", "y": 0.3}]}</script>',
  'm-tree': '<script type="application/json">{"nodes": [{"label": "根"}]}</script>',
  'm-seq': '<script type="application/json">{"xs": [0, 1, 2], "steps": [{"density": [1, 2, 1]}]}</script>',
  'm-gendai': '<script type="application/json">{"paragraphs": ["本文"]}</script>',
  'm-kanbun': '<script type="application/json">["学而時習之"]</script>',
  'm-kobun': '<script type="application/json">{"text": "春はあけぼの"}</script>',
  'm-venn': '<script type="application/json">{"sets": [{"label": "哺乳類"}, {"label": "海の生き物"}], "regions": {"BA": ["クジラ"]}}</script>',
  'm-menu': '<script type="application/json">[{"href": "#s-x", "label": "目次"}]</script>',
  'm-scatter': '<script type="application/json">{"series": [{"label": "晴れ", "data": [[24, 210], [31, 560]]}]}</script>',
  'm-pie': '<script type="application/json">{"slices": [{"label": "食費", "value": "26%"}]}</script>',
  'm-timeline': '<script type="application/json">{"nodes": [{"label": "明治維新", "when": true}]}</script>',
  'm-cycle': '<script type="application/json">{"stages": [{"label": "計画"}, {"label": "実行"}]}</script>',
};
const comps = componentNames().map((n) => 'm-' + n);
ok(comps.every((t) => WRONG[t] || t === 'm-sweep'), 'every component has a wrong-shape example in this test');
// 部品は Studio の部品庫から読ませる（作業フォルダの components/ には置かない）
const deckDir = path.join(work, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
const slides = comps.map((t, j) => `<section class="slide noconcl" id="s-w${j}">
  <h2>${t}</h2>
  <div class="body">${t === 'm-sweep' ? '<m-sweep f="u*u + c" values="[1]" style="height:300px"></m-sweep>' : `<${t} aria-label="${t} の図" style="height:300px">${WRONG[t]}</${t}>`}</div>
</section>`).join('\n') + `
<section class="slide noconcl" id="s-semantic">
  <h2>形は合うが中身が合わない</h2>
  <div class="body"><m-compare id="w-cmp-values" aria-label="値の数が列と違う" style="height:200px"><script type="application/json">{"sides": [{"label": "A 案"}, {"label": "B 案"}], "rows": [{"label": "日数", "values": ["3 日"]}]}</script></m-compare>
  <m-compare id="w-cmp-better" aria-label="better が列の外" style="height:200px"><script type="application/json">{"sides": [{"label": "A 案"}, {"label": "B 案"}], "rows": [{"label": "日数", "values": ["3 日", "5 日"], "better": 2}]}</script></m-compare>
  <m-venn id="w-venn-c" aria-label="集合 2 つで C の領域" style="height:200px"><script type="application/json">{"sets": [{"label": "哺乳類"}, {"label": "海の生き物"}], "regions": {"A": ["ライオン"], "AC": ["クジラ"]}}</script></m-venn></div>
</section>
<section class="slide noconcl" id="s-throw">
  <h2>描くときの例外</h2>
  <div class="body"><m-curves aria-label="式が書けていない線" style="height:300px"><script type="application/json">[{"label": "a", "f": "10 - ("}]</script></m-curves></div>
</section>
<section class="slide noconcl" id="s-expr">
  <h2>算術の外の式</h2>
  <div class="body"><m-sweep f="(globalThis.__ran=1,u)" values="[0,1]" style="height:200px"></m-sweep>
  <m-sweep f="u.constructor.constructor(u)()" values="[0,1]" style="height:200px"></m-sweep>
  <m-curves aria-label="式がコード" style="height:200px"><script type="application/json">[{"label": "a", "f": "top.location"}]</script></m-curves></div>
</section>`;
fs.writeFileSync(path.join(deckDir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>形の違うデータ</title></head>
<body><div id="stage">
${slides}
</div></body></html>
`);
const out = path.join(work, 'deck.out.html');
let built = true;
try { S.build(path.join(deckDir, 'deck.html'), out); } catch (e) { built = false; ok(false, 'build the wrong-shape deck: ' + String(e.stderr || e.message)); }
if (built) ok(true, 'build the wrong-shape deck');
const browser = await S.browser.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(S.browser.fileUrl(out));
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const seen = [];
    DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) { DECK.seek(i, k, 0.3); DECK.seek(i, k, Infinity); } });
    DECK.slides.forEach((s) => s._comps.forEach((c) => seen.push({ tag: c.tagName.toLowerCase(), box: !!c.querySelector('.m-error'), text: (c.querySelector('.m-error') || {}).textContent || '' })));
    const semantic = ['w-cmp-values', 'w-cmp-better', 'w-venn-c'].map((id) => !!document.querySelector('#' + id + ' .m-error'));
    return { semantic, seen, errs: DECK.componentErrors.map((x) => JSON.parse(JSON.stringify(x))), max: DECK.slides.map((s) => s._max) };
  });
  ok(errors.length === 0, 'no exception or console error while opening and seeking' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.max.every((m) => Number.isFinite(m)), 'every slide has a finite number of steps');
  for (const t of comps) {
    const s = r.seen.find((x) => x.tag === t), e = r.errs.find((x) => x.tag === t);
    ok(s && s.box && s.text.includes('<' + t + '>'), `${t}: shows the inline placeholder`);
    ok(e && e.phase === 'data', `${t}: reported in DECK.componentErrors before mount (${e && e.kind}${e && e.why ? ' ' + e.why : ''})`);
  }
  // 形（static shape）では書けない中身の決まり：mount で例外を投げ、札を出す（値を黙って落とさない）
  const sem = r.errs.filter((x) => x.slide === r.max.length - 3);
  const semOk = (tag, re) => sem.some((x) => x.tag === tag && x.phase === 'mount' && x.kind === 'exception' && re.test(x.msg));
  ok(r.semantic.every(Boolean) && sem.length === 3, 'content that fits the shape but not the rule: placeholder for each (' + sem.map((x) => x.msg).join(' | ') + ')');
  ok(semOk('m-compare', /rows\[0\]\.values has 1 value/), 'm-compare: values not one per side is refused at mount');
  ok(semOk('m-compare', /rows\[0\]\.better is 2/), 'm-compare: better outside the sides is refused at mount');
  ok(semOk('m-venn', /regions AC need a third set/), 'm-venn: a region with C in a two-set diagram is refused at mount');
  const th = r.errs.find((x) => x.phase === 'mount' && x.slide === r.max.length - 2);
  ok(th && th.tag === 'm-curves' && th.kind === 'exception' && /SyntaxError/.test(th.msg) && r.seen.filter((x) => x.tag === 'm-curves').every((x) => x.box), 'mount exception: placeholder, recorded with the message only');
  // 算術の外の式（Egatari spec §6）：コードとして動かさず、札を出し、mount の段の SyntaxError として載る
  const ex = r.errs.filter((x) => x.slide === r.max.length - 1);
  ok(ex.length === 3 && ex.every((x) => x.phase === 'mount' && x.kind === 'exception' && /^SyntaxError: f = |^SyntaxError: \[0\]\.f = /.test(x.msg)),
    'expressions outside arithmetic: refused at mount with a SyntaxError naming the expression' + (ex.length ? ' (' + ex.map((x) => x.msg).join(' | ') + ')' : ''));
  ok(!(await page.evaluate(() => globalThis.__ran)), 'expressions outside arithmetic: nothing ran');
} finally { await browser.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

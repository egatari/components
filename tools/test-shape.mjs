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
  'm-map-japan': '<script type="application/json">{"regions": [{"code": "13", "tone": "emph"}]}</script>',
  'm-map-world': '<script type="application/json">{"regions": [{"code": "JPN", "tone": "emph"}]}</script>',
  'm-timer': '<script type="application/json">{"phases": [{"title": "付箋に書く", "sec": "3分"}]}</script>',
  'm-predict': '<script type="application/json">{"choices": ["重い球", "軽い球"], "answer": 0}</script>',
  'm-hist': '<script type="application/json">{"value": [23, 31, 27], "bins": {"start": 15, "width": 5}}</script>',
  'm-boxplot': '<script type="application/json">{"groups": [{"label": "1 組", "data": [3, 5, 6, 7]}]}</script>',
  'm-numberline': '<script type="application/json">{"lines": [{"from": 0, "to": 10}], "marks": [{"value": 3}]}</script>',
  'm-keyboard': '<script type="application/json">{"range": "C4-C6", "steps": [{"notes": ["C4", "E4", "G4"]}]}</script>',
  'm-score': '<script type="application/json">{"abcSvg": "<svg></svg>", "abcMap": {"tempo": 96}}</script>',
  'm-tape': '<script type="application/json">{"rows": [{"label": "みかん", "segments": [{"v": 8}]}]}</script>',
  'm-syntax': '<script type="application/json">{"sentences": ["[S We] [V run]."]}</script>',
  'm-heatmap': '<script type="application/json">{"rows": ["ねこ", "いぬ"], "cols": ["ねこ", "いぬ"], "data": [[45, 5], [6, 44]]}</script>',
  // データを属性だけで受け取る部品は、要素ごと書く（digits は整数の JSON）
  'm-hissan': '<m-hissan aria-label="m-hissan の図" expr="7÷3" digits="2けた" style="height:300px"></m-hissan>',
  'm-kakijun': '<m-kakijun aria-label="m-kakijun の図" text="あさ" size="大きめ" style="height:300px"></m-kakijun>',
};
const comps = componentNames().map((n) => 'm-' + n);
ok(comps.every((t) => WRONG[t] || t === 'm-sweep'), 'every component has a wrong-shape example in this test');
// 部品は Studio の部品庫から読ませる（作業フォルダの components/ には置かない）
const deckDir = path.join(work, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
const slides = comps.map((t, j) => `<section class="slide noconcl" id="s-w${j}">
  <h2>${t}</h2>
  <div class="body">${t === 'm-sweep' ? '<m-sweep f="u*u + c" values="[1]" style="height:300px"></m-sweep>' : WRONG[t].startsWith('<' + t + ' ') ? WRONG[t] : `<${t} aria-label="${t} の図" style="height:300px">${WRONG[t]}</${t}>`}</div>
</section>`).join('\n') + `
<section class="slide noconcl" id="s-hissan">
  <h2>計算にならない式</h2>
  <div class="body"><m-hissan id="w-hissan-expr" aria-label="式が途中で終わる" expr="12+" style="height:200px"></m-hissan>
  <m-hissan id="w-hissan-neg" aria-label="答えが負になるひき算" expr="3-5" style="height:200px"></m-hissan></div>
</section>
<section class="slide noconcl" id="s-accept">
  <h2>形に合う新しい欄</h2>
  <div class="body"><m-curves id="ok-curves" aria-label="段階をそろえた線" xr="[0,10]" yr="[0,12]" style="height:300px"><script type="application/json">[{"label": "需要", "f": "10 - x", "tone": "term", "step": 1, "labelAt": 2, "anchor": "below"}, {"label": "供給", "f": "2 + x", "tone": "accent2", "step": 1, "anchor": "left"}, {"label": "均衡", "pts": [[4, 0], [4, 6]], "step": 2, "anchor": "above", "dash": true}, {"label": "古い書き方", "f": "6", "color": "muted", "at": 8, "anchor": "end"}]</script></m-curves></div>
</section>
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
    DECK.slides.forEach((s) => s._comps.forEach((c) => seen.push({ tag: c.tagName.toLowerCase(), id: c.id, box: !!c.querySelector('.m-error'), text: (c.querySelector('.m-error') || {}).textContent || '' })));
    const semantic = ['w-cmp-values', 'w-cmp-better', 'w-venn-c'].map((id) => !!document.querySelector('#' + id + ' .m-error'));
    const acc = DECK.slides.findIndex((s) => s.id === 's-accept');
    return { acc, accMax: DECK.slides[acc]._max, slideKeys: DECK.slides.map((s) => s._key), semantic, seen, errs: DECK.componentErrors.map((x) => JSON.parse(JSON.stringify(x))), max: DECK.slides.map((s) => s._max) };
  });
  // A thrown exception, as 1.x recorded it (phase, kind "exception") or as a 2.0 part's base contains it (spec §6.1
  // Containment: one ctx.report("error", "[<name>] <phase>: …"), which the registry shim records with phase "report"). The 2.0
  // form is accepted only for the cases below that are meant to throw (CONTAINED), never in general.
  const thrown = (x, tag, phase) => x.tag === tag && ((x.phase === phase && x.kind === 'exception') ||
    (x.phase === 'report' && x.code === 'error' && x.msg.startsWith('[' + tag.slice(2) + '] ' + phase + ': ')));
  const strip = (x) => x.phase === 'report' ? x.msg.replace(/^\[[a-z-]+\] [a-z]+: /, '') : x.msg;
  // the named cases meant to throw: [slide key, tag, phase, how many]
  const CONTAINED = [['s-hissan', 'm-hissan', 'steps', 2], ['s-semantic', 'm-compare', 'mount', 2], ['s-semantic', 'm-venn', 'mount', 1],
    ['s-throw', 'm-curves', 'mount', 1], ['s-expr', 'm-sweep', 'mount', 2], ['s-expr', 'm-curves', 'mount', 1]];
  const keyOf = (x) => x.key || (r.slideKeys[x.slide] ?? '');
  const reps = r.errs.filter((x) => x.phase === 'report' && x.code === 'error');
  const stray = reps.filter((x) => !CONTAINED.some(([k, tag, ph]) => keyOf(x) === k && thrown(x, tag, ph)));
  ok(stray.length === 0, 'contained exceptions (ctx.report "error") only in the cases meant to throw' + (stray.length ? ': ' + stray.map((x) => `${x.tag} (${keyOf(x)}): ${x.msg}`).join(' | ') : ''));
  for (const [k, tag, ph, n] of CONTAINED) {
    const got = r.errs.filter((x) => keyOf(x) === k && thrown(x, tag, ph)).length;
    ok(got === n, `${tag} on ${k}: thrown at ${ph} ${n} time(s) (got ${got})`);
  }
  ok(errors.length === 0, 'no exception or console error while opening and seeking' + (errors.length ? ': ' + errors[0] : ''));
  ok(r.max.every((m) => Number.isFinite(m)), 'every slide has a finite number of steps');
  for (const t of comps) {
    const s = r.seen.find((x) => x.tag === t), e = r.errs.find((x) => x.tag === t);
    ok(s && s.box && s.text.includes('<' + t + '>'), `${t}: shows the inline placeholder`);
    ok(e && e.phase === 'data', `${t}: reported in DECK.componentErrors before mount (${e && e.kind}${e && e.why ? ' ' + e.why : ''})`);
  }
  // m-hissan：計算にならない式（途中で終わる、答えが負になるひき算）は、段階を数えるところで札を出し、式を言う
  const hs = r.seen.filter((x) => x.id === 'w-hissan-expr' || x.id === 'w-hissan-neg'), he = r.errs.filter((x) => keyOf(x) === 's-hissan' && thrown(x, 'm-hissan', 'steps'));
  ok(hs.length === 2 && hs.every((x) => x.box) && he.length === 2 && /expr="12\+"/.test(he[0].msg) && /negative/.test(he[1].msg),
    'm-hissan: an expression that is not one calculation, and a negative difference, show the placeholder (' + he.map((x) => x.phase + ': ' + x.msg).join(' | ') + ')');
  // m-curves の系列の語（共通の決まり §3）：step・tone・labelAt・anchor（right/left/above/below）は形に合い、古い color・at・anchor（start/middle/end）も動く。
  // 段階は step の最大（書かない系列は i + 1）：ここでは 1, 1, 2, 4 → 4
  const okc = r.seen.find((x) => x.id === 'ok-curves');
  ok(okc && !okc.box && !r.errs.some((x) => x.slide === r.acc), 'm-curves: series step, tone, labelAt and anchor right/left/above/below are accepted (no placeholder, no error)');
  ok(r.accMax === 4, 'm-curves: steps = the largest series step (got ' + r.accMax + ')');
  // 形（static shape）では書けない中身の決まり：mount で例外を投げ、札を出す（値を黙って落とさない）
  const sem = r.errs.filter((x) => keyOf(x) === 's-semantic');
  const semOk = (tag, re) => sem.some((x) => thrown(x, tag, 'mount') && re.test(x.msg));
  ok(r.semantic.every(Boolean) && sem.length === 3, 'content that fits the shape but not the rule: placeholder for each (' + sem.map((x) => x.msg).join(' | ') + ')');
  ok(semOk('m-compare', /rows\[0\]\.values has 1 value/), 'm-compare: values not one per side is refused at mount');
  ok(semOk('m-compare', /rows\[0\]\.better is 2/), 'm-compare: better outside the sides is refused at mount');
  ok(semOk('m-venn', /regions AC need a third set/), 'm-venn: a region with C in a two-set diagram is refused at mount');
  const th = r.errs.find((x) => keyOf(x) === 's-throw');
  ok(th && thrown(th, 'm-curves', 'mount') && /^SyntaxError/.test(strip(th)) && r.seen.filter((x) => x.tag === 'm-curves' && !x.id).every((x) => x.box), 'mount exception: placeholder, recorded with the message only');
  // 算術の外の式（Egatari spec §6）：コードとして動かさず、札を出し、mount の段の SyntaxError として載る
  const ex = r.errs.filter((x) => keyOf(x) === 's-expr');
  ok(ex.length === 3 && ex.every((x) => (thrown(x, 'm-sweep', 'mount') || thrown(x, 'm-curves', 'mount')) && /^SyntaxError: (f|\[0\]\.f) = /.test(strip(x))),
    'expressions outside arithmetic: refused at mount with a SyntaxError naming the expression' + (ex.length ? ' (' + ex.map((x) => x.msg).join(' | ') + ')' : ''));
  ok(!(await page.evaluate(() => globalThis.__ran)), 'expressions outside arithmetic: nothing ran');
} finally { await browser.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

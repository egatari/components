// m-syntax: reading the marked-up text, bracket nesting, modifier arrows, steps (no browser), then the drawing in a browser
// (pinned Egatari Studio): arrow ends on the head word and the bracket's name, brackets beside their first and last words,
// underlines and brackets across a wrapped line, and ctx.report for writing errors and for an arrow across lines (the
// registry shim's bridge prints a report as "[egatariParts] m-syntax (<slide>): <code>: [syntax] …").
// The reading and steps come from the part's static testing, read without a browser through partClass (tools/parts.mjs).
//   node tools/test-syntax.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { partClass } from './parts.mjs';

const X = partClass(fs.readFileSync(path.join(ROOT, 'components', 'syntax', 'index.js'), 'utf8'), 'syntax/index.js').testing;
let fail = 0, n = 0;
const eq = (got, want, msg) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log(`FAIL ${msg}\n     got  ${g}\n     want ${w}`); } };
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log('FAIL ' + msg); } };
const one = (src) => X.parse(src).sentences[0];
const words = (s) => s.tokens.map((t) => t.t);
const roles = (s) => s.roles.map((r) => (r.lower ? r.code.toLowerCase() : r.code) + r.sub + ':' + r.a + '-' + r.b + '@' + r.depth);
const groups = (s) => s.groups.map((g) => g.label + ':' + g.a + '-' + g.b + '@' + g.depth);
const mods = (s) => s.mods.map((o) => o.a + '-' + o.b + '>' + o.to + '#' + o.lane);
const warns = (src) => X.parse(src).warnings;

// ---------------------------------------------------------------- reading
{
  const s = one('[S The tall boy] [V is] [C my brother].');
  eq(words(s), ['The', 'tall', 'boy', 'is', 'my', 'brother', '.'], 'words, the full stop as its own token');
  eq(s.tokens.map((t) => t.punct), [false, false, false, false, false, false, true], 'the full stop is punctuation');
  eq(roles(s), ['S:0-2@0', 'V:3-3@0', 'C:4-5@0'], 'S V C ranges');
  eq(s.text, 'The tall boy is my brother.', 'plain text');
  eq(X.parse('[S The tall boy] [V is] [C my brother].').warnings, [], 'no warnings');
}
eq(roles(one('[S We] [V call] [O him] [C Ken.]')), ['S:0-0@0', 'V:1-1@0', 'O:2-2@0', 'C:3-3@0'], 'a full stop inside [C …] is not underlined');
eq(roles(one('[S He] [V gave] [O1 me] [O2 a book].')), ['S:0-0@0', 'V:1-1@0', 'O1:2-2@0', 'O2:3-4@0'], 'O1 O2');
eq(roles(one('［S We］ ［V run］.')), ['S:0-0@0', 'V:1-1@0'], 'full-width brackets');
eq(roles(one('[s We] [v run].')), ['S:0-0@0', 'V:1-1@0'], 'lower-case role letters outside { } are the sentence elements');
{
  const s = one('[S The girl {形^ [S who] [V lives] [M next door]}] [V is] [C my friend].');
  eq(roles(s), ['S:0-5@0', 's:2-2@1', 'v:3-3@1', 'm:4-5@1', 'V:6-6@0', 'C:7-8@0'], 'roles inside { } are lower case, one level deeper');
  eq(groups(s), ['形容詞節:2-5@0'], 'a bracket with a V inside is a clause');
  eq(s.roles.filter((r) => r.lower).map((r) => r.owner), [0, 0, 0], 'inner roles belong to their bracket');
  eq(mods(s), ['2-5>1#1'], '{形^ …}: arrow to the word before the bracket (girl)');
}
// brackets and their nesting
{
  const s = one('[S The boy {形^boy who [V lives] {副^lives in the house}}] [V is] [C tall].');
  eq(groups(s), ['形容詞節:2-6@0', '副詞句:4-6@1'], 'nested brackets: outer first, depth, phrase without V');
  eq(mods(s), ['2-6>1#2', '4-6>3#1'], 'two arrows: the shorter one on lane 1, the one around it on lane 2');
}
eq(groups(one('{名句 To [V swim]} [V is] [C fun].')), ['名詞句:0-1@0'], '句 written: stays a phrase although it has a V');
eq(groups(one('[S I] [V know] [O {名節 that}].')), ['名詞節:2-2@0'], '節 written: a clause');
eq(groups(one('[S I] [V know] [O {名 that [S he] [V is] [C right]}].')), ['名詞節:2-5@0'], '名 with a V inside: 名詞節');
// modifier arrows
eq(mods(one('[S The tall^ boy] [V runs].')), ['1-1>2#1'], 'tall^: to the next word');
eq(mods(one('[S The boy] [V runs] {副^runs fast}.')), ['3-3>2#1'], '{副^runs …}: to the named word');
eq(mods(one('[S A dog] [V ran] {副^Ran fast,} and [S it] [V ran] away.')), ['3-3>2#1'], 'the nearest occurrence (ran, not the later one), case and punctuation ignored');
  eq(mods(one('[S It] [V ran] and [S the dog] [V ran] {副^ran fast}.')), ['6-6>5#1'], 'the nearest occurrence: the later ran');
eq(mods(one('[S The tall^ boy {形^ in the cap}] [V runs].')), ['1-1>2#1', '3-5>2#1'], 'two arrows to one head, not overlapping: both on lane 1');
// part of speech
{
  const s = one('[S We[代]] [V call[動]] [O him[代]] [C Ken[名]].');
  eq(s.tokens.filter((t) => t.pos).map((t) => t.t + '/' + t.pos.name + '/' + t.pos.cls), ['We/代名詞/n', 'call/動詞/v', 'him/代名詞/n', 'Ken/名詞/n'], 'parts of speech');
  eq(roles(s), ['S:0-0@0', 'V:1-1@0', 'O:2-2@0', 'C:3-3@0'], 'part-of-speech tags do not open roles');
}
// translation lines
{
  const p = X.parse('[S We] [V run].\n= 私たちは走る。\n[S It] [V rains].\n＝ 雨が降る。');
  eq(p.sentences.map((s) => s.yaku), ['私たちは走る。', '雨が降る。'], 'each = line belongs to the sentence above');
}

// ---------------------------------------------------------------- writing errors (warnings; the component reports them with ctx.report)
const has = (src, re, msg) => { const w = warns(src); ok(w.some((x) => re.test(x)), `${msg}: ${JSON.stringify(w)}`); };
has('= 訳だけ', /和訳の前に英文がない/, 'translation before any sentence');
has('[S We] [V run].\n= 一\n= 二', /和訳が 2 行ある/, 'two translation lines');
has('[S The boy [V runs].', /閉じていない「\[S」/, 'unclosed [');
has('[S The boy] [V runs]].', /対応する開きがない/, 'extra ]');
has('[S {形 The boy] [V runs]}.', /閉じる順が違う/, 'crossed brackets');
has('[X The boy] [V runs].', /要素の記号/, 'unknown role letter');
has('[S The boy] [V runs] {動 fast}.', /知らない括弧の種類「動」/, 'unknown bracket kind');
has('[S The boy] [V runs] {副^walk fast}.', /矢印の先「walk」/, 'arrow head not in the sentence');
has('{形^ who [V runs]}.', /括弧の前に語がない/, '{形^ …} at the start');
has('[S The boy] [V runs] fast^.', /「\^」の後に語がない/, 'word^ at the end');
has('[S The boy[X]] [V runs].', /知らない品詞「X」/, 'unknown part of speech');
has('[S ] [V runs].', /中に語のない要素/, 'empty role');
{
  // the readable parts survive the errors
  const s = one('[S The boy [V runs].');
  eq(words(s), ['The', 'boy', 'runs', '.'], 'words are kept after an error');
}

// ---------------------------------------------------------------- steps
{
  const m = X.parse('[S The girl {形^ [S who] [V lives]}] [V is] [C my friend].\n= 訳');
  const pl = X.plan(m, {});
  eq(pl.phases.map((p) => p.name + (p.code || '')), ['roleS', 'roleV', 'roleC', 'brackets', 'arrows', 'yaku'], 'steps: S, V, C one at a time (inner s v come with the brackets), brackets, arrows, translation');
  eq(pl.steps, 6, '6 steps');
  eq(pl.phases.map((p) => p.n), [1, 1, 1, 1, 1, 1], 'items per step');
  eq(X.plan(m, {yaku: false}).steps, 5, 'yaku="false": no translation step');
  const w = X.plan(m, {whole: true});
  eq(w.steps, 1, 'build="whole": one step');
  eq(w.phases.every((p) => p.step === 1), true, 'build="whole": every phase in step 1');
  ok(Math.abs(X.durationOf(w, 1) - (pl.phases.reduce((a, p) => a + p.dur, 0) + 0.2 * 5)) < 1e-9, 'build="whole": length is the phases one after another, 0.2 s apart');
  ok(w.phases.every((p, j) => j === 0 || p.off >= w.phases[j - 1].off + w.phases[j - 1].dur), 'build="whole": phases do not overlap');
  eq(X.durationOf(pl, 0), 0, 'step 0 has no length');
}
{
  const m = X.parse('[S We[代]] [V call[動]] [O him[代]] [C Ken[名]].\n[S The news] [V made] [O her] [C happy].');
  eq(X.plan(m, {pos: true}).phases.map((p) => p.name + (p.code || '') + ':' + p.n), ['pos:4', 'roleS:2', 'roleV:2', 'roleO:2', 'roleC:2'], 'pos="on" first; two sentences share each role step');
  eq(X.plan(m, {}).steps, 4, 'without pos: no part-of-speech step');
  eq(X.plan(X.parse('[M Yesterday] [S I] [V ran].'), {}).phases.map((p) => p.code), ['S', 'V', 'M'], 'roles in the order S V O C M whatever the sentence order');
  eq(X.plan(X.parse('I ran.'), {}).steps, 0, 'no mark-up: no steps');
}
console.log(fail ? `\n${fail} of ${n} failed (reading and steps)` : `ok (${n} checks: reading and steps)`);

// ---------------------------------------------------------------- drawing (browser)
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-syntax-')));
fs.mkdirSync(work, { recursive: true });
const deck = path.join(work, 'deck.html'), out = path.join(work, 'out', 'deck.html');
fs.writeFileSync(deck, `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>m-syntax test</title></head>
<body><div id="stage">
<section class="slide noconcl"><h2>関係詞</h2><div class="body">
<m-syntax id="rel" style="height:420px">
[S The girl {形^ [S who] [V lives] [M next door]}] [V is] [C my friend].
= 隣に住んでいる女の子は、私の友達です。
</m-syntax></div></section>
<section class="slide noconcl"><h2>折り返し</h2><div class="body">
<m-syntax id="wrap" style="height:700px;width:620px">
[S The tall^ boy {形^ who [V lives] {副^lives in the old house}}] [V gave] [O1 me] [O2 a book] [M {副^gave yesterday}].
</m-syntax></div></section>
<section class="slide noconcl"><h2>誤り</h2><div class="body">
<m-syntax id="bad" style="height:200px">
[S The boy [V runs] {副^walk fast}.
</m-syntax></div></section>
</div></body></html>
`);
S.build(deck, out);
const b = await S.browser.launch();
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'warning') logs.push(m.text()); if (m.type() === 'error') logs.push('ERROR ' + m.text()); });
  p.on('pageerror', (e) => logs.push('ERROR ' + e.message));
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await p.evaluate(() => document.fonts.ready);
  const geo = async (si, id) => {
    await p.evaluate((si) => DECK.seek(si, DECK.slides[si]._max, Infinity), si);
    return p.evaluate((id) => {
      const el = document.getElementById(id);
      const nums = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      return el.S.map((S2) => ({
        words: S2.T.map((x) => ({ t: x.t.t, punct: x.t.punct, ...el.rect(x.el) })),
        mods: S2.mods.map((M2) => { const v = nums(M2.path.getAttribute('d')); return { a: M2.o.a, to: M2.o.to, from: M2.o.from, x0: v[0], y0: v[1], x1: v[v.length - 3], y1: v[v.length - 1], head: M2.head.getAttribute('transform') }; }),
        tags: S2.groups.map((G2) => { const r = G2.tag.getBBox(); return { l: r.x, t: r.y, r: r.x + r.width, b: r.y + r.height }; }),
        brackets: S2.groups.map((G2) => ({ a: G2.g.a, b: G2.g.b, d: G2.path.getAttribute('d') })),
        roles: S2.roles.map((R2) => ({ code: R2.r.code, a: R2.r.a, b: R2.r.b, d: R2.line.getAttribute('d'), lab: R2.lab.textContent })),
        steps: el.steps,
      }));
    }, id);
  };
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  // ---- the relative clause: arrow from the bracket's name to "girl"
  const [rel] = await geo(0, 'rel');
  eq(rel.steps, 6, 'relative clause: 6 steps');
  const girl = rel.words[1], m0 = rel.mods[0], tag = rel.tags[0];
  ok(near(m0.x1, (girl.l + girl.r) / 2) && m0.y1 >= girl.t - 2 && m0.y1 <= girl.t + 4, `arrow ends on top of "girl" (${m0.x1}, ${m0.y1} vs ${(girl.l + girl.r) / 2}, ${girl.t})`);
  ok(m0.x0 >= tag.l && m0.x0 <= tag.r && m0.y0 <= tag.t + 1 && m0.y0 >= tag.t - 8, `arrow starts on top of the bracket's name (${m0.x0}, ${m0.y0} vs ${JSON.stringify(tag)})`);
  ok(/translate\(/.test(m0.head) && m0.head.includes('rotate(90)'), 'arrowhead points down');
  // brackets: the opening one between "girl" and "who", the closing one after "door"
  const nums = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  {
    const v = nums(rel.brackets[0].d), xs = v.filter((_, i) => i % 2 === 0);
    const who = rel.words[2], door = rel.words[5], is = rel.words[6];
    const open = xs.filter((x) => x < who.l), close = xs.filter((x) => x > door.r);
    ok(open.length && Math.min(...open) > girl.r && close.length && Math.max(...close) < is.l, `brackets between girl|who and door|is (${xs.join(',')})`);
    ok(tag.l >= girl.r - 4 && tag.b <= who.t + 1, 'the bracket name sits above the opening bracket, not over "girl"');
  }
  // roles: s v m one row above S V C, and S under the whole subject
  {
    const S0 = rel.roles.find((r) => r.code === 'S' && r.a === 0), s1 = rel.roles.find((r) => r.lab === 's');
    const yS = nums(S0.d)[1], ys = nums(s1.d)[1];
    ok(ys < yS, 'the clause\'s s is above the sentence\'s S');
    const V = rel.roles.find((r) => r.lab === 'V');
    ok(near(nums(V.d)[1], yS), 'S V C on one row');
  }
  // ---- wrapped: each line its own underline piece; brackets beside their words on both lines
  const [wr] = await geo(1, 'wrap');
  const lines = [...new Set(wr.words.filter((w) => !w.punct).map((w) => Math.round(w.t)))];
  ok(lines.length >= 2, `the sentence wraps (${lines.length} lines)`);
  {
    const Srole = wr.roles.find((r) => r.code === 'S' && r.a === 0);
    const first = wr.words[Srole.a], last = wr.words[Srole.b];
    const pieces = (Srole.d.match(/M/g) || []).length;
    const want = new Set(wr.words.slice(Srole.a, Srole.b + 1).filter((w) => !w.punct).map((w) => Math.round(w.t))).size;
    ok(first.t !== last.t && pieces === want, `S across ${want} lines has ${pieces} underline pieces`);
    const segs = [...Srole.d.matchAll(/M(-?[\d.]+),(-?[\d.]+)H(-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
    ok(near(segs[0][0], first.l, 3) && segs[0][1] > first.b, 'the first piece starts under the first word');
    ok(segs.some(([l, y, r]) => y > last.b && y < last.b + 140 && near(r, last.r, 3)), 'the last piece ends under the last word, on its line');
    // the outer bracket (形容詞節) opens before "who" and closes after "house" on another line
    const g = wr.brackets[0], gv = nums(g.d), who = wr.words[g.a], house = wr.words[g.b];
    ok(who.t !== house.t, 'the clause opens and closes on different lines');
    const pts = []; for (let i = 0; i + 1 < gv.length; i += 2) pts.push([gv[i], gv[i + 1]]);
    ok(pts.some(([x, y]) => x < who.l && x > who.l - 40 && y >= who.t - 8 && y <= who.b + 8), 'opening bracket beside "who" on its line');
    ok(pts.some(([x, y]) => x > house.r && x < house.r + 40 && y >= house.t - 8 && y <= house.b + 8), 'closing bracket beside "house" on its line');
  }
  ok(logs.some((l) => /m-syntax \([^)]*\): size: \[syntax\] .*行をまたぐ/.test(l)), 'an arrow across lines is reported: ' + JSON.stringify(logs.filter((l) => /\[syntax\]/.test(l))));
  // ---- writing errors reach ctx.report, and the part still draws
  ok(logs.some((l) => /m-syntax \([^)]*\): data: \[syntax\] 閉じていない「\[S」/.test(l)), 'unclosed [S is reported');
  ok(logs.some((l) => /m-syntax \([^)]*\): data: \[syntax\] 矢印の先「walk」/.test(l)), 'missing arrow head is reported');
  ok(!logs.some((l) => /^ERROR/.test(l)), 'no page errors: ' + JSON.stringify(logs.filter((l) => /^ERROR/.test(l))));
  // the readable layer
  const sr = await p.evaluate(() => document.querySelector('#rel .sr-only').textContent);
  ok(/The girl who lives next door is my friend\./.test(sr) && /S「The girl who lives next door」/.test(sr) && /括弧：形容詞節「who lives next door」/.test(sr) && /修飾：「who lives next door」→「girl」/.test(sr) && /訳：隣に住んでいる/.test(sr), 'readable layer: sentence, roles, brackets, arrows, translation');
} finally { await b.close(); }
console.log(fail ? `\nFAIL: ${fail} of ${n}` : `\nOK (${n} checks)`);
process.exit(fail ? 1 : 0);

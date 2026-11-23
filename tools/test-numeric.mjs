// m-numeric: a question answered with a number (Egatari spec §8.4 "Viewer input", ctx.answer, questions), built with the
// pinned Egatari Studio through the registry shim.
//   1. the class declares static questions = ["q"], interactive, viewerInput and preview "none"
//   2. parsing: full-width digits, minus forms, decimals, digit separators, the unit (exactly) and white space; other text is
//      not a number (the hint shows at step 0, not for an empty field)
//   3. tolerance, and float error absorbed (0.1 + 0.2 for 0.3)
//   4. ctx.answer (set on the part as mount would keep it; the pinned Studio passes none): arriving with no number → none;
//      with a number → once; a re-render of the same step → none; back and arriving again → again; right and wrong
//   5. keyboard only: focus the field, type, Enter leaves it, the slide did not move; → arrives and reports
//   6. the typed text persists within the slide; ctx.reset keeps it; ctx.entered and entering from another slide empty it;
//      the field is read-only at the answer step
//   7. video: no field, the answer line at step 1, no mark, no report
//   8. print: field hidden, no mark; the screen keeps the viewer's text afterwards
//   9. en: UI text in English; labels.correct overrides the mark
//  10. vertical-writing slide: the part stays horizontal; too narrow → ctx.report("layout", "[numeric] …"); wide enough → none
//   node tools/test-numeric.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-numeric-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'demo.out.html');
S.build(path.join(ROOT, 'components', 'numeric', 'demo.html'), out);
const mnum = (attrs, data) => `<m-numeric ${attrs}><script type="application/json">${JSON.stringify(data)}</script></m-numeric>`;
const buildDeck = (name, lang, slides) => {
  const html = `<!DOCTYPE html><html lang="${lang}" data-theme="default"><head><meta charset="utf-8"><title>m-numeric ${name}</title></head><body><div id="stage">\n${slides.join('\n')}\n</div></body></html>`;
  const src = path.join(work, `${name}.html`), o = path.join(work, `${name}.out.html`);
  fs.writeFileSync(src, html); S.build(src, o); return o;
};
let nSlide = 0;
const slide = (body, cls = '') => `<section class="slide noconcl ${cls}"><h2>t${++nSlide}</h2><div class="body">${body}</div></section>`;
const browser = await S.browser.launch();
try {
  const open = async (file, query = '') => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(S.browser.fileUrl(file) + query);
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__r = (c, k, t, ctx) => { let p = Object.getPrototypeOf(c); while (p && !Object.prototype.hasOwnProperty.call(p, 'render')) p = Object.getPrototypeOf(p); return p.render.call(c, k, t, ctx); };
      window.__ans = [];
      window.__rec = (c) => { c._answer = (...a) => window.__ans.push(a); };
      window.__type = (c, s) => { c.field.value = s; c.field.dispatchEvent(new Event('input', { bubbles: true })); };
    });
    return { page, errors };
  };

  // ---- 1. declarations
  {
    const { page, errors } = await open(out);
    const r = await page.evaluate(() => { const C = DECK.slides[0]._comps[0].constructor; return { q: JSON.stringify(C.questions), i: C.interactive, v: C.viewerInput, p: C.preview }; });
    ok(r.q === '["q"]' && r.i === true && r.v === true && r.p === 'none', 'static questions = ["q"], interactive, viewerInput, preview "none" (' + JSON.stringify(r) + ')');
    ok(errors.length === 0, 'demo: no console error' + (errors.length ? ': ' + errors[0] : ''));

    // ---- 2. parsing (slide 0: unit cm³, answer 27)
    const cases = [['27', 27], ['２７', 27], ['  27  ', 27], ['　27　', 27], ['27cm³', 27], ['27 cm³', 27], ['cm³27', 27],
      ['−5', -5], ['－5', -5], ['-5', -5], ['1,000', 1000], ['１，０００', 1000], ['3．5', 3.5], ['3.5', 3.5], ['.5', 0.5], ['-0.25', -0.25],
      ['27cm', null], ['27 cm³ cm³', null], ['abc', null], ['2 7', null], ['27個', null], ['+27', null], ['1.2.3', null], ['-', null], ['', null], ['27cm³cm³', null]];
    const got = await page.evaluate((cases) => {
      const c = DECK.slides[0]._comps[0];
      DECK.go(0, 0, false);
      return cases.map(([s]) => { __type(c, s); return [c.value(), +c.hintEl.getAttribute('opacity')]; });
    }, cases);
    const bad = cases.filter(([s, v], i) => got[i][0] !== v);
    ok(!bad.length, 'parsing: ' + cases.length + ' inputs read as expected' + (bad.length ? ' (wrong: ' + bad.map(([s, v]) => JSON.stringify(s) + '→' + got[cases.indexOf(bad[0])][0]).join(', ') + ')' : ''));
    const hintBad = cases.filter(([s, v], i) => got[i][1] !== (s.trim() && v === null ? 1 : 0));
    ok(!hintBad.length, 'the hint shows exactly for text that is not a number (not for an empty field)' + (hintBad.length ? ': ' + hintBad.map((x) => x[0]).join(', ') : ''));
    const hint = await page.evaluate(() => DECK.slides[0]._comps[0].hintEl.textContent);
    ok(hint === '数で入れてください', 'ja hint text (got ' + hint + ')');

    // ---- 3. tolerance (slide 1: 9.8 ± 0.1)
    const tol = await page.evaluate(() => { const c = DECK.slides[1]._comps[0]; return [9.8, 9.7, 9.9, 9.75, 9.91, 9.69, 10].map((x) => c.correct(x)); });
    ok(tol.join() === 'true,true,true,true,false,false,false', 'tolerance ±0.1: 9.8 9.7 9.9 9.75 right, 9.91 9.69 10 wrong (' + tol.join() + ')');
    await page.close();
  }
  const fx = buildDeck('fixture', 'ja', [
    slide(mnum('style="height:360px"', { question: '0.1 + 0.2 は？', answer: 0.3, note: '小数のたし算' })),
    slide('<p>ほかのスライド</p>'),
  ]);
  {
    const { page } = await open(fx);
    const r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return [c.correct(0.1 + 0.2), c.correct(0.3000001), c.correct(0.3)]; });
    ok(r.join() === 'true,false,true', 'tolerance 0: float error (0.1 + 0.2) is right, 0.3000001 is wrong (' + r.join() + ')');
    await page.close();
  }

  // ---- 4. ctx.answer
  {
    const { page } = await open(out);
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0], o = {};
      o.none0 = c._answer === null;
      __rec(c);
      DECK.go(0, 0, false); DECK.go(0, 1, false); o.empty = __ans.length;           // arrive with no number
      DECK.go(0, 0, false); __type(c, 'abc'); DECK.go(0, 1, false); o.text = __ans.length;   // not a number
      DECK.go(0, 0, false); __type(c, '２７'); DECK.go(0, 1, false); o.once = __ans.length;
      DECK.seek(0, 1, 0.3); DECK.seek(0, 1, Infinity); DECK.go(0, 2, false); DECK.go(0, 1, false); o.rerender = __ans.length;   // same part step (slide step 2 keeps k = 1)
      DECK.go(0, 0, false); DECK.go(0, 1, false); o.again = __ans.length;
      DECK.go(0, 0, false); __type(c, '28 cm³'); DECK.go(0, 1, false);
      o.ans = JSON.stringify(__ans);
      return o;
    });
    ok(r.none0, 'the pinned Studio passes no ctx.answer: the part keeps null');
    ok(r.empty === 0 && r.text === 0, 'arriving with an empty field or text that is not a number reports nothing');
    ok(r.once === 1 && r.rerender === 1, 'arriving with a number reports once; re-rendering the answer step does not report again');
    ok(r.again === 2, 'going back and arriving again reports again');
    ok(r.ans === '[["q",true,27],["q",true,27],["q",false,28]]', 'ctx.answer("q", correct, number) values (' + r.ans + ')');
    await page.close();
  }

  // ---- 5. keyboard only
  {
    const { page, errors } = await open(out);
    await page.evaluate(() => { DECK.go(0, 0, false); __rec(DECK.slides[0]._comps[0]); });
    await page.locator('m-numeric').first().locator('input').focus();
    await page.keyboard.type('2 7');
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.type('7');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press(' ');
    let st = await page.evaluate(() => DECK.state());
    ok(st.slide === 1 && st.step === 0, 'keys typed in the field (digits, space, arrows, Backspace) do not move the slide');
    await page.keyboard.press('Enter');
    const blurred = await page.evaluate(() => document.activeElement.localName !== 'input');
    st = await page.evaluate(() => DECK.state());
    ok(blurred && st.step === 0, 'Enter leaves the field without moving the slide');
    await page.keyboard.press('ArrowRight');
    const r = await page.evaluate(() => ({ s: DECK.state(), a: JSON.stringify(__ans), ro: DECK.slides[0]._comps[0].field.hasAttribute('readonly') }));
    ok(r.s.step === 1 && r.a === '[["q",true,27]]', 'keyboard only: typed, left the field, → to the answer step reports it (' + r.a + ')');
    ok(r.ro, 'the field is read-only at the answer step');
    const mark = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; DECK.seek(0, 1, Infinity); return [c.markEl.textContent, c.markEl.getAttribute('opacity'), c.ansEl.textContent, c.noteEls[0].getAttribute('opacity')]; });
    ok(mark[0] === '✓ 正解' && mark[1] === '1.000' && mark[2] === '答え：27 cm³' && mark[3] === '1.000', 'the answer step shows the mark, the answer line and the note (' + mark.join(' | ') + ')');
    await page.keyboard.press('ArrowLeft');
    const ro2 = await page.evaluate(() => DECK.slides[0]._comps[0].field.hasAttribute('readonly'));
    ok(!ro2, 'back at step 0 the field is editable again');
    await page.locator('m-numeric').first().locator('input').focus();
    await page.keyboard.press('Escape');
    const esc = await page.evaluate(() => ({ a: document.activeElement.localName, s: DECK.state() }));
    ok(esc.a !== 'input' && esc.s.slide === 1 && esc.s.step === 0, 'Esc leaves the field without moving the slide');
    ok(errors.length === 0, 'keyboard: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 6. persistence and resets
  {
    const { page } = await open(out);
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0], o = {};
      DECK.go(0, 0, false); __type(c, '30');
      DECK.go(0, 1, false); DECK.go(0, 2, false); DECK.go(0, 0, false); o.kept = c._raw + '|' + c.field.value;
      __r(c, 0, Infinity, { mode: 'talk', entered: false, reset: true }); o.reset = c._raw;
      __r(c, 0, Infinity, { mode: 'talk', entered: true }); o.entered = c._raw + '|' + c.field.value;
      __type(c, '30'); DECK.go(1, 0, false); DECK.go(0, 1, false); o.other = c._raw;
      return o;
    });
    ok(r.kept === '30|30', 'the typed text survives steps forward and back on the slide');
    ok(r.reset === '30', 'ctx.reset keeps the typed text');
    ok(r.entered === '|' && r.other === '', 'ctx.entered and entering from another slide empty the field');
    await page.close();
  }

  // ---- 7. video
  {
    const { page, errors } = await open(out, '?mode=video');
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0];
      __rec(c); DECK.seek(0, 0, Infinity); DECK.seek(0, 1, Infinity);
      return { inputs: document.querySelectorAll('m-numeric input').length, ans: +c.ansEl.getAttribute('opacity'), mark: +c.markEl.getAttribute('opacity'), calls: __ans.length };
    });
    ok(r.inputs === 0, 'video: no field');
    ok(r.ans === 1 && r.mark === 0 && r.calls === 0, 'video: step 1 shows the answer line only, no mark, no report');
    ok(errors.length === 0, 'video: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 8. print
  {
    const { page } = await open(out);
    await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; DECK.go(0, 0, false); __type(c, '28'); DECK.go(0, 1, false); DECK.seek(0, 1, Infinity); });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    let r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { shown: getComputedStyle(c.field).display, mark: +c.markEl.getAttribute('opacity'), ans: +c.ansEl.getAttribute('opacity') }; });
    ok(r.shown === 'none' && r.mark === 0 && r.ans === 1, 'print: the field is hidden, no mark, the answer line shown');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { raw: c.field.value, mark: c.markEl.textContent, op: +c.markEl.getAttribute('opacity') }; });
    ok(r.raw === '28' && r.mark === '✗ 不正解' && r.op === 1, 'after printing the screen keeps the viewer\'s number and mark');
    await page.close();
  }

  // ---- 9. en, labels.correct
  {
    const en = buildDeck('en', 'en', [
      slide(mnum('style="height:360px"', { question: 'How many legs do 3 spiders have?', answer: 24, note: '8 legs each' })),
      slide(mnum('style="height:360px"', { question: 'Half of 9?', answer: 4.5, labels: { correct: 'Well done!' } })),
    ]);
    const { page, errors } = await open(en);
    const r = await page.evaluate(() => {
      const a = DECK.slides[0]._comps[0], b = DECK.slides[1]._comps[0];
      DECK.go(0, 0, false); __type(a, 'x'); const hint = a.hintEl.textContent; __type(a, '23'); DECK.go(0, 1, false); DECK.seek(0, 1, Infinity);
      const wrong = a.markEl.textContent, line = a.ansEl.textContent, label = a.field.getAttribute('aria-label');
      DECK.go(1, 0, false); __type(b, '4.5'); DECK.go(1, 1, false); DECK.seek(1, 1, Infinity);
      return { hint, wrong, line, label, over: b.markEl.textContent, all: [...document.querySelectorAll('m-numeric text')].map((t) => t.textContent).join(' ') };
    });
    ok(r.hint === 'Enter a number' && r.wrong === '✗ Incorrect' && r.line === 'Answer: 24' && r.label === 'Answer', 'en: hint, mark, answer line and field label in English (' + JSON.stringify(r).slice(0, 160) + ')');
    ok(r.over === 'Well done!', 'labels.correct overrides the mark (got ' + r.over + ')');
    ok(!/[぀-ヿ一-鿿]/.test(r.all), 'en: no Japanese in the drawing');
    ok(errors.length === 0, 'en: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 10. vertical-writing slides
  {
    const q = { question: '1 辺が 3 cm の立方体の体積は？', answer: 27, unit: 'cm³' };
    const tate = buildDeck('tate', 'ja', [
      slide(mnum('style="width:300px;height:300px"', q), 'layout-tate'),
      slide(mnum('style="height:360px"', q), 'layout-tate'),
    ]);
    const { page, errors } = await open(tate);
    await page.evaluate(() => { DECK.go(1, 1, false); DECK.go(0, 0, false); });
    const r = await page.evaluate(() => ({
      reports: EGATARI_PARTS_SHIM.reports().map((x) => ({ key: x.key, code: x.code, msg: x.msg })),
      wm: [0, 1].map((i) => getComputedStyle(DECK.slides[i]._comps[0]).writingMode),
      parent: getComputedStyle(DECK.slides[0]._comps[0].parentElement).writingMode,
    }));
    const narrow = r.reports.filter((x) => x.code === 'layout' && /^\[numeric\]/.test(x.msg));
    ok(r.parent.startsWith('vertical') && r.wm.every((w) => w === 'horizontal-tb'), 'in a vertical slide the part stays horizontal (' + r.wm.join() + ' in ' + r.parent + ')');
    ok(narrow.length >= 1 && narrow.every((x) => /vertically/.test(x.msg)), 'too narrow in a vertical slide: ctx.report("layout", "[numeric] …") (' + narrow.map((x) => x.msg).join(' / ') + ')');
    ok(r.reports.length === narrow.length && narrow.every((x) => x.key === narrow[0].key), 'the part that fits reports nothing');
    ok(errors.length === 0, 'tate: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

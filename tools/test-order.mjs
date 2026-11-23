// m-order: an ordering question (Egatari spec §8.4 "Viewer input", ctx.answer, questions), built with the pinned Egatari
// Studio through the registry shim.
//   1. the class declares static questions = ["q"], interactive, viewerInput and preview "none"
//   2. the start order: without start, rotated by one (no card in its place); a given start is used; a start that is not a
//      permutation, or is the right order, is reported (data) and the rotated order used
//   3. keyboard: Space picks up, ↑ ↓ move (announced), Space drops, Esc puts it back; the slide does not move; Tab follows
//      the cards on screen; keyboard-only answering reaches the answer step and reports it
//   4. ctx.answer (set on the part as mount would keep it; the pinned Studio passes none): arriving without a move → none;
//      after a move → once; a re-render of the same step → none; back and arriving again → again; values
//   5. pointer: dragging a card moves it
//   6. the answer step: cards in the right order, ✓ where the viewer had them right, "あなた：n 番目" elsewhere, the result
//   7. the order persists within the slide; ctx.reset keeps it (and drops a held card); ctx.entered restores the start order
//   8. video: no controls, step 1 moves the cards to the right order, no marks, no report
//   9. print: the start order, no marks, controls hidden; the screen keeps the viewer's order afterwards
//  10. en: UI text and announcements in English
//  11. vertical-writing slide: the part stays horizontal; too narrow → ctx.report("layout", "[order] …")
//   node tools/test-order.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-order-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const out = path.join(work, 'demo.out.html');
S.build(path.join(ROOT, 'components', 'order', 'demo.html'), out);
const mord = (attrs, data) => `<m-order ${attrs}><script type="application/json">${JSON.stringify(data)}</script></m-order>`;
const buildDeck = (name, lang, slides) => {
  const html = `<!DOCTYPE html><html lang="${lang}" data-theme="default"><head><meta charset="utf-8"><title>m-order ${name}</title></head><body><div id="stage">\n${slides.join('\n')}\n</div></body></html>`;
  const src = path.join(work, `${name}.html`), o = path.join(work, `${name}.out.html`);
  fs.writeFileSync(src, html); S.build(src, o); return o;
};
let nSlide = 0;
const slide = (body, cls = '') => `<section class="slide noconcl ${cls}"><h2>t${++nSlide}</h2><div class="body">${body}</div></section>`;
const FOUR = ['A', 'B', 'C', 'D'].map((x) => x + ' の札');
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
      // the y of each item's card (by item index), and the item index of each control in DOM order
      window.__y = (c) => c.cards.map((x) => +/translate\(0,([-\d.]+)\)/.exec(x.g.getAttribute('transform'))[1]);
      window.__dom = (c) => [...c.querySelectorAll('.od-card')].map((b) => c.cards.findIndex((x) => x.btn === b)).join();
    });
    return { page, errors };
  };
  const card = (page, slideI, item) => page.evaluate(([i, j]) => { const b = DECK.slides[i]._comps[0].cards[j].btn; b.focus(); return true; }, [slideI, item]);

  // ---- 1, 2. declarations; start orders
  {
    const { page, errors } = await open(out);
    const r = await page.evaluate(() => {
      const a = DECK.slides[0]._comps[0], b = DECK.slides[1]._comps[0], C = a.constructor;
      return { q: JSON.stringify(C.questions), i: C.interactive, v: C.viewerInput, p: C.preview, a: a.order().join(), b: b.order().join(), reports: EGATARI_PARTS_SHIM.reports().length };
    });
    ok(r.q === '["q"]' && r.i === true && r.v === true && r.p === 'none', 'static questions = ["q"], interactive, viewerInput, preview "none"');
    ok(r.a === '1,2,3,0', 'without start the cards are rotated by one, none in its place (' + r.a + ')');
    ok(r.b === '2,4,0,3,1', 'a given start is used (' + r.b + ')');
    ok(r.reports === 0 && errors.length === 0, 'demo: no report, no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }
  {
    const fx = buildDeck('start', 'ja', [
      slide(mord('style="height:400px"', { items: FOUR, start: [0, 0, 1, 2] })),
      slide(mord('style="height:400px"', { items: FOUR, start: [0, 1, 2, 3] })),
      slide(mord('style="height:400px"', { items: FOUR, start: [1, 0] })),
      slide(mord('style="height:300px"', { items: ['甲', '乙'] })),
    ]);
    const { page } = await open(fx);
    await page.evaluate(() => { for (let i = 3; i >= 0; i--) DECK.go(i, 0, false); });
    const r = await page.evaluate(() => ({ o: DECK.slides.map((s) => s._comps[0].order().join(' ')), rep: EGATARI_PARTS_SHIM.reports().map((x) => x.code + ' ' + x.msg) }));
    ok(r.o.join('|') === '1 2 3 0|1 2 3 0|1 2 3 0|1 0', 'a bad start (repeats, the right order, too short) falls back to the rotation; two items swap (' + r.o.join('|') + ')');
    ok(r.rep.length === 3 && r.rep.every((m) => /^data \[order\] start/.test(m)) && r.rep.some((m) => /already the right order/.test(m)), 'each bad start is reported as data (' + r.rep.join(' / ') + ')');
    await page.close();
  }

  // ---- 3. keyboard
  {
    const { page, errors } = await open(out);
    await page.evaluate(() => { DECK.go(0, 0, false); __rec(DECK.slides[0]._comps[0]); });
    // the card of item 0 is at position 4 (start 1,2,3,0)
    await card(page, 0, 0);
    await page.keyboard.press(' ');
    let r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { held: c._held && c._held.item, say: c.say.textContent, pressed: c.cards[0].btn.getAttribute('aria-pressed') }; });
    ok(r.held === 0 && r.pressed === 'true' && /縄文時代を持ち上げました（4 番目）/.test(r.say), 'Space picks the card up and says so (' + r.say + ')');
    await page.keyboard.press('ArrowUp');
    r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { o: c.order().join(), say: c.say.textContent, s: DECK.state() }; });
    ok(r.o === '1,2,0,3' && r.say === '3 番目に動かしました' && r.s.slide === 1 && r.s.step === 0, '↑ moves the held card and announces "3 番目に動かしました"; the slide does not move');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    await page.keyboard.press(' ');
    r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { o: c.order().join(), say: c.say.textContent, held: c._held, dom: __dom(c), focus: document.activeElement === c.cards[0].btn }; });
    ok(r.o === '0,1,2,3' && r.held === null && /1 番目に置きました/.test(r.say), '↑ stops at the top; Space drops it (' + r.o + ', ' + r.say + ')');
    ok(r.dom === '0,1,2,3' && r.focus, 'the controls follow the cards on screen (Tab order) and the dropped card keeps focus');
    // Esc puts a card back where it was picked up
    await card(page, 0, 2);
    await page.keyboard.press(' '); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
    r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { o: c.order().join(), say: c.say.textContent, held: c._held, s: DECK.state() }; });
    ok(r.o === '0,1,2,3' && r.held === null && r.say === '元の 3 番目に戻しました' && r.s.step === 0, 'Esc puts the card back where it was picked up (' + r.say + ')');
    // Tab to the next card, then → (not holding) goes to the slide: the answer step
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => DECK.slides[0]._comps[0].cards.findIndex((x) => x.btn === document.activeElement));
    ok(next === 3, 'Tab goes to the next card on screen (got item ' + next + ')');
    await page.keyboard.press('ArrowRight');
    r = await page.evaluate(() => ({ s: DECK.state(), a: JSON.stringify(__ans) }));
    ok(r.s.step === 1 && r.a === '[["q",true,"0,1,2,3"]]', 'keyboard only: ordered, then → reaches the answer step and reports it (' + r.a + ')');
    await page.keyboard.press(' ');
    r = await page.evaluate(() => ({ held: DECK.slides[0]._comps[0]._held, dis: DECK.slides[0]._comps[0].cards[0].btn.getAttribute('aria-disabled') }));
    ok(r.held === null && r.dis === 'true', 'at the answer step the cards cannot be picked up');
    ok(errors.length === 0, 'keyboard: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 4. ctx.answer
  {
    const { page } = await open(out);
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0], o = {};
      o.none0 = c._answer === null;
      __rec(c);
      DECK.go(0, 0, false); DECK.go(0, 1, false); o.nomove = __ans.length;
      DECK.go(0, 0, false); c.move(0, 0); DECK.go(0, 1, false); o.once = __ans.length;     // 0,1,2,3 right
      DECK.seek(0, 1, 0.3); DECK.seek(0, 1, Infinity); DECK.go(0, 2, false); DECK.go(0, 1, false); o.rerender = __ans.length;
      DECK.go(0, 0, false); DECK.go(0, 1, false); o.again = __ans.length;
      DECK.go(0, 0, false); c.move(1, 0); DECK.go(0, 1, false);                           // 1,0,2,3 wrong
      DECK.go(0, 0, false); c.move(1, 1); c.move(1, 0); DECK.go(0, 1, false);             // moved back to where it was: still an answer
      o.ans = JSON.stringify(__ans);
      return o;
    });
    ok(r.none0, 'the pinned Studio passes no ctx.answer: the part keeps null');
    ok(r.nomove === 0, 'arriving without having moved a card reports nothing');
    ok(r.once === 1 && r.rerender === 1 && r.again === 2, 'after a move: once on arrival, not on a re-render, again after going back');
    ok(r.ans === '[["q",true,"0,1,2,3"],["q",true,"0,1,2,3"],["q",false,"1,0,2,3"],["q",false,"1,0,2,3"]]', 'ctx.answer("q", correct, indices in the viewer\'s order) (' + r.ans + ')');
    await page.close();
  }

  // ---- 5. pointer
  {
    const { page, errors } = await open(out);
    await page.evaluate(() => DECK.go(0, 0, false));
    const b = await page.evaluate(() => { const c = DECK.slides[0]._comps[0], r = c.cards[0].btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, p: c.g.pitch * c.getBoundingClientRect().height / c.g.H }; });
    await page.mouse.move(b.x, b.y); await page.mouse.down();
    for (let s = 1; s <= 10; s++) await page.mouse.move(b.x, b.y - (b.p * 3) * s / 10);
    await page.mouse.up();
    const r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { o: c.order().join(), y: __y(c).map(Math.round).join(), slots: [0, 1, 2, 3].map((p) => Math.round(c.slot(p))).join(), say: c.say.textContent, s: DECK.state(), dom: __dom(c) }; });
    ok(r.o === '0,1,2,3', 'dragging the last card up three places moves it to the top (' + r.o + ')');
    ok(r.y === r.slots && r.dom === '0,1,2,3', 'after the drop every card sits in its slot and the controls follow');
    ok(r.say === '1 番目に動かしました' && r.s.step === 0, 'the drop is announced and the slide does not move');
    ok(errors.length === 0, 'pointer: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 6. the answer step
  {
    const { page } = await open(out);
    const r = await page.evaluate(() => {
      const c = DECK.slides[1]._comps[0];   // start 2,4,0,3,1
      DECK.go(1, 0, false); c.move(0, 0);     // 0,2,4,3,1: items 0 and 3 in place
      DECK.go(1, 1, false); DECK.seek(1, 1, Infinity);
      return { y: __y(c).map(Math.round).join(), slots: [0, 1, 2, 3, 4].map((p) => Math.round(c.slot(p))).join(),
        ticks: c.cards.map((x) => x.tick.getAttribute('opacity')).join(), yours: c.cards.map((x) => x.yours.textContent).join('|'),
        mark: c.markEl.textContent, say: c.say.textContent };
    });
    ok(r.y === r.slots, 'at the answer step the cards are in the right order');
    ok(r.ticks === '1.000,0,0,1.000,0', '✓ on the cards the viewer had in place (' + r.ticks + ')');
    ok(r.yours === '|あなた：5 番目|あなた：2 番目||あなた：3 番目', 'the other cards say where the viewer had them (' + r.yours + ')');
    ok(r.mark === '✗ 不正解' && /正しい順：王の話/.test(r.say), 'the result mark and the announcement');
    await page.close();
  }

  // ---- 7. persistence and resets
  {
    const { page } = await open(out);
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0], o = {};
      DECK.go(0, 0, false); c.move(0, 0);
      DECK.go(0, 1, false); DECK.go(0, 2, false); DECK.go(0, 0, false); o.kept = c.order().join() + '|' + __y(c).map(Math.round).join() + '|' + [0, 1, 2, 3].map((p) => Math.round(c.slot(p))).join();
      c._held = { item: 1, from: 1 };
      __r(c, 0, Infinity, { mode: 'talk', entered: false, reset: true }); o.reset = c.order().join() + '|' + c._held;
      __r(c, 0, Infinity, { mode: 'talk', entered: true }); o.entered = c.order().join() + '|' + c._moved;
      c.move(0, 0); DECK.go(1, 0, false); DECK.go(0, 0, false); o.other = c.order().join();
      return o;
    });
    const [ord, ys, slots] = r.kept.split('|');
    ok(ord === '0,1,2,3' && ys === slots, 'the order survives steps forward and back on the slide');
    ok(r.reset === '0,1,2,3|null', 'ctx.reset keeps the order and drops a held card');
    ok(r.entered === '1,2,3,0|false' && r.other === '1,2,3,0', 'ctx.entered and entering from another slide restore the start order');
    await page.close();
  }

  // ---- 8. video
  {
    const { page, errors } = await open(out, '?mode=video');
    const r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0];
      __rec(c); c.move(0, 0);
      DECK.seek(0, 0, Infinity); const y0 = __y(c).map(Math.round).join();
      DECK.seek(0, 1, Infinity);
      return { btns: document.querySelectorAll('m-order button').length, grips: document.querySelectorAll('m-order .od-grip').length, y0, y1: __y(c).map(Math.round).join(),
        slots: [0, 1, 2, 3].map((p) => Math.round(c.slot(p))).join(),
        ticks: c.cards.filter((x) => +x.tick.getAttribute('opacity') > 0).length, mark: +c.markEl.getAttribute('opacity'), calls: __ans.length };
    });
    ok(r.btns === 0 && r.grips === 0, 'video: no controls');
    ok(r.y1 === r.slots && r.ticks === 0 && r.mark === 0 && r.calls === 0, 'video: step 1 moves the cards to the right order, no marks, no report');
    ok(errors.length === 0, 'video: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 9. print (the player draws every slide's final state for print; a step-0 render while printing draws the start order)
  {
    const { page } = await open(out);
    await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; DECK.go(0, 0, false); c.move(0, 0); c.move(1, 3); });   // 0,2,3,1
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    let r = await page.evaluate(() => {
      const c = DECK.slides[0]._comps[0], slots = (o) => [0, 1, 2, 3].map((j) => Math.round(c.slot(o.indexOf(j)))).join();
      const o = { btn: getComputedStyle(c.cards[0].btn).display, grip: getComputedStyle(c.cards[0].grip).display };
      o.end = __y(c).map(Math.round).join() === slots([0, 1, 2, 3]);
      o.marks = c.cards.filter((x) => +x.tick.getAttribute('opacity') > 0 || x.yours.textContent).length + +c.markEl.getAttribute('opacity');
      __r(c, 0, Infinity, { mode: 'talk', entered: false });
      o.k0 = __y(c).map(Math.round).join() === slots([1, 2, 3, 0]);
      return o;
    });
    ok(r.btn === 'none' && r.grip === 'none', 'print: controls and grips hidden');
    ok(r.end && r.marks === 0, 'print: the final state has the right order and no marks');
    ok(r.k0, 'print: step 0 draws the author\'s start order, not the viewer\'s');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    r = await page.evaluate(() => DECK.slides[0]._comps[0].order().join());
    ok(r === '0,2,3,1', 'after printing the screen keeps the viewer\'s order (' + r + ')');
    await page.close();
  }

  // ---- 10. en
  {
    const en = buildDeck('en', 'en', [slide(mord('style="height:400px"', { question: 'Smallest first', items: ['one', 'two', 'three'], note: 'Count up', labels: { correct: 'Well done!' } }))]);
    const { page, errors } = await open(en);
    await page.evaluate(() => DECK.go(0, 0, false));
    await card(page, 0, 0);
    await page.keyboard.press(' '); await page.keyboard.press('ArrowUp');
    const moved = await page.evaluate(() => DECK.slides[0]._comps[0].say.textContent);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press(' ');
    await page.evaluate(() => { DECK.go(0, 1, false); DECK.seek(0, 1, Infinity); });
    const r = await page.evaluate(() => { const c = DECK.slides[0]._comps[0]; return { mark: c.markEl.textContent, label: c.cards[0].btn.getAttribute('aria-label'), all: [...c.querySelectorAll('text')].map((t) => t.textContent).join(' ') + ' ' + c.say.textContent + ' ' + c.help.textContent }; });
    ok(moved === 'Moved to position 2', 'en: "Moved to position 2" (got ' + moved + ')');
    ok(r.mark === 'Well done!' && r.label === 'one, position 1 of 3', 'en: labels.correct overrides the mark; card labels in English (' + r.mark + ', ' + r.label + ')');
    ok(!/[぀-ヿ一-鿿]/.test(r.all), 'en: no Japanese in the drawing or the announcements');
    ok(errors.length === 0, 'en: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }

  // ---- 11. vertical-writing slides (the demo's second slide is one and fits)
  {
    const tate = buildDeck('tate', 'ja', [slide(mord('style="width:320px;height:300px"', { question: '順に並べよう', items: ['王の話を聞いて激怒する', '友を人質にして村へ帰る', '妹の結婚式を挙げる', '日没までに刑場へ着く'] }), 'layout-tate')]);
    const { page, errors } = await open(tate);
    const r = await page.evaluate(() => ({ rep: EGATARI_PARTS_SHIM.reports().map((x) => x.code + ' ' + x.msg), wm: getComputedStyle(DECK.slides[0]._comps[0]).writingMode, parent: getComputedStyle(DECK.slides[0]._comps[0].parentElement).writingMode }));
    ok(r.parent.startsWith('vertical') && r.wm === 'horizontal-tb', 'in a vertical slide the part stays horizontal');
    ok(r.rep.length >= 1 && r.rep.every((m) => /^layout \[order\] .*vertically/.test(m)), 'too small in a vertical slide: ctx.report("layout", "[order] …") (' + r.rep.join(' / ') + ')');
    ok(errors.length === 0, 'tate: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
    const d = await open(out);
    const demo = await d.page.evaluate(() => ({ rep: EGATARI_PARTS_SHIM.reports().length, wm: getComputedStyle(DECK.slides[1]._comps[0].parentElement).writingMode }));
    ok(demo.rep === 0 && demo.wm.startsWith('vertical'), 'the demo\'s vertical slide fits without a report');
    await d.page.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

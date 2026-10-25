// m-timer, built with the pinned Egatari Studio:
//   1. duration(k) = phases[k-1].sec (0 for the ready step)
//   2. the clock at t and in the final state; the total on the ready step
//   3. strings: Japanese and English decks (<html lang>), and the labels override
//   4. no +1/−1 min buttons without ctx.extend (Studio v0.4.3 has none)
//   5. with a fake ctx.extend (spec §8.4, egatari-spec 485ae54): ±60 is asked, the remaining time follows, a returned total is used,
//      −1 min stops at 0:00, + and − keys on a focused button, the extension persists across steps on the slide and resets on
//      ctx.reset and on entering the slide from another slide; egatari-input is dispatched
//   6. video: no buttons, the author's seconds; print: buttons hidden, the author's seconds, the screen keeps the extension
//   node tools/test-timer.mjs [work folder]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio, ROOT } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-timer-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const demo = path.join(ROOT, 'components', 'timer', 'demo.html');
const out = path.join(work, 'demo.out.html');
S.build(demo, out);
// the same demo as an English deck (in the Studio copy, where the component is overlaid)
const enSrc = path.join(S.compDir('timer'), 'out', 'test-timer-en-src.html'), enOut = path.join(work, 'demo-en.out.html');
fs.mkdirSync(path.dirname(enSrc), { recursive: true });
fs.writeFileSync(enSrc, fs.readFileSync(demo, 'utf8').replace('<html lang="ja"', '<html lang="en"'));
S.build(enSrc, enOut);
const browser = await S.browser.launch();
try {
  const open = async (file, query = '') => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(S.browser.fileUrl(file) + query);
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__c = (i) => DECK.slides[i]._comps[0];
      window.__v = (c) => ({ clock: c.clock.textContent, lab: c.lab.textContent, foot: c.foot.textContent, rows: c.rows.map((r) => r.tx.textContent) });
    });
    return { page, errors };
  };

  // ---- 1–4 (Japanese deck)
  {
    const { page, errors } = await open(out);
    const r = await page.evaluate(() => {
      const c = __c(0), o = {};
      o.dur = [0, 1, 2, 3].map((k) => c.duration(k));
      DECK.seek(0, 0, Infinity); o.ready = __v(c);
      DECK.seek(0, 1, 30); o.t30 = __v(c);
      DECK.seek(0, 1, 31.2); o.t31 = __v(c).clock;
      DECK.seek(0, 1, Infinity); o.end1 = __v(c);
      DECK.seek(0, 3, Infinity); o.end3 = __v(c);
      o.listDone = c.rows.map((x) => x.tx.style.fill);
      o.buttons = document.querySelectorAll('m-timer button').length;
      const d = __c(1); DECK.seek(1, 0, Infinity); o.lab0 = __v(d); DECK.seek(1, 1, 5); o.lab1 = __v(d); DECK.seek(1, 1, Infinity); o.lab1end = __v(d); DECK.seek(1, 2, Infinity); o.lab2end = __v(d);
      return o;
    });
    ok(r.dur.join() === '0,90,15,20', 'duration(k) = sec (0 for the ready step): ' + r.dur.join());
    ok(r.ready.clock === '2:05' && r.ready.lab === '合計', 'ready step: the total 2:05 under 合計');
    ok(r.t30.clock === '1:00' && r.t30.lab === '残り' && r.t30.foot === '', 't = 30 s of 90: 1:00 remaining');
    ok(r.t31 === '0:59', 't = 31.2 s: 0:59 (rounded up to the second)');
    ok(r.end1.clock === '0:00' && r.end1.lab === '時間です' && /次へ/.test(r.end1.foot), 'final state of a phase: 0:00, 時間です, → for the next');
    ok(r.end3.foot === '終了', 'final state of the last phase: 終了');
    ok(r.listDone.slice(0, 2).every((f) => f === 'var(--muted)') && r.listDone[2] === 'var(--fg)', 'finished phases are --muted in the list (not transparent)');
    ok(r.ready.rows[0] === '1　1分30秒　付箋に書く' && r.ready.rows[1] === '2　15秒　島で読み上げる', 'Japanese list: 1分30秒, 15秒');
    ok(r.lab0.lab === '全部で' && r.lab1.lab === 'あと' && r.lab1end.lab === 'そこまで' && r.lab1end.foot === 'そこまで。次へ進みます' && r.lab2end.foot === 'そこまで' && r.lab0.foot === '合図で始めます', 'labels override the built-in strings');
    ok(r.buttons === 0, 'no +1/−1 min buttons without ctx.extend');
    ok(errors.length === 0, 'no console error or warning' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }
  {
    const { page } = await open(enOut);
    const r = await page.evaluate(() => { const c = __c(0); DECK.seek(0, 0, Infinity); const a = __v(c); DECK.seek(0, 1, 10); const b = __v(c); DECK.seek(0, 1, Infinity); return { a, b, e: __v(c) }; });
    ok(r.a.lab === 'Total' && /press → to start/.test(r.a.foot) && r.a.rows[0] === '1  1 min 30 s  付箋に書く', 'English deck: Total, press → to start, 1 min 30 s');
    ok(r.b.lab === 'Remaining' && r.e.lab === "Time's up", 'English deck: Remaining, Time\'s up');
    await page.close();
  }

  // ---- 5. ctx.extend
  {
    const { page, errors } = await open(out);
    await page.evaluate(() => {
      window.__calls = []; window.__ev = [];
      // a fake player as Studio implements it: it keeps the step's total extension and returns it; ctx.extend(0) only reads it
      window.__tot = 0;
      window.__X = { mode: 'talk', extend: (s) => { if (s) __calls.push(s); __tot += s; return __tot; } };
      __c(0).addEventListener('egatari-input', (e) => __ev.push(e.detail.extend));
      DECK.go(0, 1, false); __c(0).render(1, 10, __X);
    });
    ok(await page.locator('m-timer').first().locator('button').count() === 2, 'with ctx.extend: two buttons');
    const plus = page.locator('m-timer').first().locator('button').nth(1), minus = page.locator('m-timer').first().locator('button').nth(0);
    const big = await plus.evaluate((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && parseFloat(getComputedStyle(e).fontSize) >= 24; });
    ok(big, 'buttons are at least 44 × 44 px with text ≥ 24 px');
    await plus.click();
    let r = await page.evaluate(() => ({ calls: __calls.slice(), clock: __c(0).clock.textContent, ev: __ev.slice(), focus: document.activeElement.tagName }));
    ok(r.calls.join() === '60' && r.clock === '2:20', '+1 min asks ctx.extend(60) and shows 2:20 (90 + 60 − 10 s)');
    ok(r.ev.join() === '60', 'egatari-input carries the extension');
    ok(r.focus !== 'BUTTON', 'a mouse click leaves no focus on the button (Space goes on to the next step)');
    await minus.click(); await minus.click();
    r = await page.evaluate(() => ({ calls: __calls.slice(), clock: __c(0).clock.textContent }));
    ok(r.calls.join() === '60,-60,-60' && r.clock === '0:20', '−1 min twice: 0:20');
    await minus.focus(); await page.keyboard.press('+');
    r = await page.evaluate(() => ({ calls: __calls.slice(), clock: __c(0).clock.textContent, step: DECK.state().step }));
    ok(r.calls[3] === 60 && r.clock === '1:20' && r.step === 1, 'the + key on a focused button adds a minute (the slide does not move)');
    await page.keyboard.press('-');
    r = await page.evaluate(() => {
      const c = __c(0), o = { clock: c.clock.textContent };
      DECK.go(0, 2, false); DECK.go(0, 1, false); c.render(1, 10, __X); o.back = c.clock.textContent;
      DECK.autoplay(true); DECK.autoplay(false); DECK.go(0, 1, false); c.render(1, 10, __X); o.auto = c.clock.textContent;
      __tot = 0; c.render(1, 10, { mode: 'talk', extend: __X.extend, reset: true }); o.reset = c.clock.textContent;   // the player resets its total when it passes ctx.reset
      c.render(1, 10, __X); c.extend(60); DECK.go(1, 0, false); __tot = 0; DECK.go(0, 1, false); c.render(1, 10, __X); o.otherSlide = c.clock.textContent;
      c.render(1, 80, __X); c.extend(-60); o.stop = c.clock.textContent; o.stopCall = __calls[__calls.length - 1];
      c.render(1, 10, { mode: 'talk', reset: true });
      c.render(1, 10, { mode: 'talk', extend: () => 30 }); c.extend(60); o.returned = c.clock.textContent;
      return o;
    });
    ok(r.clock === '0:20', 'the − key: back to 0:20');
    ok(r.back === '0:20', 'the extension persists across steps on the same slide');
    ok(r.auto === '0:20', 'an autoplay toggle does not reset it');
    ok(r.reset === '1:20', 'ctx.reset restores the author\'s 90 s');
    ok(r.otherSlide === '1:20', 'entering the slide from another slide restores the author\'s 90 s');
    ok(r.stop === '0:00' && r.stopCall === -10, '−1 min with 10 s left ends the phase now (asks −10, not −60)');
    ok(r.returned === '1:50', 'a total returned by ctx.extend is used (30 s: 90 + 30 − 10)');
    ok(errors.length === 0, 'no console error' + (errors.length ? ': ' + errors[0] : ''));
    // print: buttons hidden, the author's seconds; the screen keeps the extension afterwards
    await page.evaluate(() => { const c = __c(0); __tot = 0; c.render(1, 10, { mode: 'talk', reset: true }); c.render(1, 10, __X); c.extend(60); });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    r = await page.evaluate(() => { const c = __c(0); c.render(1, 10, __X); return { vis: [...document.querySelectorAll('m-timer button')].filter((e) => e.getBoundingClientRect().width > 0).length, clock: c.clock.textContent }; });
    ok(r.vis === 0 && r.clock === '1:20', 'print: no buttons, the author\'s 90 s');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    r = await page.evaluate(() => { const c = __c(0); c.render(1, 10, __X); return c.clock.textContent; });
    ok(r === '2:20', 'after printing, the screen keeps the extension');
    await page.close();
  }

  // ---- 6. video
  {
    const { page, errors } = await open(out, '?mode=video');
    const r = await page.evaluate(() => {
      const c = __c(0), calls = [];
      DECK.seek(0, 1, 10); c.render(1, 10, { mode: 'video', extend: (s) => calls.push(s) }); c.extend(60);
      return { buttons: document.querySelectorAll('m-timer button').length, clock: c.clock.textContent, calls: calls.length };
    });
    ok(r.buttons === 0 && r.calls === 0 && r.clock === '1:20', 'video: no buttons, no extension, the author\'s 90 s');
    ok(errors.length === 0, 'video: no console error' + (errors.length ? ': ' + errors[0] : ''));
    await page.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

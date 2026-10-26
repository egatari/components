// m-keyboard's lecture preview in a browser (pinned Egatari Studio): with ctx.preview (or ctx.mode === "lecture") the keys
// of later steps are drawn faint without the dot, at the theme's --preview-opacity read with getComputedStyle (0.45 only
// when the variable is missing); without preview they are not drawn; keys lit in the current step stay fully lit.
//   node tools/test-keyboard-preview.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { studio } from './studio.mjs';

const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-keyboard-preview-')));
fs.mkdirSync(work, { recursive: true });
const out = path.join(work, 'demo.html');
S.build(path.join(S.compDir('keyboard'), 'demo.html'), out);
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const b = await S.browser.launch();
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  // the chords slide: step 1 C E G, step 2 F A C5, step 3 G B D5
  const r = await p.evaluate(() => {
    const el = document.querySelectorAll('m-keyboard')[1];
    const op = (m) => [+el.K[m].lit.getAttribute('opacity'), +el.K[m].dot.getAttribute('opacity')];
    const root = document.documentElement.style;
    root.removeProperty('--preview-opacity');
    const had = getComputedStyle(el).getPropertyValue('--preview-opacity').trim();
    el.render(1, Infinity, { preview: true });
    const theme = { f: op(65), g: op(67), d5: op(74) };
    root.setProperty('--preview-opacity', '0.3');
    el.render(1, Infinity, { preview: true });
    const set = { f: op(65), g: op(67) };
    el.render(1, Infinity, { mode: 'lecture' });
    const lecture = op(65);
    el.render(1, Infinity, {});
    const none = op(65);
    root.removeProperty('--preview-opacity');
    return { had, theme, set, lecture, none };
  });
  const want = r.had === '' ? 0.45 : parseFloat(r.had);
  ok(Math.abs(r.theme.f[0] - want) < 1e-3 && r.theme.f[1] === 0, `later key faint at the theme's value or 0.45 (${r.had || 'missing'} → ${r.theme.f[0]}), no dot`);
  ok(r.theme.d5[0] === r.theme.f[0], 'keys of every later step are faint');
  ok(r.theme.g[0] === 1 && r.theme.g[1] === 1, 'a key lit now stays fully lit with its dot');
  ok(Math.abs(r.set.f[0] - 0.3) < 1e-3 && r.set.f[1] === 0, '--preview-opacity: 0.3 is read from the theme (' + r.set.f[0] + ')');
  ok(Math.abs(r.lecture[0] - 0.3) < 1e-3, 'ctx.mode === "lecture" (older players) previews too');
  ok(r.none[0] === 0 && r.none[1] === 0, 'without preview later keys are not drawn');
  ok(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors[0] : ''));
} finally { await b.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

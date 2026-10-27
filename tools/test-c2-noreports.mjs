// Components 2.0: valid data never reports. Every migrated element part's demo.html and every identity fixture
// (tools/fixtures/c2-identity/*.html), built with the pinned Egatari Studio through the registry shim, must produce no
// ctx.report record at all (of any code, registry failures included) while it is played: every slide and step at t = 0.3 and
// at its end, in the talk and lecture views, and after a tour of every slide. A part that starts throwing on valid data is
// otherwise hidden behind its placeholder (spec §6.1 Containment), and the identity test compares only the DOM of the
// baseline demo.
//
// A fixture written to test reports lists the reports it expects, exactly, in an HTML comment of its own (any words after
// the colon, then a JSON array):
//   <!-- c2-expected-reports: … [{"tag": "m-x", "key": "<slide key>", "code": "size", "msg": "[x] …"}, …] -->
// The records must then equal that list as a multiset (each report counted once per occurrence); nothing else is allowed.
//   node tools/test-c2-noreports.mjs [work dir] [--only name,name]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, pinLabel } from './studio.mjs';
import { migratedNames } from './parts.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args.splice(oi, 2)[1].split(',').map((n) => n.replace(/^m-/, ''))) : null;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const S = await studio();
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-c2-noreports-')));
fs.mkdirSync(work, { recursive: true });
const names = migratedNames(ROOT).filter((n) => !only || only.has(n));
const FX = path.join(ROOT, 'tools', 'fixtures', 'c2-identity');
const fixtures = fs.readdirSync(FX).filter((f) => f.endsWith('.html')).sort().filter((f) => !only || only.has(f.replace(/\.html$/, '')));
ok(names.length > 0, `migrated element parts: ${names.length}; fixtures: ${fixtures.length} (Studio ${pinLabel()})`);

// [label, built deck, expected reports]
const decks = [];
const expectedOf = (src, label) => {
  const m = src.match(/<!--\s*c2-expected-reports:\s*([\s\S]*?)-->/);
  if (!m) return [];
  try { return JSON.parse(m[1].slice(m[1].indexOf('['))); } catch (e) { ok(false, `${label}: c2-expected-reports is not JSON (${e.message})`); return []; }
};
for (const name of names) {
  const out = path.join(work, `demo-${name}.html`);
  try { S.build(path.join(S.compDir(name), 'demo.html'), out); decks.push([`components/${name}/demo.html`, out, []]); }
  catch (e) { ok(false, `components/${name}/demo.html: build: ${String(e.stderr || e.message).slice(0, 400)}`); }
}
for (const f of fixtures) {
  const src = fs.readFileSync(path.join(FX, f), 'utf8'), label = `tools/fixtures/c2-identity/${f}`;
  const dir = path.join(work, 'fixture-' + f.replace(/\.html$/, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), src);
  const out = path.join(dir, 'deck.out.html');
  try { S.build(path.join(dir, 'deck.html'), out); decks.push([label, out, expectedOf(src, label)]); }
  catch (e) { ok(false, `${label}: build: ${String(e.stderr || e.message).slice(0, 400)}`); }
}

const fmt = (r) => `${r.tag} (${r.key}) ${r.code}: ${r.msg}`;
const browser = await S.browser.launch();
try {
  for (const [label, out, expected] of decks) {
    const errors = [];
    let reports = null;
    for (const mode of ['talk', 'lecture']) {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
      await p.goto(S.browser.fileUrl(out));
      await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
      await p.evaluate(() => document.fonts.ready);
      reports = await p.evaluate(async (mode) => {
        if (mode !== 'talk') { DECK.mode = mode; document.documentElement.setAttribute('data-mode', mode); }
        DECK.slides.forEach((s, i) => { for (let k = 0; k <= s._max; k++) { DECK.seek(i, k, 0.3); DECK.seek(i, k, Infinity); } });
        for (let j = 0; j < DECK.slides.length; j++) { DECK.go(j, DECK.slides[j]._max, false); await new Promise((r) => setTimeout(r, 20)); }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return EGATARI_PARTS_SHIM.reports().map((r) => ({ tag: r.tag, key: r.key, code: r.code, msg: r.msg }));
      }, mode);
      await p.close();
      // each view is a fresh page, so its records are its own; both views must give the expected records
      const got = reports.map((r) => JSON.stringify([r.tag, r.key, r.code, r.msg])).sort();
      const want = expected.map((r) => JSON.stringify([r.tag, r.key, r.code, r.msg])).sort();
      const same = JSON.stringify(got) === JSON.stringify(want);
      ok(same, `${label} (${mode}): ${want.length ? `exactly its ${want.length} expected report(s)` : 'no ctx.report'}`
        + (same ? '' : `\n     got ${reports.length}: ${reports.map(fmt).join('\n         ') || '—'}${want.length ? `\n     expected ${want.length}: ${expected.map(fmt).join(' | ')}` : ''}`));
    }
    ok(errors.length === 0, `${label}: no console error` + (errors.length ? ': ' + errors[0] : ''));
  }
} finally { await browser.close(); }
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-c2-noreports: ok');
process.exit(fails ? 1 : 0);

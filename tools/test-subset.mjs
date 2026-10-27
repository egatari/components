// The subset step (Egatari spec §6.2 Subset) on m-kakijun, with tools/subset-produce.mjs as the producer:
//   1. the part declares build.subset {data: "OFL-1.1 data:chars", key: "char"} and glyphs (the characters it draws itself)
//   2. keeping every key gives the published index.js byte for byte (the published block is in the canonical form)
//   3. a lesson using あさ keeps only あ and さ in the block's chars; the kakijun-data block, the code and every other field
//      of the OFL block are unchanged
//   4. the licence notice survives: the BEGIN comment (copyright line and licence name before the data, spec §6.1 Notices),
//      the END marker and "_license" as the block's first field, equal to the published one
//   5. the recorded subset: {keys, sha256}: sha256 is the identity hash of the subset code as written; an editor applying
//      the same keys to its own trusted full copy gets the same bytes and hash; a changed byte or a different key set does not
//   6. in a browser (pinned Studio, the part through the registry shim): the あさ lesson draws exactly the same DOM with the
//      subset part as with the full part, at every step; a character the subset left out (い) is drawn plainly and reported
//      once as data, no exception
//   7. the subset size for the part's demo
//   node tools/test-subset.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { partClass, c2Bundle } from './parts.mjs';
import { subsetSpec, subsetCode, blockOf, produce, sha256, lessonChars } from './subset-produce.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const FILE = path.join(ROOT, 'components', 'kakijun', 'index.js');
const full = fs.readFileSync(FILE, 'utf8');
const C = partClass(full);
const spec = subsetSpec(full);

// 1
ok(JSON.stringify(C.build) === JSON.stringify({ subset: { data: 'OFL-1.1 data:chars', key: 'char' } }), `build.subset declared: ${JSON.stringify(C.build)}`);
ok(typeof C.glyphs === 'string' && C.glyphs.length > 0 && /\d/.test(C.glyphs) && ['と', 'め', 'は', 'ね', 'ら', 'い'].every((c) => C.glyphs.includes(c)), `glyphs: ${JSON.stringify(C.glyphs)} (stroke numbers and とめ・はね・はらい)`);

// 2
const block = (js) => JSON.parse(blockOf(js, spec.label).json);
const F = block(full);
const all = subsetCode(full, Object.keys(F.chars).join(''));
ok(all.code === full, `every key kept: the published index.js byte for byte (${Object.keys(F.chars).length} characters)`);

// 3
const LESSON = `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>Kakijun</title>
<!-- comments do not count: ほかの字 -->
<style>.x::after{content:"ん"}</style></head>
<body><div id="stage">
<section class="slide"><h2>Strokes</h2><div class="body"><m-kakijun text="あさ" style="height:320px"></m-kakijun></div></section>
</div></body></html>
`;
const NARR = '## Strokes {#s1}\n\nKakijun.\n';
const r = produce(full, [LESSON, NARR]);
const B = block(r.code);
ok(r.keys === 'あさ' && Object.keys(B.chars).join('') === 'あさ', `a lesson using あさ keeps only あ and さ (kept keys ${JSON.stringify(r.keys)}; comments and <style> do not count)`);
ok(JSON.stringify(B.chars.あ) === JSON.stringify(F.chars.あ) && JSON.stringify(B.chars.さ) === JSON.stringify(F.chars.さ), 'their strokes are the published ones');
const outside = (js) => { const b = blockOf(js, spec.label); return js.slice(0, b.start) + '@' + js.slice(b.end); };
ok(outside(r.code) === outside(full), 'the code outside the OFL block (the kakijun-data block among it) is unchanged');
const others = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'chars')));
ok(others(B) === others(F) && JSON.stringify(Object.keys(B)) === JSON.stringify(Object.keys(F)), 'every other field of the block is unchanged, in its order');

// 4
const begin = full.slice(full.indexOf('/* BEGIN ' + spec.label), blockOf(full, spec.label).start);
ok(r.code.includes(begin) && /SIL Open Font License 1\.1/.test(begin) && r.code.includes('/* END ' + spec.label + ' */'), 'the BEGIN comment (licence name, before the data) and the END marker survive');
ok(Object.keys(B)[0] === '_license' && JSON.stringify(B._license) === JSON.stringify(F._license) && /Copyright 2020 The Klee Project Authors/.test(JSON.stringify(B._license)), '"_license" survives as the first field, equal to the published one (copyright lines and licence)');

// 5
const rec = { keys: r.keys, sha256: r.sha256 };
ok(rec.sha256 === sha256(r.code) && /^[0-9a-f]{64}$/.test(rec.sha256) && r.full === sha256(full), `recorded subset {keys: ${JSON.stringify(rec.keys)}, sha256: ${rec.sha256.slice(0, 12)}…}; the entry keeps the published sha256 ${r.full.slice(0, 12)}…`);
const editor = subsetCode(full, rec.keys);
ok(editor.code === r.code && sha256(editor.code) === rec.sha256, 'an editor applying the recorded keys to its trusted full copy gets the same bytes and hash');
ok(sha256(r.code.replace('"あ": [', '"あ":  [')) !== rec.sha256 && subsetCode(full, 'あい').code !== r.code, 'a changed byte, or other keys, do not match');
ok(sha256(r.code.replace(/\n/g, '\r\n')) === rec.sha256, 'the hash is the identity hash (CRLF written gives the same)');

// 7
const demo = produce(full, [fs.readFileSync(path.join(ROOT, 'components', 'kakijun', 'demo.html'), 'utf8')]);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`     subset sizes: あさ ${kb(Buffer.byteLength(r.code))}; demo.html (${Array.from(demo.keys).length} characters: ${demo.keys}) ${kb(Buffer.byteLength(demo.code))}; full ${kb(Buffer.byteLength(full))}`);
ok(Buffer.byteLength(r.code) < Buffer.byteLength(full) / 4 && Buffer.byteLength(demo.code) < Buffer.byteLength(full), 'the subsets are smaller than the full part');

// 6
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-subset-')));
const bundle = c2Bundle(ROOT, 'kakijun');
ok(bundle.split(full).length === 2, 'the test bundle carries the full part once');
const build = (which, code, src) => {
  const dir = path.join(work, which);
  fs.mkdirSync(path.join(dir, 'components', 'kakijun'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), src);
  fs.writeFileSync(path.join(dir, 'components', 'kakijun', 'index.js'), bundle.split(full).join(code));
  S.build(path.join(dir, 'deck.html'), path.join(dir, 'deck.out.html'));
  return path.join(dir, 'deck.out.html');
};
const decks = { full: build('full', full, LESSON), subset: build('subset', r.code, LESSON), missing: build('missing', r.code, LESSON.replace('text="あさ"', 'text="あい"')) };
const b = await S.browser.launch();
try {
  const play = async (file) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
    await p.goto(S.browser.fileUrl(file));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    const out = await p.evaluate(() => {
      const el = document.querySelector('m-kakijun'), doms = [];
      for (let k = 0; k <= el.steps; k++) for (const t of [0.3, Infinity]) { DECK.seek(0, k, t); doms.push(el.outerHTML); }
      return { doms, steps: el.steps, plain: [...el.querySelectorAll('text')].map((t) => t.textContent).filter((s) => s === 'い').length,
        reports: EGATARI_PARTS_SHIM.reports().map((x) => x.code + ': ' + x.msg) };
    });
    await p.close();
    return { ...out, errors };
  };
  const f = await play(decks.full), s = await play(decks.subset), m = await play(decks.missing);
  ok(f.doms.length > 2 && JSON.stringify(f.doms) === JSON.stringify(s.doms), `あさ: the subset part draws the same DOM as the full part at every step (${f.steps} steps, ${f.doms.length} frames)`);
  ok(!f.reports.length && !s.reports.length && !f.errors.length && !s.errors.length, 'no report or console error with either');
  ok(m.plain === 1 && m.reports.length === 1 && /^data: \[kakijun\] no stroke data for "い" in this copy/.test(m.reports[0]) && !m.errors.length,
    'あい with the あさ subset: い is drawn plainly and reported once as data' + (m.reports.length ? ': ' + m.reports.join(' | ') : '') + (m.errors.length ? ' / ' + m.errors[0] : ''));
} finally { await b.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\ntest-subset: ok');
process.exit(fails ? 1 : 0);

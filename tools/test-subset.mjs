// The subset step (Egatari spec §6.2 Subset, egatari-spec ce96072) on m-kakijun, with tools/subset-produce.mjs as the producer:
//   1. the part declares build.subset [{data: "block:strokes", key: "char"}, {data: "block:stroke-meta", key: "char"}] and
//      glyphs (the characters it draws itself)
//   2. keeping every key gives blocks equal in value to the published ones, and every byte outside the markers unchanged
//   3. a lesson using あさ keeps only あ and さ in both blocks (and the strokes block's "_" members); each block is
//      JSON.stringify of the kept value (members in their original order, no added whitespace); the code outside the
//      markers is byte for byte the published code
//   4. the licence notice survives: the OFL notice comment directly before the strokes marker (licence name, spec §6.1
//      Notices), the markers, and "_license" as the block's first member, equal to the published one
//   5. the recorded subset: {keys, sha256}: sha256 is the identity hash of the subset code as written; an editor applying
//      the same keys to its own trusted full copy gets the same bytes and hash; a changed byte or a different key set does not
//   6. in a browser (pinned Studio, the part through the registry shim): the あさ lesson draws exactly the same DOM with the
//      subset part as with the full part, at every step; a character the subset left out (い) is drawn plainly and reported
//      once as data, no exception
//   7. the subset size for あさ and for the part's demo
//   node tools/test-subset.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio } from './studio.mjs';
import { partClass, c2Bundle } from './parts.mjs';
import { subsetSpecs, subsetCode, blockOf, produce, sha256, BLOCK } from './subset-produce.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const FILE = path.join(ROOT, 'components', 'kakijun', 'index.js');
const full = fs.readFileSync(FILE, 'utf8');
const C = partClass(full);
const specs = subsetSpecs(full);

// 1
ok(JSON.stringify(C.build) === JSON.stringify({ subset: [{ data: 'block:strokes', key: 'char' }, { data: 'block:stroke-meta', key: 'char' }] }), `build.subset declared: ${JSON.stringify(C.build)}`);
ok(typeof C.glyphs === 'string' && C.glyphs.length > 0 && /\d/.test(C.glyphs) && ['と', 'め', 'は', 'ね', 'ら', 'い'].every((c) => C.glyphs.includes(c)), `glyphs: ${JSON.stringify(C.glyphs)} (stroke numbers and とめ・はね・はらい)`);

// 2
const block = (js, name) => JSON.parse(blockOf(js, name).json);
const FS = block(full, 'strokes'), FM = block(full, 'stroke-meta');
const CH = Object.keys(FM);
const outside = (js) => specs.reduce((acc, sp) => { const b = blockOf(acc, sp.block); return acc.slice(0, b.start) + '@' + acc.slice(b.end); }, js);
const all = subsetCode(full, CH.join(''));
ok(JSON.stringify(block(all.code, 'strokes')) === JSON.stringify(FS) && JSON.stringify(block(all.code, 'stroke-meta')) === JSON.stringify(FM) && outside(all.code) === outside(full),
  `every key kept: both blocks equal in value to the published ones, the code outside the markers unchanged (${CH.length} characters)`);

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
const BS = block(r.code, 'strokes'), BM = block(r.code, 'stroke-meta');
const metaKeys = Object.keys(FS).filter((k) => k.startsWith('_'));
ok(r.keys === 'あさ' && Object.keys(BM).join('') === 'あさ' && JSON.stringify(Object.keys(BS)) === JSON.stringify([...metaKeys, 'あ', 'さ']),
  `a lesson using あさ keeps only あ and さ in both blocks, the strokes block's ${metaKeys.join(', ')} first (kept keys ${JSON.stringify(r.keys)}; comments and <style> do not count)`);
ok(JSON.stringify(BS.あ) === JSON.stringify(FS.あ) && JSON.stringify(BS.さ) === JSON.stringify(FS.さ) && JSON.stringify(BM.あ) === JSON.stringify(FM.あ), 'their strokes and stroke data are the published ones');
ok(specs.every((sp) => blockOf(r.code, sp.block).json === JSON.stringify(block(r.code, sp.block))), 'each block is JSON.stringify of the kept value (no added whitespace)');
ok(outside(r.code) === outside(full), 'every byte outside the markers is the published code');
ok(JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, BS[k]]))) === JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, FS[k]]))), 'the "_" members are unchanged');

// 4
const notice = full.slice(full.lastIndexOf('/* OFL-1.1 data', full.indexOf(BLOCK('strokes'))), full.indexOf(BLOCK('strokes')));
ok(/SIL Open Font License 1\.1/.test(notice) && /\*\/\s*$/.test(notice) && r.code.includes(notice + BLOCK('strokes')), 'the OFL notice comment (the licence name) stands directly before the strokes marker, in the subset too');
ok(Object.keys(BS)[0] === '_license' && JSON.stringify(BS._license) === JSON.stringify(FS._license) && /Copyright 2020 The Klee Project Authors/.test(JSON.stringify(BS._license)), '"_license" survives as the first member, equal to the published one (copyright lines and licence)');

// 5
const rec = { keys: r.keys, sha256: r.sha256 };
ok(rec.sha256 === sha256(r.code) && /^[0-9a-f]{64}$/.test(rec.sha256) && r.full === sha256(full), `recorded subset {keys: ${JSON.stringify(rec.keys)}, sha256: ${rec.sha256.slice(0, 12)}…}; the entry keeps the published sha256 ${r.full.slice(0, 12)}…`);
const editor = subsetCode(full, rec.keys);
ok(editor.code === r.code && sha256(editor.code) === rec.sha256 && subsetCode(full, 'さあ').code === r.code, 'an editor applying the recorded keys (in any order) to its trusted full copy gets the same bytes and hash');
ok(sha256(r.code.replace('"あ":[', '"あ": [')) !== rec.sha256 && subsetCode(full, 'あい').code !== r.code, 'a changed byte, or other keys, do not match');
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
  ok(m.plain === 1 && m.reports.length === 1 && /^data: \[kakijun\] no stroke data for "い"/.test(m.reports[0]) && !m.errors.length,
    'あい with the あさ subset: い is drawn plainly and reported once as data' + (m.reports.length ? ': ' + m.reports.join(' | ') : '') + (m.errors.length ? ' / ' + m.errors[0] : ''));
} finally { await b.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\ntest-subset: ok');
process.exit(fails ? 1 : 0);

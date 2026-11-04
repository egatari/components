// The library part `icons` (Tabler Icons outline, MIT):
//   1. tools/icons-import.mjs --check: the block, names.txt and the notice agree with the pinned version; no brand-* name
//   2. its build (subset by name, spec §6.2) is the value its factory returns; the manifest repeats it
//   3. a lesson naming chart-bar-popular and user keeps those (and the "_notice"), not chart-bar; the subset is small
//   3b. the word files (<lang>.json, #160): en.json from Tabler's tags; ja.json the core icons, each a known name with
//      distinct words; a wrong version, an unknown name or repeated words are refused
//   4. in a browser through the registry shim, with the subset code: svg() draws each path of the data with stroke
//      currentColor, 2 units, round caps and joins, aria-hidden, scaled to size; "+" and "*" paths are filled; an unknown
//      name draws the dashed placeholder and calls `missing` once (with the closest carried names for a typo); the value is frozen
//   node tools/test-icons.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';
import { c2Bundle, partDeclarations } from './parts.mjs';
import { produce, blockOf } from './subset-produce.mjs';
import { wordErrors, PIN } from './icons-import.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const FILE = path.join(ROOT, 'components', 'icons', 'index.js');
const full = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(blockOf(full, 'icons').json);
const names = Object.keys(data).filter((k) => !k.startsWith('_'));

// 1
let check = '';
try { check = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'icons-import.mjs'), '--check'], { encoding: 'utf8' }); } catch (e) { check = String(e.stdout || '') + String(e.stderr || ''); }
ok(/icons-import --check: ok/.test(check), check.trim());
ok(names.length > 4000 && !names.some((n) => n.startsWith('brand-')) && /Tabler Icons \d+\.\d+\.\d+/.test(data._notice) && /MIT/.test(data._notice), `${names.length} icons, no brand-*, the notice names the version and the licence`);

// 2
const D = partDeclarations(full, 'icons/index.js');
ok(JSON.stringify(D) === JSON.stringify({ build: { subset: [{ data: 'block:icons', key: 'name', match: 'name' }] } }), `declared by the factory's value: ${JSON.stringify(D)}`);

// 3
const LESSON = `<section class="slide"><h2>Sales</h2><div class="body"><m-cards><script type="application/json">{"cards":[{"icon":"chart-bar-popular","title":"Top"},{"icon":"user","title":"People"},{"icon":"no-such-icon","title":"?"}]}</script></m-cards></div></section>`;
const r = produce(full, [LESSON]);
const kept = Object.keys(JSON.parse(blockOf(r.code, 'icons').json));
ok(kept[0] === '_notice' && kept.includes('chart-bar-popular') && kept.includes('user') && !kept.includes('chart-bar') && r.keys === '' && r.names.includes('chart-bar-popular') && !r.names.includes('no-such-icon'),
  `the lesson keeps ${JSON.stringify(r.names)} and the _notice, not chart-bar; keys ""`);
// 3b
const words = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'components', 'icons', l + '.json'), 'utf8'));
const en = words('en'), ja = words('ja'), jaN = Object.keys(ja).filter((k) => !k.startsWith('_'));
ok(Object.keys(en).length > 4000 && en['chart-bar'].includes('statistics'), `en.json: ${Object.keys(en).length - 2} icons with Tabler's tags`);
ok(jaN.length >= 300 && ['chart-bar', 'user', 'school', 'coin'].every((n) => jaN.includes(n)) && jaN.every((n) => ja[n].length >= 3 && ja[n].length <= 6), `ja.json: ${jaN.length} core icons, 3–6 words each`);
const bad = wordErrors('ja.json', { _tabler: '0.0.1', _lang: 'ja', 'chart-bar': ['棒', '棒'], 'no-such-icon': ['x'] }, names, PIN.version);
ok(bad.length === 3 && /_tabler/.test(bad[0]) && bad.some((e) => /chart-bar: words/.test(e)) && bad.some((e) => /no-such-icon/.test(e)), `a wrong version, repeated words and an unknown name are refused (${bad.length})`);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`     sizes: full ${kb(Buffer.byteLength(full))}, this lesson ${kb(Buffer.byteLength(r.code))}`);
ok(Buffer.byteLength(r.code) < 12 * 1024, 'the subset part is under 12 KB');

// 4
const S = await studio();
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-icons-')));
fs.mkdirSync(work, { recursive: true });
const page0 = path.join(work, 'icons.html');
fs.writeFileSync(page0, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body><svg id="s" width="200" height="100"></svg>
<script>${c2Bundle(ROOT, 'icons').split(full).join(r.code).replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
const b = await S.browser.launch();
try {
  const page = await b.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(S.browser.fileUrl(page0));
  const out = await page.evaluate(() => {
    const I = EGATARI_PARTS_SHIM.get('icons', '1.0.0'), s = document.getElementById('s'), msgs = [];
    const g = I.svg('chart-bar-popular', { x: 10, y: 20, size: 48, cls: 'term' });
    s.appendChild(g);
    const u = I.svg('chart-bar', { size: 30, missing: (m) => msgs.push(m) });
    s.appendChild(u);
    I.svg('usr', { missing: (m) => msgs.push(m) });
    const bb = g.getBBox();
    return { status: EGATARI_PARTS_SHIM.status('icons@1.0.0'), frozen: Object.isFrozen(I), names: I.names(), paths: [...g.querySelectorAll('path')].map((p) => p.getAttribute('d')),
      style: g.getAttribute('style'), transform: g.getAttribute('transform'), aria: g.getAttribute('aria-hidden'), cls: g.getAttribute('class'),
      stroke: getComputedStyle(g.querySelector('path')).stroke, bw: bb.width, missing: u.getAttribute('data-missing'), rects: u.querySelectorAll('rect').length, upaths: u.querySelectorAll('path').length, msgs,
      has: [I.has('user'), I.has('chart-bar'), I.has('_notice')], near: I.near('chart-bar-populr') };
  });
  ok(out.status === 'ok' && out.frozen && JSON.stringify(out.names) === JSON.stringify(r.names), `icons@1.0.0 defined through the registry with the subset code, frozen, names() = ${JSON.stringify(out.names)}`);
  ok(JSON.stringify(out.paths) === JSON.stringify(data['chart-bar-popular'].map((d) => d.replace(/^[+*]/, ''))), `chart-bar-popular: its ${out.paths.length} paths, as in the data`);
  ok(/fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;/.test(out.style) && out.aria === 'true' && out.cls === 'icon term' && out.transform === 'translate(10 20) scale(2)' && out.bw > 10 && out.bw <= 24,
    `stroke currentColor, 2 units, round; aria-hidden; class "icon term"; ${out.transform}`);
  ok(out.missing === 'chart-bar' && out.rects === 1 && !out.upaths && out.msgs.length === 2 && out.msgs[0] === "unknown icon 'chart-bar' (not a Tabler outline name, or not in this lesson's subset)" && out.msgs[1] === "unknown icon 'usr' (did you mean user?)",
    `an icon the subset left out: dashed box, one message each; a typo gets the closest carried name: ${JSON.stringify(out.msgs)}`);
  ok(JSON.stringify(out.has) === '[true,false,false]' && out.near[0] === 'chart-bar-popular', 'has() and near()');
  ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors[0] : ''));
  // filled paths ("+" and "*")
  const filled = names.filter((n) => data[n].some((d) => d[0] === '*')).slice(0, 1).concat(names.filter((n) => data[n].some((d) => d[0] === '+')).slice(0, 1));
  const fcode = produce(full, [filled.join(' ')]).code;
  fs.writeFileSync(page0, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><svg id="s"></svg><script>${c2Bundle(ROOT, 'icons').split(full).join(fcode)}</script></body></html>`);
  const p2 = await b.newPage();
  await p2.goto(S.browser.fileUrl(page0));
  const st = await p2.evaluate((ns) => ns.map((n) => [...EGATARI_PARTS_SHIM.get('icons', '1.0.0').svg(n).querySelectorAll('path')].map((p) => p.getAttribute('style') || '')), filled);
  ok(st[0].includes('fill:currentColor;stroke:none;') && st[1].includes('fill:currentColor;'), `filled paths: ${filled.join(', ')}`);
} finally { await b.close(); }

console.log(fails ? `\nFAIL: ${fails}` : '\ntest-icons: ok');
process.exit(fails ? 1 : 0);

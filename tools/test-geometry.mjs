// Studio's geometry check (R-geometry, backlog #201) on every components/*/demo.html: at the last step of each slide, labels that
// overlap, a line over a label, an edge through another box, a label outside its box. It measures only what parts mark with
// data-part (box, edge, label, mark; the contract is the header of kit/core/geometry-check.mjs). handoff #45: the parts that
// draw boxes and lines mark them, and their demos must show no geo* warning. "info" findings (a haloed label over a line) are
// listed and do not fail.
// The pinned Studio (tools/studio.json "commit") is older than the check, so the two pure modules are taken from the Studio
// commit "geometryCommit" (fetched into .studio-geometry/, read with git show) and run in the page built by the pinned Studio.
//   node tools/test-geometry.mjs [work dir] [name …]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, PIN, studio } from './studio.mjs';

const SHA = PIN.geometryCommit;
if (!/^[0-9a-f]{40}$/.test(SHA || '')) throw new Error('test-geometry: tools/studio.json "geometryCommit" must be a full sha');
const geoDir = path.join(ROOT, '.studio-geometry');
const git = (args) => execFileSync('git', args, { cwd: geoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const FILES = ['kit/core/geometry-check.mjs', 'kit/core/text-band.mjs'];
const have = () => FILES.every((f) => fs.existsSync(path.join(geoDir, SHA, f)));
if (!have()) {
  fs.mkdirSync(geoDir, { recursive: true });
  if (!fs.existsSync(path.join(geoDir, '.git'))) { git(['init', '--quiet']); git(['remote', 'add', 'origin', PIN.repository]); }
  git(['fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', SHA]);
  for (const f of FILES) {
    const dest = path.join(geoDir, SHA, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git(['show', SHA + ':' + f]));
  }
}
const { geometryScan, geometrySteps, WITHIN_ATTRS, WITHIN_NAME } = await import(pathToFileURL(path.join(geoDir, SHA, FILES[0])).href);
const { TEXT_BANDS, DEFAULT_BAND } = await import(pathToFileURL(path.join(geoDir, SHA, FILES[1])).href);

const args = process.argv.slice(2);
const work = path.resolve(args[0] && !/^[a-z][a-z0-9-]*$/.test(args[0]) ? args.shift() : fs.mkdtempSync(path.join(os.tmpdir(), 'test-geometry-')));
fs.mkdirSync(work, { recursive: true });
const names = args.length ? args
  : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html'))).sort();
const S = await studio();
let fails = 0, marked = 0;
// the control: an inline SVG marked by hand, an edge from A to B through C and a label of box A on that line, so the check must warn
const control = path.join(work, '_control');
fs.mkdirSync(control, { recursive: true });
fs.writeFileSync(path.join(control, 'deck.html'), `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>対照</title></head><body><div id="stage">
<section class="slide noconcl" id="s-control"><h2>対照</h2><div class="body"><svg viewBox="0 0 900 300" width="900" height="300">
<rect data-part="box" data-part-id="a" x="20" y="100" width="160" height="80" fill="none" stroke="currentColor"/>
<rect data-part="box" data-part-id="c" x="370" y="100" width="160" height="80" fill="none" stroke="currentColor"/>
<rect data-part="box" data-part-id="b" x="720" y="100" width="160" height="80" fill="none" stroke="currentColor"/>
<g data-part="edge" data-part-id="ab" data-part-from="a" data-part-to="b"><line data-part-line="" x1="180" y1="140" x2="720" y2="140" stroke="currentColor" stroke-width="3"/>
</g><text data-part="label" data-part-id="a" data-part-of="box" x="275" y="148" font-size="24" text-anchor="middle">線の上</text>
</svg></div></section>
<section class="slide noconcl" id="s-control2"><h2>対照 2</h2><div class="body"><svg viewBox="0 0 900 300" width="900" height="300">
<circle data-part="box" data-part-id="p" cx="100" cy="150" r="60" fill="none" stroke="currentColor"/>
<circle data-part="box" data-part-id="q" cx="450" cy="150" r="60" fill="none" stroke="currentColor"/>
<circle data-part="box" data-part-id="r" cx="800" cy="150" r="60" fill="none" stroke="currentColor"/>
<g data-part="edge" data-part-id="pr" data-part-from="p" data-part-to="r"><line data-part-line="" x1="160" y1="150" x2="740" y2="150" stroke="currentColor" stroke-width="3"/></g>
<circle data-part="mark" data-part-id="m" cx="100" cy="260" r="6" fill="currentColor"/>
<g data-part="edge" data-part-id="lead" data-part-from="m" data-part-to="m"><line data-part-line="" x1="106" y1="260" x2="300" y2="260" stroke="currentColor" stroke-width="2"/></g>
<text data-part="label" data-part-id="m" data-part-of="mark" data-part-at="outside" x="310" y="268" font-size="24">点の名前</text>
<g data-overlap="ok"><rect data-part="box" data-part-id="s" x="560" y="20" width="120" height="60" fill="none" stroke="currentColor"/>
<g data-part="edge" data-part-id="ov" data-part-from="@x" data-part-to="@y"><line data-part-line="" x1="520" y1="50" x2="720" y2="50" stroke="currentColor" stroke-width="2"/></g></g>
</svg></div></section>
</div></body></html>
`);
const scan = async (b, out) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const log = [];
  p.on('pageerror', (e) => log.push(e.message));
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
  await p.evaluate(`window.__geometryScan = ${geometryScan}; window.__geometrySteps = ${geometrySteps}`);
  const r = await p.evaluate(async (GEO) => {
    const found = [];
    let n = 0;
    for (let i = 0; i < DECK.slides.length; i++) {
      const s = DECK.slides[i];
      DECK.seek(i, s._max, Infinity);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const el = s.el || document.querySelectorAll('section.slide')[i];
      if (el.querySelector('[data-part]')) n++;
      for (const f of window.__geometryScan(el, GEO)) found.push({ slide: el.id || String(i), ...f });
      // every step of the slide (spec §8.4): a shape outside its frame (geoOutsideFrame) and a stroke cut at the SVG edge (geoClippedStroke)
      const fw = window.__geometrySteps(el, GEO, (k) => DECK.seek(i, k, Infinity), window.__geometryScan) || [];
      for (const f of fw) found.push({ slide: el.id || String(i), ...f });
      if (fw.length) { DECK.seek(i, s._max, Infinity); }
    }
    return { found, n };
  }, { bands: TEXT_BANDS, dflt: DEFAULT_BAND, overlap: 'data-overlap', within: WITHIN_ATTRS.within, frame: WITHIN_ATTRS.frame, name: WITHIN_NAME, clip: 'data-clip' });
  await p.close();
  return { ...r, log };
};
const b = await S.browser.launch();
try {
  S.build(path.join(control, 'deck.html'), path.join(work, '_control.out.html'));
  const c = await scan(b, path.join(work, '_control.out.html'));
  const codes = new Set(c.found.map((f) => f.code));
  const on = (id) => c.found.filter((f) => f.slide === id);
  const c2 = on('s-control2');
  // control 2: a circle box crossed by an edge is found; a leader from a mark to its own label and a box under data-overlap="ok" are not
  const okc = codes.has('geoEdgeThroughBox') && codes.has('geoLineOverLabel')
    && c2.length === 1 && c2[0].code === 'geoEdgeThroughBox' && JSON.stringify(c2[0].a).includes('"q"');
  if (!okc) for (const f of c.found) console.log('       ' + f.slide + ' ' + f.code + ' ' + JSON.stringify(f.a));
  if (!okc) fails++;
  console.log((okc ? 'ok   ' : 'FAIL ') + 'control: an edge through a rect or a circle box and a label on a line are found, a leader and data-overlap="ok" are not (' + [...codes].join(', ') + ')');
  for (const name of names) {
    const out = path.join(work, name + '.out.html');
    S.build(S.produced(path.join(ROOT, 'components', name, 'demo.html'), S.compDir(name)), out);
    const r = await scan(b, out), log = r.log;
    if (!r.n) continue;
    marked++;
    const warn = r.found.filter((f) => f.sev !== 'info'), info = r.found.filter((f) => f.sev === 'info');
    const line = (f) => `${f.slide} ${f.code} ${JSON.stringify(f.a)}`;
    if (warn.length || log.length) { fails++; console.log(`FAIL ${name}: ${r.n} marked slide(s)`); for (const f of warn) console.log('       ' + line(f)); for (const e of log) console.log('       page error: ' + e); }
    else console.log(`ok   ${name}: ${r.n} marked slide(s)` + (info.length ? `, ${info.length} info (${[...new Set(info.map((f) => f.code))].join(', ')})` : ''));
  }
} finally { await b.close(); }
console.log(fails ? `\nFAIL: ${fails} of ${marked} demo(s) with marks` : `\nOK (${marked} demo(s) with marks)`);
process.exit(fails ? 1 : 0);

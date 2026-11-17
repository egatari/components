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
const { geometryScan } = await import(pathToFileURL(path.join(geoDir, SHA, FILES[0])).href);
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
</div></body></html>
`);
const scan = async (b, out) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const log = [];
  p.on('pageerror', (e) => log.push(e.message));
  await p.goto(S.browser.fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
  await p.evaluate(`window.__geometryScan = ${geometryScan}`);
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
    }
    return { found, n };
  }, { bands: TEXT_BANDS, dflt: DEFAULT_BAND });
  await p.close();
  return { ...r, log };
};
const b = await S.browser.launch();
try {
  S.build(path.join(control, 'deck.html'), path.join(work, '_control.out.html'));
  const c = await scan(b, path.join(work, '_control.out.html'));
  const codes = new Set(c.found.map((f) => f.code));
  const okc = codes.has('geoEdgeThroughBox') && codes.has('geoLineOverLabel');
  if (!okc) fails++;
  console.log((okc ? 'ok   ' : 'FAIL ') + 'control: an edge through a box and a label on a line are found (' + [...codes].join(', ') + ')');
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

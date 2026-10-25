// Every test, in order (npm test). No network except the first fetch of the pinned Egatari Studio (tools/studio.mjs).
//   1. lint             layout and README frontmatter of each component (tools/lint.mjs)
//   2. catalog          CATALOG.md is up to date (tools/catalog.mjs --check); gallery.html likewise (tools/gallery.mjs --check)
//   3. scan-code        no eval-like code path in component code (tools/scan-code.mjs; Egatari spec §6)
//   4. expr-sync        the evaluator copied into m-sweep / m-curves equals tools/expr.js (tools/expr-sync.mjs --check)
//      variant-sync  the variant chooser copied into components equals tools/variant.js (tools/variant-sync.mjs --check)
//   5. release          the release tarball and manifest can be made and are deterministic (tools/release.mjs --check)
//   6. unit             the safe expression evaluator (tools/test-expr.mjs), m-codetree, m-kanbun / m-kobun / m-gendai parsing
//                       (tools/test-codetree.mjs, tools/test-kokugo.mjs; no browser)
//      (also tools/test-yanked.mjs: yanked.json becomes manifest.json's `yanked`; tools/test-variant.mjs: the variant choice;
//       tools/test-stats.mjs: m-hist / m-boxplot mean, median, mode, classes and quartiles by jp / inc / exc)
//   7. studio           fetch Egatari Studio at the pinned tag and overlay these components (tools/studio.mjs)
//   8. components       each demo.html: builds, no console errors, screenshots per step, determinism, text ≥ 24px, overlap, outside the slide (tools/test-components.mjs)
//   9. kanbun-num      m-kanbun's two-digit reading-order numbers stay inside their box and off the character boxes; one-digit numbers unchanged (tools/test-kanbun-num.mjs)
//      kanbun-fit     m-kanbun fits its columns to the element's height and width (size down to 42, kana ≥ 24 px, no overlap) and warns when it cannot (tools/test-kanbun-fit.mjs)
//  10. kobun-reset     m-kobun's open conjugation card closes on ctx.reset (tools/test-kobun-reset.mjs)
//      predict        m-predict's viewer input: ±1, typed counts, input(), reset on step entry, video, print, live, keys (tools/test-predict.mjs)
//      timer          m-timer: duration = sec, the clock, ja/en strings and labels, ctx.extend buttons (fake), video, print (tools/test-timer.mjs)
//  11. codetree-dom    m-codetree's DOM and pixels do not depend on the order of render calls (tools/test-codetree-dom.mjs)
//  12. shape            wrong-shaped data and refused expressions: inline placeholder and DECK.componentErrors, no exception (tools/test-shape.mjs)
//  13. seed0           variant 0 of every component with variants is pixel-identical to the last release (tools/test-seed0.mjs)
//  14. duration        every step is complete when its declared length ends (tools/test-duration.mjs)
//  15. contrast        every component text ≥ 4.5:1 in the default, kokugo and business themes (tools/test-contrast.mjs)
//  16. classes         choropleth classes evenly spaced in lightness (adjacent ΔL ≥ 0.08), lightest outlined, boundaries drawn (tools/test-classes.mjs)
//      map-small      m-map-japan at 300 / 240 px high and 420 px wide, and m-bars at 0 px: no console error, sizes ≥ 0, inside, text ≥ 24 px, territory names or a warning (tools/test-map-small.mjs)
//      map-territory  m-map-japan's territory rule at 9 heights × 5 widths × 2 layouts × 2 label settings, islands="all", author points on
//                     territory islands: 北方領土・竹島・尖閣諸島 always drawn, 沖ノ鳥島・南鳥島 drawn and named when shown, readable layer = drawn; no label or leader on an inset frame or caption (tools/test-map-territory.mjs)
//      map-data        m-map-japan's generated map block matches the sha256 recorded by tools/map/build-japan.mjs (no network)
//   node tools/test-all.mjs [--only name,name]
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT } from './studio.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-components-test-'));
const TESTS = [
  ['lint', ['tools/lint.mjs']],
  ['catalog', ['tools/catalog.mjs', '--check']],
  ['gallery', ['tools/gallery.mjs', '--check']],
  ['scan-code', ['tools/scan-code.mjs']],
  ['expr-sync', ['tools/expr-sync.mjs', '--check']],
  ['variant-sync', ['tools/variant-sync.mjs', '--check']],
  ['map-data', ['tools/map/build-japan.mjs', '--check']],
  ['release', ['tools/release.mjs', '--check']],
  ['test-expr', ['tools/test-expr.mjs']],
  ['test-yanked', ['tools/test-yanked.mjs']],
  ['test-variant', ['tools/test-variant.mjs']],
  ['test-stats', ['tools/test-stats.mjs']],
  ['test-codetree', ['tools/test-codetree.mjs']],
  ['test-kokugo', ['tools/test-kokugo.mjs']],
  ['studio', ['tools/studio.mjs']],
  ['test-components', ['tools/test-components.mjs', '--shots', path.join(tmp, 'shots')]],
  ['test-kanbun-num', ['tools/test-kanbun-num.mjs', path.join(tmp, 'kanbun-num')]],
  ['test-kanbun-fit', ['tools/test-kanbun-fit.mjs', path.join(tmp, 'kanbun-fit')]],
  ['test-kobun-reset', ['tools/test-kobun-reset.mjs', path.join(tmp, 'kobun-reset')]],
  ['test-predict', ['tools/test-predict.mjs', path.join(tmp, 'predict')]],
  ['test-timer', ['tools/test-timer.mjs', path.join(tmp, 'timer')]],
  ['test-codetree-dom', ['tools/test-codetree-dom.mjs', path.join(tmp, 'codetree-dom')]],
  ['test-shape', ['tools/test-shape.mjs', path.join(tmp, 'shape')]],
  ['test-seed0', ['tools/test-seed0.mjs', path.join(tmp, 'seed0')]],
  ['test-duration', ['tools/test-duration.mjs']],
  ['test-contrast', ['tools/test-contrast.mjs']],
  ['test-classes', ['tools/test-classes.mjs']],
  ['test-map-small', ['tools/test-map-small.mjs', path.join(tmp, 'map-small')]],
  ['test-map-territory', ['tools/test-map-territory.mjs', path.join(tmp, 'map-territory')]],
];
const oi = process.argv.indexOf('--only');
const only = oi >= 0 ? new Set(process.argv[oi + 1].split(',')) : null;
const failed = [];
for (const [name, args] of TESTS) {
  if (only && !only.has(name)) continue;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ok = r.status === 0;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${secs}s)`);
  if (!ok || process.env.CI) process.stdout.write((r.stdout || '') + (r.stderr || ''));
  if (!ok) failed.push(name);
}
console.log(failed.length ? `\nFAIL: ${failed.join(', ')}\nscreenshots: ${tmp}` : `\nOK (screenshots: ${tmp})`);
process.exit(failed.length ? 1 : 0);

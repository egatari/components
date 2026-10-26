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
//       tools/test-stats.mjs: m-hist / m-boxplot mean, median, mode, classes and quartiles by jp / inc / exc;
//       tools/test-numberline.mjs: m-numberline tick positions and labels, fractions, two lines aligned at 0, range levels and shared part)
//       tools/test-hissan.mjs: m-hissan's written calculations reproduce plain arithmetic; places in columns, quotient over the right digits;
//       tools/test-keyboard.mjs: m-keyboard's black-key positions and widths, key names, sound events per step, range errors;
//       tools/test-kakijun.mjs: m-kakijun's embedded stroke data equals data/kana/kana.json and its font block is the Egatari Kana subset;
//       every one of the 166 characters shows ≥ 99 % of its glyph in the final state; small kana inside their quarter in both writings)
//   7. studio           fetch Egatari Studio at the pinned commit and overlay these components (tools/studio.mjs)
//      studio-check     Studio's own checker (kit/check.mjs) on each demo.html: no error; warnings other than R-narr-steps listed (tools/test-studio-check.mjs)
//   8. components       each demo.html: builds, no console errors, screenshots per step, determinism, text ≥ 24px, overlap, outside the slide (tools/test-components.mjs)
//   9. kanbun-num      m-kanbun's two-digit reading-order numbers stay inside their box and off the character boxes; one-digit numbers unchanged (tools/test-kanbun-num.mjs)
//      kanbun-fit     m-kanbun fits its columns to the element's height and width (size down to 42, kana ≥ 24 px, no overlap) and warns when it cannot (tools/test-kanbun-fit.mjs)
//  10. kobun-reset     m-kobun's open conjugation card closes on ctx.reset (tools/test-kobun-reset.mjs)
//      predict        m-predict's viewer input: ±1, typed counts, input(), reset on step entry, video, print, live, keys (tools/test-predict.mjs)
//      keyboard-preview m-keyboard's lecture preview: later keys faint at the theme's --preview-opacity, no dot (tools/test-keyboard-preview.mjs)
//      timer          m-timer: duration = sec, the clock, ja/en strings and labels, ctx.extend buttons (fake), video, print (tools/test-timer.mjs)
//  11. codetree-dom    m-codetree's DOM and pixels do not depend on the order of render calls (tools/test-codetree-dom.mjs)
//      dom-order      every part's DOM at (k, end) is byte-identical straight and after seeking k+1, 0, k, in the talk and lecture views (tools/test-dom-order.mjs)
//      raster-history m-tree / m-venn / m-numberline: the pixels of a step do not depend on how often it was drawn before, nor on a click and ctx.reset (tools/test-raster-history.mjs)
//      syntax         m-syntax: reading the mark-up (roles, nested brackets, arrows, parts of speech, errors), steps, and in a browser the arrow ends,
//                     brackets beside their words across a wrapped line, console.warn for errors (tools/test-syntax.mjs)
//      timeline-gantt m-timeline's after arrows (ends, right angles, no band crossed), progress width, today line position, unit ticks (tools/test-timeline-gantt.mjs)
//  12. shape            wrong-shaped data and refused expressions: inline placeholder and DECK.componentErrors, no exception (tools/test-shape.mjs)
//  13. default-variant the default (first) variant of every component with variants is pixel-identical to the last release (tools/test-default-variant.mjs)
//      preview        answers under preview: with ctx.preview a part draws its later steps at --preview-opacity, or declares static preview = "none"
//                     and draws exactly the same; lecture-view screenshots (tools/test-preview.mjs)
//  14. duration        every step is complete when its declared length ends (tools/test-duration.mjs)
//  15. contrast        every component text ≥ 4.5:1 in the default, kokugo and business themes (tools/test-contrast.mjs)
//  16. classes         choropleth classes evenly spaced in lightness (adjacent ΔL ≥ 0.08), lightest outlined, boundaries drawn (tools/test-classes.mjs)
//      map-small      m-map-japan at 300 / 240 px high and 420 px wide, and m-bars at 0 px: no console error, sizes ≥ 0, inside, text ≥ 24 px, territory names or a warning (tools/test-map-small.mjs)
//      map-territory  m-map-japan's territory rule at 9 heights × 5 widths × 2 layouts × 2 label settings, islands="all", author points on
//                     territory islands: 北方領土・竹島・尖閣諸島 always drawn, 沖ノ鳥島・南鳥島 drawn and named when shown, readable layer = drawn; no label or leader on an inset frame or caption (tools/test-map-territory.mjs)
//      map-world      m-map-world: names = tools/map/atlas-names.csv; 北方領土 in Japan, 竹島・尖閣諸島・沖ノ鳥島・南鳥島 as dots of Japan,
//                     帰属未定地 white and never coloured with its 4 dashed lines, at 6 heights × 5 widths; Taiwan coloured with China
//                     as a country and by its own value; small sizes; the seam warning (tools/test-map-world.mjs)
//      map-data        m-map-japan's generated map block matches the sha256 recorded by tools/map/build-japan.mjs (no network)
//      map-data-world  the same for m-map-world (tools/map/build-world.mjs)
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
  ['map-data-world', ['tools/map/build-world.mjs', '--check']],
  ['release', ['tools/release.mjs', '--check']],
  ['test-expr', ['tools/test-expr.mjs']],
  ['test-yanked', ['tools/test-yanked.mjs']],
  ['test-variant', ['tools/test-variant.mjs']],
  ['test-stats', ['tools/test-stats.mjs']],
  ['test-numberline', ['tools/test-numberline.mjs']],
  ['test-hissan', ['tools/test-hissan.mjs']],
  ['test-keyboard', ['tools/test-keyboard.mjs']],
  ['test-codetree', ['tools/test-codetree.mjs']],
  ['test-kokugo', ['tools/test-kokugo.mjs']],
  ['studio', ['tools/studio.mjs']],
  ['test-studio-check', ['tools/test-studio-check.mjs']],
  ['test-components', ['tools/test-components.mjs', '--shots', path.join(tmp, 'shots')]],
  ['test-kakijun', ['tools/test-kakijun.mjs', path.join(tmp, 'kakijun')]],
  ['test-kanbun-num', ['tools/test-kanbun-num.mjs', path.join(tmp, 'kanbun-num')]],
  ['test-kanbun-fit', ['tools/test-kanbun-fit.mjs', path.join(tmp, 'kanbun-fit')]],
  ['test-kobun-reset', ['tools/test-kobun-reset.mjs', path.join(tmp, 'kobun-reset')]],
  ['test-predict', ['tools/test-predict.mjs', path.join(tmp, 'predict')]],
  ['test-timer', ['tools/test-timer.mjs', path.join(tmp, 'timer')]],
  ['test-keyboard-preview', ['tools/test-keyboard-preview.mjs', path.join(tmp, 'keyboard-preview')]],
  ['test-codetree-dom', ['tools/test-codetree-dom.mjs', path.join(tmp, 'codetree-dom')]],
  ['test-dom-order', ['tools/test-dom-order.mjs', path.join(tmp, 'dom-order')]],
  ['test-raster-history', ['tools/test-raster-history.mjs', path.join(tmp, 'raster-history')]],
  ['test-syntax', ['tools/test-syntax.mjs', path.join(tmp, 'syntax')]],
  ['test-timeline-gantt', ['tools/test-timeline-gantt.mjs', path.join(tmp, 'timeline-gantt')]],
  ['test-shape', ['tools/test-shape.mjs', path.join(tmp, 'shape')]],
  ['test-default-variant', ['tools/test-default-variant.mjs', path.join(tmp, 'default-variant')]],
  ['test-preview', ['tools/test-preview.mjs', path.join(tmp, 'preview')]],
  ['test-duration', ['tools/test-duration.mjs']],
  ['test-contrast', ['tools/test-contrast.mjs']],
  ['test-classes', ['tools/test-classes.mjs']],
  ['test-map-small', ['tools/test-map-small.mjs', path.join(tmp, 'map-small')]],
  ['test-map-territory', ['tools/test-map-territory.mjs', path.join(tmp, 'map-territory')]],
  ['test-map-world', ['tools/test-map-world.mjs', path.join(tmp, 'map-world')]],
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

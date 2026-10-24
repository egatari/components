// Every test, in order (npm test). No network except the first fetch of the pinned Egatari Studio (tools/studio.mjs).
//   1. lint             layout and README frontmatter of each component (tools/lint.mjs)
//   2. catalog          CATALOG.md is up to date (tools/catalog.mjs --check)
//   3. scan-code        no eval-like code path in component code (tools/scan-code.mjs; Egatari spec §6)
//   4. expr-sync        the evaluator copied into m-sweep / m-curves equals tools/expr.js (tools/expr-sync.mjs --check)
//   5. release          the release tarball and manifest can be made and are deterministic (tools/release.mjs --check)
//   6. unit             the safe expression evaluator (tools/test-expr.mjs), m-codetree, m-kanbun / m-kobun / m-gendai parsing
//                       (tools/test-codetree.mjs, tools/test-kokugo.mjs; no browser)
//      (also tools/test-yanked.mjs: yanked.json becomes manifest.json's `yanked`)
//   7. studio           fetch Egatari Studio at the pinned tag and overlay these components (tools/studio.mjs)
//   8. components       each demo.html: builds, no console errors, screenshots per step, determinism, text ≥ 24px, overlap, outside the slide (tools/test-components.mjs)
//   9. kanbun-num      m-kanbun's two-digit reading-order numbers stay inside their box and off the character boxes; one-digit numbers unchanged (tools/test-kanbun-num.mjs)
//  10. kobun-reset     m-kobun's open conjugation card closes on ctx.reset (tools/test-kobun-reset.mjs)
//  11. codetree-dom    m-codetree's DOM and pixels do not depend on the order of render calls (tools/test-codetree-dom.mjs)
//  12. shape            wrong-shaped data and refused expressions: inline placeholder and DECK.componentErrors, no exception (tools/test-shape.mjs)
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
  ['scan-code', ['tools/scan-code.mjs']],
  ['expr-sync', ['tools/expr-sync.mjs', '--check']],
  ['release', ['tools/release.mjs', '--check']],
  ['test-expr', ['tools/test-expr.mjs']],
  ['test-yanked', ['tools/test-yanked.mjs']],
  ['test-codetree', ['tools/test-codetree.mjs']],
  ['test-kokugo', ['tools/test-kokugo.mjs']],
  ['studio', ['tools/studio.mjs']],
  ['test-components', ['tools/test-components.mjs', '--shots', path.join(tmp, 'shots')]],
  ['test-kanbun-num', ['tools/test-kanbun-num.mjs', path.join(tmp, 'kanbun-num')]],
  ['test-kobun-reset', ['tools/test-kobun-reset.mjs', path.join(tmp, 'kobun-reset')]],
  ['test-codetree-dom', ['tools/test-codetree-dom.mjs', path.join(tmp, 'codetree-dom')]],
  ['test-shape', ['tools/test-shape.mjs', path.join(tmp, 'shape')]],
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

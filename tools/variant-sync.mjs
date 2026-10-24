// The variant chooser (tools/variant.js) is copied into each component that has presentation variants, between the
// BEGIN/END egatari-variant lines, for the same reason as tools/expr.js (tools/expr-sync.mjs): Studio loads a component's
// index.js alone, and an Egatari file records the sha256 of index.js only (spec §6). tools/variant.js is the one source.
//   node tools/variant-sync.mjs           write tools/variant.js into every component in USERS (the block or the @@VARIANT@@ line)
//   node tools/variant-sync.mjs --check   fail if a copy differs from tools/variant.js (npm test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BEGIN = '// ---- BEGIN egatari-variant ';
export const END = '// ---- END egatari-variant ----';
// Components with presentation variants (docs/conventions.md §1). A new one is added here
export const USERS = ['kpi', 'compare', 'venn', 'tree', 'fishbone', 'scatter', 'pie', 'timeline', 'cycle'];

const lf = (s) => s.replace(/\r\n?/g, '\n');
export function source(root = ROOT) { return lf(fs.readFileSync(path.join(root, 'tools', 'variant.js'), 'utf8')).replace(/\n+$/, ''); }
// The block in a component's text: {start, end} (end is after the END line), or null
export function block(text) {
  const a = text.indexOf(BEGIN);
  if (a < 0) return null;
  const e = text.indexOf(END, a);
  if (e < 0) return { start: a, end: -1 };
  return { start: a, end: e + END.length };
}

export function check(root = ROOT) {
  const errs = [], src = source(root);
  const dir = path.join(root, 'components');
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name, 'index.js');
    if (!fs.existsSync(f)) continue;
    const text = lf(fs.readFileSync(f, 'utf8')), b = block(text);
    if (!b) { if (USERS.includes(name)) errs.push(`components/${name}/index.js: no egatari-variant block (run node tools/variant-sync.mjs)`); continue; }
    if (!USERS.includes(name)) errs.push(`components/${name}/index.js: has an egatari-variant block but is not listed in tools/variant-sync.mjs USERS`);
    if (b.end < 0) { errs.push(`components/${name}/index.js: egatari-variant block without its END line`); continue; }
    if (text.slice(b.start, b.end) !== src) errs.push(`components/${name}/index.js: the egatari-variant block differs from tools/variant.js (run node tools/variant-sync.mjs)`);
    if (block(text.slice(b.end))) errs.push(`components/${name}/index.js: more than one egatari-variant block`);
  }
  return errs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const errs = check();
    for (const e of errs) console.log('FAIL ' + e);
    console.log(errs.length ? `\n${errs.length} problem(s)` : 'variant-sync: ok');
    process.exit(errs.length ? 1 : 0);
  }
  const src = source();
  for (const name of USERS) {
    const f = path.join(ROOT, 'components', name, 'index.js');
    let text = lf(fs.readFileSync(f, 'utf8'));
    const b = block(text);
    if (b && b.end > 0) text = text.slice(0, b.start) + src + text.slice(b.end);
    else if (text.includes('\n@@VARIANT@@\n')) text = text.replace('\n@@VARIANT@@\n', '\n' + src + '\n');
    else { console.log(`FAIL components/${name}/index.js: no egatari-variant block and no @@VARIANT@@ line`); process.exitCode = 1; continue; }
    fs.writeFileSync(f, text);
    console.log(`wrote components/${name}/index.js`);
  }
}

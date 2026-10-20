// The safe expression evaluator (tools/expr.js) is copied into each component that evaluates expressions, between the
// BEGIN/END egatari-expr lines: Studio loads a component's index.js alone, and an Egatari file records the sha256 of
// index.js only (spec §6), so the evaluator must be inside it. tools/expr.js is the one source; this keeps the copies equal.
//   node tools/expr-sync.mjs           write tools/expr.js into every component that has the block (or the @@EXPR@@ line)
//   node tools/expr-sync.mjs --check   fail if a copy differs from tools/expr.js (npm test runs this through tools/lint.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BEGIN = '// ---- BEGIN egatari-expr ';
export const END = '// ---- END egatari-expr ----';
// Components that evaluate expressions written by authors (attribute or data). A new one is added here
export const USERS = ['curves', 'sweep'];

const lf = (s) => s.replace(/\r\n?/g, '\n');
export function source(root = ROOT) { return lf(fs.readFileSync(path.join(root, 'tools', 'expr.js'), 'utf8')).replace(/\n+$/, ''); }
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
    if (!b) { if (USERS.includes(name)) errs.push(`components/${name}/index.js: no egatari-expr block (run node tools/expr-sync.mjs)`); continue; }
    if (!USERS.includes(name)) errs.push(`components/${name}/index.js: has an egatari-expr block but is not listed in tools/expr-sync.mjs USERS`);
    if (b.end < 0) { errs.push(`components/${name}/index.js: egatari-expr block without its END line`); continue; }
    if (text.slice(b.start, b.end) !== src) errs.push(`components/${name}/index.js: the egatari-expr block differs from tools/expr.js (run node tools/expr-sync.mjs)`);
    if (block(text.slice(b.end))) errs.push(`components/${name}/index.js: more than one egatari-expr block`);
  }
  return errs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const errs = check();
    for (const e of errs) console.log('FAIL ' + e);
    console.log(errs.length ? `\n${errs.length} problem(s)` : 'expr-sync: ok');
    process.exit(errs.length ? 1 : 0);
  }
  const src = source();
  for (const name of USERS) {
    const f = path.join(ROOT, 'components', name, 'index.js');
    let text = lf(fs.readFileSync(f, 'utf8'));
    const b = block(text);
    if (b && b.end > 0) text = text.slice(0, b.start) + src + text.slice(b.end);
    else if (text.includes('\n@@EXPR@@\n')) text = text.replace('\n@@EXPR@@\n', '\n' + src + '\n');
    else { console.log(`FAIL components/${name}/index.js: no egatari-expr block and no @@EXPR@@ line`); process.exitCode = 1; continue; }
    fs.writeFileSync(f, text);
    console.log(`wrote components/${name}/index.js`);
  }
}

// Egatari Studio's own checker (kit/check.mjs of the pinned Studio, tools/studio.json) on every components/*/demo.html,
// run the way Studio's CI runs it on its examples: `node kit/check.mjs <deck.html>` from the Studio folder (it builds the
// source in memory with the overlaid components; nothing is written next to the demo). Here with --json, to sort the results:
//   - any error fails (exit code 1 of the checker), and so does a check that did not finish (exit code 2, status "crashed")
//   - R-narr-steps warnings are ignored: the demos have no narration.md
//   - other warnings are listed, and do not fail
// The demos are checked a few at a time (each check is its own browser), and reported in name order.
//   node tools/test-studio-check.mjs [name …]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, studio } from './studio.mjs';

const S = await studio();
const IGNORE_RULES = new Set(['R-narr-steps']);
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(ROOT, 'components')).filter((n) => fs.existsSync(path.join(ROOT, 'components', n, 'demo.html'))).sort();
const JOBS = Math.max(1, Math.min(4, (os.availableParallelism?.() || os.cpus().length) - 1));
const check = (name) => new Promise((resolve) => {
  const demo = path.join(ROOT, 'components', name, 'demo.html');
  const p = spawn(process.execPath, [path.join(S.dir, 'kit', 'check.mjs'), demo, '--json', '--lang', 'en'], { cwd: S.dir });
  let stdout = '', stderr = '';
  p.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
  p.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
  p.on('close', (status) => resolve({ status, stdout, stderr }));
});
const results = new Array(names.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, names.length) }, async () => {
  while (next < names.length) { const i = next++; results[i] = await check(names[i]); }
}));

let fail = 0, warned = 0;
names.forEach((name, i) => {
  const r = results[i];
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* reported below */ }
  if (!j || r.status === 2 || j.status === 'crashed') {
    fail++;
    console.log(`FAIL ${name}: the checker did not finish (exit ${r.status})${r.stderr ? '\n' + r.stderr.trim() : ''}`);
    return;
  }
  const errors = j.results.filter((x) => x.sev === 'error');
  const warns = j.results.filter((x) => x.sev === 'warn' && !IGNORE_RULES.has(x.rule));
  const ignored = j.results.filter((x) => x.sev === 'warn' && IGNORE_RULES.has(x.rule)).length;
  const tail = `${ignored ? `, ${ignored} R-narr-steps ignored` : ''}`;
  if (errors.length || r.status !== 0) {
    fail++;
    console.log(`FAIL ${name}: ${errors.length} error(s), ${warns.length} warning(s)${tail}${errors.length ? '' : ` (exit ${r.status})`}`);
  } else console.log(`ok   ${name}: ${warns.length} warning(s)${tail}`);
  for (const x of errors) console.log(`   error ${x.code}${x.rule ? ` [${x.rule}]` : ''}: ${x.msg}`);
  for (const x of warns) console.log(`   warn  ${x.code}${x.rule ? ` [${x.rule}]` : ''}: ${x.msg}`);
  if (warns.length) warned++;
});
console.log(fail ? `\nFAIL: ${fail} demo(s) with checker errors` : `\ntest-studio-check: ok (${names.length} demos, ${warned} with warnings)`);
process.exit(fail ? 1 : 0);

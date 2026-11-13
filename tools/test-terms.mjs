// node tools/test-terms.mjs: this repository's public docs (part READMEs, CATALOG.md, README*.md, CONTRIBUTING*.md) and the
// gallery's own text (tools/gallery.mjs) use Studio's
// glossary. Runs Egatari Studio's own checker (tools/lint-terms.mjs --prose, with Studio's docs/terms.json) at a pinned commit, with
// this repository's allow list (tools/terms-allow.components.json). Fails on any avoid word and on an allow entry that is no longer used.
// The commit is STUDIO_TERMS_SHA, or termsCommit in tools/studio.json (the same pin as the site's CI). Code, fences and comments are
// not prose and are not checked (e.g. 段階 in code). Needs git and the network the first time (a shallow fetch into .studio-terms/).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, PIN } from './studio.mjs';

const sha = process.env.STUDIO_TERMS_SHA || PIN.termsCommit;
if (!/^[0-9a-f]{40}$/.test(sha || '')) { console.log('FAIL test-terms: no full sha in STUDIO_TERMS_SHA or tools/studio.json termsCommit'); process.exit(1); }
const dir = path.join(ROOT, '.studio-terms');
const run = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
let have = false;
try { have = run(['rev-parse', 'HEAD']) === sha; } catch { have = false; }
if (!have) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  run(['init', '--quiet']);
  run(['remote', 'add', 'origin', PIN.repository]);
  run(['fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', sha]);
  run(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  if (run(['rev-parse', 'HEAD']) !== sha) { console.log(`FAIL test-terms: fetched ${run(['rev-parse', 'HEAD'])}, not ${sha}`); process.exit(1); }
}
const globs = ['components/*/README*.md', 'CATALOG.md', 'README*.md', 'CONTRIBUTING*.md', 'tools/gallery.mjs'].flatMap((g) => ['--glob', g]);
const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'lint-terms.mjs'), '--root', dir, '--prose', ROOT, ...globs,
  '--allow', path.join(ROOT, 'tools', 'terms-allow.components.json')], { encoding: 'utf8' });
const out = (r.stdout + r.stderr).trim();
const summary = out.split('\n').filter((l) => l.startsWith('lint:terms')).pop() || '';
const unused = +((summary.match(/(\d+) unused allow/) || [])[1] || 0);
if (r.status !== 0 || unused > 0 || !summary) {
  console.log(out);
  console.log(`\nFAIL test-terms (Studio ${sha.slice(0, 8)})`);
  process.exit(1);
}
console.log(`${summary}\ntest-terms: ok (Studio ${sha.slice(0, 8)})`);

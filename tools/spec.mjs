// The pinned egatari-spec (tools/spec.json): its normative files, read at test time.
//   import { specFile } from './spec.mjs'; specFile('schema/rendered-markup-1.json')   → the file's text at the pinned commit
// .spec/ is a shallow fetch of exactly that commit (checked after checkout), like .studio/ (tools/studio.mjs).
// Environment: EGATARI_SPEC=<path> reads an existing checkout instead (its HEAD must be the pinned commit).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SPEC_PIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'spec.json'), 'utf8'));
const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

let dir = null;
export function specDir() {
  if (dir) return dir;
  if (process.env.EGATARI_SPEC) {
    const d = path.resolve(process.env.EGATARI_SPEC);
    const head = run(['rev-parse', 'HEAD'], d);
    if (head !== SPEC_PIN.commit) throw new Error(`spec: EGATARI_SPEC is at ${head}, tools/spec.json pins ${SPEC_PIN.commit}`);
    return (dir = d);
  }
  const d = path.join(ROOT, '.spec');
  let ok = false;
  try { ok = run(['rev-parse', 'HEAD'], d) === SPEC_PIN.commit; } catch { ok = false; }
  if (!ok) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    console.log(`spec: fetching ${SPEC_PIN.repository} ${SPEC_PIN.commit.slice(0, 7)} into .spec/`);
    run(['init', '--quiet'], d);
    run(['remote', 'add', 'origin', SPEC_PIN.repository], d);
    run(['fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', SPEC_PIN.commit], d);
    run(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], d);
    const head = run(['rev-parse', 'HEAD'], d);
    if (head !== SPEC_PIN.commit) throw new Error(`spec: fetched ${head}, expected ${SPEC_PIN.commit}`);
  }
  return (dir = d);
}
export const specFile = (rel) => fs.readFileSync(path.join(specDir(), rel), 'utf8');

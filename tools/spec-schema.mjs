// Files of the Egatari spec that tests read (egatari-spec, https://github.com/egatari/egatari-spec), pinned like Studio:
// a full commit and the SHA-256 of each file. A file is read from EGATARI_SPEC_DIR (a checkout of the spec) when that
// copy has the pinned hash, else from .spec/<commit>/ (fetched once from GitHub at the pinned commit; no other network).
//   specFile('schema/rendered-markup-1.json')   the file's text (throws if its hash is not the pinned one)
//   specJson(rel)                               the same, parsed
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT } from './studio.mjs';

export const SPEC = {
  commit: '8a410b0e30e7f831a8ecd2828ba26e58964a11bc',   // §6.2: normative rendered-markup list, renderers record, missing output
  files: { 'schema/rendered-markup-1.json': 'be39f19a58acfbf7115e28ef0fd751b03206e683e029344bda52ec3d19407116' },
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function specFile(rel) {
  const want = SPEC.files[rel];
  if (!want) throw new Error(`spec-schema: ${rel} is not pinned in tools/spec-schema.mjs`);
  const local = process.env.EGATARI_SPEC_DIR && path.join(process.env.EGATARI_SPEC_DIR, rel);
  if (local && fs.existsSync(local)) { const s = fs.readFileSync(local); if (sha(s) === want) return s.toString('utf8'); }
  const cached = path.join(ROOT, '.spec', SPEC.commit, rel);
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    const url = `https://raw.githubusercontent.com/egatari/egatari-spec/${SPEC.commit}/${rel}`;
    const body = execFileSync('curl', ['-sfL', '--retry', '3', url], { maxBuffer: 16 << 20 });
    fs.writeFileSync(cached, body);
  }
  const s = fs.readFileSync(cached);
  if (sha(s) !== want) throw new Error(`spec-schema: ${rel} at egatari-spec ${SPEC.commit.slice(0, 7)} has sha256 ${sha(s)}, not the pinned ${want}`);
  return s.toString('utf8');
}
export const specJson = (rel) => JSON.parse(specFile(rel));

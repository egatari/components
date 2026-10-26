// Parts of components 2.0 (Egatari spec §6.1), read without running them:
//   partMeta(js)   the meta of a part's egatariParts.define(meta, factory) call: {name, version, requires, element?}, or null
//                  for a 1.x part (DECK.define). The meta is written as an object literal of plain values (names and
//                  versions as strings), so it is read as JSON after quoting its keys; anything else is an error.
//   isLibrary(js)  a 2.0 part without `element` (a library part such as base or expr: other parts use it, it defines no element)
//   EXACT          an exact version (semver X.Y.Z with an optional pre-release); `requires` in a part are always exact
import fs from 'node:fs';
import path from 'node:path';

export const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const CALL = 'egatariParts.define(';

// The source with comments blanked (strings kept), so that a comment that mentions egatariParts.define is not read
function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
}

export function partMeta(js) {
  const code = stripComments(js);
  const at = code.indexOf(CALL);
  if (at < 0) return null;
  let i = at + CALL.length;
  while (/\s/.test(code[i])) i++;
  if (code[i] !== '{') throw new Error('egatariParts.define: the meta is not an object literal');
  let depth = 0, j = i, q = null;
  for (; j < code.length; j++) {
    const c = code[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  const lit = code.slice(i, j + 1);
  let meta;
  try { meta = JSON.parse(lit.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')); } catch (e) { throw new Error(`egatariParts.define: the meta ${lit} is not plain values (${e.message})`); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('egatariParts.define: the meta is not an object');
  return meta;
}

export const isLibrary = (js) => { const m = partMeta(js); return !!m && !m.element; };
export const isLibraryDir = (dir) => fs.existsSync(path.join(dir, 'index.js')) && isLibrary(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'));
// The order a producer writes parts in (spec §6.1 Order): every part after the parts it requires. parts: {name: meta}
// (one version per name, as in this repository). Throws on a cycle or a requirement that is not among the parts.
export function dependencyOrder(parts) {
  const out = [], state = {};
  const visit = (n, from) => {
    if (state[n] === 2) return;
    if (state[n] === 1) throw new Error(`parts: a cycle through ${n}`);
    if (!parts[n]) throw new Error(`parts: ${from} requires ${n}, which is not a part here`);
    state[n] = 1;
    for (const r of Object.keys(parts[n].requires || {}).sort()) visit(r, n);
    state[n] = 2;
    out.push(n);
  };
  for (const n of Object.keys(parts).sort()) visit(n);
  return out;
}

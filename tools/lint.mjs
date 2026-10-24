// The layout of each component (no browser):
//   components/<name>/index.js     defines <m-<name>> (DECK.define('m-<name>', …))
//   components/<name>/README.md    frontmatter: name (m-<name>), series, summary, steps, purposes (ids in purposes.json), props,
//                                  and variants when index.js declares `static variants` (the same names in the same order)
//   components/<name>/demo.html    a 1–2 slide sample deck (required for new components; m-sweep predates the rule)
// <name> is a registry name: ^[a-z][a-z0-9-]{0,63}$ (Egatari spec §6). Only regular files; no symbolic links, no out/ in git.
//   node tools/lint.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
export const SERIES = ['common', 'academic', 'business', 'kokugo', 'info', 'social'];
// Components released before demo.html was required (do not add to this list)
const NO_DEMO = new Set([]);

export const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
// purposes.json: id → entry
export function purposeIds(root) {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'purposes.json'), 'utf8'));
  return new Map(j.purposes.map((p) => [p.id, p]));
}

export function frontmatter(text) {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const x = line.match(/^([\w-]+):\s*(.*)$/);
    if (x) o[x[1]] = x[2].trim();
  }
  return o;
}

export function lint(root) {
  const errs = [];
  const base = path.join(root, 'components');
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'purposes.json'), 'utf8'));
  const seen = new Set();
  for (const p of pj.purposes) {
    if (!/^[a-z][a-z-]*$/.test(p.id || '') || seen.has(p.id)) errs.push(`purposes.json: id ${JSON.stringify(p.id)} is not a unique lower-case id`);
    seen.add(p.id);
    if (!p.ja || !p.en || !p.steps || !p.steps.ja || !p.steps.en) errs.push(`purposes.json: ${p.id} needs ja, en and steps.{ja,en}`);
  }
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    const name = d.name, dir = path.join(base, name);
    if (name.startsWith('.')) continue;
    if (!d.isDirectory()) { errs.push(`components/${name}: only component directories belong in components/`); continue; }
    if (!NAME_RE.test(name)) errs.push(`components/${name}: not a registry name (${NAME_RE})`);
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (rel === '' && e.name === 'out') continue;
        if (e.isSymbolicLink()) errs.push(`components/${name}/${r}: symbolic link`);
        else if (e.isDirectory()) walk(r);
      }
    };
    walk('');
    if (!fs.existsSync(path.join(dir, 'index.js'))) { errs.push(`components/${name}: no index.js`); continue; }
    const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
    if (!new RegExp(`['"]m-${name}['"]`).test(js)) errs.push(`components/${name}/index.js: does not define <m-${name}>`);
    if (!fs.existsSync(path.join(dir, 'demo.html')) && !NO_DEMO.has(name)) errs.push(`components/${name}: no demo.html`);
    const readme = path.join(dir, 'README.md');
    if (!fs.existsSync(readme)) { errs.push(`components/${name}: no README.md`); continue; }
    const f = frontmatter(fs.readFileSync(readme, 'utf8'));
    if (!f) { errs.push(`components/${name}/README.md: no frontmatter`); continue; }
    for (const k of ['name', 'series', 'summary', 'steps', 'props']) if (!(k in f)) errs.push(`components/${name}/README.md: frontmatter has no ${k}`);
    if (f.name && f.name !== `m-${name}`) errs.push(`components/${name}/README.md: name is ${f.name}, expected m-${name}`);
    if (f.series && !SERIES.includes(f.series)) errs.push(`components/${name}/README.md: series ${f.series} is not one of ${SERIES.join(', ')}`);
    const ids = purposeIds(root);
    if (!f.purposes) errs.push(`components/${name}/README.md: frontmatter has no purposes`);
    else for (const p of list(f.purposes)) {
      if (!ids.has(p)) errs.push(`components/${name}/README.md: purpose ${p} is not in purposes.json`);
      else if (ids.get(p).reserved) errs.push(`components/${name}/README.md: purpose ${p} is reserved in purposes.json (remove "reserved" there when a component serves it)`);
    }
    const sv = js.match(/static\s+variants\s*=\s*\[([^\]]*)\]/);
    const declared = sv ? [...sv[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : [];
    if (declared.join() !== list(f.variants).join()) errs.push(`components/${name}/README.md: variants (${f.variants || 'none'}) differ from static variants in index.js (${declared.join(', ') || 'none'})`);
  }
  return errs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errs = lint(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  for (const e of errs) console.log('FAIL ' + e);
  console.log(errs.length ? `\n${errs.length} problem(s)` : 'lint: ok');
  process.exit(errs.length ? 1 : 0);
}

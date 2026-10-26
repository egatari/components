// The layout of each component (no browser):
//   components/<name>/index.js     defines <m-<name>> (DECK.define('m-<name>', …))
//   components/<name>/README.md    frontmatter: name (m-<name>), series, summary, steps, purposes (ids in purposes.json), props,
//                                  license (optional: an SPDX expression MIT AND <id>, for a part carrying data under another licence),
//                                  and variants when index.js declares `static variants` (the same names in the same order)
//   components/<name>/demo.html    a 1–2 slide sample deck (required for new components; m-sweep predates the rule)
// Interactive parts (操作できるパーツ, docs/conventions.md §6): index.js declares `static interactive = true;` when the viewer can
// operate the part, and `static viewerInput = true;` when it also takes viewer input (spec §8.4). The flags stay out of the README
// (its frontmatter is shown to AI authors). A simple heuristic on index.js (comments ignored) finds parts that must say interactive:
//   a method input(…), addEventListener for click / dblclick / pointer* / mouse* / touch* / key* / input / change,
//   createElement of a / button / input / select / textarea, or child links as its data (static shape = {links: true, …}).
// It fails when such a part lacks `static interactive = true`, and when viewerInput is set without interactive.
// Answers under preview (docs/conventions.md §1.2, spec §8.4): a part whose later steps are an answer declares
// `static preview = "none";` (the only value) and shows nothing ahead; tools/release.mjs writes it to the manifest.
// <name> is a registry name: ^[a-z][a-z0-9-]{0,63}$ (Egatari spec §6). Only regular files; no symbolic links, no out/ in git.
//   node tools/lint.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
export const SERIES = ['common', 'academic', 'business', 'kokugo', 'info', 'social', 'music'];
// How a series is named to people (CATALOG.md, gallery). The ids above never change; `common` is 標準パーツ / Standard parts,
// `kokugo` 国語 / Japanese, `music` 音楽 / Music (subject series, like kokugo)
export const SERIES_LABEL = { common: '標準パーツ', academic: '数理・統計', business: 'ビジネス', kokugo: '国語', info: '情報', social: '地図（社会）', music: '音楽' };
// Components released before demo.html was required (do not add to this list)
const NO_DEMO = new Set([]);

// The flags declared in a component's index.js, and whether the heuristic above says it is operable by the viewer
export function flags(js) {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const operable = /^\s+input\s*\(/m.test(code)
    || /addEventListener\(\s*["'](click|dblclick|pointer\w*|mouse\w*|touch\w*|key\w*|input|change)["']/.test(code)
    || /createElement\(\s*["'](a|button|input|select|textarea)["']/.test(code)
    || /static\s+shape\s*=\s*\{\s*links\s*:\s*true/.test(code);
  const g = code.match(/static\s+group\s*=\s*"([a-z][a-z0-9-]*)"\s*;/), pv = code.match(/static\s+preview\s*=\s*"([^"]*)"\s*;/), tm = code.match(/static\s+tile\s*=\s*(\{.*\})\s*;\s*$/m);
  let tile = null, tileError = null;
  if (tm) { try { tile = JSON.parse(tm[1]); } catch (e) { tileError = e.message; } }
  return { interactive: /static\s+interactive\s*=\s*true\s*;/.test(code), viewerInput: /static\s+viewerInput\s*=\s*true\s*;/.test(code), clock: /static\s+clock\s*=\s*true\s*;/.test(code), operable,
    group: g ? g[1] : null, preview: pv ? pv[1] : null, previewWritten: !!pv || /static\s+preview\s*=/.test(code), tile, tileError, tileWritten: !!tm || /static\s+tile\s*=/.test(code) };
}
// SPDX ids a part may name in its README frontmatter license: (with the licence text it must carry)
export const LICENSES = { MIT: {}, 'OFL-1.1': { file: 'OFL.txt' } };
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
  for (const s of SERIES) if (!SERIES_LABEL[s]) errs.push(`tools/lint.mjs: series ${s} has no SERIES_LABEL (how CATALOG.md and the gallery name it)`);
  for (const p of pj.purposes) {
    if (!/^[a-z][a-z-]*$/.test(p.id || '') || seen.has(p.id)) errs.push(`purposes.json: id ${JSON.stringify(p.id)} is not a unique lower-case id`);
    seen.add(p.id);
    if (!p.ja || !p.en || !p.steps || !p.steps.ja || !p.steps.en) errs.push(`purposes.json: ${p.id} needs ja, en and steps.{ja,en}`);
    // the new-deck tile (Studio builds its tiles from these): reserved ids have none; the others say own, none or {into: <an own tile>}
    const tile = p.tile, owns = new Set(pj.purposes.filter((q) => q.tile === 'own').map((q) => q.id));
    if (p.reserved) { if (tile !== undefined) errs.push(`purposes.json: ${p.id} is reserved and must not have a tile yet`); }
    else if (tile === 'own') { if (!p.label || !p.label.ja || !p.label.en || !p.examples || !p.examples.ja || !p.examples.en) errs.push(`purposes.json: ${p.id} has its own tile and needs label.{ja,en} and examples.{ja,en}`); }
    else if (tile !== 'none' && !(tile && typeof tile === 'object' && owns.has(tile.into))) errs.push(`purposes.json: ${p.id}: tile must be "own", "none" or {"into": <an id with its own tile>}`);
    if (!p.reserved && (typeof p.icon !== 'string' || !/^[a-z][a-z0-9-]*$/.test(p.icon))) errs.push(`purposes.json: ${p.id} needs an icon key`);
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
    // license (optional): an SPDX expression for a part not wholly under the repository's MIT licence, e.g. MIT AND OFL-1.1.
    // It must name MIT (the code) and only licences from LICENSES; each other licence needs its text in the part's folder
    if ('license' in f) {
      const ids = f.license.split(/\s+AND\s+/);
      if (!ids.every((x) => LICENSES[x]) || !ids.includes('MIT')) errs.push(`components/${name}/README.md: license "${f.license}" is not MIT AND <one of ${Object.keys(LICENSES).filter((x) => x !== 'MIT').join(', ')}>`);
      for (const x of ids) if (LICENSES[x] && LICENSES[x].file && !fs.existsSync(path.join(dir, LICENSES[x].file))) errs.push(`components/${name}: license ${x} needs ${LICENSES[x].file} in the part's folder`);
    }
    const ids = purposeIds(root);
    if (!f.purposes) errs.push(`components/${name}/README.md: frontmatter has no purposes`);
    else for (const p of list(f.purposes)) {
      if (!ids.has(p)) errs.push(`components/${name}/README.md: purpose ${p} is not in purposes.json`);
      else if (ids.get(p).reserved) errs.push(`components/${name}/README.md: purpose ${p} is reserved in purposes.json (remove "reserved" there when a component serves it)`);
    }
    const fl = flags(js);
    if (fl.operable && !fl.interactive) errs.push(`components/${name}/index.js: the viewer can operate it (an input() method, a click/pointer/key/input/change listener, a link or control, or links as data): declare static interactive = true;`);
    // groups of parts the user chooses (docs/conventions.md §7): today only "tool"; a tool needs its own new-deck tile
    if (fl.group !== null && fl.group !== 'tool') errs.push(`components/${name}/index.js: static group must be "tool" (the only group so far)`);
    // answers under preview (docs/conventions.md §1.2, spec §8.4): a part whose later steps are an answer shows nothing ahead and says so
    if (fl.previewWritten && fl.preview !== 'none') errs.push(`components/${name}/index.js: static preview must be "none" (the only value; leave it out for a part that previews its later steps)`);
    if (fl.tileWritten && !fl.tile) errs.push(`components/${name}/index.js: static tile must be one line of JSON ({"label": {"ja", "en"}, "examples": {"ja", "en"}, "icon"})${fl.tileError ? ': ' + fl.tileError : ''}`);
    if (fl.group === 'tool' && !(fl.tile && fl.tile.label && fl.tile.label.ja && fl.tile.label.en && fl.tile.examples && fl.tile.examples.ja && fl.tile.examples.en && /^[a-z][a-z0-9-]*$/.test(fl.tile.icon || ''))) errs.push(`components/${name}/index.js: a tool (static group = "tool") needs static tile with label.{ja,en}, examples.{ja,en} and icon`);
    if (fl.viewerInput && !fl.interactive) errs.push(`components/${name}/index.js: static viewerInput = true needs static interactive = true`);
    for (const [k, s] of [['interactive', 'interactive'], ['viewer-input', 'viewerInput'], ['clock', 'clock']]) if (k in f) errs.push(`components/${name}/README.md: ${k} belongs in index.js (static ${s} = true), not in the README`);
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

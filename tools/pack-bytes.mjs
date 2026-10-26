// Pack-visible bytes of each component: what Egatari Studio's AI instruction pack carries for it (tools/make-llm-guide.mjs
// and kit/core/llm-pack-assemble.mjs in Studio), counted the way Studio's dev counts it for release notes:
//   - the README body outside <!-- llm: omit --> blocks, without lines that mention demo.html, examples/, tools/ or the
//     motion-components skill (Studio drops those: the AI cannot open them);
//   - the frontmatter's name, summary and steps (never its version: line, the part's own version (components 2.0), which
//     Studio's pack generator leaves out as well; a library part (base, shape, plot, expr) is not in the pack at all);
//   - each prop's type, default and doc in `static props`;
//   - the `static shape` summary (kit/shape.js brief of the schema, plus its note).
// All in UTF-8 bytes. The schema summary uses kit/shape.js of the pinned Egatari Studio (tools/studio.mjs, fetched on first use).
//   node tools/pack-bytes.mjs [--ref <git ref>] [--base <git ref>] [name …]
//     --ref   the version to count (default: the working tree)
//     --base  also count this version and print the difference (e.g. --base v1.10.0 for release notes)
//     name    components to count (timeline or m-timeline; default: all)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { ROOT, studio, componentNames } from './studio.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const ref = opt('--ref'), base = opt('--base');
const names = args.length ? args.map((n) => n.replace(/^m-/, '')) : componentNames();

const S = await studio();
const shapeCtx = {};
vm.createContext(shapeCtx);
vm.runInContext(fs.readFileSync(path.join(S.dir, 'kit', 'shape.js'), 'utf8'), shapeCtx, { filename: 'kit/shape.js' });
const brief = shapeCtx.DECK.shape.brief;

const read = (r, file) => {
  if (!r) { const p = path.join(ROOT, file); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
  try { return execFileSync('git', ['show', `${r}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};
const B = (s) => Buffer.byteLength(String(s ?? ''), 'utf8');

function count(r, name) {
  const md = read(r, `components/${name}/README.md`), js = read(r, `components/${name}/index.js`);
  if (md === null) return null;
  const text = md.replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) { const x = line.match(/^([\w-]+):\s*(.*)$/); if (x && x[1] !== 'version') fm[x[1]] = x[2].trim(); }
  const body = (m ? m[2] : text).replace(/<!--\s*llm:\s*omit\s*-->[\s\S]*?<!--\s*llm:\s*end\s*-->/g, '')
    .split('\n').filter((ln) => !/demo\.html|examples\/|tools\/|motion-components スキル/.test(ln)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let cls = null;
  if (js !== null) {
    const D = { define: (n, c) => { cls = c; }, MotionElement: class {} };
    const ctx = { DECK: D, window: { DECK: D } };
    vm.createContext(ctx);
    try { vm.runInContext(js, ctx, { filename: `${name}/index.js` }); } catch (e) { console.warn(`${name}: index.js could not be read (${e.message}); props and shape not counted`); }
  }
  const props = Object.values((cls && cls.props) || {}).reduce((n, d) => n + B(d.type) + (d.default === undefined ? 0 : B(typeof d.default === 'string' ? d.default : JSON.stringify(d.default))) + B(d.doc), 0);
  const sh = cls && cls.shape;
  const note = !sh || !sh.note ? '' : typeof sh.note === 'string' ? sh.note : [sh.note.ja, sh.note.en].filter(Boolean).sort((a, b) => B(b) - B(a))[0];
  const shape = sh && sh.schema ? B(brief(sh.schema)) + B(note) : 0;
  const parts = { readme: B(body), front: B(fm.name) + B(fm.summary) + B(fm.steps), props, shape };
  return { ...parts, total: parts.readme + parts.front + parts.props + parts.shape };
}

const pad = (s, n) => String(s).padStart(n);
console.log(`pack-visible bytes at ${ref || 'the working tree'}${base ? ` (Δ against ${base})` : ''}`);
console.log(`${'part'.padEnd(16)}${pad('readme', 8)}${pad('front', 7)}${pad('props', 7)}${pad('shape', 7)}${pad('total', 8)}${base ? pad('Δ', 7) : ''}`);
for (const name of names) {
  const c = count(ref, name);
  if (!c) { console.log(`${('m-' + name).padEnd(16)} (not at ${ref || 'the working tree'})`); continue; }
  const b = base ? count(base, name) : null;
  const d = !base ? '' : b ? pad((c.total - b.total >= 0 ? '+' : '') + (c.total - b.total), 7) : pad('new', 7);
  console.log(`${('m-' + name).padEnd(16)}${pad(c.readme, 8)}${pad(c.front, 7)}${pad(c.props, 7)}${pad(c.shape, 7)}${pad(c.total, 8)}${d}`);
}

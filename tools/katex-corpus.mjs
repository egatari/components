// The KaTeX builder corpus for tools/test-markup-reader.mjs: every formula in KaTeX's own documentation of what it supports,
// at the tag of the version the pinned Studio pins (tools/katex-produce.mjs KATEX_VERSION):
//   docs/support_table.md   every TeX function KaTeX lists, alphabetically, each with a rendered example
//   docs/supported.md       the same functions and the environments, by type, with examples
// The two files are fetched once from github.com/KaTeX/KaTeX at v<version> into .katex-docs/ (git-ignored) and checked against
// the SHA-256 below, so that the corpus is the same on every machine. A formula is the text between $ … $ (or $$ … $$,
// display) outside code spans, read with its braces balanced (\text{$a$} stays one formula). Formulas KaTeX itself refuses
// when the docs show them out of context (a table cell showing half of a group) are listed in REFUSED_IN_DOCS and skipped.
// Plus Egatari's own commands (spec §8.0): \hlE \hlT \hlM, \htmlId, \htmlData, \htmlClass, \morph.
//   import { katexCorpus } from './katex-corpus.mjs'; await katexCorpus() → [{tex, display, from}]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KATEX_VERSION } from './katex-produce.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DOCS = {
  'docs/support_table.md': 'f1c3be4ff8d7ba05165f442469024ab42f47d3e884b9bcbc94da91f21f9b3464',
  'docs/supported.md': '03cbca5bbd3ca50592af97f5daa31e4c401b798d0d847eb3285d7109a15a05c1',
};
// Formulas the docs show out of context, which KaTeX 0.19.0 refuses on their own (not a reader question)
export const REFUSED_IN_DOCS = new Set(['\\begingroup a}', 's\\hspace7ex k']);
// The docs define \VERT for | inside table cells ($\gdef\VERT{|}$ at the top of support_table.md)
export const DOC_MACROS = { '\\VERT': '|' };
export const EGATARI = [
  '\\hlE{x+y}', '\\hlT{f(x)}', '\\hlM{\\frac{a}{b}}', '\\htmlId{eq-1}{a+b}', '\\htmlData{mark=m1}{c}', '\\htmlClass{emph}{d}',
  '\\morph{p}{\\sqrt{x}}', 'a = \\hlE{\\sum_{i=1}^n x_i}',
];

async function fetchDoc(rel, sha) {
  const dir = path.join(ROOT, '.katex-docs', `v${KATEX_VERSION}`), file = path.join(dir, rel);
  const okFile = () => fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === sha;
  if (!okFile()) {
    const url = `https://raw.githubusercontent.com/KaTeX/KaTeX/v${KATEX_VERSION}/${rel}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`katex-corpus: ${url}: ${r.status}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    if (!okFile()) throw new Error(`katex-corpus: ${rel} at v${KATEX_VERSION} does not have the pinned SHA-256`);
  }
  return fs.readFileSync(file, 'utf8');
}

const ENT = { '&#124;': '|', '&#92;': '\\', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&nbsp;': ' ' };
export function formulas(md) {
  const out = [];
  md = md.replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
  for (const line0 of md.split('\n')) {
    const line = line0.replace(/`[^`]*`/g, '');
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] !== '$') continue;
      const display = line[i + 1] === '$';
      let j = i + (display ? 2 : 1), d = 0, s = '';
      for (; j < line.length; j++) {
        const c = line[j];
        if (c === '\\') { s += c + (line[j + 1] || ''); j++; continue; }
        if (c === '{') d++;
        if (c === '}') d--;
        if (c === '$' && d <= 0) break;
        s += c;
      }
      if (j >= line.length) break;
      out.push({ tex: s.replace(/&#124;|&#92;|&lt;|&gt;|&amp;|&nbsp;/g, (e) => ENT[e]), display });
      i = j + (display ? 1 : 0);
    }
  }
  return out;
}

export async function katexCorpus() {
  const out = [], seen = new Set();
  for (const [rel, sha] of Object.entries(DOCS)) {
    for (const f of formulas(await fetchDoc(rel, sha))) {
      const k = `${f.display}\u0000${f.tex}`;
      if (!f.tex.trim() || seen.has(k) || REFUSED_IN_DOCS.has(f.tex)) continue;
      seen.add(k);
      out.push({ ...f, from: rel });
    }
  }
  for (const tex of EGATARI) out.push({ tex, display: false, from: 'Egatari spec §8.0' });
  return out;
}

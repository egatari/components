// The stand-in producer (tools/katex-produce.mjs; Egatari spec §6.2 Render), without a browser:
//   - its KaTeX is the version the pinned Studio locks (KATEX_VERSION = .studio/package-lock.json = the loaded module)
//   - determinism: the same tex with the same version and options gives the same bytes, in one process and across two
//     processes (every formula of the six parts' demos and identity fixtures, produced twice in separate node processes)
//   - the record: renderers: {katex: {version, options}} once, at the top level of each element's data, exactly the
//     version and options used (the part's declared output "html"); no record elsewhere
//   - the shape: <field>Html beside every declared field that holds a string, for the paths of the spec's syntax
//     (nodes[].tex, center.tex, effect.tex, targets[].tex), and nothing else added
//   - a formula KaTeX refuses gets no <field>Html (the part shows its source, spec §6.2 Missing output) and a warning
//   node tools/test-katex-produce.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { studio } from './studio.mjs';
import { produce, katexOf, katexParts, at, optionsOf, render, macrosOf, KATEX_VERSION, BASE_OPTIONS } from './katex-produce.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const S = await studio();
const K = await katexOf();
const lock = JSON.parse(fs.readFileSync(path.join(S.dir, 'package-lock.json'), 'utf8')).packages['node_modules/katex'].version;
ok(K.katex.version === KATEX_VERSION && lock === KATEX_VERSION, `KaTeX ${K.katex.version} = the pinned Studio's lock (${lock}) = KATEX_VERSION ${KATEX_VERSION}`);

const parts = katexParts();
const names = Object.values(parts).map((p) => p.name).sort();
ok(JSON.stringify(names) === JSON.stringify(['collect', 'cycle', 'fishbone', 'flow', 'timeline', 'tree']), `parts with katex build fields: ${names.join(', ')}`);
for (const p of Object.values(parts)) ok(p.options.output === 'html', `m-${p.name}: declares output "html" (spec §6.2: allowed for fields whose meaning the part also gives as text)`);

// the decks: each part's demo and its identity fixture
const decks = [];
for (const n of names) {
  decks.push(path.join(ROOT, 'components', n, 'demo.html'));
  const fx = path.join(ROOT, 'tools', 'fixtures', 'c2-identity', `${n}.html`);
  if (fs.existsSync(fx)) decks.push(fx);
}
// produced twice, each time in its own process (nothing cached between them)
const outs = [1, 2].map((i) => decks.map((d) => execFileSync(process.execPath, [path.join(ROOT, 'tools', 'katex-produce.mjs'), d], { maxBuffer: 64 << 20 }).toString()));
ok(decks.every((d, j) => outs[0][j] === outs[1][j]), `determinism: ${decks.length} decks produced twice in separate processes are byte-identical`);

const JSON_SCRIPT = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/;
let formulas = 0, records = 0, extra = [];
const wantRecord = JSON.stringify({ version: KATEX_VERSION, options: { output: 'html', ...BASE_OPTIONS } });
decks.forEach((d, j) => {
  const src = fs.readFileSync(d, 'utf8'), out = outs[0][j];
  for (const [tag, p] of Object.entries(parts)) {
    const re = new RegExp(`<${tag}(?=[\\s>])[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
    const a = [...src.matchAll(re)], b = [...out.matchAll(re)];
    a.forEach((m, i) => {
      const ja = JSON_SCRIPT.exec(m[1]), jb = JSON_SCRIPT.exec(b[i][1]);
      if (!ja) return;
      let x, y;
      try { x = JSON.parse(ja[1]); y = JSON.parse(jb[1]); } catch { return; }
      const fields = p.fields.flatMap((f) => at(x, f));
      if (!fields.length) { if (JSON.stringify(x) !== JSON.stringify(y)) extra.push(`${path.basename(d)} <${tag}> #${i}: changed without a field`); return; }
      records++;
      if (JSON.stringify(y.renderers) !== JSON.stringify({ katex: JSON.parse(wantRecord) })) extra.push(`${path.basename(d)} <${tag}> #${i}: record ${JSON.stringify(y.renderers)}`);
      // without the additions, the data is the author's
      const z = JSON.parse(JSON.stringify(y));
      delete z.renderers;
      for (const f of p.fields) for (const { holder, key } of at(z, f)) {
        formulas++;
        if (typeof holder[key + 'Html'] !== 'string' || !holder[key + 'Html'].startsWith('<span class="katex">')) extra.push(`${path.basename(d)} <${tag}>: no ${key}Html for ${JSON.stringify(holder[key])}`);
        else if (holder[key + 'Html'] !== render(K.katex, holder[key], p.options, macrosOf(src, path.dirname(d), K.readMacros), [])) extra.push(`${path.basename(d)} <${tag}>: ${key}Html is not the render of ${JSON.stringify(holder[key])}`);
        delete holder[key + 'Html'];
      }
      if (JSON.stringify(z) !== JSON.stringify(x)) extra.push(`${path.basename(d)} <${tag}> #${i}: more than <field>Html and renderers added`);
      if (JSON.stringify(y).split('"renderers"').length - 1 !== 1) extra.push(`${path.basename(d)} <${tag}> #${i}: renderers recorded more than once`);
    });
  }
});
ok(formulas > 0 && extra.length === 0, `shape: ${formulas} formulas in ${records} elements each got <field>Html = KaTeX's markup beside the field, one record ${wantRecord} at the top of the data, nothing else`
  + (extra.length ? `\n     ${extra.slice(0, 5).join('\n     ')}` : ''));

// the same tex, rendered again and again in this process
const T = ['\\frac{a}{b}', '\\sqrt{x^2+1}', '\\mathrm{E}[\\theta\\mid D]', '\\hlE{x}', '\\overbrace{abc}^{n}', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'];
const o = optionsOf({ options: { katex: { output: 'html' } } }), m = macrosOf('', null, K.readMacros);
ok(T.every((t) => { const a = render(K.katex, t, o, m, []); return [1, 2, 3].every(() => render(K.katex, t, o, m, []) === a); }), `determinism: ${T.length} formulas rendered 4 times each in one process give the same bytes`);

// paths and a refused formula
const data = { center: { tex: 'c' }, nodes: [{ tex: 'a' }, { label: 'no tex' }, { tex: '\\frac{' }], effect: { tex: 'e' }, targets: [{ tex: 'x' }] };
const deck = `<m-cycle><script type="application/json">${JSON.stringify(data)}</script></m-cycle>`;
const r = await produce(deck, { parts: { 'm-cycle': { name: 'cycle', fields: ['nodes[].tex', 'center.tex'], options: o } } });
const y = JSON.parse(JSON_SCRIPT.exec(r.html)[1]);
ok(typeof y.center.texHtml === 'string' && typeof y.nodes[0].texHtml === 'string' && !('texHtml' in y.nodes[1]) && !('texHtml' in y.nodes[2]) && !('texHtml' in y.effect) && !('texHtml' in y.targets[0])
  && r.warnings.length === 1 && /KaTeX: .*\\frac\{/.test(r.warnings[0]), `paths: center.tex and nodes[].tex rendered, other fields untouched; a refused formula gets no texHtml and a warning (${r.warnings[0]})`);
ok(!/<\/script/i.test(r.html.slice(r.html.indexOf('>') + 1, r.html.lastIndexOf('</script>'))) && !/</.test(JSON_SCRIPT.exec(r.html)[1]), 'the produced JSON has no < (written \\u003c), so it cannot leave its <script>');

console.log(fails ? `\nFAIL: ${fails}` : '\ntest-katex-produce: ok');
process.exit(fails ? 1 : 0);

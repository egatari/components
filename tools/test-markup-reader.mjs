// components/markup-reader 1.0.0, the reader of build-time rendered output (Egatari spec §6.2 "Rendered output is data"):
//   1. list       its embedded element and attribute list equals egatari-spec's normative schema/rendered-markup-1.json at the
//                 commit pinned in tools/spec.json (tools/markup-sync.mjs --check; the spec is fetched into .spec/)
//   2. cases      the reader in a browser on small markups: what it keeps (namespaces, attributes, values, style one property
//                 at a time, text and entities) and what it drops (elements with their subtree, attributes, style
//                 declarations, URL-valued attributes, comments), with the list of what it dropped; texFrame without rendered
//                 output shows the source as text and reports once ("… not rendered at build time")
//   3. corpus     KaTeX's builder corpus (tools/katex-corpus.mjs: every formula of KaTeX 0.19.0's support_table.md and
//                 supported.md, and Egatari's \hlE \hlT \hlM \htmlId \htmlData \htmlClass \morph), rendered with the
//                 producer's options (tools/katex-produce.mjs) as htmlAndMathml (the default) and as html, read through the
//                 reader. It FAILS on anything dropped: each distinct drop is listed with how often and a formula that shows
//                 it. A drop is a gap between KaTeX and the spec's list, reported to standards as a needed spec change (or a
//                 decision that the construct is not for lessons); the reader never gets an exception.
//   4. faithful   for the html output, every formula with nothing dropped reads to the same DOM as katex.render made at play
//                 time (1.x), byte for byte, except the empty class="" katex.render writes and the style of an <svg> it
//                 writes as text (tools/test-c2-identity.mjs KATEX_EMPTY_CLASS, KATEX_SVG_STYLE)
//   node tools/test-markup-reader.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, studio, pinLabel } from './studio.mjs';
import { c2Bundle } from './parts.mjs';
import { SPEC_PIN } from './spec.mjs';
import { schemaList, blockOf, embedded, SCHEMA } from './markup-sync.mjs';
import { katexOf, macrosOf, optionsOf, render, KATEX_VERSION } from './katex-produce.mjs';
import { katexCorpus, DOC_MACROS } from './katex-corpus.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-markup-reader-')));
fs.mkdirSync(work, { recursive: true });

// ---- 1. the list
const list = schemaList();
ok(embedded().text === blockOf(list), `the embedded list equals egatari-spec ${SPEC_PIN.commit.slice(0, 7)} ${SCHEMA} (node tools/markup-sync.mjs)`);

// ---- the page: the registry shim, base (with shape) and the reader; KaTeX's own runtime only for the faithfulness check
const S = await studio();
const page0 = path.join(work, 'reader.html');
const katexJs = fs.readFileSync(path.join(S.dir, 'node_modules', 'katex', 'dist', 'katex.min.js'), 'utf8');
fs.writeFileSync(page0, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body><div id="out"></div>
<script>${c2Bundle(ROOT, 'markup-reader').replace(/<\/script/gi, '<\\/script')}</script>
<script>${katexJs.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
const browser = await S.browser.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(S.browser.fileUrl(page0));
ok(await page.evaluate(() => EGATARI_PARTS_SHIM.status('markup-reader@1.0.0')) === 'ok', 'markup-reader@1.0.0 is defined through the registry');

// ---- 2. cases: [markup, ns, expected outerHTML of the container's content, expected drops (substrings, in order)]
const CASES = [
  ['<span class="a" style="height:1em;vertical-align:-0.25em;">x</span>', 'html', '<span class="a" style="height: 1em; vertical-align: -0.25em;">x</span>', []],
  ['<span aria-hidden="true" id="eq-1" data-mark="m1">a&amp;b&lt;c&#x3e;&#8722;</span>', 'html', '<span aria-hidden="true" id="eq-1" data-mark="m1">a&amp;b&lt;c&gt;−</span>', []],
  ['<span style="color:red;margin-right:0.05em">x</span>', 'html', '<span style="margin-right: 0.05em;">x</span>', ['style color:red on <span>']],
  ['<span style="position:relative;top:calc(1em + 2px);display:inline-block">x</span>', 'html', '<span style="position: relative; display: inline-block;">x</span>', ['style top:calc(1em + 2px) on <span>']],
  ['<span onclick="alert(1)" title="t">x</span>', 'html', '<span>x</span>', ['attribute onclick', 'attribute title']],
  ['<span id="1bad" data-x_y="y" data-ok="&lt;b&gt;" data-Up="u">x</span>', 'html', '<span data-up="u">x</span>', ['attribute id=', 'attribute data-x_y', 'attribute data-ok']],
  ['<span>a<script>alert(1)</script>b<a href="javascript:x">l<span>in</span></a>c</span>', 'html', '<span>abc</span>', ['element <script>', 'element <a>']],
  ['<span>a<!-- c --><![CDATA[x]]>b</span>', 'html', '<span>ab</span>', ['a comment', '<![CDATA[']],
  ['<svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice"><path d="M0 0h1z"/></svg>', 'html',
    '<svg width="400em" height="1.08em" viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice"><path d="M0 0h1z"></path></svg>', []],
  ['<svg xmlns="http://www.w3.org/1999/xhtml"><path d="M0"/></svg>', 'html', '', ['declared in namespace']],
  ['<svg><g fill="currentColor"><path fill="url(#x)" d="M0"/><path fill="currentColor" stroke="none" d="M1"/><rect fill="red" width="1"/></g><foreignObject><span>x</span></foreignObject><use href="#a"/><image href="x.png"/></svg>', 'html',
    '<svg><g><path d="M0"></path><path fill="currentColor" stroke="none" d="M1"></path><rect width="1"></rect></g></svg>', ['attribute fill="currentColor" on <g>', 'attribute fill="url(#x)"', 'attribute fill="red"', 'element <foreignObject>', 'element <use>', 'element <image>']],
  ['<svg><text x="1" y="2" fill="currentColor">a<tspan baseline-shift="sub">b</tspan></text><title>t</title></svg>', 'html',
    '<svg><text x="1" y="2" fill="currentColor">a<tspan baseline-shift="sub">b</tspan></text><title>t</title></svg>', []],
  ['<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mi mathvariant="normal">x</mi><mo stretchy="false">(</mo></mrow><annotation encoding="application/x-tex">x(</annotation></semantics></math>', 'html',
    '<math display="block"><semantics><mrow><mi mathvariant="normal">x</mi><mo stretchy="false">(</mo></mrow><annotation encoding="application/x-tex">x(</annotation></semantics></math>', []],
  ['<math><mstyle mathcolor="red"><mi href="x">a</mi></mstyle><maction actiontype="toggle"><mi>b</mi></maction></math>', 'html', '<math><mstyle><mi>a</mi></mstyle></math>', ['attribute mathcolor', 'attribute href', 'element <maction>']],
  ['<span>unclosed<span>x', 'html', '<span>unclosed<span>x</span></span>', []],
  ['a</span>b', 'html', 'ab', ['an end tag </span> without its start']],
];
const res = await page.evaluate((cases) => {
  const MR = EGATARI_PARTS_SHIM.get('markup-reader', '1.0.0');
  return cases.map(([m, ns]) => { const d = document.createElement('div'); const drop = MR.read(m, d, ns); return { html: d.innerHTML, drop, ns: [...d.querySelectorAll('*')].map((e) => e.namespaceURI.split('/').pop()) }; });
}, CASES);
CASES.forEach(([m, , want, drops], j) => {
  const r = res[j];
  const dropsOk = r.drop.length === drops.length && drops.every((x, i) => r.drop[i].includes(x));
  ok(r.html === want && dropsOk, `read ${JSON.stringify(m.slice(0, 70))}: ${drops.length ? 'drops ' + drops.join(', ') : 'nothing dropped'}`
    + (r.html === want ? '' : `\n     got ${JSON.stringify(r.html)}\n     want ${JSON.stringify(want)}`) + (dropsOk ? '' : `\n     dropped ${JSON.stringify(r.drop)}`));
});
const nsr = await page.evaluate(() => {
  const MR = EGATARI_PARTS_SHIM.get('markup-reader', '1.0.0'), d = document.createElement('div');
  MR.read('<span><svg><path d="M0"/></svg><math><mi>x</mi></math></span>', d, 'html');
  return [...d.querySelectorAll('*')].map((e) => e.localName + ':' + e.namespaceURI);
});
ok(JSON.stringify(nsr) === JSON.stringify(['span:http://www.w3.org/1999/xhtml', 'svg:http://www.w3.org/2000/svg', 'path:http://www.w3.org/2000/svg', 'math:http://www.w3.org/1998/Math/MathML', 'mi:http://www.w3.org/1998/Math/MathML']),
  'each element is made in its namespace (HTML, SVG, MathML)');
// texFrame: rendered output read; missing output shown as source and reported once; drops reported once
const tf = await page.evaluate(() => {
  const MR = EGATARI_PARTS_SHIM.get('markup-reader', '1.0.0'), reports = [];
  const part = document.createElement('m-flow'), ctx = { report: (c, m) => reports.push([c, m]) };
  document.body.appendChild(part);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); part.appendChild(svg);
  const sk = MR.sink(part, ctx);
  const a = MR.texFrame(svg, 10, 20, { tex: 'x', texHtml: '<span class="katex">x</span>' }, 'tex', { size: 26 }, sk);
  const b = MR.texFrame(svg, 10, 20, { tex: '\\frac{a}{b}' }, 'tex', { size: 26 }, sk);
  MR.texFrame(svg, 10, 20, { tex: 'y' }, 'tex', { size: 26 }, sk);
  MR.texFrame(svg, 10, 20, { tex: 'z', texHtml: '<span style="color:red">z</span>' }, 'tex', { size: 26 }, sk);
  MR.texFrame(svg, 10, 20, { tex: 'w', texHtml: '<b>w</b>' }, 'tex', { size: 26 }, sk);
  return { a: a.firstChild.outerHTML, b: b.firstChild.textContent, cls: a.getAttribute('class'), reports };
});
ok(tf.cls === 'smath' && tf.a.startsWith('<div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; vertical-align: top; white-space: nowrap; line-height: 1; font-size: 26px;') && tf.a.endsWith('><span class="katex">x</span></div>'),
  'texFrame: the producer\'s texHtml read into the frame (foreignObject.smath, the div kit/deck.js made)' + (tf.cls === 'smath' ? '' : ` (${tf.cls})`));
ok(tf.b === '\\frac{a}{b}', 'texFrame without texHtml: the tex source as plain text (spec §6.2 Missing output)');
ok(JSON.stringify(tf.reports) === JSON.stringify([['data', '[flow] tex "\\\\frac{a}{b}" not rendered at build time (its source is shown as text)'],
  ['data', '[flow] rendered markup of tex "z": dropped style color:red on <span> (not in rendered-markup-1, spec §6.2)']]),
  'reports: once for missing output, once for dropped markup (ctx.report("data", "[<name>] …"))' + (fails ? '' : '') + (JSON.stringify(tf.reports).includes('not rendered') ? '' : `\n     ${JSON.stringify(tf.reports)}`));

// ---- 3. corpus, 4. faithful
const K = await katexOf();
const corpus = await katexCorpus();
const macros = { ...macrosOf('', null, K.readMacros), ...DOC_MACROS };
const outputs = { htmlAndMathml: optionsOf({}), html: optionsOf({ options: { katex: { output: 'html' } } }) };
for (const [out, options] of Object.entries(outputs)) {
  const warn = [], items = [];
  for (const f of corpus) {
    const m = render(K.katex, f.tex, { ...options, displayMode: f.display }, macros, warn);
    if (m !== null) items.push({ tex: f.tex, display: f.display, m });
  }
  ok(warn.length === 0, `corpus (${out}): KaTeX ${KATEX_VERSION} renders all ${corpus.length} formulas with the producer's options` + (warn.length ? `: ${warn.length} refused, e.g. ${warn[0]}` : ''));
  const r = await page.evaluate(({ items, out, macros }) => {
    const MR = EGATARI_PARTS_SHIM.get('markup-reader', '1.0.0'), byKey = {}, unfaithful = [];
    let same = 0;
    for (const it of items) {
      const d = document.createElement('div'), drop = MR.read(it.m, d, 'html');
      for (const x of drop) {
        // the kind of drop, without the value (style properties keep it when the property is listed but the value is not)
        const k = x.replace(/^(attribute [^=]+)=".*?" on (<[^>]+>)$/, '$1 on $2').replace(/^(element <[^>]+>) in <[^>]+>$/, '$1')
          .replace(/^style ([a-z-]+):.* on (<[^>]+>)$/, (all, p, t) => `style ${p} on ${t}`);
        const e = (byKey[k] ||= { n: 0, tex: [], example: x });
        e.n++;
        if (e.tex.length < 4 && !e.tex.includes(it.tex)) e.tex.push(it.tex);
      }
      if (out === 'html' && !drop.length) {
        const k = document.createElement('div');
        katex.render(it.tex, k, { displayMode: it.display, throwOnError: false, strict: 'ignore', output: 'html', macros: Object.assign({}, macros), trust: (c) => ['\\htmlClass', '\\htmlData', '\\htmlId'].includes(c.command) });
        // KATEX_EMPTY_CLASS and KATEX_SVG_STYLE (tools/test-c2-identity.mjs): katex.render's empty classes, and its svg style as
        // text, compared as declarations
        const svgStyle = (h) => h.replace(/(<svg\b[^>]*?\sstyle=")([^"]*)(")/g, (all, p, v, q) => p + v.split(';').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s*:\s*/, ': ')).join('; ') + ';' + q);
        const a = svgStyle(k.innerHTML.replace(/<span class=""/g, '<span')), b = svgStyle(d.innerHTML);
        if (a === b) same++; else if (unfaithful.length < 3) { let j = 0; while (a[j] === b[j]) j++; unfaithful.push({ tex: it.tex, at: j, katex: a.slice(Math.max(0, j - 60), j + 60), reader: b.slice(Math.max(0, j - 60), j + 60) }); }
      }
    }
    return { byKey, same, unfaithful };
  }, { items, out, macros });
  const keys = Object.keys(r.byKey).sort((a, b) => r.byKey[b].n - r.byKey[a].n);
  ok(keys.length === 0, `corpus (${out}): ${items.length} formulas read with nothing dropped` + (keys.length ? ` — ${keys.length} kinds of drop (each a gap for the spec's list, never a reader exception):\n`
    + keys.map((k) => `       ${String(r.byKey[k].n).padStart(5)} × ${k}   e.g. ${r.byKey[k].example}  in  ${r.byKey[k].tex.map((t) => JSON.stringify(t.length > 70 ? t.slice(0, 70) + '…' : t)).join(', ')}`).join('\n') : ''));
  if (out === 'html') {
    const clean = items.length - Object.values(r.byKey).length; // informative only
    ok(r.unfaithful.length === 0, `faithful (html): ${r.same} formulas with nothing dropped read to the DOM katex.render made at play time (1.x), but for its empty class="" and its svg style written as text`
      + (r.unfaithful.length ? `\n     differ: ${JSON.stringify(r.unfaithful, null, 1)}` : ''));
    void clean;
  }
}
ok(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(`(Studio ${pinLabel()}, KaTeX ${KATEX_VERSION}, egatari-spec ${SPEC_PIN.commit.slice(0, 7)})`);
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-markup-reader: ok');
process.exit(fails ? 1 : 0);

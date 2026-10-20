// Static scan of component code for ways to run text as code (Egatari spec §6: a registry component is trusted code
// reading untrusted data; it MUST NOT turn that data into code). Fails on, in every components/<name>/**/*.js and in
// tools/expr.js (the evaluator copied into components):
//   eval                          any use of the name
//   Function                      any use of the name (new Function, Function(…), Function.prototype, …)
//   constructor                   .constructor, ["constructor"], 'constructor' (the usual way to reach Function from a value)
//   setTimeout / setInterval / setImmediate / execScript   with a string or template literal as the first argument
//   import                        import(…) and import declarations (components are classic scripts)
//   document.write / writeln, innerHTML, outerHTML, insertAdjacentHTML, srcdoc, createContextualFragment, DOMParser,
//   javascript: in a string      unless listed in ALLOW below with the reason (constant markup only)
// Comments are skipped; strings and template literals are read as strings (their text is not scanned for names).
//   node tools/scan-code.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// HTML sinks that are allowed, with the reason: file → {sink: count}
export const ALLOW = {
  'components/menu/index.js': { insertAdjacentHTML: 1 },   // the constant SVG icons CHECK and EXT (no author data)
};
const NAMES = new Set(['eval', 'Function', 'constructor', 'import']);
const TIMERS = new Set(['setTimeout', 'setInterval', 'setImmediate', 'execScript']);
const HTML_SINKS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc', 'createContextualFragment', 'DOMParser']);

// A small JavaScript tokenizer: {k: 'id' | 'str' | 'num' | 'punct' | 'regex', s, line}
export function tokens(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  const regexAllowed = () => {
    const t = out[out.length - 1];
    if (!t) return true;
    if (t.k === 'num' || t.k === 'str' || t.k === 'regex') return false;
    if (t.k === 'id') return /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(t.s);
    return !/^[)\]}]$/.test(t.s);
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const start = line; let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          // ${ … } inside a template: scan it as code (nested braces counted)
          let d = 1, k = j + 2;
          while (k < n && d) { if (src[k] === '{') d++; else if (src[k] === '}') d--; k++; }
          for (const t of tokens(src.slice(j + 2, k - 1))) out.push({ ...t, line: line + t.line - 1 });
          j = k; continue;
        }
        if (src[j] === '\n') line++;
        s += src[j]; j++;
      }
      out.push({ k: 'str', s, q: c, line: start });
      i = j + 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; out.push({ k: 'id', s: src.slice(i, j), line }); i = j; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; out.push({ k: 'num', s: src.slice(i, j), line }); i = j; continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++; while (j < n && /[a-z]/.test(src[j])) j++;
      out.push({ k: 'regex', s: src.slice(i, j), line }); i = j; continue;
    }
    out.push({ k: 'punct', s: c, line }); i++;
  }
  return out;
}

export function scanText(src, rel) {
  const found = [], sinks = {};
  const t = tokens(src);
  for (let j = 0; j < t.length; j++) {
    const x = t[j], prev = t[j - 1], next = t[j + 1];
    const at = `${rel}:${x.line}`;
    if (x.k === 'id' && NAMES.has(x.s)) {
      // a property named in an object literal or a class body (x.import, { eval: 1 }) is still refused: keep the rule simple
      found.push(`${at}: ${x.s === 'constructor' ? '.constructor (reaches Function)' : x.s === 'import' ? 'import (dynamic import or module code)' : x.s}`);
    }
    if (x.k === 'str' && x.s === 'constructor') found.push(`${at}: "constructor" (reaches Function)`);
    if (x.k === 'str' && /(^|[\s;,"'(])(javascript|vbscript):/i.test(x.s)) found.push(`${at}: a javascript: URL in a string`);
    if (x.k === 'id' && TIMERS.has(x.s) && next && next.s === '(') {
      const a = t[j + 2];
      if (x.s === 'execScript' || (a && a.k === 'str')) found.push(`${at}: ${x.s} with a string (runs it as code)`);
    }
    if (x.k === 'id' && x.s === 'write' || x.k === 'id' && x.s === 'writeln') {
      if (prev && prev.s === '.' && t[j - 2] && t[j - 2].s === 'document') found.push(`${at}: document.${x.s}`);
    }
    if (x.k === 'id' && HTML_SINKS.has(x.s)) { sinks[x.s] = (sinks[x.s] || 0) + 1; }
  }
  const allow = ALLOW[rel] || {};
  for (const [s, k] of Object.entries(sinks)) if (k > (allow[s] || 0)) found.push(`${rel}: ${s} used ${k} time(s), ${allow[s] || 0} allowed (tools/scan-code.mjs ALLOW)`);
  for (const [s, k] of Object.entries(allow)) if ((sinks[s] || 0) < k) found.push(`${rel}: ALLOW lists ${k} ${s} but there are ${sinks[s] || 0} (tighten the list)`);
  return found;
}

export function files(root = ROOT) {
  const out = ['tools/expr.js'];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.name === 'out' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(r);
      else if (/\.(m?js|cjs)$/.test(e.name)) out.push(r);
    }
  };
  walk('components');
  return out;
}

export function scan(root = ROOT) {
  const found = [];
  for (const rel of files(root)) found.push(...scanText(fs.readFileSync(path.join(root, rel), 'utf8'), rel));
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = scan();
  for (const f of found) console.log('FAIL ' + f);
  console.log(found.length ? `\n${found.length} problem(s): component code must not run text as code (Egatari spec §6)` : `scan-code: ok (${files().length} files)`);
  process.exit(found.length ? 1 : 0);
}

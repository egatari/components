// The safe expression evaluator (tools/expr.js, copied into m-sweep and m-curves; no browser):
//   - the copies in the components equal tools/expr.js (tools/expr-sync.mjs --check)
//   - allowed expressions give exactly the value JavaScript gives (the way v1.0.1 evaluated them), at many points
//   - every expression in the demos gives the same values as before (Object.is, point by point)
//   - refused expressions: names outside the list, property access, calls of other functions, strings, [ ], =, ;, comma,
//     constructor, ^, too long, too deep — a SyntaxError, and nothing runs
//   - the same input gives the same output (no state between calls)
//   - the code scan (tools/scan-code.mjs) refuses eval-like code
//   node tools/test-expr.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';
import { check as syncCheck } from './expr-sync.mjs';
import { scanText } from './scan-code.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const ctx = vm.createContext({ Math, Object, Array, SyntaxError, Error, Number, String });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'expr.js'), 'utf8') + '\nthis.EXPR = EXPR;', ctx, { filename: 'tools/expr.js' });
const EXPR = ctx.EXPR;

const syncErrs = syncCheck();
ok(syncErrs.length === 0, 'the evaluator in m-sweep and m-curves is the same as tools/expr.js' + (syncErrs.length ? ': ' + syncErrs[0] : ''));

// How v1.0.1 evaluated (the reference; only here, in a test)
const N = (x, m, s) => Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI));
const OLD = {
  sweep: (f) => { const g = new Function('u', 'c', 'return ' + f + ';'); return (u, c) => g(u, c); },
  curves: (f) => { const g = new Function('x', 'N', 'with(Math){return ' + f + ';}'); return (x) => g(x, N); },
};
const NEW = {
  sweep: (f) => EXPR.compile(f, { name: 'f', vars: ['u', 'c'] }),
  curves: (f) => EXPR.compile(f, { name: 'f', vars: ['x'], funcs: { N }, bareMath: true }),
};
const XS = [];
for (let j = 0; j <= 300; j++) XS.push(-3.5 + 7 * j / 300);
XS.push(0, -0, 1e-12, 1, 2, 0.5, 10, -10, 1e300, Infinity, -Infinity, NaN);
const CS = [0, 0.25, 0.5, 1, 1.5, 2, -1, 3.7];
function same(kind, f) {
  const a = OLD[kind](f), b = NEW[kind](f);
  for (const x of XS) for (const c of kind === 'sweep' ? CS : [0]) {
    const va = a(x, c), vb = b(x, c);
    if (!Object.is(va, vb)) return `at ${x}${kind === 'sweep' ? ', c=' + c : ''}: ${va} vs ${vb}`;
  }
  return '';
}

// 1. expressions of the demos (read from every components/*/demo.html), and those of the Studio examples and docs
const demoExprs = { sweep: new Set(), curves: new Set() };
for (const name of fs.readdirSync(path.join(ROOT, 'components'))) {
  const f = path.join(ROOT, 'components', name, 'demo.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<m-sweep\b[^>]*?\sf="([^"]*)"/g)) demoExprs.sweep.add(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  for (const m of html.matchAll(/<m-curves\b[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/g)) {
    for (const s of JSON.parse(m[1])) if (typeof s.f === 'string') demoExprs.curves.add(s.f);
  }
}
ok(demoExprs.sweep.size >= 2 && demoExprs.curves.size >= 1, `the demos have expressions (${demoExprs.sweep.size} m-sweep, ${demoExprs.curves.size} m-curves)`);
const KNOWN = {
  // Studio's examples, templates, skills and docs (Egatari Studio up to v0.4.3)
  sweep: ['u*u + c*u', 'u*u + c', 'u*c', 'Math.exp(-c*u)', 'Math.exp(-u*c) + Math.sin(u)', '((1-c)**2)**u', '1/(1 + u*u/(c*c))', 'u*u + c*u*u*u + c*c*u**4'],
  curves: ['N(x,0,1)', 'x*x', 'x', '2 + x', '10 - x', 'abs(x)', 'x >= 0 ? 0.9*x : -0.1*x', 'exp(-x*x/2)', 'exp(-x*x/2)/sqrt(2*PI)',
    'exp(-pow(log(x),2)/(2*0.36))/(x*0.6*sqrt(2*PI))'],
};
// 2. more of the grammar
const MORE = {
  sweep: ['-u', '+u', '- -u', '!u', '(-u) ** 2', '-(u ** 2)', '2 ** -u', '2 ** 3 ** c', 'u % 1.5', 'u / c', '1e-3 * u', '.5 * u', '1. + u',
    'Math.PI * u', 'Math.E', 'Math.max(u, c, 1)', 'Math.min()', 'Math.hypot(u, c)', 'Math.atan2(u, c)', 'Math.sign(u) * Math.abs(u) ** c',
    'u < c ? 1 : u > 2 * c ? 2 : 3', 'u <= c && c >= 0.5 || u == c', 'u != c', 'u === c', 'u !== c', '(u > 0) + (c > 0)', 'u && c', 'u || c',
    'Math.floor(u) + Math.ceil(c) + Math.round(u * c) + Math.trunc(u)', 'Math.log(Math.abs(u)) + Math.log10(2) + Math.log2(8) + Math.log1p(c)',
    'Math.sqrt(Math.abs(u)) + Math.cbrt(u)', 'Math.sin(u) + Math.cos(u) + Math.tan(c)', 'Math.tanh(u) + Math.sinh(c) + Math.cosh(c)',
    'Math.exp(u) - Math.expm1(c)', 'Math.pow(u, c)', 'Math.LN2 + Math.LN10 + Math.LOG2E + Math.LOG10E + Math.SQRT2 + Math.SQRT1_2',
    '1 - u * c + u / 2 - c % 3', '((((u))))', 'u\n+\tc'],
  curves: ['sin(x) + Math.cos(x)', 'max(x, 0)', 'N(x, 1, 0.5) + N(x, -1, 2)', 'PI * x', 'E ** x', 'Math.PI * x', 'x < 0 ? -x : sqrt(x)', '-x * x', 'abs(x) ** 0.5'],
};
for (const kind of ['sweep', 'curves']) {
  for (const f of new Set([...demoExprs[kind], ...KNOWN[kind], ...MORE[kind]])) {
    let why;
    try { why = same(kind, f); } catch (e) { why = 'threw ' + e.message; }
    ok(!why, `m-${kind} ${JSON.stringify(f)}: the same values as JavaScript (v1.0.1)${why ? ' — ' + why : ''}`);
  }
}

// 3. refused (and nothing runs)
globalThis.__ran = 0;
const BAD = {
  sweep: [
    ['fetch(1)', /fetch is not allowed/], ["fetch('x')", /strings/], ['globalThis', /globalThis is not allowed/], ['(globalThis.__ran=1,u)', /globalThis/],
    ["u.constructor.constructor('x')()", /property access|strings/], ['u.constructor.constructor(u)()', /property access/], ['u.constructor', /property access/], ['constructor', /constructor is not allowed/],
    ['Math.constructor', /Math.constructor is not allowed/], ['Math.random()', /Math.random is not allowed/], ["[]['flat']", /\[ is not allowed/],
    ['Math["sin"](u)', /strings|\[/], ['u = 1', /assignment/], ['u; c', /character ";"/], ['u, c', /unexpected ","/], ['u ^ 2', /\*\* for a power/],
    ['u & 1', /character "&"/], ['u | 1', /character "\|"/], ['~u', /character "~"/], ['`u`', /strings/], ['"u"', /strings/], ['{}', /\{ is not allowed/],
    ['-u ** 2', /\(-a\) \*\* b/], ['sin(u)', /sin is not allowed/], ['PI', /PI is not allowed/], ['Math.sin', /is a function/], ['Math.PI(1)', /unexpected "\("/],
    ['u(1)', /unexpected "\("/], ['x', /x is not allowed/], ['010', /cannot start with 0/], ['u +', /unexpected "the end"/], ['(u', /expected \)/],
    ['', /unexpected "the end"/], ['u ?? c', /unexpected "\?"/], ['u?.c', /unexpected/], ['new Date', /new is not allowed/], ['this', /this is not allowed/],
    ['__proto__', /__proto__ is not allowed/], ['Math.__proto__', /is not allowed/], ['Math.toString()', /is not allowed/], ['eval("1")', /strings|eval/],
    ['Function("1")', /strings/], ['Function(u)', /Function is not allowed/], ['import(u)', /import is not allowed/], ['u => u', /assignment/], ['u // c', /unexpected "\/"/],
    ['u /* c */', /unexpected/], ['θ', /character "θ"/], ['u\nc', /unexpected "c"/], ['0x10', /x10 is not allowed|unexpected/], ['1_000', /_000|unexpected/],
    ['max(u, 1)', /max is not allowed/], ['Math.max(u, )', /unexpected "\)"/],
  ],
  curves: [['top.location', /top is not allowed/], ['N', /N is a function/], ['N.call(1)', /N is a function/], ['x.constructor', /property access/],
    ['10 - (', /unexpected "the end"/], ['window', /window is not allowed/], ['u', /u is not allowed/], ['random()', /random is not allowed/],
    ['hasOwnProperty(x)', /hasOwnProperty is not allowed/], ['valueOf()', /valueOf is not allowed/], ['toString()', /toString is not allowed/]],
};
for (const kind of ['sweep', 'curves']) {
  for (const [f, re] of BAD[kind]) {
    let msg = null, name = null;
    try { NEW[kind](f); } catch (e) { msg = e.message; name = e.name; }
    ok(name === 'SyntaxError' && re.test(msg) && msg.startsWith('f = '), `m-${kind} refuses ${JSON.stringify(f)}${msg ? ' — ' + msg : ' (accepted)'}`);
  }
}
ok(globalThis.__ran === 0, 'nothing in a refused expression ran');

// 4. size limits
const long = 'u' + '+u'.repeat(1000);
let e1 = null; try { NEW.sweep(long); } catch (e) { e1 = e.message; }
ok(long.length > EXPR.MAX_LEN && /longer than 2000/.test(e1 || ''), 'more than 2000 characters is refused');
const atLimit = 'u' + '+u'.repeat(999);
ok(atLimit.length <= EXPR.MAX_LEN && NEW.sweep(atLimit)(1, 0) === 1000, '2000 characters or fewer is accepted');
for (const [label, deep] of [['parentheses', '('.repeat(70) + 'u' + ')'.repeat(70)], ['unary minus', '-'.repeat(70) + 'u'], ['powers', 'u' + '**u'.repeat(70)],
  ['ternaries', 'u?'.repeat(70) + 'u' + ':u'.repeat(70)], ['calls', 'Math.abs('.repeat(70) + 'u' + ')'.repeat(70)]]) {
  let m = null; try { NEW.sweep(deep); } catch (e) { m = e.message; }
  ok(/nested deeper than 64/.test(m || ''), `nesting deeper than 64 (${label}) is refused`);
}
ok(NEW.sweep('('.repeat(40) + 'u' + ')'.repeat(40))(2, 0) === 2, 'nesting of 40 is accepted');
ok(!EXPR.FUNCS.includes('random'), 'Math.random is not in the list');

// 5. determinism: the same input gives the same value, in any order, from one or two compiled functions
{
  const f = 'Math.exp(-u*c) + Math.sin(u) * (u > c ? 1 : -1)';
  const g1 = NEW.sweep(f), g2 = NEW.sweep(f);
  const a = XS.map((x) => g1(x, 0.7)), b = XS.slice().reverse().map((x) => g2(x, 0.7)).reverse(), c = XS.map((x) => g1(x, 0.7));
  ok(a.every((v, j) => Object.is(v, b[j]) && Object.is(v, c[j])), 'determinism: the same values on every call');
}

// 6. the code scan refuses eval-like code
const SCAN = [
  ['var g = new Function("x", "return x");', /Function/], ['eval(s)', /eval/], ['window["eval"](s)', null], ['x.constructor.constructor(s)()', /constructor/],
  ['x["constructor"]', /constructor/], ['setTimeout("alert(1)", 0)', /string/], ['setInterval(`x`, 1)', /string/], ['setTimeout(function(){}, 0)', null],
  ['import("./x.js")', /import/], ['document.write(s)', /document.write/], ['e.innerHTML = s', /innerHTML/], ['a.href = "javascript:alert(1)"', /javascript:/],
  ['// new Function in a comment\nvar a = "eval";', null], ['var r = /eval\\(/g;', null], ['var t = `${eval(s)}`;', /eval/],
];
for (const [src, re] of SCAN) {
  const found = scanText(src, 'x.js').join('\n');
  ok(re ? re.test(found) : !found, `scan: ${JSON.stringify(src)} ${re ? 'refused' : 'passes'}${found ? ' — ' + found.split('\n')[0] : ''}`);
}

console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);

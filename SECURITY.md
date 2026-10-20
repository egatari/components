# Security

[Egatari spec §6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles): registry components are trusted code that read untrusted data. A lesson in the Core profile may contain no script of its own, so whatever a component does with the data in it (attributes, child JSON, text) must not become a way to run code. Components that evaluate expressions MUST restrict what those expressions can do.

## Expressions (`m-sweep` `f`, `m-curves` `f`)

Since **v1.0.2**, `m-sweep` and `m-curves` evaluate their expressions with a small parser (`tools/expr.js`, copied into each of them between the `BEGIN/END egatari-expr` lines). It reads the text into a tree and evaluates the tree; nothing is run as code (no `eval`, `new Function`, `with`). It accepts, with JavaScript's meaning and precedence:

```
expr    := cond
cond    := or ( "?" cond ":" cond )?
or      := and ( "||" and )*            and   := eq ( "&&" eq )*
eq      := rel ( ("==" | "!=" | "===" | "!==") rel )*
rel     := add ( ("<" | "<=" | ">" | ">=") add )*
add     := mul ( ("+" | "-") mul )*     mul   := pow ( ("*" | "/" | "%") pow )*
pow     := ("-" | "+" | "!") unary      (not followed by **: write (-a) ** b or -(a ** b))
         | primary ( "**" pow )?        (right-associative; the exponent may be unary: 2 ** -x)
unary   := ("-" | "+" | "!") unary | primary
primary := number | variable | constant | function "(" ( expr ( "," expr )* )? ")" | "(" expr ")"
number  := 12 | 1.5 | 1. | .5 | 1e-3    (decimal only; no leading zero such as 010)
```

| | `m-sweep` | `m-curves` |
|---|---|---|
| variables | `u`, `c` | `x` |
| functions | `Math.<f>(…)` | `Math.<f>(…)` or `<f>(…)`, and `N(x, mean, sd)` |
| constants | `Math.<c>` | `Math.<c>` or `<c>` |

`<f>`: `abs acos acosh asin asinh atan atan2 atanh cbrt ceil cos cosh exp expm1 floor hypot log log10 log1p log2 max min pow round sign sin sinh sqrt tan tanh trunc`. `<c>`: `E LN10 LN2 LOG10E LOG2E PI SQRT1_2 SQRT2`. `Math.random` is not listed (a component draws the same picture for the same step and time).

Everything else is refused: other names (`fetch`, `globalThis`, `constructor`, `__proto__`, `this`, `new`, …), property access other than `Math.<listed name>`, calls of anything but the listed functions, strings, `[ ]`, `{ }`, `=`, `;`, the comma operator, `^ & | ~` (`^` is not a power: write `**`), comments, more than 2000 characters, nesting deeper than 64. A refused expression is a `SyntaxError` naming the expression and the problem (`f = "fetch(1)": the name fetch is not allowed …`); Studio's runtime then draws the component's inline placeholder and records the error in `DECK.componentErrors` (phase `mount`). Other components and slides still play.

For every expression that the demos, Studio's examples, templates and documentation used, the values are identical (`Object.is`) to those of v1.0.1 at every sample point (`tools/test-expr.mjs`), and the rendered SVG of the demos is unchanged. Expressions outside the grammar that v1.0.1 ran as JavaScript now show the placeholder. Lessons that recorded v1.0.0 or v1.0.1 still name that version (and its `index.js` hash), and editors that keep those versions run them as before; spec §6 asks readers to treat expressions outside arithmetic as code in such documents.

## Code scan

`tools/scan-code.mjs` (in `npm test` and CI) fails on any `eval`, `Function` (`new Function`, `Function(…)`), `constructor` access, string or template first argument of `setTimeout` / `setInterval` / `setImmediate`, `execScript`, `import` (dynamic or static), `document.write`, `javascript:` URLs in strings, and HTML sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc`, `createContextualFragment`, `DOMParser`) in component code and in `tools/expr.js`. The only allowed HTML sink is in `m-menu` (`insertAdjacentHTML` of two constant SVG icons, no author data), listed with that reason in the scan.

## Audit (v1.0.2)

| Component | Data from the lesson | Eval-like path |
|---|---|---|
| `m-sweep` | attributes (`f`, `values`, …) | **v1.0.0–1.0.1: `f` ran through `new Function` (any JavaScript).** Fixed: the safe evaluator |
| `m-curves` | child JSON (`f`, `pts`, …) | **v1.0.0–1.0.1: each series' `f` ran through `new Function` with `with(Math)`.** Fixed: the safe evaluator |
| `m-menu` | child `<a href>` links | `insertAdjacentHTML` with constant SVG only; titles, `data-sub`, `data-icon` through `textContent`/DOM nodes; `href` is the lesson's own markup (classified by the document's rules, not by the component) |
| `m-collect` | child JSON | `tex` drawn by KaTeX through Studio's `DECK.svgMath` (KaTeX's `trust` is off, so `\href`, `\url`, `\htmlData` and similar cannot add links or attributes); text through `textContent` |
| `m-bars` `m-codetree` `m-flow` `m-gendai` `m-kanbun` `m-kobun` `m-kpi` `m-market` `m-quad` `m-seq` | child JSON or text | none: text through `textContent`, numbers into SVG attributes, colors only as theme variables or presentation attributes (no script context) |

No component uses `eval`, `setTimeout`/`setInterval` with strings, dynamic `import`, `document.write` or `srcdoc`.

## Reporting

Report a vulnerability privately through GitHub's [security advisories](https://github.com/egatari/components/security/advisories/new), not in a public issue. Problems in Studio's runtime, build or editor go to [Egatari Studio](https://github.com/egatari/egatari-studio/security/advisories/new).

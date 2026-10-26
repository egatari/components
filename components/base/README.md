---
name: base
version: 1.0.0
kind: library
summary: 2.0 の要素のパーツが使う土台（基底のクラス MotionElement と、SVG・時間・見せ方の補助）。データの形は mount の前に確かめる。教材の作者が直接は書かない
requires: shape@1.0.0
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element. Element parts
of components 2.0 require it as `requires: {base: "1.0.0"}` and receive what its factory returns:

```js
egatariParts.define({name: "bars", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-bars"},
  ({base}) => class extends base.MotionElement { /* … */ });
```

| Member | What it is | 1.x equivalent |
|---|---|---|
| `MotionElement` | the base class: `steps` (attribute `steps`, else `static steps`, else 1), `from` (`data-from`, default 1), `props` (attributes read by `static props`, cached), `data` (the one child `<script type="application/json">`, parsed, cached; two or more → `null` with a warning), and the empty `mount(ctx)`, `render(k, t, ctx)`, `duration(k)` = 0, `cues(k)` = null. It checks the part's data before the part counts its steps or mounts (below) | `DECK.MotionElement` |
| `el(tag, attrs, parent?)` | an SVG element; `fill` / `stroke` / `color` / `stop-color` values with `var(` go to `style` | `DECK.el` |
| `lerp(a, b, e)` | `a + (b − a)·e` | `DECK.lerp` |
| `prog(t, start, dur)` | eased progress 0…1 of a motion from `start` lasting `dur` (1 at `t = ∞`); `prog(x, 0, 1)` is deck.js's `ease(x)` | `DECK.prog` (`DECK.ease`) |
| `clamp(x)` | `x` limited to 0…1 | `DECK.clamp01` |
| `mtext(parent, x, y, str, attrs?)` | SVG `<text>` with `*italic*`, `_sub`, `^sup` (24 px; a run-time helper, not the build-time `tex` of spec §6.2) | `DECK.mtext` |
| `variant(el, names?)` | the presentation variant: the `variant` attribute when it is one of `names` (default `el.constructor.variants`), else the first; an unknown name warns | `VARIANT.of(el)` (tools/variant.js) |
| `previewOpacity(el)` | the theme's `--preview-opacity` seen from `el`, or 0.45 when unset or outside 0…1 | the inline `getComputedStyle` read |

**Data shapes** (spec §6.1; players no longer validate component data). Every `MotionElement` checks, once, its `static
shape` (`{schema, example}`, `{text: true}` or `{links: true}`) and the `shape` of its `json` props with the `shape` part,
as deck.js did before mount. When the data does not fit, `steps` is the `steps` attribute (else 0), `mount(ctx)` calls
`ctx.report(kind, message)` once (kind `shape`, `missing`, `json`, `attr`, `attrJson`, `notText`, `empty`, `notLinks`
or `noLinks`; the message is deck.js's English summary) and shows deck.js's placeholder (`<div class="m-error"
role="note">`, in Japanese when `ctx.lang` is `ja`), and `render`, `duration`, `cues` draw nothing. With data that fits,
nothing changes. Exceptions thrown by a part are not caught here.

Dependencies: base → shape only (shape needs nothing from base, so there is no cycle). `plot` requires base.

`MotionElement`, `el`, `mtext`, `lerp`, `prog`, `clamp` and the data check are copied from Egatari Studio's
`kit/deck.js` (MIT, the same owner; see NOTICE) and give the same DOM and messages: `tools/test-base.mjs` compares each
with the pinned Studio's `DECK`. Nothing here reads `DECK` or any other global of a player.

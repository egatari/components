# Shared conventions for components (draft)

[日本語](conventions.ja.md)

> Draft (2026-10-24), reviewed by the standards work, not yet by the owner. Component names are working names and become final when this document is approved.

The 8 components added in v1.2.0 (`m-compare` `m-timeline` `m-fishbone` `m-cycle` `m-scatter` `m-tree` `m-pie` `m-venn`) follow these conventions from the start. Existing components adopt them gradually, without changing how existing lessons look ([1.6](#16-adding-variants-to-an-existing-component)).

Variants and the seed are defined in spec [§8.4](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#84-component-contract-summary). The component contract (`render(k, t)` depends only on the step and the time, colours only through theme variables, and so on) is in Studio's [contract](https://github.com/egatari/egatari-studio/blob/main/docs/contract.md) and in [CONTRIBUTING](../CONTRIBUTING.md). This document adds to it.

1. [Variants and the seed](#1-variants-and-the-seed)
2. [Box-and-line diagrams](#2-box-and-line-diagrams-timeline-cycle-tree-cause-and-effect)
3. [Chart components](#3-chart-components)
4. [Declaring purposes](#4-declaring-purposes)
5. [Decided and deferred](#5-decided-and-deferred)
6. [Interactive parts](#6-interactive-parts)

## 1. Variants and the seed

### 1.1 Why

When a component always appears the same way, every lesson starts to look alike (the number cards always count up). Each component therefore has a few variants, chosen by a seed written in the lesson. **Within a lesson the choice is consistent; across lessons it varies.**

### 1.2 What a variant may and may not change

A variant changes only **how things appear within a step and where the eye is led**.

| May change | Must not change |
|---|---|
| How things appear (fade, rise, per digit, drawing a line, …) | The number of steps (`steps`) |
| The order of motion within a step (left to right, largest first, …) | The step length (`duration(k)`) and cues (`cues(k)`) |
| Whether there is an attention mark (underline, frame) | What the final state (`t = Infinity`) says: text, numbers, positions, the meaning of colours |
| | The colours (theme variables only) |
| | The upper bound of motion: no longer, farther or more often than variant 0 |

Because steps, lengths and cues stay the same, the narration, video timing, captions, lecture view, print and screen readers are the same whatever the variant.

- **Motion only guides attention.** No decorative motion (bouncing, spinning or wobbling that keeps going). Every variant finishes moving and stops within its step.
- **Every variant honours `prefers-reduced-motion`.** With that setting the runtime draws at `t = Infinity` (`kit/deck.js`), so in every variant the final state must be readable on its own. A variant whose final state keeps an attention mark (an underline) may only use marks that make sense in a still picture (an underline saying "this number matters" is fine; a mark that only means something while moving is not).
- **Lecture view** (previewing later steps; since spec §8.4 a flag, `ctx.preview === true`, while `ctx.mode` is "talk" | "learn" | "video"): a component that shows later steps faintly uses the same faintness in every variant (0.45–0.5, backlog #86). Components test `ctx.preview || ctx.mode === "lecture"`, so they work both with the current bundled player (which passes `ctx.mode === "lecture"`) and with the next one (which passes `ctx.preview`).
- **Variant 0** is the current rendering for existing components, and the quietest one (fade in) for new components.

### 1.3 Attributes

| Where | Syntax | Meaning |
|---|---|---|
| Lesson | `<html data-egatari-seed="N">` | The lesson's seed: an integer 0 ≤ N < 2³². A decimal integer on the root element of the lesson source, written once when the lesson is created and preserved on every save; 0 when absent (spec [§8.4](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#84-component-contract-summary)) |
| Component | `seed="N"` | Overrides the seed for this component only |
| Component | `variant="name"` | Chooses a variant by name (for example when the author asks for "counting up"). Stronger than any seed |

Order: `variant` → the component's `seed` → the lesson's `data-egatari-seed` → 0.

- An unknown `variant` name gives a `console.warn` and variant 0.
- `seed` and `variant` are common to all components and are not listed in `static props` (no existing component has a prop with either name; checked).

### 1.4 How a variant is chosen

A component declares its variant names in order; index 0 is variant 0.

```js
static variants = ["count", "rise", "flip", "underline"];
```

The README frontmatter lists the same (`variants: count, rise, flip, underline`), so CATALOG.md shows them.

From a seed s:

1. If s = 0, variant 0.
2. Otherwise compute h(s, tag name, v) for each variant name v and take the largest. h is the FNV-1a of `"<s>|<tag name>|<v>"` followed by the same mixing as `rng` in `kit/deck.js` (32 bits).

Consequences:

- **Within a lesson, every instance of a component gets the same variant** (same s and tag name), so the lesson stays consistent. To make one instance different, give it `seed` or `variant`.
- **Different components choose independently** (the tag name is part of h): a lesson where `m-kpi` counts up does not force a matching style on `m-bars`.
- **Adding a variant later changes few lessons.** Going from n to n+1 variants changes only the lessons where the new variant wins, about 1/(n+1) of them. Choosing by remainder (s mod n) would change most lessons.
- A variant name never changes once released (it is part of h). Retiring a variant means removing it from the list, which changes only the lessons that had it.

When a variant needs randomness (shuffling the order cards appear in, say), it uses a seeded generator built from the same h. Never `Math.random` (as before).

### 1.5 How a component reads the seed

The choice is a small function in `tools/variant.js`, copied into the components that use it the same way as `tools/expr.js` (`node tools/variant-sync.mjs` rewrites a marked block; the tests catch a component that was not synced). Inside the component:

```js
// once, in mount
this.variant = VARIANT.of(this);   // "count" | "rise" | …
```

`VARIANT.of` reads the component's `static variants` through `customElements.get(tag)` (component code may not write `.constructor`), then the `variant` attribute → the `seed` attribute → `data-egatari-seed` on `document.documentElement` → 0, and chooses as in 1.4.

Alternatively Studio's component base class (`DECK.MotionElement`) could provide the same thing (`this.variant`), which would make the copied function unnecessary. That is a Studio change, to be discussed with dev after v0.4.8. Until then everything stays inside the components library.

### 1.6 Adding variants to an existing component

- **Variant 0 does not change by a single pixel.** Lessons without a seed (all existing lessons) look the same. The tests compare each demo's screenshots (mid-step and final) with those of the release before the variants were added.
- A lesson pins its component versions (spec [§6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles)), so a seeded lesson changes look only when its author moves to a newer release (about 1/(n+1) of them, see 1.4). Updating a component already shows what changes; a variant change is one more thing shown there. Adding variants is a minor version and goes in the CHANGELOG.
- If an existing prop overlaps with a variant, the prop wins. For example `count="false"` on `m-kpi` still means "do not count": if a counting variant (`count`, `flip`) is chosen, the component uses the non-counting one (`rise`) and logs a `console.info` once saying why.
- In v1.2.0 only `m-kpi` gains variants (it is where the complaint came from); other components follow in later releases.

### 1.7 Example: `m-kpi`

| Variant | Motion within the step | Final state |
|---|---|---|
| `count` (0, current) | The card rises 14 px as it fades in; the number counts from `from` to its value (fast first, slow at the end). The delta line appears just before counting ends | Number, label, delta, note |
| `rise` | The number shows its final value from the start. The card rises as it fades in, and the number grows from 0.85× to full size | Same |
| `flip` | After the card appears, the digits flip vertically from 0 to their value one at a time, rightmost first, and stop | Same |
| `underline` | The card appears with the final number; then a `--term` line is drawn left to right under the number | Same, plus the line under the number |

All four keep today's step length (`at + dur`, plus 0.4 s with a delta) and the same cues. With reduced motion, each shows its final state directly.

## 2. Box-and-line diagrams (timeline, cycle, tree, cause and effect)

### 2.1 Principle: no coordinates in the data

`m-flow` takes box coordinates in px, which is right when the author wants to fix the shape by hand. When an AI writes them, boxes overlap, overflow and drift. The four new components (`m-timeline` `m-cycle` `m-tree` `m-fishbone`) take **only the content and the connections; the component lays them out**.

`m-flow` stays as it is, for diagrams with coordinates. The four new ones use the same field names as `m-flow`.

### 2.2 Data shape

The child JSON is always `{"nodes": [...], "edges": [...]}`; `edges` may be omitted.

**Common node fields** (same names as `m-flow`):

| Field | Meaning |
|---|---|
| `id` | String or integer, used to refer to the node |
| `label` | The box text (short; `\n` for a line break; `*italic*` `_sub` `^sup` as in `m-flow`), or `tex` (KaTeX) |
| `note` | Supplementary text (`--muted`). Under the box or as the box's last line, whichever avoids the lines; the component decides and its README says which (timeline and cycle: inside; tree and fishbone: under) |
| `tone` | `term` (default), `emph`, `muted`, `accent2`, `series-1..4` |
| `step` | The step the node appears at (default: 2.4) |
| `at` | Start time within the step, in seconds |

**Fields per component**:

| Component | Field | Meaning |
|---|---|---|
| `m-timeline` | `when`, `end`, `whenLabel` | A time (a number, or a string such as `"1868"`, `"2026-10"`, `"2026-10-24"`). With `end`, a period (drawn as a band). **`end` is exclusive** (the moment it ends: `"1912"` is the start of 1912), so Meiji 1868–1912 and Taishō 1912–1926 share a lane; to include December, write the next month (`"2027-01"`). `whenLabel` is the date text shown (`明治元年`); the position still comes from `when` |
| `m-cycle` | (array order) | The cycle runs in array order; the arrow from the last back to the first is drawn automatically |
| `m-tree` | `parent` | The parent's `id`. The node without `parent` is the root (exactly one) |
| `m-fishbone` | `parent` | The parent's `id`. Nodes without `parent` are the main bones (categories such as people, machines, methods, materials), their children are causes, grandchildren sub-causes (3 levels at most). The effect (head) is given separately as `{"effect": {"label": …}}` |

**Edges**: lines implied by order or parentage are drawn automatically and not written. `edges` holds only other connections (a relation across branches of a tree, between two causes), with `m-flow`'s fields (`from` `to` `label` `tone` `dash` `step`). Dashed by default.

Example (timeline):

```json
{"nodes": [
  {"id": "a", "label": "Meiji Restoration", "when": "1868"},
  {"id": "b", "label": "Meiji Constitution", "when": "1889", "note": "promulgated"},
  {"id": "c", "label": "First Sino-Japanese War", "when": "1894", "end": "1895", "tone": "emph"}
]}
```

### 2.3 Layout rules

- **Stay inside the element's box.** The font size follows the element's size and shrinks if needed, down to 24 px (what Studio's checker requires for text in figures; body text is 27 px). Never below that: if it still does not fit, report with `console.warn` (the tests check this). Text that is deliberately smaller (a note, a tick label) carries `data-annot` (as in `m-kanbun`; the checker's `smallSvgText` exempts it).
- Box widths are estimated from character counts (as in `m-kpi`; no waiting for fonts). Boxes, and text and lines, stay at least 4 px apart (checked by `tools/test-components.mjs`, as for `m-flow`).
- Direction is the `orient` attribute: `m-timeline` `h` (default, left to right) or `v` (top to bottom); `m-tree` `down` (default) or `right`; `m-fishbone` head on the right (default). `m-cycle` starts at 12 o'clock and runs clockwise.
- `m-timeline` spacing is the `scale` attribute: `time` (default, proportional to time) or `even` (equal spacing, for very uneven gaps). Labels alternate above and below the axis.
- Lines that connect boxes to boxes or to the axis are `--muted`, 3 px (`--line` is too faint on a projector, as seen in the 2026-10-23 workshop). `--line` is only for grid lines (and separators that carry no ticks or labels). An axis that carries ticks or labels is information and uses `--muted` (the timeline axis, its ticks, and its tick labels at the figure's text size). Axes drawn by `DECK.Plot` (`m-curves`, `m-scatter`) stay `--fg`. The arrowhead is the same in every component; emphasised lines use the `tone` colour.
- **Text contrast**: every component text reaches at least 4.5:1 against what is under it (background, box fill), in the default, kokugo and business themes (measured by `tools/test-contrast.mjs`). Text that carries information (box text, edge labels, values) is `--fg` or its `tone` colour; `--muted` is for supplementary notes only. A `--muted` note on a tinted fill (`--emph-tint` and the like) becomes `--fg` when it would fall below 4.5:1.
- One "main line" per diagram (the fishbone spine, the timeline axis) may be up to 5 px.
- `m-flow`'s edges were already `--fg`, darker than `--muted`, so they stay. Its edge labels and the text of `muted` boxes became `--fg` in v1.2.0 (owner-approved; existing lessons change; issue #1).
- No vertical writing (that is for the kokugo components).

### 2.4 Step order (defaults)

From the "steps" column of the purpose table that goes into the AI instructions (parts-map, section 10).

| Component | Default steps | Change with |
|---|---|---|
| `m-timeline` | One event at a time, in time order. The axis appears with the first event | `per-step`, node `step` |
| `m-cycle` | One stage at a time. The arrow back to the first stage appears with the last stage | `per-step`, node `step` |
| `m-tree` | One level at a time, top down (root, children, grandchildren, …) | `by="level"` (default) or `by="node"` |
| `m-fishbone` | Causes, then the effect: one main bone at a time (with its causes), then the head (effect) | `order="causes-first"` (default) or `order="effect-first"` (head and spine first) |
| `m-flow` | As now (`step` on nodes and edges) | — |

A node's `step` always wins. An edge defaults to the later of its two ends (as in `m-flow`).

### 2.5 Variants for box-and-line diagrams

Following section 1, the four share variant names:

- `fade` (0): boxes fade in, then the lines are drawn (as `m-flow` does now)
- `draw`: the line is drawn first and the box appears at its end
- `grow`: a box grows out of its parent's (or the previous box's) position and moves into place

The total motion of `draw` and `grow` stays within `fade`'s duration and travel (no more motion than variant 0, 1.2).

## 3. Chart components

`m-scatter` `m-pie` `m-compare` `m-venn` are not box-and-line diagrams, but reuse the attribute names of existing components.

- Components with axes (`m-scatter`) use the names of `m-curves` and `m-sweep`: `xr` `yr` (range), `xt` `yt` (ticks), `xf` `yf` (tick format), `xl` `yl` (axis labels).
- Components that show numbers use `unit` and `digits` (as `m-bars` and `m-kpi`).
- Chart parts share one series vocabulary: `label`, `tone`, `step`, `at` (start s within the step), `anchor` (right/left/above/below for a label; `top`/`bottom` are accepted as aliases of above/below), `labelAt` (x where a line's name goes). `m-curves`'s older `color`, `at` (the x of the name) and `anchor` values `start` `middle` `end` still work but are not documented for authors (`at` would clash with the other components, so `m-curves` does not use it as a start time).
- Step defaults come from the same table as 2.4: scatter shows the points, then the trend; Venn shows the sets, then the overlap; compare shows one side, then the other, then the difference. A pie is shown whole (slice by slice only if the narration discusses each slice in turn).
- Stacked bars become an `m-bars` attribute (`stack`). Variant 0 rendering does not change.

## 4. Declaring purposes

### 4.1 The list of purposes

The purposes a component can serve (shown to people as 「伝えたいこと」 / "What to convey") are listed in one file in this repository (`purposes.json`), which is also the single source of Studio's new-deck tiles: `tile` is `"own"`, `{"into": id}` (folded into that tile) or `"none"` (arrives through a subject's part set); `label` is the tile's short name, `icon` an icon key, `examples` the tile's small text. A reserved id has no tile until a component serves it; it then comes with a proposed `tile`, reviewed at release (by the owner if it adds a tile), taken from the tables in sections 8 and 10 of the parts map. Each entry has an `id`, Japanese and English names, and the default step pattern in words.

| id | Purpose | Default steps |
|---|---|---|
| `compare` | Compare amounts | One side, then the difference |
| `ranking` | Ranking | Sorted bars one at a time |
| `change` | Change over time | One line at a time |
| `part-whole` | Part of a whole | Whole at once |
| `key-number` | One key number | Whole at once |
| `process` | Steps of a process | One step at a time |
| `timeline` | Timeline, schedule | One event at a time |
| `cause-effect` | Cause and effect | Causes, then the effect |
| `cycle` | Cycle | One stage at a time |
| `hierarchy` | Hierarchy, classification | Top down |
| `position` | Position on 2 axes | Axes, then items |
| `overlap` | Overlap | Sets, then the overlap |
| `correlation` | Two quantities | Points, then the trend |
| `spread` | Spread | Whole at once |
| `grouping` | Grouping | The grouping motion |
| `text-structure` | Structure of a text | Reading order |
| `contents` | Contents | Whole at once |
| `parameter` | Varying a parameter | One value at a time |

| `deviation` | Deviation, increase and decrease (diverging bars, waterfall) | (reserved; no component yet) |
| `concept-links` | Concept links (concept map) | (reserved; no component yet) |

The list may grow, but an `id` never changes (lessons and instructions record it). `deviation` and `concept-links` are gaps in section 8 of the parts map; their ids are reserved now so they stay stable. `spatial` (place) is added when the map component arrives.

### 4.1.1 Mentioning other components in a README

The AI instructions carry only the READMEs of the components a lesson can use, and Studio drops a clause that names a component not in the pack. So a mention of another component ("to compare amounts, use `m-bars`", "names and meanings as in `m-curves`") goes in **a sentence of its own or a closing parenthetical**, never in the middle of an attribute description (dropping it would drop the description too). Consistency notes between components ("as in m-tree") are for maintainers: put them in `<!-- llm: omit -->` or leave them out.

### 4.2 Declaring them in a component

The README frontmatter gets `purposes:`, main purpose first:

```yaml
purposes: change, compare
```

`tools/catalog.mjs` rejects ids not in the list and adds a "purpose → components" table to CATALOG.md. `purposes.json` belongs to this repository: Studio vendors it with the components, and the nightly evaluation reads it from there. When Studio builds the AI instructions, it lists the components by purpose from that table.

Proposed declarations for existing and v1.2.0 components:

| Component | purposes |
|---|---|
| `m-bars` | compare, ranking, change, part-whole (`stack`) |
| `m-curves` | change |
| `m-kpi` | key-number |
| `m-market` | part-whole |
| `m-flow` | process |
| `m-quad` | position |
| `m-menu` | contents |
| `m-collect` | grouping |
| `m-seq` | spread |
| `m-sweep` | parameter |
| `m-codetree` | hierarchy, process |
| `m-kanbun` `m-kobun` `m-gendai` | text-structure |
| `m-compare` | compare |
| `m-timeline` | timeline |
| `m-fishbone` | cause-effect |
| `m-cycle` | cycle |
| `m-tree` | hierarchy |
| `m-scatter` | correlation |
| `m-pie` | part-whole |
| `m-venn` | overlap |

## 5. Decided and deferred

Decided in the standards review (2026-10-24):

1. The lesson seed is `data-egatari-seed` (spec §8.4, egatari-spec 270767a).
2. Lessons pin component versions (spec §6); a seeded lesson changes look only when moved to a newer release (1.6).
3. A base-class `this.variant` in Studio comes later, with dev. v1.2.0 uses `tools/variant.js` and `variant-sync`.
4. This document does not rename the series (standards to dev, with #99).
5. `purposes.json` lives in this repository (4.2).

## 6. Interactive parts

Components the viewer can press or type into are called "interactive parts" (操作できるパーツ; standards review and the owner, 2026-10-25). Today: `m-predict` (counting, marking a prediction), `m-kobun` (an auxiliary verb opens its card) and `m-menu` (its cards are links).

- **The flag lives in index.js**: `static interactive = true;` on the class. A part that takes viewer input (spec §8.4 "Viewer input") also has `static viewerInput = true;` (`m-predict` only). Not in the README frontmatter, which is shown to AI authors. A part whose content is elapsed time (`m-timer`) also has `static clock = true;`: under prefers-reduced-motion the player still gives it the real t and drops only decorative motion (spec §9.1). `tools/release.mjs` writes them to manifest.json as `components.<name>.interactive` / `.viewerInput` / `.clock` (only when true).
- **Lint**: `tools/lint.mjs` checks index.js with a simple heuristic: an `input(…)` method, a click / pointer / key / input / change listener, creating `a` / `button` / `input` elements, or child links as data (`static shape = {links: true}`) without `static interactive = true` is an error; so is `viewerInput` without `interactive`.
- **Marking (never by colour alone)**: CATALOG.md puts 「操作できる」 next to the part's name. In the gallery the part's intro slide gets a 「操作できる / Interactive」 badge and a dashed `--accent2` frame around the intro text. Each part's demo.html shows the 「操作できる」 badge (27 px, dashed frame) as the first element of its first slide's body, never in the heading (Studio uses the h2 text as the slide's title and key).

## 7. Tools (parts used only when asked)

In a new deck, standard parts are always in; subject part sets and "tools" are in only when the user chooses them (owner, 2026-10-25). A tool is a part used only when asked (such as `m-timer`), not a purpose.

- **The flags live in index.js**: `static group = "tool";` and the tool's new-deck tile `static tile = {"label": {"ja", "en"}, "examples": {"ja", "en"}, "icon"};` (one line of JSON). Not in the README. `tools/release.mjs` writes `components.<name>.group` / `.tile` to manifest.json, and Studio builds the 「道具」 / "Tools" row from components with `group: "tool"`.
- **Lint**: `tools/lint.mjs` fails on a `group` other than `"tool"`, and on a tool without a tile (`label`, `examples`, `icon`).
- A tool's purpose (`timebox` for `m-timer`) has no purpose tile (`tile: "none"`), so that purpose tiles (which the user turns off) and tool tiles (which the user turns on) stay apart.

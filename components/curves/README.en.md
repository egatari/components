---
summary: Draws lines one at a time on shared axes (each line's name is written at its end, not in a legend)
steps: the largest step (default: the number of series)
props:
  xr: x-axis range
  yr: y-axis range
  xt: x-axis ticks
  yt: y-axis ticks
  xf: x tick decimals
  yf: y tick decimals
  xl: x-axis title
  yl: y-axis title
  n: samples per f
  dur: seconds to draw one line
  lw: line width
---

Use to show one comparison at a time in one figure: mean, median and quantiles on one predictive distribution, or loss functions overlaid one by one.

Write the series as an array in a child `<script type="application/json">`.
One series = one step (in order). `step` changes this; series with the same `step` draw together. The narration's [n] follows these steps.

| Field | Meaning |
|---|---|
| `label` | the line's name |
| `f` | an arithmetic expression in x (`Math` functions and constants such as `exp(…)` `sqrt(…)` `PI`, `N(x, mean, sd)`, `+ - * / % **`, comparisons and `? :`; see below). `xr` can narrow the drawn range |
| `pts` | points `[[x, y], …]` (vertical lines, measured polylines) |
| `tone` | `term` `emph` `accent2` `muted` `fg` `series-1..4` (default `series-1..4` in order) |
| `dash` | dashed |
| `labelAt` / `anchor` / `dx` / `dy` / `ly` | name position: at x = `labelAt` (default: the line's end). `anchor`: `right` `left` `above` `below`. `ly` sets the height by a y value |

`f` is arithmetic, never run as code: numbers, `x`, `Math` functions and constants (`sin(x)` or `Math.sin(x)`; no `Math.random`), `N(x, mean, sd)`, `+ - * / % **`, comparisons, `&& || !`, `? :`, parentheses. Powers use `**` (not `^`). An expression that can't be read shows a card instead of the figure.

<!-- llm: omit -->
Older forms (still work; not described to the AI)

- `color`: old name of `tone` (`tone` wins). `var(--…)` also works
- `at`: old name of `labelAt`, used only without `labelAt` (in `m-scatter`, `at` is a start second, so docs use `labelAt` only)
- `anchor` `start` `middle` `end`: raw text-anchor (`right` = `start`, `left` = `end`; `above`/`below` sit ~0.9 em off the point; `below` flips up at the axis)
- Without `step`, series i (from 0) is step i + 1. Lecture view (`ctx.preview`) shows later lines and names fully drawn at `--preview-opacity`
- The demo is `demo.html`
- Series fields (`label` `tone` `step` `anchor`) match `m-scatter` (conventions §3)
<!-- llm: end -->

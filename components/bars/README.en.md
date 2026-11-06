---
summary: Bars grow from 0 step by step (vertical, horizontal, grouped, stacked). The value axis can widen by step to show growth past the axis
steps: max of the groups' step and the scale's step (default one group = one step; per-step for n groups)
props:
  orient: v (vertical) or h (horizontal; ranks, comparisons)
  max: value-axis max (0 = auto; with scale, the first max)
  unit: unit after each value ($, %, …)
  digits: decimal places of values
  per-step: groups per step (0 = all in step 1)
  dur: seconds a bar grows
  stagger: start offset between groups in one step (s)
  count: count values up while bars grow
  ticks: value-axis ticks and grid
  zoom: seconds for a scale change
  al: value-axis title
  stack: stack a group's values in one bar; "percent" scales each group to 100 %
---

Use to show and compare quantities one at a time: sales or costs by year, ranked survey results, before and after.

Child JSON: `{"series": [...], "groups": [...], "scale": [...]}`.

- group: `label` (`\n` for 2 lines), `value` (one series) or `values` (one per series), `step` (default from per-step), `at` (start second within the step; default staggered), `tone` (a theme variable such as `emph`: colours that group's bars and value)
- series: `label` (with 2+ series, written on the first group's bars: above vertical bars, right of the value on horizontal bars; no legend), `tone` (default `--series-1..4`; one series uses `--term`)
- scale: `[{"step": 3, "max": 27, "at": 0.4}]`. From `at` in that step, the axis max moves to `max` over `zoom` seconds (log interpolation). The old range stays as a faint band; bars above the max stop at the top and grow as it widens
<!-- llm: omit -->
- Axis max: `max` (attribute or JSON), else 1.12 × the largest value (before the first scale) rounded to a nice number
<!-- llm: end -->
- Horizontal (`orient="h"`): group names left, values right of the bars. For ranks, `ticks="false"` may drop the ticks
- Stacked (`stack="true"`; `"percent"` = each group 100 %): a group's `values` stack in one bar, filling from the bottom series up. The total is at the bar's end (with `unit`), each value inside its segment without unit (omitted when the segment is too small). Values must be ≥ 0 (negatives draw as 0)
<!-- llm: omit -->
- Values: `digits` decimals, thousands separators, `unit` appended
- Negative values (not stacked): the axis includes 0; bars grow down (left) from a `--fg` baseline at 0; values sit outside the bar's end. With `scale`, the 0 line moves as the max moves
- `stack="percent"`: axis 0–100 % (`max` and `scale` unused); segment values in %, shown only when they fit with 6 px margin; no total; a group summing to 0 draws no bar
- Lecture view (`ctx.preview`): later bars, values, totals and series names at `--preview-opacity`, fully grown. Axis changes (scale) are not shown ahead; bars that exceed the current max are not shown ahead
<!-- llm: end -->

The demo is `demo.html`. All numbers are fictional.

Notes

- Values appear after a bar has fully grown, so half-grown numbers don't read as data. `count="true"` counts them up instead (stacked: only the total counts; the step is 0.35 s longer)
- Series names sit on the first group's bars; thin bars make neighbouring names collide. Keep to 2–3 series

<!-- llm: omit -->
- `examples/tmlr2026-calibration` keeps its own deck-local `components/bars/`; the library m-bars generalises its idea (widening max, faint old range, swapped ticks)
<!-- llm: end -->

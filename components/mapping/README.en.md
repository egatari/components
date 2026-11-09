---
summary: Map outcomes to numbers; group equal values to form a distribution
steps: Outcomes → arrows → grouped counts and sums → probability bars (4 steps)
props:
  dur: Motion seconds; step 2 adds stagger offsets
  stagger: Arrow delay in seconds (≥0)
  digits: Decimal places (0–10)
  size: Text px; 0 = 26, otherwise ≥24
example: {"outcomes":[{"label":"HH","x":2},{"label":"HT","x":1},{"label":"TH","x":1},{"label":"TT","x":0}],"name":"X","unit":"","fractions":true}
---

For introductory probability. Left: Ω; centre: values; right: distribution. Chips → arrows → shared colours, counts and sums → bars, end labels and total. Final state stands alone; no answer preview.

- `outcomes`: 2–12 items; short `label` (≤6 chars advised), finite `x`. Repeated values allowed. Input chip order; numerical axis increases upwards.
- `p`: optional. All omitted: `1/n`. Mixed: report `data`, missing = 0. Sum outside 1±1e-9 or p outside 0–1: report, retain values. No normalization.
- `name`: X; `unit`: suffix, default empty. Literal labels.
- `fractions`: defaults true for equal probabilities. Reduced fractions: denominator ≤10000, error ≤1e-9; otherwise `digits` decimals. Invalid totals stay unrounded.

Probabilities below chips when `p` supplied or fractions on. Colours cycle series-1..4 by ascending value. Bar scale includes 0–1; extends for invalid data.

`dur` defaults to 1s; step 2 lasts `dur + (n−1) × stagger`. `stagger`: 0.15s. `digits`: 2. `size`: 0 means 26px; otherwise ≥24. Auxiliary text ≥24px.

Use 1184×440px for four outcomes. Six fit with no `p` and `fractions: false`; otherwise allow ≥600px or split. Two-line rows need ≈84px; twelve need more height. Rows ≥40px. Tight space or close values report `size`; retain the proportional axis.

Element `lang`, then `ctx.lang`. Accessible name: mappings, distribution, total. Author `aria-label` retained. Horizontal diagram.

<!-- llm: omit -->
Fictional grapes: four equiprobable bunches. 180g/200g → B (X=0), 220g/240g → A (X=1). Explain numeric grade codes in the lesson.

Keep enough height for probabilities below chip labels.
<!-- llm: end -->

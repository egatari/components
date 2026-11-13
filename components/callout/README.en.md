---
summary: Screen steps: numbered circles on a screenshot, joined by leader lines to labels beside it, one per step
steps: max callout step (default 1 callout = 1 step)
props:
  side: labels on right, left or both
  label-width: label column (share of width)
  per-step: callouts per step (0 = all)
  dur: seconds per callout
  size: label px (≥ 24)
example: {"callouts": [{"x": 0.12, "y": 0.08, "text": "Open the menu"}, {"x": 0.7, "y": 0.62, "text": "Press Send"}]}
---

For training and how-to guides: where to click, in order.

The screenshot is a child `<img src alt width height>` (a file in the working folder; the build inlines it).

- **Never show real personal data on a screenshot** (names, ID numbers, resident or patient records). Use made-up data, or blur it.
- `alt` is required (a missing or empty alt is reported as data). `width` and `height` are the image's pixel size.
- An inlined image over 1 MiB is reported as size.

Child JSON: `{"callouts": [...]}`; callout: `x`, `y` (0–1 of the image), `text`, `box` (`[x, y, w, h]`, highlighted during its step), `step`, `at`.
<!-- llm: omit -->
- Labels follow the circles' vertical order, so leader lines never cross.
<!-- llm: end -->

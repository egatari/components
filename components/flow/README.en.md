---
summary: Flow chart built step by step from boxes and arrows
steps: largest node/edge step
props:
  fade: box fade-in (s)
  draw: arrow draw (s)
  size: box text px
  pulse-dur: pulse run (s)
  pulse-n: pulse dots
  label-gap: min label–box gap px
example: {"nodes": [{"id": "a", "label": "Observe", "x": 20, "y": 40, "w": 200, "h": 70, "step": 1}, {"id": "b", "label": "Update", "x": 320, "y": 40, "w": 200, "h": 70, "step": 2}], "edges": [{"from": "a", "to": "b", "step": 2}]}
---

Boxes and arrows by step of a proof or method.

Child JSON: `{"nodes": [...], "edges": [...]}`; px; `x`, `y` = box top-left, `w`, `h` = size.

- node: `id`, `label` (`\n`) or `tex` (KaTeX), `step`, `tone` (`term`/`emph`/`muted`), `at` (start s), `shape:"diamond"` (decision; ~2× text width)
- edge: `from` `to` `step` (default: later end), `label`, `tone`, `dash`, `offset` (label gap), `at`, `loop` (back edge outside: `"left"` `"right"` `"top"` `"bottom"`; `true` = right if ends stacked, else bottom)
- Lines, labels `--fg` (or `tone`); `muted` box: `--muted` frame
- Arrows draw after their step's boxes

<!-- llm: omit -->
- `muted` box: `--bg` fill, `--fg` text. Before v1.2.0 labels and `muted` text were `--muted`
- `loop` `true`: right if ends stacked, bottom if side by side; runs 34 px outside boxes between the ends (rounded elbow); `label` outside, `amount` inside; leave room on that side
- `shape: "diamond"`: rhombus in `x` `y` `w` `h`; about 2× text width; yes/no as outgoing `label`s
- Business: `amount` opposite `label`; `shift` text on its side; pulse dots 0.22 s apart, `pulseAt` default 0.2, gone at the end
- Label/`amount` nearer than `label-gap` to a box or off the figure: moved off the line 6 px at a time (to 60), then other side
- `cues(k)`: pulse start times (null without pulses), for `{cue}`
<!-- llm: end -->

<!-- llm: business -->
Money/goods edges (business models):

- `kind`: `money` (thick `--emph`), `service` (`--term`), `data` (dashed `--muted`); `tone`/`dash` win
- `amount`: bold figure
- `shift`: px offset to the right of travel; same on both directions = 2 parallel lines
- `pulse`: `pulse-n` dots run start→end in `pulse-dur` s; `true` = once after drawing; `[step, …]` = once per step; pulse steps count
<!-- llm: end -->

The demo is `demo.html`.

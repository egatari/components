---
summary: Flow chart: boxes and arrows by step
steps: largest node/edge step
props:
  fade: box fade-in (s)
  draw: arrow draw (s)
  size: box text px
  pulse-dur: pulse run (s)
  pulse-n: pulse dots
  label-gap: min label–box gap px
  dir: right or down, without coordinates
example: {"nodes": [{"id": "a", "label": "Observe", "step": 1}, {"id": "b", "label": "Update", "step": 2}], "edges": [{"from": "a", "to": "b", "step": 2}]}
---

Child JSON: `{"nodes": [...], "edges": [...]}`. Without coordinates the part places the boxes (direction: `dir`); back edges loop outside.

For fine placement give every node `x` `y` `w` `h` (px; `x`, `y` = top-left); boxes 40+ px apart.

- node: `id`, `label` (`\n`) or `tex` (KaTeX), `step`, `tone` (`term`/`emph`/`muted`), `at` (start s), `shape:"diamond"` (decision, ~2× text width)
- edge: `from` `to` `step` (default: later end), `label`, `tone`, `dash`, `offset` (label gap), `at`, `loop` (back edge: `"left"` `"right"` `"top"` `"bottom"` or `true` = auto)

<!-- llm: omit -->
- Edge ends (2.0.4): boxes apart along one axis: the edge ends mid facing side of the target, starts on the source's facing side near the target's centre line; `shift` runs along those sides (reported if it leaves them). Before, centre-to-centre lines could end between stacked wide boxes
- Lines, labels `--fg` (or `tone`); arrows draw after their step's boxes
- `kind` colours: `money` `--emph`, `service` `--term`, `data` `--muted`
- `muted` box: `--muted` frame, `--bg` fill, `--fg` text. Before v1.2.0 labels and `muted` text were `--muted`
- `loop` `true`: right if ends stacked, bottom if side by side; runs 34 px outside boxes between the ends (rounded elbow); `label` outside, `amount` inside; leave room on that side
- `shape: "diamond"`: rhombus in `x` `y` `w` `h`; about 2× text width; yes/no as outgoing `label`s
- Business: `amount` opposite `label`; `shift` text on its side; pulse dots 0.22 s apart, `pulseAt` default 0.2, gone at the end
- Label/`amount` nearer than `label-gap` to a box or off the figure: moved off the line 6 px at a time (to 60), then other side
- `cues(k)`: pulse start times (null without pulses), for `{cue}`
- No coordinates (2.2.0): ranks by longest path along `dir` (`loop` edges and cycle-closing edges skipped), barycentre order (ties: data order); box size from estimated text width and lines, diamond 2× width, a rank shares width (`down`: height); spread evenly, 40+ px apart plus edge-text room; too big: `layout` report, text not shrunk. Back edges without `loop` loop below (`down`: right), or the other side if a rank neighbour is there; two-way pairs stay straight. Mixed coordinates: `data` report, nothing drawn
<!-- llm: end -->

<!-- llm: business -->
Business-model edges:

- `kind`: `money` (thick), `service`, `data` (dashed); `tone`/`dash` win
- `amount`: bold figure
- `shift`: px right of travel; both directions = 2 parallel lines
- `pulse`: `pulse-n` dots run start→end in `pulse-dur` s; `true` = once after drawing; `[step, …]` = once per step; pulse steps count
<!-- llm: end -->

The demo is `demo.html`.

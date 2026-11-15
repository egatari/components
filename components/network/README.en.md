---
summary: Graph search (BFS, DFS, Dijkstra) and tours step by step: current, frontier, visited, chosen edges, a running total
steps: number of steps
props:
  dur: seconds per edge
  size: text px
  weights: edge weights
example: {"nodes": [{"id": "A", "x": 0, "y": 0}, {"id": "B", "x": 4, "y": 0}], "edges": [{"from": "A", "to": "B", "w": 4}], "steps": [{"current": "A", "frontier": ["B"]}, {"current": "B", "take": [["A", "B"]], "total": 4}]}
---

States and totals from a script. node `id` `x` `y` (y down) `label`; edge `from` `to` `w`; `directed`.
Step: `current` `visited` `frontier` (`[["C", 3]]` keyed) `parent` (`{"C": "A"}`) `take`/`drop` (`[["A", "C"]]`) `total` `note`. `frontierKind` queue|stack|pq|set; `total` `{"label", "unit"}`.
<!-- llm: omit -->
- Omitted fields carry over (`current: null` clears); `parent` accumulates (`null` removes); `take`/`drop` change the chosen edges. `complete: true`: a complete graph with no edges drawn (tours).
- Checks (data): unknown ids, `take` of a missing edge, `drop` of an edge not chosen; when every chosen edge has `w`, `total` must equal their sum (`total.check: false` to skip).
- Colours: current `--emph` thick ring, frontier `--accent2` dashed ring and the bottom row, visited `--muted` fill, chosen edges and the search tree (arrows) `--term`, other edges `--line`.
- Timing: drops fade in half of `dur`, takes draw one by one in order; node states change in half of `dur`; the total counts up.
- Caps: 24 nodes, 60 edges, 40 steps. Overlapping nodes, no room for a weight or a long note report layout; a small element reports size. No answer preview.
<!-- llm: end -->

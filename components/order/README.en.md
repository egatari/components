---
summary: Put cards in order; then they move into the right order, ✓ where right
steps: 0 question, 1 answer
props:
  size: px (≥ 24)
example: {"question": "Oldest first", "items": ["Jomon", "Yayoi", "Kofun", "Asuka"], "note": "Rice came in Yayoi"}
---

Child JSON: `{"question"?, "items": [text or {"label", "tone"?}] (right order, 2–8), "start"?: [indices], "note"?, "labels"?: {"correct"?}}`

- Cards start in `start` or shifted by one
- Drag, or Tab, Space, ↑ ↓, Space
- Answer in the file, judged on the device: for checks, not exams

<!-- llm: omit -->
Notes for authors of parts (check with dev)

- Steps: 0 question and cards (the start order); 1 cards move into the right order, ✓ on those the viewer had right, "yours: 3" beside the others, "✓ Correct" or "✗ Incorrect" and `note`; cards cannot move there
- A `start` that is not a permutation of 0…n−1, or is the right order, is reported (`data`); the cards start shifted by one
- Nothing ahead under preview (`static preview = "none"`)
- Viewer state (spec §8.4): the order survives step changes on the slide; restored only on `ctx.entered`; `ctx.reset` drops focus and a held card
- Answers (spec §8.4 `ctx.answer`): arriving at step 1 after a move calls `ctx.answer("q", correct, value)` once (again after going back); value = the `items` indices in the viewer's order joined by "," (`"2,0,1,3"`); no partial credit; nothing without a move, in video, in print or without `ctx.answer`. `static questions = ["q"]`
- Keys: Space (and Enter) picks up and drops, ↑ ↓ move a held card, Esc puts it back; moves announced (aria-live). Keys used on a card never reach the slide; Tab follows the cards on screen
- Video: no controls; step 1 moves the cards, no marks. Print: the start order, controls hidden by `@media print`
- Vertical slides: stays horizontal; reports `layout` when it does not fit
- UI text follows ctx.lang; `labels.correct` overrides the mark
<!-- llm: end -->

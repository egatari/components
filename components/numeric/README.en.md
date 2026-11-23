---
summary: Answer with a number; then the answer, a ✓/✗ mark, the note
steps: 0 question, 1 answer
props:
  size: px (≥ 24)
example: {"question": "3 cm cube volume?", "answer": 27, "unit": "cm³", "note": "3 × 3 × 3"}
---

Child JSON: `{"question", "answer": number, "tolerance"?: ±, "unit"?, "note"?, "labels"?: {"correct"?}}`

- Reads `−`, decimals, `1,000`, the unit; other text: no answer
- Answer in the file, judged on the device: for checks, not exams

<!-- llm: omit -->
Notes for authors of parts (check with dev)

- Steps: 0 question and field (empty); 1 the answer (with "(±tolerance)"), "✓ Correct" or "✗ Incorrect" beside the viewer's number, `note`; the field is read-only there
- Nothing ahead under preview (`static preview = "none"`)
- Viewer state (spec §8.4): the typed text survives step changes on the slide; emptied only on `ctx.entered`; `ctx.reset` only drops focus
- Answers (spec §8.4 `ctx.answer`): arriving at step 1 with a number calls `ctx.answer("q", correct, number)` once (again after going back); not without a number, in video, in print or without `ctx.answer`. `static questions = ["q"]`
- Parsing: trims white space and the `unit` string (exactly, once, at either end); full-width digits, `．`, `−` `－`, `＋`, `，` normalised; a leading `+` is read, `,` dropped; else not a number (hint "Enter a number"). Right when |x − answer| ≤ tolerance + 1e-9 × answer
- Video: an empty box, step 1 the answer line and note only. Print: the author's state, field hidden by `@media print`
- Vertical slides: stays horizontal; reports `layout` when it does not fit
- Keys in the field never reach the slide; Enter/Esc leave it
- UI text follows ctx.lang; `labels.correct` overrides the mark
<!-- llm: end -->

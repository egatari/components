# m-order changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (unreleased)

- New: an ordering question. `items` are written in the right order; the cards start in `start` or rotated by one (no card in its place, no randomness). The viewer drags the cards or moves them from the keyboard (Space picks up and drops, ↑ ↓ move, Esc puts back; moves announced). The answer step moves the cards into the right order, marks the cards the viewer had in place and reports the answer to the player once on arrival (`ctx.answer("q", correct, "2,0,1,3")`, spec §8.4; `static questions = ["q"]`). Nothing ahead under preview; no controls in video; the start order in print.

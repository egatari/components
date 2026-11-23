# m-numeric changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (unreleased)

- New: a question answered with a number. The viewer types a number (full-width digits, minus signs, decimals, digit separators and the declared unit are read); the answer step shows the right answer, a right/wrong mark beside the viewer's number and the note, and reports the answer to the player once on arrival (`ctx.answer("q", correct, number)`, spec §8.4; `static questions = ["q"]`). `tolerance` accepts answers within ± that much. Nothing ahead under preview; no field in video; the author's state in print.

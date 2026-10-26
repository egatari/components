# Reading abcjs 6.7.2 for m-score (notes for the build hook)

m-score knows nothing about abcjs beyond the frozen output shape (components 2.0 design §4.1): `abcSvg` with each note's
classes (`cls`), `abcMap` (`tempo`, `notes`, `beams`, `arcs`), and `data-arc="k"` on every drawn tie or slur piece. These are
the abcjs facts a producer needs to get there. `tools/score-fixtures.mjs` follows them. It is the stand-in for Studio's build
hook and writes `fixtures/*.json` and `demo.html`. They were checked on the fixtures here (`ties.json` is test-only) and in
abcjs's source (`src/write/creation/abstract-engraver.js`, `src/write/draw/tie.js`, `src/write/draw/beam.js`).

## Notes

- With `add_classes: true`, a note or rest is a `<g>` with `abcjs-note` or `abcjs-rest`, `abcjs-l<line>`, `abcjs-m<measure in the line>`,
  `abcjs-mm<measure>`, `abcjs-v<voice>` and `abcjs-n<note in the measure>`. Only `abcjs-v… abcjs-mm… abcjs-n…` together is unique.
- Pitch name: the letter and octave come from `pitches[q].pitch` (a diatonic step, 0 = C4). The accidental comes from the
  sounding MIDI pitch after `tune.setUpAudio()` (`midiPitches[q].pitch`). A tied continuation has no `midiPitches`.
- `duration` is in whole notes. Multiply it by 4 for quarter notes, and by `tripletMultiplier` from `startTriplet` to
  `endTriplet`. Tempo is `bpm × Σ duration × 4` quarter notes per minute.
- abcjs writes the tempo, title and lyrics at 16–20 units, below the 24 px floor. Render with `%%printtempo false` and without `T:`.

## Beams

`drawBeam` draws one path per beam group, all levels in one path, with class `abcjs-beam-elem`. The paths come in the
order of the engraved voice's `beams` (`tune.lines[l].staffGroup.voices[v].beams`, skipping `'bar'`). The notes of each
group are in `elems[].abcelem`.

## Ties and slurs

- **Which arcs exist** (from the parsed notes): a tie per pitch, from a pitch with `startTie` to the next note whose pitch
  with the same step has `endTie`. abcjs ends a tie on the first open tie with that pitch, or else the oldest one. A slur
  runs from `startSlur` to the `endSlur` with the same label, on the note or on a pitch. `[C-EG] [CEG]` ties only C.
- **Which path is which:** each drawn arc is a `TieElem` in the engraved voice's `otherchildren`. Its path is in `elemset[0]`
  and its end noteheads are `anchor1` and `anchor2`. The notehead's `parent.abcelem` is the note, and `parent.heads`
  gives the pitch. A `TieElem` does not record whether it is a tie or a slur.
- **Line breaks:** an arc that crosses a line break is drawn once per line. The piece on the first line has only `anchor1`
  (class `abcjs-end-edge`). At the start of each later line abcjs recreates every open arc. That piece has only `anchor2`,
  or neither on a middle line (class `abcjs-start-edge`).
- **Drawing order**, per staff line (the order of `otherchildren`):
  1. First, the pieces continued from the previous line: all open slurs, in start order, then all open ties in the
     order they were created (by start note; a chord's pitches low to high).
  2. Then the arcs that start on this line, by start note. At one note abcjs goes pitch by pitch, low to high. For each
     pitch it creates that pitch's tie, then any slur starting on that pitch. A slur over a chord sits on the lowest pitch.
     So the order at one note is: the lowest pitch's tie, the slur, then the other pitches' ties.
- **Class quirks:**
  - Every arc path has `abcjs-slur`.
  - A slur within a line has `abcjs-legato`.
  - A slur piece cut by a line break is drawn like a tie and has `abcjs-tie`.
  - So does a slur between two notes of the same pitch with nothing between them.
- **Hidden duplicate:** the slur leaving a tied chord at a line break is drawn on exactly the same path as the lowest
  pitch's tie, so it cannot be seen. The build drops it.
- **How `tools/score-fixtures.mjs` tags a piece:**
  - A piece with both anchors matches the one arc between those notes; a tie must also match by pitch.
  - A piece with one anchor can match both a tie and a slur at the same note. Then the order above decides: on the start
    line the tie comes first, and on the next line the slur comes first.
  - Every piece gets `data-arc="<n>"`. If a piece matches no arc, or more than one, the script fails.

## What m-score does with it

- Notes are found by `cls`.
- Bar lines are found by `abcjs-mm`. They appear with the last note of their measure.
- The k-th `abcjs-beam-elem` path is `beams[k]`.
- Arc pieces are found only by `data-arc`. A tie piece appears with the note it leads to (`to`), a slur piece with its
  first note (`from`).
- A pitch is not sounded again at note `j` when a tie arc has `to = j` and that `pitch`. A tied pitch sounds for the
  whole chain.

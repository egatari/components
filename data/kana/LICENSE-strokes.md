# Licence of the kana stroke shapes (`strokes.ofl.json`)

`strokes.ofl.json` holds the outline and the centreline of every stroke of 166 kana. The shapes are **derived from
strokesvg** (<https://github.com/zhengkyl/strokesvg>, commit `e4c2c91034e03c9c2f4e95f14f2361a948f52cd0`), whose kana
SVG files are derived from the **Klee One** font. Like their source, they are licensed under the
**SIL Open Font License, Version 1.1** — see [`OFL.txt`](OFL.txt). The same notice travels inside the file, in its
top-level `"_license"` field.

Copyright lines, as found in the sources:

- `Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee)` — the font (its `OFL.txt`)
- `Copyright (c) 2024 Kyle` — strokesvg (its `LICENSE`)

Klee One declares no Reserved Font Name. Following the review, no file or asset of ours carries the font's name.

Other files:

- [`OFL.txt`](OFL.txt): the SIL Open Font License 1.1 with the font's copyright line.
- [`LICENSE-strokesvg.txt`](LICENSE-strokesvg.txt): strokesvg's licence file as published (its notice, its MIT licence
  for code, and the OFL). The MIT part covers code; `tools/kana-import-strokesvg.mjs` does not copy strokesvg code
  (it reads the SVG files as data), and the reveal in `proto.html` follows strokesvg's method (a round-capped
  centreline clipped by each stroke's outline, advanced with `stroke-dashoffset`).
- [`strokes-CHANGES.md`](strokes-CHANGES.md): our modifications, FONTLOG-style. They are part of the OFL work.

`kana.json` (order, counts, endings, loops, placement, notes) is ours and MIT, like the rest of this repository; it
holds no shapes.

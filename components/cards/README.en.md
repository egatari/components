---
summary: Cards (number circle, icon, title, text) in one row or two rows, shown step by step. Arrows show order; a coloured frame highlights one
steps: the largest card step (default one card = one step; per-step for n cards)
props:
  layout: row (one row) or grid (2 rows: 2×2 up to 4 cards, 3×2 for 5–6)
  arrows: order arrows between cards (grid: Z order 1→2→3→4)
  nums: number circles (a card's n wins)
  hilite: card to highlight: last or a number (from 1); --emph frame and fill
  per-step: cards per step (0 = all in step 1)
  stagger: start offset between cards in one step (s)
  dur: seconds a card takes to appear
---

Use for steps (listen → summarise → reply), 3–4 key points, or a 2×2 set of cases, as cards with icons.

Child JSON: `{"cards": [{"n", "icon", "title", "text", "step", "tone"}, …]}` (2–6 cards).

- `title`: heading (required; up to 2 lines). `text`: description (wraps to fit; cut with … and reported if it doesn't fit)
- `icon`: icon name (Tabler Icons outline; see the list below. Other names work; an unknown name draws a dashed box and is reported)
- `n`: text in the number circle (`"A"`, `"1"`, …). `nums` numbers cards without `n` 1, 2, 3 …
- `tone`: colour of the number circle and icon (`term` (default), `emph`, `accent2`, `series-1..4`)
- `layout="grid"`: 2 rows (2×2 up to 4 cards, 3×2 for 5–6). Wide cards put number, icon and title on one line
- `arrows`: order arrows between cards (grid: Z order 1→2→3→4). `hilite="last"` or `hilite="3"`: that card gets an `--emph` frame and fill
- Entrance (`variant`, conventions §1): `rise` (from below, default), `fade` (in place), `draw` (frame and arrows first, then content)

Icon names (common):

- People: user users user-check user-plus user-circle friends mood-smile man woman id-badge
- Data: chart-bar chart-line chart-pie chart-dots trending-up trending-down table database filter adjustments percentage sum
- Money: coin cash credit-card wallet receipt pig-money building-bank report-money shopping-cart tag
- Time: clock calendar calendar-event calendar-time hourglass history alarm stopwatch
- Places: map-pin map world home building building-factory building-store route truck
- Process: arrow-right arrows-right-left refresh repeat circle-check checklist list-numbers git-branch target flag rocket hand-click
- Communication: message messages mail phone bell speakerphone share world-www microphone presentation
- Documents: file file-text files notebook book clipboard-list folder news certificate award
- Tools: tool settings hammer bulb puzzle cpu device-laptop device-mobile robot code scale
- Nature: leaf tree plant sun moon cloud cloud-rain droplet flame snowflake
- Safety: shield shield-check lock key alert-triangle first-aid-kit heart heart-rate-monitor eye
- Learning: school pencil ruler math-function atom flask microscope palette music language

The demo is `demo.html`. Companies and numbers are fictional.

<!-- llm: omit -->
Notes for authors of parts

- **Icons** come by name from the library part `icons` (Tabler Icons outline, MIT); a build keeps only the names a lesson uses (spec §6.2). Colour is `currentColor`; the card sets `color: var(--<tone>)`
- **Sizes**: from the card size: icon 32–64 px, title 26–34 px, text 24 px (line 34 px)
- **Wrapping**: breaks after spaces and commas, and at script boundaries; line-start rules for Japanese punctuation. Overflow is cut with … and reported once (`layout`)
- **Screen readers**: svg `role="list"`, each card `role="listitem"` with an `aria-label` of number, title and text; icons and arrows `aria-hidden`
- Lecture view (`ctx.preview`): later cards in their final form at `--preview-opacity`. Print and video show the last step
<!-- llm: end -->

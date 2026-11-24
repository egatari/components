# m-construct changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (unreleased)

- New: compass-and-straightedge constructions one op per step (`mode="steps"`: points, segments, lines, rays, circles, compass arcs, meeting points the part computes, angle marks and values, equal-length and equal-angle ticks, filled polygons; a numbered notes panel), and a point moved while a measure stays the same (`mode="invariant"`: an inscribed angle, the sum of a triangle's angles). Reports arcs that do not meet (with the radius they need), unknown names (with the near one), moving a meeting point, and overlapping text. Later steps faint under preview.

---
summary: sklearn classifiers in 2-D: regions, contours, SVs, Voronoi, tree splits, k-means
steps: points → regions → contours → SVs
props:
  dur: s per step
  size: text px
  marker: marker px
example: {"axes":{"x":{"label":"x₁","range":[0,4]},"y":{"label":"x₂","range":[0,3]}},"classes":[{"id":0,"label":"A"},{"id":1,"label":"B"}],"points":[[1,1,0],[1.2,2,0],[2.8,1.1,1],[3.1,2.4,1]],"grid":{"nx":5,"ny":4,"labels":"0*2 1*3 0*2 1*3 0*2 1*3 0*3 1*2"}}
---

From `uv run tools/sk2ega.py <module> data.csv --fit "Est(args)"`.
<!-- llm: omit -->
- Modules: linear_model, svm, neighbors, tree, ensemble, cluster. `--fit` reads names and literals only; `--model` loads a pickle (runs code; your own files only).
- `grid.labels`: predict over linspace/meshgrid, row 0 = min y. `fields`: proba or decision with `levels`. `sv`: point indices.
- `voronoi` seeds: cells computed by the part. `tree`: splits drawn in parent cells, ids as in m-tree. `kmeans`: assignments and means checked.
- Classes: series colours and marker shapes. No preview of later steps.
<!-- llm: end -->

Demo: `demo.html` (fictional data from `tools/classify2d-demo.py`).

<!-- llm: omit -->
Notes

- Fine grids make large JSON; the demo uses 48 × 32.
- Many points overlap; lower `marker`.
<!-- llm: end -->

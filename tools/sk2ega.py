# /// script
# requires-python = ">=3.10"
# dependencies = ["scikit-learn>=1.4", "numpy"]
# ///
"""Write m-classify2d JSON from scikit-learn, one subcommand per sklearn module.

    uv run tools/sk2ega.py linear_model data.csv --fit "LogisticRegression(C=1.0)" [--levels 0.25,0.5,0.75]
    uv run tools/sk2ega.py svm          data.csv --fit "SVC(kernel='rbf', C=1.0)"
    uv run tools/sk2ega.py neighbors    data.csv --fit "KNeighborsClassifier(n_neighbors=1)"
    uv run tools/sk2ega.py tree         data.csv --fit "DecisionTreeClassifier(max_depth=2)" [--tree-out tree.json]
    uv run tools/sk2ega.py ensemble     data.csv --fit "RandomForestClassifier(n_estimators=50, random_state=0)"
    uv run tools/sk2ega.py cluster      data.csv --fit "KMeans(n_clusters=3, random_state=0)" [--iters 6]
    uv run tools/sk2ega.py model_selection data.csv --fit "StratifiedKFold(n_splits=4, shuffle=True, random_state=0)" \
        [--label class] [--group site] [--t month]      → m-folds JSON (samples and splits); also "holdout:0.25"

data.csv: two feature columns and (except cluster) a class column; --x, --y and --label pick them by name (default: the
first three columns). --fit builds the estimator from its name and literal keyword arguments only (no code is run), fits
it on data.csv and never loads a file. --model model.pkl loads your own fitted model instead: loading a pickle RUNS CODE,
so use it only for files you made. Common options: --grid 120x80 (the meshgrid for predict and the fields), --range
"x0,x1,y0,y1" (default: the data range plus 10 %), --out file.json. Classes are the sorted labels; their names are the
labels as written.
"""
import argparse
import ast
import csv
import json
import sys

import numpy as np

MODULES = {
    "linear_model": "sklearn.linear_model", "svm": "sklearn.svm", "neighbors": "sklearn.neighbors",
    "tree": "sklearn.tree", "ensemble": "sklearn.ensemble", "cluster": "sklearn.cluster", "model_selection": "sklearn.model_selection",
}
SPLITTERS = {"KFold", "StratifiedKFold", "GroupKFold", "TimeSeriesSplit", "ShuffleSplit"}


def estimator(module, spec):
    """'SVC(kernel="rbf", C=1.0)' → an instance; only a class of that module and literal keyword values."""
    node = ast.parse(spec.strip(), mode="eval").body
    if isinstance(node, ast.Name):
        name, kwargs = node.id, {}
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.args:
        name, kwargs = node.func.id, {k.arg: ast.literal_eval(k.value) for k in node.keywords}
    else:
        sys.exit(f"--fit takes Name(key=literal, …), e.g. \"LogisticRegression(C=1.0)\"; got {spec!r}")
    mod = __import__(MODULES[module], fromlist=[name])
    cls = getattr(mod, name, None)
    if not isinstance(cls, type):
        sys.exit(f"{MODULES[module]} has no estimator {name}")
    return cls(**kwargs)


def read_csv(path, xcol, ycol, lcol, need_label):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    head, body = rows[0], [r for r in rows[1:] if r]
    pick = lambda c, d: head.index(c) if c else d
    ix, iy = pick(xcol, 0), pick(ycol, 1)
    X = np.array([[float(r[ix]), float(r[iy])] for r in body])
    y = None
    if need_label:
        il = pick(lcol, 2)
        y = np.array([r[il] for r in body])
    return head[ix], head[iy], X, y


def r6(v):
    return float(f"{float(v):.6g}")


def r4(v):
    return float(f"{float(v):.4g}")


def rle(labels):
    out, flat = [], [int(v) for v in labels.ravel()]
    i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i]:
            j += 1
        out.append(f"{flat[i]}*{j - i}" if j - i > 1 else str(flat[i]))
        i = j
    return " ".join(out)


def folds(a):
    """m-folds JSON: one cell per sample (class, group, t from the CSV) and one row per split, as the splitter makes them."""
    if not a.fit:
        sys.exit("model_selection takes --fit \"KFold(n_splits=5)\" (or \"holdout:0.25\")")
    with open(a.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    head, body = rows[0], [r for r in rows[1:] if r]
    n = len(body)
    if not 2 <= n <= 60:
        sys.exit(f"{n} samples; m-folds draws 2–60")
    col = lambda c: [r[head.index(c)] for r in body] if c else None
    labels, groups, times = col(a.label), col(a.group), col(a.t)
    out = {"samples": [{} for _ in range(n)]}
    if labels:
        names = sorted(set(labels))
        if len(names) > 4:
            sys.exit(f"{len(names)} classes; m-folds colours at most 4")
        out["classes"] = [{"id": i, "label": v} for i, v in enumerate(names)]
        for s, v in zip(out["samples"], labels):
            s["class"] = names.index(v)
    if groups:
        for s, v in zip(out["samples"], groups):
            s["group"] = v
    if times:
        for s, v in zip(out["samples"], times):
            s["t"] = float(v) if v.replace(".", "", 1).lstrip("-").isdigit() else v
            if isinstance(s["t"], float) and s["t"].is_integer():
                s["t"] = int(s["t"])
    idx = np.arange(n)
    if a.fit.startswith("holdout:"):
        from sklearn.model_selection import train_test_split
        tr, te = train_test_split(idx, test_size=float(a.fit.split(":")[1]), random_state=0, stratify=labels)
        out["splitter"], splits = "holdout", [(tr, te)]
    else:
        sp = estimator("model_selection", a.fit)
        name = type(sp).__name__
        if name not in SPLITTERS:
            sys.exit(f"{name}: m-folds draws {', '.join(sorted(SPLITTERS))} or holdout")
        out["splitter"] = name
        splits = list(sp.split(idx.reshape(-1, 1), labels, groups if name == "GroupKFold" else None))
    if len(splits) > 10:
        sys.exit(f"{len(splits)} splits; m-folds draws at most 10")
    out["splits"] = [{"test": sorted(int(i) for i in te), "train": sorted(int(i) for i in tr)} for tr, te in splits]
    if not any(out["samples"]):
        out.pop("samples")
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("module", choices=sorted(MODULES))
    ap.add_argument("csv")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fit", help="estimator spec, e.g. \"SVC(kernel='linear')\"")
    g.add_argument("--model", help="a pickle of YOUR OWN fitted model (loading a pickle runs code)")
    ap.add_argument("--x"), ap.add_argument("--y"), ap.add_argument("--label")
    ap.add_argument("--group", help="model_selection: the group column (GroupKFold)")
    ap.add_argument("--t", help="model_selection: the time column (shown at the ends)")
    ap.add_argument("--grid", default="120x80")
    ap.add_argument("--range")
    ap.add_argument("--levels", help="contour levels of the field (default: 0.5 for probabilities, -1,0,1 for SVM)")
    ap.add_argument("--iters", type=int, default=10, help="cluster: at most this many k-means iterations")
    ap.add_argument("--tree-out", help="tree: also write m-tree JSON with the same node ids")
    ap.add_argument("--out")
    a = ap.parse_args()

    if a.module == "model_selection":
        return folds(a)
    xl, yl, X, y = read_csv(a.csv, a.x, a.y, a.label, a.module != "cluster")
    if len(X) > 300:
        sys.exit(f"{len(X)} points; m-classify2d draws at most 300")
    if a.range:
        x0, x1, y0, y1 = [float(v) for v in a.range.split(",")]
    else:
        lo, hi = X.min(axis=0), X.max(axis=0)
        pad = (hi - lo) * 0.1 + 1e-9
        x0, y0 = (lo - pad).tolist()
        x1, y1 = (hi + pad).tolist()
        x0, x1, y0, y1 = r6(x0), r6(x1), r6(y0), r6(y1)
    data = {"axes": {"x": {"label": xl, "range": [x0, x1]}, "y": {"label": yl, "range": [y0, y1]}}}

    if a.module == "cluster":
        model = estimator(a.module, a.fit) if a.fit else None
        k = getattr(model, "n_clusters", 3) if model is not None else 3
        rs = getattr(model, "random_state", 0) if model is not None else 0
        from sklearn.cluster import kmeans_plusplus
        C, _ = kmeans_plusplus(X, n_clusters=k, random_state=rs)
        iters = []
        for _ in range(a.iters):   # Lloyd's algorithm from the k-means++ start, as KMeans runs it
            d = ((X[:, None, :] - C[None, :, :]) ** 2).sum(axis=2)
            assign = d.argmin(axis=1)
            iters.append({"centroids": [[r6(c[0]), r6(c[1])] for c in C], "assign": [int(v) for v in assign]})
            newC = np.array([X[assign == j].mean(axis=0) if (assign == j).any() else C[j] for j in range(k)])
            if np.allclose(newC, C):
                break
            C = newC
        data["points"] = [[r6(p[0]), r6(p[1])] for p in X]
        data["kmeans"] = {"iters": iters}
    else:
        if a.fit:
            model = estimator(a.module, a.fit)
        else:
            import pickle
            print(f"warning: loading {a.model} runs code inside it; use only your own files", file=sys.stderr)
            with open(a.model, "rb") as f:
                model = pickle.load(f)
        names = sorted(set(y.tolist()))
        if len(names) > 4:
            sys.exit(f"{len(names)} classes; m-classify2d draws at most 4")
        yi = np.array([names.index(v) for v in y])
        if a.fit:
            model.fit(X, yi)
        data["classes"] = [{"id": i, "label": n} for i, n in enumerate(names)]
        data["points"] = [[r6(p[0]), r6(p[1]), int(c)] for p, c in zip(X, yi)]
        if a.module == "tree":
            t = model.tree_
            ids = lambda n: f"n{n}"
            nodes, tnodes = [], []
            for n in range(t.node_count):
                if t.children_left[n] == -1:
                    c = int(np.argmax(t.value[n][0]))
                    nodes.append({"id": ids(n), "class": c})
                    tnodes.append({"id": ids(n), "label": names[c]})
                else:
                    f, thr = int(t.feature[n]), r6(t.threshold[n])
                    nodes.append({"id": ids(n), "feature": f, "threshold": thr, "left": ids(t.children_left[n]), "right": ids(t.children_right[n])})
                    tnodes.append({"id": ids(n), "label": f"{[xl, yl][f]} ≤ {thr}"})
            data["tree"] = {"nodes": nodes}
            if a.tree_out:
                # m-tree: the same node ids, each child with its parent and the branch ("≤" left, ">" right, as sklearn splits)
                for n in range(t.node_count):
                    for c, br in ((t.children_left[n], "≤"), (t.children_right[n], ">")):
                        if c != -1:
                            tnodes[c]["parent"], tnodes[c]["branch"] = ids(n), br
                with open(a.tree_out, "w", encoding="utf-8") as f:
                    json.dump({"nodes": tnodes}, f, ensure_ascii=False)
                    f.write("\n")
        else:
            nx, ny = [int(v) for v in a.grid.lower().split("x")]
            gx, gy = np.linspace(x0, x1, nx), np.linspace(y0, y1, ny)
            XX, YY = np.meshgrid(gx, gy)
            G = np.c_[XX.ravel(), YY.ravel()]
            data["grid"] = {"nx": nx, "ny": ny, "labels": rle(model.predict(G).reshape(ny, nx))}
            fields = []
            if a.module == "svm" and hasattr(model, "decision_function") and len(names) == 2:
                lv = [float(v) for v in a.levels.split(",")] if a.levels else [-1.0, 0.0, 1.0]
                vals = model.decision_function(G).reshape(ny, nx)
                fields.append({"name": "decision", "values": [[r4(v) for v in row] for row in vals], "levels": lv,
                               "style": ["solid" if v == 0 else "dash" for v in lv]})
                data["sv"] = [int(i) for i in model.support_]
            elif hasattr(model, "predict_proba") and len(names) == 2 and a.module in ("linear_model", "ensemble") or a.levels:
                lv = [float(v) for v in a.levels.split(",")] if a.levels else [0.5]
                vals = model.predict_proba(G)[:, 1].reshape(ny, nx)
                fields.append({"name": "proba", "values": [[r4(v) for v in row] for row in vals], "levels": lv,
                               "style": ["solid" if v == 0.5 else "dash" for v in lv]})
            if fields:
                data["fields"] = fields
            if a.module == "neighbors" and getattr(model, "n_neighbors", None) == 1:
                data["voronoi"] = {"seeds": [[r6(p[0]), r6(p[1]), int(c)] for p, c in zip(X, yi)]}
                data.pop("grid")   # 1-NN: the Voronoi cells are the regions
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)


if __name__ == "__main__":
    main()

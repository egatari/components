# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""The m-contour demo values. Prints one JSON per line:
1. f = x² + 3y², gradient descent with learning rate 0.1 from (2.5, 1.5) (x ← 0.8x, y ← 0.4y);
2. the saddle f = x² − y²;
3. a loss surface on a grid: the mean squared error of y = w·x + b over fictional points, with gradient descent on (w, b)."""
import json

import numpy as np


def r(v):
    return float(f"{float(v):.4g}")


# 1
p, path = np.array([2.5, 1.5]), []
for _ in range(7):
    path.append([r(p[0]), r(p[1])])
    p = p - 0.1 * np.array([2 * p[0], 6 * p[1]])
print(json.dumps({"f": "x**2 + 3*y**2", "label": "*f* = *x*² + 3*y*²", "range": {"x": [-3, 3], "y": [-2, 2]}, "levels": [0.5, 2, 4, 8],
                  "gradient": {"at": [[1, 1], [-2, 0.5]], "tangent": True}, "path": path, "monotone": True}, ensure_ascii=False))
# 2
print(json.dumps({"f": "x**2 - y**2", "label": "*f* = *x*² − *y*²", "range": {"x": [-2, 2], "y": [-2, 2]}, "levels": [-2, -0.5, 0.5, 2],
                  "gradient": {"at": [[1, 0.5], [-0.5, -1.2]]}}, ensure_ascii=False))
# 3: fictional points around y = 2x + 1
rng = np.random.default_rng(4)
x = np.linspace(-1, 1, 12)
y = 2 * x + 1 + rng.normal(0, 0.3, x.size)
W, B = np.linspace(-1, 4, 41), np.linspace(-1.5, 3.5, 31)
loss = np.array([[np.mean((w * x + b - y) ** 2) for w in W] for b in B])
p, path = np.array([-0.5, -1.0]), []
for _ in range(10):
    path.append([r(p[0]), r(p[1])])
    e = p[0] * x + p[1] - y
    p = p - 0.35 * np.array([2 * np.mean(e * x), 2 * np.mean(e)])
print(json.dumps({"grid": {"nx": W.size, "ny": B.size, "values": [[r(v) for v in row] for row in loss]}, "axes": {"x": "*w*", "y": "*b*"},
                  "label": "平均二乗誤差", "range": {"x": [-1, 4], "y": [-1.5, 3.5]}, "levels": [0.2, 0.5, 1, 2, 4], "path": path, "monotone": True}, ensure_ascii=False))

# Writes the forward passes in components/nnet/demo.html (fictional weights): uv run --with numpy python tools/nnet-demo.py
# Weights and biases are rounded to 2 decimals first; z and a are computed from the rounded values and printed with 2 decimals.
import json
import numpy as np

def forward(x, Ws, bs, acts):
    a, zs, as_ = np.array(x, float), [], []
    for W, b, act in zip(Ws, bs, acts):
        z = np.array(W) @ a + np.array(b)
        if act == "relu": a = np.maximum(0, z)
        elif act == "sigmoid": a = 1 / (1 + np.exp(-z))
        elif act == "step": a = (z >= 0).astype(float)
        elif act == "softmax": e = np.exp(z - z.max()); a = e / e.sum()
        else: a = z
        zs.append(z); as_.append(a)
    r = lambda v: [round(float(t), 2) for t in v]
    return [r(z) for z in zs], [r(a) for a in as_]

# 1. perceptron for AND, input (1, 1)
W1, b1 = [[[1.0, 1.0]]], [[-1.5]]
z, a = forward([1, 1], W1, b1, ["step"])
perceptron = {"layers": [{"n": 2, "label": "入力", "names": ["*x*_1", "*x*_2"]}, {"n": 1, "label": "出力", "act": "step", "form": "split", "names": ["*y*"]}],
              "weights": W1, "biases": b1, "values": {"x": [1, 1], "z": z, "a": a}}

# 2. a 3-4-4-2 network (seeded, fictional)
sizes = [3, 4, 4, 2]
x = [0.5, -1.2, 0.8]
for seed in range(1000):  # the first seed where at least 3 neurons of each hidden layer are active (ReLU > 0)
    rng = np.random.default_rng(seed)
    Ws = [np.round(rng.normal(0, 0.8, (sizes[i + 1], sizes[i])), 2).tolist() for i in range(3)]
    bs = [np.round(rng.normal(0, 0.3, sizes[i + 1]), 2).tolist() for i in range(3)]
    z, a = forward(x, Ws, bs, ["relu", "relu", "sigmoid"])
    if sum(v > 0 for v in a[0]) >= 3 and sum(v > 0 for v in a[1]) >= 3: break
deep = {"layers": [{"n": 3, "label": "入力層", "names": ["*x*_1", "*x*_2", "*x*_3"]}, {"n": 4, "label": "隠れ層 1", "act": "relu"},
                   {"n": 4, "label": "隠れ層 2", "act": "relu"}, {"n": 2, "label": "出力層", "act": "sigmoid", "names": ["*y*_1", "*y*_2"]}],
        "weights": Ws, "biases": bs, "values": {"x": x, "z": z, "a": a}}
opened = dict(deep, steps=[{"show": "x"}, {"layer": 1, "phase": "a"}, {"open": 2, "note": "隠れ層 2 を Σ と ReLU に分けて見る"},
                           {"layer": 2, "phase": "z"}, {"focus": [2, 0]}, {"layer": 2, "phase": "a"}, {"layer": 3, "phase": "a"}])
print(json.dumps({"perceptron": perceptron, "deep": deep, "opened": opened}, ensure_ascii=False))

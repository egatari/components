# Writes the tables in components/ctable/demo.html (fictional data): uv run --with numpy --with scipy python tools/ctable-demo.py
import json
import numpy as np
from scipy import stats

# 1. one-way ANOVA: three teaching methods, 5 students each (fictional test scores)
groups = {"A": [62, 70, 68, 65, 70], "B": [72, 75, 70, 78, 75], "C": [80, 77, 84, 79, 80]}
ys = np.concatenate(list(groups.values())); grand = ys.mean()
ss_a = sum(len(v) * (np.mean(v) - grand) ** 2 for v in groups.values())
ss_e = sum(((np.array(v) - np.mean(v)) ** 2).sum() for v in groups.values())
df_a, df_e = len(groups) - 1, len(ys) - len(groups)
ms_a, ms_e = ss_a / df_a, ss_e / df_e
f = ms_a / ms_e; p = stats.f.sf(f, df_a, df_e)
r = lambda v, d=1: round(float(v), d)
anova = {"kind": "anova", "rows": [
    {"name": "教え方", "ss": r(ss_a), "df": df_a, "ms": r(ms_a, 2), "f": r(f, 2), "p": r(p, 4)},
    {"name": "誤差", "ss": r(ss_e), "df": df_e, "ms": r(ms_e, 2)},
    {"name": "全体", "ss": r(ss_a + ss_e), "df": df_a + df_e}]}

# 2. a 2 × 2 table (fictional survey): expected counts, χ² (no continuity correction) and the odds ratio
n = np.array([[30, 10], [15, 25]])
chi2, _, _, exp = stats.chi2_contingency(n, correction=False)
odds = n[0, 0] * n[1, 1] / (n[0, 1] * n[1, 0])
cont = {"kind": "contingency", "rows": ["朝食あり", "朝食なし"], "cols": ["眠くない", "眠い"], "n": n.tolist(),
        "expected": [[r(x) for x in row] for row in exp], "chi2": r(chi2, 2), "or": r(odds, 2)}

# 3. potential outcomes (fictional): both outcomes are known only in this made-up table
units = [("1", 1, 60, 72), ("2", 1, 70, 75), ("3", 1, 65, 74), ("4", 0, 55, 63), ("5", 0, 58, 62), ("6", 0, 50, 61)]
y0 = np.array([u[2] for u in units]); y1 = np.array([u[3] for u in units]); t = np.array([u[1] for u in units])
po = {"kind": "po", "units": [{"id": u[0], "t": u[1], "y0": u[2], "y1": u[3]} for u in units],
      "ate": r((y1 - y0).mean(), 2), "naive": r(y1[t == 1].mean() - y0[t == 0].mean(), 2)}
print(json.dumps({"anova": anova, "cont": cont, "po": po}, ensure_ascii=False))

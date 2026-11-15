# Writes the traces in components/network/demo.html (fictional graphs): python3 tools/network-demo.py
"""Generate m-network demo traces (fictional graphs): BFS, Dijkstra, nearest neighbour + 2-opt."""
import heapq, json, math
from collections import deque

nodes = {"A": (0, 2), "B": (3, 0), "C": (3, 4), "D": (6, 1), "E": (6, 4), "F": (9, 2)}
edges = [("A", "B", 4), ("A", "C", 2), ("B", "C", 1), ("B", "D", 5), ("C", "E", 8), ("D", "E", 2), ("D", "F", 6), ("E", "F", 3)]
adj = {n: [] for n in nodes}
for a, b, w in edges:
    adj[a].append((b, w)); adj[b].append((a, w))
for n in adj: adj[n].sort()
N = [{"id": k, "x": x, "y": y} for k, (x, y) in nodes.items()]
E = [{"from": a, "to": b, "w": w} for a, b, w in edges]

def bfs(s):
    steps, seen, q, visited, parent = [], {s}, deque([s]), [], {}
    steps.append({"frontier": [s], "note": f"{s} から始める"})
    while q:
        u = q.popleft(); visited.append(u); new = {}
        for v, _ in adj[u]:
            if v not in seen: seen.add(v); q.append(v); new[v] = u
        parent.update(new)
        st = {"current": u, "visited": list(visited), "frontier": list(q)}
        if new: st["parent"] = new
        st["note"] = (f"{u} を取り出し、隣の " + "・".join(new) + " を後ろへ") if new else f"{u} を取り出す（新しい隣はない）"
        steps.append(st)
    steps.append({"current": None, "note": "全部の頂点を訪れた"})
    return {"nodes": N, "edges": [{"from": e["from"], "to": e["to"]} for e in E], "frontierKind": "queue", "steps": steps}

def dijkstra(s, t):
    dist = {s: 0}; parent = {}; done = []; pq = [(0, s)]; steps = []
    steps.append({"frontier": [[s, 0]], "note": f"{s} の距離を 0 に"})
    while pq:
        d, u = heapq.heappop(pq)
        if u in done: continue
        done.append(u); newp = {}
        for v, w in adj[u]:
            if v not in done and d + w < dist.get(v, math.inf):
                dist[v] = d + w; parent[v] = u; newp[v] = u; heapq.heappush(pq, (d + w, v))
        front = sorted({v: dist[v] for _, v in pq if v not in done}.items(), key=lambda x: (x[1], x[0]))
        st = {"current": u, "visited": list(done), "frontier": [[v, k] for v, k in front]}
        if newp: st["parent"] = newp
        st["note"] = f"{u}（距離 {d}）を確定"
        steps.append(st)
        if u == t: break
    path = [t]
    while path[-1] != s: path.append(parent[path[-1]])
    path.reverse()
    take = [[path[i], path[i + 1]] for i in range(len(path) - 1)]
    steps.append({"current": t, "frontier": [], "parent": {v: None for v in parent}, "take": take, "total": dist[t], "note": f"{s} から {t} への最短経路"})
    return {"nodes": N, "edges": E, "frontierKind": "pq", "total": {"label": "距離"}, "steps": steps}

import random
def pick_cities():
    # the first seed whose nearest-neighbour tour 2-opt improves (fictional points on a 10 × 6 grid, at least 2 apart)
    for seed in range(1000):
        r = random.Random(seed); pts = []
        while len(pts) < 7:
            p = (r.randint(0, 9), r.randint(0, 5))
            if all(math.hypot(p[0] - q[0], p[1] - q[1]) >= 2 for q in pts): pts.append(p)
        yield dict(zip("PQRSTUV", pts))
cities = None
def dd(a, b): (x1, y1), (x2, y2) = cities[a], cities[b]; return math.hypot(x1 - x2, y1 - y2)
def length(t): return sum(dd(t[i], t[(i + 1) % len(t)]) for i in range(len(t)))
def tsp():
    steps = []; tour = ["P"]; left = set(cities) - {"P"}
    while left:
        u = tour[-1]; v = min(sorted(left), key=lambda x: dd(u, x)); tour.append(v); left.remove(v)
        steps.append({"current": v, "visited": list(tour), "take": [[u, v]], "total": round(sum(dd(tour[i], tour[i+1]) for i in range(len(tour)-1)), 2), "note": f"{u} からいちばん近い {v} へ"})
    steps.append({"current": "P", "take": [[tour[-1], "P"]], "total": round(length(tour), 2), "note": "出発点へ戻る（最近傍法）"})
    improved = True
    while improved:
        improved = False
        n = len(tour)
        for i in range(n - 1):
            for j in range(i + 2, n if i > 0 else n - 1):
                a, b, c, d = tour[i], tour[i + 1], tour[j], tour[(j + 1) % n]
                if dd(a, c) + dd(b, d) < dd(a, b) + dd(c, d) - 1e-12:
                    tour[i + 1:j + 1] = reversed(tour[i + 1:j + 1])
                    steps.append({"current": None, "drop": [[a, b], [c, d]], "take": [[a, c], [b, d]], "total": round(length(tour), 2), "note": f"{a}–{b} と {c}–{d} を {a}–{c} と {b}–{d} に（2-opt）"})
                    improved = True; break
            if improved: break
    return {"nodes": [{"id": k, "x": x, "y": y} for k, (x, y) in cities.items()], "complete": True, "total": {"label": "巡回路の長さ", "check": False}, "steps": steps}

def markov():
    # a 3-state weather chain (fictional probabilities) and one seeded walk; the total is the walk's probability
    import random
    states = ["晴", "曇", "雨"]; pos = {"晴": (0, 0), "曇": (4, 0), "雨": (2, 3)}
    P = {"晴": {"晴": 0.6, "曇": 0.3, "雨": 0.1}, "曇": {"晴": 0.4, "曇": 0.4, "雨": 0.2}, "雨": {"晴": 0.2, "曇": 0.4, "雨": 0.4}}
    for seed in range(1000):  # the first seed whose 4-day walk visits all three states
        r = random.Random(seed); s = "晴"; prob = 1.0; steps = [{"current": s, "note": "晴の日から始める"}]; last = None
        for _ in range(4):
            t = r.choices(states, weights=[P[s][x] for x in states])[0]
            prob *= P[s][t]
            st = {"current": t, "take": [[s, t]], "total": round(prob, 4), "note": f"{s} → {t}（確率 {P[s][t]}）"}
            if last: st["drop"] = [last]
            steps.append(st); last = [s, t]; s = t
        if {x["current"] for x in steps} == set(states): break
    return {"directed": True, "stochastic": True, "nodes": [{"id": k, "x": x, "y": y} for k, (x, y) in pos.items()],
            "edges": [{"from": a, "to": b, "w": w} for a in states for b, w in P[a].items()],
            "total": {"label": "この道筋の確率", "check": False}, "steps": steps}

for cities in pick_cities():
    t = tsp()
    if any("drop" in st for st in t["steps"]): break
print(json.dumps({"bfs": bfs("A"), "dijkstra": dijkstra("A", "F"), "tsp": t, "markov": markov()}, ensure_ascii=False))

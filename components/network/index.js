// m-network：グラフの探索と巡回路。頂点（作者の座標）と辺（重み・向き）を描き、ステップごとに今の頂点・候補・訪れた頂点を
// 塗り分け、選んだ辺を 1 本ずつ引き、経路の長さなどの合計を出す。数値と状態は、探索を実際に走らせたスクリプトの出力を書く
// <m-network style="height:480px"><script type="application/json">
//   {"nodes": [{"id": "A", "x": 0, "y": 0}, {"id": "B", "x": 4, "y": 0}, {"id": "C", "x": 2, "y": 3}],
//    "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 3}, {"from": "B", "to": "C", "w": 2}],
//    "frontierKind": "queue", "total": {"label": "経路の長さ"},
//    "steps": [{"current": "A", "visited": ["A"], "frontier": ["B", "C"], "parent": {"B": "A", "C": "A"}},
//              {"current": "C", "visited": ["A", "C"], "frontier": ["B"], "take": [["A", "C"]], "total": 3}]}
// （JSON の終わり）</m-network>
// 座標は作者の単位のまま（y は下向き）。パーツが縦横の比を保って枠に収める。
// ステップの状態：current・visited・frontier・total は書いたステップからその値（書かなければ前のステップのまま。current の null で消す）。
// parent は前のステップに足していく（null で消す）。take と drop は選んだ辺の集まりを前のステップから増減する。
// 状態はステップ 1..k だけから決まる（(k, t) だけで画面が決まる）。
// 色：今の頂点 --emph（太い輪）、候補 --accent2（点線の輪と下の帯）、訪れた頂点 --muted の塗り、選んだ辺と探索の木 --term、ほかの辺 --line。
// 確かめること（data）：知らない id、ない辺の take（complete のときを除く）、選んでいない辺の drop、
// 選んだ辺がすべて重みを持つときに total が重みの和と合わないこと（total.check: false で確かめない）
egatariParts.define({name: "network", version: "2.0.0", requires: {base: "1.2.0"}, element: "m-network"}, function(deps){
"use strict";
var base = deps.base;
var ID = {type: "string"};
var PAIR = {type: "array", minItems: 2, maxItems: 2, items: ID};
var KIND = {
  queue: {ja: "待ち行列（左が先頭）", en: "Queue (front on the left)"},
  stack: {ja: "スタック（右が上）", en: "Stack (top on the right)"},
  pq:    {ja: "優先度付きキュー", en: "Priority queue"},
  set:   {ja: "候補", en: "Frontier"},
};
return class extends base.MotionElement {
  static partName = "network";
  static preview = "none";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes", "steps"], properties: {
      directed: {type: "boolean"},
      complete: {type: "boolean"},
      frontierKind: {type: "string", enum: ["queue", "stack", "pq", "set"]},
      total: {type: "object", additionalProperties: false, properties: {label: {type: "string"}, unit: {type: "string"}, digits: {type: "integer"}, check: {type: "boolean"}}},
      nodes: {type: "array", minItems: 1, maxItems: 24, items: {type: "object", additionalProperties: false, required: ["id", "x", "y"], properties: {
        id: ID, x: {type: "number"}, y: {type: "number"}, label: {type: "string"}}}},
      edges: {type: "array", maxItems: 60, items: {type: "object", additionalProperties: false, required: ["from", "to"], properties: {
        from: ID, to: ID, w: {type: "number"}}}},
      steps: {type: "array", minItems: 1, maxItems: 40, items: {type: "object", additionalProperties: false, properties: {
        current: {type: ["string", "null"]},
        visited: {type: "array", items: ID},
        frontier: {type: "array", items: {type: ["string", "array"]}},
        parent: {type: "object"},
        take: {type: "array", items: PAIR},
        drop: {type: "array", items: PAIR},
        total: {type: "number"},
        note: {type: "string"}}}}}},
    example: {nodes: [{id: "A", x: 0, y: 0}, {id: "B", x: 4, y: 0}], edges: [{from: "A", to: "B", w: 4}],
      steps: [{current: "A", frontier: ["B"]}, {current: "B", take: [["A", "B"]], total: 4}]},
  };
  static props = {
    dur:     {type: "number", default: 0.6, doc: "1 本の辺を引く秒数（頂点の色の変化はその半分）"},
    size:    {type: "number", default: 24, doc: "字の大きさ（px、24 以上）"},
    weights: {type: "bool", default: true, doc: "辺の重みを書く"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return ((this.data || {}).steps || []).length;
  }
  // 辺の鍵：向きのないグラフでは [A, B] と [B, A] を同じ辺にする
  key(a, b){ return this.directed || a < b ? a + "\u0000" + b : b + "\u0000" + a; }
  // ステップ 0..N の状態と、確かめた結果。データだけから決める（mount の前にも steps が要る）
  plan(){
    if (this._plan) return this._plan;
    var self = this, d = this.data || {}, bad = [];
    this.directed = !!d.directed;
    var ids = {}, edges = {};
    (d.nodes || []).forEach(function(n){ if (ids[n.id]) bad.push("node id \"" + n.id + "\" is used twice"); ids[n.id] = n; });
    (d.edges || []).forEach(function(e, i){
      if (!ids[e.from] || !ids[e.to]){ bad.push("edges[" + i + "] joins an unknown node (" + (ids[e.from] ? e.to : e.from) + ")"); return; }
      if (e.from === e.to){ bad.push("edges[" + i + "] joins " + e.from + " to itself"); return; }
      edges[self.key(e.from, e.to)] = e;
    });
    var known = function(id, where){ if (ids[id]) return true; bad.push(where + ": unknown node \"" + id + "\""); return false; };
    var check = !(d.total && d.total.check === false);
    var st = {current: null, visited: [], frontier: [], parent: {}, chosen: {}, total: undefined, note: "", take: [], drop: []};
    var states = [st];
    (d.steps || []).forEach(function(s, i){
      var w = "steps[" + i + "]", n = {current: st.current, visited: st.visited, frontier: st.frontier, parent: Object.assign({}, st.parent),
        chosen: Object.assign({}, st.chosen), total: st.total, note: s.note || "", take: [], drop: []};
      if (s.current !== undefined) n.current = s.current === null || known(s.current, w + ".current") ? s.current : null;
      if (s.visited) n.visited = s.visited.filter(function(id){ return known(id, w + ".visited"); });
      if (s.frontier) n.frontier = s.frontier.map(function(f){
        var id = Array.isArray(f) ? f[0] : f;
        if (typeof id !== "string" || !known(id, w + ".frontier")) return null;
        return {id: id, key: Array.isArray(f) && f.length > 1 ? f[1] : undefined};
      }).filter(Boolean);
      if (s.parent) Object.keys(s.parent).forEach(function(c){
        var p = s.parent[c];
        if (!known(c, w + ".parent")) return;
        if (p === null){ delete n.parent[c]; return; }
        if (typeof p === "string" && known(p, w + ".parent." + c)) n.parent[c] = p;
      });
      (s.drop || []).forEach(function(pr){
        var k = self.key(pr[0], pr[1]);
        if (!n.chosen[k]){ bad.push(w + ".drop: " + pr[0] + "–" + pr[1] + " was not chosen"); return; }
        delete n.chosen[k]; n.drop.push(k);
      });
      (s.take || []).forEach(function(pr){
        if (!known(pr[0], w + ".take") || !known(pr[1], w + ".take")) return;
        var k = self.key(pr[0], pr[1]);
        if (!d.complete && !edges[k]){ bad.push(w + ".take: there is no edge " + pr[0] + (self.directed ? "→" : "–") + pr[1]); return; }
        n.chosen[k] = [pr[0], pr[1]]; n.take.push({k: k, a: pr[0], b: pr[1]});
      });
      if (s.total !== undefined){
        n.total = s.total;
        var ks = Object.keys(n.chosen);
        if (check && ks.length && ks.every(function(k){ return edges[k] && typeof edges[k].w === "number"; })){
          var sum = ks.reduce(function(a, k){ return a + edges[k].w; }, 0);
          if (Math.abs(sum - s.total) > 1e-9 * Math.max(1, Math.abs(sum)))
            bad.push(w + ".total is " + s.total + " but the chosen edges' weights sum to " + +sum.toFixed(9) + " (total.check: false if the total is something else)");
        }
      }
      states.push(n); st = n;
    });
    var digits = d.total && d.total.digits !== undefined ? d.total.digits : states.reduce(function(m, s){
      if (typeof s.total !== "number") return m;
      var x = String(s.total).split(".")[1];
      return Math.max(m, x ? Math.min(3, x.length) : 0);
    }, 0);
    return (this._plan = {ids: ids, edges: edges, states: states, bad: bad, digits: digits,
      hasFrontier: states.some(function(s){ return s.frontier.length; }), hasTotal: states.some(function(s){ return typeof s.total === "number"; }),
      hasNote: states.some(function(s){ return s.note; })});
  }
  mount(ctx){
    var P = this.props, D = base, self = this, pl = this.plan(), d = this.data, ja = /^ja\b/i.test(ctx.lang || "ja");
    this.ja = ja;
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    if (!(P.dur >= 0)){ ctx.report("attr", "[network] dur must be ≥ 0 (got " + this.getAttribute("dur") + "); using 0.6"); P.dur = 0.6; }
    if (!(P.size >= 24)){ ctx.report("attr", "[network] size must be ≥ 24 (got " + this.getAttribute("size") + "); using 24"); P.size = 24; }
    pl.bad.forEach(function(m){ ctx.report("data", "[network] " + m); });
    var fs = P.size, tw = function(s){ return D.textWidth(s, fs, {font: self}); };
    // 下の帯：1 段目は候補の並びと合計、2 段目はステップの説明
    var rowH = Math.ceil(fs * 1.75), rows = (pl.hasFrontier || pl.hasTotal ? 1 : 0) + (pl.hasNote ? 1 : 0);
    var band = rows ? rows * rowH + 10 : 0;
    // 頂点の大きさ：字の幅 + 余白。短い名前は円、長い名前は角の丸い箱
    var nh = Math.ceil(fs * 1.75), nodes = d.nodes.map(function(n){
      var lab = n.label !== undefined ? n.label : n.id;
      return {n: n, lab: lab, w: Math.max(nh, Math.ceil(tw(lab)) + 24), h: nh};
    });
    var pad = 8, gx0 = pad, gx1 = W - pad, gy0 = pad, gy1 = H - band - pad;
    var mw = Math.max.apply(null, nodes.map(function(o){ return o.w; })) / 2 + 6, mh = nh / 2 + 6;
    var xs = d.nodes.map(function(n){ return n.x; }), ys = d.nodes.map(function(n){ return n.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var aw = gx1 - gx0 - 2 * mw, ah = gy1 - gy0 - 2 * mh;
    if (aw < nh || ah < nh){
      ctx.report("size", "[network] the element (" + W + "×" + H + " px) is too small for the graph; give it a size, e.g. style=\"height:480px\"");
      aw = Math.max(aw, 1); ah = Math.max(ah, 1);
    }
    var sc = Math.min(x1 > x0 ? aw / (x1 - x0) : Infinity, y1 > y0 ? ah / (y1 - y0) : Infinity);
    if (!isFinite(sc)) sc = 1;
    var ox = gx0 + mw + (aw - (x1 - x0) * sc) / 2, oy = gy0 + mh + (ah - (y1 - y0) * sc) / 2;
    var at = this.at = {};
    nodes.forEach(function(o){ o.x = ox + (o.n.x - x0) * sc; o.y = oy + (o.n.y - y0) * sc; at[o.n.id] = o; });
    // 頂点どうしの重なり
    var gap = 6;
    for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++){
      var a = nodes[i], b = nodes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap){
        var need = Math.max(((a.w + b.w) / 2 + gap) / Math.max(1e-9, Math.abs(a.n.x - b.n.x) || 1e-9), ((a.h + b.h) / 2 + gap) / Math.max(1e-9, Math.abs(a.n.y - b.n.y) || 1e-9));
        ctx.report("layout", "[network] nodes " + a.n.id + " and " + b.n.id + " overlap at this size; move them apart (they need about " + Math.ceil(Math.min(need, 1e6) / sc * 100) + "% of their distance) or make the element larger");
      }
    }
    // 辺の端：頂点の箱（円）の縁で切る
    var edgeEnds = function(A, B, shrinkA, shrinkB){
      var dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      var cut = function(o, ux, uy){
        if (o.w <= o.h + 0.5) return o.h / 2;
        var tx = Math.abs(ux) > 1e-9 ? (o.w / 2) / Math.abs(ux) : Infinity, ty = Math.abs(uy) > 1e-9 ? (o.h / 2) / Math.abs(uy) : Infinity;
        return Math.min(tx, ty);
      };
      var ux = dx / L, uy = dy / L, ca = cut(A, ux, uy) + (shrinkA || 0), cb = cut(B, ux, uy) + (shrinkB || 0);
      return {x1: A.x + ux * ca, y1: A.y + uy * ca, x2: B.x - ux * cb, y2: B.y - uy * cb, ux: ux, uy: uy, L: L};
    };
    this.edgeEnds = edgeEnds;
    var gE = D.el("g", {}, svg), gT = D.el("g", {}, svg), gC = D.el("g", {}, svg), gN = D.el("g", {}, svg), gW = D.el("g", {}, svg), gB = D.el("g", {}, svg);
    var arrow = function(g, e, col, wd){
      var s = 10 + wd, x = e.x2, y = e.y2, px = -e.uy, py = e.ux;
      return D.el("path", {d: "M" + x.toFixed(1) + " " + y.toFixed(1) + "L" + (x - e.ux * s + px * s * 0.5).toFixed(1) + " " + (y - e.uy * s + py * s * 0.5).toFixed(1) +
        "L" + (x - e.ux * s - px * s * 0.5).toFixed(1) + " " + (y - e.uy * s - py * s * 0.5).toFixed(1) + "Z", fill: col}, g);
    };
    // ほかの辺（--line）と重み
    var placed = nodes.map(function(o){ return {x0: o.x - o.w / 2 - 4, x1: o.x + o.w / 2 + 4, y0: o.y - o.h / 2 - 4, y1: o.y + o.h / 2 + 4}; });
    var hit = function(r){ return placed.some(function(q){ return r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1; }); };
    var inside = function(r){ return r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= H - band; };
    var crowded = [];
    this.wlabels = [];
    Object.keys(pl.edges).forEach(function(k){
      var e = pl.edges[k], A = at[e.from], B = at[e.to], g = edgeEnds(A, B, 0, 0);
      D.el("line", {x1: g.x1.toFixed(1), y1: g.y1.toFixed(1), x2: g.x2.toFixed(1), y2: g.y2.toFixed(1), stroke: "var(--line)", "stroke-width": 2.5}, gE);
      if (self.directed) arrow(gE, g, "var(--line)", 2.5);
      if (!P.weights || typeof e.w !== "number") return;
      var s = fmt(e.w, decimals(e.w)), w = tw(s) + 8, h = fs + 6, best = null;
      [0.5, 0.38, 0.62, 0.28, 0.72].some(function(f){
        return [1, -1].some(function(side){
          var off = fs * 0.62 + 4, cx = g.x1 + (g.x2 - g.x1) * f - g.uy * off * side, cy = g.y1 + (g.y2 - g.y1) * f + g.ux * off * side;
          var r = {x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, cx: cx, cy: cy};
          if (!hit(r) && inside(r)){ best = r; return true; }
          return false;
        });
      });
      if (!best){ crowded.push(e.from + "–" + e.to); return; }
      placed.push(best);
      var t = D.el("text", {x: best.cx.toFixed(1), y: (best.cy + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)",
        stroke: "var(--bg)", "stroke-width": 6, "paint-order": "stroke", style: "font-variant-numeric:tabular-nums"}, gW);
      t.textContent = s;
      self.wlabels.push(t);
    });
    if (crowded.length) ctx.report("layout", "[network] no room for the weight of " + crowded.join(", ") + "; move the nodes apart, make the element larger or set weights=\"false\"");
    // 探索の木（parent）と選んだ辺（take）：出てきた組ごとに 1 本ずつ作る
    this.tree = {}; this.chosen = {};
    pl.states.forEach(function(s){
      Object.keys(s.parent).forEach(function(c){
        var p = s.parent[c], k = p + "\u0000" + c;
        if (self.tree[k]) return;
        var g = edgeEnds(at[p], at[c], 0, 2);
        self.tree[k] = {g: g, el: D.el("g", {opacity: 0}, gT)};
        D.el("line", {x1: g.x1.toFixed(1), y1: g.y1.toFixed(1), x2: (g.x2 - g.ux * 8).toFixed(1), y2: (g.y2 - g.uy * 8).toFixed(1), stroke: "var(--term)", "stroke-width": 4.5, "stroke-linecap": "round"}, self.tree[k].el);
        arrow(self.tree[k].el, g, "var(--term)", 4.5);
      });
      Object.keys(s.chosen).forEach(function(k){
        if (self.chosen[k]) return;
        var A = at[s.chosen[k][0]], B = at[s.chosen[k][1]];
        self.chosen[k] = {el: D.el("line", {stroke: "var(--term)", "stroke-width": 8, "stroke-linecap": "round", opacity: 0}, gC), A: A, B: B};
      });
    });
    // 頂点：塗り（訪れた）、点線の輪（候補）、太い輪（今）、名前
    nodes.forEach(function(o){
      var rect = function(grow, attrs){
        var w = o.w + 2 * grow, h = o.h + 2 * grow;
        return D.el("rect", Object.assign({x: (o.x - w / 2).toFixed(1), y: (o.y - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: (h / 2).toFixed(1)}, attrs), gN);
      };
      rect(0, {fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2});
      o.vis = rect(0, {fill: "var(--muted)", opacity: 0});
      o.fr = rect(6, {fill: "none", stroke: "var(--accent2)", "stroke-width": 4, "stroke-dasharray": "8 6", opacity: 0});
      o.cur = rect(4, {fill: "none", stroke: "var(--emph)", "stroke-width": 7, opacity: 0});
      var t = D.el("text", {x: o.x.toFixed(1), y: (o.y + fs * 0.36).toFixed(1), "font-size": fs, "text-anchor": "middle", fill: "var(--fg)"}, gN);
      t.textContent = o.lab;
    });
    this.nodes = nodes;
    // 下の帯
    var by = H - band + 4;
    this.band = {y1: by + rowH / 2 + fs * 0.36, y2: by + rowH * ((pl.hasFrontier || pl.hasTotal) ? 1.5 : 0.5) + fs * 0.36, W: W, g: gB};
    if (pl.hasTotal){
      var tl = d.total && d.total.label !== undefined ? d.total.label : ja ? "合計" : "Total";
      this.totalText = D.el("text", {x: W - 4, y: this.band.y1.toFixed(1), "font-size": fs, "text-anchor": "end", fill: "var(--fg)", style: "font-variant-numeric:tabular-nums", opacity: 0}, gB);
      this.totalLabel = tl;
      var maxs = pl.states.reduce(function(m, s){ return typeof s.total === "number" ? Math.max(m, tw(self.totalString(s.total))) : m; }, 0);
      this.totalW = maxs + 24;
    } else this.totalW = 0;
    if (pl.hasFrontier){
      var kind = KIND[d.frontierKind || "set"];
      this.capText = D.el("text", {x: 4, y: this.band.y1.toFixed(1), "font-size": fs, fill: "var(--fg)"}, gB);
      this.capText.textContent = ja ? kind.ja : kind.en;
      this.capW = tw(this.capText.textContent) + 16;
      if (this.capW + nh + this.totalW > W){ ctx.report("size", "[network] the frontier row has no room (" + W + " px wide)"); }
      var most = Math.max.apply(null, pl.states.map(function(s){ return s.frontier.length; }));
      this.slots = [];
      for (var q = 0; q < most + 1; q++){
        var sg = D.el("g", {opacity: 0}, gB);
        this.slots.push({g: sg, rect: D.el("rect", {x: 0, y: 0, width: 0, height: nh - 8, rx: 6, opacity: 0, fill: "none", stroke: "var(--accent2)", "stroke-width": 3, "stroke-dasharray": "8 6"}, sg),
          text: D.el("text", {x: 0, y: 0, "font-size": fs, "text-anchor": "middle", fill: "var(--fg)"}, sg)});
      }
    }
    if (pl.hasNote){
      this.noteText = D.el("text", {x: 4, y: this.band.y2.toFixed(1), "font-size": fs, fill: "var(--fg)", opacity: 0}, gB);
      var long = [];
      pl.states.forEach(function(s, k){ if (s.note && tw(s.note) > W - 8) long.push(k); });
      if (long.length) ctx.report("layout", "[network] the note of step " + long.join(", ") + " is wider than the element (" + W + " px); shorten it (it is cut with …)");
    }
    this.fit = function(s, room){
      if (tw(s) <= room) return s;
      var a = Array.from(s);
      while (a.length && tw(a.join("") + "…") > room) a.pop();
      return a.join("") + "…";
    };
    this.tw = tw;
    if (this._aria === undefined) this._aria = this.getAttribute("aria-label");
    this.setAttribute("role", "img");
    if (!this._aria) this.setAttribute("aria-label", this.summary(ja));
    this.model = {nodes: nodes.map(function(o){ return [o.n.id, +o.x.toFixed(1), +o.y.toFixed(1)]; }), states: pl.states.length};
    function decimals(v){ var x = String(v).split(".")[1]; return x ? Math.min(3, x.length) : 0; }
  }
  totalString(v){
    var u = this.data.total && this.data.total.unit ? this.data.total.unit : "";
    return this.totalLabel + " " + fmt(v, this.plan().digits) + (u ? " " + u : "");
  }
  // 読み上げ：頂点と辺の数、最後に選んだ辺、合計
  summary(ja){
    var pl = this.plan(), d = this.data, last = pl.states[pl.states.length - 1], self = this;
    var ne = Object.keys(pl.edges).length;
    var s = ja ? "グラフ（頂点 " + d.nodes.length + "、辺 " + ne + "）" : "Graph (" + d.nodes.length + " nodes, " + ne + " edges)";
    var ch = Object.keys(last.chosen).map(function(k){ return last.chosen[k].join(self.directed ? "→" : "–"); });
    if (ch.length) s += ja ? "。選んだ辺：" + ch.join("、") : ". Chosen edges: " + ch.join(", ");
    var tr = Object.keys(last.parent).map(function(c){ return last.parent[c] + "→" + c; });
    if (tr.length) s += ja ? "。探索の木：" + tr.join("、") : ". Search tree: " + tr.join(", ");
    if (typeof last.total === "number"){
      var u = d.total && d.total.unit ? d.total.unit : "", lab = d.total && d.total.label !== undefined ? d.total.label : ja ? "合計" : "Total";
      s += (ja ? "。" : ". ") + lab + " " + fmt(last.total, pl.digits) + (u ? " " + u : "");
    }
    return s;
  }
  // ステップ k の時刻：drop が消える（前半）→ take を 1 本ずつ引く。頂点の色は前半で変わる
  timing(k){
    var s = this.plan().states[k], P = this.props;
    if (!s || k === 0) return {fade: 0, start: 0, end: 0};
    var fade = P.dur * 0.5, start = s.drop.length ? fade : 0;
    return {fade: fade, start: start, end: Math.max(fade, start + s.take.length * P.dur)};
  }
  duration(k){ return this.timing(k).end; }
  render(k, t, ctx){
    if (!this.nodes) return;
    var self = this, pl = this.plan(), D = base, P = this.props;
    k = Math.max(0, Math.min(k, pl.states.length - 1));
    var cur = pl.states[k], prev = pl.states[Math.max(0, k - 1)], tm = this.timing(k);
    var e = k === 0 ? 1 : D.prog(t, 0, tm.fade);
    var mix = function(a, b){ return D.lerp(a ? 1 : 0, b ? 1 : 0, e); };
    var inF = function(s, id){ return s.frontier.some(function(f){ return f.id === id; }); };
    this.nodes.forEach(function(o){
      var id = o.n.id;
      o.vis.setAttribute("opacity", (0.35 * mix(prev.visited.indexOf(id) >= 0, cur.visited.indexOf(id) >= 0)).toFixed(3));
      o.fr.setAttribute("opacity", mix(inF(prev, id), inF(cur, id)).toFixed(3));
      o.cur.setAttribute("opacity", mix(prev.current === id, cur.current === id).toFixed(3));
    });
    Object.keys(this.tree).forEach(function(k2){
      var parts = k2.split("\u0000"), was = prev.parent[parts[1]] === parts[0], is = cur.parent[parts[1]] === parts[0];
      self.tree[k2].el.setAttribute("opacity", (k === 0 ? 0 : mix(was, is)).toFixed(3));
    });
    // 選んだ辺：前のステップから残る辺は引いたまま、drop は前半で消え、take は順に端から端へ
    var takeAt = {};
    cur.take.forEach(function(x, j){ takeAt[x.k] = {j: j, a: x.a, b: x.b}; });
    Object.keys(this.chosen).forEach(function(k2){
      var c = self.chosen[k2], el = c.el, A, B, f = 0, op = 0;
      if (takeAt[k2] && k > 0){
        A = self.at[takeAt[k2].a]; B = self.at[takeAt[k2].b];
        f = D.prog(t, tm.start + takeAt[k2].j * P.dur, P.dur); op = f > 0 ? 1 : 0;
      } else if (cur.chosen[k2]){
        A = c.A; B = c.B; f = 1; op = 1;
      } else if (prev.chosen[k2] && k > 0){
        A = c.A; B = c.B; f = 1; op = 1 - D.prog(t, 0, tm.fade);
      } else { A = c.A; B = c.B; }
      var g = self.edgeEnds(A, B, 0, 0);
      el.setAttribute("x1", g.x1.toFixed(1)); el.setAttribute("y1", g.y1.toFixed(1));
      el.setAttribute("x2", (g.x1 + (g.x2 - g.x1) * f).toFixed(1)); el.setAttribute("y2", (g.y1 + (g.y2 - g.y1) * f).toFixed(1));
      el.setAttribute("opacity", op.toFixed(3));
    });
    // 合計：前の値から今の値へ数え上げる
    if (this.totalText){
      var has = typeof cur.total === "number", from = typeof prev.total === "number" && k > 0 ? prev.total : has ? cur.total : 0;
      var v = has ? D.lerp(from, cur.total, k === 0 ? 1 : D.prog(t, 0, Math.max(tm.end, 0.3))) : 0;
      this.totalText.textContent = has ? this.totalString(+v.toFixed(pl.digits)) : "";
      this.totalText.setAttribute("opacity", has ? 1 : 0);
    }
    // 候補の並び：今のステップの frontier（前半で入れ替わる。どちらか一方だけを見せる）
    if (this.slots){
      var show = k === 0 ? cur : e < 0.5 ? prev : cur, x = this.capW, room = this.band.W - this.totalW - 4, fsz = P.size;
      var items = show.frontier.map(function(f){ return f.key !== undefined ? f.id + " " + fmt(f.key, decimals(f.key)) : (self.at[f.id] ? self.at[f.id].lab : f.id); });
      var empty = !items.length && k > 0;
      if (empty) items = [this.ja ? "（空）" : "(empty)"];
      var nShow = items.length, widths = items.map(function(s){ return Math.max(self.tw(s) + 20, fsz * 1.4); });
      var more = function(n){ return "…+" + n; };
      while (nShow > 0){
        var used = x, j2;
        for (j2 = 0; j2 < nShow; j2++) used += widths[j2] + 8;
        if (nShow < items.length) used += self.tw(more(items.length - nShow)) + 8;
        if (used <= room) break;
        nShow--;
      }
      var op2 = k === 0 ? 1 : Math.abs(e - 0.5) * 2;
      this.slots.forEach(function(sl, j){
        if (j < nShow){
          sl.rect.setAttribute("x", x.toFixed(1)); sl.rect.setAttribute("y", (self.band.y1 - fsz * 0.36 - (self.nodes[0].h - 8) / 2).toFixed(1)); sl.rect.setAttribute("width", widths[j].toFixed(1));
          sl.rect.setAttribute("opacity", empty ? 0 : 1);
          sl.text.setAttribute("x", (x + widths[j] / 2).toFixed(1)); sl.text.setAttribute("y", self.band.y1.toFixed(1)); sl.text.textContent = items[j];
          sl.g.setAttribute("opacity", op2.toFixed(3)); x += widths[j] + 8;
        } else if (j === nShow && nShow < items.length){
          ["x", "y", "width"].forEach(function(a){ sl.rect.setAttribute(a, 0); });
          sl.rect.setAttribute("opacity", 0);
          sl.text.setAttribute("x", (x + self.tw(more(items.length - nShow)) / 2).toFixed(1)); sl.text.setAttribute("y", self.band.y1.toFixed(1)); sl.text.textContent = more(items.length - nShow);
          sl.g.setAttribute("opacity", op2.toFixed(3));
        } else {
          ["x", "y", "width"].forEach(function(a){ sl.rect.setAttribute(a, 0); });
          sl.rect.setAttribute("opacity", 0); sl.text.setAttribute("x", 0); sl.text.setAttribute("y", 0); sl.text.textContent = ""; sl.g.setAttribute("opacity", 0);
        }
      });
    }
    if (this.noteText){
      this.noteText.textContent = cur.note ? this.fit(cur.note, this.band.W - 8) : "";
      this.noteText.setAttribute("opacity", cur.note ? (k === 0 ? 1 : D.prog(t, 0, tm.fade)).toFixed(3) : 0);
    }
    function decimals(v){ var x = String(v).split(".")[1]; return x ? Math.min(3, x.length) : 0; }
  }
};
function fmt(v, dg){
  var s = Math.abs(v).toFixed(dg).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  var neg = v < 0 && +Math.abs(v).toFixed(dg) !== 0;
  return (neg ? "−" : "") + i + (s[1] ? "." + s[1] : "");
}
});

// m-flow：流れ図の箱と矢印を段階ごとに出して、図を組み立てる
// <m-flow style="height:400px"><script type="application/json">
//   {"nodes":[{"id":"a","label":"観測 *w*","x":20,"y":40,"w":200,"h":70,"step":1}, …],
//    "edges":[{"from":"a","to":"b","step":2,"label":"更新"}]}
// （JSON の終わり）</m-flow>
// 座標は要素の箱の px（x, y は箱の左上）。箱は段階 step で現れ、矢印は同じ段階の箱の後に引く
// 2.2.0: with no x, y, w, h on any node, the part lays the boxes out itself (orient: right or down; see autoLayout)
// 箱の字は label（*斜体*、_下付き、^上付き、\n で改行）か tex（KaTeX）。tone は term / emph / muted
// お金・モノの流れ（ビジネスモデルの図）：edge の kind（money / service / data）で色と線種を決め、amount（金額など）を太字で添える。
// 同じ 2 つの箱の行きと帰りは shift（線に垂直にずらす px）で分ける。pulse の辺は、点の列が始点から終点へ流れる
// （pulse: true なら辺の段階に 1 回、[段階, …] ならその段階ごとに 1 回。位置は (k, t) だけで決まり、流れ終わると消える）
// 流れ図の判断：node の shape: "diamond"（箱の x, y, w, h に内接するひし形）。はい／いいえは出ていく辺の label
// 戻る辺：edge の loop（true / "left" / "right" / "top" / "bottom"）。箱の横から出て、間の箱の外側を回って戻り先の箱の横に入る
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・mtext・prog・lerp・previewOpacity を使い、プレイヤーのグローバルは使わない。
// 式（tex）は組み立てのときに KaTeX で描く（spec §6.2）：build.fields の nodes[].tex を作り手が描いて texHtml を足し、
// この部品は markup-reader で決まった要素と属性だけを読んで置く（再生のときに KaTeX は動かない）。描いた結果がなければ tex を字のまま出して知らせる。
// 知らないデータ（loop の値、ない箱を指す辺）は ctx.report で知らせる（1.x の console.warn / console.error の代わり）
egatariParts.define({name: "flow", version: "2.2.0", requires: {base: "1.3.0", "markup-reader": "1.0.3"}, element: "m-flow"}, function(deps){
"use strict";
var base = deps.base, MR = deps["markup-reader"];
// 複数行の名前の行の位置（1 行目からの下がり、px）と、上下に足す余白。base 1.1.0 で mtext の下付き・上付きは 24px 以上になり、
// 行の間 lh（字の 1.25 倍）では上の行の下付きと下の行の上付きが重なる。下付きの字の下端は基線から添字の 0.75 倍まで、上付きの字の
// 上端は添字の 1.4 倍まで（Source Sans 3 で測った値。BIZ UDPGothic ではそれぞれ 0.5 倍と 1.2 倍）。上の行に下付き（_）があれば
// その下端から字の下の余白（字の 0.12 倍）を引いた分、下の行に上付き（^）があればその上端から字の上の高さ（0.88 倍）を引いた分だけ
// 行の間を広げる。top・bottom は 1 行目の上付き・最後の行の下付きの分（添字がなければどれも 0 で、行は lh ずつ）
function subX(s, fs){ var ss = Math.max(24, Math.round(fs * 0.75)); return /_./.test(s) ? Math.max(0, 0.75 * ss - 0.12 * fs) : 0; }
function supX(s, fs){ var ss = Math.max(24, Math.round(fs * 0.75)); return /\^./.test(s) ? Math.max(0, 1.4 * ss - 0.88 * fs) : 0; }
function lineYs(lines, lh, fs){
  var y = [0];
  for (var j = 1; j < lines.length; j++) y.push(y[j - 1] + lh + subX(lines[j - 1], fs) + supX(lines[j], fs));
  y.top = supX(lines[0], fs); y.bottom = subX(lines[lines.length - 1], fs);
  return y;
}
// ---------------------------------------------------------------- automatic layout (2.2.0, handoff #103)
// When no node has any of x, y, w, h, the part places the nodes itself (deterministic, no randomness):
//   1. ranks: longest path from the sources along the edges. Edges with loop, edges from a node to itself and edges that close
//      a cycle (a depth-first search in data order: an edge to a node still on the search path) are left out of the ranking
//   2. order within a rank: data order, then the barycentre (mean position of the connected nodes in the neighbouring rank;
//      without any there, in any earlier or later rank), sweeping forward, backward, forward, backward; ties keep data order
//   3. size: from the estimated text width (base's textWidth) and line count at `size`, PADX and PADY inside; a diamond twice
//      the text's width and height. Boxes of a rank share their width (orient right) or height (orient down)
//   4. position: ranks along orient, boxes across it, the free room shared out evenly (half a share at both ends), at least GAP
//      between boxes, more between ranks whose edges carry text, and room outside for the loops. If it does not fit, the text
//      is not shrunk: the boxes are placed at the least gaps from the start, and layout reports it
// Back edges (closing a cycle, no loop) are drawn as loops on the side where neither end has a box beyond it in its rank
// (bottom, else top, for orient right; right, else left, for orient down); loop: true in such a layout is placed the same way.
// An edge that skips ranks and whose straight line would cross a box runs outside the boxes in the same way (top, else
// bottom; left, else right), with room kept for it; with neither side free it stays straight and layout reports it.
// Loops on one side take lanes, further out for longer rank spans. An edge whose reverse is also an edge (a two-way pair,
// as in a business diagram) stays straight, shifted as in manual layout.
var PADX = 32, PADY = 24, MINW = 120, GAP = 40;
function texGuess(s){ return String(s).replace(/\\(mid|cdot|times|le|ge|ne|to|in|sum|int|pm)\b/g, "+").replace(/\\[A-Za-z]+/g, "x").replace(/[{}\\_^]/g, ""); }
function autoLayout(nodes, edges, W, H, P, down, el){
  var size = P.size, gp = P["label-gap"], n = nodes.length, at = {}, i, j, r;
  nodes.forEach(function(nd, k){ at[nd.id] = k; });
  // forward and back edges, in data order
  var out = nodes.map(function(){ return []; }), state = nodes.map(function(){ return 0; }), back = {}, post = [];
  var valid = edges.map(function(e){ return e && at[e.from] !== undefined && at[e.to] !== undefined && at[e.from] !== at[e.to]; });
  edges.forEach(function(e, ei){ if (valid[ei] && !e.loop) out[at[e.from]].push(ei); });
  function dfs(u){
    state[u] = 1;
    out[u].forEach(function(ei){ var v = at[edges[ei].to]; if (state[v] === 1) back[ei] = true; else if (!state[v]) dfs(v); });
    state[u] = 2; post.push(u);
  }
  for (i = 0; i < n; i++) if (!state[i]) dfs(i);
  var fwd = [];
  edges.forEach(function(e, ei){ if (valid[ei] && !e.loop && !back[ei]) fwd.push([at[e.from], at[e.to], ei]); });
  // 1. ranks: longest path, in topological order (reverse post-order)
  var rank = nodes.map(function(){ return 0; });
  post.slice().reverse().forEach(function(u){ fwd.forEach(function(f){ if (f[0] === u) rank[f[1]] = Math.max(rank[f[1]], rank[u] + 1); }); });
  var R = Math.max.apply(null, rank) + 1, ranks = [];
  for (r = 0; r < R; r++) ranks.push([]);
  for (i = 0; i < n; i++) ranks[rank[i]].push(i);
  // 2. order within a rank: barycentre sweeps
  var pos = [];
  var setPos = function(rk){ rk.forEach(function(u, k){ pos[u] = (k + 0.5) / rk.length; }); };
  ranks.forEach(setPos);
  var sweep = function(r, fromLower){
    var bary = {};
    ranks[r].forEach(function(u){
      var near = [], far = [];
      fwd.forEach(function(f){
        var o = fromLower ? (f[1] === u ? f[0] : -1) : (f[0] === u ? f[1] : -1);
        if (o < 0) return;
        (rank[o] === r + (fromLower ? -1 : 1) ? near : far).push(pos[o]);
      });
      var L = near.length ? near : far;
      bary[u] = L.length ? L.reduce(function(a, b){ return a + b; }, 0) / L.length : pos[u];
    });
    ranks[r].sort(function(a, b){ return bary[a] - bary[b] || a - b; });
    setPos(ranks[r]);
  };
  for (var pass = 0; pass < 4; pass++){
    if (pass % 2 === 0) for (r = 1; r < R; r++) sweep(r, true);
    else for (r = R - 2; r >= 0; r--) sweep(r, false);
  }
  var idx = [];
  ranks.forEach(function(rk){ rk.forEach(function(u, k){ idx[u] = k; }); });
  // 3. sizes
  var tw = function(s, fs){ return base.textWidth(s, fs, {font: el, mark: true}); };
  var box = nodes.map(function(nd){
    var lines = nd.tex !== undefined ? [texGuess(nd.tex)] : String(nd.label || "").split("\n");
    var w = Math.max.apply(null, lines.map(function(s){ return tw(s, size); }));
    var ys = lineYs(lines, size * 1.25, size), h = ys[ys.length - 1] + ys.top + ys.bottom + size * 1.25;
    if (nd.tex !== undefined && /\\(frac|dfrac|sum|int|binom)/.test(nd.tex)) h += size * 0.8;
    var dia = nd.shape === "diamond";
    return {w: Math.max(MINW, Math.ceil(dia ? 2 * (w + PADX) : w + 2 * PADX)), h: Math.ceil(dia ? 2 * (h + PADY) : h + 2 * PADY)};
  });
  // main axis (along orient) and cross axis
  var M = down ? "h" : "w", C = down ? "w" : "h";
  var rs = ranks.map(function(rk){ return Math.max.apply(null, rk.map(function(u){ return box[u][M]; })); });
  ranks.forEach(function(rk, r){ rk.forEach(function(u){ box[u][M] = rs[r]; }); });
  // loops: back edges (and loop: true) on the side where neither end has a box beyond it in its rank (the far side first:
  // bottom for right, right for down). Rank-skipping edges whose straight line would cross a box run outside the boxes the
  // same way (the near side first: top for right, left for down), so that they seldom share a side with the back edges
  var twoWay = function(e){ return edges.some(function(f, fi){ return valid[fi] && !f.loop && f.from === e.to && f.to === e.from; }); };
  var FAR = down ? "right" : "bottom", NEAR = down ? "left" : "top";
  var free = function(u, v, sd){
    var beyond = function(w){ return sd === FAR ? idx[w] < ranks[rank[w]].length - 1 : idx[w] > 0; };
    return !beyond(u) && !beyond(v);
  };
  var side = {}, loops = {};
  edges.forEach(function(e, ei){
    if (!valid[ei] && !(e && e.loop && at[e.from] !== undefined && at[e.from] === at[e.to])) return;
    var sd = e.loop;
    if (!sd && back[ei] && !twoWay(e)) sd = true;
    if (!sd) return;
    if (sd === true){ var u = at[e.from], v = at[e.to]; sd = free(u, v, FAR) || !free(u, v, NEAR) ? FAR : NEAR; loops[ei] = sd; }
    if (/^(left|right|top|bottom)$/.test(sd)) side[ei] = sd;
  });
  // lanes: the loops on one side, shortest rank span first, each outside the ones before it whose spans overlap
  var lanes = {}, room = {}, gmin;
  var place = function(){
    // least gaps between ranks: 40 px, or room for the text of the straight edges whose middle falls in that gap
    gmin = rs.slice(1).map(function(){ return GAP; });
    edges.forEach(function(e, ei){
      if (!valid[ei] || e.loop || back[ei] || side[ei] || !(e.label || (e.amount !== undefined && e.amount !== ""))) return;
      var a = rank[at[e.from]], b = rank[at[e.to]], g = Math.floor((Math.min(a, b) + Math.max(a, b) - 1) / 2);
      if (g < 0 || g >= gmin.length) return;
      var need = down ? Math.ceil(size * 1.1 + 2 * gp + 8)
        : Math.ceil(Math.max(e.label ? tw(e.label, 24) : 0, e.amount !== undefined && e.amount !== "" ? tw(String(e.amount), 26) : 0) + 2 * gp + 16);
      gmin[g] = Math.max(gmin[g], need);
    });
    lanes = {}; room = {left: 0, right: 0, top: 0, bottom: 0};
    var span = function(ei){ var a = rank[at[edges[ei].from]], b = rank[at[edges[ei].to]]; return [Math.min(a, b), Math.max(a, b)]; };
    var done = [];
    Object.keys(side).map(Number).sort(function(a, b){ var p = span(a), q = span(b); return (p[1] - p[0]) - (q[1] - q[0]) || a - b; }).forEach(function(ei){
      var sd = side[ei], s = span(ei), e = edges[ei], hz = sd === "left" || sd === "right";
      var text = e.label ? Math.ceil(hz ? 12 + tw(e.label, 26) : 36) : 0, off = 0;
      done.forEach(function(d){ if (d.sd === sd && d.s[0] <= s[1] && s[0] <= d.s[1]) off = Math.max(off, d.off + d.text + 18); });
      lanes[ei] = off; done.push({sd: sd, s: s, off: off, text: text});
      room[sd] = Math.max(room[sd], 40 + off + text);
    });
    // 4. positions: share the free room evenly (half a share at both ends); without room, the least gaps from the start
    var spread = function(sizes, mins, from, len){
      var need = sizes.reduce(function(a, b){ return a + b; }, 0) + mins.reduce(function(a, b){ return a + b; }, 0);
      var x = len - need, s = x >= 0 ? x / sizes.length : 0, p = from + s / 2, o = [];
      sizes.forEach(function(sz, k){ o.push(p); p += sz + (k < mins.length ? mins[k] + s : 0); });
      return {at: o, need: need, fits: x >= 0};
    };
    var m0 = down ? room.top : room.left, m1 = down ? room.bottom : room.right, c0 = down ? room.left : room.top, c1 = down ? room.right : room.bottom;
    var LM = (down ? H : W) - m0 - m1, LC = (down ? W : H) - c0 - c1;
    var main = spread(rs, gmin, m0, LM), crowd = [];
    var placed = nodes.map(function(nd){ return Object.assign({}, nd); });
    ranks.forEach(function(rk, r){
      var cr = spread(rk.map(function(u){ return box[u][C]; }), rk.slice(1).map(function(){ return GAP; }), c0, LC);
      if (!cr.fits) crowd.push(rk.length);
      rk.forEach(function(u, k){
        var q = placed[u], b = box[u];
        q.w = b.w; q.h = b.h;
        q[down ? "y" : "x"] = +main.at[r].toFixed(2);
        q[down ? "x" : "y"] = +cr.at[k].toFixed(2);
      });
    });
    return {placed: placed, main: main, crowd: crowd, LM: LM, LC: LC};
  };
  // the straight line the part would draw between two laid-out boxes (as in mount: facing sides), and whether it passes
  // within 4 px of another box
  var crosses = function(placed, u, v){
    var A = placed[u], B = placed[v], acx = A.x + A.w / 2, acy = A.y + A.h / 2, bcx = B.x + B.w / 2, bcy = B.y + B.h / 2;
    var gx = Math.max(B.x - A.x - A.w, A.x - B.x - B.w), gy = Math.max(B.y - A.y - A.h, A.y - B.y - B.h), p0 = [acx, acy], p1 = [bcx, bcy];
    if (gx > 0 || gy > 0){
      var hz = gx >= gy, sg = hz ? Math.sign(bcx - acx) : Math.sign(bcy - acy), m = Math.min((hz ? A.h : A.w) / 4, 12);
      p1 = hz ? [bcx - sg * (B.w / 2 + 6), bcy] : [bcx, bcy - sg * (B.h / 2 + 6)];
      if (A.shape !== "diamond") p0 = hz ? [acx + sg * (A.w / 2 + 6), Math.max(A.y + m, Math.min(A.y + A.h - m, p1[1]))]
                                         : [Math.max(A.x + m, Math.min(A.x + A.w - m, p1[0])), acy + sg * (A.h / 2 + 6)];
    }
    return placed.some(function(n, w){ return w !== u && w !== v && segBox([p0, p1], [n.x - 4, n.y - 4, n.x + n.w + 4, n.y + n.h + 4]); });
  };
  // route the rank-skipping edges that cross a box, lay out again with their room, until no new one crosses
  var routed = {}, stuck = {}, lay = place();
  for (var it = 0; it <= edges.length; it++){
    var more = false;
    edges.forEach(function(e, ei){
      if (!valid[ei] || e.loop || back[ei] || side[ei] || stuck[ei] || twoWay(e)) return;
      var u = at[e.from], v = at[e.to];
      if (Math.abs(rank[v] - rank[u]) < 2 || !crosses(lay.placed, u, v)) return;
      var sd = free(u, v, NEAR) ? NEAR : free(u, v, FAR) ? FAR : null;
      if (!sd){ stuck[ei] = true; return; }
      side[ei] = routed[ei] = sd; more = true;
    });
    if (!more) break;
    lay = place();
  }
  var name = function(ei){ return JSON.stringify(edges[ei].from) + " → " + JSON.stringify(edges[ei].to); };
  var reports = [], other = down ? "right" : "down", R2 = Object.keys(routed).map(Number);
  if (!lay.main.fits || lay.crowd.length){
    var what = [];
    if (!lay.main.fits) what.push(R + " ranks need " + Math.ceil(lay.main.need) + " px " + (down ? "down" : "across") + " (" + Math.floor(lay.LM) + " px free)");
    if (lay.crowd.length) what.push(Math.max.apply(null, lay.crowd) + " boxes side by side in one rank need more than the " + Math.floor(lay.LC) + " px " + (down ? "across" : "down")
      + (R2.length ? " left beside the edges run around the boxes (" + R2.map(name).join(", ") + ")" : ""));
    reports.push("[flow] the laid-out boxes do not fit (text is not shrunk): " + what.join("; ") + "; use orient=\"" + other + "\", fewer boxes or shorter labels, or a larger element");
  }
  Object.keys(stuck).forEach(function(ei){
    reports.push("[flow] the edge " + name(+ei) + " skips ranks and its straight line crosses a box, but both sides are taken by boxes of its end's ranks (no room to run around them); reorder the nodes or give it fewer ranks to skip");
  });
  var edges2 = edges.map(function(e, ei){ var sd = loops[ei] || routed[ei]; return sd ? Object.assign({}, e, {loop: sd}) : e; });
  return {nodes: lay.placed, edges: edges2, lanes: lanes, reports: reports};
}
// whether the segment s = [[x, y], [x, y]] meets the box r = [x0, y0, x1, y1] (Liang–Barsky, as segHitsBox in mount)
function segBox(s, r){
  var x = s[0][0], y = s[0][1], dx = s[1][0] - x, dy = s[1][1] - y, t0 = 0, t1 = 1, p = [-dx, dx, -dy, dy], q = [x - r[0], r[2] - x, y - r[1], r[3] - y];
  for (var i = 0; i < 4; i++){
    if (p[i] === 0){ if (q[i] < 0) return false; continue; }
    var u = q[i] / p[i];
    if (p[i] < 0){ if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; }
  }
  return true;
}
return class extends base.MotionElement {
  static partName = "flow";   // the registry name (define meta name), for report prefixes
  // 組み立てのときに描く欄（spec §6.2）。式の意味は字（tex）でも持つので、KaTeX の出力は HTML だけ
  static build = {fields: {"nodes[].tex": "katex"}, options: {katex: {output: "html"}}};
  // データの形（kit/shape.js）。座標は要素の箱の px（x, y は箱の左上）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, texHtml: {type: "string"}, x: {type: "number"}, y: {type: "number"}, w: {type: "number"}, h: {type: "number"},
        step: {type: "integer"}, tone: {type: "string"}, at: {type: "number"}, shape: {type: "string"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, step: {type: "integer"}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        kind: {enum: ["money", "service", "data"]}, amount: {type: ["string", "number"]}, shift: {type: "number"}, pulse: {type: ["boolean", "array"]}, pulseAt: {type: "number"}, offset: {type: "number"}, at: {type: "number"},
        loop: {type: ["boolean", "string"]}}}},
      renderers: {type: "object"}}},
    example: {nodes: [{id: "a", label: "観測", step: 1}, {id: "b", label: "更新", step: 2}], edges: [{from: "a", to: "b", step: 2}]},
  };
  static props = {
    fade: {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw: {type: "number", default: 0.6, doc: "矢印を引く秒数"},
    size: {type: "number", default: 26, doc: "箱の字の大きさ（px）"},
    "pulse-dur": {type: "number", default: 1.2, doc: "pulse の点が始点から終点まで流れる秒数"},
    "pulse-n":   {type: "number", default: 3, doc: "pulse で流れる点の数"},
    "label-gap": {type: "number", default: 12, doc: "辺の名前・金額と箱との最小の間（px）。近ければ線から離す"},
    orient: {type: "string", default: "right", doc: "座標がないときの向き：right か down"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var d = this.data || {}, m = 0;
    (d.nodes || []).concat(d.edges || []).forEach(function(x){ m = Math.max(m, x.step || 1); });
    // pulse の段階（[段階, …]）も数える
    (d.edges || []).forEach(function(x){ if (Array.isArray(x.pulse)) x.pulse.forEach(function(k){ m = Math.max(m, k); }); });
    return m;
  }
  mount(ctx){
    var P = this.props, D = base, self = this, data = this.data || {nodes: [], edges: []}, sk = MR.sink(this, ctx);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    // 2.2.0: when no node has any of x, y, w, h, the part lays the nodes out (autoLayout). Nodes that all have the four draw as
    // in 2.1.2. Anything in between is reported (data), naming the nodes without all four, and nothing is drawn
    var lanes = {}, nds = data.nodes || [], nco = function(n){ return ["x", "y", "w", "h"].filter(function(k){ return n && n[k] !== undefined; }).length; };
    if (nds.length && nds.every(function(n){ return !nco(n); })){
      if (P.orient !== "right" && P.orient !== "down") ctx.report("data", "[flow] orient=" + JSON.stringify(P.orient) + " is not right or down (right is used)");
      var lay = autoLayout(nds, data.edges || [], W, H, P, P.orient === "down", this);
      lay.reports.forEach(function(m){ ctx.report("layout", m); });
      data = {nodes: lay.nodes, edges: lay.edges}; lanes = lay.lanes;
    } else if (nds.some(function(n){ return nco(n) < 4; })){
      ctx.report("data", "[flow] some nodes have x, y, w, h and some do not (nothing is drawn); without all four: " + nds.filter(function(n){ return nco(n) < 4; }).map(function(n){ return JSON.stringify(n && n.id); }).join(", ")
        + ". Leave x, y, w, h out of every node to let the part place them, or give all four to every node");
      data = {nodes: [], edges: []};
    }
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var gE = D.el("g", {}, svg), gN = D.el("g", {}, svg);
    var tone = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"],
                muted: ["var(--muted)", "var(--bg)", "var(--fg)"]};   // muted：枠は --muted、字は --fg（字は情報。薄い字は投影で読めない）
    var byId = {}, dup = [];
    // 箱。段階の中の開始時刻 at（既定 0）
    this.nodes = (data.nodes || []).map(function(n){
      var c = tone[n.tone || "term"] || tone.term, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      var g = D.el("g", {opacity: 0}, gN);
      // data-part：Studio の形の検査（geometry check）が測る印。形の要素に box、字に label（data-part-of で持ち主が箱か辺か）
      var nid = String(n.id), pb = {"data-part": "box", "data-part-id": nid}, pl = {"data-part": "label", "data-part-id": nid, "data-part-of": "box"};
      if (n.shape === "diamond") D.el("polygon", Object.assign({class: "box", points: [cx, n.y, n.x + n.w, cy, cx, n.y + n.h, n.x, cy].join(" "), "stroke-linejoin": "round", fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, pb), g);
      else D.el("rect", Object.assign({class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, pb), g);
      // 式の div は行の中の inline-block なので、上端にそろえないと親の行の高さの分だけ下へずれる
      if (n.tex){ var tf = MR.texFrame(g, cx, cy + P.size * 0.36, n, "tex", {size: P.size, anchor: "middle", color: c[2], w: n.w, h: n.h}, sk);
        tf.firstChild.style.verticalAlign = "top"; for (var k in pl) tf.setAttribute(k, pl[k]); }
      else {
        var lines = String(n.label || "").split("\n"), ys = lineYs(lines, P.size * 1.25, P.size), y0 = cy - ys[ys.length - 1] / 2 + P.size * 0.36;
        lines.forEach(function(s, j){ D.mtext(g, cx, y0 + ys[j], s, Object.assign({"text-anchor": "middle", "font-size": P.size, fill: c[2]}, pl)); });
      }
      var o = {g: g, cx: cx, cy: cy, n: n, step: n.step || 1, at: n.at || 0};
      if (byId[n.id]) dup.push(JSON.stringify(n.id));
      byId[n.id] = o;
      return o;
    });
    // 同じ id の箱が 2 つ以上あれば、辺は後に書いた箱を指す（知らせる）
    if (dup.length) ctx.report("data", "[flow] node ids are not unique: " + dup.join(", ") + " (edges use the last node with that id)");
    // 箱どうしが重なれば知らせる（2.1.2）：座標を手で決めると、字の長い箱が隣の箱にかかる。描き方は変えない
    var nb = (data.nodes || []).filter(function(n){ return n && isFinite(n.x) && isFinite(n.y) && n.w > 0 && n.h > 0; }), ov = [];
    for (var i = 0; i < nb.length; i++) for (var j = i + 1; j < nb.length; j++){
      var a = nb[i], b = nb[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) ov.push(JSON.stringify(a.id) + " and " + JSON.stringify(b.id));
    }
    if (ov.length) ctx.report("layout", "[flow] boxes overlap: " + ov.join(", ") + "; move them apart (leave about 40 px between boxes) or make them smaller");
    // 矢印：箱の中心どうしを結ぶ線を、箱の縁で切る
    function edgePt(n, dx, dy, gap){
      var hw = n.w / 2 + gap, hh = n.h / 2 + gap;
      // ひし形は |dx| / hw + |dy| / hh = 1 の上で切る
      var s = n.shape === "diamond" ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh) : Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return [n.x + n.w / 2 + dx * s, n.y + n.h / 2 + dy * s];
    }
    // 戻る辺の道：箱の side の側の辺の中点から出て、両端の間にある箱（と両端）の外側 28 px を回り、戻り先の同じ側に入る
    // lane (automatic layout only, 2.2.0): px further out, so that loops on one side do not share a line
    function loopRoute(lp, A, B, lane){
      var sd = lp === true ? (Math.abs(B.y + B.h / 2 - A.y - A.h / 2) >= Math.abs(B.x + B.w / 2 - A.x - A.w / 2) ? "right" : "bottom") : lp;
      if (!/^(left|right|top|bottom)$/.test(sd)){ ctx.report("data", "[flow] loop=" + JSON.stringify(lp) + " is not true, left, right, top or bottom (right is used)"); sd = "right"; }
      var hz = sd === "left" || sd === "right", sg = sd === "right" || sd === "bottom" ? 1 : -1;
      var out = function(n){ return hz ? [sg > 0 ? n.x + n.w + 6 : n.x - 6, n.y + n.h / 2] : [n.x + n.w / 2, sg > 0 ? n.y + n.h + 6 : n.y - 6]; };
      var q0 = out(A), q1 = out(B), j = hz ? 1 : 0;
      // 箱から同じ箱へ戻る辺：その側の辺の 1/4 と 3/4 の所から出入りする（小さな輪）
      if (A === B){ var u = (hz ? A.h : A.w) / 4; q0[j] -= u; q1[j] += u; }
      var lo = Math.min(q0[j], q1[j]), hi = Math.max(q0[j], q1[j]);
      var ch = sg > 0 ? Math.max(q0[1 - j], q1[1 - j]) : Math.min(q0[1 - j], q1[1 - j]);
      self.nodes.forEach(function(o){
        var n = o.n, a0 = hz ? n.y : n.x, a1 = hz ? n.y + n.h : n.x + n.w;
        if (a1 < lo - 12 || a0 > hi + 12) return;
        var f = hz ? (sg > 0 ? n.x + n.w : n.x) : (sg > 0 ? n.y + n.h : n.y);
        ch = sg > 0 ? Math.max(ch, f + 6) : Math.min(ch, f - 6);
      });
      ch += sg * (28 + (lane || 0));
      var pts = hz ? [q0, [ch, q0[1]], [ch, q1[1]], q1] : [q0, [q0[0], ch], [q1[0], ch], q1];
      return {pts: pts, poly: self.poly(pts), hz: hz, sg: sg, ch: ch};
    }
    // 線の形を先に全部決める（辺の字は、ほかの辺の線と先に置いた字を避けて置くので）
    var es = data.edges || [];
    // 同じ 2 つの箱の行きと帰りで、どちらも shift も loop も書いていなければ、それぞれ 10 px ずらす（2 本の間は 20 px）
    var autoShift = function(e){
      return !e.shift && !e.loop && es.some(function(f){ return f !== e && f.from === e.to && f.to === e.from && !f.shift && !f.loop; });
    };
    var geo = es.map(function(e, ei){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return null;
      var dx = b.cx - a.cx, dy = b.cy - a.cy, L = Math.hypot(dx, dy) || 1;
      // 同じ箱へ戻る辺（loop なし）は、右に回る輪にする。中心の重なる 2 つの箱の辺は引けない
      var lp = e.loop;
      if (!lp && a === b){ ctx.report("data", "[flow] the edge " + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + " goes from a node to itself; it is drawn as a loop on the right (set loop to choose the side)"); lp = "right"; }
      if (!lp && !dx && !dy){ ctx.report("data", "[flow] the edge " + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + " joins two nodes with the same centre (not drawn)"); return false; }
      var p0 = lp ? null : edgePt(a.n, dx / L, dy / L, 6), p1 = lp ? null : edgePt(b.n, -dx / L, -dy / L, 6), route = null;
      // Boxes apart along one axis: the edge ends at the middle of the target's facing side and starts on the source's facing
      // side, as near the target's centre line as that side allows (a centre-to-centre line would enter a wide, flat target
      // through its top or bottom, between stacked boxes)
      var face = 0, sh = e.shift || (autoShift(e) ? 10 : 0);   // face 1: left/right sides face each other, 2: top/bottom
      if (!lp){
        var A = a.n, B = b.n, gx = Math.max(B.x - A.x - A.w, A.x - B.x - B.w), gy = Math.max(B.y - A.y - A.h, A.y - B.y - B.h);
        if (gx > 0 || gy > 0){
          // shift runs along the facing sides (to the right of travel); the start follows the shifted end's line
          var hz = gx >= gy, sg = hz ? Math.sign(dx) : Math.sign(dy), m = function(n){ return Math.min((hz ? n.h : n.w) / 4, 12); };
          p1 = hz ? [b.cx - sg * (B.w / 2 + 6), b.cy + sg * sh] : [b.cx - sg * sh, b.cy - sg * (B.h / 2 + 6)];
          if (A.shape === "diamond"){ var ux = p1[0] - a.cx, uy = p1[1] - a.cy, ul = Math.hypot(ux, uy) || 1; p0 = edgePt(A, ux / ul, uy / ul, 6); }
          else p0 = hz ? [a.cx + sg * (A.w / 2 + 6), Math.max(A.y + m(A), Math.min(A.y + A.h - m(A), p1[1]))]
                       : [Math.max(A.x + m(A), Math.min(A.x + A.w - m(A), p1[0])), a.cy + sg * (A.h / 2 + 6)];
          dx = p1[0] - p0[0]; dy = p1[1] - p0[1]; L = Math.hypot(dx, dy) || 1; face = hz ? 1 : 2;
        }
      }
      if (lp) route = loopRoute(lp, a.n, b.n, lanes[ei]);
      if (route){ p0 = route.pts[0]; p1 = route.pts[3]; }
      // shift：線に垂直に（進む向きの右へ）ずらす。行きと帰りの 2 本を並べるときに使う（向かい合う辺の間はもうずらしてある）
      if (sh && !face){ var sx = -dy / L * sh, sy = dx / L * sh; p0 = [p0[0] + sx, p0[1] + sy]; p1 = [p1[0] + sx, p1[1] + sy]; }
      // self-check: an end that leaves its box's side (a shift larger than the side) is reported, not silently drawn
      var off = function(p, n){ return face === 1 ? p[1] < n.y || p[1] > n.y + n.h : face === 2 ? p[0] < n.x || p[0] > n.x + n.w : false; };
      if (off(p1, b.n)) ctx.report("layout", "[flow] the edge " + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + " leaves the side of its box (shift " + sh + " is larger than the side allows); use a smaller shift or a taller box");
      return {a: a, b: b, dx: dx, dy: dy, L: L, p0: p0, p1: p1, route: route, shift: sh};
    });
    // 線分（戻る辺は折れ線の 3 本）と、置いた字の箱 [x0, y0, x1, y1]
    var segs = geo.map(function(q){ return !q ? [] : q.route ? [0, 1, 2].map(function(i){ return [q.route.pts[i], q.route.pts[i + 1]]; }) : [[q.p0, q.p1]]; });
    var boxes = [], eids = {};
    this.edges = es.map(function(e, ei){
      var q = geo[ei];
      if (q === false) return null;   // 知らせてある
      if (!q){ ctx.report("data", "[flow] an edge refers to an unknown node: " + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + " (not drawn)"); return null; }
      var a = q.a, b = q.b, dx = q.dx, dy = q.dy, L = q.L, p0 = q.p0, p1 = q.p1, route = q.route;
      var others = [].concat.apply([], segs.filter(function(_, j){ return j !== ei; }));
      // kind：money（--emph の太線）、service（--term）、data（--muted の破線）。tone と dash を書けばそちらが勝つ
      var kind = {money: ["emph", false, 3.5], service: ["term", false, 2.5], data: ["muted", true, 2.5]}[e.kind] || [null, false, 2.5];
      var tn = e.tone || kind[0], dash = e.dash !== undefined ? e.dash : kind[1];
      var col = tn ? (tone[tn] || tone.term)[0] : "var(--fg)";
      // 辺の id は "from→to"。同じ from→to の 2 本目からは "#2"、"#3" …を付ける
      var eid = String(e.from) + "\u2192" + String(e.to);
      eids[eid] = (eids[eid] || 0) + 1; if (eids[eid] > 1) eid += "#" + eids[eid];
      var pe = {"data-part": "edge", "data-part-id": eid, "data-part-from": String(e.from), "data-part-to": String(e.to)};
      var g = D.el("g", Object.assign({opacity: 0}, pe), gE);
      var line = route ? D.el("path", {d: "", fill: "none", "stroke-linejoin": "round", stroke: col, "stroke-width": kind[2], "stroke-dasharray": dash ? "8 6" : "none", "data-part-line": ""}, g)
        : D.el("line", {x1: p0[0], y1: p0[1], x2: p0[0], y2: p0[1], stroke: col, "stroke-width": kind[2], "stroke-dasharray": dash ? "8 6" : "none", "data-part-line": ""}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = null, amt = null;
      // 線の中点から、線に垂直な向き（上か右）へずらして置く。amount は反対の側（label がなければ同じ側）に太字で
      var nx = -dy / L, ny = dx / L;
      if (ny > 0 || (ny === 0 && nx < 0)){ nx = -nx; ny = -ny; }
      // 字の箱が箱（node）に label-gap px より近いか、図の外に出るか、ほかの辺の線（4 px の間をとる）か先に置いた字に
      // かかるか、自分の線とのあいだにほかの辺の線が入るなら、線から離していく（6 px ずつ、60 px まで）。
      // それでも置けなければ線の反対の側で同じように試す（label は amount があるときは自分の側だけ。amount は両側）。
      // どこにも置けなければ最初の位置に置いて知らせる（layout）。
      // 幅は字から見積もる（base の textWidth：テーマの字で測った幅）ので、字の読み込みによらず同じ位置になる
      var mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      var side = function(sg, text, attrs, both){
        var fs = attrs["font-size"] || 24, base = e.offset !== undefined ? e.offset : 18, pos = null, anc0 = null, box0 = null, free = false;
        var w = D.textWidth(text, fs, {font: self, mark: true});
        var sides = both ? [sg, -sg] : [sg];
        search: for (var si = 0; si < sides.length; si++){
          var sgn = sides[si], anc = Math.abs(nx) < 0.3 ? "middle" : nx * sgn > 0 ? "start" : "end";
          for (var extra = 0; extra <= 60; extra += 6){
            var off = (base + extra) * sgn, mx = (p0[0] + p1[0]) / 2 + nx * off, my = (p0[1] + p1[1]) / 2 + ny * off;
            var y = my + (ny * sgn < -0.3 ? 0 : ny * sgn > 0.3 ? 20 : 8);
            var x0 = anc === "start" ? mx : anc === "end" ? mx - w : mx - w / 2, gp = P["label-gap"];
            var bx = [x0, y - fs * 0.88, x0 + w, y + fs * 0.22], c = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
            var hit = x0 < 0 || x0 + w > W || y - fs * 0.88 < 0 || y + fs * 0.22 > H || self.nodes.some(function(o){ var n = o.n;
              return x0 < n.x + n.w + gp && x0 + w > n.x - gp && y - fs * 0.88 < n.y + n.h + gp && y + fs * 0.22 > n.y - gp; }) ||
              boxes.some(function(r){ return bx[0] < r[2] + 4 && bx[2] > r[0] - 4 && bx[1] < r[3] + 4 && bx[3] > r[1] - 4; }) ||
              others.some(function(sgm){ return segHitsBox(sgm, [bx[0] - 4, bx[1] - 4, bx[2] + 4, bx[3] + 4]) || segsCross(sgm, [mid, c]); });
            if (!pos){ pos = [mx, y]; anc0 = anc; box0 = bx; }
            if (!hit){ pos = [mx, y]; anc0 = anc; box0 = bx; free = true; break search; }
          }
        }
        if (!free) ctx.report("layout", "[flow] no free place for the edge text " + JSON.stringify(text) + " (" + JSON.stringify(e.from) + " → " + JSON.stringify(e.to) + "): it touches a box, a line or another text; move the boxes apart or set offset");
        boxes.push(box0);
        return D.mtext(g, pos[0], pos[1], text, Object.assign({"text-anchor": anc0, "font-size": 24, opacity: 0}, attrs, {"data-part": "label", "data-part-id": eid, "data-part-of": "edge"}));
      };
      // shift でずらした辺は、ずらした側に書く（行きと帰りの字が同じ側に重ならない）
      var sg = q.shift && (-dy * nx + dx * ny) * q.shift < 0 ? -1 : 1;
      var hasAmt = e.amount !== undefined && e.amount !== "";
      // 戻る辺の名前は回り道の長い線の外側に、金額は内側に。外側が図の外に出るなら名前も内側に
      var rside = function(out, text, attrs){
        var r = route, m = r.hz ? (r.pts[1][1] + r.pts[2][1]) / 2 : (r.pts[1][0] + r.pts[2][0]) / 2, o2 = out ? r.sg : -r.sg;
        var tw = D.textWidth(text, 26, {font: self, mark: true});
        if (out && (r.hz ? (o2 > 0 ? r.ch + 10 + tw > W : r.ch - 10 - tw < 0) : (o2 > 0 ? r.ch + 30 > H : r.ch - 34 < 0))) o2 = -o2;
        var at2 = r.hz ? {x: r.ch + o2 * 10, y: m + 8, a: o2 > 0 ? "start" : "end"} : {x: m, y: r.ch + (o2 > 0 ? 30 : -10), a: "middle"};
        var bx0 = at2.a === "start" ? at2.x : at2.a === "end" ? at2.x - tw : at2.x - tw / 2;
        boxes.push([bx0, at2.y - 26 * 0.88, bx0 + tw, at2.y + 26 * 0.22]);
        return D.mtext(g, +at2.x.toFixed(2), +at2.y.toFixed(2), text, Object.assign({"text-anchor": at2.a, "font-size": 24, opacity: 0}, attrs, {"data-part": "label", "data-part-id": eid, "data-part-of": "edge"}));
      };
      if (route){
        if (e.label) lab = rside(true, e.label, {fill: tn ? col : "var(--fg)"});
        if (hasAmt) amt = rside(!e.label, String(e.amount), {fill: col, "font-weight": 700, "font-size": 26});
      } else {
      if (e.label) lab = side(sg, e.label, {fill: tn ? col : "var(--fg)"}, !hasAmt);
      if (hasAmt) amt = side(e.label ? -sg : sg, String(e.amount), {fill: col, "font-weight": 700, "font-size": 26}, true);
      }
      var step = e.step || Math.max(a.step, b.step);
      // 同じ段階で出る箱があれば、その箱が出てから引く
      var after = Math.max(a.step === step ? a.at + P.fade * 0.6 : 0, b.step === step ? b.at + P.fade * 0.6 : 0);
      var at = e.at !== undefined ? e.at : after;
      // pulse の段階と開始時刻：辺の段階なら引き終わってから、ほかの段階なら pulseAt（既定 0.2 秒）から
      var pk = e.pulse === true ? [step] : Array.isArray(e.pulse) ? e.pulse : [];
      var pulses = pk.map(function(k){ return {k: k, at: e.pulseAt !== undefined ? e.pulseAt : k === step ? +(at + P.draw).toFixed(3) : 0.2}; });
      var dots = pulses.length ? Array.from({length: Math.max(1, P["pulse-n"])}, function(){ return D.el("circle", {r: kind[2] + 3.5, fill: col, stroke: "var(--bg)", "stroke-width": 2, opacity: 0}, gE); }) : [];
      var o = {g: g, line: line, head: head, lab: lab, amt: amt, p0: p0, p1: p1, ang: Math.atan2(dy, dx) * 180 / Math.PI, step: step, at: at, pulses: pulses, dots: dots};
      if (route) o.poly = route.poly;
      return o;
    }).filter(Boolean);
    sk.flush();   // what the formulas have to report, once per kind (spec §6.2)
    // 線分 s = [[x, y], [x, y]] が箱 r = [x0, y0, x1, y1] にかかるか（Liang–Barsky）
    function segHitsBox(sg, r){
      var x = sg[0][0], y = sg[0][1], ddx = sg[1][0] - x, ddy = sg[1][1] - y, t0 = 0, t1 = 1;
      var pp = [-ddx, ddx, -ddy, ddy], qq = [x - r[0], r[2] - x, y - r[1], r[3] - y];
      for (var i = 0; i < 4; i++){
        if (pp[i] === 0){ if (qq[i] < 0) return false; continue; }
        var u = qq[i] / pp[i];
        if (pp[i] < 0){ if (u > t1) return false; if (u > t0) t0 = u; }
        else { if (u < t0) return false; if (u < t1) t1 = u; }
      }
      return true;
    }
    // 2 つの線分が交わるか（端を除く）
    function segsCross(s1, s2){
      var o = function(a, b, c){ return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
      var d1 = o(s2[0], s2[1], s1[0]), d2 = o(s2[0], s2[1], s1[1]), d3 = o(s1[0], s1[1], s2[0]), d4 = o(s1[0], s1[1], s2[1]);
      return d1 * d2 < 0 && d3 * d4 < 0;
    }
  }
  // 折れ線：点と累積の長さ（戻る辺）
  poly(pts){
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts: pts, L: L, len: L[L.length - 1] || 1};
  }
  // 折れ線の始めから長さ len の点と向き（度）。d：そこまでの線
  polyAt(pl, len){
    var pts = pl.pts, want = Math.max(0, Math.min(pl.len, len)), i = 1, d = "M" + pts[0][0].toFixed(2) + "," + pts[0][1].toFixed(2);
    while (i < pts.length - 1 && pl.L[i] < want){ d += "L" + pts[i][0].toFixed(2) + "," + pts[i][1].toFixed(2); i++; }
    var u = (want - pl.L[i - 1]) / ((pl.L[i] - pl.L[i - 1]) || 1), x = base.lerp(pts[i - 1][0], pts[i][0], u), y = base.lerp(pts[i - 1][1], pts[i][1], u);
    return {x: x, y: y, ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI, d: d + "L" + x.toFixed(2) + "," + y.toFixed(2)};
  }
  // pulse の点の列が流れ終わるまでの長さ（点の間は 0.22 秒）
  pulseLen(){ return this.props["pulse-dur"] + 0.22 * (Math.max(1, this.props["pulse-n"]) - 1); }
  duration(k){
    var P = this.props, d = 0, pl = this.pulseLen();
    this.nodes.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + P.fade); });
    this.edges.forEach(function(o){
      if (o.step === k) d = Math.max(d, o.at + P.draw + (o.lab || o.amt ? 0.3 : 0));
      o.pulses.forEach(function(q){ if (q.k === k) d = Math.max(d, q.at + pl); });
    });
    return d;
  }
  // pulse の開始時刻を口述原稿の {cue} に合わせられる（pulse のない図はこれまでどおり null）
  cues(k){
    var c = [];
    this.edges.forEach(function(o){ o.pulses.forEach(function(q){ if (q.k === k && q.at > 0 && c.indexOf(q.at) < 0) c.push(q.at); }); });
    return c.length ? c.sort(function(a, b){ return a - b; }) : null;
  }
  render(k, t, ctx){
    var P = this.props, D = base, self = this, preview = !!ctx.preview, PV = 0;
    // 先を薄く見せる表示：後の段階の箱と矢印（名前・金額も）を、最後の形のままテーマの --preview-opacity（なければ 0.45）で描く。
    // pulse の点は今の段階のものだけ
    if (preview) PV = base.previewOpacity(this);
    var ahead = function(step){ return preview && step > k; };
    var pr = function(step, at, dur){ return step < k || ahead(step) ? 1 : step > k ? 0 : D.prog(t, at, dur); };
    this.nodes.forEach(function(o){
      var e = pr(o.step, o.at, P.fade), s = D.lerp(0.92, 1, e);
      o.g.setAttribute("opacity", ahead(o.step) ? PV.toFixed(3) : e.toFixed(3));
      o.g.setAttribute("transform", "translate(" + o.cx + " " + o.cy + ") scale(" + s.toFixed(4) + ") translate(" + (-o.cx) + " " + (-o.cy) + ")");
    });
    this.edges.forEach(function(o){
      var e = pr(o.step, o.at, P.draw);
      if (o.poly){
        // 戻る辺：折れ線を始めから引き、矢じりは先端について動く（線は矢じりの根元まで）
        var want = e * o.poly.len, tip = self.polyAt(o.poly, want), hs2 = Math.min(1, want / 20);
        o.line.setAttribute("d", want > 0 ? self.polyAt(o.poly, want - Math.min(14, want)).d : "");
        o.head.setAttribute("transform", "translate(" + tip.x.toFixed(2) + " " + tip.y.toFixed(2) + ") rotate(" + tip.ang.toFixed(2) + ") scale(" + hs2.toFixed(4) + ")");
      } else {
      var tx = D.lerp(o.p0[0], o.p1[0], e), ty = D.lerp(o.p0[1], o.p1[1], e);
      var L = Math.hypot(o.p1[0] - o.p0[0], o.p1[1] - o.p0[1]) || 1, back = Math.min(14, e * L);
      // 線は矢じりの根元まで。矢じりは線の先端について動く
      o.line.setAttribute("x2", (tx - (o.p1[0] - o.p0[0]) / L * back).toFixed(2));
      o.line.setAttribute("y2", (ty - (o.p1[1] - o.p0[1]) / L * back).toFixed(2));
      // 矢じりは線が 20px 伸びるまでに大きくなる（始めに箱からはみ出さない）
      var hs = Math.min(1, e * L / 20);
      o.head.setAttribute("transform", "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ") rotate(" + o.ang.toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      }
      o.g.setAttribute("opacity", ahead(o.step) ? PV : e > 0 ? 1 : 0);
      var lo = pr(o.step, o.at + P.draw * 0.8, 0.3).toFixed(3);
      if (o.lab) o.lab.setAttribute("opacity", lo);
      if (o.amt) o.amt.setAttribute("opacity", lo);
      // pulse：今の段階に pulse があれば、点の列を (t - 開始) から置く。流れ終わった点と t = Infinity では出さない
      var q = null;
      o.pulses.forEach(function(x){ if (x.k === k) q = x; });
      o.dots.forEach(function(dot, j){
        var u = q && t !== Infinity ? (t - q.at - 0.22 * j) / P["pulse-dur"] : -1;
        if (u <= 0 || u >= 1 || e < 1){ dot.setAttribute("opacity", 0); return; }
        var w = D.prog(u, 0, 1);
        if (o.poly){ var pp = self.polyAt(o.poly, w * o.poly.len); dot.setAttribute("cx", pp.x.toFixed(2)); dot.setAttribute("cy", pp.y.toFixed(2)); }
        else { dot.setAttribute("cx", D.lerp(o.p0[0], o.p1[0], w).toFixed(2)); dot.setAttribute("cy", D.lerp(o.p0[1], o.p1[1], w).toFixed(2)); }
        dot.setAttribute("opacity", Math.min(1, u * 8, (1 - u) * 8).toFixed(3));
      });
    });
  }
};
});

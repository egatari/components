// m-tree：階層・分類の木（組織図、生物の分類など）を、上の段から順に組み立てる
// <m-tree style="height:480px"><script type="application/json">
//   {"nodes": [{"id": "co", "label": "本社"}, {"id": "a", "label": "営業部", "parent": "co"}, …],
//    "edges": [{"from": "a", "to": "b", "label": "連携"}]}
// （JSON の終わり）</m-tree>
// 座標は書かない（docs/conventions.md §2）。parent のない節がちょうど 1 つ（根）。子は配列の順に並べる
// 配置：親を子の並びの中央に置き、隣り合う部分木は段ごとの輪郭（左右の端）がぶつからないところまで寄せる（Reingold–Tilford の考え方）
// orient：down（既定、上から下）か right（左から右）。link：elbow（既定、かぎ形）か straight（まっすぐ）
// 段階：by="level"（既定、根、それから深さごとに 1 段）か by="node"（深さ優先の順に 1 つずつ）。節の step が勝つ
// edges：親子のほかのつながり（破線、矢印つき）。段階は両端の遅いほう
// 字の大きさは要素の大きさから決め（27 px から）、入らなければ 24 px まで縮める。それでも入らなければ全体を縮めて console.warn
// 見せ方（docs/conventions.md §2.5）：fade（箱が現れてから線を引く、既定）・draw（線を先に引き、その先に箱が現れる）・
// grow（箱が親の位置から線に沿って出てくる）。段階の数・長さ・最後の中身はどれも同じ
// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (index 0 is variant 0) and calls VARIANT.of(this) once, in mount. The choice reads, in order:
//   the component's `variant` attribute (a name) → its `seed` attribute → `data-egatari-seed` on the root element → 0.
// Seed 0 gives variant 0. Any other seed s gives the name v with the largest h("<s>|<tag>|<v>") (highest random weight),
// so every instance of a component in one lesson shows the same variant, components choose independently, and adding a
// variant later changes only the lessons where the new one wins. h is FNV-1a followed by the mixing of kit/deck.js's rng.
// The choice is a pure function of these values: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function mix(h){
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash(s){
    var h = 2166136261;
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return mix(h);
  }
  // A seed is a decimal integer 0 ≤ N < 2^32. Anything else is warned about and ignored (null)
  function seedOf(v, what){
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (/^\d{1,10}$/.test(s) && +s < 4294967296) return +s;
    console.warn(what + "=" + JSON.stringify(v) + " is not an integer 0 ≤ N < 2^32 (ignored)");
    return null;
  }
  // The variant name for seed s among names (for tools and tests; components call of)
  function pick(s, tag, names){
    if (!names.length) return null;
    if (!s) return names[0];
    var best = names[0], bh = -1;
    names.forEach(function(v){ var x = hash(s + "|" + tag + "|" + v); if (x > bh){ bh = x; best = v; } });
    return best;
  }
  // The effective seed of a component element (0 when nothing is written)
  function seed(el){
    var tag = el.tagName.toLowerCase(), s = seedOf(el.getAttribute("seed"), tag + " seed");
    if (s === null) s = seedOf(document.documentElement.getAttribute("data-egatari-seed"), "data-egatari-seed");
    return s === null ? 0 : s;
  }
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null){
      if (names.indexOf(v) >= 0) return v;
      console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (variant 0 is used)");
      return names[0] || null;
    }
    return pick(seed(el), tag, names);
  }
  // A seeded generator for a variant that needs randomness (0 ≤ x < 1), from the same seed, tag and a key of your own
  function rng(el, key){
    var h = hash(seed(el) + "|" + el.tagName.toLowerCase() + "|" + (key || ""));
    return function(){ h = mix((h + 0x9e3779b9) >>> 0); return h / 4294967296; };
  }
  return {of: of, pick: pick, seed: seed, rng: rng, hash: hash};
})();
// ---- END egatari-variant ----
DECK.define("m-tree", class extends DECK.MotionElement {
  static variants = ["fade", "draw", "grow"];
  // データの形（kit/shape.js）
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["nodes"], properties: {
      nodes: {type: "array", minItems: 1, items: {type: "object", required: ["id"], properties: {
        id: {type: ["string", "integer"]}, label: {type: "string"}, tex: {type: "string"}, note: {type: "string"}, tone: {type: "string"},
        parent: {type: ["string", "integer"]}, step: {type: "integer"}, at: {type: "number"}}}},
      edges: {type: "array", items: {type: "object", required: ["from", "to"], properties: {
        from: {type: ["string", "integer"]}, to: {type: ["string", "integer"]}, label: {type: "string"}, tone: {type: "string"}, dash: {type: "boolean"},
        step: {type: "integer"}, at: {type: "number"}}}}}},
    example: {nodes: [{id: "r", label: "動物"}, {id: "a", label: "脊椎動物", parent: "r"}, {id: "b", label: "無脊椎動物", parent: "r"}]},
    note: "parent のない節（根）はちょうど 1 つ",
  };
  static props = {
    orient: {type: "string", default: "down", doc: "down（上から下、既定）か right（左から右）"},
    by:     {type: "string", default: "level", doc: "段階の分け方：level（深さごと、既定）か node（1 つずつ、深さ優先の順）"},
    link:   {type: "string", default: "elbow", doc: "親子の線：elbow（かぎ形、既定）か straight（まっすぐ）"},
    size:   {type: "number", default: 0, doc: "箱の字の大きさ（px。0 = 27 から入るまで 24 まで縮める）"},
    fade:   {type: "number", default: 0.45, doc: "箱が現れる秒数"},
    draw:   {type: "number", default: 0.5, doc: "線を引く秒数"},
  };
  // 木の形と段階（mount の前にも段階の数のために使う）
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, P = this.props, byId = {}, roots = [];
    var nodes = (d.nodes || []).map(function(n){ var o = {n: n, kids: [], depth: 0}; byId[n.id] = o; return o; });
    nodes.forEach(function(o){
      if (o.n.parent === undefined || o.n.parent === null) roots.push(o);
      else if (!byId[o.n.parent]) throw new Error("m-tree: node " + JSON.stringify(o.n.id) + " has an unknown parent " + JSON.stringify(o.n.parent));
      else byId[o.n.parent].kids.push(o);
    });
    if (roots.length !== 1) throw new Error("m-tree: exactly one node must have no parent (the root); found " + roots.length);
    var order = [], seen = 0;
    (function walk(o, dep){
      if (++seen > nodes.length) throw new Error("m-tree: the parents form a loop");
      o.depth = dep; order.push(o);
      o.kids.forEach(function(c){ c.par = o; walk(c, dep + 1); });
    })(roots[0], 0);
    if (order.length !== nodes.length) throw new Error("m-tree: the parents form a loop");
    var byNode = P.by === "node";
    order.forEach(function(o, i){ o.step = o.n.step !== undefined ? o.n.step : byNode ? i + 1 : o.depth + 1; o.at = o.n.at || 0; });
    var edges = (d.edges || []).map(function(e){
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) throw new Error("m-tree: edge to an unknown node " + JSON.stringify(a ? e.to : e.from));
      return {e: e, a: a, b: b, step: e.step !== undefined ? e.step : Math.max(a.step, b.step)};
    });
    return (this._plan = {nodes: nodes, order: order, root: roots[0], byId: byId, edges: edges});
  }
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var p = this.plan(), m = 1;
    p.nodes.concat(p.edges).forEach(function(o){ m = Math.max(m, o.step); });
    return m;
  }
  mount(){
    var P = this.props, D = DECK, self = this, pl = this.plan();
    this.variant = VARIANT.of(this);
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight, right = P.orient === "right";
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    var root = D.el("g", {}, svg), gL = D.el("g", {}, root), gE = D.el("g", {}, root), gN = D.el("g", {}, root);
    // 字の幅の見積もり（和文 1 字 = 1 字幅、ほかは 0.6 字幅。*斜体* などの記号は数えない）
    var plain = function(s){ return String(s).replace(/\*/g, "").replace(/[_^](.)/g, "$1"); };
    var est = function(s){ return [...plain(s)].reduce(function(a, ch){ return a + (/[\u0000-ɏ]/.test(ch) ? 0.6 : 1); }, 0); };
    var texEst = function(s){ return Math.max(1, String(s).replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_\\ ]/g, "").length) * 0.62; };
    var NS = 24, NLH = 30;   // 注（note）の字の大きさと行の高さ
    var levels = 0;
    pl.nodes.forEach(function(o){ levels = Math.max(levels, o.depth + 1); });
    var labW = 0;
    pl.edges.forEach(function(x){ if (x.e.label) labW = Math.max(labW, est(x.e.label) * 24); });
    var edgeRoom = pl.edges.length ? 56 + (labW ? (right ? labW + 14 : 36) : 0) : 0;
    // 大きさ s の字で箱を測る（b：並ぶ向きの幅、d：深さの向きの幅）
    function measure(s){
      pl.nodes.forEach(function(o){
        var n = o.n, lines = n.tex ? [n.tex] : String(n.label || "").split("\n");
        var tw = n.tex ? texEst(n.tex) * s : Math.max.apply(null, lines.map(est)) * s;
        o.lines = lines;
        o.w = Math.max(s * 2.4, tw + s * 1.3); o.h = (n.tex ? s * 1.5 : lines.length * s * 1.25) + s * 0.75;
        o.notes = n.note ? String(n.note).split("\n") : [];
        o.nw = o.notes.length ? Math.max.apply(null, o.notes.map(est)) * NS : 0; o.nh = o.notes.length ? o.notes.length * NLH + 4 : 0;
        o.fb = right ? o.h + o.nh : Math.max(o.w, o.nw);
        o.fd = right ? Math.max(o.w, o.nw) : o.h + o.nh;
      });
    }
    // 部分木を置く：段ごとの輪郭 [左, 右] を返し、子の親からのずれ off を決める
    function lay(o, gap){
      var half = o.fb / 2;
      if (!o.kids.length){ o.cont = [[-half, half]]; return; }
      var acc = null, pos = [];
      o.kids.forEach(function(c){
        lay(c, gap);
        if (!acc){ pos.push(0); acc = c.cont.map(function(a){ return a.slice(); }); return; }
        var sh = -Infinity, dd;
        for (dd = 0; dd < Math.min(acc.length, c.cont.length); dd++) sh = Math.max(sh, acc[dd][1] + gap - c.cont[dd][0]);
        pos.push(sh);
        for (dd = 0; dd < c.cont.length; dd++){
          var l = c.cont[dd][0] + sh, r = c.cont[dd][1] + sh;
          if (dd < acc.length){ acc[dd][0] = Math.min(acc[dd][0], l); acc[dd][1] = Math.max(acc[dd][1], r); } else acc.push([l, r]);
        }
      });
      var mid = (pos[0] + pos[pos.length - 1]) / 2;
      o.kids.forEach(function(c, i){ c.off = pos[i] - mid; });
      o.cont = [[-half, half]].concat(acc.map(function(a){ return [a[0] - mid, a[1] - mid]; }));
    }
    function breadth(gap){
      lay(pl.root, gap);
      var lo = Infinity, hi = -Infinity;
      pl.root.cont.forEach(function(a){ lo = Math.min(lo, a[0]); hi = Math.max(hi, a[1]); });
      return {lo: lo, hi: hi, span: hi - lo};
    }
    function depthSum(){
      var ext = [];
      pl.nodes.forEach(function(o){ ext[o.depth] = Math.max(ext[o.depth] || 0, o.fd); });
      return {ext: ext, sum: ext.reduce(function(a, b){ return a + b; }, 0)};
    }
    var B = right ? H : W, DA = (right ? W : H) - edgeRoom;
    var gmin = right ? 14 : 22, gmax = right ? 30 : 64, lgmin = right ? 56 : 40, lgmax = right ? 110 : 90;
    var sizes = P.size ? [P.size] : [27, 26, 25, 24], s = null, fit = true, br, ds;
    for (var i = 0; i < sizes.length && s === null; i++){
      measure(sizes[i]); br = breadth(gmin); ds = depthSum();
      if (br.span <= B && ds.sum + (levels - 1) * lgmin <= DA) s = sizes[i];
    }
    if (s === null){ s = sizes[sizes.length - 1]; measure(s); fit = false; }
    // 並ぶ向きの間：入る範囲で広げる
    var gap = gmin;
    if (fit) for (var g = gmax; g > gmin; g -= 2){ if (breadth(g).span <= B){ gap = g; break; } }
    br = breadth(gap); ds = depthSum();
    var lgap = levels > 1 ? Math.max(lgmin, Math.min(lgmax, (DA - ds.sum) / (levels - 1))) : 0;
    var totalD = ds.sum + (levels - 1) * lgap;
    var lvStart = [], acc = 0;
    ds.ext.forEach(function(e, d){ lvStart[d] = acc; acc += e + lgap; });
    // 絶対位置（b：並ぶ向きの中心、d0：その段の始まり）
    (function place(o, b){ o.b = b; o.kids.forEach(function(c){ place(c, b + c.off); }); })(pl.root, 0);
    var oB = (B - br.span) / 2 - br.lo, oD = Math.max(0, (DA - totalD) / 2);
    if (!fit){
      oB = -br.lo; oD = 0;
      var sc = Math.min(B / br.span, (DA + edgeRoom) / (totalD + edgeRoom));
      root.setAttribute("transform", "scale(" + sc.toFixed(4) + ")");
      console.warn("m-tree: the tree does not fit at 24 px (" + Math.round(br.span) + " × " + Math.round(totalD) + " px needed); drawn smaller");
    }
    var tones = {term: ["var(--term)", "var(--term-tint)", "var(--fg)"], emph: ["var(--emph)", "var(--emph-tint)", "var(--emph)"]};
    var toneOf = function(t){
      if (tones[t]) return tones[t];
      if (/^(muted|accent2|series-[1-4])$/.test(t || "")) return ["var(--" + t + ")", "var(--bg)", "var(--" + t + ")"];
      return tones.term;
    };
    this.size = s;
    // 箱
    pl.nodes.forEach(function(o){
      var n = o.n, c = toneOf(n.tone), b = o.b + oB, d0 = lvStart[o.depth] + oD;
      if (right){ o.x = d0; o.y = b - o.fb / 2; } else { o.x = b - o.w / 2; o.y = d0; }
      o.cx = o.x + o.w / 2; o.cy = o.y + o.h / 2;
      o.g = D.el("g", {opacity: 0}, gN);
      D.el("rect", {class: "box", x: o.x.toFixed(1), y: o.y.toFixed(1), width: o.w.toFixed(1), height: o.h.toFixed(1), rx: 10, fill: c[1], stroke: c[0], "stroke-width": n.tone === "emph" ? 3 : 2.2}, o.g);
      if (n.tex) D.svgMath(o.g, o.cx, o.cy + s * 0.36, n.tex, {size: s, anchor: "middle", color: c[2], w: o.w, h: o.h}).firstChild.style.verticalAlign = "top";
      else {
        var lh = s * 1.25, y0 = o.cy - (o.lines.length - 1) * lh / 2 + s * 0.36;
        o.lines.forEach(function(t, j){ D.mtext(o.g, o.cx, y0 + j * lh, t, {"text-anchor": "middle", "font-size": s, fill: c[2]}); });
      }
      o.notes.forEach(function(t, j){
        var ny = o.y + o.h + 4 + NLH * j + NS * 0.95;
        D.mtext(o.g, right ? o.x + 2 : o.cx, ny, t, {"text-anchor": right ? "start" : "middle", "font-size": NS, fill: "var(--muted)"});
      });
      // 線が付く点：入る点（親からの線の終わり）と出る点（子への線の始まり）
      o.inP = right ? [o.x, o.cy] : [o.cx, o.y];
      o.outP = right ? [o.x + o.w, o.cy] : [o.cx, o.y + o.h + o.nh];
    });
    // 親子の線
    pl.nodes.forEach(function(o){
      if (!o.par) return;
      var p = o.par, a = p.outP, z = o.inP, pts;
      if (P.link === "straight") pts = [a, z];
      else if (right){ var bx = lvStart[p.depth] + oD + ds.ext[p.depth] + lgap / 2; pts = [a, [bx, a[1]], [bx, z[1]], z]; }
      else { var by = lvStart[p.depth] + oD + ds.ext[p.depth] + lgap / 2; pts = [a, [a[0], by], [z[0], by], z]; }
      o.path = self.poly(pts);
      o.line = D.el("path", {d: "", fill: "none", stroke: "var(--line)", "stroke-width": 3, "stroke-linejoin": "round"}, gL);
    });
    // そのほかのつながり：外側（down は下、right は右）にふくらむ破線の曲線
    var depthEnd = oD + totalD;
    this.edges = pl.edges.map(function(x){
      var e = x.e, a = x.a, b = x.b;
      var pa = right ? [a.x + a.fd, a.cy] : [a.cx, a.y + a.fd], pb = right ? [b.x + b.fd, b.cy] : [b.cx, b.y + b.fd];
      var sg = right ? (b.cy > a.cy ? 1 : -1) : (b.cx > a.cx ? 1 : -1), q = Math.min(18, (right ? a.fb : a.w) / 4);
      if (right){ pa = [pa[0] + 6, pa[1] + sg * q]; pb = [pb[0] + 10, pb[1] - sg * q]; } else { pa = [pa[0] + sg * q, pa[1] + 6]; pb = [pb[0] - sg * q, pb[1] + 10]; }
      var far = Math.max(right ? pa[0] : pa[1], right ? pb[0] : pb[1]) + 44;
      var mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], ctl = right ? [2 * far - mid[0], mid[1]] : [mid[0], 2 * far - mid[1]];
      // 頂点が far になるように制御点を置く（2 次ベジェの中点 = (端の中点 + 制御点) / 2）
      var pts = [];
      for (var j = 0; j <= 24; j++){
        var u = j / 24, v = 1 - u;
        pts.push([v * v * pa[0] + 2 * u * v * ctl[0] + u * u * pb[0], v * v * pa[1] + 2 * u * v * ctl[1] + u * u * pb[1]]);
      }
      var col = e.tone ? toneOf(e.tone)[0] : "var(--muted)";
      var g = D.el("g", {opacity: 0}, gE);
      var line = D.el("path", {d: "", fill: "none", stroke: col, "stroke-width": 3, "stroke-dasharray": e.dash === false ? "none" : "8 6"}, g);
      var head = D.el("path", {d: "M0,0L-16,-7L-16,7Z", fill: col}, g);
      var lab = e.label ? D.mtext(g, right ? far + 10 : (pa[0] + pb[0]) / 2, right ? mid[1] + 8 : far + 30, e.label,
        {"text-anchor": right ? "start" : "middle", "font-size": 24, fill: col, opacity: 0}) : null;
      depthEnd = Math.max(depthEnd, far);
      var after = 0;
      [a, b].forEach(function(o){ if (o.step === x.step) after = Math.max(after, o.at + self.span()); });
      return {g: g, line: line, head: head, lab: lab, path: self.poly(pts), step: x.step, at: e.at !== undefined ? e.at : after};
    });
  }
  // 箱 1 つの動きの長さ（どの見せ方でも同じ）：箱が現れて線を引き終わるまで
  span(){ return this.props.fade * 0.6 + this.props.draw; }
  // 折れ線：点と累積の長さ
  poly(pts){
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts: pts, L: L, len: L[L.length - 1] || 1};
  }
  // 折れ線の始めから割合 f までの部分：{d, end, ang}
  part(pl, f){
    var want = pl.len * Math.max(0, Math.min(1, f)), pts = pl.pts, out = [pts[0]], i = 1;
    for (; i < pts.length && pl.L[i] <= want; i++) out.push(pts[i]);
    var end = out[out.length - 1];
    if (i < pts.length && want > pl.L[i - 1]){
      var u = (want - pl.L[i - 1]) / (pl.L[i] - pl.L[i - 1]);
      end = [DECK.lerp(pts[i - 1][0], pts[i][0], u), DECK.lerp(pts[i - 1][1], pts[i][1], u)];
      out.push(end);
    }
    var pv = out.length > 1 ? out[out.length - 2] : pts[0], nx = i < pts.length ? pts[i] : end;
    var ang = Math.atan2(end[1] - pv[1], end[0] - pv[0]);
    if (out.length < 2) ang = Math.atan2(nx[1] - end[1], nx[0] - end[0]);
    return {d: "M" + out.map(function(p){ return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"), end: end, ang: ang};
  }
  duration(k){
    var self = this, d = 0, pl = this.plan();
    pl.nodes.forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + (o.par ? self.span() : self.props.fade)); });
    (this.edges || []).forEach(function(o){ if (o.step === k) d = Math.max(d, o.at + self.props.draw + (o.lab ? 0.3 : 0)); });
    return d;
  }
  render(k, t, ctx){
    var P = this.props, D = DECK, self = this, vr = this.variant, lect = ctx && ctx.mode === "lecture", S = this.span(), FAINT = 0.45;
    // 段階 step の要素の、その段階の中の時刻（-1 = まだ、Infinity = 済み）
    var tOf = function(step){ return step < k ? Infinity : step > k ? -1 : t; };
    var pr = function(tt, at, dur){ return tt < 0 ? 0 : D.prog(tt, at, dur); };
    this.plan().nodes.forEach(function(o){
      var tt = tOf(o.step), eb, el, u = 1, sc = 1;
      if (!o.par || vr === "fade"){ eb = pr(tt, o.at, P.fade); el = pr(tt, o.at + P.fade * 0.6, P.draw); sc = D.lerp(0.92, 1, eb); }
      else if (vr === "draw"){ el = pr(tt, o.at, S * 0.5); eb = pr(tt, o.at + S * 0.45, S * 0.55); sc = D.lerp(0.92, 1, eb); }
      else { u = pr(tt, o.at, S); el = u; eb = pr(tt, o.at, S * 0.35); sc = D.lerp(0.5, 1, u); }
      if (lect){
        // 授業の表示：後の段階は薄く、今の段階は薄い状態から濃くなる（位置は動かさない。どの見せ方でも同じ）
        var f = tt < 0 ? FAINT : FAINT + (1 - FAINT) * eb;
        o.g.setAttribute("opacity", f.toFixed(3)); o.g.setAttribute("transform", "");
        if (o.line){ o.line.setAttribute("d", self.part(o.path, 1).d); o.line.setAttribute("opacity", f.toFixed(3)); }
        return;
      }
      o.g.setAttribute("opacity", eb.toFixed(3));
      var tr = "";
      if (u < 1 && o.par){
        // grow：箱の入る点を、線の上の今の点に置き、小さい大きさから戻す
        var q = self.part(o.path, u).end;
        tr = "translate(" + q[0].toFixed(2) + " " + q[1].toFixed(2) + ") scale(" + sc.toFixed(4) + ") translate(" + (-o.inP[0]).toFixed(2) + " " + (-o.inP[1]).toFixed(2) + ")";
      } else if (sc < 1) tr = "translate(" + o.cx.toFixed(2) + " " + o.cy.toFixed(2) + ") scale(" + sc.toFixed(4) + ") translate(" + (-o.cx).toFixed(2) + " " + (-o.cy).toFixed(2) + ")";
      o.g.setAttribute("transform", tr);
      if (o.line){ o.line.setAttribute("d", el > 0 ? self.part(o.path, el).d : ""); o.line.setAttribute("opacity", el > 0 ? 1 : 0); }
    });
    this.edges.forEach(function(o){
      var tt = tOf(o.step), e = pr(tt, o.at, P.draw), lo = pr(tt, o.at + P.draw * 0.8, 0.3);
      if (lect){ var f = tt < 0 ? FAINT : FAINT + (1 - FAINT) * e; e = 1; lo = 1; o.g.setAttribute("opacity", f.toFixed(3)); }
      else o.g.setAttribute("opacity", e > 0 ? 1 : 0);
      var p = self.part(o.path, e);
      o.line.setAttribute("d", e > 0 ? p.d : "");
      // 矢じりは線が 20px 伸びるまでに大きくなる
      var hs = Math.min(1, e * o.path.len / 20);
      o.head.setAttribute("transform", "translate(" + p.end[0].toFixed(2) + " " + p.end[1].toFixed(2) + ") rotate(" + (p.ang * 180 / Math.PI).toFixed(2) + ") scale(" + hs.toFixed(4) + ")");
      if (o.lab) o.lab.setAttribute("opacity", lo.toFixed(3));
    });
  }
});

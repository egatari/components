// m-construct：作図の手順（mode="steps"、既定）と、点を動かしても変わらない量（mode="invariant"：円周角・三角形の内角の和）
// <m-construct style="height:440px"><script type="application/json">{"points": {"A": [-3, 0], "B": [3, 0]}, "ops": [{"seg": ["A", "B"]}, ...]}</script></m-construct>
// 座標は論理の座標（x は右、y は上）。交点（meet）・弧の範囲・角の値はパーツが計算する（作成者や AI は交点の座標を書かない）。
// steps：ステップ 0 は points の点だけ。ステップ k で ops の k 個目を描く（線は始点から伸び、円と弧は回って描かれ、交点は描き終わりに出る）。
//   右（縦書きのスライドでは下）の欄に、op の note を番号つきで 1 つずつ足す。
// invariant：ops は初めから全部描く。move の点を visit の位置へ 1 つずつ動かし、measure（角 1 つか、角の和）を動いている間も計算して出す。
//   円の上の点（{"point": "P", "on": "circle1", "deg": 90}）は角度（度）で、ほかの点は座標で動く。前の位置は薄く残す（trail）。
// 2.0（Egatari spec §6.1 の部品）：base の MotionElement・el・prog・lerp・textWidth だけを使い、プレイヤーのグローバルは使わない。
egatariParts.define({name: "construct", version: "2.0.0", requires: {base: "1.3.0"}, element: "m-construct"}, function(deps){
"use strict";
var base = deps.base;
var DEG = Math.PI / 180, EPS = 1e-7;
var TEXT = {
  ja: {steps: "作図の手順", none: "（手順の説明なし）", every: function(m, v){ return m + " はどの位置でも " + v; }, at: function(i){ return "位置 " + i; },
    sep: "、", colon: "：", construct: "作図", invariant: "点を動かす"},
  en: {steps: "Construction steps", none: "(no step notes)", every: function(m, v){ return m + " is " + v + " at every position"; }, at: function(i){ return "position " + i; },
    sep: ", ", colon: ": ", construct: "Construction", invariant: "Moving a point"},
};
var TONES = {fg: "var(--fg)", term: "var(--term)", emph: "var(--emph)", accent2: "var(--accent2)", muted: "var(--muted)"};
var KINDS = ["point", "seg", "line", "ray", "circle", "arc", "meet", "angle", "equal", "polygon"];
var NAME = {type: ["string"]}, PAIR = {type: "array", items: {type: "string"}, minItems: 2, maxItems: 2};
var Part = class extends base.MotionElement {
  static partName = "construct";
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["ops"], properties: {
      points: {type: "object"},
      ops: {type: "array", items: {type: "object", additionalProperties: false,
        anyOf: KINDS.map(function(k){ return {required: [k]}; }),
        properties: {
          point: NAME, at: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2}, on: NAME, deg: {type: "number"},
          seg: PAIR, line: PAIR, ray: PAIR,
          circle: {type: "object", additionalProperties: false, required: ["c"], properties: {c: NAME, r: {type: ["number", "array"]}, through: NAME}},
          arc: {type: "object", additionalProperties: false, required: ["c", "r"], properties: {c: NAME, r: {type: ["number", "array"]}, from: {type: "number"}, to: {type: "number"}}},
          meet: PAIR, name: {type: ["string", "array"]},
          angle: {type: "array", items: {type: "string"}, minItems: 3, maxItems: 3}, show: {type: "string", enum: ["both", "value", "mark"]},
          equal: {type: "array", items: {type: "array", items: {type: "string"}}, minItems: 2}, ticks: {type: "integer"},
          polygon: {type: "array", items: {type: "string"}, minItems: 3},
          note: {type: "string"}, tone: {type: "string", enum: ["fg", "term", "emph", "accent2", "muted"]}, id: {type: "string"}}}},
      move: {type: "string"}, visit: {type: "array"}, notes: {type: "array", items: {type: ["string", "null"]}},
      measure: {type: "object", additionalProperties: false, properties: {
        angle: {type: "array", items: {type: "string"}, minItems: 3, maxItems: 3},
        sum: {type: "array", items: {type: "array", items: {type: "string"}, minItems: 3, maxItems: 3}, minItems: 2}}}}},
    example: {points: {A: [-3, 0], B: [3, 0]}, ops: [
      {seg: ["A", "B"]},
      {arc: {c: "A", r: 4}, note: "A を中心に弧をかく"},
      {arc: {c: "B", r: 4}, note: "同じ半径で B を中心に弧をかく"},
      {meet: ["arc1", "arc2"], name: ["P", "Q"], note: "2 つの弧の交点を P、Q とする"},
      {line: ["P", "Q"], tone: "emph", note: "直線 PQ が AB の垂直二等分線"}]},
  };
  static props = {
    mode:  {type: "string", default: "steps", doc: "steps（作図の手順を 1 つずつ）か invariant（点を動かしても変わらない量を見せる）"},
    size:  {type: "number", default: 26, doc: "点の名前と角の値の字の大きさ（px。24 以上）。手順の説明は 24px"},
    trail: {type: "bool", default: true, doc: "invariant で、前の位置の点と線を薄く残す"},
    dur:   {type: "number", default: 1.2, doc: "1 ステップの動きの秒数（invariant で円の上を大きく動くときは長くなる）"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    var pl = this.plan();
    return pl.invariant ? pl.visit.length : pl.ops.length;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {}, bad = [], invariant = this.props.mode === "invariant";
    var ops = Array.isArray(d.ops) ? d.ops : [], points = d.points && typeof d.points === "object" ? d.points : {};
    var pl = {invariant: invariant, ops: ops, points: points, bad: bad, visit: [], move: null, start: null, measure: null};
    if (invariant){
      pl.move = typeof d.move === "string" ? d.move : null;
      pl.visit = Array.isArray(d.visit) ? d.visit : [];
      pl.notes = Array.isArray(d.notes) ? d.notes : [];
      pl.measure = d.measure || null;
      if (!pl.move) bad.push("invariant needs \"move\": the name of the point to move");
      if (!pl.visit.length) bad.push("invariant needs \"visit\": the positions to move the point to (degrees on a circle, or [x, y])");
      if (!pl.measure || !(pl.measure.angle || pl.measure.sum)) bad.push("invariant needs \"measure\": {\"angle\": [\"A\", \"P\", \"B\"]} or {\"sum\": [[…], […], …]}");
    }
    // 一度、計算してみる（名前の誤り・交わらない、を mount で報告するため）
    var g = solve(pl, null);
    pl.issues = g.issues;
    if (invariant && pl.move){
      var src = g.src[pl.move];
      if (!src) bad.push("\"move\": \"" + pl.move + "\" is not a point of \"points\" or a {\"point\"} op" + hint(pl.move, Object.keys(g.pts)));
      else if (src.kind === "meet") bad.push("\"move\": \"" + pl.move + "\" is a meeting point and cannot move; move a point it depends on");
      else {
        pl.onCircle = src.kind === "on";
        pl.start = pl.onCircle ? src.deg : g.pts[pl.move].slice();
        var self = this;
        pl.visit = pl.visit.map(function(v, i){
          if (pl.onCircle){
            if (typeof v === "number" && isFinite(v)) return v;
            bad.push("visit[" + i + "] must be a number of degrees (\"" + pl.move + "\" is on a circle); using " + pl.start);
            return pl.start;
          }
          if (Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1])) return [+v[0], +v[1]];
          bad.push("visit[" + i + "] must be [x, y] (\"" + pl.move + "\" is a free point); using its first position");
          return pl.start.slice();
        });
      }
    }
    if (invariant && pl.measure){
      var groups = pl.measure.sum || (pl.measure.angle ? [pl.measure.angle] : []);
      groups.forEach(function(a){ a.forEach(function(n){ if (!g.pts[n]) bad.push("measure: \"" + n + "\" is not a point" + hint(n, Object.keys(g.pts))); }); });
    }
    return (this._plan = pl);
  }
  // 位置 s（0 は start、1… は visit）。小数は間の位置
  posAt(s){
    var pl = this.plan(), list = [pl.start].concat(pl.visit), last = list.length - 1;
    if (s <= 0) return list[0];
    if (s >= last) return list[last];
    var i = Math.floor(s), f = s - i;
    if (f < 1e-12) return list[i];
    var a = list[i], b = list[i + 1];
    return pl.onCircle ? base.lerp(a, b, f) : [base.lerp(a[0], b[0], f), base.lerp(a[1], b[1], f)];
  }
  legDur(k){
    var pl = this.plan(), list = [pl.start].concat(pl.visit);
    if (k < 1 || k >= list.length) return 0;
    if (pl.onCircle) return this.props.dur * Math.max(1, Math.abs(list[k] - list[k - 1]) / 90);
    return this.props.dur;
  }
  duration(k){
    var pl = this.plan();
    if (k < 1) return 0;
    if (pl.invariant) return this.legDur(k);
    return k <= pl.ops.length ? this.props.dur : 0;
  }
  geo(s){
    var pl = this.plan(), o = null;
    if (pl.invariant && pl.move && pl.start !== null){ o = {}; o[pl.move] = this.posAt(s); }
    return solve(pl, o);
  }
  mount(ctx){
    var P = this.props, pl = this.plan(), self = this;
    pl.bad.forEach(function(m){ ctx.report("data", "[construct] " + m); });
    pl.issues.forEach(function(m){ ctx.report("data", "[construct] " + m); });
    if (["steps", "invariant"].indexOf(P.mode) < 0){ ctx.report("attr", "[construct] mode=\"" + P.mode + "\" is not steps or invariant; using steps"); }
    if (!(isFinite(P.size) && P.size >= 24)){ ctx.report("attr", "[construct] size must be at least 24; using 26"); P.size = 26; }
    if (!(isFinite(P.dur) && P.dur > 0)){ ctx.report("attr", "[construct] dur must be positive; using 1.2"); P.dur = 1.2; }
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    var vertical = false;
    try { var pe = this.parentElement; vertical = !!pe && /^vertical/.test(getComputedStyle(pe).writingMode || ""); } catch (x) {}
    var W = this.W = this.clientWidth, H = this.H = this.clientHeight;
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible", "aria-hidden": "true"}, this);
    // 図に入る全部の位置（invariant は動く先も）で、範囲を決める
    var all = [this.geo(0)];
    if (pl.invariant) for (var i = 1; i <= pl.visit.length; i++){ all.push(this.geo(i)); all.push(this.geo(i - 0.5)); }
    var L = this.L = this.arrange(all, vertical);
    if (L.why) ctx.report("size", "[construct] " + L.why + (vertical ? " (the slide is set vertically; the part stays horizontal)" : ""));
    this.layer = base.el("g", {}, this.svg);
    // 層は 1 回だけ作り、描くものは鍵で同じ要素を使い直す（先を薄く見せる表示で、今の要素がそのまま残るように）
    var ly = this.layer;
    this.lay = {fill: base.el("g", {}, ly), line: base.el("g", {}, ly), mark: base.el("g", {}, ly), dot: base.el("g", {}, ly), text: base.el("g", {}, ly), panel: base.el("g", {}, ly)};
    this.pool = new Pool();
    // 読み上げ
    this.setAttribute("role", "img");
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.spoken());
    this._ctx = ctx;
    this._reported = false;
  }
  // 配置：図（左か上）と欄（右か下）
  arrange(all, vertical){
    var W = this.W, H = this.H, pl = this.plan(), self = this, why = [];
    var lines = this.panelLines(), fs = 24, lh = 32;
    var hasPanel = lines.length > 0;
    var L = {fs: fs, lh: lh, vertical: vertical};
    if (hasPanel && !vertical && W >= 760){
      L.pw = Math.max(260, Math.min(480, W * 0.38));
      L.px = W - L.pw; L.py = 8; L.ph = H - 8;
      L.fx = 0; L.fy = 0; L.fw = W - L.pw - 24; L.fh = H;
    } else if (hasPanel){
      var bfs0 = Math.max(28, this.props.size + 4), hgt = 60;
      lines.forEach(function(ln){ hgt += ln.big ? bfs0 * 1.4 * (base.textWidth(ln.text, bfs0, {font: self}) > W - 8 ? ln.text.split(" = ").length : 1) + 12 : lh * wrap(ln.text, fs, W - 36, self).length; });
      L.pw = W; L.px = 0; L.ph = Math.min(hgt, H * 0.5); L.py = H - L.ph;
      L.fx = 0; L.fy = 0; L.fw = W; L.fh = H - L.ph - 12;
    } else { L.fx = 0; L.fy = 0; L.fw = W; L.fh = H; L.pw = 0; }
    // 論理の座標の範囲
    var bb = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
    var add = function(p){ if (!p || !isFinite(p[0]) || !isFinite(p[1])) return; bb.x0 = Math.min(bb.x0, p[0]); bb.x1 = Math.max(bb.x1, p[0]); bb.y0 = Math.min(bb.y0, p[1]); bb.y1 = Math.max(bb.y1, p[1]); };
    all.forEach(function(g){
      Object.keys(g.pts).forEach(function(n){ add(g.pts[n]); });
      g.objs.forEach(function(o){
        if (o.type === "circle"){ add([o.c[0] - o.r, o.c[1] - o.r]); add([o.c[0] + o.r, o.c[1] + o.r]); }
        if (o.type === "arc") o.pieces.forEach(function(pc){ for (var j = 0; j <= 8; j++){ var u = (pc[0] + (pc[1] - pc[0]) * j / 8) * DEG; add([o.c[0] + o.r * Math.cos(u), o.c[1] + o.r * Math.sin(u)]); } });
      });
    });
    if (!isFinite(bb.x0)){ bb = {x0: -1, y0: -1, x1: 1, y1: 1}; }
    var sx = Math.max(bb.x1 - bb.x0, 1e-6), sy = Math.max(bb.y1 - bb.y0, 1e-6);
    // 直線と半直線は、この範囲を少し広げた枠で切る
    var padL = 0.12 * Math.max(sx, sy);
    L.clip = {x0: bb.x0 - padL, y0: bb.y0 - padL, x1: bb.x1 + padL, y1: bb.y1 + padL};
    var hasLines = all[0].objs.some(function(o){ return o.type === "line" || o.type === "ray"; });
    var box = hasLines ? L.clip : bb, bw = box.x1 - box.x0 || 1, bh = box.y1 - box.y0 || 1;
    // 点の名前の分（名前は点から 16 + 0.5·size 離れ、高さは size）を図のまわりにあける
    var m = 24 + 1.5 * this.props.size;
    var aw = L.fw - 2 * m, ah = L.fh - 2 * m;
    var s = Math.min(aw / bw, ah / bh);
    if (!(s > 0)) s = 1;
    L.s = s;
    L.ox = L.fx + L.fw / 2 - s * (box.x0 + box.x1) / 2;
    L.oy = L.fy + L.fh / 2 + s * (box.y0 + box.y1) / 2;
    if (aw < 160 || ah < 120) why.push("the figure gets " + Math.round(Math.max(0, aw)) + " × " + Math.round(Math.max(0, ah)) + " px; make the element larger");
    // 欄の字を折り返す
    if (hasPanel){
      var wrapW = L.pw - 36, rowsOut = [];
      var bfs = Math.max(28, this.props.size + 4);
      lines.forEach(function(ln){
        if (ln.big){ var n = base.textWidth(ln.text, bfs, {font: self}) > L.pw - 8 ? ln.text.split(" = ").length : 1; for (var b = 0; b < n; b++) rowsOut.push({op: -1, big: true, text: ""}); rowsOut.push({op: -1, gap: true, text: ""}); return; }
        var parts = wrap(ln.text, fs, wrapW, self); parts.forEach(function(t, j){ rowsOut.push({op: ln.op, idx: ln.idx, text: t, first: j === 0, big: ln.big}); }); });
      L.rows = rowsOut;
      var need = 60 + rowsOut.reduce(function(a, r){ return a + (r.gap ? 12 : r.big ? bfs * 1.4 : lh); }, 0);
      if (need > L.ph + 4) why.push("the notes need about " + Math.ceil(need) + " px of height; the panel has " + Math.round(L.ph) + " (shorter notes, or a taller element)");
    } else L.rows = [];
    L.why = why.join("; ");
    return L;
  }
  // 欄の行：steps は note のある op、invariant は測る量の名前と位置ごとの値（値は render が書く）
  panelLines(){
    var pl = this.plan(), out = [];
    if (!pl.invariant){
      var n = 0;
      pl.ops.forEach(function(o, i){ if (typeof o.note === "string" && o.note){ n++; out.push({op: i, idx: n, text: n + ". " + o.note}); } });
      return out;
    }
    if (!pl.measure) return out;
    var ng = (pl.measure.sum || [0]).length, sample = [];
    for (var j = 0; j < ng; j++) sample.push(100);
    out.push({op: -1, idx: 0, text: this.measureText({parts: sample, total: 180}), big: true});
    for (var i = 0; i <= pl.visit.length; i++) out.push({op: -1, idx: i + 1, text: this.T.at(i + 1) + this.T.colon + "000°" + ((pl.notes[i - 1] || "") ? "  " + pl.notes[i - 1] : "")});
    return out;
  }
  measureName(){
    var pl = this.plan(), m = pl.measure || {};
    if (m.angle) return "∠" + m.angle.join("");
    if (m.sum) return m.sum.map(function(a){ return "∠" + a[1]; }).join(" + ");
    return "";
  }
  // 測る量（度）：angle はその角、sum は各角（和が丸めた合計に合うように丸める）
  measureAt(g){
    var pl = this.plan(), m = pl.measure || {}, groups = m.sum || (m.angle ? [m.angle] : []);
    var vals = groups.map(function(a){ var A = g.pts[a[0]], V = g.pts[a[1]], B = g.pts[a[2]]; return A && V && B ? angleDeg(A, V, B) : NaN; });
    if (!m.sum) return {parts: vals.map(Math.round), total: Math.round(vals[0])};
    var total = Math.round(vals.reduce(function(a, b){ return a + b; }, 0)), fl = vals.map(Math.floor), rest = total - fl.reduce(function(a, b){ return a + b; }, 0);
    var order = vals.map(function(v, i){ return [v - Math.floor(v), i]; }).sort(function(a, b){ return b[0] - a[0] || a[1] - b[1]; });
    for (var j = 0; j < rest && j < order.length; j++) fl[order[j][1]]++;
    return {parts: fl, total: total};
  }
  measureText(r){
    var pl = this.plan();
    if (pl.measure && pl.measure.sum) return this.measureName() + " = " + r.parts.map(function(v){ return v + "°"; }).join(" + ") + " = " + r.total + "°";
    return this.measureName() + " = " + r.total + "°";
  }
  spoken(){
    var pl = this.plan(), T = this.T, ja = T === TEXT.ja;
    if (!pl.invariant){
      var notes = pl.ops.map(function(o){ return o.note; }).filter(Boolean);
      return T.construct + T.colon + (notes.length ? notes.map(function(s, i){ return (i + 1) + ". " + s; }).join(ja ? " " : " ") : T.none);
    }
    if (!pl.measure || pl.start === null) return T.invariant;
    var vals = [];
    for (var i = 0; i <= pl.visit.length; i++) vals.push(this.measureAt(this.geo(i)).total);
    var same = vals.every(function(v){ return v === vals[0]; });
    if (same) return T.invariant + T.colon + T.every(this.measureName(), vals[0] + "°");
    return T.invariant + T.colon + this.measureName() + T.colon + vals.map(function(v, i){ return T.at(i + 1) + " " + v + "°"; }).join(T.sep);
  }
  render(k, t, ctx){
    var L = this.L, pl = this.plan();
    if (!L) return;
    ctx = ctx || this._ctx || {};
    var D = this.pool;
    D.begin();
    var prev = ctx.preview || ctx.mode === "lecture";
    var po = 0;
    if (prev){ try { po = base.previewOpacity(this); } catch (x) { po = 0.45; } }
    var X = function(p){ return L.ox + L.s * p[0]; }, Y = function(p){ return L.oy - L.s * p[1]; };
    var S = function(p){ return [X(p), Y(p)]; };
    var lay = this.lay;
    lay.P = D;
    var self = this, fsz = this.props.size;
    var labels = [];
    if (!pl.invariant){
      var g = this.geo(0), n = pl.ops.length, cur = Math.min(k, n), e = k > n || k < 1 ? 1 : base.prog(t, 0, this.props.dur);
      // 点：points の点はステップ 0 から。op の点はその op から
      var shown = {};
      Object.keys(pl.points).forEach(function(nm){ if (g.pts[nm]) shown[nm] = 1; });
      g.objs.forEach(function(o){
        var i = o.op, fut = i >= cur;
        if (fut && !po) return;
        D.k("o:" + o.id);
        drawObj(lay, o, S, L, fut ? 1 : (i === cur - 1 ? e : 1), fut ? po : 1, fsz, labels, g);
        if (o.names) o.names.forEach(function(nm){ if (!fut) shown[nm] = i === cur - 1 ? Math.max(shown[nm] || 0, appear(o, e)) : 1; else if (!(nm in shown)) shown[nm] = -po; });
      });
      this.drawPoints(lay, g, shown, S, labels, fsz);
      this.drawPanel(lay.panel, cur, e, po);
    } else {
      var nv = pl.visit.length, kk = Math.min(Math.max(k, 0), nv), f = k >= 1 && k <= nv ? base.prog(t, 0, this.legDur(k)) : 1;
      var s = k >= 1 && k <= nv ? (k - 1) + f : kk;
      var g2 = this.geo(s);
      // 前の位置（trail）と、先の位置（preview）
      var ghost = function(at, op){
        var gg = self.geo(at);
        gg.objs.forEach(function(o){ if (o.uses && o.uses.indexOf(pl.move) >= 0 && o.type !== "angle" && o.type !== "polygon"){ D.k("g" + at + ":" + o.id); drawObj(lay, o, S, L, 1, op, fsz, null, gg); } });
        var p = gg.pts[pl.move];
        D.k("g" + at + ":pt");
        if (p) D.el("circle", {cx: X(p).toFixed(2), cy: Y(p).toFixed(2), r: 5, fill: "var(--muted)", opacity: op}, lay.dot);
      };
      if (this.props.trail && pl.start !== null) for (var j = 0; j < s - 1e-9 && j <= nv; j++) ghost(j, 0.3);
      if (po && pl.start !== null) for (var q = kk + 1; q <= nv; q++) ghost(q, po);
      g2.objs.forEach(function(o){ D.k("o:" + o.id); drawObj(lay, o, S, L, 1, 1, fsz, labels, g2); });
      var all = {};
      Object.keys(g2.pts).forEach(function(nm){ all[nm] = 1; });
      this.drawPoints(lay, g2, all, S, labels, fsz);
      this.drawMeasure(lay.panel, g2, s, kk, f, k);
    }
    D.end();
    // 字の重なり（1 回だけ報告）
    if (!this._reported && k >= this.steps && (t === Infinity || t === undefined)){
      var hit = overlapPair(labels);
      if (hit && ctx.report){ ctx.report("layout", "[construct] \"" + hit[0] + "\" and \"" + hit[1] + "\" overlap; move a point or make the element larger"); }
      this._reported = true;
    }
  }
  drawPoints(lay, g, shown, S, labels, fsz){
    var D = this.pool, self = this;
    Object.keys(shown).forEach(function(nm){
      var v = shown[nm], p = g.pts[nm];
      if (!p || !v) return;
      var op = v < 0 ? -v : v, q = S(p);
      D.k("pt:" + nm);
      D.el("circle", {cx: q[0].toFixed(2), cy: q[1].toFixed(2), r: 5, fill: "var(--fg)", opacity: op.toFixed(3)}, lay.dot);
      var r = 16 + fsz * 0.5, dir = labelDir(nm, g, S, self.L, r, fsz);
      var tx = q[0] + r * Math.cos(dir), ty = q[1] + r * Math.sin(dir) + fsz * 0.35;
      var t = D.el("text", {x: tx.toFixed(1), y: ty.toFixed(1), "font-size": fsz, "font-style": "italic", fill: "var(--fg)", "text-anchor": "middle", opacity: op.toFixed(3)}, lay.text);
      t.textContent = nm;
      if (op >= 1 && labels) labels.push({text: nm, x: tx - base.textWidth(nm, fsz, {font: self}) / 2, y: ty - fsz * 0.8, w: base.textWidth(nm, fsz, {font: self}), h: fsz});
    });
  }
  drawPanel(g, cur, e, po){
    var L = this.L, D = this.pool, y = L.py + 30, last = -1;
    D.k("panel");
    if (!L.rows.length) return;
    // 今の説明：今のステップまでで、いちばん新しい説明
    L.rows.forEach(function(r){ if (r.op <= cur - 1) last = Math.max(last, r.op); });
    D.el("text", {x: L.px + 4, y: y, "font-size": 24, fill: "var(--muted)"}, g).textContent = this.T.steps;
    y += 14;
    L.rows.forEach(function(r){
      y += L.lh;
      var now = r.op === last, fut = r.op >= cur;
      if (fut && !po) return;
      var op = fut ? po : r.op === cur - 1 ? base.prog(e, 0, 0.3) : 1;
      if (now && r.first) D.el("rect", {x: L.px + 4, y: y - 22, width: 6, height: 28, fill: "var(--emph)", opacity: op.toFixed(3)}, g);
      var t = D.el("text", {x: L.px + 20, y: y, "font-size": 24, fill: "var(--fg)", "font-weight": now ? 700 : 400, opacity: (+op).toFixed(3)}, g);
      t.textContent = r.text;
    });
  }
  drawMeasure(g, geo, s, kk, f, k){
    var L = this.L, D = this.pool, pl = this.plan(), self = this;
    if (!L.rows.length || !pl.measure || pl.start === null) return;
    D.k("panel");
    var y = L.py + 30;
    D.el("text", {x: L.px + 4, y: y, "font-size": 24, fill: "var(--muted)"}, g).textContent = this.T.invariant;
    y += 54;
    var now = this.measureAt(geo);
    var bfs = Math.max(28, this.props.size + 4), txt = this.measureText(now), parts = [txt];
    // 欄に入らなければ「=」の前で折る
    if (base.textWidth(txt, bfs, {font: this}) > L.pw - 8){
      parts = txt.split(" = ").map(function(x, i){ return i ? "= " + x : x; });
    }
    y += 0;
    parts.forEach(function(line, i){
      if (i) y += bfs * 1.4;
      D.el("text", {x: L.px + 4, y: y, "font-size": bfs, "font-weight": 700, fill: "var(--fg)"}, g).textContent = line;
    });
    y += 12;
    // 着いた位置の値（位置 1 は start）
    var arrived = k > pl.visit.length ? pl.visit.length : (f >= 1 ? kk : kk - 1);
    if (k < 1) arrived = 0;
    for (var i = 0; i <= arrived; i++){
      y += L.lh;
      var r = this.measureAt(this.geo(i)), note = i >= 1 ? pl.notes[i - 1] : null;
      var t = D.el("text", {x: L.px + 20, y: y, "font-size": 24, fill: "var(--fg)"}, g);
      t.textContent = this.T.at(i + 1) + this.T.colon + r.total + "°" + (note ? "  " + note : "");
    }
  }
};

// ---- 要素の使い直し：同じ鍵で描いた要素は、次の描画でも同じ要素（属性は毎回、同じ順に書き直す）。使わなかった要素は外す
var SVGNS = "http://www.w3.org/2000/svg";
function Pool(){ this.map = {}; this.used = {}; this.pre = ""; this.n = 0; }
Pool.prototype.begin = function(){ this.used = {}; this.pre = ""; this.n = 0; };
Pool.prototype.k = function(pre){ this.pre = pre; this.n = 0; };
Pool.prototype.el = function(tag, attrs, parent){
  var key = this.pre + "#" + (this.n++), e = this.map[key];
  if (!e || e.localName !== tag){ if (e) detach(e); e = document.createElementNS(SVGNS, tag); this.map[key] = e; e._names = []; }
  e._names.forEach(function(n){ if (e.removeAttribute) e.removeAttribute(n); else if (e.attrs) delete e.attrs[n]; });
  var st = "", names = [];
  for (var k in attrs){
    var v = attrs[k];
    if ((k === "fill" || k === "stroke") && String(v).indexOf("var(") >= 0) st += k + ":" + v + ";";
    else { e.setAttribute(k, v); names.push(k); }
  }
  if (st){ e.setAttribute("style", st); names.push("style"); }
  e._names = names;
  if (e.textContent) e.textContent = "";
  detach(e);
  parent.appendChild(e);
  this.used[key] = 1;
  return e;
};
Pool.prototype.end = function(){
  for (var key in this.map) if (!this.used[key]){ detach(this.map[key]); delete this.map[key]; }
};
function detach(e){
  var pe = e.parentElement;
  if (pe && (!pe.children || Array.prototype.indexOf.call(pe.children, e) >= 0)) pe.removeChild(e);
  if (e.parentElement === pe && pe && pe.children && Array.prototype.indexOf.call(pe.children, e) < 0) e.parentElement = null;
}

// ---- 幾何（論理の座標）
// solve(plan, override) → {pts: {名前: [x, y]}, src: {名前: {kind, deg?}}, objs: [...], issues: [...]}
function solve(pl, override){
  var pts = {}, src = {}, objs = [], ids = {}, issues = [], count = {};
  var need = function(n, where){
    if (typeof n === "string" && pts[n]) return pts[n];
    issues.push(where + ": \"" + n + "\" is not a point yet" + hint(n, Object.keys(pts)));
    return null;
  };
  Object.keys(pl.points).forEach(function(n){
    var p = pl.points[n];
    if (Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1])){ pts[n] = [+p[0], +p[1]]; src[n] = {kind: "free"}; }
    else issues.push("points." + n + " must be [x, y]");
    if (override && override[n] && Array.isArray(override[n])) pts[n] = override[n].slice();
  });
  var radius = function(r, where){
    if (typeof r === "number" && r > 0) return r;
    if (Array.isArray(r) && r.length === 2){ var a = need(r[0], where), b = need(r[1], where); if (a && b) return dist(a, b); return null; }
    issues.push(where + ": r must be a positive number or two point names [\"A\", \"B\"]");
    return null;
  };
  var reg = function(o, kind, i, op){
    count[kind] = (count[kind] || 0) + 1;
    o.id = typeof op.id === "string" && op.id ? op.id : kind + count[kind];
    o.op = i; o.tone = TONES[op.tone] ? op.tone : null;
    ids[o.id] = o; objs.push(o);
    return o;
  };
  pl.ops.forEach(function(op, i){
    var where = "ops[" + i + "]", kind = KINDS.filter(function(k){ return k in op; })[0];
    if (!kind){ issues.push(where + ": no kind (" + KINDS.join(", ") + ")"); return; }
    if (kind === "point"){
      var nm = op.point, p = null, s = {kind: "free"};
      if (Array.isArray(op.at)) p = [+op.at[0], +op.at[1]];
      else if (typeof op.on === "string"){
        var c = ids[op.on];
        if (!c || (c.type !== "circle" && c.type !== "arc")){ issues.push(where + ": on \"" + op.on + "\" is not a circle" + hint(op.on, Object.keys(ids))); return; }
        var deg = typeof op.deg === "number" ? op.deg : 90;
        if (override && typeof override[nm] === "number") deg = override[nm];
        p = [c.c[0] + c.r * Math.cos(deg * DEG), c.c[1] + c.r * Math.sin(deg * DEG)];
        s = {kind: "on", deg: typeof op.deg === "number" ? op.deg : 90, circle: op.on};
      } else { issues.push(where + ": a point needs \"at\": [x, y] or \"on\": a circle id with \"deg\""); return; }
      if (override && Array.isArray(override[nm])) p = override[nm].slice();
      pts[nm] = p; src[nm] = s;
      reg({type: "point", names: [nm], at: p, uses: [nm]}, "point", i, op);
      return;
    }
    if (kind === "seg" || kind === "line" || kind === "ray"){
      var a = need(op[kind][0], where), b = need(op[kind][1], where);
      if (!a || !b) return;
      if (dist(a, b) < EPS){ issues.push(where + ": \"" + op[kind][0] + "\" and \"" + op[kind][1] + "\" are the same point"); return; }
      reg({type: kind, a: a, b: b, uses: op[kind].slice()}, kind, i, op);
      return;
    }
    if (kind === "circle" || kind === "arc"){
      var cc = op[kind], c0 = need(cc.c, where);
      if (!c0) return;
      var r = cc.through ? (need(cc.through, where) ? dist(c0, pts[cc.through]) : null) : radius(cc.r, where);
      if (!r) return;
      var o = reg({type: kind, c: c0, r: r, uses: [cc.c].concat(cc.through ? [cc.through] : Array.isArray(cc.r) ? cc.r : []), from: cc.from, to: cc.to, hits: []}, kind, i, op);
      if (cc.through) o.start = Math.atan2(pts[cc.through][1] - c0[1], pts[cc.through][0] - c0[0]) / DEG;
      return;
    }
    if (kind === "meet"){
      var A = ids[op.meet[0]], B = ids[op.meet[1]];
      [op.meet[0], op.meet[1]].forEach(function(id, j){ if (!ids[id]) issues.push(where + ": \"" + id + "\" is not a line or circle id" + hint(id, Object.keys(ids))); });
      if (!A || !B) return;
      var names = Array.isArray(op.name) ? op.name : typeof op.name === "string" ? [op.name] : [];
      if (!names.length){ issues.push(where + ": meet needs \"name\": the name of the meeting point (or two names)"); return; }
      var hit = meet(A, B);
      if (hit.length < names.length){
        issues.push(where + ": \"" + A.id + "\" and \"" + B.id + "\" " + (hit.length ? "meet at one point only (they touch); give one name" : "do not meet") + meetHint(A, B));
        if (!hit.length) return;
      }
      var at = [];
      names.forEach(function(nm, j){ if (hit[j]){ pts[nm] = hit[j]; src[nm] = {kind: "meet"}; at.push(hit[j]); } });
      [A, B].forEach(function(x){ if (x.type === "arc" || x.type === "circle") at.forEach(function(p){ x.hits.push(Math.atan2(p[1] - x.c[1], p[0] - x.c[0]) / DEG); }); });
      reg({type: "meet", names: names.slice(0, at.length), at: at, uses: [].concat(A.uses, B.uses)}, "meet", i, op);
      return;
    }
    if (kind === "angle"){
      var pa = need(op.angle[0], where), pv = need(op.angle[1], where), pb = need(op.angle[2], where);
      if (!pa || !pv || !pb) return;
      reg({type: "angle", a: pa, v: pv, b: pb, show: op.show || "both", uses: op.angle.slice()}, "angle", i, op);
      return;
    }
    if (kind === "equal"){
      var items = [], ok = true, uses = [];
      op.equal.forEach(function(it){
        var q = it.map(function(n){ return need(n, where); });
        if (q.some(function(x){ return !x; }) || (q.length !== 2 && q.length !== 3)){ ok = false; return; }
        items.push(q); uses = uses.concat(it);
      });
      if (!ok){ issues.push(where + ": equal takes pairs [\"A\", \"B\"] (lengths) or triples [\"A\", \"O\", \"B\"] (angles)"); return; }
      reg({type: "equal", items: items, ticks: Math.max(1, Math.min(3, op.ticks || 1)), uses: uses}, "equal", i, op);
      return;
    }
    if (kind === "polygon"){
      var ps = op.polygon.map(function(n){ return need(n, where); });
      if (ps.some(function(x){ return !x; })) return;
      reg({type: "polygon", pts: ps, uses: op.polygon.slice()}, "polygon", i, op);
    }
  });
  // 弧の範囲：交点のまわり ±22°（重なれば 1 つに）。from・to があればそれ。どちらもなければ全周
  objs.forEach(function(o){
    if (o.type !== "arc") return;
    if (typeof o.from === "number" && typeof o.to === "number"){ o.pieces = [[o.from, o.to]]; return; }
    if (!o.hits.length){ o.pieces = [[0, 360]]; return; }
    var hs = o.hits.map(function(h){ return ((h % 360) + 360) % 360; }).sort(function(a, b){ return a - b; }), pcs = [];
    hs.forEach(function(h){ var p = [h - 22, h + 22], last = pcs[pcs.length - 1]; if (last && p[0] <= last[1] + 20) last[1] = p[1]; else pcs.push(p); });
    if (pcs.length > 1 && pcs[pcs.length - 1][1] - 360 + 20 >= pcs[0][0]){ pcs[0][0] = pcs[pcs.length - 1][0] - 360; pcs.pop(); }
    o.pieces = pcs;
  });
  return {pts: pts, src: src, objs: objs, issues: issues};
}
function dist(a, b){ return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function angleDeg(A, V, B){
  var ax = A[0] - V[0], ay = A[1] - V[1], bx = B[0] - V[0], by = B[1] - V[1];
  var c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
function lineOf(o){
  var d = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
  return {p: o.a, d: d, t0: o.type === "seg" || o.type === "ray" ? 0 : -Infinity, t1: o.type === "seg" ? 1 : Infinity};
}
function isLine(o){ return o.type === "seg" || o.type === "line" || o.type === "ray"; }
function isRound(o){ return o.type === "circle" || o.type === "arc"; }
// 交点：円と円は上の点（同じ高さなら左）が先、線と円は線の向きに先の順
function meet(A, B){
  var out = [], tol = 1e-9;
  if (isLine(A) && isLine(B)){
    var l = lineOf(A), m = lineOf(B), cr = l.d[0] * m.d[1] - l.d[1] * m.d[0];
    if (Math.abs(cr) < 1e-12) return out;
    var wx = m.p[0] - l.p[0], wy = m.p[1] - l.p[1], t = (wx * m.d[1] - wy * m.d[0]) / cr, s = (wx * l.d[1] - wy * l.d[0]) / cr;
    if (t >= l.t0 - tol && t <= l.t1 + tol && s >= m.t0 - tol && s <= m.t1 + tol) out.push([l.p[0] + t * l.d[0], l.p[1] + t * l.d[1]]);
    return out;
  }
  if (isLine(A) !== isLine(B)){
    var L0 = isLine(A) ? A : B, C = isLine(A) ? B : A, q = lineOf(L0);
    var fx = q.p[0] - C.c[0], fy = q.p[1] - C.c[1], a = q.d[0] * q.d[0] + q.d[1] * q.d[1], b = 2 * (fx * q.d[0] + fy * q.d[1]), c = fx * fx + fy * fy - C.r * C.r;
    var disc = b * b - 4 * a * c;
    if (disc < -1e-9 * a * C.r * C.r) return out;
    var sq = Math.sqrt(Math.max(0, disc)), ts = sq < 1e-12 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
    ts.forEach(function(t){ if (t >= q.t0 - tol && t <= q.t1 + tol) out.push([q.p[0] + t * q.d[0], q.p[1] + t * q.d[1]]); });
    return out;
  }
  var dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
  if (d < 1e-12 || d > A.r + B.r + 1e-9 || d < Math.abs(A.r - B.r) - 1e-9) return out;
  var aa = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - aa * aa));
  var mx = A.c[0] + aa * dx / d, my = A.c[1] + aa * dy / d;
  if (h < 1e-9) return [[mx, my]];
  var p1 = [mx - h * dy / d, my + h * dx / d], p2 = [mx + h * dy / d, my - h * dx / d];
  var first = Math.abs(p1[1] - p2[1]) > 1e-9 ? (p1[1] > p2[1]) : (p1[0] < p2[0]);
  return first ? [p1, p2] : [p2, p1];
}
// 交わらないときの手がかり：円と円は、中心の距離と半径
function meetHint(A, B){
  if (isRound(A) && isRound(B)){
    var d = dist(A.c, B.c);
    if (d > A.r + B.r) return " (the centres are " + fmt(d) + " apart; the radii add up to " + fmt(A.r + B.r) + ": make them larger than " + fmt(d / 2) + " each)";
    if (d < Math.abs(A.r - B.r)) return " (one circle is inside the other)";
  }
  if (isLine(A) && isLine(B)) return " (they are parallel, or a segment ends before they cross; use \"line\" to extend)";
  return "";
}
function fmt(v){ return String(Math.round(v * 100) / 100); }
function hint(n, names){
  if (!names.length) return "";
  var best = null, bd = 3;
  names.forEach(function(m){ var d = lev(String(n), m); if (d < bd){ bd = d; best = m; } });
  return best ? " (did you mean \"" + best + "\"?)" : " (known: " + names.slice(0, 8).join(", ") + ")";
}
function lev(a, b){
  var m = [], i, j;
  for (i = 0; i <= a.length; i++){ m[i] = [i]; }
  for (j = 0; j <= b.length; j++) m[0][j] = j;
  for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// ---- 描く
// e：その op の進み（0〜1。描き終わりは 1）、op：濃さ（先の op を薄く見せるときは --preview-opacity）
function drawObj(lay, o, S, L, e, op, fsz, labels, g){
  var D = lay.P, col = TONES[o.tone || (o.type === "arc" ? "muted" : "fg")], w = 3;
  var attrs = function(extra){ var a = {fill: "none", stroke: col, "stroke-width": w, "stroke-linecap": "round", opacity: (+op).toFixed(3)}; for (var k in extra) a[k] = extra[k]; return a; };
  if (o.type === "seg" || o.type === "line" || o.type === "ray"){
    var ends = clipLine(o, L.clip);
    if (!ends) return;
    var p0 = S(ends[0]), p1 = S(ends[1]), q = [base.lerp(p0[0], p1[0], e), base.lerp(p0[1], p1[1], e)];
    if (e <= 0) return;
    D.el("path", attrs({d: "M" + p0[0].toFixed(2) + "," + p0[1].toFixed(2) + "L" + q[0].toFixed(2) + "," + q[1].toFixed(2)}), lay.line);
    return;
  }
  if (o.type === "circle" || o.type === "arc"){
    var pcs = o.type === "circle" ? [[o.start || 0, (o.start || 0) + 360]] : o.pieces;
    pcs.forEach(function(pc){
      var a0 = pc[0], a1 = pc[0] + (pc[1] - pc[0]) * e;
      if (e <= 0) return;
      D.el("path", attrs({d: arcPath(o.c, o.r, a0, a1, S)}), lay.line);
    });
    return;
  }
  if (o.type === "angle"){
    var pv = S(o.v), pa = S(o.a), pb = S(o.b), deg = angleDeg(o.a, o.v, o.b), rr = deg < 30 ? 52 : 36;
    var ua = Math.atan2(pa[1] - pv[1], pa[0] - pv[0]), ub = Math.atan2(pb[1] - pv[1], pb[0] - pv[0]);
    var dd = ub - ua; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
    var mark = o.show !== "value", val = o.show !== "mark", acol = TONES[o.tone || "emph"];
    if (mark && e > 0){
      if (Math.abs(deg - 90) < 0.5){
        var sz = 20, c1 = [pv[0] + sz * Math.cos(ua), pv[1] + sz * Math.sin(ua)], c3 = [pv[0] + sz * Math.cos(ub), pv[1] + sz * Math.sin(ub)];
        var c2 = [c1[0] + c3[0] - pv[0], c1[1] + c3[1] - pv[1]];
        D.el("path", {d: "M" + c1.map(f2).join(",") + "L" + c2.map(f2).join(",") + "L" + c3.map(f2).join(","), fill: "none", stroke: acol, "stroke-width": 2.5, opacity: (op * Math.min(1, e * 2)).toFixed(3)}, lay.mark);
      } else {
        var steps = 24, pts = [];
        for (var i = 0; i <= steps; i++){ var u = ua + dd * e * i / steps; pts.push([pv[0] + rr * Math.cos(u), pv[1] + rr * Math.sin(u)]); }
        D.el("path", {d: "M" + pts.map(function(p){ return p.map(f2).join(","); }).join("L"), fill: "none", stroke: acol, "stroke-width": 2.5, opacity: (+op).toFixed(3)}, lay.mark);
      }
    }
    if (val){
      var tw0 = base.textWidth(Math.round(deg) + "°", fsz, {font: lay.text}), side = Math.min(Math.hypot(pa[0] - pv[0], pa[1] - pv[1]), Math.hypot(pb[0] - pv[0], pb[1] - pv[1]));
      var mid = ua + dd / 2, tr0 = Math.max(rr + fsz * 0.9, Math.min((tw0 / 2 + 8) / Math.max(0.05, Math.sin(deg * DEG / 2)), side * 0.55));
      // ほかの字に重なれば、二等分線の上で遠く（近く）へずらす
      var tr = tr0, cands = [tr0, tr0 * 1.3, tr0 * 1.6, tr0 * 0.8, tr0 * 1.9];
      if (labels) for (var ci = 0; ci < cands.length; ci++){
        var cx0 = pv[0] + cands[ci] * Math.cos(mid), cy0 = pv[1] + cands[ci] * Math.sin(mid) + fsz * 0.35;
        if (!hitsAny({x: cx0 - tw0 / 2, y: cy0 - fsz * 0.8, w: tw0, h: fsz}, labels)){ tr = cands[ci]; break; }
      }
      var tx = pv[0] + tr * Math.cos(mid), ty = pv[1] + tr * Math.sin(mid) + fsz * 0.35;
      var vop = op * base.prog(e, 0.5, 0.5);
      var txt = Math.round(deg) + "°";
      var t = D.el("text", {x: tx.toFixed(1), y: ty.toFixed(1), "font-size": fsz, fill: "var(--fg)", "text-anchor": "middle", opacity: vop.toFixed(3)}, lay.text);
      t.textContent = txt;
      if (labels && vop >= 0.999){ var tw = base.textWidth(txt, fsz, {font: lay.text}); labels.push({text: txt, x: tx - tw / 2, y: ty - fsz * 0.8, w: tw, h: fsz}); }
    }
    return;
  }
  if (o.type === "equal"){
    var tcol = TONES[o.tone || "fg"];
    o.items.forEach(function(it){
      if (it.length === 2){
        var a = S(it[0]), b = S(it[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = b[0] - a[0], uy = b[1] - a[1], d = Math.hypot(ux, uy) || 1;
        ux /= d; uy /= d;
        for (var j = 0; j < o.ticks; j++){
          var off = (j - (o.ticks - 1) / 2) * 7, cx = mx + ux * off, cy = my + uy * off;
          D.el("line", {x1: (cx - uy * 9).toFixed(2), y1: (cy + ux * 9).toFixed(2), x2: (cx + uy * 9).toFixed(2), y2: (cy - ux * 9).toFixed(2), stroke: tcol, "stroke-width": 2.5, opacity: (op * e).toFixed(3)}, lay.mark);
        }
      } else {
        var v = S(it[1]), pa2 = S(it[0]), pb2 = S(it[2]);
        var u0 = Math.atan2(pa2[1] - v[1], pa2[0] - v[0]), u1 = Math.atan2(pb2[1] - v[1], pb2[0] - v[0]), dd2 = u1 - u0;
        while (dd2 > Math.PI) dd2 -= 2 * Math.PI; while (dd2 < -Math.PI) dd2 += 2 * Math.PI;
        var r2 = 56, ap = [];
        for (var i2 = 0; i2 <= 16; i2++){ var uu = u0 + dd2 * i2 / 16; ap.push([v[0] + r2 * Math.cos(uu), v[1] + r2 * Math.sin(uu)]); }
        D.el("path", {d: "M" + ap.map(function(p){ return p.map(f2).join(","); }).join("L"), fill: "none", stroke: tcol, "stroke-width": 2.5, opacity: (op * e).toFixed(3)}, lay.mark);
        var um = u0 + dd2 / 2;
        for (var j2 = 0; j2 < o.ticks; j2++){
          var ua2 = um + (j2 - (o.ticks - 1) / 2) * 0.14;
          D.el("line", {x1: (v[0] + (r2 - 7) * Math.cos(ua2)).toFixed(2), y1: (v[1] + (r2 - 7) * Math.sin(ua2)).toFixed(2), x2: (v[0] + (r2 + 7) * Math.cos(ua2)).toFixed(2), y2: (v[1] + (r2 + 7) * Math.sin(ua2)).toFixed(2), stroke: tcol, "stroke-width": 2.5, opacity: (op * e).toFixed(3)}, lay.mark);
        }
      }
    });
    return;
  }
  if (o.type === "polygon"){
    var tone = o.tone || "accent2";
    var fill = tone === "emph" ? "var(--emph-tint, color-mix(in srgb, var(--emph) 18%, var(--bg)))" : "color-mix(in srgb, " + TONES[tone] + " 20%, var(--bg))";
    D.el("path", {d: "M" + o.pts.map(function(p){ return S(p).map(f2).join(","); }).join("L") + "Z", fill: fill, stroke: "none", opacity: (op * e).toFixed(3)}, lay.fill);
  }
}
function appear(o, e){ return o.type === "meet" ? base.prog(e, 0.6, 0.4) : e; }
function f2(v){ return v.toFixed(2); }
function arcPath(c, r, a0, a1, S){
  var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6)), pts = [];
  for (var i = 0; i <= n; i++){ var u = (a0 + (a1 - a0) * i / n) * DEG; pts.push(S([c[0] + r * Math.cos(u), c[1] + r * Math.sin(u)])); }
  return "M" + pts.map(function(p){ return p.map(f2).join(","); }).join("L");
}
// 直線・半直線を枠で切る（線分はそのまま）。直線は first 点の側の端から
function clipLine(o, box){
  if (o.type === "seg") return [o.a, o.b];
  var q = lineOf(o), t0 = q.t0, t1 = q.t1;
  [[q.d[0], q.p[0], box.x0, box.x1], [q.d[1], q.p[1], box.y0, box.y1]].forEach(function(z){
    if (Math.abs(z[0]) < 1e-12){ if (z[1] < z[2] || z[1] > z[3]){ t0 = 1; t1 = 0; } return; }
    var ta = (z[2] - z[1]) / z[0], tb = (z[3] - z[1]) / z[0];
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
  });
  if (!(t1 > t0)) return null;
  return [[q.p[0] + t0 * q.d[0], q.p[1] + t0 * q.d[1]], [q.p[0] + t1 * q.d[0], q.p[1] + t1 * q.d[1]]];
}
// 点の名前の向き：24 の向きのうち、名前の中心から線・円・ほかの点までがいちばん遠い向き（同じくらいなら、線のすきまの真ん中に近い向き）
function labelDir(nm, g, S, L, r, fsz){
  var p = g.pts[nm], sp = S(p), gapDir = gapMid(nm, g, S), best = gapDir, bestScore = -Infinity;
  for (var i = 0; i < 24; i++){
    var u = i * Math.PI / 12, cx = sp[0] + r * Math.cos(u), cy = sp[1] + r * Math.sin(u);
    var dmin = clearance(cx, cy, g, S, L, nm);
    if (cx < L.fx + fsz * 0.6 || cx > L.fx + L.fw - fsz * 0.6 || cy < L.fy + fsz * 0.6 || cy > L.fy + L.fh - fsz * 0.6) dmin -= 1000;
    var dev = Math.abs(Math.atan2(Math.sin(u - gapDir), Math.cos(u - gapDir)));
    var score = Math.min(dmin, fsz * 0.9) - dev * 2;
    if (score > bestScore + 1e-9){ bestScore = score; best = u; }
  }
  return best;
}
// 画面の点 (x, y) から、描いた線・円・弧・ほかの点までのいちばん近い距離
function clearance(x, y, g, S, L, self){
  var d = Infinity;
  var seg = function(a, b){
    var dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy, t = ll ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / ll)) : 0;
    d = Math.min(d, Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y));
  };
  g.objs.forEach(function(o){
    if (isLine(o)){ var e = clipLine(o, L.clip); if (e) seg(S(e[0]), S(e[1])); }
    else if (isRound(o)){
      var pcs = o.type === "circle" ? [[0, 360]] : o.pieces;
      pcs.forEach(function(pc){
        var n = Math.max(2, Math.ceil(Math.abs(pc[1] - pc[0]) / 6)), prev = null;
        for (var i = 0; i <= n; i++){ var u = (pc[0] + (pc[1] - pc[0]) * i / n) * DEG, q = S([o.c[0] + o.r * Math.cos(u), o.c[1] + o.r * Math.sin(u)]); if (prev) seg(prev, q); prev = q; }
      });
    }
  });
  Object.keys(g.pts).forEach(function(n){ if (n !== self){ var q = S(g.pts[n]); d = Math.min(d, Math.hypot(q[0] - x, q[1] - y)); } });
  return d;
}
function gapMid(nm, g, S){
  var p = g.pts[nm], sp = S(p), dirs = [];
  var push = function(q){ var s = S(q), dx = s[0] - sp[0], dy = s[1] - sp[1]; if (Math.hypot(dx, dy) > 1e-6) dirs.push(Math.atan2(dy, dx)); };
  g.objs.forEach(function(o){
    if (isLine(o)){
      var q = lineOf(o), dd = q.d[0] * q.d[0] + q.d[1] * q.d[1], t = ((p[0] - q.p[0]) * q.d[0] + (p[1] - q.p[1]) * q.d[1]) / dd;
      var on = Math.hypot(q.p[0] + t * q.d[0] - p[0], q.p[1] + t * q.d[1] - p[1]) < 1e-6 * Math.sqrt(dd) + 1e-9 && t >= q.t0 - 1e-6 && t <= q.t1 + 1e-6;
      if (!on) return;
      if (t < q.t1 - 1e-6) push([p[0] + q.d[0], p[1] + q.d[1]]);
      if (t > q.t0 + 1e-6) push([p[0] - q.d[0], p[1] - q.d[1]]);
    } else if (isRound(o)){
      var dr = dist(p, o.c);
      if (Math.abs(dr - o.r) < 1e-6 * o.r){ var ux = (p[0] - o.c[0]) / dr, uy = (p[1] - o.c[1]) / dr; push([p[0] - uy, p[1] + ux]); push([p[0] + uy, p[1] - ux]); push(o.c); }
      else if (dr < 1e-9){ /* 中心：何もしない */ }
    } else if (o.type === "angle" && o.v === p){ push([(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]); }
  });
  if (!dirs.length) return -Math.PI / 4;
  dirs.sort(function(a, b){ return a - b; });
  var best = 0, bestGap = -1;
  for (var i = 0; i < dirs.length; i++){
    var a = dirs[i], b = i + 1 < dirs.length ? dirs[i + 1] : dirs[0] + 2 * Math.PI, gap = b - a;
    if (gap > bestGap + 1e-9){ bestGap = gap; best = a + gap / 2; }
  }
  return best;
}
function hitsAny(a, boxes){
  return boxes.some(function(b){ return a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2; });
}
function overlapPair(boxes){
  for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++){
    var a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) return [a.text, b.text];
  }
  return null;
}
// 字の折り返し：日本語は字ごと、英語は語ごと
function wrap(s, fs, width, font){
  if (base.textWidth(s, fs, {font: font}) <= width) return [s];
  var out = [], line = "", toks = /[　-鿿]/.test(s) ? s.split("") : s.split(/(\s+)/);
  toks.forEach(function(tk){
    var next = line + tk;
    if (line && base.textWidth(next, fs, {font: font}) > width){ out.push(line.replace(/\s+$/, "")); line = tk.replace(/^\s+/, ""); }
    else line = next;
  });
  if (line) out.push(line);
  return out;
}
return Part;
});

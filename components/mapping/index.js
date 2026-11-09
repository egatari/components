// m-mapping: outcomes → numerical values → a probability distribution.
egatariParts.define({name: "mapping", version: "2.0.0", requires: {base: "1.1.0"}, element: "m-mapping"}, function(deps){
"use strict";
var base = deps.base;
var TEXT = {
  ja: {outcomes: "起こりうる結果", values: function(n){ return n + " の値"; }, count: function(n){ return n + " 通り"; }, total: "確率の合計 ", variable: "確率変数 ", each: function(t){ return "どれも " + t; }},
  en: {outcomes: "Outcomes", values: function(n){ return "Value of " + n; }, count: function(n){ return n + (n === 1 ? " outcome" : " outcomes"); }, total: "Total ", variable: "Random variable ", each: function(t){ return "each " + t; }}
};
function set(e, a, v){ v = String(v); if (e.getAttribute(a) !== v) e.setAttribute(a, v); }
function gcd(a, b){ while (b){ var r = a % b; a = b; b = r; } return a; }
// Only use a fraction when it represents the supplied value to the sum tolerance.
function fraction(v){
  for (var d = 1; d <= 10000; d++){
    var n = Math.round(v * d);
    if (Number.isSafeInteger(n) && Math.abs(n / d - v) <= 1e-9){ var g = gcd(Math.abs(n), d); return d / g === 1 ? String(n / g) : n / g + "/" + d / g; }
  }
  return null;
}
return class extends base.MotionElement {
  static partName = "mapping";
  static preview = "none";
  static steps = 4;
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["outcomes"], properties: {
      outcomes: {type: "array", minItems: 2, maxItems: 12, items: {type: "object", additionalProperties: false, required: ["label", "x"], properties: {
        label: {type: "string"}, x: {type: "number"}, p: {type: "number"}
      }}},
      name: {type: "string"}, unit: {type: "string"}, fractions: {type: "boolean"}
    }},
    example: {outcomes: [{label: "表表", x: 2}, {label: "表裏", x: 1}, {label: "裏表", x: 1}, {label: "裏裏", x: 0}], name: "X", unit: "", fractions: true}
  };
  static props = {
    dur: {type: "number", default: 1, doc: "各段階の動きの秒数（矢印は stagger のずれを足す）"},
    stagger: {type: "number", default: 0.15, doc: "段階 2 の矢印ごとの開始のずれ（秒。0 以上）"},
    digits: {type: "number", default: 2, doc: "分数でない確率の小数桁（0〜10 の整数）"},
    size: {type: "number", default: 0, doc: "文字の大きさ（px。0 は既定の 26、指定時は 24 以上）"}
  };
  plan(){
    if (this._plan) return this._plan;
    var d = this.data, given = d.outcomes.filter(function(o){ return o.p !== undefined; }).length;
    var p = {name: d.name === undefined ? "X" : d.name, unit: d.unit || "", notes: [], groups: []};
    p.outcomes = d.outcomes.map(function(o){ return {label: o.label, x: o.x, p: given ? (o.p === undefined ? 0 : o.p) : 1 / d.outcomes.length}; });
    p.total = p.outcomes.reduce(function(s, o){ return s + o.p; }, 0);
    p.validTotal = Math.abs(p.total - 1) <= 1e-9;
    if (given && given !== d.outcomes.length) p.notes.push("mixed p: missing probabilities are treated as 0");
    if (!p.validTotal) p.notes.push("probability sum is " + p.total + ", expected 1 (not normalised)");
    if (p.outcomes.some(function(o){ return o.p < 0 || o.p > 1; })) p.notes.push("p must be between 0 and 1; drawing the supplied values");
    p.equal = p.validTotal && p.outcomes.every(function(o){ return Math.abs(o.p - 1 / d.outcomes.length) <= 1e-9; });
    p.fractions = d.fractions === undefined ? p.equal : d.fractions;
    // どれも同じ確率なら、結果ごとには書かず、見出しに「どれも 1/n」と 1 度だけ書く
    p.showP = !p.equal && (given > 0 || p.fractions);
    var values = Array.from(new Set(p.outcomes.map(function(o){ return o.x; }))).sort(function(a, b){ return a - b; });
    p.groups = values.map(function(x, j){
      var members = p.outcomes.filter(function(o){ return o.x === x; });
      var g = {x: x, count: members.length, p: members.reduce(function(s, o){ return s + o.p; }, 0), tone: "series-" + (j % 4 + 1)};
      members.forEach(function(o, i){ o.group = j; o.slot = i; });
      return g;
    });
    return (this._plan = p);
  }
  duration(k){
    var P = this.props, dur = Number.isFinite(P.dur) && P.dur > 0 ? P.dur : 1;
    var stagger = Number.isFinite(P.stagger) && P.stagger >= 0 ? P.stagger : 0.15;
    return k >= 1 && k <= 4 ? dur + (k === 2 ? (this.plan().outcomes.length - 1) * stagger : 0) : 0;
  }
  fmt(v){
    var f = this.plan().fractions && fraction(v);
    return f || v.toFixed(this.props.digits);
  }
  value(x){ return String(x) + this.plan().unit; }
  accessible(){
    var p = this.plan(), self = this, sep = this.T === TEXT.ja ? "、" : ", ";
    return this.T.variable + p.name + ": " + p.outcomes.map(function(o){ return o.label + "→" + self.value(o.x); }).join(sep) + ". " +
      p.groups.map(function(g){ return "P(" + p.name + "=" + self.value(g.x) + ")=" + self.fmt(g.p); }).join(", ") + ". " + this.totalText();
  }
  totalText(){
    var p = this.plan();
    // Do not round an invalid total to 1 just because digits is small.
    return this.T.total + (p.validTotal ? "1" : String(p.total));
  }
  label(g, x, y, s, fs, anchor){
    var e = base.el("text", {x: x, y: y, "font-size": fs || this.fs, "text-anchor": anchor || "start", fill: "var(--fg)"}, g);
    e.textContent = s; return e;
  }
  mount(ctx){
    var P = this.props, self = this, p = this.plan();
    [["dur", 1, function(v){ return Number.isFinite(v) && v > 0; }], ["stagger", 0.15, function(v){ return Number.isFinite(v) && v >= 0; }],
      ["digits", 2, function(v){ return Number.isInteger(v) && v >= 0 && v <= 10; }], ["size", 0, function(v){ return v === 0 || Number.isFinite(v) && v >= 24; }]].forEach(function(a){
      if (!a[2](P[a[0]])){ ctx.report("attr", "[mapping] invalid " + a[0] + "; using " + a[1]); P[a[0]] = a[1]; }
    });
    p.notes.forEach(function(n){ ctx.report("data", "[mapping] " + n); });
    var lang = this.closest("[lang]");
    this.T = /^ja\b/i.test((lang && lang.getAttribute("lang")) || ctx.lang || "") ? TEXT.ja : TEXT.en;
    this.fs = P.size || 26;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    this.setAttribute("role", "img");
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", this.accessible());
    var W = this.clientWidth, H = this.clientHeight, fs = this.fs, small = Math.max(24, fs - 2);
    var width = function(s, f){ return base.textWidth(s, f || fs, {font: self}) + 8; };
    var max = function(a){ return Math.max.apply(null, a.concat([0])); };
    var omega = "Ω  " + this.T.outcomes + (p.equal ? "（" + this.T.each(this.fmt(p.outcomes[0].p)) + "）" : "");
    if (p.equal && this.T === TEXT.en) omega = "Ω  " + this.T.outcomes + " (" + this.T.each(this.fmt(p.outcomes[0].p)) + ")";
    var cw = Math.max(width(omega), max(p.outcomes.map(function(o){ return Math.max(width(o.label), p.showP ? width(self.fmt(o.p), small) : 0); })) + 24);
    var vw = max(p.groups.map(function(g){ return width(self.value(g.x)); }));
    var sw = max(p.groups.map(function(g){ return Math.max(width(self.T.count(g.count), small), width("= " + self.fmt(g.p), small)); }));
    var bw = vw + sw + 44, bx = Math.max(cw + 160, W * 0.43), barX = bx + bw + 30;
    var probW = max(p.groups.map(function(g){ return width(self.fmt(g.p), small); }));
    var negativePad = p.groups.some(function(g){ return g.p < 0; }) ? probW + 12 : 0;
    var barW = Math.max(0, W - barX - negativePad - probW - 24);
    // Source Sans 3's SVG text box extends 1.024em above and 0.4em below the baseline.
    // Reserve those full boxes, a 4px line gap and space inside/outside the chip frame.
    var rowMin = p.showP ? (fs + small) * 1.43 + 12 : Math.max(40, fs * 1.43 + 12);
    var boxH = Math.max(40, (fs + small) * 1.43 + 12), top = fs * 1.43 + 16, bottom = H - fs * 1.43 - 8;
    var row = Math.max(rowMin, (bottom - top) / p.outcomes.length);
    if (bottom - top < p.outcomes.length * rowMin || barW < 100 || width(this.T.values(p.name)) > bw || width("P(" + p.name + " = x)") > barW + probW || width(this.totalText()) > W - barX){
      ctx.report("size", "[mapping] labels or outcome rows do not fit; enlarge the element (each row needs at least " + Math.ceil(rowMin) + "px) or shorten labels");
    }
    this.svg = base.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block"}, this);
    this.outcomeLayer = base.el("g", {opacity: 0}, this.svg);
    this.label(this.outcomeLayer, 8, fs + 3, omega);
    this.valueLayer = base.el("g", {opacity: 0}, this.svg);
    this.label(this.valueLayer, bx, fs + 3, this.T.values(p.name));
    var first = top + boxH / 2, last = Math.max(first, bottom - boxH / 2);
    // True numerical axis, increasing upwards. Scale first to avoid overflow of max-min.
    var scale = Math.max(1, max(p.groups.map(function(g){ return Math.abs(g.x); }))), lo = p.groups[0].x / scale, hi = p.groups[p.groups.length - 1].x / scale;
    var ys = p.groups.map(function(g){ return hi === lo ? (first + last) / 2 : base.lerp(last, first, (g.x / scale - lo) / (hi - lo)); });
    if (ys.some(function(y, i){ return i && ys[i - 1] - y < boxH + 8; })) ctx.report("size", "[mapping] value boxes are too close on the numerical axis; enlarge the element or use fewer/less closely spaced values");
    // 値の箱は数の大きさの順に上へ（大きい値が上）。縦の軸の線は描かない（矢印の先と紛れるため）
    this.distribution = base.el("g", {opacity: 0}, this.svg);
    this.label(this.distribution, barX, fs + 3, "P(" + p.name + " = x)");
    this.label(this.distribution, barX, H - fs * 0.4 - 2, this.totalText());
    var minP = Math.min.apply(null, p.groups.map(function(g){ return g.p; }).concat([0]));
    var maxP = Math.max.apply(null, p.groups.map(function(g){ return g.p; }).concat([1]));
    var zero = barX + negativePad + barW * (-minP / (maxP - minP));
    this.chips = []; this.boxes = []; this.arrows = []; this.bars = [];
    p.groups.forEach(function(g, j){
      var y = ys[j], box = base.el("g", {}, self.valueLayer);
      var frame = base.el("rect", {class: "box", x: bx, y: y - boxH / 2, width: bw, height: boxH, rx: 10, fill: "none", stroke: "var(--muted)", "stroke-width": 2}, box);
      self.label(box, bx + 12, y + fs * 0.312, self.value(g.x));
      var summary = base.el("g", {opacity: 0}, box);
      var summaryY = y - boxH / 2 + 6 + small * 1.024;
      self.label(summary, bx + vw + 28, summaryY, self.T.count(g.count), small);
      self.label(summary, bx + vw + 28, summaryY + small * 1.424 + 4, "= " + self.fmt(g.p), small);
      self.boxes.push({frame: frame, summary: summary, tone: g.tone});
      var end = zero + barW * (g.p / (maxP - minP));
      base.el("line", {x1: zero, x2: zero, y1: y - 20, y2: y + 20, stroke: "var(--muted)", "stroke-width": 2}, self.distribution);
      var bar = base.el("rect", {x: zero, y: y - 14, width: 0, height: 28, fill: "var(--" + g.tone + ")"}, self.distribution);
      var label = self.label(self.distribution, end + (g.p < 0 ? -10 : 10), y + small * 0.3, self.fmt(g.p), small, g.p < 0 ? "end" : "start");
      self.bars.push({bar: bar, label: label, zero: zero, end: end});
    });
    p.outcomes.forEach(function(o, i){
      var y = top + row * (i + 0.5), g = p.groups[o.group];
      var chip = base.el("g", {}, self.outcomeLayer);
      var frame = base.el("rect", {class: "box", x: 8, y: y - rowMin / 2 + 2, width: cw - 8, height: rowMin - 4, rx: 10, fill: "none", stroke: "var(--term)", "stroke-width": 2}, chip);
      var labelY = p.showP ? y - rowMin / 2 + 4 + fs * 1.024 : y + fs * 0.312;
      self.label(chip, cw / 2 + 4, labelY, o.label, fs, "middle");
      if (p.showP) self.label(chip, cw / 2 + 4, labelY + fs * 0.4 + small * 1.024 + 4, self.fmt(o.p), small, "middle");
      self.chips.push({frame: frame, tone: g.tone});
      var path = base.el("path", {fill: "none", stroke: "var(--muted)", "stroke-width": 2, pathLength: 1, "stroke-dasharray": "1", opacity: 0}, self.svg);
      var head = base.el("path", {fill: "none", stroke: "var(--muted)", "stroke-width": 2, opacity: 0}, self.svg);
      self.arrows.push({path: path, head: head, x: cw + 4, y: y, endX: bx - 5, endY: ys[o.group], spread: (o.slot - (g.count - 1) / 2) * Math.min(6, (boxH - 24) / g.count), tone: g.tone});
    });
  }
  render(k, t){
    if (!this.svg) return;
    var P = this.props;
    var progress = function(step, offset){ return k > step ? 1 : k < step ? 0 : base.prog(t, offset || 0, P.dur); };
    var bundle = progress(3), bars = progress(4);
    set(this.outcomeLayer, "opacity", progress(1)); set(this.valueLayer, "opacity", progress(2)); set(this.distribution, "opacity", bars);
    this.chips.forEach(function(c){ set(c.frame, "style", "stroke:var(--" + (bundle > 0 ? c.tone : "term") + ")"); });
    this.boxes.forEach(function(b){ set(b.frame, "style", "stroke:var(--" + (bundle > 0 ? b.tone : "muted") + ")"); set(b.summary, "opacity", bundle); });
    this.arrows.forEach(function(a, i){
      var e = progress(2, i * P.stagger), endY = a.endY + a.spread * bundle;
      var bend = base.lerp((a.endX - a.x) * 0.35, 32, bundle);
      set(a.path, "d", "M" + a.x + "," + a.y + "C" + (a.x + bend) + "," + a.y + " " + (a.endX - bend) + "," + endY + " " + a.endX + "," + endY);
      set(a.path, "stroke-dashoffset", 1 - e); set(a.path, "opacity", e > 0 ? 1 : 0);
      set(a.head, "d", "M" + (a.endX - 8) + "," + (endY - 5) + "L" + a.endX + "," + endY + "l-8,5"); set(a.head, "opacity", e === 1 ? 1 : 0);
      [a.path, a.head].forEach(function(n){ set(n, "style", "stroke:var(--" + (bundle > 0 ? a.tone : "muted") + ")"); });
    });
    this.bars.forEach(function(b){ var end = base.lerp(b.zero, b.end, bars); set(b.bar, "x", Math.min(b.zero, end)); set(b.bar, "width", Math.abs(end - b.zero)); set(b.label, "opacity", bars === 1 ? 1 : 0); });
  }
};
});

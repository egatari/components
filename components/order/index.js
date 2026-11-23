// m-order: an ordering question. The viewer puts the cards in order (drag, or the keyboard); the answer step moves them
// into the right order, marks the cards the viewer had in the right place, and shows the note.
// <m-order style="height:440px"><script type="application/json">
//   {"question": "古い順に並べよう", "items": ["縄文時代", "弥生時代", "古墳時代", "飛鳥時代"], "note": "…"}
// </script></m-order>
// items are written in the RIGHT order. The cards start in `start` (indices into items, a permutation that is not the right
// order), else in a fixed order with no card in its right place (items rotated by one): no randomness.
// Steps: 0 = the question and the cards (the author's start order). 1 = the answer: the cards move to the right order,
//   ✓ on the cards the viewer had in the right place, the others say where the viewer had them; the result and the note.
// Viewer input (spec §8.4 "Viewer input"): the viewer's order lives outside (i, k, t) and persists while the viewer stays
//   on the slide (forward and back); only ctx.entered (entering from another slide, a jump) restores the start order.
//   ctx.reset only drops focus (and a card held from the keyboard). At the answer step the cards cannot be moved.
//   Pointer: drag a card. Keyboard: Tab to a card, Space picks it up / drops it, ↑ ↓ move it while held, Esc puts it back
//   where it was picked up. Moves are announced in an aria-live region. Keys used on a card do not reach the slide.
// Answers (spec §8.4 ctx.answer): arriving at step 1 (k from < 1 to ≥ 1, not a re-render of the same step) after the viewer
//   moved a card calls ctx.answer("q", correct, value) once, where correct means the whole order is right and value is the
//   item indices (into items, i.e. the right order) in the viewer's order joined by "," ("2,0,1,3"). Again after going back
//   and arriving again. Nothing when the viewer moved nothing, in video, while printing, or without ctx.answer.
// Video (ctx.mode "video"): no controls; step 1 moves the cards into the right order, no marks. Print: the author's state
//   (no marks), controls hidden by @media print; the screen keeps the viewer's order afterwards.
// Vertical slides: the part stays in horizontal writing; when the element is too small it reports "layout".
egatariParts.define({name: "order", version: "2.0.0", requires: {base: "1.3.0"}, element: "m-order"}, function(deps){
"use strict";
var base = deps.base;
// UI text (ctx.lang: the document's language). labels.correct in the child JSON overrides `correct`
var TEXT = {
  ja: {
    correct: "✓ 正解", wrong: "✗ 不正解",
    card: function(label, p, n){ return label + "、" + p + " 番目（" + n + " 枚中）"; },
    hold: "Space で持ち上げ、↑ ↓ で動かし、Space で置く。Esc で元に戻す",
    picked: function(label, p){ return label + "を持ち上げました（" + p + " 番目）。↑ ↓ で動かし、Space で置きます"; },
    moved: function(p){ return p + " 番目に動かしました"; },
    dropped: function(label, p){ return label + "を " + p + " 番目に置きました"; },
    back: function(p){ return "元の " + p + " 番目に戻しました"; },
    yours: function(p){ return "あなた：" + p + " 番目"; },
    announce: function(mark, labels, note){ return (mark ? mark + "。" : "") + "正しい順：" + labels.join("、") + (note ? "。" + note : ""); },
  },
  en: {
    correct: "✓ Correct", wrong: "✗ Incorrect",
    card: function(label, p, n){ return label + ", position " + p + " of " + n; },
    hold: "Space picks up, ↑ ↓ move, Space drops, Esc puts it back",
    picked: function(label, p){ return "Picked up " + label + " (position " + p + "). ↑ ↓ to move, Space to drop"; },
    moved: function(p){ return "Moved to position " + p; },
    dropped: function(label, p){ return "Dropped " + label + " at position " + p; },
    back: function(p){ return "Returned to position " + p; },
    yours: function(p){ return "yours: " + p; },
    announce: function(mark, labels, note){ return (mark ? mark + ". " : "") + "Right order: " + labels.join(", ") + (note ? ". " + note : ""); },
  }
};
var SEQ = 0;   // numbers the hidden help texts (aria-describedby ids), in mount order
var CSS_ID = "order-2-0-0-css";   // the style element this part writes, named with its name and version (spec §6.1 Identifiers)
var CSS = [
  "m-order .od-say,m-order .od-help{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  "m-order .od-card{position:absolute;left:0;box-sizing:border-box;margin:0;padding:0;background:transparent;border:0;border-radius:10px;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}",
  "m-order .od-card:focus-visible{outline:3px solid var(--emph);outline-offset:3px}",
  "m-order .od-card[aria-disabled=true]{cursor:default}",
  "@media print{m-order .od-card,m-order .od-grip{display:none!important}}",
].join("\n");
function tone(t){ return /^(term|emph|muted|accent2|fg|series-[1-4])$/.test(t || "") ? "var(--" + t + ")" : "var(--term)"; }
// Greedy line breaking by estimated width (first line `first` wide, the others `max`): Latin words stay whole, other
// characters break anywhere, and 、。）」 never start a line
function wrap(s, size, max, est, first){
  var toks = String(s).match(/[!-ɏ]+[ ]*|[ ]+|[\s\S]/gu) || [], lines = [], cur = "";
  toks.forEach(function(tk){
    var m = lines.length ? max : first === undefined ? max : first;
    if (cur && est((cur + tk).replace(/ +$/, ""), size) > m && !/^[、。，．）」』,.)]/.test(tk)){ lines.push(cur.replace(/ +$/, "")); cur = tk.replace(/^ +/, ""); }
    else cur += tk;
  });
  if (cur.trim()) lines.push(cur.replace(/ +$/, ""));
  return lines;
}
return class extends base.MotionElement {
  static partName = "order";   // the registry name (define meta name), for report prefixes
  static interactive = true;   // the viewer can operate it (docs/conventions.md §6)
  static viewerInput = true;   // it takes viewer input (spec §8.4)
  static preview = "none";     // the later step is the answer: nothing ahead is shown under preview (docs/conventions.md §1.2)
  static questions = ["q"];    // the question id it answers (spec §8.4 questions, §9.2)
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["items"], properties: {
      question: {type: "string"},
      items: {type: "array", minItems: 2, maxItems: 8, items: {type: ["string", "object"], additionalProperties: false, required: ["label"], properties: {
        label: {type: "string"}, tone: {type: "string"}}}},
      start: {type: "array", items: {type: "integer"}},
      note: {type: "string"},
      labels: {type: "object", additionalProperties: false, properties: {correct: {type: "string"}}}}},
    example: {question: "古い順に並べよう", items: ["縄文時代", "弥生時代", "古墳時代", "飛鳥時代"], note: "稲作が広まって弥生時代になる"},
    note: {en: "items are written in the right order (2–8; a string or {\"label\", \"tone\"}); start (optional) is the starting order as indices into items, not the right order",
           ja: "items は正しい順に書く（2〜8 個。字か {\"label\", \"tone\"}）。start（省略可）は始めの並びを items の番号で書く（正しい順はだめ）"},
  };
  static props = {
    size: {type: "number", default: 30, doc: "字の大きさ（px、24 以上）"},
  };
  get S(){ return Math.max(24, Math.round(this.props.size) || 30); }
  mount(ctx){
    var self = this, d = this.data || {}, n = d.items.length;
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    this.items = d.items.map(function(x){ return typeof x === "string" ? {label: x} : x; });
    // the start order: `start` when it is a permutation other than the right order, else the items rotated by one
    var def = Array.from({length: n}, function(_, i){ return (i + 1) % n; }), st = def;
    if (d.start !== undefined){
      var s = d.start, perm = s.length === n && s.every(function(v){ return Number.isInteger(v) && v >= 0 && v < n; }) && new Set(s).size === n;
      if (!perm) ctx.report("data", "[order] start " + JSON.stringify(s) + " must list each index 0–" + (n - 1) + " once; the cards start rotated by one");
      else if (s.every(function(v, i){ return v === i; })) ctx.report("data", "[order] start is already the right order; the cards start rotated by one");
      else st = s.slice();
    }
    this.start = st;
    this.video = ctx.mode === "video";
    this._answer = typeof ctx.answer === "function" ? ctx.answer : null;
    this._order = null; this._moved = false; this._held = null; this._drag = null;
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    if (!document.getElementById(CSS_ID)){ var css = document.createElement("style"); css.id = CSS_ID; css.textContent = CSS; document.head.appendChild(css); }
    this.say = document.createElement("div"); this.say.className = "od-say"; this.say.setAttribute("role", "status"); this.say.setAttribute("aria-live", "polite");
    this.appendChild(this.say);
    if (d.question) this.setAttribute("aria-label", d.question);
    if (!this.video){
      this.help = document.createElement("div"); this.help.className = "od-help"; this.help.id = "od-help-" + (++SEQ);
      this.help.textContent = this.T.hold;
      this.appendChild(this.help);
    }
    var view = document.defaultView;
    if (!this.video && view){
      view.addEventListener("beforeprint", function(){ self._printing = true; self.redraw(); });
      view.addEventListener("afterprint", function(){ self._printing = false; self.redraw(); });
    }
    this.place(ctx);
  }
  layout(ctx){
    var W = this.clientWidth, H = this.clientHeight;
    if (!W || !H || (W === this.g.W && H === this.g.H)) return;
    var a = document.activeElement, keep = -1;
    if (a && this.cards) this.cards.forEach(function(c, j){ if (c.btn === a) keep = j; });
    this.place(ctx);
    this.redraw();
    if (keep >= 0 && this.cards[keep].btn) this.cards[keep].btn.focus({preventScroll: true});
  }
  // The drawing and the controls for this size. The viewer's order is kept
  place(ctx){
    var self = this, D = base, d = this.data || {}, T = this.T, S = this.S, n = this.items.length;
    var W = this.clientWidth, H = this.clientHeight;
    if (this.svg){ this.svg.remove(); this.cards.forEach(function(c){ if (c.btn) c.btn.remove(); }); }
    this._held = null; this._drag = null;
    var est = function(s, size, bold){ return D.textWidth(s, size, {font: self, mark: true}) * (bold ? 1.04 : 1); };
    var vertical = false;
    try { var pe = this.parentElement; vertical = !!pe && /^vertical/.test(getComputedStyle(pe).writingMode || ""); } catch (x) {}
    var where = vertical ? " (the slide is set vertically; the part stays horizontal)" : "";
    var ok = W > 0 && H > 0;
    // the question
    var qLines = d.question ? wrap(d.question, S, Math.max(1, W - 4), function(s, z){ return est(s, z, true); }) : [];
    var qLH = Math.round(S * 1.32), qh = qLines.length ? qLines.length * qLH + Math.round(S * 0.4) : 0;
    // the result mark and the note under the cards (the note's first line starts after the mark)
    var correctLabel = (d.labels && d.labels.correct) || T.correct;
    var markW = Math.max(est(correctLabel, S, true), est(T.wrong, S, true)) + 14;
    var NS = Math.max(24, Math.round(S * 0.85)), nLH = Math.round(Math.max(NS, S) * 1.35);
    var nLines = d.note ? wrap(d.note, NS, Math.max(1, W - 4), est, Math.max(1, W - 4 - markW)) : [];
    var bh = Math.max(1, nLines.length) * nLH + Math.round(S * 0.25);
    // the cards: position numbers, the card, and beside it ✓ or where the viewer had it
    var numW = Math.ceil(est(String(n), S, true)) + Math.round(S * 0.6);
    var YS = 24, sideW = Math.ceil(Math.max(est("✓", S, true), est(T.yours(n), YS))) + 20;
    var cx = numW, cw = W - numW - sideW;
    var room = H - qh - bh, pitch = Math.min(Math.round(S * 2.3), room / n), gap = Math.max(8, Math.round(pitch * 0.16)), ch = pitch - gap;
    if (ok && ch < S + 16) ctx.report("layout", "[order] " + n + " cards get " + Math.max(0, Math.floor(ch)) + " px each; they need " + (S + 16) + " (the element is " + H + " px high" + where + "; make it taller, use fewer items or a smaller size)");
    ch = Math.max(0, ch);
    var gripW = this.video ? 0 : Math.ceil(est("≡", S)) + 10;
    // cards as wide as the longest label needs (at least 45 % of the element), never wider than the room
    var longest = this.items.reduce(function(m, it){ return Math.max(m, est(it.label, S)); }, 0);
    cw = Math.max(0, Math.min(cw, Math.max(Math.ceil(longest) + 18 + gripW + 28, Math.round(W * 0.45))));
    var LS = S, lw = cw - 18 - gripW - 14;
    while (LS > 24 && longest * LS / S > lw) LS--;
    if (ok && longest * LS / S > lw) ctx.report("layout", "[order] the element is " + W + " px wide; the longest card needs " + Math.ceil(longest * 24 / S + 32 + gripW + numW + sideW) + " px at 24 px" + where + " (make it wider or shorten the items)");
    this.g = {W: W, H: H, y0: qh, pitch: pitch, ch: ch, cx: cx, cw: cw};
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + Math.max(0, W) + " " + Math.max(0, H), width: Math.max(0, W), height: Math.max(0, H), style: "display:block;overflow:visible"});
    this.insertBefore(svg, this.say);
    qLines.forEach(function(s, i){ D.mtext(svg, 0, Math.round(S * 1.0) + i * qLH, s, {"font-size": S, "font-weight": 700}); });
    // position numbers (they stay; the cards move)
    for (var p = 0; p < n; p++){
      var nt = D.el("text", {x: numW - Math.round(S * 0.45), y: (this.slot(p) + ch / 2 + S * 0.35).toFixed(1), "font-size": S, "font-weight": 700, "text-anchor": "end", fill: "var(--muted)"}, svg);
      nt.textContent = String(p + 1);
    }
    var mid = ch / 2 + LS * 0.35;
    this.cards = this.items.map(function(it, j){
      var g = D.el("g", {}, svg), col = tone(it.tone);
      var c = {g: g,
        rect: D.el("rect", {x: cx + 1.5, y: 1.5, width: Math.max(0, cw - 3), height: Math.max(0, ch - 3), rx: 10, fill: "var(--bg)", stroke: col, "stroke-width": 3}, g),
        grip: gripW ? D.el("text", {x: cx + 14, y: (ch / 2 + S * 0.33).toFixed(1), "font-size": S, fill: "var(--muted)", "class": "od-grip"}, g) : null,
        label: D.mtext(g, cx + 18 + gripW, mid.toFixed(1), it.label, {"font-size": LS}),
        tick: D.el("text", {x: cx + cw + 12, y: mid.toFixed(1), "font-size": S, "font-weight": 700, fill: "var(--emph)", opacity: 0}, g),
        yours: D.el("text", {x: cx + cw + 12, y: (ch / 2 + YS * 0.35).toFixed(1), "font-size": YS, fill: "var(--muted)", opacity: 0}, g),
        col: col};
      if (c.grip) c.grip.textContent = "≡";
      c.tick.textContent = "✓";
      return c;
    });
    // the result and the note right under the cards
    var by = this.slot(n - 1) + ch + Math.round(S * 0.25);
    this.markEl = D.el("text", {x: 0, y: (by + nLH * 0.78).toFixed(1), "font-size": S, "font-weight": 700, opacity: 0}, svg);
    this.noteEls = nLines.map(function(s, i){ return D.mtext(svg, 0, (by + nLH * 0.78 + i * nLH).toFixed(1), s, {"font-size": NS, opacity: 0}); });
    this.markW = markW; this.correctLabel = correctLabel;
    if (!this.video){
      this.cards.forEach(function(c, j){
        var b = c.btn = document.createElement("button");
        b.type = "button"; b.className = "od-card";
        if (self.help) b.setAttribute("aria-describedby", self.help.id);
        Object.assign(b.style, {left: cx + "px", width: cw + "px", height: ch + "px"});
        b.addEventListener("keydown", function(e){ self.key(e, j); });
        b.addEventListener("keyup", function(e){ if (self._k < 1) e.stopPropagation(); });
        b.addEventListener("click", function(e){ e.stopPropagation(); e.preventDefault(); });
        b.addEventListener("blur", function(){ if (self._held && self._held.item === j && !self._syncing) self.drop(false); });
        b.addEventListener("pointerdown", function(e){ self.grab(e, j); });
        b.addEventListener("pointermove", function(e){ self.drag(e); });
        b.addEventListener("pointerup", function(e){ self.release(e); });
        b.addEventListener("pointercancel", function(e){ self.release(e); });
        self.insertBefore(b, self.say);
      });
    }
  }
  // the top of the card at position p
  slot(p){ var g = this.g; return g.y0 + p * g.pitch; }
  // ---- the viewer's state (outside (i, k, t))
  // the order now (position → item index); a new array
  order(){ return (this._order || this.start).slice(); }
  // move item j to position p
  move(j, p){
    var o = this.order(), from = o.indexOf(j), n = o.length;
    p = Math.max(0, Math.min(n - 1, p));
    if (from === p) return false;
    o.splice(from, 1); o.splice(p, 0, j);
    this._order = o; this._moved = true;
    this.redraw();
    return true;
  }
  key(e, j){
    if (this._k === undefined || this._k >= 1) return;   // the answer is shown: keys go to the slide
    var k = e.key, h = this._held, T = this.T, lab = this.items[j].label;
    if (k === " " || k === "Spacebar" || k === "Enter"){
      e.preventDefault(); e.stopPropagation();
      if (h && h.item === j) this.drop(true);
      else { if (h) this.drop(false); this._held = {item: j, from: this.order().indexOf(j)}; this.redraw(); this.say.textContent = T.picked(lab, this._held.from + 1); }
      return;
    }
    if (!h || h.item !== j) return;
    e.stopPropagation();
    if (k === "ArrowUp" || k === "ArrowDown"){
      e.preventDefault();
      var p = this.order().indexOf(j) + (k === "ArrowUp" ? -1 : 1);
      if (this.move(j, p)) this.say.textContent = T.moved(p + 1);
    } else if (k === "Escape"){
      e.preventDefault();
      this.move(j, h.from);
      this._held = null; this.redraw(); this.sync();
      this.say.textContent = T.back(h.from + 1);
    } else if (k !== "Tab") e.preventDefault();
  }
  // put down the card held from the keyboard; announce when asked
  drop(tell){
    var h = this._held;
    if (!h) return;
    this._held = null;
    this.redraw(); this.sync();
    if (tell) this.say.textContent = this.T.dropped(this.items[h.item].label, this.order().indexOf(h.item) + 1);
  }
  // pointer dragging: the card follows the pointer; the others make room as it passes their middles
  grab(e, j){
    e.stopPropagation();
    if (this._k === undefined || this._k >= 1 || (e.button !== undefined && e.button !== 0)) return;
    if (this._held) this.drop(false);
    var r = this.getBoundingClientRect(), sc = this.g.H && r.height ? r.height / this.g.H : 1;
    this._drag = {item: j, y: e.clientY, sc: sc || 1, top: this.slot(this.order().indexOf(j)), at: null, moved: false};
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
  }
  drag(e){
    var g = this._drag;
    if (!g) return;
    e.stopPropagation();
    var dy = (e.clientY - g.y) / g.sc, n = this.items.length;
    if (!g.moved && Math.abs(dy) < 4) return;
    g.moved = true;
    g.at = Math.max(this.slot(0), Math.min(this.slot(n - 1), g.top + dy));
    var p = Math.round((g.at - this.slot(0)) / this.g.pitch);
    if (!this.move(g.item, p)) this.redraw();
  }
  release(e){
    var g = this._drag;
    if (!g) return;
    e.stopPropagation();
    this._drag = null;
    this.redraw(); this.sync();
    if (g.moved) this.say.textContent = this.T.moved(this.order().indexOf(g.item) + 1);
  }
  // the controls in the viewer's order, so that Tab follows the cards on screen (focus is kept)
  sync(){
    if (!this.cards || !this.cards[0].btn || this._drag) return;
    var o = this.order(), self = this, btns = o.map(function(j){ return self.cards[j].btn; });
    var now = Array.prototype.filter.call(this.children, function(c){ return c.className === "od-card"; });
    if (now.every(function(b, i){ return b === btns[i]; })) return;
    var a = document.activeElement;
    this._syncing = true;
    btns.forEach(function(b){ self.insertBefore(b, self.say); });
    if (a && btns.indexOf(a) >= 0 && document.activeElement !== a) a.focus({preventScroll: true});
    this._syncing = false;
  }
  reset(){ this._order = null; this._moved = false; this._held = null; this._drag = null; }
  untouch(){
    if (this._held) this.drop(false);
    var a = document.activeElement;
    if (a && a !== this && this.contains(a) && a.blur) a.blur();
  }
  answered(){ return this._moved; }
  redraw(){ if (this._k !== undefined) this.paint(this._k, this._t); }
  duration(k){ return k === 1 ? 0.8 : 0; }
  render(k, t, ctx){
    var was = this._k !== undefined && this._k >= 1;
    if (ctx.entered === true){ this.reset(); was = false; }
    if (ctx.reset) this.untouch();
    if (k >= 1){ if (this._held) this.drop(false); this._drag = null; }
    // arriving at the answer step after the viewer moved a card: report the order once (not on a re-render of the same step)
    if (k >= 1 && !was && this.answered() && this._answer && !this.video && !this._printing){
      var o = this.order();
      this._answer("q", o.every(function(v, i){ return v === i; }), o.join(","));
    }
    this._k = k; this._t = t;
    this.paint(k, t);
    this.sync();
  }
  paint(k, t){
    var self = this, T = this.T, G = this.g, n = this.items.length;
    var o = this._printing ? this.start : this.order(), mine = !this._printing && !this.video && this.answered();
    var e = k >= 1 ? base.prog(t, 0, 0.6) : 0, em = k >= 1 ? base.prog(t, 0.5, 0.3) : 0;
    var right = mine && o.every(function(v, i){ return v === i; });
    this.cards.forEach(function(c, j){
      var p = o.indexOf(j), y = k >= 1 ? base.lerp(self.slot(p), self.slot(j), e) : self.slot(p);
      var dr = self._drag && self._drag.moved && self._drag.item === j && k < 1, held = self._held && self._held.item === j && k < 1;
      if (dr) y = self._drag.at;
      c.g.setAttribute("transform", "translate(0," + y.toFixed(1) + ")");
      c.rect.style.stroke = held || dr ? "var(--emph)" : c.col;
      c.rect.setAttribute("stroke-width", held || dr ? 5 : 3);
      // at the answer: ✓ where the viewer had it right, else where the viewer had it
      var ok = mine && k >= 1 && p === j;
      c.tick.setAttribute("opacity", ok ? em.toFixed(3) : 0);
      c.yours.textContent = mine && k >= 1 && !ok ? T.yours(p + 1) : "";
      c.yours.setAttribute("opacity", mine && k >= 1 && !ok ? em.toFixed(3) : 0);
      if (c.btn){
        c.btn.style.top = y.toFixed(1) + "px";
        c.btn.setAttribute("aria-label", T.card(self.items[j].label, (k >= 1 ? j : p) + 1, n));
        c.btn.setAttribute("aria-pressed", held ? "true" : "false");
        if (k >= 1){ c.btn.setAttribute("aria-disabled", "true"); c.btn.tabIndex = -1; }
        else { c.btn.removeAttribute("aria-disabled"); c.btn.tabIndex = 0; }
      }
    });
    // the result and the note
    var mark = mine && k >= 1 ? (right ? this.correctLabel : T.wrong) : "";
    this.markEl.textContent = mark;
    this.markEl.style.fill = right ? "var(--emph)" : "var(--muted)";
    this.markEl.setAttribute("opacity", mark ? em.toFixed(3) : 0);
    var dx = mark ? this.markW : 0;
    this.noteEls.forEach(function(el, i){ el.setAttribute("x", i === 0 ? dx : 0); el.setAttribute("opacity", em.toFixed(3)); });
    if (this._sayK !== k && !this.video){
      this._sayK = k;
      this.say.textContent = k >= 1 ? T.announce(mark, this.items.map(function(x){ return x.label; }), this.data.note || "") : "";
    }
  }
};
});

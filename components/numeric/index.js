// m-numeric: a question answered with a number. The viewer types the number; the answer step shows the right answer,
// a right/wrong mark beside the viewer's number, and the note.
// <m-numeric style="height:360px"><script type="application/json">
//   {"question": "1 辺 3 cm の立方体の体積は？", "answer": 27, "unit": "cm³", "note": "3 × 3 × 3 = 27"}
// </script></m-numeric>
// Steps: 0 = the question and the field (the author's state: empty). 1 = the answer (right answer, mark, note).
// Viewer input (spec §8.4 "Viewer input"): the typed text lives outside (i, k, t) and persists while the viewer stays on the
//   slide (forward and back); only ctx.entered (entering from another slide, a jump) empties it. ctx.reset only drops focus.
//   At the answer step the field is read-only (the number shown is the one reported); going back makes it editable again.
// Answers (spec §8.4 ctx.answer): arriving at step 1 (k from < 1 to ≥ 1, not a re-render of the same step) with a number in
//   the field calls ctx.answer("q", correct, number) once; again after going back and arriving again. Not without a number,
//   in video, while printing, or when the player passes no ctx.answer.
// Parsing: full-width digits, "．"/"." as the decimal point, "−" "－" "-" as minus, "," "，" as digit separators (ignored),
//   surrounding white space and the declared unit (exactly that string) are ignored; anything else is not a number (a hint
//   says so). Correct when |x − answer| ≤ tolerance (plus a relative 1e-9 for float error).
// Video (ctx.mode "video"): no field, an empty box; step 1 shows the right answer only. Print: the author's state (an empty
//   box, no mark), controls hidden by @media print; the screen keeps the viewer's text afterwards.
// Vertical slides: the part stays in horizontal writing; when the element is too small it reports "layout".
egatariParts.define({name: "numeric", version: "2.0.0", requires: {base: "1.3.0"}, element: "m-numeric"}, function(deps){
"use strict";
var base = deps.base;
// UI text (ctx.lang: the document's language). labels.correct in the child JSON overrides `correct`
var TEXT = {
  ja: {
    correct: "✓ 正解", wrong: "✗ 不正解",
    hint: "数で入れてください",
    field: function(unit){ return "答え" + (unit ? "（" + unit + "）" : ""); },
    answer: function(v){ return "答え：" + v; },
    tol: function(v){ return "（±" + v + "）"; },
    announce: function(v, mark, note){ return "答え：" + v + "。" + (mark ? mark + "。" : "") + (note || ""); },
  },
  en: {
    correct: "✓ Correct", wrong: "✗ Incorrect",
    hint: "Enter a number",
    field: function(unit){ return "Answer" + (unit ? " (" + unit + ")" : ""); },
    answer: function(v){ return "Answer: " + v; },
    tol: function(v){ return " (±" + v + ")"; },
    announce: function(v, mark, note){ return "Answer: " + v + ". " + (mark ? mark + ". " : "") + (note || ""); },
  }
};
var CSS_ID = "numeric-2-0-0-css";   // the style element this part writes, named with its name and version (spec §6.1 Identifiers)
var CSS = [
  "m-numeric .nm-say{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  "m-numeric .nm-in{position:absolute;box-sizing:border-box;margin:0;padding:0 14px;font-weight:700;font-family:var(--font-cap,var(--font-sans,sans-serif));font-variant-numeric:tabular-nums;text-align:right;color:var(--fg);background:var(--bg);border:2px solid var(--term);border-radius:8px}",
  "m-numeric .nm-in:focus-visible{outline:3px solid var(--emph);outline-offset:2px}",
  "m-numeric .nm-in[readonly]{border-color:var(--line)}",
  "@media print{m-numeric .nm-in{display:none!important}}",
].join("\n");
// The number as typed → a number, or null (not a number). unit: the declared unit, ignored once at either end
function parse(raw, unit){
  var s = String(raw == null ? "" : raw).replace(/^[\s　]+|[\s　]+$/g, "");
  if (unit){
    if (s.length > unit.length && s.slice(-unit.length) === unit) s = s.slice(0, -unit.length);
    else if (s.length > unit.length && s.slice(0, unit.length) === unit) s = s.slice(unit.length);
    s = s.replace(/^[\s　]+|[\s　]+$/g, "");
  }
  s = s.replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48); })
       .replace(/．/g, ".").replace(/^[−－]/, "-").replace(/[,，]/g, "");
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  var x = +s;
  return isFinite(x) ? x : null;
}
// Greedy line breaking by estimated width: Latin words stay whole, other characters break anywhere,
// and 、。）」 never start a line
function wrap(s, size, max, est){
  var toks = String(s).match(/[!-ɏ]+[ ]*|[ ]+|[\s\S]/gu) || [], lines = [], cur = "";
  toks.forEach(function(tk){
    if (cur && est((cur + tk).replace(/ +$/, ""), size) > max && !/^[、。，．）」』,.)]/.test(tk)){ lines.push(cur.replace(/ +$/, "")); cur = tk.replace(/^ +/, ""); }
    else cur += tk;
  });
  if (cur.trim()) lines.push(cur.replace(/ +$/, ""));
  return lines;
}
return class extends base.MotionElement {
  static partName = "numeric";   // the registry name (define meta name), for report prefixes
  static interactive = true;     // the viewer can operate it (docs/conventions.md §6)
  static viewerInput = true;     // it takes viewer input (spec §8.4)
  static preview = "none";       // the later step is the answer: nothing ahead is shown under preview (docs/conventions.md §1.2)
  static questions = ["q"];      // the question id it answers (spec §8.4 questions, §9.2)
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["question", "answer"], properties: {
      question: {type: "string"},
      answer: {type: "number"},
      tolerance: {type: "number"},
      unit: {type: "string"},
      note: {type: "string"},
      labels: {type: "object", additionalProperties: false, properties: {correct: {type: "string"}}}}},
    example: {question: "1 辺 3 cm の立方体の体積は？", answer: 27, unit: "cm³", note: "3 × 3 × 3 = 27"},
    note: {en: "answer is a number (not a string); tolerance (optional, default 0) accepts answers within ± that much; unit is shown beside the field and may be typed",
           ja: "answer は数（字の並びではない）。tolerance（省略可、既定 0）は ± その幅までを正解にする。unit は欄の横に出し、打ち込んでもよい"},
  };
  static props = {
    size: {type: "number", default: 34, doc: "字の大きさ（px、24 以上）"},
  };
  get S(){ return Math.max(24, Math.round(this.props.size) || 34); }
  mount(ctx){
    var self = this, d = this.data || {};
    this.T = /^ja\b/i.test(ctx.lang || "") ? TEXT.ja : TEXT.en;
    if (typeof d.answer !== "number" || !isFinite(d.answer)) throw new Error("answer must be a finite number");
    if (d.tolerance !== undefined && !(d.tolerance >= 0)) throw new Error("tolerance must be 0 or more");
    this.video = ctx.mode === "video";
    this._answer = typeof ctx.answer === "function" ? ctx.answer : null;
    this._raw = "";
    this.style.display = "block"; this.style.position = "relative"; this.style.writingMode = "horizontal-tb";
    if (!document.getElementById(CSS_ID)){ var st = document.createElement("style"); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
    this.say = document.createElement("div"); this.say.className = "nm-say"; this.say.setAttribute("role", "status"); this.say.setAttribute("aria-live", "polite");
    this.appendChild(this.say);
    this.setAttribute("aria-label", d.question);
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
    var a = document.activeElement, had = this.field && a === this.field, sel = had ? [a.selectionStart, a.selectionEnd] : null;
    this.place(ctx);
    this.redraw();
    if (had && this.field){ this.field.focus({preventScroll: true}); try { this.field.setSelectionRange(sel[0], sel[1]); } catch (x) {} }
  }
  // The drawing and the field for this size. The viewer's text is kept (this._raw)
  place(ctx){
    var self = this, D = base, d = this.data || {}, T = this.T, S = this.S, unit = d.unit || "";
    var W = this.clientWidth, H = this.clientHeight;
    if (this.svg){ this.svg.remove(); if (this.field) this.field.remove(); this.field = null; }
    var est = function(s, size, bold){ return D.textWidth(s, size, {font: self, mark: true}) * (bold ? 1.04 : 1); };
    var vertical = false;
    try { var pe = this.parentElement; vertical = !!pe && /^vertical/.test(getComputedStyle(pe).writingMode || ""); } catch (x) {}
    var where = vertical ? " (the slide is set vertically; the part stays horizontal)" : "";
    // rows: question lines, the field, the hint / answer line, the note
    var qLines = wrap(d.question, S, Math.max(1, W - 4), function(s, z){ return est(s, z, true); });
    var qLH = Math.round(S * 1.32), qh = qLines.length * qLH + Math.round(S * 0.45);
    var fh = Math.max(48, Math.round(S * 1.55)), fw = Math.max(180, Math.ceil(est("−00000.000", S, true)) + 32);
    var unitW = unit ? est(unit, S) + 12 : 0;
    var correctLabel = (d.labels && d.labels.correct) || T.correct;
    var markW = Math.max(est(correctLabel, S, true), est(T.wrong, S, true)) + 24;
    var rowW = fw + 12 + unitW + markW;
    var HS = Math.max(24, Math.round(S * 0.75)), NS = Math.max(24, Math.round(S * 0.8));
    var aLine = T.answer(this.fmt(d.answer)) + (d.tolerance ? T.tol(this.fmt(d.tolerance, true)) : "");
    var lineH = Math.max(Math.round(HS * 1.5), Math.round(S * 1.45));
    var nLines = d.note ? wrap(d.note, NS, Math.max(1, W - 4), est) : [], nLH = Math.round(NS * 1.35);
    var fy = qh, ly = fy + fh + 8, ny = ly + lineH + 4;
    var need = ny + nLines.length * nLH;
    if (W > 0 && H > 0){
      if (rowW > W) ctx.report("layout", "[numeric] the element is " + W + " px wide; the field, unit and mark need " + Math.ceil(rowW) + " px" + where + " (make it wider or the size smaller)");
      if (est(aLine, S, true) > W) ctx.report("layout", "[numeric] the answer line needs " + Math.ceil(est(aLine, S, true)) + " px; the element is " + W + " px wide" + where);
      if (need > H) ctx.report("layout", "[numeric] the question, field, answer and note need " + Math.ceil(need) + " px high; the element is " + H + " px" + where + " (make it taller, or shorten the question or note)");
    }
    this.g = {W: W, H: H, fy: fy, fh: fh, fw: fw};
    var svg = this.svg = D.el("svg", {viewBox: "0 0 " + Math.max(0, W) + " " + Math.max(0, H), width: Math.max(0, W), height: Math.max(0, H), style: "display:block;overflow:visible"});
    this.insertBefore(svg, this.say);
    qLines.forEach(function(s, i){ D.mtext(svg, 0, Math.round(S * 1.0) + i * qLH, s, {"font-size": S, "font-weight": 700}); });
    // the box under the field (what video and print show)
    D.el("rect", {x: 1, y: fy + 1, width: Math.max(0, fw - 2), height: Math.max(0, fh - 2), rx: 8, fill: "var(--bg)", stroke: "var(--term)", "stroke-width": 2}, svg);
    var mid = fy + fh / 2 + S * 0.35;
    if (unit) D.mtext(svg, fw + 12, mid, unit, {"font-size": S});
    this.markEl = D.el("text", {x: fw + 12 + unitW + 12, y: mid, "font-size": S, "font-weight": 700, opacity: 0}, svg);
    this.hintEl = D.el("text", {x: 0, y: ly + HS * 1.1, "font-size": HS, fill: "var(--muted)", opacity: 0}, svg);
    this.hintEl.textContent = T.hint;
    this.ansEl = D.mtext(svg, 0, ly + S * 1.05, aLine, {"font-size": S, "font-weight": 700, opacity: 0});
    this.noteEls = nLines.map(function(s, i){ return D.mtext(svg, 0, ny + NS * 1.05 + i * nLH, s, {"font-size": NS, opacity: 0}); });
    this.aLine = aLine; this.correctLabel = correctLabel;
    if (!this.video){
      var f = this.field = document.createElement("input");
      f.type = "text"; f.className = "nm-in"; f.setAttribute("inputmode", "decimal"); f.setAttribute("autocomplete", "off"); f.setAttribute("spellcheck", "false");
      f.setAttribute("aria-label", T.field(unit));
      this.fieldCss = "left: 0px; top: " + fy + "px; width: " + fw + "px; height: " + fh + "px; font-size: " + S + "px;";
      f.setAttribute("style", this.fieldCss);
      f.value = this._raw;
      f.addEventListener("input", function(){ self._raw = f.value; self.redraw(); });
      // keys typed in the field never reach the slide; Enter and Esc leave the field
      f.addEventListener("keydown", function(e){ e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") f.blur(); });
      f.addEventListener("keyup", function(e){ e.stopPropagation(); });
      f.addEventListener("keypress", function(e){ e.stopPropagation(); });
      this.insertBefore(f, this.say);
    }
  }
  // the number for display: minus as −, the unit after it (a space before a unit in Latin letters)
  fmt(v, bare){
    var u = (this.data && this.data.unit) || "", s = String(v).replace(/^-/, "−");
    return bare || !u ? s : s + (/^[A-Za-z]/.test(u) ? " " : "") + u;
  }
  // ---- the viewer's state (outside (i, k, t))
  // the viewer's number, or null (empty or not a number)
  value(){ return parse(this._raw, (this.data && this.data.unit) || ""); }
  correct(x){
    var d = this.data, tol = d.tolerance || 0;
    return Math.abs(x - d.answer) <= tol + 1e-9 * Math.max(1, Math.abs(d.answer));
  }
  reset(){ this._raw = ""; if (this.field) this.field.value = ""; }
  untouch(){ var a = document.activeElement; if (a && a !== this && this.contains(a) && a.blur) a.blur(); }
  redraw(){ if (this._k !== undefined) this.paint(this._k, this._t); }
  duration(k){ return k === 1 ? 0.6 : 0; }
  render(k, t, ctx){
    var was = this._k !== undefined && this._k >= 1;
    if (ctx.entered === true){ this.reset(); was = false; }
    if (ctx.reset) this.untouch();
    // arriving at the answer step with a number: report it once (not on a re-render of the same step)
    var x = this.value();
    if (k >= 1 && !was && x !== null && this._answer && !this.video && !this._printing) this._answer("q", this.correct(x), x);
    this._k = k; this._t = t;
    this.paint(k, t);
  }
  paint(k, t){
    var T = this.T, e = k >= 1 ? base.prog(t, 0, 0.6) : 0;
    var raw = this._printing ? "" : this._raw, x = this._printing ? null : this.value();
    var f = this.field;
    if (f){
      if (document.activeElement !== f && f.value !== this._raw) f.value = this._raw;
      // written afresh in one order, so the DOM does not depend on the order of earlier renders
      f.removeAttribute("readonly"); f.removeAttribute("aria-readonly"); f.removeAttribute("style");
      if (k >= 1){ f.setAttribute("readonly", ""); f.setAttribute("aria-readonly", "true"); }
      f.setAttribute("style", this.fieldCss);
    }
    // the hint (step 0 only): text that is not a number
    this.hintEl.setAttribute("opacity", k < 1 && raw.trim() && x === null ? 1 : 0);
    this.ansEl.setAttribute("opacity", e.toFixed(3));
    this.noteEls.forEach(function(n){ n.setAttribute("opacity", e.toFixed(3)); });
    // the mark beside the viewer's number (not in video or print)
    var mark = "";
    if (k >= 1 && x !== null && !this.video){
      var right = this.correct(x);
      mark = right ? this.correctLabel : T.wrong;
      this.markEl.textContent = mark;
      this.markEl.style.fill = right ? "var(--emph)" : "var(--muted)";
    }
    this.markEl.setAttribute("opacity", mark ? e.toFixed(3) : 0);
    if (this._sayK !== k && !this.video){
      this._sayK = k;
      this.say.textContent = k >= 1 ? T.announce(this.aLine.replace(/^[^：:]*[：:]\s*/, ""), mark, (this.data.note || "")) : "";
    }
  }
};
});

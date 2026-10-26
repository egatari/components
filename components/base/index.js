// base 2.0.0: the shared base class and helpers of Egatari components 2.0 (a library part, Egatari spec §6.1).
// Element parts require it ({base: "2.0.0"}) and receive what this factory returns:
//   {MotionElement, el, lerp, prog, clamp, mtext, variant, previewOpacity}
// It uses no import, no network and no global of the player (spec §6.1): only the DOM, getComputedStyle and console.
//
// Provenance: MotionElement, el, mtext, lerp, prog and clamp (with the private ease and stepInt) are copied from
// Egatari Studio's kit/deck.js (https://github.com/egatari/egatari-studio, commit 03eaf0607598b993eb020f8e619caa53526bc771,
// where they are DECK.MotionElement, DECK.el, DECK.mtext, DECK.lerp, DECK.prog and DECK.clamp01), MIT License,
// Copyright (c) 2026 Gendo Kumoi, the same owner and licence as this repository. They are kept as close to that code as
// possible so that a part moved from DECK to base draws the same DOM (tools/test-base.mjs compares them with the pinned
// Studio's DECK). variant is tools/variant.js's VARIANT.of, taking the names instead of looking the tag up again;
// previewOpacity is the --preview-opacity read the parts used to write themselves.
egatariParts.define({name: "base", version: "2.0.0", requires: {}}, function(){
"use strict";
var NS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- 時間の部品 (kit/deck.js)
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function ease(x){ x = clamp01(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
// t 秒のときの、start から dur 秒かける動きの進み具合（0〜1、イージング付き）
function prog(t, start, dur){ if (t === Infinity) return 1; if (dur <= 0) return t >= start ? 1 : 0; return ease((t - start) / dur); }
function lerp(a, b, e){ return a + (b - a) * e; }
// 段階の番号（steps / data-from）：有限の整数で min 以上。そうでなければ警告して null
function stepInt(v, what, min){
  if (v === null || v === undefined) return null;
  var n = typeof v === "number" ? v : String(v).trim() === "" ? NaN : +v;
  if (!isFinite(n) || n !== Math.floor(n) || n < (min || 0)){ console.warn("deck.js: " + what + "=" + JSON.stringify(v) + " は 0 以上の整数でないので無視 / ignored (not a non-negative integer)"); return null; }
  return n;
}

// ---------------------------------------------------------------- SVG の部品 (kit/deck.js)
// 色は CSS 変数で書けるように、fill / stroke / color に var( があれば style に回す（属性では var() が効かない）
function el(tag, attrs, parent){
  var e = document.createElementNS(NS, tag), st = "";
  for (var k in attrs){
    var v = attrs[k];
    if ((k === "fill" || k === "stroke" || k === "color" || k === "stop-color") && String(v).indexOf("var(") >= 0) st += k + ":" + v + ";";
    else e.setAttribute(k, v);
  }
  if (st) e.setAttribute("style", st + (attrs.style || ""));
  if (parent) parent.appendChild(e);
  return e;
}
// SVG の中の簡単な数式記法：*..* は斜体、_x は下付き、^x は上付き（本格的な式は組み立てのときに描く。spec §6.2）
function mtext(parent, x, y, str, attrs){
  var t = el("text", Object.assign({x: x, y: y, "font-size": 24}, attrs || {}), parent);
  var it = false, i = 0, buf = "";
  function flush(extra){
    if (!buf) return;
    var s = el("tspan", extra || {}, t);
    if (it){ s.setAttribute("font-style", "italic"); s.setAttribute("class", "mi"); }
    s.textContent = buf; buf = "";
  }
  while (i < str.length){
    var c = str[i];
    if (c === "*"){ flush(); it = !it; i++; }
    else if ((c === "_" || c === "^") && i + 1 < str.length){
      flush(); buf = str[i + 1];
      flush({"baseline-shift": c === "_" ? "sub" : "super", "font-size": "17"});
      i += 2;
    } else { buf += c; i++; }
  }
  flush();
  return t;
}

// ---------------------------------------------------------------- 部品の基底クラス (kit/deck.js)
class MotionElement extends HTMLElement {
  get steps(){ var a = stepInt(this.getAttribute("steps"), this.tagName.toLowerCase() + " steps"); return a !== null ? a : (this.constructor.steps || 1); }
  get from(){ var a = stepInt(this.getAttribute("data-from"), this.tagName.toLowerCase() + " data-from", 1); return a !== null ? a : 1; }
  // static props の宣言に従って属性を読む
  get props(){
    if (this._props) return this._props;
    var decl = this.constructor.props || {}, out = {};
    for (var name in decl){
      var d = decl[name], a = this.getAttribute(name);
      if (a === null){ out[name] = d.default; continue; }
      out[name] = d.type === "number" ? +a : d.type === "bool" ? a !== "false" : d.type === "json" ? JSON.parse(a) : a;
    }
    return (this._props = out);
  }
  // 子の <script type="application/json"> の中身。type の前後の空白を除いて大文字小文字を区別せずに application/json、id によらない。
  // 子に 2 つ以上あれば、どれを使うか決められないので使わない（null）
  get data(){
    if (this._data !== undefined) return this._data;
    var c = [].filter.call(this.children, function(x){ return x.localName === "script" && String(x.getAttribute("type") || "").trim().toLowerCase() === "application/json"; });
    if (c.length > 1) console.warn("[deck] " + this.tagName.toLowerCase() + ": more than one <script type=\"application/json\"> child (ignored)");
    return (this._data = c.length === 1 ? JSON.parse(c[0].textContent) : null);
  }
  mount(ctx){}
  render(k, t, ctx){}
  duration(k){ return 0; }
  cues(k){ return null; }
}

// ---------------------------------------------------------------- 見せ方 (tools/variant.js VARIANT.of; spec §8.4 Presentation variants)
// The variant is the element's `variant` attribute when it names one of `names`, otherwise the first name. names defaults
// to the class's `static variants`. No seed; an unknown name warns and gives the first.
function variant(e, names){
  var tag = e.tagName.toLowerCase(), v = e.getAttribute("variant");
  if (!names) names = e.constructor.variants || [];
  if (v !== null && names.indexOf(v) >= 0) return v;
  if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
  return names[0] || null;
}

// ---------------------------------------------------------------- 先を薄く見せる濃さ (spec §8.4 Theme colours: --preview-opacity)
// The theme's --preview-opacity as seen from the element (a number in 0…1), or 0.45 when it is not set or not in 0…1
function previewOpacity(e){
  var pv = parseFloat(getComputedStyle(e).getPropertyValue("--preview-opacity"));
  return pv >= 0 && pv <= 1 ? pv : 0.45;
}

return {MotionElement: MotionElement, el: el, lerp: lerp, prog: prog, clamp: clamp01, mtext: mtext, variant: variant, previewOpacity: previewOpacity};
});

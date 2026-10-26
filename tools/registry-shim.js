// ---------------------------------------------------------------------------------------------------------------------
// TEST ONLY. Never written into a lesson, never shipped in a release (it lives in tools/, outside components/).
// ---------------------------------------------------------------------------------------------------------------------
// A stand-in for the producer-written parts registry of Egatari spec §6.1 (components 2.0), so that this repository can
// load and test 2.0 parts before Egatari Studio writes the real registry. It follows the behaviour §6.1 defines:
//   - one global for parts, egatariParts, with define(meta, factory) and nothing else;
//     meta = {name, version, requires?, element?}; requires maps part names to EXACT versions (no ranges)
//   - factory(deps) is called with {<required name>: <what that part's factory returned>} and the result is frozen
//     (shallowly: parts MUST NOT modify another part's exports) and kept under name@version; two versions of one part both
//     stay, each under its own name@version
//   - parts come in dependency order: a part that requires one not defined before it fails (a forward reference is
//     refused, and defining the required part later does not revive it); only the exact version matches
//   - an element part's returned class is defined as the custom element `element`, only if that name is not defined yet
//   - when a factory throws, a required part is missing, or a required part failed, the failure is recorded for that part
//     (and so for every part that requires it), and a failed element part is shown as its text equivalent
//     (aria-label, else its text) in a placeholder (class m-error, role note); nothing else is affected
// For tests it also exposes EGATARI_PARTS_SHIM (not part of the registry; parts must not use it):
//   get(name, version) → the factory's value or undefined   failures() → [{key, code, message}]   order() → keys defined, in order
//   status(key) → "ok" | "failed" | undefined   reports() → what parts sent to ctx.report
// Bridge to the pinned Studio (tools/studio.json): its kit/deck.js has no registry and drives only instances of its own
// DECK.MotionElement through DECK.seek. When an element part is defined after deck.js has run (and before its init on the
// window load event), the shim
//   - links the part's base class (base.MotionElement, whose parent is HTMLElement) under DECK.MotionElement, so that the
//     DECK seek loop finds and drives it; base's own steps, from, props, data and methods still win (they are its own);
//   - defines a subclass of the part's class whose instances wrap their mount and render (after base's data check has
//     put its own on the instance) to pass a 2.0 context (spec §8.4) instead of DECK's:
//     mode ("talk" | "learn" | "video"; DECK's "lecture" is talk with preview), preview, slide (the slide's key, a string),
//     instant, reset, entered (true on the first render after the slide was entered from another slide, followed through the
//     bridged parts' renders and DECK's deck:pos events; a jump to the same slide is not detected), lang (deck-meta lang, else <html lang>, else "ja"), slides ([{key, title}], frozen),
//     go(slideKey, stepKey?) → DECK.go, visited(slideKey) → DECK.visited (a boolean), report(code, message) → DECK.componentErrors and console.warn, extend (DECK's when
//     it has one), live (null); ctx.deck is not passed;
//   - calls the part's layout(ctx), if it has one, when its size changes, when the fonts finish loading and when its
//     slide becomes the current one, and then renders it again at its last (k, t).
// Load order in a test page: the pinned Studio's built deck, then this file, then the parts in dependency order, all
// before the load event (tools/test-registry.mjs inserts them before </body> of the built file).
(function(G){
"use strict";
var NAME_RE = /^[a-z][a-z0-9-]{0,63}$/, EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, TAG_RE = /^[a-z][a-z0-9]*-[a-z0-9-]*$/;
var parts = Object.create(null), failed = Object.create(null), order = [], failures = [], reports = [];
function own(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
function msg(e){ return e && e.message !== undefined ? (e.name && e.name !== "Error" ? e.name + ": " : "") + e.message : String(e); }

// What a failure says, in one line, for the console and the fallback's title: the part, what happened, and the consequence
var CONSEQUENCE = "; it is not defined, and the parts that require it fail too";
function fail(key, meta, code, message){
  if (!failed[key]) failed[key] = {key: key, code: code, message: message};
  failures.push({key: key, code: code, message: message});
  console.warn("[egatariParts] " + key + ": " + code + ": " + message + CONSEQUENCE);
  if (meta && typeof meta.element === "string" && TAG_RE.test(meta.element) && !parts[key]) fallback(meta.element, key, code, message);
}
function versionsOf(name){ return Object.keys(parts).filter(function(k){ return k.slice(0, k.lastIndexOf("@")) === name; }); }

function define(meta, factory){
  var name = meta && meta.name, version = meta && meta.version, key = String(name) + "@" + String(version);
  if (!meta || typeof meta !== "object" || typeof name !== "string" || !NAME_RE.test(name) || typeof version !== "string" || !EXACT.test(version))
    return fail(key, meta, "meta", "name must match " + NAME_RE + " and version be an exact version X.Y.Z");
  if (parts[key] || failed[key]){ failures.push({key: key, code: "duplicate", message: key + " is already defined (the first is kept)"}); console.warn("[egatariParts] " + key + ": defined twice (the first is kept)"); return; }
  if (meta.element !== undefined && (typeof meta.element !== "string" || !TAG_RE.test(meta.element))) return fail(key, meta, "meta", "element is not a custom element name");
  if (typeof factory !== "function") return fail(key, meta, "meta", "factory is not a function");
  var req = meta.requires || {}, deps = {};
  for (var n in req){
    if (!own(req, n)) continue;
    var v = req[n], rk = n + "@" + v;
    if (typeof v !== "string" || !EXACT.test(v)) return fail(key, meta, "range", "requires " + n + ": " + JSON.stringify(v) + " is not an exact version");
    if (failed[rk]) return fail(key, meta, "dependency", "requires " + rk + ", which failed (" + failed[rk].code + ": " + failed[rk].message + ")");
    if (!parts[rk]){
      var have = versionsOf(n);
      return fail(key, meta, "missing", rk + " is not defined before " + key + (have.length ? " (defined: " + have.join(", ") + "; versions are exact)" : " (parts come in dependency order; a later part is never referred to)"));
    }
    deps[n] = parts[rk].value;
  }
  var value;
  // spec §6.1 Failure: a throw from the factory is caught at define time; the part stays undefined and its dependants fail
  try { value = factory(deps); } catch (e) { return fail(key, meta, "factory", "its factory threw " + msg(e)); }
  if (value !== null && (typeof value === "object" || typeof value === "function")) Object.freeze(value);   // spec §6.1: shallowly
  if (meta.element){
    if (typeof value !== "function" || !(value.prototype instanceof HTMLElement)) return fail(key, meta, "element", "the factory did not return a class extending HTMLElement");
    try { defineElement(meta.element, value); } catch (e) { return fail(key, meta, "element", "customElements.define(" + JSON.stringify(meta.element) + ") threw " + msg(e)); }
    parts[key] = {meta: meta, value: value};
    order.push(key);
    return;
  }
  parts[key] = {meta: meta, value: value};
  order.push(key);
}

// ---------------------------------------------------------------- elements
function defineElement(tag, cls){
  if (customElements.get(tag)) return;   // spec §6.1: only if not already defined (the first version keeps the name)
  customElements.define(tag, deckBase() ? bridged(cls) : cls);
}
// A failed element part: its text equivalent in a placeholder (spec §6.1 Failure; the final-state image is the producer's)
function fallback(tag, key, code, message){
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback(){
      if (this.querySelector(":scope > .m-error")) return;
      var text = this.getAttribute("aria-label") || [].filter.call(this.childNodes, function(n){ return !(n.nodeType === 1 && n.localName === "script"); }).map(function(n){ return n.textContent; }).join("").trim();
      [].slice.call(this.childNodes).forEach(function(n){ if (!(n.nodeType === 1 && n.localName === "script")) n.remove(); });
      var box = document.createElement("div");
      box.className = "m-error"; box.setAttribute("role", "note");
      box.setAttribute("data-part-failure", code);
      box.textContent = text || "<" + tag + ">";
      box.title = key + ": " + code + ": " + message;
      this.appendChild(box);
      // the element's own report (spec §6.1 Failure: shown as its text equivalent, and the failure is available to checks)
      var D = G.DECK, s = this.closest && this.closest(".slide");
      var rec = {slide: D && D.slides ? D.slides.indexOf(s) : -1, key: s ? (s._key || s.getAttribute("data-key") || s.id || "") : "", tag: tag, phase: "registry", kind: "report", code: "registry",
        msg: "[" + key.slice(0, key.lastIndexOf("@")) + "] " + key + " is not defined (" + code + ": " + message + ")"};
      reports.push(rec);
      if (D && Array.isArray(D.componentErrors)) D.componentErrors.push(rec);
    }
  });
}

// ---------------------------------------------------------------- bridge to the pinned Studio's DECK
function deckBase(){ var D = G.DECK; return D && typeof D.MotionElement === "function" ? D.MotionElement : null; }
// Put DECK.MotionElement under the class whose parent is HTMLElement (base.MotionElement), so that DECK drives the part
function reparent(cls){
  var DM = deckBase();
  if (!DM || cls.prototype instanceof DM) return;
  var c = cls;
  while (c && Object.getPrototypeOf(c) !== HTMLElement) c = Object.getPrototypeOf(c);
  if (!c || c === Function.prototype || Object.isFrozen(c)) return;   // a part's own class extending HTMLElement is frozen: not bridged
  Object.setPrototypeOf(c, DM);
  Object.setPrototypeOf(c.prototype, DM.prototype);
}
var epoch = 0, current = null;
// The slide the viewer is on, followed through DECK's position events too: a slide is entered again after the viewer was on
// another slide, also one without 2.0 parts (whose renders the bridge never sees)
if (G.document && typeof G.document.addEventListener === "function") G.document.addEventListener("deck:pos", function(e){
  var D = G.DECK, s = D && D.slides && e.detail && D.slides[e.detail.i], key = s && s._key;
  if (key && key !== current){ current = key; epoch++; }
});
function slideKey(s){ return s && typeof s === "object" ? (s._key || s.getAttribute("data-key") || s.id || "") : s; }
function ctxOf(c, d, first){
  var D = G.DECK, key = slideKey(d && d.slide);
  if (!first && key !== current){ current = key; epoch++; }
  var entered = !first && c.__epoch !== epoch;
  if (!first) c.__epoch = epoch;
  var lecture = d && d.mode === "lecture";
  var x = {
    mode: lecture ? "talk" : (d && d.mode) || "talk",
    preview: lecture || !!(d && d.preview),
    slide: key,
    instant: !!(d && d.instant),
    reset: !!(d && d.reset),
    entered: entered,
    lang: (D.META && typeof D.META.lang === "string" && D.META.lang) || document.documentElement.lang || "ja",
    slides: slidesOf(),
    visited: function(sk){ return typeof D.visited === "function" ? !!D.visited(String(sk)) : false; },
    go: function(sk, stk){ var i = (D.slides || []).findIndex(function(s){ return s._key === sk; }); if (i < 0) return false; var s = D.slides[i]; var k = stk === undefined ? 0 : stk === "concl" ? s._cstep : +stk; D.go(i, k); return true; },
    report: function(code, message){
      var rec = {slide: (D.slides || []).findIndex(function(s){ return s._key === key; }), key: key, tag: c.tagName.toLowerCase(), phase: "report", kind: "report", code: String(code), msg: String(message)};
      reports.push(rec);
      if (Array.isArray(D.componentErrors)) D.componentErrors.push(rec);
      console.warn("[egatariParts] " + rec.tag + " (" + key + "): " + rec.code + ": " + rec.msg);
    },
    live: null
  };
  if (d && typeof d.extend === "function") x.extend = d.extend;
  return x;
}
var slidesCache = null;
function slidesOf(){
  var D = G.DECK;
  if (!slidesCache && D.slides) slidesCache = Object.freeze(D.slides.map(function(s){ var h = s.querySelector("h1, h2"); return Object.freeze({key: s._key, title: h ? h.textContent.trim() : ""}); }));
  return slidesCache || Object.freeze([]);
}
function bridged(cls){
  reparent(cls);
  var B = class extends cls {
    constructor(){
      super();
      // whatever mount / render this instance has now (base's data check, or the part's own) gets the 2.0 ctx
      var m = this.mount, r = this.render;
      this.mount = function(d){ var x = m.call(this, ctxOf(this, d, true)); if (typeof this.layout === "function") watchLayout(this); return x; };
      this.render = function(k, t, d){ this.__last = [k, t, d]; return r.call(this, k, t, ctxOf(this, d, false)); };
    }
  };
  return B;
}
function relayout(c){
  if (!c.__last || !c.isConnected) return;
  var d = c.__last, x = ctxOf(c, d[2], true);
  x.entered = false;
  c.layout(x);
  c.render(d[0], d[1], d[2]);
}
function watchLayout(c){
  if (typeof ResizeObserver === "function"){ var w = -1, h = -1; new ResizeObserver(function(){ var r = c.getBoundingClientRect(); if (r.width !== w || r.height !== h){ w = r.width; h = r.height; relayout(c); } }).observe(c); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ relayout(c); });
  document.addEventListener("deck:pos", function(){ var s = c.closest(".slide"); if (s && s.classList.contains("active") && c.__shownIn !== epoch){ c.__shownIn = epoch; relayout(c); } });
}

G.egatariParts = Object.freeze({define: define});
G.EGATARI_PARTS_SHIM = Object.freeze({
  get: function(name, version){ var p = parts[name + "@" + version]; return p ? p.value : undefined; },
  status: function(key){ return parts[key] ? "ok" : failed[key] ? "failed" : undefined; },
  failures: function(){ return failures.map(function(f){ return {key: f.key, code: f.code, message: f.message}; }); },
  order: function(){ return order.slice(); },
  reports: function(){ return reports.map(function(r){ return Object.assign({}, r); }); },
  bridged: function(){ return !!deckBase(); }
});
})(globalThis);

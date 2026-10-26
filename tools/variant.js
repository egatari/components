// ---- BEGIN egatari-variant (source: tools/variant.js; copy with `node tools/variant-sync.mjs`; do not edit inside a component) ----
// Choosing a presentation variant (Egatari spec §8.4, docs/conventions.md §1). A component lists its variant names in
// `static variants` (the first is the default) and calls VARIANT.of(this) once, in mount. The variant is the component's
// `variant` attribute when it names one of them, otherwise the first name. There is no seed: lessons do not carry one
// (spec §8.4 since egatari-spec 28d8801), and `seed` / `data-egatari-seed` are not read.
// The choice is a pure function of the attribute: the picture still depends on (i, k, t) only.
var VARIANT = (function(){
  "use strict";
  function of(el){
    var tag = el.tagName.toLowerCase(), C = customElements.get(tag), names = (C && C.variants) || [], v = el.getAttribute("variant");
    if (v !== null && names.indexOf(v) >= 0) return v;
    if (v !== null) console.warn(tag + ' variant="' + v + '" is not one of ' + names.join(", ") + " (the first, " + (names[0] || "none") + ", is used)");
    return names[0] || null;
  }
  return {of: of};
})();
// ---- END egatari-variant ----

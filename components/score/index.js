// m-score：楽譜（五線譜）を 1 音（和音）ずつ、または 1 小節ずつ出し、その音を再生器に鳴らしてもらう
// <m-score names="solfa" style="height:300px"><script type="application/json">
//   {"abc": "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F |]", "abcSvg": "<svg …>…</svg>", "abcMap": {"tempo": 96, "notes": [ … ]},
//    "renderer": {"name": "abcjs", "version": "6.7.2"}}
// （JSON の終わり）</m-score>
// 楽譜を描くのは組み立て（作り手。部品庫 2.0 の「組み立てのときの描画」）：作者の書いた abc を abcjs（add_classes）で描き、
// abcSvg（abcjs の SVG。class はそのまま）と abcMap（音符ごとの class・小節・音の高さ・拍・長さ・符頭の箱）を足して渡す。
// 再生のときに abcjs は持たない。この部品は abcSvg を読み、許した要素と属性だけで組み直して（スクリプト・外への参照・色は入らない）、
// abcjs の class（abcjs-mm…・abcjs-n…）で段階ごとに出す。五線・音部記号・調号・拍子は段階 0 から見える
// 段階：by="note"（既定）は音符・和音・休符 1 つ、by="measure" は 1 小節。休符とタイでつながった音は鳴らさずに進む
// 音（仕様 §8.4「Component sounds」）：events(k) は段階 k で出る音の note（pitch・dur（秒、tempo から。タイは次の音符の分も鳴る）・vel 0.7）。
// 和音は同じ t。duration(k) は段階の音符の長さ（by="measure" は小節の終わりまで）
// 名前：names="solfa|abc|iroha|none" で符頭の下（五線の下の帯）に 26 px で書く。位置は abcMap の符頭の箱（box）から
// 今の段階の音符は --emph、前の段階は --fg。授業の表示（ctx.preview、古い再生器は ctx.mode === "lecture"）では先の音符を --preview-opacity で薄く
// 読める層：音の名前を文字で（「ド レ ミ ファ｜ソ …」）。描いた図は aria-hidden
(function(){
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
// ---- 楽譜のデータ（DOM を使わない。tools/test-score.mjs が試す） ----
var SC = (function(){
  var SOLFA = {C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ"};
  var IROHA = {C: "ハ", D: "ニ", E: "ホ", F: "ヘ", G: "ト", A: "イ", B: "ロ"};
  var PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  // ---- 描いた SVG を読む：許した要素と属性だけの木にする（innerHTML も DOMParser も使わない。データは信用しない） ----
  var ELS = {svg: 1, g: 1, path: 1, rect: 1, line: 1, polyline: 1, polygon: 1, circle: 1, ellipse: 1, text: 1, tspan: 1};
  var NUM = /^-?[\d.]+(e-?\d+)?$/i;
  var ATTR = {
    d: /^[\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]*$/, points: /^[\d\s.,eE+\-]*$/, transform: /^(\s*(translate|scale|rotate|matrix)\s*\([\d\s.,eE+\-]*\)\s*)*$/,
    x: NUM, y: NUM, x1: NUM, y1: NUM, x2: NUM, y2: NUM, cx: NUM, cy: NUM, r: NUM, rx: NUM, ry: NUM, width: NUM, height: NUM,
    "stroke-width": NUM, "font-size": NUM, "font-style": /^(normal|italic)$/, "font-weight": /^(normal|bold|\d{3})$/,
    "font-family": /^[\w\s,'"-]{0,80}$/, "text-anchor": /^(start|middle|end)$/, fill: /^(none|currentColor)$/, stroke: /^(none|currentColor)$/,
    "class": /^[\w\s-]*$/, viewBox: /^[\d\s.,eE+\-]*$/
  };
  var ENT = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"};
  function decode(s){
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, function(all, e){
      if (e[0] === "#"){ var c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; }
      return ENT[e] !== undefined ? ENT[e] : "";
    });
  }
  // "<svg …>…</svg>" → {tag: "svg", a: {…}, kids: [{tag, a, kids, text}]}。知らない要素は中身ごと捨て、知らない属性・色・参照も捨てる
  function parseSvg(src){
    var re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
    var root = null, stack = [], skip = 0, m;
    src = String(src || "");
    while ((m = re.exec(src))){
      if (m[5] !== undefined){   // 文字
        var top = stack[stack.length - 1];
        if (!skip && top && (top.tag === "text" || top.tag === "tspan")) top.text = (top.text || "") + decode(m[5]);
        continue;
      }
      if (m[2] === undefined) continue;   // 注釈・宣言
      var tag = m[2], close = m[1] === "/", self = m[4] === "/";
      if (close){
        if (skip){ skip--; continue; }
        if (stack.length && stack[stack.length - 1].tag === tag) stack.pop();
        continue;
      }
      if (skip || !ELS[tag] || (tag === "svg" && root) || (!root && tag !== "svg")){ if (!self) skip++; continue; }
      var a = {}, ar = /([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g, x;
      while ((x = ar.exec(m[3]))){
        var name = x[1], v = decode(x[2] !== undefined ? x[2] : x[3] !== undefined ? x[3] : "").trim();
        if (ATTR[name] && ATTR[name].test(v)) a[name] = v;
      }
      var node = {tag: tag, a: a, kids: []};
      if (!root) root = node; else stack[stack.length - 1].kids.push(node);
      if (!self) stack.push(node);
    }
    if (!root) throw new Error("m-score: abcSvg has no <svg> element");
    return root;
  }
  var cls = function(node){ return (node.a["class"] || "").split(/\s+/).filter(Boolean); };
  var num = function(list, re){ for (var i = 0; i < list.length; i++){ var x = re.exec(list[i]); if (x) return +x[1]; } return null; };
  // 音の名前 "C4" "F#4" "Bb3" → {letter, acc: "" | "#" | "b" | "##" | "bb", oct, midi}。読めなければ null
  function parsePitch(s){
    var m = /^([A-G])(##|bb|#|b|♯|♭)?(-?\d)$/.exec(String(s));
    if (!m) return null;
    var acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : (m[2] || ""), oct = +m[3];
    var off = {"": 0, "#": 1, b: -1, "##": 2, bb: -2}[acc];
    return {letter: m[1], acc: acc, oct: oct, midi: 12 * (oct + 1) + PC[m[1]] + off};
  }
  // 符頭の下の名前（solfa・abc・iroha。none は null）
  function label(p, names){
    if (names === "none" || !p) return null;
    var sign = p.acc.replace(/#/g, "♯").replace(/b/g, "♭");
    if (names === "iroha") return (p.acc === "#" ? "嬰" : p.acc === "b" ? "変" : p.acc === "##" ? "重嬰" : p.acc === "bb" ? "重変" : "") + IROHA[p.letter];
    return (names === "abc" ? p.letter : SOLFA[p.letter]) + sign;
  }
  // abcMap を確かめ、段階に分ける。by = "note" | "measure"。違えば Error（どこが・どう書くか）
  // → {tempo, spb（四分音符 1 つの秒）, notes: [{…, p: [parsePitch], i}], steps: [{notes: [i…], len}], stepOf: [i → 段階], at: [i → 段階の中の秒], sound: [i → 鳴る秒]}
  function plan(map, by){
    if (!map || typeof map !== "object") throw new Error("m-score: abcMap is missing (the build renders abc with abcjs and adds abcSvg and abcMap)");
    if (!(map.tempo > 0)) throw new Error("m-score: abcMap.tempo must be quarter notes per minute (> 0)");
    if (!Array.isArray(map.notes) || !map.notes.length) throw new Error("m-score: abcMap.notes is empty");
    if (by !== "note" && by !== "measure") throw new Error('m-score: by="' + by + '" must be "note" or "measure"');
    var spb = 60 / map.tempo;
    var notes = map.notes.map(function(n, i){
      if (typeof n.cls !== "string" || !/^(abcjs-[\w-]+\s*)+$/.test(n.cls.trim())) throw new Error("m-score: abcMap.notes[" + i + "].cls must be abcjs classes such as \"abcjs-v0 abcjs-mm0 abcjs-n0\"");
      if (!(n.dur > 0)) throw new Error("m-score: abcMap.notes[" + i + "].dur must be > 0 (quarter note = 1)");
      var p = (n.pitch || []).map(function(s){
        var q = parsePitch(s);
        if (!q) throw new Error("m-score: abcMap.notes[" + i + "].pitch \"" + s + "\" is not a pitch such as C4, F#4, Bb3");
        return q;
      });
      return {i: i, cls: n.cls.trim().split(/\s+/), m: n.m, beat: n.beat || 0, dur: n.dur, box: n.box || null, tie: n.tie === true && p.length > 0, p: p, raw: n};
    });
    // タイ：つながった先の分も鳴らす（鳴るのは始めの音符だけ）
    var sound = notes.map(function(n, i){
      if (!n.p.length || n.tie) return 0;
      var d = n.dur;
      for (var j = i + 1; j < notes.length && notes[j].tie; j++) d += notes[j].dur;
      return d * spb;
    });
    var steps = [], stepOf = [], at = [];
    if (by === "note") notes.forEach(function(n){ stepOf[n.i] = steps.length + 1; at[n.i] = 0; steps.push({notes: [n.i], len: n.dur * spb}); });
    else notes.forEach(function(n){
      var last = steps[steps.length - 1];
      if (!last || last.m !== n.m){ last = {m: n.m, notes: [], len: 0, b0: n.beat}; steps.push(last); }
      last.notes.push(n.i); stepOf[n.i] = steps.length;
      at[n.i] = Math.max(0, (n.beat - last.b0) * spb);
      last.len = Math.max(last.len, at[n.i] + n.dur * spb);
    });
    steps.forEach(function(s){ s.len = +s.len.toFixed(6); delete s.b0; });
    return {tempo: map.tempo, spb: spb, notes: notes, steps: steps, stepOf: stepOf, at: at, sound: sound};
  }
  // 段階 k の音：音の高さ 1 つに 1 つの note（和音は同じ t）。休符・タイの先は鳴らない
  function events(pl, k){
    var s = pl.steps[k - 1], out = [];
    if (!s) return out;
    s.notes.forEach(function(i){
      var n = pl.notes[i];
      if (!pl.sound[i]) return;
      n.p.forEach(function(p){
        var name = p.letter + p.acc + p.oct;
        out.push({t: +pl.at[i].toFixed(6), sound: "note", pitch: /^[A-G][#b]?-?\d$/.test(name) ? name : p.midi, dur: +pl.sound[i].toFixed(6), vel: 0.7});
      });
    });
    return out;
  }
  // 名前の置き場所（DOM を使わない）：音符ごとに {i, x（符頭の箱の真ん中、楽譜の座標）, rows: [{s, r（下へ何行目）}]}。
  // 和音は高い音を上の行に。休符とタイの先は名前なし
  function names(pl, mode){
    var out = [];
    if (mode === "none") return out;
    pl.notes.forEach(function(n){
      if (!n.p.length || n.tie || !n.box) return;
      var ps = n.p.slice().sort(function(a, b){ return b.midi - a.midi; });
      out.push({i: n.i, x: n.box[0] + n.box[2] / 2, rows: ps.map(function(p, r){ return {s: label(p, mode), r: r}; })});
    });
    return out;
  }
  // 名前を行に置く（px）：x = ox + 楽譜の x × s。和音は高い音が上の行に続けて並ぶ。左の名前と重なるなら、その名前のかたまりを下の行へずらす
  // （八分音符が続くところ）。est(文字, 大きさ) は字の幅の見積もり。→ {labels: [{i, s, x, row}], rows, overlap（ずらしても重なった）}
  function place(items, s, ox, size, est){
    var end = [], labels = [], overlap = false, MAXR = 6;
    items.slice().sort(function(a, b){ return a.x - b.x || a.i - b.i; }).forEach(function(n){
      var x = ox + n.x * s, ws = n.rows.map(function(rw){ return est(rw.s, size); }), c = n.rows.length, o = 0;
      var free = function(o){ for (var r = 0; r < c; r++){ var e = end[o + r]; if (e !== undefined && x - ws[r] / 2 < e + 4) return false; } return true; };
      while (!free(o) && o + c < MAXR) o++;
      if (!free(o)){ overlap = true; o = 0; }
      n.rows.forEach(function(rw, r){ labels.push({i: n.i, s: rw.s, x: x, row: o + r}); end[o + r] = Math.max(end[o + r] === undefined ? -Infinity : end[o + r], x + ws[r] / 2); });
    });
    return {labels: labels, rows: end.length, overlap: overlap};
  }
  // 読める層の文：小節は「｜」、和音は「（ド・ミ・ソ）」、休符は「休み」/「rest」、タイの先は「〜」
  function readable(pl, mode, ja){
    var bars = [], cur = null, lastM;
    pl.notes.forEach(function(n){
      if (!cur || n.m !== lastM){ cur = []; bars.push(cur); lastM = n.m; }
      cur.push(n.tie ? "〜" : !n.p.length ? (ja ? "休み" : "rest") : n.p.length > 1 ? (ja ? "（" : "(") + n.p.map(function(p){ return label(p, mode); }).join("・") + (ja ? "）" : ")") : label(n.p[0], mode));
    });
    return bars.map(function(b){ return b.join(" "); }).join("｜");
  }
  // 要素がどの小節・何番目の音符か（abcjs の class から）
  function where(list){ return {v: num(list, /^abcjs-v(\d+)$/), mm: num(list, /^abcjs-mm(\d+)$/), n: num(list, /^abcjs-n(\d+)$/), l: num(list, /^abcjs-l(\d+)$/), m: num(list, /^abcjs-m(\d+)$/)}; }
  // 線（M・L だけの path）の x の幅（連桁の音符を探す）
  function xRange(d){
    var re = /[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g, x, lo = Infinity, hi = -Infinity;
    while ((x = re.exec(d || ""))){ lo = Math.min(lo, +x[1]); hi = Math.max(hi, +x[1]); }
    return lo <= hi ? [lo, hi] : null;
  }
  // 楽譜の木の要素を、どの音符と一緒に出すか決める（DOM を使わない）。
  // → [{node, i（音符の番号。null なら段階 0 から見える）, note: 音符・休符そのものか}]。
  // 音符・休符：abcMap の cls が全部ある要素。小節線：その小節の最後の音符と。連桁：x が重なる最初の音符と。
  // タイ・スラー（abcjs-start-m…-n… abcjs-end-m…-n…）：終わりの音符と。そのほかの abcjs-mm… の要素：その小節の最初の音符と。
  // 五線・音部記号・調号・拍子・速度（abcjs-staff・abcjs-staff-extra・abcjs-tempo）と、小節のないものは段階 0 から
  function assign(tree, pl){
    var out = [], used = {};
    var byMeasure = {};
    pl.notes.forEach(function(n){ (byMeasure[n.m] = byMeasure[n.m] || []).push(n.i); });
    var find = function(list){
      for (var j = 0; j < pl.notes.length; j++){
        if (used[j]) continue;
        if (pl.notes[j].cls.every(function(c){ return list.indexOf(c) >= 0; })) return j;
      }
      return null;
    };
    var noteAt = function(mm, n){
      var ms = byMeasure[mm] || [];
      for (var j = 0; j < ms.length; j++){ var w = where(pl.notes[ms[j]].cls); if (w.n === n) return ms[j]; }
      return null;
    };
    (function walk(node){
      node.kids.forEach(function(k){
        var list = cls(k);
        if (list.indexOf("abcjs-note") >= 0 || list.indexOf("abcjs-rest") >= 0){
          var j = find(list);
          if (j !== null){ used[j] = true; out.push({node: k, i: j, note: true}); return; }
        }
        var w = where(list), ms = w.mm !== null ? byMeasure[w.mm] : null;
        if (list.indexOf("abcjs-staff") >= 0 || list.indexOf("abcjs-staff-extra") >= 0 || list.indexOf("abcjs-tempo") >= 0){ out.push({node: k, i: null}); return; }
        if (!ms){ if (k.kids.length && w.mm === null) walk(k); else out.push({node: k, i: null}); return; }
        var i = ms[0];
        if (list.indexOf("abcjs-bar") >= 0) i = ms[ms.length - 1];
        else if (list.indexOf("abcjs-beam-elem") >= 0){
          var r = xRange(k.a.d);
          if (r) for (var q = 0; q < ms.length; q++){ var b = pl.notes[ms[q]].box; if (b && b[0] + b[2] >= r[0] - 4 && b[0] <= r[1] + 4){ i = ms[q]; break; } }
        } else {
          var e = num(list, /^abcjs-end-m(\d+)-n\d+$/), en = num(list, /^abcjs-end-m\d+-n(\d+)$/), s = num(list, /^abcjs-start-m(\d+)-n\d+$/);
          if (e !== null && s !== null){ var t = noteAt(w.mm + (e - s), en); if (t !== null) i = t; }
          else if (w.n !== null){ var u = noteAt(w.mm, w.n); if (u !== null) i = u; }
        }
        out.push({node: k, i: i});
      });
    })(tree);
    var missing = pl.notes.filter(function(n){ return !used[n.i]; }).map(function(n){ return n.i; });
    return {parts: out, missing: missing};
  }
  return {place: place, parseSvg: parseSvg, parsePitch: parsePitch, label: label, plan: plan, events: events, names: names, readable: readable, assign: assign, xRange: xRange, where: where};
})();

var FS = 26, ROW = 30;   // 名前の字（24 px 以上）と行の高さ
var est = function(s, size){ return [...String(s)].reduce(function(a, c){ return a + (c === " " ? 0.3 : /[\u0000-ɏ]/.test(c) ? 0.62 : 1); }, 0) * size; };
DECK.define("m-score", class extends DECK.MotionElement {
  static variants = ["light"];
  static sc = SC;
  static build = {fields: {abc: "abcjs"}};
  static shape = {
    schema: {type: "object", additionalProperties: false, required: ["abcSvg", "abcMap"], properties: {
      abc: {type: "string"}, abcSvg: {type: "string"}, renderer: {type: "object"},
      abcMap: {type: "object", required: ["tempo", "notes"], properties: {
        tempo: {type: "number"},
        notes: {type: "array", minItems: 1, items: {type: "object", required: ["cls", "m", "pitch", "beat", "dur"], properties: {
          cls: {type: "string"}, m: {type: "integer"}, pitch: {type: "array", items: {type: "string"}}, beat: {type: "number"}, dur: {type: "number"},
          box: {type: "array", items: {type: "number"}}, tie: {type: "boolean"}}}}}}}},
    example: {abc: "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F |]"},
    note: {en: "write abc (ABC notation); the build adds abcSvg and abcMap (do not write them by hand)",
           ja: "abc（ABC 記譜法）を書く。abcSvg と abcMap は組み立てが足す（手で書かない）"},
  };
  static props = {
    by: {type: "string", default: "note", doc: "note（1 音・和音ずつ）| measure（1 小節ずつ）"},
    names: {type: "string", default: "none", doc: "符頭の下の名前：solfa（ドレミ）| abc | iroha（ハニホ）| none"},
  };
  get steps(){
    if (this.getAttribute("steps") !== null) return +this.getAttribute("steps");
    return this.plan().steps.length;
  }
  plan(){
    if (this._plan) return this._plan;
    var d = this.data || {};
    if (typeof d.abcSvg !== "string" || !d.abcMap) throw new Error("m-score: no abcSvg / abcMap: the build renders abc with abcjs and adds them (a lesson built without that step cannot show the score)");
    var names = this.props.names;
    if (["solfa", "abc", "iroha", "none"].indexOf(names) < 0){ console.warn('m-score: names="' + names + '" is not solfa, abc, iroha or none (none is used)'); names = "none"; }
    var pl = SC.plan(d.abcMap, this.props.by);
    pl.names = names;
    return (this._plan = pl);
  }
  duration(k){ var s = k >= 1 && this.plan().steps[k - 1]; return s ? s.len : 0; }
  events(k){ return SC.events(this.plan(), k); }
  mount(){
    var self = this, D = DECK, pl = this.plan();
    this.variant = VARIANT.of(this);
    this.style.display = "block";
    var W = this.clientWidth, H = this.clientHeight;
    var tree = SC.parseSvg(this.data.abcSvg), as = SC.assign(tree, pl);
    if (as.missing.length) console.warn("m-score: no element in abcSvg has the classes of abcMap.notes[" + as.missing.join(", ") + "] (they are not drawn)");
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true", style: "display:block;overflow:visible"}, this);
    // 楽譜の木を組み直す（許した属性だけ。色は currentColor → color: var(--fg)）
    var mk = function(node, parent){
      var e = document.createElementNS("http://www.w3.org/2000/svg", node.tag);
      for (var k in node.a) e.setAttribute(k, node.a[k]);
      if (node.text) e.textContent = node.text;
      parent.appendChild(e);
      node.kids.forEach(function(c){ mk(c, e); });
      node.el = e;
      return e;
    };
    // 段（abcjs-staff-wrapper abcjs-l…）ごとに g に分け、段の間に名前の帯を入れる
    var lineOf = function(node){ var w = SC.where((node.a["class"] || "").split(/\s+/)); return w.l !== null ? w.l : 0; };
    var lines = {};
    tree.kids.forEach(function(c){ var l = lineOf(c); (lines[l] = lines[l] || []).push(c); });
    var keys = Object.keys(lines).map(Number).sort(function(a, b){ return a - b; });
    var root = D.el("g", {fill: "currentColor", stroke: "currentColor", style: "color:var(--fg)"}, svg);
    var L = keys.map(function(l){
      var g = D.el("g", {}, root);
      lines[l].forEach(function(c){ mk(c, g); });
      var bb = {x: 0, y: 0, width: +tree.a.width || 600, height: +tree.a.height || 100};
      try { var b = g.getBBox(); if (b.height > 0) bb = b; } catch (e) {}
      return {l: l, g: g, top: bb.y, h: bb.height, x0: bb.x, x1: bb.x + bb.width, names: []};
    });
    // 名前（どの段のどの行か）
    var NM = SC.names(pl, pl.names), byNote = {};
    as.parts.forEach(function(p){ if (p.note) byNote[p.i] = p.node; });
    NM.forEach(function(n){
      var node = byNote[n.i], l = node ? lineOf({a: {"class": node.a["class"]}}) : 0;
      var ln = L.filter(function(x){ return x.l === l; })[0] || L[0];
      ln.names.push(n);
    });
    // 大きさ：幅と高さの両方に収める（名前の字は大きさによらず 26 px）。名前の行の数は倍率で変わるので、2 回まで決め直す
    var GAP = 14, cx0 = Math.min.apply(null, L.map(function(ln){ return ln.x0; })), svgW = Math.max.apply(null, L.map(function(ln){ return ln.x1; })) - cx0;
    var sumH = L.reduce(function(a, ln){ return a + ln.h; }, 0);
    L.forEach(function(ln){ ln.rows = ln.names.reduce(function(a, n){ return Math.max(a, n.rows.length); }, 0); });
    var s, ox;
    for (var pass = 0; pass < 3; pass++){
      var fixed = L.reduce(function(a, ln){ return a + (ln.rows ? 10 + ln.rows * ROW : 0); }, 0) + GAP * (L.length - 1);
      s = Math.min((W - 8) / svgW, (H - fixed - 4) / sumH, 3);
      if (!(s > 0)) s = 0.1;
      ox = (W - svgW * s) / 2 - cx0 * s;
      var same = true;
      L.forEach(function(ln){ ln.pl = SC.place(ln.names, s, ox, FS, est); if (ln.pl.rows > ln.rows){ ln.rows = ln.pl.rows; same = false; } });
      if (same) break;
    }
    L.forEach(function(ln){ ln.band = ln.rows ? 10 + ln.rows * ROW : 0; });
    if (s < 0.9) console.warn("m-score: the element (" + W + "×" + H + " px) draws the staff at " + s.toFixed(2) + "× (the staff lines are " + (7.75 * s).toFixed(1) + " px apart); make it larger or show fewer measures");
    var used = sumH * s + L.reduce(function(a, ln){ return a + ln.band; }, 0) + GAP * (L.length - 1), y = Math.max(0, (H - used) / 2);
    this.geo = {s: s, ox: ox, lines: []};
    var gN = D.el("g", {}, svg);
    var labels = [];
    L.forEach(function(ln){
      ln.g.setAttribute("transform", "translate(" + ox.toFixed(2) + " " + (y - ln.top * s).toFixed(2) + ") scale(" + s.toFixed(4) + ")");
      var bottom = y + ln.h * s;
      self.geo.lines.push({top: y, bottom: bottom});
      if (ln.pl.overlap) console.warn("m-score: the names under the notes overlap; make the element wider or use names=\"none\"");
      ln.pl.labels.forEach(function(lb){
        var t = D.el("text", {x: lb.x.toFixed(1), y: (bottom + 8 + FS + lb.row * ROW).toFixed(1), "font-size": FS, "text-anchor": "middle", fill: "var(--fg)", opacity: 0}, gN);
        t.textContent = lb.s;
        labels.push({i: lb.i, el: t});
      });
      y = bottom + ln.band + GAP;
    });
    if (used > H + 1) console.warn("m-score: the score needs " + Math.ceil(used) + " px but the element is " + H + " px high");
    // 出す単位（音符・休符・小節線・連桁・タイ）。段階 0 から見えるものは触らない
    this.U = as.parts.filter(function(p){ return p.i !== null; }).map(function(p){ return {i: p.i, el: p.node.el, note: !!p.note}; });
    this.N = labels;
    // 読める層（画面にも印刷にも出ない）
    var ja = DECK.ja, mode = pl.names !== "none" ? pl.names : (ja ? "solfa" : "abc");
    var sr = document.createElement("p");
    sr.className = "sr-only";
    sr.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0");
    sr.textContent = (ja ? "楽譜：" : "Score: ") + SC.readable(pl, mode, ja);
    this.appendChild(sr);
    var nm = pl.steps.length && this.props.by === "measure" ? pl.steps.length : pl.notes.reduce(function(a, n){ return a.indexOf(n.m) < 0 ? a.concat([n.m]) : a; }, []).length;
    if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", ja ? "楽譜（" + nm + " 小節）" : "Score (" + nm + " measures)");
  }
  render(k, t, ctx){
    var pl = this.plan(), preview = !!(ctx && (ctx.preview || ctx.mode === "lecture"));
    // 薄さはテーマの --preview-opacity（仕様 §8.4「Answers under preview」）。書いていないテーマだけ 0.45
    var FAINT = 0;
    if (preview){ FAINT = parseFloat(getComputedStyle(this).getPropertyValue("--preview-opacity")); if (!(FAINT >= 0 && FAINT <= 1)) FAINT = 0.45; }
    var state = function(i){
      var s = pl.stepOf[i];
      if (s < k) return {o: 1, cur: false};
      if (s > k) return {o: FAINT, cur: false};
      var len = Math.min(0.25, pl.notes[i].dur * pl.spb);
      return {o: t === Infinity ? 1 : DECK.prog(t, pl.at[i], len), cur: true};
    };
    this.U.forEach(function(u){
      var st = state(u.i);
      u.el.setAttribute("opacity", st.o.toFixed(3));
      // 今の段階の音符・休符は --emph、ほかは --fg（親の color）
      if (u.note && st.cur) u.el.setAttribute("style", "color:var(--emph)"); else u.el.removeAttribute("style");
    });
    this.N.forEach(function(n){
      var st = state(n.i);
      n.el.setAttribute("opacity", st.o.toFixed(3));
      n.el.setAttribute("font-weight", st.cur ? 700 : 400);
    });
  }
});
})();

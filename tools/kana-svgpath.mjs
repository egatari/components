// SVG path helpers for data/kana/strokes.ofl.json (no dependencies).
//   parse(d)            -> absolute segments [{c, v}] with c in M L C Q A Z (H V S T are expanded)
//   scale(segs, k)      -> every coordinate times k (arc radii too; angles and flags unchanged)
//   serialize(segs, dp) -> a compact path: one absolute M, then relative commands, numbers rounded to dp decimals.
//                          Coordinates are rounded as absolute positions first and written as differences between
//                          rounded positions, so rounding errors do not add up along a path.
//   reverse(segs)       -> the same path drawn the other way (M L C Q only)
//   sample(d, n)        -> points along the path (arcs included), for lengths, bounds and turning direction
//   length(points)
// Arc flags may be written without separators (svgo writes e.g. "a46 46 0 011 7"), so they are read one character each.

const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;

export function parse(d) {
  if (typeof d !== 'string' || !d.trim()) throw new Error('empty path');
  let i = 0;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => { ws(); const m = d.slice(i).match(NUM); if (!m) throw new Error(`number expected at ${i} in "${d.slice(i, i + 12)}"`); i += m[0].length; return +m[0]; };
  const flag = () => { ws(); const f = d[i]; if (f !== '0' && f !== '1') throw new Error(`arc flag expected at ${i}`); i++; return +f; };
  const out = [];
  let x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null, cmd = null;
  const ARGN = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  for (;;) {
    ws();
    if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) { cmd = d[i++]; if (!(cmd.toUpperCase() in ARGN)) throw new Error(`unsupported command ${cmd}`); }
    else if (!cmd) throw new Error('path must start with a command');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const X = (v) => (rel ? x + v : v), Y = (v) => (rel ? y + v : v);
    if (C === 'Z') { out.push({ c: 'Z', v: [] }); x = sx; y = sy; lc = lq = null; continue; }
    if (C === 'M') { const a = num(), b = num(); x = X(a); y = Y(b); sx = x; sy = y; out.push({ c: 'M', v: [x, y] }); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if (C === 'L') { const a = num(), b = num(); x = X(a); y = Y(b); out.push({ c: 'L', v: [x, y] }); lc = lq = null; continue; }
    if (C === 'H') { const a = num(); x = rel ? x + a : a; out.push({ c: 'L', v: [x, y] }); lc = lq = null; continue; }
    if (C === 'V') { const a = num(); y = rel ? y + a : a; out.push({ c: 'L', v: [x, y] }); lc = lq = null; continue; }
    if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = X(num()); y1 = Y(num()); } else { x1 = lc ? 2 * x - lc[0] : x; y1 = lc ? 2 * y - lc[1] : y; }
      const x2 = X(num()), y2 = Y(num()), ex = X(num()), ey = Y(num());
      out.push({ c: 'C', v: [x1, y1, x2, y2, ex, ey] }); lc = [x2, y2]; lq = null; x = ex; y = ey; continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1;
      if (C === 'Q') { x1 = X(num()); y1 = Y(num()); } else { x1 = lq ? 2 * x - lq[0] : x; y1 = lq ? 2 * y - lq[1] : y; }
      const ex = X(num()), ey = Y(num());
      out.push({ c: 'Q', v: [x1, y1, ex, ey] }); lq = [x1, y1]; lc = null; x = ex; y = ey; continue;
    }
    if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(), ex = X(num()), ey = Y(num());
      out.push({ c: 'A', v: [rx, ry, rot, la, sw, ex, ey] }); lc = lq = null; x = ex; y = ey; continue;
    }
  }
  return out;
}

export function scale(segs, k) {
  return segs.map(({ c, v }) => ({ c, v: c === 'A' ? [v[0] * k, v[1] * k, v[2], v[3], v[4], v[5] * k, v[6] * k] : v.map((n) => n * k) }));
}

export function transform(segs, [a, b, c2, d, e, f]) {   // affine, for M L C Q (arcs only under uniform scale)
  return segs.map(({ c, v }) => {
    if (c === 'A') { const k = Math.sqrt(Math.abs(a * d - b * c2)); return { c, v: [v[0] * k, v[1] * k, v[2], v[3], v[4], a * v[5] + c2 * v[6] + e, b * v[5] + d * v[6] + f] }; }
    const o = [];
    for (let i = 0; i < v.length; i += 2) o.push(a * v[i] + c2 * v[i + 1] + e, b * v[i] + d * v[i + 1] + f);
    return { c, v: o };
  });
}

const fmt = (n, dp) => {
  let s = (Math.round(n * 10 ** dp) / 10 ** dp).toFixed(dp).replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s.replace(/^(-?)0\./, '$1.');
};
// join numbers the way svgo does: no space before a minus sign or before ".5" after a number with a dot
function join(nums) {
  let s = '';
  for (const t of nums) {
    if (!s) { s = t; continue; }
    const prevHasDot = /\.\d*$/.test(s.split(/[-\s]/).pop());
    if (t[0] === '-' || (t[0] === '.' && prevHasDot)) s += t; else s += ' ' + t;
  }
  return s;
}

export function serialize(segs, dp = 1) {
  const r = (n) => Math.round(n * 10 ** dp) / 10 ** dp;
  let out = '', x = 0, y = 0, sx = 0, sy = 0, prev = null;
  for (const { c, v } of segs) {
    if (c === 'M') {
      const nx = r(v[0]), ny = r(v[1]);
      out += 'M' + join([fmt(nx, dp), fmt(ny, dp)]); x = sx = nx; y = sy = ny; prev = 'M'; continue;
    }
    if (c === 'Z') { out += 'z'; x = sx; y = sy; prev = 'z'; continue; }
    let cmd, nums;
    if (c === 'L') {
      const nx = r(v[0]), ny = r(v[1]);
      if (ny === y) { cmd = 'h'; nums = [nx - x]; } else if (nx === x) { cmd = 'v'; nums = [ny - y]; } else { cmd = 'l'; nums = [nx - x, ny - y]; }
      x = nx; y = ny;
    } else if (c === 'C' || c === 'Q') {
      const p = v.map(r);
      cmd = c.toLowerCase(); nums = p.map((n, i) => n - (i % 2 ? y : x));
      x = p[p.length - 2]; y = p[p.length - 1];
    } else { // A
      const nx = r(v[5]), ny = r(v[6]);
      cmd = 'a'; nums = [Math.max(r(v[0]), 10 ** -dp), Math.max(r(v[1]), 10 ** -dp), Math.round(v[2]), v[3], v[4], nx - x, ny - y];
      x = nx; y = ny;
    }
    const strs = nums.map((n) => fmt(n, dp));
    // the command letter can be left out when it repeats (not after M: the implicit command after M is absolute L)
    const same = prev === cmd;
    const body = join(strs);
    out += same ? (body[0] === '-' || (body[0] === '.' && /\.\d*$/.test(out.split(/[a-zA-Z\s-]/).pop())) ? body : ' ' + body) : cmd + body;
    prev = cmd;
  }
  return out;
}

export function reverse(segs) {
  const pts = [];   // [{c, v}] with the start point of each segment
  let x = 0, y = 0;
  for (const s of segs) {
    if (s.c === 'M') { x = s.v[0]; y = s.v[1]; continue; }
    if (s.c === 'A' || s.c === 'Z') throw new Error('reverse: arcs and closepath not supported');
    pts.push({ ...s, from: [x, y] }); x = s.v[s.v.length - 2]; y = s.v[s.v.length - 1];
  }
  const out = [{ c: 'M', v: [x, y] }];
  for (const s of pts.reverse()) {
    if (s.c === 'L') out.push({ c: 'L', v: s.from });
    else if (s.c === 'C') out.push({ c: 'C', v: [s.v[2], s.v[3], s.v[0], s.v[1], ...s.from] });
    else if (s.c === 'Q') out.push({ c: 'Q', v: [s.v[0], s.v[1], ...s.from] });
  }
  return out;
}

// SVG arc (endpoint form) to centre form, then points
function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2, n) {
  const rad = (phi * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [[x2, y2]];
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let k = 1; k <= n; k++) {
    const t = t1 + (dt * k) / n;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return out;
}

export function sample(d, n = 16) {
  const segs = typeof d === 'string' ? parse(d) : d;
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const { c, v } of segs) {
    if (c === 'M') { x = v[0]; y = v[1]; sx = x; sy = y; pts.push([x, y]); continue; }
    if (c === 'Z') { x = sx; y = sy; pts.push([x, y]); continue; }
    if (c === 'L') { x = v[0]; y = v[1]; pts.push([x, y]); continue; }
    if (c === 'C') {
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; pts.push([u ** 3 * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * v[4], u ** 3 * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * v[5]]); }
      x = v[4]; y = v[5]; continue;
    }
    if (c === 'Q') {
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; pts.push([u * u * x + 2 * u * t * v[0] + t * t * v[2], u * u * y + 2 * u * t * v[1] + t * t * v[3]]); }
      x = v[2]; y = v[3]; continue;
    }
    if (c === 'A') { pts.push(...arcPoints(x, y, v[0], v[1], v[2], v[3], v[4], v[5], v[6], n)); x = v[5]; y = v[6]; }
  }
  return pts;
}

// points every `step` units along a sampled polyline
export function densify(pts, step = 0.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

export const length = (pts) => { let a = 0; for (let i = 1; i < pts.length; i++) a += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return a; };

// even-odd point-in-outline test for a path with several contours
export function rings(d) {
  const out = []; let cur = [];
  for (const s of typeof d === 'string' ? parse(d) : d) { if (s.c === 'M' && cur.length) { out.push(sample(cur, 8)); cur = []; } cur.push(s); }
  if (cur.length) out.push(sample(cur, 8));
  return out;
}
const inPoly = (poly, [x, y]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export const inRings = (rs, p) => rs.reduce((c, r) => (inPoly(r, p) ? !c : c), false);
// the part of a stroke's centreline that draws ink: the first piece's centreline, kept where it is inside any of the
// stroke's outlines (strokesvg's lines start and end outside the ink)
export function inkLine(pieces, step = 0.5) {
  const rs = pieces.map(([o]) => rings(o));
  return densify(sample(pieces[0][1], 24), step).filter((p) => rs.some((r) => inRings(r, p)));
}

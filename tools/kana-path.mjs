// Minimal SVG path reader for data/kana/kana.json (used by tools/test-kana-data.mjs and tools/kana-sheet.mjs).
// Supports the commands M L H V Q T C S Z, absolute and relative. parsePath() throws on anything else.
// samplePath() flattens a path into points so callers can measure length, bounds and direction.

const ARGS = { M: 2, L: 2, H: 1, V: 1, Q: 4, T: 2, C: 6, S: 4, Z: 0 };

export function parsePath(d) {
  if (typeof d !== 'string' || !d.trim()) throw new Error('empty path');
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const rest = d.replace(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[\s,]/g, '');
  if (rest) throw new Error(`unexpected characters "${rest}"`);
  const segs = [];
  let i = 0, cmd = null;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (!(cmd.toUpperCase() in ARGS)) throw new Error(`unsupported command ${cmd}`);
      if (!segs.length && cmd.toUpperCase() !== 'M') throw new Error('path must start with M');
      if (cmd.toUpperCase() === 'Z') { segs.push({ cmd, args: [] }); continue; }
    } else if (cmd === null) throw new Error('path must start with a command');
    const n = ARGS[cmd.toUpperCase()];
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length !== n || args.some((v) => !Number.isFinite(v))) throw new Error(`${cmd} needs ${n} numbers`);
    segs.push({ cmd, args });
    i += n;
    if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';  // implicit lineto after moveto
  }
  return segs;
}

// Flatten to a polyline: [[x, y], ...] (n samples per curve segment)
export function samplePath(d, n = 24) {
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null, qx = null, qy = null;
  const push = (px, py) => pts.push([px, py]);
  for (const { cmd, args } of parsePath(d)) {
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ax = (v) => (rel ? x + v : v), ay = (v) => (rel ? y + v : v);
    if (C === 'M') { x = ax(args[0]); y = ay(args[1]); sx = x; sy = y; push(x, y); cx = qx = null; continue; }
    if (C === 'Z') { x = sx; y = sy; push(x, y); cx = qx = null; continue; }
    if (C === 'L' || C === 'H' || C === 'V') {
      if (C === 'L') { x = ax(args[0]); y = ay(args[1]); } else if (C === 'H') x = rel ? x + args[0] : args[0]; else y = rel ? y + args[0] : args[0];
      push(x, y); cx = qx = null; continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1, ex, ey;
      if (C === 'Q') { x1 = ax(args[0]); y1 = ay(args[1]); ex = ax(args[2]); ey = ay(args[3]); }
      else { x1 = qx === null ? x : 2 * x - qx; y1 = qy === null ? y : 2 * y - qy; ex = ax(args[0]); ey = ay(args[1]); }
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey); }
      qx = x1; qy = y1; cx = null; x = ex; y = ey; continue;
    }
    // C / S
    let x1, y1, x2, y2, ex, ey;
    if (C === 'C') { x1 = ax(args[0]); y1 = ay(args[1]); x2 = ax(args[2]); y2 = ay(args[3]); ex = ax(args[4]); ey = ay(args[5]); }
    else { x1 = cx === null ? x : 2 * x - cx; y1 = cy === null ? y : 2 * y - cy; x2 = ax(args[0]); y2 = ay(args[1]); ex = ax(args[2]); ey = ay(args[3]); }
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
    }
    cx = x2; cy = y2; qx = null; x = ex; y = ey;
  }
  return pts;
}

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// Point and unit direction at fraction f (0..1) of the length
export function pointAt(pts, f) {
  const total = pathLength(pts), target = total * f;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg > 0 && acc + seg >= target) {
      const t = (target - acc) / seg;
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dx: (x1 - x0) / seg, dy: (y1 - y0) / seg };
    }
    acc += seg;
  }
  const [xa, ya] = pts[pts.length - 2] || pts[0], [xb, yb] = pts[pts.length - 1], s = Math.hypot(xb - xa, yb - ya) || 1;
  return { x: xb, y: yb, dx: (xb - xa) / s, dy: (yb - ya) / s };
}

# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]>=4.50", "skia-pathops>=0.8", "shapely>=2.0"]
# ///
"""Per-stroke glyphs for the Egatari Kana font (OFL; derived from Klee One).

For each character of data/kana/kana.json, cut the font's own outline into one glyph per stroke and add them to a
copy of the font at Private Use Area code points (from U+F0000). The cut is done inside the font, from its own
outline; the MIT data gives only where each stroke runs (our centrelines) and how wide its ink is (`w`):

  band_i   = our centreline i widened by w/2 + MARGIN (per third of the stroke), round ends
  stroke_i = outline ∩ band_i                         (so at a crossing it keeps its own full width, overlap included)
  rest     = outline − ∪ band_i                       (blobs at the ends, edges where the line is a little off)
             each piece of the rest goes to the stroke whose centreline is nearest to it
  => ∪ stroke_i = outline exactly, and stroke_i holds another stroke's ink only where the two inks overlap
     (plus MARGIN at the edges of the overlap).

Run with uv (the dependencies above are installed in a throw-away environment):
  uv run tools/kana-stroke-glyphs.py --font IN.woff2 --out OUT.woff2 --map MAP.json [--chars あいう] [--margin 0.6]
The output font and the map stay outside the repository (the font is OFL, the map lists code points only).
"""
import argparse, json, math, re
from pathlib import Path as FPath

from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.basePen import BasePen
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
import pathops
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import unary_union

ROOT = FPath(__file__).resolve().parent.parent
ASC = 880  # typo ascender: y 0 of the 0–100 box
PUA0 = 0xF0000
EDGE_SMOOTH = 'median'  # 'median': constant edges per side; 'local': cleaned readings along the stroke
CROSS = 1.2           # an edge reading more than CROSS x the stroke's median on that side is a crossing
WIDTH_MODE = 'edges'   # 'edges': the stroke's own edges read from the outline; 'max': widest third of w


# --- our SVG paths (M L Q C, absolute) -> points in the 0–100 box -------------------------------------------------
def sample(d, n=40):
    toks = re.findall(r'[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)', d)
    pts, i, cmd, x, y = [], 0, None, 0.0, 0.0
    N = {'M': 2, 'L': 2, 'Q': 4, 'C': 6}
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
        a = [float(v) for v in toks[i:i + N[cmd]]]; i += N[cmd]
        if cmd == 'M':
            x, y = a; pts.append((x, y)); cmd = 'L'; continue
        if cmd == 'L':
            pts.append((a[0], a[1])); x, y = a[0], a[1]; continue
        for k in range(1, n + 1):
            t = k / n; u = 1 - t
            if cmd == 'Q':
                p = (u * u * x + 2 * u * t * a[0] + t * t * a[2], u * u * y + 2 * u * t * a[1] + t * t * a[3])
            else:
                p = (u ** 3 * x + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t ** 3 * a[4],
                     u ** 3 * y + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t ** 3 * a[5])
            pts.append(p)
        x, y = a[-2], a[-1]
    return pts


def to_font(p):  # 0–100 box -> font units
    return (p[0] * 10, ASC - p[1] * 10)


def band(d, widths, margin, pieces=48):
    """our centreline widened by w/2 + margin (font units). The widths are given per third of the stroke's length;
    between the thirds' middles the width changes linearly, so the band has no steps."""
    pts = [to_font(p) for p in sample(d)]
    line = LineString(pts)
    L = line.length
    n = len(widths)
    def width_at(s):  # s in 0..1
        x = s * n - 0.5
        if x <= 0: return widths[0]
        if x >= n - 1: return widths[-1]
        j = int(x); t = x - j
        return widths[j] * (1 - t) + widths[j + 1] * t
    parts = []
    for k in range(pieces):
        a, b = L * k / pieces, L * (k + 1) / pieces
        seg = LineString([line.interpolate(a).coords[0], line.interpolate((a + b) / 2).coords[0], line.interpolate(b).coords[0]])
        parts.append(seg.buffer((width_at((k + 0.5) / pieces) / 2 + margin) * 10, quad_segs=8))
    return unary_union(parts).simplify(1.0), line


def edge_band(d, outline_poly, margin, n=72, reach=14.0):
    """The stroke's own edges, extended straight through crossings (font units).

    At n points along our centreline, a line across the stroke (perpendicular, ±reach units) is cut by the outline;
    the piece that holds the centreline point gives the stroke's left and right edge there. Where another stroke
    crosses, that piece runs long on one side or both: such readings (more than CROSS x the stroke's median on that
    side) are dropped and filled in linearly from the nearest good ones, so the edges run straight on through the
    crossing. The band joins the edge points (plus margin) and gets round ends at both tips."""
    pts = [to_font(p) for p in sample(d)]
    line = LineString(pts)
    L = line.length
    S = [line.interpolate(L * k / (n - 1)) for k in range(n)]
    left, right, normals = [], [], []
    for k, p in enumerate(S):
        a = line.interpolate(max(0, L * k / (n - 1) - 5)); b = line.interpolate(min(L, L * k / (n - 1) + 5))
        tx, ty = b.x - a.x, b.y - a.y; tl = math.hypot(tx, ty) or 1
        nx, ny = -ty / tl, tx / tl
        normals.append((nx, ny))
        cut = LineString([(p.x - nx * reach * 10, p.y - ny * reach * 10), (p.x + nx * reach * 10, p.y + ny * reach * 10)]).intersection(outline_poly)
        pieces = [cut] if cut.geom_type == 'LineString' else [g for g in getattr(cut, 'geoms', []) if g.geom_type == 'LineString']
        hit = next((g for g in pieces if g.distance(p) < 1e-6), None)
        if hit is None and pieces: hit = min(pieces, key=lambda g: g.distance(p))
        if hit is None or hit.is_empty:
            left.append(None); right.append(None); continue
        c0, c1 = hit.coords[0], hit.coords[-1]
        d0 = (c0[0] - p.x) * nx + (c0[1] - p.y) * ny; d1 = (c1[0] - p.x) * nx + (c1[1] - p.y) * ny
        lo, hi = min(d0, d1), max(d0, d1)
        right.append(hi); left.append(-lo)
    def clean(v):
        good = [x for x in v if x is not None and x > 0]
        if not good: return [27.5] * len(v)
        med = sorted(good)[len(good) // 2]
        v = [x if (x is not None and 0 < x <= CROSS * med) else None for x in v]
        idx = [i for i, x in enumerate(v) if x is not None]
        if not idx: return [med] * len(v)
        out = []
        for i in range(len(v)):
            if v[i] is not None: out.append(v[i]); continue
            lo = max([j for j in idx if j < i], default=None); hi = min([j for j in idx if j > i], default=None)
            if lo is None: out.append(v[hi])
            elif hi is None: out.append(v[lo])
            else: out.append(v[lo] + (v[hi] - v[lo]) * (i - lo) / (hi - lo))
        # then a running median (window 7) evens out what is left of a crossing's edge
        return [sorted(out[max(0, i - 3):i + 4])[len(out[max(0, i - 3):i + 4]) // 2] for i in range(len(out))]
    if EDGE_SMOOTH == 'median':
        # one left and one right edge distance for the whole stroke: the median reading on each side. A crossing
        # (or a stroke running alongside) only lengthens a minority of readings, so the median is the stroke's own.
        lm = sorted(x for x in left if x)[len([x for x in left if x]) // 2] if any(left) else 27.5
        rm = sorted(x for x in right if x)[len([x for x in right if x]) // 2] if any(right) else 27.5
        left, right = [lm] * n, [rm] * n
    else:
        left, right = clean(left), clean(right)
    m = margin * 10
    quads = []
    for k in range(n - 1):
        (n0x, n0y), (n1x, n1y) = normals[k], normals[k + 1]
        p0, p1 = S[k], S[k + 1]
        q = Polygon([(p0.x - n0x * (left[k] + m), p0.y - n0y * (left[k] + m)), (p1.x - n1x * (left[k + 1] + m), p1.y - n1y * (left[k + 1] + m)),
                     (p1.x + n1x * (right[k + 1] + m), p1.y + n1y * (right[k + 1] + m)), (p0.x + n0x * (right[k] + m), p0.y + n0y * (right[k] + m))])
        quads.append(q.buffer(0))
    quads.append(S[0].buffer((left[0] + right[0]) / 2 + m, quad_segs=8))
    quads.append(S[-1].buffer((left[-1] + right[-1]) / 2 + m, quad_segs=8))
    return unary_union(quads).buffer(0).simplify(1.0), line


def outline_polygon(outline):
    """the outline (pathops path) as a shapely geometry, holes included"""
    rp = RecordingPen(); outline.draw(rp)
    rings, cur = [], None
    fp = None
    for op, args in rp.value:
        if op == 'moveTo':
            fp = FlatPen(); fp.moveTo(args[0])
        elif op in ('lineTo',): fp.lineTo(args[0])
        elif op == 'qCurveTo': fp.qCurveTo(*args)
        elif op == 'curveTo': fp.curveTo(*args)
        elif op in ('closePath', 'endPath'):
            if fp and len(fp.pts) >= 3: rings.append(Polygon(fp.pts).buffer(0))
            fp = None
    geom = None
    for r in rings:  # even-odd on the simplified outline: xor the rings
        geom = r if geom is None else geom.symmetric_difference(r)
    return geom


def poly_to_path(geom):
    path = pathops.Path()
    polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            cs = list(ring.coords)
            path.moveTo(*cs[0])
            for c in cs[1:-1]: path.lineTo(*c)
            path.close()
    path.fillType = pathops.FillType.EVEN_ODD
    path.simplify()
    return path


class FlatPen(BasePen):
    """flatten a contour to points (for its centroid)"""
    def __init__(self): super().__init__(None); self.pts = []
    def _moveTo(self, p): self.pts.append(p)
    def _lineTo(self, p): self.pts.append(p)
    def _curveToOne(self, a, b, c):
        p0 = self._getCurrentPoint()
        for k in range(1, 9):
            t = k / 8; u = 1 - t
            self.pts.append((u**3*p0[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t**3*c[0], u**3*p0[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t**3*c[1]))
    def _qCurveToOne(self, a, b):
        p0 = self._getCurrentPoint()
        for k in range(1, 9):
            t = k / 8; u = 1 - t
            self.pts.append((u*u*p0[0]+2*u*t*a[0]+t*t*b[0], u*u*p0[1]+2*u*t*a[1]+t*t*b[1]))


def stroke_paths(gs, gname, strokes, margin):
    outline = pathops.Path()
    gs[gname].draw(outline.getPen())
    outline.simplify()
    bands, lines, bpolys = [], [], []
    opoly = outline_polygon(outline)
    for s in strokes:
        if WIDTH_MODE == 'edges':
            bpoly, line = edge_band(s['d'], opoly, margin)
            bands.append(poly_to_path(bpoly)); lines.append(line); bpolys.append(bpoly)
            continue
        w = s.get('w') or [5.5, 5.5, 5.5]
        # `w` reads low in a third that holds a crossing (ink there is shared); the cut uses the stroke's widest third
        # along the whole stroke, so the band never falls inside the stroke's own ink
        if WIDTH_MODE == 'max': w = [max(w)] * len(w)
        bpoly, line = band(s['d'], w, margin)
        bands.append(poly_to_path(bpoly)); lines.append(line); bpolys.append(bpoly)
    parts = [pathops.op(outline, b, pathops.PathOp.INTERSECTION) for b in bands]
    # the band's typical half-width: its area over twice the centreline's length
    halfw = [bp.area / (2 * ln.length) if ln.length else 0 for bp, ln in zip(bpolys, lines)]
    allb = bands[0]
    for b in bands[1:]: allb = pathops.op(allb, b, pathops.PathOp.UNION)
    rest = pathops.op(outline, allb, pathops.PathOp.DIFFERENCE)
    # each piece of the rest (an edge sliver just outside a band, or a blob at a stroke's end) goes to the stroke
    # whose band it lies against: the band nearest to most of the piece, by sample points inside it
    for contour in rest.contours:
        fp = FlatPen(); contour.draw(fp)
        if len(fp.pts) < 3: continue
        poly = Polygon(fp.pts)
        if poly.area < 1: continue
        poly = poly.buffer(0)
        x0, y0, x1, y1 = poly.bounds
        votes = [0] * len(bpolys)
        step = max(4.0, min(x1 - x0, y1 - y0) / 6)
        y = y0 + step / 2
        while y < y1:
            x = x0 + step / 2
            while x < x1:
                pt = Point(x, y)
                if poly.contains(pt):
                    # nearest stroke by distance to its centreline less its half-width (its own edge)
                    votes[min(range(len(lines)), key=lambda i: lines[i].distance(pt) - halfw[i])] += 1
                x += step
            y += step
        if not any(votes):
            c = poly.representative_point(); votes[min(range(len(lines)), key=lambda i: lines[i].distance(c) - halfw[i])] = 1
        k = votes.index(max(votes))
        piece = pathops.Path(); contour.draw(piece.getPen())
        parts[k] = pathops.op(parts[k], piece, pathops.PathOp.UNION)
    return outline, parts


def add_cmap(font, mapping):
    cmap = font['cmap']
    t12 = next((t for t in cmap.tables if t.format == 12 and t.platformID == 3 and t.platEncID == 10), None)
    if t12 is None:
        t12 = CmapSubtable.newSubtable(12)
        t12.platformID, t12.platEncID, t12.language = 3, 10, 0
        base = next(t for t in cmap.tables if t.platformID == 3 and t.platEncID == 1)
        t12.cmap = dict(base.cmap)
        cmap.tables.append(t12)
    t12.cmap.update(mapping)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--font', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--map', required=True)
    ap.add_argument('--data', default=str(ROOT / 'data' / 'kana' / 'kana.json'))
    ap.add_argument('--chars', default=None)
    ap.add_argument('--margin', type=float, default=0.6)
    a = ap.parse_args()
    chars = json.load(open(a.data, encoding='utf8'))['chars']
    font = TTFont(a.font)
    gs = font.getGlyphSet(); best = font.getBestCmap()
    glyf, hmtx = font['glyf'], font['hmtx']
    order = font.getGlyphOrder()
    mapping, table, stats = {}, {}, {}
    cp = PUA0
    for ch, c in chars.items():
        if a.chars and ch not in a.chars: continue
        gname = best[ord(ch)]
        outline, parts = stroke_paths(gs, gname, c['strokes'], a.margin)
        cps = []
        for i, p in enumerate(parts):
            name = f'{gname}.s{i + 1}'
            pen = TTGlyphPen(None)
            p.draw(Cu2QuPen(pen, 1.0, reverse_direction=False))
            g = pen.glyph()
            glyf[name] = g
            if name not in order: order.append(name)
            g.recalcBounds(glyf)
            hmtx[name] = (hmtx[gname][0], getattr(g, 'xMin', 0))   # left side bearing = xMin, or renderers shift it
            if 'vmtx' in font: font['vmtx'][name] = font['vmtx'][gname]
            mapping[cp] = name; cps.append(cp); cp += 1
        table[ch] = cps
        stats[ch] = sum(len(glyf[best[ord(ch)]].getCoordinates(glyf)[0]) for _ in [0]), [len(glyf[f'{gname}.s{i+1}'].getCoordinates(glyf)[0]) for i in range(len(parts))]
    font.setGlyphOrder(order)
    if 'post' in font: font['post'].formatType = 3.0  # no glyph-name strings needed
    add_cmap(font, mapping)
    font.flavor = 'woff2'
    font.save(a.out)
    json.dump({'first': f'U+{PUA0:X}', 'last': f'U+{cp - 1:X}', 'chars': {k: [f'{v:X}' for v in vs] for k, vs in table.items()}},
              open(a.map, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    pts_o = sum(v[0] for v in stats.values()); pts_s = sum(sum(v[1]) for v in stats.values())
    print(f'kana-stroke-glyphs: {len(table)} characters, {cp - PUA0} stroke glyphs (U+{PUA0:X}–U+{cp - 1:X}); '
          f'points {pts_o} in the originals, {pts_s} in the stroke glyphs; wrote {a.out}')


if __name__ == '__main__':
    main()

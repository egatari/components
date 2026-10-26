// Map data for m-map-world (docs/map-design.md §4.5, §4.8, §5, §6): the countries and regions of the world from Natural
// Earth 5.1.1's Japan point-of-view admin-0 (public domain), projected (Equal Earth, centred on 150°E), simplified and quantized
// here, and written into components/map-world/index.js between the BEGIN/END map-world-data lines (an Egatari file records the
// sha256 of index.js only, spec §6, so the data is inside it).
//
//   node tools/map/build-world.mjs [--cache dir]            rebuild: download into the cache (default tools/map/.cache/; sha256
//                                                           checked), build, check ownership, write the block and world.sha256
//   node tools/map/build-world.mjs [--cache dir] --compare  rebuild in memory and fail if it differs from the committed block
//   node tools/map/build-world.mjs [--cache dir] --block f  rebuild and write the block alone to f (nothing else is written)
//   node tools/map/build-world.mjs --check                  no network, no dependencies: the block in index.js has the sha256
//                                                           recorded in world.sha256 (npm test runs this; tools/test-all.mjs)
// The rebuild needs `npm ci` in tools/map/ (mapshaper and d3-geo, pinned in tools/map/package-lock.json) and `unzip`. The
// download is data only: nothing in it is run (mapshaper reads the .shp/.dbf; README.html is not opened).
//
// Data changes (map-design §4.5, the Japanese government's position; a fixed property of the data, not a per-lesson switch):
//   - Natural Earth's Japan POV admin-0 already has the Northern Territories (国後・択捉・色丹・歯舞), 竹島 and 尖閣諸島 in JPN
//     (checked below on the source and on the final geometry)
//   - 南樺太 (Sakhalin south of 50°N) and the Kuril Islands from 得撫島 (Urup) north to 占守島 (Shumshu) are taken out of RUS
//     into a new feature XUD, 帰属未定地 (§4.5 3. 1): drawn in the ground colour (white), never coloured by a lesson, with no
//     country name; the four boundary lines (北緯50度, 宗谷海峡, 択捉島と得撫島の間, 占守島とカムチャツカ半島の間) are kept as
//     separate dashed lines (§4.5 2-2)
//   - names: tools/map/atlas-names.csv (map-design §4.8), the one table of names; ATLAS_name replaces NAME_JA (13 rows differ)
// Islands that vanish at slide scale (竹島, 魚釣島 = 尖閣諸島, 沖ノ鳥島, 南鳥島) are drawn as points of Japan (FIXED).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(path.dirname(HERE));
const TARGET = path.join(ROOT, 'components', 'map-world', 'index.js');
const SHAFILE = path.join(HERE, 'world.sha256');
const NAMES = path.join(HERE, 'atlas-names.csv');
const ci = process.argv.indexOf('--cache');
const CACHE = ci >= 0 ? path.resolve(process.argv[ci + 1]) : path.join(HERE, '.cache');
export const BEGIN = '// ---- BEGIN map-world-data ';
export const END = '// ---- END map-world-data ----';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// Natural Earth 5.1.1 (VERSION.txt), 1:10m, Japan point of view. The same file as tools/map/build-japan.mjs (sha256 of 2026-10-25)
const SOURCE = { name: 'ne_10m_admin_0_countries_jpn', url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_jpn.zip',
  sha256: 'd9dde4daa1b51fef2ee76b7e7ab86eb0f5deffc6bacb64dd9cacdd6cec6e880c' };

// The projection (map-design §3.1, §5.3, §6 2): Equal Earth, central meridian 150°E (Pacific-centred; the seam is at 30°W),
// on the sphere, one unit ≈ 1 km (d3-geo's geoEqualEarth, scale 6371). The component projects points with the same formula.
const PROJ = { lon0: 150, k: 6371 };
export function ee(P) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2, r = Math.PI / 180;
  return (lon, lat) => {
    const lam = ((((lon - P.lon0) % 360) + 540) % 360 - 180) * r, l = Math.asin(M * Math.sin(lat * r)), l2 = l * l, l6 = l2 * l2 * l2;
    return [P.k * lam * Math.cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))), -P.k * l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2))];
  };
}
// Simplification (planar Visvalingam, interval in km; map-design §3.1: Japan and its surroundings finer, the rest coarse).
// Rings smaller than MIN_AREA km² (after projection) are dropped before simplifying, except the largest ring of each feature
// (a small country keeps its main island) and the rings of FINE features
const FINE = ['JPN', 'XUD'];
const SIMPLIFY = { fine: 2, coarse: 22 };
const MIN_AREA = { fine: 4, coarse: 1500 };
// The world's groups (中学校の六州): Natural Earth's REGION_UN, with the Americas split by SUBREGION (South America → 南アメリカ州,
// the rest → 北アメリカ州). Antarctica and XUD are in none
export const GROUPS = [['asia', 'アジア州'], ['europe', 'ヨーロッパ州'], ['africa', 'アフリカ州'], ['north-america', '北アメリカ州'], ['south-america', '南アメリカ州'], ['oceania', 'オセアニア州']];
const groupOf = (p) => ({ Asia: 'asia', Europe: 'europe', Africa: 'africa', Oceania: 'oceania' })[p.REGION_UN]
  || (p.REGION_UN === 'Americas' ? (/South America|Seven seas/.test(p.SUBREGION) ? 'south-america' : 'north-america') : '');
// Islands that must always be drawn and vanish at slide scale: drawn as points of Japan (name, lon, lat, owner, territory name)
export const FIXED = [['竹島', 131.868, 37.241, 'JPN', '竹島'], ['魚釣島', 123.476, 25.745, 'JPN', '尖閣諸島'],
  ['沖ノ鳥島', 136.082, 20.425, 'JPN', '沖ノ鳥島'], ['南鳥島', 153.981, 24.287, 'JPN', '南鳥島']];
// XUD (帰属未定地): Sakhalin south of LAT50, and the Kuril rings of RUS whose centre lies in KURIL (lon/lat box; 得撫島 to 占守島)
const LAT50 = 50;
const KURIL = [149.5, 45.5, 157.0, 51.0];
// The four boundary lines of XUD (map-design §4.5 2-2), lon/lat; the 50°N line is the cut across Sakhalin (made below).
// The sea lines run across the strait between the coasts and must not touch land (checked)
const SEA_LINES = [
  ['宗谷海峡', [[141.35, 45.76], [142.45, 45.66]]],
  ['択捉島と得撫島の間', [[148.95, 45.85], [149.45, 45.25]]],
  ['占守島とカムチャツカ半島の間', [[156.25, 51.0], [156.85, 50.72]]],
];
// Ownership checks (map-design §4.5 3. 検査, and more): name, lon, lat, expected ADM0_A3. A point counts as owned by the
// feature that contains it, or by the nearest one within the tolerance (small islands are a few km off their true position)
export const CHECKS = [
  ['国後島', 146.252, 44.353, 'JPN'], ['択捉島', 147.95, 45.05, 'JPN'], ['色丹島', 146.75, 43.80, 'JPN'], ['志発島', 146.16, 43.49, 'JPN'],
  ['竹島', 131.868, 37.241, 'JPN'], ['魚釣島', 123.476, 25.745, 'JPN'], ['北海道', 142.8, 43.4, 'JPN'], ['沖縄島', 127.80, 26.35, 'JPN'],
  ['豊原', 142.73, 46.96, 'XUD'], ['南樺太（北緯49度）', 142.6, 49.0, 'XUD'], ['得撫島', 150.0, 45.9, 'XUD'], ['幌筵島', 155.6, 50.35, 'XUD'], ['占守島', 156.3, 50.75, 'XUD'],
  ['北樺太（北緯51度）', 143.0, 51.0, 'RUS'], ['オハ', 142.95, 53.58, 'RUS'], ['カムチャツカ半島', 158.65, 53.02, 'RUS'], ['ウラジオストク', 131.9, 43.12, 'RUS'],
  ['台湾', 121.0, 23.7, 'TWN'], ['北京', 116.4, 39.9, 'CHN'], ['ソウル', 126.98, 37.57, 'KOR'], ['平壌', 125.75, 39.03, 'PRK'],
  ['クリミア半島', 34.1, 44.95, 'UKR'], ['西サハラ', -13.0, 24.5, 'SAH'], ['コソボ', 20.9, 42.6, 'KOS'],
  ['グリーンランド（西）', -40, 72, 'GRL'], ['グリーンランド（東）', -25, 74, 'GRL'],
];

const lf = (s) => s.replace(/\r\n?/g, '\n');
export function block(text) {
  const a = text.indexOf(BEGIN);
  if (a < 0) return null;
  const e = text.indexOf(END, a);
  return e < 0 ? null : { start: a, end: e + END.length };
}

// ---------------------------------------------------------------- check (npm test): no network, no dependencies
function check() {
  const text = lf(fs.readFileSync(TARGET, 'utf8')), b = block(text);
  if (!b) { console.log('FAIL components/map-world/index.js: no map-world-data block'); return 1; }
  const want = fs.readFileSync(SHAFILE, 'utf8').match(/^([0-9a-f]{64})\s+block/m);
  const got = sha(text.slice(b.start, b.end));
  if (!want || want[1] !== got) { console.log(`FAIL the map-world-data block in components/map-world/index.js has sha256 ${got}, world.sha256 records ${want ? want[1] : 'none'} (rebuild with node tools/map/build-world.mjs; the data is generated, do not edit it by hand)`); return 1; }
  console.log(`map-world data: ok (block sha256 ${got.slice(0, 16)}…)`);
  return 0;
}

// ---------------------------------------------------------------- rebuild
async function download() {
  fs.mkdirSync(CACHE, { recursive: true });
  const s = SOURCE, zip = path.join(CACHE, s.name + '.zip');
  if (!fs.existsSync(zip)) {
    console.log(`download ${s.url}`);
    const r = await fetch(s.url);
    if (!r.ok) throw new Error(`${s.url}: HTTP ${r.status}`);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  }
  const h = sha(fs.readFileSync(zip));
  if (h !== s.sha256) throw new Error(`${s.name}.zip: sha256 ${h}, expected ${s.sha256} (delete the cache to download again; if Natural Earth changed the file, review the data before updating SOURCE)`);
  const dir = path.join(CACHE, s.name);
  if (!fs.existsSync(path.join(dir, s.name + '.shp'))) {
    const u = spawnSync('unzip', ['-o', '-q', zip, '-d', dir], { stdio: 'inherit' });
    if (u.status !== 0) throw new Error(`unzip ${zip} failed`);
  }
  const v = fs.readFileSync(path.join(dir, s.name + '.VERSION.txt'), 'utf8').trim();
  if (v !== '5.1.1') throw new Error(`${s.name}: VERSION.txt is ${v}, expected 5.1.1`);
  return path.join(dir, s.name + '.shp');
}

// The names table (map-design §4.8): ADM0_A3 → {ne: NE_NAME_JA, name: ATLAS_name}. A small CSV reader (quoted fields)
function readNames() {
  const rows = [], text = lf(fs.readFileSync(NAMES, 'utf8'));
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift(), col = (n) => head.indexOf(n), out = {};
  for (const r of rows) out[r[col('ADM0_A3')]] = { ne: r[col('NE_NAME_JA')], name: r[col('ATLAS_name')] };
  return out;
}

// Planar helpers (rings are arrays of [x, y])
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
function inRing(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h));
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const ringDist = (p, r) => { let d = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, segDist(p, r[j], r[i])); return d; };
const polyDist = (p, poly) => Math.min(...poly.map((r) => ringDist(p, r)));
const bboxOf = (pts) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const q of pts) a = [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])]; return a; };
const centre = (r) => { const b = bboxOf(r); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
function owner(p, byId, tol) {
  let best = null, bd = Infinity;
  for (const [id, polys] of Object.entries(byId)) for (const poly of polys) {
    if (inPoly(p, poly)) return { id, d: 0 };
    const b = bboxOf(poly[0]);
    if (p[0] < b[0] - tol || p[0] > b[2] + tol || p[1] < b[1] - tol || p[1] > b[3] + tol) continue;
    const d = polyDist(p, poly);
    if (d < bd) { bd = d; best = id; }
  }
  return bd <= tol ? { id: best, d: bd } : { id: null, d: bd };
}
// The point inside a set of polygons farthest from their edges (a grid search refined around the best cell)
function interior(polys) {
  const all = polys.flatMap((p) => p[0]), b = bboxOf(all);
  let best = centre(all), bd = -1, step = Math.max(b[2] - b[0], b[3] - b[1]) / 40, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, span = Math.max(b[2] - b[0], b[3] - b[1]) / 2 + step;
  for (let pass = 0; pass < 4; pass++) {
    for (let x = cx - span; x <= cx + span; x += step) for (let y = cy - span; y <= cy + span; y += step) {
      const p = [x, y];
      if (!polys.some((poly) => inPoly(p, poly))) continue;
      const d = Math.min(...polys.map((poly) => polyDist(p, poly)));
      if (d > bd) { bd = d; best = p; }
    }
    cx = best[0]; cy = best[1]; span = step * 2; step /= 5;
  }
  return { p: best, r: bd };
}
// A ring cut at a latitude (Sutherland–Hodgman against one horizontal line; lon/lat). keep: 'south' or 'north'
function cutLat(ring, lat, keep) {
  const inside = (q) => (keep === 'south' ? q[1] <= lat : q[1] >= lat), out = [], cuts = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (lat - a[1]) / (b[1] - a[1]), x = [a[0] + (b[0] - a[0]) * t, lat]; out.push(x); cuts.push(x[0]); }
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
  return { ring: out, cuts };
}

// Compact numbers: a zigzag varint per integer, 5 bits per character (32–63 continue, 0–31 end). No quote or backslash
const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
function enc(v) { let z = v < 0 ? -2 * v - 1 : 2 * v, s = ''; while (z >= 32) { s += ALPH[32 + (z & 31)]; z = Math.floor(z / 32); } return s + ALPH[z]; }
function dec(s) { const out = []; let v = 0, sh = 1; for (const c of s) { const d = ALPH.indexOf(c); if (d >= 32) { v += (d - 32) * sh; sh *= 32; } else { v += d * sh; out.push(v % 2 ? -(v + 1) / 2 : v / 2); v = 0; sh = 1; } } return out; }

async function rebuild() {
  const shp = await download();
  const ms = (await import('mapshaper')).default;
  const d3 = await import('d3-geo');
  const run = async (cmd, file, input) => JSON.parse((await ms.applyCommands(cmd, input))[file]);
  const a0 = await run(`-i ${shp} encoding=utf8 -filter-fields ADM0_A3,ISO_A3,NAME_JA,REGION_UN,SUBREGION -o format=geojson a0.json`, 'a0.json');
  const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  let bad = 0;

  // 1. names (map-design §4.8): every feature is in the table, with the same NAME_JA
  const names = readNames();
  const feats = {};
  for (const f of a0.features) {
    const p = f.properties, n = names[p.ADM0_A3];
    if (!n) throw new Error(`atlas-names.csv has no row for ${p.ADM0_A3} (${p.NAME_JA})`);
    if (n.ne !== p.NAME_JA) throw new Error(`atlas-names.csv: ${p.ADM0_A3} NE_NAME_JA ${n.ne}, the data has ${p.NAME_JA}`);
    if (!n.name) throw new Error(`atlas-names.csv: ${p.ADM0_A3} has no ATLAS_name`);
    if (feats[p.ADM0_A3]) throw new Error(`two features ${p.ADM0_A3}`);
    feats[p.ADM0_A3] = { id: p.ADM0_A3, iso: /^[A-Z]{3}$/.test(p.ISO_A3) ? p.ISO_A3 : '', name: n.name, ne: p.NAME_JA, group: groupOf(p), polys: polysOf(f.geometry) };
  }
  const renamed = Object.values(feats).filter((f) => f.name !== f.ne);
  say(`names: ${Object.keys(feats).length} features; ${renamed.length} renamed from NAME_JA (atlas-names.csv): ${renamed.map((f) => `${f.id} ${f.ne}→${f.name}`).join(', ')}`);
  for (const f of Object.values(feats)) if (!f.group && !['ATA'].includes(f.id)) say(`note: ${f.id} ${f.name} is in no group`);

  // 2. XUD (帰属未定地): South Sakhalin and the Kurils from 得撫島 north, out of RUS (map-design §4.5 3. 1)
  const rus = feats.RUS, keep = [], xud = [];
  let line50 = null, sakhalin = 0;
  for (const poly of rus.polys) {
    const b = bboxOf(poly[0]), c = centre(poly[0]);
    if (b[0] > 141 && b[2] < 145.5 && b[1] < LAT50 && b[3] > LAT50 && b[1] > 45) {
      if (poly.length > 1) throw new Error('the Sakhalin ring has holes; cutting it needs a polygon clipper');
      const s = cutLat(poly[0], LAT50, 'south'), n = cutLat(poly[0], LAT50, 'north');
      if (s.cuts.length !== 2) throw new Error(`Sakhalin crosses 50°N ${s.cuts.length} times (expected 2)`);
      xud.push([s.ring]); keep.push([n.ring]); sakhalin++;
      const w = Math.min(...s.cuts), e = Math.max(...s.cuts);
      line50 = ['北緯50度', [[w - 0.25, LAT50], [e + 0.25, LAT50]]];
      continue;
    }
    if (c[0] >= KURIL[0] && c[0] <= KURIL[2] && c[1] >= KURIL[1] && c[1] <= KURIL[3] && b[2] - b[0] < 2) { xud.push(poly); continue; }
    // islands near South Sakhalin (海馬島 and the like) would be 判断事項 (map-design §4.6 5): none in the 1:10m data; stop if any appear
    if (c[0] > 140.5 && c[0] < 146 && c[1] > 45.4 && c[1] < LAT50) throw new Error(`a RUS ring near South Sakhalin (${c.map((v) => v.toFixed(2))}): map-design §4.6 5 is unresolved`);
    keep.push(poly);
  }
  if (sakhalin !== 1) throw new Error(`${sakhalin} Sakhalin rings found, expected 1`);
  const kurils = xud.length - 1;
  if (kurils < 12 || kurils > 16) throw new Error(`${kurils} Kuril rings found (expected about 14)`);
  rus.polys = keep;
  feats.XUD = { id: 'XUD', iso: '', name: '', group: '', polys: xud };
  say(`XUD: South Sakhalin (cut at ${LAT50}°N) and ${kurils} Kuril rings (得撫島 to 占守島) taken out of RUS`);

  // 3. ownership on the source data (lon/lat)
  const geoById = Object.fromEntries(Object.values(feats).map((f) => [f.id, f.polys]));
  for (const [name, lon, lat, want] of CHECKS) {
    const o = owner([lon, lat], geoById, 0.05), ok = o.id === want || (o.id === null && FIXED.some((x) => x[0] === name && x[3] === want));
    if (!ok) bad++;
    say(`${ok ? 'ok  ' : 'FAIL'} source: ${name} (${lon}, ${lat}) → ${o.id || 'none'}${o.d ? ` (nearest, ${o.d.toFixed(3)}°)` : ''}, expected ${want}`);
  }
  for (const [name, coords] of SEA_LINES) for (let u = 0; u <= 40; u++) {
    const p = [coords[0][0] + (coords[1][0] - coords[0][0]) * u / 40, coords[0][1] + (coords[1][1] - coords[0][1]) * u / 40];
    const o = owner(p, geoById, 0);
    if (o.id) { bad++; say(`FAIL the line ${name} touches ${o.id} at ${p.map((v) => v.toFixed(2))}`); break; }
  }

  // 4. project (d3-geo, which cuts polygons at the seam, 30°W) and check the component's formula against it
  const P = ee(PROJ), proj = d3.geoEqualEarth().rotate([-PROJ.lon0, 0]).scale(PROJ.k).translate([0, 0]);
  for (const [lon, lat] of [[123, 24], [139.7, 35.7], [-74, 40.7], [0, 51.5], [-29, -50], [18, -34], [151.2, -33.9], [-150, 61]]) {
    const a = P(lon, lat), b = proj([lon, lat]);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) throw new Error(`the component's projection differs from d3-geo at ${lon},${lat}: ${a} vs ${b}`);
  }
  // rings out of d3's stream, then grouped into polygons (outer rings and their holes) by containment
  const project = (polys) => {
    const rings = [];
    let ring = null, inPolygon = false;
    const sink = { polygonStart() { inPolygon = true; }, polygonEnd() { inPolygon = false; }, lineStart() { ring = []; },
      point(x, y) { ring.push([x, y]); }, lineEnd() { if (inPolygon && ring.length >= 3) rings.push(ring); }, sphere() {} };
    const st = proj.stream(sink);
    // d3-geo wants the outer ring clockwise and holes anticlockwise (Natural Earth's shapefile rings are read the other way round)
    const wind = (r, cw) => ((ringArea(r) > 0) === cw ? r : r.slice().reverse());
    d3.geoStream({ type: 'MultiPolygon', coordinates: polys.map((p) => p.map((r, i) => wind(r, i === 0))) }, st);
    const rs = rings.map((r) => ({ r, a: Math.abs(ringArea(r)) })).sort((x, y) => y.a - x.a), out = [];
    for (const x of rs) {
      const p0 = x.r[0], holders = out.filter((poly) => inRing(p0, poly[0]));
      if (holders.length % 2 === 1) holders[holders.length - 1].push(x.r); else out.push([x.r]);
    }
    return out;
  };
  const full = {};
  for (const f of Object.values(feats)) full[f.id] = project(f.polys);
  for (const [name, lon, lat, want] of CHECKS) {
    const o = owner(P(lon, lat), full, 5), ok = o.id === want || (o.id === null && FIXED.some((x) => x[0] === name && x[3] === want));
    if (!ok) { bad++; say(`FAIL projected: ${name} → ${o.id || 'none'}, expected ${want}`); }
  }

  // 5. drop small rings, simplify (planar Visvalingam; Japan and XUD finer), quantize to integers
  let dropped = 0;
  const gj = [];
  for (const f of Object.values(feats)) {
    const fine = FINE.includes(f.id), polys = full[f.id].slice().sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    const kept = polys.filter((p, i) => i === 0 || Math.abs(ringArea(p[0])) >= MIN_AREA[fine ? 'fine' : 'coarse']);
    dropped += polys.length - kept.length;
    if (kept.length) gj.push({ type: 'Feature', properties: { id: f.id, fine: fine ? 1 : 0 }, geometry: { type: 'MultiPolygon', coordinates: kept } });
  }
  say(`small rings dropped before simplifying: ${dropped}`);
  const out = await ms.applyCommands(`-i in.json -simplify planar variable interval='fine ? ${SIMPLIFY.fine} : ${SIMPLIFY.coarse}' keep-shapes -o format=topojson no-quantization precision=0.001 out.json`,
    { 'in.json': JSON.stringify({ type: 'FeatureCollection', features: gj }) });
  const topo = JSON.parse(out['out.json']), obj = Object.values(topo.objects)[0];
  const arcs = topo.arcs.map((a) => { const r = []; for (const p of a) { const q = [Math.round(p[0]), Math.round(p[1])]; if (!r.length || q[0] !== r[r.length - 1][0] || q[1] !== r[r.length - 1][1]) r.push(q); } return r; });
  const fts = obj.geometries.filter((g) => g.arcs).map((g) => ({ id: g.properties.id, polys: g.type === 'Polygon' ? [g.arcs] : g.arcs }));
  fts.sort((a, b) => a.id.localeCompare(b.id));
  const ringOf = (idx) => { const r = []; for (const i of idx) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; r.push(...(r.length ? a.slice(1) : a)); } return r; };
  const polysOfFeat = (f) => f.polys.map((p) => p.map(ringOf)).filter((p) => p[0].length >= 4 && Math.abs(ringArea(p[0])) > 0);
  const byId = {};
  for (const f of fts) byId[f.id] = polysOfFeat(f);
  const lost = Object.keys(feats).filter((id) => !byId[id] || !byId[id].length);
  if (lost.length) say(`note: no shape left at slide scale (values and regions for these are not drawn; the component warns): ${lost.join(', ')}`);
  let npts = 0; for (const a of arcs) npts += a.length;
  say(`geometry: ${fts.length} features, ${arcs.length} arcs, ${npts} points (rings < ${MIN_AREA.coarse} km² dropped; interval ${SIMPLIFY.coarse} km, ${SIMPLIFY.fine} km for ${FINE.join(' and ')})`);

  // 6. ownership on the final geometry: contained, or nearest within 30 km; vanished islands need a FIXED point
  for (const [name, lon, lat, want] of CHECKS) {
    const o = owner(P(lon, lat), byId, 30), fx = FIXED.find((f) => f[0] === name);
    if (o.id === want) say(`ok   final geometry: ${name} → ${o.id}${o.d ? ` (nearest, ${o.d.toFixed(1)} km)` : ''}`);
    else if (o.id === null && fx && fx[3] === want) say(`ok   final geometry: ${name} has no polygon at slide scale; drawn as the fixed point of ${want}`);
    else if (o.id === null && fx) { bad++; say(`FAIL final geometry: ${name} fixed point owner ${fx[3]}, expected ${want}`); }
    else { bad++; say(`FAIL final geometry: ${name} → ${o.id || 'none'}${o.d ? ` (${o.d.toFixed(1)} km)` : ''}, expected ${want}`); }
  }
  // the Northern Territories keep their shapes (they are drawn as land of Japan, not as points)
  for (const [name, lon, lat] of CHECKS.slice(0, 4)) { const o = owner(P(lon, lat), byId, 3); if (o.id !== 'JPN') { bad++; say(`FAIL ${name} has no shape of JPN within 3 km`); } }
  if (bad) throw new Error(`${bad} check(s) failed`);

  // 7. bounds (the whole sphere), label anchors (interior point of the largest part) and group anchors
  const sph = []; for (let la = -90; la <= 90; la += 1) { sph.push(P(PROJ.lon0 + 179.999, la)); sph.push(P(PROJ.lon0 - 179.999, la)); }
  const sb = bboxOf(sph), pad = 4;
  const bounds = [sb[0] - pad, sb[1] - pad, sb[2] - sb[0] + 2 * pad, sb[3] - sb[1] + 2 * pad].map(Math.round);
  const anchors = {};
  for (const f of fts) {
    const ps = polysOfFeat(f).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    if (!ps.length) continue;
    anchors[f.id] = interior(ps.slice(0, 1)).p.map(Math.round);
  }
  // the group's label point: the interior point of its largest few countries (Russia is left out of Europe's: it would put the name in Siberia)
  const gAnchors = {};
  for (const [g] of GROUPS) {
    const ps = fts.filter((f) => feats[f.id].group === g && f.id !== 'RUS').flatMap(polysOfFeat).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    gAnchors[g] = interior(ps.slice(0, g === 'europe' ? 20 : 6)).p.map(Math.round);
  }
  const lines = [line50].concat(SEA_LINES).map(([n, c]) => [n, c.map((q) => P(q[0], q[1]).map(Math.round))]);

  // 8. the block
  let arcStr = '';
  for (const a of arcs) { arcStr += enc(a.length); let px = 0, py = 0; for (const [x, y] of a) { arcStr += enc(x - px) + enc(y - py); px = x; py = y; } }
  if (dec(arcStr).length !== arcs.length + 2 * npts) throw new Error('arc encoding does not round-trip');
  const J = (v) => JSON.stringify(v);
  const list = Object.values(feats).sort((a, b) => a.id.localeCompare(b.id)).map((f) => [f.id, f.iso, f.name, f.group]);
  const text = [
    `${BEGIN}(generated by tools/map/build-world.mjs from Natural Earth 5.1.1, public domain; do not edit by hand) ----`,
    `// Natural Earth ne_10m_admin_0_countries_jpn (Japan's point of view) with XUD (帰属未定地: 南樺太・得撫島以北の千島列島) out of RUS,`,
    `// names from tools/map/atlas-names.csv, projected (Equal Earth, 150°E, 1 unit ≈ 1 km), simplified (Visvalingam ${SIMPLIFY.coarse} km;`,
    `// ${SIMPLIFY.fine} km for ${FINE.join(', ')}) and quantized to integers. arcs: zigzag varints (ALPH), per arc: count, then x, y deltas`,
    `var MAP = {`,
    `  proj: ${J(PROJ)},`,
    `  alph: ${J(ALPH)},`,
    `  bounds: ${J(bounds)},`,
    `  list: ${J(list)},`,
    `  groups: ${J(GROUPS.map(([id, n]) => [id, n, gAnchors[id]]))},`,
    `  fixed: ${J(FIXED.map((f) => [f[4], f[1], f[2], f[3]]))},`,
    `  lines: ${J(lines.map((l) => l[1]))},`,
    `  anchors: ${J(anchors)},`,
    `  feats: ${J(fts.map((f) => [f.id, f.polys]))},`,
    `  arcs: "${arcStr}"`,
    `};`,
    END,
  ].join('\n');
  say(`block: ${text.length} bytes (arcs ${arcStr.length})`);
  return { text, log };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) process.exit(check());
  const { text } = await rebuild();
  const bi = process.argv.indexOf('--block');
  if (bi >= 0) { fs.writeFileSync(process.argv[bi + 1], text + '\n'); process.exit(0); }   // the block alone (to look at it)
  const cur = lf(fs.readFileSync(TARGET, 'utf8')), b = block(cur);
  if (process.argv.includes('--compare')) {
    const same = b && cur.slice(b.start, b.end) === text;
    console.log(same ? 'map-world data: the rebuild equals the committed block' : 'FAIL the rebuild differs from the committed block');
    process.exit(same ? 0 : 1);
  }
  let next;
  if (b) next = cur.slice(0, b.start) + text + cur.slice(b.end);
  else if (cur.includes('\n@@MAPDATA@@\n')) next = cur.replace('\n@@MAPDATA@@\n', '\n' + text + '\n');
  else throw new Error('components/map-world/index.js: no map-world-data block and no @@MAPDATA@@ line');
  fs.writeFileSync(TARGET, next);
  fs.writeFileSync(SHAFILE, `${sha(text)}  block (components/map-world/index.js, between the BEGIN/END map-world-data lines)\n${SOURCE.sha256}  ${SOURCE.name}.zip\n${sha(fs.readFileSync(NAMES))}  atlas-names.csv\n`);
  console.log('wrote components/map-world/index.js and tools/map/world.sha256');
}

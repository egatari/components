// Map data for m-map-japan (docs/map-design.md §4.5, §5): the 47 prefectures of Japan from Natural Earth 5.1.1 (public domain),
// projected, simplified and quantized here, and written into components/map-japan/index.js between the BEGIN/END
// map-japan-data lines (an Egatari file records the sha256 of index.js only, spec §6, so the data is inside it).
//
//   node tools/map/build-japan.mjs            rebuild: download (cached in tools/map/.cache/, sha256 checked), build, check
//                                             ownership, write the block into index.js and its sha256 into japan.sha256
//   node tools/map/build-japan.mjs --compare  rebuild in memory and fail if it differs from the committed block (no write)
//   node tools/map/build-japan.mjs --check    no network, no dependencies: the block in index.js has the sha256 recorded in
//                                             japan.sha256 (npm test runs this; tools/test-all.mjs)
// The rebuild needs `npm ci` in tools/map/ (mapshaper and d3-geo, pinned in tools/map/package-lock.json) and `unzip`.
//
// Data changes (map-design §4.5, the Japanese government's position; fixed, not a per-lesson switch):
//   - the Northern Territories (国後・択捉・色丹・歯舞): Natural Earth's admin-1 puts them in RUS-2616; they are moved to 北海道 (01)
//   - 竹島: not in admin-1; its ring is taken from the Japan point-of-view admin-0 (ne_10m_admin_0_countries_jpn) into 島根県 (32)
//   - 尖閣諸島: already in 沖縄県 (47) in admin-1 (checked below)
//   - only Japan's 47 prefectures are kept
// Islands that vanish at slide scale are also drawn as points from FIXED (§3.2, §5.3), and every key point of §4.5's
// 検査 item is checked against the final geometry: the build fails if any is owned by the wrong prefecture.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(path.dirname(HERE));
const TARGET = path.join(ROOT, 'components', 'map-japan', 'index.js');
const SHAFILE = path.join(HERE, 'japan.sha256');
const CACHE = path.join(HERE, '.cache');
export const BEGIN = '// ---- BEGIN map-japan-data ';
export const END = '// ---- END map-japan-data ----';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// Natural Earth 5.1.1 (VERSION.txt in each zip), 1:10m. The sha256 values are of the files downloaded on 2026-10-25
const SOURCES = [
  { name: 'ne_10m_admin_1_states_provinces', url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip',
    sha256: 'efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05' },
  { name: 'ne_10m_admin_0_countries_jpn', url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_jpn.zip',
    sha256: 'd9dde4daa1b51fef2ee76b7e7ab86eb0f5deffc6bacb64dd9cacdd6cec6e880c' },
];

// The prefectures: JIS code → name (checked against Natural Earth's name_ja), prefectural office (lon, lat; flows and
// points written with a code start there), and the 八地方区分 (九州地方 includes 沖縄県)
export const PREFS = [
  ['01', '北海道', 141.347, 43.064], ['02', '青森県', 140.740, 40.824], ['03', '岩手県', 141.153, 39.704], ['04', '宮城県', 140.872, 38.269],
  ['05', '秋田県', 140.102, 39.719], ['06', '山形県', 140.364, 38.240], ['07', '福島県', 140.468, 37.750], ['08', '茨城県', 140.447, 36.342],
  ['09', '栃木県', 139.884, 36.566], ['10', '群馬県', 139.061, 36.391], ['11', '埼玉県', 139.649, 35.857], ['12', '千葉県', 140.123, 35.605],
  ['13', '東京都', 139.692, 35.690], ['14', '神奈川県', 139.642, 35.448], ['15', '新潟県', 139.023, 37.902], ['16', '富山県', 137.211, 36.695],
  ['17', '石川県', 136.626, 36.594], ['18', '福井県', 136.222, 36.065], ['19', '山梨県', 138.568, 35.664], ['20', '長野県', 138.181, 36.651],
  ['21', '岐阜県', 136.722, 35.391], ['22', '静岡県', 138.383, 34.977], ['23', '愛知県', 136.907, 35.180], ['24', '三重県', 136.509, 34.730],
  ['25', '滋賀県', 135.868, 35.004], ['26', '京都府', 135.756, 35.021], ['27', '大阪府', 135.520, 34.686], ['28', '兵庫県', 135.183, 34.691],
  ['29', '奈良県', 135.833, 34.685], ['30', '和歌山県', 135.167, 34.226], ['31', '鳥取県', 134.238, 35.504], ['32', '島根県', 133.051, 35.472],
  ['33', '岡山県', 133.935, 34.662], ['34', '広島県', 132.459, 34.397], ['35', '山口県', 131.471, 34.186], ['36', '徳島県', 134.559, 34.066],
  ['37', '香川県', 134.043, 34.340], ['38', '愛媛県', 132.766, 33.842], ['39', '高知県', 133.531, 33.560], ['40', '福岡県', 130.418, 33.607],
  ['41', '佐賀県', 130.299, 33.249], ['42', '長崎県', 129.873, 32.745], ['43', '熊本県', 130.742, 32.790], ['44', '大分県', 131.612, 33.238],
  ['45', '宮崎県', 131.424, 31.911], ['46', '鹿児島県', 130.558, 31.560], ['47', '沖縄県', 127.681, 26.212],
];
export const GROUPS = [
  ['hokkaido', '北海道地方', ['01']], ['tohoku', '東北地方', ['02', '03', '04', '05', '06', '07']],
  ['kanto', '関東地方', ['08', '09', '10', '11', '12', '13', '14']], ['chubu', '中部地方', ['15', '16', '17', '18', '19', '20', '21', '22', '23']],
  ['kinki', '近畿地方', ['24', '25', '26', '27', '28', '29', '30']], ['chugoku', '中国地方', ['31', '32', '33', '34', '35']],
  ['shikoku', '四国地方', ['36', '37', '38', '39']], ['kyushu', '九州地方', ['40', '41', '42', '43', '44', '45', '46', '47']],
];
// Islands that must always be drawn (map-design §5.3) and vanish at slide scale: drawn as points (lon, lat, prefecture).
// 父島 and 硫黄島 are added because the 小笠原 inset is drawn at a smaller scale, where they vanish too
export const FIXED = [
  ['竹島', 131.868, 37.241, '32'], ['魚釣島', 123.476, 25.745, '47'], ['沖ノ鳥島', 136.082, 20.425, '13'], ['南鳥島', 153.981, 24.287, '13'],
  ['父島', 142.20, 27.07, '13'], ['硫黄島', 141.32, 24.78, '13'],
];
// Ownership checks (map-design §4.5 3. 検査, the points in Japan): name, lon, lat, expected prefecture. A point counts as
// owned by the prefecture that contains it, or by the nearest one within 5 km (Natural Earth's 1:10m rings of the
// smallest islands are a few km off their true position)
export const CHECKS = [
  ['国後島', 146.252, 44.353, '01'], ['択捉島', 147.95, 45.05, '01'], ['色丹島', 146.75, 43.80, '01'], ['志発島', 146.16, 43.49, '01'],
  ['竹島', 131.868, 37.241, '32'], ['魚釣島', 123.476, 25.745, '47'],
  // and the islands of other prefectures (Natural Earth puts 奄美群島 in 沖縄県; see AMAMI)
  ['奄美大島', 129.40, 28.30, '46'], ['徳之島', 128.95, 27.80, '46'], ['与論島', 128.42, 27.04, '46'], ['喜界島', 129.97, 28.32, '46'],
  ['沖縄島', 127.80, 26.35, '47'], ['伊平屋島', 127.97, 27.05, '47'], ['宮古島', 125.30, 24.78, '47'], ['石垣島', 124.17, 24.42, '47'], ['与那国島', 122.99, 24.46, '47'],
  ['屋久島', 130.53, 30.35, '46'], ['種子島', 130.97, 30.60, '46'], ['対馬', 129.33, 34.42, '42'], ['佐渡島', 138.38, 38.05, '15'],
  ['隠岐（島後）', 133.30, 36.25, '32'], ['淡路島', 134.83, 34.38, '28'], ['小豆島', 134.27, 34.50, '37'], ['利尻島', 141.24, 45.18, '01'],
  ['奥尻島', 139.47, 42.15, '01'], ['八丈島', 139.79, 33.11, '13'], ['父島', 142.20, 27.07, '13'], ['硫黄島', 141.32, 24.77, '13'],
];
// Natural Earth 5.1.1's admin-1 has 奄美群島 (喜界島・奄美大島・加計呂麻島・徳之島・沖永良部島・与論島) inside JP-47 沖縄県; they are
// 鹿児島県 (46). Rings of JP-47 east of 128.35°E and north of 27.0°N are moved to 46 (硫黄鳥島, 128.23°E, stays in 沖縄県)
const AMAMI = { from: '47', to: '46', minLon: 128.35, minLat: 27.0 };

// The projection (map-design §5.3): Lambert conformal conic, standard parallels 30° and 42°, central meridian 136°E,
// on the sphere (d3-geo's geoConicConformal), scaled so that one unit is about 1 km. The component projects points with
// the same formula (LCC in the block); the rebuild checks the two agree.
const PROJ = { lon0: 136, lat1: 30, lat2: 42, k: 6371 };
export function lcc(P) {
  const r = Math.PI / 180, y0 = P.lat1 * r, y1 = P.lat2 * r, f = (y) => Math.tan((Math.PI / 2 + y) / 2);
  const n = Math.log(Math.cos(y0) / Math.cos(y1)) / Math.log(f(y1) / f(y0)), F = Math.cos(y0) * Math.pow(f(y0), n) / n;
  return (lon, lat) => { const q = F / Math.pow(f(lat * r), n), a = n * (lon - P.lon0) * r; return [P.k * q * Math.sin(a), -P.k * (F - q * Math.cos(a))]; };
}

// Insets (map-design §5.3, layout="inset"): polygons and points inside a lon/lat box are moved by (dx, dy) in projected
// units, into a framed box. ryukyu = 南西諸島 (沖縄県 and 鹿児島県's islands south of 28.9°N), ogasawara = 小笠原諸島 with
// 沖ノ鳥島 and 南鳥島 (東京都). The positions (dx, dy, frame) are set below after projecting.
const INSETS = [
  { id: 'ryukyu', name: '南西諸島', box: [122, 23.5, 132, 28.9] },
  { id: 'ogasawara', name: '小笠原諸島', box: [135, 19.5, 155, 28.9] },
];
const SIMPLIFY = 1.0;   // Visvalingam interval in projected units (≈ km); map-design §6 9: the finer level

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
  if (!b) { console.log('FAIL components/map-japan/index.js: no map-japan-data block'); return 1; }
  const want = fs.readFileSync(SHAFILE, 'utf8').match(/^([0-9a-f]{64})\s+block/m);
  const got = sha(text.slice(b.start, b.end));
  if (!want || want[1] !== got) { console.log(`FAIL the map-japan-data block in components/map-japan/index.js has sha256 ${got}, japan.sha256 records ${want ? want[1] : 'none'} (rebuild with node tools/map/build-japan.mjs; the data is generated, do not edit it by hand)`); return 1; }
  console.log(`map-japan data: ok (block sha256 ${got.slice(0, 16)}…)`);
  return 0;
}

// ---------------------------------------------------------------- rebuild
async function download() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const s of SOURCES) {
    const zip = path.join(CACHE, s.name + '.zip');
    if (!fs.existsSync(zip)) {
      console.log(`download ${s.url}`);
      const r = await fetch(s.url);
      if (!r.ok) throw new Error(`${s.url}: HTTP ${r.status}`);
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    }
    const h = sha(fs.readFileSync(zip));
    if (h !== s.sha256) throw new Error(`${s.name}.zip: sha256 ${h}, expected ${s.sha256} (delete tools/map/.cache/ to download again; if Natural Earth changed the file, review the data before updating SOURCES)`);
    const dir = path.join(CACHE, s.name);
    if (!fs.existsSync(path.join(dir, s.name + '.shp'))) {
      const u = spawnSync('unzip', ['-o', '-q', zip, '-d', dir], { stdio: 'inherit' });
      if (u.status !== 0) throw new Error(`unzip ${zip} failed`);
    }
    const v = fs.readFileSync(path.join(dir, s.name + '.VERSION.txt'), 'utf8').trim();
    if (v !== '5.1.1') throw new Error(`${s.name}: VERSION.txt is ${v}, expected 5.1.1`);
  }
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
const centroid = (r) => { const b = bboxOf(r); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
// The owner of a point among {code: [polygons]}: the prefecture that contains it, else the nearest one within tol
function owner(p, byCode, tol) {
  let best = null, bd = Infinity;
  for (const [code, polys] of Object.entries(byCode)) for (const poly of polys) {
    if (inPoly(p, poly)) return { code, d: 0 };
    const d = polyDist(p, poly);
    if (d < bd) { bd = d; best = code; }
  }
  return bd <= tol ? { code: best, d: bd } : { code: null, d: bd };
}
// The point inside a set of polygons farthest from their edges (a grid search refined around the best cell)
function interior(polys) {
  const all = polys.flatMap((p) => p[0]), b = bboxOf(all);
  let best = null, bd = -1, step = Math.max(b[2] - b[0], b[3] - b[1]) / 40, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, span = Math.max(b[2] - b[0], b[3] - b[1]) / 2 + step;
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

// Compact numbers: a zigzag varint per integer, 5 bits per character (32–63 continue, 0–31 end). No quote or backslash
const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
function enc(v) { let z = v < 0 ? -2 * v - 1 : 2 * v, s = ''; while (z >= 32) { s += ALPH[32 + (z & 31)]; z = Math.floor(z / 32); } return s + ALPH[z]; }
function dec(s) { const out = []; let v = 0, sh = 1; for (const c of s) { const d = ALPH.indexOf(c); if (d >= 32) { v += (d - 32) * sh; sh *= 32; } else { v += d * sh; out.push(v % 2 ? -(v + 1) / 2 : v / 2); v = 0; sh = 1; } } return out; }

async function rebuild() {
  await download();
  const ms = (await import('mapshaper')).default;
  const d3 = await import('d3-geo');
  const shp = (n) => path.join(CACHE, n, n + '.shp');
  const run = async (cmd, file) => JSON.parse((await ms.applyCommands(cmd))[file]);
  const a1 = await run(`-i ${shp('ne_10m_admin_1_states_provinces')} encoding=utf8 -filter "adm0_a3=='JPN' || adm1_code=='RUS-2616'" -filter-fields iso_3166_2,name_ja,adm1_code -o format=geojson a1.json`, 'a1.json');
  const a0 = await run(`-i ${shp('ne_10m_admin_0_countries_jpn')} encoding=utf8 -filter "ADM0_A3=='JPN'" -filter-fields ADM0_A3 -o format=geojson a0.json`, 'a0.json');
  const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  // 1. the 47 prefectures (lon/lat), names checked
  const geo = {};
  for (const f of a1.features) {
    if (f.properties.adm1_code === 'RUS-2616') continue;
    const code = f.properties.iso_3166_2.replace(/^JP-/, '');
    const pr = PREFS.find((p) => p[0] === code);
    if (!pr) throw new Error(`admin-1: unknown ${f.properties.iso_3166_2}`);
    if (pr[1] !== f.properties.name_ja) throw new Error(`admin-1 ${code}: name_ja ${f.properties.name_ja}, expected ${pr[1]}`);
    geo[code] = polysOf(f.geometry);
  }
  if (Object.keys(geo).length !== 47) throw new Error(`admin-1: ${Object.keys(geo).length} prefectures, expected 47`);
  const am = geo[AMAMI.from].filter((p) => { const b = bboxOf(p[0]); return b[0] >= AMAMI.minLon && b[1] >= AMAMI.minLat; });
  geo[AMAMI.from] = geo[AMAMI.from].filter((p) => !am.includes(p));
  geo[AMAMI.to] = geo[AMAMI.to].concat(am);
  say(`奄美群島: ${am.length} rings moved from 沖縄県 (47) to 鹿児島県 (46) (Natural Earth's admin-1 puts them in 47)`);
  // 2. the Northern Territories: RUS-2616's rings east of Hokkaido and west of 得撫島 (149.2°E) → 北海道
  const sak = a1.features.find((f) => f.properties.adm1_code === 'RUS-2616');
  const nt = polysOf(sak.geometry).filter((p) => { const b = bboxOf(p[0]); return b[0] >= 145.3 && b[2] <= 149.2 && b[1] >= 43.0 && b[3] <= 45.8; });
  if (nt.length < 4) throw new Error(`the Northern Territories: ${nt.length} rings found in RUS-2616, expected at least 4`);
  geo['01'] = geo['01'].concat(nt);
  say(`北方領土: ${nt.length} rings moved from RUS-2616 to 北海道 (01)`);
  // 3. 竹島 from the Japan point-of-view admin-0 → 島根県
  const jpn = a0.features[0];
  const tk = polysOf(jpn.geometry).filter((p) => { const b = bboxOf(p[0]); return b[0] >= 131.8 && b[2] <= 131.95 && b[1] >= 37.2 && b[3] <= 37.3; });
  if (tk.length < 1) throw new Error('竹島: no ring in ne_10m_admin_0_countries_jpn');
  geo['32'] = geo['32'].concat(tk);
  say(`竹島: ${tk.length} ring(s) added from ne_10m_admin_0_countries_jpn to 島根県 (32)`);
  // every ring of the Japan POV admin-0 now lies in some prefecture (or is a sliver next to one)
  // 4. ownership on the full-resolution data (contained, else nearest within 5 km)
  const P = lcc(PROJ), proj = d3.geoConicConformal().parallels([PROJ.lat1, PROJ.lat2]).rotate([-PROJ.lon0, 0]).scale(PROJ.k).translate([0, 0]);
  for (const [lon, lat] of [[123, 24], [136, 35], [154, 24.3], [145.8, 44.1], [131.87, 37.24]]) {
    const a = P(lon, lat), b = proj([lon, lat]);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) throw new Error(`the component's projection differs from d3-geo at ${lon},${lat}: ${a} vs ${b}`);
  }
  const projPolys = (polys) => polys.map((poly) => poly.map((r) => r.map((c) => P(c[0], c[1]))));
  const full = Object.fromEntries(Object.entries(geo).map(([c, ps]) => [c, projPolys(ps)]));
  // every ring of the Japan POV admin-0 now lies in (or within 1 km of) some prefecture
  let left = 0;
  for (const p of polysOf(jpn.geometry)) {
    const c = interior([p.map((r) => r.map((q) => P(q[0], q[1])))]).p, o = owner(c, full, 1);
    if (!o.code) { left++; const b = bboxOf(p[0]); say(`FAIL admin-0 (Japan POV) ring in no prefecture: ${b.map((v) => v.toFixed(3)).join(',')} (${p[0].length} points)`); }
  }
  if (left) throw new Error(`${left} ring(s) of Japan (POV) not in any prefecture`);
  say(`ok   every ring of ne_10m_admin_0_countries_jpn's Japan lies in a prefecture`);
  let bad = 0;
  const verdict = (what, name, lon, lat, want, byCode, tol) => {
    const o = owner(P(lon, lat), byCode, tol), ok = o.code === want;
    if (!ok) bad++;
    say(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${name} (${lon}, ${lat}) → ${o.code || 'none'}${o.d ? ` (nearest, ${o.d.toFixed(1)} km)` : ''}, expected ${want}`);
  };
  for (const [name, lon, lat, want] of CHECKS) verdict('full data', name, lon, lat, want, full, 5);
  for (const [code, name, lon, lat] of PREFS) { const o = owner(P(lon, lat), full, 3); if (o.code !== code) { bad++; say(`FAIL capital of ${name} → ${o.code}`); } }
  say(`ok   full data: all 47 prefectural offices lie in their own prefecture`);

  // 5. project, place insets, simplify (planar, Visvalingam, keep every island), quantize to integers
  const insetOf = (lon, lat) => INSETS.findIndex((s) => lon >= s.box[0] && lon <= s.box[2] && lat >= s.box[1] && lat <= s.box[3]);
  const feats = [];
  for (const [code, polys] of Object.entries(geo)) {
    const parts = {};
    for (const poly of polys) { const c = centroid(poly[0]); const i = insetOf(c[0], c[1]); (parts[i] = parts[i] || []).push(poly); }
    for (const [i, ps] of Object.entries(parts)) feats.push({ type: 'Feature', properties: { code, inset: +i }, geometry: { type: 'MultiPolygon', coordinates: projPolys(ps) } });
  }
  // mapshaper wants y up for planar data the same as any; keep projected units (x east, y down)
  const fc = JSON.stringify({ type: 'FeatureCollection', features: feats });
  const out = await ms.applyCommands(`-i in.json -simplify planar interval=${SIMPLIFY} keep-shapes -o format=topojson no-quantization precision=0.001 out.json`, { 'in.json': fc });
  const topo = JSON.parse(out['out.json']);
  const obj = Object.values(topo.objects)[0];
  // integer arcs, consecutive duplicates dropped
  const arcs = topo.arcs.map((a) => { const r = []; for (const p of a) { const q = [Math.round(p[0]), Math.round(p[1])]; if (!r.length || q[0] !== r[r.length - 1][0] || q[1] !== r[r.length - 1][1]) r.push(q); } return r; });
  const fts = obj.geometries.map((g) => ({ code: g.properties.code, inset: g.properties.inset, polys: g.type === 'Polygon' ? [g.arcs] : g.arcs }));
  fts.sort((a, b) => a.code.localeCompare(b.code) || a.inset - b.inset);
  // rings back from arcs (for checks, labels and bounds)
  const ringOf = (idx) => { const r = []; for (const i of idx) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; r.push(...(r.length ? a.slice(1) : a)); } return r; };
  const polysOfFeat = (f) => f.polys.map((p) => p.map(ringOf)).filter((p) => p[0].length >= 3);
  const byCode = {};
  for (const f of fts) byCode[f.code] = (byCode[f.code] || []).concat(polysOfFeat(f));
  let npts = 0; for (const a of arcs) npts += a.length;
  say(`geometry: ${fts.length} parts, ${arcs.length} arcs, ${npts} points after simplification (interval ${SIMPLIFY} km)`);

  // 6. ownership on the final geometry (true positions): contained, or nearest within 5 km; vanished islands need a FIXED point
  for (const [name, lon, lat, want] of CHECKS) {
    const o = owner(P(lon, lat), byCode, 5), fx = FIXED.find((f) => f[0] === name);
    if (o.code === want) say(`ok   final geometry: ${name} → ${o.code}${o.d ? ` (nearest, ${o.d.toFixed(1)} km)` : ''}`);
    else if (o.code === null && fx && fx[3] === want) say(`ok   final geometry: ${name} has no polygon at slide scale (nearest land ${o.d.toFixed(1)} km); drawn as the fixed point of ${want}`);
    else { bad++; say(`FAIL final geometry: ${name} → ${o.code || 'none'}, expected ${want}${fx ? ` (fixed point: ${fx[3]})` : ''}`); }
  }
  for (const [name, lon, lat, want] of FIXED) { if (!PREFS.some((p) => p[0] === want)) { bad++; say(`FAIL fixed point ${name}: no prefecture ${want}`); } }
  if (bad) throw new Error(`${bad} ownership check(s) failed`);

  // 7. layout: the main frame and the insets (moved into empty corners of the main frame)
  const mainPts = fts.filter((f) => f.inset < 0).flatMap((f) => polysOfFeat(f).flatMap((p) => p[0]));
  const mb = bboxOf(mainPts);
  const pad = 8;
  const inPts = (i) => fts.filter((f) => f.inset === i).flatMap((f) => polysOfFeat(f).flatMap((p) => p[0])).concat(FIXED.filter((f) => insetOf(f[1], f[2]) === i).map((f) => P(f[1], f[2])));
  const ib = INSETS.map((s, i) => bboxOf(inPts(i)));
  if (process.env.MAPDEBUG) console.log('main', mb.map(Math.round), 'insets', ib.map((b) => b.map(Math.round)), fts.map((f) => f.code + ':' + f.inset).join(' '));
  // 南西諸島 into the top-left corner, 小笠原 into the bottom-right corner of the main frame. Each inset is drawn at the
  // largest scale (≤ 1, in steps of 0.05) whose frame (content + margin m) leaves a gap of at least g to main-frame land
  const m = 30, g = 40;
  const ins = INSETS.map((s, i) => {
    const b = ib[i];
    for (let sc = 1; sc > 0.1; sc = Math.round((sc - 0.05) * 100) / 100) {
      const w = (b[2] - b[0]) * sc + 2 * m, h = (b[3] - b[1]) * sc + 2 * m;
      const fx = i === 0 ? mb[0] : mb[2] - w, fy = i === 0 ? mb[1] : mb[3] - h;
      const hit = mainPts.some((q) => q[0] > fx - g && q[0] < fx + w + g && q[1] > fy - g && q[1] < fy + h + g);
      if (!hit) return { id: s.id, name: s.name, box: s.box, s: sc, tx: Math.round(fx + m - b[0] * sc), ty: Math.round(fy + m - b[1] * sc), frame: [fx, fy, w, h].map(Math.round) };
    }
    throw new Error(`inset ${s.id} does not fit`);
  });
  for (const s of ins) say(`inset ${s.id}: scale ${s.s}, frame ${s.frame.join(',')}`);
  const allTrue = bboxOf(fts.flatMap((f) => polysOfFeat(f).flatMap((p) => p[0])).concat(FIXED.map((f) => P(f[1], f[2]))));
  const boundsInset = [mb[0] - pad, mb[1] - pad, mb[2] - mb[0] + 2 * pad, mb[3] - mb[1] + 2 * pad].map(Math.round);
  const boundsTrue = [allTrue[0] - pad, allTrue[1] - pad, allTrue[2] - allTrue[0] + 2 * pad, allTrue[3] - allTrue[1] + 2 * pad].map(Math.round);

  // 8. label anchors: the interior point of each prefecture's main part (true positions; insets are moved at draw time), and of each group
  const anchors = {};
  for (const f of fts) {
    if (anchors[f.code] && f.inset >= 0) continue;   // main part first (sorted), an inset part only when there is no main part
    const ps = polysOfFeat(f).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    const best = interior(ps.slice(0, 1));
    anchors[f.code] = [Math.round(best.p[0]), Math.round(best.p[1]), f.inset];
  }
  const gAnchors = {};
  for (const [id, , codes] of GROUPS) {
    const ps = fts.filter((f) => codes.includes(f.code) && f.inset < 0).flatMap(polysOfFeat).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    const best = interior(ps.slice(0, 12));
    gAnchors[id] = [Math.round(best.p[0]), Math.round(best.p[1])];
  }

  // 9. the block
  let arcStr = '';
  for (const a of arcs) { arcStr += enc(a.length); let px = 0, py = 0; for (const [x, y] of a) { arcStr += enc(x - px) + enc(y - py); px = x; py = y; } }
  if (dec(arcStr).length !== arcs.length + 2 * npts) throw new Error('arc encoding does not round-trip');
  const J = (v) => JSON.stringify(v);
  const lines = [
    `${BEGIN}(generated by tools/map/build-japan.mjs from Natural Earth 5.1.1, public domain; do not edit by hand) ----`,
    `// Natural Earth ne_10m_admin_1_states_provinces + ne_10m_admin_0_countries_jpn (北方領土 → 01, 竹島 → 32), simplified (Visvalingam ${SIMPLIFY} km),`,
    `// projected (LCC 30°/42°, 136°E, 1 unit ≈ 1 km) and quantized to integers. arcs: zigzag varints (ALPH), per arc: count, then x, y deltas`,
    `var MAP = {`,
    `  proj: ${J(PROJ)},`,
    `  alph: ${J(ALPH)},`,
    `  bounds: {inset: ${J(boundsInset)}, "true": ${J(boundsTrue)}},`,
    `  insets: ${J(ins)},`,
    `  prefs: ${J(PREFS.map(([c, n, lon, lat]) => [c, n, lon, lat]))},`,
    `  groups: ${J(GROUPS.map(([id, n, codes]) => [id, n, codes, gAnchors[id]]))},`,
    `  fixed: ${J(FIXED)},`,
    `  anchors: ${J(anchors)},`,
    `  feats: ${J(fts.map((f) => [f.code, f.inset, f.polys]))},`,
    `  arcs: "${arcStr}"`,
    `};`,
    END,
  ];
  const text = lines.join('\n');
  say(`block: ${text.length} bytes (arcs ${arcStr.length})`);
  return { text, log };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) process.exit(check());
  const { text } = await rebuild();
  const cur = lf(fs.readFileSync(TARGET, 'utf8')), b = block(cur);
  if (process.argv.includes('--compare')) {
    const same = b && cur.slice(b.start, b.end) === text;
    console.log(same ? 'map-japan data: the rebuild equals the committed block' : 'FAIL the rebuild differs from the committed block');
    process.exit(same ? 0 : 1);
  }
  let next;
  if (b) next = cur.slice(0, b.start) + text + cur.slice(b.end);
  else if (cur.includes('\n@@MAPDATA@@\n')) next = cur.replace('\n@@MAPDATA@@\n', '\n' + text + '\n');
  else throw new Error('components/map-japan/index.js: no map-japan-data block and no @@MAPDATA@@ line');
  fs.writeFileSync(TARGET, next);
  const srcs = SOURCES.map((s) => `${s.sha256}  ${s.name}.zip`).join('\n');
  fs.writeFileSync(SHAFILE, `${sha(text)}  block (components/map-japan/index.js, between the BEGIN/END map-japan-data lines)\n${srcs}\n`);
  console.log(`wrote components/map-japan/index.js and tools/map/japan.sha256`);
}

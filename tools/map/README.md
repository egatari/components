# Map data (m-map-japan)

`build-japan.mjs` makes the map data embedded in `components/map-japan/index.js` (between the `BEGIN/END map-japan-data`
lines) from Natural Earth 5.1.1, 1:10m (public domain), following [docs/map-design.md](../../docs/map-design.md) §4.5 and §5.

```bash
cd tools/map && npm ci --ignore-scripts && cd ../..   # mapshaper 0.6.102 and d3-geo 3.1.1 (pinned in package-lock.json); no install script is needed
node tools/map/build-japan.mjs               # download (cached in tools/map/.cache/, sha256 checked), build, check, write
node tools/map/build-japan.mjs --compare     # rebuild in memory; fail if it differs from the committed block
node tools/map/build-japan.mjs --check       # what npm test runs: the block's sha256 equals japan.sha256 (no network)
```

The rebuild needs the network once (naciscdn.org) and `unzip`. It is a manual step; CI only runs `--check`.

What it does:

1. Downloads `ne_10m_admin_1_states_provinces.zip` and `ne_10m_admin_0_countries_jpn.zip` and checks their sha256 (recorded in the script) and `VERSION.txt` (5.1.1).
2. Keeps Japan's 47 prefectures (names checked against `name_ja`) and changes the data to the Japanese government's position (§4.5): the Northern Territories (国後・択捉・色丹・歯舞; RUS-2616 in admin-1) go to 北海道 (01), 竹島 (from the Japan POV admin-0) to 島根県 (32); 尖閣諸島 are already in 沖縄県 (47). Natural Earth's admin-1 also puts 奄美群島 in 沖縄県; they are moved to 鹿児島県 (46).
3. Checks that every ring of the Japan POV admin-0 lies in a prefecture, and the owner of the key points (map-design §4.5 検査, plus other islands and the 47 prefectural offices) on the full data.
4. Projects (Lambert conformal conic, 30°/42°, 136°E, sphere, 1 unit ≈ 1 km; the component's formula is checked against d3-geo), simplifies (mapshaper, Visvalingam, interval 1 km, keep-shapes; the finer level of map-design §6 9), quantizes to integers and builds the topology (shared borders once).
5. Checks the key points again on the final geometry (islands too small to keep a shape must be in the fixed point list with the right prefecture), records each inset's content box and its scale beside the main map (南西諸島 2×, 小笠原 0.5×; the component places these frames), the corner placement for small elements (南西諸島 top left, 小笠原 bottom right, largest scale ≤ 1 that leaves main-frame land clear) and label anchors.
6. Writes the block and `japan.sha256` (the block's sha256 and the sources').

Change the data only by changing the script, and say what changed and why in CHANGELOG.md (map-design §4.6.1: borders are redrawn only when the government's position changes). Attribution: 地図データ：Natural Earth（パブリックドメイン）を加工.

# Map data (m-map-world)

`build-world.mjs` makes the map data embedded in `components/map-world/index.js` (between the `BEGIN/END map-world-data`
lines) from Natural Earth 5.1.1's 1:10m Japan point-of-view admin-0 (`ne_10m_admin_0_countries_jpn`, public domain; the same
file and sha256 as above), following [docs/map-design.md](../../docs/map-design.md) §4.5, §4.8, §5 and §6.

```bash
node tools/map/build-world.mjs [--cache <dir>]             # download into <dir> (default tools/map/.cache/), build, check, write
node tools/map/build-world.mjs [--cache <dir>] --compare   # rebuild in memory; fail if it differs from the committed block
node tools/map/build-world.mjs [--cache <dir>] --block <f> # rebuild and write only the block to <f>
node tools/map/build-world.mjs --check                     # what npm test runs: the block's sha256 equals world.sha256 (no network)
```

`--cache` lets the download go to a new empty folder outside the repository; it is read as data only (mapshaper reads the
.shp/.dbf; nothing in it is run).

What it does:

1. Checks the zip's sha256 and `VERSION.txt` (5.1.1), and every feature's `NAME_JA` against `atlas-names.csv` (the one table of
   names, map-design §4.8; `ATLAS_name` is used, 13 names differ from `NAME_JA`).
2. Takes 帰属未定地 (XUD, map-design §4.5 3. 1) out of RUS: Sakhalin's ring is cut at 50°N (the south part becomes XUD), and the
   14 Kuril rings from 得撫島 to 占守島 (centre in 149.5–157°E, 45.5–51°N) move to XUD. It stops if a RUS island appears near
   South Sakhalin (海馬島 and the like are a pending decision, map-design §4.6 5; none is in the 1:10m data). The four boundary
   lines (北緯50度 across the cut, 宗谷海峡, 択捉島と得撫島の間, 占守島とカムチャツカ半島の間) are kept as lines; the sea lines are
   checked not to touch land.
3. Checks the owner of key points on the source, after projection and on the final geometry: 国後島・択捉島・色丹島・志発島 → JPN
   (with a shape), 竹島・魚釣島 → JPN (as fixed points), 豊原・得撫島・幌筵島・占守島 → XUD, 北樺太・カムチャツカ → RUS, 台湾 → TWN,
   クリミア → UKR, 西サハラ → SAH, and others.
4. Projects with d3-geo (Equal Earth, central meridian 150°E, sphere, 1 unit ≈ 1 km; cut at the seam, 30°W; the component's
   formula is checked against d3-geo), drops rings under 1500 km² (4 km² for JPN and XUD) except each feature's largest,
   simplifies (mapshaper, Visvalingam, 22 km; 2 km for JPN and XUD; map-design §3.1), quantizes and builds the topology.
5. Gives overseas parts the region of their geography: a part more than 800 km from the country's main land whose nearest foreign
   country (nearer than its own land) is in another region. The parts found must equal `OVERSEAS` (moved, overseas departments and
   territories: フランス領ギアナ, レユニオン) and `STAY` (kept, parts of the country's own territory: ハワイ州, アラスカ州, カナリア諸島;
   and the east of Greenland across the seam); the build fails otherwise. A `STAY` part marked `own` (カナリア諸島) is simplified as
   a feature of its own, like a moved part, so its largest ring is kept, and is then merged back into its country.
6. Writes label anchors, the six regions (六州, from `REGION_UN`/`SUBREGION`), the fixed island points, the lines, the block and
   `world.sha256` (the block's, the source's and the names table's sha256).

Attribution: 地図データ：Natural Earth（パブリックドメイン）を加工.

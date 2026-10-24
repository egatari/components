# Map data (m-map-japan)

`build-japan.mjs` makes the map data embedded in `components/map-japan/index.js` (between the `BEGIN/END map-japan-data`
lines) from Natural Earth 5.1.1, 1:10m (public domain), following [docs/map-design.md](../../docs/map-design.md) §4.5 and §5.

```bash
cd tools/map && npm ci && cd ../..           # mapshaper 0.6.102 and d3-geo 3.1.1 (pinned in package-lock.json)
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
5. Checks the key points again on the final geometry (islands too small to keep a shape must be in the fixed point list with the right prefecture), places the insets (南西諸島 top left, 小笠原 bottom right, largest scale ≤ 1 that leaves main-frame land clear) and computes label anchors.
6. Writes the block and `japan.sha256` (the block's sha256 and the sources').

Change the data only by changing the script, and say what changed and why in CHANGELOG.md (map-design §4.6.1: borders are redrawn only when the government's position changes). Attribution: 地図データ：Natural Earth（パブリックドメイン）を加工.

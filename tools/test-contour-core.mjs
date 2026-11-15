// node tools/test-contour-core.mjs: contour-core without a browser
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let K = null, fails = 0;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'contour-core', 'index.js'), 'utf8'), {egatariParts: {define: (m, f) => { K = f({}); }}});
const ok = (v, m) => { console.log((v ? 'ok   ' : 'FAIL ') + m); if (!v) fails++; };
// a plane f = x: the level 2.5 is the vertical line x = 2.5
const plane = Array.from({length: 4}, () => [0, 1, 2, 3, 4]);
const L = K.lines(plane, 2.5);
ok(L.length === 1 && L[0].length === 4 && L[0].every((p) => Math.abs(p[0] - 2.5) < 1e-12), 'a plane gives one straight line, joined across 3 cells: ' + JSON.stringify(L));
// a cone f = distance from the centre: a closed loop
const cone = Array.from({length: 9}, (_, j) => Array.from({length: 9}, (_, i) => Math.hypot(i - 4, j - 4)));
const C = K.lines(cone, 2.5);
ok(C.length === 1 && Math.abs(C[0][0][0] - C[0][C[0].length - 1][0]) < 1e-9 && Math.abs(C[0][0][1] - C[0][C[0].length - 1][1]) < 1e-9, 'a cone gives one closed loop');
ok(C[0].every((p) => Math.abs(Math.hypot(p[0] - 4, p[1] - 4) - 2.5) < 0.12), 'the loop lies within 0.12 cells of radius 2.5');
const lab = K.labelAt(L[0]);
ok(Math.abs(lab.x - 2.5) < 1e-12 && Math.abs(lab.y - 1.5) < 1e-12 && Math.abs(lab.angle - Math.PI / 2) < 1e-12 && Math.abs(lab.length - 3) < 1e-12, 'labelAt: the middle of the line and its direction');
ok(K.lines(plane, 9).length === 0 && K.segments([[NaN, 1], [1, 1]], 0.5).length === 0, 'no crossings: nothing; NaN cells are skipped');
const saddle = [[1, 0], [0, 1]];
ok(K.segments(saddle, 0.5).length === 2, 'a saddle cell gives two segments');
ok(JSON.stringify(K.rangeOf([[1, NaN], [-2, 5]])) === '[-2,5]', 'rangeOf skips NaN');
console.log(fails ? `\nFAIL: ${fails}` : '\ntest-contour-core: ok'); process.exitCode = fails ? 1 : 0;

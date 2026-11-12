// gallery.mjs --pack: the gallery of one release from its pack alone (no browser, no network)
//   1. from the tarball and from the unpacked folder: the same deck.html; egatari.json names the catalogue version
//   2. every element part with a demo has its intro slide, and every demo slide is there (noconcl slides included)
//   3. demo slides without an id get one, so slide keys do not collide across parts
//   4. a changed file, an extra file or a tarball that is not the manifest's is refused
//   5. with --previous: new, changed (another version) and サンプルが変わった (same version, other demo.html; another README.md alone is no mark); no marks without it
//   6. it runs with no git on PATH, and from a copy of tools/ with no node_modules (no parse5)
//   7. --samples-href and --samples-tags: a link under the summary of the listed parts only, {tag} URL-encoded; both or neither;
//      a link without {tag} is refused; tags not in the release are named; without them, no link (6's deck is 1's)
//   node tools/test-gallery-pack.mjs [work dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './studio.mjs';
import { release } from './release.mjs';
import { readTarGz } from './tar.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-gallery-pack-')));
fs.mkdirSync(work, { recursive: true });
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const { gz, file, manifest } = release(version);
const tgz = path.join(work, file), man = path.join(work, 'manifest.json');
fs.writeFileSync(tgz, gz);
fs.writeFileSync(man, JSON.stringify(manifest, null, 2));
const folder = path.join(work, 'unpacked');
for (const [p, b] of readTarGz(gz)) { fs.mkdirSync(path.dirname(path.join(folder, p)), { recursive: true }); fs.writeFileSync(path.join(folder, p), b); }
const gallery = path.join(ROOT, 'tools', 'gallery.mjs');
const run = (args, env = process.env) => spawnSync(process.execPath, [gallery, ...args], { encoding: 'utf8', env, cwd: work });
const deck = (dir) => fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');

// 1
const r1 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'a')]);
const r2 = run(['--pack', folder, '--manifest', man, '-o', path.join(work, 'b')]);
ok(r1.status === 0 && r2.status === 0, `tarball and folder both build (${(r1.stderr + r2.stderr).trim() || 'no errors'})`);
const A = deck(path.join(work, 'a'));
ok(A === deck(path.join(work, 'b')), 'the same deck.html from the tarball and from the folder');
ok(JSON.parse(fs.readFileSync(path.join(work, 'a', 'egatari.json'), 'utf8')).componentsCatalogue === version, `egatari.json names catalogue ${version}`);

// 2
const elements = Object.entries(manifest.components).filter(([n, c]) => c.kind === 'element' && fs.existsSync(path.join(ROOT, 'components', n, 'demo.html')));
const missing = elements.filter(([, c]) => !A.includes(`<h2>${c.tag}</h2>`));
ok(!missing.length, `an intro slide for each of the ${elements.length} element parts` + (missing.length ? `: missing ${missing.map(([n]) => n).join(', ')}` : ''));
const titles = (html) => [...html.matchAll(/<section\b[^>]*\bclass="slide(?:\s[^"]*)?"[^>]*>\s*<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
const lost = [];
for (const [n] of elements) for (const t of titles(fs.readFileSync(path.join(ROOT, 'components', n, 'demo.html'), 'utf8'))) if (!A.includes(`<h2>${t}</h2>`)) lost.push(`${n}: ${t}`);
ok(!lost.length, 'every demo slide is in the deck, noconcl ones included' + (lost.length ? `: missing ${lost.slice(0, 5).join(' | ')}` : ''));

// 3
const ids = [...A.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
ok(!dup.length && /<section id="g-timer-1" class="slide noconcl">/.test(A), `slide ids are unique (${ids.length})` + (dup.length ? `: ${dup.join(', ')}` : ''));

// 4
const bad = path.join(work, 'bad');
fs.cpSync(folder, bad, { recursive: true });
fs.appendFileSync(path.join(bad, 'tape', 'demo.html'), '\n<!-- changed -->\n');
const r4 = run(['--pack', bad, '--manifest', man, '-o', path.join(work, 'c')]);
ok(r4.status === 1 && /tape\/demo\.html: sha256 differs/.test(r4.stderr), 'a changed file is refused');
fs.copyFileSync(path.join(folder, 'tape', 'demo.html'), path.join(bad, 'tape', 'demo.html'));
fs.writeFileSync(path.join(bad, 'tape', 'extra.js'), '');
const r5 = run(['--pack', bad, '--manifest', man, '-o', path.join(work, 'c')]);
ok(r5.status === 0, 'a folder is read by the manifest\'s list, so a stray file beside it does no harm');
const gz2 = Buffer.from(gz); gz2[gz2.length - 1] ^= 1;
fs.writeFileSync(path.join(work, 'bad.tar.gz'), gz2);
const r6 = run(['--pack', path.join(work, 'bad.tar.gz'), '--manifest', man, '-o', path.join(work, 'c')]);
ok(r6.status === 1 && /is not the manifest's/.test(r6.stderr), 'a tarball that is not the manifest\'s is refused');

// 5
ok(!/（(新しい|変わった|サンプルが変わった)、v/.test(A), 'no marks without --previous');
const prev = JSON.parse(JSON.stringify(manifest));
delete prev.components.cards;
prev.components.orbit.version = '1.9.9';
prev.components.tape.files['demo.html'] = '0'.repeat(64);
prev.components.bars.files['README.md'] = '0'.repeat(64);
fs.writeFileSync(path.join(work, 'prev.json'), JSON.stringify(prev));
const r7 = run(['--pack', tgz, '--manifest', man, '--previous', path.join(work, 'prev.json'), '-o', path.join(work, 'd')]);
const D = deck(path.join(work, 'd'));
ok(r7.status === 0 && D.includes(`<h2>m-cards（新しい、v${version}）</h2>`) && D.includes(`<h2>m-orbit（変わった、v${version}）</h2>`)
  && D.includes(`<h2>m-tape（サンプルが変わった、v${version}）</h2>`) && D.includes('<h2>m-bars</h2>'), 'marks: new, changed, サンプルが変わった; the rest none (m-bars with only another README.md is unmarked)');

// 6
const r8 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'e')], { ...process.env, PATH: '' });
ok(r8.status === 0 && deck(path.join(work, 'e')) === A, 'runs with no git on PATH' + (r8.status ? `: ${r8.stderr.trim()}` : ''));
const bare = path.join(work, 'bare');
fs.cpSync(path.join(ROOT, 'tools'), path.join(bare, 'tools'), { recursive: true });
const r9 = spawnSync(process.execPath, [path.join(bare, 'tools', 'gallery.mjs'), '--pack', tgz, '--manifest', man, '-o', path.join(work, 'f')], { encoding: 'utf8', cwd: work });
ok(r9.status === 0 && deck(path.join(work, 'f')) === A, 'runs from a copy of tools/ with no node_modules' + (r9.status ? `: ${r9.stderr.trim()}` : ''));

// 7
const link = (tag) => `<a href="../../?samples-part=${tag}">`;
ok(!A.includes('samples-part') && !A.includes('Samples that use this part'), 'no samples links without the options');
const r10 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'g'), '--samples-href', '../../?samples-part={tag}', '--samples-tags', 'm-flow,m-bars,m-nosuch']);
const G = deck(path.join(work, 'g'));
const intro = (html, tag) => (html.match(new RegExp(`<section class="slide">\\s*<h2>${tag}</h2>[\\s\\S]*?</section>`)) || [''])[0];
ok(r10.status === 0 && intro(G, 'm-flow').includes(link('m-flow')) && intro(G, 'm-bars').includes(link('m-bars')) && !intro(G, 'm-tree').includes('samples-part')
  && (G.match(/samples-part=/g) || []).length === 2, 'links under the summary of the listed parts only');
ok(/m-nosuch/.test(r10.stderr), 'a listed tag not in the release is named: ' + r10.stderr.trim());
ok(G.replace(/\n {4}<p style="margin:6px 0 0"><a href="[^"]*">[^<]*<\/a><\/p>/g, '') === A, 'apart from the link lines, the same deck');
const r11 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'h'), '--samples-href', 'x={tag}', '--samples-tags', 'm-a"b']);
ok(r11.status === 0, 'odd tags are harmless');
const r12 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'h'), '--samples-href', '../../?samples-part={tag}']);
const r13 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'h'), '--samples-href', '../../?samples-part=', '--samples-tags', 'm-flow']);
const r14 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'h'), '--samples-href', 'javascript:alert({tag})', '--samples-tags', 'm-flow']);
ok(r12.status === 1 && r13.status === 1 && r14.status === 1, 'one option alone, a link without {tag} and a script link are refused');
const r15 = run(['--pack', tgz, '--manifest', man, '-o', path.join(work, 'h'), '--samples-href', '?p={tag}&x="<y>', '--samples-tags', 'm-flow']);
ok(r15.status === 0 && intro(deck(path.join(work, 'h')), 'm-flow').includes('<a href="?p=m-flow&amp;x=&quot;&lt;y&gt;">'), 'the link is escaped in the attribute');

if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK');

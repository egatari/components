// release.mjs --previous: manifest.changedWithoutBump lists parts whose version is the same as in the previous manifest but
// whose files differ (changed, added or removed), with since = the previous catalogue version; none when nothing so changed
//   node tools/test-changed-without-bump.mjs
import { release, changedWithoutBump } from './release.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const { manifest } = release('9.9.9');
const C = manifest.components;
const prev = { version: '9.9.8', components: JSON.parse(JSON.stringify(C)) };
ok(!release('9.9.9', { previous: prev }).manifest.changedWithoutBump, 'the same files: no changedWithoutBump');
prev.components.tape.files['demo.html'] = '0'.repeat(64);         // a demo changed
prev.components.timer.files['old.txt'] = '1'.repeat(64);          // a file removed since
delete prev.components.bars.files['CHANGELOG.md'];                // a file added since
prev.components.orbit.version = '1.0.0';                          // another version: not listed
prev.components.orbit.files['README.md'] = '2'.repeat(64);
delete prev.components.cards;                                     // a new part: not listed
const got = release('9.9.9', { previous: prev }).manifest.changedWithoutBump;
ok(got && got.since === '9.9.8', 'since names the previous catalogue version');
ok(JSON.stringify(got && got.parts) === JSON.stringify({ bars: ['CHANGELOG.md'], tape: ['demo.html'], timer: ['old.txt'] }),
  `changed, added and removed files of same-version parts; not a new part or a part with another version (got ${JSON.stringify(got && got.parts)})`);
ok(JSON.stringify(changedWithoutBump({ components: {} }, C)) === '{}', 'an empty previous manifest lists nothing');
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK');

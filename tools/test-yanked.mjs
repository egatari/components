// yanked.json becomes manifest.json's `yanked` (Egatari spec §6: a withdrawn release stays; the manifest names the replacement).
import assert from 'node:assert/strict';
import { release, readYanked } from './release.mjs';

const m = release('1.0.3').manifest;
assert.deepEqual(Object.keys(m.yanked), ['1.0.0', '1.0.1']);
for (const e of Object.values(m.yanked)) { assert.equal(e.replacement, '1.0.2'); assert.ok(e.reason && e.date); }
assert.equal(m.yanked['1.0.2'], undefined, 'the replacement is not yanked');
assert.equal(m.version, '1.0.3');
// a release cannot be its own yank, nor name a replacement newer than itself
assert.throws(() => readYanked('1.0.1'), /release being made|newer/);
assert.throws(() => readYanked('1.0.0'), /newer|release being made/);
console.log('test-yanked: ok');

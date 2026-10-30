// yanked.json becomes manifest.json's `yanked` (its releases) and each part's `withdrawn` (its parts) (Egatari spec §6: a withdrawn
// release or part version stays; the manifest names the replacement). Every part entry carries `license` (spec §6 Registry manifest).
import assert from 'node:assert/strict';
import { release, readYanked, readWithdrawn } from './release.mjs';

const m = release('1.0.3').manifest;
assert.deepEqual(Object.keys(m.yanked), ['1.0.0', '1.0.1']);
for (const e of Object.values(m.yanked)) { assert.equal(e.replacement, '1.0.2'); assert.ok(e.reason && e.date); }
assert.equal(m.yanked['1.0.2'], undefined, 'the replacement is not yanked');
assert.equal(m.version, '1.0.3');
// a release cannot be its own yank, nor name a replacement newer than itself
assert.throws(() => readYanked('1.0.1'), /release being made|newer/);
assert.throws(() => readYanked('1.0.0'), /newer|release being made/);
assert.throws(() => readYanked('1.0.3', { '1.0.0': m.yanked['1.0.0'] }), /exactly releases, parts/);

// license on every entry: the README's, else MIT
for (const [n, c] of Object.entries(m.components)) assert.equal(typeof c.license, 'string', `${n}: license`);
assert.equal(m.components.kakijun.license, 'MIT AND OFL-1.1');
assert.equal(m.components.bars.license, 'MIT');
assert.equal(m.components.base.license, 'MIT');
// withdrawn: none today, so no entry has it
assert.ok(Object.values(m.components).every((c) => !('withdrawn' in c)));

// a part's withdrawn versions, in version order; the checks
const e = (replacement) => ({ replacement, reason: 'test', date: '2026-10-31' });
const f = (parts) => ({ releases: {}, parts });
assert.deepEqual(Object.keys(readWithdrawn('bars', '2.0.2', f({ bars: { '2.0.1': e('2.0.2'), '2.0.0': e('2.0.2') } }))), ['2.0.0', '2.0.1']);
assert.deepEqual(readWithdrawn('flow', '2.0.2', f({ bars: { '2.0.0': e('2.0.2') } })), {});
assert.throws(() => readWithdrawn('bars', '2.0.2', f({ nosuch: {} })), /not a part/);
assert.throws(() => readWithdrawn('bars', '2.0.2', f({ bars: { '2.0.2': e('2.0.3') } })), /newer|current version/);
assert.deepEqual(Object.keys(readWithdrawn('bars', '2.0.3', f({ bars: { '2.0.2': e('2.0.3') } }))), ['2.0.2'], 'the replacement may be the current version');
assert.throws(() => readWithdrawn('bars', '2.0.2', f({ bars: { '2.0.1': e('2.0.0') } })), /later version/);
assert.throws(() => readWithdrawn('bars', '2.0.3', f({ bars: { '2.0.1': e('2.0.2'), '2.0.2': e('2.0.3') } })), /itself withdrawn/);
assert.throws(() => readWithdrawn('bars', '2.0.3', f({ bars: { '2.0.1': { replacement: '2.0.3' } } })), /exactly replacement, reason, date/);
console.log('test-yanked: ok');

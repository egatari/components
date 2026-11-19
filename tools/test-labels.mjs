// subjects: / audiences: in a README frontmatter (docs/conventions.md §4.3): ids from subjects.json and audiences.json,
// not reserved, not empty, not repeated; the list files themselves have unique lower-case ids with ja and en
//   node tools/test-labels.mjs
import { labelErrors, labelListErrors, labelIds } from './lint.mjs';
import { ROOT } from './studio.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const lists = { subjects: labelIds(ROOT, 'subjects'), audiences: labelIds(ROOT, 'audiences') };
const errs = (f) => labelErrors('x', f, lists);
ok(errs({ purposes: 'compare' }).length === 0, 'neither written: fits every subject and audience');
ok(errs({ subjects: 'statistics, mathematics', audiences: 'high-school' }).length === 0, 'ids from the lists');
ok(/subject geography is not in subjects\.json/.test(errs({ subjects: 'statistics, geography' }).join('\n')), 'an unknown subject');
ok(/audience adults is not in audiences\.json/.test(errs({ audiences: 'adults' }).join('\n')), 'an unknown audience');
ok(/subject medicine is reserved/.test(errs({ subjects: 'medicine' }).join('\n')), 'a reserved subject');
ok(/subjects: is empty/.test(errs({ subjects: '' }).join('\n')), 'an empty value');
ok(/audiences: repeats an id/.test(errs({ audiences: 'university, university' }).join('\n')), 'a repeated id');
ok(labelListErrors('subjects', { subjects: [{ id: 'a', ja: 'あ', en: 'A' }, { id: 'a', ja: 'い', en: 'I' }] }).length === 1, 'a repeated id in the list file');
ok(labelListErrors('audiences', { audiences: [{ id: 'Big', ja: 'x', en: 'x' }, { id: 'b', ja: 'x' }] }).length === 2, 'a bad id and a missing en in the list file');
ok(labelListErrors('subjects', {}).length === 1, 'a list file without its array');
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK');

// subjects: / audiences: in a README frontmatter (docs/conventions.md §4.3), and origin: (§4.4): ids from subjects.json and audiences.json,
// not reserved, not empty, not repeated; the list files themselves have unique lower-case ids with ja and en
//   node tools/test-labels.mjs
import { labelErrors, labelListErrors, labelIds, originOf, originErrors } from './lint.mjs';
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
// keywords of a subject (handoff #69)
const kw = (k, kind = 'subjects') => labelListErrors(kind, { [kind]: [{ id: 'a', ja: 'あ', en: 'A', keywords: k }] });
ok(kw({ ja: ['統計', { w: '国', not: ['国語'] }], en: ['statistics'] }).length === 0, 'keywords: words and {w, not} pass');
ok(kw({ ja: ['統計', '統計'], en: ['x'] }).length === 1, 'keywords: a repeated word');
ok(kw({ ja: ['統計'] }).length === 1, 'keywords: en is missing');
ok(kw({ ja: ['統計'], en: ['x'], fr: ['y'] }).length === 1, 'keywords: an unknown language');
ok(kw({ ja: [{ w: '国' }], en: ['x'] }).length === 1, 'keywords: {w} without not');
ok(kw({ ja: [''], en: ['x'] }).length === 1, 'keywords: an empty word');
ok(kw({ ja: ['x'], en: ['x'] }, 'audiences').length === 1, 'keywords: only subjects have them');
ok(labelListErrors('subjects', {}).length === 1, 'a list file without its array');
// origin: indented kind / from / ref under "origin:"; no names of people
const fm = (body) => `---\nname: m-x\n${body}\nsummary: s\n---\nbody`;
const oe = (body) => originErrors('x', originOf(fm(body))).join('\n');
ok(originOf(fm('purposes: compare')) === null && oe('purposes: compare') === '', 'origin left out: no error');
ok(oe('origin:\n  kind: maintainer') === '', 'origin with kind only');
ok(JSON.stringify(originOf(fm('origin:\n  kind: student\n  from: talk'))) === '{"kind":"student","from":"talk"}', 'origin read with kind and from, ending at the next field');
ok(oe('origin:\n  kind: contributor\n  ref: "@octo-cat"') === '', 'a contributor with a GitHub handle');
ok(oe('origin:\n  kind: library\n  from: library\n  ref: "https://github.com/x/y, MIT"') === '', 'a library with URL and licence');
ok(/kind is missing/.test(oe('origin:\n  from: lesson')), 'origin without kind');
ok(/kind owner is not one of/.test(oe('origin:\n  kind: owner')), 'an unknown kind');
ok(/from slides is not one of/.test(oe('origin:\n  kind: colleague\n  from: slides')), 'an unknown from');
ok(/no names of people/.test(oe('origin:\n  kind: colleague\n  ref: 山田先生')), 'a ref for a colleague (a name) is refused');
ok(/GitHub handle/.test(oe('origin:\n  kind: contributor\n  ref: Taro Yamada')), 'a contributor ref that is not a handle');
ok(/URL and its licence/.test(oe('origin:\n  kind: library\n  ref: "https://github.com/x/y"')), 'a library ref without a licence');
ok(/who is not a field/.test(oe('origin:\n  kind: student\n  who: B4')), 'an unknown field');
ok(/indented lines/.test(oe('origin: maintainer')), 'origin written on one line');
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nOK');

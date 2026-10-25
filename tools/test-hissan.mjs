// m-hissan's written calculations (its `static calc`), without a browser: for a sweep of textbook-style exercises the
// steps the part computes and writes reproduce plain arithmetic (exact, with BigInt decimals), and the layout keeps
// its invariants. Cases: 2–4 digit + and −, borrowing across zeros (1003−457), 2–3 digit × 1–2 digit (with fine="on"
// and trailing zeros such as 340×26), decimals ± and × decimals (the product's point counted from both factors,
// trailing zeros struck), ÷ by 1- and 2-digit divisors with and without remainders, to `digits` places, decimal ÷
// decimal (both points moved), the remainder's point at the dividend's original point, and a 仮の商 round.
// Checked for every case:
//   - the answer row as written (struck zeros left out) equals the exact result; for × every partial product equals
//     the multiplicand × that digit of the multiplier and sits under the multiplier digit's column; for ÷ every round
//     has P − q×d = r with 0 ≤ r < d, the product row and the partial being divided read as written equal q×d and P,
//     the quotient read from its row equals the dividend ÷ divisor truncated to the places computed, and
//     dividend = quotient × divisor + remainder (exactly, at the dividend's original point)
//   - layout: a digit's column is its place (one x per place, every row; the point between the ones and tenths
//     columns), columns are evenly spaced and wider than a digit, each quotient digit stands above the last digit of
//     the partial it divides (the same x) and above the bar, and no quotient digit is written left of the first
//     place where division is possible (no leading 0 except the ones place of a quotient below 1)
//   node tools/test-hissan.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './studio.mjs';

const classes = {};
const DECK = { define: (tag, C) => { classes[tag] = C; }, MotionElement: class {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', 'hissan', 'index.js'), 'utf8'), { DECK, console, Math, String, JSON, Number, Array, Object, Error });
const C = classes['m-hissan'].calc;

let fail = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log('FAIL ' + msg); } };

// ---- exact decimals: {v: BigInt, s: scale} ----
const D = (str) => { const [i, f = ''] = String(str).split('.'); return { v: BigInt(i + f), s: f.length }; };
const scaleTo = (a, s) => a.v * 10n ** BigInt(s - a.s);
const norm = (a) => { // "12.340" → "12.34", "0.0" → "0"
  let t = a.v.toString().padStart(a.s + 1, '0');
  if (a.s) t = t.slice(0, t.length - a.s) + '.' + t.slice(t.length - a.s);
  return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
};
const add = (a, b) => { const s = Math.max(a.s, b.s); return { v: scaleTo(a, s) + scaleTo(b, s), s }; };
const sub = (a, b) => { const s = Math.max(a.s, b.s); return { v: scaleTo(a, s) - scaleTo(b, s), s }; };
const mul = (a, b) => ({ v: a.v * b.v, s: a.s + b.s });
const eqD = (a, b) => { const s = Math.max(a.s, b.s); return scaleTo(a, s) === scaleTo(b, s); };
// a ÷ b truncated to f decimal places
const divT = (a, b, f) => { const s = Math.max(a.s, b.s); const num = scaleTo(a, s) * 10n ** BigInt(f), den = scaleTo(b, s); return { v: num / den, s: f }; };
const clean = (s) => s.replace(/_/g, '');

// The big digits written in row r at the end (kari digits that disappear, small digits and struck zeros left out): {col: digit}
function rowDigits(M, r, withStruck) {
  const struck = new Set();
  if (!withStruck) for (const it of M.items) if (it.t === 'strike' && it.r === r) for (let p = it.p1; p <= it.p0; p++) struck.add(p);
  const o = {};
  for (const it of M.items) if (it.t === 'd' && it.r === r && it.sz !== 'S' && it.end === undefined && !struck.has(it.p)) {
    if (o[it.p] !== undefined && o[it.p] !== it.s) ok(false, `two digits in one place: row ${r} col ${it.p}`);
    o[it.p] = it.s;
  }
  return o;
}
// Σ digit × 10^col over cols lo..hi of a row (an exact decimal)
function value(o, lo = -Infinity, hi = Infinity) {
  const cs = Object.keys(o).map(Number).filter((c) => c >= lo && c <= hi);
  if (!cs.length) return { v: 0n, s: 0 };
  const min = Math.min(...cs, 0);
  let v = 0n;
  for (const c of cs) v += BigInt(+o[c]) * 10n ** BigInt(c - min);
  return { v, s: -min };
}
// v × 10^c as an exact decimal
const at = (v, c) => (c >= 0 ? { v: BigInt(v) * 10n ** BigInt(c), s: 0 } : { v: BigInt(v), s: -c });
const W = 1184, H = 470;
function layoutChecks(M, name) {
  const L = C.layout(M, W, H, false);
  // one x per column, evenly spaced (CW apart), wider than a 52 px digit (about 40 px)
  ok(Math.abs(L.X(0) - L.X(1) - L.cw) < 1e-9 && L.cw >= 44, `${name}: columns ${L.cw} px apart`);
  const xs = new Map();
  for (const it of M.items) if (it.t === 'd' && it.pos !== 'beside') {
    const x = L.X(it.p);
    if (xs.has(it.p)) ok(Math.abs(xs.get(it.p) - x) < 1e-9, `${name}: col ${it.p} has one x`);
    xs.set(it.p, x);
  }
  // rows go down the page in order; big digits at least 48 px tall rows apart (no overlap of 52 px glyphs)
  const bigRows = M.rows.map((r, i) => i).filter((i) => M.rows[i].k === 'L');
  for (let j = 1; j < bigRows.length; j++) ok(L.Yb(bigRows[j]) - L.Yb(bigRows[j - 1]) >= 48, `${name}: rows ${bigRows[j - 1]} and ${bigRows[j]} are at least 48 px apart`);
  // the decimal point is drawn between the column of its place and the next one to the right
  for (const it of M.items) if (it.t === 'pt') ok(Math.abs(L.X(it.p) + L.cw / 2 - (L.X(it.p) + L.X(it.p - 1)) / 2) < 1e-9, `${name}: point between cols ${it.p} and ${it.p - 1}`);
  return L;
}

// ---- + and − ----
function checkAddSub(e, o = {}) {
  const M = C.build(e, o);
  const { op, A, B } = C.parse(e);
  const a = D(A.text), b = D(B.text), want = op === '+' ? add(a, b) : sub(a, b);
  const got = clean(C.read(M, M.info.answerRow));
  ok(got === norm(want), `${e}: answer ${got}, want ${norm(want)}`);
  // places: the digits of the first, second and answer rows are at their place (one point column for all)
  ok(eqD(value(rowDigits(M, M.info.rows.A)), a), `${e}: first number written at its places`);
  ok(eqD(value(rowDigits(M, M.info.rows.B)), b), `${e}: second number written at its places`);
  ok(eqD(value(rowDigits(M, M.info.answerRow)), want), `${e}: answer written at its places`);
  // くり上がり・くり下がり：small digits only above the first row, never two in one place (the beside-1 excepted)
  const small = M.items.filter((it) => it.t === 'd' && it.sz === 'S');
  ok(small.every((it) => it.r === M.info.rows.S || (it.pos === 'shoulder' && it.r === M.info.rows.A)), `${e}: carries and borrows in the small row (a borrowed 1 also at the shoulder of a first-row digit)`);
  const seen = new Set();
  for (const it of small) { const k = it.p + (it.pos || ''); ok(!seen.has(k), `${e}: one small mark per place (col ${it.p})`); seen.add(k); }
  if (op === '+') {
    // a carry 1 above every place whose column sum (with the carry in) reaches 10, except the top one
    let carry = 0, s = Math.max(a.s, b.s), top = Math.max(A.ip.length, B.ip.length) - 1, need = 0;
    for (let p = -s; p <= top; p++) { const x = (A.at(p) || 0) + (B.at(p) || 0) + carry; carry = x >= 10 ? 1 : 0; if (carry && p < top) need++; }
    ok(small.length === need, `${e}: ${need} carry mark(s), got ${small.length}`);
    // carry="line" (default): the small row is between the second number and the answer line; carry="top": above the first number
    const rs = M.info.rows.S;
    ok(o.carry === 'top' ? rs < M.info.rows.A : rs === M.info.rows.B + 1 && M.rows[rs + 1].k === 'R', `${e}: carries ${o.carry === 'top' ? 'above the first number' : 'just above the answer line'}`);
  } else {
    // every borrowing place gets a small 1, every lent-from place a slash
    const slashes = M.items.filter((it) => it.t === 'slash').length, ones = small.filter((it) => it.pos === 'beside' || it.pos === 'shoulder').length;
    // a borrowed 1 on a digit that was not reduced sits at that digit's left shoulder: in its column, at mid-height, below the reduced-digit row
    const L2 = C.layout(M, W, H, false);
    for (const it of small.filter((x) => x.pos === 'shoulder')) {
      const right = L2.X(it.p) - C.SHX, left = right - 0.63 * 24, base = L2.Yb(it.r) - C.SHY;
      ok(left > L2.X(it.p) - L2.cw / 2 && right < L2.X(it.p) - 0.76 * 52 / 2 + 2, `${e}: borrowed 1 of col ${it.p} inside its column, left of the digit`);
      ok(base - 24 * 0.885 > L2.Yb(it.r) - 52 * 0.885 && base < L2.Yb(it.r), `${e}: borrowed 1 of col ${it.p} at the digit's mid-height`);
      ok(!M.items.some((x) => x.t === 'd' && x.sz === 'S' && x.r === M.info.rows.S && x.p === it.p), `${e}: no reduced digit above a shoulder 1 (col ${it.p})`);
    }
    ok(slashes >= ones, `${e}: each borrow takes from a slashed digit (${slashes} slashes, ${ones} borrows)`);
  }
  layoutChecks(M, e);
  return M;
}
// ---- × ----
function checkMul(e, fine) {
  const M = C.build(e, { fine });
  const { A, B } = C.parse(e);
  const a = D(A.text), b = D(B.text), want = mul(a, b);
  const got = clean(C.read(M, M.info.answerRow));
  ok(got === norm(want), `${e}${fine ? ' fine' : ''}: answer ${got}, want ${norm(want)}`);
  const I = M.info;
  ok(eqD(value(rowDigits(M, I.rows.A)), D(String(I.a1))), `${e}: multiplicand right-aligned (trailing zeros of an integer to the right)`);
  ok(eqD(value(rowDigits(M, I.rows.B)), D(String(I.b1))), `${e}: multiplier right-aligned`);
  const bd = String(I.b1).split('').reverse().map(Number);
  const nonzero = bd.filter((x, j) => x || bd.length === 1).length;
  ok(I.parts.length === nonzero, `${e}: one partial product per nonzero multiplier digit (${I.parts.length})`);
  for (const p of I.parts) {
    // its own digits (cols ≥ 0; when it is also the answer row, the zeros brought down and the point come later)
    const all = rowDigits(M, p.row, true), row = {};
    for (const c of Object.keys(all).map(Number)) if (c >= 0) row[c] = all[c];
    const top = Math.max(...Object.keys(row).map(Number));
    if (I.parts.length === 1) for (let c = top; c > 0 && row[c] === '0'; c--) delete row[c];   // the 0 written for the ones place of 0.1
    const cols = Object.keys(row).map(Number);
    ok(p.value === I.a1 * bd[p.j], `${e}: partial ${p.value} = ${I.a1}×${bd[p.j]}`);
    ok(eqD(value(row), at(p.value, p.j)), `${e}: partial ${p.value} written ending under the multiplier digit (col ${p.j})`);
    ok(Math.min(...cols) === p.j, `${e}: partial ${p.value} ends in col ${p.j}`);
  }
  // the product row read as an integer at its columns is a'×b' followed by the zeros brought down
  // the product row (struck zeros included) at its columns is a'×b', followed by the zeros brought down in cols −1…−Z
  const pr = rowDigits(M, I.answerRow, true);
  ok(eqD(value(pr), at(I.a1 * I.b1, 0)) && Object.keys(pr).map(Number).filter((c) => c < 0).length === I.Z, `${e}: product digits are a'×b' then ${I.Z} zero(s)`);
  // decimal: the count arcs number the decimal places of both factors together
  const counts = M.items.filter((it) => it.t === 'count');
  ok(counts.length === a.s + b.s, `${e}: ${a.s + b.s} decimal place(s) counted (${counts.length})`);
  if (fine) {
    // fine: one step per digit of the multiplicand for each partial
    const groups = new Set(M.phases.filter((p) => /^p\d+d\d+$/.test(p.grp)).map((p) => p.grp));
    ok(groups.size === I.parts.length * String(I.a1).length, `${e} fine: one step per digit (${groups.size})`);
  }
  layoutChecks(M, e);
  return M;
}
// ---- ÷ ----
function checkDiv(e, o = {}) {
  const M = C.build(e, o);
  const { A, B } = C.parse(e);
  const a = D(A.text), b = D(B.text), I = M.info, name = `${e} ${JSON.stringify(o)}`;
  const d = I.d, m = I.m;
  ok(d === Number(B.text.replace('.', '')), `${name}: divisor made an integer (${d})`);
  // dividend after moving the point: the digits in the dividend row (written and added zeros) are A × 10^m at their columns
  const dRow = rowDigits(M, I.dRow);
  ok(eqD(value(dRow), mul(a, { v: 10n ** BigInt(m), s: 0 })), `${name}: dividend written at its moved places`);
  // rounds
  for (const R of I.rounds) {
    ok(R.prod === R.q * d && R.P - R.prod === R.r && R.r >= 0 && R.r < d && R.q >= 0 && R.q <= 9, `${name}: round at col ${R.c}: ${R.P} − ${R.q}×${d} = ${R.r}`);
    if (R.q > 0) {
      const pr = rowDigits(M, R.rowP), cols = Object.keys(pr).map(Number);
      ok(eqD(value(pr), at(R.prod, R.c)), `${name}: product ${R.prod} written ending at col ${R.c}`);
      ok(Math.min(...cols) === R.c, `${name}: product ${R.prod} ends under the quotient digit (col ${R.c})`);
    }
    // the partial P as written: its digits in the partial row from its left end to col c
    const pr2 = rowDigits(M, R.partialRow), cs = Object.keys(pr2).map(Number).filter((c) => c >= R.c && c <= Math.max(R.left, R.c));
    const pv = cs.sort((x, y) => y - x).reduce((v, c) => v * 10 + +pr2[c], 0);
    ok(pv === R.P, `${name}: partial ${R.P} as written (${pv}) at cols ${Math.max(R.left, R.c)}..${R.c}`);
    if (R.kari !== undefined) ok(R.kari !== R.q && R.tries.length === Math.abs(R.kari - R.q), `${name}: 仮の商 ${R.kari} corrected to ${R.q} one at a time`);
  }
  // quotient: as read from its row, and as the dividend ÷ divisor truncated to the places computed
  const qGot = clean(C.read(M, I.qRow));
  const qWant = divT(a, b, I.qScale);
  ok(qGot === norm(qWant) || (qGot.replace(/^0+(?=\d)/, '') === norm(qWant)), `${name}: quotient ${qGot}, want ${norm(qWant)}`);
  ok(eqD(value(rowDigits(M, I.qRow)), qWant), `${name}: quotient digits stand at their places`);
  // no quotient digit left of where division first becomes possible; a 0 only in the ones place (quotient < 1) or between digits
  const qd = rowDigits(M, I.qRow), qcols = Object.keys(qd).map(Number).sort((x, y) => y - x);
  ok(!(qd[qcols[0]] === '0' && qcols[0] > 0), `${name}: no leading 0 in the quotient`);
  ok(qcols[0] === I.rounds[0].c, `${name}: the quotient starts above the first digit where division is possible (col ${I.rounds[0].c})`);
  // remainder: dividend = quotient × divisor + remainder, the remainder read at the dividend's original point
  if (I.rem) {
    const rem = I.remainder;
    const remD = D(rem.value);
    ok(eqD(add(mul(qWant, b), remD), a), `${name}: ${norm(a)} = ${norm(qWant)}×${norm(b)} + ${rem.value}`);
    ok(sub(b, remD).v > 0n || eqD(remD, { v: 0n, s: 0 }) || m > 0, `${name}: remainder smaller than the divisor`);
    const got = clean(C.read(M, rem.row));
    if (remD.v > 0n) ok(got === rem.value, `${name}: remainder written as ${got}, want ${rem.value}`);
  } else if (I.exact) ok(eqD(mul(qWant, b), a), `${name}: exact: ${norm(qWant)}×${norm(b)} = ${norm(a)}`);
  // layout: each quotient digit above the last digit of its partial (same x), above the bar and the dividend
  const L = layoutChecks(M, name);
  for (const R of I.rounds) {
    const q = M.items.find((it) => it.t === 'd' && it.r === I.qRow && it.p === R.c && it.end === undefined);
    ok(q && Math.abs(L.X(q.p) - L.X(R.c)) < 1e-9, `${name}: quotient digit of col ${R.c} above that column`);
    const under = M.items.find((it) => it.t === 'd' && (it.r === I.dRow) && it.p === R.c);
    ok(under && Math.abs(L.X(under.p) - L.X(q.p)) < 1e-9, `${name}: quotient digit ${q && q.s} above the dividend digit of col ${R.c}`);
  }
  ok(L.Yb(I.qRow) < L.Yt(I.dRow), `${name}: quotient above the dividend`);
  // the dividend starts right after the bracket: no column of the figure lies left of its first digit (in every step)
  ok(L.G.hi === I.cL, `${name}: the dividend starts right after 「）」 (leftmost col ${L.G.hi}, dividend col ${I.cL})`);
  return M;
}

// ---- the sweep ----
let seed = 12345;
const rnd = (lo, hi) => { seed = (seed * 1103515245 + 12345) % 2147483648; return lo + (seed % (hi - lo + 1)); };
// + : 2–4 digits
for (let i = 0; i < 120; i++) checkAddSub(`${rnd(10, 9999)}+${rnd(10, 9999)}`);
['487+356', '687+356', '999+1', '9999+1', '56+487'].forEach((e) => { checkAddSub(e); checkAddSub(e, { carry: 'top' }); });
// − : 2–4 digits, the first not smaller
for (let i = 0; i < 120; i++) { const x = rnd(10, 9999), y = rnd(10, 9999); checkAddSub(`${Math.max(x, y)}-${Math.min(x, y)}`); }
// borrowing across zeros, and answers with leading zeros not written
for (const e of ['1003-457', '1000-1', '2005-1996', '400-123', '7000-2468', '503-498', '52-48', '100-99', '432-158', '10000-1']) checkAddSub(e);
{ // 1003−457: the textbook marks (1 struck, 0→9, 0→9, small 1 at the shoulder of 3) and steps (ones with its borrow, tens, hundreds)
  const M = C.build('1003-457');
  const sm = M.items.filter((it) => it.t === 'd' && it.sz === 'S').map((it) => `${it.p}:${it.s}${it.pos ? '*' + (it.r === M.info.rows.A ? 'A' : 'S') : ''}`).sort().join(' ');
  ok(sm === '0:1*A 1:9 2:9', `1003-457: small marks 9, 9 and the 1 at the shoulder of the ones digit (got ${sm})`);
  ok(M.items.filter((it) => it.t === 'slash').map((it) => it.p).sort().join() === '1,2,3', '1003-457: 1, 0 and 0 struck');
  ok(new Set(M.phases.map((p) => p.grp)).size === 3, '1003-457: three steps (the thousands write nothing)');
  const caps = M.items.filter((it) => it.t === 'cap').map((it) => it.s);
  ok(caps[0] === '一の位：千の位から順に 1 くり下げる' && caps[1] === '一の位：13−7＝6', '1003-457: the words of the first step (' + caps.slice(0, 2).join(' / ') + ')');
}
// decimals + and −
for (const e of ['2.6+1.4', '3.75+1.25', '0.3+0.7', '12.5+3.48', '5-2.35', '4.2-1.8', '10-0.01', '3.5-1.5', '7.25-3.6', '0.9+0.1']) checkAddSub(e);
{ // 52−17: 5 struck with 4 above, the borrowed 1 at the shoulder of 2; 432−158: the tens' 1 beside its reduced 2 (reads 12)
  const M = C.build('52-17'), sm = M.items.filter((it) => it.t === 'd' && it.sz === 'S').map((it) => `${it.p}:${it.s}:${it.pos || '-'}`).sort().join(' ');
  ok(sm === '0:1:shoulder 1:4:-', `52-17: 4 above the tens, 1 at the shoulder of the ones (got ${sm})`);
  const N = C.build('432-158'), sn = N.items.filter((it) => it.t === 'd' && it.sz === 'S').map((it) => `${it.p}:${it.s}:${it.pos || '-'}`).sort().join(' ');
  ok(sn === '0:1:shoulder 1:1:beside 1:2:- 2:3:-', `432-158: the tens' borrowed 1 beside its reduced 2 (got ${sn})`);
}
{ const M = C.build('2.6+1.4'); ok(M.items.some((it) => it.t === 'strike' && it.withPt), '2.6+1.4: 4.0 → the point and 0 struck'); }
// × : 2–3 digit × 1–2 digit, fine on and off
for (let i = 0; i < 80; i++) { const e = `${rnd(10, 999)}×${rnd(2, 99)}`; checkMul(e, false); checkMul(e, true); }
for (const e of ['38×24', '36×4', '340×26', '250×40', '600×5', '123×405', '25×4', '99×99', '47×36']) { checkMul(e, false); checkMul(e, true); }
{ const M = C.build('340×26'); ok(M.info.Z === 1 && C.read(M, M.info.answerRow) === '8840', '340×26: 34×26 = 884, then 0 brought down: 8840'); }
// decimals × decimals (and × integers)
for (const e of ['3.6×2.4', '0.25×0.4', '1.25×0.8', '2.5×1.4', '0.2×0.3', '4.8×0.5', '12.5×0.08', '2.4×3', '2.4×30', '0.6×0.5', '1.5×1.5']) { checkMul(e, false); checkMul(e, true); }
{ const M = C.build('0.25×0.4'); ok(C.read(M, M.info.answerRow) === '0.1' && M.info.struck === 2, '0.25×0.4: 0.100, the two trailing zeros struck'); }
// ÷ by 1 and 2 digit divisors, with and without remainders (integers: remainder mode)
for (let i = 0; i < 80; i++) checkDiv(`${rnd(10, 9999)}÷${rnd(2, 9)}`);
for (let i = 0; i < 80; i++) checkDiv(`${rnd(100, 9999)}÷${rnd(11, 99)}`);
for (const e of ['372÷3', '612÷6', '98÷7', '25÷7', '851÷23', '600÷3', '3006÷3', '96÷16', '7÷9', '1000÷25']) checkDiv(e);
for (const e of ['7÷4', '3÷4', '10÷3', '22÷7', '5÷8']) checkDiv(e, { digits: 2 });
for (const e of ['7÷4', '1÷8']) checkDiv(e, { digits: 3 });
// decimal ÷ decimal (and decimal ÷ integer)
for (const e of ['7.56÷1.8', '7.5÷0.25', '0.24÷6', '6÷1.5', '4.5÷0.15', '2.4÷0.8', '9.12÷2.4', '8.4÷0.7', '1.8÷0.06', '5.2÷1.3']) checkDiv(e, { cap: 3 });
for (const e of ['17.5÷3', '7.5÷2.3', '7.56÷1.8', '6.3÷3', '9.6÷0.7']) checkDiv(e, { rem: true });
for (const e of ['2.5÷0.7', '10÷0.3']) checkDiv(e, { digits: 2 });
{ const M = C.build('7.56÷1.8', { cap: 3 }); ok(C.read(M, M.info.qRow) === '4.2' && M.info.m === 1 && M.info.exact, '7.56÷1.8 = 4.2 (both points moved 1 place)'); }
{ const M = C.build('7.5÷2.3', { rem: true }); ok(M.info.quotient === '3' && M.info.remainder.value === '0.6', '7.5÷2.3 = 3 あまり 0.6 (the remainder at the original point)'); }
{ const M = C.build('0.24÷6', { cap: 3 }); ok(C.read(M, M.info.qRow) === '0.04', '0.24÷6 = 0.04 (0 in the ones and tenths)'); }
// 仮の商：わる数を上の 1 けたの位で四捨五入して見当をつけ、1 ずつなおす（大きすぎれば 1 小さく、小さすぎれば 1 大きく）
function checkKari(e, want) {
  const M = checkDiv(e, { kari: true }), R = M.info.rounds.find((r) => r.kari !== undefined);
  ok(R && R.c === want.c && R.kari === want.e && R.q === want.q, `${e} kari: estimate ${want.e} at col ${want.c}, quotient ${want.q} (got ${R && R.kari}, ${R && R.q})`);
  if (!R) return;
  // the tries: e, e∓1, …, one at a time, each wrong (too big: product > P; too small: remainder ≥ d)
  ok(R.tries.map((t) => t.q).join() === want.tries.join(), `${e} kari: tries ${want.tries.join(', ')} (got ${R.tries.map((t) => t.q).join(', ')})`);
  R.tries.forEach((t, i) => {
    if (i) ok(Math.abs(t.q - R.tries[i - 1].q) === 1, `${e} kari: corrected by 1`);
    ok(t.big ? t.prod > R.P : t.r >= M.info.d, `${e} kari: try ${t.q} is ${t.big ? 'too big' : 'too small'}`);
  });
  ok(Math.abs(R.tries[R.tries.length - 1].q - R.q) === 1, `${e} kari: the last correction reaches ${R.q}`);
  const names = M.phases.filter((p) => p.grp === 'r' + R.c).map((p) => p.name).join(' ');
  ok(names === want.names, `${e} kari: phases ${want.names} (got ${names})`);
  const caps = M.items.filter((it) => it.t === 'cap' && M.phases[it.g].name === 'fix').map((it) => it.s);
  ok(caps.length === R.tries.length && caps.every((c, i) => R.tries[i].big ? /ひけないので、1 小さくする/.test(c) : /^あまりが \d+ (より大きい|と同じな)ので、1 大きくする/.test(c)), `${e} kari: the words say what happened (${caps.join(' / ')})`);
  ok(C.read(M, M.info.qRow) === String(want.quotient), `${e} kari: the quotient is ${want.quotient} at the end`);
  // every crossed-out try disappears at the end: one digit per place
  ok(M.items.filter((it) => it.t === 'd' && it.r === M.info.qRow && it.p === R.c && it.end === undefined).length === 1, `${e} kari: one quotient digit left in col ${R.c}`);
}
// too big by 1 (23→20: 80÷20 = 4, 23×4 = 92 > 85 → 3) and by 2 (14→10: 90÷10 = 9 → 8 → 7)
checkKari('851÷23', { c: 1, e: 4, q: 3, tries: [4], quotient: 37, names: 'kari kari-mul fix kake hiku orosu' });
// 99÷14: 14×9 = 126 and 14×8 = 112 are wider than 99, so those tries are only said in words (no product in the columns)
checkKari('99÷14', { c: 0, e: 9, q: 7, tries: [9, 8], quotient: 7, names: 'kari fix fix kake hiku' });
{
  const M = C.build('99÷14', { kari: true }), R = M.info.rounds[0];
  ok(R.tries[0].wide && R.tries[1].wide, '99÷14 kari: the 126 and 112 tries are words only');
  const N = C.build('851÷23', { kari: true });
  ok(!N.info.rounds[0].tries[0].wide && N.items.some((it) => it.t === 'd' && it.kari && it.r === N.info.rounds[0].rowP), '851÷23 kari: 92 fits under 85 and is written, then crossed out');
  ok(!M.items.some((it) => it.t === 'd' && it.p > M.info.cL), '99÷14 kari: no digit left of the dividend in any step');
  const w = M.items.find((it) => it.t === 'cap' && M.phases[it.g].name === 'fix');
  ok(w && w.s === '14×9＝126 は 99 より大きくてひけないので、1 小さくする（8）', '99÷14 kari: the words carry the multiplication (' + (w && w.s) + ')');
}
// too small by 1 (27→30: 190÷30 = 6, 195 − 162 = 33 ≥ 27 → 7) and by 2 (16→20: 90÷20 = 4 → 5 → 6)
checkKari('195÷27', { c: 0, e: 6, q: 7, tries: [6], quotient: 7, names: 'kari kari-mul kari-sub fix kake hiku' });
checkKari('96÷16', { c: 0, e: 4, q: 6, tries: [4, 5], quotient: 6, names: 'kari kari-mul kari-sub fix kari-mul kari-sub fix kake hiku' });
for (const e of ['672÷24', '75÷18', '1554÷37', '812÷29', '7÷3']) checkDiv(e, { kari: true });
// expressions the part refuses
for (const e of ['', '12+', '1+2+3', 'abc', '3−5', '7÷0', '1.2.3+4']) { n++; try { C.build(e); fail++; console.log(`FAIL "${e}" should be refused`); } catch { /* refused */ } }
// spellings that are accepted
for (const [e, want] of [['１２＋３４', '46'], ['12 * 3', '36'], ['84 / 4', '21'], ['5－2', '3'], ['.5+.25', '0.75'], ['487+356=', '843']]) {
  const M = C.build(e);
  const got = clean(C.read(M, M.op === '÷' ? M.info.qRow : M.info.answerRow));
  ok(got === want, `"${e}" → ${got}, want ${want}`);
}

console.log(fail ? `\nFAIL: ${fail} of ${n}` : `test-hissan: ok (${n} checks)`);
process.exit(fail ? 1 : 0);

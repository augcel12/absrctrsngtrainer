// node coldstart/check.js [worlds per level]
// Re-derives everything by brute force from the relation definitions, not from the generator's own
// bookkeeping. Prints one line per level and a list of anything wrong (should be empty).
require('./engine.js');
const E = globalThis.CSE, NW = +process.argv[2] || 4;
const bad = new Set(), t00 = Date.now();
const brute = (W, facts) => { const n = W.S.n, out = []; for (let m = 0; m < W.P.length / n; m++) if (facts.every(f => E.val(W, f, W.P, m * n))) out.push(m); return out; };
const holds = (S, r, s) => !!r.f(S, ...r.ord.map(i => s[i])) !== r.neg;

// 1. every declared symmetry really leaves its relation unchanged, on every kind of board
for (const k of Object.keys(E.SHAPES)) for (const n of [5, 6, 7, 8]) for (let rep = 0; rep < 2; rep++) {
    const S = E.SHAPES[k](n); if (!S) continue;
    for (const p of E.LIB) {
        const T = E.tuples(n, p.k);
        for (const g of p.sym) for (let i = 0; i < T.length; i += Math.ceil(T.length / 300)) if (!!p.f(S, ...T[i]) !== !!p.f(S, ...g.map(j => T[i][j]))) bad.add('symmetry wrong: ' + p.id);
    }
}

// 2. worlds at every level, training and probe
for (const held of [false, true]) for (let Lv = 1; Lv <= 12; Lv++) {
    const P = E.params(Lv, false), t0 = Date.now(), nw = Lv >= 11 ? Math.max(1, NW >> 1) : NW;
    const st = { boards: 0, crackGap: 0, M: [], redundant: 0, unment: 0, claims: 0, claimWrong: 0, single: 0, pair: 0, open: 0, neg: 0, facts: 0, shiftGap: 0, shiftBoards: 0, chance: 0, fams: {} };
    for (let w = 0; w < nw; w++) {
        const W = E.makeWorld(P, held), S = W.S, n = S.n;
        st.boards += W.crack.boards.length;
        W.rels.forEach(r => { st.fams[r.lib.fam] = (st.fams[r.lib.fam] || 0) + 1; });
        if (!held && (S.held || W.rels.some(r => r.lib.held))) bad.add('held-out material in training');
        if (held && !S.held) bad.add('probe on a training board');
        if (!W.rels.some(r => r.k === P.k)) bad.add('no sign at arity ' + P.k);
        // crack: every reading in the library (any argument order) and every base relation on any two of
        // the objects either means the same as the sign on this board or is contradicted by a mark
        W.crack.boards.forEach(b => b.items.forEach(it => { if (E.val(W, it, b.place, 0) !== it.v) bad.add('crack mark wrong'); }));
        W.rels.forEach((r, ri) => {
            const marks = W.crack.boards.flatMap(b => b.items.filter(it => it.r === ri).map(it => ({ s: it.a.map(o => b.place[o]), v: it.v })));
            const T = E.tuples(n, r.k);
            const test = (f, pi) => {
                if (marks.some(m => !!f(S, ...pi.map(i => m.s[i])) !== m.v)) return;
                if (!T.every(t => !!f(S, ...pi.map(i => t[i])) === !!r.f(S, ...t))) st.crackGap++;
            };
            for (const p of E.LIB) if (p.k === r.k) for (const pi of E.argPerms(r.k)) test(p.f, pi);
            if (r.k > 2) for (const [, f] of E.BASE) for (let i = 0; i < r.k; i++) for (let j = 0; j < r.k; j++) if (i !== j) test(f, [i, j]);
        });
        for (const judge of [false, true]) for (let i = 0; i < 3; i++) {
            const R = E.genRound(W, P.F, judge ? { t: 3, max: 10, min: 2 } : { t: 1, max: 6, min: 1 });
            if (!R) { bad.add('no round'); continue; }
            if (!R.facts.every(f => E.val(W, f, W.P, R.h * n))) bad.add('fact false of the hidden arrangement');
            const M = brute(W, R.facts); if (M.join() !== R.M.join()) bad.add('model set mismatch');
            st.M.push(M.length); st.facts += R.facts.length; st.neg += R.facts.filter(f => f.no).length;
            if (new Set(R.facts.flatMap(f => f.a)).size < n) st.unment++;
            if (R.facts.some((_, k) => brute(W, R.facts.filter((_, j) => j !== k)).length === M.length)) st.redundant++;
            if (judge) for (const c of E.genClaims(W, R, 3)) {
                st.claims++;
                const t = M.filter(m => E.val(W, c.f, W.P, m * n)).length, s = t === M.length ? 1 : t === 0 ? 0 : -1;
                if (s !== c.st) st.claimWrong++; if (s === -1) st.open++;
                if (s !== -1) {
                    const dec = fs => { const m = brute(W, fs), q = m.filter(x => E.val(W, c.f, W.P, x * n)).length; return q === 0 || q === m.length; };
                    if (R.facts.some(f => dec([f]))) st.single++; else if (R.facts.some((f, a) => R.facts.some((g, b) => b > a && dec([f, g])))) st.pair++;
                }
            }
            if (E.disguise(W, R).M.length !== M.length) bad.add('disguise changed the structure');
            // chance of a fact = share of all arrangements satisfying it
            const f = R.facts[0], share = brute(W, [f]).length / (W.P.length / n);
            if (Math.abs(share - E.chanceOf(W, f)) > 1e-9) st.chance++;
        }
        const place = E.shuffle(E.range(n));
        E.knownClaims(W, place, 4).forEach(c => { if ((E.val(W, c.f, place, 0) ? 1 : 0) !== c.st) bad.add('known claim wrong'); });
        const pi = E.genOp(W, 3); if (new Set(pi).size !== n || pi.every((v, i) => v === i)) bad.add('bad move');
        // shift: of every possible change (and none), only changes meaning the same as the real one fit the marks
        const before = W.rels.map(r => ({ ...r, ord: r.ord.slice() })), sh = E.shift(W);
        st.shiftBoards += sh.ev.boards.length;
        const marks = sh.ev.boards.flatMap(b => b.items.map(it => ({ g: W.rels[it.r].glyph, s: it.a.map(o => b.place[o]), v: it.v })));
        if (marks.some(m => holds(S, W.rels.find(r => r.glyph === m.g), m.s) !== m.v)) bad.add('shift mark wrong');
        const cands = [before];
        before.forEach((r, i) => {
            const neg = before.map(x => ({ ...x, ord: x.ord.slice() })); neg[i].neg = !neg[i].neg; cands.push(neg);
            const rev = before.map(x => ({ ...x, ord: x.ord.slice() })); rev[i].ord.reverse(); cands.push(rev);
            before.forEach((q, j) => { if (j > i && q.k === r.k) { const s = before.map(x => ({ ...x, ord: x.ord.slice() })); s[i].glyph = q.glyph; s[j].glyph = r.glyph; cands.push(s); } });
        });
        for (const c of cands) {
            if (!marks.every(m => holds(S, c.find(r => r.glyph === m.g), m.s) === m.v)) continue;
            if (!W.rels.every(r => E.tuples(n, r.k).every(t => holds(S, r, t) === holds(S, c.find(x => x.glyph === r.glyph), t)))) st.shiftGap++;
        }
        const R2 = E.genRound(W, P.F + 1, { t: 1, max: 1, min: 1, bias: [sh.o.i] });
        if (!R2 || brute(W, R2.facts).join() !== R2.M.join()) bad.add('round after shift wrong');
    }
    const m = st.M.sort((a, b) => a - b);
    console.log(`${held ? 'probe' : 'train'} L${Lv} k${P.k} n${P.n} F${P.F} | crack boards ${(st.boards / nw).toFixed(1)} gaps ${st.crackGap} | `
        + `models med ${m[m.length >> 1]} max ${m[m.length - 1]} | padding ${st.redundant} unmentioned ${st.unment} | negated ${Math.round(100 * st.neg / st.facts)}% | `
        + `claims ${st.claims} wrong ${st.claimWrong} one-fact ${st.single} two-fact ${st.pair} open ${st.open} | shift boards ${(st.shiftBoards / nw).toFixed(1)} gaps ${st.shiftGap} | `
        + `chance ${st.chance} | ${Object.entries(st.fams).map(e => e.join(' ')).join(', ')} | ${Math.round((Date.now() - t0) / nw)} ms/world`);
}
console.log(`library ${E.LIB.length} relations (${E.LIB.filter(p => p.held).length} held out) | ${Math.round((Date.now() - t00) / 1000)} s`);
console.log('WRONG', [...bad]);

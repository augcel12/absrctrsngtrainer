// difference.js — amounts on one scale, related by how much more or less.
//
// Balance relates amounts by how many times ("1 A balances 3 B"); Difference relates them by how much
// ("A is 3 more than B"). Between them they are the two operations quantity is reasoned with, and this
// is the one a number line is built from. Chaining "more" and "less" with numbers means holding signed
// magnitudes, not just an order.
//
//   2  "A is 3 more than B"
//   3  "A and B together are 4 more than C";  "A is halfway between B and C"
//   4  "A and B together are 2 less than C and D together";  "A is as much more than B as C is more than D"
//   5  "A, B and C together are 5 more than D and E together"
//
// Exact: a premise is a linear equation (a coefficient per term plus a constant), and what the premises
// settle is exactly what lies in their span. With only differences stated, every amount could slide up
// or down together; a sum pins the amounts themselves.

const DF_MAX = 15;                                   // largest constant a premise or conclusion may carry

class ArDiffEngine {
    constructor(n) { this.n = n; }
    // B: the equations with their constants; V: what they say about the terms alone (for "is the gap
    // between x and y settled?")
    mask(facts) {
        return { B: linBasis(facts.map(f => f.vec)), V: linBasis(facts.map(f => f.vec.slice(0, this.n))) };
    }
    valueM(M, c) {
        if (c.base) return (linInSpan(M.B, c.base.vec) && !linInSpan(M.B, c.vec)) ? false : null;
        return linInSpan(M.B, c.vec) ? true : null;
    }
    value(facts, c) { return this.valueM(this.mask(facts), c); }
    pairOpen(M, [x, y]) {
        const v = Array(this.n).fill(0);
        v[x] = 1; v[y] = -1;
        return !linInSpan(M.V, v);
    }
}
const AR_DIFF_ENGINES = {};
const arDiffEngine = n => AR_DIFF_ENGINES[n] || (AR_DIFF_ENGINES[n] = new ArDiffEngine(n));

// A list of terms as a side of an equation: "A", "A and B together", "A, B and C together"
function dfSide(W, idx) {
    if (idx.length === 1) return arS(W[idx[0]]);
    return `${idx.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[idx[idx.length - 1]])} ${arR('together')}`;
}

// vec = coefficients over the N terms, then minus the constant: sum(c_i x_i) - d = 0.
// Returns null for shapes that have no plain wording (coefficients other than +-1, except a midpoint).
function arDiffEq(vec, N, opts = {}) {
    const v = linNorm(vec);
    const co = v.slice(0, N), d0 = -v[N];
    const terms = arRange(N).filter(i => co[i] !== 0);
    if (terms.length < 2) return null;
    const pos = terms.filter(i => co[i] > 0), neg = terms.filter(i => co[i] < 0);
    if (!pos.length || !neg.length) return null;
    const unit = terms.every(i => Math.abs(co[i]) === 1);
    let mid = null;
    if (!unit) {
        // 2A - B - C = 0 (or its negation): A is halfway between B and C
        const two = terms.filter(i => Math.abs(co[i]) === 2), one = terms.filter(i => Math.abs(co[i]) === 1);
        if (terms.length !== 3 || two.length !== 1 || one.length !== 2 || d0 !== 0) return null;
        if (Math.sign(co[two[0]]) === Math.sign(co[one[0]]) || Math.sign(co[one[0]]) !== Math.sign(co[one[1]])) return null;
        mid = { a: two[0], b: one[0], c: one[1] };
    }
    if (Math.abs(d0) > DF_MAX) return null;
    const f = {
        key: 'D' + v.join(','), arity: terms.length, terms, vec: v, base: opts.base || null,
        pairs: terms.flatMap((x, i) => terms.slice(i + 1).map(y => [x, y, null])),
        eqdiff: opts.eqdiff || null,
        html(W, plain) {
            if (mid) {
                const [b, c] = plain ? [mid.b, mid.c] : shuffle([mid.b, mid.c]);
                return `${arS(W[mid.a])} ${arPhrase('is halfway between', 'is not halfway between', plain)} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`;
            }
            // "A is as much more than B as C is more than D": only offered for premises, where the
            // direction of both gaps is known
            if (f.eqdiff && !plain && coinFlip()) {
                const [a, b, c, e] = f.eqdiff;
                return `${arS(W[a])} ${arPhrase('is as much more than', 'is as much less than', plain)} ${arS(W[b])} ${arR('as')} ${arS(W[c])} ${arR('is more than')} ${arS(W[e])}`;
            }
            // sum(pos) - sum(neg) = d. Say it with a positive amount, either way round.
            let L = pos, R = neg, d = d0;
            if (d < 0 || (d === 0 && !plain && coinFlip())) { L = neg; R = pos; d = -d; }
            if (!plain && d > 0 && coinFlip()) {
                // the same fact the other way round: "B is 3 less than A"
                const verbR = R.length === 1 ? 'is' : 'are';
                return `${dfSide(W, R)} ${arPhrase(`${verbR} ${d} less than`, `${verbR} ${d} more than`, plain)} ${dfSide(W, L)}`;
            }
            if (plain && d === 0 && L.length < R.length) { [L, R] = [R, L]; }
            const verb = L.length === 1 ? 'is' : 'are';
            if (d === 0) {
                const eq = L.length === 1 ? 'equals' : 'equal';
                const ne = L.length === 1 ? 'does not equal' : 'do not equal';
                return `${dfSide(W, L)} ${arPhrase(eq, ne, plain)} ${dfSide(W, R)}`;
            }
            return `${dfSide(W, L)} ${arPhrase(`${verb} ${d} more than`, `${verb} ${d} less than`, plain)} ${dfSide(W, R)}`;
        },
    };
    return f;
}

// a two-term difference "x is d more than y" as a fact
function dfPair(x, y, d, N, opts) {
    const vec = Array(N + 1).fill(0);
    vec[x] = 1; vec[y] = -1; vec[N] = -d;
    return arDiffEq(vec, N, opts);
}

function arDifferenceFamily() {
    const amount = (x, v, N) => {
        const vec = Array(N + 1).fill(0);
        vec[x] = 1; vec[N] = -v;
        return { key: `U${x},${v}`, arity: 1, terms: [x], vec, pairs: [], html: W => `${arS(W[x])} ${arR('is exactly ' + v)}` };
    };
    return {
        id: 'diff',
        engine: N => arDiffEngine(N),
        simple(h, N) {
            const out = [];
            for (const x of arRange(N)) for (const y of arRange(N)) if (x < y) out.push(dfPair(x, y, h[x] - h[y], N));
            for (const x of arRange(N)) out.push(amount(x, h[x], N));
            return out.filter(Boolean);
        },
        // every premise is a new independent equation, and differences alone can only pin N-1 of them, so
        // one more term than premises (the algebra is cheap, so the cap is only there to keep items readable)
        terms: (P, k) => Math.max(k + 1, Math.min(14, P + 1)),
        hidden(N) {
            for (;;) {
                const h = arRange(N).map(() => 1 + Math.floor(Math.random() * 9));
                if (new Set(h).size >= Math.min(N, 6)) return h;
            }
        },
        fact(h, N, a, used, facts) {
            const basis = facts && facts.length ? linBasis(facts.map(f => f.vec)) : null;
            for (let attempt = 0; attempt < 16; attempt++) {
                const t = arTerms(N, a, used);
                const vec = Array(N + 1).fill(0);
                let eqdiff = null;
                // a midpoint when the amounts allow one
                if (a === 3 && Math.random() < 0.35) {
                    const m = [[0, 1, 2], [1, 0, 2], [2, 0, 1]].map(([p, q, r]) => [t[p], t[q], t[r]])
                        .find(([p, q, r]) => 2 * h[p] === h[q] + h[r] && h[q] !== h[r]);
                    if (m) {
                        vec[m[0]] = 2; vec[m[1]] = -1; vec[m[2]] = -1;
                        if (basis && !linAdd(basis.slice(), vec)) continue;
                        return arDiffEq(vec, N);
                    }
                }
                // four terms: equal gaps ("A is as much more than B as C is more than D") when they exist
                if (a === 4 && Math.random() < 0.45) {
                    const splits = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]].map(s => s.map(i => t[i]));
                    const hit = splits.find(([p, q, r, s]) => h[p] + h[q] === h[r] + h[s]);
                    if (hit) {
                        const [p, q, r, s] = hit;
                        vec[p] = 1; vec[q] = 1; vec[r] = -1; vec[s] = -1;
                        // p + q = r + s  <=>  p - r = s - q; word it with both gaps positive
                        const pairs = [[p, r, s, q], [r, p, q, s], [p, s, r, q], [s, p, q, r]];
                        eqdiff = pairs.find(([w, x, y, z]) => h[w] - h[x] > 0 && h[y] - h[z] > 0) || null;
                        if (basis && !linAdd(basis.slice(), vec)) continue;
                        return arDiffEq(vec, N, { eqdiff });
                    }
                }
                const nPos = a === 2 ? 1 : 1 + Math.floor(Math.random() * (a - 1));
                let d = 0;
                t.forEach((x, i) => { const c = i < nPos ? 1 : -1; vec[x] = c; d += c * h[x]; });
                if (a === 2 && d === 0) continue;
                if (Math.abs(d) > (a === 2 ? 9 : DF_MAX)) continue;
                vec[N] = -d;
                if (basis && !linAdd(basis.slice(), vec)) continue;
                const f = arDiffEq(vec, N);
                if (f) return f;
            }
            return null;
        },
        conclusions(h, N, k, opts, ctx) {
            const out = [], seen = new Set();
            const push = f => { if (f && !seen.has(f.key)) { seen.add(f.key); out.push(f); } };
            // every gap between two terms, and near misses of it: off by one or two, or the wrong way
            for (const x of arRange(N)) for (const y of arRange(N)) {
                if (x >= y || h[x] === h[y]) continue;
                const d = h[x] - h[y];
                const base = dfPair(x, y, d, N);
                push(base);
                for (const d2 of [d + 1, d - 1, d + 2, d - 2, -d]) if (d2 !== 0 && d2 !== d) push(dfPair(x, y, d2, N, { base }));
            }
            if (k >= 3 && ctx && ctx.facts && ctx.facts.length >= 2) {
                const F = ctx.facts;
                for (let i = 0; i < 400 && out.length < 160; i++) {
                    const lam = F.map(() => arPick([-1, 0, 0, 1]));
                    if (lam.filter(x => x).length < 2) continue;
                    const v = Array(N + 1).fill(0);
                    F.forEach((f, j) => { for (let t = 0; t <= N; t++) v[t] += lam[j] * f.vec[t]; });
                    const c = arDiffEq(v, N);
                    if (!c || c.arity < 3 || c.arity > k) continue;
                    if (seen.has(c.key)) continue;
                    push(c);
                    for (const dd of [1, -1, 2, -2]) {
                        const v2 = c.vec.slice(); v2[N] -= dd;
                        push(arDiffEq(v2, N, { base: c }));
                    }
                }
            }
            return out;
        },
    };
}

// the amounts on a number line: exact when the premises pin them, relative when only the gaps are
// fixed, and one set that fits when even that is open
function dfModel(r, W) {
    const N = r.N;
    const V = linBasis(r.facts.map(f => f.vec.slice(0, N)));
    const zeroSum = r.facts.every(f => f.vec.slice(0, N).reduce((s, x) => s + x, 0) === 0);
    let vals = r.h.slice(), head;
    if (zeroSum && V.length === N - 1) {
        const lo = Math.min(...vals);
        vals = vals.map(v => v - lo);
        head = 'How far apart they are (only the gaps are fixed, so the lowest is put at 0)';
    } else if (!zeroSum && V.length === N) {
        head = 'The amounts (the premises fix every one)';
    } else {
        head = 'One set of amounts that fits (the premises leave some of it open)';
    }
    return { numberLine: { head, rows: arRange(N).map(i => [W[i], vals[i]]) } };
}

function arDifferenceQuestion(length) {
    return arQuestion(arDifferenceFamily(), length, {
        category: 'Difference', type: 'difference', analogy: false, meta: false, minK: 2,
        countdown: savedata.overrideDifferenceTime || null,
        model: dfModel,
    });
}

class DifferenceQuestion { create(length) { return arDifferenceQuestion(length); } }
function createDifferenceGenerator(length) {
    return {
        question: new DifferenceQuestion(),
        premiseCount: getPremisesFor('overrideDifferencePremises', length),
        weight: savedata.overrideDifferenceWeight,
    };
}

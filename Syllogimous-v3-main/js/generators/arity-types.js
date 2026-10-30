// arity-types.js — two relation types that exist to carry the arity dial into algebras the rest of the
// app does not have, so that what is trained is relational binding rather than familiarity with a handful
// of frames.
//
//   Ring       things arranged in a circle. A circle has no first or last, so "A is clockwise of B" says
//              nothing at all — on a ring you reach B from A going clockwise whichever way they sit. The
//              smallest statement that carries information is ternary ("going clockwise from A you meet B
//              before C"), which makes this the one frame here whose *natural* arity is 3 rather than 2.
//              Transfers to anything modular: clock arithmetic, phases, cyclic permutations, seating.
//   Hierarchy  a tree: who is over whom, with no requirement that any two terms be comparable at all.
//              Every other frame in the app is total (every pair stands in some relation); here "neither
//              is over the other" is a third answer, and the nearest common superior of two terms is a
//              genuine ternary fact. Transfers to taxonomies, containment, divisibility, type systems.
//
// Both ride arity.js's builder, so they inherit its acceptance rules (conclusion forced, needs a
// top-arity premise, that premise open, not derivable without it) and its honest step-down.

// ================================================================ RING
// models: a permutation, m[i] = seat of term i; seat N-1 is next to seat 0.
class ArRingEngine extends ArEngine {
    constructor(n) { super('ring', arPerms(n), 1); this.n = n; }
    // what is settled about a pair on a ring is the clockwise step from one to the other
    pairClasses(x, y) {
        const key = x + ',' + y;
        let cls = this.pairCache.get(key);
        if (!cls) {
            cls = [];
            for (let g = 1; g < this.n; g++) cls.push(abFrom(this.models, m => (m[y] - m[x] + this.n) % this.n === g));
            this.pairCache.set(key, cls);
        }
        return cls;
    }
}
const AR_RING_ENGINES = {};
const arRingEngine = n => AR_RING_ENGINES[n] || (AR_RING_ENGINES[n] = new ArRingEngine(n));

function arRingFamily() {
    const gap = (m, x, y, N) => (m[y] - m[x] + N) % N;          // clockwise steps from x to y
    const dist = (m, x, y, N) => Math.min(gap(m, x, y, N), N - gap(m, x, y, N));
    const mk = (N) => {
        // "A is the next one clockwise after B"
        const next = (a, b) => ({
            key: `n${a},${b}`, arity: 2, terms: [a, b], pairs: [],
            truth: m => gap(m, b, a, N) === 1,
            html: (W, plain) => `${arS(W[a])} ${arPhrase('is the next one clockwise after', 'is not the next one clockwise after', plain)} ${arS(W[b])}`,
        });
        // "going clockwise from A you reach B before C" — the smallest fact a ring can carry
        const cyc = (a, b, c) => ({
            key: `c${a},${b},${c}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => gap(m, a, b, N) < gap(m, a, c, N),
            html: (W, plain) => `${arR('Going clockwise from')} ${arS(W[a])}, ${arS(W[b])} ${arPhrase('comes before', 'comes after', plain)} ${arS(W[c])}`,
        });
        // "A sits closer to B than to C" — distance round the ring, either way round
        // no negated wording: on an even ring two terms can be the same distance away, so "not further"
        // is not the same claim as "closer"
        const nearer = (a, b, c) => ({
            key: `r${a},${b},${c}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => dist(m, a, b, N) < dist(m, a, c, N),
            html: (W) => `${arS(W[a])} ${arR('sits closer to')} ${arS(W[b])} ${arR('than to')} ${arS(W[c])}`,
        });
        // "it is the same number of steps clockwise from A to B as from C to D"
        const sameGap = (a, b, c, d) => ({
            key: arPairKey('g', [a, b], [c, d]), arity: 4, terms: [a, b, c, d], pairs: [[a, b, null], [c, d, null]],
            truth: m => gap(m, a, b, N) === gap(m, c, d, N),
            html: (W, plain) => `${arR('It is')} ${arPhrase('the same number of steps', 'a different number of steps', plain)} ${arR('clockwise from')} ${arS(W[a])} ${arR('to')} ${arS(W[b])} ${arR('as from')} ${arS(W[c])} ${arR('to')} ${arS(W[d])}`,
        });
        // "exactly one of A and B lies on the clockwise way from C round to D"
        const oneArc = (a, b, c, d) => {
            const lo = a < b ? a : b, hi = a < b ? b : a;
            const on = (m, x) => gap(m, c, x, N) < gap(m, c, d, N);
            return {
                key: `a${lo},${hi};${c},${d}`, arity: 4, terms: [a, b, c, d], pairs: [[a, c, null], [a, d, null], [b, c, null], [b, d, null]],
                truth: m => on(m, a) !== on(m, b),
                html: (W, plain) => `${arR('Exactly one of')} ${arS(W[a])} ${arR('and')} ${arS(W[b])} ${arPhrase('lies on', 'lies off', plain)} ${arR('the clockwise way from')} ${arS(W[c])} ${arR('round to')} ${arS(W[d])}`,
            };
        };
        return { next, cyc, nearer, sameGap, oneArc };
    };
    return {
        id: 'ring',
        engine: N => arRingEngine(N),
        terms: (P, k) => Math.max(k + 1, Math.min(6, P + 1)),
        hidden: N => Int8Array.from(shuffle(arRange(N))),
        fact(h, N, a, used) {
            const F = mk(N);
            if (a === 2) {
                const [x, y] = arTerms(N, 2, used);
                return (h[x] - h[y] + N) % N === 1 ? F.next(x, y) : (h[y] - h[x] + N) % N === 1 ? F.next(y, x) : null;
            }
            if (a === 3) {
                const t = arTerms(N, 3, used);
                const opts = [];
                for (const [p, q, r] of [[t[0], t[1], t[2]], [t[1], t[0], t[2]], [t[2], t[0], t[1]]]) {
                    opts.push(F.cyc(p, q, r), F.cyc(p, r, q), F.nearer(p, q, r), F.nearer(p, r, q));
                }
                return arPick(opts.filter(f => f.truth(h)));
            }
            const [w, x, y, z] = arTerms(N, 4, used);
            const quads = [F.sameGap(w, x, y, z), F.sameGap(w, y, x, z), F.oneArc(w, x, y, z), F.oneArc(w, y, x, z)];
            return arPick(quads.filter(f => f.truth(h)));
        },
        conclusions(h, N, k) {
            const F = mk(N), out = [];
            for (const x of arRange(N)) for (const y of arRange(N)) if (x !== y) out.push(F.next(x, y));
            if (k >= 3) for (let i = 0; i < 40; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3);
                out.push(coinFlip() ? F.cyc(a, b, c) : F.nearer(a, b, c));
            }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const [a, b, c, d] = shuffle(arRange(N)).slice(0, 4);
                out.push(coinFlip() ? F.sameGap(a, b, c, d) : F.oneArc(a, b, c, d));
            }
            return out;
        },
    };
}
function arRingQuestion(length) {
    return arQuestion(arRingFamily(), length, {
        category: 'Ring', type: 'ring', analogy: false, meta: false, minK: 2,
        explainer: 'A ring has no start: only the way round matters',
        countdown: savedata.overrideRingTime || null,
        model: (r, W) => ({
            modelNote: 'Clockwise round the ring, carrying on from the last back to the first',
            bucket: arRange(r.N).sort((a, b) => r.h[a] - r.h[b]).map(i => W[i]),
        }),
    });
}

// ================================================================ HIERARCHY
// models: rooted forests. m[i] = the one directly over i, or -1 for a top. Forests on n labelled nodes
// number (n+1)^(n-1), so 6 terms is 16807 models — the cap is there for that reason.
function arForests(n) {
    const key = 'f' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [], cur = new Int8Array(n);
    const acyclic = () => {
        for (let i = 0; i < n; i++) {
            let w = i;
            for (let steps = 0; w !== -1; steps++) {
                if (steps > n) return false;
                w = cur[w];
            }
        }
        return true;
    };
    const rec = i => {
        if (i === n) { if (acyclic()) out.push(Int8Array.from(cur)); return; }
        for (let p = -1; p < n; p++) { if (p === i) continue; cur[i] = p; rec(i + 1); }
    };
    rec(0);
    return AR_MODELS[key] = out;
}
const arOver = (m, x, y) => { for (let w = m[y]; w !== -1; w = m[w]) if (w === x) return true; return false; };
class ArTreeEngine extends ArEngine {
    constructor(n) { super('tree', arForests(n), 1); }
    // over / under / neither — the third class is the point of this frame
    pairClasses(x, y) {
        const key = x + ',' + y;
        let cls = this.pairCache.get(key);
        if (!cls) {
            cls = [abFrom(this.models, m => arOver(m, x, y)), abFrom(this.models, m => arOver(m, y, x)),
                   abFrom(this.models, m => !arOver(m, x, y) && !arOver(m, y, x))];
            this.pairCache.set(key, cls);
        }
        return cls;
    }
}
const AR_TREE_ENGINES = {};
const arTreeEngine = n => AR_TREE_ENGINES[n] || (AR_TREE_ENGINES[n] = new ArTreeEngine(n));

function arHierarchyFamily() {
    const over = (a, b) => ({
        key: `o${a},${b}`, arity: 2, terms: [a, b], pairs: [],
        truth: m => arOver(m, a, b),
        html: (W, plain) => `${arS(W[a])} ${arPhrase('is somewhere over', 'is not over', plain)} ${arS(W[b])}`,
    });
    const apart = (a, b) => ({
        key: `u${Math.min(a, b)},${Math.max(a, b)}`, arity: 2, terms: [a, b], pairs: [],
        truth: m => !arOver(m, a, b) && !arOver(m, b, a),
        html: (W, plain) => `${arS(W[a])} ${arR('and')} ${arS(W[b])} ${arPhrase('lie on different lines of descent', 'lie on one line of descent', plain)}`,
    });
    // "A is the lowest one over both B and C" — a nearest common superior: genuinely ternary
    const meet = (a, b, c) => ({
        key: `m${a};${Math.min(b, c)},${Math.max(b, c)}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
        truth: m => {
            if (!arOver(m, a, b) || !arOver(m, a, c)) return false;
            // nothing STRICTLY BELOW a on b's line may also be over c, or that one would be lower.
            // The walk has to stop at a: everything above a is over c too, and that says nothing.
            for (let w = m[b]; w !== -1 && w !== a; w = m[w]) if (arOver(m, w, c)) return false;
            return true;
        },
        html: (W, plain) => `${arS(W[a])} ${arPhrase('is the lowest one over both', 'is not the lowest one over both', plain)} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
    });
    const overOne = (a, b, c) => ({
        key: `p${a};${Math.min(b, c)},${Math.max(b, c)}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
        truth: m => arOver(m, a, b) || arOver(m, a, c),
        html: (W, plain) => `${arS(W[a])} ${arR('is over')} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`,
    });
    const notaLine = (a, b, c) => ({
        key: `l${[a, b, c].slice().sort((p, q) => p - q)}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [b, c, null], [a, c, null]],
        truth: m => {
            const rel = (x, y) => arOver(m, x, y) || arOver(m, y, x);
            return !(rel(a, b) && rel(b, c) && rel(a, c));
        },
        html: (W, plain) => `${arS(W[a])}, ${arS(W[b])} ${arR('and')} ${arS(W[c])} ${arPhrase('do not all lie on one line of descent', 'all lie on one line of descent', plain)}`,
    });
    // NOT arPairKey here: "over" is not symmetric, so flipping a pair changes the claim. Only swapping
    // the two sides of the "exactly when" leaves it alone.
    const iff = (w, x, y, z) => ({
        key: 'q' + [`${w},${x}`, `${y},${z}`].sort().join('|'), arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => arOver(m, w, x) === arOver(m, y, z),
        html: (W, plain) => `${arS(W[w])} ${arR('is over')} ${arS(W[x])} ${arR('exactly when')} ${arS(W[y])} ${arPhrase('is over', 'is not over', plain)} ${arS(W[z])}`,
    });
    const countUnder = (a, rest, n) => ({
        key: `k${a};${rest.slice().sort((p, q) => p - q)};${n}`, arity: 1 + rest.length, terms: [a, ...rest], pairs: rest.map(r => [a, r, null]),
        truth: m => rest.filter(r => arOver(m, a, r)).length === n,
        html: (W) => {
            const list = `${rest.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[rest[rest.length - 1]])}`;
            return n === 0
                ? `${arR('None of')} ${list} ${arR('sits under')} ${arS(W[a])}`
                : `${arR('Exactly ' + n + ' of')} ${list} ${arR(n === 1 ? 'sits under' : 'sit under')} ${arS(W[a])}`;
        },
    });
    return {
        id: 'tree',
        engine: N => arTreeEngine(N),
        terms: (P, k) => Math.max(k + 1, Math.min(6, P + 1)),
        // each term picks its superior from the ones before it, or stands at the top — acyclic by
        // construction. Kept only if some term sits two levels down, or there is nothing to reason about.
        hidden(N) {
            for (;;) {
                const m = new Int8Array(N);
                for (let i = 0; i < N; i++) {
                    m[i] = (i === 0 || Math.random() < 0.2) ? -1 : Math.floor(Math.random() * i);
                }
                if (arRange(N).some(i => m[i] !== -1 && m[m[i]] !== -1)) return m;
            }
        },
        fact(h, N, a, used) {
            if (a === 2) {
                const [x, y] = arTerms(N, 2, used);
                if (arOver(h, x, y)) return over(x, y);
                if (arOver(h, y, x)) return over(y, x);
                return apart(x, y);
            }
            if (a === 3) {
                const t = arTerms(N, 3, used), opts = [];
                for (const [p, q, r] of [[t[0], t[1], t[2]], [t[1], t[0], t[2]], [t[2], t[0], t[1]]]) {
                    opts.push(meet(p, q, r), overOne(p, q, r));
                }
                opts.push(notaLine(t[0], t[1], t[2]));
                return arPick(opts.filter(f => f.truth(h)));
            }
            const [w, x, y, z] = arTerms(N, 4, used);
            const quads = [iff(w, x, y, z), iff(w, y, x, z)];
            for (const n of [0, 1, 2]) quads.push(countUnder(w, [x, y, z], n));
            return arPick(quads.filter(f => f.truth(h)));
        },
        conclusions(h, N, k) {
            const out = [];
            for (const x of arRange(N)) for (const y of arRange(N)) if (x !== y) out.push(over(x, y));
            for (const x of arRange(N)) for (const y of arRange(N)) if (x < y) out.push(apart(x, y));
            if (k >= 3) for (let i = 0; i < 40; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3), r = Math.random();
                out.push(r < 0.4 ? meet(a, b, c) : r < 0.75 ? overOne(a, b, c) : notaLine(a, b, c));
            }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const [a, b, c, d] = shuffle(arRange(N)).slice(0, 4);
                out.push(coinFlip() ? iff(a, b, c, d) : countUnder(a, [b, c, d], arPick([0, 1, 2])));
            }
            return out;
        },
    };
}
function arHierarchyQuestion(length) {
    return arQuestion(arHierarchyFamily(), length, {
        category: 'Hierarchy', type: 'hierarchy', analogy: false, meta: false, minK: 2,
        explainer: 'Two things need not be related at all',
        countdown: savedata.overrideHierarchyTime || null,
        model: (r, W) => {
            const rows = [], kids = i => arRange(r.N).filter(j => r.h[j] === i);
            const walk = (i, d) => { rows.push([d, W[i]]); for (const c of kids(i)) walk(c, d + 1); };
            for (const top of arRange(r.N).filter(i => r.h[i] === -1)) walk(top, 0);
            return { lines: { head: 'Who sits over whom (indented = under the one above)', rows } };
        },
    });
}

// ================================================================ wiring
class RingQuestion { create(length) { return arRingQuestion(length); } }
class HierarchyQuestion { create(length) { return arHierarchyQuestion(length); } }
function createRingGenerator(length) {
    return {
        question: new RingQuestion(),
        premiseCount: getPremisesFor('overrideRingPremises', length),
        weight: savedata.overrideRingWeight,
    };
}
function createHierarchyGenerator(length) {
    return {
        question: new HierarchyQuestion(),
        premiseCount: getPremisesFor('overrideHierarchyPremises', length),
        weight: savedata.overrideHierarchyWeight,
    };
}

// intervals.js — stretches of time, each with a start and an end.
//
// Linear puts points in order. Here every term is a span, so one relation between two terms is a fact
// about four endpoints at once, and two relations seldom pin down a third: "A overlaps the start of B"
// and "B overlaps the start of C" leave A either clear of C or overlapping its start. What does follow is
// often a fact about endpoints ("A starts before C starts"), so the endpoint relations are part of the
// vocabulary. No two endpoints coincide.
//
//   2  "A is wholly before B", "A overlaps the start of B", "A lies within B", "A covers all of B",
//      "A starts before B starts", "A ends before B ends", "A and B overlap"
//   3  "A comes between B and C"; "A overlaps B or C"; "A, B and C are never all going at once"
//   4  "A overlaps B exactly when C overlaps D"; "Exactly 2 of B, C and D overlap A"
//   5  "Exactly 2 of B, C, D and E overlap A"; "Exactly one of A, B and C comes between D and E"
//
// Every order of the 2N endpoints is enumerated ((2N)!/2^N of them: 113400 for five spans, the cap).

function arSpans(n) {
    const key = 'i' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [], cur = new Int8Array(2 * n), state = new Int8Array(n);   // 0 not started, 1 open, 2 closed
    const rec = pos => {
        if (pos === 2 * n) { out.push(Int8Array.from(cur)); return; }
        for (let i = 0; i < n; i++) {
            if (state[i] === 0) { state[i] = 1; cur[2 * i] = pos; rec(pos + 1); state[i] = 0; }
            else if (state[i] === 1) { state[i] = 2; cur[2 * i + 1] = pos; rec(pos + 1); state[i] = 1; }
        }
    };
    rec(0);
    return AR_MODELS[key] = out;
}

const ivS = (m, i) => m[2 * i], ivE = (m, i) => m[2 * i + 1];
// the six ways two spans can lie when no endpoints coincide (x relative to y)
const IV_BASIC = {
    b: { text: 'is wholly before', tail: '', test: (m, x, y) => ivE(m, x) < ivS(m, y) },
    a: { text: 'is wholly after', tail: '', test: (m, x, y) => ivE(m, y) < ivS(m, x) },
    o: { text: 'overlaps the start of', tail: '', test: (m, x, y) => ivS(m, x) < ivS(m, y) && ivS(m, y) < ivE(m, x) && ivE(m, x) < ivE(m, y) },
    O: { text: 'overlaps the end of', tail: '', test: (m, x, y) => ivS(m, y) < ivS(m, x) && ivS(m, x) < ivE(m, y) && ivE(m, y) < ivE(m, x) },
    d: { text: 'lies within', tail: '', test: (m, x, y) => ivS(m, y) < ivS(m, x) && ivE(m, x) < ivE(m, y) },
    D: { text: 'covers all of', tail: '', test: (m, x, y) => ivS(m, x) < ivS(m, y) && ivE(m, y) < ivE(m, x) },
};
const ivOverlap = (m, x, y) => ivS(m, x) < ivE(m, y) && ivS(m, y) < ivE(m, x);
const ivBasicOf = (m, x, y) => Object.keys(IV_BASIC).find(r => IV_BASIC[r].test(m, x, y));

class ArSpanEngine extends ArEngine {
    // a statement over five spans is a 14 KB bitset, so fewer of them are kept
    constructor(n) { super('span', arSpans(n), 1); this.cacheCap = 1500; }
    // what is settled about a pair is which of the six ways they lie
    pairClasses(x, y) {
        const key = x + ',' + y;
        let cls = this.pairCache.get(key);
        if (!cls) {
            cls = Object.values(IV_BASIC).map(r => abFrom(this.models, m => r.test(m, x, y)));
            this.pairCache.set(key, cls);
        }
        return cls;
    }
}
const AR_SPAN_ENGINES = {};
const arSpanEngine = n => AR_SPAN_ENGINES[n] || (AR_SPAN_ENGINES[n] = new ArSpanEngine(n));

function arIntervalsFamily() {
    const list = (W, xs) => `${xs.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[xs[xs.length - 1]])}`;
    const basic = (x, y, r) => ({
        key: `B${r}${x},${y}`, arity: 2, terms: [x, y], pairs: [],
        truth: m => IV_BASIC[r].test(m, x, y),
        html: (W) => `${arS(W[x])} ${arR(IV_BASIC[r].text)} ${arS(W[y])}${IV_BASIC[r].tail ? ' ' + arR(IV_BASIC[r].tail) : ''}`,
    });
    // endpoint facts: one comparison each
    const startsFirst = (x, y) => ({
        key: `s${x},${y}`, arity: 2, terms: [x, y], pairs: [],
        truth: m => ivS(m, x) < ivS(m, y),
        html: (W, plain) => `${arS(W[x])} ${arPhrase('starts before', 'starts after', plain)} ${arS(W[y])} ${arR('starts')}`,
    });
    const endsFirst = (x, y) => ({
        key: `e${x},${y}`, arity: 2, terms: [x, y], pairs: [],
        truth: m => ivE(m, x) < ivE(m, y),
        html: (W, plain) => `${arS(W[x])} ${arPhrase('ends before', 'ends after', plain)} ${arS(W[y])} ${arR('ends')}`,
    });
    const overlap = (x, y, yes) => {
        const [p, q] = x < y ? [x, y] : [y, x];
        return {
            key: `v${p},${q},${+yes}`, arity: 2, terms: [x, y], pairs: [],
            truth: m => ivOverlap(m, x, y) === yes,
            html: (W, plain) => `${arS(W[x])} ${arR('and')} ${arS(W[y])} ${yes ? arPhrase('overlap', 'do not overlap', plain) : arPhrase('do not overlap', 'overlap', plain)}`,
        };
    };
    // "A comes between B and C": after one of them has ended and before the other starts
    const between = (a, b, c) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `t${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => (ivE(m, b) < ivS(m, a) && ivE(m, a) < ivS(m, c)) || (ivE(m, c) < ivS(m, a) && ivE(m, a) < ivS(m, b)),
            html: (W, plain) => `${arS(W[a])} ${arPhrase('comes between', 'does not come between', plain)} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
        };
    };
    const ovOne = (a, b, c) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `r${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => ivOverlap(m, a, b) || ivOverlap(m, a, c),
            html: (W, plain) => (plain || !savedata.enableNegation || coinFlip())
                ? `${arS(W[a])} ${arR('overlaps')} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`
                : `${arS(W[a])} ${arR(arNeg('overlaps neither'))} ${arS(W[b])} ${arR('nor')} ${arS(W[c])}`,
        };
    };
    const withinOne = (a, b, c) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `w${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => IV_BASIC.d.test(m, a, b) || IV_BASIC.d.test(m, a, c),
            html: (W) => `${arS(W[a])} ${arR('lies within')} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`,
        };
    };
    // no moment when all three are going (every pair can still overlap: A with B early, B with C late)
    const neverAll = (a, b, c) => {
        const t = [a, b, c].slice().sort((p, q) => p - q);
        return {
            key: `n${t}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [b, c, null], [a, c, null]],
            truth: m => !(Math.max(ivS(m, a), ivS(m, b), ivS(m, c)) < Math.min(ivE(m, a), ivE(m, b), ivE(m, c))),
            html: (W, plain) => `${list(W, [a, b, c])} ${arPhrase('are never all going at once', 'are all going at some moment', plain)}`,
        };
    };
    // "A overlaps B exactly when C overlaps D" (either side may be "does not")
    const iffOv = (w, x, y, z, s1, s2) => ({
        key: 'q' + [[Math.min(w, x), Math.max(w, x), +s1], [Math.min(y, z), Math.max(y, z), +s2]].map(v => v.join(',')).sort().join('|'),
        arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => (ivOverlap(m, w, x) === s1) === (ivOverlap(m, y, z) === s2),
        html: (W, plain) => `${arS(W[w])} ${arR(s1 ? 'overlaps' : 'does not overlap')} ${arS(W[x])} ${arR('exactly when')} ${arS(W[y])} ${arPhrase(s2 ? 'overlaps' : 'does not overlap', s2 ? 'does not overlap' : 'overlaps', plain)} ${arS(W[z])}`,
    });
    // "A starts before B starts exactly when C ends before D ends"
    const iffEnds = (w, x, y, z, endA, endB) => ({
        key: `Q${endA ? 'e' : 's'}${w},${x}|${endB ? 'e' : 's'}${y},${z}`,
        arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => ((endA ? ivE : ivS)(m, w) < (endA ? ivE : ivS)(m, x)) === ((endB ? ivE : ivS)(m, y) < (endB ? ivE : ivS)(m, z)),
        html: (W) => `${arS(W[w])} ${arR(endA ? 'ends before' : 'starts before')} ${arS(W[x])} ${arR(endA ? 'ends' : 'starts')} ${arR('exactly when')} ${arS(W[y])} ${arR(endB ? 'ends before' : 'starts before')} ${arS(W[z])} ${arR(endB ? 'ends' : 'starts')}`,
    });
    const countOv = (a, rest, n) => ({
        key: `k${a};${rest.slice().sort((p, q) => p - q)};${n}`, arity: rest.length + 1, terms: [a, ...rest], pairs: rest.map(r => [a, r, null]),
        truth: m => rest.filter(r => ivOverlap(m, a, r)).length === n,
        html: (W) => n === 0
            ? `${arR('None of')} ${list(W, rest)} ${arR('overlaps')} ${arS(W[a])}`
            : `${arR(n === 1 ? 'Exactly one of' : 'Exactly ' + n + ' of')} ${list(W, rest)} ${arR(n === 1 ? 'overlaps' : 'overlap')} ${arS(W[a])}`,
    });
    const someBetween = (movers, c, d, n) => {
        const ms = movers.slice().sort((p, q) => p - q), ends = c < d ? [c, d] : [d, c];
        const btw = (m, a) => (ivE(m, c) < ivS(m, a) && ivE(m, a) < ivS(m, d)) || (ivE(m, d) < ivS(m, a) && ivE(m, a) < ivS(m, c));
        return {
            key: `X${ms};${ends};${n}`, arity: movers.length + 2, terms: [...movers, c, d], pairs: movers.flatMap(x => [[x, c, null], [x, d, null]]),
            truth: m => movers.filter(x => btw(m, x)).length === n,
            html: (W) => `${arR(n === 1 ? 'Exactly one of' : 'Exactly ' + n + ' of')} ${list(W, movers)} ${arR(n === 1 ? 'comes between' : 'come between')} ${arS(W[c])} ${arR('and')} ${arS(W[d])}`,
        };
    };
    return {
        id: 'span',
        engine: N => arSpanEngine(N),
        // five spans is 113400 endpoint orders (four is 2520); six would be 7.5 million
        terms: (P, k) => Math.min(5, Math.max(k, P + 1)),
        hidden(N) {
            for (;;) {
                const pts = [];
                for (let i = 0; i < N; i++) {
                    const s = Math.random() * 10, len = 1 + Math.random() * 5;
                    pts.push([s, 2 * i], [s + len, 2 * i + 1]);
                }
                pts.sort((p, q) => p[0] - q[0]);
                const m = new Int8Array(2 * N);
                pts.forEach(([, slot], rank) => { m[slot] = rank; });
                // something has to overlap something, or it is just an order of points
                let ov = 0;
                for (let x = 0; x < N; x++) for (let y = x + 1; y < N; y++) if (ivOverlap(m, x, y)) ov++;
                if (ov >= 1 && ov < N * (N - 1) / 2) return m;
            }
        },
        fact(h, N, a, used) {
            if (a === 2) {
                const [x, y] = arTerms(N, 2, used);
                const r = Math.random();
                // mostly the exact relation; sometimes only what one endpoint comparison says
                if (r < 0.62) return basic(x, y, ivBasicOf(h, x, y));
                if (r < 0.74) return ivS(h, x) < ivS(h, y) ? startsFirst(x, y) : startsFirst(y, x);
                if (r < 0.86) return ivE(h, x) < ivE(h, y) ? endsFirst(x, y) : endsFirst(y, x);
                return overlap(x, y, ivOverlap(h, x, y));
            }
            if (a === 3) {
                const t = arTerms(N, 3, used), opts = [];
                for (const [p, q, r] of [[t[0], t[1], t[2]], [t[1], t[0], t[2]], [t[2], t[0], t[1]]]) {
                    opts.push(between(p, q, r), ovOne(p, q, r), withinOne(p, q, r));
                }
                opts.push(neverAll(t[0], t[1], t[2]));
                const ok = opts.filter(f => f.truth(h));
                return ok.length ? arPick(ok) : null;
            }
            if (a === 4) {
                const [w, x, y, z] = arTerms(N, 4, used), opts = [];
                const s1 = coinFlip();
                opts.push(iffOv(w, x, y, z, s1, ivOverlap(h, y, z) === (ivOverlap(h, w, x) === s1)));
                for (const ea of [false, true]) for (const eb of [false, true]) {
                    const f = iffEnds(w, x, y, z, ea, eb);
                    opts.push(f.truth(h) ? f : iffEnds(x, w, y, z, ea, eb));
                }
                for (const n of [0, 1, 2]) opts.push(countOv(w, [x, y, z], n));
                const ok = opts.filter(f => f.truth(h));
                return ok.length ? arPick(ok) : null;
            }
            const t = arTerms(N, 5, used), opts = [];
            for (let r = 0; r < 5; r++) {
                const rest = t.filter((_, i) => i !== r);
                for (const n of [1, 2, 3]) opts.push(countOv(t[r], rest, n));
            }
            for (const [c, d] of [[t[3], t[4]], [t[0], t[1]], [t[2], t[4]]]) {
                const movers = t.filter(x => x !== c && x !== d);
                for (const n of [1, 2]) opts.push(someBetween(movers, c, d, n));
            }
            const ok = opts.filter(f => f.truth(h));
            return ok.length ? arPick(ok) : null;
        },
        conclusions(h, N, k) {
            const out = [];
            for (const x of arRange(N)) for (const y of arRange(N)) {
                if (x === y) continue;
                // the exact relation and every other one (the near misses), then the endpoint facts
                for (const r of Object.keys(IV_BASIC)) out.push(basic(x, y, r));
                out.push(startsFirst(x, y), endsFirst(x, y));
                if (x < y) out.push(overlap(x, y, true), overlap(x, y, false));
            }
            if (k >= 3) for (let i = 0; i < 40; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3), r = Math.random();
                out.push(r < 0.35 ? between(a, b, c) : r < 0.6 ? ovOne(a, b, c) : r < 0.8 ? withinOne(a, b, c) : neverAll(a, b, c));
            }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const [a, b, c, d] = shuffle(arRange(N)).slice(0, 4), r = Math.random();
                if (r < 0.35) out.push(iffOv(a, b, c, d, coinFlip(), coinFlip()));
                else if (r < 0.6) out.push(iffEnds(a, b, c, d, coinFlip(), coinFlip()));
                else out.push(countOv(a, [b, c, d], arPick([0, 1, 2, 3])));
            }
            if (k >= 5 && N >= 5) for (let i = 0; i < 24; i++) {
                const t = shuffle(arRange(N)).slice(0, 5);
                out.push(coinFlip() ? countOv(t[0], t.slice(1), arPick([1, 2, 3])) : someBetween(t.slice(0, 3), t[3], t[4], arPick([1, 2])));
            }
            return out;
        },
    };
}

function arIntervalsQuestion(length) {
    return arQuestion(arIntervalsFamily(), length, {
        category: 'Intervals', type: 'intervals', analogy: false, meta: false, minK: 2,
        explainer: 'Each one is a stretch of time with a start and an end',
        countdown: savedata.overrideIntervalsTime || null,
        model: (r, W) => ({
            bars: {
                head: '',
                slots: 2 * r.N,
                rows: arRange(r.N).sort((a, b) => ivS(r.h, a) - ivS(r.h, b)).map(i => [W[i], ivS(r.h, i), ivE(r.h, i)]),
            },
        }),
    });
}

class IntervalsQuestion { create(length) { return arIntervalsQuestion(length); } }
function createIntervalsGenerator(length) {
    return {
        question: new IntervalsQuestion(),
        premiseCount: getPremisesFor('overrideIntervalsPremises', length),
        weight: savedata.overrideIntervalsWeight,
    };
}

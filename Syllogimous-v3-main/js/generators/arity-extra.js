// arity-extra.js — the arity dial for Influence, Contexts, Requirement and Balance, and for Binary.
//
// arity.js covers the frames whose facts live on a small hidden model (orders, space axes, same/opposite,
// categories). The four relation types the fork added are chains of two-term facts, so at arity 3 and 4
// each needs a premise that binds three or four terms AND cannot be broken into two-term pieces. The
// recipe is arity.js's: build premises, keep an item only if its conclusion is forced, needs a top-arity
// premise, and that premise can't be looked up piece by piece. Only the facts differ:
//
//   Influence    same/opposite structure with direct/inverse wording (shares arity.js's bits family):
//                  3  "A varies directly with B or C"      "A, B and C do not all move the same way"
//                  4  "A varies directly with B exactly when C varies directly with D"
//   Contexts     the same, once per context, each fact tagged "Under X:" / "Under Y:" or holding in both
//                  (two independent axes in the engine). The asked context has to matter: the same
//                  statement in the other context is forced the other way.
//   Requirement  clauses over works/fails. A conjunction ("A requires B and C") would fall apart into
//                  two-term facts, so the facts are the ones that don't:
//                  3  "A requires B or C"          "If A and B both work, C must work"
//                  4  "A requires B, C or D"       "If A and B both work, C or D must work"
//                     "If A, B and C all work, D must work"
//                False items are near misses: the converse, a literal moved across, one term swapped.
//   Balance      pans with several items on a side: "1 A and 2 B balance 3 C" — a weighing equation.
//                  Facts are checked as exact integer linear algebra: forced = in the span of the
//                  premises; a wrong claim is forced false when it is a one-coefficient edit of a claim
//                  that does follow (a positive weight times a nonzero edit can't be zero).
//   Binary       takes the arity of the two halves it is built from (it was reading as plain binary,
//                  with no label, no time scaling and no separate progression key).
//
// The answer formats (Judge / Name / Build / Missing link / Repair) stay two-term on purpose: they work
// on single edges of a tree ("add the missing premise", "repair this one") and have their own model.

// ================================================================ INFLUENCE
const AR_LEX_INFLUENCE = {
    pair: (W, x, y, same, plain) => plain
        ? `${arS(W[x])} ${arR(same ? 'varies directly with' : 'varies inversely with')} ${arS(W[y])}`
        : createPremiseHTML(same ? createDirectPremise(W[x], W[y]) : createInversePremise(W[x], W[y]), false),
    // the stock conclusion: "If A increases, B increases"
    pairConcl: (W, x, y, same, aUp) => {
        const bUp = same ? aUp : !aUp;
        return `If ${subjectHTML(W[x])} <span class="relation">${aUp ? 'increases' : 'decreases'}</span>, `
             + `${subjectHTML(W[y])} <span class="relation">${bUp ? 'increases' : 'decreases'}</span>`;
    },
    notAll: (W, a, b, c, plain) => `${arS(W[a])}, ${arS(W[b])} ${arR('and')} ${arS(W[c])} ${arPhrase('do not all move the same way', 'all move the same way', plain)}`,
    matchOne: (W, a, b, c, plain) => (plain || !savedata.enableNegation || coinFlip())
        ? `${arS(W[a])} ${arR('varies directly with')} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`
        : `${arS(W[a])} ${arR(arNeg('varies inversely with both'))} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
    iff: (W, w, x, y, z, s1, s2, plain) => `${arS(W[w])} ${arR(s1 ? 'varies directly with' : 'varies inversely with')} ${arS(W[x])} ${arR('exactly when')} ${arS(W[y])} ${arPhrase(s2 ? 'varies directly with' : 'varies inversely with', s2 ? 'varies inversely with' : 'varies directly with', plain)} ${arS(W[z])}`,
    countN: (W, a, rest, n, plain) => `${arR('Exactly ' + n + ' of')} ${rest.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[rest[rest.length - 1]])} ${arPhrase(n === 1 ? 'moves with' : 'move with', n === 1 ? 'moves against' : 'move against', plain)} ${arS(W[a])}`,
    either: (W, w, x, y, z, s1, s2, plain) => `${arR('Either')} ${arS(W[w])} ${arR(s1 ? 'varies directly with' : 'varies inversely with')} ${arS(W[x])}, ${arR('or')} ${arS(W[y])} ${arPhrase(s2 ? 'varies directly with' : 'varies inversely with', s2 ? 'varies inversely with' : 'varies directly with', plain)} ${arS(W[z])}, ${arR('or both')}`,
};
const arSides = (r, W) => [arRange(r.N).filter(i => r.h[i] === 0).map(i => W[i]), arRange(r.N).filter(i => r.h[i] === 1).map(i => W[i])];
function arInfluenceQuestion(iq, length) {
    return arQuestion(arBitsFamily(AR_LEX_INFLUENCE), length, {
        category: 'Influence', type: 'influence', analogy: false, meta: true,
        countdown: savedata.overrideInfluenceTime || null,
        model: (r, W) => ({ buckets: arSides(r, W) }),
    });
}

// ================================================================ CONTEXTS
function arContextsFamily() {
    const lex = AR_LEX_DISTINCTION;
    const evalShape = (s, m) => {
        switch (s.kind) {
            case 'pair': return (m[s.x] === m[s.y]) === s.same;
            case 'notAll': return !(m[s.a] === m[s.b] && m[s.b] === m[s.c]);
            case 'matchOne': return m[s.a] === m[s.b] || m[s.a] === m[s.c];
            case 'countN': return s.rest.filter(r => m[r] === m[s.a]).length === s.n;
            case 'either': return ((m[s.w] === m[s.x]) === s.s1) || ((m[s.y] === m[s.z]) === s.s2);
            default: return ((m[s.w] === m[s.x]) === s.s1) === ((m[s.y] === m[s.z]) === s.s2);
        }
    };
    const shapeKey = s => {
        switch (s.kind) {
            case 'pair': return `s${Math.min(s.x, s.y)},${Math.max(s.x, s.y)},${+s.same}`;
            case 'notAll': return `n${[s.a, s.b, s.c].sort((p, q) => p - q)}`;
            case 'matchOne': return `m${s.a};${Math.min(s.b, s.c)},${Math.max(s.b, s.c)}`;
            case 'countN': return `c${s.a};${s.rest.slice().sort((p, q) => p - q)};${s.n}`;
            case 'either': return 'E' + [[Math.min(s.w, s.x), Math.max(s.w, s.x), +s.s1], [Math.min(s.y, s.z), Math.max(s.y, s.z), +s.s2]].map(v => v.join(',')).sort().join('|');
            default: {
                const p = [[Math.min(s.w, s.x), Math.max(s.w, s.x)], [Math.min(s.y, s.z), Math.max(s.y, s.z)]].map(q => q.join(',')).sort().join('|');
                return 'q' + p + (s.s1 === s.s2 ? 'e' : 'n');
            }
        }
    };
    const shapeTerms = s => ({ pair: [s.x, s.y], notAll: [s.a, s.b, s.c], matchOne: [s.a, s.b, s.c], iff: [s.w, s.x, s.y, s.z], either: [s.w, s.x, s.y, s.z], countN: [s.a, ...(s.rest || [])] })[s.kind];
    const shapePairs = (s, tag) => ({
        pair: [[s.x, s.y, tag]],
        notAll: [[s.a, s.b, tag], [s.b, s.c, tag], [s.a, s.c, tag]],
        matchOne: [[s.a, s.b, tag], [s.a, s.c, tag]],
        iff: [[s.w, s.x, tag], [s.y, s.z, tag]],
        either: [[s.w, s.x, tag], [s.y, s.z, tag]],
        countN: (s.rest || []).map(r => [s.a, r, tag]),
    })[s.kind];
    const shapeHTML = (s, W, plain) => {
        switch (s.kind) {
            case 'pair': return lex.pair(W, s.x, s.y, s.same, plain);
            case 'notAll': return lex.notAll(W, s.a, s.b, s.c, plain);
            case 'matchOne': return lex.matchOne(W, s.a, s.b, s.c, plain);
            case 'countN': return lex.countN(W, s.a, s.rest, s.n, plain);
            case 'either': return lex.either(W, s.w, s.x, s.y, s.z, s.s1, s.s2, plain);
            default: return lex.iff(W, s.w, s.x, s.y, s.z, s.s1, s.s2, plain);
        }
    };
    // tag: 0 = under the first context, 1 = under the second, null = holds in both
    const mk = (s, tag) => {
        const terms = shapeTerms(s);
        return {
            key: `${tag === null ? '*' : tag}|${shapeKey(s)}`, arity: terms.length, terms, shape: s, tag,
            pairs: shapePairs(s, tag),
            truth: (m, a) => (tag === null || a === tag) ? evalShape(s, m) : true,
            html: (W, plain) => {
                const N = W.length - 2;
                return (tag === null ? '' : contextPrefix(W[N + tag])) + shapeHTML(s, W, plain);
            },
        };
    };
    // a shape of the asked arity that is true under the hidden state hh
    const genShape = (hh, N, a, used) => {
        if (a === 2) { const [x, y] = arTerms(N, 2, used); return { kind: 'pair', x, y, same: hh[x] === hh[y] }; }
        if (a === 3) {
            const [p, q, r] = arTerms(N, 3, used), opts = [];
            if (!(hh[p] === hh[q] && hh[q] === hh[r])) opts.push({ kind: 'notAll', a: p, b: q, c: r });
            for (const [a1, b1, c1] of [[p, q, r], [q, p, r], [r, p, q]]) if (hh[a1] === hh[b1] || hh[a1] === hh[c1]) opts.push({ kind: 'matchOne', a: a1, b: b1, c: c1 });
            return opts.length ? arPick(opts) : null;
        }
        const [w, x, y, z] = arTerms(N, 4, used);
        const s1 = coinFlip(), v1 = (hh[w] === hh[x]) === s1;
        const quads = [{ kind: 'iff', w, x, y, z, s1, s2: ((hh[y] === hh[z]) === v1) }];
        for (const n of [1, 2]) quads.push({ kind: 'countN', a: w, rest: [x, y, z], n });
        for (const t1 of [true, false]) for (const t2 of [true, false]) quads.push({ kind: 'either', w, x, y, z, s1: t1, s2: t2 });
        return arPick(quads.filter(q => evalShape(q, hh)));
    };
    const hiddenOne = N => Int8Array.from(arRange(N).map(i => (i === 0 ? 0 : Math.random() < 0.5 ? 1 : 0)));
    return {
        id: 'ctx',
        extraStimuli: 2,
        engine: N => arEngine('bits', N, 2),
        terms: (P, k) => Math.max(k + 1, Math.min(9, P + 1)),
        hidden: N => [hiddenOne(N), hiddenOne(N)],
        fact(h, N, a, used) {
            const c = coinFlip() ? 0 : 1;
            const s = genShape(h[c], N, a, used);
            if (!s) return null;
            const both = evalShape(s, h[0]) && evalShape(s, h[1]);
            return mk(s, both && coinFlip() ? null : c);
        },
        conclusions(h, N, k) {
            const out = [];
            for (const tag of [0, 1]) {
                for (const x of arRange(N)) for (const y of arRange(N)) if (x < y) {
                    out.push(mk({ kind: 'pair', x, y, same: true }, tag));
                    out.push(mk({ kind: 'pair', x, y, same: false }, tag));
                }
                if (k >= 3) for (let i = 0; i < 20; i++) {
                    const [a, b, c] = shuffle(arRange(N)).slice(0, 3);
                    out.push(mk(coinFlip() ? { kind: 'notAll', a, b, c } : { kind: 'matchOne', a, b, c }, tag));
                }
                if (k >= 4) for (let i = 0; i < 20; i++) {
                    const [w, x, y, z] = shuffle(arRange(N)).slice(0, 4), r = Math.random();
                    if (r < 0.5) out.push(mk({ kind: 'iff', w, x, y, z, s1: coinFlip(), s2: coinFlip() }, tag));
                    else if (r < 0.75) out.push(mk({ kind: 'countN', a: w, rest: [x, y, z], n: arPick([1, 2]) }, tag));
                    else out.push(mk({ kind: 'either', w, x, y, z, s1: coinFlip(), s2: coinFlip() }, tag));
                }
            }
            return out;
        },
        // the context must matter: the same statement under the other context is forced the other way
        accept(eng, M, c, tierIdx) {
            // the strict test (the other context is forced the opposite way); the loosest tiers only ask
            // that the other context is not forced to the same answer
            const v1 = eng.valueM(M, c), v2 = eng.valueM(M, mk(c.shape, 1 - c.tag));
            return tierIdx <= 3 ? (v2 !== null && v2 !== v1) : v2 !== v1;
        },
    };
}
function arContextsQuestion(cq, length) {
    return arQuestion(arContextsFamily(), length, {
        category: 'Contexts', type: 'contexts', analogy: false, meta: false,
        countdown: savedata.overrideContextsTime || null,
        model: (r, W) => ({
            subresults: [0, 1].map(c => ({
                category: 'Contexts',
                title: `Under ${W[r.N + c]}`,
                buckets: [arRange(r.N).filter(i => r.h[c][i] === 0).map(i => W[i]), arRange(r.N).filter(i => r.h[c][i] === 1).map(i => W[i])],
            })),
        }),
    });
}

// ================================================================ REQUIREMENT
function arStates(n) {
    const key = 's' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [];
    for (let x = 0; x < (1 << n); x++) { const m = new Int8Array(n); for (let i = 0; i < n; i++) m[i] = (x >> i) & 1; out.push(m); }
    return AR_MODELS[key] = out;
}
// A clause (neg | pos): "if every neg term works, at least one pos term works".
// "A requires B" is ({A} | {B}); a requirement is never forced to work or to fail on its own.
class ArReqEngine extends ArEngine {
    constructor(n) { super('req', arStates(n), 1); }
    // true if it follows. A near miss (it has a `base`, the claim it imitates) is false when that claim
    // follows and it does not — "what you were told stops one step short of this".
    valueM(M, c) {
        const m0 = M[0], C = this.bits(c)[0];
        if (c.base) return (abSubset(m0, this.bits(c.base)[0]) && !abSubset(m0, C)) ? false : null;
        return abSubset(m0, C) ? true : null;
    }
    pairClasses(x, y, a) {      // is "x works -> y works" settled?
        const key = x + ',' + y + ',' + a;
        let cls = this.pairCache.get(key);
        if (!cls) {
            cls = [abFrom(this.models, m => !m[x] || m[y]), abFrom(this.models, m => m[x] && !m[y])];
            this.pairCache.set(key, cls);
        }
        return cls;
    }
}
const AR_REQ_ENGINES = {};
const arReqEngine = n => AR_REQ_ENGINES[n] || (AR_REQ_ENGINES[n] = new ArReqEngine(n));

const arList = (W, ts, word) => {
    const s = ts.map(t => arS(W[t]));
    if (s.length === 1) return s[0];
    return `${s.slice(0, -1).join(', ')} ${arR(word)} ${s[s.length - 1]}`;
};
function arClause(neg, pos, opts = {}) {
    const terms = [...neg, ...pos];
    const key = 'r' + [...neg].sort((a, b) => a - b).join('.') + '>' + [...pos].sort((a, b) => a - b).join('.');
    const premiseHTML = (W, plain) => {
        if (!pos.length) {
            return neg.length === 2
                ? `${arS(W[neg[0]])} ${arR('and')} ${arS(W[neg[1]])} ${arPhrase('do not both work', 'both work', plain)}`
                : `${arList(W, neg, 'and')} ${arPhrase('do not all work', 'all work', plain)}`;
        }
        // "A requires B or C" also reads "if A works and C fails, B must work" — the same clause,
        // a different way in, which is part of what makes the form worth practising
        if (!plain && neg.length === 1 && pos.length >= 2 && coinFlip()) {
            const j = Math.floor(Math.random() * pos.length);
            const rest = pos.filter((_, i) => i !== j);
            return `If ${arS(W[neg[0]])} ${arR('works')} ${arR('and')} ${arS(W[pos[j]])} ${arR('fails')}, ${arList(W, rest, 'or')} ${arR('must work')}`;
        }
        if (neg.length === 1 && pos.length === 1) {
            return (plain || coinFlip())
                ? `${arS(W[neg[0]])} ${arR('requires')} ${arS(W[pos[0]])}`
                : `${arS(W[pos[0]])} ${arR('is required by')} ${arS(W[neg[0]])}`;
        }
        if (neg.length === 1) return `${arS(W[neg[0]])} ${arR('requires')} ${arList(W, pos, 'or')}`;
        const lead = neg.length === 2 ? `If ${arS(W[neg[0]])} ${arR('and')} ${arS(W[neg[1]])} ${arR('both work')}` : `If ${arList(W, neg, 'and')} ${arR('all work')}`;
        return `${lead}, ${arList(W, pos, 'or')} ${arR('must work')}`;
    };
    const conclHTML = (W, plain) => {
        if (neg.length === 1 && pos.length === 1) {
            if (plain) return `${arS(W[neg[0]])} ${arR('requires')} ${arS(W[pos[0]])}`;
            // "x requires y" read two equivalent ways, as the stock Requirement conclusion does
            return coinFlip() ? workStatement(W[neg[0]], W[pos[0]]) : failStatement(W[pos[0]], W[neg[0]]);
        }
        return premiseHTML(W, plain);
    };
    return {
        key, arity: terms.length, terms, neg, pos, base: opts.base || null,
        truth: m => neg.some(i => !m[i]) || pos.some(i => m[i]),
        pairs: neg.flatMap(a => pos.map(b => [a, b, null])),
        html: opts.concl ? conclHTML : premiseHTML,
    };
}
const AR_CLAUSE_CACHE = {};
function arAllClauses(N, k) {     // every conclusion-shaped clause of 2..k terms over N terms
    const key = N + ',' + k;
    if (AR_CLAUSE_CACHE[key]) return AR_CLAUSE_CACHE[key];
    const out = [];
    const rec = (start, cur) => {
        if (cur.length >= 2) {
            for (let mask = 1; mask < (1 << cur.length) - 1; mask++) {
                out.push(arClause(cur.filter((_, i) => (mask >> i) & 1), cur.filter((_, i) => !((mask >> i) & 1)), { concl: true }));
            }
        }
        if (cur.length === k) return;
        for (let t = start; t < N; t++) rec(t + 1, [...cur, t]);
    };
    rec(0, []);
    return AR_CLAUSE_CACHE[key] = out;
}
function arNearMisses(c0, N, k) {
    const { neg, pos } = c0, out = new Map();
    const add = (n, p) => {
        if (!n.length || !p.length || n.length + p.length < 2 || n.length + p.length > k) return;
        if (new Set([...n, ...p]).size !== n.length + p.length) return;
        const c = arClause(n, p, { concl: true, base: c0 });
        if (c.key !== c0.key) out.set(c.key, c);
    };
    add(pos, neg);                                                         // the converse
    for (const i of neg) add(neg.filter(x => x !== i), [...pos, i]);       // a literal moved across
    for (const j of pos) add([...neg, j], pos.filter(x => x !== j));
    const unused = arRange(N).filter(t => !c0.terms.includes(t));
    for (const u of unused) {                                              // one term swapped
        for (const i of neg) add(neg.map(x => (x === i ? u : x)), pos);
        for (const j of pos) add(neg, pos.map(x => (x === j ? u : x)));
    }
    if (pos.length > 1) for (const j of pos) add(neg, pos.filter(x => x !== j));   // a stronger claim
    return [...out.values()];
}
function arRequirementFamily() {
    return {
        id: 'req',
        engine: N => arReqEngine(N),
        terms: (P, k) => Math.max(k + 1, Math.min(7, P + 1)),
        hidden: () => null,
        fact(h, N, a, used) {
            const t = arTerms(N, a, used);
            // at 3+ terms, sometimes the clause with nothing on the right: "A, B and C do not all work"
            if (a >= 3 && Math.random() < 0.18) return arClause(t, []);
            const nNeg = a === 2 ? 1 : a === 3 ? arPick([1, 2]) : arPick([1, 2, 3]);
            return arClause(t.slice(0, nNeg), t.slice(nNeg));
        },
        conclusions(h, N, k, opts, ctx) {
            const entailed = arAllClauses(N, k).filter(c => ctx.eng.valueM(ctx.M, c) === true);
            const out = shuffle(entailed.slice()).slice(0, 70);
            for (const c0 of shuffle(entailed.slice()).slice(0, 40)) {
                for (const nm of shuffle(arNearMisses(c0, N, k)).slice(0, 4)) if (ctx.eng.valueM(ctx.M, nm) === false) out.push(nm);
            }
            return out;
        },
    };
}
function arRequirementQuestion(rq, length) {
    return arQuestion(arRequirementFamily(), length, {
        category: 'Requirement', type: 'requirement', analogy: false, meta: false,
        explainer: '"or" means at least one of them',
        countdown: savedata.overrideRequirementTime || null,
        // The honest picture for a clause item is a world: everything that could be on or off at once.
        // For a conclusion that does not follow, a world where the premises hold and it fails IS the proof.
        model: (r, W) => {
            const fits = m => r.facts.every(f => f.truth(m));
            const rows = m => arRange(r.N).map(i => [W[i], !!m[i]]);
            const concl = r.concl.base && !r.isValid ? r.concl : r.concl;
            if (!r.isValid) {
                // the proof that it does not follow: a world the premises allow where it fails
                for (const m of arStates(r.N)) if (fits(m) && concl.truth(m) === false) {
                    return { states: { head: 'This fits every premise, and the conclusion fails in it', rows: rows(m) } };
                }
                return {};
            }
            // the proof that it does: turn on everything the conclusion asks about and see what follows
            for (const m of arStates(r.N)) {
                if (!fits(m) || !concl.neg.every(i => m[i])) continue;
                return { states: { head: 'With everything the conclusion asks about working, this is what the premises leave', rows: rows(m) } };
            }
            for (const m of arStates(r.N)) if (fits(m)) {
                return { states: { head: 'The premises never let all of those work at once, so the conclusion holds either way', rows: rows(m) } };
            }
            return {};
        },
    });
}

// ================================================================ BALANCE
// exact integer linear algebra: a basis is a list of rows, each already reduced against the earlier ones
function linGcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function linNorm(v) {
    let g = 0; for (const x of v) g = linGcd(g, x);
    if (!g) return v.slice();
    const first = v.find(x => x !== 0), sgn = first < 0 ? -1 : 1;
    return v.map(x => (x / g) * sgn);
}
function linReduce(basis, v) {
    v = v.slice();
    for (const row of basis) {
        const p = row.pivot;
        if (v[p] !== 0) {
            const a = row.v[p], b = v[p];
            for (let i = 0; i < v.length; i++) v[i] = v[i] * a - row.v[i] * b;
            const g = v.reduce((x, y) => linGcd(x, y), 0);
            if (g > 1) for (let i = 0; i < v.length; i++) v[i] /= g;
        }
    }
    return v;
}
function linAdd(basis, v) {          // returns false if v was already in the span
    const r = linReduce(basis, v);
    const pivot = r.findIndex(x => x !== 0);
    if (pivot < 0) return false;
    basis.push({ v: r, pivot });
    return true;
}
const linInSpan = (basis, v) => linReduce(basis, v).every(x => x === 0);
const linBasis = (vecs) => { const b = []; for (const v of vecs) linAdd(b, v); return b; };

class ArLinEngine {
    constructor(n) { this.n = n; }
    mask(facts) { return linBasis(facts.map(f => f.vec)); }
    valueM(B, c) {
        if (c.base) return (linInSpan(B, c.base.vec) && !linInSpan(B, c.vec)) ? false : null;
        return linInSpan(B, c.vec) ? true : null;
    }
    value(facts, c) { return this.valueM(this.mask(facts), c); }
    // is the ratio of x to y left open? (it is decided when some combination of the premises is
    // an equation in x and y alone)
    pairOpen(B, [x, y]) {
        const copy = B.slice();
        const ex = Array(this.n).fill(0), ey = Array(this.n).fill(0);
        ex[x] = 1; ey[y] = 1;
        return linAdd(copy, ex) && linAdd(copy, ey);
    }
}
const AR_LIN_ENGINES = {};
const arLinEngine = n => AR_LIN_ENGINES[n] || (AR_LIN_ENGINES[n] = new ArLinEngine(n));

function arLinEq(vec, opts = {}) {
    const v = linNorm(vec);
    const terms = arRange(v.length).filter(i => v[i] !== 0);
    return {
        key: 'l' + v.join(','), arity: terms.length, terms, vec: v, base: opts.base || null,
        pairs: terms.flatMap((x, i) => terms.slice(i + 1).map(y => [x, y, null])),
        html(W, plain) {
            const left = terms.filter(i => v[i] > 0).map(i => [v[i], i]);
            const right = terms.filter(i => v[i] < 0).map(i => [-v[i], i]);
            if (left.length === 1 && right.length === 1) {
                const [p, a] = left[0], [q, b] = right[0];
                const flip = !plain && coinFlip();
                return flip ? balanceHTML(q, W[b], p, W[a]) : balanceHTML(p, W[a], q, W[b]);
            }
            const pan = items => items.map(([n, i]) => `<span class="relation">${n}</span> ${arS(W[i])}`).join(` ${arR('and')} `);
            const L = plain ? left : shuffle(left.slice()), R = plain ? right : shuffle(right.slice());
            const swap = !plain && coinFlip();
            const [A, B] = swap ? [R, L] : [L, R];
            const verb = (A.length === 1 && A[0][0] === 1) ? 'balances' : 'balance';
            return `${pan(A)} ${arR(verb)} ${pan(B)}`;
        },
    };
}
function arBalanceFamily() {
    return {
        id: 'lin',
        engine: N => arLinEngine(N),
        terms: (P, k) => Math.max(k + 1, Math.min(7, P + 1)),
        hidden(N) {
            for (;;) {
                const h = arRange(N).map(() => 1 + Math.floor(Math.random() * 6));
                if (new Set(h).size >= Math.min(3, N)) return h;
            }
        },
        fact(h, N, a, used, facts) {
            for (let attempt = 0; attempt < 10; attempt++) {
                const t = arTerms(N, a, used);
                const leftSize = a === 2 ? 1 : a === 3 ? arPick([1, 2]) : arPick([1, 2, 3]);
                const sols = [];
                const co = Array(a).fill(1);
                const rec = i => {
                    if (i === a) {
                        if (co.reduce((g, x) => linGcd(g, x), 0) !== 1) return;
                        let s = 0;
                        for (let j = 0; j < a; j++) s += (j < leftSize ? 1 : -1) * co[j] * h[t[j]];
                        if (s === 0) sols.push(co.slice());
                        return;
                    }
                    for (let c = 1; c <= 3; c++) { co[i] = c; rec(i + 1); }
                };
                rec(0);
                if (!sols.length) continue;
                const pick = arPick(sols);
                const vec = Array(N).fill(0);
                for (let j = 0; j < a; j++) vec[t[j]] = (j < leftSize ? 1 : -1) * pick[j];
                // independent of what is already there, or it adds nothing
                if (facts && facts.length && !linAdd(linBasis(facts.map(f => f.vec)), vec)) continue;
                return arLinEq(vec);
            }
            return null;
        },
        conclusions(h, N, k, opts, ctx) {
            const F = ctx.facts, out = [], seen = new Set();
            const lamPool = [-2, -1, 0, 0, 1, 2];
            for (let i = 0; i < 500 && out.length < 90; i++) {
                const lam = F.map(() => arPick(lamPool));
                if (lam.filter(x => x).length < 2) continue;
                const v = Array(N).fill(0);
                F.forEach((f, j) => { for (let t = 0; t < N; t++) v[t] += lam[j] * f.vec[t]; });
                const nv = linNorm(v), terms = nv.filter(x => x !== 0).length;
                if (terms < 2 || terms > k || nv.some(x => Math.abs(x) > 4)) continue;
                if (!(nv.some(x => x > 0) && nv.some(x => x < 0))) continue;
                const key = nv.join(',');
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(arLinEq(nv));
            }
            // wrong claims: one coefficient edited (another size, or moved to the other side)
            for (const c0 of out.slice()) {
                const idx = arRange(N).filter(i => c0.vec[i] !== 0);
                for (let e = 0; e < 3; e++) {
                    const i = arPick(idx), cur = c0.vec[i], v2 = c0.vec.slice();
                    v2[i] = coinFlip() ? -cur : Math.sign(cur) * arPick([1, 2, 3, 4].filter(m => m !== Math.abs(cur)));
                    if (!(v2.some(x => x > 0) && v2.some(x => x < 0))) continue;
                    const eq = arLinEq(v2, { base: c0 });
                    if (eq.key !== c0.key) out.push(eq);
                }
            }
            return out;
        },
    };
}
function arBalanceQuestion(bq, length) {
    return arQuestion(arBalanceFamily(), length, {
        category: 'Balance', type: 'balance', analogy: false, meta: false,
        explainer: 'Each side adds up the weights on it',
        countdown: savedata.overrideBalanceTime || null,
        model: (r, W) => {
            const unique = linBasis(r.facts.map(f => f.vec)).length === r.N - 1;
            let g = 0; for (const x of r.h) g = linGcd(g, x);
            const w = i => r.h[i] / g;
            return {
                weights: {
                    head: unique ? 'The weights, in the smallest whole numbers that fit' : 'One set of weights that fits (the premises do not pin them all down)',
                    rows: arRange(r.N).sort((a, b) => w(a) - w(b)).map(i => [W[i], w(i)]),
                },
            };
        },
    });
}

// ================================================================ BINARY / NESTED BINARY
// A binary item is two questions joined by a logical operator, so it is as arity-heavy as its halves.
function arInheritArity(q) {
    const parts = (q && q.subresults) || [];
    const k = Math.max(2, ...parts.map(p => p.arity || 2));
    if (k >= 3) {
        q.arity = k;
        q.arityTimeMult = Math.max(1, ...parts.map(p => p.arityTimeMult || 1));
        q.modifiers = [...(q.modifiers || []), 'ar' + k];
    }
    return q;
}

// ================================================================ wiring
(function wireArityExtras() {
    const wrap = (cls, fn) => {
        const orig = cls.prototype.create;
        cls.prototype.create = function (length) {
            if (arityActive()) {
                const q = fn(this, length);
                if (q) return q;
            }
            return orig.call(this, length);
        };
    };
    wrap(InfluenceQuestion, arInfluenceQuestion);
    wrap(ContextsQuestion, arContextsQuestion);
    wrap(RequirementQuestion, arRequirementQuestion);
    wrap(BalanceQuestion, arBalanceQuestion);
    for (const cls of [BinaryQuestion, NestedBinaryQuestion]) {
        const orig = cls.prototype.create;
        cls.prototype.create = function (length) {
            const q = orig.call(this, length);
            return arityActive() ? arInheritArity(q) : q;
        };
    }
})();

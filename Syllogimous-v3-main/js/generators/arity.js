// arity.js — the arity dial. One setting (savedata.arity: 2 classic, 3 ternary, 4 quaternary) changes
// every frame: linear (all wordings), space 2D / 3D / space-time / anchor, distinction, syllogism, and
// through them analogy, binary and meta.
//
// Arity = how many terms ONE premise binds. A chain of two-term premises, however long, is processed one
// pair at a time; a premise like "A is between B and C" or "A is left of B exactly when C is left of D"
// can only be used by holding all of its terms together.
//
// At arity 3+ an item mixes two-term premises with ternary / quaternary ones and is kept only if:
//   1. the conclusion's truth is forced by the premises (syllogism: it follows, or it doesn't follow but
//      is still possible — never a plain contradiction);
//   2. the smallest set of premises that settles it contains a top-arity premise and covers a good share
//      of the premises (the conclusion needs integration, not one look-up);
//   3. no single premise settles it on its own;
//   4. at least one top-arity premise in that set is OPEN: all the OTHER premises (branches included)
//      leave every pairwise relation it talks about undecided, so it cannot be shrunk to a two-term step
//      by looking the pieces up first. This is what makes the arity real rather than cosmetic.
// If no item passes in a few tries the criteria relax one step at a time (open → partly open), never
// below 1–3.
//
// Every hidden model is enumerated (orders, weak orders per space axis, relative same/opposite states),
// and every fact is a bitset over those models, so each check is a few ANDs.

function arityLevel() {
    const a = +savedata.arity;
    return a >= 3 ? Math.min(4, a) : 2;
}
function arityActive() { return arityLevel() >= 3; }
const AR_TIME_MULT = { 2: 1, 3: 1.5, 4: 2 };

// ---------------------------------------------------------------- bitsets
function abNew(n) { return new Uint32Array((n + 31) >> 5); }
function abFull(n) {
    const w = abNew(n).fill(0xFFFFFFFF);
    const r = n & 31;
    if (r) w[w.length - 1] = ((1 << r) - 1) >>> 0;
    return w;
}
function abFrom(models, pred) {
    const w = abNew(models.length);
    for (let i = 0; i < models.length; i++) if (pred(models[i])) w[i >> 5] |= (1 << (i & 31));
    return w;
}
function abAndInto(a, b) { for (let i = 0; i < a.length; i++) a[i] &= b[i]; return a; }
function abSubset(a, b) { for (let i = 0; i < a.length; i++) if (a[i] & ~b[i]) return false; return true; }
function abDisjoint(a, b) { for (let i = 0; i < a.length; i++) if (a[i] & b[i]) return false; return true; }

// ---------------------------------------------------------------- model lists (cached)
const AR_MODELS = {};
function arPerms(n) {
    const key = 'p' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [], cur = new Int8Array(n), used = new Array(n).fill(false);
    const rec = i => {
        if (i === n) { out.push(Int8Array.from(cur)); return; }
        for (let p = 0; p < n; p++) if (!used[p]) { used[p] = true; cur[i] = p; rec(i + 1); used[p] = false; }
    };
    rec(0);
    return AR_MODELS[key] = out;
}
function arWeak(n) {       // weak orders: values 0..r, every value in between used (ties allowed)
    const key = 'w' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [], cur = new Int8Array(n);
    const rec = i => {
        if (i === n) {
            let mx = 0; for (let j = 0; j < n; j++) if (cur[j] > mx) mx = cur[j];
            const seen = new Array(mx + 1).fill(false);
            for (let j = 0; j < n; j++) seen[cur[j]] = true;
            if (seen.every(Boolean)) out.push(Int8Array.from(cur));
            return;
        }
        for (let v = 0; v < n; v++) { cur[i] = v; rec(i + 1); }
    };
    rec(0);
    return AR_MODELS[key] = out;
}
function arBitModels(n) {  // same/opposite is relative: term 0 fixed, the rest free
    const key = 'b' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [];
    for (let x = 0; x < (1 << (n - 1)); x++) {
        const m = new Int8Array(n);
        for (let i = 1; i < n; i++) m[i] = (x >> (i - 1)) & 1;
        out.push(m);
    }
    return AR_MODELS[key] = out;
}

// ---------------------------------------------------------------- engine (one per family and size)
class ArEngine {
    constructor(id, models, axes) {
        this.id = id; this.models = models; this.axes = axes;
        this.cache = new Map(); this.pairCache = new Map();
        this.full = abFull(models.length);
    }
    bits(f) {
        let b = this.cache.get(f.key);
        if (b) return b;
        b = [];
        for (let a = 0; a < this.axes; a++) b.push(abFrom(this.models, m => f.truth(m, a)));
        this.cache.set(f.key, b);
        return b;
    }
    mask(facts) {
        const M = [];
        for (let a = 0; a < this.axes; a++) M.push(Uint32Array.from(this.full));
        for (const f of facts) { const b = this.bits(f); for (let a = 0; a < this.axes; a++) abAndInto(M[a], b[a]); }
        return M;
    }
    // true / false if forced, null if open. Facts are conjunctions over independent axes, so a statement is
    // forced true when every axis forces it and forced false when some axis rules it out.
    valueM(M, c) {
        const C = this.bits(c);
        let allIn = true;
        for (let a = 0; a < this.axes; a++) {
            if (abDisjoint(M[a], C[a])) return false;
            if (!abSubset(M[a], C[a])) allIn = false;
        }
        return allIn ? true : null;
    }
    value(facts, c) { return this.valueM(this.mask(facts), c); }
    pairClasses(x, y, a) {
        const key = x + ',' + y + ',' + a;
        let cls = this.pairCache.get(key);
        if (cls) return cls;
        cls = this.id === 'bits'
            ? [abFrom(this.models, m => m[x] === m[y]), abFrom(this.models, m => m[x] !== m[y])]
            : [abFrom(this.models, m => m[x] < m[y]), abFrom(this.models, m => m[x] === m[y]), abFrom(this.models, m => m[x] > m[y])];
        this.pairCache.set(key, cls);
        return cls;
    }
    // is the relation between x and y left open by M (on the given axis, or on some axis)?
    pairOpen(M, [x, y, axis]) {
        const axes = axis == null ? [...Array(this.axes).keys()] : [axis];
        for (const a of axes) if (!this.pairClasses(x, y, a).some(c => abSubset(M[a], c))) return true;
        return false;
    }
}
const AR_ENGINES = {};
function arEngine(id, n, axes) {
    const key = id + n + ':' + axes;
    if (!AR_ENGINES[key]) {
        const models = id === 'order' ? arPerms(n) : id === 'bits' ? arBitModels(n) : arWeak(n);
        AR_ENGINES[key] = new ArEngine(id, models, axes);
    }
    return AR_ENGINES[key];
}

// ---------------------------------------------------------------- small helpers
const arS = w => `<span class="subject">${w}</span>`;
const arR = t => `<span class="relation">${t}</span>`;
const arNeg = t => `<span class="is-negated">${t}</span>`;
// a relation phrase that, with negation on, is sometimes shown as its inverse in red
function arPhrase(pos, inv, plain) {
    if (plain || !savedata.enableNegation || coinFlip()) return arR(pos);
    return arR(arNeg(inv));
}
const arRange = n => [...Array(n).keys()];
const arPick = arr => arr[Math.floor(Math.random() * arr.length)];
const arSign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
// k distinct terms: one already used (keeps the premises connected), one new when there is one
function arTerms(N, k, used) {
    const all = arRange(N), out = [];
    const old = all.filter(x => used.has(x)), fresh = all.filter(x => !used.has(x));
    if (old.length) out.push(arPick(old));
    if (fresh.length && out.length < k) out.push(arPick(fresh.filter(x => !out.includes(x))));
    while (out.length < k) out.push(arPick(all.filter(x => !out.includes(x))));
    return shuffle(out);
}

// canonical key for "ordered pair p1 stands like ordered pair p2" (so A:B~C:D, B:A~D:C and C:D~A:B match)
function arPairKey(tag, p1, p2) {
    const flip = p => [p[1], p[0]];
    const orient = (a, b) => (a[0] > a[1] ? [flip(a), flip(b)] : [a, b]);
    let [a, b] = orient(p1, p2), [c, d] = orient(p2, p1);
    const k1 = a.join(',') + '|' + b.join(','), k2 = c.join(',') + '|' + d.join(',');
    return tag + (k1 < k2 ? k1 : k2);
}

// ---------------------------------------------------------------- the generic builder
// fam: { engine(N), terms(P,k), hidden(N), fact(h,N,arity,used) -> true fact, conclusions(h,N,k,opts) }
const AR_TIERS = [
    { frac: 0.6, open: 'all' }, { frac: 0.45, open: 'all' }, { frac: 0.45, open: 'one' },
    { frac: 0.3, open: 'one' }, { frac: 0, open: 'one' }, { frac: 0, open: 'none' },
];
function arPremiseFacts(fam, h, N, P, k) {
    const nTop = Math.max(1, Math.round(P * 0.5));
    const arities = shuffle(arRange(P).map(i => (i < nTop ? k : (k === 4 && coinFlip() ? 3 : 2))));
    const facts = [], keys = new Set(), used = new Set();
    for (const a of arities) {
        let f = null;
        for (let t = 0; t < 40 && !f; t++) {
            const c = fam.fact(h, N, a, used, facts);
            if (c && !keys.has(c.key)) f = c;
        }
        if (!f) return null;
        facts.push(f); keys.add(f.key); f.terms.forEach(x => used.add(x));
    }
    return facts;
}
function arSupport(eng, facts, c, want) {
    let keep = facts.slice();
    for (const f of shuffle(facts.slice())) {
        const trial = keep.filter(g => g !== f);
        if (eng.value(trial, c) === want) keep = trial;
    }
    return keep;
}
function arOpenOK(eng, facts, T, mode) {
    if (!T.pairs.length) return true;
    const MR = eng.mask(facts.filter(f => f !== T));
    const opens = T.pairs.map(p => eng.pairOpen(MR, p));
    return mode === 'all' ? opens.every(Boolean) : opens.some(Boolean);
}
function arBuild(fam, P, k, opts = {}) {
    P = Math.max(2, P);
    const want = opts.want ?? coinFlip();
    for (const tier of AR_TIERS) {
        for (let attempt = 0; attempt < (fam.id.startsWith('space') ? 20 : 8); attempt++) {
            const N = fam.terms(P, k), h = fam.hidden(N), eng = fam.engine(N);
            const facts = arPremiseFacts(fam, h, N, P, k);
            if (!facts) continue;
            const M = eng.mask(facts);
            const keys = new Set(facts.map(f => f.key));
            // space families need a wider conclusion search: non-decomposable 3/4-ary spatial facts are
            // rare, so a narrow cap here is what pushes the build down into the looser tiers
            const wide = fam.id.startsWith('space');
            // families may look at the premises when proposing conclusions (the linear and clause families
            // build their conclusions out of what the premises entail) and may veto a candidate (contexts)
            const cands = shuffle(fam.conclusions(h, N, k, opts, { facts, M, eng })).filter(c => !keys.has(c.key)).slice(0, wide ? 200 : 80);
            let best = null, tried = 0;
            for (const c of cands) {
                if (eng.valueM(M, c) !== want) continue;
                if (fam.accept && !fam.accept(eng, M, c, AR_TIERS.indexOf(tier))) continue;
                if (++tried > (wide ? 60 : 24)) break;
                if (facts.some(f => eng.value([f], c) === want)) continue;
                const sup = arSupport(eng, facts, c, want);
                if (sup.length < Math.max(2, Math.ceil(tier.frac * P))) continue;
                const tops = sup.filter(f => f.arity === k);
                if (!tops.length) continue;
                // and not derivable at all without the top-arity premises: a minimal support that happens to
                // contain one can still sit beside a second, lower-arity route to the same conclusion
                if (eng.value(facts.filter(f => f.arity < k), c) === want) continue;
                if (tier.open !== 'none' && !tops.some(T => arOpenOK(eng, facts, T, tier.open))) continue;
                const score = sup.length + (c.arity >= 3 ? 0.5 : 0) + Math.random() * 0.1;
                if (!best || score > best.score) best = { c, sup, score };
            }
            if (best) return { facts, h, N, concl: best.c, support: best.sup, isValid: want, tier, k };
        }
    }
    return null;
}

// ---------------------------------------------------------------- ORDER (linear: every wording)
function arOrderFamily(g) {
    const bin = (x, y) => ({
        key: `b${x},${y}`, arity: 2, terms: [x, y], pairs: [],
        truth: m => m[x] < m[y],
        html: (W, plain) => plain ? `${arS(W[x])} ${arR(g.prev)} ${arS(W[y])}` : createBasicPremiseHTML(g.forwards(W[x], W[y])),
    });
    const between = (a, b, c, inside) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `t${inside ? 'i' : 'o'}${a},${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => (((m[b] < m[a] && m[a] < m[c]) || (m[c] < m[a] && m[a] < m[b])) === inside),
            html: (W, plain) => `${arS(W[a])} ${inside ? arPhrase('is between', 'is not between', plain) : arPhrase('is not between', 'is between', plain)} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
        };
    };
    // "w r1 x exactly when y r2 z", r = true means the 'prev' word (earlier / left / less / on top ...)
    const iff = (w, x, y, z, o1, o2) => ({
        key: arPairKey('q', o1 ? [w, x] : [x, w], o2 ? [y, z] : [z, y]), arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => ((m[w] < m[x]) === o1) === ((m[y] < m[z]) === o2),
        html: (W, plain) => `${arS(W[w])} ${arR(o1 ? g.prev : g.next)} ${arS(W[x])} ${arR('exactly when')} ${arS(W[y])} ${arPhrase(o2 ? g.prev : g.next, o2 ? g.next : g.prev, plain)} ${arS(W[z])}`,
    });
    // "A is left of B or C" — true when at least one holds, so it cannot be read off either pair alone
    const orDisj = (a, b, c) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `o${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => m[a] < m[b] || m[a] < m[c],
            html: (W, plain) => (plain || !savedata.enableNegation || coinFlip())
                ? `${arS(W[a])} ${arR(g.prev)} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`
                : `${arS(W[a])} ${arR(arNeg(g.next + ' both'))} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
        };
    };
    // "Exactly one of A and B is between C and D"
    const oneBetween = (a, b, c, d) => {
        const mid = a < b ? [a, b] : [b, a], ends = c < d ? [c, d] : [d, c];
        const inside = (m, x) => (m[c] < m[x] && m[x] < m[d]) || (m[d] < m[x] && m[x] < m[c]);
        return {
            key: `x${mid},${ends}`, arity: 4, terms: [a, b, c, d], pairs: [[a, c, null], [a, d, null], [b, c, null], [b, d, null]],
            truth: m => inside(m, a) !== inside(m, b),
            html: (W, plain) => `${arR('Exactly one of')} ${arS(W[a])} ${arR('and')} ${arS(W[b])} ${arPhrase('is between', 'is not between', plain)} ${arS(W[c])} ${arR('and')} ${arS(W[d])}`,
        };
    };
    // "Among A, B, C and D, A is at one end" — A is the extreme one way or the other
    const extreme = (a, rest) => {
        const all = [a, ...rest];
        return {
            key: `e${a};${rest.slice().sort((p, q) => p - q)}`, arity: all.length, terms: all, pairs: rest.map(r => [a, r, null]),
            truth: m => rest.every(r => m[a] < m[r]) || rest.every(r => m[a] > m[r]),
            html: (W, plain) => `${arR('Among')} ${all.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[all[all.length - 1]])}, ${arS(W[a])} ${arPhrase('is at one end', 'is not at one end', plain)}`,
        };
    };
    const ana = (a, b, c, d, same) => ({
        key: `a${a},${b},${c},${d},${+same}`, arity: 4, terms: [a, b, c, d], pairs: [],
        truth: m => ((m[a] < m[b]) === (m[c] < m[d])) === same,
        html: (W, plain) => analogyTo(W[a], W[b]) + (plain ? `<div class="analogy-statement">${same ? 'has the same relation as' : 'has a different relation from'}</div>` : (same ? pickAnalogyStatementSame() : pickAnalogyStatementDifferent())) + analogyTo(W[c], W[d]),
    });
    return {
        id: 'order',
        engine: N => arEngine('order', N, 1),
        terms: (P, k) => Math.max(k + 1, Math.min(7, P + 1)),
        hidden: N => { const pos = shuffle(arRange(N)); return Int8Array.from(pos); },
        fact(h, N, a, used) {
            if (a === 2) { const [x, y] = arTerms(N, 2, used); return h[x] < h[y] ? bin(x, y) : bin(y, x); }
            if (a === 3) {
                const t = arTerms(N, 3, used).sort((p, q) => h[p] - h[q]);
                const opts = [between(t[1], t[0], t[2], true)];
                const end = coinFlip() ? 0 : 2;
                const rest = [0, 1, 2].filter(i => i !== end);
                opts.push(between(t[end], t[rest[0]], t[rest[1]], false));
                for (const [p, q, r] of [[t[0], t[1], t[2]], [t[1], t[0], t[2]]]) opts.push(orDisj(p, q, r));
                return arPick(opts.filter(f => f.truth(h)));
            }
            const [w, x, y, z] = arTerms(N, 4, used);
            const o1 = coinFlip();
            const v1 = (h[w] < h[x]) === o1;
            const o2 = ((h[y] < h[z]) === v1);
            const quads = [iff(w, x, y, z, o1, o2), oneBetween(w, x, y, z), oneBetween(w, y, x, z), extreme(w, [x, y, z]), extreme(x, [w, y, z])];
            return arPick(quads.filter(f => f.truth(h)));
        },
        conclusions(h, N, k, opts) {
            const out = [];
            const quads = n => { for (let i = 0; i < n; i++) { const t = shuffle(arRange(N)).slice(0, 4); out.push(opts.analogy ? ana(...t, coinFlip()) : iff(...t, coinFlip(), coinFlip())); } };
            if (opts.analogy) { quads(80); return out; }
            for (const x of arRange(N)) for (const y of arRange(N)) if (x !== y) out.push(bin(x, y));
            if (k >= 3) for (let i = 0; i < 30; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3);
                out.push(coinFlip() ? between(a, b, c, Math.random() < 0.7) : orDisj(a, b, c));
            }
            if (k >= 4) {
                quads(20);
                for (let i = 0; i < 20; i++) {
                    const [a, b, c, d] = shuffle(arRange(N)).slice(0, 4);
                    out.push(coinFlip() ? oneBetween(a, b, c, d) : extreme(a, [b, c, d]));
                }
            }
            return out;
        },
    };
}

// ---------------------------------------------------------------- SPACE (2D, 3D, space-time, anchor)
const AR_AXIS = ['east–west', 'north–south', 'above–below', 'in time'];
function arSpaceFamily(gen) {
    const D = gen.initialCoord().length;
    const spatialOK = s => s.slice(0, 3).some(v => v !== 0);
    const dir = (x, y, s) => ({
        key: x < y ? `d${x},${y},${s.join('')}` : `d${y},${x},${s.map(v => -v).join('')}`, arity: 2, terms: [x, y], pairs: [],
        truth: (m, a) => arSign(m[x] - m[y]) === s[a],
        html: (W, plain) => {
            const st = gen.createDirectionStatement(W[y], W[x], s);
            return plain ? `${arS(st.start)} ${arR(st.relation)} ${arS(st.end)}` : createBasicPremiseHTML(st);
        },
    });
    const between = (a, b, c, ax, inside) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `t${inside ? 'i' : 'o'}${ax}:${a},${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, ax], [a, c, ax]],
            truth: (m, axis) => axis !== ax || (((m[b] < m[a] && m[a] < m[c]) || (m[c] < m[a] && m[a] < m[b])) === inside),
            html: (W, plain) => `${arS(W[a])} ${inside ? arPhrase('is between', 'is not between', plain) : arPhrase('is not between', 'is between', plain)} ${arS(W[b])} ${arR('and')} ${arS(W[c])} ${arR(AR_AXIS[ax])}`,
        };
    };
    // "A is level with B or C, north-south" — a tie on that axis with at least one of them
    const levelOne = (a, b, c, ax) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `l${ax}:${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, ax], [a, c, ax]],
            truth: (m, axis) => axis !== ax || m[a] === m[b] || m[a] === m[c],
            html: (W, plain) => `${arS(W[a])} ${arPhrase('is level with', 'is not level with', plain)} ${arS(W[b])} ${arR('or')} ${arS(W[c])} ${arR(AR_AXIS[ax])}`,
        };
    };
    // "Exactly one of A and B is between C and D, east-west"
    const oneBetween = (a, b, c, d, ax) => {
        const mid = a < b ? [a, b] : [b, a], ends = c < d ? [c, d] : [d, c];
        const inside = (m, x) => (m[c] < m[x] && m[x] < m[d]) || (m[d] < m[x] && m[x] < m[c]);
        return {
            key: `X${ax}:${mid},${ends}`, arity: 4, terms: [a, b, c, d], pairs: [[a, c, ax], [a, d, ax], [b, c, ax], [b, d, ax]],
            truth: (m, axis) => axis !== ax || inside(m, a) !== inside(m, b),
            html: (W, plain) => `${arR('Exactly one of')} ${arS(W[a])} ${arR('and')} ${arS(W[b])} ${arPhrase('is between', 'is not between', plain)} ${arS(W[c])} ${arR('and')} ${arS(W[d])} ${arR(AR_AXIS[ax])}`,
        };
    };
    const way = (a, b, c, d, same) => ({
        key: arPairKey('w', [a, b], same ? [c, d] : [d, c]), arity: 4, terms: [a, b, c, d], pairs: [[a, b, null], [c, d, null]],
        truth: (m, ax) => arSign(m[a] - m[b]) === (same ? 1 : -1) * arSign(m[c] - m[d]),
        html: (W, plain) => same
            ? `${arS(W[a])} ${arPhrase('is the same way from', 'is the opposite way from', plain)} ${arS(W[b])} ${arR('as')} ${arS(W[c])} ${arR('is from')} ${arS(W[d])}`
            : `${arS(W[a])} ${arPhrase('is the opposite way from', 'is the same way from', plain)} ${arS(W[b])} ${arR('as')} ${arS(W[c])} ${arR('is from')} ${arS(W[d])}`,
    });
    // "same relation" = same direction on every axis (a conjunction over axes, as the engine needs);
    // "different relation" is shown by flipping the phrasing and the answer (negHtml)
    const anaHTML = (W, a, b, c, d, same, plain) => analogyTo(W[a], W[b]) + (plain ? `<div class="analogy-statement">${same ? 'has the same relation as' : 'has a different relation from'}</div>` : (same ? pickAnalogyStatementSame() : pickAnalogyStatementDifferent())) + analogyTo(W[c], W[d]);
    const ana = (a, b, c, d) => ({
        key: `a${a},${b},${c},${d}`, arity: 4, terms: [a, b, c, d], pairs: [],
        truth: (m, ax) => arSign(m[a] - m[b]) === arSign(m[c] - m[d]),
        html: (W, plain) => anaHTML(W, a, b, c, d, true, plain),
        negHtml: (W, plain) => anaHTML(W, a, b, c, d, false, plain),
    });
    const sv = (h, x, y) => arRange(D).map(a => arSign(h[x][a] - h[y][a]));
    return {
        id: 'space' + D,
        engine: N => arEngine('weak', N, D),
        // Capped at 6 on purpose. A 7th term widens the pool for 4-ary spatial facts and does raise the
        // strict-tier hit rate, but weak-order enumeration over 7 terms on 3-4 axes pushed worst-case
        // generation past 4 seconds, which is far worse for training than an occasional step-down.
        terms: (P, k) => Math.max(k + 1, Math.min(6, P + 1)),
        hidden(N) {
            for (;;) {
                const pts = arRange(N).map(() => arRange(D).map(() => Math.floor(Math.random() * 3)));
                const keys = new Set(pts.map(p => p.join(',')));
                if (keys.size < N) continue;
                if (D === 4 && new Set(pts.map(p => p.slice(0, 3).join(','))).size < N) continue;
                // rank-compress each axis to a weak order (only order matters)
                for (let a = 0; a < D; a++) {
                    const vals = [...new Set(pts.map(p => p[a]))].sort((x, y) => x - y);
                    pts.forEach(p => { p[a] = vals.indexOf(p[a]); });
                }
                return pts;
            }
        },
        fact(h, N, a, used) {
            if (a === 2) {
                const [x, y] = arTerms(N, 2, used);
                const s = sv(h, x, y);
                return spatialOK(s) ? dir(x, y, s) : null;
            }
            if (a === 3) {
                const t = arTerms(N, 3, used);
                // a tie on some axis lets the "level with one of them" form be used instead
                const lv = shuffle(arRange(D)).filter(ax => t.some((i, n) => t.some((j, o) => o > n && h[i][ax] === h[j][ax])));
                if (lv.length && Math.random() < 0.35) {
                    const ax = lv[0];
                    const opts = [[t[0], t[1], t[2]], [t[1], t[0], t[2]], [t[2], t[0], t[1]]]
                        .map(([p, q, r]) => levelOne(p, q, r, ax)).filter(f => f.truth(h.map(c => c[ax]), ax));
                    if (opts.length) return arPick(opts);
                }
                const axes = shuffle(arRange(D)).filter(ax => new Set(t.map(i => h[i][ax])).size === 3);
                if (!axes.length) return null;
                const ax = axes[0];
                const s = t.slice().sort((p, q) => h[p][ax] - h[q][ax]);
                if (Math.random() < 0.75) return between(s[1], s[0], s[2], ax, true);
                const end = coinFlip() ? 0 : 2, rest = [0, 1, 2].filter(i => i !== end);
                return between(s[end], s[rest[0]], s[rest[1]], ax, false);
            }
            // several draws of the leading pair, not one: a single unlucky (w,x) with no matching
            // counterpart used to fail the whole fact and push the build into a looser tier
            if (Math.random() < 0.3) {
                const t = arTerms(N, 4, used);
                const opts = [];
                for (const ax of arRange(D)) for (const [p, q, r, u] of [[t[0], t[1], t[2], t[3]], [t[0], t[2], t[1], t[3]], [t[0], t[3], t[1], t[2]]]) {
                    const f = oneBetween(p, q, r, u, ax);
                    if (f.truth(h.map(c => c[ax]), ax)) opts.push(f);
                }
                if (opts.length) return arPick(opts);
            }
            for (let attempt = 0; attempt < 8; attempt++) {
                const [w, x] = arTerms(N, 2, used);
                const s1 = sv(h, w, x);
                if (!spatialOK(s1)) continue;
                const opts = [];
                for (const y of arRange(N)) for (const z of arRange(N)) {
                    if (y === z || [w, x].includes(y) || [w, x].includes(z)) continue;
                    const s2 = sv(h, y, z);
                    if (s1.every((v, i) => v === s2[i])) opts.push(way(w, x, y, z, true));
                    else if (s1.every((v, i) => v === -s2[i])) opts.push(way(w, x, y, z, false));
                }
                if (opts.length) return arPick(opts);
            }
            return null;
        },
        conclusions(h, N, k, opts) {
            const out = [];
            const pairs = [];
            for (const x of arRange(N)) for (const y of arRange(N)) if (x !== y) pairs.push([x, y]);
            if (opts.analogy) {
                for (let i = 0; i < 80; i++) { const t = shuffle(arRange(N)).slice(0, 4); if (spatialOK(sv(h, t[0], t[1]))) out.push(ana(...t)); }
                return out;
            }
            for (const [x, y] of pairs) {
                const s = sv(h, x, y);
                if (!spatialOK(s)) continue;
                out.push(dir(x, y, s));
                // near misses: the true direction with one axis changed
                for (let a = 0; a < D; a++) for (const v of [-1, 0, 1]) if (v !== s[a]) {
                    const s2 = s.slice(); s2[a] = v;
                    if (spatialOK(s2)) out.push(dir(x, y, s2));
                }
            }
            if (k >= 3) for (let i = 0; i < 30; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3), ax = Math.floor(Math.random() * D);
                if (coinFlip()) out.push(levelOne(a, b, c, ax));
                else if (h[b][ax] !== h[c][ax]) out.push(between(a, b, c, ax, Math.random() < 0.7));
            }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const t = shuffle(arRange(N)).slice(0, 4);
                if (coinFlip()) out.push(oneBetween(t[0], t[1], t[2], t[3], Math.floor(Math.random() * D)));
                else if (spatialOK(sv(h, t[0], t[1])) && spatialOK(sv(h, t[2], t[3]))) out.push(way(...t, coinFlip()));
            }
            return out;
        },
    };
}

// ---------------------------------------------------------------- DISTINCTION (same / opposite)
// The same/opposite structure (every term is in one of two states, only "same" and "opposite" are defined)
// is shared by Distinction and Influence (direct / inverse); a lexicon says how each fact is worded.
const AR_LEX_DISTINCTION = {
    pair: (W, x, y, same, plain) => plain
        ? `${arS(W[x])} ${arR(same ? 'is same as' : 'is opposite of')} ${arS(W[y])}`
        : createBasicPremiseHTML(same ? createSamePremise(W[x], W[y]) : createOppositePremise(W[x], W[y]), false),
    notAll: (W, a, b, c, plain) => `${arS(W[a])}, ${arS(W[b])} ${arR('and')} ${arS(W[c])} ${arPhrase('are not all the same', 'are all the same', plain)}`,
    matchOne: (W, a, b, c, plain) => (plain || !savedata.enableNegation || coinFlip())
        ? `${arS(W[a])} ${arR('is same as')} ${arS(W[b])} ${arR('or')} ${arS(W[c])}`
        : `${arS(W[a])} ${arR(arNeg('is opposite of both'))} ${arS(W[b])} ${arR('and')} ${arS(W[c])}`,
    iff: (W, w, x, y, z, s1, s2, plain) => `${arS(W[w])} ${arR(s1 ? 'is same as' : 'is opposite of')} ${arS(W[x])} ${arR('exactly when')} ${arS(W[y])} ${arPhrase(s2 ? 'is same as' : 'is opposite of', s2 ? 'is opposite of' : 'is same as', plain)} ${arS(W[z])}`,
    countN: (W, a, rest, n, plain) => `${arR('Exactly ' + n + ' of')} ${rest.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[rest[rest.length - 1]])} ${arPhrase(n === 1 ? 'is same as' : 'are same as', n === 1 ? 'is opposite of' : 'are opposite of', plain)} ${arS(W[a])}`,
    either: (W, w, x, y, z, s1, s2, plain) => `${arR('Either')} ${arS(W[w])} ${arR(s1 ? 'is same as' : 'is opposite of')} ${arS(W[x])}, ${arR('or')} ${arS(W[y])} ${arPhrase(s2 ? 'is same as' : 'is opposite of', s2 ? 'is opposite of' : 'is same as', plain)} ${arS(W[z])}, ${arR('or both')}`,
};
function arBitsFamily(lex = AR_LEX_DISTINCTION) {
    const pair = (x, y, same) => ({
        key: `s${Math.min(x, y)},${Math.max(x, y)},${+same}`, arity: 2, terms: [x, y], pairs: [],
        truth: m => (m[x] === m[y]) === same,
        html: (W, plain) => lex.pair(W, x, y, same, plain),
    });
    // a two-term conclusion may be worded differently from a two-term premise (influence asks "if A
    // increases, B ..."); the fact itself is the same
    const cpair = (x, y, same) => {
        const f = pair(x, y, same);
        if (lex.pairConcl) { const up = coinFlip(); f.html = (W, plain) => lex.pairConcl(W, x, y, same, up); }
        return f;
    };
    const notAll = (a, b, c) => {
        const t = [a, b, c].sort((p, q) => p - q);
        return {
            key: `n${t}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [b, c, null], [a, c, null]],
            truth: m => !(m[a] === m[b] && m[b] === m[c]),
            html: (W, plain) => lex.notAll(W, a, b, c, plain),
        };
    };
    const matchOne = (a, b, c) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return {
            key: `m${a};${lo},${hi}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]],
            truth: m => m[a] === m[b] || m[a] === m[c],
            html: (W, plain) => lex.matchOne(W, a, b, c, plain),
        };
    };
    const iff = (w, x, y, z, s1, s2) => ({
        key: (() => { const p = [[Math.min(w, x), Math.max(w, x)], [Math.min(y, z), Math.max(y, z)]].map(q => q.join(',')).sort().join('|'); return 'q' + p + (s1 === s2 ? 'e' : 'n'); })(), arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => ((m[w] === m[x]) === s1) === ((m[y] === m[z]) === s2),
        html: (W, plain) => lex.iff(W, w, x, y, z, s1, s2, plain),
    });
    // "Exactly 2 of B, C and D are the same as A" — a count, so no pair of them settles it
    const countN = (a, rest, n) => ({
        key: `c${a};${rest.slice().sort((p, q) => p - q)};${n}`, arity: rest.length + 1, terms: [a, ...rest],
        pairs: rest.map(r => [a, r, null]),
        truth: m => rest.filter(r => m[r] === m[a]).length === n,
        html: (W, plain) => lex.countN(W, a, rest, n, plain),
    });
    // "Either A is same as B, or C is opposite of D, or both"
    const either = (w, x, y, z, s1, s2) => ({
        key: (() => { const q = [[Math.min(w, x), Math.max(w, x), +s1], [Math.min(y, z), Math.max(y, z), +s2]].map(v => v.join(',')).sort().join('|'); return 'E' + q; })(),
        arity: 4, terms: [w, x, y, z], pairs: [[w, x, null], [y, z, null]],
        truth: m => ((m[w] === m[x]) === s1) || ((m[y] === m[z]) === s2),
        html: (W, plain) => lex.either(W, w, x, y, z, s1, s2, plain),
    });
    const ana = (a, b, c, d, same) => ({
        key: `a${a},${b},${c},${d},${+same}`, arity: 4, terms: [a, b, c, d], pairs: [],
        truth: m => ((m[a] === m[b]) === (m[c] === m[d])) === same,
        html: (W, plain) => analogyTo(W[a], W[b]) + (plain ? `<div class="analogy-statement">${same ? 'is the same as' : 'is different from'}</div>` : (same ? pickAnalogyStatementSameTwoOptions() : pickAnalogyStatementDifferentTwoOptions())) + analogyTo(W[c], W[d]),
    });
    return {
        id: 'bits',
        engine: N => arEngine('bits', N, 1),
        terms: (P, k) => Math.max(k + 1, Math.min(11, P + 1)),
        hidden: N => Int8Array.from(arRange(N).map(i => (i === 0 ? 0 : Math.random() < 0.5 ? 1 : 0))),
        fact(h, N, a, used) {
            if (a === 2) { const [x, y] = arTerms(N, 2, used); return pair(x, y, h[x] === h[y]); }
            if (a === 3) {
                const [p, q, r] = arTerms(N, 3, used);
                const opts = [];
                if (!(h[p] === h[q] && h[q] === h[r])) opts.push(notAll(p, q, r));
                for (const [a1, b1, c1] of [[p, q, r], [q, p, r], [r, p, q]]) if (h[a1] === h[b1] || h[a1] === h[c1]) opts.push(matchOne(a1, b1, c1));
                return opts.length ? arPick(opts) : null;
            }
            const [w, x, y, z] = arTerms(N, 4, used);
            const s1 = coinFlip(), v1 = (h[w] === h[x]) === s1, s2 = ((h[y] === h[z]) === v1);
            const quads = [iff(w, x, y, z, s1, s2), iff(w, x, y, z, s1, s2)];
            for (const n of [1, 2]) quads.push(countN(w, [x, y, z], n));
            for (const t1 of [true, false]) for (const t2 of [true, false]) quads.push(either(w, x, y, z, t1, t2));
            return arPick(quads.filter(f => f.truth(h)));
        },
        conclusions(h, N, k, opts) {
            const out = [];
            if (opts.analogy) { for (let i = 0; i < 80; i++) out.push(ana(...shuffle(arRange(N)).slice(0, 4), coinFlip())); return out; }
            for (const x of arRange(N)) for (const y of arRange(N)) if (x < y) { out.push(cpair(x, y, true)); out.push(cpair(x, y, false)); }
            if (k >= 3) for (let i = 0; i < 30; i++) { const [a, b, c] = shuffle(arRange(N)).slice(0, 3); out.push(coinFlip() ? notAll(a, b, c) : matchOne(a, b, c)); }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const t = shuffle(arRange(N)).slice(0, 4), r = Math.random();
                if (r < 0.5) out.push(iff(...t, coinFlip(), coinFlip()));
                else if (r < 0.75) out.push(countN(t[0], t.slice(1), arPick([1, 2])));
                else out.push(either(...t, coinFlip(), coinFlip()));
            }
            return out;
        },
    };
}

// ---------------------------------------------------------------- question assembly (shared)
function arMetaApply(binHTML) {
    if (!savedata.enableMeta || savedata.minimalMode || binHTML.length < 2) return binHTML;
    try {
        return applyMeta(binHTML, p => p.match(/<span class="relation">(?:<span class="is-negated">)?(.*?)<\/span>/)[1]);
    } catch (e) { return binHTML; }
}
function arSupportHTML(r, W) {
    return r.support.map(f => f.html(W, true));
}
function arAssemble(r, W, extra) {
    let bin = r.facts.filter(f => f.arity === 2).map(f => f.html(W, false));
    const high = r.facts.filter(f => f.arity > 2).map(f => f.html(W, false));
    if (extra.meta) bin = arMetaApply(bin);
    let premises = scramble(shuffle([...bin, ...high]));
    if (extra.explainer) premises.unshift(`<span class="negation-explainer">${extra.explainer}</span>`);
    return premises;
}
function arQuestion(fam, P, extra) {
    // Try the arity the dial asks for, hard. If this family genuinely cannot build it at this premise
    // count, step DOWN one level and label the item with the arity it actually has — never hand back a
    // plain binary item while the dial still claims 4. An honest label is what keeps the difficulty
    // reading, and the progression that depends on it, from drifting away from reality.
    // minK 2: a family that is native to this module (not a patch over a classic generator) and so has
    // to produce an item at the classic setting too, with two-term premises only.
    const minK = extra.minK || 3;
    const wantK = Math.max(minK, arityLevel());
    let r = null;
    for (let kk = wantK; kk >= minK && !r; kk--) {
        const tries = kk === wantK ? 6 : 3;
        for (let t = 0; t < tries && !r; t++) r = arBuild(fam, P, kk, { analogy: extra.analogy });
    }
    if (!r) return null;
    const k = r.k;
    const W = createStimuli(r.N + (fam.extraStimuli || 0));   // contexts names ride after the terms
    const premises = arAssemble(r, W, extra);
    let conclusion = r.concl.html(W, false), isValid = r.isValid;
    let plainConcl = r.concl.html(W, true);
    if (r.concl.negHtml && coinFlip()) { conclusion = r.concl.negHtml(W, false); plainConcl = r.concl.negHtml(W, true); isValid = !isValid; }
    const out = {
        category: extra.category,
        type: extra.type,
        startedAt: new Date().getTime(),
        premises,
        conclusion,
        isValid,
        plen: P,
        ...(k >= 3 ? { modifiers: ['ar' + k], arity: k, arityTimeMult: AR_TIME_MULT[k] } : {}),
        arityAsked: wantK,
        arTier: AR_TIERS.indexOf(r.tier),
        support: arSupportHTML(r, W),
        supportConclusion: plainConcl,
        ...extra.model(r, W),
    };
    if (extra.analogy) out.tags = ['analogy'];
    // a false conclusion that imitates one that follows: say which one does
    if (r.concl.base && !isValid) { out.syllogismNearMiss = true; out.supportConclusion = r.concl.base.html(W, true); }
    const cd = extra.countdown;
    if (cd) out.countdown = cd;
    return out;
}

function arOrderQuestion(lq, length, analogy) {
    const g = lq.generator;
    return arQuestion(arOrderFamily(g), length, {
        category: (analogy ? 'Analogy: ' : '') + g.getName(), type: 'linear', analogy, meta: true,
        countdown: lq.getCountdown(),
        model: (r, W) => ({ bucket: arRange(r.N).sort((a, b) => r.h[a] - r.h[b]).map(i => W[i]) }),
    });
}
function arDistinctionQuestion(dq, length, analogy) {
    return arQuestion(arBitsFamily(), length, {
        category: analogy ? 'Analogy: Distinction' : 'Distinction', type: 'distinction', analogy, meta: true,
        countdown: dq.getCountdown(),
        model: (r, W) => ({ buckets: [arRange(r.N).filter(i => r.h[i] === 0).map(i => W[i]), arRange(r.N).filter(i => r.h[i] === 1).map(i => W[i])] }),
    });
}
function arSpaceQuestion(dq, length, analogy) {
    const gen = dq.generator;
    return arQuestion(arSpaceFamily(gen), length, {
        category: (analogy ? 'Analogy: ' : '') + gen.getName(), type: normalizeString(gen.getName()), analogy,
        countdown: gen.getCountdown(),
        explainer: 'Directions say which way, not how far',
        model: (r, W) => ({ wordCoordMap: Object.fromEntries(arRange(r.N).map(i => [W[i], [...r.h[i]]])) }),
    });
}

// ---------------------------------------------------------------- SYLLOGISM (categories)
// A statement: q = A (all S are Y) | E (no S is Y) | I (some S is Y) | O (some S is not Y), S = the
// subject terms (more than one = "S1 that is S2 ..."), arity = |S| + 1. Validity by Venn regions with
// existential import for every single term (as in the classic mode's valid moods).
function arSetRegions(st, R) {
    const out = [];
    for (let r = 0; r < R; r++) {
        if (!st.S.every(t => (r >> t) & 1)) continue;
        const y = st.Y.some(t => (r >> t) & 1);          // the object side is a disjunction
        if ((st.q === 'A' || st.q === 'O') ? !y : y) out.push(r);
    }
    return out;
}
const arUniversal = st => st.q === 'A' || st.q === 'E';
class ArSetEngine {
    constructor(m) { this.m = m; this.R = 1 << m; this.cache = new Map(); }
    regions(st) { let r = this.cache.get(st.key); if (!r) { r = arSetRegions(st, this.R); this.cache.set(st.key, r); } return r; }
    imports() {
        if (!this._imp) this._imp = arRange(this.m).map(t => arRange(this.R).filter(r => (r >> t) & 1));
        return this._imp;
    }
    // true = follows, false = doesn't follow but possible, 'x' = contradicts
    value(facts, c) {
        const E = new Set();
        for (const f of facts) if (arUniversal(f)) for (const r of this.regions(f)) E.add(r);
        const ex = [...facts.filter(f => !arUniversal(f)).map(f => this.regions(f)), ...this.imports()];
        const allowed = L => L.filter(r => !E.has(r));
        const cR = this.regions(c), cSet = new Set(cR);
        if (arUniversal(c)) {
            if (cR.every(r => E.has(r))) return true;
            return ex.every(L => allowed(L).some(r => !cSet.has(r))) ? false : 'x';
        }
        if (ex.some(L => { const a = allowed(L); return a.length && a.every(r => cSet.has(r)); })) return true;
        return cR.some(r => !E.has(r)) ? false : 'x';
    }
}
// S is a conjunction of subject terms ("A that is B"), Y a disjunction of object terms ("C or D").
// A disjunctive object only makes sense where it cannot be split: "All A is C or D" and
// "Some A is neither C nor D" bind every term at once; "No A is C or D" would just be two premises.
function arStatement(q, S, Y) {
    Y = Array.isArray(Y) ? Y : [Y];
    return { q, S, Y, key: q + S.join('.') + '>' + Y.join('.'), arity: S.length + Y.length, terms: [...S, ...Y], pairs: [] };
}
const arSetJoin = (W, list, word) => list.map(i => W[i]).join(`</span> <span class="relation">${word}</span> <span class="subject">`);
function arSetHTML(st, W, plain) {
    const set = plain ? forms[0] : pickNegatable(forms);
    const t = set[{ A: 0, E: 1, I: 2, O: 3 }[st.q]];
    let subj = W[st.S[0]];
    if (st.S.length > 1) subj += `</span> <span class="relation">that is</span> <span class="subject">` + arSetJoin(W, st.S.slice(1), 'and');
    const obj = st.Y.length > 1 ? arSetJoin(W, st.Y, st.q === 'O' ? 'nor' : 'or') : W[st.Y[0]];
    return t.replace('$', subj).replace('$', obj);
}
function arSyllogismQuestion(sq, length) {
    const k = arityLevel(), P = Math.max(2, length);
    const m = Math.max(k + 1, Math.min(5, P + 1)), R = 1 << m, eng = new ArSetEngine(m);
    const want = coinFlip();
    const truthIn = (H, st) => { const reg = eng.regions(st); return arUniversal(st) ? reg.every(r => !H[r]) : reg.some(r => H[r]); };
    const randStmt = (arity, used, H) => {
        const t = arTerms(m, arity, used);
        const opts = [];
        // every split of the terms into a conjunctive subject and a (sometimes disjunctive) object
        for (let nY = 1; nY <= Math.min(2, arity - 1); nY++) {
            const S = t.slice(0, arity - nY), Y = t.slice(arity - nY);
            for (const [q, w] of [['A', 3], ['E', 2], ['I', 1], ['O', 1]]) {
                if (nY > 1 && q !== 'A' && q !== 'O') continue;   // "no A is C or D" splits in two
                const st = arStatement(q, S, Y);
                if (!H || truthIn(H, st)) for (let i = 0; i < w; i++) opts.push(st);
            }
        }
        return opts.length ? arPick(opts) : null;
    };
    for (const tier of AR_TIERS) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const H = new Uint8Array(R);
            for (let r = 1; r < R; r++) H[r] = Math.random() < 0.3 ? 1 : 0;
            for (let t = 0; t < m; t++) if (!arRange(R).some(r => H[r] && ((r >> t) & 1))) H[(1 << t) | (Math.random() < 0.5 ? 0 : (1 << ((t + 1) % m)))] = 1;
            const nTop = Math.max(1, Math.round(P * 0.5));
            const arities = shuffle(arRange(P).map(i => (i < nTop ? k : (k === 4 && coinFlip() ? 3 : 2))));
            const facts = [], keys = new Set(), used = new Set();
            let ok = true;
            for (const a of arities) {
                let f = null;
                for (let t = 0; t < 40 && !f; t++) { const c = randStmt(a, used, H); if (c && !keys.has(c.key)) f = c; }
                if (!f) { ok = false; break; }
                facts.push(f); keys.add(f.key); f.terms.forEach(x => used.add(x));
            }
            if (!ok) continue;
            // conclusions that follow, with a support that needs integration
            let best = null;
            for (let i = 0; i < 120 && (!best || i < 60); i++) {
                const c = randStmt(coinFlip() ? 2 : k, new Set(), null);
                if (!c || keys.has(c.key) || eng.value(facts, c) !== true) continue;
                if (facts.some(f => eng.value([f], c) === true)) continue;
                let sup = facts.slice();
                for (const f of shuffle(facts.slice())) { const tr = sup.filter(g => g !== f); if (eng.value(tr, c) === true) sup = tr; }
                if (sup.length < Math.max(2, Math.ceil(tier.frac * P))) continue;
                if (!sup.some(f => f.arity === k)) continue;
                const score = sup.length + Math.random() * 0.1;
                if (!best || score > best.score) best = { c, sup, score };
            }
            if (!best) continue;
            let concl = best.c;  // eslint-disable-line
            if (!want) {
                // a near miss of what does follow: converted, quantifier changed, or one term swapped,
                // still possible but not implied
                const mut = [];
                const c = best.c;
                mut.push(arStatement(c.q, [...c.S.slice(0, -1), ...c.Y], [c.S[c.S.length - 1]]));
                for (const q of ['A', 'E', 'I', 'O']) if (q !== c.q && (c.Y.length === 1 || q === 'A' || q === 'O')) mut.push(arStatement(q, c.S, c.Y));
                for (const t of arRange(m)) if (!c.terms.includes(t)) { mut.push(arStatement(c.q, c.S, [t, ...c.Y.slice(1)])); mut.push(arStatement(c.q, [t, ...c.S.slice(1)], c.Y)); }
                const good = shuffle(mut).filter(s => !keys.has(s.key) && eng.value(facts, s) === false);
                if (!good.length) continue;
                concl = good[0];
            }
            const W = createStimuli(m);
            const premises = scramble(shuffle(facts.map(f => arSetHTML(f, W, false))));
            const countdown = sq.getCountdown();
            return {
                category: 'Syllogism', type: 'syllogism', startedAt: new Date().getTime(),
                premises, conclusion: arSetHTML(concl, W, false), isValid: want,
                plen: P, modifiers: ['ar' + k], arity: k, arityAsked: k, arTier: AR_TIERS.indexOf(tier),
                arityTimeMult: AR_TIME_MULT[k],
                support: best.sup.map(f => arSetHTML(f, W, true)),
                supportConclusion: arSetHTML(best.c, W, true),
                syllogismNearMiss: !want,
                regions: { terms: W.slice(0, m), rows: arRange(R).filter(r => H[r]).map(r => arRange(m).map(t => (r >> t) & 1)) },
                ...(countdown && { countdown }),
            };
        }
    }
    return null;
}

// ---------------------------------------------------------------- wiring: every frame reads the dial
(function wireArity() {
    const wrap = (cls, method, fn) => {
        const orig = cls.prototype[method];
        cls.prototype[method] = function (length) {
            if (arityActive()) {
                const q = fn(this, length);
                if (q) return q;
            }
            return orig.call(this, length);
        };
    };
    wrap(LinearQuestion, 'create', (q, n) => arOrderQuestion(q, n, false));
    wrap(LinearQuestion, 'createAnalogy', (q, n) => arOrderQuestion(q, n, true));
    wrap(DistinctionQuestion, 'create', (q, n) => arDistinctionQuestion(q, n, false));
    wrap(DistinctionQuestion, 'createAnalogy', (q, n) => arDistinctionQuestion(q, n, true));
    wrap(DirectionQuestion, 'create', (q, n) => arSpaceQuestion(q, n, false));
    wrap(DirectionQuestion, 'createAnalogy', (q, n) => arSpaceQuestion(q, n, true));
    wrap(SyllogismQuestion, 'create', (q, n) => arSyllogismQuestion(q, n));
})();

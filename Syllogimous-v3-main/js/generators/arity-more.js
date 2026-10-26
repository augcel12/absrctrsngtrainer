// arity-more.js — the arity dial for the last two families: Mapping and the answer formats.
//
// Mapping     the premises already describe two layouts; what the solver has to find is the
//             correspondence between them. The higher-arity premises are about that correspondence,
//             which is where the real work is:
//               3  "P has the same place as X or Y"            (narrows the mapping, settles nothing)
//               4  "X is the same way from Y as P is from Q"   (a relation between two relations —
//                                                               Gentner's systematicity cue, stated)
//
// Formats     Judge / Name / Build / Missing link / Repair are answered by one evaluator over a list
//             of statements. At arity 3+ some of those statements are k-ary facts, and the evaluator
//             switches from the group solver (which only knows pairs) to the model-enumeration engines
//             in arity.js. Answers stay two-term, so nothing about answering changes: what changes is
//             that the premises can no longer be chained pair by pair.

// ================================================================ MAPPING
// index i in the first set and index i in the second are the same point, so a true cross-set fact is
// one that holds of the layout; these are added, never substituted, so the stated answer is unchanged.
function mpArityPremises(Wa, Wb, pts, ptsB, askA, askB) {
    const k = arityLevel();
    const n = Wa.length, out = [];
    const sv = (P, i, j) => [arSign(P[i][0] - P[j][0]), arSign(P[i][1] - P[j][1])];
    const want = Math.max(1, Math.round(n * 0.4));
    const seen = new Set();
    for (let t = 0; t < 160 && out.length < want; t++) {
        // the first one is always at the arity the dial asks for, so the item is labelled honestly
        const top = k >= 4 && (!out.length || coinFlip());
        if (top) {
            const [i, j] = shuffle(arRange(n)).slice(0, 2);
            const [p, q] = shuffle(arRange(n)).slice(0, 2);
            if (i === p && j === q) continue;
            const s1 = sv(pts, i, j), s2 = sv(ptsB, p, q);
            if (!s1.some(v => v) || !s2.some(v => v)) continue;
            const same = s1.every((v, a) => v === s2[a]), opp = s1.every((v, a) => v === -s2[a]);
            if (!same && !opp) continue;
            const key = `w${i},${j},${p},${q}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                arity: 4,
                html: `<span class="subject">${Wa[i]}</span> <span class="relation">${same ? 'is the same way from' : 'is the opposite way from'}</span> `
                    + `<span class="subject">${Wa[j]}</span> <span class="relation">as</span> <span class="subject">${Wb[p]}</span> `
                    + `<span class="relation">is from</span> <span class="subject">${Wb[q]}</span>`,
            });
        } else {
            const i = Math.floor(Math.random() * n);
            if (i === askB) continue;                      // never speak about the asked second-set word
            const j = arPick(arRange(n).filter(x => x !== i));
            const key = `c${i},${j}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const [p, q] = shuffle([i, j]);
            out.push({
                arity: 3,
                html: `<span class="subject">${Wb[i]}</span> <span class="relation">has the same place as</span> `
                    + `<span class="subject">${Wa[p]}</span> <span class="relation">or</span> <span class="subject">${Wa[q]}</span>`,
            });
        }
    }
    return out;
}

// ================================================================ FORMATS
const FMT_ORDER_GEN = {
    'linear-leftright': () => LEFT_RIGHT, 'linear-topunder': () => TOP_UNDER, 'linear-comparison': () => MORE_LESS,
    'linear-temporal': () => BEFORE_AFTER, 'linear-contains': () => CONTAINS_WITHIN,
};
function fmtArFamily(fam) {
    switch (fam.id) {
        case 'influence': return arBitsFamily(AR_LEX_INFLUENCE);
        case 'distinction': case 'contexts': return arBitsFamily();
        case 'requirement': return arRequirementFamily();
        case 'balance': return arBalanceFamily();
        case 'space2d': return arSpaceFamily(new Direction2D());
        case 'space3d': return arSpaceFamily(new Direction3D());
        default: return arOrderFamily(FMT_ORDER_GEN[fam.id]());
    }
}

// The item object is cloned (for display) and saved to history, and neither can carry a function,
// so the k-ary facts live here and the statement keeps only an id.
const AR_FACT_STORE = new Map();
let arFactSeq = 0;
function arFactPut(f) {
    const id = ++arFactSeq;
    if (AR_FACT_STORE.size > 4000) for (const k of AR_FACT_STORE.keys()) { AR_FACT_STORE.delete(k); if (AR_FACT_STORE.size <= 3000) break; }
    AR_FACT_STORE.set(id, f);
    return id;
}
const arFactOf = s => (s && s.arId !== undefined ? AR_FACT_STORE.get(s.arId) : null);

// a two-term format statement as an engine fact
function fmtArFact(fam, s, ix, N) {
    const k = fam.kind;
    if (k === 'parity' || k === 'contexts') {
        const x = ix[s.a], y = ix[s.b], same = s.rel === 0;
        return { key: `s${Math.min(x, y)},${Math.max(x, y)},${+same}`, arity: 2, terms: [x, y], pairs: [], truth: m => (m[x] === m[y]) === same };
    }
    if (k === 'order') {
        const c = fmtCanon(fam, s), x = ix[c.a], y = ix[c.b];
        return { key: `b${x},${y}`, arity: 2, terms: [x, y], pairs: [], truth: m => m[x] < m[y] };
    }
    if (k === 'vector') {
        const x = ix[s.a], y = ix[s.b], v = s.rel.split(',').map(Number);
        return { key: `d${x},${y},${v.join('')}`, arity: 2, terms: [x, y], pairs: [], truth: (m, a) => arSign(m[x] - m[y]) === v[a] };
    }
    if (k === 'require') { const c = fmtCanon(fam, s); return arClause([ix[c.a]], [ix[c.b]]); }
    const vec = Array(N).fill(0);
    vec[ix[s.a]] = s.p; vec[ix[s.b]] = -s.q;               // p*w(a) = q*w(b)
    return arLinEq(vec);
}

// A k-ary fact's terms are positions in the word list it was built against, so that list is the index
// map for the whole item; words that only turn up later (in an answer) are added after it.
function fmtArIndex(stmts) {
    stmts = stmts.filter(Boolean);
    const base = stmts.find(s => s.arId !== undefined);
    const ix = base ? { ...base.arIdx } : {};
    let n = Object.keys(ix).length;
    for (const s of stmts) for (const w of [s.a, s.b]) if (w !== undefined && !(w in ix)) ix[w] = n++;
    return { ix, N: n, W: base ? base.arW : Object.keys(ix) };
}

// the same statement list is evaluated over and over while an item is being put together
const FMT_AR_CACHE = new WeakMap();
function fmtArEval(fam, stmts, ctx) {
    let per = FMT_AR_CACHE.get(stmts);
    if (per === undefined) { per = {}; if (typeof stmts === 'object') FMT_AR_CACHE.set(stmts, per); }
    const key = fam.id + '|' + (ctx || '');
    if (per[key]) return per[key];
    const out = fmtArEvalRaw(fam, stmts, ctx);
    per[key] = out;
    return out;
}
function fmtArEvalRaw(fam, stmts, ctx) {
    stmts = stmts.filter(Boolean);
    const { ix, N } = fmtArIndex(stmts);
    const use = fam.kind === 'contexts' ? stmts.filter(s => !s.ctx || s.ctx === ctx) : stmts;
    const af = fmtArFamily(fam);
    const eng = af.engine(N);
    const facts = use.map(s => (arFactOf(s) || fmtArFact(fam, s, ix, N)));
    return { eng, facts, ix, N, M: eng.mask(facts) };
}

const FMT_AR_VAL = { true: 'necessary', false: 'impossible', null: 'possible' };
// nothing can be true any more: no model survives (or, for weights, only the all-zero one)
function fmtArEmpty(fam, M, N) {
    if (fam.kind === 'ratio') return M.length >= N;
    return M.some(axis => axis.every(w => w === 0));
}
function fmtArContexts(fam, stmts) {
    if (fam.kind !== 'contexts') return [null];
    const names = [...new Set(stmts.map(s => s.ctx).filter(Boolean))];
    return names.length ? names : [null];
}
function fmtArConsistent(fam, stmts) {
    if (stmts.some(s => s.arId === undefined && s.a !== undefined && s.a === s.b)) return false;
    for (const c of fmtArContexts(fam, stmts)) {
        const { M, N } = fmtArEval(fam, stmts, c);
        if (fmtArEmpty(fam, M, N)) return false;
    }
    return true;
}
function fmtArStatus(fam, stmts, query) {
    if (!fmtArConsistent(fam, stmts)) return 'inconsistent';
    if (query.a === query.b) return 'impossible';
    const { eng, M, ix, N } = fmtArEval(fam, stmts, query.ctx);
    const v = eng.valueM(M, fmtArFact(fam, query, ix, N));
    // a requirement is never ruled out: nothing forces one thing to be independent of another
    if (fam.kind === 'require' && v !== true) return 'possible';
    // weights: an equation that does not follow is still ruled out once the two weights are pinned
    // to each other, because then only one claim about them can be true
    if (fam.kind === 'ratio' && v === null) {
        return eng.pairOpen(M, [ix[query.a], ix[query.b]]) ? 'possible' : 'impossible';
    }
    return FMT_AR_VAL[String(v)];
}

// Which relation of a to b is forced? Enumerated over the family's own relations.
function fmtArTrueRelation(fam, stmts, a, b, ctx) {
    const { eng, M, ix, N } = fmtArEval(fam, stmts, ctx);
    const test = q => eng.valueM(M, fmtArFact(fam, q, ix, N)) === true;
    if (fam.kind === 'ratio') return fmtArRatio(M, N, ix[a], ix[b], a, b);
    for (const r of fam.rels) {
        const q = { a, b, rel: r.key, ...(ctx && { ctx }) };
        if (test(q)) return { a, b, rel: r.key, ...(ctx && { ctx }) };
    }
    return null;
}

// The ratio the premises force between two weights, or null if they leave it open. Elimination
// against the basis is a linear map as long as nothing is divided out along the way, so reducing
// each weight on its own and comparing the results gives the ratio exactly.
function fmtArRatio(M, N, ia, ib, a, b) {
    const rows = M.map(r => ({ v: r.v.map(BigInt), pivot: r.pivot }));
    const reduce = (i0) => {
        let x = arRange(N).map(i => (i === i0 ? 1n : 0n));
        // the scaling is applied on every row, not only where it bites, or the map stops being linear
        for (const row of rows) {
            const c = x[row.pivot], k = row.v[row.pivot];
            x = x.map((val, i) => val * k - row.v[i] * c);
        }
        return x;
    };
    const ra = reduce(ia), rb = reduce(ib);
    const i = ra.findIndex(x => x !== 0n);
    if (i < 0 || rb[i] === 0n) return null;
    let p = rb[i], q = ra[i];
    if (p < 0n && q < 0n) { p = -p; q = -q; }
    if (p <= 0n || q <= 0n) return null;
    if (!ra.every((x, j) => p * x === q * rb[j])) return null;
    let g = p; let y = q;
    while (y) { [g, y] = [y, g % y]; }
    p /= g; q /= g;
    if (p > 999n || q > 999n) return null;
    return { a, b, p: Number(p), q: Number(q) };
}

// ---------------------------------------------------------------- premise building
// A model the premises allow, in the shape the arity family wants, so the k-ary facts generated from
// it are true of the item rather than true of some other arrangement.
function fmtArModel(fam, facts, N) {
    if (fam.kind === 'require') return null;
    const af = fmtArFamily(fam);
    const eng = af.engine(N);
    const M = eng.mask(facts);
    const pickAxis = a => {
        const idx = [];
        for (let i = 0; i < eng.models.length; i++) if (M[a][i >> 5] & (1 << (i & 31))) idx.push(i);
        return idx.length ? eng.models[arPick(idx)] : null;
    };
    if (fam.kind === 'vector') {
        const axes = arRange(eng.axes).map(pickAxis);
        if (axes.some(x => !x)) return null;
        return arRange(N).map(i => axes.map(ax => ax[i]));
    }
    return pickAxis(0);
}

// weights for the ratio family, straight off the (connected) tree
function fmtArWeights(fam, stmts, ix, N) {
    const { val } = fmtGroupSolve('ratio', stmts.map(s => fmtCanon(fam, s)));
    const words = Object.keys(ix);
    if (words.some(w => !val[w])) return null;
    let L = 1;
    for (const w of words) L = L * val[w][1] / linGcd(L, val[w][1]);
    const h = Array(N).fill(1);
    for (const w of words) h[ix[w]] = val[w][0] * L / val[w][1];
    let g = 0; for (const x of h) g = linGcd(g, x);
    const out = h.map(x => x / (g || 1));
    return out.every(x => x > 0 && Number.isFinite(x)) ? out : null;
}

// A weighing over k terms that the given weights satisfy: c1*A + c2*B = c3*C and so on.
function fmtArRatioFact(h, N, k, used) {
    const t = arTerms(N, k, used);
    const left = k === 2 ? 1 : arPick([1, k - 1]);
    const c = Array(k).fill(1);
    const rec = i => {
        if (i === k) {
            if (c.reduce((g, x) => linGcd(g, x), 0) !== 1) return false;
            let sum = 0;
            for (let j = 0; j < k; j++) sum += (j < left ? 1 : -1) * c[j] * h[t[j]];
            return sum === 0;
        }
        for (const v of [1, 2, 3, 4, 5, 6, 8, 9]) { c[i] = v; if (rec(i + 1)) return true; }
        return false;
    };
    if (!rec(0)) return null;
    const vec = Array(N).fill(0);
    for (let j = 0; j < k; j++) vec[t[j]] = (j < left ? 1 : -1) * c[j];
    return arLinEq(vec);
}

function fmtArAugment(fam, words, stmts, contexts, want) {
    const k = arityLevel();
    const ix = Object.fromEntries(words.map((w, i) => [w, i]));
    const N = words.length;
    const af = fmtArFamily(fam);
    const ctxList = contexts || [null];
    want = want || Math.max(1, Math.round(stmts.length * 0.5));
    const out = [];
    const keys = new Set();
    for (const ctx of ctxList) {
        const base = (ctx ? stmts.filter(s => !s.ctx || s.ctx === ctx) : stmts).map(s => fmtArFact(fam, s, ix, N));
        const h = fam.kind === 'ratio' ? (fmtArWeights(fam, stmts, ix, N) || fmtArWeightsFromFacts(base, N)) : fmtArModel(fam, base, N);
        if (h === null && fam.kind !== 'require') return null;
        const used = new Set();
        const facts = base.slice();
        for (let t = 0, made = 0; t < 60 && made < Math.ceil(want / ctxList.length); t++) {
            const a = (k === 4 && made > 0 && coinFlip()) ? 3 : k;
            const f = fam.kind === 'ratio' ? fmtArRatioFact(h, N, a, used) : af.fact(h, N, a, used, facts);
            if (!f || keys.has(f.key) || f.arity < 3) continue;
            if (fam.kind !== 'require' && !arFactTrueOf(fam, f, h)) continue;
            keys.add(f.key); facts.push(f); made++;
            f.terms.forEach(x => used.add(x));
            out.push({
                a: words[f.terms[0]], b: words[f.terms[1]],
                arId: arFactPut(f), arIdx: ix, arW: words, arH: h, arity: f.arity, ...(ctx && { ctx }),
            });
        }
    }
    return out.length ? out : null;
}

// a generated fact has to be true of the model we picked, on every axis
function arFactTrueOf(fam, f, h) {
    if (fam.kind === 'vector') {
        const D = h[0].length;
        return arRange(D).every(ax => f.truth(h.map(c => c[ax]), ax));
    }
    if (fam.kind === 'ratio') return f.vec.reduce((s, c, i) => s + c * h[i], 0) === 0;
    return f.truth(h, 0);
}

// ---------------------------------------------------------------- explanation model
// Formats had no explanation at all. Every family has a structure behind it, so show one that fits.
function fmtArExplainModel(fam, stmts, ctx) {
    try {
        stmts = stmts.filter(Boolean);
        const { ix, N } = fmtArIndex(stmts);
        const words = Object.keys(ix).sort((a, b) => ix[a] - ix[b]);
        if (!N) return {};
        let facts = (fam.kind === 'contexts' ? stmts.filter(s => !s.ctx || s.ctx === ctx) : stmts)
            .map(s => (arFactOf(s) || fmtArFact(fam, s, ix, N)));
        // Repair shows premises that contradict: set the odd one aside and draw what the rest allow.
        let note = null;
        if (fam.kind !== 'require' && !fmtArModelExists(fam, facts, N)) {
            const keep = facts.find((_, i) => fmtArModelExists(fam, facts.filter((_, j) => j !== i), N));
            if (!keep) return {};
            facts = facts.filter(f => f !== keep);
            note = 'All but one premise fit together like this';
        }
        if (note) {
            const m = fmtArExplainDraw(fam, facts, N, words, ix);
            return m.bucket || m.buckets || m.wordCoordMap || m.weights ? { ...m, modelNote: note } : {};
        }
        if (fam.kind === 'require') {
            // every clause is satisfied by switching everything off, so a world says nothing here.
            // What the premises really fix is what each thing drags in with it.
            const models = arStates(N).filter(m => facts.every(f => f.truth(m)));
            if (!models.length) return {};
            const rows = [];
            for (const w of words) {
                const on = models.filter(m => m[ix[w]]);
                if (!on.length) continue;
                const needs = words.filter(v => v !== w && on.every(m => m[ix[v]]));
                if (needs.length) rows.push([w, needs]);
            }
            return rows.length ? { needs: { head: 'What each one drags in with it', rows } } : {};
        }
        const known = stmts.find(s => s.arH && (fam.kind !== 'contexts' || !s.ctx || s.ctx === ctx));
        return fmtArExplainDraw(fam, facts, N, words, ix, known && known.arH);
    } catch (e) { return {}; }
}

function fmtArModelExists(fam, facts, N) {
    if (fam.kind === 'ratio') return arLinEngine(N).mask(facts).length < N - 0;
    return fmtArModel(fam, facts, N) !== null;
}

function fmtArExplainDraw(fam, facts, N, words, ix, known) {
    if (fam.kind === 'ratio') {
        const h = known || fmtArWeightsFromFacts(facts, N);
        if (!h) return {};
        return { weights: { head: 'Weights that fit the premises', rows: words.map(w => [w, h[ix[w]]]).sort((a, b) => a[1] - b[1]) } };
    }
    const h = known || fmtArModel(fam, facts, N);
    if (!h) return {};
    if (fam.kind === 'vector') return { wordCoordMap: Object.fromEntries(words.map(w => [w, [...h[ix[w]]]])) };
    if (fam.kind === 'order') return { bucket: words.slice().sort((a, b) => h[ix[a]] - h[ix[b]]) };
    return { buckets: [words.filter(w => h[ix[w]] === 0), words.filter(w => h[ix[w]] === 1)] };
}

// Weights for an item whose premises are all two-term: walk the ratio graph from each root.
function fmtArWeightsFromFacts(facts, N) {
    const edges = facts.filter(f => f.vec && f.vec.filter(x => x !== 0).length === 2);
    if (edges.length !== facts.length) return null;
    const num = Array(N).fill(null), den = Array(N).fill(null);
    const adj = {};
    for (const f of edges) {
        const [i, j] = f.vec.map((c, k) => (c !== 0 ? k : -1)).filter(k => k >= 0);
        (adj[i] = adj[i] || []).push([j, -f.vec[j], f.vec[i]]);      // w(i) = w(j) * -vj / vi
        (adj[j] = adj[j] || []).push([i, -f.vec[i], f.vec[j]]);
    }
    for (let r = 0; r < N; r++) {
        if (num[r] !== null) continue;
        num[r] = 1; den[r] = 1;
        const q = [r];
        while (q.length) {
            const x = q.shift();
            for (const [y, a, b] of adj[x] || []) {
                if (num[y] !== null) continue;
                const n = num[x] * a, d = den[x] * b, g = linGcd(n, d) || 1;
                num[y] = Math.abs(n / g); den[y] = Math.abs(d / g);
                q.push(y);
            }
        }
    }
    if (num.some(x => x === null || x === 0)) return null;
    let L = 1;
    for (let i = 0; i < N; i++) L = L * den[i] / linGcd(L, den[i]);
    const w = arRange(N).map(i => num[i] * L / den[i]);
    let g = 0; for (const x of w) g = linGcd(g, x);
    return w.map(x => x / (g || 1));
}

// ---------------------------------------------------------------- wiring
(function wireArityMore() {
    // ---- Mapping
    const mapOrig = MappingQuestion.prototype.create;
    MappingQuestion.prototype.create = function (length) {
        const q = mapOrig.call(this, length);
        if (!q || !q._mp) return q;
        const mp = q._mp;
        delete q._mp;                                  // never rides along into the saved item
        if (!arityActive()) return q;
        const extra = mpArityPremises(mp.Wa, mp.Wb, mp.pts, mp.ptsB, mp.x, mp.y);
        if (!extra.length) return q;
        const k = Math.max(...extra.map(e => e.arity));
        q.premises = [...q.premises, ...shuffle(extra.map(e => e.html))];
        q.arity = k;
        q.arityAsked = arityLevel();
        q.arityTimeMult = Math.max(2, AR_TIME_MULT[k]);
        q.modifiers = [...(q.modifiers || []), 'ar' + k];
        return q;
    };

    // ---- Formats: the evaluator switches to the engines as soon as a k-ary premise is in play
    const hasAr = stmts => Array.isArray(stmts) && stmts.some(s => s && s.arId !== undefined);
    const origStatus = fmtStatus, origConsistent = fmtConsistent, origTrue = fmtTrueRelation;
    fmtStatus = function (fam, stmts, query) {
        return hasAr(stmts) ? fmtArStatus(fam, stmts, query) : origStatus(fam, stmts, query);
    };
    fmtConsistent = function (fam, stmts) {
        return hasAr(stmts) ? fmtArConsistent(fam, stmts) : origConsistent(fam, stmts);
    };
    fmtTrueRelation = function (fam, stmts, a, b, ctx) {
        return hasAr(stmts) ? fmtArTrueRelation(fam, stmts, a, b, ctx) : origTrue(fam, stmts, a, b, ctx);
    };

    const origHTML = fmtStatementHTML;
    fmtStatementHTML = function (fam, s, asPremise) {
        const f = arFactOf(s);
        if (f) return (s.ctx ? contextPrefix(s.ctx) : '') + f.html(s.arW, !asPremise);
        return origHTML(fam, s, asPremise);
    };
    const origCanon = fmtCanon;
    fmtCanon = function (fam, s) { return (s && s.arId !== undefined) ? s : origCanon(fam, s); };
    const origSamePair = fmtSamePair;
    fmtSamePair = function (s, t) { return (s && s.arId !== undefined) || (t && t.arId !== undefined) ? false : origSamePair(s, t); };

    // k-ary premises replace some of the tree's edges, so the number of lines stays the same.
    // Repair is left alone: it asks the solver to rewrite one premise back into consistency, and
    // the premise it rewrites has to be one of the two-term ones.
    let fmtArOff = false;
    FMT_MAKERS.repair = (function (orig) {
        return function (fam, length) {
            fmtArOff = true;
            try { return orig(fam, length); } finally { fmtArOff = false; }
        };
    })(FMT_MAKERS.repair);
    const origTree = fmtTree;
    fmtTree = function (fam, edgeCount) {
        if (!arityActive() || fmtArOff) return origTree(fam, edgeCount);
        // Build the whole structure first, read the arrangement off it, then trade some two-term
        // premises for k-ary ones. Added on top they would say nothing new — the tree already fixes
        // every pair — so they have to replace the premises that were doing that work.
        const tree = origTree(fam, edgeCount);
        const nAr = Math.max(1, Math.round(tree.stmts.length * 0.35));
        const extra = fmtArAugment(fam, tree.words, tree.stmts, tree.contexts, nAr);
        if (!extra) return tree;
        const drop = new Set(shuffle(tree.stmts.map((_, i) => i)).slice(0, Math.min(extra.length, Math.max(0, tree.stmts.length - 2))));
        const kept = tree.stmts.filter((_, i) => !drop.has(i));
        return { ...tree, stmts: [...kept, ...extra] };
    };

    // every format item gets an explanation: a structure that fits what it showed
    const origBase = fmtBase;
    fmtBase = function (format, fam, extra) {
        const out = origBase(format, fam, extra);
        if (out.stmts && out.stmts.length) {
            const ctx = (out.target && out.target.ctx) || (out.answer && out.answer.ctx) || (out.ctx);
            Object.assign(out, fmtArExplainModel(fam, out.stmts, ctx));
            // only the plain pictures need saying; the drawn ones carry their own heading
            if (out.bucket || out.buckets || out.wordCoordMap) {
                out.modelNote = 'One arrangement that fits the premises';
            }
            const k = Math.max(2, ...out.stmts.map(s => s.arity || 2));
            if (k >= 3 && fam.kind === 'vector' && Array.isArray(out.premises)) {
                // the k-ary engine reads directions as which way, not how far, so say so
                out.premises = [`<span class="negation-explainer">Directions say which way, not how far</span>`, ...out.premises];
            }
            if (k >= 3) {
                out.arity = k;
                out.arityAsked = arityLevel();
                out.arityTimeMult = AR_TIME_MULT[k];
                out.modifiers = [...(out.modifiers || []), 'ar' + k];
            }
        }
        return out;
    };
    // a format that cannot be built from the sparser k-ary structure falls back to the plain one
    const origCreate = FormatQuestion.prototype.create;
    FormatQuestion.prototype.create = function (length) {
        if (!arityActive()) return origCreate.call(this, length);
        try { return origCreate.call(this, length); } catch (e) {
            fmtArOff = true;
            try { return origCreate.call(this, length); } finally { fmtArOff = false; }
        }
    };
})();

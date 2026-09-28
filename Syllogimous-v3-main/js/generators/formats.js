// formats.js — generative answer formats.
//
// Every item is built from a random structure (model-first, like the rest of Syllogimous),
// and every answer is judged by ONE evaluator (fmtStatus) that works out, for the premises
// shown, whether a statement is necessary, possible, or impossible. Nothing is keyed by hand:
// a user's constructed answer is accepted whenever the evaluator says it does the job, so any
// correct answer counts, not just the one the generator had in mind.
//
// Formats
//   judge    Is the statement necessary, possible, or impossible?
//   name     What is X to Y?  (a relation, or "can't tell")
//   build    Construct a premise that makes the target true
//   missing  One premise was removed; write a premise that makes every listed fact true   (free response)
//   repair   The premises contradict; rewrite one so they're consistent                    (free response)
//
// Statements are plain objects:  { a, b, rel, p, q, ctx }
//   parity   rel 0 = same, 1 = opposite                       (symmetric)
//   order    rel 'fwd' = "a <first phrase> b"  (a before b in the order)
//   require  rel 'fwd' = "a requires b"
//   vector   rel = "x,y" or "x,y,z". As a PREMISE: a is exactly one step from b.
//            As a QUESTION: the direction of a from b (Syllogimous semantics).
//   ratio    p * weight(a) = q * weight(b)

const FMT_LABELS = {
    judge: 'Judge',
    name: 'Name',
    build: 'Build',
    missing: 'Missing link',
    repair: 'Repair',
};

// ---------------------------------------------------------------- families
function fmtNormalizeRelation(text) {
    return text.toLowerCase()
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter(w => w && !['is', 'at', 'of', 'the', 'and'].includes(w))
        .join('');
}

function parityFamily(id, label, sameFn, oppFn, sameText, oppText, withContexts = false) {
    return {
        id, label, kind: withContexts ? 'contexts' : 'parity',
        rels: [{ key: 0, text: sameText }, { key: 1, text: oppText }],
        premiseObj: s => (s.rel === 0 ? sameFn : oppFn)(s.a, s.b),
        reversible: false,
    };
}

function orderFamily(id, label, gen) {
    return {
        id, label, kind: 'order',
        rels: [{ key: 'fwd', text: gen.prev }, { key: 'bwd', text: gen.next }],
        premiseObj: s => ({
            start: s.a, end: s.b,
            relation: gen.prev, reverse: gen.next,
            relationMinimal: gen.prevMin, reverseMinimal: gen.nextMin,
        }),
        reversible: true,
    };
}

function vectorFamily(id, label, coords) {
    const rels = coords.map(c => ({ key: c.join(','), text: `is ${dirStringFromCoord(c)} of` }));
    return {
        id, label, kind: 'vector', dim: coords[0].length,
        rels,
        premiseObj: s => {
            const v = s.rel.split(',').map(Number);
            return {
                start: s.a, end: s.b,
                relation: `is ${dirStringFromCoord(v)} of`,
                reverse: `is ${dirStringFromCoord(v.map(x => -x))} of`,
                relationMinimal: dirStringMinimal(v),
                reverseMinimal: dirStringMinimal(v.map(x => -x)),
            };
        },
        reversible: true,
    };
}

function fmtAllFamilies() {
    const fams = [
        parityFamily('distinction', 'Distinction', createSamePremise, createOppositePremise, 'is same as', 'is opposite of'),
        parityFamily('influence', 'Influence', createDirectPremise, createInversePremise, 'varies directly with', 'varies inversely with'),
        parityFamily('contexts', 'Contexts', createSamePremise, createOppositePremise, 'is same as', 'is opposite of', true),
        orderFamily('linear-leftright', 'Horizontal', LEFT_RIGHT),
        orderFamily('linear-topunder', 'Vertical', TOP_UNDER),
        orderFamily('linear-comparison', 'Comparison', MORE_LESS),
        orderFamily('linear-temporal', 'Temporal', BEFORE_AFTER),
        orderFamily('linear-contains', 'Contains', CONTAINS_WITHIN),
        vectorFamily('space2d', 'Space 2D', dirCoords.slice(1)),
        vectorFamily('space3d', 'Space 3D', dirCoords3D),
        {
            id: 'requirement', label: 'Requirement', kind: 'require',
            rels: [{ key: 'fwd', text: 'requires' }, { key: 'bwd', text: 'is required by' }],
            premiseObj: s => createRequiresPremise(s.a, s.b),
            reversible: true,
        },
        { id: 'balance', label: 'Balance', kind: 'ratio', rels: [], reversible: true },
    ];
    return fams;
}

function fmtFamilyById(id) {
    return fmtAllFamilies().find(f => f.id === id);
}

function fmtEnabledFamilies() {
    const on = [];
    if (savedata.enableDistinction) on.push('distinction');
    if (savedata.enableInfluence) on.push('influence');
    if (savedata.enableContexts) on.push('contexts');
    if (savedata.enableLinear) {
        for (const w of getEnabledLinearWordings()) on.push('linear-' + w);
    }
    if (savedata.enableDirection) on.push('space2d');
    if (savedata.enableDirection3D) on.push('space3d');
    if (savedata.enableRequirement) on.push('requirement');
    if (savedata.enableBalance) on.push('balance');
    return fmtAllFamilies().filter(f => on.includes(f.id));
}

// Which families each format supports.
function fmtSupports(format, fam) {
    if (fam.kind === 'contexts') return format === 'judge' || format === 'name';
    if (fam.kind === 'require' && format === 'repair') return false;   // requirements can never contradict
    return true;
}

// ---------------------------------------------------------------- statements
// order and require are stored canonically as 'fwd'
function fmtCanon(fam, s) {
    if ((fam.kind === 'order' || fam.kind === 'require') && s.rel === 'bwd') {
        return { ...s, a: s.b, b: s.a, rel: 'fwd' };
    }
    return s;
}

function fmtSamePair(s, t) {
    return (s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a);
}

function fmtVecNeg(key) {
    return key.split(',').map(x => String(-Number(x))).join(',');
}

// Two statements about the same pair say the same thing.
function fmtSameClaim(fam, s, t) {
    s = fmtCanon(fam, s); t = fmtCanon(fam, t);
    if ((s.ctx || null) !== (t.ctx || null)) return false;
    if (fam.kind === 'ratio') {
        if (s.a === t.a && s.b === t.b) return s.p * t.q === s.q * t.p;
        if (s.a === t.b && s.b === t.a) return s.p * t.p === s.q * t.q;
        return false;
    }
    if (fam.kind === 'vector') {
        if (s.a === t.a && s.b === t.b) return s.rel === t.rel;
        if (s.a === t.b && s.b === t.a) return s.rel === fmtVecNeg(t.rel);
        return false;
    }
    if (fam.kind === 'parity' || fam.kind === 'contexts') return fmtSamePair(s, t) && s.rel === t.rel;
    return s.a === t.a && s.b === t.b;               // order / require, canonical
}

// ---------------------------------------------------------------- the evaluator
function gcdN(x, y) { x = Math.abs(x); y = Math.abs(y); while (y) { [x, y] = [y, x % y]; } return x; }
function fracReduce([n, d]) { const g = gcdN(n, d); return [n / g, d / g]; }

const FMT_GROUP = {
    parity: {
        id: () => 0,
        delta: s => s.rel,
        compose: (x, d) => x ^ d,
        inv: d => d,
        eq: (x, y) => x === y,
    },
    vector: {
        id: s => s.rel.split(',').map(() => 0),
        delta: s => s.rel.split(',').map(Number),
        compose: (x, d) => x.map((v, i) => v + d[i]),
        inv: d => d.map(v => -v),
        eq: (x, y) => x.every((v, i) => v === y[i]),
    },
    ratio: {
        id: () => [1, 1],
        delta: s => fracReduce([s.q, s.p]),                    // w(a) = w(b) * q/p
        compose: (x, d) => fracReduce([x[0] * d[0], x[1] * d[1]]),
        inv: d => [d[1], d[0]],
        eq: (x, y) => x[0] * y[1] === x[1] * y[0],
    },
};

// Solve a group structure: value of every word relative to its component's root.
function fmtGroupSolve(kind, stmts) {
    const G = FMT_GROUP[kind === 'contexts' ? 'parity' : kind];
    const adj = {};
    for (const s of stmts) {
        const d = G.delta(s);
        (adj[s.b] = adj[s.b] ?? []).push({ to: s.a, d });                 // val(a) = val(b) . d
        (adj[s.a] = adj[s.a] ?? []).push({ to: s.b, d: G.inv(d) });       // val(b) = val(a) . d^-1
    }
    const val = {}, comp = {};
    let c = 0;
    for (const start of Object.keys(adj)) {
        if (start in val) continue;
        val[start] = G.id(stmts[0]);
        comp[start] = c;
        const queue = [start];
        while (queue.length) {
            const w = queue.shift();
            for (const { to, d } of adj[w]) {
                if (to in val) continue;
                val[to] = G.compose(val[w], d);
                comp[to] = c;
                queue.push(to);
            }
        }
        c++;
    }
    const consistent = stmts.every(s => G.eq(val[s.a], G.compose(val[s.b], G.delta(s))));
    return { val, comp, consistent, G };
}

function fmtReach(stmts, from, to) {
    const out = {};
    for (const s of stmts) (out[s.a] = out[s.a] ?? []).push(s.b);
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
        const w = stack.pop();
        for (const n of out[w] ?? []) {
            if (n === to) return true;
            if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
    }
    return false;
}

function fmtConsistent(fam, stmts) {
    stmts = stmts.map(s => fmtCanon(fam, s));
    if (fam.kind === 'require') return true;
    if (fam.kind === 'order') return !stmts.some(s => s.a === s.b || fmtReach(stmts, s.b, s.a));
    if (fam.kind === 'contexts') {
        const names = [...new Set(stmts.map(s => s.ctx).filter(Boolean))];
        const views = names.length ? names : [null];
        return views.every(C => {
            const sub = stmts.filter(s => !s.ctx || s.ctx === C);
            return sub.length === 0 || (!sub.some(s => s.a === s.b) && fmtGroupSolve('parity', sub).consistent);
        });
    }
    if (stmts.length === 0) return true;
    if (stmts.some(s => s.a === s.b)) return false;
    return fmtGroupSolve(fam.kind, stmts).consistent;
}

// 'necessary' | 'possible' | 'impossible' | 'inconsistent'
function fmtStatus(fam, stmts, query) {
    stmts = stmts.map(s => fmtCanon(fam, s));
    query = fmtCanon(fam, query);
    if (!fmtConsistent(fam, stmts)) return 'inconsistent';
    if (query.a === query.b) return 'impossible';

    if (fam.kind === 'order') {
        if (fmtReach(stmts, query.a, query.b)) return 'necessary';
        if (fmtReach(stmts, query.b, query.a)) return 'impossible';
        return 'possible';
    }
    if (fam.kind === 'require') {
        return fmtReach(stmts, query.a, query.b) ? 'necessary' : 'possible';
    }

    let sub = stmts;
    if (fam.kind === 'contexts') sub = stmts.filter(s => !s.ctx || s.ctx === query.ctx);
    if (sub.length === 0) return 'possible';
    const { val, comp, G } = fmtGroupSolve(fam.kind, sub);
    if (!(query.a in val) || !(query.b in val) || comp[query.a] !== comp[query.b]) return 'possible';

    const kind = fam.kind === 'contexts' ? 'parity' : fam.kind;
    if (kind === 'parity') return (val[query.a] ^ val[query.b]) === query.rel ? 'necessary' : 'impossible';
    if (kind === 'vector') {
        const diff = val[query.a].map((v, i) => Math.sign(v - val[query.b][i]));
        return diff.join(',') === query.rel ? 'necessary' : 'impossible';
    }
    // ratio: is p*w(a) = q*w(b) ?
    const [an, ad] = val[query.a], [bn, bd] = val[query.b];
    return query.p * an * bd === query.q * bn * ad ? 'necessary' : 'impossible';
}

// The determined relation of a to b, or null when it can't be determined.
function fmtTrueRelation(fam, stmts, a, b, ctx) {
    stmts = stmts.map(s => fmtCanon(fam, s));
    if (fam.kind === 'order' || fam.kind === 'require') {
        if (fmtReach(stmts, a, b)) return { a, b, rel: 'fwd' };
        if (fmtReach(stmts, b, a)) return { a, b, rel: 'bwd' };
        return null;
    }
    let sub = stmts;
    if (fam.kind === 'contexts') sub = stmts.filter(s => !s.ctx || s.ctx === ctx);
    const { val, comp } = fmtGroupSolve(fam.kind, sub);
    if (!(a in val) || !(b in val) || comp[a] !== comp[b]) return null;
    const kind = fam.kind === 'contexts' ? 'parity' : fam.kind;
    if (kind === 'parity') return { a, b, rel: val[a] ^ val[b], ...(ctx && { ctx }) };
    if (kind === 'vector') {
        const diff = val[a].map((v, i) => Math.sign(v - val[b][i]));
        if (diff.every(x => x === 0)) return null;
        return { a, b, rel: diff.join(',') };
    }
    const [n, d] = fracReduce([val[a][0] * val[b][1], val[a][1] * val[b][0]]);   // w(a)/w(b) = n/d
    return { a, b, p: d, q: n };                                                  // d*w(a) = n*w(b)
}

// ---------------------------------------------------------------- rendering
function fmtSubject(w) {
    return `<span class="subject">${w}</span>`;
}

function fmtPlainPremiseHTML(obj) {
    return `${fmtSubject(obj.start)} <span class="relation">${obj.relation}</span> ${fmtSubject(obj.end)}`;
}

// Premises get the normal Syllogimous treatment (negation, reversal). Questions, targets and
// facts are shown plainly, so the thing you're reasoning toward is never itself a trick.
function fmtStatementHTML(fam, s, asPremise) {
    s = fmtCanon(fam, s);
    let html;
    if (fam.kind === 'ratio') {
        html = (asPremise && coinFlip()) ? balanceHTML(s.q, s.b, s.p, s.a) : balanceHTML(s.p, s.a, s.q, s.b);
    } else {
        const obj = fam.premiseObj(s);
        html = asPremise ? createPremiseHTML(obj, fam.reversible) : fmtPlainPremiseHTML(obj);
    }
    if (s.ctx) html = contextPrefix(s.ctx) + html;
    return html;
}

function fmtStatementText(fam, s) {
    s = fmtCanon(fam, s);
    let text;
    if (fam.kind === 'ratio') {
        text = `${s.p} ${s.a} ${s.p === 1 ? 'balances' : 'balance'} ${s.q} ${s.b}`;
    } else {
        const obj = fam.premiseObj(s);
        text = `${obj.start} ${obj.relation} ${obj.end}`;
    }
    return (s.ctx ? `Under ${s.ctx}: ` : '') + text;
}

// ---------------------------------------------------------------- structure building
// A random tree over fresh words, with every edge a true statement of one hidden model.
function fmtTree(fam, edgeCount) {
    const extra = fam.kind === 'contexts' ? 2 : 0;
    let nCond = 0;
    if (fam.kind === 'contexts') {
        // edgeCount is the number of premise LINES; each conditional edge takes two lines
        edgeCount = Math.max(3, edgeCount);
        nCond = randomInclusive(1, Math.floor(edgeCount / 2));
        edgeCount = edgeCount - nCond;
    }
    const { words, extras, edges, neighbors } = buildRelationTree(edgeCount, extra);
    const stmts = [];
    const rank = {};
    shuffle([...words]).forEach((w, i) => rank[w] = i);
    const rels = fam.rels;
    for (const [src, tgt] of edges) {
        if (fam.kind === 'parity') {
            stmts.push({ a: src, b: tgt, rel: coinFlip() ? 0 : 1 });
        } else if (fam.kind === 'contexts') {
            stmts.push({ a: src, b: tgt, rel: coinFlip() ? 0 : 1 });   // contexts assigned below
        } else if (fam.kind === 'order') {
            stmts.push(rank[src] < rank[tgt] ? { a: src, b: tgt, rel: 'fwd' } : { a: tgt, b: src, rel: 'fwd' });
        } else if (fam.kind === 'require') {
            stmts.push(coinFlip() ? { a: src, b: tgt, rel: 'fwd' } : { a: tgt, b: src, rel: 'fwd' });
        } else if (fam.kind === 'vector') {
            stmts.push({ a: tgt, b: src, rel: pickRandomItems(rels, 1).picked[0].key });
        } else {
            const k = pickRandomItems([1, 2, 3], 1).picked[0];
            stmts.push(coinFlip() ? { a: src, b: tgt, p: 1, q: k } : { a: tgt, b: src, p: 1, q: k });
        }
    }
    let out = stmts;
    if (fam.kind === 'contexts') {
        // each edge is unconditional, or split into two opposite context premises
        const [cx, cy] = extras;
        const condIdx = new Set(pickRandomItems(stmts.map((_, i) => i), nCond).picked);
        out = [];
        stmts.forEach((s, i) => {
            if (condIdx.has(i)) {
                out.push({ ...s, ctx: cx }, { ...s, rel: 1 - s.rel, ctx: cy });
            } else {
                out.push(s);
            }
        });
        return { words, stmts: out, neighbors, contexts: [cx, cy] };
    }
    return { words, stmts: out, neighbors };
}

// Undirected distance between words through the given statements (Infinity if unconnected).
function fmtDistances(stmts, from) {
    const adj = {};
    for (const s of stmts) {
        (adj[s.a] = adj[s.a] ?? []).push(s.b);
        (adj[s.b] = adj[s.b] ?? []).push(s.a);
    }
    const dist = { [from]: 0 };
    const queue = [from];
    while (queue.length) {
        const w = queue.shift();
        for (const n of adj[w] ?? []) {
            if (!(n in dist)) { dist[n] = dist[w] + 1; queue.push(n); }
        }
    }
    return dist;
}

// All unordered pairs of words not directly stated together, weighted toward distant pairs.
function fmtPickPair(words, shownStmts, filter) {
    const cands = [];
    for (let i = 0; i < words.length; i++) {
        const dist = fmtDistances(shownStmts, words[i]);
        for (let j = 0; j < words.length; j++) {
            if (i === j) continue;
            const d = dist[words[j]] ?? Infinity;
            if (d < 2) continue;
            if (!filter(words[i], words[j])) continue;
            const weight = d === Infinity ? 9 : d * d;
            for (let k = 0; k < weight; k++) cands.push([words[i], words[j]]);
        }
    }
    return cands.length ? pickRandomItems(cands, 1).picked[0] : null;
}

function fmtPathEdgeIndices(stmts, a, b) {
    // indices of statements whose removal disconnects a from b (the tree path between them)
    const out = [];
    for (let i = 0; i < stmts.length; i++) {
        const rest = stmts.filter((_, j) => j !== i);
        if (!(b in fmtDistances(rest, a))) out.push(i);
    }
    return out;
}

// A statement about (a, b) whose status is `status`. For 'necessary' this is the true relation.
function fmtStatementWithStatus(fam, stmts, a, b, status, ctx) {
    const options = [];
    if (fam.kind === 'ratio') {
        const t = fmtTrueRelation(fam, stmts, a, b);
        const base = t || { p: 1, q: pickRandomItems([1, 2, 3, 4, 6], 1).picked[0] };
        for (const [p, q] of [[base.p, base.q], [base.q, base.p], [base.p, base.q * 2], [base.p * 2, base.q], [base.p, base.q * 3], [base.p * 3, base.q]]) {
            const g = gcdN(p, q);
            options.push({ a, b, p: p / g, q: q / g });
        }
    } else {
        for (const r of fam.rels) options.push({ a, b, rel: r.key, ...(ctx && { ctx }) });
    }
    const match = options.filter(o => fmtStatus(fam, stmts, o) === status);
    return match.length ? pickRandomItems(match, 1).picked[0] : null;
}

// In Contexts items the asked pair must relate differently in the two contexts,
// so the context always matters.
function fmtContextMatters(fam, stmts, contexts, a, b) {
    if (fam.kind !== 'contexts') return true;
    const [x, y] = contexts;
    const tx = fmtTrueRelation(fam, stmts, a, b, x), ty = fmtTrueRelation(fam, stmts, a, b, y);
    return !!tx && !!ty && tx.rel !== ty.rel;
}

function fmtWords(stmts) {
    return [...new Set(stmts.flatMap(s => [s.a, s.b]))];
}

function fmtShownPremises(fam, stmts) {
    return scramble(shuffle(stmts.map(s => fmtStatementHTML(fam, s, true))));
}

// ---------------------------------------------------------------- item generators
function fmtBase(format, fam, extra) {
    return {
        format,
        family: fam.id,
        category: `${FMT_LABELS[format]}: ${fam.label}`,
        type: `fmt-${format}`,
        startedAt: new Date().getTime(),
        ...extra,
    };
}

function fmtMakeJudge(fam, length) {
    // Decide the answer first, uniformly over the answers this family can have, so no answer
    // is a better guess than another.
    const achievable = {
        parity: ['necessary', 'possible', 'impossible'],
        vector: ['necessary', 'possible', 'impossible'],
        ratio: ['necessary', 'possible', 'impossible'],
        order: ['necessary', 'possible', 'impossible'],
        require: ['necessary', 'possible'],            // a requirement can always be added consistently
        contexts: ['necessary', 'impossible'],        // every pair is determined within a context
    }[fam.kind];
    const want = pickRandomItems(achievable, 1).picked[0];
    for (let attempt = 0; attempt < 40; attempt++) {
        const item = fmtTryJudge(fam, length, want);
        if (item) return item;
    }
    return null;
}

function fmtTryJudge(fam, length, want) {
    // "possible" in a group family needs a gap: remove one premise so two parts float free
    const removeOne = ['parity', 'vector', 'ratio'].includes(fam.kind) && (want === 'possible' || Math.random() < 0.25);
    const tree = fmtTree(fam, length + (removeOne ? 1 : 0));
    let stmts = tree.stmts;
    if (removeOne) {
        const i = Math.floor(Math.random() * stmts.length);
        stmts = stmts.filter((_, j) => j !== i);
    }
    const words = fmtWords(tree.stmts);
    const ctxs = tree.contexts;
    for (let tries = 0; tries < 20; tries++) {
        const ctx = ctxs ? pickRandomItems(ctxs, 1).picked[0] : undefined;
        const pair = fmtPickPair(words, stmts, (a, b) => fmtContextMatters(fam, stmts, ctxs, a, b));
        if (!pair) return null;
        const st = fmtStatementWithStatus(fam, stmts, pair[0], pair[1], want, ctx);
        if (!st) continue;
        return fmtBase('judge', fam, {
            premises: fmtShownPremises(fam, stmts),
            stmts, target: st,
            conclusion: fmtStatementHTML(fam, st, false),
            answerKey: want,
            isValid: { necessary: 'must be true', possible: 'could be true', impossible: "can't be true" }[want],
        });
    }
    return null;
}

function fmtMakeName(fam, length) {
    // contexts: every pair is determined within a context, so "can't tell" is never the answer there
    const wantDetermined = fam.kind === 'contexts' || Math.random() < 0.7;
    for (let attempt = 0; attempt < 40; attempt++) {
        const item = fmtTryName(fam, length, wantDetermined);
        if (item) return item;
    }
    return null;
}

function fmtTryName(fam, length, wantDetermined) {
    const removeOne = ['parity', 'vector', 'ratio'].includes(fam.kind) && !wantDetermined;
    const tree = fmtTree(fam, length + (removeOne ? 1 : 0));
    let stmts = tree.stmts;
    if (removeOne) {
        const i = Math.floor(Math.random() * stmts.length);
        stmts = stmts.filter((_, j) => j !== i);
    }
    const words = fmtWords(tree.stmts);
    const ctx = tree.contexts ? pickRandomItems(tree.contexts, 1).picked[0] : undefined;
    for (let tries = 0; tries < 40; tries++) {
        const pair = fmtPickPair(words, stmts, (a, b) => {
            if (!fmtContextMatters(fam, stmts, tree.contexts, a, b)) return false;
            const t = fmtTrueRelation(fam, stmts, a, b, ctx);
            if (fam.kind === 'vector' && !t) {
                // undetermined only if in different components (not "same place")
                const { comp } = fmtGroupSolve('vector', stmts);
                return !wantDetermined && comp[a] !== comp[b];
            }
            return wantDetermined ? !!t : !t;
        });
        if (!pair) continue;
        const t = fmtTrueRelation(fam, stmts, pair[0], pair[1], ctx);
        const ctxHtml = ctx ? contextPrefix(ctx) : '';
        const question = fam.kind === 'ratio'
            ? `${ctxHtml}<span class="relation">?</span> ${fmtSubject(pair[0])} <span class="relation">balance</span> <span class="relation">?</span> ${fmtSubject(pair[1])}`
            : `${ctxHtml}${fmtSubject(pair[0])} <span class="relation">?</span> ${fmtSubject(pair[1])}`;
        return fmtBase('name', fam, {
            premises: fmtShownPremises(fam, stmts),
            stmts, a: pair[0], b: pair[1], ctx,
            conclusion: question,
            answer: t,                                  // null = can't be determined
            isValid: t ? fmtStatementText(fam, t) : "can't tell",
        });
    }
    return null;
}

// Build a full tree, then take one premise away. Returns null if no good split exists.
function fmtSplit(fam, length, needPair) {
    const tree = fmtTree(fam, length + 1);
    const full = tree.stmts;
    const words = fmtWords(full);
    for (let tries = 0; tries < 30; tries++) {
        const pair = fmtPickPair(words, full, (a, b) => !!fmtTrueRelation(fam, full, a, b));
        if (!pair) return null;
        const path = fmtPathEdgeIndices(full, pair[0], pair[1]);
        const removedIdx = pickRandomItems(path, 1).picked[0];
        const removed = full[removedIdx];
        const shown = full.filter((_, i) => i !== removedIdx);
        if (!needPair(shown, removed, pair)) continue;
        return { full, shown, removed, pair, words };
    }
    return null;
}

function fmtMakeBuild(fam, length) {
    const split = fmtSplit(fam, length, (shown, removed, pair) => {
        const t = fmtTrueRelation(fam, [...shown, removed], pair[0], pair[1]);
        return t && fmtStatus(fam, shown, t) !== 'necessary';
    });
    if (!split) return null;
    const { shown, removed, pair, words } = split;
    const target = fmtTrueRelation(fam, [...shown, removed], pair[0], pair[1]);
    return fmtBase('build', fam, {
        premises: fmtShownPremises(fam, shown),
        stmts: shown, words, target,
        conclusion: fmtStatementHTML(fam, target, false),
        isValid: 'e.g. ' + fmtStatementText(fam, removed),
    });
}

function fmtMakeMissing(fam, length) {
    const split = fmtSplit(fam, length, () => true);
    if (!split) return null;
    const { full, shown, removed, words } = split;
    // facts true of the full structure that the shown premises no longer determine
    const facts = [];
    for (const a of words) for (const b of words) {
        if (a >= b) continue;
        const t = fmtTrueRelation(fam, full, a, b);
        if (!t || fmtStatus(fam, shown, t) === 'necessary') continue;
        if (fmtSamePair(t, removed)) continue;
        facts.push(t);
    }
    if (facts.length < 2) return null;
    const observations = pickRandomItems(facts, Math.min(facts.length, coinFlip() ? 2 : 3)).picked;
    return fmtBase('missing', fam, {
        premises: fmtShownPremises(fam, shown),
        stmts: shown, words, observations,
        conclusion: observations.map(o => `<div class="fmt-fact">${fmtStatementHTML(fam, o, false)}</div>`).join(''),
        isValid: 'e.g. ' + fmtStatementText(fam, removed),
    });
}

function fmtMakeRepair(fam, length) {
    if (length < 3) length = 3;
    for (let tries = 0; tries < 30; tries++) {
        const tree = fmtTree(fam, length - 1);
        const stmts = tree.stmts;
        const words = fmtWords(stmts);
        // add a true chord between two non-adjacent words (it must be expressible as a premise)
        const pair = fmtPickPair(words, stmts, (a, b) => {
            const t = fmtTrueRelation(fam, stmts, a, b);
            if (!t) return false;
            if (fam.kind === 'vector') {
                const { val } = fmtGroupSolve('vector', stmts);
                return val[a].every((v, i) => Math.abs(v - val[b][i]) <= 1);
            }
            return true;
        });
        if (!pair) continue;
        let chord;
        if (fam.kind === 'vector') {
            const { val } = fmtGroupSolve('vector', stmts);
            chord = { a: pair[0], b: pair[1], rel: val[pair[0]].map((v, i) => v - val[pair[1]][i]).join(',') };
        } else {
            chord = fmtTrueRelation(fam, stmts, pair[0], pair[1]);
        }
        const all = [...stmts, fmtCanon(fam, chord)];
        // corrupt one premise on the cycle so the set contradicts itself
        const cycle = fmtPathEdgeIndices(stmts, pair[0], pair[1]).concat([all.length - 1]);
        const candidates = fam.kind === 'order' ? [all.length - 1] : cycle;
        const idx = pickRandomItems(candidates, 1).picked[0];
        const orig = all[idx];
        let bad;
        if (fam.kind === 'parity') bad = { ...orig, rel: 1 - orig.rel };
        else if (fam.kind === 'order') bad = { a: orig.b, b: orig.a, rel: 'fwd' };
        else if (fam.kind === 'vector') bad = { ...orig, rel: pickRandomItems(fam.rels.filter(r => r.key !== orig.rel), 1).picked[0].key };
        else {
            const opts = [[orig.q, orig.p], [orig.p, orig.q * 2], [orig.p * 2, orig.q], [orig.p, orig.q * 3]]
                .map(([p, q]) => { const g = gcdN(p, q); return [p / g, q / g]; })
                .filter(([p, q]) => p * orig.q !== q * orig.p);
            const [p, q] = pickRandomItems(opts, 1).picked[0];
            bad = { ...orig, p, q };
        }
        const shown = all.map((s, i) => i === idx ? bad : s);
        if (fmtConsistent(fam, shown)) continue;
        return fmtBase('repair', fam, {
            premises: fmtShownPremises(fam, shown),
            stmts: shown, words,
            conclusion: `<span class="fmt-instruction">Rewrite one premise so they no longer contradict</span>`,
            isValid: 'e.g. ' + fmtStatementText(fam, orig),
        });
    }
    return null;
}

const FMT_MAKERS = { judge: fmtMakeJudge, name: fmtMakeName, build: fmtMakeBuild, missing: fmtMakeMissing, repair: fmtMakeRepair };

class FormatQuestion {
    constructor(format) { this.format = format; }
    create(length) {
        length = Math.max(2, length);
        const fams = shuffle(fmtEnabledFamilies().filter(f => fmtSupports(this.format, f)));
        for (const fam of fams) {
            for (let tries = 0; tries < 25; tries++) {
                const item = FMT_MAKERS[this.format](fam, length);
                if (item) {
                    const t = savedata[`overrideFmt${fmtKey(this.format)}Time`];
                    if (t) item.countdown = t;
                    return item;
                }
            }
        }
        throw new Error(`${this.format}: could not build an item`);
    }
}

function fmtKey(format) {
    return { judge: 'Judge', name: 'Name', build: 'Build', missing: 'Missing', repair: 'Repair' }[format];
}

function createFormatGenerators(quota) {
    const gens = [];
    for (const format of Object.keys(FMT_MAKERS)) {
        const k = fmtKey(format);
        if (!savedata[`enableFmt${k}`]) continue;
        if (!fmtEnabledFamilies().some(f => fmtSupports(format, f))) continue;
        gens.push({
            question: new FormatQuestion(format),
            premiseCount: getPremisesFor(`overrideFmt${k}Premises`, quota),
            weight: savedata[`overrideFmt${k}Weight`],
        });
    }
    return gens;
}

// ---------------------------------------------------------------- answer checking
// Each returns { correct } or { error } (an input problem: not scored, the user can fix it).

function fmtCheckJudge(q, choice) {
    return { correct: choice === q.answerKey, text: { necessary: 'must be true', possible: 'could be true', impossible: "can't be true" }[choice] };
}

function fmtCheckName(q, ans) {
    const fam = fmtFamilyById(q.family);
    if (ans === 'cant') return { correct: q.answer === null, text: "can't tell" };
    if (!q.answer) return { correct: false, text: fmtStatementText(fam, ans) };
    if (fam.kind === 'ratio') {
        if (!(ans.p > 0 && ans.q > 0)) return { error: 'Enter two whole numbers above zero' };
        return { correct: ans.p * q.answer.q === ans.q * q.answer.p, text: fmtStatementText(fam, ans) };
    }
    return { correct: fmtSameClaim(fam, ans, q.answer), text: fmtStatementText(fam, ans) };
}

function fmtValidStatement(fam, s, words) {
    if (!s.a || !s.b) return 'Pick both terms';
    if (s.a === s.b) return 'Pick two different terms';
    if (!words.includes(s.a) || !words.includes(s.b)) return 'Use terms from the premises';
    if (fam.kind === 'ratio' && !(Number.isInteger(s.p) && Number.isInteger(s.q) && s.p > 0 && s.q > 0)) return 'Enter two whole numbers above zero';
    if (fam.kind !== 'ratio' && s.rel === undefined) return 'Enter a relation';
    return null;
}

function fmtCheckBuild(q, s) {
    const fam = fmtFamilyById(q.family);
    const err = fmtValidStatement(fam, s, q.words);
    if (err) return { error: err };
    if (fmtSamePair(s, q.target)) return { error: 'Use a different pair of terms than the target' };
    const all = [...q.stmts, s];
    const ok = fmtConsistent(fam, all) && fmtStatus(fam, all, q.target) === 'necessary';
    return { correct: ok, text: fmtStatementText(fam, s) };
}

function fmtCheckMissing(q, s) {
    const fam = fmtFamilyById(q.family);
    const err = fmtValidStatement(fam, s, q.words);
    if (err) return { error: err };
    const all = [...q.stmts, s];
    const ok = fmtConsistent(fam, all) && q.observations.every(o => fmtStatus(fam, all, o) === 'necessary');
    return { correct: ok, text: fmtStatementText(fam, s) };
}

function fmtCheckRepair(q, s) {
    const fam = fmtFamilyById(q.family);
    const err = fmtValidStatement(fam, s, q.words);
    if (err) return { error: err };
    const idx = q.stmts.findIndex(p => fmtSamePair(p, s));
    if (idx < 0) return { error: 'Rewrite one of the premises: use the same two terms as an existing premise' };
    if (fmtSameClaim(fam, q.stmts[idx], s)) return { error: 'That premise already says this. Change its relation' };
    const fixed = q.stmts.map((p, i) => i === idx ? s : p);
    return { correct: fmtConsistent(fam, fixed), text: fmtStatementText(fam, s) };
}

// Typed relation -> statement, or null if the text isn't a relation of this family.
function fmtParseRelation(fam, text, a, b) {
    const norm = fmtNormalizeRelation(text);
    if (!norm) return null;
    const hit = fam.rels.find(r => fmtNormalizeRelation(r.text) === norm);
    if (!hit) return null;
    return { a, b, rel: hit.key };
}

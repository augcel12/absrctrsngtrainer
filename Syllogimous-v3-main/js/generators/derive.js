// derive.js — how the answer follows, step by step.
//
// Every item built on the arity engines carries its premises as facts the engine can test, which is
// enough to find a short proof instead of just listing the premises that matter. Start from the premises
// that settle the conclusion; at each round add every simple fact (mostly two terms — the kind of thing
// a solver says to themselves on the way) that follows from at most two things already known, or three
// when a count needs its cases closed; stop as soon as the conclusion follows from two or three known
// things. Then keep only the steps that the last one actually leans on, in the order they were found.
// Every step is an inference the engine has checked, so an explanation can never claim more than the
// premises give.
//
// The facts carry functions, so they can't travel with the item into history; they wait here, keyed by
// the item, and the steps (plain HTML) are worked out when an explanation is first wanted.

const AR_DERIVE_STORE = new Map();
let arDeriveSeq = 0;
function arDeriveKeep(fam, r, W) {
    const id = ++arDeriveSeq;
    if (AR_DERIVE_STORE.size >= 80) AR_DERIVE_STORE.delete(AR_DERIVE_STORE.keys().next().value);
    AR_DERIVE_STORE.set(id, { fam, r, W });
    return id;
}

// the simple facts a step may conclude: the family's own if it has them, otherwise its two-term
// conclusions; only ones the premises force, and none that is already a premise
function arDeriveVocab(fam, r, eng, MS) {
    const ctx = { facts: r.facts, M: eng.mask(r.facts), eng };
    const raw = fam.simple ? fam.simple(r.h, r.N, ctx) : fam.conclusions(r.h, r.N, 2, {}, ctx).filter(f => f.arity === 2);
    const skip = new Set(r.facts.map(f => f.key)), out = [];
    for (const f of raw) {
        if (!f || skip.has(f.key)) continue;
        skip.add(f.key);
        if (eng.valueM(MS, f) === true) out.push(f);
    }
    return out;
}

function arDerive(fam, r, W) {
    const eng = fam.engine(r.N), want = r.isValid, c = r.concl;
    const S = r.support.slice();
    if (!S.length) return null;
    const MS = eng.mask(S);
    const V = arDeriveVocab(fam, r, eng, MS);
    const known = S.map(f => ({ f, lvl: 0, J: null }));
    const has = new Set(known.map(k => k.f.key));
    const touches = (g, target) => !target.terms || !g.terms || g.terms.some(t => target.terms.includes(t));
    // the smallest set of known things (size up to max, at least one from round `fresh` when given) that
    // settles target the way wanted
    const justify = (target, val, max, fresh) => {
        const pool = known.filter(k => touches(k.f, target));
        const n = pool.length;
        for (let size = 1; size <= max; size++) {
            const idx = [];
            const rec = (start) => {
                if (idx.length === size) {
                    if (fresh != null && !idx.some(i => pool[i].lvl === fresh)) return null;
                    const J = idx.map(i => pool[i]);
                    return eng.value(J.map(k => k.f), target) === val ? J : null;
                }
                for (let i = start; i < n; i++) {
                    idx.push(i);
                    const got = rec(i + 1);
                    idx.pop();
                    if (got) return got;
                }
                return null;
            };
            const got = rec(0);
            if (got) return got;
        }
        return null;
    };
    let final = null;
    for (let lvl = 1; lvl <= 7 && !final; lvl++) {
        final = justify(c, want, 2, null);
        if (final) break;
        const added = [];
        for (const d of V) {
            if (has.has(d.key)) continue;
            const J = justify(d, true, 2, lvl - 1) || justify(d, true, 3, lvl - 1);
            if (J) added.push({ f: d, lvl, J });
        }
        if (!added.length) break;
        for (const a of added) { known.push(a); has.add(a.f.key); }
    }
    if (!final) final = justify(c, want, 3, null);
    if (!final) return null;
    // keep what the last step leans on, and what those lean on
    const need = new Set();
    const walk = k => { if (!k.J || need.has(k)) return; need.add(k); k.J.forEach(walk); };
    final.forEach(walk);
    const kept = known.filter(k => need.has(k));
    const num = new Map(kept.map((k, i) => [k, i + 1]));
    const ref = k => (num.has(k) ? { n: num.get(k), html: k.f.html(W, true) } : { html: k.f.html(W, true) });
    const steps = kept.map(k => ({ n: num.get(k), from: k.J.map(ref), to: k.f.html(W, true) }));
    return { steps, last: { from: final.map(ref), holds: want } };
}

// the steps for an item, worked out once and kept on it (so they go into history with it)
function arEnsureSteps(q) {
    if (!q || q.derivation !== undefined || q.deriveId === undefined) return;
    const it = AR_DERIVE_STORE.get(q.deriveId);
    if (!it) return;
    try { q.derivation = arDerive(it.fam, it.r, it.W) || null; } catch (e) { console.error(e); q.derivation = null; }
}

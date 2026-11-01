// probe.js — recall probes.
//
// Everything else in the app tells you what to hold and when it will be tested. A probe does not: it
// arrives unannounced, several items later, and asks about an item you had no reason to keep. That is
// the point. Encoding you decided to do is rehearsal; encoding that was already there when the question
// came is what this is for.
//
// So probes are only worth anything if they cannot be answered by having kept the thing deliberately:
//   - the item is gone from the screen, so nothing can be re-derived;
//   - the lag is random, so no item is worth over-studying;
//   - the strongest kind asks about a relation that was TRUE of that item but never stated and never
//     needed — you only have it if you built the whole arrangement rather than the one chain the
//     conclusion asked about;
//   - and that relation is drawn from the family's own candidate pool, so it comes out in whatever
//     direction the pool happens to give. A claim worded the opposite way round from any premise you
//     read cannot be matched against a remembered sentence; only the structure answers it.
//
// Probes never feed auto-progression (see storeQuestionAndSave): they measure recall, not the
// relational difficulty the dials are tracking.

const PROBE_LOG = [];
const PROBE_LOG_MAX = 24;
let probeSerial = 0;

function probeActive() { return !!savedata.enableProbe; }
function probeMaxLag() { return Math.max(2, Math.min(12, +savedata.probeMaxLag || 6)); }

function probeSubjects(htmlList) {
    const out = [];
    for (const h of htmlList) {
        for (const m of String(h || '').matchAll(/<span class="subject">(.*?)<\/span>/g)) {
            if (!out.includes(m[1])) out.push(m[1]);
        }
    }
    return out;
}

// Every served screen gets a serial, probes included, so "N items back" counts what was actually seen.
function probeNote(q) {
    probeSerial++;
    const rec = { serial: probeSerial, data: null };
    // format items are skipped: their "conclusion" is a prompt and their isValid is sample text, so
    // "did its conclusion follow" has no meaning for them
    if (q && !q.isProbe && !q.format && Array.isArray(q.premises)) {
        const real = q.premises.filter(p => !/negation-explainer/.test(p));
        if (real.length) {
            rec.data = {
                category: String(q.category || '').split(':')[0].trim(),
                terms: probeSubjects([...real, q.conclusion]),
                premiseCount: real.length,
                negated: real.some(p => /is-negated/.test(p)),
                answer: !!q.isValid,
                facts: Array.isArray(q.probeFacts) ? q.probeFacts.slice(0, 3) : [],
            };
        }
    }
    PROBE_LOG.push(rec);
    while (PROBE_LOG.length > PROBE_LOG_MAX) PROBE_LOG.shift();
}

function probeReset() {
    PROBE_LOG.length = 0;
    probeSerial = 0;
}

const probeS = w => `<span class="subject">${w}</span>`;
const probeR = w => `<span class="relation">${w}</span>`;

// a term from some OTHER item in the log: familiar enough to feel right, wrong episode
function probeForeignTerm(mine) {
    const pool = [];
    for (const r of PROBE_LOG) {
        if (!r.data) continue;
        for (const t of r.data.terms) if (!mine.includes(t) && !pool.includes(t)) pool.push(t);
    }
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    try { return createStimuli(mine.length + 1).filter(w => !mine.includes(w))[0] || null; } catch (e) { return null; }
}

function probeForeignCategory(mine) {
    const pool = [];
    for (const r of PROBE_LOG) {
        if (!r.data) continue;
        if (r.data.category && r.data.category !== mine && !pool.includes(r.data.category)) pool.push(r.data.category);
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// Each kind returns { claim, truth, reveal } or null if it can't be built for this item.
const PROBE_KINDS = {
    // the one that needs the whole arrangement, not just the chain that was asked about
    fact(d) {
        if (!d.facts.length) return null;
        const want = Math.random() < 0.5;
        const match = d.facts.filter(f => !!f.truth === want);
        const f = (match.length ? match : d.facts)[Math.floor(Math.random() * (match.length || d.facts.length))];
        return {
            claim: `${probeR('This was true of that item:')} ${f.html}`,
            truth: !!f.truth,
            reveal: `<div class="support__head">It was ${f.truth ? 'true' : 'not true'} of that item:</div><div class="support__line">${f.html}</div>`,
        };
    },
    answer(d) {
        return {
            claim: probeR('Its conclusion followed from its premises'),
            truth: d.answer,
            reveal: `<div class="support__head">That item's conclusion was ${d.answer ? 'TRUE' : 'FALSE'}.</div>`,
        };
    },
    term(d) {
        const want = Math.random() < 0.5;
        const t = want
            ? d.terms[Math.floor(Math.random() * d.terms.length)]
            : probeForeignTerm(d.terms);
        if (!t) return null;
        return {
            claim: `${probeS(t)} ${probeR('was one of its terms')}`,
            truth: want,
            reveal: `<div class="support__head">Its terms were:</div><div class="support__line">${d.terms.map(probeS).join(' ')}</div>`,
        };
    },
    count(d) {
        const want = Math.random() < 0.5;
        const k = want ? d.premiseCount : Math.max(1, d.premiseCount + (Math.random() < 0.5 ? -1 : 1));
        if (k === d.premiseCount && !want) return null;
        return {
            claim: `${probeR('It had')} ${probeS(String(k))} ${probeR(k === 1 ? 'premise' : 'premises')}`,
            truth: want,
            reveal: `<div class="support__head">It had ${d.premiseCount} premises.</div>`,
        };
    },
    category(d) {
        if (!d.category) return null;
        const want = Math.random() < 0.5;
        const c = want ? d.category : probeForeignCategory(d.category);
        if (!c) return null;
        return {
            claim: `${probeR('It was a')} ${probeS(c)} ${probeR('item')}`,
            truth: want,
            reveal: `<div class="support__head">It was a ${d.category} item.</div>`,
        };
    },
    negation(d) {
        return {
            claim: probeR('At least one of its premises was negated'),
            truth: d.negated,
            reveal: `<div class="support__head">${d.negated ? 'One or more of its premises was negated.' : 'None of its premises was negated.'}</div>`,
        };
    },
};

function probeMake() {
    if (!probeActive()) return null;
    if (Math.random() * 100 >= (+savedata.probeChance || 0)) return null;

    const here = probeSerial + 1;
    const maxLag = probeMaxLag();
    const cands = PROBE_LOG.filter(r => r.data && here - r.serial >= 2 && here - r.serial <= maxLag);
    if (!cands.length) return null;
    const pickRec = cands[Math.floor(Math.random() * cands.length)];
    const d = pickRec.data;
    const lag = here - pickRec.serial;

    // the fact kind is the one worth having, so it gets more of the draw when the item carries any
    const kinds = ['answer', 'term', 'count', 'category', 'negation'];
    if (d.facts.length) kinds.push('fact', 'fact', 'fact');
    let built = null;
    for (const name of shuffle(kinds)) {
        built = PROBE_KINDS[name](d);
        if (built) break;
    }
    if (!built) return null;

    return {
        category: 'Recall',
        type: 'probe',
        isProbe: true,
        startedAt: new Date().getTime(),
        plen: 0,
        premises: [`<span class="negation-explainer">About the item you saw ${lag} items back — nothing to work out, only what stayed</span>`],
        conclusion: built.claim,
        isValid: built.truth,
        explainHTML: built.reveal,
        ...(savedata.overrideProbeTime && { countdown: savedata.overrideProbeTime }),
    };
}

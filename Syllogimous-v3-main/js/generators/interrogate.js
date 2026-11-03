// interrogate.js — an answer format you cannot pass by resolving one pair.
//
// A true/false item names the pair it cares about. That is its weakness: the chain between those two
// terms is all you ever have to work out, and everything else in the premises can be dropped on sight.
// A solver who never builds the arrangement still scores.
//
// Interrogate takes the naming away. The premises go up; when you say you are ready they are REMOVED,
// and only then does it ask — about several different parts of the structure at once, parts you could
// not have known in advance. Nothing can be looked up again, so a partial reading cannot be repaired
// by re-reading. What you have is whatever you built and kept.
//
// Three things keep it honest:
//   - Three-way answers. "Can't tell" is a real option, so knowing one consistent arrangement is not
//     enough: you have to know which claims every consistent arrangement agrees on and which it does
//     not. That is the whole model space, not one picture of it.
//   - Every query needs integration. A claim settled by one premise on its own is thrown out, the same
//     test the conclusion of a normal item has to pass.
//   - All or nothing. Three right out of four scores zero, so there is no partial credit for a partial
//     structure — which is exactly the thing being trained away.
//
// Queries are worded plainly (never negated): the premises carry the inversion explainer and the
// premises are gone by the time you answer.

function interrogateActive() { return !!savedata.enableInterrogate; }
function interrogateCount() { return Math.max(2, Math.min(6, +savedata.interrogateQueries || 3)); }

// Binary builds its item out of two whole sub-items and combines their answers, so a sub-item has to
// have one answer to give. An interrogated item does not — it has a set of them, and its isValid is a
// sentence rather than a truth value. Anything generating a component asks for the plain item.
let interrogateHeld = 0;
function interrogateSuspend(fn) {
    interrogateHeld++;
    try { return fn(); } finally { interrogateHeld--; }
}
function interrogateRoll() {
    return !interrogateHeld && interrogateActive()
        && Math.random() * 100 < (+savedata.interrogateChance || 0);
}

const AR_Q_LABEL = { true: 'Must be true', false: "Can't be true", null: "Can't tell" };

// Pick n claims about DIFFERENT parts of the arrangement, mixing forced-true, forced-false and
// genuinely undetermined, each one needing more than a single premise to settle.
// `keep` hands back the live fact objects alongside the wording, so a checker can re-derive each
// answer from the fact's own truth function. Never passed on the question-building path: facts carry
// functions and a question has to survive structuredClone on its way into storage.
function arInterrogateQueries(fam, r, W, n, keep) {
    try {
        const eng = fam.engine(r.N);
        const M = eng.mask(r.facts);
        const banned = new Set([r.concl.key, ...r.facts.map(f => f.key)]);
        const pool = shuffle(fam.conclusions(r.h, r.N, r.k, {}, { facts: r.facts, M, eng }))
            .filter(c => !banned.has(c.key));

        const picked = [], usedKeys = new Set(), termSets = [];
        const freshTerms = c => {
            const key = (c.terms || []).slice().sort((a, b) => a - b).join(',');
            return !termSets.includes(key) && (termSets.push(key), true);
        };
        const take = want => {
            for (const c of pool) {
                if (usedKeys.has(c.key)) continue;
                const v = eng.valueM(M, c);
                if (v !== want) continue;
                // a claim one premise settles on its own asks nothing of the rest of the structure
                if (v !== null && r.facts.some(f => eng.value([f], c) === v)) continue;
                if (!freshTerms(c)) continue;
                usedKeys.add(c.key);
                picked.push({ html: c.html(W, true), answer: v, ...(keep ? { fact: c } : {}) });
                return true;
            }
            return false;
        };

        // independent target per slot, so the mix is never a fixed "one of each"
        const wants = [];
        for (let i = 0; i < n; i++) wants.push(arPick([true, false, null]));
        // but a set that is all one answer is a giveaway, so force at least one that differs
        if (wants.every(w => w === wants[0])) wants[0] = arPick([true, false, null].filter(w => w !== wants[1]));

        for (const w of wants) {
            if (!take(w)) { if (!take(true) && !take(false) && !take(null)) break; }
        }
        return picked.length === n ? shuffle(picked) : null;
    } catch (e) { return null; }
}

function applyInterrogate(out, queries) {
    out.format = 'interrogate';
    out.queries = queries;
    out.queryAnswers = queries.map(q => `<div class="support__line">${q.html} <b>${AR_Q_LABEL[String(q.answer)]}</b></div>`).join('');
    out.conclusion = `<span class="fmt-instruction">Learn the whole arrangement. When you hide the premises you will be asked `
        + `${queries.length} things about it, and they do not come back.</span>`;
    out.isValid = 'every answer has to be right';
    // studying and then answering n questions is more work than judging one conclusion, and
    // arityTimeMult is the one lever that stretches the clock whichever way the timer is set AND
    // normalises the time the progression records
    out.arityTimeMult = (out.arityTimeMult || 1) * (1 + 0.5 * (queries.length - 1));
    if (savedata.overrideInterrogateTime) out.countdown = savedata.overrideInterrogateTime;
    return out;
}

// scoring: all or nothing
function interrogateCheck(q, answers) {
    const right = q.queries.every((qq, i) => answers[i] === qq.answer);
    const text = q.queries.map((qq, i) => AR_Q_LABEL[String(answers[i])]).join(', ');
    return { correct: right, text };
}

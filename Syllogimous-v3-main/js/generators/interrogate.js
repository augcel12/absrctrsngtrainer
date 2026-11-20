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
//   - Each answer counts. Two right out of three is worth two thirds toward the level, the same footing
//     as a true/false item, so a run of interrogated items doesn't drag the level down just for having
//     more questions in it. A clean sweep is what counts as "right" in the history and the score.
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

// scoring: right only if every answer is; the share of answers right is the credit the level sees
function interrogateCheck(q, answers) {
    const hits = q.queries.filter((qq, i) => answers[i] === qq.answer).length;
    const L = q.queryMode === 'possible' ? AR_POSSIBLE_LABEL : AR_Q_LABEL;
    const text = q.queries.map((qq, i) => L[String(answers[i])]).join(', ');
    return { correct: hits === q.queries.length, text, credit: hits / q.queries.length, picks: answers.slice() };
}

// ================================================================ Possible arrangements
// The same two phases (study, hide, answer), but what comes back is drawn arrangements of every term,
// and each is possible or impossible. An impossible one breaks exactly one premise wherever that can
// be found, so it looks right at a glance and only the whole structure catches it.
function possibleActive() { return !!savedata.enablePossible; }
function possibleCount() { return Math.max(2, Math.min(6, +savedata.possibleQueries || 4)); }
function possibleRoll() {
    return !interrogateHeld && possibleActive()
        && Math.random() * 100 < (+savedata.possibleChance || 0);
}
const AR_POSSIBLE_LABEL = { true: 'Possible', false: 'Impossible' };

function arPossibleQueries(fam, r, W, n, extra) {
    try {
        const eng = fam.engine(r.N);
        if (!Array.isArray(eng.models) || !eng.models.length || !eng.axes || !extra.model) return null;
        if (/^(perspective|difference|frame)/.test(fam.id || '')) return null;
        const D = eng.axes, models = eng.models;
        const M = eng.mask(r.facts);
        const bitOn = (a, i) => (M[a][i >> 5] & (1 << (i & 31))) !== 0;
        const inside = arRange(D).map(a => arRange(models.length).filter(i => bitOn(a, i)));
        if (inside.some(l => !l.length)) return null;
        const fails = (m, a) => r.facts.filter(f => !f.truth(m, a)).length;
        // a model on axis a that breaks exactly one premise (or, failing that, any)
        const nearMiss = a => {
            let any = null;
            for (let t = 0; t < 4000; t++) {
                const m = models[Math.floor(Math.random() * models.length)];
                const k = fails(m, a);
                if (k === 1) return m;
                if (k > 1 && !any) any = m;
            }
            return any;
        };
        // axes the premises actually say something about (a space item may leave one free)
        const said = arRange(D).filter(a => inside[a].length < models.length);
        const build = possible => {
            const chosen = arRange(D).map(a => models[arPick(inside[a])]);
            if (!possible) {
                if (!said.length) return null;
                const a0 = arPick(said), m = nearMiss(a0);
                if (!m) return null;
                chosen[a0] = m;
            }
            const h = D === 1 ? chosen[0] : arRange(r.N).map(i => chosen.map(m => m[i]));
            const fields = extra.model({ ...r, h }, W);
            const html = createExplanationModel({ category: extra.category, ...fields });
            return html ? { html, answer: possible } : null;
        };
        const wants = arRange(n).map(() => coinFlip());
        if (n > 1 && wants.every(w => w === wants[0])) wants[0] = !wants[0];
        const out = [], seen = new Set();
        for (const w of wants) {
            let q = null;
            for (let t = 0; t < 12 && !q; t++) {
                const c = build(w);
                if (c && !seen.has(c.html)) q = c;
            }
            if (!q) return null;
            seen.add(q.html);
            out.push(q);
        }
        return out;
    } catch (e) { return null; }
}

function applyPossible(out, queries) {
    out.format = 'interrogate';
    out.queryMode = 'possible';
    out.queries = queries;
    out.queryAnswers = queries.map(q => `<div class="support__line">${q.html} <b>${AR_POSSIBLE_LABEL[String(q.answer)]}</b></div>`).join('');
    out.conclusion = `<span class="fmt-instruction">Build the whole arrangement. When you hide the premises you will be shown `
        + `${queries.length} arrangements of every term, and asked which of them the premises allow.</span>`;
    out.isValid = 'every answer has to be right';
    out.arityTimeMult = (out.arityTimeMult || 1) * (1 + 0.4 * (queries.length - 1));
    if (savedata.overrideInterrogateTime) out.countdown = savedata.overrideInterrogateTime;
    return out;
}

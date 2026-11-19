// explanation.js — what an item's answer rests on: how it follows, step by step, and the arrangement
// drawn. Used after a miss (createMissExplanationHTML) and from the history (showExplanationModal).

// ================================================================ the arrangement, drawn
const xpHead = h => (h ? `<div class="xp-head">${h}</div>` : '');
// ---------------------------------------------------------------- space: grids with the compass round them
const XP_SEP = '\u0001';            // between words that share a cell (a word may be markup with commas)

// nested arrays, last coordinate outermost: grid[z][y][x] in 3D; a cell is its words joined by XP_SEP
function createGridFromMap(wordCoordMap) {
    const entries = Object.entries(wordCoordMap);
    const D = entries[0][1].length;
    const low = entries[0][1].slice(), high = entries[0][1].slice();
    for (const [, c] of entries) for (let i = 0; i < D; i++) { low[i] = Math.min(low[i], c[i]); high[i] = Math.max(high[i], c[i]); }
    const dims = low.map((l, i) => high[i] - l + 1);
    const make = i => (i < 0 ? '' : Array.from({ length: dims[i] }, () => make(i - 1)));
    const grid = make(D - 1);
    for (const [word, c] of entries) {
        let cur = grid;
        for (let i = D - 1; i > 0; i--) cur = cur[c[i] - low[i]];
        const x = c[0] - low[0];
        cur[x] = cur[x] ? cur[x] + XP_SEP + word : word;
    }
    return grid;
}

// a grid[y][x], north at the top
function createExplanation2D(grid, opts = {}) {
    const rows = grid.length, cols = grid[0].length;
    let s = `<div class="xp-grid" style="grid-template-columns:repeat(${cols}, minmax(2.8em, auto))">`;
    for (let y = rows - 1; y >= 0; y--) for (let x = 0; x < cols; x++) {
        const v = grid[y][x];
        s += `<div class="xp-grid__cell${v ? '' : ' is-empty'}">${v ? v.split(XP_SEP).map(w => `<div>${w}</div>`).join('') : ''}</div>`;
    }
    s += '</div>';
    if (opts.compass === false) return s;
    return `<div class="xp-compass"><span class="xp-compass__n">N</span><span class="xp-compass__w">W</span>${s}<span class="xp-compass__e">E</span><span class="xp-compass__s">S</span></div>`;
}

// grid[z] from the bottom layer up: drawn as flat layers side by side, the highest first
function createExplanation3D(grid) {
    const n = grid.length;
    let s = '<div class="xp-layers">';
    for (let z = n - 1; z >= 0; z--) {
        const cap = n === 1 ? 'one level' : z === n - 1 ? 'highest' : z === 0 ? 'lowest' : 'middle';
        s += `<div class="xp-layer"><div class="xp-layer__cap">${cap}</div>${createExplanation2D(grid[z])}</div>`;
    }
    return s + '</div>';
}

function createExplanation4D(grid) {
    let s = '<div class="xp-times">';
    for (let t = 0; t < grid.length; t++) {
        const cap = grid.length === 1 ? 'one moment' : t === 0 ? 'earliest' : t === grid.length - 1 ? 'latest' : `moment ${t + 1}`;
        s += `<div class="xp-time"><div class="xp-time__cap">${cap}</div>${createExplanation3D(grid[t])}</div>`;
    }
    return s + '</div>';
}

// ---------------------------------------------------------------- orders and groups
// which end of an order each wording starts from (the model lists the "is left of / on top of / less
// than / before / contains" end first)
const XP_ORDER = {
    Horizontal: { from: 'left', to: 'right', sep: '' },
    Vertical: { from: 'top', to: 'bottom', vertical: true },
    Comparison: { from: 'least', to: 'most', sep: '&lt;' },
    Temporal: { from: 'earliest', to: 'latest', sep: '→' },
    Contains: { from: 'outermost', to: 'innermost', sep: '⊃' },
};
const xpCategory = q => (q.category || '').replace(/^Analogy: /, '');

// groups: [[words at one position], ...] in order
function xpOrderHTML(o, groups) {
    const cell = g => `<span class="xp-order__w">${g.map(w => `<span>${w}</span>`).join('')}</span>`;
    if (o.vertical) {
        return `<div class="xp-order is-vertical"><span class="xp-order__end">${o.from}</span>${groups.map(cell).join('')}<span class="xp-order__end">${o.to}</span></div>`;
    }
    const sep = o.sep ? `<span class="xp-order__sep">${o.sep}</span>` : '';
    return `<div class="xp-order"><span class="xp-order__end">${o.from}</span>${groups.map(cell).join(sep)}<span class="xp-order__end">${o.to}</span></div>`;
}

function createExplanationBucket(q) {
    const o = XP_ORDER[xpCategory(q)];
    if (o) return xpOrderHTML(o, q.bucket.map(w => [w]));
    return `<div class="xp-order">${q.bucket.map(w => `<span class="xp-order__w"><span>${w}</span></span>`).join('')}</div>`;
}

// two groups (same / opposite, or moving together / the other way), or an order with ties (180° mode)
function createExplanationBuckets(q) {
    const o = XP_ORDER[xpCategory(q)];
    if (o) return xpOrderHTML(o, q.buckets);
    const cat = xpCategory(q);
    const [a, b] = cat === 'Influence' ? ['these move together', 'these move the other way'] : ['these are the same', 'these are the opposite'];
    const col = (g, cap) => `<div class="xp-group"><div class="xp-group__cap">${cap}</div>${g.map(w => `<div class="xp-group__w">${w}</div>`).join('') || '<div class="xp-group__w">—</div>'}</div>`;
    return `<div class="xp-groups">${col(q.buckets[0] || [], a)}${col(q.buckets[1] || [], b)}</div>`;
}

// ---------------------------------------------------------------- the other model pictures
function createExplanationStates(st) {
    let s = `${xpHead(st.head)}<div class="xp-states">`;
    for (const [word, on] of st.rows) {
        s += `<div class="xp-state ${on ? 'is-on' : 'is-off'}"><span class="xp-state__w">${word}</span>`
           + `<span class="xp-state__v">${on ? 'works' : 'fails'}</span></div>`;
    }
    return s + '</div>';
}

function createExplanationWeights(wt) {
    const max = Math.max(...wt.rows.map(r => r[1]));
    let s = `${xpHead(wt.head)}<div class="xp-weights">`;
    for (const [word, w] of wt.rows) {
        s += `<div class="xp-weight"><span class="xp-weight__w">${word}</span>`
           + `<span class="xp-weight__bar" style="width:${Math.round(100 * w / max)}%"></span>`
           + `<span class="xp-weight__v">${w}</span></div>`;
    }
    return s + '</div>';
}

// a number line: rows are [word, value]; words at the same value stack above one tick
function createExplanationNumberLine(nl) {
    const vals = nl.rows.map(r => r[1]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    const groups = new Map();
    for (const [w, v] of nl.rows) { if (!groups.has(v)) groups.set(v, []); groups.get(v).push(w); }
    const tall = Math.max(...[...groups.values()].map(g => g.length));
    let s = `${xpHead(nl.head)}<div class="xp-nl-wrap"><div class="xp-nl" style="width:${Math.max(260, span * 46)}px;height:${2.6 + tall * 1.35}em">`;
    s += '<div class="xp-nl__axis"></div>';
    for (let v = lo; v <= hi; v++) s += `<div class="xp-nl__unit" style="left:${(100 * (v - lo) / span).toFixed(3)}%"></div>`;
    for (const [v, ws] of [...groups].sort((a, b) => a[0] - b[0])) {
        const left = (100 * (v - lo) / span).toFixed(3);
        s += `<div class="xp-nl__pt" style="left:${left}%"><div class="xp-nl__words">${ws.map(w => `<div class="xp-nl__w">${w}</div>`).join('')}</div>`
           + `<div class="xp-nl__tick"></div><div class="xp-nl__v">${v}</div></div>`;
    }
    return s + '</div></div>';
}

// spans in time: rows are [word, start slot, end slot] on a track of `slots` endpoint positions
function createExplanationBars(br) {
    const n = br.slots, pct = v => (100 * (v + 0.5) / n).toFixed(2);
    let s = `${xpHead(br.head)}<div class="xp-bars">`;
    for (const [w, a, b] of br.rows) {
        s += `<div class="xp-bar__w">${w}</div><div class="xp-bar__track">`
           + `<div class="xp-bar" style="left:${pct(a)}%;width:${(100 * (b - a) / n).toFixed(2)}%"></div></div>`;
    }
    return s + '<div></div><div class="xp-bar__axis"><span>earlier</span><span>later</span></div></div>';
}

// positions with the way each one faces: cells are [word, x, y, heading 0..3 = up right down left]
function createExplanationFacing(fc) {
    const xs = fc.cells.map(c => c[1]), ys = fc.cells.map(c => c[2]);
    const W = Math.max(...xs) + 1, H = Math.max(...ys) + 1;
    const arrow = ['↑', '→', '↓', '←'];
    let s = `${xpHead(fc.head)}<div class="xp-grid" style="grid-template-columns:repeat(${W}, minmax(3.4em, auto))">`;
    for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) {
        const here = fc.cells.filter(c => c[1] === x && c[2] === y);
        s += `<div class="xp-grid__cell${here.length ? '' : ' is-empty'}">`
           + here.map(c => `<div class="xp-face"><span class="xp-face__arrow">${arrow[c[3]]}</span>${c[0]}</div>`).join('') + '</div>';
    }
    return s + '</div><div class="support__note">The arrow is the way each one faces.</div>';
}

// a ring: names clockwise from the top
function createExplanationRing(rg) {
    const n = rg.names.length, R = 74, C = 110;
    let s = `${xpHead(rg.head)}<div class="xp-ring"><svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">`
          + `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/>`
          + `<path d="M ${C + 26} ${C - 40} A 48 48 0 0 1 ${C + 46} ${C - 12}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>`
          + `<path d="M ${C + 46} ${C - 12} l -7 -3 m 7 3 l 2 -7" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>`
          + '</svg>';
    rg.names.forEach((w, i) => {
        const a = -Math.PI / 2 + 2 * Math.PI * i / n;
        const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
        s += `<span class="xp-ring__w" style="left:${(100 * x / 220).toFixed(1)}%;top:${(100 * y / 220).toFixed(1)}%">${w}</span>`;
    });
    return s + '</div><div class="support__note">Clockwise is the way the arrow turns.</div>';
}

// an indented listing: rows are [depth, word] (Hierarchy draws its tree with this)
function createExplanationLines(ln) {
    let s = `${xpHead(ln.head)}<div class="xp-tree">`;
    for (const [depth, word] of ln.rows) {
        s += `<div class="xp-tree__row" style="padding-left:${depth * 1.6}em">${depth ? '<span class="xp-tree__elbow">└</span>' : ''}<span class="xp-tree__w">${word}</span></div>`;
    }
    return s + '</div>';
}

function createExplanationNeeds(nd) {
    let s = `${xpHead(nd.head)}<div class="xp-needs">`;
    for (const [word, needs] of nd.rows) {
        s += `<div class="xp-need"><span class="xp-need__w">${word}</span><span class="xp-need__arrow">→</span>`
           + `<span class="xp-need__list">${needs.join(', ')}</span></div>`;
    }
    return s + '</div><div class="support__note">If the one on the left works, every one on the right has to as well.</div>';
}

function createExplanationRegions(rg) {
    if (!rg.rows.length) return '';
    let s = `<div class="xp-head">Which combinations exist</div><table class="xp-regions"><tr>`;
    for (const t of rg.terms) s += `<th>${t}</th>`;
    s += '</tr>';
    for (const row of rg.rows) {
        s += '<tr>';
        for (const v of row) s += `<td class="${v ? 'is-in' : 'is-out'}">${v ? '●' : '·'}</td>`;
        s += '</tr>';
    }
    return s + '</table><div class="support__note">One row per kind of thing that exists: a filled dot means it is in that category.</div>';
}

// the drawn arrangement for any item, or '' when it has none
function createExplanationModel(q) {
    if (q.modelNote) {
        const inner = createExplanationModel({ ...q, modelNote: null });
        return inner ? `<div class="xp-head">${q.modelNote}</div>${inner}` : '';
    }
    if (q.states) return createExplanationStates(q.states);
    if (q.lines) return createExplanationLines(q.lines);
    if (q.weights) return createExplanationWeights(q.weights);
    if (q.numberLine) return createExplanationNumberLine(q.numberLine);
    if (q.bars) return createExplanationBars(q.bars);
    if (q.facing) return createExplanationFacing(q.facing);
    if (q.ring) return createExplanationRing(q.ring);
    if (q.regions) return createExplanationRegions(q.regions);
    if (q.needs) return createExplanationNeeds(q.needs);
    if (q.bucket) return createExplanationBucket(q);
    if (q.buckets) return createExplanationBuckets(q);
    if (q.wordCoordMap) {
        const D = Object.values(q.wordCoordMap)[0].length;
        const grid = createGridFromMap(q.wordCoordMap);
        return D >= 4 ? createExplanation4D(grid) : D === 3 ? createExplanation3D(grid) : createExplanation2D(grid);
    }
    if (q.subresults) return q.subresults.map(createExplanation).join('<div class="binary-explainer-separator"></div>');
    return '';
}

// ================================================================ how it follows
// the steps the engine checked (derive.js)
function createStepsHTML(q) {
    const d = q.derivation;
    const input = u => (u.n ? `<span class="xp-step__ref" title="step ${u.n}">${u.n}</span>` : `<span class="xp-step__in">${u.html}</span>`);
    const join = list => list.map(input).join('<span class="xp-step__plus">+</span>');
    let s = '<div class="xp-steps">';
    for (const st of d.steps) {
        s += `<div class="xp-step"><span class="xp-step__n">${st.n}</span><div class="xp-step__body">`
           + `<div class="xp-step__from">${join(st.from)}</div><div class="xp-step__to"><span class="xp-step__arrow">⇒</span>${st.to}</div></div></div>`;
    }
    const verdict = d.last.holds ? 'so the conclusion is true' : 'so the conclusion can\'t be true';
    s += `<div class="xp-step is-last"><span class="xp-step__n">∴</span><div class="xp-step__body">`
       + `<div class="xp-step__from">${join(d.last.from)}</div><div class="xp-step__to"><span class="xp-step__arrow">⇒</span>${verdict}</div></div></div>`;
    return s + '</div>';
}

// classic two-term items: the premises that link the two terms of the conclusion, in the order the
// chain runs (indices into the premises, worked out on the stored item so stimuli don't get in the way)
const xpSubjects = html => [...String(html).matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m => m[1]);
function xpChain(q) {
    if (!Array.isArray(q.premises) || typeof q.conclusion !== 'string') return null;
    const ends = xpSubjects(q.conclusion);
    if (ends.length !== 2 || ends[0] === ends[1]) return null;
    const edges = q.premises.map((p, i) => ({ i, s: [...new Set(xpSubjects(p))] })).filter(e => e.s.length >= 2);
    const prev = new Map([[ends[0], null]]), queue = [ends[0]];
    while (queue.length) {
        const w = queue.shift();
        if (w === ends[1]) break;
        for (const e of edges) if (e.s.includes(w)) for (const v of e.s) if (!prev.has(v)) { prev.set(v, { from: w, i: e.i }); queue.push(v); }
    }
    if (!prev.has(ends[1])) return null;
    const out = [];
    for (let w = ends[1]; prev.get(w); w = prev.get(w).from) out.unshift(prev.get(w).i);
    return out.length >= 1 ? out : null;
}

function createChainHTML(q) {
    if (!Array.isArray(q.chainIdx) || !q.chainIdx.length) return '';
    return '<div class="xp-chain">' + q.chainIdx.map((i, n) => `<div class="xp-chain__p"><span class="xp-step__n">${n + 1}</span><span>${q.premises[i]}</span></div>`).join('')
        + `<div class="xp-chain__p is-last"><span class="xp-step__n">∴</span><span>${q.isValid ? 'Put together, these make the conclusion true' : 'Put together, these rule the conclusion out'}</span></div></div>`;
}

// the premises that settle it, when no steps could be worked out
function createSupportHTML(q) {
    if (!q.support || !q.support.length) return '';
    let s = '<div class="support">';
    s += q.support.map(p => `<div class="support__premise">${p}</div>`).join('');
    if (q.syllogismNearMiss && q.supportConclusion) {
        s += `<div class="xp-sec">What does follow</div><div class="support__premise">${q.supportConclusion}</div>`;
        s += `<div class="support__note">The conclusion shown is close to this but is not implied.</div>`;
    }
    return s + '</div>';
}

function createSyllogismRuleHTML(q) {
    if (q.support || !q.rule) return '';
    const valid = typeof validRules !== 'undefined' && validRules.includes(q.rule);
    const mood = q.rule.slice(0, 3).split('').map(d => 'AEIO'[+d]).join('');
    return `<div class="support"><div class="support__premise">Form ${mood}-${q.rule[3]}: ${valid ? 'valid — the conclusion follows' : 'invalid — the conclusion does not follow'}</div></div>`;
}

// the reasoning part of an explanation: steps, else the chain, else the premises that matter
function xpReasoningHTML(q) {
    if (q.derivation && q.derivation.steps) return `<div class="xp-sec">How it follows</div>${createStepsHTML(q)}`;
    if (q.chainIdx) return `<div class="xp-sec">How it follows</div>${createChainHTML(q)}`;
    if (q.support && q.support.length) {
        const head = q.syllogismNearMiss ? 'What the premises give' : (q.isValid ? 'The premises that make it true' : 'The premises that rule it out');
        return `<div class="xp-sec">${head}</div>${createSupportHTML(q)}`;
    }
    return createSyllogismRuleHTML(q);
}

// interrogate: each question with what followed, marked against what was answered
function createQueryResultHTML(q) {
    if (!Array.isArray(q.queries) || !Array.isArray(q.queryPicks)) return q.queryAnswers;
    const label = v => AR_Q_LABEL[String(v)];
    const hits = q.queries.filter((qq, i) => q.queryPicks[i] === qq.answer).length;
    return `<div class="support xp-queries"><div class="support__note">${hits} of ${q.queries.length} right</div>` + q.queries.map((qq, i) => {
        const ok = q.queryPicks[i] === qq.answer;
        return `<div class="support__line xp-query"><span class="xp-query__mark ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span>`
            + `<span>${qq.html}</span> <b>${label(qq.answer)}</b>`
            + (ok ? '' : `<span class="xp-query__said">(you said ${label(q.queryPicks[i])})</span>`) + '</div>';
    }).join('') + '</div>';
}

// ================================================================ putting it together
// work out what needs the live item (the steps, the chain) before it is cloned for display
function xpPrepare(q) {
    if (!q) return;
    if (typeof arEnsureSteps === 'function') arEnsureSteps(q);
    if (!q.derivation && !q.support && q.chainIdx === undefined && !q.queries && !q.explainHTML) {
        try { q.chainIdx = xpChain(q); } catch (e) { q.chainIdx = null; }
    }
    if (Array.isArray(q.subresults)) q.subresults.forEach(xpPrepare);
}

function xpModelHTML(q) {
    let model = '';
    try { model = createExplanationModel(q) || ''; } catch (e) { model = ''; }
    if (!model) return '';
    // an engine-built item's arrangement is one of those the premises allow; a classic one is the only one
    const head = `<div class="xp-sec">${q.deriveId !== undefined || q.arity ? 'One arrangement that fits' : 'The arrangement'}</div>`;
    return `${head}<div class="miss-explanation__model">${model}</div>`;
}

function xpAnswerHTML(q) {
    if (q.queryAnswers) return `<div class="xp-sec">What was asked, and what followed</div>${createQueryResultHTML(q)}`;
    const v = q.isValid;
    return `<div class="miss-explanation__answer ${v ? 'is-true' : 'is-false'}">${v ? 'True' : 'False'}</div>`
         + `<div class="miss-explanation__conclusion">${q.conclusion}</div>`;
}

function createMissExplanationHTML(q) {
    let s = xpAnswerHTML(q);
    if (q.explainHTML) return s + q.explainHTML;
    // an interrogated item never showed its own conclusion, so the premises behind it are beside the point
    if (!q.queryAnswers) s += xpReasoningHTML(q);
    return s + xpModelHTML(q);
}

// one part of a binary item, or a context of a contexts item
function createExplanation(q) {
    const title = q.title ? `<div class="xp-title">${q.title}</div>` : '';
    if (q.explainHTML) return title + q.explainHTML;
    const conclusion = q.conclusion && !q.title ? `<div class="miss-explanation__conclusion">${q.conclusion} <b>${q.isValid ? 'true' : 'false'}</b></div>` : '';
    return title + conclusion + xpReasoningHTML(q) + (createExplanationModel(q) || '');
}

// from the history: the same window as after a miss, closed without moving on
function showExplanationModal(question) {
    xpPrepare(question);
    const q = renderJunkEmojis(question);
    const box = document.createElement('div');
    box.className = 'miss-explanation is-history';
    box.innerHTML = `<div class="miss-explanation__inner">${createMissExplanationHTML(q)}<button class="miss-explanation__continue">Close</button></div>`;
    const close = () => box.remove();
    box.addEventListener('click', e => { if (e.target === box) close(); });
    box.querySelector('button').addEventListener('click', close);
    document.body.appendChild(box);
}

// kept for callers that still hover: now a click opens the window instead
function createExplanationPopup() {}
function removeExplanationPopup() {
    document.querySelectorAll('.explanation-popup').forEach(el => el.remove());
}

function createExplanationButton(q) {
    const has = q.support || q.explainHTML || q.derivation || q.deriveId !== undefined || (q.category === 'Syllogism' && q.rule)
        || q.wordCoordMap || q.bucket || q.buckets || q.subresults || q.states || q.weights || q.numberLine || q.bars
        || q.facing || q.ring || q.regions || q.needs || q.lines || q.modelNote;
    return has ? '<button class="explanation-button">Explanation</button>' : '';
}

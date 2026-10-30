function createGridFromMap(wordCoordMap) {
    const entries = Object.entries(wordCoordMap);
    const low = structuredClone(entries[0][1]);
    const high = structuredClone(entries[0][1]);

    for (const [word, coord] of entries) {
        for (const i in coord) {
            low[i] = Math.min(low[i], coord[i])
            high[i] = Math.max(high[i], coord[i])
        }
    }

    const dimensions = low.map((l, i) => high[i] - l + 1);
    const createNArray = (i) => {
        if (i < 0)
            return '';
        return Array.from({ length: dimensions[i] }, (_, a) => createNArray(i-1));
    };
    const grid = createNArray(dimensions.length - 1);

    for (const [word, coord] of entries) {
        let curr = grid
        for (let i = coord.length - 1; i >= 0; i--) {
            const loc = coord[i] - low[i];
            if (!Array.isArray(curr[loc])) {
                curr[loc] += (curr[loc].length > 0 ? ',' : '') + word;
                break;
            }
            curr = curr[loc]
        }
    }

    return grid;
}

function centerText(text, width) {
    if (text.length > 50) {
        const half = Math.floor(width / 2);
        const padding = ' '.repeat(half);
        return padding + text + padding;
    }
    const totalPadding = width - text.length;
    const paddingStart = Math.floor(totalPadding / 2);
    return text.padStart(text.length + paddingStart).padEnd(width);
}

function createFiller(grid) {
    const lengths = grid.flat(Infinity).map(x => x.length > 50 ? 1 : x.length);
    const biggest = lengths.reduce((a, b) => Math.max(a, b));
    const neededLength = biggest + 2;
    return '\u00A0'.repeat(neededLength);
}

function fillTable(grid, filler) {
    let s = '';
    for (let i = grid.length - 1; i >= 0; i--) {
        const row = grid[i];
        for (const val of row) {
            s += '<div class="td">' + (val ? centerText(val, filler.length) : filler) + '</div>';
        }
    }
    return s;
}

function createExplanation2D(grid, filler, separatorFn) {
    if (!filler) {
        filler = createFiller(grid);
    }

    if (!separatorFn) {
        separatorFn = (s) => `<div class="table" style="grid-template-columns: repeat(${grid[0].length}, auto)">${s}</div>`;
    }

    return separatorFn(fillTable(grid, filler));
}

function createExplanation3D(grid, filler) {
    if (!filler) {
        filler = createFiller(grid);
    }
    const gridWidth = grid[0][0].length;
    let s = `<div class="three-d-scene">`
    for (let i = grid.length - 1; i >= 0; i--) {
        s += createExplanation2D(grid[i], filler, (s) => {
            return `<div class="table three-d-plane plane-${grid.length - i}" style="grid-template-columns: repeat(${gridWidth}, minmax(min-content, 1fr))">${s}</div>`
        });
    }
    s += '</div>'
    s += `<style>.three-d-plane .td { max-width: ${Math.floor((100 / gridWidth) - 4)}vw; }</style>`
    return s;
}

function createExplanation4D(grid) {
    const filler = createFiller(grid);
    let s = '<div class="four-d-scene" style="display: flex; gap: 0.5rem;">';
    for (let i = 0; i < grid.length; i++) {
        let time = i + 1;
        s += '<div>';
        s += '<div>Time ' + time + '</div>'
        s += createExplanation3D(grid[i], filler);
        s += '</div>';
    }
    s += '</div>'
    return s;
}

function createExplanationBucket(question) {
    if (question.category === 'Vertical') {
        return question.bucket.map(word => `<div>${word}</div>`).join('');
    } else if (question.category === 'Comparison') {
        return question.bucket.join(' < ');
    } else {
        return question.bucket.join(" ");
    }
}

function createExplanationBuckets(question) {
    if (question.category === 'Vertical') {
        return question.buckets
            .map(bucket => '<div style="justify-self: start;">' + bucket.join(' ') + '</div>')
            .join('<div class="divider"></div>');
    }
    const filler = createFiller(question.buckets);
    const verticalLength = question.buckets.reduce((a, b) => Math.max(a, b));
    let s = '<table class="distinction">';
    s += '<tr>';
    for (const bucket of question.buckets) {
        
        s += '<td>';
        for (const item of bucket) {
            s += '<div>' + centerText(item, filler.length) + '</div>';
        }
        s += '</td>';
    }
    s += '</tr>';
    s += '</table>';
    return s;
}

// ---------------------------------------------------------------- model pictures
// Every item type ends in some hidden structure. These draw it: a set of on/off states (Requirement),
// a weighing (Balance), the combinations that exist (Syllogism categories).
function createExplanationStates(st) {
    let s = `<div class="xp-head">${st.head}</div><div class="xp-states">`;
    for (const [word, on] of st.rows) {
        s += `<div class="xp-state ${on ? 'is-on' : 'is-off'}"><span class="xp-state__w">${word}</span>`
           + `<span class="xp-state__v">${on ? 'works' : 'fails'}</span></div>`;
    }
    return s + '</div>';
}

function createExplanationWeights(wt) {
    const max = Math.max(...wt.rows.map(r => r[1]));
    let s = `<div class="xp-head">${wt.head}</div><div class="xp-weights">`;
    for (const [word, w] of wt.rows) {
        s += `<div class="xp-weight"><span class="xp-weight__w">${word}</span>`
           + `<span class="xp-weight__bar" style="width:${Math.round(100 * w / max)}%"></span>`
           + `<span class="xp-weight__v">${w}</span></div>`;
    }
    return s + '</div>';
}

function createExplanationNeeds(nd) {
    let s = `<div class="xp-head">${nd.head}</div><div class="xp-needs">`;
    for (const [word, needs] of nd.rows) {
        s += `<div class="xp-need"><span class="xp-need__w">${word}</span><span class="xp-need__arrow">\u2192</span>`
           + `<span class="xp-need__list">${needs.join(', ')}</span></div>`;
    }
    return s + '</div><div class="support__note">If the one on the left works, every one on the right has to as well.</div>';
}

// an indented listing: rows are [depth, word] (Hierarchy draws its tree with this)
function createExplanationLines(ln) {
    let s = `<div class="xp-head">${ln.head}</div><div class="xp-states" style="flex-direction:column;align-items:flex-start">`;
    for (const [depth, word] of ln.rows) {
        s += `<div class="xp-state is-on" style="margin-left:${depth * 24}px">`
           + `<span class="xp-state__w">${word}</span></div>`;
    }
    return s + '</div>';
}

function createExplanationRegions(rg) {
    if (!rg.rows.length) return '';
    let s = `<div class="xp-head">Which combinations exist</div><table class="xp-regions"><tr>`;
    for (const t of rg.terms) s += `<th>${t}</th>`;
    s += '</tr>';
    for (const row of rg.rows) {
        s += '<tr>';
        for (const v of row) s += `<td class="${v ? 'is-in' : 'is-out'}">${v ? '\u25CF' : '\u00B7'}</td>`;
        s += '</tr>';
    }
    return s + '</table><div class="support__note">One row per kind of thing that exists: a filled dot means it is in that category.</div>';
}

function createSupportHTML(question) {
    if (!question.support || !question.support.length) return '';
    const verb = question.syllogismNearMiss ? 'These premises give' : (question.isValid ? 'These premises make it true' : 'These premises rule it out');
    let s = `<div class="support"><div class="support__head">${verb}:</div>`;
    s += question.support.map(p => `<div class="support__premise">${p}</div>`).join('');
    if (question.syllogismNearMiss && question.supportConclusion) {
        s += `<div class="support__head">What does follow:</div><div class="support__premise">${question.supportConclusion}</div>`;
        s += `<div class="support__note">The conclusion shown is close to this but is not implied.</div>`;
    }
    s += '</div>';
    return s;
}

function createSyllogismRuleHTML(question) {
    if (question.support || !question.rule) return '';
    const valid = typeof validRules !== 'undefined' && validRules.includes(question.rule);
    const mood = question.rule.slice(0, 3).split('').map(d => 'AEIO'[+d]).join('');
    return `<div class="support"><div class="support__head">Form ${mood}-${question.rule[3]}: ${valid ? 'valid — the conclusion follows' : 'invalid — the conclusion does not follow'}</div></div>`;
}

function createMissExplanationHTML(q) {
    const answer = q.isValid ? 'TRUE' : 'FALSE';
    let s = `<div class="miss-explanation__answer">Answer: ${answer}</div>`;
    s += `<div class="miss-explanation__conclusion">${q.conclusion}</div>`;
    if (q.explainHTML) return s + q.explainHTML;
    s += createSupportHTML(q) + createSyllogismRuleHTML(q);
    let model = '';
    try { model = createExplanationModel(q) || ''; } catch (e) { model = ''; }
    if (model) {
        // the drawn models carry their own heading and are laid out with real elements, not spacing
        const own = q.states || q.weights || q.regions || q.needs || q.lines || q.modelNote || (q.subresults && q.subresults.some(r => r.title));
        s += own ? `<div class="miss-explanation__model is-drawn">${model}</div>`
                 : `<div class="support__head">Hidden arrangement:</div><pre class="miss-explanation__model">${model}</pre>`;
    }
    return s;
}

function createExplanation(question) {
    const title = question.title ? `<div class="xp-title">${question.title}</div>` : '';
    if (question.explainHTML) return title + question.explainHTML;
    return title + createSupportHTML(question) + createSyllogismRuleHTML(question) + (createExplanationModel(question) || '');
}

function createExplanationModel(question) {
    const note = question.modelNote ? `<div class="xp-head">${question.modelNote}</div>` : '';
    if (note) {
        const inner = createExplanationModel({ ...question, modelNote: null });
        return inner ? note + inner : '';
    }
    if (question.states) {
        return createExplanationStates(question.states);
    }

    if (question.lines) {
        return createExplanationLines(question.lines);
    }

    if (question.weights) {
        return createExplanationWeights(question.weights);
    }

    if (question.regions) {
        return createExplanationRegions(question.regions);
    }

    if (question.needs) {
        return createExplanationNeeds(question.needs);
    }

    if (question.bucket) {
        return createExplanationBucket(question);
    }

    if (question.buckets) {
        return createExplanationBuckets(question);
    }

    if (question.wordCoordMap) {
        const grid = createGridFromMap(question.wordCoordMap);
        if (grid && Array.isArray(grid[0]) && Array.isArray(grid[0][0]) && Array.isArray(grid[0][0][0])) {
            return createExplanation4D(grid);
        } else if (grid && Array.isArray(grid[0]) && Array.isArray(grid[0][0])) {
            return createExplanation3D(grid);
        } else {
            return createExplanation2D(grid);
        }
    }

    if (question.subresults) {
        return question.subresults.map(createExplanation).join('<div class="binary-explainer-separator"></div>');
    }
    return '';
}

function createExplanationPopup(question, e) {
    const popup = document.createElement("div");
    popup.className = "explanation-popup";
    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.zIndex = "1000";
    popup.style.padding = "20px";
    popup.style.backgroundColor = "var(--background-color)";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
    popup.style.width = "fit-content";
    popup.style.maxWidth = "98vw";
    popup.style.maxHeight = "98vh";
    popup.style.overflow = "hidden";
    popup.style.textAlign = "center";
    popup.style.pointerEvents = "none";

    const content = document.createElement("pre");
    content.innerHTML = createExplanation(question);
    popup.appendChild(content);

    document.body.appendChild(popup);
}

function removeExplanationPopup() {
    for (let i = 0; i < 5; i++) {
        let elems = document.getElementsByClassName("explanation-popup");
        if (elems.length === 0) {
            break;
        }
        for (const el of elems) {
            el.remove();
        }
    }
}

function createExplanationButton(question) {
    if (question.support || question.explainHTML || (question.category === 'Syllogism' && question.rule)) {
        return `<button class="explanation-button">Explanation</button>`;
    }
    if (question.category === 'Syllogism') {
        return '';
    }

    if (question.wordCoordMap || question.bucket || question.buckets || question.subresults
        || question.states || question.weights || question.regions || question.needs || question.lines || question.modelNote) {
        return `<button class="explanation-button">Explanation</button>`;
    }

    return ''
}


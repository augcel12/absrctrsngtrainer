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
    if (model) s += `<div class="support__head">Hidden arrangement:</div><pre class="miss-explanation__model">${model}</pre>`;
    return s;
}

function createExplanation(question) {
    if (question.explainHTML) return question.explainHTML;
    return createSupportHTML(question) + createSyllogismRuleHTML(question) + (createExplanationModel(question) || '');
}

function createExplanationModel(question) {
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

    if (question.wordCoordMap || question.bucket || question.buckets || question.subresults) {
        return `<button class="explanation-button">Explanation</button>`;
    }

    return ''
}


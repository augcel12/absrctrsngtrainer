// format-ui.js — the answer panel for generative formats. It replaces the TRUE/FALSE buttons
// when the current question has a `format`, and hands the result to submitFormatAnswer().

const FMT_PROMPT_LABEL = {
    interrogate: 'Study the arrangement',
    name: 'What is the relation?',
    missing: 'A premise is missing. Make all of these true',
    repair: 'The premises contradict each other',
};

function fmtEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtTermHTML(word) {
    return `<span class="subject">${renderJunkEmojisText(word)}</span>`;
}

// what a relation chip shows
function fmtRelChipHTML(rel) {
    return fmtEscape(rel.text.replace(/^is /, ''));
}

// Directions are picked where they point: a 3×3 pad (the middle is the second term), and for 3D one pad
// per layer — above, level, below. Faster than reading 26 labels, and there are no words to say.
function fmtDirPad(fam, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'fmt-pad';
    const layers = fam.dim === 3 ? [1, 0, -1] : [null];
    const buttons = [];
    for (const z of layers) {
        const box = document.createElement('div');
        box.className = 'fmt-pad__layer';
        if (z !== null) {
            const cap = document.createElement('div');
            cap.className = 'fmt-pad__cap';
            cap.textContent = z === 1 ? '▲ above' : z === -1 ? '▼ below' : 'level';
            box.appendChild(cap);
        }
        const grid = document.createElement('div');
        grid.className = 'fmt-pad__grid';
        for (const y of [1, 0, -1]) for (const x of [-1, 0, 1]) {
            const b = document.createElement('button');
            b.type = 'button';
            const key = z === null ? `${x},${y}` : `${x},${y},${z}`;
            if (!fam.rels.some(r => r.key === key)) {
                b.className = 'fmt-pad__mid';
                b.disabled = true;
                b.innerHTML = '<span class="fmt-pad__ring"></span>';
            } else {
                b.className = 'fmt-pad__cell';
                b.innerHTML = '<span class="fmt-pad__dot"></span>';
                b.addEventListener('click', () => {
                    buttons.forEach(o => o.classList.remove('selected'));
                    b.classList.add('selected');
                    onPick(key);
                });
                buttons.push(b);
            }
            grid.appendChild(b);
        }
        box.appendChild(grid);
        wrap.appendChild(box);
    }
    return wrap;
}

// The questions themselves. Three-way, so "I know one arrangement that fits" is not an answer:
// you have to know what every arrangement that fits agrees on.
function askInterrogate(q, panel, finish) {
    const answers = new Array(q.queries.length).fill(undefined);
    const opts = [[true, 'Must be true'], [false, "Can't be true"], [null, "Can't tell"]];
    q.queries.forEach((query, i) => {
        const row = document.createElement('div');
        row.className = 'fmt-row fmt-query';
        const claim = document.createElement('div');
        claim.className = 'fmt-query__claim';
        claim.innerHTML = renderJunkEmojisText(query.html);
        const chips = document.createElement('div');
        chips.className = 'fmt-chips';
        for (const [value, label] of opts) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fmt-chip';
            chip.textContent = label;
            chip.addEventListener('click', () => {
                chips.querySelectorAll('.fmt-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                answers[i] = value;
            });
            chips.appendChild(chip);
        }
        row.append(claim, chips);
        panel.appendChild(row);
    });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'fmt-submit';
    go.textContent = 'Submit';
    go.addEventListener('click', () => {
        if (answers.some(a => a === undefined)) return finish({ error: 'Answer every one' });
        finish(interrogateCheck(q, answers));
    });
    const row = document.createElement('div');
    row.className = 'fmt-choices';
    row.appendChild(go);
    panel.appendChild(row);
}

function renderFormatPanel(q) {
    const buttons = document.querySelector('.confirmation-buttons');
    if (!q || !q.format) {
        if (buttons) buttons.style.display = '';
        return;
    }
    if (buttons) buttons.style.display = 'none';

    const fam = fmtFamilyById(q.family);
    const panel = document.createElement('div');
    panel.className = 'fmt-panel';
    displayText.appendChild(panel);

    const state = { a: null, b: null, rel: null };
    const error = document.createElement('div');
    error.className = 'fmt-error';

    const finish = (result) => {
        if (result.error) {
            error.textContent = result.error;
            return;
        }
        error.textContent = '';
        panel.querySelectorAll('button, input').forEach(el => el.disabled = true);
        submitFormatAnswer(result.correct, result.text, result.credit, result.picks);
    };

    const chipRow = (label, items, onPick) => {
        const row = document.createElement('div');
        row.className = 'fmt-row';
        if (label) {
            const l = document.createElement('div');
            l.className = 'fmt-label';
            l.textContent = label;
            row.appendChild(l);
        }
        const chips = document.createElement('div');
        chips.className = 'fmt-chips';
        for (const item of items) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fmt-chip';
            chip.innerHTML = item.html;
            chip.addEventListener('click', () => {
                chips.querySelectorAll('.fmt-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                onPick(item.value);
                error.textContent = '';
            });
            chips.appendChild(chip);
        }
        row.appendChild(chips);
        return row;
    };

    const numberInput = (placeholder) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.placeholder = placeholder;
        input.className = 'fmt-number';
        input.addEventListener('input', () => error.textContent = '');
        return input;
    };

    const submitButton = (onClick, label = 'Submit') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fmt-submit';
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    };

    const terms = (q.words || []).map(w => ({ html: fmtTermHTML(w), value: w }));

    // Study, then the premises are taken away and the questions arrive. The clock (the same one every
    // item gets) covers the study and stops when the premises go: what is timed is building the
    // arrangement, so the number of questions never changes the time limit.
    if (q.format === 'interrogate') {
        const start = document.createElement('div');
        start.className = 'fmt-choices';
        start.appendChild(submitButton(() => {
            start.remove();
            q.hiddenAt = Date.now();
            // freeze the clock where it is (stopCountDown would refill the bar)
            timerRunning = false;
            clearTimeout(timerInstance);
            displayText.querySelectorAll('.formatted-premise, .formatted-operation, .transform-header,'
                + ' .preamble, .postamble, .formatted-conclusion').forEach(el => el.remove());
            const gone = document.createElement('div');
            gone.className = 'preamble';
            gone.textContent = 'Premises hidden';
            panel.parentNode.insertBefore(gone, panel);
            askInterrogate(q, panel, finish);
        }, 'Hide the premises'));
        panel.appendChild(start);
        panel.appendChild(error);
        return;
    }

    if (q.format === 'name') {
        if (fam.kind === 'ratio') {
            const p = numberInput('#'), qq = numberInput('#');
            const line = document.createElement('div');
            line.className = 'fmt-line';
            line.append(p, document.createRange().createContextualFragment(` ${fmtTermHTML(q.a)} balance `), qq,
                document.createRange().createContextualFragment(` ${fmtTermHTML(q.b)}`));
            panel.appendChild(line);
            const row = document.createElement('div');
            row.className = 'fmt-choices';
            row.appendChild(submitButton(() => finish(fmtCheckName(q, { a: q.a, b: q.b, p: +p.value, q: +qq.value }))));
            row.appendChild(submitButton(() => finish(fmtCheckName(q, 'cant')), "Can't tell"));
            panel.appendChild(row);
        } else if (fam.kind === 'vector') {
            const pick = v => finish(fmtCheckName(q, v === 'cant' ? 'cant' : { a: q.a, b: q.b, rel: v }));
            panel.appendChild(fmtDirPad(fam, pick));
            const row = document.createElement('div');
            row.className = 'fmt-choices';
            row.appendChild(submitButton(() => pick('cant'), "Can't tell"));
            panel.appendChild(row);
        } else {
            const items = fam.rels.map(r => ({ html: fmtRelChipHTML(r), value: r.key }));
            items.push({ html: "can't tell", value: 'cant' });
            panel.appendChild(chipRow(null, items, v => {
                const ans = v === 'cant' ? 'cant' : { a: q.a, b: q.b, rel: v, ...(q.ctx && { ctx: q.ctx }) };
                finish(fmtCheckName(q, ans));
            }));
        }
    }

    if (q.format === 'missing' || q.format === 'repair') {
        const check = { missing: fmtCheckMissing, repair: fmtCheckRepair }[q.format];
        // one row of terms, tapped in order: the first tap is the first term, the second tap the second
        const termRow = document.createElement('div');
        termRow.className = 'fmt-row';
        const termLabel = document.createElement('div');
        termLabel.className = 'fmt-label';
        termLabel.textContent = 'Terms: tap the first, then the second';
        const termChips = document.createElement('div');
        termChips.className = 'fmt-chips';
        const paint = () => termChips.querySelectorAll('.fmt-chip').forEach(c => {
            const n = c.dataset.word === state.a ? 1 : c.dataset.word === state.b ? 2 : 0;
            c.classList.toggle('selected', n > 0);
            c.dataset.order = n ? String(n) : '';
        });
        for (const t of terms) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fmt-chip fmt-chip--term';
            chip.innerHTML = t.html;
            chip.dataset.word = t.value;
            chip.addEventListener('click', () => {
                if (state.a === t.value) { state.a = state.b; state.b = null; }
                else if (state.b === t.value) state.b = null;
                else if (!state.a) state.a = t.value;
                else if (!state.b) state.b = t.value;
                else { state.a = state.b; state.b = t.value; }
                error.textContent = '';
                paint();
            });
            termChips.appendChild(chip);
        }
        termRow.append(termLabel, termChips);
        panel.appendChild(termRow);

        let pInput = null, qInput = null;
        if (fam.kind === 'ratio') {
            pInput = numberInput('#');
            qInput = numberInput('#');
            const line = document.createElement('div');
            line.className = 'fmt-line';
            line.append(pInput, document.createTextNode('× first term balance'), qInput, document.createTextNode('× second term'));
            const row = document.createElement('div');
            row.className = 'fmt-row';
            const l = document.createElement('div');
            l.className = 'fmt-label';
            l.textContent = 'Amounts';
            row.append(l, line);
            panel.appendChild(row);
        } else if (fam.kind === 'vector') {
            // where the first term sits, seen from the second (the middle of the pad)
            const row = document.createElement('div');
            row.className = 'fmt-row';
            const l = document.createElement('div');
            l.className = 'fmt-label';
            l.textContent = 'Where the first term is';
            row.append(l, fmtDirPad(fam, v => { state.rel = v; error.textContent = ''; }));
            panel.appendChild(row);
        } else {
            panel.appendChild(chipRow('Relation', fam.rels.map(r => ({ html: fmtRelChipHTML(r), value: r.key })), v => state.rel = v));
        }


        const submit = () => {
            let s;
            if (fam.kind === 'ratio') {
                s = { a: state.a, b: state.b, p: +pInput.value, q: +qInput.value };
            } else {
                if (!state.a || !state.b) return finish({ error: 'Pick both terms' });
                if (state.rel === null) return finish({ error: 'Pick a relation' });
                s = { a: state.a, b: state.b, rel: state.rel };
            }
            finish(check(q, s));
        };
        panel.querySelectorAll('input').forEach(el => el.addEventListener('keydown', e => {
            if (e.key === 'Enter') submit();
        }));
        const row = document.createElement('div');
        row.className = 'fmt-choices';
        row.appendChild(submitButton(submit));
        panel.appendChild(row);
    }

    panel.appendChild(error);
}

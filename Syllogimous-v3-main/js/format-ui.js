// format-ui.js — the answer panel for generative formats. It replaces the TRUE/FALSE buttons
// when the current question has a `format`, and hands the result to submitFormatAnswer().

const FMT_PROMPT_LABEL = {
    judge: 'Is this true?',
    name: 'What is the relation?',
    build: 'Write a premise that makes this true',
    missing: 'A premise is missing. Make all of these true',
    repair: 'The premises contradict each other',
};

function fmtEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtTermHTML(word) {
    return `<span class="subject">${renderJunkEmojisText(word)}</span>`;
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
        submitFormatAnswer(result.correct, result.text);
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

    if (q.format === 'judge') {
        const row = document.createElement('div');
        row.className = 'fmt-choices';
        for (const [key, label] of [['necessary', 'Must be true'], ['possible', 'Could be true'], ['impossible', "Can't be true"]]) {
            row.appendChild(submitButton(() => finish(fmtCheckJudge(q, key)), label));
        }
        panel.appendChild(row);
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
        } else {
            const items = fam.rels.map(r => ({ html: fmtEscape(r.text.replace(/^is /, '')), value: r.key }));
            items.push({ html: "can't tell", value: 'cant' });
            panel.appendChild(chipRow(null, items, v => {
                const ans = v === 'cant' ? 'cant' : { a: q.a, b: q.b, rel: v, ...(q.ctx && { ctx: q.ctx }) };
                finish(fmtCheckName(q, ans));
            }));
        }
    }

    if (q.format === 'build' || q.format === 'missing' || q.format === 'repair') {
        const check = { build: fmtCheckBuild, missing: fmtCheckMissing, repair: fmtCheckRepair }[q.format];
        const freeResponse = q.format !== 'build';
        panel.appendChild(chipRow('First term', terms, v => state.a = v));

        let relInput = null, pInput = null, qInput = null;
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
        } else if (freeResponse) {
            relInput = document.createElement('input');
            relInput.type = 'text';
            relInput.className = 'fmt-text';
            relInput.placeholder = 'type the relation';
            relInput.autocomplete = 'off';
            relInput.autocapitalize = 'off';
            relInput.spellcheck = false;
            relInput.addEventListener('input', () => error.textContent = '');
            const row = document.createElement('div');
            row.className = 'fmt-row';
            const l = document.createElement('div');
            l.className = 'fmt-label';
            l.textContent = 'Relation';
            row.append(l, relInput);
            panel.appendChild(row);
        } else {
            const items = fam.rels.map(r => ({ html: fmtEscape(r.text.replace(/^is /, '')), value: r.key }));
            panel.appendChild(chipRow('Relation', items, v => state.rel = v));
        }

        panel.appendChild(chipRow('Second term', terms, v => state.b = v));

        const submit = () => {
            let s;
            if (fam.kind === 'ratio') {
                s = { a: state.a, b: state.b, p: +pInput.value, q: +qInput.value };
            } else if (freeResponse) {
                if (!state.a || !state.b) return finish({ error: 'Pick both terms' });
                s = fmtParseRelation(fam, relInput.value, state.a, state.b);
                if (!s) {
                    return finish({ error: 'Not a relation for this type. Use one of: '
                        + fam.rels.map(r => r.text.replace(/^is /, '')).join(', ') });
                }
            } else {
                s = { a: state.a, b: state.b, rel: state.rel ?? undefined };
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

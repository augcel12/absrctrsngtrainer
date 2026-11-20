// minimal.js — Minimal Mode for everything. The stock Minimal Mode already turns two-term premises into
// signs (<, ⊃, =, ☍, ∝, →, the compass arrows). This carries the same idea to every other premise,
// conclusion and query: three-to-five-term forms, every relation type, and syllogisms.
//
// It is a display-time rewrite of the HTML the generators produce, so it cannot change what an item
// means: the text is tokenised (terms, relation phrases, connective text), sentence-level rules handle
// the forms whose words wrap around their terms, and every remaining relation phrase maps to a sign.
// Anything it does not recognise keeps its words rather than becoming a guess. Red still means
// inverted, exactly as with red words: a red sign reads as its opposite.

function minimalActive() { return !!savedata.minimalMode; }

// ---------------------------------------------------------------- tokens
// S = a term (kept exactly as drawn), R = a relation phrase, T = plain connective text, X = anything else
function mnSpanEnd(html, start) {
    const re = /<span\b|<\/span>/g;
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
        if (m[0] === '</span>') { depth--; if (depth === 0) return m.index + 7; }
        else depth++;
    }
    return html.length;
}
function mnElementEnd(html, start, tag) {
    const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('</')) { depth--; if (depth === 0) return m.index + tag.length + 3; }
        else depth++;
    }
    return html.length;
}
const mnText = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function mnTokens(html) {
    const out = [];
    let i = 0;
    const pushText = s => {
        for (const part of s.split(/([,:])/)) {
            const t = part.replace(/\s+/g, ' ').trim();
            if (t) out.push({ t: 'T', text: t, html: part });
        }
    };
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { pushText(html.slice(i)); break; }
        if (lt > i) pushText(html.slice(i, lt));
        const head = /^<(\w+)([^>]*)>/.exec(html.slice(lt));
        if (!head) { pushText(html.slice(lt, lt + 1)); i = lt + 1; continue; }
        const tag = head[1], attrs = head[2], cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || '';
        let end;
        if (tag === 'span') end = mnSpanEnd(html, lt);
        else if (tag === 'div' || tag === 'svg' || tag === 'i' || tag === 'b' || tag === 'em') end = mnElementEnd(html, lt, tag);
        else end = lt + head[0].length;
        const whole = html.slice(lt, end), inner = whole.slice(head[0].length, whole.lastIndexOf('<'));
        if (tag === 'span' && cls === 'subject') out.push({ t: 'S', html: whole });
        else if (tag === 'span' && cls === 'relation') {
            const neg = /^<span class="is-negated">([^<]*)<\/span>$/.exec(inner.trim());
            if (neg) out.push({ t: 'R', text: neg[1].trim(), red: true, html: whole });
            else if (/</.test(inner)) out.push({ t: 'X', html: whole });       // meta and other nested forms: left alone
            else out.push({ t: 'R', text: inner.trim(), red: false, html: whole });
        } else if (tag === 'span' && cls === 'is-negated' && !/</.test(inner)) out.push({ t: 'T', text: inner.trim(), red: true, html: whole });
        else if (tag === 'div' && cls === 'analogy-statement') out.push({ t: 'A', text: mnText(inner), red: /color:\s*red/.test(attrs), html: whole });
        // a plain container (one fact per line in the answer formats): rewrite what is inside it
        else if (tag === 'div' && cls !== 'is-connector') out.push({ t: 'X', html: head[0] + mnRewrite(inner) + '</div>', cls, text: mnText(whole) });
        else out.push({ t: 'X', html: whole, cls, text: mnText(whole) });
        i = end;
    }
    return out;
}

// ================================================================ sentence rules
// Each rule looks at the tokens from position i and, if it fits, returns [tokens used, html].
const ntIs = (tok, kind, re) => tok && tok.t === kind && (!re || re.test(tok.text));
// a list of terms: S (, S)* (and|or) S — returns the terms and the closing word
function ntList(toks, i, conj = /^(and|or)$/) {
    if (!ntIs(toks[i], 'S')) return null;
    const items = [toks[i]];
    let j = i + 1;
    while (ntIs(toks[j], 'T', /^,$/) && ntIs(toks[j + 1], 'S')) { items.push(toks[j + 1]); j += 2; }
    if (ntIs(toks[j], 'R', conj) && ntIs(toks[j + 1], 'S')) {
        items.push(toks[j + 1]);
        return { items, conj: toks[j].text, n: j + 2 - i };
    }
    return items.length > 1 ? { items, conj: null, n: j - i } : null;
}

// ---------------------------------------------------------------- output pieces
const mnEsc = s => (s === '<' ? '&lt;' : s === '>' ? '&gt;' : s);
const mnRel = (s, red) => `<span class="relation">${red ? `<span class="is-negated">${mnEsc(s)}</span>` : mnEsc(s)}</span>`;
const mnP = s => `<span class="mn-p">${s}</span>`;
const mnIs = (tok, kind, re) => tok && tok.t === kind && (!re || re.test(tok.text));
const mnCircled = n => ['⓪', '①', '②', '③', '④', '⑤', '⑥'][n] || `(${n})`;
// a list of terms: S (, S)* (and|or|nor) S
function mnList(toks, i, conj = /^(and|or)$/) {
    if (!mnIs(toks[i], 'S')) return null;
    const items = [toks[i]];
    let j = i + 1;
    while (mnIs(toks[j], 'T', /^,$/) && mnIs(toks[j + 1], 'S')) { items.push(toks[j + 1]); j += 2; }
    if (mnIs(toks[j], 'R', conj) && mnIs(toks[j + 1], 'S')) {
        items.push(toks[j + 1]);
        return { items, conj: toks[j].text, n: j + 2 - i };
    }
    return items.length > 1 ? { items, conj: null, n: j - i } : null;
}
const mnJoin = (items, sep) => items.map(s => s.html).join(sep);
const mnSet = items => mnP('{') + mnJoin(items, mnP(', ')) + mnP('}');
const mnSpan = items => mnP('(') + mnJoin(items, mnP(', ')) + mnP(')');

// the order words of the five linear wordings, read off the generators so they stay in step
let MN_ORDER = null;
function mnOrder() {
    if (MN_ORDER) return MN_ORDER;
    MN_ORDER = {};
    for (const g of [LEFT_RIGHT, TOP_UNDER, MORE_LESS, BEFORE_AFTER, CONTAINS_WITHIN]) {
        MN_ORDER[g.prev] = g.prevMin;
        MN_ORDER[g.next] = g.nextMin;
    }
    return MN_ORDER;
}

const MN_PV_DIR = {
    'ahead and to the left of': '⇖', 'ahead and to the right of': '⇗', 'behind and to the left of': '⇙', 'behind and to the right of': '⇘',
    'directly to the left of': '⇐', 'directly to the right of': '⇒', 'straight ahead of': '⇑', 'straight behind': '⇓',
};

// a relation phrase on its own -> its sign (null: unknown, keep the words)
function mnSign(text) {
    const t0 = text.trim();
    // plural / singular: "are left of" draws like "is left of", "contain" like "contains"
    const t = t0.replace(/^are (?!same as|opposite of|all |not all |never |on the |on opposite |ahead$)/, 'is ').replace(/^contain$/, 'contains')
        .replace(/^(sit|lie|move|come|overlap|do not overlap)\b/, m => ({ sit: 'sits', lie: 'lies', move: 'moves', come: 'comes', overlap: 'overlaps', 'do not overlap': 'does not overlap' })[m]);
    const ord = mnOrder();
    if (ord[t]) return ord[t];
    if (MN_PV_DIR[t.replace(/^is /, '')]) return MN_PV_DIR[t.replace(/^is /, '')];
    switch (t) {
        case 'is between': case 'comes between': return '∈';
        case 'is not between': case 'does not come between': return '∉';
        case 'is at one end': return '∉';
        case 'is not at one end': return '∈';
        case 'exactly when': return '⇔';
        case 'or': return '∨';
        case 'nor': return '∧';
        case 'and': return '∧';
        case 'either': case 'Either': case 'or both': case 'together': case 'is': return '';
        // space
        case 'is level with': return '≡';
        case 'is not level with': return '≢';
        case 'east–west': return '↔';
        case 'north–south': return '↕';
        case 'above–below': return '⇕';
        case 'in time': return '⏱';
        // same / opposite, influence
        case 'is same as': case 'are same as': case 'is the same as': return '=';
        case 'is opposite of': case 'are opposite of': return '☍';
        case 'varies directly with': case 'moves with': return '∝';
        case 'varies inversely with': case 'moves against': return '∝1/';
        case 'varies sharply and directly with': return '∝²';
        case 'varies sharply and inversely with': return '∝²1/';
        case 'increases': return '↑';
        case 'decreases': return '↓';
        case ', by a lot more': return '(≫)';
        case ', by about the same amount': return '(≈)';
        // requirement
        case 'requires': return '→';
        case 'is required by': return '←';
        // balance
        case 'balance': case 'balances': return '=';
        case 'is at': case 'is equal to': return '=';
        // ring
        case 'is the next one clockwise after': return '↻₁';
        case 'is not the next one clockwise after': return '¬↻₁';
        case 'sits directly across from': return '⌀';
        case 'does not sit directly across from': return '¬⌀';
        case 'comes before': return '≺';
        case 'comes after': return '≻';
        // hierarchy
        case 'is over': case 'is somewhere over': return '≻';
        case 'is not over': return '⊁';
        case 'is directly over': return '≻₁';
        case 'is not directly over': return '¬≻₁';
        case 'sits under': return '≺';
        case 'lies on different lines of descent': return '⊥';
        case 'lies on one line of descent': return '~';
        // intervals
        case 'is wholly before': return '≪';
        case 'is wholly after': return '≫';
        case 'overlaps the start of': return '≺∩';
        case 'overlaps the end of': return '≻∩';
        case 'lies within': return '⊂';
        case 'covers all of': return '⊃';
        case 'overlaps': return '∩';
        case 'does not overlap': return '¬∩';
        case 'overlaps neither': return '¬∩';
        // perspective
        case 'faces the same way as': return '⇈';
        case 'faces the opposite way to': return '⇅';
        case 'faces a quarter turn right of': return '↷';
        case 'faces a quarter turn left of': return '↶';
        case 'is further left than': return '⇠';
        case 'is further right than': return '⇢';
        case 'is further ahead than': return '⇡';
        case 'is further back than': return '⇣';
        case 'is on the left': case 'are on the left': return '⇐';
        case 'is ahead': case 'are ahead': return '⇑';
        case ', left to right': return '⇄';
        case ', front to back': return '⇵';
    }
    return null;
}
const mnRelTok = tok => { const s = mnSign(tok.text); return s === null ? null : s === '' ? '' : mnRel(s, tok.red); };

// ---------------------------------------------------------------- sentence rules
// Each looks at the tokens from position i and, if it fits, returns [tokens used, html].
const MN_RULES = [
    // "Under X:" — a context tag
    (toks, i) => {
        if (!(toks[i].t === 'X' && /is-connector/.test(toks[i].cls || '') && toks[i].text === 'Under' && mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'T', /^:$/))) return null;
        return [3, `${toks[i + 1].html}${mnP(':')}`];
    },
    // "From A:" — the rest is in A's frame
    (toks, i) => {
        if (!(mnIs(toks[i], 'R', /^From$/) && mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'T', /^:$/))) return null;
        return [3, `${mnP('@')}${toks[i + 1].html}${mnP(':')}`];
    },
    // "Exactly N of A, B and C ..." / "None of ..." — a count over a group
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^([Ee]xactly (\d+|one) of|[Nn]one of)$/)) return null;
        const L = mnList(toks, i + 1, /^and$/);
        if (!L) return null;
        const m = /^[Ee]xactly (\d+|one) of$/.exec(toks[i].text), n = m ? (m[1] === 'one' ? 1 : +m[1]) : 0;
        return [1 + L.n, mnRel(mnCircled(n), toks[i].red) + mnSet(L.items)];
    },
    // "Among A, B, C and D, A is at one end" — A lies outside the span of the others
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^Among$/)) return null;
        const L = mnList(toks, i + 1, /^and$/);
        if (!L) return null;
        const j = i + 1 + L.n;
        if (!(mnIs(toks[j], 'T', /^,$/) && mnIs(toks[j + 1], 'S') && mnIs(toks[j + 2], 'R', /^is (not )?at one end$/))) return null;
        const piv = toks[j + 1], rest = L.items.filter(s => s.html !== piv.html);
        return [j + 3 - i, `${piv.html} ${mnRelTok(toks[j + 2])} ${mnSpan(rest)}`];
    },
    // "A is between B and C" (any family: order, space, perspective, intervals' "comes between")
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^(is|are|comes?|does not come) (not )?between$|^(is|are) not between$/)) return null;
        if (!(mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^and$/) && mnIs(toks[i + 3], 'S'))) return null;
        return [4, `${mnRelTok(toks[i])} ${mnSpan([toks[i + 1], toks[i + 3]])}`];
    },
    // "A is the same way from B as C is from D"
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^is the (same|opposite) way from$/)) return null;
        if (!(mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^as$/) && mnIs(toks[i + 3], 'S') && mnIs(toks[i + 4], 'R', /^is from$/) && mnIs(toks[i + 5], 'S'))) return null;
        return [6, `${mnP('·')}${toks[i + 1].html} ${mnRel(/same/.test(toks[i].text) ? '⇉' : '⇄', toks[i].red)} ${toks[i + 3].html}${mnP('·')}${toks[i + 5].html}`];
    },
    // "Going clockwise from A, B comes before C"
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^Going clockwise from$/)) return null;
        if (!(mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'T', /^,$/) && mnIs(toks[i + 3], 'S') && mnIs(toks[i + 4], 'R', /^comes (before|after)$/) && mnIs(toks[i + 5], 'S'))) return null;
        return [6, `${toks[i + 1].html}${mnP('↻')} ${toks[i + 3].html} ${mnRelTok(toks[i + 4])} ${toks[i + 5].html}`];
    },
    // "It is the same number of steps clockwise from A to B as from C to D"
    (toks, i) => {
        const t = toks;
        if (!(mnIs(t[i], 'R', /^It is$/) && mnIs(t[i + 1], 'R', /number of steps$/) && mnIs(t[i + 2], 'R', /^clockwise from$/))) return null;
        if (!(mnIs(t[i + 3], 'S') && mnIs(t[i + 4], 'R', /^to$/) && mnIs(t[i + 5], 'S') && mnIs(t[i + 6], 'R', /^as from$/) && mnIs(t[i + 7], 'S') && mnIs(t[i + 8], 'R', /^to$/) && mnIs(t[i + 9], 'S'))) return null;
        const same = /^the same/.test(t[i + 1].text);
        return [10, `${t[i + 3].html}${mnP('↻')}${t[i + 5].html} ${mnRel(same ? '=' : '≠', t[i + 1].red)} ${t[i + 7].html}${mnP('↻')}${t[i + 9].html}`];
    },
    // "... lies on / off the clockwise way from C round to D"
    (toks, i) => {
        if (!(mnIs(toks[i], 'R', /^lies? (on|off)$/) && mnIs(toks[i + 1], 'R', /^the clockwise way from$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^round to$/) && mnIs(toks[i + 4], 'S'))) return null;
        return [5, `${mnRel(/ on$/.test(toks[i].text) ? '∈' : '∉', toks[i].red)} ${toks[i + 2].html}${mnP('↻')}${toks[i + 4].html}`];
    },
    // "A sits closer to B than to C"
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'R', /^sits closer to$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^than to$/) && mnIs(toks[i + 4], 'S'))) return null;
        const a = toks[i].html;
        return [5, `${mnP('|')}${a}${toks[i + 2].html}${mnP('|')} ${mnRel('<', toks[i + 1].red)} ${mnP('|')}${a}${toks[i + 4].html}${mnP('|')}`];
    },
    // "A is the lowest one over both B and C" — the least one above both
    (toks, i) => {
        if (!(mnIs(toks[i], 'R', /^is (not )?the lowest one over both$/) && mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^and$/) && mnIs(toks[i + 3], 'S'))) return null;
        const not = /not/.test(toks[i].text);
        return [4, `${mnRel(not ? '≠' : '=', toks[i].red)} ${mnP('⊔(')}${toks[i + 1].html}${mnP(', ')}${toks[i + 3].html}${mnP(')')}`];
    },
    // "A starts before B starts" / "A ends after B ends": ⊢ marks a start, ⊣ an end
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'R', /^(starts|ends) (before|after)$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^(starts|ends)$/))) return null;
        const start = /^starts/.test(toks[i + 1].text), before = /before$/.test(toks[i + 1].text);
        const mark = s => start ? mnP('⊢') + s.html : s.html + mnP('⊣');
        return [4, `${mark(toks[i])} ${mnRel(before ? '<' : '>', toks[i + 1].red)} ${mark(toks[i + 2])}`];
    },
    // "A, B and C are never all going at once" — no moment common to all
    (toks, i) => {
        const L = mnList(toks, i, /^and$/);
        if (!L || !mnIs(toks[i + L.n], 'R', /^are (never all going at once|all going at some moment)$/)) return null;
        const r = toks[i + L.n], never = /never/.test(r.text);
        return [L.n + 1, `${mnJoin(L.items, mnP(' ∩ '))} ${mnRel(never ? '=' : '≠', r.red)} ${mnP('∅')}`];
    },
    // "From A: B and C are on the same side / on opposite sides" — the bar is A's own forward line
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'R', /^and$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^are on (the same side|opposite sides)$/))) return null;
        const same = /same/.test(toks[i + 3].text), bar = mnRel('┃', toks[i + 3].red);
        return [4, same ? `${toks[i].html} ${toks[i + 2].html} ${bar}` : `${toks[i].html} ${bar} ${toks[i + 2].html}`];
    },
    // "A and B overlap / do not overlap"
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'R', /^and$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^(overlap|do not overlap)$/))) return null;
        return [4, `${toks[i].html} ${mnRelTok(toks[i + 3])} ${toks[i + 2].html}`];
    },
    // "A requires B, C or D"
    (toks, i) => {
        if (!mnIs(toks[i], 'R', /^(requires|is required by)$/)) return null;
        const L = mnList(toks, i + 1, /^or$/);
        if (L && L.conj === 'or') return [1 + L.n, `${mnRelTok(toks[i])} ${mnJoin(L.items, mnP(' ∨ '))}`];
        return null;
    },
    // "If A and B both work, C or D must work"; "If A works and B fails, ..."; "If A fails, then B must fail";
    // influence: "If A increases, B decreases[, by a lot more]"
    (toks, i) => {
        if (!mnIs(toks[i], 'T', /^If$/)) return null;
        let j = i + 1, lhs;
        const L = mnList(toks, j, /^and$/);
        if (L && mnIs(toks[j + L.n], 'R', /^(both|all) work$/)) {
            lhs = mnJoin(L.items, mnRel('∧', toks[j + L.n].red));
            j += L.n + 1;
        } else if (mnIs(toks[j], 'S') && mnIs(toks[j + 1], 'R', /^(works|fails)$/)) {
            const lit = (s, r) => (r.text === 'fails' ? mnRel('¬', r.red) : (r.red ? mnRel('¬', true) : '')) + s.html;
            lhs = lit(toks[j], toks[j + 1]);
            j += 2;
            if (mnIs(toks[j], 'R', /^and$/) && mnIs(toks[j + 1], 'S') && mnIs(toks[j + 2], 'R', /^(works|fails)$/)) {
                lhs += mnP(' ∧ ') + lit(toks[j + 1], toks[j + 2]);
                j += 3;
            }
        } else if (mnIs(toks[j], 'S') && mnIs(toks[j + 1], 'R', /^(increases|decreases)$/)) {
            const a = toks[j], av = toks[j + 1];
            j += 2;
            if (!(mnIs(toks[j], 'T', /^,$/) && mnIs(toks[j + 1], 'S') && mnIs(toks[j + 2], 'R', /^(increases|decreases)$/))) return null;
            let out = `${a.html}${mnRelTok(av)} ${mnP('⇒')} ${toks[j + 1].html}${mnRelTok(toks[j + 2])}`;
            j += 3;
            if (mnIs(toks[j], 'R', /^, by /)) { out += ' ' + mnRelTok(toks[j]); j++; }
            return [j - i, out];
        } else return null;
        if (!mnIs(toks[j], 'T', /^,$/)) return null;
        j++;
        if (mnIs(toks[j], 'T', /^then$/)) j++;
        let rhs;
        const R = mnList(toks, j, /^or$/);
        if (R && R.conj === 'or') { rhs = mnJoin(R.items, mnP(' ∨ ')); j += R.n; }
        else if (mnIs(toks[j], 'S')) { rhs = toks[j].html; j++; }
        else return null;
        if (!mnIs(toks[j], 'R', /^must (work|fail)$/)) return null;
        if (/fail/.test(toks[j].text)) rhs = mnRel('¬', toks[j].red) + rhs;
        else if (toks[j].red) rhs = mnRel('¬', true) + rhs;
        return [j + 1 - i, `${lhs} ${mnRel('→')} ${rhs}`];
    },
    // "A, B and C (do not) all work"
    (toks, i) => {
        const L = mnList(toks, i, /^and$/);
        if (!L || !mnIs(toks[i + L.n], 'R', /^(do not )?all work$/)) return null;
        const r = toks[i + L.n], not = /not/.test(r.text);
        return [L.n + 1, `${not ? mnRel('¬', r.red) : (r.red ? mnRel('¬', true) : '')}${mnP('(')}${mnJoin(L.items, mnP(' ∧ '))}${mnP(')')}`];
    },
    // whole-group statements written as a chain: A = B = C, A ∝ B ∝ C, A ~ B ~ C (¬( ) when not all)
    (toks, i) => {
        const L = mnList(toks, i, /^and$/);
        if (!L) return null;
        const r = toks[i + L.n];
        if (!mnIs(r, 'R', /^(are (not )?all the same|(do not )?all move the same way|(do not )?all lie on one line of descent|lie on (different lines|one line) of descent)$/)) return null;
        const sign = /same$/.test(r.text) ? '=' : /move/.test(r.text) ? '∝' : /different/.test(r.text) ? '⊥' : '~';
        const not = /not/.test(r.text);
        const chain = mnJoin(L.items, ' ' + mnRel(sign, r.red && !not) + ' ');
        return [L.n + 1, not ? `${mnRel('¬', r.red)}${mnP('(')}${chain}${mnP(')')}` : chain];
    },
    // "A is left of B or C", "A overlaps B or C", "A lies within B or C": relation, then "B or C"
    (toks, i) => {
        if (!mnIs(toks[i], 'R') || !(mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^(or|nor)$/) && mnIs(toks[i + 3], 'S'))) return null;
        const sign = mnRelTok(toks[i]);
        if (!sign) return null;
        return [4, `${sign} ${toks[i + 1].html}${mnP(toks[i + 2].text === 'nor' ? ' ∧ ' : ' ∨ ')}${toks[i + 3].html}`];
    },
    // "A is right of both B and C"
    (toks, i) => {
        if (!mnIs(toks[i], 'R', / both$/) || !(mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^and$/) && mnIs(toks[i + 3], 'S'))) return null;
        const s = mnSign(toks[i].text.replace(/ both$/, ''));
        if (!s) return null;
        return [4, `${mnRel(s, toks[i].red)} ${toks[i + 1].html}${mnP(' ∧ ')}${toks[i + 3].html}`];
    },
    // Difference: "A is 3 more than B", "A and B together are 4 more than C", "A equals B and C"
    (toks, i) => {
        const side = j => { const L = mnList(toks, j, /^and$/); return L ? { items: L.items, n: L.n } : mnIs(toks[j], 'S') ? { items: [toks[j]], n: 1 } : null; };
        const A = side(i);
        if (!A) return null;
        let j = i + A.n;
        if (mnIs(toks[j], 'R', /^together$/)) j++;
        const r = toks[j];
        if (!mnIs(r, 'R', /^((is|are) \d+ (more|less) than|equals?|(does|do) not equal)$/)) return null;
        const B = side(j + 1);
        if (!B) return null;
        const sum = s => mnJoin(s.items, mnP(' + '));
        const m = /(\d+) (more|less)/.exec(r.text);
        if (m) return [j + 1 + B.n - i, `${sum(A)} ${mnP('=')} ${sum(B)} ${mnRel((m[2] === 'more' ? '+ ' : '− ') + m[1], r.red)}`];
        return [j + 1 + B.n - i, `${sum(A)} ${mnRel(/not/.test(r.text) ? '≠' : '=', r.red)} ${sum(B)}`];
    },
    // Difference: "A is halfway between B and C"
    (toks, i) => {
        if (!(mnIs(toks[i], 'R', /^is (not )?halfway between$/) && mnIs(toks[i + 1], 'S') && mnIs(toks[i + 2], 'R', /^and$/) && mnIs(toks[i + 3], 'S'))) return null;
        return [4, `${mnRel(/not/.test(toks[i].text) ? '≠' : '=', toks[i].red)} ${mnP('½(')}${toks[i + 1].html}${mnP(' + ')}${toks[i + 3].html}${mnP(')')}`];
    },
    // Difference: "A is as much more than B as C is more than D"
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'R', /^is as much (more|less) than$/) && mnIs(toks[i + 2], 'S') && mnIs(toks[i + 3], 'R', /^as$/)
            && mnIs(toks[i + 4], 'S') && mnIs(toks[i + 5], 'R', /^is more than$/) && mnIs(toks[i + 6], 'S'))) return null;
        const more = /more than$/.test(toks[i + 1].text);
        const [a, b] = more ? [toks[i], toks[i + 2]] : [toks[i + 2], toks[i]];
        return [7, `${a.html} ${mnRel('−', toks[i + 1].red)} ${b.html} ${mnP('=')} ${toks[i + 4].html} ${mnP('−')} ${toks[i + 6].html} ${mnP('&gt; 0')}`];
    },
    // balance: "1 A and 2 B balance 3 C" — numbers stay, "and" adds, "balance" is =
    (toks, i) => {
        if (!(mnIs(toks[i], 'R', /^\d+$/) && mnIs(toks[i + 1], 'S'))) return null;
        let j = i, out = '';
        while (mnIs(toks[j], 'R', /^\d+$/) && mnIs(toks[j + 1], 'S')) {
            out += `${toks[j].text === '1' ? '' : mnP(toks[j].text)}${toks[j + 1].html} `;
            j += 2;
            if (mnIs(toks[j], 'R', /^and$/) && mnIs(toks[j + 1], 'R', /^\d+$/)) { out += mnP('+') + ' '; j++; continue; }
            if (mnIs(toks[j], 'R', /^balances?$/)) { out += mnRel('=', toks[j].red) + ' '; j++; continue; }
            break;
        }
        return [j - i, out];
    },
    // syllogism: All X is Y -> X ⊆ Y; No -> X ∩ Y = ∅; Some -> X ∩ Y ≠ ∅; Some ... is not -> X ⊄ Y
    (toks, i) => {
        const q = toks[i];
        if (!mnIs(q, 'T', /^(All|No|Some)$/)) return null;
        let j = i + 1;
        if (!mnIs(toks[j], 'S')) return null;
        const subj = [toks[j]];
        j++;
        if (mnIs(toks[j], 'R', /^that is$/)) {
            j++;
            while (mnIs(toks[j], 'S')) { subj.push(toks[j]); j++; if (mnIs(toks[j], 'R', /^and$/)) j++; else break; }
        }
        const cop = toks[j];
        if (!mnIs(cop, 'T', /^is( not| neither)?$/)) return null;
        j++;
        if (mnIs(toks[j], 'T', /^neither$/)) j++;
        if (!mnIs(toks[j], 'S')) return null;
        const obj = [toks[j]];
        j++;
        while (mnIs(toks[j], 'R', /^(or|nor)$/) && mnIs(toks[j + 1], 'S')) { obj.push(toks[j + 1]); j += 2; }
        const not = /not|neither/.test(cop.text) || mnIs(toks[i + 1 + (subj.length > 1 ? subj.length * 2 : 1)], 'T', /^neither$/);
        const red = q.red || cop.red;
        const grp = (list, op) => list.length > 1 ? mnP('(') + mnJoin(list, mnP(op)) + mnP(')') : list[0].html;
        const S = grp(subj, ' ∩ '), O = grp(obj, ' ∪ ');
        if (q.text === 'All') return [j - i, `${S} ${mnRel('⊆', red)} ${O}`];
        // red inverts the whole claim (red "No" reads as "All"), so the emptiness part is red with it
        if (q.text === 'No') return [j - i, `${S} ${mnRel('∩', red)} ${O} ${mnRel('= ∅', red)}`];
        return [j - i, not ? `${S} ${mnRel('⊄', red)} ${O}` : `${S} ${mnRel('∩', red)} ${O} ${mnRel('≠ ∅', red)}`];
    },
    // analogy: "A to B  has the same relation as  C to D"
    (toks, i) => {
        if (!(mnIs(toks[i], 'S') && mnIs(toks[i + 1], 'T', /^to$/) && mnIs(toks[i + 2], 'S') && toks[i + 3] && toks[i + 3].t === 'A'
            && mnIs(toks[i + 4], 'S') && mnIs(toks[i + 5], 'T', /^to$/) && mnIs(toks[i + 6], 'S'))) return null;
        const same = /same/.test(toks[i + 3].text);
        return [7, `${toks[i].html}${mnP(':')}${toks[i + 2].html} ${mnRel(same ? '∷' : '≁', toks[i + 3].red)} ${toks[i + 4].html}${mnP(':')}${toks[i + 6].html}`];
    },
];

function mnRewrite(html) {
    const toks = mnTokens(html);
    let out = '';
    for (let i = 0; i < toks.length;) {
        let hit = null;
        for (const rule of MN_RULES) { hit = rule(toks, i); if (hit) break; }
        if (hit) { out += ' ' + hit[1] + ' '; i += hit[0]; continue; }
        const tk = toks[i];
        if (tk.t === 'R') {
            const s = mnRelTok(tk);
            out += s === null ? ' ' + tk.html + ' ' : ' ' + s + ' ';
        } else if (tk.t === 'T') {
            // a comma before "or" / "or both" belongs to the words
            if (tk.text === ',' && mnIs(toks[i + 1], 'R', /^or( both)?$/)) { i++; continue; }
            out += tk.text === ',' || tk.text === ':' ? tk.html : ' ' + tk.html + ' ';
        } else out += tk.html;
        i++;
    }
    return out.replace(/\s+/g, ' ').trim();
}

// the entry point: leaves drawn pictures and anything it cannot read alone
function minimalize(html) {
    if (!minimalActive() || typeof html !== 'string' || !html || /class="pic"/.test(html)) return html;
    try {
        const out = mnRewrite(html);
        const t = mnTokens(out).filter(x => !(x.t === 'T' && !x.text));
        // "term sign term" keeps Minimal Mode's three-column layout; anything longer is one centred line
        const simple = t.length === 3 && t[0].t === 'S' && t[1].t === 'R' && t[2].t === 'S';
        // the order signs are the stock [svg] arrows, drawn by the same pass as the stimuli
        return renderJunkEmojisText(simple ? out : `<span class="mn-line">${out}</span>`);
    } catch (e) { return html; }
}

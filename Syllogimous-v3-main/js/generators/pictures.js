// pictures.js — the "Pictures" setting: every premise is drawn as the arrangements it allows, with the
// terms themselves placed in them. Nothing is decoded: "A is left of B" is A and B in a row, "A is between
// B and C" is the two rows it allows, side by side.
//
// The whole vocabulary:
//   a row of terms         their order along the line the relation lives on (left–right, top–bottom,
//                          steps that rise for "more", an arrow under it for time, boxes inside boxes
//                          for "contains"; compass rows carry their two ends)
//   terms stacked in a slot   level with each other on that line
//   a dashed box           these, in any order
//   a number on a dashed box  exactly that many of these are here
//   panels side by side    any one of these
//   a crossed panel        this can't happen
//   a 3×3 grid             where the first term is, seen from the second in the middle
//   two halves             same side = same; other side = opposite (for Influence: moves the same way /
//                          the other way)
//   two equal arrows       the way from one term to the next is the same in both
//
// Facts carry a plain description (`pic`) of what they allow; this file only draws it. A fact without
// one keeps its words.

function picturesActive() { return !!savedata.enablePictures; }

const PIC_AXIS = {
    Horizontal: { cls: 'h' },
    Vertical: { cls: 'v' },
    Comparison: { cls: 'c' },
    Temporal: { cls: 't' },
    Contains: { cls: 'n' },
    // space axes: m grows east / north / up / later. North and up are drawn at the top.
    e0: { cls: 'h', ends: ['W', 'E'] },
    e1: { cls: 'v', rev: true, ends: ['N', 'S'] },
    e2: { cls: 'v', rev: true, ends: ['▲', '▼'] },
    e3: { cls: 't' },
};

function picChip(W, i) { return `<span class="pic-t">${W[i]}</span>`; }

function picSlot(W, s) {
    if (typeof s === 'number') return picChip(W, s);
    if (s.tie) return `<span class="pic-tie">${s.tie.map(i => picChip(W, i)).join('')}</span>`;
    const badge = s.n != null ? `<span class="pic-n">${s.n}</span>` : '';
    return `<span class="pic-g">${s.g.map(i => picChip(W, i)).join('')}${badge}</span>`;
}

function picRow(d, W, ctx) {
    const ax = PIC_AXIS[d.ax || ctx.axis] || PIC_AXIS.Horizontal;
    let slots = d.s.slice();
    if (ax.rev) slots.reverse();
    if (ax.cls === 'n') {
        // boxes inside boxes: the first slot is the outermost
        let inner = '';
        for (let i = slots.length - 1; i >= 0; i--) inner = `<span class="pic-nest">${picSlot(W, slots[i])}${inner}</span>`;
        return `<span class="pic-row pic-row--n">${inner}</span>`;
    }
    let body;
    if (ax.cls === 'c') {
        body = slots.map((s, i) => `<span class="pic-step">${picSlot(W, s)}<span class="pic-bar" style="height:${(0.45 + 0.55 * i).toFixed(2)}em"></span></span>`).join('');
    } else {
        body = slots.map(s => picSlot(W, s)).join('');
    }
    const end = e => `<span class="pic-end">${e}</span>`;
    if (ax.ends) body = end(ax.ends[0]) + body + end(ax.ends[1]);
    return `<span class="pic-row pic-row--${ax.cls}">${body}</span>`;
}

// where x is, seen from y in the middle; s = [east, north, up, later] signs (3D/4D add the last two)
function picCompass(d, W) {
    const [sx, sy, sz = 0, st = 0] = d.s;
    const badge = (sz ? `<span class="pic-z">${sz > 0 ? '▲' : '▼'}</span>` : '')
        + (st ? `<span class="pic-z">${st > 0 ? '⏩' : '⏪'}</span>` : '');
    let cells = '';
    for (const gy of [1, 0, -1]) for (const gx of [-1, 0, 1]) {
        let inner = '';
        if (gx === 0 && gy === 0) inner += `<span class="pic-t pic-t--ref">${W[d.y]}</span>`;
        if (gx === sx && gy === sy) inner += `<span class="pic-t">${W[d.x]}${badge}</span>`;
        cells += `<span class="pic-cell${inner ? '' : ' is-empty'}">${inner}</span>`;
    }
    return `<span class="pic-cmp">${cells}</span>`;
}

function picSides(d, W, ctx) {
    const inf = ctx.sides === 'influence';
    const cap = (up) => inf ? `<span class="pic-side__cap">${up ? '▲' : '▼'}</span>` : '';
    const half = (slots, b) => `<span class="pic-side${b ? ' pic-side--b' : ''}">${cap(!b)}${slots.map(s => picSlot(W, s)).join('') || '<span class="pic-side__empty"></span>'}</span>`;
    return `<span class="pic-sides">${half(d.a, false)}${half(d.b, true)}</span>`;
}

function picWay(d, W) {
    const arrow = ([p, q]) => `<span class="pic-arrow">${picChip(W, p)}<span class="pic-arrow__shaft"></span>${picChip(W, q)}</span>`;
    return `<span class="pic-way">${arrow(d.a)}${arrow(d.b)}</span>`;
}

function picDraw(d, W, ctx) {
    switch (d.k) {
        case 'row': return picRow(d, W, ctx);
        case 'cmp': return picCompass(d, W);
        case 'sides': return picSides(d, W, ctx);
        case 'way': return picWay(d, W);
        case 'and': return `<span class="pic-and">${d.p.map(x => picDraw(x, W, ctx)).join('')}</span>`;
        case 'not': return `<span class="pic-p pic-x">${picDraw(d.p, W, ctx)}</span>`;
        case 'alt': return `<span class="pic-alts">${d.p.map(x => `<span class="pic-p">${picDraw(x, W, ctx)}</span>`).join('<span class="pic-or"></span>')}</span>`;
    }
    return '';
}

// a whole premise or conclusion
function picHTML(d, W, ctx) {
    const body = picDraw(d, W, ctx || {});
    return `<span class="pic">${d.k === 'alt' || d.k === 'not' ? body : `<span class="pic-p">${body}</span>`}</span>`;
}

// small builders the families use
const picR = (s, ax) => (ax != null ? { k: 'row', s, ax } : { k: 'row', s });
const picAlt = (...p) => ({ k: 'alt', p });
const picAnd = (...p) => ({ k: 'and', p });
const picNot = p => ({ k: 'not', p });
const picSd = (x, y, same) => ({ k: 'sides', a: same ? [x, y] : [x], b: same ? [] : [y] });

// notation.js — the "Symbol relations" setting: every relation is drawn as a small picture of itself.
//
// One rule carries the whole notation: inside a sign, the FILLED dot is the term written just before
// the sign and the HOLLOW dot(s) are the term(s) after it. So  A ●○ B  is "A is left of B", A ○●○ B, C is
// "A is between B and C", and on the compass grid the filled dot sits where A is, seen from B in the
// middle. Nothing has to be learned by heart: each sign shows the arrangement it states.
//
// The rest of the vocabulary is ordinary logic and set notation (⇔ exactly when, ⇒ requires, ∨ at least
// one, ∧ both, ¬ fails, ∩ ∪ for categories) and a circled number for "exactly N of". A RED sign is
// inverted, exactly as red words are; a slash through a sign means "not".
//
// This is a display-time rewrite of the same HTML the generators produce, so it can't change what an
// item means: the premise is tokenised (terms, relation phrases, connective text), a handful of
// sentence-level rules handle the forms whose words wrap around their terms, and every other relation
// phrase maps to its sign. Anything it doesn't recognise keeps its words rather than becoming a guess.

// ================================================================ drawing
const NT_EM = 1.45;
function ntSvg(w, body, cls = '', em = NT_EM) {
    return `<span class="rs${cls ? ' ' + cls : ''}"><svg viewBox="0 0 ${w} 20" width="${(w / 20 * em).toFixed(3)}em" height="${em}em" aria-hidden="true">${body}</svg></span>`;
}
const ntF = (x, y, r = 3.1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
const ntH = (x, y, r = 3.1) => `<circle cx="${x}" cy="${y}" r="${(r - 0.7).toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
const ntFaint = (x, y) => `<circle cx="${x}" cy="${y}" r="0.9" fill="currentColor" opacity=".35"/>`;
const ntLine = (x1, y1, x2, y2, w = 1.4, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const ntDots = (x1, y1, x2, y2) => ntLine(x1, y1, x2, y2, 1.4, 'stroke-dasharray="0.1 2.6"');
const ntHeadR = (x, y) => `<path d="M${x - 3.2} ${y - 3} L${x} ${y} L${x - 3.2} ${y + 3}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const ntHeadL = (x, y) => `<path d="M${x + 3.2} ${y - 3} L${x} ${y} L${x + 3.2} ${y + 3}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const ntHeadU = (x, y) => `<path d="M${x - 3} ${y + 3.2} L${x} ${y} L${x + 3} ${y + 3.2}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const ntHeadD = (x, y) => `<path d="M${x - 3} ${y - 3.2} L${x} ${y} L${x + 3} ${y - 3.2}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const ntSlash = w => ntLine(1.5, 18.5, w - 1.5, 1.5, 1.8);
// a disc with its left (L) or right (R) half filled: the two states of same / opposite
const ntHalf = (x, y, side) => `<circle cx="${x}" cy="${y}" r="4.3" fill="none" stroke="currentColor" stroke-width="1.3"/>`
    + `<path d="M${x} ${y - 4.3} A4.3 4.3 0 0 ${side === 'L' ? 0 : 1} ${x} ${y + 4.3} Z" fill="currentColor"/>`;
const ntUp = (x, y1 = 16, y2 = 4) => ntLine(x, y1, x, y2 + 0.4) + ntHeadU(x, y2);
const ntDown = (x, y1 = 4, y2 = 16) => ntLine(x, y1, x, y2 - 0.4) + ntHeadD(x, y2);
const ntBolt = x => `<path d="M${x + 2.5} 3 L${x} 10.5 L${x + 3} 10.5 L${x + 0.5} 17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
// a clockwise arc round a faint ring, arrow at the end
const ntCwArc = (cx, cy, r, a0, a1) => {
    const p = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1), large = ((a1 - a0 + 360) % 360) > 180 ? 1 : 0;
    const t = (a1 + 90) * Math.PI / 180, hx = x1, hy = y1;
    const back = ang => [hx - 3.2 * Math.cos(t + ang), hy - 3.2 * Math.sin(t + ang)];
    const [bx1, by1] = back(0.6), [bx2, by2] = back(-0.6);
    return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
        + `<path d="M${bx1.toFixed(2)} ${by1.toFixed(2)} L${hx.toFixed(2)} ${hy.toFixed(2)} L${bx2.toFixed(2)} ${by2.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
};

// the order frames: each wording gets its own picture of "first / second"
const NT_ORDER = {
    left: () => [22, ntF(6, 10) + ntH(16, 10)],
    right: () => [22, ntH(6, 10) + ntF(16, 10)],
    top: () => [12, ntF(6, 4.5) + ntH(6, 15.5)],
    under: () => [12, ntH(6, 4.5) + ntF(6, 15.5)],
    more: () => [18, `<rect x="2.5" y="2.5" width="5" height="15" fill="currentColor"/><rect x="11" y="10.7" width="4.6" height="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/>`],
    less: () => [18, `<rect x="2.5" y="10.5" width="5" height="7" fill="currentColor"/><rect x="11" y="3" width="4.6" height="14.3" fill="none" stroke="currentColor" stroke-width="1.4"/>`],
    before: () => [28, ntF(4, 10) + ntLine(8.5, 10, 19.5, 10) + ntHeadR(20, 10) + ntH(24.5, 10)],
    after: () => [28, ntH(4, 10) + ntLine(8.5, 10, 19.5, 10) + ntHeadR(20, 10) + ntF(24.5, 10)],
    contains: () => [20, `<circle cx="10" cy="10" r="8.3" fill="currentColor" opacity=".28"/><circle cx="10" cy="10" r="8.3" fill="none" stroke="currentColor" stroke-width="1.8"/>` + ntH(10, 10, 3.2)],
    within: () => [20, `<circle cx="10" cy="10" r="8.3" fill="none" stroke="currentColor" stroke-width="1.3"/>` + ntF(10, 10, 3)],
};
// "... both": the filled term against two hollow ones
const NT_BOTH = {
    right: () => [30, ntH(5, 10) + ntH(14, 10) + ntF(25, 10)],
    left: () => [30, ntF(5, 10) + ntH(16, 10) + ntH(25, 10)],
    under: () => [20, ntH(5, 4.5) + ntH(15, 4.5) + ntF(10, 15.5)],
    top: () => [20, ntF(10, 4.5) + ntH(5, 15.5) + ntH(15, 15.5)],
    more: () => [26, `<rect x="2.5" y="2.5" width="5" height="15" fill="currentColor"/><rect x="11" y="10.7" width="4.6" height="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="19" y="10.7" width="4.6" height="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/>`],
    less: () => [26, `<rect x="2.5" y="10.5" width="5" height="7" fill="currentColor"/><rect x="11" y="3" width="4.6" height="14.3" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="19" y="3" width="4.6" height="14.3" fill="none" stroke="currentColor" stroke-width="1.4"/>`],
    after: () => [36, ntH(4, 10) + ntH(12, 10) + ntLine(16.5, 10, 27.5, 10) + ntHeadR(28, 10) + ntF(32.5, 10)],
    before: () => [36, ntF(4, 10) + ntLine(8.5, 10, 19.5, 10) + ntHeadR(20, 10) + ntH(24.5, 10) + ntH(32.5, 10)],
    within: () => [28, `<circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="18" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.3"/>` + ntF(14, 10, 2.6)],
    contains: () => [28, `<circle cx="14" cy="10" r="9" fill="currentColor" opacity=".28"/><circle cx="14" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>` + ntH(10, 10, 2.8) + ntH(18, 10, 2.8)],
};
const NT_ORDER_WORDS = {
    'is left of': 'left', 'is right of': 'right', 'is on top of': 'top', 'is under': 'under',
    'is more than': 'more', 'is less than': 'less', 'is before': 'before', 'is after': 'after',
    'contains': 'contains', 'is within': 'within',
};

// compass: B is the hollow dot in the middle, the filled dot is where A is. Up/down and time get their
// own little tracks beside it, drawn only when the premise says something about them.
function ntDirIcon(v) {
    const [x, y, z = 0, t = 0] = v;
    let body = '';
    for (const gx of [-1, 0, 1]) for (const gy of [-1, 0, 1]) if (gx || gy) if (gx !== x || gy !== y) body += ntFaint(10 + 6.6 * gx, 10 - 6.6 * gy);
    body += ntH(10, 10, 2.8);
    body += (x || y) ? ntF(10 + 6.6 * x, 10 - 6.6 * y, 2.8) : ntF(10, 10, 1.4);
    let w = 20;
    if (z) {
        body += ntLine(w + 4, 2.5, w + 4, 17.5, 1, 'opacity=".45"') + ntH(w + 4, 10, 2.2) + ntF(w + 4, 10 - 6.6 * z, 2.5);
        w += 8;
    }
    if (t) {
        body += ntLine(w + 2, 10, w + 14, 10, 1, 'opacity=".45"');
        for (const tx of [w + 2, w + 8, w + 14]) body += ntLine(tx, 7.5, tx, 12.5, 1, 'opacity=".45"');
        body += ntF(w + 8 + 6 * t, 10, 2.5);
        w += 16;
    }
    return [w, body];
}
function ntParseDir(text) {
    const same = /^(is|was|will be) at the same place as$/.exec(text);
    if (same) return [0, 0, 0, same[1] === 'will be' ? 1 : same[1] === 'was' ? -1 : 0];
    const m = /^(is|was|will be) (?:(Above|Below)(?: and )?)?(North|South)?-?(East|West)? ?of$/.exec(text);
    if (!m || (!m[2] && !m[3] && !m[4])) return null;
    return [m[4] === 'East' ? 1 : m[4] === 'West' ? -1 : 0, m[3] === 'North' ? 1 : m[3] === 'South' ? -1 : 0,
        m[2] === 'Above' ? 1 : m[2] === 'Below' ? -1 : 0, m[1] === 'will be' ? 1 : m[1] === 'was' ? -1 : 0];
}

const NT_ICONS = {
    between: () => [26, ntH(4, 10) + ntF(13, 10) + ntH(22, 10)],
    end: () => [34, ntF(4, 10) + ntH(12.5, 10) + ntH(21, 10) + `<circle cx="29.5" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.4"/>`],
    level: () => [24, ntF(5, 10) + ntLine(9.5, 8.3, 14.5, 8.3, 1.3) + ntLine(9.5, 11.7, 14.5, 11.7, 1.3) + ntH(19, 10)],
    ew: () => [18, ntLine(3, 10, 15, 10) + ntHeadL(2.6, 10) + ntHeadR(15.4, 10)],
    ns: () => [12, ntLine(6, 3, 6, 17) + ntHeadU(6, 2.6) + ntHeadD(6, 17.4)],
    ud: () => [12, `<path d="M6 1.5 L10 7 L2 7 Z" fill="currentColor"/><path d="M6 18.5 L10 13 L2 13 Z" fill="currentColor"/>` + ntLine(6, 7, 6, 13, 1, 'opacity=".5"')],
    time: () => [18, `<circle cx="9" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>` + ntLine(9, 10, 9, 5.3) + ntLine(9, 10, 12.4, 11.6)],
    sameWay: () => [20, ntLine(2.5, 6, 16.5, 6) + ntHeadR(17, 6) + ntLine(2.5, 14, 16.5, 14) + ntHeadR(17, 14)],
    oppWay: () => [20, ntLine(2.5, 6, 16.5, 6) + ntHeadR(17, 6) + ntLine(3.5, 14, 17.5, 14) + ntHeadL(3, 14)],
    same: () => [22, ntHalf(6, 10, 'L') + ntHalf(16, 10, 'L')],
    opp: () => [22, ntHalf(6, 10, 'L') + ntHalf(16, 10, 'R')],
    oppBoth: () => [32, ntHalf(6, 10, 'L') + ntHalf(16, 10, 'R') + ntHalf(26, 10, 'R')],
    sameBoth: () => [32, ntHalf(6, 10, 'L') + ntHalf(16, 10, 'L') + ntHalf(26, 10, 'L')],
    allSame: () => [32, ntHalf(6, 10, 'L') + ntHalf(16, 10, 'L') + ntHalf(26, 10, 'L')],
    direct: () => [16, ntUp(4.5) + ntUp(11.5)],
    inverse: () => [16, ntUp(4.5) + ntDown(11.5)],
    directSharp: () => [23, ntUp(4.5) + ntUp(11.5) + ntBolt(16.5)],
    inverseSharp: () => [23, ntUp(4.5) + ntDown(11.5) + ntBolt(16.5)],
    inverseBoth: () => [23, ntUp(4.5) + ntDown(11.5) + ntDown(18.5)],
    directBoth: () => [23, ntUp(4.5) + ntUp(11.5) + ntUp(18.5)],
    allMove: () => [23, ntUp(4.5) + ntUp(11.5) + ntUp(18.5)],
    up: () => [9, ntUp(4.5)],
    down: () => [9, ntDown(4.5)],
    bolt: () => [9, ntBolt(2.5)],
    next: () => [20, `<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"/>` + ntH(10, 3, 2.7) + ntF(16.06, 13.5, 2.7) + ntCwArc(10, 10, 7, -66, 4)],
    cw: () => [18, ntF(9, 3, 2.6) + ntCwArc(9, 10, 7, -62, 210)],
    arc: () => [14, ntCwArc(7, 10, 5.5, -150, 150)],
    near: () => [16, ntF(3.5, 10) + ntLine(6.5, 10, 9.5, 10) + ntH(12.5, 10)],
    far: () => [26, ntDots(3, 10, 18, 10) + ntH(22, 10)],
    over: () => [12, ntF(6, 4) + ntDots(6, 8, 6, 12.5) + ntH(6, 16)],
    under2: () => [12, ntH(6, 4) + ntDots(6, 8, 6, 12.5) + ntF(6, 16)],
    meet: () => [22, ntF(11, 4) + ntDots(9, 6.8, 5.2, 12.6) + ntDots(13, 6.8, 16.8, 12.6) + ntH(4, 16) + ntH(18, 16)],
    apart: () => [22, `<circle cx="11" cy="3.5" r="1.6" fill="currentColor" opacity=".45"/>` + ntDots(9.8, 5.5, 5.4, 12.4) + ntDots(12.2, 5.5, 16.6, 12.4) + ntF(4.5, 15.5) + ntF(17.5, 15.5)],
    oneLine2: () => [12, ntF(6, 4) + ntDots(6, 8, 6, 12.5) + ntF(6, 16)],
    oneLine3: () => [12, ntF(6, 3) + ntDots(6, 6, 6, 7.5) + ntF(6, 10) + ntDots(6, 13, 6, 14.5) + ntF(6, 17)],
    samePlace: () => [18, `<circle cx="9" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/>` + ntF(9, 10, 3)],
    syAll: () => [24, `<circle cx="13" cy="10" r="8.3" fill="none" stroke="currentColor" stroke-width="1.4"/>` + ntF(10, 10, 3.8)],
    // two whole circles kept apart by a bar: bigger than the order dots, so "no A is B" never reads as "left of"
    syNo: () => [30, `<circle cx="7.5" cy="10" r="6.3" fill="currentColor" opacity=".35"/><circle cx="7.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/>` + ntLine(15, 3, 15, 17, 1.6) + `<circle cx="22.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/>`],
    sySome: () => [26, `<circle cx="9.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="16.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 4.76 A6.3 6.3 0 0 1 13 15.24 A6.3 6.3 0 0 1 13 4.76 Z" fill="currentColor"/>`],
    syNot: () => [26, `<circle cx="9.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="16.5" cy="10" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 4.76 A6.3 6.3 0 1 0 13 15.24 A6.3 6.3 0 0 1 13 4.76 Z" fill="currentColor"/>`],
};
function ntIcon(name, red, slash) {
    const make = NT_ICONS[name] || NT_ORDER[name];
    const [w, body] = Array.isArray(name) ? name : make();
    return ntSvg(w, body + (slash ? ntSlash(w) : ''), red ? 'rs-inv' : '');
}
function ntDrawn([w, body], red, slash, em) { return ntSvg(w, body + (slash ? ntSlash(w) : ''), red ? 'rs-inv' : '', em); }
// the compass gets more room than the other signs: its nine cells have to be told apart at a glance
const ntCompass = (v, red) => ntDrawn(ntDirIcon(v), red, false, 1.75);
function ntCount(n, red) {
    return ntSvg(20, `<circle cx="10" cy="10" r="8.4" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="10" y="14.2" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">${n}</text>`, 'rs-count' + (red ? ' rs-inv' : ''));
}
const ntOp = (s, red) => s === ',' ? `<span class="rs-sep${red ? ' rs-inv' : ''}">,</span>`
    : s === '·' ? '<span class="rs-dot">·</span>'
    : `<span class="rs-op${red ? ' rs-inv' : ''}">${s}</span>`;
const ntGroup = html => `<span class="rs-grp">${html}</span>`;

// the sign for a relation phrase on its own (two-term use, or the head of a longer form)
function ntRelIcon(text, red) {
    // plural forms ("are left of", "contain", "are between") draw like the singular
    const t = text.toLowerCase().replace(/^are (?!same as|opposite of|all |not all )/, 'is ').replace(/^contain$/, 'contains');
    if (NT_ORDER_WORDS[t]) return ntIcon(NT_ORDER_WORDS[t], red);
    const both = /^(.*) both$/.exec(t);
    if (both && NT_ORDER_WORDS[both[1]] && NT_BOTH[NT_ORDER_WORDS[both[1]]]) return ntDrawn(NT_BOTH[NT_ORDER_WORDS[both[1]]](), red);
    const dir = ntParseDir(text);
    if (dir) return ntCompass(dir, red);
    switch (t) {
        case 'is between': return ntIcon('between', red);
        case 'is not between': return ntIcon('between', red, true);
        case 'is at one end': return ntIcon('end', red);
        case 'is not at one end': return ntIcon('end', red, true);
        case 'is level with': return ntIcon('level', red);
        case 'is not level with': return ntIcon('level', red, true);
        case 'east–west': return ntIcon('ew', red);
        case 'north–south': return ntIcon('ns', red);
        case 'above–below': return ntIcon('ud', red);
        case 'in time': return ntIcon('time', red);
        case 'is same as': case 'are same as': case 'is the same as': return ntIcon('same', red);
        case 'is opposite of': case 'are opposite of': return ntIcon('opp', red);
        case 'is opposite of both': return ntIcon('oppBoth', red);
        case 'is same as both': return ntIcon('sameBoth', red);
        case 'are all the same': return ntIcon('allSame', red);
        case 'are not all the same': return ntIcon('allSame', red, true);
        case 'varies directly with': case 'moves with': case 'move with': return ntIcon('direct', red);
        case 'varies inversely with': case 'moves against': case 'move against': return ntIcon('inverse', red);
        case 'varies sharply and directly with': return ntIcon('directSharp', red);
        case 'varies sharply and inversely with': return ntIcon('inverseSharp', red);
        case 'varies inversely with both': return ntIcon('inverseBoth', red);
        case 'varies directly with both': return ntIcon('directBoth', red);
        case 'all move the same way': return ntIcon('allMove', red);
        case 'do not all move the same way': return ntIcon('allMove', red, true);
        case 'increases': return ntIcon('up', red);
        case 'decreases': return ntIcon('down', red);
        case 'requires': return ntOp('⇒', red);
        case 'is required by': return ntOp('⇐', red);
        case 'is the next one clockwise after': return ntIcon('next', red);
        case 'is not the next one clockwise after': return ntIcon('next', red, true);
        case 'sits closer to': return ntIcon('near', red);
        case 'than to': return ntIcon('far', red);
        case 'is over': case 'is somewhere over': return ntIcon('over', red);
        case 'is not over': return ntIcon('over', red, true);
        case 'sits under': case 'sit under': return ntIcon('under2', red);
        case 'is the lowest one over both': return ntIcon('meet', red);
        case 'is not the lowest one over both': return ntIcon('meet', red, true);
        case 'lie on different lines of descent': return ntIcon('apart', red);
        case 'lie on one line of descent': return ntIcon('oneLine2', red);
        case 'all lie on one line of descent': return ntIcon('oneLine3', red);
        case 'do not all lie on one line of descent': return ntIcon('oneLine3', red, true);
        case 'has the same place as': return ntIcon('samePlace', red);
        case 'exactly when': return ntOp('⇔', red);
        case 'or': return ntOp('∨', red);
        case 'and': return ntOp(',', red);
        case 'either': case 'or both': return '';
        case 'balance': case 'balances': return ntOp('=', red);
        case 'is at': case 'is equal to': return ntOp('=', red);
        case ', by a lot more': return ntIcon('bolt', red);
        case ', by about the same amount': return ntOp('≈', red);
        case 'comes before': return ntOp('→', red);
        case 'comes after': return ntOp('←', red);
    }
    return null;
}

// ================================================================ tokens
// S = a term (kept exactly as drawn), R = a relation phrase, T = plain connective text, X = anything else
function ntSpanEnd(html, start) {
    const re = /<span\b|<\/span>/g;
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
        if (m[0] === '</span>') { depth--; if (depth === 0) return m.index + 7; }
        else depth++;
    }
    return html.length;
}
function ntElementEnd(html, start, tag) {
    const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('</')) { depth--; if (depth === 0) return m.index + tag.length + 3; }
        else depth++;
    }
    return html.length;
}
const ntText = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function ntTokens(html) {
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
        if (tag === 'span') end = ntSpanEnd(html, lt);
        else if (tag === 'div' || tag === 'svg' || tag === 'i' || tag === 'b' || tag === 'em') end = ntElementEnd(html, lt, tag);
        else end = lt + head[0].length;
        const whole = html.slice(lt, end), inner = whole.slice(head[0].length, whole.lastIndexOf('<'));
        if (tag === 'span' && cls === 'subject') out.push({ t: 'S', html: whole });
        else if (tag === 'span' && cls === 'relation') {
            const neg = /^<span class="is-negated">([^<]*)<\/span>$/.exec(inner.trim());
            if (neg) out.push({ t: 'R', text: neg[1].trim(), red: true, html: whole });
            else if (/</.test(inner)) out.push({ t: 'X', html: whole });       // meta and other nested forms: left alone
            else out.push({ t: 'R', text: inner.trim(), red: false, html: whole });
        } else if (tag === 'span' && cls === 'is-negated' && !/</.test(inner)) out.push({ t: 'T', text: inner.trim(), red: true, html: whole });
        else if (tag === 'div' && cls === 'analogy-statement') out.push({ t: 'A', text: ntText(inner), red: /color:\s*red/.test(attrs), html: whole });
        // a plain container (one fact per line in the answer formats): rewrite what is inside it
        else if (tag === 'div' && cls !== 'is-connector') out.push({ t: 'X', html: head[0] + ntRewrite(inner) + '</div>', cls, text: ntText(whole) });
        else out.push({ t: 'X', html: whole, cls, text: ntText(whole) });
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
const ntJoin = (items, sep) => items.map(s => s.html).join(sep);

const NT_RULES = [
    // "Under X:" — a context tag
    (toks, i) => {
        if (!(toks[i].t === 'X' && toks[i].cls === 'is-connector' && toks[i].text === 'Under' && ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'T', /^:$/))) return null;
        return [3, `<span class="rs-ctx">${toks[i + 1].html}</span>`];
    },
    // "Exactly N of A, B and C ..." / "None of ..." — a count over a group
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^(Exactly (\d+|one) of|None of)$/)) return null;
        const L = ntList(toks, i + 1, /^and$/);
        if (!L) return null;
        const m = /^Exactly (\d+|one) of$/.exec(toks[i].text), n = m ? (m[1] === 'one' ? 1 : +m[1]) : 0;
        return [1 + L.n, ntGroup(ntCount(n, toks[i].red) + ntJoin(L.items, ntOp(','))) ];
    },
    // "Among A, B, C and D, A is at one end"
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^Among$/)) return null;
        const L = ntList(toks, i + 1, /^and$/);
        if (!L) return null;
        let j = i + 1 + L.n;
        if (!(ntIs(toks[j], 'T', /^,$/) && ntIs(toks[j + 1], 'S') && ntIs(toks[j + 2], 'R', /^is (not )?at one end$/))) return null;
        const piv = toks[j + 1], rest = L.items.filter(s => s.html !== piv.html);
        return [j + 3 - i, `${piv.html} ${ntRelIcon(toks[j + 2].text, toks[j + 2].red)} ${ntJoin(rest, ntOp(','))}`];
    },
    // "A is between B and C [axis]" (and "is not between")
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^(is|are) (not )?between$/)) return null;
        if (!(ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'R', /^and$/) && ntIs(toks[i + 3], 'S'))) return null;
        return [4, `${ntRelIcon(toks[i].text, toks[i].red)} ${toks[i + 1].html}${ntOp(',')}${toks[i + 3].html}`];
    },
    // "A is the same way from B as C is from D" — A·B ⇉ C·D
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^is the (same|opposite) way from$/)) return null;
        if (!(ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'R', /^as$/) && ntIs(toks[i + 3], 'S') && ntIs(toks[i + 4], 'R', /^is from$/) && ntIs(toks[i + 5], 'S'))) return null;
        const icon = ntIcon(/same/.test(toks[i].text) ? 'sameWay' : 'oppWay', toks[i].red);
        return [6, `${ntOp('·')}${toks[i + 1].html} ${icon} ${toks[i + 3].html}${ntOp('·')}${toks[i + 5].html}`];
    },
    // "Going clockwise from A, B comes before C"
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^Going clockwise from$/)) return null;
        if (!(ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'T', /^,$/) && ntIs(toks[i + 3], 'S') && ntIs(toks[i + 4], 'R', /^comes (before|after)$/) && ntIs(toks[i + 5], 'S'))) return null;
        return [6, `${toks[i + 1].html} ${ntIcon('cw')} ${toks[i + 3].html} ${ntRelIcon(toks[i + 4].text, toks[i + 4].red)} ${toks[i + 5].html}`];
    },
    // "It is the same number of steps clockwise from A to B as from C to D"
    (toks, i) => {
        if (!(ntIs(toks[i], 'R', /^It is$/) && ntIs(toks[i + 1], 'R', /number of steps$/) && ntIs(toks[i + 2], 'R', /^clockwise from$/))) return null;
        const t = toks;
        if (!(ntIs(t[i + 3], 'S') && ntIs(t[i + 4], 'R', /^to$/) && ntIs(t[i + 5], 'S') && ntIs(t[i + 6], 'R', /^as from$/) && ntIs(t[i + 7], 'S') && ntIs(t[i + 8], 'R', /^to$/) && ntIs(t[i + 9], 'S'))) return null;
        const same = /^the same/.test(t[i + 1].text);
        return [10, `${t[i + 3].html}${ntIcon('arc')}${t[i + 5].html} ${ntOp(same ? '=' : '≠', t[i + 1].red)} ${t[i + 7].html}${ntIcon('arc')}${t[i + 9].html}`];
    },
    // "... lies on the clockwise way from C round to D"
    (toks, i) => {
        if (!(ntIs(toks[i], 'R', /^lies? (on|off)$/) && ntIs(toks[i + 1], 'R', /^the clockwise way from$/) && ntIs(toks[i + 2], 'S') && ntIs(toks[i + 3], 'R', /^round to$/) && ntIs(toks[i + 4], 'S'))) return null;
        return [5, `${ntOp(/ on$/.test(toks[i].text) ? '∈' : '∉', toks[i].red)} ${toks[i + 2].html}${ntIcon('arc')}${toks[i + 4].html}`];
    },
    // "A requires B, C or D"
    (toks, i) => {
        if (!ntIs(toks[i], 'R', /^(requires|is required by)$/)) return null;
        const L = ntList(toks, i + 1, /^or$/);
        if (L && L.conj === 'or') return [1 + L.n, `${ntRelIcon(toks[i].text, toks[i].red)} ${ntJoin(L.items, ntOp('∨'))}`];
        return null;
    },
    // "If A and B both work, C or D must work"; "If A works and B fails, ..."; "If A fails, then B must fail"
    (toks, i) => {
        if (!ntIs(toks[i], 'T', /^If$/)) return null;
        let j = i + 1, lhs;
        const L = ntList(toks, j, /^and$/);
        if (L && ntIs(toks[j + L.n], 'R', /^(both|all) work$/)) {
            lhs = ntJoin(L.items, ntOp('∧', toks[j + L.n].red));
            j += L.n + 1;
        } else if (ntIs(toks[j], 'S') && ntIs(toks[j + 1], 'R', /^(works|fails)$/)) {
            const lit = (s, r) => (r.text === 'fails' ? ntOp('¬', r.red) : '') + s.html;
            lhs = lit(toks[j], toks[j + 1]);
            j += 2;
            if (ntIs(toks[j], 'R', /^and$/) && ntIs(toks[j + 1], 'S') && ntIs(toks[j + 2], 'R', /^(works|fails)$/)) {
                lhs += ntOp('∧') + lit(toks[j + 1], toks[j + 2]);
                j += 3;
            }
        } else if (ntIs(toks[j], 'S') && ntIs(toks[j + 1], 'R', /^(increases|decreases)$/)) {
            // influence: "If A increases, B decreases[, by a lot more]"
            const a = toks[j], av = toks[j + 1];
            j += 2;
            if (!(ntIs(toks[j], 'T', /^,$/) && ntIs(toks[j + 1], 'S') && ntIs(toks[j + 2], 'R', /^(increases|decreases)$/))) return null;
            let out = `${a.html}${ntRelIcon(av.text, av.red)} ${ntOp('⇒')} ${toks[j + 1].html}${ntRelIcon(toks[j + 2].text, toks[j + 2].red)}`;
            j += 3;
            if (ntIs(toks[j], 'R', /^, by /)) { out += ' ' + ntRelIcon(toks[j].text, toks[j].red); j++; }
            return [j - i, out];
        } else return null;
        if (!ntIs(toks[j], 'T', /^,$/)) return null;
        j++;
        if (ntIs(toks[j], 'T', /^then$/)) j++;
        let rhs;
        const R = ntList(toks, j, /^or$/);
        if (R && R.conj === 'or') { rhs = ntJoin(R.items, ntOp('∨')); j += R.n; }
        else if (ntIs(toks[j], 'S')) { rhs = toks[j].html; j++; }
        else return null;
        if (!ntIs(toks[j], 'R', /^must (work|fail)$/)) return null;
        if (/fail/.test(toks[j].text)) rhs = ntOp('¬', toks[j].red) + rhs;
        else if (toks[j].red) rhs = ntOp('¬', true) + rhs;
        return [j + 1 - i, `${lhs} ${ntOp('⇒')} ${rhs}`];
    },
    // "A, B and C (do not) all work" — requirement, said with logic
    (toks, i) => {
        const L = ntList(toks, i, /^and$/);
        if (!L || !ntIs(toks[i + L.n], 'R', /^(do not )?all work$/)) return null;
        const r = toks[i + L.n], not = /not/.test(r.text);
        return [L.n + 1, `${not ? ntOp('¬', r.red) + ntOp('(') : ntOp('(', r.red)}${ntJoin(L.items, ntOp('∧', r.red))}${ntOp(')', !not && r.red)}`];
    },
    // a group that a whole-group relation is said of: "A, B and C are not all the same", "A and B lie on
    // different lines of descent"
    (toks, i) => {
        const L = ntList(toks, i, /^and$/);
        if (!L || !ntIs(toks[i + L.n], 'R', /^(are (not )?all the same|(do not )?all move the same way|(do not )?all lie on one line of descent|lie on (different lines|one line) of descent)$/)) return null;
        const r = toks[i + L.n];
        return [L.n + 1, `${ntGroup(ntJoin(L.items, ntOp(',')))} ${ntRelIcon(r.text, r.red)}`];
    },
    // "A is level with B or C [axis]", "A is left of B or C", "A requires ..." etc: relation, then "B or C"
    (toks, i) => {
        if (!ntIs(toks[i], 'R') || !(ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'R', /^or$/) && ntIs(toks[i + 3], 'S'))) return null;
        const icon = ntRelIcon(toks[i].text, toks[i].red);
        if (!icon) return null;
        return [4, `${icon} ${toks[i + 1].html}${ntOp('∨')}${toks[i + 3].html}`];
    },
    // "A is right of both B and C"
    (toks, i) => {
        if (!ntIs(toks[i], 'R', / both$/) || !(ntIs(toks[i + 1], 'S') && ntIs(toks[i + 2], 'R', /^and$/) && ntIs(toks[i + 3], 'S'))) return null;
        const icon = ntRelIcon(toks[i].text, toks[i].red);
        if (!icon) return null;
        return [4, `${icon} ${toks[i + 1].html}${ntOp(',')}${toks[i + 3].html}`];
    },
    // balance: "1 A and 2 B balance 3 C" — numbers stay, "and" adds, "balance" is =
    (toks, i) => {
        if (!(ntIs(toks[i], 'R', /^\d+$/) && ntIs(toks[i + 1], 'S'))) return null;
        let j = i, out = '';
        while (ntIs(toks[j], 'R', /^\d+$/) && ntIs(toks[j + 1], 'S')) {
            out += `<span class="rs-num">${toks[j].text}</span>${toks[j + 1].html} `;
            j += 2;
            if (ntIs(toks[j], 'R', /^and$/) && ntIs(toks[j + 1], 'R', /^\d+$/)) { out += ntOp('+') + ' '; j++; continue; }
            if (ntIs(toks[j], 'R', /^balances?$/)) { out += ntOp('=', toks[j].red) + ' '; j++; continue; }
            break;
        }
        return [j - i, out];
    },
    // syllogism: "All A that is B is C or D" — Euler pictures, ∩ for the subject, ∪ for the object
    (toks, i) => {
        const q = toks[i];
        if (!ntIs(q, 'T', /^(All|No|Some)$/)) return null;
        let j = i + 1;
        if (!ntIs(toks[j], 'S')) return null;
        const subj = [toks[j]];
        j++;
        if (ntIs(toks[j], 'R', /^that is$/)) {
            j++;
            while (ntIs(toks[j], 'S')) { subj.push(toks[j]); j++; if (ntIs(toks[j], 'R', /^and$/)) j++; else break; }
        }
        const cop = toks[j];
        if (!ntIs(cop, 'T', /^is( not)?$/)) return null;
        j++;
        if (!ntIs(toks[j], 'S')) return null;
        const obj = [toks[j]];
        j++;
        while (ntIs(toks[j], 'R', /^(or|nor)$/) && ntIs(toks[j + 1], 'S')) { obj.push(toks[j + 1]); j += 2; }
        const not = /not/.test(cop.text);
        const name = q.text === 'All' ? 'syAll' : q.text === 'No' ? 'syNo' : not ? 'syNot' : 'sySome';
        const red = q.red || cop.red;
        const grp = (list, op) => list.length > 1 ? ntGroup(ntJoin(list, ntOp(op))) : list[0].html;
        return [j - i, `${grp(subj, '∩')} ${ntIcon(name, red)} ${grp(obj, '∪')}`];
    },
    // analogy: "A to B  has the same relation as  C to D"
    (toks, i) => {
        if (!(ntIs(toks[i], 'S') && ntIs(toks[i + 1], 'T', /^to$/) && ntIs(toks[i + 2], 'S') && toks[i + 3] && toks[i + 3].t === 'A'
            && ntIs(toks[i + 4], 'S') && ntIs(toks[i + 5], 'T', /^to$/) && ntIs(toks[i + 6], 'S'))) return null;
        const a = toks[i + 3].text, same = /same/.test(a);
        return [7, `${toks[i].html}${ntOp(':')}${toks[i + 2].html} ${ntOp(same ? '∷' : '≁', toks[i + 3].red)} ${toks[i + 4].html}${ntOp(':')}${toks[i + 6].html}`];
    },
];

const NT_EXPLAINERS = {
    'Invert the Red text': 'Invert red signs',
    '"or" means at least one of them': '∨ means at least one of them',
};

function ntRewrite(html) {
    const toks = ntTokens(html);
    let out = '';
    for (let i = 0; i < toks.length;) {
        let hit = null;
        for (const rule of NT_RULES) { hit = rule(toks, i); if (hit) break; }
        if (hit) { out += ' ' + hit[1] + ' '; i += hit[0]; continue; }
        const tk = toks[i];
        if (tk.t === 'R') {
            // a comma just before "or" / "or both" belongs to the words, not the picture
            const icon = ntRelIcon(tk.text, tk.red);
            out += icon === null ? ' ' + tk.html + ' ' : ' ' + icon + ' ';
        } else if (tk.t === 'T') {
            if (tk.text === ',' && ntIs(toks[i + 1], 'R', /^or( both)?$/)) { i++; continue; }
            out += tk.text === ',' || tk.text === ':' ? tk.html : ' ' + tk.html + ' ';
        } else if (tk.t === 'X' && /negation-explainer/.test(tk.cls || '') && NT_EXPLAINERS[tk.text]) {
            out += `<span class="negation-explainer">${NT_EXPLAINERS[tk.text]}</span>`;
        } else out += tk.html;
        i++;
    }
    // separators hug the term before them; the pair dot hugs both sides
    return out.replace(/\s+/g, ' ').replace(/ (<span class="rs-sep[^"]*">)/g, '$1').replace(/ ?(<span class="rs-dot">·<\/span>) ?/g, '$1').trim();
}

// the old entry point
function renderRelationSymbols(html) {
    try { return ntRewrite(html); } catch (e) { return html; }
}

// ================================================================ the key
// Shown with the setting and beside an explanation: each sign next to the words it replaces.
function notationKeyRows() {
    const S = w => `<span class="subject">${w}</span>`;
    return [
        ['Reading the signs', [
            [`${S('A')} ${ntIcon('left')} ${S('B')}`, 'filled dot = the term before the sign, hollow = the term(s) after it'],
            [`${ntIcon('left', true)}`, 'a red sign is inverted, like red words'],
            [`${ntIcon('between', false, true)}`, 'a slash means "not"'],
        ]],
        ['Order', [
            [`${ntIcon('left')} ${ntIcon('right')}`, 'left of / right of'],
            [`${ntIcon('top')} ${ntIcon('under')}`, 'on top of / under'],
            [`${ntIcon('more')} ${ntIcon('less')}`, 'more than / less than'],
            [`${ntIcon('before')} ${ntIcon('after')}`, 'before / after'],
            [`${ntIcon('contains')} ${ntIcon('within')}`, 'contains / within'],
            [`${S('A')} ${ntIcon('between')} ${S('B')}${ntOp(',')}${S('C')}`, 'A is between B and C'],
            [`${S('A')} ${ntIcon('end')} ${S('B')}${ntOp(',')}${S('C')}`, 'A is at one end of the group (either end)'],
        ]],
        ['Space', [
            [`${S('A')} ${ntCompass([-1, 1])} ${S('B')}`, 'A is north-west of B (B is the middle dot)'],
            [`${ntCompass([1, 0, 1])}`, 'side track: above / below'],
            [`${ntCompass([0, 1, 0, 1])}`, 'time track: later / earlier'],
            [`${S('A')} ${ntIcon('level')} ${S('B')}`, 'A is level with B'],
            [`${ntIcon('ew')} ${ntIcon('ns')} ${ntIcon('ud')} ${ntIcon('time')}`, 'on the east–west / north–south / up–down / time axis'],
            [`${S('A')}${ntOp('·')}${S('B')} ${ntIcon('sameWay')} ${S('C')}${ntOp('·')}${S('D')}`, 'A is the same way from B as C is from D'],
            [`${ntIcon('oppWay')}`, '… the opposite way'],
        ]],
        ['Same / opposite, influence', [
            [`${ntIcon('same')} ${ntIcon('opp')}`, 'same as / opposite of'],
            [`${ntIcon('allSame')}`, 'are all the same (slashed: not all the same)'],
            [`${ntIcon('direct')} ${ntIcon('inverse')}`, 'varies directly / inversely (moves with / against)'],
            [`${ntIcon('directSharp')}`, 'sharply: outsized swings'],
            [`${S('A')}${ntIcon('up')} ${ntOp('⇒')} ${S('B')}${ntIcon('down')} ${ntIcon('bolt')}`, 'if A increases, B decreases, by a lot more (≈: about the same amount)'],
        ]],
        ['Logic and counts', [
            [`${ntOp('⇔')}`, 'exactly when'],
            [`${ntOp('∨')}`, 'or: at least one'],
            [`${ntCount(2)}`, 'exactly 2 of the group that follows (0: none of them)'],
            [`${S('A')} ${ntOp('⇒')} ${S('B')}`, 'A requires B'],
            [`${S('A')}${ntOp('∧')}${ntOp('¬')}${S('B')} ${ntOp('⇒')} ${S('C')}`, 'if A works and B fails, C must work'],
        ]],
        ['Ring', [
            [`${S('A')} ${ntIcon('next')} ${S('B')}`, 'A is the next one clockwise after B'],
            [`${S('A')} ${ntIcon('cw')} ${S('B')} ${ntOp('→')} ${S('C')}`, 'going clockwise from A, B comes before C'],
            [`${S('A')} ${ntIcon('near')} ${S('B')} ${ntIcon('far')} ${S('C')}`, 'A sits closer to B than to C'],
            [`${S('A')}${ntIcon('arc')}${S('B')}`, 'the clockwise way from A round to B (=: as many steps)'],
        ]],
        ['Hierarchy', [
            [`${S('A')} ${ntIcon('over')} ${S('B')}`, 'A is somewhere over B'],
            [`${S('A')} ${ntIcon('meet')} ${S('B')}${ntOp(',')}${S('C')}`, 'A is the lowest one over both B and C'],
            [`${S('A')}${ntOp(',')}${S('B')} ${ntIcon('apart')}`, 'A and B lie on different lines of descent'],
            [`${ntIcon('oneLine3')}`, 'all lie on one line of descent'],
        ]],
        ['Categories', [
            [`${ntIcon('syAll')} ${ntIcon('syNo')} ${ntIcon('sySome')} ${ntIcon('syNot')}`, 'all A are B / no A is B / some A is B / some A is not B'],
            [`${ntOp('∩')} ${ntOp('∪')}`, 'A that is B / B or C'],
        ]],
    ];
}
function notationKeyHTML() {
    return `<div class="rs-key">${notationKeyRows().map(([head, rows]) => `<div class="rs-key__head">${head}</div>`
        + rows.map(([sign, words]) => `<div class="rs-key__row"><span class="rs-key__sign">${sign}</span><span class="rs-key__words">${words}</span></div>`).join('')).join('')}</div>`;
}

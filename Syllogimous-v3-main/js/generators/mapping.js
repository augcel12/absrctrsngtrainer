// mapping.js — structure mapping (Gentner): alignment, systematicity, re-representation.
//
// Two sets of places on a grid, described in compass premises over different words. The second set is
// the SAME layout, possibly turned (90/180/270°) or mirrored, and its premises come from a different
// spanning tree over the same points, listed in a different order. The conclusion pairs a word from the
// first set with one from the second: "X has the same place as Y" — true when Y is X's counterpart.
//
//   alignment         the counterpart is found by role in the whole layout, never by surface: false
//                     conclusions favour lures that match on surface (same compass position read
//                     literally, same slot in the premise list) or locally (one relation lines up)
//   systematicity     only the whole layout decides — the second set's premises connect different pairs,
//                     so no premise-to-premise matching works
//   re-representation the second set is usually turned or mirrored: "North" in the first set may be
//                     "East" in the second, and the solver has to find the reframing that makes it fit
//
// Layouts are checked to have no symmetry of their own, so exactly one turn/mirror maps one set onto
// the other and every counterpart is unique.

const MP_T = [
    { f: ([x, y]) => [x, y], name: 'not turned' },
    { f: ([x, y]) => [y, -x], name: 'turned 90° clockwise' },
    { f: ([x, y]) => [-x, -y], name: 'turned 180°' },
    { f: ([x, y]) => [-y, x], name: 'turned 90° counter-clockwise' },
    { f: ([x, y]) => [-x, y], name: 'mirrored east–west' },
    { f: ([x, y]) => [x, -y], name: 'mirrored north–south' },
    { f: ([x, y]) => [y, x], name: 'mirrored along a diagonal' },
    { f: ([x, y]) => [-y, -x], name: 'mirrored along the other diagonal' },
];
const MP_STEPS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];

function mpNorm(pts) {
    const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
    return pts.map(p => [p[0] - mx, p[1] - my]);
}
const mpKey = pts => pts.map(p => p.join(',')).sort().join(' ');

// a random tree of unit steps with distinct points
function mpLayout(n) {
    for (;;) {
        const pts = [[0, 0]], edges = [];
        const has = (p) => pts.some(q => q[0] === p[0] && q[1] === p[1]);
        let ok = true;
        for (let i = 1; i < n && ok; i++) {
            let placed = false;
            for (let t = 0; t < 40 && !placed; t++) {
                const base = Math.floor(Math.random() * pts.length);
                const d = MP_STEPS[Math.floor(Math.random() * 8)];
                const p = [pts[base][0] + d[0], pts[base][1] + d[1]];
                if (has(p)) continue;
                pts.push(p); edges.push([base, i]); placed = true;
            }
            ok = placed;
        }
        if (!ok) continue;
        // no symmetry of its own: only the identity maps the layout onto itself
        const k0 = mpKey(mpNorm(pts));
        if (MP_T.slice(1).some(T => mpKey(mpNorm(pts.map(T.f))) === k0)) continue;
        return { pts, edges };
    }
}
// a random spanning tree over the unit-step neighbourhood of the points
function mpTree(pts) {
    const adj = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
        if (Math.max(Math.abs(pts[i][0] - pts[j][0]), Math.abs(pts[i][1] - pts[j][1])) === 1) adj.push([i, j]);
    const parent = pts.map((_, i) => i), find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const edges = [];
    for (const [i, j] of shuffle(adj)) { const a = find(i), b = find(j); if (a !== b) { parent[a] = b; edges.push(coinFlip() ? [i, j] : [j, i]); } }
    return edges;
}

class MappingQuestion {
    create(length) {
        const n = Math.max(4, Math.min(9, length + 1));
        const gen = new Direction2D();
        const { pts, edges } = mpLayout(n);
        const ti = Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * 7);
        const T = MP_T[ti];
        const ptsB = pts.map(T.f);
        const edgesB = mpTree(ptsB);
        const [Wa, Wb] = (() => { const w = createStimuli(2 * n); return [w.slice(0, n), w.slice(n)]; })();
        const stmt = (W, P, [i, j]) => gen.createDirectionStatement(W[i], W[j], [P[j][0] - P[i][0], P[j][1] - P[i][1]]);
        const listA = scramble(edges.map(e => stmt(Wa, pts, e)));
        const listB = shuffle(edgesB.map(e => stmt(Wb, ptsB, e)));

        const x = Math.floor(Math.random() * n), right = x;
        // lures, best first: literal (same place if nothing was turned), local (one relation of x lines up
        // under the turn), slot (same position in the premise list), any other
        const nA = mpNorm(pts), nB = mpNorm(ptsB);
        const lures = [];
        const lit = nB.findIndex(p => p[0] === nA[x][0] && p[1] === nA[x][1]);
        if (lit >= 0 && lit !== right) lures.push({ j: lit, why: `${Wb[lit]} is where ${Wa[x]} would be if the compass words were read literally` });
        const nbr = edges.filter(e => e.includes(x)).map(([i, j]) => (i === x ? j : i));
        for (const k of nbr) {
            const d = T.f([pts[k][0] - pts[x][0], pts[k][1] - pts[x][1]]);
            for (let j = 0; j < n; j++) {
                if (j === right) continue;
                const has = ptsB.some((q, m) => m !== j && q[0] - ptsB[j][0] === d[0] && q[1] - ptsB[j][1] === d[1]);
                if (has) lures.push({ j, why: `${Wb[j]} matches one relation of ${Wa[x]}, but not the whole layout` });
            }
        }
        const slotOf = (list, w) => list.findIndex(p => p.start === w || p.end === w);
        const sA = slotOf(listA, Wa[x]);
        if (sA >= 0 && listB[sA]) for (const w of [listB[sA].start, listB[sA].end]) { const j = Wb.indexOf(w); if (j !== right) lures.push({ j, why: `${Wb[j]} is in the same premise slot as ${Wa[x]}` }); }
        for (let j = 0; j < n; j++) if (j !== right) lures.push({ j, why: 'a different place' });

        const isValid = coinFlip();
        const pick = isValid ? { j: right } : (Math.random() < 0.85 ? lures[0] : arPick(lures.filter(l => l.j !== right)));
        const y = pick.j;
        const conclusion = `<span class="subject">${Wa[x]}</span> <span class="relation">has the same place as</span> <span class="subject">${Wb[y]}</span>`;

        const head = t => `<span class="negation-explainer">${t}</span>`;
        const premises = [
            head('Same layout, possibly turned or mirrored'),
            head('First set'), ...listA.map(p => createPremiseHTML(p)),
            head('Second set'), ...listB.map(p => createPremiseHTML(p)),
        ];

        const grid = (W, P) => createExplanation2D(createGridFromMap(Object.fromEntries(W.map((w, i) => [w, P[i]]))));
        const explainHTML = `<div class="support"><div class="support__head">The second set is the first ${T.name}.</div>`
            + `<div class="support__premise">${Wa[x]} ↔ ${Wb[right]}</div>`
            + (!isValid ? `<div class="support__note">${pick.why}.</div>` : '')
            + `</div><div class="mapping-grids"><div>${grid(Wa, pts)}</div><div>${grid(Wb, ptsB)}</div></div>`;

        const countdown = savedata.overrideMappingTime;
        return {
            category: 'Mapping',
            type: 'mapping',
            startedAt: new Date().getTime(),
            premises,
            conclusion,
            isValid,
            plen: length,
            modifiers: [ti ? 'turned' : 'straight'],
            arityTimeMult: 2,
            explainHTML,
            ...(countdown && { countdown }),
        };
    }
}

function createMappingGenerator(length) {
    return {
        question: new MappingQuestion(),
        premiseCount: getPremisesFor('overrideMappingPremises', length),
        weight: savedata.overrideMappingWeight ?? 100,
    };
}

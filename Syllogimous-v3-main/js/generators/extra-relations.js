// extra-relations.js — four added question classes, built the same way as distinction.js:
// build a branching tree of words where every premise is one edge, compute the model from
// the tree, then read the conclusion's truth off the model. A tree has no redundant edges,
// so no premise follows from the others, and every pair of words is determined.
//
//   Influence    A varies directly / inversely with B      (variables, direct vs inverse)
//   Requirement  A requires B                              (dependency, failure propagation)
//   Contexts     Under X: A is same as B / Under Y: ...    (the same pair relates differently by context)
//   Balance      1 A balances 3 B                          (weights, equivalence, ratio)

// ---------------------------------------------------------------- shared tree builder
// Returns { words, edges:[[source, target]], neighbors } for a tree with `edgeCount` edges.
function buildRelationTree(edgeCount, extraStimuli = 0) {
    const all = createStimuli(edgeCount + 1 + extraStimuli);
    const words = all.slice(0, edgeCount + 1);
    const extras = all.slice(edgeCount + 1);
    const neighbors = { [words[0]]: [] };
    const edges = [];
    const chanceOfBranching = {
        5: 0.60, 6: 0.55, 7: 0.50, 8: 0.45, 9: 0.40, 10: 0.35,
    }[words.length] ?? (words.length > 10 ? 0.3 : 0.6);

    for (let i = 1; i < words.length; i++) {
        const source = pickBaseWord(neighbors, Math.random() < chanceOfBranching);
        const target = words[i];
        edges.push([source, target]);
        neighbors[source] = neighbors[source] ?? [];
        neighbors[target] = neighbors[target] ?? [];
        neighbors[target].push(source);
        neighbors[source].push(target);
    }
    return { words, extras, edges, neighbors };
}

// Edges on the unique tree path between a and b, each as [from, to] in walking order.
function treePath(neighbors, a, b) {
    const prev = { [a]: null };
    const queue = [a];
    while (queue.length) {
        const w = queue.shift();
        if (w === b) break;
        for (const n of neighbors[w]) {
            if (!(n in prev)) { prev[n] = w; queue.push(n); }
        }
    }
    const path = [];
    for (let w = b; prev[w] !== null; w = prev[w]) path.unshift([prev[w], w]);
    return path;
}

function subjectHTML(word) {
    return `<span class="subject">${word}</span>`;
}

// ---------------------------------------------------------------- INFLUENCE
function createDirectPremise(a, b) {
    return {
        start: a, end: b,
        relation: 'varies directly with',
        reverse: 'varies inversely with',
        relationMinimal: '∝',
        reverseMinimal: '∝1/',
    };
}

function createInversePremise(a, b) {
    return {
        start: a, end: b,
        relation: 'varies inversely with',
        reverse: 'varies directly with',
        relationMinimal: '∝1/',
        reverseMinimal: '∝',
    };
}

class InfluenceQuestion {
    create(length) {
        const { words, edges, neighbors } = buildRelationTree(length);
        // sign[w] = +1 if w moves with the root, -1 if against it
        const sign = { [words[0]]: 1 };
        const premiseMap = {};
        for (const [source, target] of edges) {
            const direct = coinFlip();
            sign[target] = direct ? sign[source] : -sign[source];
            premiseMap[premiseKey(source, target)] = direct
                ? createDirectPremise(source, target)
                : createInversePremise(source, target);
        }

        let premises = orderPremises(premiseMap, neighbors);
        premises = scramble(premises);
        premises = premises.map(p => createPremiseHTML(p, false));
        if (savedata.enableMeta && !savedata.minimalMode) {
            premises = applyMeta(premises, p => p.match(/<span class="relation">(?:<span class="is-negated">)?(.*?)<\/span>/)[1]);
        }

        const [a, b] = new DirectionPairChooser().pickTwoDistantWords(neighbors);
        const aUp = coinFlip();
        const bUp = coinFlip();
        const conclusion = `If ${subjectHTML(a)} <span class="relation">${aUp ? 'increases' : 'decreases'}</span>, `
                         + `${subjectHTML(b)} <span class="relation">${bUp ? 'increases' : 'decreases'}</span>`;
        const aMove = aUp ? 1 : -1;
        const bMove = aMove * sign[a] * sign[b];
        const isValid = (bMove === 1) === bUp;

        const buckets = [
            words.filter(w => sign[w] === 1),
            words.filter(w => sign[w] === -1),
        ];
        return {
            category: 'Influence',
            type: 'influence',
            startedAt: new Date().getTime(),
            buckets,
            premises,
            isValid,
            conclusion,
            ...(savedata.overrideInfluenceTime && { countdown: savedata.overrideInfluenceTime }),
        };
    }
}

function createInfluenceGenerator(length) {
    return {
        question: new InfluenceQuestion(),
        premiseCount: getPremisesFor('overrideInfluencePremises', length),
        weight: savedata.overrideInfluenceWeight,
    };
}

// ---------------------------------------------------------------- REQUIREMENT
function createRequiresPremise(a, b) {
    return {
        start: a, end: b,
        relation: 'requires',
        reverse: 'is required by',
        relationMinimal: '→',
        reverseMinimal: '←',
    };
}

function failStatement(x, y) {
    return `If ${subjectHTML(x)} <span class="relation">fails</span>, then ${subjectHTML(y)} <span class="relation">must fail</span>`;
}

function workStatement(x, y) {
    return `If ${subjectHTML(x)} <span class="relation">works</span>, then ${subjectHTML(y)} <span class="relation">must work</span>`;
}

class RequirementQuestion {
    create(length) {
        const { words, edges, neighbors } = buildRelationTree(length);
        const [a, b] = new DirectionPairChooser().pickTwoDistantWords(neighbors);
        const path = treePath(neighbors, a, b);
        const onPath = new Set(path.map(([x, y]) => premiseKey(x, y)));
        const wantValid = coinFlip();

        // Decide the orientation of the a-b path first, so true and false items have the
        // same path length and length is never a cue.
        // chain: every path edge points a -> b ("a requires ... requires b").
        const chain = wantValid || coinFlip();
        const flipAll = coinFlip();                 // chain may run b -> a instead
        const pathDir = {};                          // key -> [requirer, required]
        if (chain) {
            for (const [x, y] of path) pathDir[premiseKey(x, y)] = flipAll ? [y, x] : [x, y];
        } else {
            // broken chain: random orientations with at least one edge against the others
            let dirs;
            do {
                dirs = path.map(() => coinFlip());
            } while (dirs.every(d => d) || dirs.every(d => !d));
            path.forEach(([x, y], i) => pathDir[premiseKey(x, y)] = dirs[i] ? [x, y] : [y, x]);
        }

        const requires = {};                         // requires[x] = words x directly requires
        const premiseMap = {};
        for (const [source, target] of edges) {
            const key = premiseKey(source, target);
            const [r, q] = onPath.has(key) ? pathDir[key] : (coinFlip() ? [source, target] : [target, source]);
            (requires[r] = requires[r] ?? []).push(q);
            premiseMap[key] = createRequiresPremise(r, q);
        }

        const reaches = (x, y) => {                  // x transitively requires y
            const seen = new Set([x]);
            const stack = [x];
            while (stack.length) {
                const w = stack.pop();
                for (const n of requires[w] ?? []) {
                    if (n === y) return true;
                    if (!seen.has(n)) { seen.add(n); stack.push(n); }
                }
            }
            return false;
        };

        // "If X fails, Y must fail"  is valid iff Y requires X.
        // "If X works, Y must work"  is valid iff X requires Y.
        const candidates = [
            { html: failStatement(a, b), valid: reaches(b, a) },
            { html: failStatement(b, a), valid: reaches(a, b) },
            { html: workStatement(a, b), valid: reaches(a, b) },
            { html: workStatement(b, a), valid: reaches(b, a) },
        ];
        let pool = candidates.filter(c => c.valid === wantValid);
        if (pool.length === 0) pool = candidates;    // cannot happen by construction; kept as a guard
        const chosen = pickRandomItems(pool, 1).picked[0];

        let premises = orderPremises(premiseMap, neighbors);
        premises = scramble(premises);
        premises = premises.map(p => createPremiseHTML(p, true));

        return {
            category: 'Requirement',
            type: 'requirement',
            startedAt: new Date().getTime(),
            premises,
            isValid: chosen.valid,
            conclusion: chosen.html,
            ...(savedata.overrideRequirementTime && { countdown: savedata.overrideRequirementTime }),
        };
    }
}

function createRequirementGenerator(length) {
    return {
        question: new RequirementQuestion(),
        premiseCount: getPremisesFor('overrideRequirementPremises', length),
        weight: savedata.overrideRequirementWeight,
    };
}

// ---------------------------------------------------------------- CONTEXTS
// Two contexts X and Y. An unconditional premise holds in both. A conditional edge is stated
// twice, once per context, with opposite relations. The asked pair is always joined through an
// odd number of conditional edges, so its answer differs between X and Y: the context always
// matters.
function contextPrefix(ctx) {
    return `<span class="is-connector">Under</span> ${subjectHTML(ctx)}: `;
}

class ContextsQuestion {
    create(length) {
        length = Math.max(3, length);                           // need >= 2 edges and 1 conditional
        for (let attempt = 0; attempt < 200; attempt++) {
            const cMax = Math.floor(length / 2);
            const conditionalCount = randomInclusive(1, cMax);
            const edgeCount = length - conditionalCount;        // lines = edges + conditionals
            const { words, extras, edges, neighbors } = buildRelationTree(edgeCount, 2);
            const [ctxX, ctxY] = extras;

            const conditionalKeys = new Set(
                pickRandomItems(edges, conditionalCount).picked.map(([s, t]) => premiseKey(s, t))
            );

            // find a pair (distance >= 2) whose path crosses an odd number of conditional edges
            let pair = null;
            for (let tries = 0; tries < 30 && !pair; tries++) {
                const [a, b] = new DirectionPairChooser().pickTwoDistantWords(neighbors);
                const crossings = treePath(neighbors, a, b)
                    .filter(([x, y]) => conditionalKeys.has(premiseKey(x, y))).length;
                if (crossings % 2 === 1) pair = [a, b];
            }
            if (!pair) continue;

            // parity per context: 0 = same group as the first word, 1 = opposite
            const parX = { [words[0]]: 0 };
            const parY = { [words[0]]: 0 };
            const premiseMap = {};
            for (const [source, target] of edges) {
                const key = premiseKey(source, target);
                const sameInX = coinFlip();
                if (conditionalKeys.has(key)) {
                    parX[target] = sameInX ? parX[source] : 1 - parX[source];
                    parY[target] = sameInX ? 1 - parY[source] : parY[source];
                    const inX = sameInX ? createSamePremise(source, target) : createOppositePremise(source, target);
                    const inY = sameInX ? createOppositePremise(source, target) : createSamePremise(source, target);
                    premiseMap[key] = [
                        contextPrefix(ctxX) + createPremiseHTML(inX, false),
                        contextPrefix(ctxY) + createPremiseHTML(inY, false),
                    ];
                } else {
                    parX[target] = sameInX ? parX[source] : 1 - parX[source];
                    parY[target] = sameInX ? parY[source] : 1 - parY[source];
                    const both = sameInX ? createSamePremise(source, target) : createOppositePremise(source, target);
                    premiseMap[key] = [createPremiseHTML(both, false)];
                }
            }

            let premises = orderPremises(premiseMap, neighbors).flat();
            premises = scramble(premises);

            const [a, b] = pair;
            const askX = coinFlip();
            const ctx = askX ? ctxX : ctxY;
            const par = askX ? parX : parY;
            const statesSame = coinFlip();
            const conclusion = contextPrefix(ctx) + createBasicPremiseHTML(
                statesSame ? createSamePremise(a, b) : createOppositePremise(a, b), false);
            const actuallySame = par[a] === par[b];
            const isValid = statesSame === actuallySame;

            const bucketsFor = (p) => [words.filter(w => p[w] === 0), words.filter(w => p[w] === 1)];
            return {
                category: 'Contexts',
                type: 'contexts',
                startedAt: new Date().getTime(),
                premises,
                isValid,
                conclusion,
                subresults: [
                    { category: 'Contexts', buckets: bucketsFor(parX) },
                    { category: 'Contexts', buckets: bucketsFor(parY) },
                ],
                ...(savedata.overrideContextsTime && { countdown: savedata.overrideContextsTime }),
            };
        }
        throw new Error('Contexts: could not build an item');
    }
}

function createContextsGenerator(length) {
    return {
        question: new ContextsQuestion(),
        premiseCount: getPremisesFor('overrideContextsPremises', length),
        weight: savedata.overrideContextsWeight,
    };
}

// ---------------------------------------------------------------- BALANCE
// "1 A balances 3 B" means A weighs exactly 3 times B. Weights are stored as exponents of 2 and 3,
// so every ratio is exact.
function balanceHTML(p, a, q, b) {
    return `<span class="relation">${p}</span> ${subjectHTML(a)} <span class="relation">${p === 1 ? 'balances' : 'balance'}</span> <span class="relation">${q}</span> ${subjectHTML(b)}`;
}

function gcd(x, y) { return y === 0 ? x : gcd(y, x % y); }

const BALANCE_CAP = 36;

class BalanceQuestion {
    create(length) {
        let best = null;
        for (let attempt = 0; attempt < 60 && !best; attempt++) {
            const { words, edges, neighbors } = buildRelationTree(length);
            const exp = { [words[0]]: [0, 0] };            // weight = 2^e2 * 3^e3
            const lines = [];
            for (const [source, target] of edges) {
                const k = pickRandomItems([1, 2, 3], 1).picked[0];
                const kExp = k === 2 ? [1, 0] : k === 3 ? [0, 1] : [0, 0];
                const heavierIsSource = coinFlip();
                const [heavy, light] = heavierIsSource ? [source, target] : [target, source];
                if (heavierIsSource) {
                    exp[target] = [exp[source][0] - kExp[0], exp[source][1] - kExp[1]];
                } else {
                    exp[target] = [exp[source][0] + kExp[0], exp[source][1] + kExp[1]];
                }
                // one heavy balances k light; shown either way round
                lines.push(coinFlip() ? balanceHTML(1, heavy, k, light) : balanceHTML(k, light, 1, heavy));
            }

            // ratio a:b as "p A balance q B"  <=>  w(A)/w(B) = q/p
            const ratio = (a, b) => {
                const d2 = exp[a][0] - exp[b][0], d3 = exp[a][1] - exp[b][1];
                return {
                    p: 2 ** Math.max(-d2, 0) * 3 ** Math.max(-d3, 0),
                    q: 2 ** Math.max(d2, 0) * 3 ** Math.max(d3, 0),
                };
            };

            const [a, b] = new DirectionPairChooser().pickTwoDistantWords(neighbors);
            const r = ratio(a, b);
            if (Math.max(r.p, r.q) > BALANCE_CAP && attempt < 59) continue;
            best = { words, exp, lines, a, b, r };
        }

        const { words, exp, lines, a, b, r } = best;
        const wantValid = coinFlip();
        let p = r.p, q = r.q;
        if (!wantValid) {
            const options = [];
            if (p !== q) options.push([q, p]);                   // direction swapped
            options.push([p, q * 2], [p, q * 3], [p * 2, q], [p * 3, q]);
            [p, q] = pickRandomItems(options, 1).picked[0];
            const g = gcd(p, q);
            p /= g; q /= g;
        }
        // "p A balance q B" is true iff p*w(A) = q*w(B), i.e. q/p = r.q/r.p
        const isValid = p * r.q === q * r.p;

        let premises = scramble(lines);

        // explanation: integer weights, lightest first
        const min2 = Math.min(...words.map(w => exp[w][0]));
        const min3 = Math.min(...words.map(w => exp[w][1]));
        const weightOf = w => 2 ** (exp[w][0] - min2) * 3 ** (exp[w][1] - min3);
        const bucket = [...words].sort((x, y) => weightOf(x) - weightOf(y)).map(w => `${w}=${weightOf(w)}`);

        return {
            category: 'Balance',
            type: 'balance',
            startedAt: new Date().getTime(),
            bucket,
            premises,
            isValid,
            conclusion: balanceHTML(p, a, q, b),
            ...(savedata.overrideBalanceTime && { countdown: savedata.overrideBalanceTime }),
        };
    }
}

function createBalanceGenerator(length) {
    return {
        question: new BalanceQuestion(),
        premiseCount: getPremisesFor('overrideBalancePremises', length),
        weight: savedata.overrideBalanceWeight,
    };
}

const EMOJI_LENGTH = 50;
const JUNK_EMOJI_COUNT = 1000;
class JunkEmojis {
    constructor() {
        this.id = 0;
        this.prevColor = null;
        this.pool = JunkEmojis.generateColorPool();
    }

    static shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const randomIndex = Math.floor(Math.random() * (i + 1));
            [array[i], array[randomIndex]] = [array[randomIndex], array[i]];
        }
        return array;
    }

    static perfectShuffle(arr, groupCount) {
        let groups = Array.from({ length: groupCount }, () => []);

        for (let i = 0; i < arr.length; i++) {
            groups[i % groupCount].push(arr[i]);
        }

        return [].concat(...groups);
    }

    static zipShuffle(arrays) {
        const maxLength = Math.max(...arrays.map(arr => arr.length));
    
        const result = [];
        for (let i = 0; i < maxLength; i++) {
            const group = arrays.map(arr => arr?.[i]).filter(x => x !== undefined);
            const splits = pickRandomItems([3,4,5,6,7,8,9], 1).picked[0];
            result.push(JunkEmojis.perfectShuffle(group, splits));
        }
    
        return result.flat();
    }

    static generateColorPool() {
        const colors = [];

        const hueGroups = [];
        const hues = [0,10,20,30,40,45,50,55,60,65,70,80,90,100,115,130,145,160,170,180,190,200,210,220,230,237,244,250,260,270,280,290,295,300,305,310,320,330,340,350];
        const saturationsA = [10, 100, 25, 75, 95, 38, 85, 43, 68, 47, 55, 50];
        const saturationsB = saturationsA.slice().reverse();
        const lightA = [12, 92, 22, 82, 32, 77, 42, 67, 54, 59];
        const lightB = lightA.slice().reverse();
        let lightnesses = lightA;
        let saturations = saturationsA;

        for (const hue of hues) {
            const group = [];
            lightnesses = (lightnesses == lightA) ? lightB : lightA;
            saturations = (saturations == saturationsA) ? saturationsB : saturationsA;
            for (const sat of saturations) {
                const saturation = Math.round(sat + (Math.random() - 0.5) * 6);
                for (const light of lightnesses) {
                    const lightness = Math.round(light + (Math.random() - 0.5) * 6);
                    if (85 < hue && hue < 150 && (lightness <= 30 || saturation <= 30)) {
                        // Puke green is not kawaii
                        continue;
                    }
                    if (Math.random() < 0.01) {
                        group.push(`hsl(${hue}, ${saturation}%, ${0}%)`);
                    } else if (Math.random() < 0.005) {
                        group.push(`hsl(${hue}, ${saturation}%, ${100}%)`);
                    } else {
                        group.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
                    }
                }
            }
            hueGroups.push(group);
        }

        return JunkEmojis.zipShuffle(hueGroups);
    }

    static generateRandomPoints(minX, maxX, minY, maxY, numPoints, minDistance) {
        const points = [];
        const width = maxX - minX;
        const height = maxY - minY;

        const isFarEnough = (x, y) => {
            for (const [px, py] of points) {
                const dx = px - x;
                const dy = py - y;
                if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
                    return false;
                }
            }
            return true;
        };

        const usePerpendicularShifts = oneOutOf(7);
        let usedX = coinFlip();
        for (let tries = 0; tries < 1000 && points.length < numPoints; tries++) {
            let x = minX + Math.random() * width;
            let y = minY + Math.random() * height;
            if (usePerpendicularShifts && points.length > 0) {
                if (usedX) {
                    if (Math.random() < 0.8) {
                        y = points[points.length - 1][1];
                        usedX = false;
                    } else {
                        x = points[points.length - 1][0];
                        usedX = true;
                    }
                } else {
                    if (Math.random() < 0.2) {
                        y = points[points.length - 1][1];
                        usedX = false;
                    } else {
                        x = points[points.length - 1][0];
                        usedX = true;
                    }
                }
            }

            if (isFarEnough(x, y)) {
                points.push([x, y]);
            }
        }

        return points;
    }

    rebuildPool() {
        this.pool = JunkEmojis.generateColorPool();
    }

    bumpId() {
        this.id += 1;
        if (this.id % this.pool.length == 0) {
            this.rebuildPool();
        }
    }

    nextColor() {
        let color = this.pool[this.id % this.pool.length];
        while (this.prevColor && ColorComparator.areSimilarHslColors(color, this.prevColor)) {
            this.bumpId();
            this.prevColor = color;
            color = this.pool[this.id % this.pool.length];
        }
        this.bumpId();
        this.prevColor = color;
        return color;
    }

    generateJunkEmoji(colors, id=-1) {
        const width = EMOJI_LENGTH, height = EMOJI_LENGTH;
        const numPoints = colors.length;
        const points = JunkEmojis.generateRandomPoints(3, width-3, 3, height-3, numPoints, 5);
        const voronoi = d3.Delaunay.from(points).voronoi([0, 0, width, height]);
        let svgContent = `<symbol id="junk-${id}" xmlns="http://www.w3.org/2000/svg" viewbox="0 0 ${width} ${height}">`;

        for (let i = 0; i < points.length; i++) {
            const color = colors[i];
            const cell = voronoi.cellPolygon(i);
            if (cell) {
                const pointsString = cell.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
                svgContent += `<polygon points="${pointsString}" fill="${color}" />`;
            }
        }

        svgContent += '</symbol>';
        return svgContent;
    }

    parseHSL(hsl) {
        let match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        return match ? match.slice(1).map(Number) : [0, 0, 0];
    }

    generateAllEmoji() {
        let colorCombos = [];
        for (let i = 0; i < JUNK_EMOJI_COUNT; i++) {
            const numColors = pickRandomItems([2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5], 1).picked[0];
            let combo = [];
            for (let j = 0; j < numColors; j++) {
                combo.push(this.nextColor());
            }
            colorCombos.push(combo);
        }

        colorCombos.sort((a, b) => {
            const [u, v, w] = this.parseHSL(a[0]);
            const [x, y, z] = this.parseHSL(b[0]);
            return u - x || v - y || w - z;
        })

        let s = '<svg style="display: none;">\n';
        s += '<defs>\n';
        let id = 0;
        for (const combo of colorCombos) {
            const svg = this.generateJunkEmoji(combo, id);
            s += svg + '\n';
            id++;
        }
        s += '</defs>\n';
        s += '</svg>\n';
        return s;
    }
}

// To generate:
// console.log(new JunkEmojis(JUNK_EMOJI_COUNT + 1).generateAllEmoji());
// document.addEventListener("DOMContentLoaded", throwSvgsOnPage);

function throwSvgsOnPage() {
    let symbols = Array.from(document.querySelectorAll("symbol"));
    let container = document.createElement("div");
    container.id = "svg-container";

    symbols.forEach((symbol, i) => {
        if (i % (JUNK_EMOJI_COUNT / 10) === 0) {
            let divider = document.createElement("div");
            divider.setAttribute("style", "display: inline-block; width: 10px; height: 50px; border: 3px dotted black; background-color: #FFF");
            container.appendChild(divider);
        }
        let useElement = document.createElementNS("http://www.w3.org/2000/svg", "use");
        useElement.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${symbol.id}`);

        let svgWrapper = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgWrapper.setAttribute("viewBox", symbol.getAttribute("viewBox"));
        svgWrapper.setAttribute("width", "50");
        svgWrapper.setAttribute("height", "50");
        svgWrapper.appendChild(useElement);
        container.appendChild(svgWrapper);

    });

    document.body.appendChild(container);
}

function renderJunkEmojisText(text) {
    text = text.replaceAll(/\[junk\](\d+)\[\/junk\]/gi, (match, id) => {
        let s = `<svg class="junk" width="${EMOJI_LENGTH}" height="${EMOJI_LENGTH}">`;
        s += `<use xlink:href="#junk-${id}"></use>`;
        s += '</svg>';
        return s;
    });

    text = text.replaceAll(/\[vnoise\](\d+),(\d+)\[\/vnoise\]/gi, (match, seed, splits) => {
        return new VisualNoise().generateVisualNoise(parseInt(seed), parseInt(splits));
    });

    text = text.replaceAll(/\[svg\](\d+)\[\/svg\]/gi, (match, id) => {
        return REUSABLE_SVGS[id];
    });

    return text;
}

// Symbolised relations. A relation phrase on the question side is drawn as one of a fixed set of
// glyphs, so the premises can be encoded without words to say them in. Each phrase keeps its glyph
// (stored in the profile), and explanations after a miss still show the words, so the glyph is learned
// against the phrase it stands for. Connectives (and / or / as ...) are not relations and keep their words.
const REL_GLYPHS = [
    '<circle cx="10" cy="10" r="7"/>',
    '<rect x="3" y="3" width="14" height="14"/>',
    '<path d="M10 2 L18 17 L2 17 Z"/>',
    '<path d="M10 1 L19 10 L10 19 L1 10 Z"/>',
    '<path d="M5 2 L15 2 L19 10 L15 18 L5 18 L1 10 Z"/>',
    '<path d="M8 2 H12 V8 H18 V12 H12 V18 H8 V12 H2 V8 H8 Z"/>',
    '<path d="M3 5 L5 3 L10 8 L15 3 L17 5 L12 10 L17 15 L15 17 L10 12 L5 17 L3 15 L8 10 Z"/>',
    '<path d="M2 8 H12 V3 L19 10 L12 17 V12 H2 Z"/>',
    '<path d="M18 8 H8 V3 L1 10 L8 17 V12 H18 Z"/>',
    '<path d="M8 18 V8 H3 L10 1 L17 8 H12 V18 Z"/>',
    '<path d="M8 2 V12 H3 L10 19 L17 12 H12 V2 Z"/>',
    '<path d="M10 1 L12.6 7.2 L19.2 7.6 L14.1 11.8 L15.8 18.2 L10 14.6 L4.2 18.2 L5.9 11.8 L0.8 7.6 L7.4 7.2 Z"/>',
];
// 12 shapes in 3 paints: 36 glyphs, enough for every relation phrase a session sees at once
const REL_PAINT = ['fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="2.4"', 'fill="#2e86ab"'];
const REL_CONNECTIVES = new Set(['and', 'or', 'as', 'that is', 'but', 'if', 'then']);

function relGlyphIndex(key) {
    const map = savedata.relSymbols || (savedata.relSymbols = {});
    if (!(key in map)) {
        const used = new Set(Object.values(map));
        let i = 0;
        while (i < REL_PAINT.length * REL_GLYPHS.length && used.has(i)) i++;
        // more phrases than glyphs: reuse, in order, rather than refuse to draw
        const cap = REL_PAINT.length * REL_GLYPHS.length;
        map[key] = i < cap ? i : Object.keys(map).length % cap;
    }
    return map[key];
}

function renderRelationSymbols(html) {
    return html.replace(/<span class="relation"><span class="is-negated">(.*?)<\/span><\/span>|<span class="relation">(.*?)<\/span>/g,
        (match, neg, plain) => {
            const text = (neg !== undefined ? neg : plain).replace(/<[^>]+>/g, '').trim();
            if (REL_CONNECTIVES.has(text.toLowerCase())) return match;
            const g = relGlyphIndex(text.toLowerCase());
            const glyph = `<g ${REL_PAINT[Math.floor(g / REL_GLYPHS.length)]}>${REL_GLYPHS[g % REL_GLYPHS.length]}</g>`;
            const cls = neg !== undefined ? 'rel-sym rel-sym-neg' : 'rel-sym';
            return `<span class="${cls}"><svg viewBox="0 0 20 20" width="1.15em" height="1.15em" fill="currentColor" aria-hidden="true">${glyph}</svg></span>`;
        });
}

function renderJunkEmojis(question, opts = {}) {
    const S = t => (opts.symbols !== false && savedata.symbolRelations) ? renderRelationSymbols(t) : t;
    question = structuredClone(question);
    if (question.bucket) {
        question.bucket = question.bucket.map(renderJunkEmojisText);
    }

    if (question.buckets) {
        question.buckets = question.buckets.map(bucket => bucket.map(renderJunkEmojisText));
    }

    if (question.wordCoordMap) {
        const words = Object.keys(question.wordCoordMap);
        for (const word of words) {
            const rendered = renderJunkEmojisText(word);
            if (rendered.length !== word.length) {
                question.wordCoordMap[rendered] = question.wordCoordMap[word];
                delete question.wordCoordMap[word];
            }
        }
    }

    if (question.subresults) {
        question.subresults = question.subresults.map(s => renderJunkEmojis(s, opts));
    }

    if (question.premises) {
        question.premises = question.premises.map(p => S(renderJunkEmojisText(p)));
    }

    if (question.operations) {
        question.operations = question.operations.map(p => S(renderJunkEmojisText(p)));
    }

    if (question.conclusion) {
        question.conclusion = S(renderJunkEmojisText(question.conclusion));
    }

    // The explanation carries the same stimuli as the item. Without this the drawn models and the
    // support lines show the raw [junk]/[vnoise] tags instead of the shapes the premises used.
    for (const field of ['support', 'premisesPlain']) {
        if (Array.isArray(question[field])) question[field] = question[field].map(renderJunkEmojisText);
    }
    for (const field of ['supportConclusion', 'explainHTML', 'title', 'modelNote', 'queryAnswers']) {
        if (typeof question[field] === 'string') question[field] = renderJunkEmojisText(question[field]);
    }
    // interrogate: the queries themselves carry stimuli
    if (Array.isArray(question.queries)) {
        question.queries = question.queries.map(q => ({ ...q, html: S(renderJunkEmojisText(q.html)) }));
    }
    // drawn models: { head, rows: [[word, value], ...] }   (needs: value is a list of words)
    for (const field of ['states', 'weights', 'needs']) {
        const m = question[field];
        if (!m || !Array.isArray(m.rows)) continue;
        if (typeof m.head === 'string') m.head = renderJunkEmojisText(m.head);
        m.rows = m.rows.map(([w, v]) => [
            renderJunkEmojisText(w),
            Array.isArray(v) ? v.map(renderJunkEmojisText) : v,
        ]);
    }
    if (question.lines && Array.isArray(question.lines.rows)) {
        question.lines.rows = question.lines.rows.map(([d, w]) => [d, renderJunkEmojisText(w)]);
    }
    if (question.regions && Array.isArray(question.regions.terms)) {
        question.regions.terms = question.regions.terms.map(renderJunkEmojisText);
    }

    return question;
}


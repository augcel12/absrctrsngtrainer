// Minimal Mode for everything: every premise, conclusion and query of every family at arity 2-5 is
// rewritten, and what is left in words is counted. Then each rewritten form is checked against its
// meaning by reading the signs back (for the families with a small, enumerable model) — see `read`.
// Should print `words left: 0` and no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/')); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    savedata.minimalMode = true; savedata.enableNegation = true;
    const gens = {
      linear: () => new LinearQuestion(arPick([LEFT_RIGHT, TOP_UNDER, MORE_LESS, BEFORE_AFTER, CONTAINS_WITHIN])).create(4),
      linearAna: () => new LinearQuestion(LEFT_RIGHT).createAnalogy(4),
      dist: () => new DistinctionQuestion().create(4),
      ring: () => arRingQuestion(4), hier: () => arHierarchyQuestion(4), diff: () => arDifferenceQuestion(4), itv: () => arIntervalsQuestion(4), psp: () => arPerspectiveQuestion(4),
      infl: () => arInfluenceQuestion(null, 4), ctx: () => arContextsQuestion(null, 4), req: () => arRequirementQuestion(null, 4), bal: () => arBalanceQuestion(null, 4),
      d2: () => createDirectionGenerator(4).question.create(4), d3: () => createDirection3DGenerator(4).question.create(4), d4: () => createDirection4DGenerator(4).question.create(4),
      syl: () => createSyllogismGenerator(4).question.create(4),
    };
    const left = {}, samples = {};
    let n = 0;
    for (const ar of [2, 3, 4, 5]) {
      savedata.arity = ar;
      for (const [name, f] of Object.entries(gens)) for (let i = 0; i < 30; i++) {
        let q; try { q = f(); } catch (e) { continue; }
        if (!q || !q.premises) continue;
        for (const h of [...q.premises, q.conclusion]) {
          n++;
          if (/negation-explainer/.test(h)) continue;   // instructions, not relations
          const out = minimalize(renderJunkEmojisText(h));
          const words = [...out.replace(/&[a-z]+;/g, "").matchAll(/<span class="relation">(?:<span class="is-negated">)?([^<]*[a-z]{2,}[^<]*)</g)].map(m => m[1].trim());
          const loose = out.replace(/<span class="subject">.*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').match(/\b[a-z]{3,}\b/gi) || [];
          for (const w of [...words, ...loose]) { const k = name + ' | ' + w; left[k] = (left[k] || 0) + 1; }
          if (!samples[name + ar] ) samples[name + ar] = [];
          if (samples[name + ar].length < 2) samples[name + ar].push(out.replace(/<span class="subject">(.*?)<\/span>/g, '$1').replace(/<span class="is-negated">(.*?)<\/span>/g, '[$1]').replace(/<svg[\s\S]*?<\/svg>/g, '⟨svg⟩').replace(/<i class="ci-([^"]*)"><\/i>/g, '⟨$1⟩').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ''));
        }
      }
    }
    return { n, left, samples };
  });
  console.log('rewritten:', r.n, ' words left:', Object.keys(r.left).length);
  for (const [k, v] of Object.entries(r.left).slice(0, 40)) console.log('   ', k, v);
  if (process.env.SAMPLES) for (const [k, v] of Object.entries(r.samples)) console.log(k.padEnd(12), v.join('   ||   '));
  console.log('page errors:', errs.length, errs.slice(0, 3));
  await b.close();
})();

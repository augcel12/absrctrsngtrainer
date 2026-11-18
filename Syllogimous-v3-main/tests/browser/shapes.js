// One example of every premise shape, words beside signs, as one page; plus invariant checks.
const { chromium } = require('playwright');
const OFF = { enableDistinction: false, enableLinear: false, enableSyllogism: false, enableAnalogy: false, enableDirection: false, enableDirection3D: false, enableDirection4D: false, enableAnchorSpace: false, enableBinary: false, onlyAnalogy: false, onlyBinary: false, enableMapping: false, enableInfluence: false, enableRequirement: false, enableContexts: false, enableBalance: false, enableRing: false, enableHierarchy: false, enableFmtName: false, enableFmtMissing: false, enableFmtRepair: false, onlyFormats: false, enableInterrogate: false, enableProbe: false, retryMissed: false };
const FAM = {
  distinction: { enableDistinction: true }, linear: { enableLinear: true, linearWording: 'leftright,topunder,comparison,temporal,contains' },
  syllogism: { enableSyllogism: true }, space2d: { enableDirection: true }, space3d: { enableDirection3D: true }, spacetime: { enableDirection4D: true },
  anchor: { enableAnchorSpace: true }, mapping: { enableMapping: true }, influence: { enableInfluence: true }, requirement: { enableRequirement: true },
  contexts: { enableContexts: true }, balance: { enableBalance: true }, ring: { enableRing: true }, hierarchy: { enableHierarchy: true },
  analogy: { enableDistinction: true, enableLinear: true, linearWording: 'leftright', enableDirection: true, enableAnalogy: true, onlyAnalogy: true },
  binary: { enableDistinction: true, enableLinear: true, linearWording: 'leftright', enableDirection: true, enableBinary: true, onlyBinary: true },
  interrogate: { enableLinear: true, linearWording: 'leftright', enableDistinction: true, enableDirection: true, enableRing: true, enableHierarchy: true, enableRequirement: true, enableInfluence: true, enableContexts: true, enableBalance: true, enableMapping: true, enableInterrogate: true, interrogateChance: 100 },
  formats: { enableDistinction: true, enableLinear: true, linearWording: 'leftright,contains', enableDirection: true, enableDirection3D: true, enableRequirement: true, enableBalance: true, enableInfluence: true, enableContexts: true, enableFmtName: true, enableFmtMissing: true, enableFmtRepair: true, onlyFormats: true },
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  const ex = {}, bad = [];
  for (const [fam, cfg] of Object.entries(FAM)) for (const arity of [2, 3, 4, 5]) for (const neg of [false, true]) for (const meta of [false, true]) {
    if (meta && !neg) continue;
    const r = await p.evaluate(({ OFF, cfg, arity, neg, meta, fam }) => {
      Object.assign(savedata, OFF, cfg, { arity: String(arity), enableNegation: neg, enableMeta: meta, symbolRelations: false, premises: 5 });
      const sig = h => {
        let s = h.replace(/<span class="subject">(?:[^<]|<(?!\/span>))*?<\/span>/g, '§');
        s = s.replace(/<span class="relation"><span class="is-negated">(.*?)<\/span><\/span>/g, '{~$1}').replace(/<span class="relation">(.*?)<\/span>/g, '{$1}');
        s = s.replace(/\{(~?)(?:is|will be|was) (?:(?:Above|Below)(?: and )?)?(?:North|South|East|West|North-East|North-West|South-East|South-West)? ?of\}/g, '{$1DIR}').replace(/\d+/g, '#');
        return fam + ': ' + s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      };
      const out = {}, bad = [];
      for (let i = 0; i < 30; i++) {
        init();
        if (!question) { bad.push('NO ITEM ' + fam + ' a' + arity + ' neg' + neg + ' meta' + meta); continue; }
        const parts = [...question.premises, question.conclusion, ...((question.queries || []).map(q => q.html))];
        for (const h of parts) {
          const sym = renderRelationSymbols(h);
          // invariants: every term still there; no relation phrase left in words outside meta
          const subj = x => (x.match(/<span class="subject">/g) || []).length;
          const among = (h.match(/>Among</g) || []).length;
          if (subj(sym) !== subj(h) - among) bad.push('terms changed: ' + h);
          const left = [...sym.matchAll(/<span class="relation">(?:<span class="is-negated">)?([^<]*)</g)].map(m => m[1]);
          if (left.filter(w => w !== '?').length && !/is-meta|It had|It was a|was one of its terms|Its conclusion|This was true|At least one of its premises/.test(h)) bad.push('words left [' + left.join('|') + ']: ' + h.replace(/<[^>]+>/g, ''));
          const k = sig(h);
          if (!out[k]) out[k] = [h, sym];
        }
      }
      return { out, bad: [...new Set(bad)].slice(0, 5) };
    }, { OFF, cfg, arity, neg, meta, fam });
    Object.assign(ex, r.out);
    bad.push(...r.bad);
  }
  const keys = Object.keys(ex).sort();
  console.log(keys.length, 'shapes;', [...new Set(bad)].length, 'problems');
  [...new Set(bad)].slice(0, 30).forEach(x => console.log('  ', x.slice(0, 260)));
  if (process.env.ROWS) require('fs').writeFileSync(process.env.ROWS, JSON.stringify(keys.map(k => [k.split(':')[0], ex[k][0], ex[k][1]])));
  let n = 0;
  console.log('errors', errs);
  await b.close();
})();

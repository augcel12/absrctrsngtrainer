# Changes in this fork

Four question classes added, each built the same way as Distinction (a branching tree of
premises, answer read off the model the tree defines). Toggle them in Settings, below Space 3D.

- **Influence**: "A varies directly / inversely with B". Asks: if A increases or decreases, what does D do?
- **Requirement**: "A requires B" (A can only work if B works). Asks: if X fails, must Y fail? If X works, must Y work?
- **Contexts**: "Under X: A is same as B" / "Under Y: A is opposite of B". Unmarked premises hold in both
  contexts. The asked pair always depends on a context-specific premise, so the answer differs between contexts.
- **Balance**: "1 A balances 3 B" (A weighs 3 times B). Asks: do p A balance q D?

Files touched: `js/generators/extra-relations.js` (new), `js/constants.js`, `js/index.js`,
`js/progress.js`, `index.html`.

`tests/check-extra-relations.js` generates items with the real app code, parses the rendered
premises back into relations, and brute-forces every answer independently. Run it after any change.

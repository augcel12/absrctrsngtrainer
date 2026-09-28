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

## Generative answer formats

Five answer formats that replace TRUE/FALSE with an answer you have to produce. Toggle them in
Settings below the relation types. They use whichever relation types are enabled above them
(Distinction, Linear, Space 2D/3D, Influence, Requirement, Contexts, Balance; not yet Syllogism,
Binary, Analogy, 4D or Anchor). "Only answer formats" turns the TRUE/FALSE items off.

- **Judge**: necessary / possible / impossible. Each answer is equally likely.
- **Name the relation**: pick the relation between two terms, or "can't tell".
- **Build**: tap together a premise that would make the target true.
- **Missing link** (free response): a premise was removed; type one that makes every listed fact true.
- **Repair** (free response): the premises contradict; type a rewrite of one premise that fixes it.

Any answer that works is accepted, not just the one the generator removed. In Space items,
premises are one-step moves and questions/facts are directions, as in the rest of Syllogimous.

Files: `js/generators/formats.js` (engine and items), `js/format-ui.js` (answer panel), plus small
hooks in `js/index.js`, `js/constants.js`, `js/progress.js`, `index.html`, `css/styles.css`.

`tests/check-formats.js` compares the answer engine with a brute force that enumerates every model
on thousands of random premise sets, then checks generated items (keys, that a working answer
exists and is accepted, that the target isn't already forced, and that rendered premises read back
exactly). Run it after any change.

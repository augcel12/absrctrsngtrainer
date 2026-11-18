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
- **Missing link**: a premise was removed; build one that makes every listed fact true.
- **Repair**: the premises contradict; rewrite one premise so they fit together.

(Judge and Build were cut later. Missing link and Repair are answered by tapping two terms in order and
picking the relation — a 3×3 direction pad for Space — rather than typing it.)

Any answer that works is accepted, not just the one the generator removed. In Space items,
premises are one-step moves and questions/facts are directions, as in the rest of Syllogimous.

Files: `js/generators/formats.js` (engine and items), `js/format-ui.js` (answer panel), plus small
hooks in `js/index.js`, `js/constants.js`, `js/progress.js`, `index.html`, `css/styles.css`.

`tests/check-formats.js` compares the answer engine with a brute force that enumerates every model
on thousands of random premise sets, then checks generated items (keys, that a working answer
exists and is accepted, that the target isn't already forced, and that rendered premises read back
exactly). Run it after any change.

## Symbol relations, five-term premises, robustness (Nov 2026)

**Symbol relations drawn as pictures** (`js/generators/notation.js`). The setting used to swap each
relation phrase for an arbitrary shape (● for "is left of", ★ for "is over", arrows for "Exactly 2
of"), with no key. Now each relation is drawn as a small picture of itself, under one rule: the filled
dot is the term written before the sign, the hollow dot(s) the term(s) after it. ●○ is "left of", ○●○
"between", a 3×3 compass with the filled dot where A is for directions (side and time tracks for 3D
and space-time), half-filled discs for same/opposite, ⇈ ⇅ for influence, Euler circles for
syllogisms; logic for the rest (⇔ exactly when, ⇒ requires, ∨, ∧, ¬, a circled number for "exactly N
of"). Red still means invert, a slash means not. The key is under the setting, and after a miss each
premise is shown in signs with its words underneath. It is a display-time rewrite of the generated
HTML, so it cannot change what an item means; anything it doesn't recognise keeps its words.
Interrogate questions and the answer panels (relation chips, direction pad) use the signs too.

**Arity 5 is real** for Linear, Space 2D/3D/space-time/anchor, Distinction, Influence, Contexts and
Ring, which used to step down to 4 (and took 1–6 s per item trying): "Exactly one of A, B and C is
between D and E", "Exactly 2 of B, C, D and E are left of A", "Among A … E, A is at one end", the same
per axis in space, "Exactly 2 of B, C, D and E are same as A", "Exactly one of A, B and C lies on the
clockwise way from D round to E". At arity 5 the other premises mix two-, three- and four-term ones.
Analogy and Mapping stop at 4 and say so on the item.

**Fixed**
- Ring at the classic setting failed to build at 2 premises and at 6+ (and at arity 3 from 9), which
  left the previous item on screen with the clock stopped. It now has 4+ seats, up to 7, and a second
  two-term fact ("is not the next one clockwise after").
- Any generator that can't build now draws again instead of stalling; settings that allow no item say so.
- Answer formats froze the tab past ~9 premises: their explanation enumerated every order of 10+ terms.
  It now reads the arrangement straight off the premise graph; the arity engines are only used for
  k-ary premises, on at most 8 terms (6 for space).
- Missing link at arity 5 with two premises built a five-term fact out of four words and broke the panel.
- Balance could never reach arity 3+ at 7+ premises (six independent weighings on seven weights).
- Space-time could word a same-place relation "SED was  of NAT"; it now says "was at the same place as".
- Interrogate gives partial credit to the level: two of three right counts two thirds (only a clean
  sweep counts as right in the history and score). The explanation marks each question.
- The arity help still said the dial scales the time; it doesn't.

`tests/browser/` holds the checks used for this pass (see its README).

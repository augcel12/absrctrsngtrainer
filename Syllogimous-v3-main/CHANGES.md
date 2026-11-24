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

## Three new relation types, step-by-step explanations, symbol mode removed (Nov 2026)

**Symbol relations are gone.** The setting, `notation.js`, its key and its styles are removed; premises
are words again everywhere.

**Three relation types**, each built on the arity engines, so each runs at every arity (2 to 5) and works
with Interrogate and recall probes. Settings → Relation types, now grouped as *Order and space*,
*Quantity* and *Logic and structure*.
- **Difference** (`js/generators/difference.js`): amounts related by how much. "A is 3 more than B";
  3: "A and B together are 4 more than C", "A is halfway between B and C"; 4: "A is as much more than B as C
  is more than D", sums against sums; 5: three against two. Exact linear algebra (an equation per premise,
  entailment = lying in their span). The additive partner of Balance, which multiplies.
- **Intervals** (`js/generators/intervals.js`): stretches of time with a start and an end. "A is wholly
  before B", "A overlaps the start / end of B", "A lies within B", "A covers all of B", plus endpoint facts
  ("A starts before B starts", "A and B overlap"); 3: "A comes between B and C", "A overlaps B or C", "A, B
  and C are never all going at once"; 4: "exactly when", counts; 5: counts over four, "exactly one of A, B
  and C comes between D and E". Every endpoint order is enumerated (up to five spans).
- **Perspective** (`js/generators/perspective.js`): every term faces its own way, and positions are given
  from the named term's point of view: "B is ahead and to the left of A", "A faces a quarter turn right of
  B"; 3: "From A: B and C are on the same side", "From A: B is further left than C"; 4: "From A: B is between
  C and D, left to right", counts; 5: "From A: exactly 2 of B, C, D and E are on the left". The engine runs
  one Space problem per way of turning the terms (the first fixed). Turn-only questions (pure quarter-turn
  arithmetic) are never asked. Negation mirrors left and right.

**Gaps filled in existing types**: Ring has "A sits directly across from B" (even rings); Hierarchy has "A is
directly over B".

**Explanations now show how the answer follows** (`js/generators/derive.js`). For every item built on the
arity engines the explanation is a short proof: from the premises that settle the conclusion, each step
adds a simple fact that follows from at most two things already known (three when a count needs its cases
closed), until the conclusion follows; only the steps the last one leans on are kept. Every step is checked
by the engine. When no short proof turns up in 350 ms the premises that settle it are listed instead.
Classic two-term items show the chain of premises linking the two terms, in order.

The drawings are labelled: orders say which end is which (left/right, top/bottom, least/most,
earliest/latest, outermost/innermost); space grids carry the compass, 3D is drawn as flat layers
(highest to lowest), space-time as moments; Ring is drawn as a circle with the clockwise arrow; Difference
as a number line; Intervals as bars on a timeline; Perspective as a grid with each term's facing arrow.
Engine-built arrangements are labelled "one arrangement that fits". The window scrolls, and the history's
Explanation button now opens the same window on click (it used to be a hover pop-up that cut long ones off).

**Settings** are grouped under section headings (Difficulty, Item modes, Progression, Stimuli, Premises,
Relation types, Answer formats, Appearance) and set in one typeface.

**Fixed**: removing the symbol hook had left `renderJunkEmojis` passing an undefined variable to Binary
sub-items.

Checks: `tests/browser/families.js` (new; wording read back and answers re-derived independently for the
three new types — exact rational elimination, every endpoint order, every arrangement), `wording.js` now
also reads Hierarchy and the new Ring wording (6.5 million checks, 0 wrong), `e2e.js`, `sweep.js`,
`play.js`, `check-formats.js`, `check-extra-relations.js`.


## Pictures and Possible arrangements (Nov 19 2026)

- **Pictures** (Item modes): every premise and the conclusion are drawn as the arrangements they allow,
  with the terms placed in them — rows along the relation's own line (left–right, top–bottom, rising
  steps for more, a time arrow, boxes inside boxes for contains, W–E / N–S / ▲▼ for compass lines), a
  dashed box for "any order", a number on it for "exactly that many here", panels side by side for "any
  one of these", a crossed panel for "can't be", a 3×3 grid for directions, two halves for same /
  opposite, two dotted arrows for "the same way". Covers Linear (all five wordings), Space 2D/3D/space-
  time, Distinction and Influence at every arity; with it on, arity 2 is built by the arity engine too
  so it can be drawn. Families without pictures keep their words.
- **Possible arrangements** (Item modes): study, hide the premises, then judge drawn arrangements of
  every term as possible or impossible. Every impossible one breaks exactly one premise. Linear, Space,
  Distinction, Influence, Ring, Hierarchy.
- `tests/browser/pictures.js`: every picture read back as a rule and compared with its fact's truth
  function on every enumerated arrangement (53k facts, 258M checks, 0 wrong); Possible-arrangements
  answers re-read from the drawn arrangement and re-checked against the premises (792 queries, 0 wrong,
  every impossible one breaks exactly one premise).

## Minimal Mode for everything (Nov 19 2026)

Minimal Mode used to cover only two-term premises. `js/generators/minimal.js` now rewrites every
premise, conclusion and Interrogate query into signs at display time: every arity form (between ∈,
at one end ∉, counts ②{…}, ⇔, ∨, ∧), every type (Space, Distinction, Influence, Requirement, Balance,
Contexts, Ring, Hierarchy, Difference as equations, Intervals, Perspective, Syllogism as set
notation). Red still means inverted. The key is in the Minimal Mode tooltip. `tests/browser/minimal.js`
rewrites 10,590 premises across every type at arity 2–5 and counts what is left in words (0).

## Removed: anything that could weaken the core training (Nov 24 2026)

- **Pictures** — a drawn arrangement hands you the model you are supposed to build from the premises.
- **Possible arrangements** — each impossible arrangement broke exactly one premise, so it could be
  answered by checking premises one at a time, without ever integrating them.
- **Minimal Mode** (the stock two-term version and the extension to everything) — signs cut the
  decoding cost while the progression stayed tuned to word items, so the level could climb while
  the real load fell.
- **Recall probes** — knowing an earlier item may be asked about splits attention between holding
  old arrangements and building the current one.
- **Retry missed items** (was on by default) — a returning true/false item can be answered by
  recognising it and flipping your last answer. A miss now goes straight to the explanation.
- **Time multipliers** — Interrogate stretched the clock by its number of questions (×2 at 3) and
  Mapping doubled it. Interrogate only rides arity-engine items, so raising arity to 3 made the clock
  jump. Now every item gets the same clock. Interrogate's clock covers the study and freezes when
  the premises are hidden; answering is untimed, and the progression records the study time. Its
  separate time override is gone (it uses its type's clock, which the progression moves).

## Auto progression rebuilt: per-type levels, perfect runs kept (Nov 24 2026)

The old default moved every type together on one pooled 20-item score, so easy types carried hard ones
(in a simulation, the hardest of five types was really solved 13% of the time, the easiest 92%), and a
premise was only added once the whole item fit near a flat 10 s goal, which capped load by speed.

- **Each type has its own level** (premises and time) **at each arity**. Moving the arity dial stores the
  levels under the old arity and brings back the new arity's; an arity met for the first time starts from
  the levels you had.
- **Up takes a perfect run**: 20 right in a row (setting) across the mixed stream, each item at its own
  type's level; one miss anywhere breaks it. When a run completes, every type in it that was right 3+ times
  in a row at its level goes up; the rest keep their count for a later run.
- **Down is charged to the type that missed**: 2 misses in its last 8 items step that type down, only it.
- **Load first**: up adds a premise (and its time) once the time limit is within the budget per premise
  (setting, 10 s); until then it takes time off. Down adds time while it stays under 1.5× the budget per
  premise, then drops a premise.
- Removed: success/failure %, grouping and timer-mode settings. The bar under the item shows the run.
- In simulation every type settles at the same accuracy (~87% observed, ~74% really solved), stricter
  than the old 20/20 rule on a single type (~84% observed, ~68% solved).

`tests/browser/progression.js` drives the rule directly.

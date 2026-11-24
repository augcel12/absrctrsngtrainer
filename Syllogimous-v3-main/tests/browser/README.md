# Browser checks

These drive the real page in headless Chromium (Playwright). Serve the repo root first:

    python3 -m http.server 8771        # from the repository root
    node tests/browser/<check>.js      # URL=... to point elsewhere

- `wording.js` — every k-ary fact (2 to 5 terms, premises and conclusion candidates, negation on and
  off) is rendered, read back by a reader written from the English, and compared with the fact's own
  truth function on random arrangements. Should print `wrong 0`; `unread` is only the two-term compass
  directions, which it does not parse.
- `families.js [reps]` — Difference, Intervals and Perspective: every shape's wording read back by an
  independent reader, and answers re-derived independently (exact rational elimination, every endpoint
  order, every arrangement with every way of facing). Should print zeros in every wrong column.
- `e2e.js` — items built at every arity, answers re-derived by enumerating every arrangement; also
  checks the hidden arrangement satisfies the premises, the support contains a top-arity premise and
  no single premise settles the conclusion. Should print all zeros.
- `sweep.js [n]` — every family and answer format at arity 2–5 and 2–12 premises: items that fail to
  build (`:k`), throw (`T`), step down in arity (`d`, expected for Analogy, Mapping, Repair) or take
  over 500 ms. Should end with `errors []`.
- `play.js [items] [accuracy] [arity]` — plays through the buttons with everything on
  (formats, interrogate, explanations, auto progression). Should print `stalls 0`
  and `errors []`.

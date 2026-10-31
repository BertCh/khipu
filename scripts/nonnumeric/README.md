# The non-decimal khipus — analysis notes

*19 September 2026.* A corpus-wide scan for cords that break the Inka base-ten
knot grammar, the families the breaks fall into, and what code-breaking methods
(rival readings scored by arithmetic, n-grams, entropy, permutation tests on
every recorded cord attribute) do and do not find in them. The full write-up
with figures and per-khipu tables is published as a report:
<https://claude.ai/artifact/CQujHgzYKK2EKprJiBcnNH>. This file is the durable
summary; the scripts below reproduce every number.

## Findings

**Census.** 3,384 of 43,262 knotted cords (7.8 %) break the grammar: a long or
figure-eight knot above a single-knot cluster (608), two or more such unit knots
on one cord (3,068), a long knot of more than nine turns (157), a single-knot
cluster of more than nine (17). They are spread over 301 khipus but concentrate:
of 597 khipus with at least eight knotted cords, 313 have no such cord, 83 have
15 % or more, 55 have 25 % or more. The Aschers' notes in the OKR declare only
seven khipus unreadable (KH0015, KH0047, KH0048, KH0094, KH0100, KH0108,
KH0584). Benford fit barely tracks grammar violation (r = −0.19): small-value
registers fail Benford while being perfectly decimal.

**Family one — canuto khipus (KH0280, 0281, 0282, 0288, 0289 = UR050–055;
KH0271, 0346, 0348, 0384; KH0103 a small cotton relative).** Camelid,
thread-wrapped cord bundles, only long knots, in two to four fixed horizontal
bands (consecutive knots on a cord overlap in height on 0–3 % of cord pairs;
band height does not scale with cord length). Positional but not decimal: turns
pile on 4–7, no knot under 3 turns in KH0280's 400, no empty band on 133/135
of its cords, knots of 10–15 turns on KH0282/0289. No reading produces sums
above chance: sum of turns z −1.45, positional base ten z −0.23, reversed
z −0.42, and 21 further readings (bases 5, 6, 10; digit offsets 0, 2, 3; both
directions) pool within z ±1. Conklin's base-five proposal fits no better (a
base-five digit runs 0–4). The one real structure is the bundle: cords in the
same canuto have turn totals closer than shuffled (z −2.8 to −7.1 on seven
khipus), the similarity sits in the top band, and bundles are monochrome.
Reading: a tally kept per bundle, each band a separate field of roughly 3–8;
what the fields count is not recoverable here. Nothing in the corpus dates
them; the Wari attribution rests on construction.

**Family two — long knots at every height (KH0100 + KH0108 one hand; KH0001,
0415 Chuquitanta; KH0431, 0441 Berlin; KH0676 Brooklyn; KH0015).** 40–70 % of
unit knots sit above the lowest cluster; P(long knot below single) 0.38–0.49
against 0.85–0.96 on orthodox khipus. Six readings (KFG value, tally,
bottom-up place value, band digits, turn sum, cord-local digits) scored by sum
cords, subsidiary sums and equal group totals all sit at chance (pooled z −1.3
to +1.4; the three cells near z 3 dissolve at 1,000 shuffles across 108 tests).
No attribute marks the scrambled cords (attach, twist, colour, direction,
ordinal in group, subsidiaries, level: nothing at p < 0.01 on ten khipus).
The Aschers rejected KH0047/0048/0584 for inconsistent *heights*, not order:
a lone cluster sits at the same height whether `8S` or `8L`, so the type
carries the tier. The Gaffron donation is not one convention (KH0102/0105/
0106/0107/0109 are orthodox; KH0103 has no single knots). KH0094 is quai
Branly, not Munich.

**Family three — a spelling and a channel.** `nL E` (731 cords, 162 khipus;
KFG units = turns + 1): never exclusive, plain `(n+1)L` dominates everywhere
(KH0507 39 vs 143), the E sits 1–5 cm under the L inside the units band, share
depends on the transcriber (Urton 4 %, one Strauss khipu 48 %); no attribute
association survives 1,000 permutations except `9L E` = 10. Knot direction:
set by knot type per khipu (singles/long Z/Z on 155 khipus, S/S 84, Z/S 46);
only 40 khipus mix long-knot direction, and there the signal is block-wise runs
along the primary (production episodes). KH0607 is the one khipu where
long-knot direction tracks recto/verso (24 Z/17 S vs 8 Z/79 S), one hit in 32
tests. Recorder confound: long knots 100 % Z in Locke, 92 % Clindaniel,
22 % Quave, 0 % Thompson. This agrees with `/stories/which-way-the-knot`.

**Family four — rare knot forms.** SP spiral (218) = the Berlin way of tying a
2–3-turn long knot, value = turns (KH0431 ties `2SP` 83× and `2L` 3×); TF
tufted (128, KH0449 only) = tally tufts with ordinary place value; EE = 1
(118/118); LL = 3 on the Dauelsberg pair KH0082/0083; BL = turns (11/11).
None appears only on a colour, side or ply. U = untyped placeholders, except
KH0417/KH0418 (Cajamarquilla): Urton typed their knots by size only (A/B/C),
values all 0, 28 cords, no repeated sequence — the only genuinely unread
material.

**Information theory (37 non-numeric vs 211 numeric khipus, level-one
pendants as signs).** Types per token 0.37 vs 0.34, Zipf −0.75 vs −0.74,
H1 3.78 vs 3.60 bits, H2/H1 0.42 vs 0.38 (all n.s.); H2 against order
shuffles z −2.1 vs −3.4 (p 0.03) and 3-gram repeat z +1.2 vs +4.1 — the
non-numeric set is *less* sequentially ordered. Its only larger inventory is
knot-type orders (131 vs 24); on colour it has fewer types (0.11 vs 0.13 per
token) and a steeper Zipf slope. Colour predicts the knot string on 7/32
non-numeric vs 11/24 large numeric khipus. No positional syntax (first-in-group
matters on 1/33). No script signature; conditional entropy cannot diagnose one
anyway (the Indus-script caveat).

## Data caveats

- The KFG values the seven Ascher-declared khipus under three rules: singles
  place-valued from the bottom plus turns (KH0100, KH0108); a tally with every
  single = 10 wherever it sits (KH0001, 0015, 0431, 0441, 0584); digits by band
  (KH0103, KH0676). Corpus totals, Benford fits and sum searches that include
  them mix rules. KH0047's note says so: "all knots on the database are given
  a value."
- Spiral knots are counted two ways: turns in the Berlin workbooks, number of
  knots (each with place value) in the Incahuasi ones (KH0500 p32: nine spiral
  knots at the tens = 90). Normalise before summing.
- KH0280 was reconstructed from Clindaniel's thesis notes with one cord per
  cluster defaulted; Urton: "knots are extremely difficult to read".
- 12,978 knots have no recorded direction; direction share by contributor
  spans 0–100 %.
- No khipu in these families carries a date.

## Follow-ups

- Re-examine KH0417/KH0418 (AMNH) with knot types recorded.
- Date the canuto set; compare band by band with Splitstoser's Castillo de
  Huarmey Wari khipus (not in the KFG). Inside the corpus, test whether canuto
  size (4 vs 6 cords) predicts band values.
- Test direction on the 40 mixed khipus with the recorder held fixed; KH0607
  on its own.
- In the app: badge the seven Ascher-declared khipus and the canuto set with
  the rule behind their values, and keep them out of corpus sums.

## Scripts

All read `public/data/khipus/*.json` (and `data/okr/data/khipu.db` where
noted). Run `scan_grammar.py` first: it writes `scan_rows.json` /
`scan_cords.json` next to itself, which `sign_entropy.py` reads. Shuffle tests
are seeded; associations are permutation chi-square.

| script | what it does |
|---|---|
| `scan_grammar.py` | per-cord decimal-grammar flags, per-khipu violation fraction and S-vs-unit position AUC |
| `canuto_family.py` | family one: bands, turn distributions, additive vs positional readings vs shuffles, bundle coherence (OKR db) |
| `canuto_offset_readings.py` | 21 offset / base-5-6-10 positional readings of the canuto set vs shuffles |
| `long_above_single_family.py` | family two: signatures, bands, six value readings vs shuffles, attribute associations, the Gaffron set (OKR db) |
| `le_compound_and_direction.py`, `long_knot_direction.py` | family three: the `nL E` compound and knot direction as a channel |
| `rare_knot_types.py`, `rare_knot_types_followup.py` | family four: position, value rule, substitution, associations (OKR db) |
| `sign_entropy.py` | sign inventory, Zipf, H1/H2, repeats, feature MI: non-numeric vs numeric (about 4 minutes) |

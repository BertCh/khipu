# Matching: review and roadmap

*Revision 2, 2026-10-31.*

**How this was put together.**
- Three code reviews: the exact-scan pipeline; the tolerant, structural and arithmetic matchers; the `/matching` explainer series.
- Five surveys of current practice: bioinformatics alignment; text reuse and record linkage; ancient record systems and the khipu literature; the statistics of discovery; time-series, graph and ML matching.
- A feasibility prototype of the Phase-1 statistic and its nulls.
- An adversarial critique of draft 1, whose edits are folded in.

Agent notes and check scripts are in this session's scratchpad (`r1/ r2/ r3/ proto/ s1–s5.md`). Re-create the prototype before relying on it; it is not in the repo.

---

## 0. Summary

### Where we are
Matched khipus are found three ways:
- an exact seed-and-extend scan, judged against a three-shuffle noise floor;
- a slip-tolerant Smith–Waterman aligner and about thirty purpose-built screens (`scripts/deep/`, `link_screens.py`);
- hand-written correspondence rules for each story (`build_strands.py`).

Links are graded firm, likely or open by hand. **No firm link fell under any check run for this review.**

The machinery has three problems:

1. **There is no significance level calibrated for the size of the search.**
   - About 233k pairs (466k oriented) are compared. The floor rests on 3 shuffles; at 200 shuffles the ≥6 floor is 0.31, not 0.7, and the =5 floor is 2.1, not 1.3.
   - Run length is the score, so in 6 of the 24 "≥6" pairs some of the length is matched zeros.
   - Pairs found by the screens have no error rate.
2. **One relation is defined ten ways.**
   - "Near" has ten definitions, and the register-slip test accepts 200 vs 900.
   - Field maps, chunk sizes and unit pairings are chosen by hand per story. They are then reported as best-of-720 figures, with no allowance for that choice in the null.
   - No rule learned on one pair has been tested on another.
3. **Some relations are invisible by construction.**
   - The exact scan cannot see reordering, transposition, scaling, totals→heads chains, folded copies (subsidiary ↔ pendant), slips, extra top cords or short excerpts.
   - The prototype confirms this: 24 curated links never appear in the exact scan.

### What the prototype showed
Score each pair by **information content in bits**, and judge it against the **highest score in each null corpus**.

- Above about 35 bits, no null corpus produces a single comparable pair. Twenty observed pairs are there, and all of them are curated links.
- Below 25 bits, the pairs are indistinguishable from noise.
- All 31 pairs found only by the scan fall below the family-wise line.
- The shuffle nulls leak real copies back into themselves. KH0140/KH0483 is the highest null pair, and KH0097/0586 recurs in 33 of 500 corpora. A relabelling null does not leak.

### What other fields offer
- E-values from sequence search
- target–decoy FDR from proteomics
- compression and description length from information theory
- Fellegi–Sunter evidence weights from record linkage
- stemmatics and phylogenetic networks from philology
- likelihood-ratio reporting from forensics
- the Matrix Profile from time series
- small transformation languages with search-size accounting from program synthesis

Their common lesson: **score a pair by how many bits a copy model saves over a null that keeps khipu
structure; calibrate that score with decoys and planted copies; report it on a fixed scale.**

### An external project overlaps ours
Vladimir Muravev's *khipu-links* (github.com/VladimirMoor/khipu-links, MIT licence; created 2026-09-29; preprint v4; built with Claude) reached several of our links independently:
- AS175 → UR233/UR232
- Basel = UR212 + AS131
- AS118 groups 2–3 = UR218
- UR053C → UR053B, folded
- KH0049 → KH0362
- the 1430/670/3410/820 lot on AS149/AS179

It reports results we don't have:
- AS143 g4 = AS149 g1 + g2, a vector sum (KH0159/KH0165)
- AS118 subsidiaries = AS125 group totals (KH0132/KH0140)
- UR270 → UR278, folded (KH0507/KH0517)
- AS069/AS070, transposed sums (Thompson 2024; KH0082/KH0083)
- a place-set deduction rule across UR269. We have only the KH0506↔KH0514 deduction.

Its baselines (offset ±d, group-order shuffles) are stronger than ours. It also cites prior work we have not read: **Chirinos 2010 already published KH0049 → KH0362, which `links.ts` marks "not found"**.

Both projects use the same transcriptions and similar AI-assisted heuristics, so where they agree, that is *concurrent agreement*, not independent replication. The stance should be collaborative (§6).

### Phases
**Durations; about 20–24 weeks in total.**

| Phase | Length | Work |
|---|---|---|
| 0 | 1 week | Fix defects and citations; send corrections to the explainer series; contact the *khipu-links* author |
| 1 | 3 weeks | Calibration and cheap orthogonal evidence: bits and corpus-max nulls, a frequency-matched relabelling null plus empirical negative pairs, decoys, a power curve, the frozen benchmark, blind recall against external results, the diagonal/transposed scan, containment, cord length, a rater-agreement study |
| 2 | 6 weeks | One relations module, slip seeds, a corpus-wide tolerant scan with E-values, a *small* copy model with elicited priors, field-map search with the selection inside the null, sum matching, a computed level rubric |
| 3 | 8 weeks | More than two records: multiple alignment of sets, hierarchies, phylogenetic networks, copy direction tested against dates |
| 4 | ongoing | Discovery campaigns, preregistered in `/next` |

---

## 1. Review: where matching stands

### 1.1 Pipeline map

| Layer | Code | What it models | How it is validated |
|---|---|---|---|
| Exact scan | `shared_passages.py`, `build_links.py`; TS `engine/tests/passages.ts` | Runs of ≥4 or ≥5 identical consecutive level-1 values, forward and reversed | 3 whole-sequence shuffles give the floor for each tier |
| Screens | `link_screens.py` (leaders, four-of-five, near, bigvalues, groups, colours, subs, window4) | Leader sequences, order-free group multisets, ±2% values | 0–3 shuffles per screen; nulls not like-for-like |
| Tolerant alignment | `scripts/deep/align_*.py` + `align_sw.c`; TS `engine/tests/align.ts` | Local copy with slips, blanks, indels; flattened subsidiaries; derived sequences | 20 within-group shuffles; z with an ad hoc sd floor; threshold from **1** held-out replicate; raw Gumbel p |
| Arithmetic | `arith_*`, `tree_*`, `graph_*`, `vocab_*`; TS `chains.ts`, `sums.ts` | Totals→heads chains, ratios, sums, subtree matches, rare-value overlap | Mixed: some within-khipu, some corpus-wide (anti-conservative), some magnitude-binned |
| Rules per story | `build_strands.py` (~20 builders), `tied_twice.py`, `paris_lima_pair.py`, `basel_fragments.py` | Field maps, blank slots, chunking, unit pairing, reversal, scale windows | Values re-checked only; no null that allows for the choice of rule |
| Graph and levels | `links.ts` (`CURATED`, `buildGraph`, `prior`) | Levels firm/likely/open; kinds account/derived/object | By hand; literature audit recorded in `prior` |
| Engine | `/next/proving-ground` (`engine/*`) | Seeded nulls, an α-investing ledger, 23 judged tests | Screen-found pairs are left unjudged by design |
| Explainers | `/matching` (5 chapters, `lib/matching/*Trace.ts`) | Teaching traces that must equal the engine | `check_traces.mts` (8 checks) plus the reviewer's parity runs; all pass except the traceback |

### 1.2 Defects (Phase 0)

**Exact-scan pipeline**

1. **`buildGraph` collapses forward and reversed rows.** `scanByKey` is keyed by the unordered pair (`links.ts:893,900`), and the scan loop can also emit duplicate ids (`:904`). Latent: no such pair exists today. Fix: keep both rows, merge their spans, dedupe the ids.
2. **Zero padding inflates run length.**
   - Extension runs through matched zeros. Blanks cluster: P(0 | previous cord 0) = 0.64, against P(0) = 0.31. The shuffle scatters them.
   - The shuffle predicts 0.13 zero-padded ≥6 pairs; six are observed. They are KH0141/0464, KH0192/0469, KH0253/0620, KH0464/0674, KH0369/0677 and **KH0192/0470**. The last is the firm tied-twice link; its scan run is 7 cords, of which 5 are nonzero.
   - Fix: score in bits, with zeros counting 0 (A1).
3. **`values` double-counts overlapping spans** (`build_links.py:104`). KH0097/0586 shows 99, but only 35 distinct cords match. Use the union of matched cords.
4. **Top cords are in the scanned stream** (`shared_passages.py:37`), but `cross_khipu_analysis.py` uses pendants only. Choose one rule and document it.
5. **Khipus that are not decimal are scanned.** 5 of the 27 four-run pairs involve them. The exclusion set exists as `EXCL = WARI | UNREADABLE` (`align_scan.py:53`) and `NOT_DECIMAL` (`scripts/next/build_corpus.py`); apply one shared set everywhere.
6. **`link_screens.screen_near` puts every value ≥100 in one bucket.** The bucket key (`:205-206`) is the constant 25 there.
7. **The `fourfive` null leaves out the leader sequences** that the observed scan includes, and uses 2 shuffles (`:284-293`).
8. **`seqWithin` lets real copies leak into the null.** Small groups barely permute, so KH0140/0483 reappears above 40 bits in 6 of 15 replicates. Label it as conservative in a way that depends on group size, not as a default.

**Tolerant and structural matchers**

9. **`align_flat.py:37-46` tests reversed alignments against forward shuffles.** It is one draw against the maximum of two orientations, so it is anti-conservative.
10. **`arith_chain.py` and `chains.ts`.** The longest-chain step maximises length *including* any-digit variants, so exact hits are undercounted. The docstring says top cords are included; the code uses pendants only.
11. **`build_strands.py`.**
    - In scaled links, equal pairs and blank pairs fall into `exact`/`blank` and are counted in `AGREE`.
    - The KH0505/0514 ratio window is 2.5–6.5 in code (`:604`), but the rule text says 2.8–5.7 (`:600`).
    - KH0067/0403 bypasses `pairs()`.
    - The indices 29−i / 28−i are hard-coded.
    - Ungrouped cords (key −1) sort first.
12. **Python and TypeScript have drifted apart.**
    - Information content is computed differently in `align.ts` and `align_scan.py`, and transpositions of 6-digit values are handled differently.
    - Top cords are included by some matchers and not others.
    - `totals_to_heads` is greedy and exact-only, while `arith_chain` takes the longest chain and allows slips.
13. **Stale `KNOWN` lists** (`align_scan.py:58`, `vocab_common.py:15`) still pair KH0133, the KFG data error.
14. **`align_scan.py` writes its results to an old session scratchpad.**

**Explainer series** (for the session building `/matching`)

15. **`swTrace.walkBack` loses track of which gap state it is in.**
    - Of 2,000 synthetic alignments, 171 print a path whose score ≠ `best.score`; so do 6 of 40 real pairs at slider settings. The Python traceback (`align_scan.py:261-296`) is correct.
    - Add a test to `check_traces` that rescores the printed path.
16. **The knot-register sentences are inverted** (`seed-and-extend.tsx:108-116`, `KnotExamples.tsx:22`). The units sit *furthest* from the primary cord.
17. **"The strictest null"** (`against-chance.tsx:103`) is wrong: the whole-sequence shuffle is the *least* conservative.
18. **"The exact same loop everywhere"** is false. The floor comes from Python `random`, `chance.json` from numpy, and the engine uses mulberry32.
19. **`sums.tsx:153` calls KH0081's 161 sums "not unusual".** The data says z 8.77, p 0.005.
20. **The relation-1 rule is described wrongly.** Every later nonzero cord is tried as a start, and a first landing of the wrong size blocks the sum (`chance.ts:217-228`).
21. **The dot-plot prose says the filter removes dots.** It removes only the diagonals (`DotterFigure.tsx:31`).
22. **The window rule doesn't say that 0 counts as a distinct value.**
23. **`pendantTape.ts:30` throws during render if a top cord is present.** That will crash after a data refresh.

**Citation and priority**

24. **KH0049↔KH0362 was published by Chirinos 2010** (*Quipus del Tahuantinsuyo*, pp. 233–234, 339–341). Set `prior: published`.
25. **UR053B≈C is in Chirinos 2026.** Find it; add it to `CHECKED`.
26. **Add a `prior` status `concurrent`** for Muravev 2026 on the six shared results.
27. **Thompson 2024, *Ñawpa Pacha* 45(1): AS069/AS070** (KH0082/0083). We don't have this link.
28. **Each `prior` entry should list the sources checked, with dates**, so "not found in open sources" can be audited.

### 1.3 What the firm results rest on

**Tied-twice**
- The field map is the best of 720 possible maps: 74 non-blank exact for UR233 against 66 for the runner-up (median 12); 49 against 44 for UR232. Shifting the unit by ±1 gives 8–12.
- The pair survives that selection easily.
- But "89/104" and "72/104" include blank–blank agreement, 15 and **23** of them. A shifted unit already gives 11–15 blank agreements.
- Report non-blank exact matches against the best-alternative-map null.

**The exact scan, judged family-wise.** Prototype, R = 500, best-span bits:
- **19 curated firm or likely links pass the 99% corpus-max line under every null:**
  - tied-twice: KH0192/0470
  - KH0097/0586, KH0121/0473, KH0128/0137, KH0175/0190
  - KH0140/0483, KH0303/0304, KH0301/0305, KH0049/0362
  - KH0377/0590, KH0358/0602
  - Basel: KH0689/0450, KH0690/0450, KH0689/0147, KH0690/0147, KH0682/0450, KH0682/0147, KH0683/0147
  - KH0132/0456
- **KH0245/0257** (Leymebamba, published) also passes.
- **KH0156/0432** passes at 99% only under relabelling.
- **KH0192/KH0469** (firm, UR232) fails every null at 26.6 bits. The exact scan cannot see an alignment in groups of six, so this link rests entirely on the tied-twice alignment and the summary sums. Its page should say so.
- **KH0132/KH0456** is curated firm through the screens; only its *scan* row was tiered with noise. At 50 bits it beats every null maximum.
- **All 31 scan-only pairs fall below every 95% family-wise line.** The highest are KH0616/0620 (30.0 bits), 0468/0691, 0143/0601, 0141/0464 and 0369/0677. Label them noise-level.
- **Tier FDR** from 200 whole shuffles: ≥6 ≈ 1%, =5 ≈ 30%, =4 ≈ 57%.
  - These are **lower bounds**, because they come from the least conservative null.
  - For =5, one null replicate reached 8 pairs against 7 observed, so that tier is consistent with pure noise.

**Bottom line:** no firm link falls. Several tier labels change, and every story page should say *which* evidence carries its link.

### 1.4 What the explainer series exposes

Explaining the method honestly means writing sentences like these, which the method can't yet back up:

- The constants were set by hand: OFF 3, MIS −3, GO 4, GE 1, SLIPW 0.5, IC cap 13, sd + 0.5, max ≥15.
- The floor is three shuffles.
- A per-pair p-value can't see the size of the search.
- A planted copy is detected only at p ≈ 0.01.
- Relation 1 is at chance across the corpus, yet it leads the sums chapter.
- No reported finding came from the alignments the reader sees.

Each of these becomes a work item below, and each upgrade earns a chapter (§4).

---

## 2. Directions, by matching tradition

Effort: **S** ≤ 2 days, **M** ≤ 2 weeks, **L** > 2 weeks.

### A. Statistical calibration (sequence-search statistics, proteomics, multiple testing)

| # | Build | Notes |
|---|---|---|
| A1 | **Score in bits.** A span scores Σ −log₂ P(v) over the nonzero matched cords, with no cord counted twice; zeros score 0. *Best-span bits* is the gate; *union bits* ranks the pairs and gets its own thresholds. | Prototyped: one scan of the corpus takes 0.25 s. The null 99% line is 33–36 bits for best span and 47–53 for union. **S** |
| A2 | **Null ladder.** Report each claim at the strictest rung it survives. (1) Whole shuffle; (2) shuffle the nonzero values with the zeros fixed; (3) **relabelling matched on corpus frequency**: within each magnitude bin, a per-khipu bijection onto values of similar corpus frequency, so 10, 100 and 200 map to other common values; (4) Muravev's **offset ±d** and **group-order** baselines; (5) **empirical negative pairs**: real pairs that can't be copies but share conventions (same size bin and cataloguer, different provenance, or radiocarbon-separated). | Relabelling is the default for exact and near-exact screens because it doesn't leak. It breaks arithmetic, ×10 structure and shared vocabulary, so it is **not** the null for sum, chain or slip screens; those use rungs 4–5. Rung 5 is the one that measures the template/recorder confound. **M** |
| A3 | **Family-wise p from the corpus maximum.** Rescan R ≥ 200 null corpora per rung; p = (1 + #{null max ≥ observed}) / (R + 1). | Gives screen-found pairs a number. Prototype exists. **S** |
| A4 | **Target–decoy FDR per screen** (Elias–Gygi). Run the same pipeline on rung-3 or rung-5 decoys; FDR ≈ (decoys + 1) / targets above a threshold. Report bootstrap intervals. | Gives the 30 screens their first error rates. **M** |
| A5 | **Analytic cross-check.** Expected count of runs ≥ k ≈ Σ (1 − p_ij)·m·n·p_ij^k, where p_ij = Σ_v f_i(v)·g_j(v). | Sanity check on the simulated floors. **S** |
| A6 | **E-values for the tolerant aligner** (Karlin–Altschul). Fit λ and K per length band on rung-4/5 nulls with operations applied before shuffling; E = K·m·n·e^(−λS) × number of oriented pairs. | Replaces 20 shuffles + the sd fudge + one held-out replicate. **M** |
| A7 | **Efron empirical null** as a standing diagnostic; target σ̂ between 0.9 and 1.1. | **S** |
| A8 | **Power curve.** Plant copies with realistic corruption (length 4–12, 0–3 slips, a blank every k, added top cords, reordered groups, ×10, subsidiary promotion) and measure detection per method. | Without it, "not found" means nothing. Replaces the single weak plant. **M** |
| A9 | **Blinding and salting.** Develop new screens on decoys; hide secret plants and reveal them after the analysis. Confirm each specific pair on channels declared in advance and not used to find it (colour, knot direction, attachment, cord length, provenance, date). | **S** once A8 exists |

The existing α-investing ledger in `/next` is enough for online control. e-BH can be added offline later if pair dependence becomes the binding problem.

### B. Alignment and copy models (bioinformatics)

| # | Build | Notes |
|---|---|---|
| B1 | **One relations module** (§3.1), then **log-odds operation scores**: log₂ P(operation \| copy) / P(operation \| random). P(·\| random) is measured from magnitude-conditioned frequencies, P(·\| copy) from **elicited priors** (D-elicit, §2.K) updated on firm pairs left out one at a time. | r2 found that the hand rule `0.5·IC − 3` matches log-odds only by accident (≈2.5 vs 3.3 bits at 4 digits). **M** |
| B2 | **Slip-tolerant spaced seeds with a two-hit rule** (PatternHunter / MMseqs2). Seed classes: exact, ±1, ×10, transposition, lost leading digit, plus (magnitude, leading-digit) words. Also seed on derived streams: group totals, leaders, flattened subsidiaries. | AS175/UR233 caps exact runs at 5–7. **M** |
| B3 | **Corpus-wide tolerant scan.** `align_sw.c` over all oriented pairs, scored with A6 E-values. | Every DEEP link gets a number on one scale. **M** |
| B4 | **A small pair-HMM**: match / slip / blank / gap, with Dirichlet priors from elicitation. | About 10 firm pairs give a few hundred columns; rare operations (promote, transpose, sum, scale) have 0–2 examples each, so they stay as **separate detectors** (C4, C5, D1), not states. The `build_strands` builders stay as presentation code; the model's posteriors are checked against them, not used to replace them. **M** |
| B5 | **Family profiles** (Inkawasi, Santa, Puruchuco, Leymebamba) searched against the corpus with E-values. | Leads such as KH0516. Only where a family has ≥4 members. **M** |
| B6 | **Consistency-based multiple alignment** (T-Coffee style) for sets of 3 or more. | Builds the consensus account and the slips per copy; prerequisite for E. **M** |
| B7 | **Collinear blocks plus breakpoint distance**, with a permutation null. | Reordered groups (KH0156/0432). **S–M** |

### C. Structure and permutation

| # | Build | Notes |
|---|---|---|
| C1 | **Field-map search with the selection inside the null.** Score every chunking (recorded groups, k = 4..10), every injective map and every blank slot; report best-observed against best-under-null. The chosen maps become fitted outputs in strands.json. | Answers the forking-paths objection to tied-twice and Paris/Lima. **M** |
| C2 | **Shared-permutation assignment** (Hungarian, with a slip cost), and the same idea on colour co-occurrence to map recorder vocabularies (W:BB ↔ W:KB). | Turns the colour confound into a translation table. **S–M** |
| C3 | **Equality-pattern (isomorph) matching**: compare *which* cords are equal, not the values. | Invariant under relabelling, so its null must be rung 4 or 5. **S** |
| C4 | **Diagonal and transposed group scan.** Group k of A against group k+d of B for every d, with the offset baseline; also a scan with rows and columns swapped. | **The only route to AS069/070.** **S** |
| C5 | **Constrained local tree edit** (promote and demote as operations; permutation only within units). | KH0284→0285, UR270→UR278. **M** |
| C6 | **Order-free containment and set overlap.** IDF-weighted overlap of value multisets and group signatures, judged against rung 5. | The prototype shows it would flag UR270→UR278 (35 shared values, 363 bits; random-pair 99% line ≈ 115) and weakly AS069/070 (96 bits). **S** |

### D. Arithmetic and relational discovery

| # | Build | Notes |
|---|---|---|
| D1 | **A transformation language for between-khipu relations.** Primitives: `head`, `total`, `sum(range)`, `scale(k)`, `deduct(c)`, `permute`, `insert_blank`, `promote`, `reverse`, `transpose`, `vector_sum(g1, g2)`. Enumerate programs up to a length bound, rank by description length, and **count the programs tried** for the null. | Covers totals→heads, AS143 g4 = AS149 g1 + g2, AS118 subsidiaries = AS125 totals, KH0521×5 and the UR269 deductions. KH0159/0165 and KH0132/0140 share **no** values, so only a sum-aware matcher can find them. **M** |
| D2 | **Integer-relation detection** (LLL / PSLQ) on vectors of group totals across khipus. | Σ relations across 3 or more khipus. **S–M** |
| D3 | **CP-SAT explanation certificates**: "explain B from A in ≤ k operations", returning the minimal explanation and **the number of alternatives**. | Turns specificity into a measured number. **M** |
| D4 | **Hierarchy inference** by contiguous subset-sum, with a null over the same subset class. | The biggest open science item. **L** |
| D5 | **Value repair from constraints** (as in proto-Elamite and Linear A work). Broken cords and value ≠ knots cords become uncertain; sum and copy constraints choose among candidates, and the alternatives are counted. | **M** |
| D6 | **Rare-value and round-number screens** (Nigrini-style). | Cheap triage. **S** |

### E. Philology: collation, networks, direction

| # | Build | Notes |
|---|---|---|
| E1 | **Collation as a variant graph** for each set, with each variant tagged by the operation that produced it. | **M** |
| E2 | **Phylogenetic networks** (NeighborNet / SplitsTree) rather than trees. A summary drawn from several sources is reticulate. | **S–M** |
| E3 | **Copy direction from operations that only go one way**: rounding, summary downstream of detail, promote vs demote, blanks added, totals→heads. Also **MDL asymmetry**: K(B\|A) ≠ K(A\|B) under the D1 language. Test against radiocarbon and colonial dating where they exist. | CBGM-style tables only once a family of ≥4 independent copies exists; today the largest is a triad. **M** |
| E4 | **Synthetic-tradition benchmark** (Roos & Heikkilä): simulate copy trees from real accounts and measure how well direction and topology are recovered. | Gate: ≥90% direction accuracy before any real direction claim. **M** |

### F. Evidence fusion and levels (record linkage, forensics)

| # | Build | Notes |
|---|---|---|
| F1 | **Fellegi–Sunter-style weights** over the channels: family-wise p or E-value, containment, colour-map consistency, accession, find-spot, cord length, attachment, knot direction, date. **m set by hand or from plants; u from the empirical null; plus a sensitivity analysis.** No EM: with ~10–30 matches in 233k pairs (prevalence ~1e-4), EM is weakly identified. Recorder is used as a negative control. | One weight with a per-channel breakdown. **M** |
| F2 | **A written level rubric, computed in `build_links`.** Firm = family-wise p < 0.01 on the declared statistic **plus** one independent channel. Likely = decoy FDR < 0.1. Open otherwise. Add likelihood-ratio bands (ENFSI) only after there are ≥30 real positives to calibrate on. | Resolves "firm but unjudged". **S** |
| F3 | **Closure into families** with union-find, and an audit of inconsistent triangles. | **S** |
| F4 | **A review queue**: uncertain pairs ranked by expected information, accepted or rejected in a `/next` view; the labels feed m. | **M** |

### G. Physical objects and joins

| # | Build | Notes |
|---|---|---|
| G1 | **Direct-join screen**: complementary ends of the main cord, colour cycles that continue across a break, and sums satisfied only by the joined pieces. Separate join from copy (as the eBL fragment-join work does). Build a power curve first; M&K's splice test caught 0 of 197. | **M** |
| G2 | **Maker-habit fingerprint** (knot direction by type, attachment, ply, spacing). Used for confirmation only. | **M** |
| G3 | **Cord-length agreement test.** AS107↔UR237: sd 3 cm vs 19.5 shuffled. | **S** |

### H. Time series and learning

| # | Build | Notes |
|---|---|---|
| H1 | **Matrix Profile AB-join** (STUMPY) on z-normalised log values, with a variance floor on zero-variance windows. | Catches ~4:1 scaling (KH0505/0514). **S–M** |
| H2 | **Normalised compression distance and conditional description length.** No parameters to tune, partly robust to reordering, and the same currency as A1 and D1. | **S** |

### I. The data itself

| # | Build | Notes |
|---|---|---|
| I1 | **Double transcriptions as a noise baseline.** About 9 khipus carry both an Ascher and a non-UR1xxx Urton record (KH0032, 0033, 0067, 0081, 0083, 0118, 0140, 0198, 0228). **First check whether the second cord set can be recovered** (the repo stores one per KH; OKR may hold both). Use them to separate modern transcription slips from ancient copying slips. | **S** to check, **M** to use |
| I2 | **Value uncertainty in the data model.** Broken cords give a lower bound; value ≠ knots conflicts give two candidates; `altValue` is used. Scores marginalise over the alternatives. | **M** |
| I3 | **Hide-and-recover benchmark** (as with Ithaca): hide known values and score how well sums and copies predict them. | An end-to-end task for `/next`. **S–M** |
| I4 | **Confound strata.** Size (explains 42–70% of structure; Contreras 2026), cataloguer prefix, recorder colour vocabulary, Incahuasi twist. | **S** |

### J. External science

| # | Build | Notes |
|---|---|---|
| J1 | **Blind recall test** against Muravev and Thompson. Freeze the pipeline, then run it on the six results it lacks plus the shared ones, **before** reading their numbers closely. | Prototype status: 0 of 4 lacking results are found by the exact scan. Containment (C6) would add UR270→UR278. The two sum relations need D1. AS069/070 needs C4. **S** |
| J2 | **Reading list**: Muravev preprint and report; Thompson 2024; Thompson 2025 KBCR + dataset; Chirinos 2010 and 2026; Medrano 2021, 2022; Contreras 2026; FitzPatrick 2026; Magnani & Clindaniel 2025; Clindaniel 2019; Barraza Lescano 2022; Urton 2014; Urton & Chu 2015/2019. | |
| J3 | **Open benchmark release** (Zenodo), with *khipu-links* as co-owner if they agree. | **M** |

### K. People and data acquisition

| # | Build | Notes |
|---|---|---|
| K1 | **A rater-agreement study** of the hand levels: two or more people grade about 40 pairs blind, including decoys; report κ. | Measures how reliable the current levels are. Costs nothing. **S** |
| K2 | **Structured expert elicitation** (SHELF / Cooke) with khipu specialists (Medrano, Thompson, Hyland, Clindaniel). Priors on operation rates for B1/B4, plus blind grading. | **M** |
| K3 | **A museum re-read list ranked by value of information.** Which broken cords, value ≠ knots cords and catalogue conflicts (KH0140's museum number, AS149 suffix, Dallas numbers) would most change link posteriors? | A short list worth sending to museums. **S** |
| K4 | **Matching to colonial documents** (visitas, Textos Andinos). Replicate Muravev's negative census test **with a power estimate**, so the negative is bounded. | **M** |

### Not planned (recorded so they aren't rediscovered)
Each is a paper, not a roadmap item, at 684 objects and ~10 firm pairs.
- Fused Gromov–Wasserstein matching
- Contrastive retrieval encoders
- Agentic (FunSearch-style) program search
- A joint Bayesian nonparametric model of the whole corpus (a DP mixture over latent accounts)
- Graph neural network matching
- e-LOND / SAFFRON on top of the existing α-investing

Revisit if J3 attracts more data, or if the KBCR's 504 uncatalogued khipus become transcribed.

---

## 3. Shared infrastructure

1. **`scripts/lib/relations.py` ↔ `src/lib/engine/relations.ts`.**
   - Named operations: ±1, digit ±1, register (×10, lost leading digit), round(10|100), adjacent transposition, blank-out, fill-in, scale(k), sum, promote.
   - Every matcher imports them; a parity test covers both languages; the thread field `how` becomes the operation name.
2. **`benchmark/`.**
   - Contents: frozen positives with provenance (curated, published, external), hard negatives (same recorder or provenance, not linked), planted sets for each operation, dev/holdout splits.
   - Every pipeline change reports recall, decoy FDR and power against it.
   - Script `KNOWN` lists are generated from it.
3. **`pairs.json` evidence matrix.** For each oriented pair: bits, family-wise p by rung, E-value, containment, per-channel weights, level. One source for `/network`, `/next` and the stories.
4. **One RNG and seed contract.** Port the floors to mulberry32 through the engine, or record Python seeds per artefact.
5. **A run manifest per artefact**: data hash, code version, null rung, R, seed. `align_scan` outputs move into the repo.

---

## 4. The explainer series

**Now** (Phase 0): items 15–23, plus honesty edits.
- Quote the 200-shuffle floors with intervals and the per-tier FDRs, *labelled as lower bounds*.
- State that the constants were set by hand.
- Say which findings came from which method.
- Explain the catalogue layers vs the evidence layers.
- Cover the screens (leaders, four-of-five), the thread kinds, and the chain-null lesson.
- Tell the search-size story behind KH0517→KH0502 (rank 1 of 84k ordered pairs).

**Next chapters, each paired with a method upgrade:**

| Chapter | Pairs with | Visual idea |
|---|---|---|
| *Bits, not cords* | A1 | The same run re-weighted: 1-1-0-0-1 shrinks while 474-319-453-492 grows |
| *The biggest fluke in a fake archive* | A3, A2 | A null corpus is scanned and its best pair rises to a tick on a histogram; the shuffle leaks a real copy, the relabelling doesn't |
| *Decoys* | A4 | Target and decoy histograms racing; the FDR curve drawn live |
| *What can it see?* | A8 | Power heatmap: plant length × slip rate per method |
| *Same numbers, new shape* | C1, C4, C5, C6, D1 | Field-map search with its null; transposition (AS069/070); folding (UR270→UR278) |
| *Sums across khipus* | D1, D3 | AS143 g4 = AS149 g1 + g2 as a vector addition; the count of alternative explanations |
| *Three or more* | B6, E1, E2 | A variant graph of AS175/UR233/UR232; a split network |
| *Who copied whom* | E3, E4 | One-way operations; synthetic-tradition recovery; dates as the referee |
| *Weighing evidence* | F1, F2 | Weight bars per channel giving a level |

---

## 5. Roadmap and exit criteria

### Phase 0: fix and cite (1 week)
- Defects 1–14 in code; send 15–23 to the `/matching` builder.
- Citations 24–28.
- Contact the *khipu-links* author (§6).

**Exit:**
- Every `prior` entry lists named sources with a date.
- Each defect has a regression test in `check_engine` or `check_traces`.
- Path rescoring passes on 2,000 synthetic and 40 real alignments.

### Phase 1: calibration and cheap orthogonal evidence (3 weeks)
- Statistics: A1, A2 (rungs 1–5), A3 (R = 500), A4 (exact scan, four-of-five, leaders), A5, A7, A8.
- Infrastructure: benchmark v1, run manifests.
- Cheap evidence and outside checks: J1 (blind), C4, C6, G3, K1, D6.
- Re-run all tiers and publish a diff.

**Exit:**
- Planted copies of length 8 with one slip are recovered at ≥80%, at a corpus-level E or family-wise p < 0.01 and a decoy FDR ≤ 5% (bootstrap CI reported).
- No null replicate exceeds 40 bits because a known pair leaked.
- Efron σ̂ on the reported rung is between 0.9 and 1.1.
- Rebuilding from the manifests reproduces every number exactly.
- κ for the hand levels is reported.

**Kill criterion:** if rung 5 cannot be built from enough negative pairs, or σ̂ stays out of range, redesign the null before Phase 2.

### Phase 2: one relations module and a small copy model (6 weeks)
- Relations module; B1 (with K2 elicitation); B2; B3 with A6; B4 (4 states); C1; C5; D1 v1 (head, total, scale, vector_sum, deduct); D3 on the shortlist; F1, F2, F3; I1 if the data is recoverable; H1, H2.

**Exit:**
- Recall on firm pairs left out one at a time beats the A1 + B2 baseline at equal decoy FDR. If it doesn't, ship the baseline.
- At least 4 of the 6 external results are recovered by the pipeline as frozen **before** J1.
- Precision is estimated on salted plants.
- Levels are computed by the F2 rubric, and every change from the hand levels is listed with its reason.

### Phase 3: sets, hierarchies, direction (8 weeks)
- B5, B6, B7, E1–E4, D2, D4, D5, G1, G2, I2, I3, K3, K4.

**Exit:**
- The inferred hierarchy predicts hidden values (I3) better than a baseline that uses sums only.
- Direction methods reach ≥90% accuracy on synthetic traditions.
- Every real direction claim is consistent with the dates where they exist.

### Phase 4: discovery campaigns (ongoing)
Each campaign follows the same loop:
1. Preregister it in `/next`, with claims and α spend.
2. Run it blind on the frozen pipeline, with hidden plants.
3. Unblind.
4. Confirm on the independent channels.

**Queue:**
- KH0516 against all of Incahuasi.
- KH0517's near misses checked against the knot strings.
- KH0128/0137, KH0301/0305, KH0140/0483.
- Every set-overlap (C6) candidate above the rung-5 line.
- If transcriptions become available, the 504 KBCR khipus that are in neither KFG nor OKR.

---

## 6. Relationship to *khipu-links*

- **Collaborate, don't compete.** Write to the author now, before claiming anything new in public. Propose:
  - a co-owned open benchmark (J3);
  - a **blind exchange**: each side runs the other's claims through its own pipeline;
  - citing each other.
- **Our angle is calibration infrastructure and explanation**: the null ladder, power curves, `/next`, the explainers. Not priority of discovery.
- **Call agreement "concurrent agreement".** Count it as replication only when it is confirmed on independent channels. Both projects share the same transcriptions, so shared data errors replicate too, and both use AI-assisted heuristics.
- A joint paper, *Calibrated discovery of matched khipus*, is the natural product if they are willing.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Over-engineering for 684 objects | Every component must move a benchmark number or a page claim; the "not planned" list is binding |
| Overfitting to about 10 firm pairs | Elicited priors, models left out one pair at a time, a 4-state model, rare operations as separate detectors |
| Circular validation (rules that found the pairs score them) | Phase-2 exit uses held-out recall vs a baseline and *external* results frozen before J1 |
| Relabelling null is anti-conservative for shared conventions | Frequency-matched bijection; rung 5 negative pairs; report the strictest rung passed |
| A stronger null removes a finding we like | Publish the diff; the stories already model saying what fell |
| Copy vs shared template or recorder | Rung 5, recorder as negative control, I4 strata |
| Shared data and shared AI tooling make external agreement correlated | Independent-channel confirmation; blind exchange |
| Priority disputes | Cite concurrent work now; "not found in open sources (sources, date)" |
| Python/TS drift | One relations module, one RNG contract, parity checks |

---

## Appendix: key sources

**Statistics**
- Karlin & Altschul 1990, PNAS 87:2264
- Altschul & Gish 1996
- ALP/FALP 2016
- Arratia & Waterman 1985, doi 10.1214/aop/1176992808
- Fu & Koutras 1994, doi 10.1080/01621459.1994.10476841
- Elias & Gygi 2007
- Efron 2004
- Wang & Ramdas 2022
- ENFSI 2015

**Alignment**
- Eddy 2008 (log-odds, λ = ln 2)
- Ma et al. 2002 (PatternHunter)
- Steinegger & Söding 2017 (MMseqs2)
- Notredame et al. 2000 (T-Coffee)
- Darling et al. 2010 (progressiveMauve)
- Bergeron et al. 2006

**Text reuse, philology, networks**
- Smith, Cordell & Mullen 2015 (passim)
- Vesanto et al. 2017; Vierthaler & Gelein 2019
- Schleimer et al. 2003
- Roos & Heikkilä 2009
- Wasserman & Gurry 2017 (CBGM)
- Andrews & Macé 2013
- Bryant & Moulton 2004 (NeighborNet)
- Cilibrasi & Vitányi 2005 (NCD)

**Record linkage**
- Fellegi & Sunter 1969
- Enamorado, Fifield & Imai 2019
- Splink
- arXiv:2508.19218 (subset-sum matching)

**Time series and structure**
- Yeh et al. 2016 (Matrix Profile); STUMPY 2019
- Pawlik & Augsten (APTED)

**Elicitation**
- O'Hagan et al. (SHELF)
- Cooke 1991

**Ancient records**
- Sproat 2014
- Born et al. 2025 (proto-Elamite)
- Corazza et al. 2021 (Linear A)
- Luo & Barzilay 2019
- Simonjetz et al. 2024 (eBL)
- Assael et al. 2022 (Ithaca)

**Khipus**
- Muravev 2026, *khipu-links*
- Thompson 2024, *Ñawpa Pacha* 45(1); Thompson 2025, KBCR doi 10.26188/25661322
- Contreras 2026, arXiv:2610.38580
- Chirinos 2010, 2026
- Urton 2014, 2017
- Urton & Chu 2015, 2019
- Medrano 2021, 2022
- Medrano & Khosla 2024
- FitzPatrick 2026
- Magnani & Clindaniel 2025

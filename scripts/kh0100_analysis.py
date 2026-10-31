#!/usr/bin/env python3
"""Knot grammar of KH0100 (AS087 / UR1087, Museum für Völkerkunde, Munich).

The Aschers declined to read this khipu: "No numerical interpretation is
possible as the knot clusters do not conform to the base ten positional
system. Nineteen different knot cluster orders are found on the pendants."
The Khipu Field Guide nevertheless carries a decimal value on every cord
(max 11115). This script prints every figure the story quotes so they can
be re-derived when the data changes:

  1. the observed knot sequence of every cord, top to bottom
  2. cluster sizes: single-knot clusters and long-knot turn counts, and how
     many exceed nine (the Aschers' "13 knots which contain 10, 11, 12, or
     13 knots" against what the workbook holds today)
  3. knot-type order signatures (S -> L, L -> S, L -> L ...) and their
     frequencies, against the Aschers' nineteen
  4. the Inka decimal grammar test: which cords are legal read top-down,
     which only when read bottom-up, which neither
  5. how the KFG reading is produced (single-knot clusters take place value
     by rank from the bottom, long and figure-eight knots add their turns
     wherever they sit) and why 11115 follows from it
  6. alternative counts: total knots, total turns, cluster counts, and the
     recurring cord "words"
  7. knot heights in cm: is there a fixed register?
  8. cord attributes: twist, attachment, colour, length, subsidiaries, the
     two recorder groups; a seeded permutation test of whether attachment
     side or twist predicts the knot grammar
  9. the corpus: single-knot clusters of ten or more, long knots of ten or
     more turns, long knots above single knots, across all KFG workbooks
 10. where the 10-13 turn counts come from: the workbook's ChangeLog sheet
     (data/kfg/xlsx/KH0100.xlsx, if present) and the OKR knot table
     (data/okr/data/khipu.db, if present)

Reads public/data/khipus/*.json (the app's build of the KFG workbooks).
Sections 2b, 6b and 10 were added after the first pass: adjacent single-knot
clusters closer than 3 cm (a segmentation question that bears on the KFG
values), cords made only of lone single knots ("repunit" cords: 110, 1110,
11110 under the KFG rule) against the corpus, and the provenance of the
turn counts above nine.

    python3 scripts/kh0100_analysis.py
"""

from __future__ import annotations

import json
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
ID = "KH0100"
SEED = 100
SHUFFLES = 2000

# The Aschers' figures, transcribed from the KFG catalog page / OKR notes.
ASCHER_ORDERS = 19
ASCHER_BIG_KNOTS = 13


def pearson(xs: list[float], ys: list[float]) -> float:
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5


def load(kid: str) -> dict:
    return json.loads((DATA / f"{kid}.json").read_text())


def seq(c: dict) -> list[dict]:
    return sorted(c["knots"], key=lambda k: k["pos"])


def sig(c: dict) -> str:
    """Knot-type order, top to bottom, e.g. 'L S'."""
    return " ".join(k["type"] for k in seq(c))


def word(c: dict) -> str:
    """Full knot sequence without heights, e.g. '2L 2S'."""
    return " ".join(f"{k['n']}{k['type']}" for k in seq(c))


def decimal_legal(knots: list[dict]) -> tuple[bool, str]:
    """Inka convention: zero or more S clusters of 1-9 (higher places above),
    then at most one units knot at the bottom: L of 2-9 turns or a single E.
    Returns (legal, reason)."""
    types = [k["type"] for k in knots]
    for k in knots:
        if k["type"] == "S" and k["n"] > 9:
            return False, "S cluster > 9"
        if k["type"] == "L" and not 2 <= k["n"] <= 9:
            return False, "L turns outside 2-9"
    units = [t for t in types if t in ("L", "E")]
    if len(units) > 1:
        return False, "two units knots"
    if units and types[-1] not in ("L", "E"):
        return False, "units knot above an S cluster"
    if any(t not in ("S", "L", "E") for t in types):
        return False, "other knot type"
    return True, "legal"


def kfg_reading(knots: list[dict]) -> int:
    """Reproduce the KFG's value: S clusters ranked from the bottom get
    10, 100, 1000 ...; L and E knots add their turns/count wherever they sit."""
    singles = [k for k in knots if k["type"] == "S"]
    v = 0
    for rank, k in enumerate(reversed(singles)):
        v += k["n"] * 10 ** (rank + 1)
    v += sum(k["n"] for k in knots if k["type"] in ("L", "E"))
    return v


def main() -> None:
    d = load(ID)
    cords = d["cords"]
    pend = [c for c in cords if c["level"] == 1]
    subs = [c for c in cords if c["level"] > 1]
    knotted = [c for c in cords if c["knots"]]

    print(f"=== {ID} {d['aliases']} {d['museum']['canonical']} {d['museum']['number']}")
    print(f"primary {d['primary']['length']} cm, {d['primary']['color']}, {d['primary']['fiber']}, twist {d['primary']['twist']}")
    print(f"cords {len(cords)}: {len(pend)} pendants, {len(subs)} subsidiaries; knotted {len(knotted)}; groups {d['groups']}")
    print("NOTE pendant pos values in the JSON are 34.5 + 29 cm * k (the workbook's 'space of 29.0cm' read as a per-pendant")
    print("     step); the OKR holds attach_pos 0 for every pendant, so no pendant position along the primary is recorded.")
    print()

    # 1. observed sequences ---------------------------------------------------
    print("--- 1. knot sequences (top to bottom; nT = turns for L, count for S/E)")
    for c in cords:
        s = "  ".join(f"{k['n']}{k['type']}@{k['pos']:.1f}" for k in seq(c))
        print(f"  {c['name']:6} {c['twist'] or '-'}/{c['attach'] or '-'} {c['color']:5} len {c['length']:5.1f}  kfg {c['value']:>6}  | {s}")
    print()

    # 2. cluster sizes -----------------------------------------------------------
    print("--- 2. cluster sizes")
    s_sizes = Counter(k["n"] for c in cords for k in c["knots"] if k["type"] == "S")
    l_turns = Counter(k["n"] for c in cords for k in c["knots"] if k["type"] == "L")
    e_sizes = Counter(k["n"] for c in cords for k in c["knots"] if k["type"] == "E")
    print("  S cluster sizes:", dict(sorted(s_sizes.items())), "max", max(s_sizes))
    print("  L turn counts:  ", dict(sorted(l_turns.items())), "max", max(l_turns))
    print("  E sizes:        ", dict(sorted(e_sizes.items())))
    print("  knots by type:  S", sum(s_sizes.values()), "L", sum(l_turns.values()), "E", sum(e_sizes.values()))
    big_s = [(c["name"], k) for c in cords for k in c["knots"] if k["type"] == "S" and k["n"] >= 10]
    big_l = [(c["name"], k["n"], k["pos"]) for c in cords for k in c["knots"] if k["type"] == "L" and k["n"] >= 10]
    print(f"  S clusters of 10+: {len(big_s)}  (the 'clusters of 10-13 single knots' claim)")
    print(f"  L knots of 10+ turns: {len(big_l)} on {len({n for n, _, _ in big_l})} cords (Aschers: {ASCHER_BIG_KNOTS}):")
    for name, n, pos in big_l:
        print(f"     {name:6} {n}L @ {pos} cm")
    print("  by turns:", dict(sorted(Counter(n for _, n, _ in big_l).items())))
    print("  L knots of exactly 1 turn:", l_turns.get(1, 0))
    print("  knot directions (per cluster):", dict(Counter(k["dir"] for c in cords for k in c["knots"])))
    print()

    # 2b. segmentation: adjacent S clusters closer than 3 cm -----------------------
    print("--- 2b. adjacent single-knot clusters closer than 3 cm (could be one cluster)")
    close = []
    for c in knotted:
        ks = seq(c)
        for a, b in zip(ks, ks[1:]):
            if a["type"] == "S" and b["type"] == "S" and b["pos"] - a["pos"] < 3:
                close.append((c["name"], f"{a['n']}S@{a['pos']}", f"{b['n']}S@{b['pos']}", a.get("value"), b.get("value"), c["value"]))
    for row in close:
        print("  ", row)
    print(f"  pairs: {len(close)}; median gap between all adjacent clusters is printed in section 7")
    print()

    # 3. type-order signatures --------------------------------------------------
    print("--- 3. knot-type order signatures")
    sigs_p = Counter(sig(c) for c in pend if c["knots"])
    sigs_all = Counter(sig(c) for c in knotted)
    print(f"  distinct on knotted pendants: {len(sigs_p)} (Aschers: {ASCHER_ORDERS}); on all knotted cords: {len(sigs_all)}")
    for s, n in sigs_all.most_common():
        print(f"     {n:3}  {s}")
    l_above_s = [c["name"] for c in cords if any(a["type"] == "L" and b["type"] == "S" and a["pos"] < b["pos"] for a in c["knots"] for b in c["knots"])]
    multi_l = [c["name"] for c in cords if sum(k["type"] == "L" for k in c["knots"]) >= 2]
    e_above = [c["name"] for c in cords if any(a["type"] == "E" and a["pos"] < b["pos"] for a in c["knots"] for b in c["knots"])]
    only_s = [c["name"] for c in knotted if all(k["type"] == "S" for k in c["knots"])]
    print(f"  cords with an L above an S: {len(l_above_s)} {l_above_s}")
    print(f"  cords with two or more L: {len(multi_l)} {multi_l}")
    print(f"  cords with an E above another knot: {len(e_above)} {e_above}")
    print(f"  cords of S clusters only: {len(only_s)}")
    print()

    # 4. decimal grammar test ----------------------------------------------------
    print("--- 4. Inka decimal grammar, read top-down and bottom-up")
    reasons = Counter()
    classes = Counter()
    per_cord = {}
    for c in knotted:
        ks = seq(c)
        ok_down, why_down = decimal_legal(ks)
        ok_up, _ = decimal_legal(list(reversed(ks)))
        cls = "both" if ok_down and ok_up else "top-down only" if ok_down else "bottom-up only" if ok_up else "neither"
        classes[cls] += 1
        per_cord[c["name"]] = cls
        if not ok_down:
            reasons[why_down] += 1
    print(f"  knotted cords {len(knotted)}: {dict(classes)}")
    print(f"  legal top-down: {classes['both'] + classes['top-down only']}; legal in at least one direction: {len(knotted) - classes['neither']}")
    print("  first violation top-down:", dict(reasons))
    print("  neither:", [n for n, v in per_cord.items() if v == "neither"])
    print("  bottom-up only:", [n for n, v in per_cord.items() if v == "bottom-up only"])
    print()

    # 5. KFG reading ---------------------------------------------------------------
    print("--- 5. the KFG reading")
    mism = [(c["name"], c["value"], kfg_reading(seq(c))) for c in cords if kfg_reading(seq(c)) != (c["value"] or 0)]
    print(f"  rule reproduces the workbook value on {len(cords) - len(mism)}/{len(cords)} cords; mismatches: {mism}")
    for name in ("p85", "p84", "p2", "p3", "p26", "p61", "p86"):
        c = next(x for x in cords if x["name"] == name)
        parts = " + ".join(f"{k['n']}{k['type']}={k.get('value')}" for k in seq(c))
        print(f"  {name:4} {c['value']:>6} = {parts}")
    top = sorted(cords, key=lambda c: -(c["value"] or 0))[:5]
    print("  five largest:", [(c["name"], c["value"]) for c in top])
    print(f"  sum of KFG values {sum(c['value'] or 0 for c in cords)}; p84+p85 = {sum(c['value'] for c in cords if c['name'] in ('p84', 'p85'))}")
    illegal_valued = [c["name"] for c in knotted if per_cord[c["name"]] in ("neither", "bottom-up only")]
    print(f"  cords carrying a KFG value although not legal top-down: {len(illegal_valued)}")
    print()

    # 6. alternative counts ------------------------------------------------------
    print("--- 6. alternative counts")
    def total_turns(c):
        return sum(k["n"] for k in c["knots"])
    def total_knots(c):
        return sum(1 if k["type"] == "L" else k["n"] for k in c["knots"])
    tt = [total_turns(c) for c in knotted]
    tk = [total_knots(c) for c in knotted]
    print(f"  total turns per knotted cord: min {min(tt)} median {statistics.median(tt)} max {max(tt)}; distribution {dict(sorted(Counter(tt).items()))}")
    print(f"  total knots per knotted cord (L = 1 knot): min {min(tk)} median {statistics.median(tk)} max {max(tk)}")
    print(f"  clusters per cord: {dict(sorted(Counter(len(c['knots']) for c in cords).items()))}")
    words = Counter(word(c) for c in knotted)
    print(f"  distinct words: {len(words)} over {len(knotted)} knotted cords; words used once: {sum(1 for v in words.values() if v == 1)}")
    for w, n in words.most_common(12):
        print(f"     {n:3}  {w}")
    # words that are the same knots in the other order
    canon = defaultdict(set)
    for w in words:
        canon[tuple(sorted(w.split()))].add(w)
    flips = {k: v for k, v in canon.items() if len(v) > 1}
    print("  same knots, both orders:", {" | ".join(sorted(v)): [words[x] for x in sorted(v)] for v in flips.values()})
    # multi-L cords: sum of turns
    print("  two-L cords, turns and sum:", [(c["name"], [k["n"] for k in seq(c) if k["type"] == "L"], sum(k["n"] for k in c["knots"] if k["type"] == "L")) for c in cords if c["name"] in multi_l])
    print()

    # 6b. cords made only of lone single knots --------------------------------------
    print("--- 6b. cords whose every cluster is a lone single knot (KFG reads 110, 1110, 11110)")
    def repunit(c):
        return len(c["knots"]) >= 2 and all(k["type"] == "S" and k["n"] == 1 for k in c["knots"])
    rep = [c for c in knotted if repunit(c)]
    print(f"  {ID}: {len(rep)} of {len(knotted)} knotted cords: {[(c['name'], word(c), c['value']) for c in rep]}")
    print(f"  cords with two or more S clusters: {sum(1 for c in knotted if sum(k['type'] == 'S' for k in c['knots']) >= 2)};"
          f" of these, every S cluster is 1S: {len(rep)}")
    print()

    # 7. heights ------------------------------------------------------------------
    print("--- 7. knot heights (cm from attachment)")
    first = [seq(c)[0]["pos"] for c in knotted]
    last = [seq(c)[-1]["pos"] for c in knotted]
    print(f"  topmost knot: min {min(first)} median {statistics.median(first)} max {max(first)}; lowest knot: min {min(last)} median {statistics.median(last)} max {max(last)}")
    gaps = [b["pos"] - a["pos"] for c in knotted for a, b in zip(seq(c), seq(c)[1:])]
    print(f"  gap between adjacent clusters: n {len(gaps)} min {min(gaps)} median {statistics.median(gaps)} max {max(gaps)}")
    by_place = defaultdict(list)
    for c in knotted:
        for k in c["knots"]:
            if k["type"] == "S":
                by_place[k.get("value") // k["n"]].append(k["pos"])
    for pv in sorted(by_place):
        v = by_place[pv]
        print(f"  S clusters the KFG reads as x{pv}: n {len(v)} pos min {min(v)} median {statistics.median(v)} max {max(v)}")
    lpos = [k["pos"] for c in knotted for k in c["knots"] if k["type"] == "L"]
    print(f"  L knots: pos min {min(lpos)} median {statistics.median(lpos)} max {max(lpos)}")
    xs = [c["length"] for c in knotted]
    ys = first
    r = pearson(xs, ys)
    print(f"  correlation(cord length, topmost knot height) = {r:.2f}")
    frac = [seq(c)[-1]["pos"] / c["length"] for c in knotted]
    print(f"  lowest knot as a fraction of cord length: min {min(frac):.2f} median {statistics.median(frac):.2f} max {max(frac):.2f}")
    print()

    # 8. cord attributes ------------------------------------------------------------
    print("--- 8. cord attributes")
    print("  twist:", dict(Counter(c["twist"] for c in pend)), " attach:", dict(Counter(c["attach"] for c in pend)))
    print("  colour:", dict(Counter(c["color"] for c in cords).most_common()))
    lens = [c["length"] for c in pend if c["length"]]
    print(f"  pendant length: min {min(lens)} median {statistics.median(lens)} max {max(lens)} mean {statistics.mean(lens):.1f}")
    print("  termination:", dict(Counter(c["term"] for c in cords)))
    print("  unknotted:", [c["name"] for c in cords if not c["knots"]])
    # attachment runs
    runs = []
    for c in pend:
        if runs and runs[-1][0] == c["attach"]:
            runs[-1][2] = c["name"]; runs[-1][3] += 1
        else:
            runs.append([c["attach"], c["name"], c["name"], 1])
    print("  attachment runs:", [(a, f"{s}-{e}", n) for a, s, e, n in runs])
    print("  verso pendants:", [c["name"] for c in pend if c["attach"] == "V"])
    v_first = next(c for c in pend if c["attach"] == "V")
    print(f"  first V is {v_first['name']}; from p50 on: {dict(Counter(c['attach'] for c in pend if c['ordinal'] >= 50))}")
    print("  subsidiaries:")
    for s in subs:
        print(f"     {s['name']:6} on {s['parent']} at {s['pos']} cm, {s['twist']}/{s['attach']} {s['color']:5} len {s['length']}  {word(s)}  kfg {s['value']}")
    # group 1 vs 2
    print("  group 1:", [(c["name"], word(c), c["color"]) for c in pend if c["group"] == 0])
    print()

    # permutation test: does attachment (R/V) or twist predict non-decimal grammar?
    print("--- 8b. seeded permutation test: attribute vs top-down legality")
    rng = random.Random(SEED)
    legal = {n: v in ("both", "top-down only") for n, v in per_cord.items()}
    for attr, a_val in (("attach", "R"), ("twist", "S")):
        xs = [(c[attr] == a_val, legal[c["name"]]) for c in pend if c["knots"]]
        def stat(pairs):
            a = [l for f, l in pairs if f]
            b = [l for f, l in pairs if not f]
            return sum(a) / len(a) - sum(b) / len(b)
        obs = stat(xs)
        flags = [f for f, _ in xs]
        ls = [l for _, l in xs]
        hits = 0
        for _ in range(SHUFFLES):
            rng.shuffle(ls)
            if abs(stat(list(zip(flags, ls)))) >= abs(obs) - 1e-12:
                hits += 1
        na = sum(1 for f in flags if f)
        print(f"  {attr}={a_val}: n {na} vs {len(flags) - na}; legal share difference {obs:+.2f}; two-sided p ~ {hits / SHUFFLES:.3f} ({SHUFFLES} shuffles, seed {SEED})")
    print()

    # 8c. two halves? attachment side flips around p50 --------------------------
    print("--- 8c. first 49 pendants against the last 40 (attachment flips R->V at p50)")
    for label, part in (("p1-p49", [c for c in pend if c["ordinal"] <= 49]), ("p50-p89", [c for c in pend if c["ordinal"] >= 50])):
        kn = [c for c in part if c["knots"]]
        print(f"  {label}: n {len(part)}; V {sum(c['attach'] == 'V' for c in part)}; Z twist {sum(c['twist'] == 'Z' for c in part)}; plain W {sum(c['color'] == 'W' for c in part)};"
              f" legal top-down {sum(legal[c['name']] for c in kn)}/{len(kn)}; S-only cords {sum(all(k['type'] == 'S' for k in c['knots']) for c in kn)};"
              f" cords with L {sum(any(k['type'] == 'L' for k in c['knots']) for c in kn)}; L of 8+ turns {sum(1 for c in kn for k in c['knots'] if k['type'] == 'L' and k['n'] >= 8)}")
    # twist vs colour, twist vs big long knots
    print("  twist by colour:", {col: dict(Counter(c["twist"] for c in pend if c["color"] == col)) for col in sorted({c["color"] for c in pend})})
    bigl_tw = Counter(c["twist"] for c in pend for k in c["knots"] if k["type"] == "L" and k["n"] >= 8)
    print("  twist of cords carrying L of 8+ turns (per knot):", dict(bigl_tw), " all L knots:", dict(Counter(c["twist"] for c in pend for k in c["knots"] if k["type"] == "L")))
    plain = [c["twist"] == "Z" for c in pend if c["color"] == "W"]
    mott = [c["twist"] == "Z" for c in pend if c["color"] != "W"]
    obs = sum(plain) / len(plain) - sum(mott) / len(mott)
    pool = plain + mott
    hits = 0
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        if abs(sum(pool[: len(plain)]) / len(plain) - sum(pool[len(plain):]) / len(mott)) >= abs(obs) - 1e-12:
            hits += 1
    print(f"  Z-twist share: plain W {sum(plain)}/{len(plain)} vs mottled {sum(mott)}/{len(mott)}; difference {obs:+.2f}; permutation p ~ {hits / SHUFFLES:.4f}")
    # nether knots (Hyland 2024): any knot below the first L or E on the cord
    nether = []
    for c in knotted:
        ks = seq(c)
        idx = next((i for i, k in enumerate(ks) if k["type"] in ("L", "E")), None)
        if idx is not None and idx < len(ks) - 1:
            nether.append((c["name"], word(c)))
    print(f"  cords with a knot below a long/figure-eight knot ('nether knots'): {len(nether)} of {len(knotted)}")
    print()

    # 9. corpus ------------------------------------------------------------------
    print("--- 9. corpus (all KFG workbooks in public/data/khipus)")
    n_k = 0
    big_s_k = Counter()
    big_l_k = Counter()
    las_k = Counter()
    multi_l_k = Counter()
    illegal_k = Counter()
    knotted_k = Counter()
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        n_k += 1
        for c in k["cords"]:
            if not c["knots"]:
                continue
            knotted_k[k["id"]] += 1
            ks = seq(c)
            big_s_k[k["id"]] += sum(1 for x in ks if x["type"] == "S" and x["n"] >= 10)
            big_l_k[k["id"]] += sum(1 for x in ks if x["type"] == "L" and x["n"] >= 10)
            if any(a["type"] == "L" and b["type"] == "S" and a["pos"] < b["pos"] for a in ks for b in ks):
                las_k[k["id"]] += 1
            if sum(1 for x in ks if x["type"] == "L") >= 2:
                multi_l_k[k["id"]] += 1
            if not decimal_legal(ks)[0]:
                illegal_k[k["id"]] += 1
    tot_cords = sum(knotted_k.values())
    print(f"  khipus {n_k}, knotted cords {tot_cords}")
    def report(label, ctr):
        tot = sum(ctr.values())
        nk = sum(1 for v in ctr.values() if v)
        rank = sorted(ctr.items(), key=lambda kv: -kv[1])[:6]
        print(f"  {label}: {tot} in {nk} khipus; {ID} has {ctr[ID]} ({100 * ctr[ID] / tot if tot else 0:.1f}%); top {rank}")
    report("S clusters of 10+", big_s_k)
    report("L knots of 10+ turns", big_l_k)
    report("cords with an L above an S", las_k)
    report("cords with two or more L", multi_l_k)
    report("cords not legal top-down", illegal_k)
    share = {kid: illegal_k[kid] / knotted_k[kid] for kid in knotted_k if knotted_k[kid] >= 20}
    print(f"  {ID} share of knotted cords not legal top-down: {share[ID]:.2f}; corpus median {statistics.median(share.values()):.2f}; rank {sorted(share.values(), reverse=True).index(share[ID]) + 1} of {len(share)} khipus with 20+ knotted cords")
    print(f"  corpus rate of L-above-S cords: {sum(las_k.values()) / tot_cords * 100:.2f} per 100 knotted cords; {ID}: {las_k[ID] / knotted_k[ID] * 100:.1f}")
    print(f"  corpus rate of 10+-turn L knots: {sum(big_l_k.values()) / tot_cords * 100:.2f} per 100 knotted cords; {ID}: {big_l_k[ID] / knotted_k[ID] * 100:.1f}")
    print(f"  khipus with 10+-turn L knots and no L-above-S cords: {sum(1 for kid in big_l_k if big_l_k[kid] and not las_k[kid])}")
    values = sorted((c["value"] for p in DATA.glob("KH*.json") for c in json.loads(p.read_text())["cords"] if c["value"]), reverse=True)
    print(f"  cord values corpus-wide: {len(values)} non-zero; 11115 ranks {values.index(11115) + 1}; values >= 10000: {sum(1 for v in values if v >= 10000)}; >= 1000: {sum(1 for v in values if v >= 1000)}")
    print("  khipus by L-above-S cords (id, museum, provenance, knotted, L-above-S, share, L 10+ turns):")
    for kid, n in sorted(las_k.items(), key=lambda kv: -kv[1])[:10]:
        k = load(kid)
        print(f"     {kid} {k['museum']['canonical']!s:42.42} {k['provenance']!s:28.28} {knotted_k[kid]:4} {n:3} {n / knotted_k[kid]:.2f} {big_l_k[kid]:3}")
    rep_k = Counter()
    multi_s_k = Counter()
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        for c in k["cords"]:
            if sum(x["type"] == "S" for x in c["knots"]) >= 2:
                multi_s_k[k["id"]] += 1
                if all(x["type"] == "S" and x["n"] == 1 for x in c["knots"]):
                    rep_k[k["id"]] += 1
    print(f"  cords with 2+ S clusters that are all lone knots (110, 1110 ...): corpus {sum(rep_k.values())} of {sum(multi_s_k.values())}"
          f" ({100 * sum(rep_k.values()) / sum(multi_s_k.values()):.1f}%); {ID}: {rep_k[ID]} of {multi_s_k[ID]} ({100 * rep_k[ID] / multi_s_k[ID]:.1f}%)")
    # hypergeometric tail: P(X >= observed) drawing multi_s_k[ID] cords from the rest of the corpus
    from math import comb

    K = sum(rep_k.values()) - rep_k[ID]
    N = sum(multi_s_k.values()) - multi_s_k[ID]
    n = multi_s_k[ID]
    tail = sum(comb(K, x) * comb(N - K, n - x) for x in range(rep_k[ID], n + 1)) / comb(N, n)
    print(f"  hypergeometric P(>= {rep_k[ID]} such cords in {n} draws from the rest of the corpus, {K}/{N}) = {tail:.2e}")
    top_rep = sorted(((rep_k[k], multi_s_k[k], k) for k in multi_s_k if multi_s_k[k] >= 10), key=lambda t: -t[0] / t[1])[:6]
    print("  khipus (10+ multi-S cords) by share of all-lone-knot cords:", [(k, r, m, round(r / m, 2)) for r, m, k in top_rep])
    # the Gaffron set on the KFG page
    gaff = ["KH0102", "KH0103", "KH0105", "KH0106", "KH0107", "KH0108", "KH0110", "KH0112"]
    print("  Munich comparanda (KFG note):", [(g, illegal_k[g], knotted_k[g], las_k[g], big_l_k[g]) for g in gaff if g in knotted_k])
    print()

    # 10. provenance of the turn counts above nine ---------------------------------
    print("--- 10. where the 10-13 turn counts come from")
    xlsx = ROOT / "data" / "kfg" / "xlsx" / f"{ID}.xlsx"
    if xlsx.exists():
        try:
            import openpyxl  # type: ignore

            wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
            rows = [r for r in wb["ChangeLog"].iter_rows(values_only=True) if r and r[0]]
            print(f"  KFG workbook ChangeLog ({len(rows) - 1} entries):")
            for r in rows[1:]:
                print("    ", " | ".join(str(x) for x in r if x is not None))
        except Exception as e:  # pragma: no cover
            print("  (ChangeLog not read:", e, ")")
    else:
        print("  (data/kfg/xlsx not present; ChangeLog skipped)")
    db = ROOT / "data" / "okr" / "data" / "khipu.db"
    if db.exists():
        import sqlite3

        con = sqlite3.connect(db)
        okr_id = d["okr"]["okrId"]
        rows = con.execute(
            "select c.INVESTIGATOR_CORD_NUM, c.CORD_LEVEL, kc.START_POS, k.NUM_TURNS, k.knot_value_type "
            "from cord c join knot_cluster kc on kc.CORD_ID=c.CORD_ID join knot k on k.CLUSTER_ID=kc.CLUSTER_ID "
            "where c.KHIPU_ID=? and k.TYPE_CODE='L' and (k.NUM_TURNS>=10 or k.knot_value_type>=10) order by c.CORD_LEVEL, c.INVESTIGATOR_CORD_NUM",
            (okr_id,),
        ).fetchall()
        print(f"  OKR khipu {okr_id}: long knots with NUM_TURNS or value >= 10: {len(rows)}")
        for r in rows:
            print("    ", r)
        pos = con.execute("select min(ATTACH_POS), max(ATTACH_POS) from cord where KHIPU_ID=? and CORD_LEVEL=1", (okr_id,)).fetchone()
        print(f"  OKR pendant ATTACH_POS range: {pos} (no positions along the primary recorded)")
        meta = con.execute("select CREATED_BY, CREATED_ON, CHANGED_BY, CHANGED_ON from khipu_main where KHIPU_ID=?", (okr_id,)).fetchone()
        print(f"  OKR record created/changed: {meta}")
        note = con.execute("select NOTES from khipu_main where KHIPU_ID=?", (okr_id,)).fetchone()[0]
        print("  OKR notes (verbatim):")
        for line in note.splitlines():
            print("    ", line)
    else:
        print("  (OKR database not present; skipped)")


if __name__ == "__main__":
    main()

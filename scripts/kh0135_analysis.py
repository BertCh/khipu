#!/usr/bin/env python3
"""Analysis tables for KH0135 (AS121 / UR1121, Berlin VA 42538, Pachacamac).

Reads public/data/khipus/KH0135.json and prints every figure quoted in the
story "Colour without numbers" (/stories/colour-without-numbers), so the
numbers can be re-derived when the data changes.

    python3 scripts/kh0135_analysis.py            # the khipu itself
    python3 scripts/kh0135_analysis.py --corpus   # plus the corpus comparison

What it checks, in order:

1.  Group-size sequence. The claim is 70 groups of three followed by 10 groups
    of seven; the script prints the run-length encoding of the sizes and the
    group start positions along the primary cord, and derives the ten "blocks"
    of seven triads from the jumps in the start positions (the Aschers' 6.5 cm
    and 5.5 cm spaces) rather than assuming them.
2.  The colour template. Every triad is compared with W-B-W position by
    position and every exception is listed (there are none). The seven-cord
    groups are checked for being monochrome and their colours are listed.
3.  Where the knots are. Every knotted cord, with block, triad, position in
    the triad, knot type, value; counts by position; the brown-cord test
    (how often a random placement of the knotted cords in the knotted block
    would also avoid every brown cord); the "first + third = 5" pattern and a
    seeded permutation test of it.
4.  Lengths and attachment by position. Only the knotted cords have recorded
    lengths (the Aschers recorded lengths only where there were knots), so the
    per-position comparison is over block 10 only; attachment is unrecorded
    (U) throughout.
5.  The ten seven-cord groups: colours, values, and the Aschers' suggestion
    that the 70 cords of part 2 were to be related to the 70 triads of part 1;
    which units of each part carry knots.
6.  Ascher-sum coincidences among the 21 values, against a shuffled baseline.
    Section 3 also prints the two-unit test used by src/lib/stories/kh0135.ts:
    the chance that the knotted pendants, placed at random, would fall inside
    at most two of the twenty units.
7.  --corpus: every khipu with >= 100 cords ranked by the fraction of cords
    carrying any knot; how many khipus with >= 10 groups have >= 85 % of them
    of size three (KH0135 itself is 70/80 = 87.5 %, so a 90 % screen would
    miss it) and what their triad colours are (KH0112 = AS099, from the same
    Berlin Pachacamac lot, is a fully knotted W - W:DB - W triad khipu); and
    which khipus have a run of >= 20 consecutive identical three-cord colour
    patterns.

Observed = the recorded cords (public/data/khipus/KH0135.json, built from
the KFG workbook of the Ascher databook entry). Derived = arithmetic on
them. Context and interpretation are left to the story.
"""

from __future__ import annotations

import itertools
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
ID = "KH0135"
TEMPLATE = ["W", "B", "W"]
SEED = 135
SHUFFLES = 10000


def load(kid: str = ID) -> dict:
    return json.loads((DATA / f"{kid}.json").read_text())


def pendant_groups(k: dict) -> list[list[dict]]:
    groups: dict[int, list[dict]] = defaultdict(list)
    for c in k["cords"]:
        if c["level"] == 1 and c.get("group") is not None:
            groups[c["group"]].append(c)
    return [sorted(groups[i], key=lambda c: c["ordinal"]) for i in sorted(groups)]


def rle(xs: list) -> list[tuple]:
    return [(v, len(list(g))) for v, g in itertools.groupby(xs)]


def colour(c: dict) -> str:
    seg = c.get("colorParsed") or []
    return ":".join(seg[0]["codes"]) if seg else (c.get("color") or "?")


# ------------------------------------------------------------------ 1. sizes


def blocks_from_positions(k: dict, groups: list[list[dict]]) -> list[list[int]]:
    """Split the triads into blocks wherever the gap between consecutive group
    starts exceeds twice the usual within-block pitch."""
    starts = [g["start"] for g in k["groups"]]
    triad_idx = [i for i, g in enumerate(groups) if len(g) == 3]
    pitches = [starts[j] - starts[i] for i, j in zip(triad_idx, triad_idx[1:])]
    usual = sorted(pitches)[len(pitches) // 2]
    blocks: list[list[int]] = [[triad_idx[0]]]
    for i, j in zip(triad_idx, triad_idx[1:]):
        if starts[j] - starts[i] > 2 * usual:
            blocks.append([])
        blocks[-1].append(j)
    return blocks


def section_sizes(k: dict, groups: list[list[dict]], blocks: list[list[int]]):
    print("=== 1. Group sizes and layout")
    sizes = [len(g) for g in groups]
    print("  groups:", len(groups), " cords:", k["stats"]["nCords"], "(pendants %d, subsidiaries %d, top %d)" % (
        k["stats"]["nPendants"], k["stats"]["nSubsidiaries"], k["stats"]["nTop"]))
    print("  size run-lengths:", " ".join("%dx%d" % (n, v) for v, n in rle(sizes)))
    starts = [g["start"] for g in k["groups"]]
    print("  triad blocks (from start-position jumps):", [len(b) for b in blocks])
    for bi, b in enumerate(blocks):
        first, last = b[0], b[-1]
        print("    block %2d: groups %2d-%2d  cords p%d-p%d  starts %.1f cm, next block %s" % (
            bi + 1, first + 1, last + 1, groups[first][0]["ordinal"], groups[last][-1]["ordinal"], starts[first],
            ("%.1f cm later" % (starts[blocks[bi + 1][0]] - starts[first])) if bi + 1 < len(blocks) else "-"))
    sevens = [i for i, g in enumerate(groups) if len(g) == 7]
    print("  seven-cord groups: %d, groups %d-%d, cords p%d-p%d, first starts at %.1f cm (%.1f cm after the last triad's start)" % (
        len(sevens), sevens[0] + 1, sevens[-1] + 1, groups[sevens[0]][0]["ordinal"], groups[sevens[-1]][-1]["ordinal"],
        starts[sevens[0]], starts[sevens[0]] - starts[blocks[-1][-1]]))
    TRIAD_W, TAIL_W = 0.5, 1.0  # measured widths (Ascher footnotes), not in the JSON
    last_triad = starts[blocks[-1][-1]]
    print("  part 1 spans %.1f-%.1f cm (%.1f cm); gap %.1f cm; part 2 spans %.1f-%.1f cm (%.1f cm); pitch inside a block %.2f cm, between seven-cord groups %.2f cm" % (
        starts[0], last_triad + TRIAD_W, last_triad + TRIAD_W - starts[0], starts[sevens[0]] - (last_triad + TRIAD_W),
        starts[sevens[0]], starts[sevens[-1]] + TAIL_W, starts[sevens[-1]] + TAIL_W - starts[sevens[0]],
        (starts[blocks[0][-1]] - starts[blocks[0][0]]) / (len(blocks[0]) - 1), starts[sevens[1]] - starts[sevens[0]]))
    gaps = [starts[blocks[i + 1][0]] - (starts[blocks[i][-1]] + TRIAD_W) for i in range(len(blocks) - 1)]
    print("  gaps after blocks 1-9:", gaps)
    p = k["primary"]
    print("  primary: length %s cm, beginning %s, termination %s, colour %s (JSON), twist %s" % (
        p["length"], p["beginning"], p["term"], p["color"], p["twist"]))
    print("  triads in part 1: %d = %d blocks x %d;  cords in part 2: %d = %d groups x %d" % (
        len([g for g in groups if len(g) == 3]), len(blocks), len(blocks[0]),
        sum(len(groups[i]) for i in sevens), len(sevens), len(groups[sevens[0]])))


# ---------------------------------------------------------------- 2. colours


def section_colours(groups: list[list[dict]], blocks: list[list[int]]):
    print("\n=== 2. Colour template")
    triads = [groups[i] for b in blocks for i in b]
    exceptions = []
    for gi, g in ((i, groups[i]) for b in blocks for i in b):
        cols = [colour(c) for c in g]
        if cols != TEMPLATE:
            exceptions.append((gi + 1, cols))
    print("  triads matching %s: %d of %d" % ("-".join(TEMPLATE), len(triads) - len(exceptions), len(triads)))
    print("  exceptions:", exceptions if exceptions else "none")
    by_pos = [Counter(colour(g[i]) for g in triads) for i in range(3)]
    print("  colour by position:", [dict(c) for c in by_pos])
    sevens = [g for g in groups if len(g) == 7]
    print("  seven-cord groups, colours:", [sorted(set(colour(c) for c in g)) for g in sevens])
    print("  monochrome seven-cord groups: %d of %d" % (sum(len(set(colour(c) for c in g)) == 1 for g in sevens), len(sevens)))
    allc = Counter(colour(c) for g in groups for c in g)
    print("  colours on all pendants:", dict(allc))
    print("  twist:", dict(Counter(c["twist"] for g in groups for c in g)), " attach:", dict(Counter(c["attach"] for g in groups for c in g)))


# ------------------------------------------------------------------ 3. knots


def knot_desc(c: dict) -> str:
    return " ".join("%s%d@%.1f%s" % (x["type"], x["n"], x["pos"], x["dir"]) for x in c["knots"]) or "-"


def section_knots(k: dict, groups: list[list[dict]], blocks: list[list[int]]):
    print("\n=== 3. Knotted cords")
    cords = k["cords"]
    knotted = [c for c in cords if c["knots"]]
    print("  cords with any knot: %d of %d (%.1f %%); knot clusters: %d; total value %d; max value %d" % (
        len(knotted), len(cords), 100 * len(knotted) / len(cords), sum(len(c["knots"]) for c in cords),
        sum(c["value"] or 0 for c in cords), max(c["value"] or 0 for c in cords)))
    print("  knot types:", dict(Counter(x["type"] for c in cords for x in c["knots"])),
          " directions:", dict(Counter(x["dir"] for c in cords for x in c["knots"])))
    where = {}
    for bi, b in enumerate(blocks):
        for ti, gi in enumerate(b):
            for pi, c in enumerate(groups[gi]):
                where[c["name"]] = (bi + 1, ti + 1, pi + 1)
    sevens = [i for i, g in enumerate(groups) if len(g) == 7]
    for si, gi in enumerate(sevens):
        for pi, c in enumerate(groups[gi]):
            where[c["name"]] = ("part2", si + 1, pi + 1)
    print("  %-7s %-14s %-6s %6s %-5s %s" % ("cord", "block/triad/pos", "colour", "length", "value", "knots"))
    for c in knotted:
        w = where.get(c["name"]) or ("sub of " + c["parent"],) + where[c["parent"]][1:]
        print("  %-7s %-14s %-6s %6s %5s %s" % (c["name"], "/".join(map(str, w)), colour(c), c["length"], c["value"], knot_desc(c)))
    knotted_blocks = sorted({where[c["name"]][0] for c in knotted if c["name"] in where and where[c["name"]][0] != "part2"})
    print("  blocks of part 1 with any knot:", knotted_blocks)
    print("  seven-cord groups with any knot:", sorted({where[c["name"]][1] for c in knotted if c["name"] in where and where[c["name"]][0] == "part2"}))

    # within the knotted block
    kb = blocks[knotted_blocks[-1] - 1]
    tri = [groups[gi] for gi in kb]
    vals = [[c["value"] or 0 for c in g] for g in tri]
    print("  knotted block, values by triad (pos1, pos2, pos3):", vals)
    pos_knotted = [sum(1 for g in tri if g[i]["knots"]) for i in range(3)]
    print("  cords knotted by position in the block: pos1 %d/%d, pos2 %d/%d, pos3 %d/%d" % (
        pos_knotted[0], len(tri), pos_knotted[1], len(tri), pos_knotted[2], len(tri)))
    print("  knot type by position: pos1 %s, pos3 %s" % (
        dict(Counter(x["type"] for g in tri for x in g[0]["knots"])), dict(Counter(x["type"] for g in tri for x in g[2]["knots"]))))
    print("  knot heights (cm from attachment): pos1 %s, pos3 %s" % (
        sorted({x["pos"] for g in tri for x in g[0]["knots"]}), sorted({x["pos"] for g in tri for x in g[2]["knots"]})))
    n_cords = 3 * len(tri)
    n_knot = sum(pos_knotted)
    n_brown = len(tri)
    # exact: P(no knotted cord among the brown ones) when n_knot of n_cords cords are knotted at random
    from math import comb
    p_brown = comb(n_cords - n_brown, n_knot) / comb(n_cords, n_knot)
    print("  brown-cord test: %d knotted cords among %d; none on the %d brown cords; P(random placement avoids all brown) = %.2e" % (
        n_knot, n_cords, n_brown, p_brown))
    sums = [v[0] + v[2] for v in vals]
    target = Counter(sums).most_common(1)[0][0]
    hit = sum(s == target for s in sums)
    print("  pos1 + pos3 per triad:", sums, " -> %d of %d triads sum to %d" % (hit, len(tri), target))
    subs = [c for c in k["cords"] if c["level"] == 2]
    for s in subs:
        print("  subsidiary %s (colour %s, value %s, %s) hangs from %s at %.1f cm; its triad then totals %d" % (
            s["name"], colour(s), s["value"], knot_desc(s), s["parent"], s["pos"],
            sum(c["value"] or 0 for g in tri for c in g if g[0]["name"] <= s["parent"] <= g[2]["name"] and c) + (s["value"] or 0)))
    rng = random.Random(SEED)
    firsts = [v[0] for v in vals]
    thirds = [v[2] for v in vals]
    at_least = 0
    for _ in range(SHUFFLES):
        t = thirds[:]
        rng.shuffle(t)
        if sum(a + b == target for a, b in zip(firsts, t)) >= hit:
            at_least += 1
    print("  permutation test (third-position values shuffled among the %d triads, %d shuffles, seed %d): P(>= %d triads sum to %d) = %.3f" % (
        len(tri), SHUFFLES, SEED, hit, target, at_least / SHUFFLES))
    broken = [c["name"] for g in tri for c in g if c["term"] == "B"]
    print("  broken cords in the knotted block:", broken)
    # all knotted pendants inside at most two of the twenty units (ten blocks, ten seven-cord groups)
    sizes = [sum(len(groups[gi]) for gi in b) for b in blocks] + [len(groups[gi]) for gi in sevens]
    n_pend = sum(sizes)
    m = sum(1 for c in cords if c["level"] == 1 and c["knots"])
    ways = sum(comb(n, m) for n in sizes)
    for a, b in itertools.combinations(sizes, 2):
        ways += comb(a + b, m) - comb(a, m) - comb(b, m)
    print("  two-unit test: %d knotted pendants among %d, in %d units; P(all within <= 2 units at random) = %.2e" % (
        m, n_pend, len(sizes), ways / comb(n_pend, m)))


# ---------------------------------------------------------- 4. lengths/attach


def section_lengths(k: dict, groups: list[list[dict]], blocks: list[list[int]]):
    print("\n=== 4. Lengths and attachment by position")
    cords = [c for c in k["cords"] if c["level"] == 1]
    with_len = [c for c in cords if c["length"]]
    print("  pendants with a recorded length: %d of %d (%s)" % (len(with_len), len(cords), ", ".join(
        "p%d-p%d" % (a, b) for a, b in _runs([c["ordinal"] for c in with_len]))))
    print("  note on p1:", (k["cords"][0].get("notes") or "-"))
    kb = blocks[-1]
    tri = [groups[gi] for gi in kb]
    for i in range(3):
        ls = [g[i]["length"] for g in tri if g[i]["length"] and g[i]["term"] != "B"]
        print("  block %d position %d (%s): lengths %s  mean %.1f  (intact cords only)" % (
            len(blocks), i + 1, TEMPLATE[i], [g[i]["length"] for g in tri], sum(ls) / len(ls)))
    seven = groups[-1]
    ls = [c["length"] for c in seven]
    print("  last seven-cord group lengths %s mean %.1f" % (ls, sum(ls) / len(ls)))
    b10 = [c["length"] for g in tri for c in g if c["term"] != "B"]
    print("  block %d intact-cord mean %.1f cm (n=%d); range of all recorded pendant lengths %.1f-%.1f cm" % (
        len(blocks), sum(b10) / len(b10), len(b10), min(c["length"] for c in with_len), max(c["length"] for c in with_len)))
    print("  attachment codes on pendants:", dict(Counter(c["attach"] for c in cords)), " termination:", dict(Counter(c["term"] for c in cords)))


def _runs(xs: list[int]) -> list[tuple[int, int]]:
    out: list[list[int]] = []
    for x in xs:
        if out and out[-1][1] == x - 1:
            out[-1][1] = x
        else:
            out.append([x, x])
    return [tuple(r) for r in out]


# ------------------------------------------------------------- 5. part two


def section_part2(k: dict, groups: list[list[dict]], blocks: list[list[int]]):
    print("\n=== 5. The ten seven-cord groups against the ten blocks")
    sevens = [g for g in groups if len(g) == 7]
    for si, g in enumerate(sevens):
        b = blocks[si]
        bv = [sum(c["value"] or 0 for c in groups[gi]) for gi in b]
        print("  group %2d: colour %-3s values %-28s | block %2d triad totals %s" % (
            si + 1, "/".join(sorted(set(colour(c) for c in g))), [c["value"] or 0 for c in g], si + 1, bv))
    last = sevens[-1]
    vals = [c["value"] or 0 for c in last]
    print("  last group: values %s, sum %d, tens digits %s, units digits %s" % (vals, sum(vals), [v // 10 for v in vals], [v % 10 for v in vals]))
    b10 = [sum(c["value"] or 0 for c in groups[gi]) for gi in blocks[-1]]
    subs = sum(c["value"] or 0 for c in k["cords"] if c["level"] == 2)
    print("  block 10 triad totals %s, sum %d (+%d on the subsidiary = %d)" % (b10, sum(b10), subs, sum(b10) + subs))
    print("  ratios last-group value / triad total:", ["%.2f" % (v / t) if t else "-" for v, t in zip(vals, b10)])
    print("  differences:", [v - t for v, t in zip(vals, b10)])
    print("  cords in part 2: %d; triads in part 1: %d; equal: %s" % (sum(len(g) for g in sevens), sum(len(b) for b in blocks), sum(len(g) for g in sevens) == sum(len(b) for b in blocks)))
    colours = ["/".join(sorted(set(colour(c) for c in g))) for g in sevens]
    print("  part-2 colour by group:", colours, " run-lengths:", rle(colours))


# --------------------------------------------------------- 6. ascher sums


def section_sums(k: dict):
    print("\n=== 6. Sum coincidences among the knotted values")
    vals = [c["value"] for c in k["cords"] if c["level"] == 1 and c["value"]]
    print("  non-zero pendant values in order:", vals)

    def count_runs(v: list[int]) -> list[tuple]:
        hits = []
        for i in range(len(v)):
            for j in range(i + 2, len(v) + 1):
                s = sum(v[i:j])
                for t, x in enumerate(v):
                    if x == s and not (i <= t < j):
                        hits.append((v[i:j], s, t))
        return hits

    real = count_runs(vals)
    print("  contiguous runs (length >= 2) of non-zero values whose sum equals another value: %d" % len(real))
    for run, s, t in real[:12]:
        print("    %s = %d (value at index %d)" % (" + ".join(map(str, run)), s, t))
    rng = random.Random(SEED)
    more = 0
    for _ in range(2000):
        v = vals[:]
        rng.shuffle(v)
        if len(count_runs(v)) >= len(real):
            more += 1
    print("  shuffled baseline (2000 shuffles, seed %d): P(>= %d coincidences) = %.2f" % (SEED, len(real), more / 2000))


# ---------------------------------------------------------------- 7. corpus


def section_corpus():
    print("\n=== 7. Corpus comparison")
    rows = []
    low_all = []
    threes = 0
    runs20 = 0
    total = 0
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        total += 1
        cords = k["cords"]
        n = len(cords)
        nk = sum(1 for c in cords if c["knots"])
        if n >= 100:
            rows.append((nk / n, n, nk, k["id"], k.get("provenance")))
        if n and nk / n < 0.1:
            low_all.append((k["id"], n, nk))
        sizes = [g["n"] for g in k["groups"]]
        groups = pendant_groups(k)
        if sizes and len(sizes) >= 10 and sum(s == 3 for s in sizes) / len(sizes) >= 0.85:
            threes += 1
            pats = Counter("-".join(colour(c) for c in g) for g in groups if len(g) == 3)
            print("  >= 85 %% triads: %s (%s) %d groups, %d of them triads, %d cords, %d knotted, commonest triad colours %s, %s" % (
                k["id"], "/".join(k["aliases"]), len(sizes), sum(s == 3 for s in sizes), n, nk, pats.most_common(2), k.get("provenance") or "-"))
        pats = ["-".join(colour(c) for c in g) if len(g) == 3 else None for g in groups]
        best = max((n for v, n in rle(pats) if v), default=0)
        if best >= 20:
            runs20 += 1
            print("  run of %d identical three-cord colour patterns: %s (%s)" % (best, k["id"], rle(pats)[0][0] if rle(pats) else ""))
    rows.sort()
    print("  khipus in corpus: %d; with >= 100 cords: %d" % (total, len(rows)))
    print("  lowest fraction of knotted cords among khipus with >= 100 cords:")
    for i, (f, n, nk, kid, prov) in enumerate(rows[:10]):
        print("   %2d. %s  %3d/%3d cords knotted = %5.1f %%  %s" % (i + 1, kid, nk, n, 100 * f, prov or ""))
    rank = [r[3] for r in rows].index(ID) + 1
    print("  %s ranks %d of %d; khipus (>= 100 cords) with < 10 %% knotted: %d; median fraction %.1f %%" % (
        ID, rank, len(rows), sum(r[0] < 0.1 for r in rows), 100 * rows[len(rows) // 2][0]))
    print("  khipus of any size with < 10 %% of cords knotted: %d  %s" % (len(low_all), sorted(low_all, key=lambda r: -r[1])[:8]))
    print("  khipus with >= 10 groups and >= 85 %% of groups of size three: %d of %d" % (threes, total))
    print("  %s: %d of %d groups are triads = %.1f %%" % (ID, 70, 80, 100 * 70 / 80))
    print("  khipus with a run of >= 20 identical three-cord colour patterns: %d" % runs20)
    # the same ranking from the index (knots per cord, as src/lib/stories/kh0135.ts computes it)
    index = json.loads((ROOT / "public" / "data" / "khipus.json").read_text())
    idx = sorted(((k["nKnots"] / k["nCords"], k["id"], k["nCords"], k["nKnots"]) for k in index if k["nCords"] >= 100))
    r = [x[1] for x in idx].index(ID) + 1
    print("  index ranking by knots per cord (>= 100 cords): %s is %d of %d at %.3f; median %.2f; lowest: %s" % (
        ID, r, len(idx), idx[r - 1][0], idx[len(idx) // 2][0], [(x[1], x[3], x[2]) for x in idx[:4]]))


def main():
    k = load()
    groups = pendant_groups(k)
    blocks = blocks_from_positions(k, groups)
    section_sizes(k, groups, blocks)
    section_colours(groups, blocks)
    section_knots(k, groups, blocks)
    section_lengths(k, groups, blocks)
    section_part2(k, groups, blocks)
    section_sums(k)
    if "--corpus" in sys.argv:
        section_corpus()


if __name__ == "__main__":
    main()

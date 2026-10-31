#!/usr/bin/env python3
"""Calendrical-number screen: do cord counts, group counts, group sizes, value totals, group sums
or single cord values hit 12/24/29/30/41/328/354/355/360/365/366/730 more often than matched
neighbouring numbers?  Null = counts at neighbour numbers of the same roundness class
(same number of trailing zeros, same divisibility by 5), Poisson upper tail.
Also prints the UR006 (KH0242) and Ica 14/1/7 (KH0068) structure checks.

    python3 scripts/deep/period_calendar.py
"""
from __future__ import annotations
import collections, sys, math
import numpy as np
from scipy import stats
sys.path.insert(0, __import__("os").path.dirname(__file__))
from period_common import load, level1, EXCLUDE_VALUES, base_colour

TARGETS = [12, 24, 29, 30, 41, 328, 354, 355, 360, 365, 366, 730]


def rclass(x):
    tz = 0
    while x and x % 10 == 0:
        x //= 10; tz += 1
    return (tz, x % 5 == 0)


def neighbours(T, lo=1, k=6):
    """the k nearest numbers (either side) of the same roundness class, targets excluded."""
    c = [x for x in range(max(lo, T // 2), T * 2) if x != T and rclass(x) == rclass(T) and x not in TARGETS]
    return sorted(c, key=lambda x: abs(x - T))[:k]


def feature_sets(k):
    cs = level1(k)
    gs = [g["n"] for g in k["groups"] if g["n"] > 0]
    f = {"nLevel1": {len(cs)}, "nCords": {len(k["cords"])}, "nGroups": {len(gs)}, "groupSize": set(gs)}
    if k["id"] not in EXCLUDE_VALUES:
        vals = [c.get("value") or 0 for c in cs]
        f["totalL1"] = {sum(vals)}
        f["totalAll"] = {sum(c.get("value") or 0 for c in k["cords"])}
        gsum = collections.defaultdict(int)
        for c in cs:
            gsum[c["group"]] += c.get("value") or 0
        f["groupSum"] = set(gsum.values())
        f["cordValue"] = {c.get("value") or 0 for c in k["cords"]}
    return f


def main():
    ks = load()
    F = [feature_sets(k) for k in ks]
    feats = ["nLevel1", "nCords", "nGroups", "groupSize", "totalL1", "totalAll", "groupSum", "cordValue"]
    print("khipus containing feature == T  (obs vs mean of matched neighbours; Poisson p)")
    pooled = collections.defaultdict(lambda: [0, 0.0])
    for feat in feats:
        cnt = collections.Counter()
        for f in F:
            for v in f.get(feat, ()):
                cnt[v] += 1
        line = []
        for T in TARGETS:
            nb = neighbours(T)
            exp = np.mean([cnt[x] for x in nb]) if nb else float("nan")
            obs = cnt[T]
            p = stats.poisson.sf(obs - 1, exp) if exp > 0 else float("nan")
            pooled[feat][0] += obs; pooled[feat][1] += exp
            if obs or exp > 0.5:
                line.append(f"{T}:{obs}/{exp:.1f}" + ("*" if p < 0.01 else "") + f"(p={p:.2g})")
        po, pe = pooled[feat]
        print(f"{feat:10s} pooled {po}/{pe:.1f} p={stats.poisson.sf(po-1, pe):.2g} | " + "  ".join(line))
    # which khipus hit the big targets
    print("\nkhipus hitting T>=328 on any count/total feature:")
    for k, f in zip(ks, F):
        hits = [(feat, T) for feat in feats if feat != "cordValue" for T in TARGETS if T >= 328 and T in f.get(feat, ())]
        if hits:
            print("  ", k["id"], k["aliases"], k["provenance"], hits)

    km = {k["id"]: k for k in ks}
    for kid in ("KH0242", "KH0068"):
        k = km[kid]; cs = level1(k)
        gs = [g["n"] for g in k["groups"]]
        print(f"\n== {kid} {k['aliases']} {k['provenance']}: level1={len(cs)} pendants={k['stats']['nPendants']} "
              f"top={k['stats']['nTop']} subs={k['stats']['nSubsidiaries']} cords={len(k['cords'])} groups={len(gs)}")
        print("   group sizes:", gs)
        big = [n for n in gs if n >= 10]
        print(f"   groups>=10: {len(big)} sum={sum(big)}; singletons={gs.count(1)}")
        byg = collections.defaultdict(list)
        for c in cs:
            byg[c["group"]].append(c)
        print("   per group: n | cords incl subs | value sum | colours")
        for g in sorted(byg):
            gc = byg[g]
            nsub = sum(1 for c in k["cords"] if c["level"] > 1 and any(c["name"].startswith(p["name"] + "s") for p in gc))
            print(f"   g{g:02d} n={len(gc):2d} +subs={nsub:3d} sum={sum(c.get('value') or 0 for c in gc):4d} "
                  + " ".join(base_colour(c) for c in gc[:24]))


if __name__ == "__main__":
    main()

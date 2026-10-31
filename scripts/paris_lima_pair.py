#!/usr/bin/env python3
"""KH0097 (AS084, Musée du quai Branly 71.1930.19.470) and KH0586 (HP055, MNAAHP 29934, Lima)
record the same account.

Found 2026-09-19 by a corpus-wide scan for shared 5-value passages (9 shared runs, 51 values —
the most of any pair not already known to be one object or a published match).  The KFG pages
of both list no cross-reference.  This script prints the unit-by-unit alignment and a
permutation baseline.

    python3 scripts/paris_lima_pair.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"


def load(kid: str) -> dict:
    return json.loads((DATA / f"{kid}.json").read_text())


def level1(k: dict) -> list[dict]:
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def groups(k: dict) -> list[list[dict]]:
    out: list[list[dict]] = [[] for _ in k["groups"]]
    for c in level1(k):
        if c.get("group") is not None and c["kind"] == "pendant":
            out[c["group"]].append(c)
    return [g for g in out if g]


def val(c: dict) -> int:
    return c.get("value") or 0


def main() -> None:
    a, b = load("KH0097"), load("KH0586")
    ga, gb = groups(a), groups(b)
    # Units: Paris groups 1-15 (the Aschers' "part 1"); Lima groups of >= 9 cords.
    units_a = ga[:15]
    units_b = [g for g in gb if len(g) >= 9]
    print(f"Paris part 1: {len(units_a)} units; Lima: {len(units_b)} units of >=9 cords")
    print(f"{'unit':>4} {'Paris lead':>10} {'Lima lead':>9}  verdict   shared other values")
    exact = reg = 0
    for i, (ua, ub) in enumerate(zip(units_a, units_b), 1):
        la, lb = val(ua[0]), val(ub[0])
        if la == lb:
            verdict, exact = "exact", exact + 1
        elif la % 1000 == lb % 1000 or abs(la - lb) % 100 == 0:
            verdict, reg = "register", reg + 1
        else:
            verdict = "differs"
        sa = [val(c) for c in ua[1:] if val(c)]
        sb = [val(c) for c in ub[1:] if val(c)]
        shared = sorted(set(sa) & set(sb))
        print(f"{i:>4} {la:>10} {lb:>9}  {verdict:<9} {shared}")
    print(f"leading values: {exact} exact, {reg} register slips (Lima 78 vs 1078, 187 vs 1087), "
          f"{len(units_a) - exact - reg} differ")

    # Field-level: how many of Paris's non-leading values reappear in the Lima unit, in order?
    def lcs(x: list[int], y: list[int]) -> int:
        dp = [[0] * (len(y) + 1) for _ in range(len(x) + 1)]
        for i in range(len(x)):
            for j in range(len(y)):
                dp[i + 1][j + 1] = dp[i][j] + 1 if x[i] == y[j] and x[i] else max(dp[i][j + 1], dp[i + 1][j])
        return dp[-1][-1]

    tot = matched = 0
    for ua, ub in zip(units_a, units_b):
        xa = [val(c) for c in ua[1:] if val(c)]
        xb = [val(c) for c in ub[1:] if val(c)]
        tot += len(xa)
        matched += lcs(xa, xb)
    print(f"non-leading fields: {matched} of {tot} Paris values recur in order in the Lima unit "
          f"({matched / tot:.0%})")

    # Baseline: same statistic when the Lima units are paired with Paris units at random,
    # and when values are shuffled within khipu.
    random.seed(20260919)
    rnd = []
    for _ in range(2000):
        perm = units_b[:]
        random.shuffle(perm)
        m = sum(lcs([val(c) for c in ua[1:] if val(c)], [val(c) for c in ub[1:] if val(c)])
                for ua, ub in zip(units_a, perm))
        rnd.append(m)
    rnd.sort()
    print(f"random unit pairing: median {rnd[len(rnd)//2]}, 99th pct {rnd[int(len(rnd)*0.99)]}, "
          f"max {rnd[-1]} (observed {matched})")
    lead_hits = sum(1 for ua, ub in zip(units_a, units_b) if val(ua[0]) == val(ub[0]))
    print(f"leading-value order: {lead_hits}/15 identical four-digit totals in the same sequence; "
          f"Paris has {len(ga) - 15} further groups (its part 2) with no Lima counterpart; "
          f"Lima has {len(gb) - len(units_b)} short brown separator groups (42, 43, 450, 120, 432 ...) "
          f"that Paris carries as in-group fields.")
    print("Different objects: Paris 319 cords / 116 cm / primary W:AB; Lima 189 cords / 112 cm / primary W-MB.")


if __name__ == "__main__":
    main()

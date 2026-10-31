#!/usr/bin/env python3
"""Verification tables for the "tied twice" story: AS175 (KH0192, Berlin
VA 42518, "Pachacamac") against the two spliced Huacho pieces UR233 (KH0470,
VA 63038 B) and UR232 (KH0469, VA 63038 A).

Prints, field by field, every six-cord unit of the Huacho pieces beside the
five-cord group of AS175 in the same position (UR233 restates part 1, groups
1-21; UR232 restates part 3, groups 25-45), then the Aschers' summary test:
the three groups of part 2 against the sums of part 3 taken by set position,
once with AS175's own values and once with UR232's.

    python3 scripts/tied_twice.py
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "public", "data", "khipus")

PARTS = {"1": (0, 20), "2": (21, 23), "3": (24, 44)}
# position of each of the five fields inside a six-cord unit; the position
# left out is the knotless cord
SIDES = [
    dict(id="KH0470", alias="UR233", part="1", map=[0, 1, 3, 4, 5], units="sixes"),
    dict(id="KH0469", alias="UR232", part="3", map=[0, 1, 2, 4, 5], units="recorded"),
]


def load(kid):
    return json.load(open(os.path.join(DATA, f"{kid}.json")))


def groups(k):
    by = {}
    for c in k["cords"]:
        if c["level"] != 1:
            continue
        by.setdefault(c["group"], []).append(c)
    return [sorted(v, key=lambda c: c["ordinal"]) for _, v in sorted(by.items())]


def fields(g):
    out = list(g)
    while len(out) < 5:
        out.insert(0, None)
    return out[:5]


def units(k, mode):
    if mode == "recorded":
        return groups(k)
    p = [c for c in k["cords"] if c["level"] == 1]
    p.sort(key=lambda c: (c.get("group") or 0, c["ordinal"]))
    return [p[i : i + 6] for i in range(0, len(p), 6)]


def verdict(a, b):
    if a is None or b is None:
        return "na"
    if a == b:
        return "exact"
    d = abs(a - b)
    if d == 1:
        return "one"
    if d % 10 == 0 and d <= 20:
        return "ten"
    if a * 10 == b or b * 10 == a:
        return "register"
    return "no"


def val(c):
    return None if c is None else (c["value"] or 0)


def compare(A, side):
    B = load(side["id"])
    ga = groups(A)
    us = units(B, side["units"])
    lo, hi = PARTS[side["part"]]
    stats = {}
    print(f"\n== AS175 part {side['part']} (groups {lo + 1}-{hi + 1}) vs {side['alias']} ==")
    for u in range(min(hi - lo + 1, len(us))):
        fa = fields(ga[lo + u])
        unit = us[u] + [None] * (6 - len(us[u]))
        cells = []
        for f in range(5):
            va, vb = val(fa[f]), val(unit[side["map"][f]])
            v = verdict(va, vb)
            stats[v] = stats.get(v, 0) + 1
            cells.append(f"{'—' if va is None else va:>4}/{'—' if vb is None else vb:<4}{'' if v == 'exact' else v}")
        print(f"  u{u + 1:2} g{lo + u + 1:2}  " + "  ".join(cells))
    print("  ", stats)
    return B


def summary(A, C):
    ga = groups(A)
    us = units(C, "recorded")
    side = SIDES[1]
    names = ["white", "deep brown", "green", "light brown", "brown+olive"]
    print("\n== part 2 as column totals of part 3, by set position ==")
    ex = {"AS175": 0, "UR232": 0}
    for k in range(3):
        target = fields(ga[PARTS["2"][0] + k])
        for f in range(5):
            idx = [PARTS["3"][0] + k + 3 * s for s in range(7)]
            ta = [val(fields(ga[i])[f]) for i in idx]
            tb = [val((us[i - PARTS["3"][0]] + [None] * 6)[side["map"][f]]) for i in idx]
            sa, sb = sum(x or 0 for x in ta), sum(x or 0 for x in tb)
            t = val(target[f])
            va, vb = verdict(sa, t), verdict(sb, t)
            ex["AS175"] += va == "exact"
            ex["UR232"] += vb == "exact"
            print(
                f"  g{PARTS['2'][0] + k + 1} {names[f]:12} target {t:4} | AS175 {sa:4} {va:8} | UR232 {sb:4} {vb:8} | {ta} vs {tb}"
            )
    print("  exact:", ex)


def main():
    A = load("KH0192")
    B = compare(A, SIDES[0])
    C = compare(A, SIDES[1])
    summary(A, C)
    kids = {}
    for c in B["cords"]:
        if c.get("parent"):
            kids.setdefault(c["parent"], []).append(c)
    print("\n== subsidiaries surviving on UR233 (>= 3 cm) ==")
    for c in B["cords"]:
        if c["level"] > 1 and (c["length"] or 0) >= 3:
            print(f"  {c['name']:8} {c['color']:24} value {c['value']}  length {c['length']}")


if __name__ == "__main__":
    main()

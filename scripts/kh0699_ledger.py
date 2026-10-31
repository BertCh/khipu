#!/usr/bin/env python3
"""Verification tables for the Twin Falls khipu (KH0699 / KT001).

Reads public/data/khipus/KH0699.json and prints, for each of the three
sections, the lone total cords against the groups they precede and the
six-cord summary groups against the six detail groups. Subsidiaries count
with their pendant; a subsidiary carrying a single figure-eight knot and
nothing else is read as a label, not a 1. The opening six cords are read
with their single-knot cluster as tens (see the story for why).

    python3 scripts/kh0699_ledger.py
"""

import collections
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "public", "data", "khipus", "KH0699.json")

SECTIONS = [
    dict(key="A", total=None, sums=0, total2=1, sums2=2, details=[3, 4, 5, 6, 7, 8]),
    dict(key="B", total=9, sums=10, total2=11, sums2=12, details=[13, 14, 15, 16, 17, 18]),
    dict(key="C", total=19, sums=20, total2=21, sums2=22, details=[23, 24, 25, 26, 27, 28]),
]


def main():
    d = json.load(open(PATH))
    cords = d["cords"]
    kids = collections.defaultdict(list)
    for c in cords:
        if c.get("parent"):
            kids[c["parent"]].append(c)

    def is_marker(c):
        return c["level"] > 1 and len(c["knots"]) == 1 and c["knots"][0]["type"] == "E"

    def total(c):
        return (c["value"] or 0) + sum(total(k) for k in kids[c["name"]] if not is_marker(k))

    def tens(c):
        return sum(10 * k["n"] if k["type"] == "S" else k["n"] for k in c["knots"])

    groups = collections.defaultdict(list)
    for c in cords:
        if c["level"] == 1:
            groups[c["group"]].append(c)
    for g in groups.values():
        g.sort(key=lambda c: c["ordinal"])

    def gtotal(gi):
        return sum(total(c) for c in groups[gi])

    def mark(a, b):
        return "exact" if a == b else "off by %d" % abs(a - b) if abs(a - b) <= 1 else "no"

    for s in SECTIONS:
        print("=== Section %s" % s["key"])
        for label, gi, target in (("total", s["total"], s["sums"]), ("second total", s["total2"], s["sums2"])):
            if gi is None:
                continue
            c = groups[gi][0]
            v = total(c)
            print("  %-13s %-6s %5d  vs group %2d total %5d  %s" % (label, c["name"], v, target + 1, gtotal(target), mark(v, gtotal(target))))
        print("  six sums (group %d) against the detail groups:" % (s["sums"] + 1))
        for i, gi in enumerate(s["details"]):
            c = groups[s["sums"]][i]
            subs = sum(total(k) for k in kids[c["name"]] if not is_marker(k))
            read = tens(c) + subs if s["key"] == "A" else total(c)
            entries = " + ".join(
                str(x["value"] or 0) + "".join("+%d" % total(k) for k in kids[x["name"]] if not is_marker(k))
                for x in groups[gi]
                if x["value"] or any(not is_marker(k) and k["value"] for k in kids[x["name"]])
            )
            print("    %-5s reads %4d | group %2d: %s = %d  %s" % (c["name"], read, gi + 1, entries, gtotal(gi), mark(read, gtotal(gi))))
        print()


if __name__ == "__main__":
    main()

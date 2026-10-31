#!/usr/bin/env python3
"""How much of knot-direction (S/Z) variation is explained by knot TYPE?

Urton (1994, 2003) treated knot direction as a free binary sign.  Across the KFG corpus the
direction of a knot is, in most khipus that mix directions at all, predictable from whether it is
a single knot, a long knot or a figure-eight.  This script prints the corpus table, the per-khipu
explained fraction against a majority-direction baseline, and the khipus where direction still
varies after type is accounted for (the candidates for a deliberate sign).

    python3 scripts/knot_direction_by_type.py
    python3 scripts/knot_direction_by_type.py --json   # also writes public/data/stories/knot-direction.json

The JSON feeds /stories/which-way-the-knot.  scripts/build_data.py does NOT regenerate it: rerun this
script with --json after refreshing public/data/khipus.  Directions are counted per recorded knot
cluster (one direction reading per S/L/E entry; a cluster recorded "ZZSZ" counts by its majority).
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
OUT = ROOT / "public" / "data" / "stories" / "knot-direction.json"
TYPES = ("S", "L", "E")
# cluster entries whose recorder wrote one letter per knot ("ZZSZ") take their majority letter
def entry_dir(x: dict) -> str | None:
    d = x["dir"]
    if len(d) > 1:
        c = Counter(ch for ch in d if ch in "SZ")
        return c.most_common(1)[0][0] if c else None
    return d if d in ("S", "Z") else None


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def knots(k: dict):
    for c in k["cords"]:
        for x in c["knots"]:
            d = entry_dir(x)
            if d and x["type"] in TYPES:
                yield x["type"], d, c


def recorder(k: dict) -> str:
    """First-named contributor, collapsed to a surname the page can print."""
    full = k.get("contributors") or "unknown"
    if "Ascher" in full:
        return "Ascher"
    who = full.split(",")[0].split("&")[0].strip()
    return who.split()[-1] if who else "unknown"


def rule_of(kn: list) -> dict[str, str]:
    return {t: Counter(x[1] for x in kn if x[0] == t).most_common(1)[0][0]
            for t in TYPES if any(x[0] == t for x in kn)}


def main() -> None:
    ks = load()
    want_json = "--json" in sys.argv
    corpus = Counter((t, d) for k in ks for t, d, _ in knots(k))
    print("corpus knots by type x direction:")
    for t, name in (("S", "single"), ("L", "long"), ("E", "figure-eight")):
        s, z = corpus[(t, "S")], corpus[(t, "Z")]
        print(f"  {name:<13} S {s:>6}  Z {z:>6}   Z share {z / (s + z):.0%}")

    rows = []
    for k in ks:
        kn = list(knots(k))
        d = Counter(x[1] for x in kn)
        if len(kn) < 40 or min(d["S"], d["Z"]) < 8:
            continue
        maj = rule_of(kn)
        explained = sum(1 for x in kn if maj[x[0]] == x[1]) / len(kn)
        baseline = max(d.values()) / len(kn)
        deviants = [x for x in kn if maj[x[0]] != x[1]]
        rows.append((explained, baseline, len(kn), k, maj, deviants))
    print(f"\n{len(rows)} khipus mix directions (>=40 knots, >=8 of each direction)")
    print(f"  type explains >=95% of directions: {sum(1 for r in rows if r[0] >= .95)}"
          f"   (majority direction alone >=95%: {sum(1 for r in rows if r[1] >= .95)})")
    print(f"  type explains >=90%: {sum(1 for r in rows if r[0] >= .90)}")
    print("  most common per-khipu rule:",
          Counter(tuple(sorted(r[4].items())) for r in rows).most_common(3))

    print("\nKhipus where direction still varies after type (>=15% deviant knots) — candidates for a sign:")
    rows.sort(key=lambda r: -(len(r[5]) / r[2]))
    for explained, baseline, n, k, maj, dev in rows:
        share = len(dev) / n
        if share < 0.15:
            break
        cords = {c["name"] for _, _, c in dev}
        slots = Counter()
        for c in k["cords"]:
            if c["name"] in cords and c["level"] == 1 and c.get("group") is not None:
                g = k["groups"][c["group"]]
                slots[c["ordinal"] - g["first"] + 1] += 1
        print(f"  {k['id']} {','.join(k['aliases']):<18} {n:>4} knots, {share:.0%} deviant; "
              f"rule {maj}; deviant cords by slot-in-group {slots.most_common(3)}")
    if want_json:
        write_json(ks, corpus, rows)
    print("\nSlot 1 on KH0099 and KH0280 is not informative (every group is a single cord): both switch "
          "direction on whole cords.  KH0285 (one 61-cord group) runs in blocks — p3-p13 S, p14-p40 Z, p41-p48 S — "
          "production episodes, not a per-cord sign.  KH0280 belongs to the camelid-fibre, long-knot-only "
          "family (KH0280-282, 288, 289, 346, 348) whose KFG decimal 'values' are sums of tally turns.")


def write_json(ks: list[dict], corpus: Counter, rows: list) -> None:
    """The figures /stories/which-way-the-knot reads (see the docstring)."""
    table = {t: {"S": corpus[(t, "S")], "Z": corpus[(t, "Z")]} for t in TYPES}
    mixed = []
    for explained, baseline, n, k, maj, dev in sorted(rows, key=lambda r: r[3]["id"]):
        d = Counter(x[1] for x in knots(k))
        mixed.append({
            "id": k["id"], "aliases": k["aliases"], "recorder": recorder(k),
            "provenance": k.get("provenance"), "n": n, "S": d["S"], "Z": d["Z"],
            "rule": maj, "explained": round(explained, 3), "baseline": round(baseline, 3),
            "deviant": round(len(dev) / n, 3),
        })
    # recorder confound: every khipu with >= 20 direction readings, by the (single, long) rule
    by_rec: dict[str, Counter] = defaultdict(Counter)
    zsingle: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for k in ks:
        kn = list(knots(k))
        if len(kn) < 20:
            continue
        r = rule_of(kn)
        key = f"{r.get('S', '-')}/{r.get('L', '-')}"
        by_rec[recorder(k)][key] += 1
        for t, d, _ in kn:
            if t == "S":
                zsingle[recorder(k)][d == "Z"] += 1
    recorders = [
        {"recorder": who, "khipus": sum(c.values()), "rules": dict(c.most_common()),
         "zShareSingles": round(zsingle[who][1] / max(1, sum(zsingle[who])), 3)}
        for who, c in sorted(by_rec.items(), key=lambda kv: -sum(kv[1].values()))
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": "scripts/knot_direction_by_type.py --json",
        "unit": "recorded knot clusters (one S/Z reading per S, L or E entry)",
        "nKhipus": len(ks),
        "table": table,
        "mixed": mixed,
        "explained95": sum(1 for r in rows if r[0] >= .95),
        "explained90": sum(1 for r in rows if r[0] >= .90),
        "baseline95": sum(1 for r in rows if r[1] >= .95),
        "recorders": recorders,
    }, indent=0))
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

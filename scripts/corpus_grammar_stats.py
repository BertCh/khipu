#!/usr/bin/env python3
"""Corpus-wide grammar statistics behind the 2026-09-19 survey and the
/stories/where-the-big-number-sits page.

  1. Which slot in a fixed-size group carries the largest value (first / middle / last).
  2. Fixed blank slots: khipus where one position is knotless in >=80% of same-size groups.
  3. Round-number bias: last digits of values >= 10.
  4. Fixed-constant ("tariff") khipus: one value >= 11 on a large share of knotted cords.

    python3 scripts/corpus_grammar_stats.py          # print the tables
    python3 scripts/corpus_grammar_stats.py --json   # also write public/data/stories/group-grammar.json

The JSON is what the story page loads (the corpus cannot be scanned client-side).
scripts/build_data.py does NOT regenerate it: rerun this script after a data refresh.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
OUT = ROOT / "public" / "data" / "stories" / "group-grammar.json"

MIN_GROUP = 4
MIN_GROUPS = 6
MIN_KNOTTED = 3
Z_THRESHOLD = 4.0
BLANK_SHARE = 0.8
ROUND_MIN_VALUES = 30
CONSTANT_SHARE = 0.3


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def val(c: dict) -> int:
    return c.get("value") or 0


def groups(k: dict) -> list[list[int]]:
    out: dict[int, list[int]] = {}
    for c in sorted(k["cords"], key=lambda c: c["ordinal"]):
        if c["level"] == 1 and c["kind"] == "pendant" and c.get("group") is not None:
            out.setdefault(c["group"], []).append(val(c))
    return [g for _, g in sorted(out.items())]


def alias(k: dict) -> str:
    return ",".join(k["aliases"]) or k["id"]


def slot_cases(ks: list[dict]) -> list[dict]:
    """One row per (khipu, group size) with >= MIN_GROUPS groups of that size."""
    rows = []
    for k in ks:
        gs = groups(k)
        for n, cnt in sorted(Counter(len(g) for g in gs).items()):
            if n < MIN_GROUP or cnt < MIN_GROUPS:
                continue
            G = [g for g in gs if len(g) == n and sum(1 for x in g if x) >= MIN_KNOTTED]
            if len(G) < MIN_GROUPS:
                continue
            am = Counter(max(range(n), key=lambda i: g[i]) for g in G)
            slot, c = am.most_common(1)[0]
            p = 1 / n
            z = (c - len(G) * p) / (len(G) * p * (1 - p)) ** 0.5
            zero = Counter(i for g in G for i in range(n) if g[i] == 0)
            blank_slot, blank_count = zero.most_common(1)[0] if zero else (None, 0)
            rows.append({
                "id": k["id"], "alias": alias(k), "provenance": k.get("provenance"),
                "n": n, "groups": len(G),
                "maxSlot": slot + 1, "maxCount": c, "z": round(z, 2),
                "position": "first" if slot == 0 else "last" if slot == n - 1 else "middle",
                "blankSlot": blank_slot + 1 if blank_slot is not None else None,
                "blankCount": blank_count,
            })
    return rows


def last_digits(ks: list[dict]) -> tuple[Counter, list[dict]]:
    vs = [val(c) for k in ks for c in k["cords"] if val(c) >= 10]
    last = Counter(x % 10 for x in vs)
    per = []
    for k in ks:
        w = [val(c) for c in k["cords"] if val(c) >= 10]
        if len(w) >= ROUND_MIN_VALUES:
            per.append({"id": k["id"], "alias": alias(k), "provenance": k.get("provenance"),
                        "n": len(w), "round": round(sum(1 for x in w if x % 10 == 0) / len(w), 3)})
    per.sort(key=lambda r: -r["round"])
    return last, per


def constants(ks: list[dict]) -> list[dict]:
    out = []
    for k in ks:
        w = [val(c) for c in k["cords"] if val(c)]
        if len(w) < 20 or not any(v >= 11 for v in w):
            continue
        x, n = Counter(v for v in w if v >= 11).most_common(1)[0]
        if n / len(w) >= CONSTANT_SHARE:
            out.append({"id": k["id"], "alias": alias(k), "provenance": k.get("provenance"),
                        "value": x, "count": n, "knotted": len(w)})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help=f"write {OUT.relative_to(ROOT)}")
    args = ap.parse_args()
    ks = load()

    cases = slot_cases(ks)
    strong = [r for r in cases if r["z"] > Z_THRESHOLD]
    maxslot = Counter(r["position"] for r in strong)
    blank_rows = [r for r in cases if r["blankSlot"] is not None and r["blankCount"] >= BLANK_SHARE * r["groups"]]
    print(f"1. {len(cases)} (khipu, group size) cases with >={MIN_GROUPS} same-size groups; {len(strong)} have one slot "
          f"carrying the maximum at z>{Z_THRESHOLD:g}: {dict(maxslot)}  -> the largest value is almost never the LAST cord.")
    print(f"2. fixed blank slot (knotless in >={BLANK_SHARE:.0%} of groups): {len(blank_rows)} cases, e.g. " +
          "; ".join(f"{r['id']} {r['alias']} size {r['n']}: slot {r['blankSlot']} blank in {r['blankCount']}/{r['groups']}"
                    for r in blank_rows[:8]))

    last, per = last_digits(ks)
    total = sum(last.values())
    print(f"3. values >= 10: {total}; ending in 0: {last[0] / total:.0%} (uniform 10%); "
          f"ending in 5: {last[5] / total:.0%}; 1-4 vs 6-9: {sum(last[d] for d in (1,2,3,4)) / total:.0%} vs "
          f"{sum(last[d] for d in (6,7,8,9)) / total:.0%} (a Benford effect within each decade, not a finding)")
    shares = sorted(r["round"] for r in per)
    print(f"   per khipu (>={ROUND_MIN_VALUES} such values, n={len(per)}): median share ending in 0 = "
          f"{shares[len(shares)//2]:.0%}; {sum(1 for x in shares if x >= .8)} khipus >= 80%")

    consts = constants(ks)
    print(f"4. fixed-constant khipus (one value >= 11 on >= {CONSTANT_SHARE:.0%} of knotted cords, >= 20 cords):")
    for r in consts:
        print(f"   {r['id']} {r['alias']:<14} {r['count']:>3}/{r['knotted']:<3} cords = {r['value']:<4} {r['provenance'] or '-'}")

    if args.json:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "generated": "scripts/corpus_grammar_stats.py",
            "nKhipus": len(ks),
            "screen": {"minGroup": MIN_GROUP, "minGroups": MIN_GROUPS, "minKnotted": MIN_KNOTTED,
                       "zThreshold": Z_THRESHOLD, "blankShare": BLANK_SHARE,
                       "roundMinValues": ROUND_MIN_VALUES, "constantShare": CONSTANT_SHARE},
            "cases": cases,
            "lastDigits": {"total": total, "counts": [last[d] for d in range(10)]},
            "roundShare": per,
            "constants": consts,
        }
        OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
        print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

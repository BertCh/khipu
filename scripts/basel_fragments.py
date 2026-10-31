#!/usr/bin/env python3
"""The ten Basel fragments under Museum der Kulturen IVc.366.03 (KH0682-KH0691, MM008-MM017)
against the two Berlin Pachacamac khipus KH0450 (UR212, VA42513) and KH0147 (AS131, VA42510).

Extends /stories/pachacamac-fragment (KH0689 only).  Each fragment that can be placed carries a
brown group whose values are a 14-cord group of KH0450 and/or a white group whose values are a
10-cord group of KH0147, and the two halves obey one rule:

    KH0450 big group number k counted from its END  <->  KH0147 ten-cord group k from its START

    python3 scripts/basel_fragments.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
FRAGMENTS = [f"KH{n:04d}" for n in range(682, 692)]


def load(kid: str) -> dict:
    return json.loads((DATA / f"{kid}.json").read_text())


def level1(k: dict) -> list[dict]:
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def val(c: dict) -> int:
    return c.get("value") or 0


def groups(k: dict, min_size: int) -> list[list[int]]:
    out: dict[int, list[int]] = {}
    for c in level1(k):
        if c.get("group") is not None and c["kind"] == "pendant":
            out.setdefault(c["group"], []).append(val(c))
    return [g for _, g in sorted(out.items()) if len(g) >= min_size]


def best_match(seq: list[int], target: list[int]) -> tuple[int, int, str]:
    """Longest run of equal values between seq and target (forward or reversed), min 3."""
    best = (0, -1, "")
    for label, t in (("fwd", target), ("rev", target[::-1])):
        for i in range(len(seq)):
            for j in range(len(t)):
                n = 0
                while i + n < len(seq) and j + n < len(t) and seq[i + n] == t[j + n]:
                    n += 1
                informative = len({x for x in seq[i:i + n] if x}) >= 3 and max(seq[i:i + n], default=0) >= 10
                if n > best[0] and informative:
                    best = (n, i, label)
    return best


def main() -> None:
    brown = groups(load("KH0450"), 10)       # 14 big groups (g3 = 3 cords and g8 = 1 cord excluded)
    white = groups(load("KH0147"), 10)       # 14 ten-cord groups (singletons and the 2-cord g1 excluded)
    print(f"KH0450: {len(brown)} groups of >=10 cords; KH0147: {len(white)} groups of >=10 cords\n")
    print(f"{'fragment':<8} {'cords':>5}  brown half -> KH0450 unit (from end)   white half -> KH0147 unit (from start)")
    placed = []
    for fid in FRAGMENTS:
        k = load(fid)
        seq = [val(c) for c in level1(k)]
        bb = max(((best_match(seq, g), len(brown) - i) for i, g in enumerate(brown)), key=lambda x: x[0][0])
        ww = max(((best_match(seq, g), i + 1) for i, g in enumerate(white)), key=lambda x: x[0][0])
        bs = f"{bb[0][0]:>2} values {bb[0][2]} -> unit #{bb[1]:<2}" if bb[0][0] >= 3 else "  -"
        ws = f"{ww[0][0]:>2} values {ww[0][2]} -> unit #{ww[1]:<2}" if ww[0][0] >= 3 else "  -"
        print(f"{fid:<8} {len(seq):>5}  {bs:<36} {ws}")
        if bb[0][0] >= 3 and ww[0][0] >= 3:
            placed.append((fid, bb[1], ww[1]))
    print("\nFragments with both halves:", placed)
    ok = sum(1 for _, b, w in placed if b == w)
    print(f"unit rule holds for {ok}/{len(placed)}; chance of all agreeing under random pairing = "
          f"(1/{len(white)})^{len(placed)} = 1/{len(white) ** len(placed)}")
    print("\nOrientation: KH0689/KH0690/KH0686 read brown REVERSED then a blank then white FORWARD; "
          "KH0682 reads white REVERSED, blank, brown FORWARD, then 113 = last cord of KH0147 unit #13.\n"
          "One consistent object: units of [brown group k][blank][white group k] in KH0147's unit order, "
          "with KH0450 knotted (or recorded) in mirror order — units and cords both reversed.")
    # Unit-wise arithmetic between the two Berlin accounts?
    print("\nUnit totals (KH0147 ten-group vs KH0450 group from its end):")
    for i, (w, b) in enumerate(zip(white, brown[::-1]), 1):
        print(f"  #{i:<2} white sum {sum(w):>4}  brown sum {sum(b):>4}  ratio {sum(w)/sum(b) if sum(b) else 0:.2f}")
    print("No constant ratio or difference: two accounts of the same 14 units, not a copy and its summary.")


if __name__ == "__main__":
    main()

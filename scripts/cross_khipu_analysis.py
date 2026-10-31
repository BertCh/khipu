#!/usr/bin/env python3
"""Find and verify exact value passages shared by different khipus.

This is a discovery screen, not evidence that two objects necessarily record
the same subject.  It searches the level-1 pendant stream, collapses overlapping
windows into maximal passages, and reports enough metadata to separate known
duplicates from possible archival/accounting relationships.

It also prints the full KH0049/KH0362 alignment discovered by this screen.  The
four groups of KH0362 align to groups 3, 5, 6 and 7 of KH0049; group 4 of KH0049
has no counterpart.  A small corpus-wide permutation test estimates how often
an information-rich seven-value window appears in two shuffled khipus.

    python3 scripts/cross_khipu_analysis.py
    python3 scripts/cross_khipu_analysis.py --shuffles 1000
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
SEED = 4936207
WINDOW = 6


def load() -> list[dict]:
    return [json.loads(path.read_text()) for path in sorted(DATA.glob("KH*.json"))]


def pendants(khipu: dict) -> list[dict]:
    return sorted(
        (cord for cord in khipu["cords"] if cord["level"] == 1 and cord["kind"] == "pendant"),
        key=lambda cord: cord["ordinal"],
    )


def values(khipu: dict) -> list[int]:
    return [cord.get("value") or 0 for cord in pendants(khipu)]


def groups(khipu: dict) -> list[list[int]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for cord in pendants(khipu):
        if cord.get("group") is not None:
            grouped[cord["group"]].append(cord)
    return [
        [cord.get("value") or 0 for cord in sorted(cords, key=lambda cord: cord["ordinal"])]
        for _, cords in sorted(grouped.items())
    ]


def informative(window: tuple[int, ...], minimum_nonzero: int = 5) -> bool:
    return (
        sum(value > 0 for value in window) >= minimum_nonzero
        and len(set(window)) >= 4
        and max(window) >= 20
    )


def maximal_passages(khipus: list[dict]) -> list[dict]:
    """Maximal direct-order passages seeded by information-rich 6-windows."""
    seq = {khipu["id"]: values(khipu) for khipu in khipus}
    index: dict[tuple[int, ...], list[tuple[str, int]]] = defaultdict(list)
    for kid, vals in seq.items():
        for start in range(len(vals) - WINDOW + 1):
            window = tuple(vals[start : start + WINDOW])
            if informative(window):
                index[window].append((kid, start))

    best: dict[tuple[str, str], dict] = {}
    for places in index.values():
        for left_i in range(len(places)):
            for right_i in range(left_i + 1, len(places)):
                left_id, left_start = places[left_i]
                right_id, right_start = places[right_i]
                if left_id == right_id:
                    continue
                left, right = seq[left_id], seq[right_id]
                length = WINDOW
                while (
                    left_start + length < len(left)
                    and right_start + length < len(right)
                    and left[left_start + length] == right[right_start + length]
                ):
                    length += 1
                while left_start and right_start and left[left_start - 1] == right[right_start - 1]:
                    left_start -= 1
                    right_start -= 1
                    length += 1
                key = tuple(sorted((left_id, right_id)))
                row = {
                    "left": left_id,
                    "left_start": left_start,
                    "right": right_id,
                    "right_start": right_start,
                    "values": tuple(left[left_start : left_start + length]),
                }
                score = (length, len(set(row["values"])), max(row["values"]))
                old = best.get(key)
                if old is None:
                    best[key] = row
                else:
                    old_values = old["values"]
                    old_score = (len(old_values), len(set(old_values)), max(old_values))
                    if score > old_score:
                        best[key] = row
    return sorted(best.values(), key=lambda row: (-len(row["values"]), row["left"], row["right"]))


def shuffled_window_collisions(khipus: list[dict], shuffles: int) -> tuple[int, list[int]]:
    """Corpus-wide null for a stricter seven-value exact-window screen."""
    rng = random.Random(SEED)
    seq = [(khipu["id"], values(khipu)) for khipu in khipus]

    def scan(shuffle: bool) -> int:
        seen: dict[tuple[int, ...], str] = {}
        hits = 0
        for kid, original in seq:
            vals = original[:]
            if shuffle:
                rng.shuffle(vals)
            for start in range(len(vals) - 7 + 1):
                window = tuple(vals[start : start + 7])
                if not informative(window, minimum_nonzero=6) or len(set(window)) < 5:
                    continue
                previous = seen.get(window)
                if previous is None:
                    seen[window] = kid
                elif previous != kid:
                    hits += 1
        return hits

    return scan(False), [scan(True) for _ in range(shuffles)]


def kh0049_kh0362() -> None:
    left = json.loads((DATA / "KH0049.json").read_text())
    right = json.loads((DATA / "KH0362.json").read_text())
    left_groups, right_groups = groups(left), groups(right)
    mapping = ((2, 0), (4, 1), (5, 2), (6, 3))
    pairs = []
    print("\n=== KH0049 -> KH0362 GROUP ALIGNMENT")
    for left_i, right_i in mapping:
        left_values, right_values = left_groups[left_i], right_groups[right_i]
        exact = sum(a == b for a, b in zip(left_values, right_values))
        print(f"  KH0049 g{left_i + 1} -> KH0362 g{right_i + 1}: {exact}/18 exact")
        print(f"    {left_values}")
        print(f"    {right_values}")
        pairs.extend(zip(left_values, right_values))

    right_nonzero = [(a, b) for a, b in pairs if b > 0]
    print(f"  all fields: {sum(a == b for a, b in pairs)}/{len(pairs)} exact")
    print(f"  KH0362 nonzero fields: {sum(a == b for a, b in right_nonzero)}/{len(right_nonzero)} exact; "
          f"{sum(abs(a - b) / a <= 0.02 for a, b in right_nonzero)}/{len(right_nonzero)} within 2%")
    print(f"  blanked in KH0362: {sum(b == 0 < a for a, b in pairs)} fields")


def selected_group_links() -> None:
    """Print the small cross-object links that survived manual inspection."""
    loaded = {
        kid: json.loads((DATA / f"{kid}.json").read_text())
        for kid in ("KH0147", "KH0450", "KH0689", "KH0377", "KH0590", "KH0358", "KH0602")
    }
    grouped = {kid: groups(khipu) for kid, khipu in loaded.items()}

    kh0450 = grouped["KH0450"][15]
    kh0689_first = grouped["KH0689"][0]
    assert kh0450[:-1] == list(reversed(kh0689_first[:-1]))
    assert kh0450[-1] == kh0689_first[-1] == 0

    kh0147 = grouped["KH0147"][0]
    kh0689_second = grouped["KH0689"][1]
    assert kh0147[:6] == kh0689_second[:6]
    assert kh0147[7] == kh0689_second[7]
    assert kh0147[8] == grouped["KH0689"][2][0]

    assert grouped["KH0377"][0][10:18] == grouped["KH0590"][1]
    assert grouped["KH0358"][14] == grouped["KH0602"][3]

    print("\n=== SELECTED GROUP-LEVEL LINKS")
    print("  KH0450 g16 first 13 values = reverse(KH0689 g1 first 13); both end in 0")
    print(f"    KH0450: {kh0450}")
    print(f"    KH0689: {kh0689_first}")
    print("  KH0689 g2 matches KH0147 g1 positions 1-6 and 8; KH0689 g3 matches position 9")
    print(f"    KH0147: {kh0147}")
    print(f"    KH0689: {kh0689_second} + {grouped['KH0689'][2]}")
    print("  KH0377 g1 positions 11-18 = all of KH0590 g2")
    print(f"    {grouped['KH0590'][1]}")
    print("  KH0358 JSON g30 (15th pendant group) = KH0602 g4")
    print(f"    {grouped['KH0358'][14]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shuffles", type=int, default=200)
    args = parser.parse_args()
    khipus = load()
    print(f"Loaded {len(khipus)} khipus")

    print("\n=== MAXIMAL EXACT CROSS-KHIPU PASSAGES")
    print("At least six values; >=5 nonzero, >=4 distinct, maximum >=20")
    for row in maximal_passages(khipus):
        passage = row["values"]
        print(
            f"  {row['left']} p{row['left_start'] + 1} <-> "
            f"{row['right']} p{row['right_start'] + 1}: n={len(passage)} {passage}"
        )

    kh0049_kh0362()
    selected_group_links()

    observed, simulations = shuffled_window_collisions(khipus, args.shuffles)
    p_value = (1 + sum(value >= observed for value in simulations)) / (args.shuffles + 1)
    print("\n=== CORPUS-WIDE SHUFFLED NULL")
    print(f"  exact qualifying 7-windows observed: {observed}")
    print(f"  {args.shuffles} within-khipu corpus shuffles: mean {statistics.mean(simulations):.3f}, "
          f"max {max(simulations)}, global p={p_value:.6f}")


if __name__ == "__main__":
    main()

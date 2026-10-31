#!/usr/bin/env python3
"""Corpus-wide scan for value passages shared by two different khipus, forward or REVERSED.

The screen behind the 2026-09-19 survey: windows of five consecutive level-1 values with
>= 4 non-zero, >= 4 distinct and a maximum >= 15, extended to maximal runs, both orientations.
It re-finds the known matches (AS175/UR233, AS114/AS123, the Puruchuco pairs) and surfaced
KH0097/KH0586 (Paris/Lima), the KH0450/KH0147 links of the Basel fragments KH0682/KH0683/KH0690,
and KH0473 as a second record of KH0121.  Khipus whose recorded cords are known to be another
khipu's (cordDataError, set by the ETL) are left out of every value scan.  A shuffle baseline shows
how many pairs a random corpus produces.

    python3 scripts/shared_passages.py [--top 40] [--shuffles 3]
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
WINDOW = 5
SEED = 20260919

def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def scannable(ks: list[dict]) -> list[dict]:
    """Khipus whose cords may enter a value scan: the ETL (build_data.SOURCE_OVERRIDES) marks a record
    whose cords are known not to be its own with cordDataError, and no scan should see it."""
    return [k for k in ks if not k.get("cordDataError")]


def values(k: dict) -> list[int]:
    cords = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
    return [c.get("value") or 0 for c in cords]


def informative(w: tuple[int, ...]) -> bool:
    return sum(1 for x in w if x) >= 4 and len(set(w)) >= 4 and max(w) >= 15


def scan(seqs: dict[str, list[int]]) -> dict[tuple[str, str], set[tuple[int, int, int]]]:
    """(a, b) -> set of (run length, start in a, start in b) for maximal shared runs."""
    index: dict[tuple[int, ...], list[tuple[str, int]]] = {}
    for kid, s in seqs.items():
        for i in range(len(s) - WINDOW + 1):
            w = tuple(s[i:i + WINDOW])
            if informative(w):
                index.setdefault(w, []).append((kid, i))
    runs: dict[tuple[str, str, int, int], int] = {}
    for occ in index.values():
        for a in occ:
            for b in occ:
                if a[0] >= b[0]:
                    continue
                sa, sb = seqs[a[0]], seqs[b[0]]
                i, j = a[1], b[1]
                while i > 0 and j > 0 and sa[i - 1] == sb[j - 1]:
                    i, j = i - 1, j - 1
                e = WINDOW
                while a[1] + e < len(sa) and b[1] + e < len(sb) and sa[a[1] + e] == sb[b[1] + e]:
                    e += 1
                key = (a[0], b[0], i, j)
                runs[key] = max(runs.get(key, 0), a[1] + e - i)
    out: dict[tuple[str, str], set[tuple[int, int, int]]] = {}
    for (a, b, i, j), n in runs.items():
        out.setdefault((a, b), set()).add((n, i, j))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--shuffles", type=int, default=3)
    args = ap.parse_args()
    ks = scannable(load())
    meta = {k["id"]: k for k in ks}
    fwd = {k["id"]: values(k) for k in ks}
    rev = {f"{k['id']}~": values(k)[::-1] for k in ks}

    rows = []
    for (a, b), runs in scan(fwd).items():
        rows.append((sum(r[0] for r in runs), len(runs), a, b, "fwd", sorted(runs, reverse=True)[:3]))
    for (a, b), runs in scan({**fwd, **rev}).items():
        if a.endswith("~") == b.endswith("~"):
            continue  # both forward or both reversed: already counted
        aa, bb = a.rstrip("~"), b.rstrip("~")
        if aa == bb:
            continue
        rows.append((sum(r[0] for r in runs), len(runs), aa, bb, "rev", sorted(runs, reverse=True)[:3]))
    rows.sort(reverse=True)

    def label(i: str) -> str:
        k = meta[i]
        return f"{i} ({','.join(k['aliases']) or '-'}; {k['museum']['canonical'][:22]}; {k['provenance'] or '-'})"

    print(f"{'values':>6} {'runs':>4} dir  pair  [(run length, start a, start b) ...]")
    for total, n, a, b, d, runs in rows[: args.top]:
        print(f"{total:>6} {n:>4} {d}  {label(a)}  <->  {label(b)}  {runs}")

    random.seed(SEED)
    base = []
    for _ in range(args.shuffles):
        shuffled = {}
        for kid, s in fwd.items():
            t = s[:]
            random.shuffle(t)
            shuffled[kid] = t
        f = scan(shuffled)
        base.append((sum(1 for r in f.values() if max(x[0] for x in r) >= 6), len(f)))
    obs = scan(fwd)
    print(f"\nforward pairs with a run >= 6: observed {sum(1 for r in obs.values() if max(x[0] for x in r) >= 6)} "
          f"of {len(obs)} pairs; shuffled corpora (run>=6, pairs): {base}")


if __name__ == "__main__":
    main()

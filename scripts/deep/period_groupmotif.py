#!/usr/bin/env python3
"""Periodicity in the group-size sequence: the longest run in which group sizes repeat with motif
period q (1..6 groups), tolerance |d| <= max(1, 10%).  Block = one motif period (its cord count).
Null: group order shuffled within the khipu (2000 perms) -> empirical p of the repeat count.
Then corpus tables: block cord-length and repeat counts among significant khipus.

    python3 scripts/deep/period_groupmotif.py
"""
from __future__ import annotations
import collections, sys
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from period_common import load, rng

R = rng(7)
PERMS = 2000


def best_motif(G):
    G = np.asarray(G); m = len(G); best = (0, 1, 0, 0)
    for q in range(1, 7):
        if m < 2 * q + 1:
            break
        ok = np.abs(G[q:] - G[:-q]) <= np.maximum(1, 0.1 * G[:-q])
        run = 0
        for i, o in enumerate(ok):
            run = run + 1 if o else 0
            if run:
                reps = (run + q) / q
                if reps > best[0] + 1e-9:
                    best = (reps, q, i - run + 1, run)
    return best  # repeats, q, start, run


def stat(G):
    reps, q, s, run = best_motif(G)
    return reps


def main():
    ks = load()
    rows = []
    for k in ks:
        G = [g["n"] for g in k["groups"] if g["n"] > 0]
        if len(G) < 6:
            continue
        reps, q, s, run = best_motif(G)
        block = G[s:s + q]
        if max(block) < 2 and q == 1:
            continue  # runs of singletons are not blocks
        null = np.array([stat(R.permutation(G)) for _ in range(PERMS)])
        p = (1 + (null >= reps).sum()) / (PERMS + 1)
        rows.append(dict(id=k["id"], aliases=k["aliases"], prov=k["provenance"], nG=len(G), reps=reps, q=q,
                         block=block, blockLen=sum(block), start=s, p=p, nullmean=null.mean()))
    sig = [r for r in rows if r["p"] < 0.01 and r["reps"] >= 4]
    print(f"{len(sig)}/{len(rows)} khipus (>=6 groups) have a repeating group-size motif at p<0.01, >=4 repeats "
          f"(expected by chance {0.01*len(rows):.1f})")
    bl = collections.Counter(r["blockLen"] for r in sig)
    print("block cord-length counts:", sorted(bl.items()))
    rc = collections.Counter(int(r["reps"]) for r in sig)
    print("repeat counts:", sorted(rc.items()))
    print("q (groups per motif):", sorted(collections.Counter(r["q"] for r in sig).items()))
    for r in sorted(sig, key=lambda r: -r["reps"]):
        print(f"  {r['id']} {','.join(r['aliases'])[:18]:18s} {str(r['prov'])[:22]:22s} nG={r['nG']:3d} reps={r['reps']:.1f} "
              f"q={r['q']} block={r['block']} ({r['blockLen']} cords) from g{r['start']} p={r['p']:.4f} null={r['nullmean']:.1f}")


if __name__ == "__main__":
    main()

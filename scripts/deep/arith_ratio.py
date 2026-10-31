#!/usr/bin/env python3
"""Scaled copies and balance records between khipus (pendant sequences, ordinal order).

  scale   B[j+t] = k * A[i+t] for t < L, k != 1 any rational: windows hashed by their
          gcd-normalised shape (all terms non-zero, >= 3 distinct).
  diff    A[i+t] - B[j+t] = c != 0 constant: first-difference windows equal.
  bal     A[i+t] + B[j+t] = c constant: first differences of A = minus those of B.
Each also against B reversed.  Windows need all L terms non-zero, >= 3 distinct values and
max >= 15 on both sides; difference windows need >= 3 distinct non-zero steps.
Null: pendant values permuted within every khipu (NNULL runs), same scan.

    python3 scripts/deep/arith_ratio.py [L] [nnull]
"""
from __future__ import annotations

import collections
import json
import math
import sys
from functools import reduce

import numpy as np

from arith_common import SCRATCH, known_pairs, load, pvals

MINV = 1


def windows_scale(s, L):
    out = []
    for i in range(len(s) - L + 1):
        w = s[i:i + L]
        if min(w) < MINV or len(set(w)) < 3 or max(w) < 15:
            continue
        g = reduce(math.gcd, w)
        out.append((tuple(x // g for x in w), i, g))
    return out


def windows_diff(s, L, sign=1):
    out = []
    for i in range(len(s) - L + 1):
        w = s[i:i + L]
        if min(w) < MINV or max(w) < 15:
            continue
        d = tuple(sign * (w[t + 1] - w[t]) for t in range(L - 1))
        if len({x for x in d if x}) < 3:
            continue
        out.append((d, i, w[0]))
    return out


def scan(seqs, L, mode):
    idx = collections.defaultdict(list)
    for kid, s in seqs.items():
        for rev in (False, True):
            t = s[::-1] if rev else s
            if mode == "scale":
                ws = windows_scale(t, L)
            elif mode == "diff":
                ws = windows_diff(t, L)
            else:
                ws = windows_diff(t, L, -1 if rev else 1)  # handled below
            for key, i, extra in ws:
                idx[key].append((kid, rev, i, extra))
    if mode == "bal":
        # A forward with +diff vs B with -diff: rebuild index of negated diffs for query
        idx = collections.defaultdict(list)
        for kid, s in seqs.items():
            for rev in (False, True):
                t = s[::-1] if rev else s
                for key, i, extra in windows_diff(t, L, 1):
                    idx[("+",) + key].append((kid, rev, i, extra))
                for key, i, extra in windows_diff(t, L, -1):
                    idx[("-",) + key].append((kid, rev, i, extra))
    hits = collections.defaultdict(set)
    if mode == "bal":
        for key, occ in idx.items():
            if key[0] != "+":
                continue
            other = idx.get(("-",) + key[1:], [])
            for a, ra, i, xa in occ:
                if ra:
                    continue
                for b, rb, j, xb in other:
                    if a != b:
                        hits[tuple(sorted((a, b)))].add((a, i, b, "rev" if rb else "fwd", j, xa + xb))
        return hits
    for key, occ in idx.items():
        if len(occ) < 2 or len(occ) > 200:
            continue
        for x in range(len(occ)):
            a, ra, i, xa = occ[x]
            if ra:
                continue
            for y in range(len(occ)):
                b, rb, j, xb = occ[y]
                if b == a:
                    continue
                if mode == "scale":
                    if xa == xb:
                        continue  # exact copy: shared-passage scan has it
                    hits[tuple(sorted((a, b)))].add((a, i, b, "rev" if rb else "fwd", j, f"{xb}/{xa}"))
                else:
                    sa = seqs[a][i]
                    tb = seqs[b][::-1] if rb else seqs[b]
                    c = sa - tb[j]
                    if c == 0:
                        continue
                    hits[tuple(sorted((a, b)))].add((a, i, b, "rev" if rb else "fwd", j, c))
    return hits


def main():
    L = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    nnull = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    global MINV
    MINV = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    ks = load()
    cur, sc = known_pairs()
    seqs = {k: pvals(v) for k, v in ks.items()}
    res = {}
    for mode in ("scale", "diff", "bal"):
        obs = scan(seqs, L, mode)
        nulls = []
        for r in range(nnull):
            rng = np.random.default_rng(500 + r)
            sh = {k: [int(x) for x in rng.permutation(s)] for k, s in seqs.items()}
            nulls.append(len(scan(sh, L, mode)))
        mu, sd = float(np.mean(nulls)), float(np.std(nulls))
        print(f"== {mode} L={L} minv={MINV}: observed pairs {len(obs)}; null {nulls} mean {mu:.1f} sd {sd:.1f}")
        rows = []
        for (a, b), occ in sorted(obs.items(), key=lambda x: -len(x[1])):
            pr = frozenset((a, b))
            tag = "curated" if pr in cur else ("scan" if pr in sc else "NEW")
            ex = sorted(occ)[:4]
            rows.append(dict(a=a, b=b, n=len(occ), tag=tag, ex=[list(e) for e in ex]))
            print(f"  {tag:7} {a}-{b} windows {len(occ)}  e.g. {ex[:3]}")
            for e in ex[:2]:
                A, i, B, d, j, x = e
                sa = seqs[A][i:i + L]
                tb = (seqs[B][::-1] if d == "rev" else seqs[B])[j:j + L]
                jj = j if d == "fwd" else len(seqs[B]) - 1 - j
                print(f"        {A} p{i + 1}.. {sa}  vs  {B} {d} from p{jj + 1} {tb}")
        res[mode] = dict(observed=len(obs), null=nulls, rows=rows)
    json.dump(res, open(SCRATCH / f"ratio_L{L}_m{MINV}.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run test: a khipu's sequence of group-leading cords (or of any within-group position p<3)
equals, for W consecutive entries, another khipu's sequence of group totals (zero-total groups
dropped, so separator cords do not break the run).  All W values >= 100, >= 3 distinct.

Null: pendant values permuted within every khipu (both sequences re-drawn), NNULL runs.

    python3 scripts/deep/arith_leadtotal.py [W] [nnull]
"""
from __future__ import annotations

import collections
import sys

import numpy as np

from arith_common import known_pairs, load, pendants

MINV = int(sys.argv[3]) if len(sys.argv) > 3 else 100


def seqs(ks, rng=None):
    lead, tot = {}, {}
    for kid, k in ks.items():
        ps = pendants(k)
        v = np.array([int(c.get("value") or 0) for c in ps], dtype=np.int64)
        if rng is not None:
            v = rng.permutation(v)
        g = collections.defaultdict(list)
        for i, c in enumerate(ps):
            g[c["group"]].append(i)
        gl = [g[x] for x in sorted(g)]
        for p in range(3):
            lead[(kid, p)] = [(int(v[x[p]]), x[p]) for x in gl if len(x) > p and len(x) >= 2]
        tot[kid] = [(int(v[x].sum()), n) for n, x in enumerate(gl) if v[x].sum() > 0 and (v[x] != 0).sum() >= 2]
    return lead, tot


def scan(lead, tot, W):
    idx = collections.defaultdict(list)
    for kid, t in tot.items():
        vals = [x for x, _ in t]
        for i in range(len(vals) - W + 1):
            w = tuple(vals[i:i + W])
            if min(w) >= MINV and len(set(w)) >= 3:
                idx[w].append((kid, i))
    hits = collections.defaultdict(list)
    for (kid, p), s in lead.items():
        vals = [x for x, _ in s]
        for rev in (False, True):
            vv = vals[::-1] if rev else vals
            for i in range(len(vv) - W + 1):
                w = tuple(vv[i:i + W])
                for b, j in idx.get(w, ()):
                    if b != kid:
                        hits[(kid, b)].append((p, rev, i, j, w))
    return hits


def main():
    W = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    nnull = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    ks = load()
    cur, sc = known_pairs()
    lead, tot = seqs(ks)
    obs = scan(lead, tot, W)
    nulls = [len(scan(*seqs(ks, np.random.default_rng(300 + r)), W)) for r in range(nnull)]
    print(f"W={W}: observed pairs {len(obs)}; null {nulls} mean {np.mean(nulls):.2f}")
    for (a, b), h in obs.items():
        pr = frozenset((a, b))
        tag = "curated" if pr in cur else ("scan" if pr in sc else "NEW")
        p, rev, i, j, w = h[0]
        la = lead[(a, p)]
        la = la[::-1] if rev else la
        print(f"  {tag} {a} position-{p + 1} cords {['p%d' % (la[i + t][1] + 1) for t in range(W)]} = {b} group totals {[f'g{tot[b][j + t][1] + 1}' for t in range(W)]} {w} {'rev' if rev else ''}")


if __name__ == "__main__":
    main()

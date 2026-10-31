#!/usr/bin/env python3
"""UR006 (KH0242, Leymebamba) month test and its structural twin KH0068 (AS057, Ica museum).

KH0242: 24 'day' groups of 20-22 pendants, each followed by a singleton PK pendant carrying ~9-11
subsidiaries.  Month = n(day group) + n(subsidiaries on the first following singleton that has any).
Null: permute separator-subsidiary counts across the 24 blocks (breaks pairing, keeps marginals);
statistic = variance of month lengths (a compensating pairing gives LOW variance).

    python3 scripts/deep/period_ur006.py
"""
from __future__ import annotations
import collections, sys
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from period_common import load, level1, rng

R = rng()


def blocks(k, big=10):
    cs = level1(k)
    subs = collections.Counter()
    by_name = {c["name"]: c for c in k["cords"]}
    for c in k["cords"]:
        if c["level"] == 2:
            # parent pendant name = prefix up to 's'
            subs[c["name"].rsplit("s", 1)[0]] += 1
    byg = collections.defaultdict(list)
    for c in cs:
        byg[c["group"]].append(c)
    gids = sorted(byg)
    out = []
    for i, g in enumerate(gids):
        if len(byg[g]) >= big:
            sep = 0; sepname = None
            for h in gids[i + 1:i + 4]:
                if len(byg[h]) >= big:
                    break
                if len(byg[h]) == 1 and subs[byg[h][0]["name"]] > 0:
                    sep = subs[byg[h][0]["name"]]; sepname = byg[h][0]["name"]; break
            daysubs = sum(subs[c["name"]] for c in byg[g])
            out.append(dict(g=g, n=len(byg[g]), sep=sep, sepname=sepname, daysubs=daysubs,
                            val=sum(c.get("value") or 0 for c in byg[g])))
    return out


def main():
    km = {k["id"]: k for k in load()}
    for kid in ("KH0242", "KH0068"):
        k = km[kid]
        B = blocks(k)
        n = np.array([b["n"] for b in B]); s = np.array([b["sep"] for b in B])
        m = n + s
        print(f"== {kid}: {len(B)} blocks; day-group sizes {n.tolist()}")
        print(f"   separator subs {s.tolist()}")
        print(f"   month = n+sep {m.tolist()}  total={m.sum()}  mean={m.mean():.2f}")
        if s.sum():
            obs = m.var()
            null = np.array([(n + R.permutation(s)).var() for _ in range(20000)])
            print(f"   var(month) obs={obs:.3f}  null mean={null.mean():.3f} sd={null.std():.3f}  p(<=obs)={(null <= obs).mean():.4f}")
            print(f"   corr(n, sep) = {np.corrcoef(n, s)[0,1]:.2f}")
            first12, last12 = m[:12].sum(), m[12:].sum()
            print(f"   first 12 months={first12}, last 12={last12}; all cords={len(k['cords'])} "
                  f"pendants+subs in blocks={int((n + s).sum() + sum(b['daysubs'] for b in B))}")
        print("   per block (group, n, sep cord, sep subs, day-subs, value sum):")
        for b in B:
            print(f"     g{b['g']:02d} {b['n']:2d} {b['sepname']} {b['sep']:2d} {b['daysubs']:2d} {b['val']}")


if __name__ == "__main__":
    main()

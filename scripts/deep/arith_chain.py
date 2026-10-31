#!/usr/bin/env python3
"""Summary chains: B's group totals appear, in order, among A's cord values.

For every khipu B: G = totals of its groups with >= 2 non-zero pendants and total >= GMIN.
For every other khipu A: which G_g equal some pendant/top cord value of A exactly, or within
one decimal-digit slip (one digit of the numeral differs; a misread knot cluster).  Score =
the longest chain of matched groups whose A positions increase with g (order kept; a reversed
chain is scored too).  A match is only counted when G_g is not also a plain cord value of B.

Null: pendant values permuted within every khipu (group sizes kept, so G is re-drawn from B's
own values), NNULL runs; the statistic is the corpus-wide distribution of best chain per pair.

    python3 scripts/deep/arith_chain.py [nnull]
"""
from __future__ import annotations

import bisect
import collections
import json
import sys

import numpy as np

from arith_common import SCRATCH, known_pairs, load, pendants

GMIN = 100


def variants(v: int) -> set[int]:
    s = str(v)
    out = set()
    for i, ch in enumerate(s):
        for d in "0123456789":
            if d != ch and not (i == 0 and d == "0"):
                out.add(int(s[:i] + d + s[i + 1:]))
    return out


def lis(pos: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Longest chain (g increasing, A position strictly increasing); pos = (g, apos), several per g."""
    # patience sorting on apos with g ascending; for equal g take positions descending
    pos = sorted(pos, key=lambda x: (x[0], -x[1]))
    tails, tails_i, prev = [], [], [-1] * len(pos)
    for i, (g, a) in enumerate(pos):
        k = bisect.bisect_left(tails, a)
        if k == len(tails):
            tails.append(a)
            tails_i.append(i)
        else:
            tails[k] = a
            tails_i[k] = i
        prev[i] = tails_i[k - 1] if k else -1
    out, i = [], tails_i[-1] if tails_i else -1
    while i >= 0:
        out.append(pos[i])
        i = prev[i]
    return out[::-1]


def prepare(ks, rng=None):
    seqs, groups, cv = {}, {}, {}
    for kid, k in ks.items():
        ps = pendants(k)
        v = np.array([int(c.get("value") or 0) for c in ps], dtype=np.int64)
        if rng is not None:
            v = rng.permutation(v)
        seqs[kid] = v
        g = collections.defaultdict(list)
        for i, c in enumerate(ps):
            g[c["group"]].append(i)
        gl = []
        for gi in sorted(g):
            idx = g[gi]
            tot = int(v[idx].sum())
            if tot >= GMIN and int((v[idx] != 0).sum()) >= 2:
                gl.append((gi, tot))
        groups[kid] = gl
        cv[kid] = {int(x) for x in v} | {int(c.get("value") or 0) for c in k["cords"]}
    return seqs, groups, cv


def run(ks, rng=None):
    seqs, groups, cv = prepare(ks, rng)
    where = collections.defaultdict(list)  # value -> (A, pos)
    for kid, v in seqs.items():
        for i, x in enumerate(v):
            if x >= GMIN:
                where[int(x)].append((kid, i))
    res = {}
    for b, gl in groups.items():
        hits = collections.defaultdict(list)  # A -> (g, apos, exact)
        for gi, tot in gl:
            if tot in cv[b]:
                continue
            for a, i in where.get(tot, ()):
                if a != b:
                    hits[a].append((gi, i, 1))
            for w in variants(tot):
                for a, i in where.get(w, ()):
                    if a != b:
                        hits[a].append((gi, i, 0))
        for a, h in hits.items():
            fw = lis([(g, i) for g, i, _ in h])
            rv = lis([(g, -i) for g, i, _ in h])
            best, d = (fw, "fwd") if len(fw) >= len(rv) else (rv, "rev")
            ex = {(g, i) for g, i, e in h if e}
            chain = [(g, abs(i), (g, abs(i)) in ex) for g, i in best]
            nex = sum(1 for c in chain if c[2])
            res[(a, b)] = (len(chain), nex, d, chain)
    return res, seqs, groups


def main():
    nnull = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    ks = load()
    cur, sc = known_pairs()
    obs, seqs, groups = run(ks)
    # statistic: chain length L with >= E exact; tabulate pairs by (length, exact)
    def table(r):
        c = collections.Counter()
        for (a, b), (L, E, d, ch) in r.items():
            for l in range(3, L + 1):
                c[("len", l)] += 1
            for e in range(2, E + 1):
                c[("exact", e)] += 1
        return c
    to = table(obs)
    tn = [table(run(ks, np.random.default_rng(700 + r))[0]) for r in range(nnull)]
    keys = sorted(set(to) | set().union(*tn))
    stats = {}
    print("pairs with chain >= L (any match) / exact matches in chain >= E: observed vs null mean (max)")
    for k in keys:
        nv = [t.get(k, 0) for t in tn]
        stats[f"{k[0]}{k[1]}"] = dict(obs=to.get(k, 0), null=nv)
        if k[1] <= 12:
            print(f"  {k}: obs {to.get(k, 0)}  null mean {np.mean(nv):.1f} sd {np.std(nv):.1f} max {max(nv)}")
    # thresholds where null max is 0
    rows = []
    for (a, b), (L, E, d, ch) in obs.items():
        nullL = [t.get(("len", L), 0) for t in tn]
        nullE = [t.get(("exact", E), 0) for t in tn] if E >= 2 else [999]
        if np.mean(nullL) < 0.5 or np.mean(nullE) < 0.5:
            pr = frozenset((a, b))
            tag = "curated" if pr in cur else ("scan" if pr in sc else "NEW")
            gt = dict(groups[b])
            rows.append(dict(a=a, b=b, L=L, exact=E, dir=d, tag=tag, nullL=float(np.mean(nullL)), nullE=float(np.mean(nullE)),
                             chain=[dict(g=g + 1, total=gt[g], apos=i + 1, aval=int(seqs[a][i]), exact=e) for g, i, e in ch]))
    rows.sort(key=lambda r: (-r["exact"], -r["L"]))
    print("\npairs beyond the null (chain length or exact count whose null pair-count mean < 0.5):")
    for r in rows:
        print(f"  {r['tag']:7} A={r['a']} carries group totals of B={r['b']}: chain {r['L']} ({r['exact']} exact) {r['dir']}  nullL {r['nullL']:.2f} nullE {r['nullE']:.2f}")
        print("        " + "; ".join(f"g{c['g']}={c['total']}->p{c['apos']}={c['aval']}{'' if c['exact'] else '*'}" for c in r["chain"][:16]))
    json.dump(dict(stats=stats, rows=rows), open(SCRATCH / "chain.json", "w"), indent=1)


if __name__ == "__main__":
    main()

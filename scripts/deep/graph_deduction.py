#!/usr/bin/env python3
"""Deduction-constant signature: in a group, one cord = another cord + a constant d
(gross = net + d), with the same d recurring in >= 3 groups of the khipu.  The known Inkawasi
pairs share d (KH0504/KH0492 d=10, KH0503/KH0491 d=15, KH0514/KH0502 d=47).  Links khipus
that share a d.  Null: level-1 values permuted within khipu across group slots (200 reps) for
the per-khipu count of d-groups."""
import collections, numpy as np
from graph_common import *
ks = load(); rng = np.random.default_rng(0)
def groups(k):
    g = collections.defaultdict(list)
    for c in level1(k): g[c.get("group")].append(c.get("value") or 0)
    return [g[x] for x in sorted(g, key=lambda x: (x is None, x))]
def dsig(gs):
    """d -> number of groups holding values x, y, d with x = y + d, x >= 50, 5 <= d < y"""
    cnt = collections.Counter()
    for g in gs:
        vs = [v for v in g if v]
        s = set(vs); ds = set()
        for x in vs:
            for y in vs:
                d = x - y
                if x >= 50 and 5 <= d < y and d in s and (d != y):
                    ds.add(d)
        for d in ds: cnt[d] += 1
    return cnt
sig = {}
for k in ks:
    if k["id"] in NOVALUE: continue
    gs = groups(k); c = dsig(gs)
    top = [(d, n) for d, n in c.items() if n >= 3]
    if not top: continue
    flat = [v for g in gs for v in g]; lens = [len(g) for g in gs]
    best = max(n for d, n in top)
    nn = []
    for r in range(200):
        p = list(rng.permutation(flat)); out = []; i = 0
        for L in lens: out.append(p[i:i + L]); i += L
        cc = dsig(out); nn.append(max(cc.values()) if cc else 0)
    pv = (np.sum(np.array(nn) >= best) + 1) / 201
    if pv <= 0.01:
        sig[k["id"]] = dict(ds=sorted(top, key=lambda x: -x[1]), p=pv, null=(np.mean(nn), np.std(nn)), prov=prov(k), n=len(gs))
for kid, s in sorted(sig.items()):
    print(kid, s["prov"], "groups", s["n"], "d-signature", s["ds"][:5], f"best-count null {s['null'][0]:.2f}±{s['null'][1]:.2f} p={s['p']:.3f}")
byd = collections.defaultdict(list)
for kid, s in sig.items():
    for d, n in s["ds"]:
        byd[d].append((kid, n))
cur = curated_pairs()
print("\nshared deduction constants (khipus with a significant signature):")
for d, lst in sorted(byd.items()):
    if len(lst) >= 2:
        ids = sorted(x for x, _ in lst)
        pairs = [(a, b) for i, a in enumerate(ids) for b in ids[i + 1:]]
        print(f"  d={d}: {lst}  curated among them: {[p for p in pairs if p in cur]}")

#!/usr/bin/env python3
"""(f) Detail for candidate pairs from vocab_e: where the shared rare values sit (cord name, level, group,
colour) and whether their order is preserved (Kendall tau of first positions; null = 5000 random
orderings of the shared values in B).
    python3 vocab_f_pair_detail.py KH0456 KH0562 [KH.. KH..]"""
import sys, collections
import numpy as np
from scipy.stats import kendalltau
import vocab_common as vc
ks = {k["id"]: k for k in vc.load()}
df = collections.Counter()
for k in ks.values():
    if k["id"] in vc.EXCLUDE: continue
    for v in {int(c["value"]) for c in k["cords"] if (c.get("value") or 0) >= 10}: df[v] += 1
rng = np.random.default_rng(1)
def locs(k):
    d = collections.defaultdict(list)
    for i, c in enumerate(k["cords"]):
        if (c.get("value") or 0) >= 10: d[int(c["value"])].append((i, c["name"], c["level"], c.get("group"), c["color"]))
    return d
args = sys.argv[1:]
for a, b in zip(args[::2], args[1::2]):
    A, B = locs(ks[a]), locs(ks[b]); sh = sorted(set(A) & set(B), key=lambda v: A[v][0][0])
    print(f"=== {a} ({ks[a]['_region']}, {ks[a]['museum']['number']}) vs {b} ({ks[b]['_region']}, {ks[b]['museum']['number']}) shared={len(sh)}")
    for v in sh:
        if df[v] <= 12:
            print(f"  {v:6d} df={df[v]:2d}  A:{[(n, l, g, c) for _, n, l, g, c in A[v]][:3]}  B:{[(n, l, g, c) for _, n, l, g, c in B[v]][:3]}")
    rare = [v for v in sh if df[v] <= 12]
    if len(rare) >= 4:
        pa = [A[v][0][0] for v in rare]; pb = [B[v][0][0] for v in rare]
        t = kendalltau(pa, pb).statistic; nn = [kendalltau(pa, rng.permutation(pb)).statistic for _ in range(5000)]
        print(f"  order: tau={t:.2f} (null sd {np.std(nn):.2f}, p_two={np.mean(np.abs(nn) >= abs(t)):.4f})")

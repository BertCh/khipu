#!/usr/bin/env python3
"""Whole-khipu near-duplicates: two khipus whose nonzero level-1 sequences have the same
length n (5..60) and agree position-by-position within +-20% on >= 80% of positions
(forward or reversed).  Null: every khipu rescaled by its own random factor, log-uniform in
[1/3,1/1.3]u[1.3,3] (keeps order, shape, zeros; destroys absolute agreement), 50 reps."""
import collections, numpy as np
from graph_common import *
ks = load(); rng = np.random.default_rng(5)
seq = {k["id"]: np.array([v for v in l1values(k) if v], float) for k in ks if k["id"] not in NOVALUE}
seq = {k: v for k, v in seq.items() if 5 <= len(v) <= 60 and np.log(v.max() / v.min()) >= np.log(3)}
byn = collections.defaultdict(list)
for k, v in seq.items(): byn[len(v)].append(k)
TOL = np.log(1.2)
import sys
MODE = sys.argv[1] if len(sys.argv) > 1 else "equal"
def run(S):
    return run_equal(S) if MODE == "equal" else run_slide(S)
keys = sorted(seq)
def run_slide(S):
    """lengths within 15%; any offset; >=80% agreement over the overlap, overlap >= 90% of the shorter"""
    hits = []
    L = {k: np.log(S[k]) for k in keys}
    for i in range(len(keys)):
        a = L[keys[i]]
        for j in range(i + 1, len(keys)):
            b0 = L[keys[j]]
            if abs(len(a) - len(b0)) > 0.15 * max(len(a), len(b0)): continue
            best = None
            for d, b in (("fwd", b0), ("rev", b0[::-1])):
                m = min(len(a), len(b))
                for off in range(-(len(b) - 1), len(a)):
                    lo, hi = max(0, off), min(len(a), off + len(b))
                    ov = hi - lo
                    if ov < 0.9 * m: continue
                    f = (np.abs(a[lo:hi] - b[lo - off:hi - off]) <= TOL).mean()
                    if f >= 0.8 and (best is None or f > best[4]):
                        best = (keys[i], keys[j], d, off, round(f, 2))
            if best: hits.append(best)
    return hits
def run_equal(S):
    hits = []
    for n, g in byn.items():
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                a, b = np.log(S[g[i]]), np.log(S[g[j]])
                for d, bb in (("fwd", b), ("rev", b[::-1])):
                    f = (np.abs(a - bb) <= TOL).mean()
                    if f >= 0.8:
                        hits.append((g[i], g[j], d, n, round(f, 2)))
    return hits
obs = run(seq)
cur = curated_pairs(); sc = scan_pairs()
print("candidate khipus", len(seq), "; obs hits", len(obs))
for h in obs:
    p = tuple(sorted(h[:2])); print("  ", h, "CUR" if p in cur else ("SCAN" if p in sc else "NEW"))
null = []
for r in range(50 if MODE == 'equal' else 10):
    S = {k: v * np.exp(rng.uniform(np.log(1.3), np.log(3)) * rng.choice([-1, 1])) for k, v in seq.items()}
    null.append(len(run(S)))
print(f"null (random rescale) hits: mean {np.mean(null):.2f} sd {np.std(null):.2f} max {max(null)}; P(null>=obs) = {(np.sum(np.array(null)>=len(obs))+1)/(len(null)+1):.3f}")

#!/usr/bin/env python3
"""Near-run layer: two khipus share a window of W consecutive level-1 values that agree
position-by-position within +-TOL (log ratio), all values >= VMIN, forward or reversed,
and the window is NOT an exact match (exact runs are layer 2).

Null: level-1 order permuted within every khipu (keeps each khipu's value multiset and hence
magnitude profile; destroys order), 5 shuffles; pair counts compared.
Writes OUT/nearruns.json (pairs with >=1 near window, plus null summary)."""
import json, collections, sys
import numpy as np
from graph_common import *

W, TOL, VMIN = 5, np.log(1.15), 20
RANGE = np.log(float(sys.argv[1])) if len(sys.argv) > 1 else np.log(2.0)  # window max/min >= this: informative shape
ks = load(); ids = [k["id"] for k in ks]
rng = np.random.default_rng(11)
seqs = {k["id"]: l1values(k) for k in ks if k["id"] not in NOVALUE}

def windows(seqs):
    rows, own, start = [], [], []
    for kid, s in seqs.items():
        a = np.array(s, dtype=float)
        for i in range(len(a) - W + 1):
            w = a[i:i + W]
            if (w >= VMIN).all() and len(set(w)) >= 3 and np.log(w.max() / w.min()) >= RANGE:
                rows.append(np.log(w)); own.append(kid); start.append(i)
    return np.array(rows, dtype=np.float32), np.array(own), np.array(start)

def scan(seqs):
    X, own, start = windows(seqs)
    Xr = X[:, ::-1]
    hits = collections.defaultdict(set)
    B = 2000
    kid_code = {k: i for i, k in enumerate(sorted(set(own)))}; oc = np.array([kid_code[o] for o in own])
    for d, Y in (("fwd", X), ("rev", Xr)):
        for s in range(0, len(X), B):
            blk = Y[s:s + B]
            # max abs diff over positions
            D = np.abs(blk[:, None, :] - X[None, :, :]).max(2)
            ex = (np.abs(blk[:, None, :] - X[None, :, :]) < 1e-9).all(2)
            ii, jj = np.where((D <= TOL) & ~ex)
            ii += s
            m = oc[ii] != oc[jj]
            if d == "fwd":
                m &= oc[ii] < oc[jj]
            for a, b in zip(ii[m], jj[m]):
                p = tuple(sorted((own[a], own[b])))
                hits[(p, d)].add((int(start[a]), int(start[b])) if own[a] == p[0] else (int(start[b]), int(start[a])))
    # collapse overlapping windows into distinct diagonal runs
    out = {}
    for (p, d), ss in hits.items():
        diag = collections.defaultdict(list)
        for a, b in ss:
            diag[(a - b) if d == "fwd" else (a + b)].append(a)
        runs = 0; longest = 0
        for key, starts in diag.items():
            starts = sorted(starts); r = 1
            for x, y in zip(starts, starts[1:]):
                if y == x + 1: r += 1
                else:
                    runs += 1; longest = max(longest, r + W - 1); r = 1
            runs += 1; longest = max(longest, r + W - 1)
        key = p
        if key not in out or longest > out[key]["longest"]:
            out[key] = dict(dir=d, runs=runs, longest=longest, windows=len(ss), spans=sorted(ss)[:10])
    return out

obs = scan(seqs)
print(f"W={W} tol=±15% vmin={VMIN} window range>={np.exp(RANGE):.1f}x: pairs with a near-run {len(obs)}")
NULL = sys.argv[2] if len(sys.argv) > 2 else "scale"
print("null:", NULL)
nulls = []
for s in range(5):
    if NULL == "order":
        sh = {k: list(rng.permutation(v)) for k, v in seqs.items()}
    else:  # every khipu rescaled by its own random factor, log-uniform in [1/3,1/1.3]u[1.3,3]; order and shape kept
        sh = {}
        for k, v in seqs.items():
            f = np.exp(rng.uniform(np.log(1.3), np.log(3)) * rng.choice([-1, 1]))
            sh[k] = [x * f if x else 0 for x in v]
    nulls.append(scan(sh))
    print(f"  null shuffle {s}: pairs {len(nulls[-1])}; longest dist {collections.Counter(min(x['longest'],9) for x in nulls[-1].values())}")
print("  obs longest dist", collections.Counter(min(x['longest'], 9) for x in obs.values()))
for L_ in (5, 6, 7, 8):
    o = sum(1 for x in obs.values() if x["longest"] >= L_)
    n = [sum(1 for x in nn.values() if x["longest"] >= L_) for nn in nulls]
    print(f"  longest>={L_}: obs {o}  null {np.mean(n):.1f}±{np.std(n):.1f}")
for R in (1, 2, 3, 5):
    o = sum(1 for x in obs.values() if x["runs"] >= R)
    n = [sum(1 for x in nn.values() if x["runs"] >= R) for nn in nulls]
    print(f"  distinct runs>={R}: obs {o}  null {np.mean(n):.1f}±{np.std(n):.1f}")
json.dump(dict(W=W, tol=0.15, vmin=VMIN, pairs=[dict(a=p[0], b=p[1], **v) for p, v in sorted(obs.items(), key=lambda x: (-x[1]["longest"], -x[1]["runs"]))],
               null=[dict(pairs=len(nn), ge6=sum(1 for x in nn.values() if x["longest"] >= 6), runs2=sum(1 for x in nn.values() if x["runs"] >= 2)) for nn in nulls]),
          open(OUT / f"nearruns_{NULL}.json", "w"), indent=0)
cur = curated_pairs(); sc = scan_pairs()
hit = [p for p in cur if p in obs]
print(f"  positive-control recall (curated pairs with a near-run): {len(hit)}/{len(cur)}; exact-scan pairs with near-run {sum(1 for p in sc if p in obs)}/{len(sc)}")
print("  top pairs:")
for p, v in sorted(obs.items(), key=lambda x: (-x[1]["longest"], -x[1]["runs"]))[:50]:
    tag = "CUR" if p in cur else ("SCAN" if p in sc else "")
    print("   ", p, v["dir"], "longest", v["longest"], "runs", v["runs"], tag, v["spans"][:3])

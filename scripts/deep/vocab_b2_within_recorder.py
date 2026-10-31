#!/usr/bin/env python3
"""(b2) Which single features separate regions WITHIN one recorder (recording conventions held fixed)?
eta^2 of each feature across regions among one recorder's khipus; null = region labels permuted
among that recorder's khipus (1000 reps).  Reuses the feature builder of vocab_b_dialects."""
import collections, sys, io, contextlib
import numpy as np
src = open(__file__.replace("vocab_b2_within_recorder.py", "vocab_b_dialects.py")).read().split("feats = [features")[0]
exec(src)
feats = [features(k) for k in ks]; names = list(feats[0]); X = np.array([[f[n] for n in names] for f in feats], float)
regions = [k["_region"] for k in ks]; contrib = [k["contributors"] for k in ks]
rng = np.random.default_rng(5)
for who in ("Marcia & Robert Ascher", "Gary Urton"):
    ii = [i for i in range(len(ks)) if contrib[i] == who and regions[i]]
    rc = collections.Counter(regions[i] for i in ii); keep = [r for r, n in rc.items() if n >= 10]
    ii = np.array([i for i in ii if regions[i] in keep]); y = np.array([keep.index(regions[i]) for i in ii]); C = len(keep)
    print(f"== {who} {dict((r, rc[r]) for r in keep)}")
    out = []
    for j, n in enumerate(names):
        if n.startswith("r_"): continue
        col = X[ii, j]; m = ~np.isnan(col)
        if m.sum() < 40 or np.nanstd(col) == 0: continue
        x = col[m]
        def e2(l):
            gm = x.mean(); return sum(((x[l == c].mean() - gm) ** 2) * (l == c).sum() for c in range(C) if (l == c).any()) / ((x - gm) ** 2).sum()
        o = e2(y[m]); nn = np.array([e2(rng.permutation(y[m])) for _ in range(1000)])
        out.append((o, n, nn.mean(), nn.std(), (1 + (nn >= o).sum()) / 1001, {keep[c]: round(float(np.mean(x[y[m] == c])), 3) for c in range(C) if (y[m] == c).any()}))
    out.sort(reverse=True)
    for o, n, nm, ns, p, mm in out[:12]:
        print(f"  {n:11s} eta2={o:.3f} null={nm:.3f}+-{ns:.3f} p={p:.4f} {mm}")

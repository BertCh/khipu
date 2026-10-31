#!/usr/bin/env python3
"""(g) Third-record screen: for each known linked pair (A,B), which OTHER khipu contains the most of the
values A and B share (the 'core', values >=10, any level)?  Significance: for candidate C, expected
count of core values in C under independence is lambda = sum_v P(v in C), P(v in C) = 1-(1-q_v)^{n_C,bin(v)}
with q_v = df_v / tokens in v's magnitude bin and n_C,bin = C's distinct values in that bin (magnitude-aware);
Poisson-binomial tail by exact convolution; Bonferroni x (#khipus x #pairs).
Positive control: KH0473 as third record of KH0121/KH0133."""
import collections, numpy as np
import vocab_common as vc
ks = {k["id"]: k for k in vc.load() if k["id"] not in vc.EXCLUDE}
sets = {i: {int(c["value"]) for c in k["cords"] if (c.get("value") or 0) >= 10} for i, k in ks.items()}
df = collections.Counter(v for s in sets.values() for v in s)
binof = lambda v: int(np.floor(np.log10(v) / 0.1))
Tb = collections.Counter(); [Tb.__setitem__(binof(v), Tb[binof(v)] + n) for v, n in df.items()]
nb = {i: collections.Counter(binof(v) for v in s) for i, s in sets.items()}
def tail(ps, k):
    d = np.zeros(len(ps) + 1); d[0] = 1
    for p in ps: d[1:] = d[1:] * (1 - p) + d[:-1] * p; d[0] *= (1 - p)
    return d[k:].sum()
pairs = sorted(vc.KNOWN)
M = len(sets) * len(pairs)
for a, b in pairs:
    if a not in sets or b not in sets: continue
    core = sets[a] & sets[b]
    core = {v for v in core if df[v] <= 40}
    if len(core) < 3: continue
    best = []
    for c, s in sets.items():
        if c in (a, b): continue
        hit = core & s
        if len(hit) < 2: continue
        ps = [1 - (1 - (df[v] - 2) / Tb[binof(v)]) ** nb[c][binof(v)] for v in core]
        p = tail(np.clip(ps, 0, 1), len(hit))
        best.append((p, c, sorted(hit), sum(ps)))
    best.sort()
    for p, c, hit, lam in best[:2]:
        flag = "***" if p * M < 0.05 else ""
        print(f"{a}-{b} core={len(core):3d}  C={c} hits={len(hit)} lambda={lam:.2f} p={p:.2e} bonf={min(1, p*M):.2e} {flag} {hit[:12]}")

#!/usr/bin/env python3
"""(c) Decimal-administration test: do group totals / khipu totals land on round decimal numbers?

Group total = sum of level-1 values in a group (groups with >=2 pendants and total>0).
Statistics:  E = # totals exactly in D = {10,50,100,500,1000,5000,10000};
             M10/M100 = # totals divisible by 10 / by 100 (among totals >=10 / >=100);
             NEAR = # totals within 2% of a member of D (>=50).
Null A (permute): level-1 values shuffled among pendants within each khipu (group sizes fixed), 1000 reps.
Null B (khipu totals): each pendant value resampled with replacement from its own khipu, 1000 reps.
Exclusions: Wari family, unreadable.
"""
from __future__ import annotations
import collections, json
import numpy as np
import vocab_common as vc

rng = np.random.default_rng(7)
D = np.array([10, 50, 100, 500, 1000, 5000, 10000])
DSET = set(D.tolist())
ks = [k for k in vc.load() if k["id"] not in vc.EXCLUDE]
data = []  # (kid, values array, group labels)
for k in ks:
    ps = vc.pendants(k)
    if len(ps) < 4: continue
    v = np.array([int(c.get("value") or 0) for c in ps]); g = np.array([c.get("group", -1) for c in ps])
    if v.sum() == 0: continue
    data.append((k["id"], v, g))

def gstats(v, g):
    out = []
    for gid in np.unique(g):
        m = g == gid
        if m.sum() >= 2:
            t = int(v[m].sum())
            if t > 0: out.append(t)
    return out

def summarize(tots):
    t = np.array(tots)
    E = sum(x in DSET for x in tots)
    M10 = int(((t % 10 == 0) & (t >= 10)).sum()); M100 = int(((t % 100 == 0) & (t >= 100)).sum())
    big = t[t >= 50]
    rel = np.min(np.abs(big[:, None] - D[None, :]) / D[None, :], axis=1) if len(big) else np.array([])
    NEAR = int((rel <= 0.02).sum())
    return np.array([E, M10, M100, NEAR])

obs_tots = []; per = []
for kid, v, g in data:
    t = gstats(v, g); obs_tots += t; per.append((kid, t))
obs = summarize(obs_tots)
null = []
for r in range(1000):
    tt = []
    for kid, v, g in data:
        tt += gstats(rng.permutation(v), g)
    null.append(summarize(tt))
null = np.array(null)
names = ["exact_in_D", "div10", "div100", "within2pct_D"]
res = {}
print(f"group totals n={len(obs_tots)} from {len(data)} khipus")
for i, n in enumerate(names):
    p = (1 + (null[:, i] >= obs[i]).sum()) / 1001
    print(f"  {n:14s} obs={obs[i]:5d} null={null[:, i].mean():7.1f}+-{null[:, i].std():5.1f}  p={p:.4f}")
    res["group_" + n] = dict(obs=int(obs[i]), mean=float(null[:, i].mean()), sd=float(null[:, i].std()), p=p)
c = collections.Counter(x for x in obs_tots if x in DSET)
print("  exact hits:", dict(c))
hits = [(kid, x) for kid, t in per for x in t if x in DSET and x >= 100]
print("  khipus with group total in {100,500,1000,5000,10000}:", hits)

# Khipu totals
kt = np.array([v.sum() for _, v, _ in data])
def ksum(tots):
    return np.array([np.isin(tots, D).sum(), ((tots % 10 == 0) & (tots >= 10)).sum(), ((tots % 100 == 0) & (tots >= 100)).sum()])
o2 = ksum(kt); n2 = []
for r in range(1000):
    n2.append(ksum(np.array([rng.choice(v, len(v)).sum() for _, v, _ in data])))
n2 = np.array(n2)
print(f"khipu totals n={len(kt)}")
for i, n in enumerate(["exact_in_D", "div10", "div100"]):
    p = (1 + (n2[:, i] >= o2[i]).sum()) / 1001
    print(f"  {n:14s} obs={o2[i]:5d} null={n2[:, i].mean():7.1f}+-{n2[:, i].std():5.1f}  p={p:.4f}")
    res["khipu_" + n] = dict(obs=int(o2[i]), mean=float(n2[:, i].mean()), sd=float(n2[:, i].std()), p=p)
print("  khipus with total in D:", [(kid, int(v.sum())) for kid, v, _ in data if v.sum() in DSET])
json.dump(res, open(vc.OUT / "c_decimal.json", "w"), indent=1)

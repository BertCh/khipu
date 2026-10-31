#!/usr/bin/env python3
"""(h) Incahuasi large-value sharing: distinct values >= 1000 shared by two Incahuasi khipus.
Null: within the Incahuasi pool only (controls for the site's large-number profile), each khipu keeps
its number of distinct >=1000 values but the tokens are permuted across the pool, 5000 reps.
Reported per pair: observed shared count, null mean, empirical p; Bonferroni over pool pairs."""
import collections, itertools, numpy as np
import vocab_common as vc
rng = np.random.default_rng(8)
ks = [k for k in vc.load() if k["_region"] == "Incahuasi"]
S = {k["id"]: sorted({int(c["value"]) for c in k["cords"] if (c.get("value") or 0) >= 1000}) for k in ks}
S = {i: s for i, s in S.items() if s}
ids = sorted(S); tok = np.array([v for i in ids for v in S[i]]); sz = [len(S[i]) for i in ids]
obs = {(a, b): len(set(S[a]) & set(S[b])) for a, b in itertools.combinations(ids, 2)}
ge = collections.Counter(); tot = collections.Counter()
R = 5000
for r in range(R):
    t = rng.permutation(tok); o = 0; sets = []
    for n in sz: sets.append(set(t[o:o + n].tolist())); o += n
    for (x, a), (y, b) in itertools.combinations(list(enumerate(ids)), 2):
        pass
    d = dict(zip(ids, sets))
    for p, ob in obs.items():
        if ob >= 2:
            m = len(d[p[0]] & d[p[1]]); tot[p] += m; ge[p] += m >= ob
npairs = len(obs)
print(f"Incahuasi khipus with values>=1000: {len(ids)}; pairs {npairs}")
for p, ob in sorted(obs.items(), key=lambda x: (ge[x[0]], -x[1])):
    if ob < 2: continue
    pv = (1 + ge[p]) / (R + 1)
    if pv < 0.01 or "KH0506" in p:
        print(f"  {p[0]}-{p[1]} shared={ob} null_mean={tot[p]/R:.2f} p={pv:.4f} bonf={min(1, pv*npairs):.3f} known={tuple(sorted(p)) in vc.KNOWN} values={sorted(set(S[p[0]]) & set(S[p[1]]))[:12]}")

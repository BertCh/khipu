#!/usr/bin/env python3
"""(i) Region-specific value vocabulary: values (>=10, df>=5 khipus) concentrated in one region.
Statistic per (value, region): hypergeometric upper tail of #khipus in region containing value.
Null: region labels permuted across labelled khipus (1000 reps) -> distribution of the minimum p
over all (value, region) cells (family-wise, max-stat).  Known linked pairs are collapsed to
one khipu (the second member dropped) so copies do not create 'vocabulary'."""
import collections, numpy as np
from scipy.stats import hypergeom
import vocab_common as vc
rng = np.random.default_rng(4)
drop = {b for a, b in vc.known_all()}
ks = [k for k in vc.load() if k["id"] not in vc.EXCLUDE and k["_region"] and k["id"] not in drop]
reg = np.array([k["_region"] for k in ks]); R = sorted(set(reg))
sets = [{int(c["value"]) for c in k["cords"] if (c.get("value") or 0) >= 10} for k in ks]
df = collections.Counter(v for s in sets for v in s)
V = sorted(v for v, n in df.items() if n >= 5)
A = np.array([[v in s for v in V] for s in sets], bool)
N = len(ks); dfv = A.sum(0)
def cells(lab):
    out = []
    for r in R:
        m = lab == r; n = m.sum(); k = A[m].sum(0)
        out.append(hypergeom.sf(k - 1, N, n, dfv))
    return np.array(out)
P = cells(reg)
nullmin = np.array([cells(rng.permutation(reg)).min() for _ in range(1000)])
print(f"khipus={N} values tested={len(V)} regions={len(R)}; null min-p 5th pct={np.percentile(nullmin,5):.2e}")
idx = np.dstack(np.unravel_index(np.argsort(P, axis=None), P.shape))[0][:20]
for ri, vi in idx:
    p = P[ri, vi]; fw = (1 + (nullmin <= p).sum()) / 1001
    m = reg == R[ri]
    print(f"  value {V[vi]:6d} region {R[ri]:12s} {A[m, vi].sum()}/{m.sum()} khipus vs {dfv[vi]} corpus-wide  p={p:.1e} FWER={fw:.3f}  ids={[ks[i]['id'] for i in np.where(A[:, vi] & m)[0]][:8]}")

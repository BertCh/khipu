"""(b2) Magnitude coupling between a pendant and its subsidiaries, plus a
detailed look at KH0349 (pendant = sum of its subsidiaries).

Statistic: pooled within-khipu Spearman rank correlation between parent value
P and child sum S (both > 0) over level-1 parents; null = permute child-lists
among level-1 parents within each khipu (2000 perms)."""
import sys, collections
import numpy as np
from scipy.stats import rankdata
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val

rng = np.random.default_rng(7)
NP = 2000
ks = load()
blocks = []
for k in ks:
    l1, ch = build_tree(k)
    P, S = [], []
    for c in l1:
        kids = ch.get(c["name"])
        if not kids:
            continue
        s = sum(val(x) for x in kids)
        if val(c) > 0 and s > 0:
            P.append(val(c)); S.append(s)
    if len(P) >= 4:
        rp = rankdata(P); rs = rankdata(S)
        rp = (rp - rp.mean()); rs = (rs - rs.mean())
        if rp.std() > 0 and rs.std() > 0:
            blocks.append((k["id"], rp / np.linalg.norm(rp), rs / np.linalg.norm(rs)))
obs = np.mean([a @ b for _, a, b in blocks])
null = np.zeros(NP)
for _, a, b in blocks:
    perms = np.argsort(rng.random((NP, len(b))), axis=1)
    null += (a[None, :] * b[perms]).sum(1)
null /= len(blocks)
print(f"khipus={len(blocks)} mean within-khipu Spearman(P, sum children)={obs:.3f} null={null.mean():.4f}±{null.std():.4f} z={(obs-null.mean())/null.std():.1f}")
pos = sum(1 for _, a, b in blocks if a @ b > 0.3); neg = sum(1 for _, a, b in blocks if a @ b < -0.3)
print("khipus rho>0.3:", pos, " rho<-0.3:", neg)

# KH0349 detail
k = [x for x in ks if x["id"] == "KH0349"][0]
l1, ch = build_tree(k)
tot = ex = near = 0; rows = []
for c in l1:
    kids = ch.get(c["name"])
    if not kids:
        continue
    nz = [val(x) for x in kids if val(x)]
    if len(nz) >= 2 and val(c) > 0:
        tot += 1; s = sum(nz); d = val(c) - s
        ex += d == 0; near += abs(d) in (1, 10) or (d != 0 and abs(d) in (100,))
        rows.append((c["name"], c["group"], val(c), s, d))
print("KH0349 parents with >=2 nonzero kids:", tot, "exact:", ex, "±1/±10/±100:", near)
print([r for r in rows if r[4] != 0][:40])

#!/usr/bin/env python3
"""Is structural similarity a find-spot signal or a recorder (contributor) signal?
Compares full structural features vs a recorder-robust subset (no attach/twist/colour codes),
and measures same-provenance enrichment of top-structural pairs within vs across recorders.
Null = random pairs with the same recorder relation (same-contributor or cross-contributor)."""
import json, numpy as np
from graph_common import *
L = np.load(OUT / "layers.npz"); M = json.load(open(OUT / "meta.json"))
F = L["F"]; names = M["feat_names"]; I, J = L["I"], L["J"]
rng = np.random.default_rng(3)
robust = [n for n in names if not (n.startswith("at") or n.startswith("tw") or n.startswith("col") or n == "multiColour")]
code = [n for n in names if n.startswith("at") or n.startswith("tw") or n.startswith("col") or n == "multiColour"]
sp, sc, si = L["same_prov"], L["same_contr"], L["same_inst"]
hasprov = np.array([M["provs"][i] is not None and M["provs"][j] is not None for i, j in zip(I, J)])
for tag, cols in (("all", names), ("robust", robust), ("codes-only", code)):
    X = F[:, [names.index(c) for c in cols]]
    Z = (X - X.mean(0)) / (X.std(0) + 1e-9); Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    S = (Zn @ Zn.T)[I, J]
    Zp = np.column_stack([rng.permutation(Z[:, j]) for j in range(Z.shape[1])]); Zp /= np.linalg.norm(Zp, axis=1, keepdims=True) + 1e-9
    thr = np.quantile((Zp @ Zp.T)[I, J], 0.999)
    e = S > thr
    print(f"[{tag}] {len(cols)} features, null99.9 thr {thr:.3f}, edges {e.sum()}")
    for rel, m in (("same-recorder", sc), ("cross-recorder", ~sc)):
        sub = e & m & hasprov; base = sp[m & hasprov].mean()
        # null: sample random pairs within the same recorder relation, same count, 1000 times
        pool = np.where(m & hasprov)[0]
        null = np.array([sp[rng.choice(pool, sub.sum(), replace=False)].mean() for _ in range(1000)]) if sub.sum() else np.array([0])
        o = sp[sub].mean() if sub.sum() else float("nan")
        print(f"   {rel}: edges(with prov) {sub.sum()}; same-prov {o:.3f}; null {null.mean():.3f}±{null.std():.3f}; p={(np.sum(null>=o)+1)/1001:.4f}")
    # also recorder enrichment
    o = sc[e].mean(); null = np.array([sc[rng.choice(len(sc), e.sum(), replace=False)].mean() for _ in range(300)])
    print(f"   same-recorder share of edges {o:.3f}; null {null.mean():.3f}±{null.std():.3f}")

#!/usr/bin/env python3
"""(c) Dating.  The corpus carries almost no usable dates: OKR earliest/latest age is set for 21 khipus only
(KH0237 1600-1630, KH0240 1600 = Leymebamba; 19 Dallas khipus all '1600-01-01' with region 'Inka, Late
Horizon' = a period placeholder, not a measurement).  No radiocarbon values are present in KFG or OKR fields.
So we test coarse PERIOD contrasts from archaeological context instead:
  Colonial      : Leymebamba (OKR 1600-1630), Santa Valley sextet (KH0323-0328; colonial census match, Medrano & Urton)
  Late Horizon  : Incahuasi (Inka site), Puruchuco / Huaquerones (Inka cemeteries), Armatambo
Confounds: every colonial khipu is also NORTH (Chachapoyas / Santa); recorder differs by site.  We therefore
measure the contrast separately inside Brezine (Leymebamba+Santa vs Puruchuco/Huaquerones) and inside Urton
(Leymebamba vs Incahuasi+Armatambo), permutation null inside each recorder (2000 reps), and call a feature
'period-or-north' only if both recorders agree in sign with p<0.05 each.
"""
import collections, json
import numpy as np
import meta_common as mc

rng = np.random.default_rng(31)
ks = [k for k in mc.load() if k["id"] not in mc.vc.UNREADABLE and k["id"] not in mc.vc.WARI]
X, names = mc.matrix(ks)
COL = {"Leymebamba", "Santa"}; LH = {"Incahuasi", "Puruchuco", "Huaquerones", "Armatambo"}
dated = [(k["id"], k["okr"]["earliestAge"], k["okr"]["latestAge"], k["region"]) for k in ks if (k.get("okr") or {}).get("earliestAge")]
print(f"khipus with any OKR date: {len(dated)}; distinct (earliest, latest): {collections.Counter((d[1], d[2]) for d in dated)}")
res = {"dated": dated, "rows": []}
for j, n in enumerate(names):
    out = {}
    for who in ("Brezine", "Urton"):
        a = [i for i, k in enumerate(ks) if k["_rec"] == who and k["_region"] in COL]
        b = [i for i, k in enumerate(ks) if k["_rec"] == who and k["_region"] in LH]
        xa, xb = X[a, j], X[b, j]; xa = xa[~np.isnan(xa)]; xb = xb[~np.isnan(xb)]
        if len(xa) < 5 or len(xb) < 5: continue
        allx = np.concatenate([xa, xb]); sd = allx.std()
        if not sd > 0: continue
        d = (xa.mean() - xb.mean()) / sd
        nn = np.array([(lambda p: (p[:len(xa)].mean() - p[len(xa):].mean()) / sd)(rng.permutation(allx)) for _ in range(2000)])
        out[who] = (float(d), float((1 + (np.abs(nn) >= abs(d)).sum()) / 2001), len(xa), len(xb), float(xa.mean()), float(xb.mean()))
    if len(out) == 2:
        rep = out["Brezine"][1] < .05 and out["Urton"][1] < .05 and np.sign(out["Brezine"][0]) == np.sign(out["Urton"][0])
        res["rows"].append(dict(feature=n, **{w: v for w, v in out.items()}, replicated=bool(rep)))
res["rows"].sort(key=lambda r: -min(abs(r["Brezine"][0]), abs(r["Urton"][0])))
print("feature        Brezine d (p) colonial/LH means          Urton d (p) colonial/LH means")
for r in res["rows"]:
    b, u = r["Brezine"], r["Urton"]
    if b[1] < .05 or u[1] < .05:
        print(f"  {r['feature']:13s} {b[0]:+.2f} ({b[1]:.3f}) {b[4]:.3f}/{b[5]:.3f} n={b[2]}/{b[3]}   "
              f"{u[0]:+.2f} ({u[1]:.3f}) {u[4]:.3f}/{u[5]:.3f} n={u[2]}/{u[3]}  {'REPLICATED' if r['replicated'] else ''}")
nrep = sum(r["replicated"] for r in res["rows"])
# expected number replicated by chance: features tested x P(both p<.05 same sign) ~ n * .05*.05/2
print(f"replicated features: {nrep} of {len(res['rows'])}; chance expectation ~{len(res['rows']) * 0.05 * 0.05 / 2:.2f} "
      f"(independent features; features are correlated so this is rough)")
# label-shuffle null for the NUMBER of replicated features (period labels permuted within recorder)
def count_rep(perm_seed):
    r_ = np.random.default_rng(perm_seed); c = 0
    labs = {}
    for who in ("Brezine", "Urton"):
        ii = [i for i, k in enumerate(ks) if k["_rec"] == who and (k["_region"] in COL or k["_region"] in LH)]
        l = np.array([ks[i]["_region"] in COL for i in ii]); labs[who] = (np.array(ii), r_.permutation(l))
    for j in range(len(names)):
        sg = []
        for who in ("Brezine", "Urton"):
            ii, l = labs[who]; x = X[ii, j]; m = ~np.isnan(x); x, ll = x[m], l[m]
            if ll.sum() < 5 or (~ll).sum() < 5 or not x.std() > 0: sg = None; break
            d = (x[ll].mean() - x[~ll].mean()) / x.std()
            nn = [(lambda p: (x[p].mean() - x[~p].mean()) / x.std())(r_.permutation(ll)) for _ in range(200)]
            pv = (1 + (np.abs(nn) >= abs(d)).sum()) / 201; sg.append((np.sign(d), pv))
        if sg and sg[0][1] < .05 and sg[1][1] < .05 and sg[0][0] == sg[1][0]: c += 1
    return c
nulls = [count_rep(s) for s in range(40)]
print(f"null (period labels permuted within recorder, 40 reps): replicated count {np.mean(nulls):.2f}+-{np.std(nulls):.2f}, "
      f"max {max(nulls)}; p={(1 + sum(n >= nrep for n in nulls)) / 41:.3f}")
res["null_rep"] = nulls
json.dump(res, open(mc.OUT / "c_dates.json", "w"), indent=1)

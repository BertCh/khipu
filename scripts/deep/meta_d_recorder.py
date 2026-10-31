#!/usr/bin/env python3
"""(d) Recorder-effect audit.

For every pair of recorders, find strata (same museum AND same fine provenance region; museum only when
region unknown) in which both recorded >=2 khipus.  Per feature the statistic is the stratum-weighted
standardized mean difference  D = sum_s w_s (mean_A - mean_B)/sd_s / sum_s w_s,  w_s = nA nB/(nA+nB).
Null: recorder labels permuted WITHIN each stratum (2000 reps) -> empirical two-sided p.
A feature that flips by recorder inside the same museum/find-spot is a recording convention (or a
selection effect), not geography.  Also reports the complementary check: for region contrasts measured
separately inside Ascher's and inside Urton's Berlin khipus, does the sign agree?
Output: OUT/d_recorder.json + printed confound list.
"""
import collections, json, itertools
import numpy as np
import meta_common as mc

rng = np.random.default_rng(3)
ks = [k for k in mc.load() if k["id"] not in mc.vc.UNREADABLE]
X, names = mc.matrix(ks)
rec = [k["_rec"] for k in ks]
mus = [k["museum"]["canonical"] or "?" for k in ks]
reg = [k["_region"] or "?" for k in ks]
strata = collections.defaultdict(list)
for i in range(len(ks)):
    strata[(mus[i], reg[i])].append(i)

RECS = ["Ascher", "Urton", "Brezine", "Pereyra", "Clindaniel"]
res = {}
for A, B in itertools.combinations(RECS, 2):
    S = []
    for key, ii in strata.items():
        a = [i for i in ii if rec[i] == A]; b = [i for i in ii if rec[i] == B]
        if len(a) >= 2 and len(b) >= 2: S.append((key, a, b))
    if not S: continue
    nA = sum(len(a) for _, a, _ in S); nB = sum(len(b) for _, _, b in S)
    print(f"\n=== {A} vs {B}: {len(S)} strata, nA={nA} nB={nB}: " + "; ".join(f"{k[0][:22]}/{k[1]} ({len(a)}v{len(b)})" for k, a, b in S))
    rows = []
    for j, n in enumerate(names):
        def stat(lab_by_stratum):
            num = den = 0.0
            for (key, a, b), (la, lb) in zip(S, lab_by_stratum):
                xa = X[la, j]; xb = X[lb, j]; xa = xa[~np.isnan(xa)]; xb = xb[~np.isnan(xb)]
                if len(xa) < 2 or len(xb) < 2: continue
                sd = np.concatenate([xa, xb]).std()
                if sd == 0: continue
                w = len(xa) * len(xb) / (len(xa) + len(xb))
                num += w * (xa.mean() - xb.mean()) / sd; den += w
            return num / den if den else np.nan
        obs = stat([(a, b) for _, a, b in S])
        if np.isnan(obs): continue
        null = []
        for _ in range(1000):
            lab = []
            for _, a, b in S:
                p = rng.permutation(a + b); lab.append((list(p[:len(a)]), list(p[len(a):])))
            null.append(stat(lab))
        null = np.array(null)
        p = (1 + (np.abs(null) >= abs(obs)).sum()) / (1 + len(null))
        mA = np.nanmean(X[[i for _, a, _ in S for i in a], j]); mB = np.nanmean(X[[i for _, _, b in S for i in b], j])
        rows.append(dict(feature=n, D=float(obs), null_mean=float(null.mean()), null_sd=float(null.std()), p=float(p),
                         meanA=float(mA), meanB=float(mB)))
    rows.sort(key=lambda r: (r["p"], -abs(r["D"])))
    res[f"{A}|{B}"] = dict(strata=[(k[0], k[1], len(a), len(b)) for k, a, b in S], rows=rows)
    for r in rows:
        if r["p"] <= 0.01 and abs(r["D"]) >= 0.5:
            print(f"  {r['feature']:13s} D={r['D']:+.2f} (null {r['null_mean']:+.2f}+-{r['null_sd']:.2f}) p={r['p']:.4f}  {A}={r['meanA']:.3f} {B}={r['meanB']:.3f}")

# region contrasts replicated inside two recorders, same museum (Berlin): Pachacamac vs Ica
print("\n=== Berlin Pachacamac vs Ica, measured separately within Ascher and within Urton ===")
rep = []
for j, n in enumerate(names):
    out = {}
    for who in ("Ascher", "Urton"):
        a = [i for i in range(len(ks)) if mus[i] == "Ethnologisches Museum, Berlin" and rec[i] == who and reg[i] == "Pachacamac"]
        b = [i for i in range(len(ks)) if mus[i] == "Ethnologisches Museum, Berlin" and rec[i] == who and reg[i] == "Ica"]
        xa, xb = X[a, j], X[b, j]; xa = xa[~np.isnan(xa)]; xb = xb[~np.isnan(xb)]
        if len(xa) < 4 or len(xb) < 4: continue
        sd = np.concatenate([xa, xb]).std()
        if not sd > 0: continue
        d = (xa.mean() - xb.mean()) / sd
        allx = np.concatenate([xa, xb]); nn = []
        for _ in range(1000):
            p = rng.permutation(allx); nn.append((p[:len(xa)].mean() - p[len(xa):].mean()) / sd)
        out[who] = (d, (1 + (np.abs(nn) >= abs(d)).sum()) / 1001, len(xa), len(xb))
    if len(out) == 2: rep.append((n, out))
rep.sort(key=lambda r: -min(abs(r[1]["Ascher"][0]), abs(r[1]["Urton"][0])) * (np.sign(r[1]["Ascher"][0]) == np.sign(r[1]["Urton"][0])))
print(" feature        d_Ascher (p)       d_Urton (p)   -> replicated?")
for n, o in rep:
    a, u = o["Ascher"], o["Urton"]
    ok = "REPLICATES" if (a[1] < .05 and u[1] < .05 and np.sign(a[0]) == np.sign(u[0])) else ("FLIPS" if (a[1] < .05 and u[1] < .05) else "")
    if a[1] < .05 or u[1] < .05:
        print(f"  {n:13s} {a[0]:+.2f} ({a[1]:.3f}) n={a[2]}/{a[3]}   {u[0]:+.2f} ({u[1]:.3f}) n={u[2]}/{u[3]}  {ok}")
res["berlin_region_replication"] = [(n, {w: list(map(float, v)) for w, v in o.items()}) for n, o in rep]

# colour-code vocabulary per recorder, Berlin only (one collection, two recorders)
print("\n=== colour-code usage, Berlin, Ascher vs Urton (share of all colour parts on all cords) ===")
use = {w: collections.Counter() for w in ("Ascher", "Urton")}; per = {w: [] for w in use}
for i, k in enumerate(ks):
    if mus[i] != "Ethnologisches Museum, Berlin" or rec[i] not in use: continue
    c = collections.Counter(x for cd in k["cords"] for p in (cd.get("colorParsed") or []) for x in p["codes"])
    use[rec[i]].update(c); per[rec[i]].append(c)
codes = sorted(set(use["Ascher"]) | set(use["Urton"]), key=lambda c: -(use["Ascher"][c] + use["Urton"][c]))
ta, tu = sum(use["Ascher"].values()), sum(use["Urton"].values())
tab = []
for c in codes[:30]:
    # khipu-level presence share, null = recorder labels permuted across Berlin khipus
    pa = np.array([c in x for x in per["Ascher"]]); pu = np.array([c in x for x in per["Urton"]])
    allp = np.concatenate([pa, pu]); obs = pa.mean() - pu.mean()
    nn = [(lambda q: q[:len(pa)].mean() - q[len(pa):].mean())(rng.permutation(allp)) for _ in range(2000)]
    pv = (1 + (np.abs(nn) >= abs(obs)).sum()) / 2001
    tab.append((c, use["Ascher"][c] / ta, use["Urton"][c] / tu, float(pa.mean()), float(pu.mean()), float(pv)))
    print(f"  {c:4s} cord-share A={use['Ascher'][c]/ta:.3f} U={use['Urton'][c]/tu:.3f}  khipus-using A={pa.mean():.2f} U={pu.mean():.2f}  p={pv:.4f}")
res["berlin_colour_codes"] = tab
json.dump(res, open(mc.OUT / "d_recorder.json", "w"), indent=1)

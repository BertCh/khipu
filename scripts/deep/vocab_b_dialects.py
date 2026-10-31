#!/usr/bin/env python3
"""(b) Regional dialects: which khipu features carry provenance signal?

Per-khipu feature vector (fractions among *recorded* values, so the recorder's 'U' rate is kept out
of the substantive groups and tested on its own as a confound):
  knots   : shares of S / L / E / EE / other knots; mean L turns; share of Z-direction among S/Z knots
  cords   : share S twist among S/Z; share V attach among R/V; share T attach; share B terminal among K/B
  struct  : log #pendants, log #groups, log mean group size, share subsidiaries, max level, share top cords,
            share pendants in singleton groups
  values  : share zero/null pendants, mean log10 value, share values>=100, >=1000, share mult-of-10 among >=10
  colour  : shares of 12 commonest base codes (all colour parts), share multi-colour cords, #distinct codes (log)
  primary : primary fiber CN/CL, beginning T/B/K/D, primary twist
  recorder: share 'U' twist, 'U' attach, 'U' terminal, 'U' knot direction (recording-convention confound)
Classifier: multinomial logistic regression (L2, numpy/L-BFGS), stratified 5-fold CV x5 repeats,
balanced accuracy.  Null: region labels permuted across khipus (200 reps).
Chi-square per categorical channel (pooled cord/knot counts) with the region labels permuted across khipus.
"""
from __future__ import annotations
import collections, json, math
import numpy as np
from scipy.optimize import minimize
import vocab_common as vc

rng = np.random.default_rng(11)
ks = [k for k in vc.load() if k["id"] not in vc.UNREADABLE]
TOPC = ["W", "AB", "MB", "YB", "KB", "B", "GG", "DB", "LB", "NB", "HB", "RB"]

def frac(a, b):
    return a / b if b else np.nan

def features(k):
    cs = k["cords"]; ps = vc.pendants(k)
    kn = [x for c in cs for x in c["knots"]]
    kt = collections.Counter(x["type"] for x in kn); nk = sum(kt.values())
    dirs = collections.Counter(x["dir"] for x in kn)
    Lt = [x["n"] for x in kn if x["type"] == "L" and x.get("n")]
    tw = collections.Counter(c["twist"] for c in cs); at = collections.Counter(c["attach"] for c in cs)
    te = collections.Counter(c.get("term") for c in cs)
    f = {}
    f["k_S"] = frac(kt["S"], nk); f["k_L"] = frac(kt["L"], nk); f["k_E"] = frac(kt["E"], nk)
    f["k_EE"] = frac(kt["EE"], nk); f["k_oth"] = frac(nk - kt["S"] - kt["L"] - kt["E"] - kt["EE"], nk)
    f["k_Lturns"] = np.mean(Lt) if Lt else np.nan
    f["k_dirZ"] = frac(dirs["Z"], dirs["Z"] + dirs["S"])
    f["c_twS"] = frac(tw["S"], tw["S"] + tw["Z"]); f["c_attV"] = frac(at["V"], at["V"] + at["R"])
    f["c_attT"] = frac(at["T"], len(cs)); f["c_termB"] = frac(te["B"], te["B"] + te["K"])
    grs = k["groups"] or []
    np_ = max(len(ps), 1)
    f["s_logP"] = math.log(np_); f["s_logG"] = math.log(max(len(grs), 1))
    f["s_logGsize"] = math.log(np_ / max(len(grs), 1)); f["s_sub"] = frac(sum(c["level"] >= 2 for c in cs), len(cs))
    f["s_maxlev"] = max((c["level"] for c in cs), default=1); f["s_top"] = frac(sum(c["kind"] == "top" for c in cs), len(cs))
    f["s_single"] = frac(sum(g["n"] for g in grs if g["n"] == 1), np_)
    vals = [int(c.get("value") or 0) for c in ps]; nz = [v for v in vals if v > 0]
    wari = k["id"] in vc.WARI
    f["v_zero"] = frac(sum(v == 0 for v in vals), len(vals))
    f["v_meanlog"] = np.mean(np.log10(nz)) if nz and not wari else np.nan
    f["v_ge100"] = frac(sum(v >= 100 for v in nz), len(nz)) if not wari else np.nan
    f["v_ge1000"] = frac(sum(v >= 1000 for v in nz), len(nz)) if not wari else np.nan
    t10 = [v for v in nz if v >= 10]; f["v_m10"] = frac(sum(v % 10 == 0 for v in t10), len(t10)) if not wari else np.nan
    codes = collections.Counter(); multi = 0
    for c in cs:
        cp = c.get("colorParsed") or []
        allc = [x for p in cp for x in p["codes"]]
        codes.update(allc); multi += len(allc) > 1
    ncod = sum(codes.values())
    for col in TOPC: f["col_" + col] = frac(codes[col], ncod)
    f["col_multi"] = frac(multi, len(cs)); f["col_ndist"] = math.log(1 + len(codes))
    pr = k["primary"]
    f["p_fiberCL"] = 1.0 if pr.get("fiber") == "CL" else 0.0 if pr.get("fiber") else np.nan
    for b in "TBKD": f["p_beg" + b] = 1.0 if pr.get("beginning") == b else 0.0 if pr.get("beginning") else np.nan
    f["p_twS"] = 1.0 if pr.get("twist") == "S" else 0.0 if pr.get("twist") in ("Z",) else np.nan
    f["r_twU"] = frac(tw["U"], len(cs)); f["r_attU"] = frac(at["U"], len(cs)); f["r_termU"] = frac(te["U"], len(cs))
    f["r_dirU"] = frac(dirs["U"], nk)
    return f

feats = [features(k) for k in ks]
names = list(feats[0].keys())
X = np.array([[f[n] for n in names] for f in feats], float)
GROUPS = {g: [i for i, n in enumerate(names) if n.startswith(p)] for g, p in
          (("knots", "k_"), ("cords", "c_"), ("struct", "s_"), ("values", "v_"), ("colour", "col_"), ("primary", "p_"), ("recorder", "r_"))}
regions = [k["_region"] for k in ks]
cnt = collections.Counter(r for r in regions if r)
REG = [r for r, n in cnt.items() if n >= 11]
idx = np.array([i for i, r in enumerate(regions) if r in REG])
y = np.array([REG.index(regions[i]) for i in idx]); Xr = X[idx]
C = len(REG)
print("regions:", {r: cnt[r] for r in REG})

def prep(Xtr, Xte):
    mu = np.nanmean(Xtr, 0); mu = np.where(np.isnan(mu), 0, mu)
    Xtr = np.where(np.isnan(Xtr), mu, Xtr); Xte = np.where(np.isnan(Xte), mu, Xte)
    sd = Xtr.std(0); sd[sd == 0] = 1
    return (Xtr - mu) / sd, (Xte - mu) / sd

def fit(Xt, yt, lam=1.0, C=None):
    C = C or (yt.max() + 1)
    n, d = Xt.shape; Y = np.eye(C)[yt]
    w_cls = len(yt) / (C * np.maximum(np.bincount(yt, minlength=C), 1))  # class-balanced
    sw = w_cls[yt]
    def fg(w):
        W = w[:d * C].reshape(d, C); b = w[d * C:]
        Z = Xt @ W + b; Z -= Z.max(1, keepdims=True); P = np.exp(Z); P /= P.sum(1, keepdims=True)
        loss = -(sw * np.log(P[np.arange(n), yt] + 1e-12)).sum() / n + lam * (W ** 2).sum() / n
        G = (P - Y) * sw[:, None] / n
        return loss, np.concatenate([(Xt.T @ G + 2 * lam * W / n).ravel(), G.sum(0)])
    r = minimize(fg, np.zeros(d * C + C), jac=True, method="L-BFGS-B", options={"maxiter": 300})
    return r.x[:d * C].reshape(d, C), r.x[d * C:]

def cv(cols, yy, reps=5, seed=0, XX=None):
    XX = Xr if XX is None else XX
    C = int(yy.max() + 1)
    rr = np.random.default_rng(seed); accs = []; conf = np.zeros((C, C))
    for rep in range(reps):
        folds = np.zeros(len(yy), int)
        for c in range(C):
            ii = np.where(yy == c)[0]; rr.shuffle(ii); folds[ii] = np.arange(len(ii)) % 5
        pred = np.zeros(len(yy), int)
        for f in range(5):
            tr, te = folds != f, folds == f
            a, b = prep(XX[tr][:, cols], XX[te][:, cols]); W, bb = fit(a, yy[tr], C=C)
            pred[te] = (b @ W + bb).argmax(1)
        rec = [np.mean(pred[yy == c] == c) for c in range(C)]; accs.append(np.mean(rec))
        for t, p in zip(yy, pred): conf[t, p] += 1
    return float(np.mean(accs)), conf / reps

allc = [i for g, ii in GROUPS.items() if g != "recorder" for i in ii]
res = {}
acc, conf = cv(allc, y)
print(f"all substantive features: balanced acc = {acc:.3f} (chance {1/C:.3f})")
nullacc = [cv(allc, rng.permutation(y), reps=1, seed=s)[0] for s in range(100)]
print(f"  label-permutation null: {np.mean(nullacc):.3f} +- {np.std(nullacc):.3f}, max {np.max(nullacc):.3f}")
res["all"] = dict(acc=acc, null_mean=float(np.mean(nullacc)), null_sd=float(np.std(nullacc)))
print("  per-region recall:", {REG[c]: round(conf[c, c] / conf[c].sum(), 2) for c in range(C)})
print("  confusions (row=true):")
for c in range(C):
    top = np.argsort(-conf[c])[:3]
    print(f"    {REG[c]:12s} -> " + ", ".join(f"{REG[t]}:{conf[c, t]:.1f}" for t in top))
for g, ii in GROUPS.items():
    a, _ = cv(ii, y, reps=3)
    na = [cv(ii, rng.permutation(y), reps=1, seed=s)[0] for s in range(30)]
    drop = cv([i for i in allc if i not in ii], y, reps=3)[0] if g != "recorder" else float("nan")
    print(f"  group {g:9s} alone acc={a:.3f} (null {np.mean(na):.3f}+-{np.std(na):.3f})  all-minus-group acc={drop:.3f}")
    res[g] = dict(alone=a, null_mean=float(np.mean(na)), null_sd=float(np.std(na)), drop=drop)

# single-feature Kruskal-Wallis-like F with permutation (effect size eta^2), top features
from scipy import stats
print("\nsingle features, eta^2 across regions, permutation p (500 label shuffles):")
eta = []
for j, n in enumerate(names):
    col = Xr[:, j]; m = ~np.isnan(col)
    if m.sum() < 50: continue
    def e2(lab):
        x = col[m]; l = lab[m]; gm = x.mean()
        return sum(((x[l == c].mean() - gm) ** 2) * (l == c).sum() for c in range(C) if (l == c).any()) / ((x - gm) ** 2).sum()
    o = e2(y); nn = np.array([e2(rng.permutation(y)) for _ in range(500)])
    eta.append((o, n, nn.mean(), (1 + (nn >= o).sum()) / 501, {REG[c]: round(float(np.nanmean(col[y == c])), 3) for c in range(C)}))
eta.sort(reverse=True)
for o, n, nm, p, means in eta[:18]:
    print(f"  {n:11s} eta2={o:.3f} null={nm:.3f} p={p:.3f}  {means}")
res["eta"] = [(n, o, nm, p, means) for o, n, nm, p, means in eta]

# pooled chi-square, khipu-level label permutation
print("\nchi-square per channel (pooled counts), region labels permuted across khipus (300 reps):")
def chan(k, what):
    c = collections.Counter()
    for cd in k["cords"]:
        if what == "knot": c.update(x["type"] if x["type"] in ("S", "L", "E", "EE") else "o" for x in cd["knots"])
        elif what == "units": 
            v = int(cd.get("value") or 0)
            if v >= 10 and k["id"] not in vc.WARI: c[v % 10] += 1
        elif what == "colour":
            b = vc.base_colour(cd)
            if b: c[b if b in TOPC else "o"] += 1
        elif what == "Lturns":
            c.update(min(x["n"] or 0, 9) for x in cd["knots"] if x["type"] == "L")
    return c
KSR = [ks[i] for i in idx]
for what in ("knot", "units", "colour", "Lturns"):
    per = [chan(k, what) for k in KSR]; cats = sorted({c for p in per for c in p}, key=str)
    M = np.array([[p[c] for c in cats] for p in per], float)
    def chi(lab):
        T = np.array([M[lab == c].sum(0) for c in range(C)]); E = T.sum(1, keepdims=True) * T.sum(0, keepdims=True) / T.sum()
        return ((T - E) ** 2 / np.where(E > 0, E, 1)).sum()
    o = chi(y); nn = np.array([chi(rng.permutation(y)) for _ in range(300)])
    print(f"  {what:7s} chi2={o:9.0f} null={nn.mean():9.0f}+-{nn.std():7.0f}  z={(o-nn.mean())/nn.std():6.1f}  p={(1+(nn>=o).sum())/301:.4f}")
    res["chi_" + what] = dict(obs=float(o), mean=float(nn.mean()), sd=float(nn.std()))
    if what == "units":
        T = np.array([M[y == c].sum(0) for c in range(C)]); sh = T / T.sum(1, keepdims=True)
        print("    units-digit share (cols " + " ".join(map(str, cats)) + ")")
        for c in range(C): print(f"    {REG[c]:12s} " + " ".join(f"{x:.3f}" for x in sh[c]))

# ---- recorder confound: region classification WITHIN one recorder, and recorder classification WITHIN one region
print("\nWithin-recorder region classification (substantive features, 5-fold x5; null = 100 label perms):")
contrib = [k["contributors"] for k in ks]
for who in ("Gary Urton", "Marcia & Robert Ascher"):
    ii = [i for i in range(len(ks)) if contrib[i] == who and regions[i]]
    rc = collections.Counter(regions[i] for i in ii); keep = [r for r, n in rc.items() if n >= 10]
    ii = np.array([i for i in ii if regions[i] in keep]); yy = np.array([keep.index(regions[i]) for i in ii])
    a, cf = cv(allc, yy, XX=X[ii]); na = [cv(allc, rng.permutation(yy), reps=1, seed=s, XX=X[ii])[0] for s in range(100)]
    print(f"  {who:24s} regions={dict((r, rc[r]) for r in keep)} acc={a:.3f} null={np.mean(na):.3f}+-{np.std(na):.3f} p={(1+sum(x>=a for x in na))/101:.3f}")
    print("     recall:", {keep[c]: round(cf[c, c] / cf[c].sum(), 2) for c in range(len(keep))})
    for g, gi in GROUPS.items():
        if g == "recorder": continue
        ag = cv(gi, yy, reps=3, XX=X[ii])[0]; print(f"     {g:8s} alone acc={ag:.3f}")
    res["within_" + who] = dict(acc=a, null_mean=float(np.mean(na)), null_sd=float(np.std(na)), regions={r: rc[r] for r in keep})
print("Recorder (Urton vs Ascher) classification within one region (magnitude of recorder signal):")
for reg in ("Ica", "Pachacamac", "CentralCoast"):
    ii = np.array([i for i in range(len(ks)) if regions[i] == reg and contrib[i] in ("Gary Urton", "Marcia & Robert Ascher")])
    yy = np.array([0 if contrib[i] == "Gary Urton" else 1 for i in ii])
    for g in ("all", "recorder"):
        cols = allc if g == "all" else GROUPS["recorder"]
        a = cv(cols, yy, XX=X[ii])[0]; na = [cv(cols, rng.permutation(yy), reps=1, seed=s, XX=X[ii])[0] for s in range(50)]
        print(f"  {reg:12s} n={len(ii)} {g:8s} acc={a:.3f} null={np.mean(na):.3f}+-{np.std(na):.3f}")
json.dump(res, open(vc.OUT / "b_dialects.json", "w"), indent=1, default=str)

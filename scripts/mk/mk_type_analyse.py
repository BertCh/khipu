"""Tests of the working/summary typology on $OUT/type_features.json (from mk_type_features.py).
Prints: magnitude distribution (dichotomy?), raw vs null-corrected arithmetic by magnitude bin,
OLS with n_pend + recorder controls, feature co-occurrence. Run after mk_type_features.py."""
from __future__ import annotations
import json, collections, math
from pathlib import Path
import numpy as np

S = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/573e055a-1d0e-4a10-b794-c747179bc194/scratchpad")
R = json.load(open(S / "out" / "type_features.json"))
R = [r for r in R if r["nz_share"] > 0 and r["n_pend"] >= 10]
print("khipus analysed (>=10 pendants, some value):", len(R))

lm = np.array([math.log10(max(r["mean_pend"], 0.1)) for r in R])
ln = np.array([math.log10(r["n_pend"]) for r in R])
obs = np.array([r["pp_obs"] for r in R], float)
nA = np.array([r["pp_nullA"] for r in R])
nB = np.array([r["pp_nullB"] for r in R])
pA = np.array([r["pp_pA"] for r in R])
gt = np.array([r["gt_obs"] for r in R], float); gn = np.array([r["gt_null"] for r in R]); gp = np.array([r["gt_p"] for r in R])
lr = np.log2((obs + 1) / (nA + 1))       # arithmetic excess, log2 ratio
lrB = np.log2((obs + 1) / (nB + 1))
top = np.array([r["n_top"] > 0 for r in R])
elig = np.array([max(r["colour_elig"], 1) for r in R])
band = np.array([r["band_groups"] for r in R]) / elig
ser = np.array([r["ser_groups"] for r in R]) / elig
six = np.array([r["six_share"] for r in R])
subr = np.array([r["n_sub"] / r["n_pend"] for r in R])
brk = np.array([r["broken_primary"] for r in R])
rec = [r["recorder"] or "?" for r in R]


def rank(x):
    x = np.asarray(x, float); o = np.argsort(x, kind="mergesort"); r = np.empty(len(x)); r[o] = np.arange(len(x))
    for u in np.unique(x):  # average ranks for ties
        m = x == u
        if m.sum() > 1: r[m] = r[m].mean()
    return r
def sp(x, y): return float(np.corrcoef(rank(x), rank(y))[0, 1])


def bimod(x):
    n = len(x); m = x.mean(); s = x.std()
    g = ((x - m) ** 3).mean() / s ** 3; k = ((x - m) ** 4).mean() / s ** 4 - 3
    return (g * g + 1) / (k + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))


def gmm_bic(x, K, it=300):
    n = len(x); rs = np.random.default_rng(1)
    best = None
    for _ in range(10):
        mu = rs.choice(x, K); sd = np.full(K, x.std()); w = np.full(K, 1 / K)
        for _ in range(it):
            p = w * np.exp(-0.5 * ((x[:, None] - mu) / sd) ** 2) / (sd * math.sqrt(2 * math.pi)) + 1e-300
            ll = np.log(p.sum(1)).sum(); r = p / p.sum(1, keepdims=True)
            nk = r.sum(0); w = nk / n; mu = (r * x[:, None]).sum(0) / nk
            sd = np.sqrt((r * (x[:, None] - mu) ** 2).sum(0) / nk) + 1e-3
        bic = -2 * ll + (3 * K - 1) * math.log(n)
        if best is None or bic < best[0]: best = (bic, mu, sd, w)
    return best


print("\n== 1. dichotomy or continuum: log10 mean pendant value ==")
h, e = np.histogram(lm, bins=np.arange(-1, 5.6, 0.5))
for a, c in zip(e, h): print(f"  {a:5.1f}..{a+0.5:4.1f} {'#' * (c // 3)} {c}")
print("  bimodality coef %.3f (>0.555 suggests bimodal)" % bimod(lm))
for K in (1, 2, 3):
    b = gmm_bic(lm, K); print(f"  GMM K={K} BIC {b[0]:.1f} mu {np.round(b[1],2)} w {np.round(b[3],2)}")
print("  paper bins: <10:", (lm < 1).sum(), " 10-1000:", ((lm >= 1) & (lm < 3)).sum(), " >=1000:", (lm >= 3).sum())

print("\n== 2. arithmetic vs magnitude: raw, null, excess ==")
bins = [(-9, 1), (1, 2), (2, 3), (3, 9)]
print("  bin(log mean)   n  obs/khipu nullA/khipu nullB/khipu  obs/null  sig(pA<.05)  medianNpend  GT obs/null  GTsig")
for lo, hi in bins:
    m = (lm >= lo) & (lm < hi)
    print(f"  [{lo:>2},{hi:>2})  {m.sum():4d}  {obs[m].mean():8.1f} {nA[m].mean():10.1f} {nB[m].mean():10.1f}"
          f"  {obs[m].sum()/max(nA[m].sum(),1e-9):7.2f}  {(pA[m]<.05).mean():9.2f}  {np.median([R[i]['n_pend'] for i in np.where(m)[0]]):8.0f}"
          f"  {gt[m].sum():4.0f}/{gn[m].sum():6.1f}  {(gp[m]<.05).mean():.2f}")
print("  spearman(logmean, raw obs) %.2f  (logmean, nullA) %.2f  (logmean, excess log2 ratio) %.2f  (logmean, nullB-ratio) %.2f"
      % (sp(lm, obs), sp(lm, nA), sp(lm, lr), sp(lm, lrB)))
print("  spearman(npend, raw obs) %.2f  (npend, nullA) %.2f  (npend, excess) %.2f" % (sp(ln, obs), sp(ln, nA), sp(ln, lr)))
print("  the paper's 'summary' region: mean>=1000 & raw PP<=2:", ((lm >= 3) & (obs <= 2)).sum(), "of", (lm >= 3).sum(),
      "; null expectation there <=2 for", ((lm >= 3) & (nA <= 2)).sum())


def ols(y, cols, names, recfx=True):
    X = [np.ones(len(y))] + cols
    if recfx:
        cnt = collections.Counter(rec)
        for rr, c in cnt.items():
            if c >= 10 and rr != cnt.most_common(1)[0][0]:
                X.append(np.array([x == rr for x in rec], float))
    X = np.column_stack(X)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    res = y - X @ beta
    s2 = res @ res / (len(y) - X.shape[1]); cov = s2 * np.linalg.inv(X.T @ X)
    out = []
    for i, nm in enumerate(names):
        out.append(f"{nm} {beta[i+1]:+.3f} (t {beta[i+1]/math.sqrt(cov[i+1,i+1]):+.1f})")
    return "; ".join(out)


print("\n== 3. regressions (recorder fixed effects, recorders with >=10 khipus) ==")
print("  raw log2(obs+1)   ~ logmean + lognpend:", ols(np.log2(obs + 1), [lm, ln], ["logmean", "lognpend"]))
print("  excess log2 ratio ~ logmean + lognpend:", ols(lr, [lm, ln], ["logmean", "lognpend"]))
print("  excess (blank-preserving null B):      ", ols(lrB, [lm, ln], ["logmean", "lognpend"]))
print("  excess ~ logmean + npend + banded + top + six + subs/pend + broken:",
      ols(lr, [lm, ln, band, top.astype(float), six, subr, brk.astype(float)], ["logmean", "lognpend", "banded", "top", "six", "subs", "broken"]))
print("  logmean ~ banded + seriated + top + lognpend:", ols(lm, [band, ser, top.astype(float), ln], ["banded", "seriated", "top", "lognpend"]))

print("\n== 4. feature co-occurrence (spearman; partial on lognpend via residual ranks) ==")
feats = dict(logmean=lm, excess=lr, banded=band, seriated=ser, top=top.astype(float), six=six, subs=subr, broken=brk.astype(float), lognpend=ln)


def resid(x):
    X = np.column_stack([np.ones(len(x)), rank(ln)])
    b, *_ = np.linalg.lstsq(X, rank(x), rcond=None); return rank(x) - X @ b


names = list(feats)
print("  " + " ".join(f"{n[:7]:>8}" for n in names))
for a in names:
    print(f"  {a[:8]:8}" + " ".join(f"{np.corrcoef(resid(feats[a]), resid(feats[b]))[0,1] if a!='lognpend' and b!='lognpend' else sp(feats[a],feats[b]):8.2f}" for b in names))

print("\n  top-cord khipus: n=%d, median mean %.0f (rest %.0f), share mean>=1000: %.2f (rest %.2f), banded %.2f (rest %.2f)"
      % (top.sum(), np.median(10 ** lm[top]), np.median(10 ** lm[~top]), (lm[top] >= 3).mean(), (lm[~top] >= 3).mean(), band[top].mean(), band[~top].mean()))
# paper's own colour counts
mk = [(r, (r["mk_banded"] or 0), (r["mk_seriated"] or 0)) for r in R if r["mk_banded"] is not None]
mb = np.array([b / max(b + s, 1) for _, b, s in mk]); mlm = np.array([math.log10(max(r["mean_pend"], .1)) for r, _, _ in mk])
mtop = np.array([r["n_top"] > 0 for r, _, _ in mk])
print("  KFG banded share (banded/(banded+seriated)) vs logmean spearman %.2f; top-cord khipus mean banded share %.2f vs %.2f; our banded vs KFG banded spearman %.2f"
      % (sp(mlm, mb), mb[mtop].mean(), mb[~mtop].mean(), sp(np.array([band[R.index(r)] for r, _, _ in mk]), mb)))

# how many khipus satisfy the full "working" / "summary" syndromes
W = (lm >= 1) & (lm < 3) & (band > .5) & (lr > 1)
Sm = (lm >= 3) & (band <= .5) & (~top) & (lr <= 0.5)
print("\n  full 'working' syndrome (10-1000, banded>50%%, excess>2x): %d; with top cord: %d" % (W.sum(), (W & top).sum()))
print("  full 'summary' syndrome (>=1000, not banded, no top, excess<=1.4x): %d of %d khipus >=1000" % (Sm.sum(), (lm >= 3).sum()))
hi = np.where(lm >= 3)[0]
print("  khipus with mean>=1000 and significant excess (pA<.05):", [(R[i]["id"], R[i]["alias"], int(obs[i]), round(nA[i], 1)) for i in hi if pA[i] < .05])
print("  khipus with mean>=1000:", len(hi), "  with obs>=5:", [(R[i]['id'], int(obs[i]), round(nA[i],1)) for i in hi if obs[i] >= 5])

print("\n== 5. strict arithmetic (group totals written on a cord) vs magnitude ==")
gex = np.log2((gt + 1) / (gn + 1))
print("  GT excess ~ logmean + lognpend (+recorder FE):", ols(gex, [lm, ln], ["logmean", "lognpend"]))
print("  share with GT p<.01 & >=2 hits by bin:", [(lo, hi, round(float(((gp < .01) & (gt >= 2))[(lm >= lo) & (lm < hi)].mean()), 2)) for lo, hi in bins])
from math import comb
a = int(((lm >= 3) & top).sum()); b = int(((lm < 3) & top).sum()); c = int(((lm >= 3) & ~top).sum()); d = int(((lm < 3) & ~top).sum())
def hyp(x): return comb(a + b, x) * comb(c + d, a + c - x) / comb(a + b + c + d, a + c)
print(f"  top cords x mean>=1000: {a} of {a+b} top-cord khipus vs {c} of {c+d} others; Fisher one-sided P(<= {a}) = {sum(hyp(x) for x in range(0, a+1)):.2f}")

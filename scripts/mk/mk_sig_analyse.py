"""Analyse OUT/sig_null_counts.npz: corpus + per-khipu significance, per-khipu arithmetic-excess
score (sig_khipu_scores.json), and handedness decomposition."""
import json, collections, numpy as np
from mk_sig_common import *

Z = np.load(OUT / "sig_null_counts.npz")
ids = list(Z["ids"]); F = list(Z["feats"]); obs = Z["obs"].astype(float)
NUL = {k: Z[f"null_{k}"].astype(float) for k in ("a", "a0", "b", "c")}
R = NUL["a"].shape[0]
fi = {f: i for i, f in enumerate(F)}
ms = {m["id"]: m for m in load_models()}
meta = {}
for i in ids:
    m = ms[i]
    v = np.array([p["v"] for p in m["P"]])
    nz = v[v > 0]
    meta[i] = dict(n=len(v), nnz=int((v > 0).sum()), small=float((nz <= 10).mean()) if len(nz) else 0.0,
                   logmean=float(np.log10(nz).mean()) if len(nz) else 0.0, rec=m["rec"], prov=m["prov"],
                   alias=(m["aliases"] or [""])[0], ngroups=len(m["groups"]))
out = {"R": int(R), "n_khipus": len(ids)}


def rank(x):
    return np.argsort(np.argsort(x)).astype(float)


def spearman(x, y):
    return float(np.corrcoef(rank(np.asarray(x)), rank(np.asarray(y)))[0, 1])


# ---------------- 1. corpus + per-khipu per relation
REL = ["r1", "r2", "r3", "r4", "r4big", "r5", "r7", "r9"]
corp = {}
for f in REL:
    j = fi[f]
    o = obs[:, j].sum()
    row = {"obs": int(o), "khipus_with": int((obs[:, j] > 0).sum())}
    for k, N in NUL.items():
        tot = N[:, :, j].sum(1)
        pk = (1 + (N[:, :, j] >= obs[None, :, j]).sum(0)) / (R + 1)
        row[k] = dict(null_mean=round(float(tot.mean()), 1), ratio=round(float(o / tot.mean()), 2) if tot.mean() else None,
                      z=round(float((o - tot.mean()) / (tot.std() + 1e-9)), 1),
                      p=float((1 + (tot >= o).sum()) / (R + 1)),
                      exp_khipus_with=round(float((N[:, :, j] > 0).sum(1).mean()), 1),
                      khipus_p05=int(((pk < 0.05) & (obs[:, j] > 0)).sum()),
                      khipus_p01=int(((pk < 0.01) & (obs[:, j] > 0)).sum()))
    corp[f] = row
out["corpus"] = corp

# ---------------- 2. per-khipu arithmetic excess score under null a (all sum-type relations jointly)
SUMF = [fi[f] for f in ("r1", "r2", "r3", "r5")]
tot_obs = obs[:, SUMF].sum(1)
tot_null = NUL["a"][:, :, SUMF].sum(2)  # R x K
mu = tot_null.mean(0); sd = tot_null.std(0)
p_up = (1 + (tot_null >= tot_obs[None]).sum(0)) / (R + 1)
z = (tot_obs - mu) / np.maximum(sd, 1.0)
# per relation-1 alone too
r1o = obs[:, fi["r1"]]; r1n = NUL["a"][:, :, fi["r1"]]
r1p = (1 + (r1n >= r1o[None]).sum(0)) / (R + 1)
r1mu = r1n.mean(0)
# ordering-only score: null c (within-group shuffle) and b (group shuffle)
pc = (1 + (NUL["c"][:, :, SUMF].sum(2) >= tot_obs[None]).sum(0)) / (R + 1)
pb = (1 + (NUL["b"][:, :, SUMF].sum(2) >= tot_obs[None]).sum(0)) / (R + 1)
rows = []
for x, i in enumerate(ids):
    rows.append(dict(id=i, alias=meta[i]["alias"], recorder=meta[i]["rec"], provenance=meta[i]["prov"],
                     n_pendants=meta[i]["n"], n_nonzero=meta[i]["nnz"], frac_small_le10=round(meta[i]["small"], 3),
                     log10_mean_nonzero=round(meta[i]["logmean"], 2),
                     raw_sum_relations=int(tot_obs[x]), raw_r1=int(r1o[x]),
                     null_a_expected=round(float(mu[x]), 2), excess=round(float(tot_obs[x] - mu[x]), 2),
                     ratio=round(float(tot_obs[x] / mu[x]), 2) if mu[x] > 0 else None,
                     z=round(float(z[x]), 2), p_upper_null_a=round(float(p_up[x]), 4),
                     r1_expected=round(float(r1mu[x]), 2), r1_p_null_a=round(float(r1p[x]), 4),
                     p_upper_null_b_grouporder=round(float(pb[x]), 4), p_upper_null_c_withingroup=round(float(pc[x]), 4),
                     r4=int(obs[x, fi["r4"]]), r4_expected=round(float(NUL["a"][:, x, fi["r4"]].mean()), 2),
                     r7=int(obs[x, fi["r7"]]), r9=int(obs[x, fi["r9"]])))
rows.sort(key=lambda r: (r["p_upper_null_a"], -r["z"]))
json.dump(dict(note="Per-khipu arithmetic excess. raw = relations 1+2+3+5 count (our port of M&K 2024). null a = whole pendant cords permuted within the khipu (group sizes, value multiset, colours, subsidiaries kept). excess = raw - E_null_a; z = excess/max(sd,1); p_upper = (1+#null>=obs)/(R+1). R=%d." % R,
               rows=rows), open(OUT / "sig_khipu_scores.json", "w"), indent=1)
act = [x for x in range(len(ids)) if meta[ids[x]]["nnz"] >= 5]
n_ = [meta[ids[x]]["n"] for x in act]; sm = [meta[ids[x]]["small"] for x in act]; lm = [meta[ids[x]]["logmean"] for x in act]
dep = {}
for name, arr in (("raw", tot_obs[act]), ("expected_null_a", mu[act]), ("excess", (tot_obs - mu)[act]),
                  ("z", z[act]), ("neglog10_p", -np.log10(p_up[act]))):
    dep[name] = dict(vs_n_pendants=round(spearman(arr, n_), 2), vs_frac_small=round(spearman(arr, sm), 2),
                     vs_log_mean=round(spearman(arr, lm), 2))
out["score_dependence_spearman"] = dep
sig = p_up < 0.01
out["khipus_with_any_sum_relation"] = int((tot_obs > 0).sum())
out["khipus_sig_p01_null_a"] = int(sig.sum())
out["khipus_sig_p05_null_a"] = int((p_up < 0.05).sum())
out["expected_false_pos_p05"] = round(0.05 * len(act), 1)
# raw-rich but not significant
rr = sorted(range(len(ids)), key=lambda x: -tot_obs[x])[:40]
out["top40_raw_not_sig_p05"] = [(ids[x], meta[ids[x]]["alias"], int(tot_obs[x]), round(float(mu[x]), 1), round(float(p_up[x]), 3)) for x in rr if p_up[x] >= 0.05]
out["top_by_z"] = [(r["id"], r["alias"], r["raw_sum_relations"], r["null_a_expected"], r["z"]) for r in sorted(rows, key=lambda r: -r["z"])[:15]]

# ---------------- 3. handedness
H = {}
for rel in ("r1", "r2", "r3", "r5"):
    j, jr = fi[rel], fi[rel + "R"]
    o_all, o_R = obs[:, j].sum(), obs[:, jr].sum()
    h = dict(obs_right=round(float(o_R / o_all), 4), n=int(o_all))
    for k, N in NUL.items():
        fr = N[:, :, jr].sum(1) / N[:, :, j].sum(1)
        h["null_" + k] = dict(mean=round(float(fr.mean()), 4), sd=round(float(fr.std()), 4),
                              p_two=float((1 + (np.abs(fr - fr.mean()) >= abs(o_R / o_all - fr.mean())).sum()) / (R + 1)))
    # khipu bootstrap CI
    rng = np.random.default_rng(3)
    ks = np.nonzero(obs[:, j] > 0)[0]
    bs = []
    for _ in range(4000):
        s = rng.choice(ks, len(ks))
        bs.append(obs[s, jr].sum() / obs[s, j].sum())
    h["khipu_bootstrap_95"] = [round(float(np.percentile(bs, 2.5)), 4), round(float(np.percentile(bs, 97.5)), 4)]
    # khipus majority right
    fr_k = obs[ks, jr] / obs[ks, j]
    h["khipus_majority_right"] = int((fr_k > 0.5).sum()); h["khipus_majority_left"] = int((fr_k < 0.5).sum()); h["khipus_tied"] = int((fr_k == 0.5).sum())
    h["median_khipu_right_frac"] = round(float(np.median(fr_k)), 3)
    # leave out top-10 contributors of right-excess
    exc = obs[:, jr] - obs[:, j] / 2
    top = np.argsort(-exc)[:10]
    keep = np.setdiff1d(np.arange(len(ids)), top)
    h["top10_excess_khipus"] = [(ids[x], meta[ids[x]]["alias"], int(obs[x, j]), int(obs[x, jr])) for x in top]
    h["right_frac_without_top10"] = round(float(obs[keep, jr].sum() / obs[keep, j].sum()), 4)
    h["share_of_right_excess_in_top10"] = round(float(exc[top].sum() / exc.sum()), 3)
    by = {}
    for rec in sorted({meta[i]["rec"] for i in ids}):
        xs = [x for x in range(len(ids)) if meta[ids[x]]["rec"] == rec]
        a, b = obs[xs, jr].sum(), obs[xs, j].sum()
        if b:
            by[rec] = dict(n=int(b), right=round(float(a / b), 3))
    xs = [x for x in range(len(ids)) if "ncahuasi" in meta[ids[x]]["prov"]]
    by["Inkawasi"] = dict(n=int(obs[xs, j].sum()), right=round(float(obs[xs, jr].sum() / max(obs[xs, j].sum(), 1)), 3))
    xs = [x for x in range(len(ids)) if "ncahuasi" not in meta[ids[x]]["prov"]]
    by["not_Inkawasi"] = dict(n=int(obs[xs, j].sum()), right=round(float(obs[xs, jr].sum() / obs[xs, j].sum()), 3))
    h["by_stratum"] = by
    H[rel] = h
# first-of-group decomposition for r1
j, jr, jf, jfr, jl = fi["r1"], fi["r1R"], fi["r1first"], fi["r1firstR"], fi["r1last"]
T, TR, Fz, FR = obs[:, j].sum(), obs[:, jr].sum(), obs[:, jf].sum(), obs[:, jfr].sum()
dec = dict(all=dict(n=int(T), right=round(float(TR / T), 4)),
           sum_cord_first_of_group=dict(n=int(Fz), right=round(float(FR / Fz), 4)),
           excluding_first_of_group=dict(n=int(T - Fz), right=round(float((TR - FR) / (T - Fz)), 4)),
           sum_cord_last_of_group=int(obs[:, jl].sum()))
for k, N in NUL.items():
    t, tr, f, fr = N[:, :, j].sum(1), N[:, :, jr].sum(1), N[:, :, jf].sum(1), N[:, :, jfr].sum(1)
    dec["null_" + k] = dict(first_of_group_n=round(float(f.mean()), 1), first_right=round(float((fr / np.maximum(f, 1)).mean()), 3),
                            excl_first_right=round(float(((tr - fr) / (t - f)).mean()), 4),
                            excl_first_right_sd=round(float(((tr - fr) / (t - f)).std()), 4))
# bootstrap CI for excluding-first
rng = np.random.default_rng(5); ks = np.nonzero(obs[:, j] > 0)[0]; bs = []
for _ in range(4000):
    s = rng.choice(ks, len(ks))
    bs.append((obs[s, jr].sum() - obs[s, jfr].sum()) / (obs[s, j].sum() - obs[s, jf].sum()))
dec["excluding_first_bootstrap_95"] = [round(float(np.percentile(bs, 2.5)), 4), round(float(np.percentile(bs, 97.5)), 4)]
H["r1_first_of_group"] = dec
out["handedness"] = H
# relation 4 detail
out["r4_detail"] = dict(obs=int(obs[:, fi["r4"]].sum()), big_gt10=int(obs[:, fi["r4big"]].sum()), minus=int(obs[:, fi["r4minus"]].sum()),
                        null_a0_big=round(float(NUL["a0"][:, :, fi["r4big"]].sum(1).mean()), 1),
                        null_a_big=round(float(NUL["a"][:, :, fi["r4big"]].sum(1).mean()), 1),
                        null_c_big=round(float(NUL["c"][:, :, fi["r4big"]].sum(1).mean()), 1),
                        null_c_all=round(float(NUL["c"][:, :, fi["r4"]].sum(1).mean()), 1),
                        p_big_null_c=float((1 + (NUL["c"][:, :, fi["r4big"]].sum(1) >= obs[:, fi["r4big"]].sum()).sum()) / (R + 1)))
json.dump(out, open(OUT / "sig_summary.json", "w"), indent=1, default=str)
print(json.dumps(out, indent=1, default=str))

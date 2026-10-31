#!/usr/bin/env python3
"""Build the multi-layer khipu graph and null-calibrate each layer.

Layer 1  rare shared values: each khipu -> set of cord values >= 10 (all levels), weight
         idf(v) = -log(df(v)/N).  Pair score = IDF-weighted cosine of the binary sets.
         Null: all value tokens (>=10) permuted across the corpus (each khipu keeps its token
         count), 5 shuffles; threshold = 99.9th pct of the null *within the pair's size stratum*
         (log2 bins of the two set sizes).  Also an empirical p per pair within stratum.
Layer 1b same, level-1 (pendant/top) values only.
Layer 2  exact runs from public/data/stories/links.json (already shuffle-baselined).
Layer 3  structural profile cosine (standardised features); null = every feature column
         permuted independently across khipus (5 shuffles), global 99.9th pct.
Layer 4  metadata pair attributes (not thresholded; used for interpretation and prediction).

Writes OUT/layers.npz and OUT/meta.json.
"""
from __future__ import annotations
import collections, json, math
import numpy as np
from graph_common import *

rng = np.random.default_rng(20260922)
import sys
NULL_KIND = sys.argv[1] if len(sys.argv) > 1 else "magnitude"  # or "corpus"
print("layer-1 null:", NULL_KIND)
ks = load()
ids = [k["id"] for k in ks]
N = len(ks)
idx = {x: i for i, x in enumerate(ids)}


# ---------- layer 1: rare values ----------
def tokens(k, lvl1_only):
    if k["id"] in NOVALUE:
        return []
    return [c.get("value") or 0 for c in k["cords"]
            if (c["level"] == 1 or not lvl1_only) and (c.get("value") or 0) >= 10]


def value_layer(lvl1_only):
    toks = [tokens(k, lvl1_only) for k in ks]

    def score(tok_lists):
        sets = [set(t) for t in tok_lists]
        vocab = sorted(set().union(*sets))
        vi = {v: j for j, v in enumerate(vocab)}
        M = np.zeros((N, len(vocab)), dtype=np.float32)
        for i, s in enumerate(sets):
            for v in s:
                M[i, vi[v]] = 1
        df = M.sum(0)
        idf = -np.log(df / N)
        W = M * idf
        W2 = M * idf ** 2
        shared = W @ W.T if False else (M * idf) @ (M * idf).T  # sum of idf^2 over shared
        norm = np.sqrt(np.diag(shared))
        with np.errstate(divide="ignore", invalid="ignore"):
            cos = shared / np.outer(norm, norm)
        cos = np.nan_to_num(cos)
        np.fill_diagonal(cos, 0)
        sizes = np.array([len(s) for s in sets])
        return cos, sizes

    obs, sizes = score(toks)
    # null
    flat = np.array([v for t in toks for v in t])
    lens = [len(t) for t in toks]
    nulls = []
    # magnitude-matched null: tokens permuted across the corpus only within one of 60
    # quantile bins of value, so each khipu keeps its magnitude profile but loses exact identities
    binof = np.round(np.log(np.maximum(flat, 1)) / np.log(1.1)).astype(int)  # ~±5% magnitude bins
    for s in range(21):
        if NULL_KIND == "corpus":
            perm = rng.permutation(flat)
        else:
            perm = flat.copy()
            for b in np.unique(binof):
                m = np.where(binof == b)[0]
                perm[m] = flat[rng.permutation(m)]
        out, pos = [], 0
        for L in lens:
            out.append(list(perm[pos:pos + L])); pos += L
        nc, nsz = score(out)
        nulls.append((nc, nsz))
    return obs, sizes, nulls


def stratum(sa, sb):
    a, b = np.minimum(sa, sb), np.maximum(sa, sb)
    ba = np.clip(np.floor(np.log2(np.maximum(a, 1))), 0, 9).astype(int)
    bb = np.clip(np.floor(np.log2(np.maximum(b, 1))), 0, 9).astype(int)
    return ba * 10 + bb


iu = np.triu_indices(N, 1)


def calibrate(obs, sizes, nulls):
    st_obs = stratum(sizes[iu[0]], sizes[iu[1]])
    o = obs[iu]
    pool = collections.defaultdict(list)
    for nc, nsz in nulls:
        st = stratum(nsz[iu[0]], nsz[iu[1]])
        v = nc[iu]
        for s in np.unique(st):
            pool[s].append(v[st == s])
    thr = np.full(o.shape, np.inf)
    pval = np.ones(o.shape)
    thr_by = {}
    for s in np.unique(st_obs):
        if s not in pool:
            continue
        nv = np.sort(np.concatenate(pool[s]))
        t = np.quantile(nv, 0.999)
        thr_by[int(s)] = (float(t), len(nv), float(nv.mean()), float(nv.std()))
        m = st_obs == s
        thr[m] = t
        # empirical p (+1 smoothing)
        pval[m] = (len(nv) - np.searchsorted(nv, o[m], side="left") + 1) / (len(nv) + 1)
    valid = sizes[iu[0]].astype(bool) & sizes[iu[1]].astype(bool)
    edge = (o > thr) & (o > 0) & valid
    return edge, pval, thr, thr_by


res = {}
for name, l1 in (("all", False), ("l1", True)):
    obs, sizes, nulls = value_layer(l1)
    edge, pval, thr, thr_by = calibrate(obs, sizes, nulls[:5])
    # pair-matched null: each pair's own null mean/sd over shuffles 1..20 (the pair keeps its two
    # magnitude profiles); z_obs vs z of held-out shuffle 0; FDR 5% threshold on z
    NS = np.array([nc[iu] for nc, _ in nulls[1:]])
    mu, sd = NS.mean(0), NS.std(0) + 0.02
    z = (obs[iu] - mu) / sd
    z0 = (nulls[0][0][iu] - mu) / sd
    valid = (sizes[iu[0]] > 0) & (sizes[iu[1]] > 0)
    z = np.where(valid, z, 0); z0 = np.where(valid, z0, 0)
    zthr = np.inf
    for t in np.arange(3, 30, 0.25):
        o_ = (z >= t).sum(); e_ = (z0 >= t).sum()
        if o_ > 0 and e_ / o_ <= 0.05:
            zthr = t; break
    ez = z >= zthr
    print(f"layer1[{name}] pair-matched z: thr {zthr}; edges {ez.sum()}; null(shuffle0) above thr {(z0>=zthr).sum()}; for t in 4,6,8,10 obs/null:", [( int((z>=t).sum()), int((z0>=t).sum())) for t in (4,6,8,10)])
    # how many null pairs exceed threshold, per shuffle (false-edge estimate)
    fe = []
    for nc, nsz in nulls:
        st = stratum(nsz[iu[0]], nsz[iu[1]])
        tt = np.array([thr_by.get(int(s), (np.inf,))[0] for s in st])
        fe.append(int(((nc[iu] > tt) & (nc[iu] > 0)).sum()))
    res[name] = dict(cos=obs[iu], edge=edge, p=pval, sizes=sizes, z=z, ez=ez)
    print(f"layer1[{name}]: edges {edge.sum()}  null false-edges per shuffle {fe} mean {np.mean(fe):.1f} sd {np.std(fe):.1f}")

# ---------- layer 1r: shared rare values (df <= KMAX), IDF-weighted, FDR-calibrated ----------
KMAX = 5
def rare_score(tok_lists):
    where = collections.defaultdict(set)
    for i, t in enumerate(tok_lists):
        for v in set(t):
            where[v].add(i)
    W = np.zeros((N, N)); C = np.zeros((N, N))
    for v, s in where.items():
        if 2 <= len(s) <= KMAX:
            w = -math.log(len(s) / N)
            s = sorted(s)
            for a_ in range(len(s)):
                for b_ in range(a_ + 1, len(s)):
                    W[s[a_], s[b_]] += w; C[s[a_], s[b_]] += 1
    return W[iu], C[iu]

toks_all = [tokens(k, False) for k in ks]
Wr, Cr = rare_score(toks_all)
flat = np.array([v for t in toks_all for v in t]); lens = [len(t) for t in toks_all]
binof = np.round(np.log(flat) / np.log(1.1)).astype(int)
null_scores = []
for s_ in range(20):
    perm = flat.copy()
    for b_ in np.unique(binof):
        m = np.where(binof == b_)[0]; perm[m] = flat[rng.permutation(m)]
    out, pos = [], 0
    for L in lens:
        out.append(list(perm[pos:pos + L])); pos += L
    null_scores.append(np.sort(rare_score(out)[0])[::-1][:2000])
null_scores = np.array(null_scores)
# FDR: smallest threshold t with E_null[#pairs >= t] / #obs pairs >= t <= 0.05
cands = np.sort(np.unique(Wr[Wr > 0]))
thr_r = np.inf
for t in cands:
    o = (Wr >= t).sum(); e = (null_scores >= t).sum(1).mean()
    if e / o <= 0.05:
        thr_r = t; break
e_r = Wr >= thr_r
en = (null_scores >= thr_r).sum(1)
print(f"layer1r (df<={KMAX} shared, IDF sum, ±5% magnitude null x20): thr {thr_r:.2f}; edges {e_r.sum()}; null pairs above thr mean {en.mean():.2f} sd {en.std():.2f}; null max-pair score mean {null_scores[:,0].mean():.1f} sd {null_scores[:,0].std():.1f}")
for t in (10, 15, 20, 25, 30, 40):
    print(f"   score>={t}: obs {(Wr>=t).sum()}  null {(null_scores>=t).sum(1).mean():.2f}±{(null_scores>=t).sum(1).std():.2f}")

# ---------- layer 2: exact runs ----------
scan = scan_pairs()
run_long = np.zeros(len(iu[0])); run_n = np.zeros(len(iu[0]))
pairpos = {(int(a), int(b)): n for n, (a, b) in enumerate(zip(*iu))}
for (a, b), p in scan.items():
    i, j = sorted((idx[a], idx[b]))
    run_long[pairpos[(i, j)]] = p["longest"]; run_n[pairpos[(i, j)]] = p["runs"]

# ---------- layer 3: structure ----------
FAM = ["W", "B", "G", "R", "Y", "K", "?"]
feat_names = []
F = []
for k in ks:
    cs = k["cords"]; l1 = [c for c in cs if c["level"] == 1]
    n = max(len(cs), 1); n1 = max(len(l1), 1)
    gs = [g["n"] for g in k.get("groups") or []]
    gh = np.zeros(8)
    for g in gs:
        gh[min(g, 8) - 1 if g >= 1 else 0] += g
    gh = gh / max(sum(gs), 1)
    fam = collections.Counter(colour_family(c.get("color") or "") for c in l1)
    fv = [fam.get(f, 0) / n1 for f in FAM]
    fv[-1] += sum(v for f, v in fam.items() if f not in FAM) / n1
    multi = sum(1 for c in l1 if any(ch in (c.get("color") or "") for ch in ":-/")) / n1
    kt = collections.Counter(kn["type"] for c in cs for kn in c.get("knots") or [])
    nk = max(sum(kt.values()), 1)
    ktv = [kt.get("S", 0) / nk, kt.get("L", 0) / nk, kt.get("E", 0) / nk, 1 - (kt.get("S", 0) + kt.get("L", 0) + kt.get("E", 0)) / nk]
    at = collections.Counter(c.get("attach") for c in l1)
    atv = [at.get(x, 0) / n1 for x in "URVT"]
    tw = collections.Counter(c.get("twist") for c in cs)
    twv = [tw.get("S", 0) / n, tw.get("Z", 0) / n]
    sub = sum(1 for c in cs if c["level"] > 1) / n
    zero = sum(1 for c in l1 if not (c.get("value") or 0)) / n1
    row = [math.log1p(len(l1)), math.log1p(len(gs)), sub, zero, multi] + list(gh) + fv + ktv + atv + twv
    F.append(row)
if not feat_names:
    feat_names = ["logL1", "logGroups", "subFrac", "zeroFrac", "multiColour"] + [f"g{i+1}" for i in range(8)] + [f"col{f}" for f in FAM] + ["kS", "kL", "kE", "kOther"] + [f"at{x}" for x in "URVT"] + ["twS", "twZ"]
F = np.array(F, dtype=float)
Z = (F - F.mean(0)) / (F.std(0) + 1e-9)


def cosmat(Z):
    nz = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    return nz @ nz.T

S3 = cosmat(Z)[iu]
null3 = []
for s in range(5):
    Zp = np.column_stack([rng.permutation(Z[:, j]) for j in range(Z.shape[1])])
    null3.append(cosmat(Zp)[iu])
null3 = np.concatenate(null3)
thr3 = np.quantile(null3, 0.999)
edge3 = S3 > thr3
print(f"layer3: null mean {null3.mean():.3f} sd {null3.std():.3f} thr99.9 {thr3:.3f}; edges {edge3.sum()} (expected under null {0.001*len(S3):.0f})")

# ---------- layer 4: metadata ----------
provs = [prov(k) for k in ks]
insts = [institution(k) for k in ks]
contr = [k.get("contributors") or "" for k in ks]
acc = [accession_num(k) for k in ks]
al = [alias_nums(k) for k in ks]
I, J = iu
same_prov = np.array([provs[i] is not None and provs[i] == provs[j] for i, j in zip(I, J)])
same_inst = np.array([insts[i] != "" and insts[i] == insts[j] for i, j in zip(I, J)])
same_contr = np.array([contr[i] == contr[j] and contr[i] != "" for i, j in zip(I, J)])
def accd(i, j):
    a, b = acc[i], acc[j]
    if a is None or b is None or insts[i] != insts[j] or a[0] != b[0]:
        return 1e9
    return abs(a[1] - b[1])
acc_d = np.array([accd(i, j) for i, j in zip(I, J)], dtype=float)
def alid(i, j):
    best = 1e9
    for s, n in al[i].items():
        if s in al[j]:
            best = min(best, abs(n - al[j][s]))
    return best
alias_d = np.array([alid(i, j) for i, j in zip(I, J)], dtype=float)

np.savez_compressed(OUT / "layers.npz", I=I, J=J,
                    cos_all=res["all"]["cos"], e_all=res["all"]["edge"], p_all=res["all"]["p"],
                    cos_l1=res["l1"]["cos"], e_l1=res["l1"]["edge"], p_l1=res["l1"]["p"],
                    size_all=res["all"]["sizes"], size_l1=res["l1"]["sizes"],
                    run_long=run_long, z_all=res["all"]["z"], ez_all=res["all"]["ez"], z_l1=res["l1"]["z"], ez_l1=res["l1"]["ez"], rare_w=Wr, rare_c=Cr, e_r=e_r, run_n=run_n, s3=S3, e3=edge3,
                    same_prov=same_prov, same_inst=same_inst, same_contr=same_contr,
                    acc_d=acc_d, alias_d=alias_d, F=F)
json.dump(dict(thr_r=float(thr_r), ids=ids, provs=provs, insts=insts, contr=contr, feat_names=feat_names, thr3=float(thr3)),
          open(OUT / "meta.json", "w"))

# positive-control recall per layer
cur = curated_pairs()
sc = set(scan)
print("curated pairs:", len(cur))
for name, e in (("L1all", res["all"]["edge"]), ("L1lvl1", res["l1"]["edge"]), ("L1zAll", res["all"]["ez"]), ("L1zL1", res["l1"]["ez"]), ("L1rare", e_r), ("L2runs", run_long > 0), ("L3struct", edge3)):
    hits = []
    for a, b in sorted(cur):
        i, j = sorted((idx[a], idx[b]))
        hits.append(bool(e[pairpos[(i, j)]]))
    print(f"  {name}: recall {sum(hits)}/{len(hits)} = {np.mean(hits):.2f}; edges total {int(e.sum())}")

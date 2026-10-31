#!/usr/bin/env python3
"""(e) Order-free rare-value sharing: an IDF-weighted link screen (densify links).

Each khipu -> SET of values >= 10 on any cord level (pendants, tops, subsidiaries).  Weight of value v:
w_v = log(N / df_v) (information content); values with df_v > 40 get 0.
S(A,B) = sum_{v in A&B} w_v.  Analytic independence expectation with token frequency p_v = df_v / T:
E = 0.5*(|B| sum_{v in A} w_v p_v + |A| sum_{v in B} w_v p_v), Var likewise with w^2;  score = S - E (excess shared information, nats).
Null: magnitude-preserving corpus shuffle (tokens permuted among tokens of the same ~26% magnitude bin,
so each khipu keeps its set size AND magnitude profile; duplicates dropped); E is magnitude-aware too, 20 reps -> count of pairs above each z threshold (FDR estimate).
Positive controls: curated links (vocab_common.KNOWN).  Unlike the exact-run scan this ignores order,
so it can see reordered copies, summaries that reuse subsidiary values, and partial copies.
"""
from __future__ import annotations
import collections, json
import numpy as np
import vocab_common as vc

rng = np.random.default_rng(99)
ks = [k for k in vc.load() if k["id"] not in vc.EXCLUDE]
ids = [k["id"] for k in ks]; meta = {k["id"]: k for k in ks}
sets = [sorted({int(c["value"]) for c in k["cords"] if (c.get("value") or 0) >= 10}) for k in ks]
N = len(ks)

def binof(v):
    return int(np.floor(np.log10(v) / 0.1))  # ~26%-wide magnitude bins

def scores(sets):
    vocab = sorted({v for s in sets for v in s}); ix = {v: i for i, v in enumerate(vocab)}
    A = np.zeros((N, len(vocab)), np.float32)
    for i, s in enumerate(sets):
        A[i, [ix[v] for v in s]] = 1
    df = A.sum(0)
    w = np.where(df <= 40, np.log(N / df), 0).astype(np.float32)
    bins = np.array([binof(v) for v in vocab]); ub = np.unique(bins); bi = np.searchsorted(ub, bins)
    B = np.zeros((len(vocab), len(ub)), np.float32); B[np.arange(len(vocab)), bi] = 1
    Tb = df @ B  # tokens per magnitude bin
    p = df / Tb[bi]  # P(a random token of v's bin is v)
    S = (A * w) @ A.T
    nb = A @ B  # khipu x bin token counts
    M = (A * (w * p)) @ B  # khipu x bin: sum of w*p of its values in that bin
    E = 0.5 * (M @ nb.T + nb @ M.T)  # magnitude-aware independence expectation
    Z = S - E  # excess shared information (nats)
    np.fill_diagonal(Z, -np.inf)
    return Z, S, vocab, w

Z, S, vocab, w = scores(sets)
iu = np.triu_indices(N, 1); z = Z[iu]
order = np.argsort(-z)
# shuffled corpora
tokens = np.array([v for s in sets for v in s]); sizes = [len(s) for s in sets]
thr = [10, 15, 20, 25, 30, 40, 60]
nullcounts = []; nullmax = []
for r in range(20):
    # magnitude-preserving shuffle: tokens permuted only among tokens of the same magnitude bin
    t = tokens.copy(); tb = np.array([binof(v) for v in tokens])
    for b in np.unique(tb):
        m = np.where(tb == b)[0]; t[m] = t[rng.permutation(m)]
    out = []; o = 0
    for n in sizes: out.append(sorted(set(t[o:o + n].tolist()))); o += n
    Zs = scores(out)[0][iu]
    nullcounts.append([(Zs > x).sum() for x in thr]); nullmax.append(Zs.max())
nullcounts = np.array(nullcounts)
print("pairs above excess:  thr  observed  shuffled mean  (FDR est)")
for j, x in enumerate(thr):
    ob = (z > x).sum(); print(f"   {x:4d} {ob:8d} {nullcounts[:, j].mean():10.1f}  {nullcounts[:, j].mean()/max(ob,1):.3f}")
print(f"null max z over 20 shuffles: mean {np.mean(nullmax):.1f} max {np.max(nullmax):.1f}")
# positive controls
rank = {}
for r_, k in enumerate(order):
    a, b = ids[iu[0][k]], ids[iu[1][k]]; rank[tuple(sorted((a, b)))] = (r_ + 1, z[k])
known = [p for p in vc.KNOWN if p[0] in rank or tuple(sorted(p)) in rank]
kr = [rank[p] for p in vc.KNOWN if p in rank]
print(f"\ncurated positive controls usable: {len(kr)}/{len(vc.KNOWN)}")
for t in (50, 100, 300, 1000, 2330):
    print(f"  recall in top {t:5d} pairs: {sum(r <= t for r, _ in kr)}/{len(kr)}")
for p in sorted(vc.KNOWN):
    if p in rank: print(f"   {p} rank={rank[p][0]} z={rank[p][1]:.1f}")
known_all = vc.known_all()
nullthr = 20.0  # FDR ~0.14 by the shuffle table; null max printed above
print(f"\nNEW candidate pairs (not curated / not in exact-scan links.json), z > shuffled max ({nullthr:.1f}):")
cands = []
for k in order:
    if z[k] <= nullthr: break
    i, j = iu[0][k], iu[1][k]; a, b = ids[i], ids[j]
    if tuple(sorted((a, b))) in known_all: continue
    sh = sorted(set(sets[i]) & set(sets[j]), key=lambda v: -w[vocab.index(v)])
    ka, kb = meta[a], meta[b]
    cands.append(dict(a=a, b=b, z=float(z[k]), S=float(S[i, j]), nshared=len(sh), na=len(sets[i]), nb=len(sets[j]),
                      shared_rare=sh[:15], ra=ka["_region"], rb=kb["_region"],
                      ma=ka["museum"]["canonical"], mb=kb["museum"]["canonical"], numa=ka["museum"]["number"], numb=kb["museum"]["number"]))
for c in cands[:60]:
    print(f"  {c['a']}-{c['b']} z={c['z']:.1f} shared={c['nshared']} of {c['na']}/{c['nb']}  {c['ra']}/{c['rb']}  {c['ma'][:18] if c['ma'] else '-'}#{c['numa']} | {c['mb'][:18] if c['mb'] else '-'}#{c['numb']}  rare: {c['shared_rare'][:10]}")
print("total new candidates above null max:", len(cands))
json.dump(dict(cands=cands, known_ranks={f"{a}-{b}": rank[(a, b)] for a, b in vc.KNOWN if (a, b) in rank},
               thresholds=dict(zip(map(str, thr), nullcounts.mean(0).tolist())), nullmax=nullmax),
          open(vc.OUT / "e_links.json", "w"), indent=1, default=float)

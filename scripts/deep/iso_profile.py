#!/usr/bin/env python3
"""Alignment-free, substitution-invariant colour-template similarity between khipus.

Each khipu becomes a bag of tokens:
  w5:<pattern>  isomorph pattern of every 5-window of level-1 colours (>=3 symbols)
  w6:<pattern>  same for 6-windows
  g:<pattern>   isomorph pattern of each whole cord group (size >= 3)
  (and, as a control, the same tokens built from LITERAL colours)
TF-IDF (sublinear tf) + cosine similarity over all pairs.  Evaluation:
  AUC of curated link pairs against all other pairs (positive-control recall),
  for isomorph vs literal tokens.
Per-pair null for the top candidates: permute cords within both khipus
(composition kept, IDF fixed) 200x and z-score the observed cosine.
"""
from __future__ import annotations

import collections
import json
import math
import random

import numpy as np
from scipy.sparse import csr_matrix
from scipy.stats import rankdata

MINN = 15
TOPK = 300

from iso_common import OUT, BASEL, load, canon, curated_pairs, known_pairs


def tokens(colours, groups, iso=True):
    f = canon if iso else (lambda w: tuple(w))
    out = collections.Counter()
    for L in (5, 6):
        for i in range(len(colours) - L + 1):
            w = colours[i:i + L]
            if "?" in w or len(set(w)) < 3:
                continue
            out[f"w{L}:{f(w)}"] += 1
    g = collections.OrderedDict()
    for c, gi in zip(colours, groups):
        g.setdefault(gi, []).append(c)
    for cs in g.values():
        if len(cs) >= 3 and "?" not in cs and len(set(cs)) >= 2:
            out[f"g:{f(cs)}"] += 1
    return out


def build(ks, iso):
    toks = [tokens(k["colour"], k["group"], iso) for k in ks]
    vocab = {}
    for t in toks:
        for w in t:
            vocab.setdefault(w, len(vocab))
    df = np.zeros(len(vocab))
    for t in toks:
        for w in t:
            df[vocab[w]] += 1
    idf = np.log(len(ks) / df)
    return toks, vocab, idf


def vec(t, vocab, idf):
    v = {}
    for w, c in t.items():
        j = vocab.get(w)
        if j is not None and idf[j] > 0:
            v[j] = (1 + math.log(c)) * idf[j]
    n = math.sqrt(sum(x * x for x in v.values())) or 1
    return {j: x / n for j, x in v.items()}


def cos(u, v):
    if len(u) > len(v):
        u, v = v, u
    return sum(x * v.get(j, 0) for j, x in u.items())


def matrix(vs, V):
    rows, cols, data = [], [], []
    for i, v in enumerate(vs):
        for j, x in v.items():
            rows.append(i); cols.append(j); data.append(x)
    M = csr_matrix((data, (rows, cols)), shape=(len(vs), V))
    return (M @ M.T).toarray()


def auc(S, ids, pos):
    n = len(ids)
    iu = np.triu_indices(n, 1)
    s = S[iu]
    idx = {k: i for i, k in enumerate(ids)}
    lab = np.zeros(len(s), bool)
    pmap = {(min(idx[a], idx[b]), max(idx[a], idx[b])) for a, b in pos if a in idx and b in idx}
    flat = {(i, j): t for t, (i, j) in enumerate(zip(*iu))}
    for p in pmap:
        lab[flat[p]] = True
    r = rankdata(s)
    npos = lab.sum()
    a = (r[lab].sum() - npos * (npos + 1) / 2) / (npos * (len(s) - npos))
    ranks = len(s) - r[lab] + 1
    return a, npos, np.sort(ranks)


def main():
    ks = load()
    ids = [k["id"] for k in ks]
    cur = {p for p in curated_pairs() if not (set(p) & BASEL)}
    known = known_pairs()
    rng = random.Random(5)
    res = {}
    for iso in (True, False):
        toks, vocab, idf = build(ks, iso)
        vs = [vec(t, vocab, idf) for t in toks]
        S = matrix(vs, len(vocab))
        np.fill_diagonal(S, 0)
        a, npos, ranks = auc(S, ids, cur)
        tag = "iso" if iso else "literal"
        res[tag] = {"auc": a, "npos": int(npos), "median_rank": float(np.median(ranks)),
                    "top100": int((ranks <= 100).sum()), "top1000": int((ranks <= 1000).sum())}
        print(tag, res[tag])
        if iso:
            S_iso, toks_iso, vocab_iso, idf_iso = S, toks, vocab, idf
        else:
            S_lit = S
    # top novel iso pairs where iso similarity is high but literal is not the driver
    n = len(ids)
    iu = np.triu_indices(n, 1)
    kid = {k["id"]: k for k in ks}
    elig = np.array([kid[x]["n"] >= MINN for x in ids])
    m = elig[iu[0]] & elig[iu[1]]
    a2, n2, r2 = auc(S_iso[np.ix_(elig, elig)], [x for x, e in zip(ids, elig) if e], cur)
    a3, n3, r3 = auc(S_lit[np.ix_(elig, elig)], [x for x, e in zip(ids, elig) if e], cur)
    res["eligible"] = {"minn": MINN, "n_khipus": int(elig.sum()), "auc_iso": a2, "auc_lit": a3, "npos": int(n2),
                       "iso_ranks_of_curated": r2.tolist()}
    print("eligible", res["eligible"])
    cand_idx = [t for t in np.argsort(-S_iso[iu]) if m[t]][:TOPK]
    # curated pairs too, to calibrate z
    idx = {x: i for i, x in enumerate(ids)}
    flat = {(i, j): t for t, (i, j) in enumerate(zip(*iu))}
    cur_idx = [flat[(min(idx[a], idx[b]), max(idx[a], idx[b]))] for a, b in cur if a in idx and b in idx]
    cand = []
    for t in list(dict.fromkeys(cand_idx + cur_idx)):
        i, j = iu[0][t], iu[1][t]
        a, b = ids[i], ids[j]
        obs = S_iso[i, j]
        # within-khipu permutation null (both khipus), IDF fixed
        null = []
        for _ in range(200):
            ca, cb = kid[a]["colour"][:], kid[b]["colour"][:]
            rng.shuffle(ca); rng.shuffle(cb)
            va = vec(tokens(ca, kid[a]["group"]), vocab_iso, idf_iso)
            vb = vec(tokens(cb, kid[b]["group"]), vocab_iso, idf_iso)
            null.append(cos(va, vb))
        null = np.array(null)
        shared = sorted(set(toks_iso[i]) & set(toks_iso[j]), key=lambda w: -idf_iso[vocab_iso[w]])[:4]
        cand.append({"a": a, "b": b, "iso": round(float(obs), 3), "literal": round(float(S_lit[i, j]), 3),
                     "null_mean": round(float(null.mean()), 3), "null_sd": round(float(null.std()), 3),
                     "z": round(float((obs - null.mean()) / (null.std() or 1e-9)), 1),
                     "known": (a, b) in known or bool({a, b} & BASEL), "curated": (a, b) in cur,
                     "shared_rare": shared,
                     "n": (kid[a]["n"], kid[b]["n"]), "museum": (kid[a]["museum"][:30], kid[b]["museum"][:30]),
                     "prov": (kid[a]["prov"][:25], kid[b]["prov"][:25])})
    cand.sort(key=lambda c: -c["z"])
    for c in cand:
        if c["z"] > 6 or c["curated"]:
            print(c["a"], c["b"], "iso", c["iso"], "lit", c["literal"], "null %.3f±%.3f z %.1f" % (c["null_mean"], c["null_sd"], c["z"]),
                  "KNOWN" if c["known"] else "", "CUR" if c["curated"] else "", c["n"], c["prov"], c["shared_rare"][:2])
    cz = [c["z"] for c in cand if c["curated"]]
    print("curated z: median", np.median(cz), "n>=5:", sum(z >= 5 for z in cz), "of", len(cz))
    res["candidates"] = cand
    (OUT / "iso_profile.json").write_text(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()

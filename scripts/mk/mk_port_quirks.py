#!/usr/bin/env python3
"""
Quantify method choices in the Medrano & Khosla relation searches that inflate or
deflate counts, and put Table 1 counts against shuffle nulls.  Runs on OUR corpus
(public/data/khipus, all 684) using the faithful port in mk_port_relations.

Nulls (values only move; cord order, clusters, colours, top flags, subsidiaries fixed):
  global  : permute level-1 cord values within the khipu
  cluster : permute level-1 cord values within each cluster (keeps cluster magnitudes)
For each null we count instances and khipus with >= 1 instance.

Writes $S/out/mk_port_quirks.json
"""
from __future__ import annotations

import json
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mk_port_relations as M  # noqa: E402

OUT = M.SCRATCH / "out"
NSHUF = int(sys.argv[1]) if len(sys.argv) > 1 else 20


def load():
    pks = {}
    for f in sorted(M.DATA.glob("KH*.json")):
        k = json.loads(f.read_text())
        pks[k["id"]] = M.prepare(k)
    return pks


def gap_stats(pks, rows):
    """distance (in summation order) between the sum cord and its nearest summand."""
    gaps = []
    for x in rows:
        pk = pks[x["khipu"]]
        pos = {c.name: i for i, c in enumerate(pk.l1)}
        s = pos[x["sum_cord"]]
        ps = [pos[n] for n in x["summands"]]
        gaps.append(min(abs(p - s) for p in ps) - 1)
    g = np.array(gaps)
    return {"n": len(g), "adjacent": int((g == 0).sum()), "gap_le_2": int((g <= 2).sum()),
            "median_gap": float(np.median(g)), "gap_gt_10": int((g > 10).sum())}


def pps_no_abandon(pk):
    """Relation 1 but the search keeps sliding after a single-cord match instead of giving up."""
    vals = [c.v for c in pk.l1]
    n = len(vals)
    extra = 0
    base = {x["sum_cord"] for x in M.pendant_pendant_sum(pk)}
    for direction in (1, -1):
        v = vals if direction == 1 else vals[::-1]
        pre = np.concatenate([[0], np.cumsum(v)])
        for si in range(n - 2):
            t = v[si]
            if t <= 10:
                continue
            found = False
            for start in range(si + 1, n):
                if v[start] == 0:
                    continue
                ends = np.nonzero(pre[start + 1:] - pre[start] == t)[0]
                if len(ends):
                    L = ends[0] + 1
                    if L >= 2 and t > L:
                        found = True
                        break
            name = pk.l1[si if direction == 1 else n - 1 - si].name
            if found and name not in base:
                extra += 1
                base.add(name)
    return extra


def color_len2(pk):
    """Relation 2 allowing 2-summand combinations (the documented criterion)."""
    orig = M._find_matches_ge3

    def ge2(s, test):
        test = [c for c in test if c.v > 0]
        res = []
        for m in M._contiguous_matches(s.v, test, 2, min(len(test) + 1, 250)):
            if s.v > 1 or len(m) > 1:
                res.append((s, m))
        return res
    M._find_matches_ge3 = ge2
    try:
        return M.pendant_pendants_color_sum(pk)
    finally:
        M._find_matches_ge3 = orig


def color_killed(pk):
    """sum cords that had a good match but were erased by a later trivial match."""
    killed = 0
    for p in pk.l1:
        if p.v <= 10:
            continue
        same = [c for c in pk.in_cluster if c.color == p.color]
        if p not in same:
            continue
        pos = same.index(p)
        for side in (same[:pos], same[pos + 1:]):
            ms = M._find_matches_ge3(p, side) if side else []
            good = [m for s, m in ms if not (p.v <= len(m))]
            triv = [m for s, m in ms if p.v <= len(m)]
            if good and triv:
                killed += 1
    return killed


def shuffled(pk, mode, rng):
    vals = {}
    if mode == "global":
        cs = [c for c in pk.l1]
        v = [c.v for c in cs]
        rng.shuffle(v)
        vals = {id(c): x for c, x in zip(cs, v)}
    else:
        for cl in pk.clusters:
            v = [c.v for c in cl]
            rng.shuffle(v)
            vals.update({id(c): x for c, x in zip(cl, v)})
    saved = {id(c): c.v for c in pk.l1}
    for c in pk.l1:
        c.v = vals.get(id(c), c.v)
    return saved


def restore(pk, saved):
    for c in pk.l1:
        c.v = saved[id(c)]


NULL_RELS = ["pendant_pendant_sum", "pendant_pendants_color_sum", "indexed_pendant_sum",
             "subsidiary_pendant_sum", "cluster_sum_bands", "sum_top_cords"]


def main():
    pks = load()
    rep = {}
    obs = {r: [x for pk in pks.values() for x in M.RELATIONS[r](pk)] for r in M.RELATIONS}

    # --- relation 1 quirks
    r1 = obs["pendant_pendant_sum"]
    zero_inst = sum(1 for x in r1 if 0 in x["summand_values"])
    zero_cords = sum(x["summand_values"].count(0) for x in r1)
    all_cords = sum(len(x["summand_values"]) for x in r1)
    rep["r1"] = {"instances": len(r1), "with_zero_summand": zero_inst, "zero_summand_cords": zero_cords,
                 "summand_cords": all_cords, "gap": gap_stats(pks, r1),
                 "summands_hist": Counter(min(x["num_summands"], 10) for x in r1),
                 "extra_if_no_abandon": sum(pps_no_abandon(pk) for pk in pks.values())}
    # --- relation 2 quirks
    r2 = obs["pendant_pendants_color_sum"]
    r2b = [x for pk in pks.values() for x in color_len2(pk)]
    rep["r2"] = {"instances": len(r2), "instances_if_len2_allowed": len(r2b),
                 "khipus": len({x["khipu"] for x in r2}), "khipus_if_len2": len({x["khipu"] for x in r2b}),
                 "sum_cords_killed_by_trivial": sum(color_killed(pk) for pk in pks.values()),
                 "gap": gap_stats(pks, r2)}
    # --- relation 5: parent pendant used as its own summand
    r5 = obs["subsidiary_pendant_sum"]
    rep["r5"] = {"instances": len(r5), "parent_in_summands": sum(1 for x in r5 if x["parent"] in x["summands"])}
    # --- relation 9 quirks
    st = obs["sum_top_cords"]
    ds = obs["double_sum_top_cords"]
    rep["r9"] = {
        "sum": len(st), "sum_exact": sum(x["exact"] for x in st),
        "sum_value_lt10": sum(x["value"] < 10 for x in st),
        "sum_obo_value_lt10": sum((not x["exact"]) and x["value"] < 10 for x in st),
        "double": len(ds), "double_exact": sum(x["exact"] for x in ds),
        "double_is_half": sum(x["value"] * 2 <= x["summand_value"] + 1 for x in ds),
        "double_top_equals_summand": sum(x["value"] == x["summand_value"] for x in ds),
        "clusters_in_both": sum(1 for x in ds for y in st if x["khipu"] == y["khipu"] and x["cluster"] == y["cluster"]),
    }
    # null for relation 9: compare each single-cord top cluster with the cluster TWO away
    # (non-adjacent) under the same off-by-one rule
    hits = trials = 0
    for pk in pks.values():
        C = pk.clusters
        for ci, cl in enumerate(C):
            if len(cl) == 1 and pk.is_top_cluster(ci) and cl[0].v > 0:
                for cj in (ci - 2, ci + 2, ci - 3, ci + 3):
                    if 0 <= cj < len(C) and not pk.is_top_cluster(cj):
                        trials += 1
                        hits += M._sums_match(cl, C[cj])[0]
    adj_hits = adj_trials = 0
    for pk in pks.values():
        C = pk.clusters
        for ci, cl in enumerate(C):
            if len(cl) == 1 and pk.is_top_cluster(ci) and cl[0].v > 0:
                for cj in (ci - 1, ci + 1):
                    if 0 <= cj < len(C) and not pk.is_top_cluster(cj):
                        adj_trials += 1
                        adj_hits += M._sums_match(cl, C[cj])[0]
    rep["r9"]["adjacent_match_rate"] = [adj_hits, adj_trials]
    rep["r9"]["nonadjacent_match_rate"] = [hits, trials]

    # --- shuffle nulls
    rng = random.Random(7)
    null = {m: {r: {"inst": [], "khipus": []} for r in NULL_RELS} for m in ("global", "cluster")}
    for mode in ("global", "cluster"):
        for it in range(NSHUF):
            cnt = Counter()
            ks = {r: set() for r in NULL_RELS}
            for kid, pk in pks.items():
                saved = shuffled(pk, mode, rng)
                for r in NULL_RELS:
                    rows = M.RELATIONS[r](pk)
                    cnt[r] += len(rows)
                    if rows:
                        ks[r].add(kid)
                restore(pk, saved)
            for r in NULL_RELS:
                null[mode][r]["inst"].append(cnt[r])
                null[mode][r]["khipus"].append(len(ks[r]))
            print(mode, it, dict(cnt), flush=True)
    rep["null"] = {}
    for r in NULL_RELS:
        o_i = len(obs[r])
        o_k = len({x["khipu"] for x in obs[r]})
        d = {"observed_instances": o_i, "observed_khipus": o_k}
        for mode in ("global", "cluster"):
            ni = np.array(null[mode][r]["inst"])
            nk = np.array(null[mode][r]["khipus"])
            d[mode] = {"inst_mean": float(ni.mean()), "inst_sd": float(ni.std()),
                       "khipus_mean": float(nk.mean()), "khipus_sd": float(nk.std()),
                       "p_inst": float(((ni >= o_i).sum() + 1) / (len(ni) + 1))}
        rep["null"][r] = d
    (OUT / "mk_port_quirks.json").write_text(json.dumps(rep, indent=1, default=str))
    print(json.dumps({k: v for k, v in rep.items()}, indent=1, default=str))


if __name__ == "__main__":
    main()

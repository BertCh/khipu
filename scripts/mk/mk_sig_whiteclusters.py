"""Part 4: 'white starts sum clusters (41% vs 32%)' and 'sum clusters flanked by sum clusters or
knotless groups (86%)' retested with within-khipu baselines, recorder strata and value control.
Sum cluster = a pendant group holding >=2 consecutive relation-1 (or relation-2) sum cords."""
import json, collections, numpy as np
from mk_sig_common import *


def mh(tables):
    """Mantel-Haenszel OR over list of (a,b,c,d): a=exposed&case ... returns OR, n strata used"""
    num = den = 0.0; used = 0
    for a, b, c, d in tables:
        n = a + b + c + d
        if n < 2 or (a + b) == 0 or (c + d) == 0 or (a + c) == 0 or (b + d) == 0:
            continue
        num += a * d / n; den += b * c / n; used += 1
    return (num / den if den else float("nan")), used


def perm_p(stat_fn, labels_by_stratum, rng, R=2000):
    obs = stat_fn(labels_by_stratum)
    cnt = 0
    for _ in range(R):
        sh = [(rng.permutation(lab), y) for lab, y in labels_by_stratum]
        if stat_fn(sh) >= obs:
            cnt += 1
    return obs, (cnt + 1) / (R + 1)


def diff_stat(strata):
    # sum over strata of (white-first among sum clusters) - expected under within-stratum exchangeability
    s = 0.0
    for lab, y in strata:
        s += (lab * y).sum() - lab.sum() * y.mean()
    return s


def main():
    ms = load_models()
    rng = np.random.default_rng(7)
    res = {}
    for relname, fn in (("r1", rel1), ("r2", rel2)):
        rows = []  # per group: khipu, rec, is_sumcluster, white_first, firstval, first_is_sum, zero, gi
        for m in ms:
            P, G = m["P"], m["groups"]
            if len(G) < 2:
                continue
            sums = {x[0] for x in fn(m)}
            for gi, g in enumerate(G):
                inrun = any(g[j] in sums and g[j + 1] in sums for j in range(len(g) - 1))
                rows.append(dict(k=m["id"], rec=m["rec"], prov=m["prov"], sc=inrun, w=P[g[0]]["col"] == "W",
                                 fv=P[g[0]]["v"], fs=g[0] in sums, zero=sum(P[i]["v"] for i in g) == 0, gi=gi, ng=len(G)))
        sc = [r for r in rows if r["sc"]]
        allg = rows
        o = {}
        o["n_sum_clusters"] = len(sc)
        o["white_first_sumclusters"] = np.mean([r["w"] for r in sc])
        o["white_first_all_groups"] = np.mean([r["w"] for r in allg])
        ks_with = {r["k"] for r in sc}
        same = [r for r in allg if r["k"] in ks_with]
        o["white_first_nonsum_same_khipus"] = np.mean([r["w"] for r in same if not r["sc"]])
        o["white_first_nonzero_nonsum_same_khipus"] = np.mean([r["w"] for r in same if not r["sc"] and not r["zero"]])
        # MH within khipu
        byk = collections.defaultdict(list)
        for r in same:
            byk[r["k"]].append(r)
        tabs = []
        for k, rr in byk.items():
            a = sum(r["sc"] and r["w"] for r in rr); b = sum(r["sc"] and not r["w"] for r in rr)
            c = sum((not r["sc"]) and r["w"] for r in rr); d = sum((not r["sc"]) and not r["w"] for r in rr)
            tabs.append((a, b, c, d))
        o["MH_OR_within_khipu"], o["MH_strata"] = mh(tabs)
        strata = [(np.array([r["sc"] for r in rr], float), np.array([r["w"] for r in rr], float)) for rr in byk.values()]
        o["excess_white_first_within_khipu"], o["perm_p_within_khipu"] = perm_p(diff_stat, strata, rng)
        # within khipu x first-cord-value bin (nonzero groups only): controls "white pendants larger"
        def vb(v):
            return int(np.floor(np.log10(v))) if v > 0 else -1
        byk2 = collections.defaultdict(list)
        for r in same:
            if not r["zero"]:
                byk2[(r["k"], vb(r["fv"]))].append(r)
        strata2 = [(np.array([r["sc"] for r in rr], float), np.array([r["w"] for r in rr], float)) for rr in byk2.values()]
        o["excess_within_khipu_x_valuebin"], o["perm_p_within_khipu_x_valuebin"] = perm_p(diff_stat, strata2, rng)
        # within khipu x (first cord is itself a sum cord): controls "total on first cord"
        byk3 = collections.defaultdict(list)
        for r in same:
            if not r["zero"]:
                byk3[(r["k"], r["fs"], vb(r["fv"]))].append(r)
        strata3 = [(np.array([r["sc"] for r in rr], float), np.array([r["w"] for r in rr], float)) for rr in byk3.values()]
        o["excess_within_khipu_x_firstIsSum_x_valuebin"], o["perm_p_within_khipu_x_firstIsSum_x_valuebin"] = perm_p(diff_stat, strata3, rng)
        # recorder strata
        rec = {}
        for R_ in sorted({r["rec"] for r in sc}):
            s1 = [r for r in sc if r["rec"] == R_]
            s0 = [r for r in same if r["rec"] == R_ and not r["sc"] and not r["zero"]]
            st = [(np.array([r["sc"] for r in rr], float), np.array([r["w"] for r in rr], float)) for (k, _), rr in byk2.items() if rr[0]["rec"] == R_]
            ex, p = perm_p(diff_stat, st, rng, 1000) if st else (0, 1)
            rec[R_] = dict(n_sc=len(s1), white_sc=round(float(np.mean([r["w"] for r in s1])), 3),
                           white_nonsum_nonzero=round(float(np.mean([r["w"] for r in s0])), 3) if s0 else None,
                           excess_within_khipu_valuebin=round(float(ex), 1), p=round(p, 4))
        o["by_recorder"] = rec
        ink = [r for r in sc if "ncahuasi" in r["prov"]]
        o["share_sumclusters_inkawasi"] = len(ink) / len(sc)
        # top contributing khipus
        c = collections.Counter(r["k"] for r in sc if r["w"])
        o["top_khipus_white_sumcluster"] = c.most_common(6)
        # flanking: for interior groups, both neighbours same type (both zero or both nonzero)
        def flank(rr_all, pick):
            byk = collections.defaultdict(dict)
            for r in rr_all:
                byk[r["k"]][r["gi"]] = r
            both_nz = both_z = both_sc = one_sc = n = 0
            for r in rr_all:
                if not pick(r):
                    continue
                d = byk[r["k"]]
                if r["gi"] == 0 or r["gi"] + 1 >= r["ng"]:
                    continue
                L, Rr = d[r["gi"] - 1], d[r["gi"] + 1]
                n += 1
                both_nz += (not L["zero"]) and (not Rr["zero"])
                both_z += L["zero"] and Rr["zero"]
                both_sc += L["sc"] and Rr["sc"]
                one_sc += L["sc"] or Rr["sc"]
            return dict(n=n, both_nonzero=round(both_nz / n, 3), both_zero=round(both_z / n, 3),
                        paper_86pct_metric=round((both_nz + both_z) / n, 3), both_neighbours_sumclusters=round(both_sc / n, 3),
                        any_neighbour_sumcluster=round(one_sc / n, 3))
        o["flank_sumclusters"] = flank(same, lambda r: r["sc"])
        o["flank_nonsum_nonzero_same_khipus"] = flank(same, lambda r: (not r["sc"]) and not r["zero"])
        o["flank_all_nonzero_all_khipus"] = flank(allg, lambda r: not r["zero"])
        # paper's exact filter: cluster index > 4
        o["flank_sumclusters_gi_gt4"] = flank([r for r in same], lambda r: r["sc"] and r["gi"] > 4)
        # sum-cluster adjacency vs within-khipu label shuffle
        def adj_count(rr_by_k):
            t = 0
            for lab in rr_by_k:
                t += (lab[:-1] * lab[1:]).sum()
            return t
        labs = []
        for k, rr in byk.items():
            rr = sorted(rr, key=lambda r: r["gi"])
            labs.append(np.array([r["sc"] for r in rr], float))
        obs_adj = adj_count(labs)
        null = [adj_count([rng.permutation(l) for l in labs]) for _ in range(2000)]
        o["adjacent_sumcluster_pairs"] = dict(obs=int(obs_adj), null_mean=round(float(np.mean(null)), 1), p=(1 + sum(x >= obs_adj for x in null)) / 2001)
        res[relname] = {k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in o.items()}
    json.dump(res, open(OUT / "sig_whiteclusters.json", "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()

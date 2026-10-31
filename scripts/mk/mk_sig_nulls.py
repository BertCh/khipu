"""Run relations 1,2,3,4,5,7,9 on observed khipus and under structure-preserving nulls.
Nulls: a  = permute whole pendant cords (value+colour+subsidiaries) across slots, groups kept
       a0 = permute pendant VALUES only (colour + subsidiaries stay in slot)
       b  = permute group order, within-group order kept
       c  = permute order within each group, groups kept
Output: OUT/sig_null_counts.npz  (obs[K,F], null[kind][R,K,F]) + feature names."""
import sys, time, numpy as np
from multiprocessing import Pool
from mk_sig_common import *

FEATS = ["r1", "r1R", "r1first", "r1firstR", "r1last", "r2", "r2R", "r3", "r3R", "r4", "r4big", "r4minus",
         "r5", "r5R", "r7", "r9"]


def feats(mm):
    first = {g[0] for g in mm["groups"] if g}
    last = {g[-1] for g in mm["groups"] if len(g) > 1}
    o = dict.fromkeys(FEATS, 0)
    r1 = rel1(mm)
    o["r1"] = len(r1); o["r1R"] = sum(x[2] for x in r1)
    o["r1first"] = sum(x[0] in first for x in r1)
    o["r1firstR"] = sum(x[0] in first and x[2] for x in r1)
    o["r1last"] = sum(x[0] in last for x in r1)
    r2 = rel2(mm); o["r2"] = len(r2); o["r2R"] = sum(x[2] for x in r2)
    r3 = rel3(mm); o["r3"] = len(r3); o["r3R"] = sum(x[2] for x in r3)
    r4 = rel4(mm); o["r4"] = len(r4); o["r4big"] = sum(x[3] > 10 for x in r4); o["r4minus"] = sum(x[4] == "minus" for x in r4)
    r5 = rel5(mm); o["r5"] = len(r5); o["r5R"] = sum(x[2] for x in r5)
    o["r7"] = len(rel7(mm)); o["r9"] = len(rel9(mm))
    return [o[f] for f in FEATS]


def null_model(m, kind, rng):
    if kind == "a0":
        n = len(m["P"]); perm = rng.permutation(n)
        P = [dict(m["P"][i]) for i in range(n)]
        for i in range(n):
            P[i]["v"] = m["P"][perm[i]]["v"]
        return dict(m, P=P)
    return draw_null(m, kind, rng)


def work(args):
    m, R, seed = args
    rng = np.random.default_rng(seed)
    obs = feats(m)
    res = {}
    for kind in ("a", "a0", "b", "c"):
        res[kind] = [feats(null_model(m, kind, rng)) for _ in range(R)]
    return m["id"], obs, res


if __name__ == "__main__":
    R = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    ms = [m for m in load_models() if len(m["P"]) >= 3]
    ms.sort(key=lambda m: -len(m["P"]))
    t0 = time.time()
    with Pool(8) as pool:
        out = pool.map(work, [(m, R, 1000 + i) for i, m in enumerate(ms)], chunksize=1)
    ids = [o[0] for o in out]
    obs = np.array([o[1] for o in out])
    nulls = {k: np.array([o[2][k] for o in out]).transpose(1, 0, 2) for k in ("a", "a0", "b", "c")}
    np.savez_compressed(OUT / "sig_null_counts.npz", ids=np.array(ids), feats=np.array(FEATS), obs=obs, **{f"null_{k}": v for k, v in nulls.items()})
    print("done", len(ids), "khipus", R, "reps", f"{time.time()-t0:.0f}s")

#!/usr/bin/env python3
"""Stage 2 of the tolerant-alignment scan: rank pairs from stage1_{fwd,rev}.npz (written by
align_scan.py) with an sd-floored z against two nulls (within-group shuffle, global permutation),
calibrate the threshold on the held-out null replicate (the 21st shuffle, scored as if it were an
observation), report positive-control recall and list new pairs with tracebacks + 2000-shuffle
empirical p and Gumbel-tail p.

    python3 scripts/deep/align_rank.py [--floor 2] [--top 40]
"""
import argparse, json, sys
from collections import Counter
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from align_scan import (OUT, KNOWN, known_set, load, Scorer, group_totals, traceback, slip_kind,
                        shuffle_within, kernel, Bank, run)

ap = argparse.ArgumentParser(); ap.add_argument("--floor", type=float, default=2.0)
ap.add_argument("--top", type=int, default=40); ap.add_argument("--nshuf", type=int, default=2000)
args = ap.parse_args()
R = {o: np.load(OUT / f"stage1_{o}.npz") for o in ("fwd", "rev")}
ids = list(R["fwd"]["ids"]); I, J = R["fwd"]["I"], R["fwd"]["J"]
K = R["fwd"]["nulls"].shape[0] - 1
known = known_set(); cur = {tuple(sorted(p)) for p in KNOWN}
keys = [tuple(sorted((ids[a], ids[b]))) for a, b in zip(I, J)]


def z_of(o, which):
    d = R[o]; obs = d["obs"]; n = d[which]
    mu, sd = n[:K].mean(0), np.maximum(n[:K].std(0), args.floor)
    return (obs - mu) / sd, (n[K] - mu) / sd, mu, sd


Z = {}
for which in ("nulls", "gnulls"):
    zf, znf, muf, sdf = z_of("fwd", which); zr, znr, mur, sdr = z_of("rev", which)
    Z[which] = dict(z=np.maximum(zf, zr), zn=np.maximum(znf, znr), orient=np.where(zf >= zr, "fwd", "rev"),
                    mu=np.where(zf >= zr, muf, mur), sd=np.where(zf >= zr, sdf, sdr))
ks = load()
freq = Counter(v for vals, _ in ks.values() for v in vals)
sc = Scorer(freq, [v for k in ks for v in group_totals(*ks[k])])
lib = kernel(); rng = np.random.default_rng(7)

report = {}
for which, label in (("nulls", "within-group shuffle"), ("gnulls", "global permutation")):
    z, zn = Z[which]["z"], Z[which]["zn"]
    srt = np.sort(zn)[::-1]
    thr1, thr5 = float(srt[0]), float(srt[4])
    print(f"\n=== null: {label}; floor {args.floor}; held-out null z max {thr1:.2f}, 5th {thr5:.2f}; "
          f"null pairs > 3: {(zn > 3).sum()}")
    rk = np.argsort(-z); pos = np.empty_like(rk); pos[rk] = np.arange(len(rk))
    rec = []
    for n, k in enumerate(keys):
        if k in cur:
            rec.append((k, round(float(z[n]), 2), int(pos[n]) + 1, str(Z[which]["orient"][n]),
                        round(float(R[Z[which]["orient"][n]]["obs"][n]), 1)))
    rec.sort(key=lambda r: -r[1])
    print(f"recall of {len(rec)} curated pairs at z>{thr1:.2f}: {sum(r[1] > thr1 for r in rec)}")
    for r in rec:
        print("   ", r)
    new = []
    for n in rk:
        if z[n] <= thr1 or len(new) >= args.top:
            if z[n] <= thr1:
                break
            continue
        if keys[n] in known:
            continue
        a, b = ids[I[n]], ids[J[n]]; o = str(Z[which]["orient"][n])
        obs = float(R[o]["obs"][n])
        # 2000-shuffle empirical p with the same null family
        tb = Bank(); ia = tb.add(sc.enc(ks[a][0])); ib = []
        for r in range(args.nshuf):
            s = shuffle_within(*ks[b], rng) if which == "nulls" else rng.permutation(ks[b][0]).tolist()
            ib.append(tb.add(sc.enc(s[::-1] if o == "rev" else s)))
        tb.freeze()
        nl = run(lib, tb, sc.S, np.full(len(ib), ia), np.array(ib), threads=8)[0]
        p_emp = (1 + (nl >= obs).sum()) / (1 + len(nl))
        beta = nl.std() * np.sqrt(6) / np.pi; mu_g = nl.mean() - 0.5772 * beta
        p_gum = float(-np.expm1(-np.exp(-(obs - mu_g) / max(beta, 1e-9))))
        vb = ks[b][0][::-1] if o == "rev" else ks[b][0]
        best, cols = traceback(sc.enc(ks[a][0]), sc.enc(vb), sc.S)
        nb = len(vb); al = []
        for i, j in cols:
            va = ks[a][0][i] if i is not None else None; vv = vb[j] if j is not None else None
            jj = (nb - 1 - j if o == "rev" else j) if j is not None else None
            al.append((i, jj, va, vv, slip_kind(va, vv) if va is not None and vv is not None else "gap"))
        kinds = Counter(x[4] for x in al)
        ii = [x[0] for x in al if x[0] is not None]; jj = [x[1] for x in al if x[1] is not None]
        rec_ = dict(a=a, b=b, orient=o, z=round(float(z[n]), 2), score=round(obs, 1),
                    null_mu=round(float(Z[which]["mu"][n]), 2), null_sd=round(float(Z[which]["sd"][n]), 2),
                    p_emp=p_emp, p_gumbel=p_gum, la=len(ks[a][0]), lb=len(ks[b][0]),
                    span_a=[min(ii), max(ii)], span_b=[min(jj), max(jj)], kinds=dict(kinds), alignment=al)
        new.append(rec_)
        print(f"  NEW {a}-{b} {o} z={z[n]:.2f} score={obs:.1f} (mu {rec_['null_mu']}) p_emp={p_emp:.4g} "
              f"p_gum={p_gum:.2g} len {rec_['la']}/{rec_['lb']} A[{min(ii)}-{max(ii)}] B[{min(jj)}-{max(jj)}] {dict(kinds)}")
        print("      ", " ".join(f"{x[2]}/{x[3]}" for x in al)[:400])
    report[which] = dict(thr1=thr1, thr5=thr5, recall=rec, new=new)
json.dump(report, open(OUT / f"align_rank_floor{args.floor}.json", "w"), indent=1, default=str)

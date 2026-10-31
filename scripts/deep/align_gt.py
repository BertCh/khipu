#!/usr/bin/env python3
"""Aggregate-level alignment: derived per-group sequences of A aligned (tolerant SW, same scorer)
against the level-1 sequence of every other khipu B, fwd and reversed, and GT vs GT.
Derived sequences (A needs >= 3 groups):
  GT    sum of level-1 values per group
  GTALL sum of all cord values (subsidiaries included) per group
  LEAD  value of the first level-1 cord of each group   (control: KH0118 <- KH0471 'summary')
Null: the derived sequence of A permuted (K=20; 21st replicate held out as a pseudo-observation to
set the corpus threshold); z uses sd floored at 2.  Positive controls: KH0690->KH0450 (GT),
KH0471->KH0118 (LEAD).

    python3 scripts/deep/align_gt.py
"""
import json, sys
from collections import Counter, OrderedDict
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from align_scan import (OUT, DATA, known_set, load, Scorer, group_totals, traceback, slip_kind,
                        kernel, Bank, run)

K, FLOOR = 20, 2.0
rng = np.random.default_rng(5)
ks = load(); ids = sorted(ks); known = known_set()
der = {"GT": {}, "GTALL": {}, "LEAD": {}}
for k in ids:
    vals, grp = ks[k]
    if len(set(grp)) < 3:
        continue
    d = json.loads((DATA / f"{k}.json").read_text())
    byname = {c["name"]: c for c in d["cords"]}
    top = {}
    for c in d["cords"]:
        r = c
        while r.get("parent") and r["parent"] in byname:
            r = byname[r["parent"]]
        top[c["name"]] = r
    gall = OrderedDict()
    for c in sorted((c for c in d["cords"] if c["level"] == 1), key=lambda c: c["ordinal"]):
        gall.setdefault(c.get("group", -1), 0)
    for c in d["cords"]:
        g = top[c["name"]].get("group", -1)
        if g in gall:
            gall[g] += int(c.get("value") or 0)
    der["GT"][k] = group_totals(vals, grp)
    der["GTALL"][k] = list(gall.values())
    lead, seen = [], set()
    for v, g in zip(vals, grp):
        if g not in seen:
            seen.add(g); lead.append(v)
    der["LEAD"][k] = lead
freq = Counter(v for vals, _ in ks.values() for v in vals)
sc = Scorer(freq, [v for D in der.values() for s in D.values() for v in s])
lib = kernel()
report = {}
MODES = [("GT", "L1"), ("GTALL", "L1"), ("LEAD", "L1"), ("GT", "LEAD"), ("GTALL", "LEAD")]
for name, tname in MODES:
    Dk = der[name]
    tseq = {k: (ks[k][0] if tname == "L1" else der["LEAD"].get(k)) for k in ids}
    tids = [k for k in ids if tseq[k]]
    bank = Bank()
    A = sorted(Dk)
    ia = {k: bank.add(sc.enc(Dk[k])) for k in A}
    ip = [{k: bank.add(sc.enc(rng.permutation(Dk[k]).tolist())) for k in A} for _ in range(K + 1)]
    fb = {k: bank.add(sc.enc(tseq[k])) for k in tids}
    rb = {k: bank.add(sc.enc(tseq[k][::-1])) for k in tids}
    bank.freeze()
    pa, pb = zip(*[(a, b) for a in A for b in tids if a != b])
    Z = {}
    for o, tgt in (("fwd", fb), ("rev", rb)):
        B = np.array([tgt[b] for b in pb])
        obs = run(lib, bank, sc.S, np.array([ia[a] for a in pa]), B)[0]
        nl = np.array([run(lib, bank, sc.S, np.array([p[a] for a in pa]), B)[0] for p in ip])
        mu, sd = nl[:K].mean(0), np.maximum(nl[:K].std(0), FLOOR)
        Z[o] = ((obs - mu) / sd, (nl[K] - mu) / sd, obs, mu)
    z = np.maximum(Z["fwd"][0], Z["rev"][0]); zn = np.maximum(Z["fwd"][1], Z["rev"][1])
    thr, thr5 = float(np.sort(zn)[-1]), float(np.sort(zn)[-5])
    print(f"\n=== {name}->{tname}: {len(A)} derived seqs x {len(tids)} ; held-out null z max {thr:.2f}, 5th {thr5:.2f}")
    rows = []
    for n in np.argsort(-z)[:25]:
        a, b = pa[n], pb[n]; o = "fwd" if Z["fwd"][0][n] >= Z["rev"][0][n] else "rev"
        vb = tseq[b][::-1] if o == "rev" else tseq[b]; nb = len(vb)
        _, cols = traceback(sc.enc(Dk[a]), sc.enc(vb), sc.S)
        al = [(f"g{i+1}" if i is not None else None, ((f"p{nb - j if o == 'rev' else j + 1}" if tname == "L1" else f"head{nb - j if o == 'rev' else j + 1}") if j is not None else None),
               Dk[a][i] if i is not None else None, vb[j] if j is not None else None) for i, j in cols]
        tag = "known" if tuple(sorted((a, b))) in known else "NEW"
        rows.append(dict(a=a, b=b, orient=o, z=round(float(z[n]), 2), score=round(float(Z[o][2][n]), 1),
                         mu=round(float(Z[o][3][n]), 1), tag=tag, above=bool(z[n] > thr), alignment=al))
        print(f"  {a}->{b} {o} z={z[n]:.2f} score={Z[o][2][n]:.1f} mu={Z[o][3][n]:.1f} {tag} "
              + " ".join(f"{x[0]}:{x[2]}|{x[1]}:{x[3]}" for x in al)[:300])
    for a, b in (("KH0690", "KH0450"), ("KH0471", "KH0118"), ("KH0147", "KH0690"), ("KH0517", "KH0502"), ("KH0507", "KH0513")):
        for n, (x, y) in enumerate(zip(pa, pb)):
            if (x, y) == (a, b):
                print(f"  control {a}->{b}: z={z[n]:.2f} rank {int((z > z[n]).sum()) + 1}/{len(z)}")
    report[f"{name}->{tname}"] = dict(thr=thr, thr5=thr5, top=rows)
json.dump(report, open(OUT / "align_gt.json", "w"), indent=1)

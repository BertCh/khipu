#!/usr/bin/env python3
"""Verify 'group totals of A = group-head cords of B' links found by align_gt.py.
For each pair: the group-by-group table (A group total, the B head it aligns to, slip type), the
tolerant-SW score GT(A) vs LEAD(B), the count of A totals (>= 100) found exactly among B's level-1
values, and two nulls (N reps):
  regroup : A's level-1 values permuted across the whole khipu, then cut back into A's group sizes
            (keeps every value and every group size; destroys which cords are summed together)
  headperm: B's head sequence permuted (order null for the SW score)
    python3 scripts/deep/align_gtverify.py [N]
"""
import json, sys
from collections import Counter
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from align_scan import OUT, load, Scorer, group_totals, traceback, slip_kind, kernel, Bank, run

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
PAIRS = [("KH0517", "KH0502"), ("KH0517", "KH0514"), ("KH0507", "KH0513"), ("KH0507", "KH0511"),
         ("KH0510", "KH0512"), ("KH0690", "KH0450"), ("KH0358", "KH0279"), ("KH0408", "KH0163")]
ks = load(); rng = np.random.default_rng(3)


def lead(vals, grp):
    out, seen = [], set()
    for v, g in zip(vals, grp):
        if g not in seen:
            seen.add(g); out.append(v)
    return out


freq = Counter(v for vals, _ in ks.values() for v in vals)
extra = [v for k in ks for v in group_totals(*ks[k])]
# regroup nulls produce new totals; allow any value up to the max possible
sc = Scorer(freq, extra + list(range(0, 60001)))
lib = kernel()
res = []
for a, b in PAIRS:
    va, ga = ks[a]; vb, gb = ks[b]
    GT = group_totals(va, ga); L = lead(vb, gb)
    sizes = [sum(1 for g in ga if g == x) for x in dict.fromkeys(ga)]
    bset = set(v for v in vb if v)
    hits = sum(1 for t in GT if t >= 100 and t in bset)
    bank = Bank(); ia = bank.add(sc.enc(GT))
    ib = {o: bank.add(sc.enc(L if o == "fwd" else L[::-1])) for o in ("fwd", "rev")}
    regs, rhits = [], []
    for _ in range(N):
        p = rng.permutation(va); cut = np.cumsum([0] + sizes)
        t = [int(p[cut[i]:cut[i + 1]].sum()) for i in range(len(sizes))]
        regs.append(bank.add(sc.enc(t))); rhits.append(sum(1 for x in t if x >= 100 and x in bset))
    hp = [bank.add(sc.enc(rng.permutation(L).tolist())) for _ in range(N)]
    bank.freeze()
    obs = {o: run(lib, bank, sc.S, np.array([ia]), np.array([ib[o]]), 1)[0][0] for o in ib}
    o = max(obs, key=obs.get)
    nreg = run(lib, bank, sc.S, np.array(regs), np.full(N, ib[o]))[0]
    nhp = run(lib, bank, sc.S, np.full(N, ia), np.array(hp))[0]
    rhits = np.array(rhits)
    Lx = L if o == "fwd" else L[::-1]
    _, cols = traceback(sc.enc(GT), sc.enc(Lx), sc.S)
    nb = len(L)
    table = [(f"g{i+1}" if i is not None else None,
              (f"head{nb - j if o == 'rev' else j + 1}" if j is not None else None),
              GT[i] if i is not None else None, Lx[j] if j is not None else None,
              slip_kind(GT[i], Lx[j]) if i is not None and j is not None else "gap") for i, j in cols]
    r = dict(a=a, b=b, orient=o, score=round(float(obs[o]), 1), n_groups_a=len(GT), n_heads_b=len(L),
             exact_hits_ge100=hits,
             regroup=dict(mu=round(float(nreg.mean()), 2), sd=round(float(nreg.std()), 2),
                          p=float((1 + (nreg >= obs[o]).sum()) / (N + 1)),
                          hits_mu=round(float(rhits.mean()), 2), hits_sd=round(float(rhits.std()), 2),
                          hits_p=float((1 + (rhits >= hits).sum()) / (N + 1))),
             headperm=dict(mu=round(float(nhp.mean()), 2), sd=round(float(nhp.std()), 2),
                           p=float((1 + (nhp >= obs[o]).sum()) / (N + 1))),
             kinds=dict(Counter(x[4] for x in table)), table=table)
    res.append(r)
    print(a, "->", b, {k: v for k, v in r.items() if k != "table"})
    print("   ", " ".join(f"{x[0]}:{x[2]}|{x[1]}:{x[3]}" for x in table))
json.dump(res, open(OUT / "align_gtverify.json", "w"), indent=1)

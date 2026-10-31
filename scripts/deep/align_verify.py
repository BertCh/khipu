#!/usr/bin/env python3
"""Deep nulls for selected tolerant-alignment pairs.  For each (A, B, mode, orient):
  mode "flat": A = all cords depth-first (subsidiaries included); "l1": A = level-1 only.
  B = level-1, reversed when orient == "rev".
Nulls (N reps each): within-group shuffle of B, global permutation of B, and B replaced by every
other khipu of length within +-50% of B (matched random pairs; known links excluded).
Prints observed score, null mean/sd, empirical p, Gumbel-tail p, and the traceback.

    python3 scripts/deep/align_verify.py [N]
"""
import json, sys
from collections import Counter
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from align_scan import (OUT, DATA, known_set, load, Scorer, group_totals, traceback, slip_kind,
                        shuffle_within, kernel, Bank, run)

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
PAIRS = [("KH0284", "KH0285", "flat", "fwd"), ("KH0284", "KH0285", "l1", "fwd"),
         ("KH0242", "KH0245", "flat", "rev"), ("KH0242", "KH0257", "flat", "fwd"),
         ("KH0245", "KH0257", "l1", "rev"), ("KH0508", "KH0349", "flat", "fwd")]
UR053 = ["KH0283", "KH0284", "KH0285", "KH0286", "KH0287"]
PAIRS += [(a, b, "flat", o) for a in UR053 for b in UR053 if a != b and (a, b) != ("KH0284", "KH0285")
          for o in ("fwd", "rev")]
ks = load(); ids = sorted(ks); known = known_set()
raw = {k: json.loads((DATA / f"{k}.json").read_text()) for k in ids}
flat = {k: [(c["name"], int(c.get("value") or 0)) for c in raw[k]["cords"]] for k in ids}
freq = Counter(v for vals, _ in ks.values() for v in vals)
sc = Scorer(freq, [v for k in ks for v in group_totals(*ks[k])] + [v for f in flat.values() for _, v in f])
lib = kernel(); rng = np.random.default_rng(11)


def gumbel_p(obs, nl):
    beta = max(nl.std() * np.sqrt(6) / np.pi, 1e-9); mu = nl.mean() - 0.5772 * beta
    return float(-np.expm1(-np.exp(-(obs - mu) / beta)))


results = []
for a, b, mode, o in PAIRS:
    if a not in ks or b not in ks:
        continue
    A = [v for _, v in flat[a]] if mode == "flat" else ks[a][0]
    names = [n for n, _ in flat[a]] if mode == "flat" else [f"p{i+1}" for i in range(len(A))]
    f = (lambda s: s[::-1]) if o == "rev" else (lambda s: s)
    bank = Bank(); ia = bank.add(sc.enc(A)); ib = bank.add(sc.enc(f(ks[b][0])))
    w = [bank.add(sc.enc(f(shuffle_within(*ks[b], rng)))) for _ in range(N)]
    g = [bank.add(sc.enc(f(rng.permutation(ks[b][0]).tolist()))) for _ in range(N)]
    lb = len(ks[b][0])
    others = [k for k in ids if k not in (a, b) and 0.5 * lb <= len(ks[k][0]) <= 1.5 * lb
              and tuple(sorted((a, k))) not in known]
    m = [bank.add(sc.enc(f(ks[k][0]))) for k in others]
    bank.freeze()
    obs = run(lib, bank, sc.S, np.array([ia]), np.array([ib]), 1)[0][0]
    out = dict(a=a, b=b, mode=mode, orient=o, score=round(float(obs), 1))
    for lab, idx in (("within", w), ("global", g), ("matched", m)):
        nl = run(lib, bank, sc.S, np.full(len(idx), ia), np.array(idx))[0]
        out[lab] = dict(mu=round(float(nl.mean()), 2), sd=round(float(nl.std()), 2),
                        p_emp=float((1 + (nl >= obs).sum()) / (1 + len(nl))), p_gumbel=gumbel_p(obs, nl),
                        n=len(nl), z=round(float((obs - nl.mean()) / nl.std()), 2))
    vb = f(ks[b][0]); nb = len(vb)
    _, cols = traceback(sc.enc(A), sc.enc(vb), sc.S)
    out["alignment"] = [(names[i] if i is not None else None,
                         (f"p{nb - j if o == 'rev' else j + 1}" if j is not None else None),
                         A[i] if i is not None else None, vb[j] if j is not None else None,
                         slip_kind(A[i], vb[j]) if i is not None and j is not None else "gap") for i, j in cols]
    out["kinds"] = dict(Counter(x[4] for x in out["alignment"]))
    results.append(out)
    print(f"{a}->{b} {mode} {o} score={out['score']} kinds={out['kinds']}")
    for lab in ("within", "global", "matched"):
        print(f"    {lab:8s} {out[lab]}")
json.dump(results, open(OUT / "align_verify.json", "w"), indent=1)

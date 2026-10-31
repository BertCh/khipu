#!/usr/bin/env python3
"""Subsidiary-promotion scan: align the FLATTENED cord sequence of A (every cord in KFG
depth-first order: pendant, its subsidiaries, next pendant ...) against the level-1 sequence of B,
fwd and reversed, for every ordered pair where A has subsidiaries.  Finds copies in which one
khipu's subsidiaries became pendants on the other (KH0284 -> KH0285).  Null: B shuffled within
groups (K=20) -> sd-floored z; held-out 21st shuffle gives the corpus threshold.  Output also
reports the gain over the plain L1-vs-L1 score (stage1 npz from align_scan.py).

    python3 scripts/deep/align_flat.py
"""
import json, sys
from collections import Counter
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from align_scan import (OUT, DATA, EXCL, KNOWN, known_set, load, Scorer, group_totals, traceback,
                        slip_kind, shuffle_within, kernel, Bank, run)

K, FLOOR = 20, 2.0
rng = np.random.default_rng(99)
ks = load()
ids = sorted(ks)
flat = {}
for k in ids:
    d = json.loads((DATA / f"{k}.json").read_text())
    if any(c["level"] > 1 for c in d["cords"]):
        flat[k] = [(c["name"], int(c.get("value") or 0), c["level"]) for c in d["cords"]]
print(len(flat), "khipus with subsidiaries")
freq = Counter(v for vals, _ in ks.values() for v in vals)
sc = Scorer(freq, [v for k in ks for v in group_totals(*ks[k])] + [v for f in flat.values() for _, v, _ in f])
lib = kernel()
bank = Bank()
A = [k for k in ids if k in flat]
fa = {k: bank.add(sc.enc([v for _, v, _ in flat[k]])) for k in A}
l1 = {k: bank.add(sc.enc(ks[k][0])) for k in ids}
l1r = {k: bank.add(sc.enc(ks[k][0][::-1])) for k in ids}
sh = [{k: bank.add(sc.enc(shuffle_within(*ks[k], rng))) for k in ids} for _ in range(K + 1)]
bank.freeze()
pa, pb = zip(*[(a, b) for a in A for b in ids if a != b])
PA = np.array([fa[a] for a in pa])
res = {}
for o, tgt in (("fwd", l1), ("rev", l1r)):
    obs = run(lib, bank, sc.S, PA, np.array([tgt[b] for b in pb]))[0]
    nl = np.array([run(lib, bank, sc.S, PA, np.array([s[b] for b in pb]))[0] for s in sh])
    # reversed null: reversal of a within-group shuffle has the same composition; reuse fwd shuffles
    mu, sd = nl[:K].mean(0), np.maximum(nl[:K].std(0), FLOOR)
    res[o] = ((obs - mu) / sd, (nl[K] - mu) / sd, obs, mu)
z = np.maximum(res["fwd"][0], res["rev"][0]); zn = np.maximum(res["fwd"][1], res["rev"][1])
thr = float(np.sort(zn)[-1]); thr5 = float(np.sort(zn)[-5])
print(f"held-out null z max {thr:.2f}, 5th {thr5:.2f} over {len(z)} ordered pairs")
known = known_set(); cur = {tuple(sorted(p)) for p in KNOWN}
out = []
for n in np.argsort(-z)[:60]:
    a, b = pa[n], pb[n]
    o = "fwd" if res["fwd"][0][n] >= res["rev"][0][n] else "rev"
    tag = "curated" if tuple(sorted((a, b))) in cur else ("known" if tuple(sorted((a, b))) in known else "NEW")
    rec = dict(a=a, b=b, orient=o, z=round(float(z[n]), 2), score=round(float(res[o][2][n]), 1),
               null_mu=round(float(res[o][3][n]), 1), tag=tag, above=bool(z[n] > thr))
    if z[n] > thr5 and tag == "NEW":
        vb = ks[b][0][::-1] if o == "rev" else ks[b][0]
        fv = [v for _, v, _ in flat[a]]
        _, cols = traceback(sc.enc(fv), sc.enc(vb), sc.S)
        nb = len(vb)
        al = [(flat[a][i][0] if i is not None else None,
               (f"p{(nb - j if o == 'rev' else j + 1)}" if j is not None else None),
               fv[i] if i is not None else None, vb[j] if j is not None else None,
               slip_kind(fv[i], vb[j]) if i is not None and j is not None else "gap") for i, j in cols]
        rec["alignment"] = al
        rec["subs_matched"] = sum(1 for x in al if x[0] and "s" in x[0][1:] and x[4] == "=")
        rec["kinds"] = dict(Counter(x[4] for x in al))
    out.append(rec)
    print({k: v for k, v in rec.items() if k != "alignment"})
json.dump(dict(thr=thr, thr5=thr5, top=out), open(OUT / "align_flat.json", "w"), indent=1)

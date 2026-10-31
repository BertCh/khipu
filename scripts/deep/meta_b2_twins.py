#!/usr/bin/env python3
"""(b2) Accession-adjacent 'twins': ordered, positional test for adjacent pairs.

For each accession-adjacent pair (meta_b_accession definition) with both khipus readable and >= 12 pendants:
  best-offset positional agreement  A = max over offsets o (|o| <= 10) and direction (fwd/rev) of the
  number of positions t with v_a[t] == v_b[t+o] and v >= 10, weighted by idf(v).
Null: B's pendant values permuted within B (value-permuted within khipu, 1000 reps), same max over
offsets/directions -> empirical p.  Also tests colour-sequence agreement (base colour per pendant, same
offset search, colour permuted within khipu) -- colour strings are compared only within one recorder.
"""
import collections, json, math, itertools
import numpy as np
import meta_common as mc

rng = np.random.default_rng(21)
ks = mc.load(); idx = {k["id"]: i for i, k in enumerate(ks)}
excl = mc.vc.WARI | mc.vc.UNREADABLE
seqs = [[int(c.get("value") or 0) for c in mc.vc.pendants(k)] for k in ks]
cols = [[mc.vc.base_colour(c) or "?" for c in mc.vc.pendants(k)] for k in ks]
df = collections.Counter(v for i, s in enumerate(seqs) if ks[i]["id"] not in excl for v in set(s) if v >= 10)
nread = sum(1 for k in ks if k["id"] not in excl)
idf = collections.defaultdict(lambda: math.log(nread), {v: math.log(nread / n) for v, n in df.items()})

def score(a, b, W):
    best = 0.0; arg = None
    for rev in (False, True):
        bb = b[::-1] if rev else b
        for o in range(-10, 11):
            s = 0.0
            for t in range(len(a)):
                u = t + o
                if 0 <= u < len(bb) and a[t] == bb[u] and W(a[t]) > 0: s += W(a[t])
            if s > best: best, arg = s, (o, rev)
    return best, arg

def vw(v): return idf[v] if v >= 10 else 0.0
def cw(c): return 1.0 if c != "?" else 0.0

acc = [(mc.accession(k["museum"]["number"]), k["museum"]["canonical"]) for k in ks]
ser = collections.defaultdict(list)
for i, (a, m) in enumerate(acc):
    if a and m: ser[(m, a[0])].append((a[1], i))
adj = []
for key, lst in ser.items():
    for x, y in itertools.combinations(sorted(lst), 2):
        if abs(x[0] - y[0]) <= 1: adj.append((x[1], y[1]))
adj = [(i, j) for i, j in adj if ks[i]["id"] not in excl and ks[j]["id"] not in excl
       and len(seqs[i]) >= 12 and len(seqs[j]) >= 12]
print(f"testing {len(adj)} adjacent pairs")
known = mc.vc.known_all()
out = []
for i, j in adj:
    a, b = seqs[i], seqs[j]
    obs, arg = score(a, b, vw)
    if obs == 0: p = 1.0; nm = ns = 0.0
    else:
        null = np.array([score(a, list(rng.permutation(b)), vw)[0] for _ in range(200)])
        p = (1 + (null >= obs).sum()) / 201; nm, ns = null.mean(), null.std()
    same_rec = ks[i]["_rec"] == ks[j]["_rec"]
    cobs, carg = score(cols[i], cols[j], cw) if same_rec else (np.nan, None)
    if same_rec:
        cn = np.array([score(cols[i], list(rng.permutation(cols[j])), cw)[0] for _ in range(100)])
        cp = (1 + (cn >= cobs).sum()) / 101; cz = (cobs - cn.mean()) / (cn.std() or 1)
    else: cp = cz = np.nan
    out.append(dict(a=ks[i]["id"], b=ks[j]["id"], acc=(ks[i]["museum"]["number"], ks[j]["museum"]["number"]),
                    nP=(len(a), len(b)), obs=obs, null_mean=float(nm), null_sd=float(ns), p=float(p), arg=arg,
                    col_obs=cobs, col_z=float(cz), col_p=float(cp), rec=(ks[i]["_rec"], ks[j]["_rec"]),
                    reg=(ks[i]["_region"], ks[j]["_region"]), known=tuple(sorted((ks[i]["id"], ks[j]["id"]))) in known))
# refine the small-p ones with more permutations
for r in out:
    if r["p"] <= 0.02:
        i, j = idx[r["a"]], idx[r["b"]]
        null = np.array([score(seqs[i], list(rng.permutation(seqs[j])), vw)[0] for _ in range(2000)])
        r["p"] = float((1 + (null >= r["obs"]).sum()) / 2001); r["null_mean"] = float(null.mean()); r["null_sd"] = float(null.std())
out.sort(key=lambda r: r["p"])
ps = np.array([r["p"] for r in out]); m = len(ps); thr = 0
for rank, o in enumerate(np.argsort(ps), 1):
    if ps[o] <= 0.05 * rank / m: thr = rank
for n, r in enumerate(out[:30]):
    print(f"  {r['a']}-{r['b']} {r['acc']} {r['rec']} {r['reg']} nP={r['nP']} idf-agree={r['obs']:.1f} null={r['null_mean']:.1f}+-{r['null_sd']:.1f} "
          f"p={r['p']:.4f} offset={r['arg']} colour z={r['col_z']:.1f} p={r['col_p']:.3f} {'KNOWN' if r['known'] else ''} {'BH' if n < thr else ''}")
print(f"BH q=0.05: {thr} of {m} adjacent pairs significant; known among them: {sum(r['known'] for r in out[:thr])}")
# colour-sequence agreement among same-recorder adjacent pairs overall
cz = np.array([r["col_p"] for r in out if not np.isnan(r["col_p"])])
print(f"colour-order agreement (same recorder): share of adjacent pairs with p<=0.05: {np.mean(cz <= .05):.3f} (n={len(cz)}; 0.05 expected)")
json.dump(out, open(mc.OUT / "b2_twins.json", "w"), indent=1, default=str)

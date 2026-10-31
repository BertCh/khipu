#!/usr/bin/env python3
"""(b) Accession-number adjacency.

Adjacent pair = same canonical museum, same accession series (prefix / catalogue head), |number diff| <= 1
(so VA42527/VA42528, and VA42605A/VA42605B).  Runs = maximal chains of such steps (diff <= 2 allowed
inside a run for listing).
Pair similarity measures (none uses museum or accession):
  vsim   : sum over DISTINCT pendant values >= 10 shared by both khipus of idf(v) = log(N / df(v))
           (Wari + unreadable excluded) -> rare shared values count, template constants barely count
  vsimn  : vsim / min(self-sum A, self-sum B)
  fdist  : Euclidean distance on standardized recorder-robust features (see meta_a_predict)
  np_eq  : same pendant count
  link   : pair is a known link (curated or exact-scan links.json)
Nulls: (1) same-museum, same-recorder, NON-adjacent pairs (controls museum, recorder, collecting era);
       (2) all pairs.  Mean comparisons with a resampling p (5000 draws of the same number of pairs).
Positive control: rank of known links among all pairs by vsim.
"""
import collections, itertools, json, math
import numpy as np
import meta_common as mc

rng = np.random.default_rng(13)
ks = mc.load(); N = len(ks); idx = {k["id"]: i for i, k in enumerate(ks)}
excl = mc.vc.WARI | mc.vc.UNREADABLE
vals = []
for k in ks:
    s = set()
    if k["id"] not in excl:
        s = {int(c["value"]) for c in mc.vc.pendants(k) if (c.get("value") or 0) >= 10}
    vals.append(s)
df = collections.Counter(v for s in vals for v in s)
nread = sum(1 for k in ks if k["id"] not in excl)
idf = {v: math.log(nread / n) for v, n in df.items()}
selfs = np.array([sum(idf[v] for v in s) for s in vals])

X, names = mc.matrix(ks)
flag = set()
d = json.load(open(mc.OUT / "d_recorder.json"))
for pair, v in d.items():
    if "|" in pair:
        for r in v["rows"]:
            if r["p"] <= 0.01 and abs(r["D"]) >= (0.5 if pair == "Ascher|Urton" else 1.0): flag.add(r["feature"])
cols = [i for i, n in enumerate(names) if n not in flag and not n.startswith(("r_", "col_"))]
Z = X[:, cols]; mu = np.nanmean(Z, 0); sd = np.nanstd(Z, 0); sd[sd == 0] = 1
Z = np.where(np.isnan(Z), mu, Z); Z = (Z - mu) / sd
nP = np.array([len(mc.vc.pendants(k)) for k in ks])
known = mc.vc.known_all()

def vsim(i, j):
    return sum(idf[v] for v in vals[i] & vals[j])

def meas(i, j):
    v = vsim(i, j); m = min(selfs[i], selfs[j])
    a, b = ks[i]["id"], ks[j]["id"]
    return dict(vsim=v, vsimn=v / m if m > 0 else np.nan, fdist=float(np.linalg.norm(Z[i] - Z[j])),
                np_eq=float(nP[i] == nP[j]), link=float(tuple(sorted((a, b))) in known))

acc = [(mc.accession(k["museum"]["number"]), k["museum"]["canonical"]) for k in ks]
ser = collections.defaultdict(list)
for i, (a, m) in enumerate(acc):
    if a and m: ser[(m, a[0])].append((a[1], a[2], i))
adj, runs = [], []
for key, lst in ser.items():
    lst.sort()
    for x, y in itertools.combinations(lst, 2):
        if abs(x[0] - y[0]) <= 1: adj.append((x[2], y[2]))
    # runs with gaps <= 2
    cur = [lst[0]]
    for e in lst[1:]:
        if e[0] - cur[-1][0] <= 2: cur.append(e)
        else:
            if len(cur) >= 3: runs.append((key, cur))
            cur = [e]
    if len(cur) >= 3: runs.append((key, cur))
adj = [p for p in adj if ks[p[0]]["id"] not in excl and ks[p[1]]["id"] not in excl]
print(f"adjacent pairs (|diff|<=1, same series): {len(adj)}; runs (>=3, gaps<=2): {len(runs)}")
for (m, pre), cur in sorted(runs, key=lambda r: -len(r[1])):
    ids = [ks[e[2]]["id"] for e in cur]
    regs = collections.Counter(ks[e[2]]["_region"] for e in cur)
    recs = collections.Counter(ks[e[2]]["_rec"] for e in cur)
    print(f"  {m[:28]:28s} {pre:10s} {cur[0][0]}..{cur[-1][0]} n={len(cur)} regions={dict(regs)} recorders={dict(recs)}")
    print(f"      {' '.join(ids)}")

# null pools
adjset = {tuple(sorted(p)) for p in adj}
same_mus = []
for key, lst in ser.items():
    for x, y in itertools.combinations(lst, 2):
        i, j = x[2], y[2]
        if abs(x[0] - y[0]) > 1 and ks[i]["_rec"] == ks[j]["_rec"] and ks[i]["id"] not in excl and ks[j]["id"] not in excl:
            same_mus.append((i, j))
good = [i for i in range(N) if ks[i]["id"] not in excl]
allp = [(good[a], good[b]) for a, b in zip(rng.integers(0, len(good), 40000), rng.integers(0, len(good), 40000)) if a != b]
A = [meas(i, j) for i, j in adj]
# restrict adjacency comparison to same-recorder adjacent pairs for the museum null
A_same = [meas(i, j) for i, j in adj if ks[i]["_rec"] == ks[j]["_rec"]]
S = [meas(i, j) for i, j in same_mus]; R = [meas(i, j) for i, j in allp]
res = {"n_adj": len(adj), "n_adj_samerec": len(A_same), "n_samemus_null": len(S)}
print(f"\nadjacent pairs same recorder: {len(A_same)}; same-museum same-recorder non-adjacent null pool: {len(S)}; random pairs: {len(R)}")
for key in ("vsim", "vsimn", "fdist", "np_eq", "link"):
    a = np.array([x[key] for x in A_same], float); a = a[~np.isnan(a)]
    for nm, pool in (("same-museum", S), ("random", R)):
        b = np.array([x[key] for x in pool], float); b = b[~np.isnan(b)]
        draws = np.array([rng.choice(b, len(a)).mean() for _ in range(5000)])
        lo = key == "fdist"
        p = (1 + ((draws <= a.mean()) if lo else (draws >= a.mean())).sum()) / 5001
        print(f"  {key:6s} adjacent mean={a.mean():.4f}  vs {nm:11s} null {draws.mean():.4f}+-{draws.std():.4f}  p={p:.4f}")
        res[f"{key}|{nm}"] = dict(obs=float(a.mean()), null_mean=float(draws.mean()), null_sd=float(draws.std()), p=float(p))

# per-pair significance of vsim: empirical p vs same-museum null pool
Sv = np.sort(np.array([x["vsim"] for x in S])); Rv = np.sort(np.array([x["vsim"] for x in R]))
print("\nadjacent pairs by value similarity (p_rand = share of random pairs with >= vsim; p_mus = same-museum null):")
rows = []
for (i, j), m in zip(adj, A):
    p_r = (1 + (len(Rv) - np.searchsorted(Rv, m["vsim"], "left"))) / (1 + len(Rv))
    p_m = (1 + (len(Sv) - np.searchsorted(Sv, m["vsim"], "left"))) / (1 + len(Sv))
    shared = sorted(vals[i] & vals[j], key=lambda v: -idf[v])
    rows.append(dict(a=ks[i]["id"], b=ks[j]["id"], acc_a=ks[i]["museum"]["number"], acc_b=ks[j]["museum"]["number"],
                     rec=f"{ks[i]['_rec']}/{ks[j]['_rec']}", reg=f"{ks[i]['_region']}/{ks[j]['_region']}",
                     vsim=m["vsim"], vsimn=m["vsimn"], fdist=m["fdist"], p_rand=float(p_r), p_mus=float(p_m),
                     known=bool(m["link"]), nP=(int(nP[i]), int(nP[j])), shared=shared[:12]))
rows.sort(key=lambda r: r["p_rand"])
for r in rows[:30]:
    print(f"  {r['a']}-{r['b']} [{r['acc_a']} | {r['acc_b']}] {r['rec']} {r['reg']} nP={r['nP']} vsim={r['vsim']:.1f} "
          f"n={r['vsimn']:.2f} fdist={r['fdist']:.1f} p_rand={r['p_rand']:.4f} p_mus={r['p_mus']:.4f} {'KNOWN' if r['known'] else ''} shared={r['shared'][:8]}")
# Benjamini-Hochberg across the adjacent pairs
ps = np.array([r["p_rand"] for r in rows]); order = np.argsort(ps); m_ = len(ps)
bh = np.zeros(m_, bool); thr = 0
for rank, o in enumerate(order, 1):
    if ps[o] <= 0.05 * rank / m_: thr = rank
bh[order[:thr]] = True
print(f"BH(q=0.05) significant adjacent pairs: {bh.sum()} of {m_}; of which known: {sum(rows[o]['known'] for o in order[:thr])}")
res["pairs"] = rows; res["bh_n"] = int(bh.sum())

# positive control: where do known links rank among all readable pairs by vsim?
kn = [(idx[a], idx[b]) for a, b in known if a in idx and b in idx and a not in excl and b not in excl]
kv = np.array([vsim(i, j) for i, j in kn])
pct = np.array([(np.searchsorted(Rv, v, "left")) / len(Rv) for v in kv])
print(f"\npositive control: {len(kn)} known links; vsim percentile among random pairs: median {np.median(pct):.3f}; "
      f"share >= 99th pct {np.mean(pct >= .99):.2f}; >= 95th {np.mean(pct >= .95):.2f}")
res["posctrl"] = dict(n=len(kn), median_pct=float(np.median(pct)), top1=float(np.mean(pct >= .99)), top5=float(np.mean(pct >= .95)))
# how many known links are accession-adjacent vs expectation
kadj = sum(1 for a, b in kn if tuple(sorted((a, b))) in adjset)
print(f"known links that are accession-adjacent: {kadj}/{len(kn)}; adjacency base rate among readable pairs "
      f"{len(adj) / (len(good) * (len(good) - 1) / 2):.5f}")
json.dump(res, open(mc.OUT / "b_accession.json", "w"), indent=1, default=str)

# ---------------------------------------------------------------------------------------------
# Size-matched null.  Full vsim matrix via sparse incidence;  per pair (i,j): p = share of 4000 random pairs
# (x, y), x size-matched to i and y size-matched to j (|log #distinct values diff| < 0.3), with vsim(x,y) >= vsim(i,j)
from scipy import sparse
vocab = {v: n for n, v in enumerate(sorted(df))}
rows_, cols_ = [], []
for i, s in enumerate(vals):
    for v in s: rows_.append(i); cols_.append(vocab[v])
B = sparse.csr_matrix((np.ones(len(rows_)), (rows_, cols_)), shape=(N, len(vocab)))
w = np.array([idf[v] for v in sorted(df)])
Vm = (B @ sparse.diags(w) @ B.T).toarray(); np.fill_diagonal(Vm, 0)
size = np.array([len(s) for s in vals], float); lsz = np.log(np.maximum(size, 1))
readable = np.array([ks[i]["id"] not in excl and size[i] >= 5 for i in range(N)])

ridx = np.where(readable)[0]
_cache = {}
def pmatch(i, j, ndraw=4000):
    """matched random pairs: x drawn among readable khipus with |log size diff| < 0.3 to i, y likewise to j."""
    def pool(a):
        if a not in _cache:
            _cache[a] = ridx[np.abs(lsz[ridx] - lsz[a]) < 0.3]
        return _cache[a]
    Ci, Cj = pool(i), pool(j)
    if len(Ci) < 10 or len(Cj) < 10: return np.nan
    x = rng.choice(Ci, ndraw); y = rng.choice(Cj, ndraw); ok = x != y
    return (1 + (Vm[x[ok], y[ok]] >= Vm[i, j]).sum()) / (1 + ok.sum())

print("\n=== size-matched null ===")
kn2 = [(i, j) for i, j in kn if readable[i] and readable[j]]
kp = np.array([pmatch(i, j) for i, j in kn2])
print(f"positive control: {len(kn2)} known links with >=5 distinct values each: matched p<=0.001 for {np.mean(kp <= .001):.2f}, p<=0.01 for {np.mean(kp <= .01):.2f}, "
      f"p<=0.05 for {np.mean(kp <= .05):.2f}")
res["posctrl_matched"] = dict(n=len(kn2), le01=float(np.mean(kp <= .01)), le05=float(np.mean(kp <= .05)))
# random-pair calibration of the matched p (should be ~uniform)
rp = [pmatch(i, j) for i, j in allp[:3000] if readable[i] and readable[j]]
rp = np.array([x for x in rp if not np.isnan(x)])
print(f"calibration on random pairs: share p<=0.01 {np.mean(rp <= .01):.4f}, p<=0.05 {np.mean(rp <= .05):.4f} (n={len(rp)})")
res["calib_random"] = dict(le01=float(np.mean(rp <= .01)), le05=float(np.mean(rp <= .05)))
ap = [(i, j, pmatch(i, j)) for i, j in adj if readable[i] and readable[j]]
ap = [x for x in ap if not np.isnan(x[2])]
pa = np.array([x[2] for x in ap])
sm = [pmatch(i, j) for i, j in same_mus[:4000] if readable[i] and readable[j]]
sm = np.array([x for x in sm if not np.isnan(x)])
print(f"adjacent pairs: share p<=0.01 {np.mean(pa <= .01):.3f} (n={len(pa)}) vs same-museum same-recorder non-adjacent "
      f"{np.mean(sm <= .01):.3f} (n={len(sm)}) vs random {np.mean(rp <= .01):.3f}")
# resampling p for the enrichment
draws = np.array([np.mean(rng.choice(sm, len(pa)) <= .01) for _ in range(5000)])
print(f"  enrichment vs same-museum: obs {np.mean(pa <= .01):.3f} null {draws.mean():.3f}+-{draws.std():.3f} "
      f"p={(1 + (draws >= np.mean(pa <= .01)).sum()) / 5001:.4f}")
res["adj_matched"] = dict(obs=float(np.mean(pa <= .01)), n=len(pa), samemus=float(np.mean(sm <= .01)),
                          null_mean=float(draws.mean()), null_sd=float(draws.std()))
order = np.argsort(pa); m_ = len(pa); thr = 0
for rank, o in enumerate(order, 1):
    if pa[o] <= 0.05 * rank / m_: thr = rank
print(f"BH q=0.05 over {m_} adjacent pairs: {thr} significant")
out = []
for o in order[:max(thr, 25)]:
    i, j, p = ap[o]; a, b = ks[i]["id"], ks[j]["id"]
    shared = sorted(vals[i] & vals[j], key=lambda v: -idf[v])
    kflag = tuple(sorted((a, b))) in known
    out.append(dict(a=a, b=b, p=float(p), vsim=float(Vm[i, j]), acc=(ks[i]["museum"]["number"], ks[j]["museum"]["number"]),
                    nP=(int(nP[i]), int(nP[j])), known=kflag, bh=bool(o in set(order[:thr])), shared=shared[:10]))
    print(f"  {a}-{b} p={p:.4f} vsim={Vm[i, j]:.1f} {ks[i]['museum']['number']} | {ks[j]['museum']['number']} "
          f"{ks[i]['_rec']}/{ks[j]['_rec']} {ks[i]['_region']}/{ks[j]['_region']} nP={nP[i]}/{nP[j]} {'KNOWN' if kflag else ''} "
          f"{'BH' if o in set(order[:thr]) else ''} shared={shared[:8]}")
res["adj_matched_pairs"] = out
np.save(mc.OUT / "vsim_matrix.npy", Vm)
json.dump(res, open(mc.OUT / "b_accession.json", "w"), indent=1, default=str)

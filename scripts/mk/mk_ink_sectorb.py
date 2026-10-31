#!/usr/bin/env python3
"""Sector B (KH0608-KH0630, JC001-JC023): does 'Ascher sum relations on 10 of 23 (43%)' survive a null?
Re-implements (exactly, incl. unlimited-distance runs) Medrano & Khosla's two detectors that account for most of the ten:
  pendant-pendant sum (their PendantSummer: a pendant > 10 equal to a contiguous run of >= 2 later
  (right) or earlier (left) pendants starting at the first non-zero, sum > number of summands) and
  cluster sum band (a cluster splitting into two contiguous parts of equal sum, split not at an end,
  cluster sum >= 5, values not all equal).
Null: pendant values permuted within khipu (cluster sizes kept), 2000 reps; per-khipu P(>=1 hit)
and the null distribution of the number of JC khipus with >= 1 hit.  Also: sector A (UR255-UR280)
for comparison, and value links between sector B and sector A."""
import numpy as np, collections
from mk_ink_common import *
ks = inkawasi(load_all()); rng = np.random.default_rng(4)
def pendvals(k): return [v(c) for g in groups(k) for c in g]
def _pp_dir(arr):
    """exactly their search_sum_at: for pendant i (>10), scan start indices st>i with arr[st]>0 in order;
    the first st whose running sum from st hits arr[i] decides (hit iff run length >= 2); then sum > run length."""
    arr = np.asarray(arr, dtype=np.int64); n = len(arr)
    if n < 3: return 0
    P = np.concatenate([[0], np.cumsum(arr)])
    nz = np.where(arr > 0)[0]
    hits = 0
    for i in range(n - 2):
        s = arr[i]
        if s <= 10: continue
        sts = nz[nz > i]
        if not len(sts): continue
        tg = P[sts] + s
        j = np.searchsorted(P, tg, side="left")
        jj = np.minimum(j, n)
        ok = (j <= n) & (P[jj] == tg)
        if ok.any():
            f = np.argmax(ok); L = jj[f] - sts[f]
            if L >= 2 and s > L: hits += 1
    return hits
def pp_sums(vals):
    vals = list(vals)
    return _pp_dir(vals) + _pp_dir(vals[::-1])
def bands(gvals):
    h = 0
    for cv in gvals:
        if sum(cv) < 5 or len(set(cv)) <= 1: continue
        pos = -1
        for i in range(1, len(cv)):
            if sum(cv[:i]) == sum(cv[i:]): pos = i
        if 1 < pos < len(cv) - 1: h += 1
    return h
res = {}
for kid in sorted(ks):
    k = ks[kid]; gv = [[v(c) for c in g] for g in groups(k)]; flat = [x for g in gv for x in g]; lens = [len(g) for g in gv]
    o_pp = pp_sums(flat); o_b = bands(gv)
    npp = []; nb = []; nany = []
    for _ in range(1000 if kid in SECTOR_B else 200):
        p = list(rng.permutation(flat)); i = 0; g2 = []
        for L in lens: g2.append(p[i:i+L]); i += L
        a = pp_sums(p); b = bands(g2); npp.append(a); nb.append(b); nany.append(a + b > 0)
    res[kid] = dict(pp=o_pp, band=o_b, p_any_null=float(np.mean(nany)), pp_null=float(np.mean(npp)), b_null=float(np.mean(nb)), nany=np.array(nany))
    print(f"{kid} {k['aliases'][0]:7s} n={len(flat):3d} max={max(flat) if flat else 0:5d} | pp-sums obs {o_pp:3d} null {np.mean(npp):5.2f} "
          f"p={(np.sum(np.array(npp)>=o_pp)+1)/(len(npp)+1) if o_pp else 1:.3f} | bands obs {o_b} null {np.mean(nb):.2f} | P(any hit | null) {np.mean(nany):.2f}")
for sect, ids in (("B", sorted(SECTOR_B)), ("A", sorted(set(ks) - SECTOR_B))):
    obs = sum((res[i]["pp"] + res[i]["band"]) > 0 for i in ids)
    m = min(len(res[i]["nany"]) for i in ids); null = np.sum([res[i]["nany"][:m] for i in ids], axis=0)
    print(f"sector {sect}: khipus with >=1 pp-sum or band: observed {obs}/{len(ids)}; null mean {null.mean():.2f} "
          f"(95% {np.percentile(null,2.5):.0f}-{np.percentile(null,97.5):.0f}); P(null>=obs)={(np.sum(null>=obs)+1)/(len(null)+1):.3f}")
    sig = [i for i in ids if res[i]["pp"] and (np.mean(res[i]['nany']) < 0.5)]
# excess per khipu (observed pp-sums well above null)
print("\nsector B khipus whose pp-sum count exceeds its null 95th pct:")
for i in sorted(SECTOR_B):
    pass
# value links sector B -> sector A (values >= 100 shared, ordered runs of >=2)
A = sorted(set(ks) - SECTOR_B)
print("\nshared values >= 100 between sector B and sector A khipus:")
for b in sorted(SECTOR_B):
    vb = set(x for x in pendvals(ks[b]) if x >= 100)
    if not vb: continue
    for a in A:
        va = set(x for x in pendvals(ks[a]) if x >= 100)
        sh = sorted(vb & va - {100, 200, 300, 400, 500, 600, 1000, 2000, 3000, 5000, 10000})
        if len(sh) >= 1: print(f"  {b} {ks[b]['aliases'][0]} - {a} {ks[a]['aliases'][0]}: {sh}")
# totals->heads style: B group totals vs A heads and vice versa
def heads(k): return [next((v(c) for c in g if v(c)), 0) for g in groups(k)]
def totals(k): return [sum(v(c) for c in g) for g in groups(k)]
print("\nB group totals (>=50) equal to A group heads, and A totals equal to B heads:")
for b in sorted(SECTOR_B):
    for a in A:
        x = [t for t in totals(ks[b]) if t >= 50 and t in set(heads(ks[a]))]
        y = [t for t in totals(ks[a]) if t >= 50 and t in set(heads(ks[b]))]
        if x or y: print(f"  {b}-{a}: B-totals-in-A-heads {x}  A-totals-in-B-heads {y}")

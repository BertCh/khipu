#!/usr/bin/env python3
"""Confound check on KH0517 group totals = KH0502 group heads.
(a) Is the match implied by internal arithmetic?  KH0502 heads are themselves totals (= KH0514 heads
    = 47 + items + remainder), so list, for each matched head, whether KH0502/KH0514 hold it as a
    balanced internal sum, and whether KH0517 carries its own totals anywhere (a cord equal to a group sum).
(b) Nulls that keep every khipu's internal sum structure intact:
    1. other 'totals-bearing' Inkawasi khipus' heads (heads that are internal sums) vs KH0517 totals;
    2. shift null: KH0502 heads + s, s in +-1..+-200 (keeps the magnitude distribution & order);
    3. cord-shuffle null: KH0517 cords shuffled across groups of equal size (group sums re-drawn), 10k reps;
    4. every Inkawasi khipu's group totals vs KH0502 heads (does any other set of sums hit them?).
Match = ordered greedy (as totals.ts totalsToHeads), totals >= 1000."""
import numpy as np, collections
from mk_ink_common import *
ks = inkawasi(load_all()); rng = np.random.default_rng(3)
def heads(k):
    out = []
    for g in groups(k):
        f = next((c for c in g if v(c) > 0), None)
        if f: out.append(v(f))
    return out
def totals(k): return [sum(v(c) for c in g) for g in groups(k)]
def match(tots, hs, mn=1000):
    j0 = 0; n = 0; hit = []
    for t in tots:
        if t < mn: continue
        for j in range(j0, len(hs)):
            if hs[j] == t: n += 1; j0 = j + 1; hit.append(t); break
    return n, hit
T = totals(ks["KH0517"]); H = heads(ks["KH0502"]); H14 = heads(ks["KH0514"])
n, hit = match(T, H)
print("KH0517 totals:", T); print("KH0502 heads:", H)
print(f"observed ordered matches {n}: {hit}")
print("unordered set matches:", sorted(set(t for t in T if t >= 1000) & set(H)))
# (a) internal
g14 = {vals[0]: vals for vals in ([v(c) for c in g if v(c)] for g in groups(ks["KH0514"])) if vals}
for t in hit:
    vals = g14.get(t)
    st = "not a KH0514 head"
    if vals: d = vals[0] - sum(vals[1:]); st = f"KH0514 head, internal diff {d} ({len(vals)-1} summands)"
    print(f"  {t}: {st}")
own = [(gi+1, t) for gi, (g, t) in enumerate(zip(groups(ks['KH0517']), T)) if any(v(c) == t for c in g)]
allvals = collections.Counter(v(c) for c in ks["KH0517"]["cords"] if v(c))
print("KH0517 cords equal to own group total:", own, "| KH0517 cords equal to any matched total:", [t for t in hit if allvals[t]])
# (b1) other totals-bearing khipus
print("\n(b1) KH0517 totals vs heads of other khipus:")
for kid in sorted(ks):
    if kid in ("KH0517",): continue
    m, h = match(T, heads(ks[kid]))
    if m: print(f"  {kid} {ks[kid]['aliases'][0]}: {m} {h}")
# (b2) shift
sh = []
for s in list(range(-200, 0)) + list(range(1, 201)):
    sh.append(match(T, [x + s for x in H])[0])
sh = np.array(sh); print(f"\n(b2) shift null over 400 shifts: mean {sh.mean():.3f}, max {sh.max()}, shifts with >=2: {np.sum(sh>=2)}")
# (b3) cord shuffle within equal-size groups
g17 = [[v(c) for c in g] for g in groups(ks["KH0517"])]
flat = np.array([x for g in g17 for x in g]); lens = [len(g) for g in g17]
nn = []
for _ in range(10000):
    p = rng.permutation(flat); i = 0; tt = []
    for L in lens: tt.append(int(p[i:i+L].sum())); i += L
    nn.append(match(tt, H)[0])
nn = np.array(nn); print(f"(b3) KH0517 cord-shuffle null: mean {nn.mean():.3f}, max {nn.max()}, P(>= {n}) = {(np.sum(nn>=n)+1)/10001:.5f}")
# unordered too
nu = []
Hs = set(H)
for _ in range(10000):
    p = rng.permutation(flat); i = 0; c = 0
    for L in lens:
        t = int(p[i:i+L].sum()); i += L; c += (t >= 1000 and t in Hs)
    nu.append(c)
nu = np.array(nu); print(f"     unordered hits: mean {nu.mean():.3f}, max {nu.max()}")
# (b4) every Inkawasi khipu's group totals vs KH0502 heads & KH0514 heads
print("\n(b4) group totals of every Inkawasi khipu vs KH0502 heads (>=1000, ordered):")
for kid in sorted(ks):
    m, h = match(totals(ks[kid]), H)
    m2, _ = match(totals(ks[kid]), H14)
    if m or m2: print(f"  {kid} {ks[kid]['aliases'][0]}: vs KH0502 {m} {h} | vs KH0514 {m2}")

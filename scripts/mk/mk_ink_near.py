#!/usr/bin/env python3
"""Tolerant version of mk_ink_groups: head vs sum of the rest allowing one misread knot cluster
(|diff| = d*10^k, d in 1..9, and |diff| <= 5% of head) -- 'near'.  Null as before (non-blank values
shuffled across groups within khipu).  Then: colour of head in balanced (exact+near) vs clearly
unbalanced groups on the same khipu (does white mark the sum or just the head slot?); last-cord
mottling; blank-cord patterns (total+constant present, remainder blank = unfinished subtraction?)."""
import collections, json
import numpy as np
from mk_ink_common import *
ks = inkawasi(load_all()); rng = np.random.default_rng(2)
CONST = {"KH0503":15,"KH0491":15,"KH0504":10,"KH0492":10,"KH0514":47,"KH0502":47,"KH0506":47,"KH0505":208,
         "KH0513":17,"KH0511":17,"KH0512":30}
def onedigit(d):
    d = abs(d)
    while d and d % 10 == 0: d //= 10
    return 1 <= d <= 9
def cls(vals):
    if len(vals) < 3: return None
    d = vals[0] - sum(vals[1:])
    if d == 0: return "exact"
    if onedigit(d) and abs(d) <= 0.05 * vals[0]: return "near"
    return "no"
out = []; tot = collections.Counter(); rows = []
for kid, k in sorted(ks.items()):
    gs = groups(k); nz = [[c for c in g if v(c)] for g in gs]
    c = collections.Counter(cls([v(x) for x in g]) for g in nz)
    flat = [v(x) for g in nz for x in g]; lens = [len(g) for g in nz]
    nulls = []
    for _ in range(500):
        p = rng.permutation(flat); i = 0; n = 0
        for L in lens:
            seg = list(p[i:i+L]); i += L
            n += cls(seg) in ("exact", "near")
        nulls.append(n)
    nulls = np.array(nulls); obs = c["exact"] + c["near"]
    pv = (np.sum(nulls >= obs) + 1) / 501
    if obs or kid in CONST:
        out.append(f"{kid} {k['aliases'][0]:7s} elig {sum(len(g)>=3 for g in nz):3d} exact {c['exact']:3d} near {c['near']:3d} no {c['no']:3d} | null exact+near {nulls.mean():.2f} p={pv:.3f}")
    for gi, g in enumerate(nz):
        r = cls([v(x) for x in g])
        if r: rows.append((kid, gi+1, r, [v(x) for x in g], [x.get("color") for x in g]))
    tot.update(c)
out.append(f"TOTAL {dict(tot)}")
# colour of head: balanced vs unbalanced, per khipu
out.append("\n== head colour: balanced (exact/near) vs unbalanced groups, same khipu ==")
agg = collections.Counter()
for kid in sorted(ks):
    R = [r for r in rows if r[0] == kid]
    b = [r for r in R if r[2] != "no"]; u = [r for r in R if r[2] == "no"]
    if not b: continue
    bw = sum(r[4][0] == "W" for r in b); uw = sum(r[4][0] == "W" for r in u)
    # unbalanced groups where head is also the largest cord
    ul = [r for r in u if r[3][0] == max(r[3])]; ulw = sum(r[4][0] == "W" for r in ul)
    agg["bw"] += bw; agg["b"] += len(b); agg["uw"] += uw; agg["u"] += len(u); agg["ulw"] += ulw; agg["ul"] += len(ul)
    out.append(f"{kid} {ks[kid]['aliases'][0]:7s} balanced head W {bw}/{len(b)} | unbalanced head W {uw}/{len(u)} (head-is-largest {ulw}/{len(ul)})")
out.append(f"pooled balanced head W {agg['bw']}/{agg['b']} = {agg['bw']/agg['b']:.2f}; unbalanced head W {agg['uw']}/{agg['u']} = {agg['uw']/max(agg['u'],1):.2f}; unbalanced & head largest {agg['ulw']}/{agg['ul']}")
# summands white vs head white in balanced groups
bal = [r for r in rows if r[2] != "no"]
out.append(f"balanced groups {len(bal)}: head W {sum(r[4][0]=='W' for r in bal)}; any summand W {sum(any(c=='W' for c in r[4][1:]) for r in bal)}; "
           f"last cord mottled(':') {sum(':' in (r[4][-1] or '') for r in bal)}; middle cords mottled {sum(':' in (c or '') for r in bal for c in r[4][1:-1])}/{sum(len(r[4])-2 for r in bal)}")
mult = [r for r in bal if len(r[3]) >= 4]
out.append(f"balanced with >=3 summands: {len(mult)}; last mottled {sum(':' in (r[4][-1] or '') for r in mult)}; head W {sum(r[4][0]=='W' for r in mult)}; "
           f"constant as 2nd cord {sum(CONST.get(r[0]) == r[3][1] for r in mult)}; largest summand is last {sum(r[3][-1]==max(r[3][1:]) for r in mult)}")
for r in mult: out.append(f"   {r[0]} g{r[1]} {r[2]}: " + " ".join(f"{a}/{b}" for a, b in zip(r[3], r[4])))
# constant slot colour vs remainder slot on 3-cord balanced groups of the 'ledger' khipus
out.append("\n== blank-cord patterns (all cords incl. blanks) on constant-bearing khipus ==")
for kid, cst in CONST.items():
    k = ks[kid]; pat = collections.Counter()
    for g in groups(k):
        vs = [v(c) for c in g]
        if not any(vs): continue
        head = next((x for x in vs if x), 0)
        hascst = cst in vs
        rest = [x for x in vs if x and x != head and x != cst]
        blanks = vs.count(0)
        if hascst and vs[0] and not rest and blanks: pat["total+const, remainder blank"] += 1
        elif hascst and not vs[0] and rest: pat["total blank, const+remainder"] += 1
        elif not hascst and vs[0] and rest: pat["total+remainder, no const"] += 1
        elif hascst and vs[0] and rest: pat["all three"] += 1
        else: pat["other"] += 1
    out.append(f"{kid} {k['aliases'][0]:7s} const {cst}: {dict(pat)}")
open(f"{OUT}/mk_ink_near.txt","w").write("\n".join(out)); print("\n".join(out))

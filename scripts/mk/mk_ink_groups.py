#!/usr/bin/env python3
"""Reconcile three readings of Inkawasi group arithmetic (Clindaniel 2019 a-b=c colour=operation;
Medrano & Khosla 2024 a=b+c+..., white=sum; ours head = fixed + remainder(s)).
For every group (level-1 pendants) on every Incahuasi khipu: does the head (first non-blank cord)
equal the sum of the other non-blank cords? does any cord? does the group hold the khipu's constant?
what colour is each role?  Null: non-blank values shuffled across groups within khipu, group sizes and
blank positions kept (1000 reps), for the per-khipu count of groups with any one-cord-equals-rest sum.
Output: $OUT/mk_ink_groups.txt and mk_ink_groups.json"""
import json, collections, itertools, sys
import numpy as np
from mk_ink_common import *

ks = inkawasi(load_all())
rng = np.random.default_rng(1)

def any_sum(vals):
    """indices i (in nz list) where vals[i] == sum(others), len>=3"""
    s = sum(vals)
    return [i for i, x in enumerate(vals) if len(vals) >= 3 and 2 * x == s]

def subset_head(vals):
    h, rest = vals[0], vals[1:]
    if len(rest) > 14: return False
    for r in range(2, len(rest)):
        for comb in itertools.combinations(rest, r):
            if sum(comb) == h: return True
    return False

def constant_of(k):
    """value 5..500 that sits in >=3 groups as a non-head cord and is < 1/3 of those heads"""
    cnt = collections.Counter()
    for g in groups(k):
        nz = [v(c) for c in g if v(c)]
        if len(nz) < 2: continue
        for x in set(nz[1:]):
            if 5 <= x <= 500 and x * 3 < nz[0]: cnt[x] += 1
    if not cnt: return None, 0
    c, n = cnt.most_common(1)[0]
    return (c, n) if n >= 3 else (None, n)

def mottled(col): return ":" in (col or "")
def white(col): return col == "W"

rows = []; per = {}
out = []
for kid, k in sorted(ks.items()):
    const, nconst = constant_of(k)
    gs = groups(k)
    nzvals = [[v(c) for c in g if v(c)] for g in gs]
    nelig = sum(len(x) >= 3 for x in nzvals)
    hs = anys = subs = 0
    for gi, g in enumerate(gs):
        nzc = [c for c in g if v(c)]
        vals = [v(c) for c in nzc]
        if len(vals) < 3: continue
        head_sum = vals[0] == sum(vals[1:])
        idx = any_sum(vals)
        sub = (not head_sum) and subset_head(vals)
        hs += head_sum; anys += bool(idx); subs += sub
        rows.append(dict(kid=kid, alias=k["aliases"][0], g=gi + 1, vals=vals, cols=[c.get("color") for c in nzc],
                         blanks=sum(1 for c in g if not v(c)), head_sum=head_sum, sum_idx=idx, subset=sub,
                         const=const, has_const=(const in vals[1:]) if const else False))
    # null: shuffle nonzero values across groups (keep sizes & blanks)
    flat = [x for s in nzvals for x in s]; lens = [len(s) for s in nzvals]
    null = []
    if nelig:
        for _ in range(1000):
            p = rng.permutation(flat); i = 0; n = 0
            for L in lens:
                seg = list(p[i:i + L]); i += L
                if L >= 3 and any_sum(seg): n += 1
            null.append(n)
    null = np.array(null) if null else np.zeros(1)
    pv = (np.sum(null >= anys) + 1) / (len(null) + 1)
    per[kid] = dict(alias=k["aliases"][0], groups=len(gs), elig=nelig, head_sum=hs, any_sum=anys, subset=subs,
                    const=const, nconst=nconst, null_mean=float(null.mean()), null_p=float(pv))
    out.append(f"{kid} {k['aliases'][0]:7s} groups {len(gs):3d} elig(>=3 nz) {nelig:3d} head=rest {hs:3d} any=rest {anys:3d} "
               f"head=subset {subs:3d} const {const}({nconst}) null any=rest {null.mean():.2f} p={pv:.3f}")

# ---- colour analysis on groups where some cord = sum of the rest
out.append("\n== colour of the sum cord (groups where one cord = sum of rest; exact) ==")
S = [r for r in rows if r["sum_idx"]]
tab = collections.Counter()
strat = []
for kid in sorted(ks):
    rs = [r for r in S if r["kid"] == kid]
    if not rs: continue
    k = ks[kid]
    allc = [c.get("color") for c in k["cords"] if c.get("level") == 1 and v(c)]
    wbase = np.mean([white(c) for c in allc])
    sumw = [white(r["cols"][r["sum_idx"][0]]) for r in rs]
    summ = [white(c) for r in rs for j, c in enumerate(r["cols"]) if j != r["sum_idx"][0]]
    # position control: head of non-sum eligible groups
    ns = [r for r in rows if r["kid"] == kid and not r["sum_idx"]]
    headw_ns = [white(r["cols"][0]) for r in ns]
    # magnitude control: largest cord of non-sum groups
    bigw_ns = [white(r["cols"][int(np.argmax(r["vals"]))]) for r in ns]
    lastm = [mottled(r["cols"][-1]) for r in rs if r["sum_idx"][0] == 0]
    midm = [mottled(c) for r in rs if r["sum_idx"][0] == 0 for c in r["cols"][1:-1]]
    strat.append((kid, len(rs), sum(sumw), wbase, summ, headw_ns, bigw_ns))
    out.append(f"{kid} {k['aliases'][0]:7s} sum-groups {len(rs):3d} sumcord W {sum(sumw):3d}/{len(rs)} | khipu W base {wbase:.2f} | "
               f"summands W {np.mean(summ) if summ else float('nan'):.2f} | non-sum heads W {np.mean(headw_ns) if headw_ns else float('nan'):.2f} (n={len(headw_ns)}) "
               f"| non-sum largest W {np.mean(bigw_ns) if bigw_ns else float('nan'):.2f} | last cord mottled {sum(lastm)}/{len(lastm)} vs middle {sum(midm)}/{len(midm)}")
    for r in rs: tab[r["cols"][r["sum_idx"][0]]] += 1
out.append(f"sum-cord colours pooled: {tab.most_common(12)}")
# stratified expected W count if sum cords were drawn at khipu base rate
obs = sum(s[2] for s in strat); exp = sum(s[1] * s[3] for s in strat)
var = sum(s[1] * s[3] * (1 - s[3]) for s in strat)
out.append(f"pooled: sum cords white {obs} of {sum(s[1] for s in strat)}; expected at each khipu's own W base rate {exp:.1f} (z={(obs-exp)/np.sqrt(var):.2f})")
# excluding khipus where W is the base colour of everything (>=60%)
st2 = [s for s in strat if s[3] < 0.6]
o2 = sum(s[2] for s in st2); e2 = sum(s[1] * s[3] for s in st2); v2 = sum(s[1]*s[3]*(1-s[3]) for s in st2)
out.append(f"  khipus with W base <0.6 only: {o2} of {sum(s[1] for s in st2)} vs expected {e2:.1f} (z={(o2-e2)/np.sqrt(max(v2,1e-9)):.2f})")

# ---- which cord is the sum: position
pos = collections.Counter()
for r in S:
    i = r["sum_idx"][0]; n = len(r["vals"])
    pos["first" if i == 0 else "last" if i == n - 1 else "middle"] += 1
out.append(f"sum cord position among non-blank cords: {dict(pos)}")

# ---- Clindaniel colour grammar test within head=rest groups
out.append("\n== Clindaniel light(+)/dark(-)/mottled(result) test on head=rest groups ==")
light_sub = 0; nsub = 0; clind3 = 0; n3 = 0; lastmott = 0; nH = 0; W_sub_groups = 0
for r in S:
    if r["sum_idx"][0] != 0: continue
    nH += 1
    subs = r["cols"][1:-1]; res = r["cols"][-1]
    lastmott += mottled(res)
    ls = [c for c in subs if c == "W" or (c or "").startswith("W")]
    light_sub += len(ls); nsub += len(subs); W_sub_groups += bool(ls)
    if len(r["vals"]) == 3:
        n3 += 1
        clind3 += (r["cols"][0] == "W" and not (subs[0] or "").startswith("W") and mottled(res))
out.append(f"head=rest groups {nH}: last cord mottled {lastmott}; subtracted (middle) cords that are white or white-containing {light_sub}/{nsub} "
           f"in {W_sub_groups} groups; strict W/dark/mottled triples {clind3}/{n3} three-cord groups")

# ---- multi-summand
multi = [r for r in S if r["sum_idx"][0] == 0 and len(r["vals"]) >= 4]
out.append(f"head=rest groups with >=3 summands: {len(multi)} on {sorted(set(r['kid'] for r in multi))}")

# ---- constant roles
out.append("\n== constants ==")
for kid, p in per.items():
    if p["const"]:
        rs = [r for r in rows if r["kid"] == kid]
        hc = [r for r in rs if r["has_const"]]
        bal = [r for r in hc if r["head_sum"]]
        cpos = collections.Counter(r["vals"].index(p["const"]) for r in hc)
        ccol = collections.Counter(r["cols"][r["vals"].index(p["const"])] for r in hc)
        out.append(f"{kid} {p['alias']:7s} const {p['const']}: in {len(hc)} eligible groups, balances {len(bal)}; position {dict(cpos)} colour {ccol.most_common(3)}")

open(f"{OUT}/mk_ink_groups.txt", "w").write("\n".join(out))
json.dump(dict(per=per, rows=rows), open(f"{OUT}/mk_ink_groups.json", "w"))
print("\n".join(out))

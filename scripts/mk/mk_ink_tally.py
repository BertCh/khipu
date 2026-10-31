#!/usr/bin/env python3
"""Scorecard for the three readings over all Inkawasi groups with >= 3 non-blank cords, using
mk_ink_near's exact/near classes.  Each reading's *extra* prediction beyond the shared arithmetic:
  M&K: the sum cord is white (tested against heads of unbalanced groups on the same khipus);
  Clindaniel: light total, dark subtracted, mottled result (strict W / non-W / ':' triple, and relaxed:
             no white-containing cord among the subtracted ones, last cord mottled);
  ours: the group holds the khipu's fixed value, in the same slot.
Also: groups UR255 writes as total, blank, 15 whose remainder UR267A holds."""
import collections, math
from mk_ink_common import *
exec(open(__file__.replace("mk_ink_tally.py", "mk_ink_near.py")).read().split("out = []; tot")[0])  # reuse cls, CONST, ks
rows = []
for kid, k in sorted(ks.items()):
    for gi, g in enumerate(groups(k)):
        nz = [c for c in g if v(c)]
        r = cls([v(c) for c in nz])
        if r: rows.append((kid, gi + 1, r, [v(c) for c in nz], [c.get("color") or "" for c in nz]))
bal = [r for r in rows if r[2] != "no"]; unb = [r for r in rows if r[2] == "no"]
print(f"groups with >=3 non-blank cords: {len(rows)}; balanced exact {sum(r[2]=='exact' for r in rows)}, near {sum(r[2]=='near' for r in rows)}")
led = [r for r in bal if r[0] in CONST]
print(f"balanced groups on the 11 constant-bearing khipus: {len(led)} of {len(bal)}")
# M&K
a = sum(r[4][0] == "W" for r in bal); b = sum(r[4][0] == "W" for r in unb)
def fisher(a, n1, b, n2):
    from math import comb
    K = a + b; N = n1 + n2
    p = lambda x: comb(n1, x) * comb(n2, K - x) / comb(N, K)
    p0 = p(a); return sum(p(x) for x in range(max(0, K - n2), min(K, n1) + 1) if p(x) <= p0 + 1e-12)
print(f"M&K white sum cord: balanced heads W {a}/{len(bal)}; unbalanced heads W {b}/{len(unb)}; Fisher p={fisher(a,len(bal),b,len(unb)):.3f}")
ledu = [r for r in unb if r[0] in CONST]
a2 = sum(r[4][0] == "W" for r in led); b2 = sum(r[4][0] == "W" for r in ledu)
print(f"   same, constant-bearing khipus only: {a2}/{len(led)} vs {b2}/{len(ledu)}; Fisher p={fisher(a2,len(led),b2,len(ledu)):.3f}")
nowhite = [r for r in bal if not any(c == 'W' for c in r[4])]
print(f"   balanced groups with no white cord at all: {len(nowhite)} (khipus {sorted(set(r[0] for r in nowhite))})")
# Clindaniel
strict = [r for r in bal if len(r[3]) == 3 and r[4][0] == "W" and not r[4][1].startswith("W") and ":" in r[4][2]]
relaxed = [r for r in bal if r[4][0].startswith("W") and not any(c.startswith("W") for c in r[4][1:-1]) and ":" in r[4][-1]]
wsub = [r for r in bal if any(c.startswith("W") for c in r[4][1:-1])]
print(f"Clindaniel strict triple: {len(strict)} {[(r[0], r[1]) for r in strict]}; relaxed (W-ish head, no W-ish subtracted, mottled last): {len(relaxed)}; "
      f"groups where a subtracted cord is W-ish (contradiction): {len(wsub)}")
# ours
hc = [r for r in led if CONST[r[0]] in r[3][1:] or (r[0] == 'KH0506' and any(x in (44, 46, 47) for x in r[3][1:]))]
slot = collections.Counter((r[0], r[3].index(CONST[r[0]]) if CONST[r[0]] in r[3] else -1) for r in hc)
print(f"ours: balanced groups on constant khipus holding the constant: {len(hc)}/{len(led)}")
for kid in CONST:
    L = [r for r in led if r[0] == kid]; H = [r for r in hc if r[0] == kid]
    if L: print(f"   {kid} {ks[kid]['aliases'][0]:7s} {len(H)}/{len(L)} slots {collections.Counter(r[3].index(CONST[kid]) + 1 if CONST[kid] in r[3] else 0 for r in H)}")
# UR255 blanks vs UR267A remainders
A = {vals[0]: vals for vals in ([v(c) for c in g if v(c)] for g in groups(ks["KH0503"])) if vals}
print("\nUR255 groups 'total, blank, 15' and what UR267A holds for the same total:")
for gi, g in enumerate(groups(ks["KH0491"])):
    vs = [v(c) for c in g]
    if len(vs) >= 3 and vs[0] and vs[1] == 0 and vs[2] == 15:
        print(f"   g{gi+1}: {vs}  UR267A: {A.get(vs[0])}")

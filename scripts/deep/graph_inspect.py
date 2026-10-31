#!/usr/bin/env python3
"""Print two khipus side by side: level-1 values by group, and the shared values >= 10 with corpus df.
    python3 graph_inspect.py KH0502 KH0506 [KHa KHb ...]"""
import sys, collections
from graph_common import *
ks = {k["id"]: k for k in load()}
df = collections.Counter()
for k in ks.values():
    if k["id"] in NOVALUE: continue
    for v in {c.get("value") or 0 for c in k["cords"]}: df[v] += 1
def grouped(k):
    g = collections.defaultdict(list)
    for c in level1(k): g[c.get("group")].append(c.get("value") or 0)
    return [g[x] for x in sorted(g, key=lambda x: (x is None, x))]
args = sys.argv[1:]
for a, b in zip(args[::2], args[1::2]):
    A, B = ks[a], ks[b]
    va = collections.Counter(c.get("value") or 0 for c in A["cords"]); vb = collections.Counter(c.get("value") or 0 for c in B["cords"])
    sh = sorted(v for v in set(va) & set(vb) if v >= 10)
    print(f"==== {a} ({A['provenance']}; {institution(A)[:25]} {A['museum'].get('number')}; {A['contributors']}) vs {b} ({B['provenance']}; {institution(B)[:25]} {B['museum'].get('number')}; {B['contributors']})")
    print("  shared>=10 (value:df):", " ".join(f"{v}:{df[v]}" for v in sh))
    for lab, K in ((a, A), (b, B)):
        print(f"  {lab} L1:", " | ".join(" ".join(map(str, g)) for g in grouped(K))[:900])

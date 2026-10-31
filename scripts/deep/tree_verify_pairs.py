"""Verify candidate pairs from tree_subtree_match with a whole-khipu statistic:
information-weighted sum over DISTINCT values >= 100 shared by the two khipus.
Null: matched random pairs — all khipu pairs whose product of distinct-value
counts is within x/÷1.5 of the candidate's; empirical p = rank."""
import sys, collections, itertools
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, val, value_info

ks = load(); INFO, _ = value_info(ks)
S = {k["id"]: {val(c) for c in k["cords"] if val(c) >= 100} for k in ks}
ids = sorted(S)
inv = collections.defaultdict(list)
for kid, vs in S.items():
    for v in vs:
        inv[v].append(kid)
score = collections.Counter()
for v, lst in inv.items():
    if len(lst) > 60:
        continue
    for a, b in itertools.combinations(sorted(lst), 2):
        score[(a, b)] += INFO[v]
n = {k: len(v) for k, v in S.items()}
cands = [("KH0165", "KH0196"), ("KH0502", "KH0506"), ("KH0044", "KH0046"), ("KH0127", "KH0517")] + \
        [tuple(x.split("-")) for x in sys.argv[1:]]
for a, b in cands:
    obs = score.get(tuple(sorted((a, b))), 0.0)
    prod = n[a] * n[b]
    pool = [score.get((x, y), 0.0) for x, y in itertools.combinations(ids, 2)
            if prod / 1.5 <= n[x] * n[y] <= prod * 1.5 and {x, y} != {a, b}]
    pool = np.array(pool)
    shared = sorted(S[a] & S[b])
    print(f"{a}-{b}: shared distinct >=100: {len(shared)} {shared[:20]} score={obs:.1f}; matched-pairs null n={len(pool)} mean={pool.mean():.1f} sd={pool.std():.1f} p={((pool>=obs).sum()+1)/(len(pool)+1):.5f}")

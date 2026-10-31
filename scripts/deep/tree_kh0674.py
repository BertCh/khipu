"""KH0674 (UR297, Dumbarton Oaks): 38 eleven-pendant groups; is cord 6 (the
odd-coloured centre cord) the total of the other ten?
Null: permute level-1 pendant values within the khipu (5000 perms)."""
import sys, json, collections
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import build_tree, val, DATA

rng = np.random.default_rng(3)
k = json.loads((DATA / "KH0674.json").read_text())
l1, ch = build_tree(k)
G = collections.defaultdict(list)
for c in l1:
    if c["kind"] == "pendant":
        G[c["group"]].append(c)
g11 = [cs for g, cs in sorted(G.items()) if len(cs) == 11]
V = np.array([[val(c) for c in cs] for cs in g11])
def ssum(c):
    return val(c) + sum(ssum(x) for x in ch.get(c["name"], []))
VS = np.array([[ssum(c) for c in cs] for cs in g11])
colours = [[c["color"] for c in cs] for cs in g11]
centre_odd = sum(1 for cl in colours if cl[5] != cl[4] and cl[5] != cl[6])
print("groups of 11:", len(g11), " centre colour differs from both flanks:", centre_odd)
def stat(V):
    mid = V[:, 5]; rest = V.sum(1) - mid
    return ((mid == rest) & (mid > 0)).sum(), ((np.abs(mid - rest) <= 2) & (mid > 0)).sum()
o = stat(V)
print("exact centre = sum(other 10):", o[0], " within ±2:", o[1])
print("groups exact:", [i + 1 for i in range(len(g11)) if V[i, 5] == V[i].sum() - V[i, 5] and V[i, 5] > 0])
flat = V.flatten(); N = 5000; ne = np.zeros(N); nn = np.zeros(N)
for t in range(N):
    P = rng.permutation(flat).reshape(V.shape)
    ne[t], nn[t] = stat(P)
print(f"null (values permuted over all 418 cells): exact {ne.mean():.2f}±{ne.std():.2f} p={((ne>=o[0]).sum()+1)/(N+1):.4f}; ±2 {nn.mean():.2f}±{nn.std():.2f} p={((nn>=o[1]).sum()+1)/(N+1):.4f}")
# any other position as the total?
for p in range(11):
    m = V[:, p]; r = V.sum(1) - m
    print(p + 1, int(((m == r) & (m > 0)).sum()), end="; ")
print()
# centre vs other positions magnitude
print("mean value by position:", V.mean(0).round(1).tolist())
print("with subsidiaries included, exact:", stat(VS)[0])
gnum = [g + 1 for g, cs in sorted(G.items()) if len(cs) == 11]
for i in range(len(g11)):
    m, r = VS[i, 5], VS[i].sum() - VS[i, 5]
    if m == r and m > 0:
        print(" subs-incl exact: KFG group", gnum[i], "centre", g11[i][5]["name"], m, "pend-only", V[i, 5], V[i].sum() - V[i, 5])

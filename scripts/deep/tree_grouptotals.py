"""(d) Group-total cords: a pendant equal to the sum of the other pendants of its
group. Tested at FIRST, LAST and INTERIOR positions for groups with >=3
level-1 pendants and >=2 nonzero non-total pendants.
Null: permute level-1 pendant values within the khipu (group sizes and
positions fixed), 1000 perms; statistic = number of qualifying groups."""
import sys, json, collections
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val, OUT

rng = np.random.default_rng(11)
NP = 1000
ks = load()


def count(v, starts, ends, need_info):
    """v: (P, n) value matrix; returns dict pos-> (P,) counts of qualifying groups, and
    for the observed (P==1) the list of hits."""
    out = {"FIRST": 0, "LAST": 0, "INTERIOR": 0}
    for s, e in zip(starts, ends):
        g = v[:, s:e]
        tot = g.sum(1)
        nzc = (g > 0).sum(1)
        f = (2 * g[:, 0] == tot) & (g[:, 0] >= need_info) & (nzc >= 3)
        l = (2 * g[:, -1] == tot) & (g[:, -1] >= need_info) & (nzc >= 3)
        mid = ((2 * g[:, 1:-1] == tot[:, None]) & (g[:, 1:-1] >= need_info)).any(1) & (nzc >= 3)
        out["FIRST"] = out["FIRST"] + f
        out["LAST"] = out["LAST"] + l
        out["INTERIOR"] = out["INTERIOR"] + (mid & ~f & ~l)
    return out


tot_obs = collections.Counter(); tot_null = collections.defaultdict(lambda: np.zeros(NP))
hits = []; perk = {}; ngroups = 0
for k in ks:
    l1, ch = build_tree(k)
    pend = [c for c in l1 if c["kind"] == "pendant"]
    if len(pend) < 3:
        continue
    v = np.array([val(c) for c in pend])
    gids = [c["group"] for c in pend]
    starts, ends = [], []
    i = 0
    while i < len(pend):
        j = i
        while j < len(pend) and gids[j] == gids[i]:
            j += 1
        if j - i >= 3:
            starts.append(i); ends.append(j)
        i = j
    if not starts:
        continue
    ngroups += len(starts)
    o = count(v[None, :], starts, ends, 10)
    perms = np.argsort(rng.random((NP, len(v))), axis=1)
    nl = count(v[perms], starts, ends, 10)
    for r in o:
        ov = int(np.asarray(o[r]).sum()); tot_obs[r] += ov; tot_null[r] += nl[r]
    kobs = {r: int(np.asarray(o[r]).sum()) for r in o}
    kp = {r: float(((nl[r] >= kobs[r]).sum() + 1) / (NP + 1)) for r in o}
    perk[k["id"]] = (kobs, kp, len(starts))
    for s, e in zip(starts, ends):
        g = v[s:e]; t = g.sum()
        for pi in range(e - s):
            if 2 * g[pi] == t and g[pi] >= 10 and (g > 0).sum() >= 3:
                hits.append((k["id"], "g%d" % (gids[s] + 1), pend[s + pi]["name"], pi + 1, e - s, int(g[pi])))
print("groups tested (>=3 pendants):", ngroups)
for r in ["FIRST", "LAST", "INTERIOR"]:
    n = tot_null[r]
    print(f"{r:8s} obs={tot_obs[r]:4d} null={n.mean():6.2f}±{n.std():5.2f} p={((n>=tot_obs[r]).sum()+1)/(NP+1):.4f}")
sig = {kid: d for kid, d in perk.items() if any(d[0][r] >= 2 and d[1][r] <= 0.01 for r in d[0])}
print("khipus with >=2 group-total cords at one position, p<=0.01:")
for kid, d in sorted(sig.items()):
    print("  ", kid, d)
byk = collections.Counter(h[0] for h in hits)
print("hits by khipu:", byk.most_common(30))
for h in hits:
    if byk[h[0]] <= 2:
        print("  single", h)
json.dump({"hits": hits, "perk": perk}, open(OUT / "grouptotals.json", "w"))

# split: Inkawasi vs rest (provenance contains Incahuasi/Inkawasi)
ink = {k["id"] for k in ks if "ncahuasi" in (k.get("provenance") or "") or "nkawasi" in (k.get("provenance") or "")}
for label, sel in (("Inkawasi", lambda kid: kid in ink), ("non-Inkawasi", lambda kid: kid not in ink)):
    ob = collections.Counter(); nl = collections.defaultdict(lambda: np.zeros(NP))
    for k in ks:
        if not sel(k["id"]):
            continue
        l1, ch = build_tree(k)
        pend = [c for c in l1 if c["kind"] == "pendant"]
        if len(pend) < 3:
            continue
        v = np.array([val(c) for c in pend]); gids = [c["group"] for c in pend]
        starts, ends = [], []; i = 0
        while i < len(pend):
            j = i
            while j < len(pend) and gids[j] == gids[i]:
                j += 1
            if j - i >= 3:
                starts.append(i); ends.append(j)
            i = j
        if not starts:
            continue
        o = count(v[None, :], starts, ends, 10)
        perms = np.argsort(rng.random((NP, len(v))), axis=1)
        nn = count(v[perms], starts, ends, 10)
        for r in o:
            ob[r] += int(np.asarray(o[r]).sum()); nl[r] += nn[r]
    print(label, {r: (ob[r], round(nl[r].mean(), 2), round(nl[r].std(), 2), round(((nl[r] >= ob[r]).sum() + 1) / (NP + 1), 4)) for r in ob})

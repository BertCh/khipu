"""(a) Cross-khipu matching of whole group-subtrees.

Unit = a pendant group (level-1 pendants of one group, each with its full
subsidiary subtree). Signature:
  shape  = tuple of canonical subtree shapes of the pendants, e.g. ('()', '(())', '()')
  values = DFS-ordered values (pendant, then its subsidiaries recursively)
  colour = DFS colours relabelled by first occurrence (isomorphic pattern)
Two groups in different khipus match if they have the same shape (fwd, or
reversed pendant order) and share >=2 DISTINCT informative values (score =
sum of their info, each distinct value counted once) at the same DFS
positions (value >= 10; weight = -log2 corpus frequency).
Index: (orientation-normalised shape, dfs position, value) -> groups; so we
never do all-pairs.
Null: shuffle pendant-subtrees (with their values/colours) across the whole
corpus among pendants of identical subtree shape, keeping every group's shape;
20 shuffles. Statistic: # khipu pairs whose best group match has score >= S.
"""
import sys, json, collections, itertools, math
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val, value_info, curated_pairs, scan_pairs, OUT

rng = np.random.default_rng(5)
ks = load()
INFO, CNT = value_info(ks)


def subtree(c, ch):
    kids = ch.get(c["name"], [])
    shp = "(" + "".join(subtree(x, ch)[0] for x in kids) + ")"
    vals = [val(c)]; cols = [c.get("color") or "?"]
    for x in kids:
        _, v, cl = subtree(x, ch)
        vals += v; cols += cl
    return shp, vals, cols


# units: list of pendant subtrees; groups: list of (kid, gnum, [unit idx])
units = []  # (shape, vals, cols)
groups = []
for k in ks:
    l1, ch = build_tree(k)
    G = collections.defaultdict(list)
    for c in l1:
        if c["kind"] == "pendant":
            G[c["group"]].append(c)
    for g, cs in sorted(G.items()):
        idx = []
        for c in cs:
            units.append(subtree(c, ch)); idx.append(len(units) - 1)
        groups.append((k["id"], g + 1, idx, cs[0]["name"]))
print("groups:", len(groups), "pendant subtrees:", len(units))


def relabel(cols):
    m = {}
    return tuple(m.setdefault(x, len(m)) for x in cols)


def run(units, collect=False, S_list=(8, 12, 16, 20, 25, 30)):
    index = collections.defaultdict(list)
    meta = []
    for gi, (kid, gnum, idx, first) in enumerate(groups):
        for orient in ("f", "r"):
            order = idx if orient == "f" else idx[::-1]
            shape = tuple(units[u][0] for u in order)
            if len(order) < 2 or (orient == "r" and shape == tuple(units[u][0] for u in idx) and len(order) == 1):
                continue
            vals = [v for u in order for v in units[u][1]]
            for p, v in enumerate(vals):
                if v >= 10:
                    index[(shape, p, v)].append((gi, orient))
    pairs = collections.defaultdict(list)  # (gi,gj,orient) -> [info...]
    for key, lst in index.items():
        if len(lst) < 2 or len(lst) > 200:
            continue
        w = INFO[key[2]]
        for (a, oa), (b, ob) in itertools.combinations(lst, 2):
            if groups[a][0] == groups[b][0]:
                continue
            if oa == "r" and ob == "r":
                continue  # r-r duplicates f-f
            if oa == ob:
                o = "fwd"
                if a > b:
                    a, b = b, a
            else:
                o = "rev"
                if oa == "r":
                    a, b = b, a  # a is the forward group
                if a > b:
                    continue  # (b f, a r) is the same alignment as (a f, b r)
            pairs[(a, b, o)].append((w, key[1], key[2]))
    best = {}
    detail = {}
    for (a, b, o), lst in pairs.items():
        dv = {}
        for w, p, v in lst:
            dv[v] = w
        if len(dv) < 2:
            continue  # need >=2 DISTINCT shared informative values
        sc = sum(dv.values())
        kp = tuple(sorted((groups[a][0], groups[b][0])))
        if sc > best.get(kp, (0,))[0]:
            best[kp] = (sc, a, b, o, lst)
    counts = {S: sum(1 for v in best.values() if v[0] >= S) for S in S_list}
    return best, counts


best, counts = run(units)
print("observed khipu pairs with best group-subtree match score >= S:", counts)

# null: shuffle subtrees among same-shape pendants corpus-wide
byshape = collections.defaultdict(list)
for i, u in enumerate(units):
    byshape[u[0]].append(i)
NS = 20
nulls = collections.defaultdict(list); null_max = []
for t in range(NS):
    perm = list(range(len(units)))
    for shp, lst in byshape.items():
        sh = rng.permutation(lst)
        for a, b in zip(lst, sh):
            perm[a] = b
    u2 = [units[perm[i]] for i in range(len(units))]
    b2, c2 = run(u2)
    for S, n in c2.items():
        nulls[S].append(n)
    null_max.append(max((v[0] for v in b2.values()), default=0))
for S in counts:
    a = np.array(nulls[S])
    print(f"  S>={S}: obs {counts[S]}  null {a.mean():.1f}±{a.std():.1f}")
print("null max score per shuffle:", np.round(null_max, 1).tolist())
thr = max(null_max)

cur = curated_pairs(); scn = scan_pairs()
known = cur | scn
# positive control recall at each threshold
for S in (8, 12, 16, 20, 25, thr):
    hit_c = sum(1 for p in cur if p in best and best[p][0] >= S)
    print(f"  recall at S>={S:.1f}: curated {hit_c}/{len(cur)}  scan {sum(1 for p in scn if p in best and best[p][0]>=S)}/{len(scn)}")
print("curated pairs missed entirely:", sorted(p for p in cur if p not in best))

rows = []
for kp, (sc, a, b, o, lst) in sorted(best.items(), key=lambda x: -x[1][0]):
    if sc < thr:
        break
    ga, gb = groups[a], groups[b]
    shape = "".join(units[u][0] for u in ga[2])
    ca = relabel([c for u in ga[2] for c in units[u][2]])
    idxb = gb[2] if o == "fwd" else gb[2][::-1]
    cb = relabel([c for u in idxb for c in units[u][2]])
    rows.append(dict(a=kp[0], b=kp[1], score=round(sc, 1), orient=o, ga=f"{ga[0]} g{ga[1]} ({ga[3]}..)", gb=f"{gb[0]} g{gb[1]} ({gb[3]}..)",
                     shape=shape, nshared=len(lst), shared=[(p, v) for _, p, v in lst], colour_iso=ca == cb,
                     known=kp in known, curated=kp in cur))
print(f"pairs above null max ({thr:.1f}): {len(rows)}; unknown: {sum(1 for r in rows if not r['known'])}")
for r in rows:
    if not r["known"]:
        print("  NEW", r)
for r in rows:
    if r["known"]:
        print("  known", r["a"], r["b"], r["score"], r["orient"], r["ga"], r["gb"], r["shape"], r["nshared"])
json.dump(rows, open(OUT / "subtree_matches.json", "w"), indent=1)

"""(c) Top cords: which sum rule do they obey corpus-wide?

For each level-1 top cord T (value>0) we compute candidate targets from the
pendants (level-1 non-top cords) of the same khipu:
  SAME   sum of pendants in T's own group
  PREV / NEXT  sum of pendants of group g-1 / g+1
  SAME+S own group incl. all subsidiary values
  ALL    all pendants of the khipu
  ADJL_k / ADJR_k  k consecutive pendants immediately left/right of T (any k<=40)
Null: T's value replaced by a top-cord value drawn from the other khipus' top
cords (empirical distribution); expected hits = sum_T P(draw == target set).
Near misses (±1, or single-digit register slip) are listed as candidate data errors."""
import sys, json, collections
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val, OUT

ks = load()
tops = []
for k in ks:
    l1, ch = build_tree(k)
    pend = [c for c in l1 if c["kind"] == "pendant"]
    if not pend:
        continue
    def subtree_sum(c):
        s = val(c)
        for x in ch.get(c["name"], []):
            s += subtree_sum(x)
        return s
    bygroup = collections.defaultdict(list)
    for c in pend:
        bygroup[c["group"]].append(c)
    for i, T in enumerate(l1):
        if T["kind"] != "top" or val(T) <= 0:
            continue
        g = T["group"]
        tg = {}
        tg["SAME"] = sum(val(c) for c in bygroup.get(g, []))
        tg["SAME+S"] = sum(subtree_sum(c) for c in bygroup.get(g, []))
        tg["PREV"] = sum(val(c) for c in bygroup.get(g - 1, []))
        tg["NEXT"] = sum(val(c) for c in bygroup.get(g + 1, []))
        tg["ALL"] = sum(val(c) for c in pend)
        L = [val(c) for c in reversed(l1[:i]) if c["kind"] == "pendant"]
        R = [val(c) for c in l1[i + 1:] if c["kind"] == "pendant"]
        tg["ADJL"] = set(np.cumsum(L[:40]).tolist()) if L else set()
        tg["ADJR"] = set(np.cumsum(R[:40]).tolist()) if R else set()
        # which k for adjacency hits
        kl = next((j + 1 for j, s in enumerate(np.cumsum(L[:40])) if s == val(T)), None) if L else None
        kr = next((j + 1 for j, s in enumerate(np.cumsum(R[:40])) if s == val(T)), None) if R else None
        tops.append(dict(kid=k["id"], name=T["name"], g=g, v=val(T), tg=tg, kl=kl, kr=kr,
                         nsame=len(bygroup.get(g, [])), ngroups=len(k["groups"])))

print("top cords with value>0:", len(tops), "in", len({t["kid"] for t in tops}), "khipus")
vals_by_k = collections.defaultdict(list)
for t in tops:
    vals_by_k[t["kid"]].append(t["v"])
allv = np.array([t["v"] for t in tops])

def p_hit(t, targets):
    other = allv[[tt["kid"] != t["kid"] for tt in tops]]
    tset = targets if isinstance(targets, set) else {targets}
    tset = {x for x in tset if x > 0}
    return np.isin(other, list(tset)).mean()

rules = ["SAME", "SAME+S", "PREV", "NEXT", "ALL", "ADJL", "ADJR"]
res = {}
for r in rules:
    hits = []; exp = 0.0; var = 0.0
    for t in tops:
        tgt = t["tg"][r]
        h = (t["v"] in tgt) if isinstance(tgt, set) else (t["v"] == tgt and tgt > 0)
        if h:
            hits.append(t)
        p = p_hit(t, tgt); exp += p; var += p * (1 - p)
    res[r] = hits
    print(f"{r:7s} hits={len(hits):4d} khipus={len({h['kid'] for h in hits}):3d}  null exp={exp:6.1f} sd={var**.5:5.1f} z={(len(hits)-exp)/max(var**.5,1e-9):6.1f}")

# which rule each khipu's tops obey (majority)
byk = collections.defaultdict(list)
for t in tops:
    byk[t["kid"]].append(t)
kr = collections.Counter(); ktab = {}
for kid, ts in byk.items():
    best = max(rules, key=lambda r: sum((t["v"] in t["tg"][r]) if isinstance(t["tg"][r], set) else t["v"] == t["tg"][r] for t in ts))
    nb = sum((t["v"] in t["tg"][best]) if isinstance(t["tg"][best], set) else t["v"] == t["tg"][best] for t in ts)
    ktab[kid] = (best if nb else "none", nb, len(ts))
    kr[best if nb else "none"] += 1
print("khipu majority rule:", dict(kr))
print({k: v for k, v in ktab.items() if v[1]})
# adjacency k and relation to own-group
print("ADJL k:", collections.Counter(t["kl"] for t in res["ADJL"]).most_common(10))
print("ADJR k:", collections.Counter(t["kr"] for t in res["ADJR"]).most_common(10))
same_pos = collections.Counter()
for t in res["ADJL"] + res["ADJR"]:
    same_pos["adj==own group size" if (t["kl"] == t["nsame"] or t["kr"] == t["nsame"]) else "other"] += 1
print(same_pos)

# near misses for fixed rules
def slip(a, b):
    sa, sb = str(a), str(b)
    n = max(len(sa), len(sb)); sa, sb = sa.zfill(n), sb.zfill(n)
    diff = [i for i in range(n) if sa[i] != sb[i]]
    return len(diff) == 1
near = []
hit_ids = {(t["kid"], t["name"]) for r in rules for t in res[r]}
for t in tops:
    if (t["kid"], t["name"]) in hit_ids:
        continue
    for r in ["SAME", "PREV", "NEXT", "SAME+S"]:
        x = t["tg"][r]
        if x >= 20 and t["v"] >= 20 and (abs(x - t["v"]) == 1 or slip(x, t["v"])) and abs(x - t["v"]) < 0.5 * max(x, t["v"]):
            near.append((t["kid"], t["name"], "g%d" % (t["g"] + 1), r, t["v"], x))
            break
# null for near misses: same test with value from other khipus' tops
exp_near = 0.0
for t in tops:
    other = allv[[tt["kid"] != t["kid"] for tt in tops]]
    ok = np.zeros(len(other), bool)
    for r in ["SAME", "PREV", "NEXT", "SAME+S"]:
        x = t["tg"][r]
        if x >= 20:
            ok |= np.array([(o >= 20 and (abs(x - o) == 1 or slip(x, o)) and abs(x - o) < 0.5 * max(x, o)) for o in other])
    exp_near += ok.mean()
print(f"near misses (not already exact under any rule): {len(near)}  null exp={exp_near:.1f}")
for n in near:
    print("  ", n)
json.dump({"tops": [{**t, "tg": {r: (sorted(v) if isinstance(v, set) else v) for r, v in t["tg"].items()}} for t in tops],
           "near": near, "khipu_rule": ktab}, open(OUT / "topcords.json", "w"), default=int)

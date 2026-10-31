"""(d2) Position-by-position group sums inside a khipu (Ascher "summary group"):
target group T (m pendants) whose cord p equals the sum of cord p over a set
of other same-size groups; the set is a contiguous run of >=2 groups or an
arithmetic progression (stride d>=2, >=2 groups) — the KH0192 part-2/part-3
form. A target qualifies if >= max(3, 60% of m) positions match exactly with
target value >= 10.
Null: permute pendant values within the khipu (group sizes fixed), 10 perms."""
import sys, json, collections, math
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val, OUT

rng = np.random.default_rng(13)
NP = 10


def scan(M, sizes, collect=False):
    G = len(sizes)
    best = {}  # target -> (nmatch, desc)
    for m in set(sizes):
        if m < 3:
            continue
        need = max(3, math.ceil(0.6 * m))
        tg = [i for i in range(G) if sizes[i] == m]
        if len(tg) < 3:
            continue
        T = M[tg, :m]
        Tinf = T >= 10
        for d in range(1, G):
            for s in range(G):
                if sizes[s] != m:
                    continue
                acc = M[s, :m].copy(); mx = acc.copy(); members = [s]
                j = s + d
                while j < G and sizes[j] == m:
                    acc = acc + M[j, :m]; mx = np.maximum(mx, M[j, :m]); members.append(j)
                    # a match must be a genuine sum: target > every single member
                    # (rules out copies of a group plus all-zero groups)
                    eq = ((T == acc[None, :]) & Tinf & (T > mx[None, :])).sum(1)
                    for ti in np.nonzero(eq >= need)[0]:
                        t = tg[ti]
                        if t in members:
                            continue
                        if eq[ti] > best.get(t, (0,))[0]:
                            best[t] = (int(eq[ti]), (s, d, len(members), tuple(members)))
                    j += d
                    if len(members) > 40:
                        break
    return best


ks = load()
tot_obs = 0; tot_null = np.zeros(NP); rows = []
for k in ks:
    l1, ch = build_tree(k)
    G = collections.defaultdict(list)
    for c in l1:
        if c["kind"] == "pendant":
            G[c["group"]].append(val(c))
    gl = [G[g] for g in sorted(G)]
    gnums = sorted(G)
    sizes = [len(x) for x in gl]
    if len(gl) < 3 or len(gl) > 160:
        continue
    mm = max(sizes)
    M = np.zeros((len(gl), mm), int)
    for i, x in enumerate(gl):
        M[i, :len(x)] = x
    b = scan(M, sizes)
    flat = np.concatenate([np.array(x) for x in gl])
    nulls = []
    for t in range(NP):
        p = rng.permutation(flat); Mp = np.zeros_like(M); o = 0
        for i, n in enumerate(sizes):
            Mp[i, :n] = p[o:o + n]; o += n
        nulls.append(len(scan(Mp, sizes)))
    tot_obs += len(b); tot_null += np.array(nulls)
    if b:
        rows.append(dict(kid=k["id"], nobs=len(b), null=float(np.mean(nulls)), nullmax=int(max(nulls)),
                         hits=[(f"g{gnums[t]+1}", n, sizes[t], "= " + "+".join(f"g{gnums[x]+1}" for x in mem), [int(v) for v in M[t, :sizes[t]]], [int(v) for v in M[list(mem), :sizes[t]].sum(0)]) for t, (n, (s, d, L, mem)) in sorted(b.items())]))
print(f"target groups that are position-wise sums: obs {tot_obs}  null {tot_null.mean():.1f}±{tot_null.std():.1f} (per-perm totals {tot_null.tolist()})")
rows.sort(key=lambda r: -(r["nobs"] - r["null"]))
for r in rows:
    flag = "SIG" if r["nobs"] > r["nullmax"] else "   "
    print(flag, r["kid"], "obs", r["nobs"], "null mean", r["null"], "max", r["nullmax"], r["hits"][:8])
json.dump(rows, open(OUT / "groupsums.json", "w"), indent=1)

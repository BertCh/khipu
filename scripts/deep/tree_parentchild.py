"""(b) Parent-child arithmetic inside each khipu.

For every cord with >=1 direct child (any level) we test relations between the
parent value P and its child values. Null: permute whole child-lists among the
parents of the same level within the same khipu (preserves both the parent
value multiset and each child list). Implemented by precomputing an n x n
relation matrix R[i,j] = "relation holds if child-list j hung from parent i"
and summing R[i, perm(i)] over 2000 permutations.
"""
import sys, json, collections
import numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from tree_common import load, build_tree, val, OUT

rng = np.random.default_rng(20260922)
NPERM = 2000


def digits(P):
    return {int(d) for d in str(P) if d != "0"}


def neigh_vals(l1, idx_by_name, name):
    i = idx_by_name.get(name)
    if i is None:
        return set()
    out = set()
    for j in (i - 1, i + 1):
        if 0 <= j < len(l1):
            v = val(l1[j])
            if v:
                out.add(v)
    return out


def rels(P, kids, nb):
    """kids: list of child values. nb: set of neighbour level-1 values (for l1 parents)."""
    nz = [v for v in kids if v]
    S = sum(nz)
    r = {}
    r["EQ"] = P >= 10 and any(v == P for v in nz)
    r["EQsmall"] = 0 < P < 10 and any(v == P for v in nz)
    r["SUM"] = P > 0 and len(nz) >= 2 and S == P
    r["DIGIT"] = P >= 10 and len(nz) >= 1 and all(v <= 9 and v in digits(P) for v in nz)
    r["REM"] = P >= 100 and any(v == P % 10 ** e and v >= 10 for v in nz for e in range(2, 6))
    r["LEAD"] = P >= 100 and any(v == P // 10 ** e and v >= 10 for v in nz for e in range(1, 5))
    r["HALF"] = P >= 10 and any(2 * v == P or v == 2 * P for v in nz)
    r["ADD_NB"] = P > 0 and S > 0 and (P + S) in nb and (P + S) >= 10
    r["SUB_NB"] = P > 0 and S > 0 and (P - S) in nb and (P - S) >= 10
    r["CHILD_GT"] = P > 0 and S > P  # descriptive only
    return r


RELS = ["EQ", "EQsmall", "SUM", "DIGIT", "REM", "LEAD", "HALF", "ADD_NB", "SUB_NB", "CHILD_GT"]


def main():
    ks = load()
    per_k = {}
    tot_obs = collections.Counter()
    tot_null = {r: np.zeros(NPERM) for r in RELS}
    examples = collections.defaultdict(list)
    for k in ks:
        l1, ch = build_tree(k)
        idx = {c["name"]: i for i, c in enumerate(l1)}
        bylev = collections.defaultdict(list)
        for c in k["cords"]:
            if ch.get(c["name"]):
                bylev[c["level"]].append(c)
        kobs = collections.Counter(); knull = {r: np.zeros(NPERM) for r in RELS}
        npar = 0
        for lev, pars in bylev.items():
            n = len(pars)
            npar += n
            Pv = [val(c) for c in pars]
            kids = [[val(x) for x in ch[c["name"]]] for c in pars]
            nbs = [neigh_vals(l1, idx, c["name"]) if lev == 1 else set() for c in pars]
            R = {r: np.zeros((n, n), bool) for r in RELS}
            for i in range(n):
                for j in range(n):
                    rr = rels(Pv[i], kids[j], nbs[i])
                    for r in RELS:
                        R[r][i, j] = rr[r]
            for i in range(n):
                for r in RELS:
                    if R[r][i, i]:
                        kobs[r] += 1
                        if len(examples[r]) < 4000:
                            examples[r].append((k["id"], pars[i]["name"], Pv[i], kids[i]))
            if n > 1:
                perms = np.argsort(rng.random((NPERM, n)), axis=1)
                rows = np.arange(n)[None, :]
                for r in RELS:
                    knull[r] += R[r][rows, perms].sum(1)
            else:
                for r in RELS:
                    knull[r] += R[r][0, 0]
        if npar == 0:
            continue
        per_k[k["id"]] = {"npar": npar, "obs": dict(kobs),
                          "null": {r: (float(knull[r].mean()), float(knull[r].std()),
                                       float(((knull[r] >= kobs[r]).sum() + 1) / (NPERM + 1))) for r in RELS}}
        for r in RELS:
            tot_obs[r] += kobs[r]; tot_null[r] += knull[r]
    print("corpus totals (obs vs within-khipu child-list permutation null, %d perms)" % NPERM)
    summary = {}
    for r in RELS:
        m, s = tot_null[r].mean(), tot_null[r].std()
        p = ((tot_null[r] >= tot_obs[r]).sum() + 1) / (NPERM + 1)
        summary[r] = dict(obs=tot_obs[r], null_mean=m, null_sd=s, z=(tot_obs[r] - m) / (s or 1), p=p)
        print(f"  {r:8s} obs={tot_obs[r]:5d} null={m:8.1f}±{s:6.1f} z={(tot_obs[r]-m)/(s or 1):6.1f} p={p:.4f}")
    # classify khipus
    cls = collections.Counter(); klass = {}
    for kid, d in per_k.items():
        best = None
        for r in RELS:
            if r == "CHILD_GT":
                continue
            o = d["obs"].get(r, 0); m, s, p = d["null"][r]
            if o >= 3 and p <= 0.01:
                z = (o - m) / (s or 0.5)
                if best is None or z > best[1]:
                    best = (r, z, o, m, p)
        klass[kid] = best
        cls[best[0] if best else "none"] += 1
    print("khipus with subsidiaries:", len(per_k))
    print("dominant significant relation (obs>=3, per-khipu p<=0.01):", dict(cls))
    for r in RELS:
        lst = sorted(((kid, b) for kid, b in klass.items() if b and b[0] == r), key=lambda x: -x[1][1])
        if lst:
            print(r, [(kid, b[2], round(b[3], 1), round(b[4], 4)) for kid, b in lst[:25]])
    json.dump({"summary": summary, "per_khipu": per_k, "class": klass,
               "examples": {r: v for r, v in examples.items()}},
              open(OUT / "parentchild.json", "w"), default=float)


if __name__ == "__main__":
    main()

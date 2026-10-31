#!/usr/bin/env python3
"""Do value-linked khipus carry corresponding colours -- literally, or under a substitution?

For every pair in public/data/stories/links.json (exact shared value runs, >=4/5
consecutive level-1 values) take the aligned cord pairs inside the runs and
measure, on the colour channel:
  literal  - fraction of aligned cords with the identical colour string
  purity   - fraction of aligned cords explained by the best one-to-one
             colour mapping (Hungarian assignment on the contingency table);
             purity - literal = what a palette substitution adds.
Null (matched random alignment): the same span lengths placed at random
offsets in both khipus (same orientation), 2000 draws per pair.
"""
from __future__ import annotations

import collections
import json
import random

import numpy as np
from scipy.optimize import linear_sum_assignment

from iso_common import OUT, ROOT, load, curated_pairs


def aligned_pairs(p, na, nb):
    out = set()
    for n, i, j in p["spans"]:
        for t in range(n):
            jj = j + t if p["dir"] == "fwd" else j + n - 1 - t
            if i + t < na and 0 <= jj < nb:
                out.add((i + t, jj))
    return sorted(out)


def purity(xs, ys):
    ca, cb = sorted(set(xs)), sorted(set(ys))
    ia, ib = {c: k for k, c in enumerate(ca)}, {c: k for k, c in enumerate(cb)}
    M = np.zeros((len(ca), len(cb)))
    for x, y in zip(xs, ys):
        M[ia[x], ib[y]] += 1
    r, c = linear_sum_assignment(-M)
    return M[r, c].sum() / len(xs)


def stats(A, B, al):
    xs = [A[i] for i, _ in al]
    ys = [B[j] for _, j in al]
    return sum(x == y for x, y in zip(xs, ys)) / len(al), purity(xs, ys)


def main():
    ks = {k["id"]: k for k in load()}
    d = json.loads((ROOT / "public/data/stories/links.json").read_text())
    cur = curated_pairs()
    rng = random.Random(3)
    rows = []
    for p in d["pairs"]:
        A, B = ks[p["a"]]["colour"], ks[p["b"]]["colour"]
        al = aligned_pairs(p, len(A), len(B))
        if len(al) < 8:
            continue
        lit, pur = stats(A, B, al)
        nl, npu = [], []
        for _ in range(2000):
            rand = []
            for n, i, j in p["spans"]:
                if n > min(len(A), len(B)):
                    continue
                i2, j2 = rng.randrange(len(A) - n + 1), rng.randrange(len(B) - n + 1)
                rand.append((n, i2, j2))
            ral = aligned_pairs({"spans": rand, "dir": p["dir"]}, len(A), len(B))
            if len(ral) < 4:
                continue
            l2, p2 = stats(A, B, ral)
            nl.append(l2); npu.append(p2)
        nl, npu = np.array(nl), np.array(npu)
        # null 2: random offsets constrained to the same position-in-group phase
        ga, gb = ks[p["a"]]["gpos"], ks[p["b"]]["gpos"]
        gsa, gsb = ks[p["a"]]["group"], ks[p["b"]]["group"]
        np2 = []
        for _ in range(2000):
            rand = []
            for n, i, j in p["spans"]:
                if n > min(len(A), len(B)):
                    continue
                for _t in range(200):
                    i2, j2 = rng.randrange(len(A) - n + 1), rng.randrange(len(B) - n + 1)
                    jj = j2 if p["dir"] == "fwd" else j2 + n - 1
                    if ga[i2] == gb[jj] and (i2, j2) != (i, j):
                        break
                rand.append((n, i2, j2))
            ral = aligned_pairs({"spans": rand, "dir": p["dir"]}, len(A), len(B))
            if len(ral) >= 4:
                np2.append(stats(A, B, ral)[1])
        np2 = np.array(np2)
        ct = collections.Counter((A[i], B[j]) for i, j in al)
        rows.append({"a": p["a"], "b": p["b"], "dir": p["dir"], "n": len(al),
                     "curated": tuple(sorted((p["a"], p["b"]))) in cur,
                     "literal": round(lit, 3), "lit_null": round(nl.mean(), 3), "p_lit": float((nl >= lit).mean()),
                     "purity": round(pur, 3), "pur_null": round(npu.mean(), 3), "pur_sd": round(npu.std(), 3),
                     "p_pur": float((npu >= pur).mean()),
                     "pur_phase_null": round(np2.mean(), 3), "p_pur_phase": float((np2 >= pur).mean()),
                     "subst_gain": round(pur - lit, 3), "top_map": ct.most_common(8)})
    rows.sort(key=lambda r: r["p_pur"])
    for r in rows:
        print(f"{r['a']} {r['b']} {r['dir']} n={r['n']:3d} {'C' if r['curated'] else ' '} "
              f"lit {r['literal']:.2f} (null {r['lit_null']:.2f} p={r['p_lit']:.3f})  "
              f"purity {r['purity']:.2f} (null {r['pur_null']:.2f}±{r['pur_sd']:.2f} p={r['p_pur']:.3f})  gain {r['subst_gain']:.2f}  phase-null {r['pur_phase_null']:.2f} p={r['p_pur_phase']:.3f}")
        print("      ", r["top_map"])
    sig = [r for r in rows if r["p_pur"] < 0.01]
    lit_sig = [r for r in sig if r["p_lit"] < 0.01 and r["subst_gain"] < 0.15]
    sub = [r for r in sig if r["subst_gain"] >= 0.3]
    print(f"\n{len(rows)} pairs; colour-structure significant (p_pur<0.01): {len(sig)};"
          f" of which mostly literal: {len(lit_sig)}; substitution (gain>=0.3): {len(sub)}")
    (OUT / "iso_aligned.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()

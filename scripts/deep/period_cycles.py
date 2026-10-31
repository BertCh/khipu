#!/usr/bin/env python3
"""Per-khipu periodicity of level-1 values, colours and group sizes.

Statistic for cycle length L: eta^2 of the phase factor (i mod L) — the fraction of variance
(values: log1p) or the mutual information (colours) explained by position-in-cycle.
Null: the same khipu's sequence shuffled (P perms).  z(L) = (obs - null mean)/null sd;
family-wise p = share of perms whose max_L z >= observed max_L z.
Fundamental = smallest L dividing L* whose z >= 0.7 z(L*).
Positive control: synthetic period injected into shuffled real sequences.

    python3 scripts/deep/period_cycles.py
"""
from __future__ import annotations
import collections, json, sys
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from period_common import load, level1, base_colour, EXCLUDE_VALUES, OUT, rng

P = 300
LMAX = 40
R = rng()


def onehot_phase(n, L):
    M = np.zeros((n, L)); M[np.arange(n), np.arange(n) % L] = 1; return M


def eta_values(X, L):
    """X: (m, n) rows = sequences. returns eta^2 per row."""
    n = X.shape[1]; M = onehot_phase(n, L); cnt = M.sum(0)
    s = X @ M
    tot = X.sum(1); ss = ((X - X.mean(1, keepdims=True)) ** 2).sum(1)
    between = (s ** 2 / cnt).sum(1) - tot ** 2 / n
    return np.where(ss > 0, between / np.maximum(ss, 1e-12), 0)


def mi_colours(perm_idx, codes, L):
    """perm_idx: (m, n) permutations of positions; codes int array (n,). MI(phase; colour)."""
    n = len(codes); K = codes.max() + 1
    ph = np.arange(n) % L
    m = perm_idx.shape[0]
    cc = codes[perm_idx]                      # (m, n) colour at position
    flat = (np.arange(m)[:, None] * L * K + ph[None, :] * K + cc).ravel()
    T = np.bincount(flat, minlength=m * L * K).reshape(m, L, K) / n
    pr = T.sum(2, keepdims=True); pc = T.sum(1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(T > 0, T * np.log(T / (pr * pc)), 0)
    return t.sum((1, 2))


def scan(obs_fn, n):
    Ls = list(range(2, min(LMAX, n // 3) + 1))
    Z = []; OBS = []
    for L in Ls:
        v = obs_fn(L)               # (P+1,) first = observed
        mu, sd = v[1:].mean(), v[1:].std() + 1e-12
        Z.append((v - mu) / sd); OBS.append(v[0])
    Z = np.array(Z)                 # (nL, P+1)
    zmax = Z.max(0)
    p = (1 + (zmax[1:] >= zmax[0]).sum()) / (P + 1)
    best = int(np.argmax(Z[:, 0])); Lb = Ls[best]; z0 = Z[:, 0]
    fund = min([L for i, L in enumerate(Ls) if Lb % L == 0 and z0[i] >= 0.7 * z0[best]] + [Lb])
    null_best = [Ls[i] for i in np.argmax(Z[:, 1:], 0)]
    return dict(p=p, Lbest=Lb, fund=fund, zmax=float(z0[best]), eta=float(OBS[best]),
                z={L: round(float(z0[i]), 2) for i, L in enumerate(Ls)}), null_best


def analyse_values(x):
    n = len(x)
    X = np.vstack([x] + [R.permutation(x) for _ in range(P)])
    return scan(lambda L: eta_values(X, L), n)


def analyse_colours(codes):
    n = len(codes)
    idx = np.vstack([np.arange(n)] + [R.permutation(n) for _ in range(P)])
    return scan(lambda L: mi_colours(idx, codes, L), n)


def main():
    ks = load()
    rows = []; nullbest_v = collections.Counter(); nullbest_c = collections.Counter()
    for k in ks:
        cs = level1(k)
        n = len(cs)
        if n < 24:
            continue
        gs = [g["n"] for g in k["groups"] if g["n"] > 0]
        modal = collections.Counter(gs).most_common(1)[0][0] if gs else None
        row = dict(id=k["id"], n=n, nGroups=len(gs), modalGroup=modal,
                   modalShare=round(collections.Counter(gs).most_common(1)[0][1] / len(gs), 2) if gs else 0)
        vals = np.array([c.get("value") or 0 for c in cs], float)
        if k["id"] not in EXCLUDE_VALUES and (vals > 0).sum() >= 12 and len(set(vals)) >= 4:
            r, nb = analyse_values(np.log1p(vals)); row["values"] = r
            nullbest_v.update(nb)
        cols = [base_colour(c) for c in cs]
        u = {c: i for i, c in enumerate(sorted(set(cols)))}
        if len(u) >= 2:
            r, nb = analyse_colours(np.array([u[c] for c in cols]))
            row["colours"] = r; nullbest_c.update(nb)
        rows.append(row)
    json.dump(dict(rows=rows, nullbest_v=nullbest_v, nullbest_c=nullbest_c), open(OUT / "cycles.json", "w"))

    # ---- positive control: inject period into shuffled real value sequences
    pc = collections.Counter()
    elig = [r for r in rows if "values" in r]
    kmap = {k["id"]: k for k in ks}
    for trial in range(120):
        r = elig[R.integers(len(elig))]
        vals = np.log1p(np.array([c.get("value") or 0 for c in level1(kmap[r["id"]])], float))
        x = R.permutation(vals); L = int(R.choice([4, 5, 6, 7, 10, 12]))
        tmpl = R.permutation(vals)[:L]
        mask = R.random(len(x)) < 0.4          # 40% of cords follow the cycle
        x[mask] = tmpl[np.arange(len(x))[mask] % L]
        res, _ = analyse_values(x)
        pc["n"] += 1; pc["det"] += res["p"] < 0.01; pc["exactL"] += (res["p"] < 0.01 and res["fund"] == L)
    print("positive control (40% of cords periodic):", dict(pc))

    for kind, nb in (("values", nullbest_v), ("colours", nullbest_c)):
        sig = [r for r in rows if kind in r and r[kind]["p"] < 0.01]
        tot = [r for r in rows if kind in r]
        print(f"\n== {kind}: {len(sig)}/{len(tot)} khipus periodic at family-wise p<0.01 "
              f"(expected by chance {0.01*len(tot):.1f})")
        fc = collections.Counter(r[kind]["fund"] for r in sig)
        aligned = sum(1 for r in sig if r["modalGroup"] and (r[kind]["fund"] == r["modalGroup"] or r[kind]["Lbest"] == r["modalGroup"]))
        print(f"   fundamental L aligned with modal group size: {aligned}/{len(sig)}")
        print("   fundamental L counts:", sorted(fc.items()))
        nbt = sum(nb.values())
        print("   null best-L share (%):", {L: round(100 * c / nbt, 1) for L, c in sorted(nb.items()) if L <= 14})
        for r in sorted(sig, key=lambda r: -r[kind]["zmax"])[:25]:
            print(f"   {r['id']} n={r['n']} groups={r['nGroups']} modal={r['modalGroup']}({r['modalShare']}) "
                  f"L*={r[kind]['Lbest']} fund={r[kind]['fund']} z={r[kind]['zmax']:.1f} eta={r[kind]['eta']:.2f}")


if __name__ == "__main__":
    main()

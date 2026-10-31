#!/usr/bin/env python3
"""Cross-khipu sum equalities: a value in A equals a sum built from B.

Targets (A): distinct values >= VMIN of any cord (pendant/top/subsidiary), plus
A's group sums and A's khipu total.
Sources (B): sums of contiguous pendant runs (length 2..40, >= 2 non-zero terms),
group sums, same-colour sums (raw colour string), column sums (position p across
groups, >= 3 groups), subsidiary sums under one pendant, khipu total.
A target value that is also a plain cord value in B is dropped (that is value
sharing, not arithmetic).

Expected count per (A, v, B): local density of B's source sums around v, taken
within the same trailing-digit class (last digit if non-zero, else number of
trailing zeros), window v*(1 +- W).  Directed pair statistic: k = matched
distinct target values, lambda = sum of expected; Poisson tail p.

Null: every khipu's pendant values permuted within the khipu (positions, group
sizes, colours, subsidiaries kept), full pipeline rerun.

    python3 scripts/deep/arith_sums.py [n_null]
"""
from __future__ import annotations

import collections
import json
import sys
import time

import numpy as np
from scipy.stats import poisson

from arith_common import SCRATCH, known_pairs, load, pendants

VMIN = 100
MAXRUN = 40
W = 0.15
FRAC = {("z", 1): 9 / 100, ("z", 2): 9 / 1000, ("z", 3): 1 / 1000}


def dkey(v: np.ndarray) -> np.ndarray:
    """Trailing-digit class: 0..9 last digit (non-zero), 11,12,13 = 1,2,>=3 trailing zeros."""
    v = np.asarray(v, dtype=np.int64)
    k = v % 10
    z = (v % 10 == 0).astype(int) + (v % 100 == 0) + (v % 1000 == 0)
    return np.where(k != 0, k, 10 + z)


def keyfrac(key: np.ndarray) -> np.ndarray:
    return np.where(key < 10, 0.1, np.where(key == 11, 0.09, np.where(key == 12, 0.009, 0.001)))


def structure(ks: dict, rng: np.random.Generator | None = None):
    """Per khipu: pendant values (maybe permuted), groups, colours, subsidiaries."""
    out = {}
    for kid, k in ks.items():
        ps = pendants(k)
        vals = np.array([int(c.get("value") or 0) for c in ps], dtype=np.int64)
        if rng is not None:
            vals = rng.permutation(vals)
        byname = {c["name"]: i for i, c in enumerate(ps)}
        subs = collections.defaultdict(list)
        for c in k["cords"]:
            if c["level"] == 2 and c.get("parent") in byname:
                subs[byname[c["parent"]]].append(int(c.get("value") or 0))
        other = [(c["kind"], c["name"], int(c.get("value") or 0)) for c in k["cords"]
                 if not (c["level"] == 1 and c["kind"] == "pendant")]
        out[kid] = dict(vals=vals, group=[c["group"] for c in ps], colour=[c.get("color") or "" for c in ps],
                        names=[c["name"] for c in ps], subs=subs, other=other)
    return out


def sources(s: dict) -> dict[int, list[str]]:
    """value -> descriptors (only multi-term sums)."""
    v = s["vals"]
    n = len(v)
    src = collections.defaultdict(list)
    if n == 0:
        return src
    cs = np.concatenate([[0], np.cumsum(v)])
    nz = np.concatenate([[0], np.cumsum(v != 0)])
    for L in range(2, min(MAXRUN, n) + 1):
        sums = cs[L:] - cs[:-L]
        cnt = nz[L:] - nz[:-L]
        ok = np.nonzero((cnt >= 2) & (sums >= VMIN))[0]
        for i in ok:
            src[int(sums[i])].append(("run2-5" if L <= 5 else "run6-40", f"run p{i + 1}-p{i + L}"))
    g = collections.defaultdict(list)
    for i, gi in enumerate(s["group"]):
        g[gi].append(i)
    for gi, idx in g.items():
        if sum(1 for i in idx if v[i]) >= 2:
            src[int(v[idx].sum())].append(("group", f"group g{gi + 1}"))
    col = collections.defaultdict(list)
    for i, c in enumerate(s["colour"]):
        col[c].append(i)
    for c, idx in col.items():
        if len(idx) < len(v) and sum(1 for i in idx if v[i]) >= 2:
            src[int(v[idx].sum())].append(("colour", f"colour {c}"))
    if len(g) >= 3:
        gl = [g[k] for k in sorted(g)]
        for p in range(max(len(x) for x in gl)):
            idx = [x[p] for x in gl if len(x) > p]
            if len(idx) >= 3 and sum(1 for i in idx if v[i]) >= 2:
                src[int(v[idx].sum())].append(("column", f"column pos{p + 1}"))
    for i, sv in s["subs"].items():
        if sum(1 for x in sv if x) >= 2:
            src[int(sum(sv))].append(("subs", f"subs-of p{i + 1}"))
    if (v != 0).sum() >= 2:
        src[int(v.sum())].append(("total", "total"))
    return {k: d for k, d in src.items() if k >= VMIN}


def targets(s: dict) -> dict[int, list[str]]:
    v = s["vals"]
    t = collections.defaultdict(list)
    for i, x in enumerate(v):
        if x >= VMIN:
            t[int(x)].append(f"p{i + 1}")
    for kind, name, x in s["other"]:
        if x >= VMIN:
            t[x].append(f"{kind[:3]} {name}")
    g = collections.defaultdict(list)
    for i, gi in enumerate(s["group"]):
        g[gi].append(i)
    for gi, idx in g.items():
        x = int(v[idx].sum())
        if x >= VMIN and sum(1 for i in idx if v[i]) >= 2:
            t[x].append(f"gsum g{gi + 1}")
    if v.sum() >= VMIN:
        t[int(v.sum())].append("total")
    return t


def cordvals(s: dict) -> set[int]:
    return {int(x) for x in s["vals"]} | {x for _, _, x in s["other"]}


TYPES = ["run2-5", "run6-40", "group", "colour", "column", "subs", "total"]


def run(ks: dict, rng=None, keep_detail=False):
    """Per source type: K[t] (matched distinct target values), LAM[t] (expected)."""
    st = structure(ks, rng)
    ids = sorted(st)
    idx = {k: i for i, k in enumerate(ids)}
    SRC = {k: sources(st[k]) for k in ids}
    TGT = {k: targets(st[k]) for k in ids}
    CV = {k: cordvals(st[k]) for k in ids}
    tv, ta = [], []
    for k in ids:
        for v in TGT[k]:
            tv.append(v)
            ta.append(idx[k])
    tv = np.array(tv, dtype=np.int64)
    ta = np.array(ta)
    tkey = dkey(tv)
    lo = np.floor(tv * (1 - W)).astype(np.int64)
    hi = np.ceil(tv * (1 + W)).astype(np.int64)
    nint = (hi - lo + 1) * keyfrac(tkey)
    ukeys = np.unique(tkey)
    keysel = {key: tkey == key for key in ukeys}
    N = len(ids)
    K = {t: np.zeros((N, N)) for t in TYPES}
    LAM = {t: np.zeros((N, N)) for t in TYPES}
    matches = []
    for b in ids:
        bi = idx[b]
        cvb = np.fromiter(CV[b], dtype=np.int64)
        ok = (ta != bi) & ~np.isin(tv, cvb)
        for t in TYPES:
            sv = np.array(sorted(x for x, d in SRC[b].items() if x not in CV[b] and any(y[0] == t for y in d)), dtype=np.int64)
            if len(sv) == 0:
                continue
            skey = dkey(sv)
            lam = np.zeros(len(tv))
            for key in ukeys:
                arr = sv[skey == key]
                if len(arr) == 0:
                    continue
                sel = keysel[key]
                c = np.searchsorted(arr, hi[sel], "right") - np.searchsorted(arr, lo[sel], "left")
                lam[sel] = c / nint[sel]
            lam = np.where(ok, lam, 0.0)
            hit = ok & np.isin(tv, sv)
            LAM[t][:, bi] = np.bincount(ta, weights=lam, minlength=N)
            K[t][:, bi] = np.bincount(ta, weights=hit.astype(float), minlength=N)
            if keep_detail:
                for j in np.nonzero(hit)[0]:
                    matches.append((ids[ta[j]], int(tv[j]), b, float(lam[j]), t))
    return ids, K, LAM, matches, SRC, TGT


def pair_p(K, LAM):
    return poisson.sf(K - 1, np.maximum(LAM, 1e-12))


def main():
    nnull = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    t0 = time.time()
    ks = load()
    cur, scan = known_pairs()
    known = cur | scan
    ids, K, LAM, matches, SRC, TGT = run(ks, keep_detail=True)
    N = len(ids)
    ntest = N * (N - 1) * len(TYPES)
    thr = 0.05 / ntest
    idset = set(ids)
    kn_in = [pr for pr in known if pr <= idset]
    report = dict(thr=thr, types={})
    nulls = []
    for r in range(nnull):
        _, Kn, Ln, mn, _, _ = run(ks, rng=np.random.default_rng(100 + r), keep_detail=True)
        nulls.append((Kn, Ln, mn))
        print(f"null {r} done [{time.time() - t0:.0f}s]")
    for t in TYPES:
        P = pair_p(K[t], LAM[t])
        np.fill_diagonal(P, 1.0)
        mt = [m for m in matches if m[4] == t]
        big = sum(1 for m in mt if m[1] >= 1000)
        line = f"[{t}] equalities {K[t].sum():.0f} vs density-expected {LAM[t].sum():.0f} (ratio {K[t].sum() / max(LAM[t].sum(), 1e-9):.3f}); >=1000: {big}"
        nstat = []
        for Kn, Ln, mn in nulls:
            Pn = pair_p(Kn[t], Ln[t])
            np.fill_diagonal(Pn, 1.0)
            nstat.append(dict(k=float(Kn[t].sum()), lam=float(Ln[t].sum()), big=sum(1 for m in mn if m[4] == t and m[1] >= 1000),
                              nsig=int((Pn < thr).sum()), minp=float(Pn.min()), n1e5=int((Pn < 1e-5).sum())))
        print(line)
        for x in nstat:
            print(f"     null: k {x['k']:.0f} lam {x['lam']:.0f} >=1000 {x['big']} sigpairs {x['nsig']} p<1e-5 {x['n1e5']} minp {x['minp']:.1e}")
        sig = np.argwhere(P < thr)
        print(f"     observed sig pairs {len(sig)}, p<1e-5 {(P < 1e-5).sum()}, min p {P.min():.1e}")
        rows = []
        for a, b in np.argwhere(P < 1e-5):
            A, B = ids[a], ids[b]
            pr = frozenset((A, B))
            tag = "curated" if pr in cur else ("scan" if pr in scan else "NEW")
            eqs = sorted({(m[1], tuple(TGT[A][m[1]][:3]), tuple(d for tt, d in SRC[B][m[1]] if tt == t)[:3]) for m in mt if m[0] == A and m[2] == B}, reverse=True)
            rows.append(dict(a=A, b=B, k=int(K[t][a, b]), lam=float(LAM[t][a, b]), p=float(P[a, b]), tag=tag, sig=bool(P[a, b] < thr), eqs=eqs))
        rows.sort(key=lambda r: r["p"])
        for r_ in rows[:25]:
            print(f"   {r_['tag']:7} {r_['a']}->{r_['b']} k={r_['k']} lam={r_['lam']:.2f} p={r_['p']:.1e}{' SIG' if r_['sig'] else ''}")
            for e in r_["eqs"][:6]:
                print(f"          {e}")
        Pm = np.minimum(P, P.T)
        rec = sum(1 for pr in kn_in if Pm[ids.index(min(pr)), ids.index(max(pr))] < 1e-5)
        print(f"     known pairs with p<1e-5: {rec}/{len(kn_in)}")
        report["types"][t] = dict(k=float(K[t].sum()), lam=float(LAM[t].sum()), big=big, null=nstat, nsig=int(len(sig)), rows=rows, recall=rec, nknown=len(kn_in))
    json.dump(report, open(SCRATCH / "sums.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()

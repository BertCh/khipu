#!/usr/bin/env python3
"""Positional value grammar: is a cord's value predicted by its position within its group
(the 'column') after removing the group (row) mean?  I.e. which khipus are row x column tables.

Per khipu (value-readable, >=3 groups with >=2 cords): y = log1p(value) of level-1 cords;
column = 0-based position in group; only columns present in >=2 groups kept.
Statistic: partial R^2 of column given group, R2col = (RSS_group - RSS_group+col)/TSS.
Null: positions permuted within each group (keeps row means and group sizes), P perms.
Same for colour: MI(colour; column) with the same within-group-permutation null.
Positive controls: synthetic tables (row effect + column effect + noise) planted in shuffled
real khipus; and the corpus 'tabular' fraction.

Link screen: khipus whose column profiles (mean y by column, and colour-equality pattern of
columns) agree, for pairs with the same column count; null = columns of b permuted; recall on
curated known pairs reported.

    python3 scripts/deep/period_tables.py
"""
from __future__ import annotations
import collections, itertools, json, re, sys
import numpy as np
sys.path.insert(0, __import__("os").path.dirname(__file__))
from period_common import load, level1, base_colour, EXCLUDE_VALUES, OUT, rng, ROOT

P = 400
R = rng(11)


def design(g, c):
    gi = np.unique(g, return_inverse=True)[1]; ci = np.unique(c, return_inverse=True)[1]
    G = np.eye(gi.max() + 1)[gi]; C = np.eye(ci.max() + 1)[ci][:, 1:]
    return G, np.hstack([G, C])


def rss(X, Y):
    """Y: (n, m) columns = versions."""
    beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
    r = Y - X @ beta
    return (r ** 2).sum(0)


def within_group_perms(g, n_perm):
    idx = np.arange(len(g)); out = np.empty((n_perm, len(g)), int)
    groups = [np.where(g == u)[0] for u in np.unique(g)]
    for p in range(n_perm):
        perm = idx.copy()
        for gg in groups:
            perm[gg] = gg[R.permutation(len(gg))]
        out[p] = perm
    return out


def table_cells(k):
    cs = level1(k)
    by = collections.defaultdict(list)
    for c in cs:
        by[c["group"]].append(c)
    rows = [v for _, v in sorted(by.items()) if len(v) >= 2]
    if len(rows) < 3:
        return None
    colcount = collections.Counter(j for r in rows for j in range(len(r)))
    cells = [(gi, j, c) for gi, r in enumerate(rows) for j, c in enumerate(r) if colcount[j] >= 2]
    return rows, cells


def test_values(g, col, y):
    Xg, Xgc = design(g, col)
    perms = within_group_perms(g, P)
    # permuting positions within a group == permuting y within group while columns stay
    Y = np.column_stack([y] + [y[p] for p in perms])
    tss = ((y - y.mean()) ** 2).sum()
    if tss == 0:
        return None
    r2 = (rss(Xg, Y) - rss(Xgc, Y)) / tss
    return r2[0], (1 + (r2[1:] >= r2[0]).sum()) / (P + 1), r2[1:].mean(), r2[1:].std()


def mi(a, b):
    n = len(a); T = collections.Counter(zip(a, b)); A = collections.Counter(a); B = collections.Counter(b)
    return sum(v / n * np.log(v * n / (A[x] * B[z])) for (x, z), v in T.items())


def test_colours(g, col, cols):
    perms = within_group_perms(g, P)
    cols = np.asarray(cols)
    obs = mi(col.tolist(), cols.tolist())
    null = np.array([mi(col.tolist(), cols[p].tolist()) for p in perms])
    return obs, (1 + (null >= obs).sum()) / (P + 1), null.mean(), null.std()


def curated_pairs():
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    ids = re.findall(r"KH\d{4}", txt)
    pairs = set()
    # every curated link object lists its ids; take consecutive id pairs within one object literal
    for obj in re.findall(r"\{[^{}]*KH\d{4}[^{}]*KH\d{4}[^{}]*\}", txt):
        k = sorted(set(re.findall(r"KH\d{4}", obj)))
        pairs |= {tuple(p) for p in itertools.combinations(k, 2)}
    return pairs


def main():
    ks = load()
    res = []; profiles = {}
    for k in ks:
        tc = table_cells(k)
        if not tc:
            continue
        rows, cells = tc
        g = np.array([c[0] for c in cells]); col = np.array([c[1] for c in cells])
        row = dict(id=k["id"], nRows=len(rows), nCells=len(cells), nCols=int(col.max()) + 1,
                   modal=collections.Counter(len(r) for r in rows).most_common(1)[0][0])
        if k["id"] not in EXCLUDE_VALUES:
            y = np.log1p(np.array([c[2].get("value") or 0 for c in cells], float))
            if (y > 0).sum() >= 6:
                t = test_values(g, col, y)
                if t:
                    row["v"] = t
        cols = [base_colour(c[2]) for c in cells]
        if len(set(cols)) >= 2:
            row["c"] = test_colours(g, col, cols)
        res.append(row)
        # profile over the modal row length
        mrows = [r for r in rows if len(r) == row["modal"]]
        if len(mrows) >= 3 and row["modal"] >= 3:
            V = np.log1p(np.array([[c.get("value") or 0 for c in r] for r in mrows], float))
            C = [[base_colour(c) for c in r] for r in mrows]
            modecol = [collections.Counter(C[i][j] for i in range(len(C))).most_common(1)[0][0] for j in range(row["modal"])]
            profiles[k["id"]] = dict(L=row["modal"], v=V.mean(0) if k["id"] not in EXCLUDE_VALUES else None, c=modecol, nrows=len(mrows))

    json.dump(res, open(OUT / "tables.json", "w"), default=float)
    v = [r for r in res if "v" in r]; c = [r for r in res if "c" in r]
    sv = [r for r in v if r["v"][1] < 0.01]; sc = [r for r in c if r["c"][1] < 0.01]
    both = {r["id"] for r in sv} | {r["id"] for r in sc}
    print(f"eligible (>=3 groups of >=2 cords): {len(res)} of {len(ks)} khipus")
    print(f"value column effect p<0.01: {len(sv)}/{len(v)} (chance {0.01*len(v):.1f}); "
          f"colour column effect p<0.01: {len(sc)}/{len(c)} (chance {0.01*len(c):.1f}); either: {len(both)} "
          f"= {100*len(both)/len(res):.0f}% of eligible, {100*len(both)/len(ks):.0f}% of corpus")
    r2 = np.array([r["v"][0] for r in sv])
    print(f"   partial R2(column|row) among value-tabular: median {np.median(r2):.2f}, IQR {np.percentile(r2,25):.2f}-{np.percentile(r2,75):.2f}")
    print("   strongest value tables:")
    for r in sorted(sv, key=lambda r: -(r['v'][0] - r['v'][2]) / (r['v'][3] + 1e-9))[:20]:
        print(f"     {r['id']} rows={r['nRows']} modalRow={r['modal']} cells={r['nCells']} R2col={r['v'][0]:.2f} "
              f"null={r['v'][2]:.2f}+-{r['v'][3]:.2f} p={r['v'][1]:.4f}")

    # --- positive control: planted tables
    hits = 0; n = 0
    for _ in range(100):
        r = v[R.integers(len(v))]; k = next(x for x in ks if x["id"] == r["id"])
        rows, cells = table_cells(k)
        g = np.array([c[0] for c in cells]); col = np.array([c[1] for c in cells])
        y = R.permutation(np.log1p(np.array([c[2].get("value") or 0 for c in cells], float)))
        eff = R.normal(0, y.std() * 0.5, col.max() + 1)     # column effect sd = 0.5 x value sd
        t = test_values(g, col, y + eff[col]); n += 1; hits += bool(t and t[1] < 0.01)
    print(f"positive control (planted column effect, sd 0.5 of values): recall {hits}/{n}")

    # --- link screen on column profiles
    known = curated_pairs()
    lj = json.load(open(ROOT / "public/data/stories/links.json"))
    known |= {tuple(sorted((p["a"], p["b"]))) for p in lj["pairs"]}
    byL = collections.defaultdict(list)
    for kid, p in profiles.items():
        byL[p["L"]].append(kid)
    def cpat(cc):
        m = {}; return tuple(m.setdefault(x, len(m)) for x in cc)
    scored = []
    for L, ids in byL.items():
        if L < 4:
            continue
        for a, b in itertools.combinations(sorted(ids), 2):
            pa, pb = profiles[a], profiles[b]
            s_v = None
            if pa["v"] is not None and pb["v"] is not None and pa["v"].std() > 0 and pb["v"].std() > 0:
                s_v = np.corrcoef(pa["v"], pb["v"])[0, 1]
                null = np.array([np.corrcoef(pa["v"], R.permutation(pb["v"]))[0, 1] for _ in range(200)])
                p_v = (1 + (null >= s_v).sum()) / 201
            else:
                p_v = 1.0
            same_c = cpat(pa["c"]) == cpat(pb["c"]) and len(set(pa["c"])) > 1
            scored.append((p_v, s_v, same_c, L, a, b))
    npairs = len(scored)
    strong = [s for s in scored if s[0] < 0.005 and s[2]]
    kn = [s for s in scored if (s[4], s[5]) in known]
    print(f"\ncolumn-profile link screen: {npairs} same-row-length pairs (L>=4)")
    print(f"  known pairs testable: {len(kn)}; recovered at p_v<0.01: {sum(1 for s in kn if s[0]<0.01)}; "
          f"same colour pattern: {sum(1 for s in kn if s[2])}")
    for s in kn:
        print(f"     known {s[4]}-{s[5]} L={s[3]} r={s[1] if s[1] is None else round(s[1],2)} p={s[0]:.3f} sameColourPattern={s[2]}")
    print(f"  pairs with p_v<0.005: {sum(1 for s in scored if s[0]<0.005)} (expected {0.005*npairs:.1f} if independent); "
          f"with identical colour-equality pattern too: {len(strong)}")
    for s in sorted(strong)[:30]:
        print(f"     {s[4]}-{s[5]} L={s[3]} r={s[1]:.2f} p={s[0]:.3f} known={(s[4], s[5]) in known}")


if __name__ == "__main__":
    main()

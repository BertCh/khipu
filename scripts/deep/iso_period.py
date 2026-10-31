#!/usr/bin/env python3
"""Index of coincidence + Kasiski-style autocorrelation periodicity per khipu per channel.

For each khipu with >= MINN level-1 cords and each channel (colour, base colour,
knot-type signature, attachment, twist):
  IoC      sum n_i(n_i-1) / N(N-1)  -- the expected self-match rate of a random
           permutation of the same symbols (the permutation-null mean of A(p)).
  A(p)     fraction of i with s[i] == s[i+p], p = 1..PMAX
  p*       argmax_{p>=2} A(p);  statistic  D = max_p (A(p) - IoC)
  p-value  from NPERM within-khipu permutations of the channel (max-over-p, so
           the multiple-period search is inside the null).
Then: how often the colour period equals the modal cord-group size (or a
multiple of it), and which khipus have a colour period that does NOT match
their grouping (cycles running across group boundaries).
"""
from __future__ import annotations

import collections
import json

import numpy as np

from iso_common import OUT, load

MINN = 30
PMAX = 40
NPERM = 300
CHANNELS = ["colour", "base", "knot", "attach", "twist"]


def autocorr(codes, pmax):
    n = len(codes)
    return np.array([(codes[:-p] == codes[p:]).mean() if p < n else 0.0 for p in range(1, pmax + 1)])


def main():
    ks = [k for k in load() if k["n"] >= MINN]
    rng = np.random.default_rng(11)
    rows = []
    for k in ks:
        row = {"id": k["id"], "n": k["n"]}
        gs = [g for g in k["groups"] if g > 0]
        row["modal_group"] = collections.Counter(gs).most_common(1)[0][0] if gs else None
        row["group_cv"] = float(np.std(gs) / np.mean(gs)) if gs else None
        for ch in CHANNELS:
            s = k[ch]
            if sum(1 for x in s if x in ("?", None)) > 0.2 * len(s):
                continue
            _, codes = np.unique(np.array([str(x) for x in s]), return_inverse=True)
            cnt = np.bincount(codes)
            N = len(codes)
            if len(cnt) < 2:
                continue
            ioc = float((cnt * (cnt - 1)).sum() / (N * (N - 1)))
            pmax = min(PMAX, N // 3)
            A = autocorr(codes, pmax)
            ex = A[1:] - ioc  # p >= 2
            D = float(ex.max())
            pstar = int(np.argmax(ex)) + 2
            nd = np.empty(NPERM)
            for t in range(NPERM):
                c2 = rng.permutation(codes)
                nd[t] = (autocorr(c2, pmax)[1:] - ioc).max()
            row[ch] = {"ioc": round(ioc, 3), "k": int(len(cnt)), "A1": round(float(A[0]), 3),
                       "pstar": pstar, "A_pstar": round(float(A[pstar - 1]), 3), "D": round(D, 3),
                       "null_D": round(float(nd.mean()), 3), "null_sd": round(float(nd.std()), 3),
                       "p": float(((nd >= D).sum() + 1) / (NPERM + 1))}
        rows.append(row)
    summary = {}
    for ch in CHANNELS:
        rs = [r for r in rows if ch in r]
        sig = [r for r in rs if r[ch]["p"] < 0.01 and r[ch]["A_pstar"] >= 0.5]
        per = collections.Counter(r[ch]["pstar"] for r in sig)
        match = [r for r in sig if r["modal_group"] and r[ch]["pstar"] % r["modal_group"] == 0]
        summary[ch] = {"khipus": len(rs), "periodic_p01_A50": len(sig),
                       "top_periods": per.most_common(8), "period_multiple_of_modal_group": len(match),
                       "expected_false_pos": round(0.01 * len(rs), 1)}
        print(ch, summary[ch])
    # colour periodic but not aligned with grouping
    off = []
    for r in rows:
        c = r.get("colour")
        if not c or c["p"] >= 0.01 or c["A_pstar"] < 0.6 or not r["modal_group"]:
            continue
        if c["pstar"] % r["modal_group"] and r["modal_group"] % c["pstar"]:
            off.append((r["id"], r["n"], c["pstar"], c["A_pstar"], r["modal_group"], round(r["group_cv"], 2)))
    print("colour period not a multiple/divisor of modal group size:", len(off))
    for o in off:
        print("  ", o)
    # channel coupling: among colour-periodic khipus, is the knot channel periodic with the same p?
    both = [r for r in rows if "colour" in r and "knot" in r and r["colour"]["p"] < 0.01 and r["colour"]["A_pstar"] >= 0.5]
    same = [r for r in both if r["knot"]["p"] < 0.01 and r["knot"]["pstar"] % r["colour"]["pstar"] == 0]
    print(f"colour-periodic khipus: {len(both)}; knot channel periodic at a multiple of the colour period: {len(same)}")
    summary["off_group"] = off
    summary["knot_coupled"] = [r["id"] for r in same]
    (OUT / "iso_period.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()

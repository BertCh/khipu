#!/usr/bin/env python3
"""Isomorph (substitution-invariant) matching across the khipu corpus.

For each channel the level-1 cord sequence of every khipu is cut into windows
of length L; each window is replaced by its canonical isomorph pattern
(first-occurrence relabelling, or dense value ranks for the value channel).
Windows are kept only if they are "non-trivial": >= MIN_DISTINCT symbols, no
unknown symbol, and minimal self-period > L/2 (so a pure ABAB / ABCABC cycle
does not qualify).  Patterns occurring in more than CAP khipus are dropped as
uninformative (they are corpus-wide forms, not links).  Shared windows on one
diagonal are chained into runs; a pair's statistic is its longest run (cords).

Null models, same pipeline:
  perm   - symbols permuted within each khipu (composition kept)
  block  - order of groups permuted within each khipu (within-group templates kept)

Usage:  python3 scripts/deep/iso_scan.py [channel ...]
channels: colour base knot at rank
"""
from __future__ import annotations

import collections
import json
import random
import sys
import time

from iso_common import OUT, NOVALUE, BASEL, load, canon, min_period, known_pairs, curated_pairs

L = 8
import os
CAP = int(os.environ.get("ISO_CAP", 4))  # pattern may occur in at most this many khipus
MIN_DISTINCT = 3
NSHUF = 5


def rank_canon(w):
    if None in w:
        return None
    s = sorted(set(w))
    r = {v: i for i, v in enumerate(s)}
    return tuple(r[x] for x in w)


def make_filter(channel):
    if channel == "rank":
        def ok(w, p):
            return p is not None and len(set(w)) >= 6 and min_period(p) > L // 2
    else:
        def ok(w, p):
            return "?" not in w and max(p) + 1 >= MIN_DISTINCT and min_period(p) > L // 2
    return ok


def scan(seqs: dict[str, list], canon_fn, ok, cap=CAP):
    idx = collections.defaultdict(list)
    for kid, s in seqs.items():
        for d, ss in (("f", s), ("r", s[::-1])):
            for i in range(len(ss) - L + 1):
                w = tuple(ss[i:i + L])
                p = canon_fn(w)
                if ok(w, p):
                    idx[p].append((kid, i, d))
    hits = collections.defaultdict(list)
    npat = nkept = 0
    for p, occ in idx.items():
        ks = {o[0] for o in occ}
        npat += 1
        if len(ks) < 2 or len(ks) > cap:
            continue
        nkept += 1
        fw = [o for o in occ if o[2] == "f"]
        rv = [o for o in occ if o[2] == "r"]
        for (a, i, _) in fw:
            for (b, j, _) in fw:
                if a < b:
                    hits[(a, b, "fwd", i - j)].append(i)
            for (b, j, _) in rv:
                if a < b:
                    hits[(a, b, "rev", i - j)].append(i)
    runs = collections.defaultdict(list)
    for (a, b, d, diag), starts in hits.items():
        starts = sorted(set(starts))
        s0 = prev = starts[0]
        for x in starts[1:] + [None]:
            if x is not None and x == prev + 1:
                prev = x
                continue
            runs[(a, b, d)].append((prev - s0 + L, s0, s0 - diag))
            if x is not None:
                s0 = prev = x
    best = {}
    for key, rs in runs.items():
        pair = (key[0], key[1])
        m = max(rs)
        if pair not in best or m[0] > best[pair][0]:
            best[pair] = (m[0], key[2], m[1], m[2])
    return best, runs, npat, nkept


def verify(A, B, i, j, n, d):
    """Global bijection check over the whole run; literal identity fraction; mapping."""
    Bs = B if d == "fwd" else B[::-1]
    a, b = A[i:i + n], Bs[j:j + n]
    f, g, ok = {}, {}, True
    for x, y in zip(a, b):
        if f.setdefault(x, y) != y or g.setdefault(y, x) != x:
            ok = False
    lit = sum(x == y for x, y in zip(a, b)) / n
    return ok, lit, sorted(f.items(), key=lambda t: -a.count(t[0]))


def run_class(A, i, n):
    """'cycle-distinct' = the run is a repeated unit of all-distinct symbols (ABCDE ABCDE..): any
    two khipus with a k-colour cycle match, so it carries no pair-specific information."""
    p = canon(A[i:i + n])
    q = min_period(p)
    if q <= n // 2:
        unit = p[:q]
        return ("cycle-distinct" if len(set(unit)) == q else "cycle-structured"), q
    return "aperiodic", q


def channel_seqs(ks, channel):
    if channel == "at":
        return {k["id"]: [f"{x}{y}" if "?" not in (x, y) else "?" for x, y in zip(k["attach"], k["twist"])] for k in ks}
    if channel == "rank":
        return {k["id"]: [v if v else None for v in k["value"]] for k in ks if k["id"] not in NOVALUE}
    return {k["id"]: k[channel] for k in ks}


def perm_null(seqs, rng):
    out = {}
    for kid, s in seqs.items():
        s = list(s)
        rng.shuffle(s)
        out[kid] = s
    return out


def block_null(seqs, groups, rng):
    out = {}
    for kid, s in seqs.items():
        g = groups[kid]
        blocks = collections.OrderedDict()
        for x, gi in zip(s, g):
            blocks.setdefault(gi, []).append(x)
        bl = list(blocks.values())
        rng.shuffle(bl)
        out[kid] = [x for b in bl for x in b]
    return out


def hist(best, thresholds):
    return {t: sum(1 for v in best.values() if v[0] >= t) for t in thresholds}


def main():
    chans = sys.argv[1:] or ["colour", "base", "knot", "at", "rank"]
    ks = load()
    groups = {k["id"]: k["group"] for k in ks}
    known = known_pairs()
    cur = curated_pairs()
    rng = random.Random(7)
    TH = [8, 9, 10, 11, 12, 14, 16, 20, 24, 32, 48]
    report = {}
    for ch in chans:
        t0 = time.time()
        seqs = channel_seqs(ks, ch)
        cf = rank_canon if ch == "rank" else canon
        ok = make_filter(ch)
        best, runs, npat, nkept = scan(seqs, cf, ok)
        real = hist(best, TH)
        nulls = {}
        for name in ("perm", "block"):
            hs = []
            for s in range(NSHUF):
                ns = perm_null(seqs, rng) if name == "perm" else block_null(seqs, {k: groups[k] for k in seqs}, rng)
                b, _, _, _ = scan(ns, cf, ok)
                hs.append(hist(b, TH))
            nulls[name] = {t: (sum(h[t] for h in hs) / NSHUF,
                               (sum((h[t] - sum(hh[t] for hh in hs) / NSHUF) ** 2 for h in hs) / NSHUF) ** .5)
                           for t in TH}
        # threshold: smallest t where block-null mean < 1 pair
        # link threshold: smallest t where the within-khipu permutation null expects < 1 pair corpus-wide
        thr = next((t for t in TH if nulls["perm"][t][0] < 1), TH[-1])
        rows = []
        for (a, b), (n, d, i, j) in sorted(best.items(), key=lambda kv: -kv[1][0]):
            if n < thr:
                continue
            okb, lit, mp = verify(seqs[a], seqs[b], i, j, n, d)
            rc, q = run_class(seqs[a], i, n) if ch != "rank" else ("aperiodic", n)
            rows.append({"class": rc, "period": q, "a": a, "b": b, "len": n, "dir": d, "i": i, "j": j, "bijective": okb,
                         "literal": round(lit, 3), "known": (a, b) in known or ((a in BASEL) or (b in BASEL)),
                         "curated": (a, b) in cur, "map": mp[:8]})
        kp = [p for p in cur if p[0] in seqs and p[1] in seqs]
        recall = sum(1 for p in kp if p in best and best[p][0] >= thr)
        recall_any = sum(1 for p in kp if p in best)
        report[ch] = {"patterns": npat, "kept": nkept, "real": real, "null": nulls, "threshold": thr,
                      "recall_curated": [recall, recall_any, len(kp)],
                      "curated_best": {f"{a}-{b}": best.get((a, b), (0,))[0] for a, b in sorted(kp)},
                      "hits": rows, "secs": round(time.time() - t0, 1)}
        print(f"== {ch}: patterns {npat} kept {nkept}  thr {thr}  recall {recall}/{len(kp)} (any {recall_any})  {report[ch]['secs']}s")
        for t in TH:
            print(f"  >= {t:2d}: real {real[t]:5d}  perm {nulls['perm'][t][0]:7.1f}±{nulls['perm'][t][1]:.1f}"
                  f"  block {nulls['block'][t][0]:7.1f}±{nulls['block'][t][1]:.1f}")
        rows_i = [r for r in rows if r["class"] != "cycle-distinct"]
        print(f"   runs >= thr: {len(rows)}; not trivial cycles: {len(rows_i)}; known among them: {sum(r['known'] for r in rows_i)}")
        for r in rows_i[:40]:
            print("   ", r["class"][:9], r["period"], r["a"], r["b"], r["len"], r["dir"], r["i"], r["j"], "bij" if r["bijective"] else "loc",
                  "lit=%.2f" % r["literal"], "KNOWN" if r["known"] else "", r["map"][:5])
    (OUT / f"iso_scan_cap{CAP}_{'_'.join(chans)}.json").write_text(json.dumps(report, indent=1, default=str))


if __name__ == "__main__":
    main()

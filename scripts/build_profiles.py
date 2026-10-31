#!/usr/bin/env python3
"""
Per-khipu profiles for the khipu page: public/data/profiles.json.

A profile describes a khipu in a few honest lines — how big its numbers are,
whether it holds arithmetic *beyond what its own numbers produce by chance*,
how its colours are laid out, and its structure. The network role is not built
here; the page derives it at runtime from src/lib/stories/links.ts and
public/data/stories/links.json.

Why "against chance": raw counts of "Ascher sums" (a cord equal to the sum of a
run of other cords) are mostly what shuffled values produce — our audit of
Medrano & Khosla 2024 (LAQ, doi 10.1017/laq.2024.5) found their relations 1–3 at
roughly chance level. So every arithmetic count here is shown next to its
chance level, and the verdict comes from the null distribution.

Chance = the khipu's own level-1 pendant values shuffled among its pendant
positions (group sizes, top cords, colours and subsidiaries stay put), NREPS
times with a fixed seed. For each test, p = (1 + #shuffles >= observed) /
(1 + #shuffles). The tests:

  group totals   a group (>= 2 non-zero cords, total > 10) whose total is written
                 on the cord just before or after the group, or (>= 3 non-zero)
                 on one of its own cords as the sum of the others
  adjacent sums  a pendant (> 10) equal to the sum of a run of >= 2 pendants that
                 starts right next to it (Medrano & Khosla's relation 1,
                 restricted to runs touching the sum cord)
  top-cord sums  a top cord standing alone as a cluster whose value is the total
                 (exact or off by one digit) of the neighbouring pendant group
                 (their relation 9); tested only when the khipu has top cords
  paper's sums   Medrano & Khosla's relations 1, 2, 3 and 5 as published (a
                 pendant or subsidiary equal to a run of pendants anywhere to one
                 side, of its own colour, or at its position in the other groups).
                 Mostly chance on most khipus, but real on a few (KH0049).

Verdict, from the smallest p of the tests times the number of tests
(Bonferroni):  < 0.01 with at least 2 hits on that test -> "clear";
< 0.05 -> "some"; otherwise "none" (none beyond chance). Fewer than 10 non-zero
pendant values -> "small" (too small to tell). Khipus whose knots are not
standard decimal (Wari and a few unreadable ones) or whose cord data is marked
unreliable -> "untested".

Colour layout: the KFG's own banded / seriated cluster counts (2024 snapshot,
scripts/reference/kfg_colour_clusters_2024.csv, from the Medrano & Khosla
companion data, Zenodo 10.5281/zenodo.10472429) where we have them; otherwise a
heuristic on our data, marked approximate.

Run:  python3 scripts/build_profiles.py [nreps]     (default 1000; ~1–3 min on 8 cores)
"""

from __future__ import annotations

import collections
import csv
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "khipus"
OUT = ROOT / "public" / "data" / "profiles.json"
KFG_COLOUR = ROOT / "scripts" / "reference" / "kfg_colour_clusters_2024.csv"

NREPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
BATCH = 100
# stop shuffling a khipu early once every test has this many shuffles at or
# above the observed count: its p-value is then already far above 0.05
EARLY_STOP = 20
SEED = 20260922
MIN_NONZERO = 10
P_CLEAR, P_SOME = 0.01, 0.05

# Wari (non-decimal) and khipus whose knots the KFG values under other rules
NOT_DECIMAL = {
    "KH0280", "KH0281", "KH0282", "KH0288", "KH0289", "KH0271", "KH0346", "KH0348", "KH0384",
    "KH0015", "KH0047", "KH0048", "KH0094", "KH0100", "KH0108", "KH0584",
}


def val(c) -> int:
    v = c.get("value")
    return int(v) if v is not None else 0


# ---------------------------------------------------------------- model
def model(k):
    """Level-1 pendants in order, group sizes, and the primary-cord order of
    clusters (pendant groups and top-cord-only groups) for the top-cord test."""
    l1 = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
    bygroup = collections.OrderedDict()
    for c in l1:
        bygroup.setdefault(c.get("group", 0), []).append(c)
    kids = collections.defaultdict(list)
    for c in k["cords"]:
        if c.get("parent") and c["kind"] == "subsidiary":
            kids[c["parent"]].append(val(c))
    vals, sizes, clusters = [], [], []  # clusters: ("P", size) | ("T", [values])
    cols, subs = [], []
    for g in sorted(bygroup):
        cc = bygroup[g]
        pend = [c for c in cc if c["kind"] == "pendant"]
        if pend:
            vals.extend(val(c) for c in pend)
            cols.extend(longest_colour(c) for c in pend)
            subs.extend(kids.get(c["name"], []) for c in pend)
            sizes.append(len(pend))
            clusters.append(("P", len(pend)))
        else:
            clusters.append(("T", [val(c) for c in cc]))
    return np.array(vals, dtype=np.int64), sizes, clusters, cols, subs


def longest_colour(c) -> str:
    """The colour covering most of the cord, as Medrano & Khosla take it."""
    segs = c.get("colorParsed") or []
    if not segs:
        return (c.get("color") or "").split("(")[0]
    best, bl = segs[0], -1.0
    for sg in segs:
        r = sg.get("range")
        L = (r[1] - r[0]) if r else 0.0
        if L > bl:
            best, bl = sg, L
    codes, ops = best.get("codes", []), best.get("ops", [])
    out = codes[0] if codes else ""
    for i, cc in enumerate(codes[1:]):
        out += (ops[i] if i < len(ops) else ":") + cc
    return out


# ---------------------------------------------------------------- relation 1
def _one_side(v: np.ndarray):
    """Medrano & Khosla's PendantSummer on one direction: for each cord > 10, the
    nearest start to its right from which a run of >= 2 cords sums to it.
    Returns {sum index: run start}."""
    n = len(v)
    P = np.concatenate([[0], np.cumsum(v)])
    nz = np.nonzero(v > 0)[0]
    out = {}
    for i in range(n - 2):
        t = v[i]
        if t <= 10:
            continue
        s = nz[nz > i]
        if not len(s):
            continue
        tgt = P[s] + t
        e = np.searchsorted(P, tgt, side="left")
        e2 = np.minimum(e, n)
        hit = (e <= n) & (P[e2] == tgt)
        if not hit.any():
            continue
        j = int(np.argmax(hit))
        st, en = int(s[j]), int(e2[j])
        if en - st >= 2 and t > (en - st):
            out[i] = st
    return out


def pendant_sums(v: np.ndarray) -> tuple[int, int]:
    """(all relation-1 sums, those whose run starts next to the sum cord)."""
    if len(v) < 3:
        return 0, 0
    a = _one_side(v)
    b = _one_side(v[::-1].copy())
    allc = len(a) + len(b)
    adj = sum(st == i + 1 for i, st in a.items()) + sum(st == i + 1 for i, st in b.items())
    return allc, adj


# ---------------------------------------------------------------- group totals
def group_totals(v: np.ndarray, sizes) -> int:
    hits = 0
    idx = np.cumsum([0] + list(sizes))
    for g in range(len(sizes)):
        a, b = idx[g], idx[g + 1]
        grp = v[a:b]
        nzc = int((grp > 0).sum())
        t = int(grp.sum())
        if nzc >= 3 and any(2 * int(c) == t and c > 10 for c in grp):
            hits += 1
            continue
        if nzc >= 2 and t > 10 and ((a > 0 and v[a - 1] == t) or (b < len(v) and v[b] == t)):
            hits += 1
    return hits


# ---------------------------------------------------------------- top-cord sums
def _off_by_one(n: int) -> set[int]:
    s = str(n)
    r = set()
    for i, ch in enumerate(s):
        d = int(ch)
        for x in range(max(0, d - 1), min(9, d + 1) + 1):
            r.add(int(s[:i] + str(x) + s[i + 1:]))
    return r


def top_sums(v: np.ndarray, clusters) -> int:
    """Medrano & Khosla's relation 9: a lone top cord (a one-cord cluster) whose
    value matches the total of the adjacent cluster, exact or one digit off."""
    sums, pos = [], 0
    for kind, x in clusters:
        if kind == "P":
            sums.append((False, x, int(v[pos:pos + x].sum())))
            pos += x
        else:
            sums.append((True, len(x), int(sum(x))))
    hits = 0
    for i in range(len(sums) - 1):
        A, B = sums[i], sums[i + 1]
        ls, rs = A[2], B[2]
        if ls <= 0:
            continue
        tag = i if A[1] == 1 else (i + 1 if B[1] == 1 else None)
        if tag is None or not sums[tag][0] or sums[tag][2] <= 0:
            continue
        if ls == rs or ls in _off_by_one(rs) or rs in _off_by_one(ls):
            hits += 1
    return hits


# ---------------------------------------------------------------- relations 2, 3, 5
def _has_run(vals, target, minlen, maxlen, kill_if_len_ge):
    """Whether a contiguous run of vals (positive) sums to target with
    minlen <= length <= maxlen — unless some matching run is at least
    kill_if_len_ge long (their triviality rule)."""
    m = len(vals)
    if m < minlen:
        return False
    Q = np.concatenate([[0], np.cumsum(vals)])
    targ = Q[:-1] + target
    e = np.searchsorted(Q, targ, side="left")
    e2 = np.minimum(e, m)
    hit = (e <= m) & (Q[e2] == targ)
    L = e2 - np.arange(m)
    hit &= (L >= minlen) & (L <= maxlen)
    if not hit.any():
        return False
    return not (L[np.nonzero(hit)[0]] >= kill_if_len_ge).any()


def rel2(v, same_colour) -> int:
    """A pendant (> 10) equal to a run of >= 3 non-zero pendants of its own colour,
    to one side (their relation 2). same_colour: per pendant, the ordered indices
    of pendants sharing its colour."""
    hits = 0
    for i, t in enumerate(v):
        if t <= 10:
            continue
        same = same_colour[i]
        pos = same.index(i)
        for lst in (same[:pos], same[pos + 1:]):
            vals = v[lst]
            vals = vals[vals > 0]
            if len(vals) >= 3 and _has_run(vals, int(t), 3, 249, int(t)):
                hits += 1
    return hits


def _rel3_valid(t: int) -> bool:
    if t <= 5:
        return False
    if t < 100 and t % 10 == 0:
        return False
    return not (100 <= t < 1000 and t % 100 == 0)


def rel3(v, groups) -> int:
    """A pendant equal to a run of the pendants at the same position in the
    groups to one side of it (their relation 3; the seriated "summary" sum)."""
    hits = 0
    for gi, g in enumerate(groups):
        for ci, i in enumerate(g):
            t = int(v[i])
            if not _rel3_valid(t):
                continue
            left = [groups[x][ci] for x in range(gi) if len(groups[x]) > ci]
            right = [groups[x][ci] for x in range(gi + 1, len(groups)) if len(groups[x]) > ci]
            for lst in (left, right):
                vals = v[lst] if lst else np.zeros(0, dtype=np.int64)
                vals = vals[vals > 0]
                if len(vals) >= 2 and _has_run(vals, t, 2, 10**9, t):
                    hits += 1
    return hits


def rel5(v, subs) -> int:
    """A subsidiary (> 10) equal to a run of >= 3 non-zero pendants to one side of
    its pendant (their relation 5)."""
    hits = 0
    nzi = np.nonzero(v > 0)[0]
    for i, ss in enumerate(subs):
        for sv in ss:
            if sv <= 10 or (sv < 100 and sv % 10 == 0):
                continue
            for lst in (nzi[nzi <= i], nzi[nzi > i]):
                if len(lst) >= 3 and _has_run(v[lst], sv, 3, 249, sv):
                    hits += 1
    return hits


def stats(v, ctx):
    pp, adj = pendant_sums(v)
    paper = pp + rel2(v, ctx["sameColour"]) + rel3(v, ctx["groups"]) + rel5(v, ctx["subs"])
    return {"groupTotals": group_totals(v, ctx["sizes"]), "adjacentSums": adj,
            "topSums": top_sums(v, ctx["clusters"]) if ctx["hasTop"] else 0, "paperSums": paper}


TESTS = ["groupTotals", "adjacentSums", "topSums", "paperSums"]


def null_test(args):
    kid, v, ctx, seed = args
    rng = np.random.default_rng(seed)
    obs = stats(v, ctx)
    live = [t for t in TESTS if t != "topSums" or ctx["hasTop"]]
    ge = dict.fromkeys(TESTS, 0)
    tot = dict.fromkeys(TESTS, 0.0)
    reps = 0
    while reps < NREPS:
        for _ in range(BATCH):
            s = stats(rng.permutation(v), ctx)
            for t in TESTS:
                tot[t] += s[t]
                ge[t] += s[t] >= obs[t]
        reps += BATCH
        if all(ge[t] >= EARLY_STOP for t in live):
            break
    res = {t: {"observed": obs[t], "chance": round(tot[t] / reps, 2),
               "p": round((1 + ge[t]) / (1 + reps), 4)} for t in live}
    return kid, res, reps


# ---------------------------------------------------------------- descriptors
def scale_label(median: float) -> str:
    if median <= 0:
        return "none"
    return "units" if median < 10 else "tens" if median < 100 else "hundreds" if median < 1000 else "thousands"


def colour_heuristic(groups_cols):
    """Per group of >= 3 cords: banded if one colour covers >= 75% of it;
    seriated if its colour sequence matches another same-size group at >= 75%."""
    band = ser = elig = 0
    for gi, g in enumerate(groups_cols):
        if len(g) < 3:
            continue
        elig += 1
        if collections.Counter(g).most_common(1)[0][1] / len(g) >= 0.75:
            band += 1
            continue
        for gj, h in enumerate(groups_cols):
            if gj != gi and len(h) == len(g) and sum(a == b for a, b in zip(g, h)) / len(g) >= 0.75:
                ser += 1
                break
    return band, ser, elig


def colour_label(banded, seriated, clusters):
    """From counts of banded and seriated clusters out of all clusters."""
    classed = banded + seriated
    if classed < 2:
        return "few"
    if classed / max(clusters, 1) < 0.5:
        return "irregular"
    if banded / classed >= 0.75:
        return "banded"
    if seriated / classed >= 0.75:
        return "seriated"
    return "mixed"


def main():
    t0 = time.time()
    kfg_colour = {r["id"]: r for r in csv.DictReader(open(KFG_COLOUR))}
    ks = [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]

    base, jobs = {}, []
    for i, k in enumerate(ks):
        kid = k["id"]
        v, sizes, clusters, cols, subs = model(k)
        cs = k["cords"]
        nz = v[v > 0]
        n_top = sum(c["kind"] == "top" for c in cs)
        has_top = any(kind == "T" and len(x) == 1 for kind, x in clusters)
        # colour: KFG counts where we have them, else heuristic
        kc = kfg_colour.get(kid)
        if kc:
            b, s_, n = int(kc["banded"]), int(kc["seriated"]), int(kc["clusters"])
            colour = {"label": colour_label(b, s_, n), "banded": b, "seriated": s_, "clusters": n,
                      "source": "kfg"}
        else:
            l1 = sorted((c for c in cs if c["level"] == 1 and c["kind"] == "pendant"), key=lambda c: c["ordinal"])
            gcols = collections.OrderedDict()
            for c in l1:
                gcols.setdefault(c.get("group", 0), []).append((c.get("color") or "").split(":")[0])
            b, s_, n = colour_heuristic(list(gcols.values()))
            colour = {"label": colour_label(b, s_, n) if n else "few", "banded": b, "seriated": s_,
                      "clusters": n, "source": "approx"}
        base[kid] = {
            "scale": {
                "label": scale_label(float(np.median(nz)) if len(nz) else 0.0),
                "median": float(np.median(nz)) if len(nz) else 0,
                "nonZero": int(len(nz)),
                "shareThousands": round(float((nz >= 1000).mean()), 3) if len(nz) else 0,
            },
            "colour": colour,
            "structure": {
                "pendants": int(len(v)),
                "groups": len(sizes),
                "subsidiaries": sum(c["kind"] == "subsidiary" for c in cs),
                "topCords": n_top,
                "sixShare": round(sum(s == 6 for s in sizes) / len(sizes), 3) if sizes else 0,
                "brokenPrimary": (k.get("primary") or {}).get("term") == "B",
            },
        }
        why = None
        if kid in NOT_DECIMAL:
            why = "not-decimal"
        elif k.get("cordDataError"):
            why = "data-error"
        elif len(nz) < MIN_NONZERO:
            why = "small"
        base[kid]["_why"] = why
        base[kid]["_hasTop"] = has_top
        if why in (None, "small") and len(v) >= 3:
            bycol = collections.defaultdict(list)
            for j, c in enumerate(cols):
                bycol[c].append(j)
            idx = np.cumsum([0] + sizes)
            ctx = {"sizes": sizes, "clusters": clusters, "hasTop": has_top, "subs": subs,
                   "sameColour": [bycol[c] for c in cols],
                   "groups": [list(range(idx[g], idx[g + 1])) for g in range(len(sizes))]}
            jobs.append((kid, v, ctx, SEED + i))

    jobs.sort(key=lambda j: -len(j[1]))  # big khipus first, for the pool
    with Pool() as pool:
        results = {kid: (res, reps) for kid, res, reps in pool.imap_unordered(null_test, jobs, chunksize=1)}

    counts = collections.Counter()
    profiles = {}
    for kid, b in base.items():
        why, has_top = b.pop("_why"), b.pop("_hasTop")
        arith: dict = {"label": "untested" if why in ("not-decimal", "data-error") else "small"}
        if why:
            arith["why"] = why
        if kid in results:
            res, reps = results[kid]
            arith["reps"] = reps
            arith["tests"] = res
            verdict = list(res)
            best = min(verdict, key=lambda t: res[t]["p"])
            p_adj = min(1.0, res[best]["p"] * len(verdict))
            arith["pAdjusted"] = round(p_adj, 4)
            arith["lead"] = best
            if why is None:
                if p_adj < P_CLEAR and res[best]["observed"] >= 2:
                    arith["label"] = "clear"
                elif p_adj < P_SOME:
                    arith["label"] = "some"
                else:
                    arith["label"] = "none"
        b["arithmetic"] = arith
        b["structure"]["topSums"] = results[kid][0]["topSums"]["observed"] if kid in results and has_top else 0
        counts[arith["label"]] += 1
        profiles[kid] = b

    out = {
        "meta": {
            "built": time.strftime("%Y-%m-%d"),
            "reps": NREPS,
            "earlyStop": EARLY_STOP,
            "seed": SEED,
            "thresholds": {"clear": P_CLEAR, "some": P_SOME, "minNonZero": MIN_NONZERO},
            "counts": dict(counts),
            "colourCounts": dict(collections.Counter(p["colour"]["label"] for p in profiles.values())),
            "scaleCounts": dict(collections.Counter(p["scale"]["label"] for p in profiles.values())),
        },
        "profiles": profiles,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {len(profiles)} profiles to {OUT.relative_to(ROOT)} in {time.time() - t0:.0f}s")
    print("arithmetic", dict(counts))
    print("colour", out["meta"]["colourCounts"])
    print("scale", out["meta"]["scaleCounts"])


if __name__ == "__main__":
    main()

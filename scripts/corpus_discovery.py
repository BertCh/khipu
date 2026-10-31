#!/usr/bin/env python3
"""Corpus-wide screens for uncommon structure in the Khipu Field Guide data.

This is a discovery aid, not a decipherment engine.  Every screen reports the
full candidate set or an explicit threshold so that an apparent pattern can be
checked against the rest of the corpus rather than selected after inspection.

    python3 scripts/corpus_discovery.py
    python3 scripts/corpus_discovery.py --shuffles 100
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from functools import reduce
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
SEED = 190470


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def pendants(k: dict) -> list[dict]:
    return sorted(
        (c for c in k["cords"] if c["level"] == 1 and c["kind"] == "pendant"),
        key=lambda c: c["ordinal"],
    )


def top_level(k: dict) -> list[dict]:
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def groups(k: dict, include_top: bool = False) -> list[list[dict]]:
    out = [[] for _ in k["groups"]]
    for c in k["cords"]:
        if c["level"] != 1 or c.get("group") is None:
            continue
        if include_top or c["kind"] == "pendant":
            out[c["group"]].append(c)
    for g in out:
        g.sort(key=lambda c: c["ordinal"])
    return out


def val(c: dict) -> int:
    return c.get("value") or 0


def base_color(c: dict) -> str:
    parsed = c.get("colorParsed") or []
    if parsed and parsed[0].get("codes"):
        return "+".join(parsed[0]["codes"])
    return c.get("color") or "?"


def alias(k: dict) -> str:
    return ",".join(k.get("aliases") or []) or "-"


def gcd_shape(values: list[int]) -> tuple[int, ...] | None:
    nz = [abs(v) for v in values if v]
    if len(nz) < 3:
        return None
    d = reduce(math.gcd, nz)
    return tuple(v // d for v in values)


def exact_duplicates(ks: list[dict]) -> None:
    """Exact physical/transcription fingerprints, excluding metadata and names."""
    buckets: dict[str, list[str]] = defaultdict(list)
    for k in ks:
        sig = []
        for c in sorted(k["cords"], key=lambda x: (x["level"], x.get("parent") or "", x["ordinal"], x["name"])):
            sig.append((
                c["level"], c["kind"], c["twist"], c["attach"], c["length"], c["term"],
                c.get("thick"), c.get("color"), c.get("value"), c.get("altValue"),
                tuple((x["n"], x["type"], x["pos"], x["dir"], x.get("value"), x.get("axis")) for x in c["knots"]),
                c.get("group"), c["ordinal"], c.get("pos"),
            ))
        raw = json.dumps((k["primary"], k["groups"], sig), sort_keys=True, separators=(",", ":"))
        buckets[hashlib.sha256(raw.encode()).hexdigest()].append(k["id"])
    print("\n=== EXACT TRANSCRIPTION DUPLICATES")
    hits = [v for v in buckets.values() if len(v) > 1]
    print(f"{len(hits)} duplicate fingerprints among {len(ks)} records")
    for ids in hits:
        print("  " + " = ".join(ids))


def proportional_groups(ks: list[dict]) -> None:
    """Repeated ordered group vectors identical after division by their GCD."""
    rows = []
    for k in ks:
        buckets: dict[tuple[int, ...], list[tuple[int, list[int], int]]] = defaultdict(list)
        for gi, g in enumerate(groups(k)):
            vs = [val(c) for c in g]
            shape = gcd_shape(vs)
            if shape is not None and len(vs) >= 4 and len(set(shape)) >= 2:
                buckets[shape].append((gi, vs, reduce(math.gcd, (abs(v) for v in vs if v))))
        repeated = [(shape, xs) for shape, xs in buckets.items() if len(xs) >= 3 and len({x[2] for x in xs}) >= 2]
        if repeated:
            score = max(len(xs) * len(shape) for shape, xs in repeated)
            rows.append((score, k, repeated))
    print("\n=== REPEATED PROPORTIONAL GROUP TEMPLATES")
    print(f"{len(rows)} khipus have >=3 ordered groups of one nontrivial shape at >=2 scales")
    for _, k, reps in sorted(rows, reverse=True, key=lambda x: x[0]):
        print(f"  {k['id']} {alias(k):18s}")
        for shape, xs in sorted(reps, key=lambda x: -len(x[1]))[:4]:
            print(f"    shape {shape}; groups {[x[0] + 1 for x in xs]}; scales {[x[2] for x in xs]}")


def column_summaries(ks: list[dict]) -> None:
    """A group whose fields equal column sums of a consecutive group run."""
    rows = []
    for k in ks:
        gs = groups(k)
        for ti, target in enumerate(gs):
            m = len(target)
            if not (3 <= m <= 16):
                continue
            tv = [val(c) for c in target]
            if sum(tv) < 30 or sum(v > 0 for v in tv) < 3:
                continue
            for direction in (1, -1):
                for n in range(3, 13):
                    idx = [ti + direction * x for x in range(1, n + 1)]
                    if min(idx) < 0 or max(idx) >= len(gs):
                        continue
                    run = [gs[x] for x in idx]
                    if any(len(g) != m for g in run):
                        continue
                    sums = [sum(val(g[j]) for g in run) for j in range(m)]
                    exact = sum(a == b for a, b in zip(tv, sums))
                    close = sum(abs(a - b) <= 1 for a, b in zip(tv, sums))
                    if exact >= max(3, math.ceil(0.6 * m)):
                        rows.append((exact / m, exact, close, sum(tv), k, ti, direction, n, tv, sums))
    # Remove nested versions of the same target/direction, keeping best exact ratio/count.
    best = {}
    for r in rows:
        key = (r[4]["id"], r[5], r[6])
        if key not in best or (r[1], r[0], -r[7]) > (best[key][1], best[key][0], -best[key][7]):
            best[key] = r
    print("\n=== CONSECUTIVE COLUMN-SUM SUMMARY GROUPS")
    print(f"{len(best)} target groups match >=60% of >=3 fields across a run of 3-12 equal-width groups")
    for r in sorted(best.values(), reverse=True, key=lambda x: (x[1], x[0], x[3])):
        ratio, exact, close, total, k, ti, direction, n, tv, sums = r
        side = "following" if direction == 1 else "preceding"
        print(f"  {k['id']} {alias(k):18s} g{ti+1} = {n} {side} groups: {exact}/{len(tv)} exact, {close}/{len(tv)} within 1; target {tv}; sums {sums}")


def run_sum_count(values: list[int], min_run: int = 3, min_value: int = 11) -> int:
    seq = [(i, v) for i, v in enumerate(values) if v > 0]
    prefix = [0]
    for _, v in seq:
        prefix.append(prefix[-1] + v)
    ends: dict[int, list[int]] = defaultdict(list)
    for i, p in enumerate(prefix):
        ends[p].append(i)
    hits = set()
    for si, (idx, v) in enumerate(seq):
        if v < min_value:
            continue
        for a in range(len(seq)):
            for b in ends.get(prefix[a] + v, ()):
                if b - a >= min_run and not (a <= si < b):
                    hits.add(idx)
                    break
            if idx in hits:
                break
    return len(hits)


def arithmetic_density(ks: list[dict], shuffles: int) -> None:
    rng = random.Random(SEED)
    rows = []
    for k in ks:
        values = [val(c) for c in top_level(k)]
        if len(values) < 30 or sum(v >= 11 for v in values) < 5:
            continue
        obs = run_sum_count(values)
        sims = []
        for _ in range(shuffles):
            sh = values[:]
            rng.shuffle(sh)
            sims.append(run_sum_count(sh))
        mu = statistics.mean(sims)
        sd = statistics.pstdev(sims)
        z = (obs - mu) / sd if sd else (99.0 if obs > mu else 0.0)
        p = (1 + sum(x >= obs for x in sims)) / (shuffles + 1)
        rows.append((z, p, obs, mu, sd, k))
    print("\n=== ARITHMETIC RUN-SUM DENSITY")
    print(f"Top-level values; exact sum of >=3 consecutive nonzero cords; {shuffles} within-khipu shuffles")
    for z, p, obs, mu, sd, k in sorted(rows, reverse=True, key=lambda x: x[0])[:25]:
        print(f"  {k['id']} {alias(k):18s} observed {obs:3d}, null {mu:5.2f}±{sd:4.2f}, z={z:5.2f}, p={p:.4f}")


def color_periods(ks: list[dict], shuffles: int) -> None:
    """Colour sequences agreeing with a repeated period, with shuffle p-values."""
    rng = random.Random(SEED + 1)

    def best_period(seq: list[str]) -> tuple[float, int]:
        best = (0.0, 0)
        for p in range(2, min(25, len(seq) // 4) + 1):
            # Modal colour at each phase; penalise one-colour pseudo-periods.
            modes = [Counter(seq[j::p]).most_common(1)[0][0] for j in range(p)]
            if len(set(modes)) < 2:
                continue
            score = sum(c == modes[i % p] for i, c in enumerate(seq)) / len(seq)
            if (score, -p) > (best[0], -best[1]):
                best = score, p
        return best

    rows = []
    for k in ks:
        seq = [base_color(c) for c in pendants(k)]
        if len(seq) < 20 or len(set(seq)) < 2:
            continue
        score, period = best_period(seq)
        if score < 0.8:
            continue
        beat = 0
        for _ in range(shuffles):
            sh = seq[:]
            rng.shuffle(sh)
            if best_period(sh)[0] >= score:
                beat += 1
        pval = (beat + 1) / (shuffles + 1)
        if pval <= 0.05:
            template = [Counter(seq[j::period]).most_common(1)[0][0] for j in range(period)]
            rows.append((score, pval, k, period, template, len(seq)))
    print("\n=== RARE PENDANT COLOUR PERIODS")
    print(f">=80% agreement, >=4 repeats, >=2 template colours; {shuffles} within-khipu shuffles")
    for score, pval, k, period, template, n in sorted(rows, reverse=True, key=lambda x: (x[0], -x[1], x[5])):
        print(f"  {k['id']} {alias(k):18s} n={n:3d}, period={period:2d}, agree={score:.3f}, p={pval:.4f}: {' '.join(template)}")


def attachment_structure(ks: list[dict], shuffles: int) -> None:
    """Mixed recto/verso sequences with unusually few transitions."""
    rng = random.Random(SEED + 2)
    rows = []
    for k in ks:
        seq = [c.get("attach") for c in pendants(k) if c.get("attach") in ("R", "V")]
        cnt = Counter(seq)
        if len(seq) < 30 or min(cnt.get("R", 0), cnt.get("V", 0)) < 8:
            continue
        transitions = sum(a != b for a, b in zip(seq, seq[1:]))
        sims = []
        for _ in range(shuffles):
            sh = seq[:]
            rng.shuffle(sh)
            sims.append(sum(a != b for a, b in zip(sh, sh[1:])))
        p = (1 + sum(x <= transitions for x in sims)) / (shuffles + 1)
        z = (transitions - statistics.mean(sims)) / statistics.pstdev(sims) if statistics.pstdev(sims) else 0
        if p <= 0.05:
            runs = []
            start = 0
            for i in range(1, len(seq) + 1):
                if i == len(seq) or seq[i] != seq[start]:
                    runs.append((seq[start], i - start))
                    start = i
            rows.append((p, z, k, cnt, transitions, runs))
    print("\n=== ATTACHMENT BLOCK STRUCTURE")
    print(f"Mixed R/V khipus with unusually few transitions; {shuffles} within-khipu shuffles")
    for p, z, k, cnt, transitions, runs in sorted(rows, key=lambda x: (x[0], x[1])):
        run_text = " ".join(f"{a}{n}" for a, n in runs[:20]) + (" …" if len(runs) > 20 else "")
        print(f"  {k['id']} {alias(k):18s} {dict(cnt)}, transitions={transitions}, z={z:.2f}, p={p:.4f}: {run_text}")


def repeated_value_windows(ks: list[dict]) -> None:
    """Exact cross-khipu value passages, filtering low-information runs."""
    window = 12
    index: dict[tuple[int, ...], list[tuple[dict, int]]] = defaultdict(list)
    for k in ks:
        vs = [val(c) for c in pendants(k)]
        for i in range(len(vs) - window + 1):
            w = tuple(vs[i : i + window])
            if sum(v > 0 for v in w) >= 8 and len(set(w)) >= 5 and max(w) >= 10:
                index[w].append((k, i))
    pairs: dict[tuple[str, str], list[tuple[int, int, tuple[int, ...]]]] = defaultdict(list)
    for w, locs in index.items():
        for ai in range(len(locs)):
            for bi in range(ai + 1, len(locs)):
                a, ia = locs[ai]
                b, ib = locs[bi]
                if a["id"] != b["id"]:
                    key = tuple(sorted((a["id"], b["id"])))
                    pairs[key].append((ia, ib, w))
    print("\n=== EXACT CROSS-KHIPU VALUE WINDOWS")
    print(f"12 consecutive pendant values, >=8 nonzero, >=5 distinct, max >=10")
    if not pairs:
        print("  none")
    for (a, b), hits in sorted(pairs.items(), key=lambda x: -len(x[1])):
        # Collapse overlapping windows into the first representative.
        ia, ib, w = hits[0]
        print(f"  {a} ↔ {b}: {len(hits)} matching windows; first starts p{ia+1}/p{ib+1}: {w}")


def proportional_value_windows(ks: list[dict]) -> None:
    """Cross-khipu passages that have exactly the same shape at another scale."""
    window = 10
    index: dict[tuple[int, ...], list[tuple[dict, int, int, tuple[int, ...]]]] = defaultdict(list)
    for k in ks:
        vs = [val(c) for c in pendants(k)]
        for i in range(len(vs) - window + 1):
            raw = tuple(vs[i : i + window])
            nz = [abs(v) for v in raw if v]
            if len(nz) < 7 or len(set(raw)) < 5 or max(raw) < 10:
                continue
            d = reduce(math.gcd, nz)
            shape = tuple(v // d for v in raw)
            index[shape].append((k, i, d, raw))
    pairs = []
    for shape, locs in index.items():
        for ai in range(len(locs)):
            for bi in range(ai + 1, len(locs)):
                a, ia, da, rawa = locs[ai]
                b, ib, db, rawb = locs[bi]
                if a["id"] != b["id"] and da != db:
                    pairs.append((a["id"], b["id"], ia, ib, da, db, shape, rawa, rawb))
    print("\n=== PROPORTIONAL CROSS-KHIPU VALUE WINDOWS")
    print("10 consecutive pendant values with identical GCD-normalised shape at different scales")
    if not pairs:
        print("  none")
    for a, b, ia, ib, da, db, shape, rawa, rawb in pairs:
        print(f"  {a} p{ia+1} ↔ {b} p{ib+1}; scales {da}:{db}; {rawa} ↔ {rawb}")


def matching_group_vectors(ks: list[dict]) -> None:
    """Exact, information-rich group vectors shared by different khipus."""
    index: dict[tuple[int, ...], list[tuple[dict, int]]] = defaultdict(list)
    for k in ks:
        for gi, g in enumerate(groups(k)):
            w = tuple(val(c) for c in g)
            if len(w) >= 4 and sum(v > 0 for v in w) >= 4 and len(set(w)) >= 4 and max(w) >= 20:
                index[w].append((k, gi))
    print("\n=== EXACT CROSS-KHIPU GROUP VECTORS")
    hits = []
    for w, locs in index.items():
        ids = {k["id"] for k, _ in locs}
        if len(ids) >= 2:
            hits.append((len(w), max(w), w, locs))
    if not hits:
        print("  none")
    for _, _, w, locs in sorted(hits, reverse=True, key=lambda x: (x[0], x[1])):
        places = ", ".join(f"{k['id']} g{gi+1}" for k, gi in locs)
        print(f"  {places}: {w}")

    unordered: dict[tuple[int, ...], list[tuple[dict, int, tuple[int, ...]]]] = defaultdict(list)
    for k in ks:
        for gi, g in enumerate(groups(k)):
            raw = tuple(val(c) for c in g)
            if len(raw) >= 5 and sum(v > 0 for v in raw) >= 5 and len(set(raw)) >= 4 and max(raw) >= 20:
                unordered[tuple(sorted(raw))].append((k, gi, raw))
    print("\n=== CROSS-KHIPU GROUP MULTISETS (FIELD ORDER MAY DIFFER)")
    mhits = []
    for multiset, locs in unordered.items():
        ids = {k["id"] for k, _, _ in locs}
        orders = {raw for _, _, raw in locs}
        if len(ids) >= 2 and len(orders) >= 2:
            mhits.append((len(multiset), max(multiset), multiset, locs))
    if not mhits:
        print("  none")
    for _, _, multiset, locs in sorted(mhits, reverse=True, key=lambda x: (x[0], x[1])):
        places = "; ".join(f"{k['id']} g{gi+1} {raw}" for k, gi, raw in locs)
        print(f"  {places}")


def uniform_group_calendars(ks: list[dict]) -> None:
    print("\n=== UNIFORM GROUP COUNTS WITH CALENDRICAL FACTORS")
    rows = []
    for k in ks:
        sizes = [len(g) for g in groups(k) if g]
        if len(sizes) < 7:
            continue
        common, ncommon = Counter(sizes).most_common(1)[0]
        frac = ncommon / len(sizes)
        notable = [x for x in (7, 10, 12, 13, 20, 24, 28, 30, 36, 52, 60, 70, 72, 73, 84, 120, 365) if len(sizes) == x or ncommon == x]
        if frac >= 0.85 and (common in (5, 6, 7, 8, 10, 12, 13) or notable):
            rows.append((frac, len(sizes), common, ncommon, notable, k, Counter(sizes)))
    for frac, ng, common, nc, notable, k, dist in sorted(rows, reverse=True, key=lambda x: (x[0], x[1])):
        print(f"  {k['id']} {alias(k):18s} groups={ng}, modal size={common}×{nc} ({frac:.1%}), sizes={dict(dist)}, notable={notable}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shuffles", type=int, default=100)
    args = ap.parse_args()
    ks = load()
    print(f"Loaded {len(ks)} khipus")
    exact_duplicates(ks)
    proportional_groups(ks)
    column_summaries(ks)
    arithmetic_density(ks, args.shuffles)
    color_periods(ks, args.shuffles)
    attachment_structure(ks, args.shuffles)
    repeated_value_windows(ks)
    proportional_value_windows(ks)
    matching_group_vectors(ks)
    uniform_group_calendars(ks)


if __name__ == "__main__":
    main()

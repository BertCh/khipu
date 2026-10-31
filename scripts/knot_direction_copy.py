#!/usr/bin/env python3
"""Knot direction on a source khipu and its retied copy: KH0284 (UR053B) -> KH0285 (UR053C).

For "Which way the knot", Step 5. The matched cords come from
public/data/stories/strands.json (link KH0284|KH0285, built by build_strands.py:
thread a/b are 0-based level-1 positions, subA/subB name a subsidiary when the
matched value sits on one). For each thread the direction of the actual cord on
each side (the subsidiary where one is named) is its majority over S, L and E
knot clusters, one reading per cluster exactly as src/lib/stories/knotdirection.ts
(entryDir, cordDir) computes it. Blank-both threads carry no knots and drop out.

Usage: python3 scripts/knot_direction_copy.py [--json]
"""

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
SOURCE, COPY = "KH0284", "KH0285"


def load(kid):
    return json.loads((DATA / "khipus" / f"{kid}.json").read_text())


def knot_dirs(k):
    n = max(1, k.get("n") or 1)
    d = k.get("dir") or "U"
    return list(d[:n]) if len(d) >= n else [d[0]] * n


def entry_dir(k):
    ds = [d for d in knot_dirs(k) if d in "SZ"]
    if not ds:
        return None
    s = ds.count("S")
    if s > len(ds) / 2:
        return "S"
    if s == len(ds) / 2:
        return ds[0]
    return "Z"


def cord_dir(c):
    s = z = 0
    for k in c["knots"]:
        if k["type"] not in ("S", "L", "E"):
            continue
        d = entry_dir(k)
        if d == "S":
            s += 1
        elif d == "Z":
            z += 1
    if not s and not z:
        return None
    return "S" if s > z else "Z"


def cord_dir_sl(c):
    """By single and long knots; figure-eights only when there is nothing else
    (knotdirection.ts cordDirSL). Decides p18 of KH0284, 1S + 1E(Z), as S."""
    s = z = 0
    for k in c["knots"]:
        if k["type"] not in ("S", "L"):
            continue
        d = entry_dir(k)
        if d == "S":
            s += 1
        elif d == "Z":
            z += 1
    if not s and not z:
        return cord_dir(c)
    return "S" if s >= z else "Z"


def clusters(c):
    """(type, dir) of every directed S/L/E cluster on the cord."""
    out = []
    for k in c["knots"]:
        if k["type"] in ("S", "L", "E"):
            d = entry_dir(k)
            if d:
                out.append((k["type"], d))
    return out


def level1(k):
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def main():
    src, cpy = load(SOURCE), load(COPY)
    by_name = {kid: {c["name"]: c for c in k["cords"]} for kid, k in ((SOURCE, src), (COPY, cpy))}
    l1 = {SOURCE: level1(src), COPY: level1(cpy)}
    link = json.loads((DATA / "stories" / "strands.json").read_text())["links"][f"{SOURCE}|{COPY}"]
    assert link["a"] == SOURCE and link["b"] == COPY

    def side(t, kid, key, subkey):
        names = t.get(subkey)
        if names:
            return [by_name[kid][n] for n in names]
        return [l1[kid][i] for i in t[key]]

    rows = []
    for t in link["threads"]:
        if t["kind"] not in ("exact", "near", "sum", "scaled"):
            continue
        a = side(t, SOURCE, "a", "subA")
        b = side(t, COPY, "b", "subB")
        da = [cord_dir(c) for c in a]
        db = [cord_dir(c) for c in b]
        rows.append(
            {
                "kind": t["kind"],
                "a": [c["name"] for c in a],
                "b": [c["name"] for c in b],
                "va": t["va"],
                "vb": t["vb"],
                "dirA": "".join(d or "-" for d in da),
                "dirB": "".join(d or "-" for d in db),
                "slA": "".join(cord_dir_sl(c) or "-" for c in a),
                "slB": "".join(cord_dir_sl(c) or "-" for c in b),
                "clustersA": sum((clusters(c) for c in a), []),
                "clustersB": sum((clusters(c) for c in b), []),
            }
        )

    pairs = Counter((r["dirA"], r["dirB"]) for r in rows)
    flipped = [r for r in rows if r["dirA"] == "S" and r["dirB"] == "Z"]
    same = [r for r in rows if r["dirA"] == r["dirB"] and r["dirA"] in ("S", "Z")]
    src_pendants_flipped = sorted(
        {n.split("s")[0] for r in flipped for n in r["a"]}, key=lambda n: int(n[1:])
    )
    # cluster-level: every directed cluster on the matched cords, by type
    cl = Counter()
    for r in rows:
        for t, d in r["clustersA"]:
            cl[("source", t, d)] += 1
        for t, d in r["clustersB"]:
            cl[("copy", t, d)] += 1
    fl = Counter()
    for r in flipped:
        for t, d in r["clustersB"]:
            fl[(t, d)] += 1

    # the copy's long Z block, and the matched figures that fall inside it
    inside = [r for r in rows if "Z" in r["dirB"]]
    blk = Counter()
    for r in inside:
        for t, d in r["clustersA"]:
            blk[("source", t, d)] += 1
        for t, d in r["clustersB"]:
            blk[("copy", t, d)] += 1

    runs = []
    for c in l1[COPY]:
        d = cord_dir(c)
        if not d:
            continue
        if runs and runs[-1][0] == d:
            runs[-1][2] = c["name"]
            runs[-1][3] += 1
        else:
            runs.append([d, c["name"], c["name"], 1])

    src_dirs = Counter(cord_dir(c) for c in l1[SOURCE])
    out = {
        "threads": len(link["threads"]),
        "matched": len(rows),
        "pairs": {f"{a}->{b}": n for (a, b), n in pairs.items()},
        "flipped": len(flipped),
        "flippedSourceCords": src_pendants_flipped,
        "flippedCopyCords": [n for r in flipped for n in r["b"]],
        "flippedSubsidiaries": sum(1 for r in flipped if any("s" in n for n in r["a"])),
        "same": len(same),
        "clusters": {"/".join(k): v for k, v in sorted(cl.items())},
        "flippedCopyClusters": {"/".join(k): v for k, v in sorted(fl.items())},
        "flippedBySingleAndLong": sum(1 for r in rows if r["slA"] == "S" and r["slB"] == "Z"),
        "insideZBlock": len(inside),
        "insideZBlockSource": [n for r in inside for n in r["a"]],
        "insideZBlockClusters": {"/".join(k): v for k, v in sorted(blk.items())},
        "sourceLevel1": {str(k): v for k, v in src_dirs.items()},
        "copyRuns": [f"{n} {d} ({a}-{b})" for d, a, b, n in runs],
    }
    if "--json" in sys.argv:
        print(json.dumps(out, indent=1))
        return
    for r in rows:
        print(f"{'+'.join(r['a']):>10} {r['dirA']:>2}  ->  {'+'.join(r['b']):<10} {r['dirB']:<2} {r['va']:>5} {r['vb']:>5} {r['kind']}")
    print()
    for k, v in out.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()

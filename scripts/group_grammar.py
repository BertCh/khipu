"""
Two corpus-wide screens behind the Twin Falls story (KH0699), so the
numbers quoted there can be re-derived when the data changes.

    python3 scripts/group_grammar.py            # both screens, corpus summary
    python3 scripts/group_grammar.py KH0699     # plus the alignment for one khipu
    python3 scripts/group_grammar.py KH0699:1   # same, at a chosen phase (sizes alone
                                                # cannot tell which end lost a group)

1. Lone-cord sums (the screen that found KH0699). A place is a group of one
   cord worth at least MIN_LONE, followed by a knotted group of three or more;
   a hit is a place where the lone cord's value equals the following group's
   total, subsidiaries included. The floor keeps out lone cords reading 1
   before groups of ones.

2. Group grammar. A khipu is written as its sequence of group sizes,
   e.g. KH0699 = 6 1 6 9 9 10 9 10 8 | 1 6 1 6 9 9 10 9 10 8 | 1 6 1 7 8 9 10 9 10 8.
   For every period p and phase o (how many leading positions the first
   repeat has lost) the sequence is cut into repeats of length p and each
   template position is checked for agreement across repeats. Sizes agree
   when they are the same class: 1, 2, 3, 4, 5, 6 or 7+. The score is the
   fraction of positions that agree in every repeat. A template must contain
   at least two classes (a khipu of nothing but six-cord groups is periodic
   at every period) and have at least three repeats, the last of which may
   be cut short. Rarity is measured against the same khipu with its group
   order shuffled, so a khipu is only "periodic" if its own groups in
   another order would not score as well.

Reads public/data/khipus/*.json (the app's build of the KFG workbooks).
"""

from __future__ import annotations

import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"

MIN_LONE = 10
MIN_GROUPS = 12
MIN_REPEATS = 3
MIN_PERIOD = 2
MAX_PERIOD = 24
SHUFFLES = 200
SEED = 699


def load() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


# ---------------------------------------------------------------- screen 1


def group_totals(k: dict) -> list[int]:
    """Value of every cord under each group's pendants, subsidiaries included."""
    by_parent: dict[str, list[dict]] = {}
    for c in k["cords"]:
        by_parent.setdefault(c.get("parent") or "", []).append(c)
    tot = [0] * len(k["groups"])
    for c in k["cords"]:
        if c["kind"] != "pendant" or c.get("group") is None:
            continue
        stack, s = [c], 0
        while stack:
            x = stack.pop()
            s += x.get("value") or 0
            stack.extend(by_parent.get(x["name"], []))
        tot[c["group"]] += s
    return tot


def lone_cord_sums(ks: list[dict]) -> tuple[int, int, list[str]]:
    places, hits, where = 0, 0, []
    for k in ks:
        sizes = [g["n"] for g in k["groups"]]
        tot = None
        for i in range(len(sizes) - 1):
            if sizes[i] != 1 or sizes[i + 1] < 3:
                continue
            if tot is None:
                tot = group_totals(k)
            if tot[i] < MIN_LONE or tot[i + 1] == 0:
                continue
            places += 1
            if tot[i] == tot[i + 1]:
                hits += 1
                where.append(f"{k['id']} g{i + 1}={tot[i]}")
    return places, hits, where


# ---------------------------------------------------------------- screen 2


def klass(n: int) -> int:
    return min(n, 7)


def score(sizes: list[int], p: int, o: int) -> tuple[float, int]:
    """Agreement of the period-p template at phase o, and the number of repeats."""
    first = p - o
    reps = [sizes[:first]]
    reps += [sizes[i : i + p] for i in range(first, len(sizes), p)]
    if len(reps) < MIN_REPEATS:
        return 0.0, len(reps)
    # the trailing repeat may be cut short, but must be more than a fragment
    if len(reps[-1]) < p // 2:
        reps = reps[:-1]
        if len(reps) < MIN_REPEATS:
            return 0.0, len(reps)
    cols = []
    for j in range(p):
        col = []
        for r_i, r in enumerate(reps):
            jj = j - o if r_i == 0 else j
            if 0 <= jj < len(r):
                col.append(klass(r[jj]))
        cols.append(col)
    if len({c[0] for c in cols if c}) < 2:
        return 0.0, len(reps)
    agree = sum(1 for c in cols if len(c) >= 2 and len(set(c)) == 1)
    return agree / p, len(reps)


def template(sizes: list[int], p: int, o: int) -> str:
    """The commonest class at each template position, 7+ written as L."""
    first = p - o
    reps = [sizes[:first]] + [sizes[i : i + p] for i in range(first, len(sizes), p)]
    out = []
    for j in range(p):
        col = Counter()
        for r_i, r in enumerate(reps):
            jj = j - o if r_i == 0 else j
            if 0 <= jj < len(r):
                col[klass(r[jj])] += 1
        c = col.most_common(1)[0][0]
        out.append("L" if c == 7 else str(c))
    return " ".join(out)


def best(sizes: list[int]) -> tuple[float, int, int, int]:
    """(score, period, phase, repeats) of the best-agreeing template.

    Ties go to the phase that assumes the fewest lost groups, then to the
    shorter period."""
    out = (0.0, 0, 0, 0)
    for p in range(MIN_PERIOD, min(MAX_PERIOD, len(sizes) // 2) + 1):
        for o in range(p):
            s, r = score(sizes, p, o)
            if (s, -o, -p) > (out[0], -out[2], -out[1]):
                out = (s, p, o, r)
    return out


def grammar(ks: list[dict]) -> list[dict]:
    rng = random.Random(SEED)
    rows = []
    for k in ks:
        sizes = [g["n"] for g in k["groups"]]
        if len(sizes) < MIN_GROUPS:
            continue
        s, p, o, r = best(sizes)
        if s == 0:
            continue
        beat = 0
        for _ in range(SHUFFLES):
            sh = sizes[:]
            rng.shuffle(sh)
            if best(sh)[0] >= s:
                beat += 1
        rows.append(
            dict(
                id=k["id"], n=len(sizes), score=s, p=p, o=o, r=r,
                pval=beat / SHUFFLES, tpl=template(sizes, p, o),
            )
        )
    return rows


def alignment(k: dict, phase: int | None = None) -> str:
    sizes = [g["n"] for g in k["groups"]]
    s, p, o, r = best(sizes)
    if phase is not None:
        o = phase
        s, r = score(sizes, p, o)
    first = p - o
    reps = [sizes[:first]] + [sizes[i : i + p] for i in range(first, len(sizes), p)]
    lines = [f"{k['id']}: {len(sizes)} groups, period {p}, phase {o}, {r} repeats, agreement {s:.2f}"]
    for i, rep in enumerate(reps):
        pad = ["  ·"] * (o if i == 0 else 0)
        lines.append("  " + " ".join(pad + [f"{n:3d}" for n in rep]))
    return "\n".join(lines)


def main() -> None:
    ks = load()
    print(f"{len(ks)} khipus")

    places, hits, where = lone_cord_sums(ks)
    print(f"\nLone-cord sums: {hits} hits in {places} places")
    print("  " + ", ".join(where))

    rows = grammar(ks)
    print(f"\nGroup grammar: {len(rows)} khipus with >= {MIN_GROUPS} groups and a scoring template")
    strong = [x for x in rows if x["score"] >= 0.8 and x["pval"] <= 0.05]
    print(f"  {len(strong)} with agreement >= 0.8 and shuffle p <= 0.05:")
    for x in sorted(strong, key=lambda x: (-x["score"], x["pval"])):
        print(
            f"    {x['id']}  groups {x['n']:3d}  period {x['p']:2d}  phase {x['o']}  "
            f"repeats {x['r']}  agreement {x['score']:.2f}  p={x['pval']:.3f}  [{x['tpl']}]"
        )
    print("  agreement distribution:", sorted(Counter(round(x["score"], 1) for x in rows).items()))

    for arg in sys.argv[1:]:
        kid, _, phase = arg.partition(":")
        k = next(x for x in ks if x["id"] == kid)
        print("\n" + alignment(k, int(phase) if phase else None))


if __name__ == "__main__":
    main()

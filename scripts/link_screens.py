#!/usr/bin/env python3
"""Discovery screens for links between khipus beyond the shared-passage scan.

Each screen prints candidate pairs for a person to examine; nothing here is
asserted.  Screens:

  accession   khipus catalogued under one museum number, with a structural
              comparison (a duplicate record of one object, or parts of one)
  bigvalues   values >= 1000 that occur in exactly two khipus
  groups      whole groups with the same multiset of values, order-free
  colours     runs of twelve pendant colours shared by two khipus
  subs        a pendant whose subsidiary values repeat under a pendant elsewhere
  window4     shared passages the 4-window finds and the 5-window does not

    python3 scripts/link_screens.py [screen ...]
"""
from __future__ import annotations

import collections
import itertools
import json
import re
import sys
from pathlib import Path

from shared_passages import load, scan, scannable, values

ROOT = Path(__file__).resolve().parent.parent

BERLIN = {"Ethnologisches Museum, Berlin", "Museum für Völkerkunde, Berlin"}


def institution(k: dict) -> str:
    m = k["museum"]["canonical"] or k["museum"]["name"] or "?"
    return "Berlin" if m in BERLIN else m


def accession(k: dict) -> str | None:
    """Museum number normalised: no spaces, upper case, trailing part letter dropped."""
    n = (k["museum"].get("number") or "").strip()
    if not n or n.lower() in {"s/n", "unnumbered", "unknown", "none", "-"}:
        return None
    n = re.sub(r"\s+", "", n).upper()
    n = re.sub(r"\(?[A-Z]\)?$", "", n) if re.search(r"\d", n) else n
    return n or None


def label(k: dict) -> str:
    return f"{k['id']} ({','.join(k['aliases'])}; {institution(k)[:20]}; {k['provenance'] or '-'}; {k['stats']['nPendants']}p {k['primary'].get('length') or '?'}cm)"


def screen_accession(ks: list[dict]) -> None:
    by = collections.defaultdict(list)
    for k in ks:
        a = accession(k)
        if a:
            by[(institution(k), a)].append(k)
    print("== same accession number ==")
    for (inst, a), group in sorted(by.items()):
        if len(group) < 2:
            continue
        print(f"{inst} {a}: {len(group)} records")
        for k in group:
            print("   ", label(k))
        for x, y in itertools.combinations(group, 2):
            vx, vy = [v for v in values(x) if v], [v for v in values(y) if v]
            common = len(set(vx) & set(vy))
            px, py = x["stats"]["nPendants"], y["stats"]["nPendants"]
            lx, ly = x["primary"].get("length"), y["primary"].get("length")
            flag = "DUPLICATE?" if px and py and abs(px - py) <= max(2, 0.1 * max(px, py)) and lx and ly and abs(lx - ly) <= 0.1 * max(lx, ly) else ""
            print(f"      {x['id']}~{y['id']}: pendants {px}/{py}, primary {lx}/{ly}, shared distinct values {common}/{min(len(set(vx)), len(set(vy)))} {flag}")


def screen_bigvalues(ks: list[dict]) -> None:
    where = collections.defaultdict(set)
    for k in ks:
        for c in k["cords"]:
            v = c.get("value") or 0
            if v >= 1000:
                where[v].add(k["id"])
    pairs = collections.defaultdict(list)
    for v, ids in where.items():
        if len(ids) == 2:
            a, b = sorted(ids)
            pairs[(a, b)].append(v)
    meta = {k["id"]: k for k in ks}
    print("== values >= 1000 shared by exactly two khipus (pairs with two or more) ==")
    for (a, b), vs in sorted(pairs.items(), key=lambda x: -len(x[1])):
        if len(vs) >= 2:
            print(f"  {label(meta[a])} <-> {label(meta[b])}: {sorted(vs)}")


def screen_groups(ks: list[dict]) -> None:
    index = collections.defaultdict(list)
    for k in ks:
        groups = collections.defaultdict(list)
        for c in k["cords"]:
            if c["level"] == 1:
                groups[c["group"]].append(c.get("value") or 0)
        for g, v in groups.items():
            nz = [x for x in v if x]
            if len(v) >= 4 and len(set(nz)) >= 4 and max(nz) >= 15:
                index[tuple(sorted(v))].append((k["id"], g))
    meta = {k["id"]: k for k in ks}
    print("== whole groups with the same multiset of values ==")
    for key, occ in index.items():
        ids = {o[0] for o in occ}
        if len(ids) > 1:
            print(f"  {list(key)}: {occ}")


def screen_colours(ks: list[dict], window: int = 12) -> None:
    def cols(k):
        cords = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
        return [re.split(r"[-:%^/(]", c.get("color") or "?")[0] for c in cords]

    index = collections.defaultdict(set)
    for k in ks:
        s = cols(k)
        for i in range(len(s) - window + 1):
            w = tuple(s[i : i + window])
            if len(set(w)) >= 3 and "?" not in w:
                index[w].add(k["id"])
    pairs = collections.Counter()
    for w, ids in index.items():
        for a, b in itertools.combinations(sorted(ids), 2):
            pairs[(a, b)] += 1
    meta = {k["id"]: k for k in ks}
    print(f"== shared runs of {window} pendant colours (>= 3 colours) ==")
    for (a, b), n in pairs.most_common(25):
        print(f"  {n:>3} windows  {label(meta[a])} <-> {label(meta[b])}")


def screen_subs(ks: list[dict]) -> None:
    index = collections.defaultdict(set)
    for k in ks:
        kids = collections.defaultdict(list)
        byname = {c["name"]: c for c in k["cords"]}
        for c in k["cords"]:
            if c["level"] == 2 and c.get("parent") in byname:
                kids[c["parent"]].append(c.get("value") or 0)
        for parent, vs in kids.items():
            pv = byname[parent].get("value") or 0
            nz = [x for x in vs if x]
            if len(vs) >= 3 and len(set(nz)) >= 2 and pv:
                index[(pv, tuple(vs))].add(k["id"])
    meta = {k["id"]: k for k in ks}
    print("== pendant + subsidiary value pattern shared across khipus ==")
    for key, ids in index.items():
        if len(ids) > 1:
            print(f"  {key}: {sorted(ids)}")


def screen_window4(ks: list[dict]) -> None:
    import shared_passages as sp

    fwd = {k["id"]: values(k) for k in ks}
    five = set(scan(fwd))
    sp.WINDOW = 4
    sp.informative = lambda w: sum(1 for x in w if x) >= 4 and len(set(w)) >= 4 and max(w) >= 15
    four = scan(fwd)
    meta = {k["id"]: k for k in ks}
    print("== pairs the 4-window finds and the 5-window does not ==")
    for (a, b), runs in sorted(four.items(), key=lambda x: -sum(r[0] for r in x[1])):
        if (a, b) in five:
            continue
        best = sorted(runs, reverse=True)[:3]
        vals = [fwd[a][i : i + n] for n, i, _ in best]
        print(f"  {label(meta[a])} <-> {label(meta[b])}: {best} {vals}")


def screen_leaders(ks: list[dict]) -> None:
    """One khipu's consecutive values against the k-th cord of every group of another (summaries)."""
    fwd = {k["id"]: values(k) for k in ks}
    seqs = dict(fwd)
    for k in ks:
        groups = collections.defaultdict(list)
        for c in sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"]):
            groups[c["group"]].append(c.get("value") or 0)
        gl = [groups[g] for g in sorted(groups)]
        for pos in range(3):
            seq = [g[pos] for g in gl if len(g) > pos]
            if len(seq) >= 5:
                seqs[f"{k['id']}#{pos}"] = seq
    meta = {k["id"]: k for k in ks}
    print("== a khipu's run of values = the group leaders (position 0/1/2) of another ==")
    rows = []
    for (a, b), runs in scan(seqs).items():
        if ("#" in a) == ("#" in b):
            continue
        plain, lead = (a, b) if "#" not in a else (b, a)
        if plain == lead.split("#")[0]:
            continue
        rows.append((sum(r[0] for r in runs), plain, lead, sorted(runs, reverse=True)[:3]))
    for total, plain, lead, runs in sorted(rows, reverse=True):
        lid, pos = lead.split("#")
        print(f"  {total:>3}  {label(meta[plain])} = position {pos} of each group of {label(meta[lid])}  {runs}")


def screen_near(ks: list[dict], tol: float = 0.02) -> None:
    """Runs of five where each value is exact or within tol (values >= 100 only), >= 3 exact."""
    fwd = {k["id"]: values(k) for k in ks}
    meta = {k["id"]: k for k in ks}

    def key(v: int) -> int:
        return v if v < 100 else round(v / (v * tol * 2 or 1))

    def close(x: int, y: int) -> bool:
        return x == y or (x >= 100 and y >= 100 and abs(x - y) <= tol * max(x, y))

    # index by the rounded shape of the window, then confirm pairwise
    index = collections.defaultdict(list)
    for kid, s in fwd.items():
        for i in range(len(s) - 4):
            w = s[i : i + 5]
            if sum(1 for x in w if x >= 100) >= 4 and len(set(w)) >= 4:
                index[tuple(key(x) for x in w)].append((kid, i))
    pairs = collections.defaultdict(set)
    for occ in index.values():
        for (a, i), (b, j) in itertools.combinations(occ, 2):
            if a == b:
                continue
            wa, wb = fwd[a][i : i + 5], fwd[b][j : j + 5]
            exact = sum(1 for x, y in zip(wa, wb) if x == y)
            if exact >= 3 and 5 > exact and all(close(x, y) for x, y in zip(wa, wb)):
                pairs[tuple(sorted((a, b)))].add((i, j, tuple(wa), tuple(wb)))
    print(f"== near-match runs of five (values >= 100 within {tol:.0%}, 3-4 exact) ==")
    for (a, b), occ in sorted(pairs.items(), key=lambda x: -len(x[1])):
        ex = sorted(occ)[0]
        print(f"  {len(occ):>2}  {label(meta[a])} <-> {label(meta[b])}  e.g. {ex[2]} vs {ex[3]} at {ex[0]}/{ex[1]}")


def leader_sequences(ks: list[dict]) -> dict[str, list[int]]:
    """id#pos -> the value at position pos of each group with more than pos cords."""
    seqs = {}
    for k in ks:
        groups = collections.defaultdict(list)
        for c in sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"]):
            groups[c["group"]].append(c.get("value") or 0)
        gl = [groups[g] for g in sorted(groups)]
        for pos in range(3):
            seq = [g[pos] for g in gl if len(g) > pos]
            if len(seq) >= 5:
                seqs[f"{k['id']}#{pos}"] = seq
    return seqs


def scan_fourfive(seqs: dict[str, list[int]], minmax: int = 100) -> dict[tuple[str, str], set]:
    """Windows of five with four positions exact (one free), all five >= 15, max >= minmax."""
    index = collections.defaultdict(list)
    for kid, s in seqs.items():
        for i in range(len(s) - 4):
            w = tuple(s[i : i + 5])
            if min(w) >= 15 and len(set(w)) >= 4 and max(w) >= minmax:
                for free in range(5):
                    key = tuple(None if p == free else v for p, v in enumerate(w))
                    index[key].append((kid, i, free))
    pairs = collections.defaultdict(set)
    for occ in index.values():
        seen = set()
        for (a, i, fa), (b, j, fb) in itertools.combinations(occ, 2):
            base_a, base_b = a.split("#")[0], b.split("#")[0]
            if base_a == base_b or fa != fb or (a, b, i, j) in seen:
                continue
            seen.add((a, b, i, j))
            wa, wb = tuple(seqs[a][i : i + 5]), tuple(seqs[b][j : j + 5])
            if wa == wb:
                continue  # the exact scans have it
            pairs[tuple(sorted((a, b)))].add((i, j, wa, wb))
    return pairs


def screen_fourfive(ks: list[dict]) -> None:
    import random

    fwd = {k["id"]: values(k) for k in ks}
    seqs = {**fwd, **leader_sequences(ks)}
    meta = {k["id"]: k for k in ks}
    pairs = scan_fourfive(seqs)
    print("== four of five values in order (all >= 15, one >= 100), plain or group-position sequences ==")
    for (a, b), occ in sorted(pairs.items(), key=lambda x: -len(x[1])):
        ex = sorted(occ)[0]
        print(f"  {len(occ):>2}  {label(meta[a.split('#')[0]])}{a[6:]} <-> {label(meta[b.split('#')[0]])}{b[6:]}  e.g. {ex[2]} vs {ex[3]} at {ex[0]}/{ex[1]}")
    random.seed(7)
    base = []
    for _ in range(2):
        sh = {}
        for kid, s in fwd.items():
            t = s[:]
            random.shuffle(t)
            sh[kid] = t
        base.append(len(scan_fourfive(sh)))
    print(f"  observed {len(pairs)} pairs; shuffled plain-only corpora: {base}")


SCREENS = {
    "fourfive": screen_fourfive,
    "leaders": screen_leaders,
    "near": screen_near,
    "accession": screen_accession,
    "bigvalues": screen_bigvalues,
    "groups": screen_groups,
    "colours": screen_colours,
    "subs": screen_subs,
    "window4": screen_window4,
}

if __name__ == "__main__":
    ks = scannable(load())
    for name in sys.argv[1:] or SCREENS:
        SCREENS[name](ks)
        print()

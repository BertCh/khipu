#!/usr/bin/env python3
"""Export the link data for the /network page to public/data/stories/links.json.

Three parts, none of them editorial (which pairs are verified, and what they
mean, is src/lib/stories/links.ts):

  pairs       the shared-passage scan of scripts/shared_passages.py run with a
              window of five and again with a window of four (all four values
              nonzero and distinct, one >= 15), forward and reversed, merged by
              pair.  A reversed match comes out of the scan twice; it is folded
              into one row with run starts in each khipu's own forward order.
  baseline    how many pairs the same scans find in shuffled corpora, by the
              length of the longest run — the noise floor the page quotes.
  accessions  khipus catalogued under one museum number (a part letter dropped),
              the two Berlin institution names treated as one.
  places      khipus with the same recorded find-spot.

    python3 scripts/build_links.py
"""
from __future__ import annotations

import collections
import json
import random
import re
from pathlib import Path

import shared_passages as sp
from shared_passages import load, scannable, values

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "stories" / "links.json"
SHUFFLES = 3
BERLIN = {"Ethnologisches Museum, Berlin", "Museum für Völkerkunde, Berlin"}



def informative4(w: tuple[int, ...]) -> bool:
    return all(w) and len(set(w)) == 4 and max(w) >= 15


def scan_both(fwd: dict[str, list[int]]) -> dict[tuple[str, str, str], set[tuple[int, int, int]]]:
    """(a, b, dir) -> maximal shared runs, from the 5-window and the 4-window scans."""
    n = {kid: len(s) for kid, s in fwd.items()}
    rev = {f"{k}~": s[::-1] for k, s in fwd.items()}
    pairs: dict[tuple[str, str, str], set[tuple[int, int, int]]] = collections.defaultdict(set)
    for window, informative in ((5, sp.informative), (4, informative4)):
        sp.WINDOW, sp.informative = window, informative
        for (a, b), runs in sp.scan(fwd).items():
            pairs[(a, b, "fwd")].update(runs)
        for (a, b), runs in sp.scan({**fwd, **rev}).items():
            if a.endswith("~") == b.endswith("~"):
                continue
            aa, bb = a.rstrip("~"), b.rstrip("~")
            if aa == bb:
                continue
            for length, i, j in runs:
                if a.endswith("~"):
                    i = n[aa] - i - length
                else:
                    j = n[bb] - j - length
                lo, hi = (aa, bb) if aa < bb else (bb, aa)
                if lo != aa:
                    i, j = j, i
                pairs[(lo, hi, "rev")].add((length, i, j))
    return pairs


def longest_by_pair(pairs) -> collections.Counter:
    best: dict[tuple[str, str], int] = {}
    for (a, b, _), runs in pairs.items():
        best[(a, b)] = max(best.get((a, b), 0), max(r[0] for r in runs))
    return collections.Counter(best.values())


def accession(k: dict) -> str | None:
    n = (k["museum"].get("number") or "").strip()
    if not n or n.lower() in {"s/n", "unnumbered", "unknown", "none", "-"}:
        return None
    n = re.sub(r"\s+", "", n).upper()
    if re.search(r"\d", n):
        n = re.sub(r"\(?[A-Z]\)?$", "", n)
    return n or None


def institution(k: dict) -> str:
    m = k["museum"]["canonical"] or k["museum"]["name"] or "unknown museum"
    return "Ethnologisches Museum, Berlin" if m in BERLIN else m


def main() -> None:
    ks = load()
    fwd = {k["id"]: values(k) for k in scannable(ks)}

    pairs = scan_both(fwd)
    rows = []
    for (a, b, direction), runs in pairs.items():
        spans = sorted(runs, reverse=True)
        rows.append(
            {
                "a": a,
                "b": b,
                "dir": direction,
                "values": sum(r[0] for r in spans),
                "runs": len(spans),
                "longest": spans[0][0],
                "spans": [list(s) for s in spans],
            }
        )
    rows.sort(key=lambda r: (-r["values"], r["a"], r["b"], r["dir"]))

    random.seed(sp.SEED)
    floors: dict[str, list[int]] = collections.defaultdict(list)
    for _ in range(SHUFFLES):
        shuffled = {}
        for kid, s in fwd.items():
            t = s[:]
            random.shuffle(t)
            shuffled[kid] = t
        counts = longest_by_pair(scan_both(shuffled))
        floors["6"].append(sum(v for k, v in counts.items() if k >= 6))
        floors["5"].append(counts.get(5, 0))
        floors["4"].append(counts.get(4, 0))
    observed = longest_by_pair(pairs)
    baseline = {
        "6": {"observed": sum(v for k, v in observed.items() if k >= 6), "shuffled": round(sum(floors["6"]) / SHUFFLES, 1)},
        "5": {"observed": observed.get(5, 0), "shuffled": round(sum(floors["5"]) / SHUFFLES, 1)},
        "4": {"observed": observed.get(4, 0), "shuffled": round(sum(floors["4"]) / SHUFFLES, 1)},
    }

    by_acc = collections.defaultdict(list)
    for k in ks:
        a = accession(k)
        if a:
            by_acc[(institution(k), a)].append(k["id"])
    accessions = [
        {"id": f"acc-{i}", "museum": inst, "number": num, "ids": sorted(ids)}
        for i, ((inst, num), ids) in enumerate(sorted(by_acc.items()))
        if len(ids) > 1
    ]

    by_place = collections.defaultdict(list)
    for k in ks:
        place = (k.get("provenance") or "").strip()  # corrected find-spots come from build_data.SOURCE_OVERRIDES
        if place:
            by_place[place].append(k["id"])
    places = [
        {"id": f"place-{i}", "label": place, "ids": sorted(ids)}
        for i, (place, ids) in enumerate(sorted(by_place.items(), key=lambda x: (-len(x[1]), x[0])))
        if len(ids) > 1
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {"windows": [5, 4], "shuffles": SHUFFLES, "baseline": baseline, "pairs": rows, "accessions": accessions, "places": places},
            indent=1,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"{len(rows)} pairs, {len(accessions)} shared accessions, {len(places)} find-spots -> {OUT.relative_to(ROOT)}")
    print("baseline", json.dumps(baseline))


if __name__ == "__main__":
    main()

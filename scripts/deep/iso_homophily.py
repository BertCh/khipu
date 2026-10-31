#!/usr/bin/env python3
"""Provenance / institution homophily of long palette-substituted colour isomorph runs.

Input: the colour-channel hits of iso_scan.py run with ISO_CAP=30 (pairs whose longest
local-isomorph run >= threshold).  Statistic: fraction of hit pairs (both labelled)
whose two khipus share a provenance key (or institution).  Null: permute the labels
over all labelled khipus of the corpus (NPERM), recompute the fraction on the same
hit pairs (degree structure of the hit graph preserved).
Usage: python3 iso_homophily.py [min_len]
"""
from __future__ import annotations

import json
import random
import sys

import numpy as np

from iso_common import OUT, load
from iso_templates import prov_key

NPERM = 5000


def main():
    minlen = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    rep = json.loads((OUT / "iso_scan_cap30_colour.json").read_text())["colour"]
    ks = {k["id"]: k for k in load()}
    hits = [(h["a"], h["b"], h["class"], h["literal"]) for h in rep["hits"] if h["len"] >= minlen]
    if not hits or rep["threshold"] > minlen:
        # hits are only stored >= threshold; fall back
        pass
    rng = random.Random(23)
    # pool of khipus that have ANY colour-cycle stretch (q = 2..12, >= 3 units): iso_templates.cycles
    from iso_templates import cycles
    cyc = {i for i, k in ks.items() if k["n"] >= 20 and any(q >= 4 for q, *_ in cycles(k["colour"]))}
    out = {"min_len": minlen, "n_hits": len(hits)}
    for attr in ("prov", "museum"):
        lab = {i: (prov_key(k) if attr == "prov" else (k["museum"] or None)) for i, k in ks.items()}
        if attr == "museum":
            lab = {i: ("Berlin" if v and "Berlin" in v else v) for i, v in lab.items()}
        hp = [(a, b) for a, b, _, _ in hits if lab[a] and lab[b]]
        obs = np.mean([lab[a] == lab[b] for a, b in hp]) if hp else 0
        for pool_name, pool in (("corpus", [i for i in ks if lab[i]]), ("cyclic", [i for i in cyc if lab[i]])):
          ids = pool
          vals = [lab[i] for i in ids]
          # pairs whose both ends are in the pool
          hpp = [(a, b) for a, b in hp if a in set(pool) and b in set(pool)]
          obs = np.mean([lab[a] == lab[b] for a, b in hpp]) if hpp else 0
          nulls = []
          for _ in range(NPERM):
              rng.shuffle(vals)
              m = dict(zip(ids, vals))
              nulls.append(np.mean([m[a] == m[b] for a, b in hpp]))
          nulls = np.array(nulls)
          out[f"{attr}_{pool_name}"] = {"pool": len(pool), "pairs_labelled": len(hpp), "frac": round(float(obs), 3),
                     "null_mean": round(float(nulls.mean()), 3), "null_sd": round(float(nulls.std()), 3),
                     "p": float(((nulls >= obs).sum() + 1) / (NPERM + 1))}
          print(attr, pool_name, out[f"{attr}_{pool_name}"])
        continue
        nulls = []
        for _ in range(NPERM):
            rng.shuffle(vals)
            m = dict(zip(ids, vals))
            nulls.append(np.mean([m[a] == m[b] for a, b in hp]))
        nulls = np.array(nulls)
        out[attr] = {"pairs_labelled": len(hp), "same": int(round(obs * len(hp))), "frac": round(float(obs), 3),
                     "null_mean": round(float(nulls.mean()), 3), "null_sd": round(float(nulls.std()), 3),
                     "p": float(((nulls >= obs).sum() + 1) / (NPERM + 1))}
        from collections import Counter
        out[attr]["which"] = Counter(lab[a] for a, b in hp if lab[a] == lab[b]).most_common(5)
        print(attr, out[attr])
    (OUT / f"iso_homophily_{minlen}.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

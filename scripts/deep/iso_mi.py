#!/usr/bin/env python3
"""Does colour behave like a category label (slot marker) or like a cipher on the number?

Per khipu (>= MINN level-1 cords, decimal-readable), with colour = normalised
colour string of each level-1 cord:
  MI(colour; gpos)        position of the cord inside its group
  MI(colour; mag)         magnitude class of the value: 0/None, 1-9, 10-99, 100-999, >=1000
  MI(colour; mag | gpos)  conditional MI -- does colour still carry magnitude once the slot is known?
Nulls (NPERM each): colours permuted within the khipu (for the first two);
colours permuted within same-gpos cells (for the conditional one).  Reported:
excess MI (obs - null mean) in bits, normalised by H(colour), and empirical p.
Corpus summary: fractions of khipus significant at p < 0.01 (Benjamini-Hochberg).
"""
from __future__ import annotations

import collections
import json
import math

import numpy as np

from iso_common import OUT, NOVALUE, load

MINN = 30
NPERM = 500


def mag(v):
    if not v:
        return 0
    return min(4, int(math.log10(v)) + 1)


def mi(x, y):
    n = len(x)
    joint = collections.Counter(zip(x, y))
    px, py = collections.Counter(x), collections.Counter(y)
    return sum(c / n * math.log2(c * n / (px[a] * py[b])) for (a, b), c in joint.items())


def cmi(x, y, z):
    n = len(x)
    tot = 0.0
    byz = collections.defaultdict(list)
    for a, b, c in zip(x, y, z):
        byz[c].append((a, b))
    for c, ab in byz.items():
        xa, yb = zip(*ab)
        tot += len(ab) / n * mi(xa, yb)
    return tot


def ent(x):
    n = len(x)
    return -sum(c / n * math.log2(c / n) for c in collections.Counter(x).values())


def bh(ps, q=0.01):
    ps = np.array(ps)
    o = np.argsort(ps)
    m = len(ps)
    thr = q * (np.arange(1, m + 1)) / m
    ok = ps[o] <= thr
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    sig = np.zeros(m, bool)
    sig[o[:k]] = True
    return sig


def main():
    rng = np.random.default_rng(13)
    rows = []
    for k in load():
        if k["n"] < MINN or k["id"] in NOVALUE:
            continue
        col = k["colour"]
        if len(set(col)) < 2:
            continue
        gp = [min(p, 12) for p in k["gpos"]]
        mg = [mag(v) for v in k["value"]]
        H = ent(col)
        r = {"id": k["id"], "n": k["n"], "H": round(H, 3), "k": len(set(col))}
        obs = {"gpos": mi(col, gp), "mag": mi(col, mg), "mag|gpos": cmi(col, mg, gp)}
        nulls = {key: [] for key in obs}
        cells = collections.defaultdict(list)
        for i, g in enumerate(gp):
            cells[g].append(i)
        colarr = np.array(col, dtype=object)
        for _ in range(NPERM):
            pc = list(rng.permutation(colarr))
            nulls["gpos"].append(mi(pc, gp))
            nulls["mag"].append(mi(pc, mg))
            cc = colarr.copy()
            for idx in cells.values():
                cc[idx] = rng.permutation(colarr[idx])
            nulls["mag|gpos"].append(cmi(list(cc), mg, gp))
        for key in obs:
            nd = np.array(nulls[key])
            r[key] = {"obs": round(obs[key], 3), "null": round(float(nd.mean()), 3),
                      "excess_norm": round((obs[key] - nd.mean()) / H, 3),
                      "p": float(((nd >= obs[key]).sum() + 1) / (NPERM + 1))}
        rows.append(r)
    out = {"n_khipus": len(rows)}
    for key in ("gpos", "mag", "mag|gpos"):
        sig = bh([r[key]["p"] for r in rows])
        ex = np.array([r[key]["excess_norm"] for r in rows])
        out[key] = {"sig_BH01": int(sig.sum()), "median_excess_norm": round(float(np.median(ex)), 3),
                    "median_excess_norm_sig": round(float(np.median(ex[sig])), 3) if sig.any() else None}
        for r, s in zip(rows, sig):
            r[key]["sig"] = bool(s)
    # classification
    lab = collections.Counter()
    for r in rows:
        a, b = r["gpos"]["sig"], r["mag|gpos"]["sig"]
        lab[("slot" if a else "-") + "+" + ("magnitude-beyond-slot" if b else "-")] += 1
    out["classes"] = dict(lab)
    top = sorted(rows, key=lambda r: -r["mag|gpos"]["excess_norm"])[:15]
    out["top_mag_beyond_slot"] = [(r["id"], r["n"], r["k"], r["mag|gpos"]) for r in top]
    print(json.dumps(out, indent=1))
    (OUT / "iso_mi.json").write_text(json.dumps({"summary": out, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()

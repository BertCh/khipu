#!/usr/bin/env python3
"""
Relation 1 (pendant-pendant sum) vs shuffle nulls, split by how far the summand run
sits from the sum cord (their search accepts a contiguous run ANYWHERE to one side).
Also the Table-1 khipu count, and the same for their 'high magnitude khipus have few
sums' observation (instances per khipu vs mean pendant value, observed vs null).

null 'global' : permute level-1 values within each khipu
null 'cluster': permute values within each cluster
Writes $S/out/mk_port_null_r1.json
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mk_port_relations as M  # noqa: E402
from mk_port_quirks import load, shuffled, restore  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 100


def stats(pks):
    tot = adj = near = 0
    ks = set()
    ks_adj = set()
    per = {}
    for kid, pk in pks.items():
        pos = {c.name: i for i, c in enumerate(pk.l1)}
        rows = M.pendant_pendant_sum(pk)
        per[kid] = len(rows)
        for x in rows:
            s = pos[x["sum_cord"]]
            g = min(abs(pos[n] - s) for n in x["summands"]) - 1
            tot += 1
            adj += g == 0
            near += g <= 2
            ks.add(kid)
            if g == 0:
                ks_adj.add(kid)
    return {"inst": tot, "adjacent": adj, "gap_le2": near, "khipus": len(ks), "khipus_adjacent": len(ks_adj)}, per


def main():
    pks = load()
    obs, per_obs = stats(pks)
    rng = random.Random(11)
    out = {"observed": obs}
    for mode in ("global", "cluster"):
        acc = {k: [] for k in obs}
        for i in range(N):
            saved = {}
            for pk in pks.values():
                saved[pk.id] = shuffled(pk, mode, rng)
            s, _ = stats(pks)
            for pk in pks.values():
                restore(pk, saved[pk.id])
            for k in s:
                acc[k].append(s[k])
        out[mode] = {k: {"mean": float(np.mean(v)), "sd": float(np.std(v)),
                         "p": float((np.sum(np.array(v) >= obs[k]) + 1) / (N + 1))} for k, v in acc.items()}
        print(mode, json.dumps(out[mode]), flush=True)
    print("observed", obs)
    (M.SCRATCH / "out" / "mk_port_null_r1.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

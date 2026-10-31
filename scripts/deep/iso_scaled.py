#!/usr/bin/env python3
"""KH0505 (UR268) vs KH0514 (UR275): the two Inkawasi peanut ledgers as a scaled pair.

The rank-isomorph scan (iso_scan.py rank) found a 15-cord order-isomorphic run
(KH0505 cords 13..27 == KH0514 cords 13..27) with no equal values.  Here the two
are aligned by (group, position in group) over the leading groups whose sizes
and colour templates agree, and we test whether the values co-vary.

Statistic: Spearman rho of log values over aligned cords (fixed-deduction cords
excluded) and the spread of log ratios.  Null: permute KH0514's groups among
groups of the same size (roles inside a group are kept, so the null already
knows 'first cord is big, last cord is big'), 20000 draws; also a within-role
null (shuffle values among cords of the same group-position across groups).
"""
from __future__ import annotations

import collections
import json
import math
import random

import numpy as np
from scipy.stats import spearmanr

from iso_common import OUT, load

A, B = "KH0505", "KH0514"


def groups_of(k):
    g = collections.OrderedDict()
    for gi, c, v in zip(k["group"], k["colour"], k["value"]):
        g.setdefault(gi, []).append((c, v))
    return list(g.values())


def aligned(ga, gb, fixed_a=208, fixed_b=47):
    xs, ys, where = [], [], []
    for gi, (a, b) in enumerate(zip(ga, gb)):
        if len(a) != len(b):
            continue
        for p, ((ca, va), (cb, vb)) in enumerate(zip(a, b)):
            if p == 1:  # fixed deduction cord
                continue
            if va and vb:
                xs.append(math.log(va)); ys.append(math.log(vb)); where.append((gi, p))
    return np.array(xs), np.array(ys), where


def main():
    ks = {k["id"]: k for k in load()}
    ga, gb = groups_of(ks[A]), groups_of(ks[B])
    # leading run of groups with equal sizes
    lead = 0
    while lead < min(len(ga), len(gb)) and len(ga[lead]) == len(gb[lead]):
        lead += 1
    colour_agree = sum(ca == cb for a, b in zip(ga[:lead], gb[:lead]) for (ca, _), (cb, _) in zip(a, b))
    ncords = sum(len(a) for a in ga[:lead])
    x, y, where = aligned(ga[:lead], gb[:lead])
    rho = spearmanr(x, y).statistic
    lr = x - y
    out = {"lead_groups": lead, "sizes": [len(g) for g in ga[:lead]], "colour_identical": [colour_agree, ncords],
           "n_aligned": len(x), "spearman": rho, "logratio_mean": float(lr.mean()), "ratio": math.exp(lr.mean()),
           "logratio_sd": float(lr.std()), "fixed_ratio": 208 / 47,
           "pairs": [(w, round(math.exp(a)), round(math.exp(b))) for w, a, b in zip(where, x, y)]}
    rng = random.Random(1)
    # null 1: permute B's leading groups among same-size groups
    bysize = collections.defaultdict(list)
    for i, g in enumerate(gb[:lead]):
        bysize[len(g)].append(i)
    null1, null_sd = [], []
    for _ in range(20000):
        perm = list(range(lead))
        for s, idx in bysize.items():
            sh = idx[:]
            rng.shuffle(sh)
            for i, j in zip(idx, sh):
                perm[i] = j
        gbp = [gb[perm[i]] for i in range(lead)]
        xx, yy, _ = aligned(ga[:lead], gbp)
        null1.append(spearmanr(xx, yy).statistic)
        null_sd.append((xx - yy).std())
    null1, null_sd = np.array(null1), np.array(null_sd)
    out["null_group_perm"] = {"rho_mean": float(null1.mean()), "rho_sd": float(null1.std()),
                              "p_rho": float((null1 >= rho).mean()),
                              "sd_mean": float(null_sd.mean()), "p_sd": float((null_sd <= lr.std()).mean())}
    # null 2: within role (same group-size, same position) shuffle of B's values
    roles = collections.defaultdict(list)
    for gi, g in enumerate(gb[:lead]):
        for p, (c, v) in enumerate(g):
            roles[(len(g), p)].append((gi, p))
    null2 = []
    for _ in range(20000):
        gbp = [list(g) for g in gb[:lead]]
        for key, slots in roles.items():
            vals = [gb[gi][p][1] for gi, p in slots]
            rng.shuffle(vals)
            for (gi, p), v in zip(slots, vals):
                gbp[gi][p] = (gbp[gi][p][0], v)
        xx, yy, _ = aligned(ga[:lead], gbp)
        null2.append((xx - yy).std())
    null2 = np.array(null2)
    out["null_role_shuffle"] = {"sd_mean": float(null2.mean()), "sd_sd": float(null2.std()),
                                "p_sd": float((null2 <= lr.std()).mean())}
    print(json.dumps({k: v for k, v in out.items() if k != "pairs"}, indent=1))
    for w, a, b in out["pairs"]:
        print("  g%d p%d  %6d %6d  x%.2f" % (w[0], w[1], a, b, a / b))
    (OUT / "iso_scaled.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

"""build_chance: chart data for /stories/what-chance-can-do.

Re-runs our port of Medrano & Khosla's (2024) Ascher sum relations
(scripts/mk/mk_sig_common.py) on every khipu in public/data/khipus, and the
same searches on R copies of each khipu whose pendant cords have been shuffled
among its own slots (null "a": group sizes, the multiset of values, colours
and subsidiaries all kept). Seeds are fixed, so the output is deterministic.

    python3 scripts/build_chance.py [R]      # default R = 200, ~1 min on 8 cores

Writes public/data/stories/chance.json.
"""
from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent / "mk"))
from mk_sig_common import load_models, rel1, rel2, rel3, rel4, rel5, rel7, rel9, draw_null  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "stories" / "chance.json"
DEMO = ["KH0698", "KH0081"]

FEATS = ["r1", "r1R", "r1adj", "r2", "r3", "r4", "r5", "r7", "r9"]


def feats(m):
    r1 = rel1(m)
    o = dict(
        r1=len(r1),
        r1R=sum(1 for x in r1 if x[2]),
        # summands begin on the cord next to the sum cord (either side)
        r1adj=sum(1 for i, s, _ in r1 if s and (s[0] == i + 1 or s[-1] == i - 1)),
        r2=len(rel2(m)), r3=len(rel3(m)), r4=len(rel4(m)), r5=len(rel5(m)),
        r7=len(rel7(m)), r9=len(rel9(m)),
    )
    return [o[f] for f in FEATS]


def work(args):
    m, R, seed = args
    rng = np.random.default_rng(seed)
    obs = feats(m)
    null = [feats(draw_null(m, "a", rng)) for _ in range(R)]
    return m["id"], obs, null


def gradient_rho(m):
    """Spearman of group position vs group mean log10 value (groups with values)."""
    gm = []
    for gi, g in enumerate(m["groups"]):
        v = [m["P"][j]["v"] for j in g if m["P"][j]["v"] > 0]
        if v:
            gm.append((gi, float(np.log10(v).mean())))
    if len(gm) < 4:
        return None
    a = np.array(gm)
    rk = lambda x: np.argsort(np.argsort(x))  # noqa: E731
    return float(np.corrcoef(rk(a[:, 0]), rk(a[:, 1]))[0, 1])


def main():
    R = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    ms = [m for m in load_models() if len(m["P"]) >= 3]
    ms.sort(key=lambda m: m["id"])
    byid = {m["id"]: m for m in ms}
    with Pool(8) as pool:
        res = pool.map(work, [(m, R, 7000 + int(m["id"][2:])) for m in ms], chunksize=4)
    ids = [r[0] for r in res]
    obs = np.array([r[1] for r in res])  # K x F
    null = np.array([r[2] for r in res]).transpose(1, 0, 2)  # R x K x F
    fi = {f: i for i, f in enumerate(FEATS)}

    # ---- corpus totals per relation, observed vs shuffled
    def corpus(f):
        o = obs[:, fi[f]]
        n = null[:, :, fi[f]]
        tot = n.sum(axis=1)
        return dict(
            obs=int(o.sum()),
            null=round(float(tot.mean()), 1),
            sd=round(float(tot.std()), 1),
            khipus=int((o > 0).sum()),
            nullKhipus=round(float((n > 0).sum(axis=1).mean()), 1),
        )

    relations = {f: corpus(f) for f in ["r1", "r1adj", "r2", "r3", "r4", "r5", "r7", "r9"]}
    any_obs = (obs[:, [fi[f] for f in ["r1", "r2", "r3", "r4", "r5", "r7", "r9"]]].sum(axis=1) > 0)
    any_null = (null[:, :, [fi[f] for f in ["r1", "r2", "r3", "r4", "r5", "r7", "r9"]]].sum(axis=2) > 0).sum(axis=1)
    anyrel = dict(obs=int(any_obs.sum()), null=round(float(any_null.mean()), 1), of=len(ids))

    # ---- per-khipu excess on relations 1+2+3+5 (the pendant sums)
    cols = [fi[f] for f in ["r1", "r2", "r3", "r5"]]
    raw = obs[:, cols].sum(axis=1)
    nraw = null[:, :, cols].sum(axis=2)  # R x K
    exp = nraw.mean(axis=0)
    sd = nraw.std(axis=0)
    p = (1 + (nraw >= raw).sum(axis=0)) / (R + 1)
    khipus = []
    for k, kid in enumerate(ids):
        m = byid[kid]
        nz = [p_["v"] for p_ in m["P"] if p_["v"] > 0]
        if not nz:
            continue
        khipus.append([
            kid,
            len(m["P"]),
            round(float(np.log10(np.mean(nz))), 2),
            int(raw[k]),
            round(float(exp[k]), 1),
            round(float((raw[k] - exp[k]) / max(sd[k], 1.0)), 2),
            round(float(p[k]), 4),
        ])

    # ---- magnitude bins (khipus with >= 10 pendants)
    bins = [(-9, 1, "under 10"), (1, 2, "10–99"), (2, 3, "100–999"), (3, 9, "1,000+")]
    mag = []
    for lo, hi, label in bins:
        sel = [i for i, row in enumerate(khipus) if row[1] >= 10 and lo <= row[2] < hi]
        o = sum(khipus[i][3] for i in sel)
        e = sum(khipus[i][4] for i in sel)
        mag.append(dict(label=label, khipus=len(sel), obs=o, null=round(e, 1),
                        sig=sum(1 for i in sel if khipus[i][6] <= 0.05)))

    # ---- handedness: right share of pendant-pendant sums, by magnitude gradient
    right = obs[:, fi["r1R"]].sum() / obs[:, fi["r1"]].sum()
    nright = (null[:, :, fi["r1R"]].sum(axis=1) / null[:, :, fi["r1"]].sum(axis=1))
    grad = {"decreasing": [0, 0, 0], "flat": [0, 0, 0], "increasing": [0, 0, 0]}
    for k, kid in enumerate(ids):
        if obs[k, fi["r1"]] < 5:
            continue
        rho = gradient_rho(byid[kid])
        if rho is None:
            continue
        key = "decreasing" if rho < -0.1 else "increasing" if rho > 0.1 else "flat"
        grad[key][0] += 1
        grad[key][1] += int(obs[k, fi["r1"]])
        grad[key][2] += int(obs[k, fi["r1R"]])
    handed = dict(
        right=round(float(right), 4),
        nullRight=round(float(nright.mean()), 4),
        nullSd=round(float(nright.std()), 4),
        n=int(obs[:, fi["r1"]].sum()),
        byGradient=[dict(key=k, khipus=v[0], sums=v[1], right=round(v[2] / v[1], 4)) for k, v in grad.items()],
    )

    # ---- demo khipus: the shuffled distribution of pendant-pendant sums
    demo = {}
    for kid in DEMO:
        k = ids.index(kid)
        demo[kid] = dict(obs=int(obs[k, fi["r1"]]), null=[int(x) for x in null[:, k, fi["r1"]]])

    out = dict(
        note="Generated by scripts/build_chance.py — port of Medrano & Khosla (2024) relations "
             "(scripts/mk/mk_sig_common.py); null = each khipu's pendant cords shuffled among its own slots.",
        R=R,
        nKhipus=len(ids),
        relations=relations,
        anyRelation=anyrel,
        khipuCols=["id", "pendants", "log10Mean", "raw", "expected", "z", "p"],
        khipus=khipus,
        magnitude=mag,
        handedness=handed,
        demo=demo,
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(json.dumps({k: v for k, v in out.items() if k not in ("khipus", "demo")}, indent=1))
    print("sig p<=.01:", sum(1 for r in khipus if r[6] <= 0.01), "p<=.05:", sum(1 for r in khipus if r[6] <= 0.05))
    print("demo obs:", {k: v["obs"] for k, v in demo.items()})


if __name__ == "__main__":
    main()

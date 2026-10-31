#!/usr/bin/env python3
"""(d) Colour semantics: does a solid colour carry a consistent value magnitude across khipus/regions?

Within each khipu: level-1 pendants with value>0 and a single solid colour code; value rank-normalised
to a percentile in (0,1) (average ranks).  Khipus with >=8 such pendants and >=2 colours.
Colour effect = mean over khipus containing the colour of (mean percentile of that colour - 0.5)
  (each khipu weighs once).
Null: values permuted among the valued pendants within each khipu (colours fixed), 2000 reps.
Cross-region consistency: per-region colour effects for colours present in >=4 khipus in each of two
regions; statistic = Pearson r between the regions' effect vectors averaged over region pairs;
null = same within-khipu permutation.
Also: subsidiaries (level>=2) vs their parent pendant is out of scope here.
"""
from __future__ import annotations
import collections, itertools, json
import numpy as np
from scipy.stats import rankdata
import vocab_common as vc

rng = np.random.default_rng(3)
ks = [k for k in vc.load() if k["id"] not in vc.EXCLUDE]
K = []  # (kid, region, colours list, values array)
for k in ks:
    ps = [c for c in vc.pendants(k) if (c.get("value") or 0) > 0 and vc.base_colour(c)]
    cols = [vc.base_colour(c) for c in ps]
    if len(ps) >= 8 and len(set(cols)) >= 2:
        K.append((k["id"], k["_region"] or "?", np.array(cols), np.array([c["value"] for c in ps], float)))
print("khipus used:", len(K))
allcols = collections.Counter(c for _, _, cs, _ in K for c in set(cs))
COLS = [c for c, n in allcols.most_common() if n >= 8]

def effects(perm=False, by_region=False):
    acc = collections.defaultdict(list)
    for kid, reg, cs, v in K:
        vv = rng.permutation(v) if perm else v
        pct = (rankdata(vv) - 0.5) / len(vv)
        for c in set(cs):
            if c in COLS:
                key = (reg, c) if by_region else c
                acc[key].append(pct[cs == c].mean() - 0.5)
    return {k: (np.mean(x), len(x)) for k, x in acc.items()}

obs = effects()
NR = 2000
null = collections.defaultdict(list)
nullreg = []
for r in range(NR):
    e = effects(perm=True)
    for c in COLS: null[c].append(e[c][0])
print(f"\ncolour  #khipus  effect  null_sd   z    p(two-sided, {NR} perms)")
rows = []
for c in COLS:
    o, n = obs[c]; nn = np.array(null[c]); z = (o - nn.mean()) / nn.std()
    p = (1 + (np.abs(nn - nn.mean()) >= abs(o - nn.mean())).sum()) / (NR + 1)
    rows.append((c, n, o, nn.std(), z, p))
for c, n, o, s, z, p in sorted(rows, key=lambda r: -abs(r[4])):
    print(f"  {c:4s} {n:5d}  {o:+.3f}  {s:.3f}  {z:+5.1f}  {p:.4f}")

# regional effects and consistency
reg_obs = effects(by_region=True)
REGS = [r for r, n in collections.Counter(reg for _, reg, _, _ in K).items() if n >= 10 and r != "?"]
def consistency(eff):
    rs = []
    for a, b in itertools.combinations(REGS, 2):
        cs = [c for c in COLS if eff.get((a, c), (0, 0))[1] >= 4 and eff.get((b, c), (0, 0))[1] >= 4]
        if len(cs) >= 4:
            x = [eff[(a, c)][0] for c in cs]; y = [eff[(b, c)][0] for c in cs]
            rs.append(np.corrcoef(x, y)[0, 1])
    return np.nanmean(rs), len(rs)
o, npairs = consistency(reg_obs)
nn = np.array([consistency(effects(perm=True, by_region=True))[0] for _ in range(500)])
print(f"\ncross-region consistency (mean r over {npairs} region pairs): obs={o:.3f} null={nn.mean():.3f}+-{nn.std():.3f} p={(1+(nn>=o).sum())/501:.4f}")
print("per-region effects for the strongest colours:")
for c, *_ in sorted(rows, key=lambda r: -abs(r[4]))[:8]:
    print(f"  {c:4s} " + "  ".join(f"{r}:{reg_obs[(r, c)][0]:+.2f}(n{reg_obs[(r, c)][1]})" for r in REGS if (r, c) in reg_obs))
json.dump(dict(colours=[dict(colour=c, khipus=n, effect=o, null_sd=s, z=z, p=p) for c, n, o, s, z, p in rows],
               consistency=dict(obs=o, null_mean=float(nn.mean()), null_sd=float(nn.std()))),
          open(vc.OUT / "d_colour.json", "w"), indent=1, default=float)

# ---- robustness of the white effect
print("\nW robustness:")
def w_effect(drop_max=False, perm=False, minority=None):
    xs = []
    for kid, reg, cs, v in K:
        if drop_max:
            j = np.argmax(v); cs = np.delete(cs, j); v = np.delete(v, j)
        if "W" not in cs or len(set(cs)) < 2: continue
        share = (cs == "W").mean()
        if minority is True and share >= 0.5: continue
        if minority is False and share < 0.5: continue
        vv = rng.permutation(v) if perm else v
        pct = (rankdata(vv) - 0.5) / len(vv); xs.append(pct[cs == "W"].mean() - 0.5)
    return np.mean(xs), np.mean(np.array(xs) > 0), len(xs)
for lab, kw in (("all", {}), ("drop each khipu's max pendant", {"drop_max": True}),
                ("W minority (<50% of pendants)", {"minority": True}), ("W majority", {"minority": False})):
    o, fpos, n = w_effect(**kw); nn = np.array([w_effect(perm=True, **kw)[0] for _ in range(500)])
    print(f"  {lab:32s} n={n:3d} effect={o:+.3f} frac khipus>0={fpos:.2f} null={nn.mean():+.3f}+-{nn.std():.3f} z={(o-nn.mean())/nn.std():+.1f}")

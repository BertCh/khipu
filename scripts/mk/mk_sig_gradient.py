"""Is the right-handed sum asymmetry a left-to-right magnitude gradient across groups?
Per khipu: Spearman(group position, group mean nonzero log10 value); relate to r1 right fraction."""
import numpy as np, json
from mk_sig_common import *
Z = np.load(OUT / "sig_null_counts.npz"); ids = list(Z["ids"]); F = list(Z["feats"]); obs = Z["obs"]
fi = {f: i for i, f in enumerate(F)}
ms = {m["id"]: m for m in load_models()}
def rk(x): return np.argsort(np.argsort(x))
rows = []
for x, i in enumerate(ids):
    m = ms[i]
    gm = [(gi, np.log10([m["P"][j]["v"] for j in g if m["P"][j]["v"] > 0]).mean()) for gi, g in enumerate(m["groups"]) if any(m["P"][j]["v"] > 0 for j in g)]
    if len(gm) < 4 or obs[x, fi["r1"]] < 5: continue
    a = np.array(gm)
    rho = np.corrcoef(rk(a[:, 0]), rk(a[:, 1]))[0, 1]
    rows.append((rho, obs[x, fi["r1"]], obs[x, fi["r1R"]]))
r = np.array(rows)
dec = r[:, 0] < -0.1; inc = r[:, 0] > 0.1; flat = ~dec & ~inc
out = {}
for name, msk in (("decreasing_magnitude", dec), ("flat", flat), ("increasing_magnitude", inc)):
    out[name] = dict(khipus=int(msk.sum()), r1=int(r[msk, 1].sum()), right=round(float(r[msk, 2].sum() / r[msk, 1].sum()), 3))
out["share_khipus_decreasing"] = round(float(dec.mean()), 3); out["share_increasing"] = round(float(inc.mean()), 3)
out["median_rho"] = round(float(np.median(r[:, 0])), 3)
print(json.dumps(out, indent=1)); json.dump(out, open(OUT / "sig_gradient.json", "w"), indent=1)

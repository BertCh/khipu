"""Step 1: KH0468 (VA16135a | VA16135b) splice test with a calibrated null."""
import sys, json
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import *

ks = load_all()
NOVALUE = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384",
           "KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
pool = {k: vals(v) for k, v in ks.items() if k not in NOVALUE}
cs = pendants(ks["KH0468"]); v = [int(c["value"] or 0) for c in cs]
cut = [c["ordinal"] for c in cs].index(418)          # p418 = loose primary-cord piece, group 39
A, B = Frag(v[:cut], "A"), Frag(v[cut + 1:], "B")
print("A pendants", len(A.v), "B pendants", len(B.v))
cache = {}
gs=[c["group"] for c in cs]; r = calibrated(A, B, pool, {"KH0468"}, cache, gA=gs[:cut], gB=gs[cut+1:], n_shuf=200)
print(json.dumps(r, indent=1))
# paper-style comparison: A + UR246 (= KH?)
# also: how many single partners beat the true B on A+B orientation only
wins, tol = matched_pool(B.v, pool, {"KH0468"})
ab = []
for kid, o, w in wins:
    ab.append((len(splice_cross(A, cache[(kid, o, len(w))])), kid, o))
ab.sort(reverse=True)
print("A+B orientation only: true", len(splice_cross(A, B)), "top null partners", ab[:8])
# unmatched null: every khipu in corpus as partner (shows magnitude effect)
import numpy as np
allc = []
for kid, pv in pool.items():
    if kid == "KH0468" or len(pv) < 20: continue
    w = pv[:len(B.v)]; X = Frag(w, kid)
    allc.append((len(splice_cross(A, X)), kid, magnitude(w)["lmed"] if magnitude(w) else None, len(w)))
allc.sort(reverse=True)
arr = np.array([c[0] for c in allc])
print("UNMATCHED all-khipu null (A+X, X truncated to |B|): n", len(arr), "mean", arr.mean().round(2),
      "sd", arr.std().round(2), "p", (1 + (arr >= 49).sum()) / (1 + len(arr)), "top", allc[:10])
json.dump(dict(result=r, top_unmatched=allc[:30]), open(OUT / "mk_join_kh0468.json", "w"), indent=1, default=str)

# paper-faithful: A+B configuration only, vs group-shuffled B (A+X only)
rng = np.random.default_rng(7)
gs = [c["group"] for c in cs]
nulab = [len(splice_cross(A, Frag(w))) for w in group_shuffles(B.v, gs[cut + 1:], 300, rng)]
nulab = np.array(nulab)
print("A+B only vs shuffled-B: obs 49, null mean %.1f sd %.1f p %.3f" % (nulab.mean(), nulab.std(), (1 + (nulab >= 49).sum()) / 301))
import csv
nm = {r["mk_name"]: r["our_id"] for r in csv.DictReader(open(OUT.parent / "mk/name_map.csv"))}
u = nm["UR246"]; print("A + UR246 (%s) crossings:" % u, len(splice_cross(A, Frag(vals(ks[u])))), "(paper: 25)")

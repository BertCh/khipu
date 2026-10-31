"""Validate engine: (1) per-khipu pendant-pendant sum counts vs KFG csv,
(2) KH0468 total/crossing counts (186 / 49), (3) fast splice == full search."""
import csv, random, sys
import numpy as np
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import *

ks = load_all()
MK = ROOT.parent.parent  # unused
S = OUT.parent
nm = {r["mk_name"]: r["our_id"] for r in csv.DictReader(open(S / "mk/name_map.csv"))}
their = {r["name"]: int(r["num_sum_cords"]) for r in csv.DictReader(open(
    S / "mk/khipufieldguide-data-science-khipu-article-a89c5dc/data/ascher_sum_relations/pendant_pendant_sum.csv"))}
agree = tot = 0; diffs = []
for name, cnt in their.items():
    kid = nm.get(name)
    if not kid or kid not in ks: continue
    a = len(all_sums(vals(ks[kid])))
    b = len(all_sums(vals(ks[kid], include_top=True)))
    tot += 1; agree += (a == cnt)
    if a != cnt: diffs.append((name, kid, cnt, a, b))
print(f"per-khipu sum count agreement (no tops): {agree}/{tot}")
print("sample diffs (name,kid,theirs,ours,ours+top):", diffs[:15])
v = vals(ks["KH0468"])
cs = pendants(ks["KH0468"])
cut = [c["ordinal"] for c in cs].index(418)
print("KH0468 pendants", len(v), "cut idx", cut, "total sums", len(all_sums(v)),
      "crossing (p418 on A side)", crossings_full(v, cut + 1), "(p418 on B side)", crossings_full(v, cut))
vA, vB = v[:cut], v[cut + 1:]
print("drop p418: total", len(all_sums(vA + vB)), "cross", crossings_full(vA + vB, len(vA)),
      "fast", len(splice_cross(Frag(vA), Frag(vB))))
# random fast-vs-full
rng = random.Random(1); ids = [k for k in ks if len(vals(ks[k])) > 5]; bad = 0
for _ in range(300):
    a, b = rng.sample(ids, 2); va, vb = vals(ks[a]), vals(ks[b])
    va = va[:rng.randint(3, 200)]; vb = vb[:rng.randint(3, 200)]
    for ar in (0, 1):
        for br in (0, 1):
            x = va[::-1] if ar else va; y = vb[::-1] if br else vb
            f = crossings_full(x + y, len(x)); g = len(splice_cross(Frag(va), Frag(vb), ar, br))
            if f != g: bad += 1
print("fast vs full mismatches:", bad, "/1200")

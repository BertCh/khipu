"""Validate mk_sig_common ports against M&K's *_relation.csv per-khipu counts."""
import csv, collections, time, json
import numpy as np
from mk_sig_common import *

nm = {}
for r in csv.DictReader(open(S / "mk" / "name_map.csv")):
    nm[r["mk_name"]] = r["our_id"]
files = {1: "pendant_pendant_sum_relation.csv", 2: "pendant_pendants_color_sum_relation.csv",
         3: "indexed_pendant_sum_relation.csv", 4: "pendant_sub_neighbor_relation.csv",
         5: "subsidiary_pendant_sum_relation.csv", 7: "cluster_sum_bands_relation.csv",
         9: "sum_top_cords_relation.csv"}
theirs = {}
for r, f in files.items():
    c = collections.Counter()
    for row in csv.DictReader(open(MK / "data/ascher_sum_relations" / f)):
        c[nm.get(row["name"], row["name"])] += 1
    theirs[r] = c
ms = load_models()
mids = set(nm.values())
for r, fn in RELS.items():
    t0 = time.time()
    ours = {m["id"]: len(fn(m)) for m in ms}
    ids = [i for i in ours if i in mids]
    a = np.array([ours[i] for i in ids]); b = np.array([theirs[r].get(i, 0) for i in ids])
    exact = (a == b).mean()
    print(f"rel{r}: ours {a.sum()} theirs {b.sum()} (their csv total {sum(theirs[r].values())}); khipus>0 ours {(a>0).sum()} theirs {(b>0).sum()}; exact-per-khipu {exact:.2f} r={np.corrcoef(a,b)[0,1]:.3f} [{time.time()-t0:.1f}s]")
    bad = sorted(ids, key=lambda i: -abs(ours[i]-theirs[r].get(i,0)))[:5]
    print("   worst:", [(i, ours[i], theirs[r].get(i,0)) for i in bad])

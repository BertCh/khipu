#!/usr/bin/env python3
"""
Validate mk_port_relations against Medrano & Khosla's published *_relation.csv files,
instance by instance, on THEIR 2024 snapshot (mk_port_snapshot) and then compare the
port's output on OUR corpus (public/data/khipus) with theirs.

Writes $S/out/mk_port_validate.json (per-relation agreement + disagreement lists).
"""
from __future__ import annotations

import ast
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mk_port_relations import DATA, RELATIONS, SCRATCH, prepare  # noqa: E402
from mk_port_snapshot import load_snapshot, name_map  # noqa: E402

REL = SCRATCH / "mk" / "khipufieldguide-data-science-khipu-article-a89c5dc" / "data" / "ascher_sum_relations"
POS_RE = re.compile(r"\[(\d+), (\d+)(?:, (\d+))?\]")
VAL_RE = re.compile(r"\]:(\d+)")


def val_list(s):
    return tuple(int(v) for v in VAL_RE.findall(str(s)))


def pos_list(s):
    return tuple((int(a), int(b)) if not c else (int(a), int(b), int(c)) for a, b, c in POS_RE.findall(str(s)))


def their_keys(rel):
    """Return {khipu_name: Counter(key)} and handedness dict for their relation csv."""
    f = {"pendant_pendant_sum": "pendant_pendant_sum_relation.csv",
         "pendant_pendants_color_sum": "pendant_pendants_color_sum_relation.csv",
         "indexed_pendant_sum": "indexed_pendant_sum_relation.csv",
         "subsidiary_pendant_sum": "subsidiary_pendant_sum_relation.csv",
         "pendant_sub_neighbor": "pendant_sub_neighbor_relation.csv",
         "cluster_sum_bands": "cluster_sum_bands_relation.csv",
         "ascher_decreasing_cluster": "ascher_decreasing_cluster_relation.csv",
         "sum_top_cords": "sum_top_cords_relation.csv",
         "double_sum_top_cords": "double_sum_top_cords_relation.csv"}[rel]
    df = pd.read_csv(REL / f)
    out = defaultdict(Counter)
    hand = {}
    for r in df.itertuples():
        if rel in ("sum_top_cords", "double_sum_top_cords"):
            tv = r.top_cord_value if rel == "sum_top_cords" else r.double_sum_top_cord_value
            sv = r.summand_value if rel == "sum_top_cords" else r.summand_sum_value
            key = (int(tv), int(sv), int(r.num_summand_cords))
        elif rel == "cluster_sum_bands":
            key = (int(r.split_index), int(r.num_cords), int(r.split_sum))
        elif rel == "ascher_decreasing_cluster":
            key = (int(r.num_cords), tuple(int(v) for v in str(r.cord_values).split(",")))
        elif rel == "pendant_sub_neighbor":
            key = (r.pendant_sub_name, r.neighbor_name)
        else:
            key = (r.cord_name, val_list(r.sum_string))
        out[r.name][key] += 1
        if hasattr(r, "handedness"):
            hand[(r.name, key)] = int(r.handedness)
    return out, hand


def my_key(rel, x, pk):
    if rel in ("sum_top_cords", "double_sum_top_cords"):
        return (x["value"], x["summand_value"], x["num_summands"])
    if rel == "cluster_sum_bands":
        return (x["split"], x["num_cords"], x["split_sum"])
    if rel == "ascher_decreasing_cluster":
        return (x["num_cords"], tuple(pk.clusters[x["cluster"]][i].v for i in range(x["num_cords"])))
    if rel == "pendant_sub_neighbor":
        return (x["sum_cord"], x["neighbor"])
    return (x["sum_cord"], tuple(x["summand_values"]))


def compare(rel, results, pks):
    theirs, hand = their_keys(rel)
    tot_t = tot_m = both = 0
    hand_ok = hand_n = 0
    per = {}
    for name, pk in pks.items():
        mine = Counter(my_key(rel, x, pk) for x in results[name][rel])
        mh = {my_key(rel, x, pk): x.get("handedness") for x in results[name][rel]}
        t = theirs.get(name, Counter())
        # their indexed csv sometimes carries exact duplicate rows; compare as sets
        ms, ts = set(mine), set(t)
        inter = ms & ts
        tot_t += sum(t.values())
        tot_m += sum(mine.values())
        both += sum((mine & t).values())
        for k in inter:
            if (name, k) in hand and mh.get(k) is not None:
                hand_n += 1
                hand_ok += hand[(name, k)] == mh[k]
        if mine != t:
            per[name] = {"only_theirs": sorted(map(str, (t - mine).elements())),
                         "only_mine": sorted(map(str, (mine - t).elements()))}
    return {"theirs": tot_t, "mine": tot_m, "both": both, "handedness_agree": f"{hand_ok}/{hand_n}",
            "khipus_differing": len(per), "diffs": per,
            "their_khipus": len([n for n in theirs if theirs[n]]),
            "my_khipus": len([n for n in pks if results[n][rel]])}


def main():
    import os
    pks = load_snapshot(cluster_source=os.environ.get("CS", "xlsx"), l1_order=os.environ.get("L1", "clusters"))
    results = {}
    for n, pk in pks.items():
        results[n] = {r: f(pk) for r, f in RELATIONS.items()}
    rep = {}
    for rel in RELATIONS:
        c = compare(rel, results, pks)
        rep[rel] = c
        print(f"{rel:28s} theirs {c['theirs']:5d}  mine {c['mine']:5d}  both {c['both']:5d}  "
              f"hand {c['handedness_agree']:>11s}  khipus theirs/mine {c['their_khipus']}/{c['my_khipus']}  "
              f"khipus differing {c['khipus_differing']}")
    (SCRATCH / "out" / "mk_port_validate_snapshot.json").write_text(json.dumps(rep, indent=1))
    json.dump({n: v for n, v in results.items()}, open(SCRATCH / "out" / "mk_port_snapshot_results.json", "w"))


if __name__ == "__main__":
    main()

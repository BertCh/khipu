#!/usr/bin/env python3
"""
Step 2b/3 of the Medrano & Khosla port: run mk_port_relations on OUR corpus, compare
instance-by-instance with their published *_relation.csv, split by whether the khipu's
cord data changed between their 2024 snapshot and our 2026-09 KFG release, and rebuild
Table 1 (khipus with >= 1 instance) on (a) their files, (b) the port on their snapshot,
(c) the port on our 650 mapped khipus, (d) the port on all 684 of ours.

Writes $S/out/mk_port_compare.json and $S/out/relations/<relation>.json (our corpus).
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mk_port_relations import DATA, RELATIONS, SCRATCH, prepare  # noqa: E402
from mk_port_snapshot import load_snapshot  # noqa: E402
from mk_port_validate import their_keys, my_key  # noqa: E402

OUT = SCRATCH / "out"
IRREPRODUCIBLE = {"AS069", "UR149"}  # their run used a different cord order / data version


def signature(pk):
    l1 = [(c.name, c.v) for c in pk.l1]
    return {
        "values": sorted(l1),
        "order": [c.name for c in pk.l1],
        "clusters": [len(cl) for cl in pk.clusters],
        "top": sorted(c.name for c in pk.l1 if c.top),
        "color": sorted((c.name, c.color) for c in pk.l1),
        "subs": sorted((s.name, s.v) for c in pk.l1 for s in c.children if not s.skip),
    }


def change_flags(a, b):
    sa, sb = signature(a), signature(b)
    return [k for k in sa if sa[k] != sb[k]]


def main():
    snap = load_snapshot()
    ours = {}
    for f in sorted(DATA.glob("KH*.json")):
        k = json.loads(f.read_text())
        ours[k["id"]] = prepare(k)
    res_ours = {kid: {r: fn(pk) for r, fn in RELATIONS.items()} for kid, pk in ours.items()}
    res_snap = {n: {r: fn(pk) for r, fn in RELATIONS.items()} for n, pk in snap.items()}

    # write our per-relation instance lists
    rel_dir = OUT / "relations"
    rel_dir.mkdir(parents=True, exist_ok=True)
    for r in RELATIONS:
        rows = [x for kid in sorted(res_ours) for x in res_ours[kid][r]]
        (rel_dir / f"{r}.json").write_text(json.dumps(rows))

    mk2our = {n: pk.our_id for n, pk in snap.items()}
    flags = {n: change_flags(snap[n], ours[mk2our[n]]) for n in snap if mk2our[n] in ours}
    unchanged = {n for n, f in flags.items() if not f}
    print(f"mapped {len(flags)}; unchanged cord data {len(unchanged)}; changed {len(flags) - len(unchanged)}")
    print("change kinds:", Counter(x for f in flags.values() for x in f))

    report = {"flags": flags, "relations": {}}
    for r in RELATIONS:
        theirs, _ = their_keys(r)
        agg = defaultdict(lambda: [0, 0, 0])  # theirs, ours, both
        agg_snap = [0, 0, 0]
        for n in flags:
            if n in IRREPRODUCIBLE:
                grp = "irreproducible"
            else:
                grp = "unchanged" if n in unchanged else "changed"
            pk = ours[mk2our[n]]
            m = Counter(my_key(r, x, pk) for x in res_ours[pk.id][r])
            t = theirs.get(n, Counter())
            agg[grp][0] += sum(t.values())
            agg[grp][1] += sum(m.values())
            agg[grp][2] += sum((m & t).values())
        # Table 1 style counts
        k_theirs = {n for n in theirs if theirs[n]}
        k_snap = {n for n in res_snap if res_snap[n][r]}
        k_our650 = {n for n in flags if res_ours[mk2our[n]][r]}
        k_our684 = {kid for kid in res_ours if res_ours[kid][r]}
        gained = sorted(n for n in k_our650 - k_snap)
        lost = sorted(n for n in k_snap - k_our650)
        new_ids = set(ours) - set(mk2our.values())
        k_new = sorted(kid for kid in k_our684 if kid in new_ids)
        n_inst_snap = sum(len(res_snap[n][r]) for n in res_snap)
        n_inst_ours = sum(len(res_ours[k][r]) for k in res_ours)
        report["relations"][r] = {
            "agreement": {g: dict(zip(["theirs", "ours", "both"], v)) for g, v in agg.items()},
            "khipus": {"their_files": len(k_theirs), "port_on_snapshot": len(k_snap),
                       "ours_650": len(k_our650), "ours_684": len(k_our684)},
            "instances": {"their_files": sum(sum(c.values()) for c in theirs.values()),
                          "port_on_snapshot": n_inst_snap, "ours_684": n_inst_ours},
            "gained_vs_snapshot": [(n, mk2our[n], flags[n]) for n in gained],
            "lost_vs_snapshot": [(n, mk2our[n], flags[n]) for n in lost],
            "new_khipus_with_relation": k_new,
        }
        a = report["relations"][r]
        print(f"\n{r}: khipus {a['khipus']}  instances {a['instances']}")
        for g, v in a["agreement"].items():
            pct = 100 * v["both"] / max(1, max(v["theirs"], v["ours"]))
            print(f"   {g:14s} theirs {v['theirs']:5d} ours {v['ours']:5d} both {v['both']:5d} ({pct:.1f}%)")
        print(f"   gained {len(gained)} lost {len(lost)} new-khipus {len(k_new)}")

    # any-relation union over ported relations (1-7, 9)
    def anyrel(res, keys):
        return {k for k in keys if any(res[k][r] for r in RELATIONS)}
    report["any"] = {"port_on_snapshot": len(anyrel(res_snap, res_snap)),
                     "ours_650": len({n for n in flags if any(res_ours[mk2our[n]][r] for r in RELATIONS)}),
                     "ours_684": len(anyrel(res_ours, res_ours))}
    print("\nany ported relation:", report["any"])

    # top-cord census
    def topcensus(pks, res):
        with_top = [k for k, pk in pks.items() if any(c.top for c in pk.l1)]
        ntop = sum(sum(c.top for c in pks[k].l1) for k in with_top)
        s = {k for k in res if res[k]["sum_top_cords"]}
        d = {k for k in res if res[k]["double_sum_top_cords"]}
        ns = sum(len(res[k]["sum_top_cords"]) for k in res)
        nd = sum(len(res[k]["double_sum_top_cords"]) for k in res)
        both_cl = sum(len({x["cluster"] for x in res[k]["sum_top_cords"]} &
                          {x["cluster"] for x in res[k]["double_sum_top_cords"]}) for k in res)
        exact = sum(x["exact"] for k in res for x in res[k]["sum_top_cords"])
        dexact = sum(x["exact"] for k in res for x in res[k]["double_sum_top_cords"])
        return {"khipus_with_top": len(with_top), "top_cords": ntop, "sum_khipus": len(s), "sum_clusters": ns,
                "sum_exact": exact, "double_khipus": len(d), "double_clusters": nd, "double_exact": dexact,
                "union_khipus": len(s | d), "clusters_in_both_lists": both_cl}
    report["top"] = {"snapshot": topcensus(snap, res_snap), "ours_684": topcensus(ours, res_ours)}
    print("top census:", json.dumps(report["top"], indent=1))
    (OUT / "mk_port_compare.json").write_text(json.dumps(report, indent=1, default=str))


if __name__ == "__main__":
    main()

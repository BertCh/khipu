"""Per-khipu feature table for the Medrano & Khosla (2024) working/summary typology.

Reimplements their pendant-pendant sum search (PendantSummer, notebook 02 §2.1) and adds
magnitude-matched nulls:
  null A  permute all pendant values within the khipu (keeps the value multiset = magnitude)
  null B  permute nonzero values among nonzero positions (also keeps the blank layout)
and a stricter "group total" relation with a group-size-preserving shuffle.

Writes $OUT/type_features.json (list of dicts). Run: python3 scripts/mk/mk_type_features.py [nperm]
"""
from __future__ import annotations
import csv, json, sys, collections
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deep"))
from tree_common import load, val  # noqa: E402

S = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/573e055a-1d0e-4a10-b794-c747179bc194/scratchpad")
MK = S / "mk" / "khipufieldguide-data-science-khipu-article-a89c5dc" / "data"
OUT = S / "out"
OUT.mkdir(exist_ok=True)
NPERM = int(sys.argv[1]) if len(sys.argv) > 1 else 200
rng = np.random.default_rng(20260922)


# ---------------------------------------------------------------- their PP-sum search
def _one_side(v: np.ndarray):
    """Faithful to PendantSummer.search_*_sums + filter_sums on one direction.
    Returns dict summand_index -> (start, end) in this direction's indexing."""
    n = len(v)
    P = np.concatenate([[0], np.cumsum(v)])
    out = {}
    for i in range(n - 2):
        x = v[i]
        if x <= 10:
            continue
        s = np.arange(i + 1, n)
        s = s[v[s] > 0]
        if not len(s):
            continue
        tgt = P[s] + x
        e = np.searchsorted(P, tgt, side="left")
        ok = (e <= n) & (P[np.minimum(e, n)] == tgt)
        if not ok.any():
            continue
        j = np.argmax(ok)
        st, en = s[j], e[j]
        if en - st >= 2 and x > (en - st):
            out[i] = (st, en)
    return out


def pp_sums(v) -> int:
    v = np.asarray(v, dtype=np.int64)
    if len(v) < 3:
        return 0
    return len(_one_side(v)) + len(_one_side(v[::-1]))


# ---------------------------------------------------------------- group totals
def group_totals(vals, sizes) -> int:
    """Groups whose total (>10, >=2 nonzero cords) is written on a cord of the same group
    (as sum of the others) or on the cord immediately before/after the group."""
    hits = 0
    idx = np.cumsum([0] + list(sizes))
    for g in range(len(sizes)):
        a, b = idx[g], idx[g + 1]
        grp = vals[a:b]
        if (grp > 0).sum() >= 3:
            t = grp.sum()
            if any(2 * c == t and c > 10 for c in grp):
                hits += 1
                continue
        if (grp > 0).sum() >= 2:
            t = grp.sum()
            if t > 10 and ((a > 0 and vals[a - 1] == t) or (b < len(vals) and vals[b] == t)):
                hits += 1
    return hits


# ---------------------------------------------------------------- colour layout
def colour_layout(groups_cols):
    """Per group (>=3 cords): banded if one colour >=75%; seriated if >=2 colours and its
    positional colour sequence matches another same-size group at >=75% of positions."""
    band = ser = elig = 0
    for gi, g in enumerate(groups_cols):
        if len(g) < 3:
            continue
        elig += 1
        top = collections.Counter(g).most_common(1)[0][1]
        if top / len(g) >= 0.75:
            band += 1
            continue
        for gj, h in enumerate(groups_cols):
            if gj != gi and len(h) == len(g) and sum(a == b for a, b in zip(g, h)) / len(g) >= 0.75:
                ser += 1
                break
    return band, ser, elig


def main():
    # their per-khipu data
    name_map = {r["mk_name"]: r["our_id"] for r in csv.DictReader(open(S / "mk" / "name_map.csv"))}
    their_pp = {}
    for r in csv.DictReader(open(MK / "ascher_sum_relations" / "pendant_pendant_sum.csv")):
        if r["name"] in name_map:
            their_pp[name_map[r["name"]]] = int(r["num_sum_cords"])
    their_sum = {}
    for r in csv.DictReader(open(MK / "khipu_summary.csv")):
        if r["kfg_name"] in name_map:
            their_sum[name_map[r["kfg_name"]]] = r

    rows = []
    for k in load(skip_novalue=False):
        cs = k["cords"]
        pend = sorted([c for c in cs if c["kind"] == "pendant" and c["level"] == 1], key=lambda c: c["ordinal"])
        if not pend:
            continue
        v = np.array([val(c) for c in pend], dtype=np.int64)
        nz = v[v > 0]
        # group sizes in pendant order
        gs = collections.OrderedDict()
        gcols = collections.OrderedDict()
        for c in pend:
            gs[c.get("group", 0)] = gs.get(c.get("group", 0), 0) + 1
            gcols.setdefault(c.get("group", 0), []).append((c.get("color") or "").split(":")[0])
        sizes = list(gs.values())

        obs = pp_sums(v)
        gt = group_totals(v, sizes)
        permN = NPERM if len(v) <= 400 else max(min(NPERM, 40), NPERM // 5)
        nA = np.empty(permN); nB = np.empty(permN); nG = np.empty(permN)
        for t in range(permN):
            a = rng.permutation(v)
            nA[t] = pp_sums(a)
            nG[t] = group_totals(a, sizes)
            b = v.copy(); m = b > 0; b[m] = rng.permutation(b[m])
            nB[t] = pp_sums(b)
        nA, nB, nG = nA[:permN], nB[:permN], nG[:permN]

        band, ser, elig = colour_layout(list(gcols.values()))
        ts = their_sum.get(k["id"])
        term = (k.get("primary") or {}).get("term")
        rows.append(dict(
            id=k["id"], alias=(k.get("aliases") or [""])[0],
            recorder=k.get("contributors"), region=k.get("region"), provenance=k.get("provenance"),
            museum=(k.get("museum") or {}).get("canonical"),
            n_cords=len(cs), n_pend=len(pend), n_top=sum(c["kind"] == "top" for c in cs),
            n_sub=sum(c["kind"] == "subsidiary" for c in cs), n_groups=len(sizes),
            six_share=float(np.mean([s == 6 for s in sizes])) if sizes else 0.0,
            modal_group=collections.Counter(sizes).most_common(1)[0][0],
            broken_primary=term == "B",
            mean_pend=float(v.mean()), median_nz=float(np.median(nz)) if len(nz) else 0.0,
            max_val=int(v.max()), nz_share=float((v > 0).mean()),
            share_ge1000=float((nz >= 1000).mean()) if len(nz) else 0.0,
            pp_obs=obs, pp_nullA=float(nA.mean()), pp_nullA_sd=float(nA.std()),
            pp_pA=float(((nA >= obs).sum() + 1) / (len(nA) + 1)),
            pp_nullB=float(nB.mean()), pp_pB=float(((nB >= obs).sum() + 1) / (len(nB) + 1)),
            gt_obs=gt, gt_null=float(nG.mean()), gt_p=float(((nG >= gt).sum() + 1) / (len(nG) + 1)),
            nperm=permN,
            band_groups=band, ser_groups=ser, colour_elig=elig,
            mk_pp=their_pp.get(k["id"]),
            mk_banded=int(ts["num_banded_clusters"]) if ts else None,
            mk_seriated=int(ts["num_seriated_clusters"]) if ts else None,
            mk_mean_cord_value=float(ts["mean_cord_value"]) if ts else None,
        ))
        if len(rows) % 100 == 0:
            print(len(rows), file=sys.stderr)
    json.dump(rows, open(OUT / "type_features.json", "w"), indent=0)
    print("wrote", len(rows), OUT / "type_features.json")


if __name__ == "__main__":
    main()

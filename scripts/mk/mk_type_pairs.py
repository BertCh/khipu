"""Cross-khipu test of the working/summary typology + per-khipu profile table.

(1) For each known lower -> upper pair (upper = the khipu that carries the other's totals /
    restatement), compare magnitude and null-corrected arithmetic. The typology predicts the
    upper one is larger in magnitude and poorer in arithmetic.
(2) Writes $OUT/type_profiles.json keyed by KH id.
Run after mk_type_features.py.
"""
from __future__ import annotations
import json, re, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
S = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/573e055a-1d0e-4a10-b794-c747179bc194/scratchpad")
F = {r["id"]: r for r in json.load(open(S / "out" / "type_features.json"))}

# lower, upper, relation, confidence of the hierarchy reading
PAIRS = [
    ("KH0300", "KH0305", "Puruchuco I->II (UR063 -> UR068 centre)", "published (Urton & Brezine 2005); level assignment from secondary summaries"),
    ("KH0310", "KH0305", "Puruchuco I->II (UR073 -> UR068)", "published; inferred"),
    ("KH0300", "KH0301", "Puruchuco I->II (UR063 -> UR064)", "published; inferred"),
    ("KH0305", "KH0304", "Puruchuco II->III (UR068 -> UR067)", "published; III=UR066/067 inferred"),
    ("KH0301", "KH0303", "Puruchuco II->III (UR064 -> UR066)", "published; inferred"),
    ("KH0517", "KH0502", "Inkawasi: group totals -> group heads", "firm (DEEP)"),
    ("KH0517", "KH0514", "Inkawasi: same totals via mirror", "firm, not independent"),
    ("KH0507", "KH0513", "Inkawasi: group totals -> group heads", "likely"),
    ("KH0507", "KH0511", "Inkawasi: group totals -> group heads", "open"),
    ("KH0521", "KH0525", "x5 restatement (last group)", "likely"),
    ("KH0049", "KH0362", "detailed -> blanked & rounded copy", "likely"),
    ("KH0471", "KH0118", "group leaders -> 9-cord summary", "firm"),
    ("KH0284", "KH0285", "restatement, same level (control)", "firm"),
]


def arith_excess(r):
    return r["pp_obs"] - r["pp_nullA"], r["gt_obs"] - r["gt_null"]


def scale(r):
    m = r["median_nz"]
    if m == 0: return "no values"
    return "units" if m < 10 else "tens" if m < 100 else "hundreds" if m < 1000 else "thousands+"


def arithmetic(r):
    if r["n_pend"] < 10 or r["nz_share"] == 0:
        return "too small to tell", "n/a"
    gt_ok = r["gt_obs"] >= 2 and r["gt_p"] < 0.01
    pp_ok = r["pp_pA"] < 0.01 and r["pp_obs"] - r["pp_nullA"] >= 3
    if gt_ok or pp_ok:
        return "clear (beyond chance)", "high" if (gt_ok and pp_ok) else "medium"
    if r["gt_p"] < 0.05 or r["pp_pA"] < 0.05:
        return "some", "low"
    return "none beyond chance", "medium" if r["n_pend"] >= 40 else "low"


def colour(r):
    e = r["colour_elig"]
    if e < 3: return "too few groups"
    b, s = r["band_groups"] / e, r["ser_groups"] / e
    if b >= 0.6: return "banded"
    if s >= 0.6: return "seriated"
    if b + s >= 0.6: return "mixed banded/seriated"
    return "irregular"


def curated_links():
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    out = []
    for m in re.finditer(r'a:\s*"(KH\d{4})",\s*b:\s*"(KH\d{4})",\s*kind:\s*"(\w+)",\s*level:\s*"(\w+)"', txt):
        out.append(m.groups())
    return out


def main():
    print("== cross-khipu pairs: lower -> upper ==")
    print(f"{'lower':7} {'upper':7} {'meanL':>8} {'meanU':>8} {'medL':>6} {'medU':>6} {'>=1kL':>5} {'>=1kU':>5}  PP obs/null(pA) L | U   GT obs/null L | U   top L/U  band L/U   relation")
    up_bigger = up_poorer = n = 0
    for lo, hi, rel, conf in PAIRS:
        a, b = F[lo], F[hi]
        ea, eb = arith_excess(a), arith_excess(b)
        print(f"{lo} {hi} {a['mean_pend']:8.0f} {b['mean_pend']:8.0f} {a['median_nz']:6.0f} {b['median_nz']:6.0f} {a['share_ge1000']:5.2f} {b['share_ge1000']:5.2f}"
              f"  {a['pp_obs']}/{a['pp_nullA']:.1f}({a['pp_pA']:.2f}) | {b['pp_obs']}/{b['pp_nullA']:.1f}({b['pp_pA']:.2f})"
              f"   {a['gt_obs']}/{a['gt_null']:.1f} | {b['gt_obs']}/{b['gt_null']:.1f}   {a['n_top']}/{b['n_top']}  {colour(a)[:4]}/{colour(b)[:4]}  {rel} [{conf}]")
        if "control" in rel: continue
        n += 1
        up_bigger += b["median_nz"] > a["median_nz"]
        up_poorer += (eb[0] + eb[1]) < (ea[0] + ea[1])
    print(f"\nhierarchical pairs (excl. control): upper has larger median value in {up_bigger}/{n}; upper has lower combined excess in {up_poorer}/{n}")

    links = curated_links()
    prof = {}
    for kid, r in F.items():
        lab, conf = arithmetic(r)
        role = []
        for a, b, kind, level in links:
            if kid in (a, b) and kind in ("derived", "account"):
                other = b if kid == a else a
                role.append({"partner": other, "kind": kind, "level": level,
                             "direction": ("source" if kid == a else "target") if kind == "derived" else "shared"})
        tier = None
        for lo, hi, rel, c in PAIRS:
            if "control" in rel: continue
            if kid == lo: tier = (tier or []) + [f"lower of {hi} ({rel})"]
            if kid == hi: tier = (tier or []) + [f"upper of {lo} ({rel})"]
        prof[kid] = {
            "alias": r["alias"],
            "size": {"pendants": r["n_pend"], "groups": r["n_groups"], "subsidiaries": r["n_sub"], "top_cords": r["n_top"]},
            "scale": {"label": scale(r), "median_nonzero": r["median_nz"], "mean_pendant": round(r["mean_pend"], 1),
                      "share_values_ge_1000": round(r["share_ge1000"], 3)},
            "arithmetic": {"label": lab, "confidence": conf,
                           "group_totals": {"observed": r["gt_obs"], "chance": round(r["gt_null"], 2), "p": round(r["gt_p"], 3)},
                           "pendant_sums_MK": {"observed": r["pp_obs"], "chance": round(r["pp_nullA"], 1), "p": round(r["pp_pA"], 3)}},
            "colour_layout": {"label": colour(r), "banded_groups": r["band_groups"], "seriated_groups": r["ser_groups"],
                              "groups_ge3": r["colour_elig"], "kfg_banded": r["mk_banded"], "kfg_seriated": r["mk_seriated"]},
            "six_cord_group_share": round(r["six_share"], 2),
            "primary_broken": r["broken_primary"],
            "network": {"links": role, "hierarchy": tier},
            "mk_type": ("summary-like (mean >= 1000)" if r["mean_pend"] >= 1000 else
                        "working-range (mean 10-1000)" if r["mean_pend"] >= 10 else "small values (mean < 10)"),
            "recorder": r["recorder"], "region": r["region"],
        }
    json.dump(prof, open(S / "out" / "type_profiles.json", "w"), indent=1)
    import collections
    for f in ("scale", "arithmetic", "colour_layout"):
        print(f, collections.Counter(p[f]["label"] for p in prof.values()).most_common())
    print("wrote", len(prof), S / "out" / "type_profiles.json")


if __name__ == "__main__":
    main()

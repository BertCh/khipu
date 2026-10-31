#!/usr/bin/env python3
"""Analysis tables for the Mirror Ledger khipu (KH0081 / AS068 / UR281).

Reads public/data/khipus/KH0081.json and prints every figure the story
/stories/mirror-ledger quotes, so the numbers can be re-derived:

  1. the recorder's 33 groups as a size sequence, and the split into two
     halves (17 + 16 groups) each built as: one opening group of large
     values, five summary groups (hundreds), ten detail groups (tens);
  2. the seven-slot colour template of each half and which slot every cord
     fills (colour-aligned; a cord of an off-template colour takes the next
     free slot);
  3. each opening cord against the column sum of its slot over the five
     summary groups, over the ten detail groups, and over both, as recorded
     and with the record's alternative values (Alt_Value in the KFG file,
     which is Urton's later reading on most of the cords that carry one);
  4. an exhaustive search for what else each opening cord could equal:
     group totals, tier totals, colour totals, and every run of consecutive
     level-1 cords (any colour, zeros skipped);
  5. the truncation status (isTruncated in src/lib/stories/derive.ts) of
     every cord in the opening and summary groups;
  6. the Field Guide's coloured-pendant-sum rule (src/lib/khipu/fieldmarks.ts)
     re-run here, and shuffle baselines for the count of run sums with a
     fixed seed: values permuted globally, within colour, and within tier;
  7. what the two halves share: template, totals, values, group sums.

Optionally, if data/okr/data/khipu.db is present, Urton's independent
recording (UR281) is compared cord for cord. That section is context for
the story; nothing in the story renders from it.

    python3 scripts/kh0081_analysis.py
"""

import collections
import json
import os
import random
import re
import sqlite3
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "public", "data", "khipus", "KH0081.json")
OKR = os.path.join(HERE, "..", "data", "okr", "data", "khipu.db")
OKR_ID = 1000648

# The constants that define the reading: 0-based indexes into khipu.groups.
HALVES = [
    dict(key="A", opening=0, summary=[1, 2, 3, 4, 5], marker=6, detail=list(range(7, 17))),
    dict(key="B", opening=17, summary=[18, 19, 20, 21, 22], marker=None, detail=list(range(23, 33))),
]
# Seven colour slots a full group fills, per half (Ascher codes as recorded).
TEMPLATE = {
    "A": ["W", "MB", "YB:CB", "YB:CB", "YB", "0G", "YB"],
    "B": ["W", "MB", "YB:CB", "LA", "YB", "CB", "YB"],
}
SEED = 20260918
SHUFFLES = 1000


def load():
    d = json.load(open(PATH))
    groups = collections.defaultdict(list)
    for c in d["cords"]:
        if c["level"] == 1:
            groups[c["group"]].append(c)
    for g in groups.values():
        g.sort(key=lambda c: c["ordinal"])
    kids = collections.defaultdict(list)
    for c in d["cords"]:
        if c.get("parent"):
            kids[c["parent"]].append(c)
    return d, groups, kids


def val(c):
    return c["value"] or 0


def alt(c):
    """The record's alternative reading where it has one, else the value."""
    return c["altValue"] if c["altValue"] else val(c)


def is_truncated(c):
    """Port of isTruncated in src/lib/stories/derive.ts."""
    if c.get("notes") and re.search(r"broken|separated|missing|cut", c["notes"], re.I):
        return True
    if c["length"] is None:
        return False
    if c["length"] < 12:
        return True
    lowest = None
    for k in c["knots"]:
        if lowest is None or k["pos"] > lowest["pos"]:
            lowest = k
    if not lowest or lowest.get("value") is None:
        return False
    per_knot = lowest["value"] / max(1, lowest["n"])
    return per_knot >= 10 and c["length"] - lowest["pos"] < 8


def why_truncated(c):
    if c["term"] == "B":
        return "broken"
    if c["length"] is not None and c["length"] < 12:
        return "stub"
    return "ends under its last knot"


def slots_of(group, template):
    """Assign each cord of a group to a template slot, colour first, order second."""
    out = []
    nxt = 0
    for c in group:
        pick = None
        for s in range(nxt, len(template)):
            if template[s] == c["color"]:
                pick = s
                break
        if pick is None:
            pick = nxt  # off-template colour: takes the next slot
        out.append(pick)
        nxt = pick + 1
    return out


def slot_table(groups, half):
    """{group index: {slot: cord}} for every group of a half."""
    tpl = TEMPLATE[half["key"]]
    table = {}
    for gi in [half["opening"], *half["summary"], *half["detail"]]:
        g = groups[gi]
        table[gi] = dict(zip(slots_of(g, tpl), g))
    return table


def mark(a, b):
    if a == b:
        return "EXACT"
    return "off by %+d" % (a - b)


def section(title):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def main():
    d, groups, kids = load()
    seq = [c for gi in sorted(groups) for c in groups[gi]]
    n_groups = len(d["groups"])

    # ------------------------------------------------------------------ 1
    section("1. Group sizes and the split")
    sizes = [d["groups"][i]["n"] for i in range(n_groups)]
    print("sizes:", " ".join(str(s) for s in sizes))
    for h in HALVES:
        gis = [h["opening"], *h["summary"]] + ([h["marker"]] if h["marker"] is not None else []) + h["detail"]
        print(
            "half %s: groups %d-%d (%d groups, %d cords), primary %.1f-%.1f cm, sizes %s"
            % (
                h["key"],
                gis[0] + 1,
                gis[-1] + 1,
                len(gis),
                sum(sizes[i] for i in gis),
                d["groups"][gis[0]]["start"],
                d["groups"][gis[-1]]["start"],
                " ".join(str(sizes[i]) for i in gis),
            )
        )
        op = groups[h["opening"]]
        print("   opening group %d: %s" % (h["opening"] + 1, ", ".join("%s %s=%d" % (c["name"], c["color"], val(c)) for c in op)))
    firsts = [(gi + 1, groups[gi][0]["name"], val(groups[gi][0])) for gi in sorted(groups)]
    print("first cord of every group:", " ".join("g%d:%d" % (g, v) for g, _, v in firsts))
    big = [g for g, _, v in firsts if v >= 5000]
    print("groups whose first cord is >= 5000:", big, "(the two openings)")
    print("primary cord %.1f cm; last group starts at %.1f cm" % (d["primary"]["length"], d["groups"][-1]["start"]))
    print("gap between group 23 start and group 24 start: %.1f cm (group 23 recorded with spacing %.1f)" % (d["groups"][23]["start"] - d["groups"][22]["start"], d["groups"][22]["spacing"]))

    # ------------------------------------------------------------------ 2
    section("2. Colour template and slot assignment")
    for h in HALVES:
        tpl = TEMPLATE[h["key"]]
        print("half %s template: %s" % (h["key"], " | ".join(tpl)))
        table = slot_table(groups, h)
        for gi, row in table.items():
            cells = []
            for s in range(7):
                c = row.get(s)
                cells.append("%-14s" % ("%s %s=%d" % (c["name"], c["color"], val(c)) if c else "--"))
            missing = [s + 1 for s in range(7) if s not in row]
            off = [c["name"] + ":" + c["color"] for s, c in row.items() if c["color"] != tpl[s]]
            print("  g%-2d %s%s%s" % (gi + 1, " ".join(cells), (" missing slot " + ",".join(map(str, missing))) if missing else "", (" off-colour " + ",".join(off)) if off else ""))
        # colour census per tier
        for tier in ("opening", "summary", "detail"):
            gis = [h[tier]] if tier == "opening" else h[tier]
            cnt = collections.Counter(c["color"] for gi in gis for c in groups[gi])
            print("  %s colours: %s" % (tier, dict(cnt)))

    # ------------------------------------------------------------------ 3
    section("3. Opening cords against column sums")
    results = {}
    for h in HALVES:
        table = slot_table(groups, h)
        tpl = TEMPLATE[h["key"]]
        op = table[h["opening"]]
        print("half %s" % h["key"])
        for s in range(7):
            c = op.get(s)
            if not c:
                print("  slot %d %-5s : no opening cord" % (s + 1, tpl[s]))
                continue
            for label, gis in (("summary", h["summary"]), ("detail", h["detail"]), ("summary+detail", h["summary"] + h["detail"])):
                cells = [table[gi].get(s) for gi in gis]
                rec = sum(val(x) for x in cells if x)
                al = sum(alt(x) for x in cells if x)
                present = sum(1 for x in cells if x)
                line = "  slot %d %-5s %-5s %5d vs %-14s %5d (%d of %d groups) %s" % (
                    s + 1, tpl[s], c["name"], val(c), label, rec, present, len(gis), mark(val(c), rec))
                if al != rec:
                    line += " | with alt values %d %s" % (al, mark(val(c), al))
                if c["altValue"]:
                    line += " | opening alt %d %s" % (c["altValue"], mark(c["altValue"], rec))
                print(line)
                if label == "summary":
                    results[(h["key"], s)] = (c, rec, al, [(x["name"], val(x), alt(x)) for x in cells if x])
            if s == 0 or s == 1:
                terms = " + ".join("%s %d" % (x["name"], val(x)) for x in [table[gi].get(s) for gi in h["summary"]] if x)
                print("      %s = %s" % (val(c), terms))
        # positional (not colour-aligned) columns for comparison
        print("  positional column sums over the summary groups (cord k of each group):")
        for k in range(7):
            cells = [groups[gi][k] for gi in h["summary"] if k < len(groups[gi])]
            print("    position %d: %d from %d groups" % (k + 1, sum(val(x) for x in cells), len(cells)))

    # ------------------------------------------------------------------ 4
    section("4. What else could each opening cord equal? (exhaustive)")
    # candidate totals
    cands = []
    for gi in sorted(groups):
        cands.append(("group %d total" % (gi + 1), sum(val(c) for c in groups[gi])))
    for h in HALVES:
        for tier in ("summary", "detail"):
            cands.append(("half %s %s tier total" % (h["key"], tier), sum(val(c) for gi in h[tier] for c in groups[gi])))
        cands.append(("half %s summary+detail total" % h["key"], sum(val(c) for gi in h["summary"] + h["detail"] for c in groups[gi])))
        cands.append(("half %s opening total" % h["key"], sum(val(c) for c in groups[h["opening"]])))
        for col in sorted({c["color"] for gi in h["summary"] + h["detail"] for c in groups[gi]}):
            for tier in ("summary", "detail"):
                cands.append(("half %s %s colour %s" % (h["key"], tier, col), sum(val(c) for gi in h[tier] for c in groups[gi] if c["color"] == col)))
            cands.append(("half %s summary+detail colour %s" % (h["key"], col), sum(val(c) for gi in h["summary"] + h["detail"] for c in groups[gi] if c["color"] == col)))
        table = slot_table(groups, h)
        for s in range(7):
            for tier in ("summary", "detail"):
                cands.append(("half %s %s slot %d" % (h["key"], tier, s + 1), sum(val(table[gi][s]) for gi in h[tier] if s in table[gi])))
            cands.append(("half %s summary+detail slot %d" % (h["key"], s + 1), sum(val(table[gi][s]) for gi in h["summary"] + h["detail"] if s in table[gi])))
    print("candidate totals tried: %d" % len(cands))
    # runs of consecutive non-zero level-1 cords
    nz = [c for c in seq if val(c) > 0]
    prefix = [0]
    for c in nz:
        prefix.append(prefix[-1] + val(c))
    ends = collections.defaultdict(list)
    for i, p in enumerate(prefix):
        ends[p].append(i)
    n_runs = 0
    for h in HALVES:
        for c in groups[h["opening"]]:
            targets = {val(c)} | ({c["altValue"]} if c["altValue"] else set())
            targets.discard(0)
            for t in sorted(targets):
                hits = [name for name, v in cands if v == t]
                near = [(name, v) for name, v in cands if v != t and abs(v - t) <= 2]
                runs = []
                for a in range(len(nz)):
                    for b in ends.get(prefix[a] + t, []):
                        if b - a >= 2 and not any(nz[j] is c for j in range(a, b)):
                            runs.append((nz[a]["name"], nz[b - 1]["name"], b - a))
                n_runs += len(runs)
                print("  %s %s=%d: totals %s; within 2: %s; runs(>=3) %s" % (h["key"], c["name"], t, hits or "none", near or "none", runs or "none"))
    print("  (a run is >= 3 consecutive non-zero level-1 cords, any colour, not containing the cord itself)")

    # ------------------------------------------------------------------ 5
    section("5. Truncation in the opening and summary groups")
    for h in HALVES:
        for gi in [h["opening"], *h["summary"]]:
            flagged = [c for c in groups[gi] if is_truncated(c)]
            print("  g%-2d %s" % (gi + 1, "; ".join("%s %s=%d L=%.1f %s (%s)" % (c["name"], c["color"], val(c), c["length"] or 0, c["term"], why_truncated(c)) for c in flagged) or "none"))
    stubs = [c for c in seq if c["length"] is not None and c["length"] <= 1.0]
    print("  stubs <= 1 cm anywhere: %s" % ", ".join("%s(%s,g%d)" % (c["name"], c["color"], c["group"] + 1) for c in stubs))
    for h in HALVES:
        tpl = TEMPLATE[h["key"]]
        table = slot_table(groups, h)
        for s in range(7):
            cells = [table[gi].get(s) for gi in h["detail"]]
            trunc = [x["name"] for x in cells if x and is_truncated(x)]
            missing = sum(1 for x in cells if not x)
            zeros = [x["name"] for x in cells if x and val(x) == 0]
            if trunc or missing or zeros:
                print("  half %s detail slot %d %s: %d missing, truncated %s, zero %s" % (h["key"], s + 1, tpl[s], missing, trunc, zeros))
    blanks = [c for c in seq if val(c) == 0]
    print("  cords with value 0: %d of %d level-1 cords: %s" % (len(blanks), len(seq), ", ".join("%s(L=%.1f,%s)" % (c["name"], c["length"] or 0, c["term"]) for c in blanks)))

    # ------------------------------------------------------------------ 6
    section("6. Run sums: Field Guide rule and shuffle baselines")

    def color_key(c):
        segs = c.get("colorParsed")
        if segs and len(segs) > 1 and all(s.get("range") for s in segs):
            longest = max(segs, key=lambda s: s["range"][1] - s["range"][0])
            return "".join((code if i == 0 else (longest.get("ops") or [":"])[i - 1] + code) for i, code in enumerate(longest["codes"]))
        return c["color"]

    def run_sums(values, keys, same_color, min_summands=3, min_value=11):
        """Number of (cord, hand) pairs with an exact run; the KFG's selection."""
        buckets = collections.defaultdict(list)
        for i, v in enumerate(values):
            if v and v > 0:
                buckets[keys[i] if same_color else ""].append(i)
        count = 0
        pairs = []
        for key, idx in buckets.items():
            vals = [values[i] for i in idx]
            pre = [0]
            for v in vals:
                pre.append(pre[-1] + v)
            end_at = {p: i for i, p in enumerate(pre)}
            for i, v in enumerate(vals):
                if v < min_value:
                    continue
                got_r = got_l = False
                for a in range(len(vals)):
                    e = end_at.get(pre[a] + v)
                    if e is None:
                        continue
                    b = e - 1
                    if b - a + 1 < min_summands:
                        continue
                    if a > i:
                        got_r = True
                    elif b < i:
                        got_l = True
                count += got_r + got_l
                if got_r:
                    pairs.append((idx[i], "R"))
                if got_l:
                    pairs.append((idx[i], "L"))
        return count, pairs

    values = [val(c) for c in seq]
    keys = [color_key(c) for c in seq]
    obs_col, pairs_col = run_sums(values, keys, True)
    obs_any, _ = run_sums(values, keys, False)
    print("observed coloured pendant sums (KFG rule: same colour, >=3 summands, sum >=11): %d" % obs_col)
    print("  R: %d  L: %d" % (sum(1 for _, h in pairs_col if h == "R"), sum(1 for _, h in pairs_col if h == "L")))
    print("  sum cords: %s" % ", ".join("%s%s" % (seq[i]["name"], h) for i, h in pairs_col))
    print("observed any-colour run sums (same thresholds): %d" % obs_any)

    tier_of = {}
    for h in HALVES:
        for c in groups[h["opening"]]:
            tier_of[c["name"]] = "opening"
        for gi in h["summary"]:
            for c in groups[gi]:
                tier_of[c["name"]] = "summary"
        for gi in h["detail"]:
            for c in groups[gi]:
                tier_of[c["name"]] = "detail"
        if h["marker"] is not None:
            for c in groups[h["marker"]]:
                tier_of[c["name"]] = "detail"
    tiers = [tier_of[c["name"]] for c in seq]

    def shuffle_within(rng, classes):
        out = list(values)
        for cls in sorted(set(classes)):
            idx = [i for i, k in enumerate(classes) if k == cls]
            vs = [values[i] for i in idx]
            rng.shuffle(vs)
            for i, v in zip(idx, vs):
                out[i] = v
        return out

    def baseline(name, classes, same_color, observed):
        rng = random.Random(SEED)
        counts = []
        for _ in range(SHUFFLES):
            vs = shuffle_within(rng, classes)
            counts.append(run_sums(vs, keys, same_color)[0])
        mean = statistics.mean(counts)
        sd = statistics.pstdev(counts)
        z = (observed - mean) / sd if sd else float("inf")
        ge = sum(1 for x in counts if x >= observed)
        print("  %-42s observed %3d  shuffled mean %6.2f sd %5.2f  z %5.2f  max %d  P(>=obs) %d/%d" % (name, observed, mean, sd, z, max(counts), ge, SHUFFLES))
        return dict(observed=observed, mean=mean, sd=sd, z=z, max=max(counts), ge=ge)

    print("shuffle baselines (%d shuffles, seed %d):" % (SHUFFLES, SEED))
    b1 = baseline("same-colour rule, values permuted globally", ["all"] * len(seq), True, obs_col)
    b2 = baseline("same-colour rule, permuted within colour", keys, True, obs_col)
    b3 = baseline("same-colour rule, permuted within tier", tiers, True, obs_col)
    b4 = baseline("any-colour runs, values permuted globally", ["all"] * len(seq), False, obs_any)
    b5 = baseline("any-colour runs, permuted within tier", tiers, False, obs_any)

    # direct test of the column claim: permute the summary-tier values of
    # each half (opening values fixed) and count opening slots that equal
    # their column sum
    def column_matches(vals_by_name, use_alt=False):
        n = 0
        for h in HALVES:
            table = slot_table(groups, h)
            for s, c in table[h["opening"]].items():
                if val(c) == 0:
                    continue
                col = sum(vals_by_name[table[gi][s]["name"]] for gi in h["summary"] if s in table[gi])
                if col == val(c) or (use_alt and c["altValue"] and col == c["altValue"]):
                    n += 1
        return n

    rec_map = {c["name"]: val(c) for c in seq}
    alt_map = {c["name"]: alt(c) for c in seq}
    obs_cols = column_matches(rec_map)
    obs_cols_alt = column_matches(alt_map, True)
    n_tests = sum(1 for h in HALVES for c in groups[h["opening"]] if val(c) > 0)
    print("opening slots equal to their summary column: %d of %d as recorded, %d with alt values" % (obs_cols, n_tests, obs_cols_alt))
    rng = random.Random(SEED)
    hits = []
    for _ in range(SHUFFLES):
        m = dict(rec_map)
        for h in HALVES:
            names = [c["name"] for gi in h["summary"] for c in groups[gi]]
            vs = [rec_map[nm] for nm in names]
            rng.shuffle(vs)
            m.update(zip(names, vs))
        hits.append(column_matches(m))
    print("  summary-tier values permuted within each half (%d shuffles): mean %.3f, max %d, P(>=%d) = %d/%d" % (
        SHUFFLES, statistics.mean(hits), max(hits), obs_cols, sum(1 for x in hits if x >= obs_cols), SHUFFLES))
    # looser run definition, for comparison with corpus scans
    obs_any2, _ = run_sums(values, keys, False, min_summands=2, min_value=11)
    rng = random.Random(SEED)
    c2 = []
    for _ in range(SHUFFLES):
        vs = list(values)
        rng.shuffle(vs)
        c2.append(run_sums(vs, keys, False, min_summands=2, min_value=11)[0])
    print("  any-colour runs >= 2 summands: observed %d, global shuffle mean %.2f sd %.2f z %.2f" % (
        obs_any2, statistics.mean(c2), statistics.pstdev(c2), (obs_any2 - statistics.mean(c2)) / statistics.pstdev(c2)))
    # which of the coloured pendant sums involve an opening cord
    op_names = {c["name"] for h in HALVES for c in groups[h["opening"]]}
    print("  coloured pendant sums whose sum cord is an opening cord: %s" % [seq[i]["name"] + hd for i, hd in pairs_col if seq[i]["name"] in op_names])

    # ------------------------------------------------------------------ 7
    section("7. The two halves against each other")
    tot = {}
    for h in HALVES:
        k = h["key"]
        tot[k] = dict(
            opening=sum(val(c) for c in groups[h["opening"]]),
            summary=sum(val(c) for gi in h["summary"] for c in groups[gi]),
            detail=sum(val(c) for gi in h["detail"] for c in groups[gi]),
            cords=sum(len(groups[gi]) for gi in [h["opening"], *h["summary"], *h["detail"]] + ([h["marker"]] if h["marker"] is not None else [])),
        )
        print("half %s: opening total %d, summary tier %d, detail tier %d, cords %d" % (k, tot[k]["opening"], tot[k]["summary"], tot[k]["detail"], tot[k]["cords"]))
    ta, tb = slot_table(groups, HALVES[0]), slot_table(groups, HALVES[1])
    print("opening cords side by side (slot: A / B):")
    for s in range(7):
        a, b = ta[0].get(s), tb[17].get(s)
        print("  slot %d %-5s/%-5s  %s / %s" % (s + 1, TEMPLATE["A"][s], TEMPLATE["B"][s], "%s=%d" % (a["name"], val(a)) if a else "--", "%s=%d" % (b["name"], val(b)) if b else "--"))
    for s in (0, 1):
        a, b = val(ta[0][s]), val(tb[17][s])
        print("  slot %d: A - B = %d; A/B = %.3f" % (s + 1, a - b, a / b))
    wa = [val(ta[gi][0]) for gi in HALVES[0]["summary"]]
    wb = [val(tb[gi][0]) for gi in HALVES[1]["summary"]]
    print("summary W cords A: %s  B: %s" % (wa, wb))
    da = [val(ta[gi][0]) for gi in HALVES[0]["detail"]]
    db = [val(tb[gi][0]) for gi in HALVES[1]["detail"]]
    print("detail W cords A: %s (sum %d)  B: %s (sum %d)" % (da, sum(da), db, sum(db)))
    va = {val(c) for gi in range(0, 17) for c in groups[gi] if val(c) > 20}
    vb = {val(c) for gi in range(17, 33) for c in groups[gi] if val(c) > 20}
    print("values > 20 shared by the halves: %s" % sorted(va & vb))
    gt = {gi + 1: sum(val(c) for c in groups[gi]) for gi in sorted(groups)}
    same = collections.defaultdict(list)
    for g, t in gt.items():
        same[t].append(g)
    print("group totals: %s" % gt)
    print("equal group totals: %s" % {t: g for t, g in same.items() if len(g) > 1})
    # slot-by-slot W:MB ratio and W share
    for h in HALVES:
        t = slot_table(groups, h)
        w = sum(val(t[gi][0]) for gi in h["summary"])
        allv = tot[h["key"]]["summary"]
        print("half %s: W column is %.1f%% of the summary tier; MB %.1f%%" % (h["key"], 100 * w / allv, 100 * sum(val(t[gi][1]) for gi in h["summary"]) / allv))
    # detail tier column sums vs summary tier (is the summary tier a total of the detail tier?)
    for h in HALVES:
        t = slot_table(groups, h)
        print("half %s slot sums, summary vs detail:" % h["key"])
        for s in range(7):
            ss = sum(val(t[gi][s]) for gi in h["summary"] if s in t[gi])
            ds = sum(val(t[gi][s]) for gi in h["detail"] if s in t[gi])
            print("   slot %d %-5s summary %5d detail %4d ratio %.2f" % (s + 1, TEMPLATE[h["key"]][s], ss, ds, ss / ds if ds else float("nan")))
        # each summary group against pairs of detail groups (5 summaries, 10 details)
        for i, gi in enumerate(h["summary"]):
            pair = h["detail"][2 * i : 2 * i + 2]
            print("   g%d total %d vs detail g%d+g%d total %d" % (gi + 1, gt[gi + 1], pair[0] + 1, pair[1] + 1, gt[pair[0] + 1] + gt[pair[1] + 1]))

    # ------------------------------------------------------------------ 7b
    section("7b. The Aschers' observations (Databook I, 1978, AS68 pp. 384-398) re-tested")
    # 7(c): a summary cord equal to the detail column in its slot
    print("summary-tier cords equal to the detail column of their slot:")
    for h in HALVES:
        t = slot_table(groups, h)
        for s in range(7):
            ds = sum(val(t[gi][s]) for gi in h["detail"] if s in t[gi])
            for gi in h["summary"]:
                c = t[gi].get(s)
                if c and val(c) == ds:
                    print("  half %s g%d slot %d %s %s=%d = detail slot %d sum %d  (the Aschers' 7c)" % (h["key"], gi + 1, s + 1, c["color"], c["name"], val(c), s + 1, ds))
    # 7(d): ratio of summary slot sum to the last five detail groups
    for h in HALVES:
        t = slot_table(groups, h)
        for s in range(3):
            ss = sum(val(t[gi][s]) for gi in h["summary"] if s in t[gi])
            last5 = sum(val(t[gi][s]) for gi in h["detail"][5:] if s in t[gi])
            print("  half %s slot %d: summary %d / last five detail %d = %.2f  (the Aschers' 7d: 11.83 +/- 1.4%% in Part I)" % (h["key"], s + 1, ss, last5, ss / last5))
    # 8: which half is larger, group by group, slots 1-3
    ta, tb = slot_table(groups, HALVES[0]), slot_table(groups, HALVES[1])
    ga = [HALVES[0]["opening"], *HALVES[0]["summary"], *HALVES[0]["detail"]]
    gb = [HALVES[1]["opening"], *HALVES[1]["summary"], *HALVES[1]["detail"]]
    for s in range(3):
        cmp = []
        for x, y in zip(ga, gb):
            a, b = ta[x].get(s), tb[y].get(s)
            if a and b:
                cmp.append(">" if val(a) > val(b) else "<" if val(a) < val(b) else "=")
        print("  slot %d, A vs B over the 16 group pairs: %s  (A>B in %d)" % (s + 1, "".join(cmp), cmp.count(">")))
    # 9(b): the W differences of the detail tiers
    wa = [val(ta[gi][0]) for gi in HALVES[0]["detail"]]
    wb = [val(tb[gi][0]) for gi in HALVES[1]["detail"]]
    diff = [a - b for a, b in zip(wa, wb)]
    print("  detail W differences A-B: %s" % diff)
    print("  first five sum %d (B's tenth detail W is %d); last five sum %d (A's tenth detail W is %d); all ten %d = %d - %d  (the Aschers' 9b)" % (
        sum(diff[:5]), wb[9], sum(diff[5:]), wa[9], sum(diff), sum(wa), sum(wb)))
    # 9(a): any equality between a half's first/last five detail groups in one slot and the other half's in another
    fives = {}
    for h, t in (("A", ta), ("B", tb)):
        half = HALVES[0] if h == "A" else HALVES[1]
        for s in range(7):
            for part, gis in (("first5", half["detail"][:5]), ("last5", half["detail"][5:])):
                fives[(h, s + 1, part)] = sum(val(t[gi][s]) for gi in gis if s in t[gi])
    eq = [(k1, k2, v1) for k1, v1 in fives.items() for k2, v2 in fives.items() if k1 < k2 and v1 == v2 and k1[0] != k2[0]]
    print("  cross-half equal five-group slot sums: %s  (the Aschers' 9a claims A slot5 first five = B slot4 last five: %d vs %d)" % (
        eq or "none", fives[("A", 5, "first5")], fives[("B", 4, "last5")]))
    # AS47 entry 6(d): last group of half A, cords 1+2 vs the rest
    g = groups[HALVES[0]["detail"][-1]]
    print("  last group of half A (g%d): %d + %d = %d vs rest %d  (AS47 entry 6d)" % (HALVES[0]["detail"][-1] + 1, val(g[0]), val(g[1]), val(g[0]) + val(g[1]), sum(val(c) for c in g[2:])))
    # AS47 entry 7: half A detail slot 5 sum, which the Aschers equate to AS47's position-6 sum
    print("  half A detail slot 5 sum: %d  (the Aschers: equals the position-6 sum of AS47's ten groups)" % sum(val(ta[gi][4]) for gi in HALVES[0]["detail"] if 4 in ta[gi]))
    # the Aschers' spaces for lost cords vs our slot assignment
    for gi in (1, 2, 30):
        t = ta if gi < 17 else tb
        print("  g%d missing slots by colour: %s  (the Aschers note spaces in this group)" % (gi + 1, [s + 1 for s in range(7) if s not in t[gi]]))

    # ------------------------------------------------------------------ 8
    section("8. Knot notes: single-cluster large cords, figure-eight units")
    for h in HALVES:
        for c in groups[h["opening"]]:
            ks = " ".join("%d%s@%.1f=%d" % (k["n"], k["type"], k["pos"], k.get("value") or 0) for k in c["knots"])
            print("  %s %s L=%.1f %s: %s" % (c["name"], c["color"], c["length"] or 0, c["term"], ks or "no knots"))
    # where the decimal places sit on intact four-place cords
    four = [c for c in seq if len(c["knots"]) == 4 and c["term"] == "K"]
    for c in four:
        print("  %s places at %s cm" % (c["name"], [k["pos"] for k in sorted(c["knots"], key=lambda k: k["pos"])]))
    ps = [[k["pos"] for k in sorted(c["knots"], key=lambda k: k["pos"])] for c in four]
    print("  mean place positions over %d four-place cords: %s cm" % (len(four), [round(statistics.mean(x[i] for x in ps), 1) for i in range(4)]))
    # is the W cord the largest in its group?
    for tier in ("opening", "summary", "detail"):
        n = tot_n = 0
        for h in HALVES:
            for gi in ([h[tier]] if tier == "opening" else h[tier]):
                g = groups[gi]
                tot_n += 1
                if val(g[0]) == max(val(c) for c in g):
                    n += 1
                else:
                    print("  W not the largest in g%d: %s" % (gi + 1, ", ".join("%s=%d" % (c["color"], val(c)) for c in g)))
        print("  W cord is the largest of its group in %d of %d %s groups" % (n, tot_n, tier))
    # cords broken within one place-step (9 cm) below their lowest tens-or-higher cluster
    late = []
    for c in seq:
        if c["term"] != "B" or not c["knots"]:
            continue
        low = max(c["knots"], key=lambda k: k["pos"])
        if (low.get("value") or 0) / max(1, low["n"]) >= 10 and (c["length"] or 0) - low["pos"] < 9.5:
            late.append("%s(%s=%d,L=%.1f,last knot %.1f)" % (c["name"], c["color"], val(c), c["length"], low["pos"]))
    print("  broken cords ending within 9.5 cm of their lowest tens-or-higher cluster: %s" % late)
    sub = [c for c in d["cords"] if c["level"] > 1]
    print("  subsidiaries: %s" % ", ".join("%s on %s %s=%d" % (c["name"], c["parent"], c["color"], val(c)) for c in sub))
    print("  attachments: %s; twists: %s; knot directions: %s" % (
        dict(collections.Counter(c["attach"] for c in seq)),
        dict(collections.Counter(c["twist"] for c in seq)),
        dict(collections.Counter(k["dir"] for c in seq for k in c["knots"]))))

    # ------------------------------------------------------------------ 9
    if os.path.exists(OKR):
        section("9. Context: Urton's recording (OKR UR281) against the file")
        con = sqlite3.connect(OKR)
        rows = con.execute(
            "select c.cluster_id, c.cord_ordinal, c.cord_length, c.termination, cc.full_color, "
            "coalesce((select sum(k.knot_value_type) from knot k where k.cord_id=c.cord_id),0) "
            "from cord c left join ascher_cord_color cc on cc.cord_id=c.cord_id "
            "where c.khipu_id=? and c.cord_level=1 order by c.cluster_id, c.cord_ordinal",
            (OKR_ID,),
        ).fetchall()
        note = con.execute("select notes from khipu_main where khipu_id=?", (OKR_ID,)).fetchone()[0]
        print("  OKR note: %s" % note.replace("\n", " / "))
        clusters = collections.OrderedDict()
        for r in rows:
            clusters.setdefault(r[0], []).append(r[1])
        print("  Urton's clusters: %d (%s)" % (len(clusters), " ".join(str(len(v)) for v in clusters.values())))
        oi = 0
        diffs = []
        lost = []
        for c in seq:
            if c["name"] == "p128":
                print("  p128 (%s=%d) is in the Aschers' record only" % (c["color"], val(c)))
                continue
            r = rows[oi]
            oi += 1
            if r[5] != val(c):
                diffs.append((c["name"], c["color"], val(c), c["altValue"], r[5], r[4], r[2], r[3]))
                if r[5] == 0 and val(c) > 0:
                    lost.append(c["name"])
        print("  Urton has %d level-1 cords (p40 is his alone); values differ on %d cords:" % (len(rows), len(diffs)))
        for x in diffs:
            print("    %-5s %-6s file %5d alt %5s | Urton %5d %-6s L=%s %s%s" % (x[0], x[1], x[2], x[3] or "-", x[4], x[5], x[6], x[7], "  <- alt = Urton" if x[3] == x[4] else ""))
        print("  cords with a value in the file that Urton found bare or broken to a stub: %s" % lost)
        print("  file cords with an alt value: %d, of which equal to Urton's reading: %d" % (
            sum(1 for c in seq if c["altValue"]), sum(1 for x in diffs if x[3] == x[4])))
        pm1 = [x[0] for x in diffs if abs(x[2] - x[4]) == 1]
        print("  disagreements of exactly 1 (a long knot's turn count): %d %s" % (len(pm1), pm1))
        w_b = sum(alt(c) if c["name"] == "p136" else val(c) for gi in HALVES[1]["summary"] for c in groups[gi] if c["color"] == "W")
        print("  half B W column with Urton's p136 (1078) only: %d vs p111 5513: %s" % (w_b, mark(5513, w_b)))
        con.close()

    section("Key figures")
    for (k, s), (c, rec, al, terms) in sorted(results.items()):
        print("half %s slot %d %s %s=%d vs summary column %d (alt %d): %s" % (k, s + 1, TEMPLATE[k][s], c["name"], val(c), rec, al, mark(val(c), rec)))
    print("run-sum baselines: %s" % json.dumps(dict(colour_global=b1, colour_within_colour=b2, colour_within_tier=b3, any_global=b4, any_within_tier=b5), indent=None))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Analysis behind the "Counting to two" story (KH0034 and KH0670).

Two khipus whose cords carry almost nothing but 0, 1 and 2, proposed as the
same class of record: a register of presence/absence or small counts rather
than a ledger of sums. Reads public/data/khipus/KH0034.json and KH0670.json
(the app's build of the KFG workbooks) and prints every figure the story
quotes, so they can be re-derived when the data changes.

    python3 scripts/registers_analysis.py            # both khipus + corpus screen
    python3 scripts/registers_analysis.py KH0034     # one khipu, no corpus screen

For each khipu it prints:

  1. Inventory. Which level-1 cords are data cords and which are not: the
     five looped marker cords of KH0034 (notes "Marker Mn"), the mended
     stretch the Aschers left unlisted (notes "added by Urton"), the top
     cord of KH0670 and the two zero-length "cords" its recorder noted as
     knots between the parts of the primary cord. Attachment (R/V) and
     twist (S/Z) by cord, and for KH0670 by part of the primary cord.
  2. Readability. A knot register sits at a fixed height (KH0034 pendants
     ~11-20 cm, subsidiaries ~4-15 cm; KH0670 ~4-12 cm). A blank cord
     recorded as broken (term B) below that height cannot show a value, so
     its 0 is unknown, not zero (the Aschers' Databook scores such cords
     "?"). A blank cord that is not broken is a zero whatever its length.
     READ_LEN is the cut-off used below; the value histograms are given for
     all cords and for readable cords only.
  3. Value histogram, pendants and subsidiaries separately, plus the odd
     cords: KH0034's three single knots (Urton reads 10/10/11 where the
     Aschers read figure-eights) and KH0670's top cord 336.
  4. Colour cycle. KH0034 alternates three W and five LB; the KFG's spacing
     groups are the W triplets and LB quintets, the Aschers' groups are the
     eight-cord cycle (in the KFG's cord order: W W W LB LB LB LB LB; the
     Aschers listed the khipu from the other end, so their position 1 is
     the last LB here and their position 8 the first W). Value and
     knotted-fraction by cycle position, and the Aschers' position claims
     re-checked.
  5. Position effect and run structure against SHUFFLES shuffles of the
     readable values with a fixed SEED: chi-square of position x value
     class, longest runs of 0 and of knotted cords, number of runs,
     adjacent equal pairs.
  6. Group sums (Ascher eight-cord groups for KH0034, five-cord groups for
     KH0670) and section sums (the six marker-separated parts of KH0034,
     the three primary-cord parts of KH0670) against the top cord 336.
  7. Knot notation: which knot type writes 1 and which writes 2-6, knot
     direction by type, register height (mean, sd, range) and its
     relation to cord length.
  8. Subsidiaries (KH0034 only): which cycle positions carry them, their
     colours, their values, and how they relate to the parent value.
  9. Context transcribed from print (constants, not derived): the
     radiocarbon rows of Cherkinsky & Urton 2014, Table 1, and for KH0034
     the Aschers' Databook entry (1978, pp. 124-153), whose cord numbering
     is checked against the KFG's cord by cord: Ascher cord n is the n-th
     level-1 cord counted from the KFG's LAST pendant backwards, skipping
     the five markers and the five mended cords. For KH0670 the KFG's own
     fieldmark flags (two "Ascher decreasing" groups, four "group sum
     bands") are located in our group numbering.

Then a corpus screen: every khipu with >= 100 pendants whose knotted cords
(value > 0) read <= 5 at least 95 % of the time, with a short profile of
each hit (group sizes, colours, knot register) so relatives can be judged.
"""

from __future__ import annotations

import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"

SEED = 34670
SHUFFLES = 1000

# The colour cycle of KH0034 in recorded order (KFG/Urton numbering).
CYCLE = ["W", "W", "W", "LB", "LB", "LB", "LB", "LB"]
# Ascher position for each cycle index (they listed from the other end).
ASCHER_POS = [8, 7, 6, 5, 4, 3, 2, 1]

# Cords shorter than this cannot reach the knot register (see section 2).
READ_LEN = {"KH0034": 20.0, "KH0670": 12.0}
READ_LEN_SUB = {"KH0034": 15.0}

# Transcribed from Cherkinsky & Urton 2014, Open Journal of Archaeometry 2:5260,
# Table 1 (p. 34) and text (p. 33). The Peabody sample is printed there as
# "42-28-30/4352"; the museum number is 42-28-30/4532 and the KFG cites the
# paper for KH0034, so the two digits are taken as transposed.
RADIOCARBON = {
    "KH0034": dict(lab="UGAMS-4276", sample="42-28-30/4352 [sic]", bp=377, pm=23, d13c=-21.4,
                   cal1="1496-1512 (0.189); 1546-1623 (0.811)", cal2="1477-1630"),
    "KH0670": dict(lab="AA-64905", sample="Carlos2002.1.118", bp=335, pm=36, d13c=-24.7,
                   cal1="1509-1580 (0.771); 1620-1641 (0.229)", cal2="1489-1652",
                   text="calibrated age 1571+/-81 AD with 2 sigma probability; 'without provenance'"),
}

# Transcribed from Ascher & Ascher 1978, Code of the Quipu: Databook, AS32
# (pp. 124-153; courses.cit.cornell.edu/quipu/data/as32.pdf).
ASCHER_AS32 = dict(
    listed_pendants=405,          # last group is "pendant cords (403-405)"
    claimed="406/432 pendants and 51/54 groups remain",
    missing="16 pendants at the broken end of part 1, 10 at the mend in part 5",
    broken="72/406 pendants and 27/119 subsidiaries broken; value generalisations refer to 334 pendants and 92 subsidiaries",
    values="values 0,1,2,3,4,6; 1 value of 6 and 15 values of 3 or 4; 96% are 0-2",
    # spot rows: Ascher cord -> (knots, length, colour, value, subsidiaries)
    rows={1: "-- 7.0b W ?", 4: "-- 5.0b LB ?  sub 1:1.0 = 1E(11.0) 23.0 LB 1", 5: "2L(14.0) 14.5b LB 2",
          8: "2L(15.0) 28.5 W 2  sub 1:7.0 = 2L(8.0) 20.0 LB 2", 274: "first pendant after the mend"},
)


def load(kid: str) -> dict:
    return json.loads((DATA / f"{kid}.json").read_text())


def val(c: dict) -> int:
    return c["value"] or 0


def is_marker(c: dict) -> bool:
    return "Marker M" in (c.get("notes") or "")


def is_artefact(c: dict) -> bool:
    """A zero-length 'cord' the recorder notes as a knot in the primary cord."""
    return (c.get("length") or 0) == 0 and "KNOT in or between primary" in (c.get("notes") or "")


def is_mended(c: dict) -> bool:
    return "added by Urton" in (c.get("notes") or "")


def data_pendants(k: dict) -> list[dict]:
    return [
        c
        for c in k["cords"]
        if c["level"] == 1 and c["kind"] == "pendant" and not is_marker(c) and not is_artefact(c)
    ]


def readable(c: dict, cut: float) -> bool:
    """A blank cord is unreadable only if it is broken (term B) below the register."""
    if c["knots"]:
        return True
    if c.get("term") != "B":
        return True
    return (c.get("length") or 0) >= cut


def hist(vals) -> str:
    cnt = Counter(vals)
    return "  ".join(f"{v}:{cnt[v]}" for v in sorted(cnt))


def pct(a, b) -> str:
    return f"{100 * a / b:.1f}%" if b else "-"


def fmt_stats(xs) -> str:
    if not xs:
        return "-"
    return f"mean {statistics.mean(xs):.1f}  sd {statistics.pstdev(xs):.1f}  min {min(xs):.1f}  max {max(xs):.1f}  n {len(xs)}"


def shuffle_test(seq, stat, label, rng, higher="more structured"):
    """Compare stat(seq) with stat of SHUFFLES shuffles; report the tail."""
    obs = stat(seq)
    pool = list(seq)
    sims = []
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        sims.append(stat(pool))
    mean = statistics.mean(sims)
    ge = sum(1 for s in sims if s >= obs)
    le = sum(1 for s in sims if s <= obs)
    print(
        f"    {label:34s} observed {obs:8.2f}   shuffles mean {mean:8.2f}  (range {min(sims):.2f}-{max(sims):.2f})"
        f"   P(>=obs) {ge / SHUFFLES:.3f}  P(<=obs) {le / SHUFFLES:.3f}"
    )
    return obs, mean, ge / SHUFFLES, le / SHUFFLES


def pearson(xs, ys) -> float:
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sx, sy = statistics.pstdev(xs), statistics.pstdev(ys)
    if not sx or not sy:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (len(xs) * sx * sy)


def longest_run(seq, pred) -> int:
    best = cur = 0
    for v in seq:
        cur = cur + 1 if pred(v) else 0
        best = max(best, cur)
    return best


def n_runs(seq) -> int:
    flags = [v > 0 for v in seq]
    return 1 + sum(1 for a, b in zip(flags, flags[1:]) if a != b) if flags else 0


def adjacent_equal(seq) -> int:
    return sum(1 for a, b in zip(seq, seq[1:]) if a == b)


def chi_square(rows: dict[int, list[int]], classes) -> float:
    """Chi-square of position x value-class table (positions = keys)."""
    tot = sum(len(v) for v in rows.values())
    col = Counter(cls for v in rows.values() for cls in map(classes, v))
    x2 = 0.0
    for pos, vs in rows.items():
        n = len(vs)
        obs = Counter(map(classes, vs))
        for c, cn in col.items():
            e = n * cn / tot
            if e:
                x2 += (obs[c] - e) ** 2 / e
    return x2


# ------------------------------------------------------------------ KH0034


def analyse_kh0034(k: dict):
    kid = k["id"]
    print(f"\n{'=' * 78}\n{kid} {k['aliases']}  {k['museum']['name']} {k['museum']['number']}  provenance {k['provenance']}")
    print(f"primary: length {k['primary']['length']} cm, colour {k['primary']['color']}, twist {k['primary']['twist']}, "
          f"beginning {k['primary']['beginning']} (broken), termination {k['primary']['term']}; {k['primary']['notes']}")
    cords = k["cords"]
    level1 = [c for c in cords if c["level"] == 1]
    subs = [c for c in cords if c["level"] == 2]
    markers = [c for c in level1 if is_marker(c)]
    mended = [c for c in level1 if is_mended(c)]
    pend = data_pendants(k)
    print(f"\n1. INVENTORY: {len(cords)} cords = {len(level1)} level-1 + {len(subs)} subsidiaries (max level {k['stats']['maxLevel']}); "
          f"{len(k['groups'])} spacing groups")
    print(f"   markers (looped blank cords, own spacing group): {[c['name'] + ' ' + c['notes'].split()[1] for c in markers]}")
    print(f"   mended stretch the Aschers left unlisted, added by Urton: {[c['name'] for c in mended]}")
    print(f"   data pendants (level-1 minus markers): {len(pend)}; minus mended: {len(pend) - len(mended)}")
    att = Counter(c["attach"] for c in level1)
    tw = Counter(c["twist"] for c in cords)
    print(f"   attachment of level-1 cords: {dict(att)}  (markers are 'U': {[c['attach'] for c in markers]})")
    print(f"   recto cords: {[c['name'] + '/' + c['color'] for c in level1 if c['attach'] == 'R']}")
    print(f"   twist, all cords: {dict(tw)}  ({[c['name'] for c in cords if c['twist'] != 'S']})")
    print(f"   subsidiary attachment: {dict(Counter(c['attach'] for c in subs))}")
    print(f"   terminations, pendants: {dict(Counter(c['term'] for c in pend))}   subsidiaries: {dict(Counter(c['term'] for c in subs))}")

    # sections between markers
    parts: list[list[dict]] = [[]]
    for c in level1:
        if is_marker(c):
            parts.append([])
        else:
            parts[-1].append(c)
    print(f"   marker-separated parts (recorded order): {[len(p) for p in parts]} pendants; "
          f"first/last: {[(p[0]['name'], p[-1]['name']) for p in parts]}")
    rc = RADIOCARBON[kid]
    print(f"   CONTEXT radiocarbon (Cherkinsky & Urton 2014): {rc['lab']} {rc['sample']} {rc['bp']}+/-{rc['pm']} BP, "
          f"cal AD 1s {rc['cal1']}; 2s {rc['cal2']}. OKR earliest/latest age: {k['okr']['earliestAge']}/{k['okr']['latestAge']}")
    # Ascher numbering: their cord n is the n-th non-marker, non-mended level-1 cord from the KFG's end
    rev = [c for c in reversed(level1) if not is_marker(c) and not is_mended(c)]
    amap = {i + 1: c for i, c in enumerate(rev)}
    print(f"   ASCHER DATABOOK cross-check: KFG has {len(rev)} pendants outside markers and mend; Aschers list {ASCHER_AS32['listed_pendants']}")
    for a, txt in sorted(ASCHER_AS32["rows"].items()):
        c = amap[a]
        subs_a = [(x["name"], f"{x['knots'][0]['n']}{x['knots'][0]['type']}({x['knots'][0]['pos']})" if x["knots"] else "--", x["length"], x["color"], x["value"]) for x in subs if x["parent"] == c["name"]]
        kn = "+".join(f"{x['n']}{x['type']}({x['pos']})" for x in c["knots"]) or "--"
        print(f"     Ascher {a:3d} = {c['name']:5s} {kn} {c['length']}{'b' if c['term'] == 'B' else ''} {c['color']} {c['value']}  subs {subs_a}   | Databook: {txt}")
    m_after = {a: amap[a]["name"] for a in (57, 58)}
    print(f"     Databook: marker M1 follows their pendant 57 -> KFG {m_after[57]} ... {m_after[58]} straddle KFG marker p358 (M1): "
          f"{'yes' if m_after[57] == 'p359' and m_after[58] == 'p357' else 'NO'}")
    print(f"     Databook: their pendant 274 is the first after the mend -> KFG {amap[274]['name']} (KFG mend is p134-p138): {'yes' if amap[274]['name'] == 'p133' else 'NO'}")
    print(f"     Databook 'main cord starts with a broken end' = KFG termination {k['primary']['term']} at p415; 'finished with a cotton knob' = KFG beginning {k['primary']['beginning']} (needlework bundle) at p1")
    print(f"     Databook claims: {ASCHER_AS32['claimed']}; {ASCHER_AS32['missing']}; {ASCHER_AS32['broken']}; {ASCHER_AS32['values']}")

    # 2. readability
    cut = READ_LEN[kid]
    scut = READ_LEN_SUB[kid]
    kh = [kn["pos"] for c in pend for kn in c["knots"]]
    skh = [kn["pos"] for c in subs for kn in c["knots"]]
    print(f"\n2. READABILITY: pendant knot heights {fmt_stats(kh)}; subsidiary knot heights {fmt_stats(skh)}")
    rp = [c for c in pend if readable(c, cut)]
    rs = [c for c in subs if readable(c, scut)]
    print(f"   readable pendants (knotted or length >= {cut} cm): {len(rp)}/{len(pend)}; "
          f"unreadable (blank, shorter, of which broken 'B'): {len(pend) - len(rp)} "
          f"({sum(1 for c in pend if not readable(c, cut) and c['term'] == 'B')} B)")
    print(f"   readable subsidiaries (knotted or length >= {scut} cm): {len(rs)}/{len(subs)}; unreadable: {len(subs) - len(rs)} "
          f"({sum(1 for c in subs if not readable(c, scut) and c['term'] == 'B')} B, "
          f"{sum(1 for c in subs if not readable(c, scut) and (c['length'] or 0) <= 1)} of them stubs <= 1 cm)")
    print(f"   blank pendants that are broken: {sum(1 for c in pend if not c['knots'] and c['term'] == 'B')}; "
          f"blank, not broken, shorter than {cut} cm (kept as zeros): {sum(1 for c in pend if not c['knots'] and c['term'] != 'B' and (c['length'] or 0) < cut)}")
    v02 = sum(1 for c in rp if val(c) <= 2)
    print(f"   Aschers' '96% are 0-2' on our readable pendants: {v02}/{len(rp)} = {pct(v02, len(rp))}; values 3-4: {sum(1 for c in rp if val(c) in (3, 4))}, value 6: {sum(1 for c in rp if val(c) == 6)} (they count 15 and 1)")

    # 3. histograms
    print("\n3. VALUES")
    print(f"   all pendants        {hist(val(c) for c in pend)}")
    print(f"   readable pendants   {hist(val(c) for c in rp)}")
    print(f"   all subsidiaries    {hist(val(c) for c in subs)}")
    print(f"   readable subs       {hist(val(c) for c in rs)}")
    knotted = [c for c in pend if val(c) > 0]
    print(f"   knotted pendants: {len(knotted)} = {pct(len(knotted), len(rp))} of readable; "
          f"value <= 2: {sum(1 for c in knotted if val(c) <= 2)}/{len(knotted)}; "
          f"value >= 3: {[(c['name'], val(c)) for c in knotted if val(c) >= 3]}")
    ks = [c for c in cords if any(kn["type"] == "S" for kn in c["knots"])]
    print(f"   single knots (S): {[(c['name'], c['value'], [(kn['n'], kn['type'], kn['pos']) for kn in c['knots']], c.get('notes')) for c in ks]}")
    p71 = next(c for c in cords if c["name"] == "p71")
    print(f"   p71: length {p71['length']}, knots {[(x['n'], x['type'], x['pos']) for x in p71['knots']]}; Databook note: 'The cord has a loop tied in it 11.0 cm beyond the E knot. "
          f"The original length of the cord was 31.0 cm' -> the 'S knot' at {p71['knots'][-1]['pos']} cm is that loop ({p71['knots'][-1]['pos'] - p71['knots'][0]['pos']:g} cm beyond the E)")
    tot_kfg = sum(val(c) for c in cords)
    tot_ascher = tot_kfg - sum(val(c) for c in ks) + sum(
        sum(1 if kn["type"] in ("S", "E") else kn["n"] for kn in c["knots"]) for c in ks
    )
    print(f"   total of all cord values as recorded (KFG/Urton): {tot_kfg}; with the S knots read as figure-eights (Aschers): {tot_ascher}")
    print(f"   max value: {max(val(c) for c in cords)} (KFG) / {max(val(c) for c in cords if c not in ks)} without the S-knot cords")

    # 4. colour cycle
    print("\n4. COLOUR CYCLE")
    groups = defaultdict(list)
    for c in pend:
        groups[c["group"]].append(c)
    seq = [(gi, groups[gi]) for gi in sorted(groups)]
    colours = [Counter(c["color"] for c in g).most_common(1)[0][0] for _, g in seq]
    sizes = [len(g) for _, g in seq]
    print(f"   spacing groups (markers excluded): {len(seq)}; colour x size: {Counter(zip(colours, sizes)).most_common()}")
    print(f"   run of group colours: {''.join('w' if c == 'W' else 'b' for c in colours)}")
    breaks = [(seq[i][0], colours[i]) for i in range(1, len(seq)) if colours[i] == colours[i - 1]]
    print(f"   consecutive same-colour groups (breaks in alternation): {breaks}")
    pend_colours = Counter(c["color"] for c in pend)
    print(f"   pendant colours: {dict(pend_colours)}; subsidiary colours: {dict(Counter(c['color'] for c in subs))}")
    # cycle position: walk the pendants; position resets at each W-after-LB boundary
    pos_of: dict[str, int] = {}
    i = 0
    prev = None
    for c in pend:
        col = c["color"]
        if prev is not None and col == "W" and prev != "W":
            i = 0
        elif prev is not None and col != prev:
            i = 3  # first LB after W
        elif prev is not None:
            i += 1
        pos_of[c["name"]] = i
        prev = col
    off = [(c["name"], c["color"], pos_of[c["name"]]) for c in pend if pos_of[c["name"]] > 7 or (CYCLE[min(pos_of[c["name"]], 7)] != c["color"])]
    print(f"   cords off the eight-cord template (extra LB in a quintet etc.): {off}")
    cycles = []
    cur = []
    for c in pend:
        if pos_of[c["name"]] == 0 and cur:
            cycles.append(cur)
            cur = []
        cur.append(c)
    cycles.append(cur)
    print(f"   eight-cord cycles (W triplet + following LB quintet): {len(cycles)}; sizes {Counter(len(x) for x in cycles)}; "
          f"cycles per part: {[sum(1 for x in cycles if x[0]['name'] in {c['name'] for c in p}) for p in parts]}")
    print("   by cycle position (readable pendants):")
    print("   idx colour Ascher#  n_read  knotted  mean   values")
    rows = {}
    for i in range(8):
        cs = [c for c in rp if pos_of[c["name"]] == i]
        rows[i] = [val(c) for c in cs]
        print(f"   {i:3d} {CYCLE[i]:6s} {ASCHER_POS[i]:6d}  {len(cs):6d}  {pct(sum(1 for c in cs if val(c) > 0), len(cs)):>7s}  "
              f"{statistics.mean(rows[i]) if cs else 0:.2f}   {hist(rows[i])}")
    w_read = [c for c in rp if c["color"] == "W"]
    b_read = [c for c in rp if c["color"] != "W"]
    print(f"   W pendants: knotted {pct(sum(1 for c in w_read if val(c)), len(w_read))} of {len(w_read)} readable, mean {statistics.mean(val(c) for c in w_read):.2f}; "
          f"LB pendants: knotted {pct(sum(1 for c in b_read if val(c)), len(b_read))} of {len(b_read)} readable, mean {statistics.mean(val(c) for c in b_read):.2f}")
    print("   Aschers' claims (positions in their numbering) re-checked on KFG values:")
    claims = {8: {0, 1}, 5: {0, 1, 2}, 6: {0, 1, 2}, 4: {0, 1, 2, 3}, 1: {0, 1, 2, 4}, 2: {0, 1, 2, 3, 4}, 7: {0, 1, 2, 3, 4}, 3: {0, 1, 2, 3, 4, 6}}
    for apos, allowed in sorted(claims.items()):
        i = ASCHER_POS.index(apos)
        bad = [(c["name"], val(c)) for c in pend if pos_of[c["name"]] == i and val(c) not in allowed]
        print(f"     position {apos} in {sorted(allowed)}: {'holds' if not bad else 'exceptions ' + str(bad)}")

    # 5. shuffle tests
    print(f"\n5. STRUCTURE vs {SHUFFLES} SHUFFLES (seed {SEED}) of the readable pendant values in recorded order")
    rng = random.Random(SEED)
    vals = [val(c) for c in rp]
    cls = lambda v: min(v, 2)  # noqa: E731
    pos_rows = {i: [] for i in range(8)}
    for c in rp:
        if pos_of[c["name"]] < 8:  # the extra LB of the six-cord quintet has no template position
            pos_rows[pos_of[c["name"]]].append(val(c))
    # chi-square by shuffling values across positions
    obs = chi_square(pos_rows, cls)
    pool = [v for r in pos_rows.values() for v in r]
    sims = []
    sizes8 = [len(pos_rows[i]) for i in range(8)]
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        j = 0
        r = {}
        for i, n in enumerate(sizes8):
            r[i] = pool[j : j + n]
            j += n
        sims.append(chi_square(r, cls))
    print(f"    position x value-class (0/1/2+) chi2  observed {obs:.1f}   shuffles mean {statistics.mean(sims):.1f}  "
          f"P(>=obs) {sum(1 for s in sims if s >= obs) / SHUFFLES:.3f}")
    # colour only
    col_rows = {"W": [val(c) for c in w_read], "LB": [val(c) for c in b_read]}
    obs = chi_square(col_rows, cls)
    sims = []
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        sims.append(chi_square({"W": pool[: len(w_read)], "LB": pool[len(w_read) :]}, cls))
    print(f"    colour x value-class chi2            observed {obs:.1f}   shuffles mean {statistics.mean(sims):.1f}  "
          f"P(>=obs) {sum(1 for s in sims if s >= obs) / SHUFFLES:.3f}")
    shuffle_test(vals, lambda s: longest_run(s, lambda v: v == 0), "longest run of 0", rng)
    shuffle_test(vals, lambda s: longest_run(s, lambda v: v > 0), "longest run of knotted", rng)
    shuffle_test(vals, n_runs, "number of runs (0 / knotted)", rng)
    shuffle_test(vals, adjacent_equal, "adjacent equal pairs", rng)
    # stratified: shuffle values only among cords of the same cycle position, so the
    # position effect is kept and any remaining clustering is along the cord
    def strat_shuffle(seq_cords):
        by = defaultdict(list)
        for c in seq_cords:
            by[pos_of[c["name"]]].append(val(c))
        for v in by.values():
            rng.shuffle(v)
        it = {p: iter(v) for p, v in by.items()}
        return [next(it[pos_of[c["name"]]]) for c in seq_cords]
    for label, stat in (("adjacent equal pairs", adjacent_equal), ("number of runs (0 / knotted)", n_runs)):
        obs = stat(vals)
        sims = [stat(strat_shuffle(rp)) for _ in range(SHUFFLES)]
        print(f"    {label + ' [within-position shuffle]':34s} observed {obs:8.2f}   shuffles mean {statistics.mean(sims):8.2f}  "
              f"P(>=obs) {sum(1 for x in sims if x >= obs) / SHUFFLES:.3f}  P(<=obs) {sum(1 for x in sims if x <= obs) / SHUFFLES:.3f}")
    # are cycles hot/cold? variance of per-cycle mean value (cycles with >= 6 readable cords)
    cyc_read = [[val(c) for c in x if readable(c, cut)] for x in cycles]
    cyc_read = [x for x in cyc_read if len(x) >= 6]
    sizes_c = [len(x) for x in cyc_read]
    def cyc_var(flat):
        j = 0
        means = []
        for n in sizes_c:
            means.append(statistics.mean(flat[j : j + n]))
            j += n
        return statistics.pvariance(means)
    shuffle_test([v for x in cyc_read for v in x], cyc_var, f"variance of cycle means ({len(cyc_read)} cycles)", rng)
    # same on the raw sequence including unreadable blanks (as the Aschers would see it)
    allv = [val(c) for c in pend]
    print("    (all pendants, blanks included)")
    shuffle_test(allv, lambda s: longest_run(s, lambda v: v == 0), "longest run of 0", rng)
    shuffle_test(allv, n_runs, "number of runs (0 / knotted)", rng)

    # 6. group and part sums
    print("\n6. SUMS")
    csums = [sum(val(c) for c in x) for x in cycles]
    print(f"   eight-cord cycle sums (pendants only): {hist(csums)}; mean {statistics.mean(csums):.2f}")
    csums_all = [sum(val(c) for c in x) + sum(val(s) for s in subs if s['parent'] in {c['name'] for c in x}) for x in cycles]
    print(f"   cycle sums with subsidiaries: {hist(csums_all)}")
    wsum = [sum(val(c) for c in x if c["color"] == "W") for x in cycles]
    bsum = [sum(val(c) for c in x if c["color"] != "W") for x in cycles]
    print(f"   W-triplet sums: {hist(wsum)};  LB-quintet sums: {hist(bsum)}")
    print(f"   pairs (W sum == LB sum): {sum(1 for a, b in zip(wsum, bsum) if a == b)}/{len(cycles)}")
    for n, p in enumerate(parts, 1):
        names = {c["name"] for c in p}
        ps = sum(val(c) for c in p)
        ss = sum(val(s) for s in subs if s["parent"] in names)
        rd = [c for c in p if readable(c, cut)]
        print(f"   part {n}: {len(p)} pendants, readable {len(rd)}, knotted {sum(1 for c in p if val(c))}, "
              f"pendant sum {ps}, subsidiary sum {ss}, total {ps + ss}, subsidiaries {sum(1 for s in subs if s['parent'] in names)}")

    # 7. knot notation
    print("\n7. KNOTS")
    by_val = defaultdict(Counter)
    for c in cords:
        if len(c["knots"]) == 1:
            kn = c["knots"][0]
            by_val[val(c)][f"{kn['n']}{kn['type']}"] += 1
        elif c["knots"]:
            by_val[val(c)]["+".join(f"{kn['n']}{kn['type']}" for kn in c["knots"])] += 1
    for v in sorted(by_val):
        print(f"   value {v:2d}: {dict(by_val[v])}")
    d = Counter((kn["type"], kn["dir"]) for c in cords for kn in c["knots"])
    print(f"   knot direction by type: {dict(d)}")
    print(f"   figure-eight direction, pendants: {dict(Counter(kn['dir'] for c in pend for kn in c['knots'] if kn['type'] == 'E'))}; "
          f"subsidiaries: {dict(Counter(kn['dir'] for c in subs for kn in c['knots'] if kn['type'] == 'E'))}")
    print(f"   figure-eight direction by part (pendants): {[dict(Counter(kn['dir'] for c in p for kn in c['knots'] if kn['type'] == 'E')) for p in parts]}")
    print(f"   figure-eight direction by colour (pendants): {dict(Counter((c['color'], kn['dir']) for c in pend for kn in c['knots'] if kn['type'] == 'E'))}")
    ph = [(kn["pos"], c["length"]) for c in pend for kn in c["knots"] if kn["type"] in ("E", "L")]
    print(f"   pendant register height: {fmt_stats([p for p, _ in ph])}")
    if len(ph) > 2:
        r = pearson([p for p, _ in ph], [l for _, l in ph])
        print(f"   correlation(knot height, cord length) on pendants: {r:.2f}  (0 = fixed distance from the primary cord)")
        rem = [l - p for p, l in ph]
        print(f"   distance from knot to cord end: {fmt_stats(rem)}")
    for n, p in enumerate(parts, 1):
        hs = [kn["pos"] for c in p for kn in c["knots"]]
        print(f"   part {n} pendant knot height: {fmt_stats(hs)}")
    sh = [kn["pos"] for c in subs for kn in c["knots"]]
    print(f"   subsidiary register height: {fmt_stats(sh)}")

    # 8. subsidiaries
    print("\n8. SUBSIDIARIES")
    by_parent = defaultdict(list)
    for s in subs:
        by_parent[s["parent"]].append(s)
    print(f"   pendants with subsidiaries: {len(by_parent)}/{len(pend)}; with two: {sum(1 for v in by_parent.values() if len(v) == 2)}; max per pendant {max(len(v) for v in by_parent.values())}")
    print("   idx colour Ascher#  pendants  with_sub  subs")
    for i in range(8):
        cs = [c for c in pend if pos_of[c["name"]] == i]
        ws = [c for c in cs if c["name"] in by_parent]
        ns = sum(len(by_parent[c["name"]]) for c in ws)
        print(f"   {i:3d} {CYCLE[i]:6s} {ASCHER_POS[i]:6d}  {len(cs):8d}  {len(ws):8d}  {ns:4d}")
    wp = [c for c in pend if c["color"] == "W"]
    bp = [c for c in pend if c["color"] != "W"]
    print(f"   W pendants with subs: {sum(1 for c in wp if c['name'] in by_parent)}/{len(wp)}; LB pendants with subs: {sum(1 for c in bp if c['name'] in by_parent)}/{len(bp)}")
    print(f"   subsidiary colour by parent colour: W parents {dict(Counter(s['color'] for s in subs if s['parent'] in {c['name'] for c in wp}))}")
    print(f"                                     LB parents {dict(Counter(s['color'] for s in subs if s['parent'] in {c['name'] for c in bp}))}")
    print(f"   subsidiary colour x value (readable subs): {dict(Counter((s['color'].split('(')[0], val(s)) for s in rs))}")
    print(f"   subsidiary colour x readable?: {dict(Counter((s['color'].split('(')[0], readable(s, scut)) for s in subs))}")
    print(f"   position along parent (cm): {fmt_stats([s['pos'] for s in subs if s['pos'] is not None])}")
    # parent value vs subsidiary value
    xt = Counter((val(c), val(s)) for c in pend for s in by_parent.get(c["name"], []) if readable(s, scut) and readable(c, cut))
    print(f"   (parent value, subsidiary value) for readable pairs: {dict(sorted(xt.items()))}")
    par_knotted = [c for c in rp if c["name"] in by_parent]
    par_plain = [c for c in rp if c["name"] not in by_parent]
    print(f"   readable pendants with a subsidiary: knotted {pct(sum(1 for c in par_knotted if val(c)), len(par_knotted))} of {len(par_knotted)}; "
          f"without: knotted {pct(sum(1 for c in par_plain if val(c)), len(par_plain))} of {len(par_plain)}")
    print(f"   Aschers' colour-by-position claims: GB only pos 8 -> {sorted({ASCHER_POS[pos_of[s['parent']]] for s in subs if s['color'].startswith('GB') and '-' not in s['color']})}; "
          f"W only pos 7 -> {sorted({ASCHER_POS[pos_of[s['parent']]] for s in subs if s['color'] == 'W'})}; "
          f"no subs on pos 1 -> {sum(1 for s in subs if ASCHER_POS[pos_of[s['parent']]] == 1)} subs")
    return dict(pend=pend, rp=rp, subs=subs, rs=rs, cycles=cycles, parts=parts, pos_of=pos_of)


# ------------------------------------------------------------------ KH0670


def analyse_kh0670(k: dict):
    kid = k["id"]
    print(f"\n{'=' * 78}\n{kid} {k['aliases']}  {k['museum']['name']} {k['museum']['number']}  provenance {k['provenance']}")
    print(f"primary: length {k['primary']['length']} cm, colour {k['primary']['color']}, twist {k['primary']['twist']}, "
          f"termination {k['primary']['term']}; {k['primary']['notes']}")
    cords = k["cords"]
    level1 = [c for c in cords if c["level"] == 1]
    top = [c for c in level1 if c["kind"] == "top"]
    art = [c for c in level1 if is_artefact(c)]
    pend = data_pendants(k)
    print(f"\n1. INVENTORY: {len(cords)} cords, all level 1; {len(k['groups'])} spacing groups; "
          f"top cords {[(c['name'], c['value'], [(kn['n'], kn['type'], kn['pos'], kn['dir']) for kn in c['knots']], c['length']) for c in top]}; "
          f"zero-length knot artefacts {[(c['name'], c['notes']) for c in art]}")
    print(f"   data pendants: {len(pend)}; five-cord groups: {sum(1 for g in k['groups'] if g['n'] == 5)}; other groups: {[(i, g['n']) for i, g in enumerate(k['groups']) if g['n'] != 5]}")
    # parts of the primary cord: split at the top cord and the artefacts
    parts: list[list[dict]] = [[]]
    for c in level1:
        if c["kind"] == "top" or is_artefact(c):
            if parts[-1]:
                parts.append([])
        else:
            parts[-1].append(c)
    parts = [p for p in parts if p]
    for n, p in enumerate(parts, 1):
        print(f"   part {n}: {p[0]['name']}-{p[-1]['name']}, {len(p)} pendants = {len(p) / 5:g} groups, attach {dict(Counter(c['attach'] for c in p))}, "
              f"twist {dict(Counter(c['twist'] for c in p))}, primary pos {p[0]['pos']}-{p[-1]['pos']} cm")
    print(f"   attachment overall: {dict(Counter(c['attach'] for c in pend))}; twist: {dict(Counter(c['twist'] for c in cords))}; colours: {dict(Counter(c['color'] for c in cords))}")
    print(f"   terminations: {dict(Counter(c['term'] for c in pend))}")
    rc = RADIOCARBON[kid]
    print(f"   CONTEXT radiocarbon (Cherkinsky & Urton 2014): {rc['lab']} {rc['sample']} {rc['bp']}+/-{rc['pm']} BP, "
          f"cal AD 1s {rc['cal1']}; 2s {rc['cal2']}; text: {rc['text']}. Not in the OKR: {k['okr'] is None}")

    cut = READ_LEN[kid]
    kh = [kn["pos"] for c in pend for kn in c["knots"]]
    print(f"\n2. READABILITY: pendant knot heights {fmt_stats(kh)}")
    rp = [c for c in pend if readable(c, cut)]
    print(f"   readable pendants (knotted or length >= {cut} cm): {len(rp)}/{len(pend)}; unreadable: {[(c['name'], c['length']) for c in pend if not readable(c, cut)]}")
    print(f"   recorder's own notes on cut cords: {[(c['name'], c['notes']) for c in pend if c.get('notes')]}")
    for n, p in enumerate(parts, 1):
        print(f"   part {n}: readable {sum(1 for c in p if readable(c, cut))}/{len(p)}, broken 'B' {sum(1 for c in p if c['term'] == 'B')}")

    print("\n3. VALUES")
    print(f"   all pendants       {hist(val(c) for c in pend)}")
    print(f"   readable pendants  {hist(val(c) for c in rp)}")
    knotted = [c for c in pend if val(c) > 0]
    print(f"   knotted pendants: {len(knotted)} = {pct(len(knotted), len(rp))} of readable; <= 2: {sum(1 for c in knotted if val(c) <= 2)}; "
          f">= 3: {sum(1 for c in knotted if val(c) >= 3)}; max pendant value {max(val(c) for c in pend)}")
    print(f"   pendant total {sum(val(c) for c in pend)}; all-cord total {sum(val(c) for c in cords)} (= pendants + top cord {sum(val(c) for c in top)})")

    print("\n4. GROUPS AND POSITION")
    groups = defaultdict(list)
    for c in pend:
        groups[c["group"]].append(c)
    five = [groups[g] for g in sorted(groups) if len(groups[g]) == 5]
    print("   pos  n_read  knotted  mean   values")
    rows = {}
    for i in range(5):
        cs = [g[i] for g in five if readable(g[i], cut)]
        rows[i] = [val(c) for c in cs]
        print(f"   {i + 1:3d}  {len(cs):6d}  {pct(sum(1 for c in cs if val(c)), len(cs)):>7s}  {statistics.mean(rows[i]):.2f}   {hist(rows[i])}")
    gsums = [sum(val(c) for c in g) for g in five]
    print(f"   group sums: {hist(gsums)}; mean {statistics.mean(gsums):.2f}; groups with a broken cord: {sum(1 for g in five if any(c['term'] == 'B' for c in g))}")
    full = [g for g in five if all(readable(c, cut) for c in g)]
    print(f"   fully readable groups: {len(full)}; their sums {hist(sum(val(c) for c in g) for g in full)}")
    print(f"   groups all-zero: {sum(1 for g in five if not any(val(c) for c in g))} ({[g[0]['name'] for g in five if not any(val(c) for c in g)]}); "
          f"groups all-knotted: {sum(1 for g in five if all(val(c) for c in g))} ({[g[0]['name'] for g in five if all(val(c) for c in g)]})")
    print(f"   non-increasing groups (Ascher 'decreasing'): {[g[0]['name'] for g in full if all(val(a) >= val(b) for a, b in zip(g, g[1:]))]}; "
          f"non-decreasing: {[g[0]['name'] for g in full if all(val(a) <= val(b) for a, b in zip(g, g[1:]))]}")
    # value histogram per part and per group sequence
    for n, p in enumerate(parts, 1):
        rd = [c for c in p if readable(c, cut)]
        print(f"   part {n}: values {hist(val(c) for c in p)}; readable knotted {pct(sum(1 for c in rd if val(c)), len(rd))}; "
              f"mean of readable {statistics.mean(val(c) for c in rd):.2f}; sum {sum(val(c) for c in p)}")

    print(f"\n5. STRUCTURE vs {SHUFFLES} SHUFFLES (seed {SEED}) of the readable pendant values in recorded order")
    rng = random.Random(SEED)
    vals = [val(c) for c in rp]
    cls = lambda v: min(v, 2)  # noqa: E731
    obs = chi_square(rows, cls)
    pool = [v for r in rows.values() for v in r]
    sims = []
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        j = 0
        r = {}
        for i in range(5):
            r[i] = pool[j : j + len(rows[i])]
            j += len(rows[i])
        sims.append(chi_square(r, cls))
    print(f"    group position x value-class chi2  observed {obs:.1f}   shuffles mean {statistics.mean(sims):.1f}  "
          f"P(>=obs) {sum(1 for s in sims if s >= obs) / SHUFFLES:.3f}")
    # part x class
    prow = {n: [val(c) for c in p if readable(c, cut)] for n, p in enumerate(parts, 1)}
    obs = chi_square(prow, cls)
    pool = [v for r in prow.values() for v in r]
    sims = []
    for _ in range(SHUFFLES):
        rng.shuffle(pool)
        j = 0
        r = {}
        for n in prow:
            r[n] = pool[j : j + len(prow[n])]
            j += len(prow[n])
        sims.append(chi_square(r, cls))
    print(f"    part x value-class chi2            observed {obs:.1f}   shuffles mean {statistics.mean(sims):.1f}  "
          f"P(>=obs) {sum(1 for s in sims if s >= obs) / SHUFFLES:.3f}")
    shuffle_test(vals, lambda s: longest_run(s, lambda v: v == 0), "longest run of 0", rng)
    shuffle_test(vals, lambda s: longest_run(s, lambda v: v > 0), "longest run of knotted", rng)
    shuffle_test(vals, n_runs, "number of runs (0 / knotted)", rng)
    shuffle_test(vals, adjacent_equal, "adjacent equal pairs", rng)
    # variance of group sums vs shuffles (are values clustered by group?)
    gv = [[val(c) for c in g] for g in full]
    flat = [v for g in gv for v in g]
    def gvar(seq):
        return statistics.pvariance([sum(seq[i : i + 5]) for i in range(0, len(seq), 5)])
    shuffle_test(flat, gvar, "variance of full-group sums", rng)
    # KFG "group sum band" coincidences: a split of the group into two runs with equal sums
    def bands(seq):
        """KFG 'group sum band': a 2|3 or 3|2 split of the group into two runs of equal sum >= 3."""
        n = 0
        for i in range(0, len(seq), 5):
            g = seq[i : i + 5]
            if any(sum(g[:j]) == sum(g[j:]) >= 3 for j in (2, 3)):
                n += 1
        return n
    allflat = [val(c) for g in full for c in g]  # fully readable groups only
    print(f"    (the next tests use the {len(full)} fully readable groups)")
    shuffle_test(allflat, bands, "KFG sum bands (equal halves >= 3)", rng)
    def dup_patterns(seq):
        pats = Counter(tuple(seq[i : i + 5]) for i in range(0, len(seq), 5))
        return sum(n - 1 for n in pats.values() if n > 1)
    shuffle_test(allflat, dup_patterns, "repeated five-value patterns", rng)
    pats = Counter(tuple(val(c) for c in g) for g in full)
    print(f"    repeated patterns: {[(p, [g[0]['name'] for g in full if tuple(val(c) for c in g) == p]) for p, n in pats.items() if n > 1]}")
    # null that keeps each group's multiset: shuffle only within groups
    gl = [[val(c) for c in g] for g in full]
    def within(_):
        out = []
        for g in gl:
            h = g[:]
            rng.shuffle(h)
            out.extend(h)
        return out
    obs = dup_patterns(allflat)
    sims = [dup_patterns(within(None)) for _ in range(SHUFFLES)]
    print(f"    {'repeated patterns [within-group shuffle]':34s} observed {obs:8.2f}   shuffles mean {statistics.mean(sims):8.2f}  "
          f"P(>=obs) {sum(1 for x in sims if x >= obs) / SHUFFLES:.3f}")
    ms = Counter(tuple(sorted(g)) for g in gl)
    print(f"    repeated multisets (order ignored): {[(m, n) for m, n in ms.items() if n > 1]}")
    # position of zeros inside the group: is the knotted-then-blank order more common than shuffles?
    def sorted_groups(seq):
        n = 0
        for i in range(0, len(seq), 5):
            g = seq[i : i + 5]
            z = [j for j, v in enumerate(g) if v == 0]
            if z and len(z) < 5 and all(v == 0 for v in g[z[0]:]):
                n += 1
        return n
    obs = sorted_groups(allflat)
    sims = [sorted_groups(within(None)) for _ in range(SHUFFLES)]
    print(f"    {'groups with all zeros at the end':34s} observed {obs:8.2f}   within-group shuffles mean {statistics.mean(sims):8.2f}  "
          f"P(>=obs) {sum(1 for x in sims if x >= obs) / SHUFFLES:.3f}")
    # is the group-sum variance a part effect? shuffle values only within their part
    part_of = {c["name"]: n for n, p in enumerate(parts) for c in p}
    fullc = [c for g in full for c in g]
    def within_part():
        by = defaultdict(list)
        for c in fullc:
            by[part_of[c["name"]]].append(val(c))
        for v in by.values():
            rng.shuffle(v)
        it = {n: iter(v) for n, v in by.items()}
        return [next(it[part_of[c["name"]]]) for c in fullc]
    obs = gvar(flat)
    sims = [gvar(within_part()) for _ in range(SHUFFLES)]
    print(f"    {'variance of full-group sums [within-part shuffle]':34s} observed {obs:8.2f}   shuffles mean {statistics.mean(sims):8.2f}  "
          f"(range {min(sims):.2f}-{max(sims):.2f})  P(>=obs) {sum(1 for x in sims if x >= obs) / SHUFFLES:.3f}")
    heavy = sorted(((sum(val(c) for c in g), g[0]["name"], [val(c) for c in g]) for g in five), reverse=True)[:5]
    print(f"    heaviest groups: {heavy}")
    print(f"    all-group sums in recorded order: {[sum(val(c) for c in g) for g in five]}")
    # KFG fieldmark flags on this khipu (catalog page): two 'Ascher decreasing' groups, four 'group sum bands'
    allg = [g for gi in sorted(groups) for g in [groups[gi]]]
    dec = [(g[0]["name"], [val(c) for c in g]) for g in allg if len(g) == 5 and len({val(c) for c in g}) >= 3
           and all(val(a) >= val(b) for a, b in zip(g, g[1:]))]
    print(f"    KFG 'Ascher decreasing group' (non-increasing over five cords, three distinct values; KFG flags its groups 29 and 39): {dec}")
    band = [(g[0]["name"], [val(c) for c in g], j) for g in allg if len(g) == 5 for j in (2, 3)
            if sum(val(c) for c in g[:j]) == sum(val(c) for c in g[j:]) >= 3]
    print(f"    KFG 'group sum bands' (2|3 or 3|2 split, equal halves >= 3; KFG flags its 0-based groups 8, 14, 21, 27 with halves 3, 3, 7, 3): {band}")
    pats_all = Counter(tuple(val(c) for c in g) for g in five)
    print(f"    repeated five-value patterns over all {len(five)} groups (unreadable cords as 0): {[(pt, n) for pt, n in pats_all.items() if n > 1]}")

    print("\n6. THE TOP CORD 336")
    t = top[0]
    print(f"   {t['name']}: knots {[(kn['n'], kn['type'], kn['pos'], kn['dir']) for kn in t['knots']]} on a {t['length']} cm cord attached at {t['pos']} cm, "
          f"between part 1 and part 2; reads 3x100 + 3x10 + 6 = {t['value']}")
    allp = sum(val(c) for c in pend)
    print(f"   sum of all pendants {allp}; by part {[sum(val(c) for c in p) for p in parts]}; "
          f"part1+part2 {sum(val(c) for c in parts[0] + parts[1])}; part2+part3 {sum(val(c) for c in parts[1] + parts[2])}")
    print(f"   knotted pendant count {sum(1 for c in pend if val(c))}; readable count {len(rp)}; pendant count {len(pend)}; groups {len(five)}")
    print(f"   336 / 48 groups = {336 / 48:g}; 336 / 45 groups = {336 / 45:.2f}; 336 / 225 = {336 / 225:.3f}; 336 - 243 = {336 - allp}")
    seq = [val(c) for c in pend]
    hits = [(i, j) for i in range(len(seq)) for j in range(i + 1, len(seq) + 1) if sum(seq[i:j]) == 336]
    print(f"   contiguous pendant runs summing to 336: {len(hits)} (pendant total is {allp}, so none can)")
    print(f"   broken pendants: {sum(1 for c in pend if c['term'] == 'B')}; unreadable {len(pend) - len(rp)}; "
          f"mean value of readable pendants {statistics.mean(val(c) for c in rp):.2f} -> expected on the unreadable {statistics.mean(val(c) for c in rp) * (len(pend) - len(rp)):.0f}, deficit {336 - allp}")
    print(f"   notation: top cord uses {len(t['knots'])} registers at {[kn['pos'] for kn in t['knots']]} cm on {t['length']} cm (positional decimal); "
          f"pendants use one register at {statistics.mean(kn['pos'] for c in pend for kn in c['knots']):.1f} cm (sd {statistics.pstdev([kn['pos'] for c in pend for kn in c['knots']]):.1f}); "
          f"pendants with two knot clusters: {sum(1 for c in pend if len(c['knots']) > 1)}; longest pendant {max(c['length'] for c in pend)} cm")
    print(f"   336 as multiples: 336/48 = {336/48:g} (48 = spacing groups incl. top-cord and artefact singletons); 336/45 = {336/45:.3f}; 336/225 = {336/225:.3f}; 336/7 = {336/7:g}, 336/12 = {336/12:g}")

    print("\n7. KNOTS")
    by_val = defaultdict(Counter)
    for c in pend:
        for kn in c["knots"]:
            by_val[val(c)][f"{kn['n']}{kn['type']}"] += 1
    for v in sorted(by_val):
        print(f"   value {v}: {dict(by_val[v])}")
    d = Counter((kn["type"], kn["dir"]) for c in pend for kn in c["knots"])
    print(f"   knot direction by type (pendants): {dict(d)}; top cord {[(kn['type'], kn['dir']) for kn in t['knots']]}")
    ph = [(kn["pos"], c["length"]) for c in pend for kn in c["knots"]]
    print(f"   register height: {fmt_stats([p for p, _ in ph])}; correlation with cord length {pearson([p for p, _ in ph], [l for _, l in ph]):.2f}; "
          f"distance to cord end {fmt_stats([l - p for p, l in ph])}")
    for n, p in enumerate(parts, 1):
        hs = [kn["pos"] for c in p for kn in c["knots"]]
        print(f"   part {n} knot height: {fmt_stats(hs)}; cord length {fmt_stats([c['length'] for c in p if c['length']])}")
    # height drift along the cord
    print("   knot height by group (first cord's name: mean height):")
    print("   " + "  ".join(f"{g[0]['name']}:{statistics.mean(kn['pos'] for c in g for kn in c['knots']):.1f}" for g in five if any(c["knots"] for c in g)))
    return dict(pend=pend, rp=rp, parts=parts, five=five, top=t)


# ------------------------------------------------------------ corpus screen


def corpus_screen():
    print(f"\n{'=' * 78}\nCORPUS SCREEN: khipus with >= 100 pendants whose knotted cords read <= 5 at least 95% of the time")
    print(f"{'id':7s} {'aliases':16s} {'pend':>5s} {'knotted':>7s} {'<=5':>6s} {'<=2':>6s} {'zero':>6s} {'max':>4s} {'cols':>4s} {'top':>3s}  museum / provenance")
    hits = []
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        pend = [c for c in k["cords"] if c["level"] == 1 and c["kind"] == "pendant"]
        if len(pend) < 100:
            continue
        cords = [c for c in k["cords"] if c["kind"] != "top"]
        knotted = [c for c in cords if val(c) > 0]
        if not knotted:
            continue
        le5 = sum(1 for c in knotted if val(c) <= 5)
        if le5 / len(knotted) < 0.95:
            continue
        le2 = sum(1 for c in knotted if val(c) <= 2)
        zero = sum(1 for c in cords if val(c) == 0)
        tops = [c for c in k["cords"] if c["kind"] == "top"]
        hits.append(k)
        print(f"{k['id']:7s} {','.join(k['aliases']):16s} {len(pend):5d} {len(knotted):7d} {pct(le5, len(knotted)):>6s} {pct(le2, len(knotted)):>6s} "
              f"{pct(zero, len(cords)):>6s} {max(val(c) for c in cords):4d} {k['stats']['nColors']:4d} {len(tops):3d}  "
              f"{k['museum']['canonical']} / {k['provenance']}  top values {[val(c) for c in tops]}")
    print(f"hits: {len(hits)}")
    print("\nprofile of the hits:")
    for k in hits:
        pend = [c for c in k["cords"] if c["level"] == 1 and c["kind"] == "pendant"]
        subs = [c for c in k["cords"] if c["level"] > 1]
        knotted = [c for c in k["cords"] if c["kind"] != "top" and val(c) > 0]
        sizes = Counter(g["n"] for g in k["groups"])
        cols = Counter(c["color"] for c in pend).most_common(4)
        heights = [kn["pos"] for c in pend for kn in c["knots"]]
        one = sum(1 for c in knotted if len(c["knots"]) == 1)
        kt = Counter(kn["type"] for c in knotted for kn in c["knots"])
        print(f"  {k['id']}: {len(pend)} pendants, {len(subs)} subsidiaries, {len(k['groups'])} groups (sizes {sizes.most_common(4)}), "
              f"pendant colours {cols}, knotted cords with one cluster {pct(one, len(knotted))}, knot types {dict(kt)}, "
              f"pendant knot height {fmt_stats(heights)}, attach {dict(Counter(c['attach'] for c in pend))}, "
              f"values {hist(val(c) for c in knotted)}; primary {k['primary']['length']} cm; OKR age {k['okr'] and k['okr']['earliestAge']}")
    # looser: >= 90 %, to see the neighbourhood
    print("\nneighbourhood (>= 100 pendants, 80-95% of knotted cords <= 5):")
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        pend = [c for c in k["cords"] if c["level"] == 1 and c["kind"] == "pendant"]
        if len(pend) < 100:
            continue
        cords = [c for c in k["cords"] if c["kind"] != "top"]
        knotted = [c for c in cords if val(c) > 0]
        if not knotted:
            continue
        f = sum(1 for c in knotted if val(c) <= 5) / len(knotted)
        if 0.80 <= f < 0.95:
            print(f"  {k['id']} {','.join(k['aliases']):16s} pend {len(pend):4d} knotted {len(knotted):4d} <=5 {100 * f:.0f}%  max {max(val(c) for c in cords)}  {k['museum']['canonical']} / {k['provenance']}")
    # Quave's other two Carlos khipus
    print("\nQuave's other Carlos Museum khipus:")
    for kid in ("KH0669", "KH0671"):
        p = DATA / f"{kid}.json"
        if not p.exists():
            print(f"  {kid}: not in the data")
            continue
        k = json.loads(p.read_text())
        cords = [c for c in k["cords"] if c["kind"] != "top"]
        knotted = [c for c in cords if val(c) > 0]
        print(f"  {kid} {k['aliases']} {k['museum']['number']}: {len(cords)} cords, {k['stats']['nGroups']} groups, max {k['stats']['maxValue']}, "
              f"knotted <=5 {pct(sum(1 for c in knotted if val(c) <= 5), len(knotted))}, colours {k['stats']['nColors']}")
    # corpus figure-eight = 1 convention
    e1 = e_other = 0
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        for c in k["cords"]:
            if len(c["knots"]) == 1 and c["knots"][0]["type"] == "E":
                if c["knots"][0]["n"] == 1 and val(c) == 1:
                    e1 += 1
                else:
                    e_other += 1
    print(f"\ncorpus: cords whose only knot is one figure-eight = {e1} (value 1) + {e_other} (other)")


def main():
    which = sys.argv[1:] or ["KH0034", "KH0670"]
    if "KH0034" in which:
        analyse_kh0034(load("KH0034"))
    if "KH0670" in which:
        analyse_kh0670(load("KH0670"))
    if not sys.argv[1:]:
        corpus_screen()


if __name__ == "__main__":
    main()

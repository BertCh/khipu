#!/usr/bin/env python3
"""Verification tables for the proportional-template khipu (KH0028 / AS026B),
with its joined partner KH0027 (AS026A) and a corpus screen.

Reads public/data/khipus/KH0028.json (and KH0027.json) and prints every
figure the story /stories/proportional-template quotes:

1.  Object: aliases, museum, primary cord, cord and group counts.
2.  The 13 x up-to-10 matrix of pendant values by group and position, with
    colour, termination, length and knots, so the template can be checked
    by eye.  A pendant is "unreadable" when it is recorded broken (term B)
    and carries no knots; its value 0 is not a zero.
3.  Template fit.  The template is N, N, N/2, N, N, N, N, N, N/2, N/2 for a
    ten-cord group and N, N, N/2, N, N, N, N, N/2, N/2 for a nine-cord group
    (the Aschers' reading: one of the five middle N positions is missing).
    N is the most common readable value at the N positions.  Each position
    is classed exact / rounded (odd N, N/2 rounded down or up) / broken /
    mismatch.
4.  Subsidiaries by position and colour, and the Aschers' "with
    subsidiaries" reading (pendant + subsidiaries per position).
5.  Group totals (pendants only, and with subsidiaries), the N values in
    order, ratios between consecutive N, and a subset-sum search for the
    two single pendants (31 and 406) over the group totals.
6.  Attachment and twist by position (all unrecorded on this khipu).
7.  Low-position test: in every complete ten-cord group, which three
    positions carry the smallest values?  Plus the analytic chance and a
    seeded shuffle.
8.  Corpus screen over public/data/khipus/*.json: groups of >= MIN_GROUP
    fully readable pendants are scaled by their first value; a khipu counts
    when >= 3 of its groups share one non-constant normalised vector.
    Reported separately for vectors shared at different scales (a ratio
    template) and at the same scale (repeated groups).  Also the exact
    KH0028 template searched corpus-wide with floor/ceil rounding allowed.
9.  KH0027 group summary (it is tied to KH0028 and shares its accession),
    with the join geometry the Aschers describe checked against the
    recorded cord positions.
10. Extra checks added on review: the subsidiary series of each group
    fitted to the template on their own (in group 1 the W:GG subsidiaries
    are the template with N = 2); template totals and their ratios; the
    corpus frequency of 8 knotted as 4L+4L rather than 8L; and a
    positional screen (how many khipus have >= 3 complete 9/10-cord groups
    whose three lowest cords sit in the same positions).

    python3 scripts/kh0028_analysis.py        # MIN_GROUP = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    python3 scripts/kh0028_analysis.py 3      # corpus screen at another minimum group size
"""

from __future__ import annotations

import collections
import itertools
import json
import random
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
ID = "KH0028"
PAIR = "KH0027"

# Positions (1-based) holding N/2 in a ten- and a nine-cord group.
HALF_10 = (3, 9, 10)
HALF_9 = (3, 8, 9)
# Ascher group number (1-based, singles excluded) for each recorder group index.
ASCHER_GROUP = {0: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11}
MIN_GROUP = int(sys.argv[1]) if len(sys.argv) > 1 else 5
SEED = 1


def load(kid):
    return json.load(open(DATA / f"{kid}.json"))


def unreadable(c):
    return c["term"] == "B" and not c["knots"]


def val(c):
    return None if unreadable(c) else (c["value"] or 0)


def groups_of(d):
    by = collections.defaultdict(list)
    for c in d["cords"]:
        if c["kind"] == "pendant":
            by[c["group"]].append(c)
    return [sorted(by[g], key=lambda c: c["ordinal"]) for g in sorted(by)]


def children_of(d):
    kids = collections.defaultdict(list)
    for c in d["cords"]:
        if c.get("parent"):
            kids[c["parent"]].append(c)
    return kids


def half_positions(n):
    return HALF_10 if n == 10 else HALF_9 if n == 9 else ()


def fit(group, reader=None):
    """Classify each position of a 9/10-cord group against the template."""
    n = len(group)
    halves = half_positions(n)
    if not halves:
        return None
    vals = [(reader or val)(c) for c in group]
    n_vals = [v for i, v in enumerate(vals, 1) if i not in halves and v is not None]
    if not n_vals:
        return None
    N = collections.Counter(n_vals).most_common(1)[0][0]
    rows = []
    for i, v in enumerate(vals, 1):
        want = N / 2 if i in halves else N
        if v is None:
            cls = "broken"
        elif v == want:
            cls = "exact"
        elif i in halves and N % 2 and v in (N // 2, N // 2 + 1):
            cls = "down" if v == N // 2 else "up"
        else:
            cls = "mismatch"
        rows.append((i, v, want, cls))
    return N, rows


def section(title):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def main():
    d = load(ID)
    groups = groups_of(d)
    kids = children_of(d)

    # ------------------------------------------------------------------ 1
    section("1. Object")
    m = d["museum"]
    print(f"{ID} aliases={d['aliases']} museum={m['name']} number={m['number']} url={m['url']}")
    print(f"provenance={d['provenance']} region={d['region']} primary length={d['primary']['length']} cm colour={d['primary']['color']} beginning={d['primary']['beginning']} term={d['primary']['term']}")
    s = d["stats"]
    print(f"cords={s['nCords']} pendants={s['nPendants']} subsidiaries={s['nSubsidiaries']} groups={s['nGroups']} maxLevel={s['maxLevel']} knots={s['nKnots']} knotTypes={s['knotTypes']} maxValue={s['maxValue']} totalValue(all cords)={s['totalValue']}")
    pend_total = sum(val(c) or 0 for g in groups for c in g)
    sub_total = sum((c["value"] or 0) for c in d["cords"] if c["kind"] != "pendant")
    n_unread = sum(1 for g in groups for c in g if unreadable(c))
    n_unread_sub = sum(1 for c in d["cords"] if c["kind"] != "pendant" and unreadable(c))
    print(f"pendant value total={pend_total} subsidiary value total={sub_total} unreadable pendants={n_unread} unreadable subsidiaries={n_unread_sub}")
    print("group sizes:", [len(g) for g in groups])
    print("group pendant colours:", [collections.Counter(c['color'] for c in g).most_common(1)[0][0] for g in groups])

    # ------------------------------------------------------------------ 2
    section("2. Matrix of pendant values (group x position); '-' = broken, no knots")
    for gi, g in enumerate(groups):
        cells = ["   -" if val(c) is None else f"{val(c):4d}" for c in g]
        col = collections.Counter(c["color"] for c in g).most_common(1)[0][0]
        print(f"G{gi:<2d} A{ASCHER_GROUP.get(gi, '-'):<3} {col:<3} n={len(g):2d} |" + "".join(cells))
    print()
    print("cord detail:")
    for gi, g in enumerate(groups):
        for i, c in enumerate(g, 1):
            knots = ", ".join(f"{k['n']}{k['type']}@{k['pos']}" for k in c["knots"]) or "no knots"
            print(f"  G{gi:<2d} pos{i:<2d} {c['name']:<5} {c['color']:<6} term={c['term']} len={c['length']!s:>5} value={c['value']!s:>4} {'UNREADABLE' if unreadable(c) else ''} knots: {knots}")

    # ------------------------------------------------------------------ 3
    section("3. Template fit  (10 cords: N N N/2 N N N N N N/2 N/2 ; 9 cords: N N N/2 N N N N N/2 N/2)")
    summary = {}
    for gi, g in enumerate(groups):
        r = fit(g)
        if r is None:
            print(f"G{gi} n={len(g)}: not a 9/10-cord group, not tested")
            continue
        N, rows = r
        cnt = collections.Counter(cls for *_, cls in rows)
        cls_str = " ".join(f"{i}:{'-' if v is None else v}/{want:g}:{cls}" for i, v, want, cls in rows)
        verdict = (
            "exact" if cnt["exact"] == len(rows) else
            "exact with rounding" if cnt["mismatch"] == 0 and cnt["broken"] == 0 else
            "fits where readable" if cnt["mismatch"] == 0 else
            "does not fit"
        )
        summary[gi] = (N, verdict, dict(cnt))
        print(f"G{gi} (Ascher {ASCHER_GROUP.get(gi)}) n={len(g)} N={N}: {verdict}  {dict(cnt)}")
        print(f"     {cls_str}")
    print()
    print("verdict counts:", collections.Counter(v for _, v, _ in summary.values()))
    print("N by group (template groups):", {gi: N for gi, (N, v, _) in summary.items() if v != 'does not fit'})
    halves_exact = sum(1 for gi, (N, v, _) in summary.items() if v != 'does not fit' for i, vv, want, cls in fit(groups[gi])[1] if i in half_positions(len(groups[gi])) and cls == 'exact')
    halves_down = sum(1 for gi, (N, v, _) in summary.items() if v != 'does not fit' for i, vv, want, cls in fit(groups[gi])[1] if cls == 'down')
    halves_up = sum(1 for gi, (N, v, _) in summary.items() if v != 'does not fit' for i, vv, want, cls in fit(groups[gi])[1] if cls == 'up')
    halves_broken = sum(1 for gi, (N, v, _) in summary.items() if v != 'does not fit' for i, vv, want, cls in fit(groups[gi])[1] if i in half_positions(len(groups[gi])) and cls == 'broken')
    print(f"half positions in fitting groups: exact={halves_exact} rounded down={halves_down} rounded up={halves_up} broken={halves_broken}")

    # ------------------------------------------------------------------ 4
    section("4. Subsidiaries by position")
    for gi, g in enumerate(groups):
        print(f"G{gi} (Ascher {ASCHER_GROUP.get(gi, '-')}):")
        for i, c in enumerate(g, 1):
            subs = kids[c["name"]]
            parts = []
            for sc in subs:
                deeper = kids[sc["name"]]
                sv = "-" if unreadable(sc) else str(sc["value"] or 0)
                dd = "".join(f"[{x['color']} {'-' if unreadable(x) else x['value'] or 0}]" for x in deeper)
                parts.append(f"{sc['color']}={sv}{dd}")
            raw_total = None if val(c) is None else val(c) + sum((x["value"] or 0) for x in subs if not unreadable(x)) + sum((y["value"] or 0) for x in subs for y in kids[x["name"]] if not unreadable(y))
            print(f"  pos{i:<2d} {c['name']:<5} {c['color']:<3} {'-' if val(c) is None else val(c):>4}  subs: {' '.join(parts) or 'none'}   pendant+subs (as built)={raw_total}")
    print()
    print("Subsidiary colours per group (first colour code of each subsidiary), against the pendant colour:")
    for gi, g in enumerate(groups):
        pc = collections.Counter(c["color"] for c in g).most_common(1)[0][0]
        sc = collections.Counter(x["color"] for c in g for x in descendants(c, kids))
        n_sub = sum(sc.values())
        same = sum(v for k, v in sc.items() if k.split(":")[0] == pc)
        print(f"  G{gi:<2d} pendants {pc:<2} subsidiaries={n_sub:3d} starting with the pendant colour={same:3d}  {dict(sc)}")
    print()
    print("W-coloured subsidiary values by position (the 'second series'):")
    for gi in (5, 7, 11):
        row = []
        for c in groups[gi]:
            w = [x for x in kids[c["name"]] if x["color"] == "W"]
            row.append("-" if not w else ("B" if unreadable(w[0]) else str(w[0]["value"] or 0)))
        print(f"  G{gi}: {' '.join(row)}")
    print("  G8 pendants:", " ".join(str(val(c)) for c in groups[8]))
    print("  G10 pendants:", " ".join(str(val(c)) for c in groups[10]))
    single_knot_subs = collections.Counter()
    for c in d["cords"]:
        if c["kind"] != "pendant" and len(c["knots"]) == 1 and c["knots"][0]["n"] == 1:
            single_knot_subs[(c["knots"][0]["type"], c["value"])] += 1
    print("subsidiaries with exactly one knot, by (type, value):", dict(single_knot_subs))
    print("  (the Aschers read both single and figure-eight knots on subsidiaries as 1; the build keeps S as 10 for", sum(v for (t, val_), v in single_knot_subs.items() if t == 'S' and val_ == 10), "of them:", [c['name'] for c in d['cords'] if c['kind'] != 'pendant' and len(c['knots']) == 1 and c['knots'][0]['n'] == 1 and c['value'] == 10], ")")
    print()
    print("Pendant + subsidiaries per position (Ascher reading: a lone single knot on a subsidiary = 1); '-' = a broken cord in the position")
    for gi, g in enumerate(groups):
        cells = []
        for c in g:
            w = with_subs(c, kids)
            cells.append("   -" if w is None else f"{w:4d}")
        print(f"G{gi:<2d} n={len(g):2d} |" + "".join(cells))
    print()
    print("Template fit on pendant + subsidiaries:")
    rounding = collections.Counter()
    for gi, g in enumerate(groups):
        r = fit(g, lambda c: with_subs(c, kids))
        if r is None:
            continue
        N, rows = r
        cnt = collections.Counter(cls for *_, cls in rows)
        for i, v, want, cls in rows:
            if i in half_positions(len(g)) and N % 2:
                rounding[cls] += 1
        print(f"  G{gi} (Ascher {ASCHER_GROUP.get(gi)}) N={N} N/2->{[v for i, v, _, _ in rows if i in half_positions(len(g))]} {dict(cnt)}")
    print("  odd N with subsidiaries, half positions:", dict(rounding), "(Aschers: 18 odd halvings, 10 down, 6 up, 2 broken)")
    print()
    print("How each value is knotted (pendants in template groups):")
    rep = collections.defaultdict(collections.Counter)
    for gi in summary:
        for c in groups[gi]:
            if val(c) is None:
                continue
            rep[val(c)]["+".join(f"{k['n']}{k['type']}" for k in c["knots"]) or "none"] += 1
    for v in sorted(rep):
        print(f"  value {v:3d}: {dict(rep[v])}")

    # ------------------------------------------------------------------ 4b
    section("4b. Subsidiary series, by colour, fitted to the template on their own")
    print("For each 9/10-cord group and each subsidiary colour hung under >= 5 of its pendants: the value of that colour's")
    print("subsidiary at each position (summed if a pendant carries two of the colour; sub-subsidiaries included);")
    print("'-' = no subsidiary of that colour, 'B' = broken.  A lone single knot on a subsidiary reads 1 (Ascher).")
    print("A series FITS when every present, readable cell is exact (or rounded, odd N) against N = the most common value at N positions.")
    sub_series_fits = []
    for gi, g in enumerate(groups):
        if len(g) not in (9, 10):
            continue
        halves = half_positions(len(g))
        colours = collections.Counter(x["color"] for c in g for x in kids[c["name"]])
        for colour, n_col in sorted(colours.items(), key=lambda kv: -kv[1]):
            if n_col < 5:
                continue
            series = []
            for c in g:
                subs = [x for x in kids[c["name"]] if x["color"] == colour]
                if not subs:
                    series.append(None)
                elif any(unreadable(x) for x in subs):
                    series.append("B")
                else:
                    series.append(sum(ascher_value(x) for x in subs) + sum(ascher_value(y) or 0 for x in subs for y in descendants(x, kids) if not unreadable(y)))
            n_vals = [v for i, v in enumerate(series, 1) if i not in halves and v not in (None, "B")]
            if not n_vals:
                continue
            N = collections.Counter(n_vals).most_common(1)[0][0]
            cls = ""
            for i, v in enumerate(series, 1):
                if v is None:
                    cls += "-"
                elif v == "B":
                    cls += "B"
                else:
                    want = N / 2 if i in halves else N
                    cls += "=" if v == want else ("~" if i in halves and N % 2 and v in (N // 2, N // 2 + 1) else "x")
            ok = "x" not in cls
            vals = " ".join("-" if v is None else "B" if v == "B" else str(v) for v in series)
            sub_series_fits.append((gi, colour, N, ok))
            print(f"  G{gi:<2d} (Ascher {ASCHER_GROUP.get(gi):>2}) {colour:<5} under {n_col:2d} pendants  N={N}  values: {vals:<22} {cls:<10} {'FITS' if ok else 'no  '} ({cls.count('=')} exact, {cls.count('~')} rounded, {cls.count('x')} mismatch, {cls.count('-')} absent, {cls.count('B')} broken)")
    print("  series with N >= 2 (a genuine halving, not a row of 1s):", [(gi, col, N, 'fits' if ok else 'no') for gi, col, N, ok in sub_series_fits if N >= 2])

    # ------------------------------------------------------------------ 5
    section("5. Totals, N sequence, ratios, subset sums")
    tot_p = [sum(val(c) or 0 for c in g) for g in groups]
    tot_s = [sum(val(c) or 0 for c in g) + sum((x["value"] or 0) for c in g for x in descendants(c, kids) if not unreadable(x)) for g in groups]
    for gi, g in enumerate(groups):
        nb = sum(1 for c in g if unreadable(c))
        N = summary.get(gi, (None,))[0]
        tmpl = None
        if N is not None and summary[gi][1] != "does not fit":
            n = len(g)
            tmpl = (n - len(half_positions(n))) * N + sum(N // 2 for _ in half_positions(n))
        print(f"G{gi:<2d} pendants={tot_p[gi]:4d} with subs={tot_s[gi]:4d} broken={nb} N={N} template total={tmpl}")
    Ns = [(gi, summary[gi][0]) for gi in summary if summary[gi][1] != "does not fit"]
    print("N in cord order:", Ns)
    print("consecutive N ratios:", [(a[0], b[0], Fraction(a[1], b[1])) for a, b in zip(Ns, Ns[1:])])
    print("24/8 =", Fraction(24, 8), " 8/4 =", Fraction(8, 4), " 4/2 =", Fraction(4, 2), " 24/9 =", Fraction(24, 9), " 9/4 =", Fraction(9, 4))
    print("pairs of groups where one N is exactly twice the other:", [(a, b) for (a, na), (b, nb_) in itertools.combinations(Ns, 2) if na == 2 * nb_ or nb_ == 2 * na])
    print("pairs where one N is exactly three times the other:", [(a, b) for (a, na), (b, nb_) in itertools.combinations(Ns, 2) if na == 3 * nb_ or nb_ == 3 * na])
    p11 = groups[1][0]["value"]
    p47 = groups[6][0]["value"]
    print(f"single pendants: p11={p11} (W), p47={p47} (W)")
    print(f"sum of all other pendants={pend_total - p11 - p47}; all other cords={s['totalValue'] - p11 - p47}")
    w_groups = [gi for gi, g in enumerate(groups) if g[0]["color"] == "W" and len(g) > 1]
    b_groups = [gi for gi, g in enumerate(groups) if g[0]["color"] == "B" and len(g) > 1]
    print(f"W groups {w_groups}: pendants={sum(tot_p[i] for i in w_groups)} with subs={sum(tot_s[i] for i in w_groups)}")
    print(f"B groups {b_groups}: pendants={sum(tot_p[i] for i in b_groups)} with subs={sum(tot_s[i] for i in b_groups)}")
    tmpl_groups = [gi for gi, _ in Ns]
    print(f"template groups {tmpl_groups}: pendants={sum(tot_p[i] for i in tmpl_groups)} with subs={sum(tot_s[i] for i in tmpl_groups)}")
    others = [gi for gi in range(len(groups)) if gi not in tmpl_groups and len(groups[gi]) > 1]
    print(f"non-template multi-cord groups {others}: pendants={sum(tot_p[i] for i in others)} with subs={sum(tot_s[i] for i in others)}")
    for target in (p11, p47):
        for label, tots in (("pendants", tot_p), ("with subs", tot_s)):
            hits = []
            multi = [gi for gi in range(len(groups)) if len(groups[gi]) > 1]
            for r in range(1, len(multi) + 1):
                for combo in itertools.combinations(multi, r):
                    if sum(tots[i] for i in combo) == target:
                        hits.append(combo)
            print(f"subset sums of group totals ({label}) equal to {target}: {len(hits)} of {2 ** len(multi) - 1} subsets; e.g. {hits[:4]}")
    # chance baseline: how many of the integers in range are hit by some subset
    multi = [gi for gi in range(len(groups)) if len(groups[gi]) > 1]
    reach = set()
    for r in range(1, len(multi) + 1):
        for combo in itertools.combinations(multi, r):
            reach.add(sum(tot_p[i] for i in combo))
    lo, hi = 1, max(reach)
    print(f"pendant-only subset sums reach {len([x for x in reach if x <= 500])} of the integers 1..500 -> a hit is uninformative")

    # ------------------------------------------------------------------ 5b
    section("5b. Template totals (7N + 3*floor(N/2) for ten cords) and their ratios")
    tt = {gi: summary[gi][0] for gi in summary if summary[gi][1] != "does not fit" and len(groups[gi]) == 10}
    for gi, N in tt.items():
        print(f"  G{gi:<2d} N={N:2d} template total={7 * N + 3 * (N // 2):3d} recorded pendant total={tot_p[gi]:3d} (recorded < template only where cords are broken)")
    print("  ratios of template totals between ten-cord template groups:")
    for (a, na), (b, nb_) in itertools.combinations(tt.items(), 2):
        ta, tb = 7 * na + 3 * (na // 2), 7 * nb_ + 3 * (nb_ // 2)
        fr = Fraction(ta, tb)
        print(f"    G{a}/G{b} = {ta}/{tb} = {fr}{'  (whole)' if fr.denominator == 1 or fr.numerator == 1 else ''}")
    print("  the two single pendants against template quantities:")
    print(f"    p47={p47}: sum of N over template groups={sum(N for _, N in Ns)}, sum of template totals (ten-cord fitting groups)={sum(7 * N + 3 * (N // 2) for N in tt.values())}, G3+G9 pendants={tot_p[3] + tot_p[9]}")
    print(f"    p11={p11}: no subset of group totals reaches it (see 5); 31 = 3S+1E on the cord")

    # ------------------------------------------------------------------ 6
    section("6. Attachment and twist by position")
    att = collections.Counter((c["attach"], c["twist"]) for c in d["cords"])
    print("all cords (attach, twist):", dict(att))

    # ------------------------------------------------------------------ 7
    section("7. Low-position test")
    low_sets = {}
    for gi, g in enumerate(groups):
        vals = [val(c) for c in g]
        if any(v is None for v in vals) or len(g) < 9:
            continue
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        third, fourth = vals[order[2]], vals[order[3]]
        low = tuple(sorted(i + 1 for i in order[:3]))
        low_sets[gi] = (low, third < fourth)
        print(f"G{gi} n={len(g)} values={vals} three lowest at positions {low} {'(unambiguous)' if third < fourth else '(tie with 4th)'}")
    tens = [gi for gi in low_sets if len(groups[gi]) == 10]
    agree = [gi for gi in tens if low_sets[gi][0] == HALF_10]
    print(f"complete ten-cord groups: {tens}; with lowest three at {HALF_10}: {agree}")
    k = len(tens)
    from math import comb
    p_all = Fraction(1, comb(10, 3)) ** (k - 1)
    print(f"chance that {k} independently shuffled ten-cord groups agree on one low triple: (1/120)^{k - 1} = {float(p_all):.2e}")
    rng = random.Random(SEED)
    trials = 200000
    best = collections.Counter()
    for _ in range(trials):
        c = collections.Counter()
        for gi in tens:
            vals = [val(x) for x in groups[gi]]
            rng.shuffle(vals)
            order = sorted(range(10), key=lambda i: vals[i])
            if vals[order[2]] < vals[order[3]]:
                c[tuple(sorted(order[:3]))] += 1
        best[max(c.values()) if c else 0] += 1
    print(f"seeded shuffle (seed={SEED}, {trials} trials): max number of groups sharing a low triple -> {dict(sorted(best.items()))}; observed {len(agree)}")

    # ------------------------------------------------------------------ 8
    section(f"8. Corpus screen: >= 3 groups (>= {MIN_GROUP} readable pendants) sharing a normalised vector")
    files = sorted(DATA.glob("KH*.json"))
    ratio_hits, same_scale_hits, template_hits = [], [], []
    pair_hits = {}
    binary_hits = set()
    n_khipus = 0
    for f in files:
        k = json.load(open(f))
        n_khipus += 1
        vecs = collections.defaultdict(list)
        for gi, g in enumerate(groups_of(k)):
            if len(g) < MIN_GROUP:
                continue
            vals = [val(c) for c in g]
            if any(v is None for v in vals) or not vals[0]:
                continue
            key = tuple(Fraction(v, vals[0]) for v in vals)
            if len(set(key)) < 2:
                continue  # constant group: every value equal
            if set(key) <= {0, 1}:
                binary_hits.add(k["id"])
                continue  # one value and blanks (e.g. 110 0 0 0 0 0): not a ratio
            vecs[key].append((gi, vals[0]))
            # exact KH0028 template with floor/ceil rounding, at 9 or 10 cords
            r = fit(g)
            if r and all(cls in ("exact", "down", "up") for *_, cls in r[1]):
                template_hits.append((k["id"], gi, r[0], vals))
        for key, gs in vecs.items():
            if len({sc for _, sc in gs}) > 1:
                pair_hits[k["id"]] = pair_hits.get(k["id"], 0) + 1
            if len(gs) >= 3:
                scales = {sc for _, sc in gs}
                (ratio_hits if len(scales) > 1 else same_scale_hits).append((k["id"], key, gs))
    print(f"khipus screened: {n_khipus}")
    print(f"khipus with a group whose vector is only 1s and 0s (one value plus blanks), set aside: {len(binary_hits)}")
    print(f"khipus with >= 2 groups sharing a non-constant normalised vector at DIFFERENT scales (a proportional pair): {len(pair_hits)}: {sorted(pair_hits)}")
    print(f"khipus with >= 3 groups sharing a non-constant normalised vector at DIFFERENT scales (ratio template): {len({h[0] for h in ratio_hits})}")
    for kid, key, gs in ratio_hits:
        print(f"  {kid}: vector {[str(x) for x in key]} groups {gs}")
    print(f"khipus with >= 3 groups sharing a non-constant vector at the SAME scale (repeated groups): {len({h[0] for h in same_scale_hits})}")
    for kid, key, gs in same_scale_hits[:20]:
        print(f"  {kid}: vector {[str(x) for x in key]} groups {gs}")
    print(f"groups anywhere in the corpus fitting the KH0028 template (9/10 cords, rounding allowed): {len(template_hits)}")
    for h in template_hits:
        print("  ", h)

    # ------------------------------------------------------------------ 8b
    section("8b. Corpus: the shape without the ratio, and how 8 is knotted")
    print("Positional screen: per khipu, the largest number of complete 9/10-cord groups whose three lowest cords sit in one (size, position-triple).")
    print("Only groups with an unambiguous low triple (third-lowest < fourth-lowest) count; groups with a broken cord are skipped.")
    pos_hits = []
    loose_pairs = []
    form_n = collections.defaultdict(collections.Counter)
    for f in files:
        k = json.load(open(f))
        agree = collections.Counter()
        for g in groups_of(k):
            if len(g) not in (9, 10):
                continue
            vals = [val(c) for c in g]
            if any(v is None for v in vals):
                continue
            order = sorted(range(len(vals)), key=lambda i: vals[i])
            if vals[order[2]] < vals[order[3]]:
                agree[(len(g), tuple(sorted(i + 1 for i in order[:3])))] += 1
        if agree:
            (size, triple), n = agree.most_common(1)[0]
            if n >= 3:
                pos_hits.append((k["id"], size, triple, n))
        for c in k["cords"]:
            if c["kind"] != "pendant" or unreadable(c):
                continue
            sig = "+".join(f"{x['n']}{x['type']}" for x in c["knots"])
            if c["value"] in (8, 9, 4):
                form_n[c["value"]][sig] += 1
        # looser proportional-pair screen: same-size groups (>= MIN_GROUP cords), broken cords skipped,
        # every readable position an exact common multiple, at least 5 positions compared, not all 0/1
        gs = []
        for gi, g in enumerate(groups_of(k)):
            if len(g) < MIN_GROUP:
                continue
            vals = [val(c) for c in g]
            if vals[0] in (None, 0):
                continue
            gs.append((gi, vals))
        for (ga, a), (gb, b) in itertools.combinations(gs, 2):
            if len(a) != len(b) or a[0] == b[0]:
                continue
            ok, nonconst, compared = True, False, 0
            for x, y in zip(a, b):
                if x is None or y is None:
                    continue
                compared += 1
                if Fraction(x, a[0]) != Fraction(y, b[0]):
                    ok = False
                    break
                if Fraction(x, a[0]) not in (0, 1):
                    nonconst = True
            if ok and nonconst and compared >= 5:
                loose_pairs.append((k["id"], ga, gb, a, b))
    pos_hits.sort(key=lambda h: -h[3])
    print(f"  proportional pairs of same-size groups anywhere in the corpus, broken cords skipped: {len(loose_pairs)} pairs on {sorted({h[0] for h in loose_pairs})}")
    for h in loose_pairs:
        print("   ", h)
    print(f"  khipus with >= 3 complete 9/10-cord groups agreeing on one low triple: {len(pos_hits)}")
    for h in pos_hits:
        print("   ", h)
    print("  how pendants worth 4, 8 and 9 are knotted, corpus-wide (top forms):")
    for v in (4, 8, 9):
        tot = sum(form_n[v].values())
        print(f"    value {v}: n={tot}  {form_n[v].most_common(6)}")
    ours = collections.Counter("+".join(f"{x['n']}{x['type']}" for x in c["knots"]) for g in groups for c in g if val(c) == 8)
    n8 = sum(form_n[8].values())
    print(f"  on {ID}, value 8 is knotted as: {dict(ours)}; elsewhere in the corpus 4L+4L is {form_n[8]['4L+4L'] - ours['4L+4L']} of {n8 - sum(ours.values())} pendants worth 8 ({100 * (form_n[8]['4L+4L'] - ours['4L+4L']) / (n8 - sum(ours.values())):.1f}%)")

    # ------------------------------------------------------------------ 9
    section(f"9. {PAIR} (AS026A), tied to {ID}")
    e = load(PAIR)
    print(f"{PAIR} aliases={e['aliases']} museum number={e['museum']['number']} primary length={e['primary']['length']} colour={e['primary']['color']} cords={e['stats']['nCords']} pendants={e['stats']['nPendants']} groups={e['stats']['nGroups']} total={e['stats']['totalValue']} max={e['stats']['maxValue']}")
    for gi, g in enumerate(groups_of(e)):
        print(f"  G{gi} n={len(g):2d} {collections.Counter(c['color'] for c in g).most_common(1)[0][0]:<4}", ["-" if val(c) is None else val(c) for c in g])
    eg = groups_of(e)
    print("Aschers: main cords knotted together 1.0 cm from the twisted end of KH0027 (between p2 and p3) and 15.0 cm from the twisted end of KH0028 (just before its first pendant).")
    print(f"  recorded: {PAIR} p2 at {eg[0][1]['pos']} cm, p3 at {eg[1][0]['pos']} cm; {ID} p1 at {groups[0][0]['pos']} cm; {ID} primary length {d['primary']['length']} cm, {PAIR} primary length {e['primary']['length']} cm")
    print("Aschers: in KH0027 groups 2-6, position 1 holds 8-13 and every other position 0-6.")
    for gi, g in enumerate(eg[1:], 1):
        rest = [val(c) for c in g[1:] if val(c) is not None]
        print(f"  G{gi} position 1 = {'-' if val(g[0]) is None else val(g[0])}, other positions {min(rest)}-{max(rest)}")
    print(f"  {PAIR} pendant value total={sum(val(c) or 0 for g in eg for c in g)}; the two first-group cords {[val(c) for c in eg[0]]} sum to {sum(val(c) or 0 for c in eg[0])}")
    print("shared colours:", sorted(set(c["color"] for c in d["cords"]) & set(c["color"] for c in e["cords"])))
    print(f"colours only in {ID}:", sorted(set(c["color"] for c in d["cords"]) - set(c["color"] for c in e["cords"])))
    print(f"colours only in {PAIR}:", sorted(set(c["color"] for c in e["cords"]) - set(c["color"] for c in d["cords"])))


def ascher_value(c):
    """A subsidiary carrying one single knot and nothing else is 1, not 10 (Ascher Databook note)."""
    if unreadable(c):
        return None
    if c["kind"] != "pendant" and len(c["knots"]) == 1 and c["knots"][0]["n"] == 1:
        return 1
    return c["value"] or 0


def with_subs(c, kids):
    """Pendant plus every subsidiary below it, None if any cord in the position is broken."""
    parts = [val(c)] + [ascher_value(x) for x in descendants(c, kids)]
    return None if any(p is None for p in parts) else sum(parts)


def descendants(c, kids):
    out = []
    for k in kids[c["name"]]:
        out.append(k)
        out.extend(descendants(k, kids))
    return out


if __name__ == "__main__":
    main()

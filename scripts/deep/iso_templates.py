#!/usr/bin/env python3
"""Colour-cycle template catalogue, invariant under palette substitution.

For every khipu (>= MINN level-1 cords) find every maximal stretch of level-1
colours that is exactly q-periodic (q = 2..QMAX, minimal) for >= REPS full
units.  The cycle unit is one period of the stretch; its TYPE is the canonical isomorph of
the unit minimised over rotations (so 'W W MB B YB' and 'YG YG DB DB-CB YG:DB'
both become the same type AABCD).  A type is 'structured' if the unit repeats
a colour (fewer distinct colours than q) -- such types are not implied by the
period alone, so sharing one is informative; 'distinct' types (ABCDE) are not.

Tests
  1. How many khipus share each structured type; compare with the number of
     sharing pairs expected if units of the same (q, k) were drawn uniformly
     from the corpus pool of observed types with that (q, k)  [label-permutation
     null: permute type labels among khipus with the same (q, k)].
  2. Homophily: do khipus sharing a structured type share provenance or
     institution more than khipus with the same (q, k) but a different type?
     Null: permute type labels within (q, k) strata, NPERM times.
  3. Palette: within shared-type pairs, fraction whose literal palettes differ.
"""
from __future__ import annotations

import collections
import itertools
import json
import random

import numpy as np

from iso_common import OUT, load, canon, known_pairs, min_period

MINN = 20
QMAX = 12
REPS = 3
NPERM = 2000


def rot_canon(unit):
    q = len(unit)
    return min(canon(unit[r:] + unit[:r]) for r in range(q))


def cycles(col):
    """Maximal stretches that are exactly q-periodic for >= REPS full units (q minimal
    for that stretch).  Returns [(q, start, length, unit)]; a stretch counted at q is
    not re-counted at multiples of q."""
    n = len(col)
    found, covered = [], set()
    for q in range(2, QMAX + 1):
        eq = [col[i] == col[i + q] and col[i] != "?" for i in range(n - q)]
        i = 0
        while i < len(eq):
            if not eq[i]:
                i += 1
                continue
            j = i
            while j < len(eq) and eq[j]:
                j += 1
            length = j - i + q          # cords covered by the periodic stretch
            if length >= REPS * q:
                unit = tuple(col[i:i + q])
                if len(set(unit)) >= 2 and min_period(canon(unit)) == q and not any(
                        (i, q2) in covered for q2 in range(2, q) if q % q2 == 0):
                    found.append((q, i, length, unit))
                    covered.add((i, q))
            i = j
    return found


def prov_key(k):
    p = (k["prov"] or "").lower()
    for key in ("pachacamac", "incahuasi", "inkawasi", "ica", "nazca", "huaquerones", "armatambo", "leymebamba",
                "huacho", "chancay", "puruchuco", "marquez", "arica", "lluta", "paracas", "pisco", "ancon"):
        if key in p:
            return key
    return None


def main():
    ks = [k for k in load() if k["n"] >= MINN]
    known = known_pairs()
    rows = []
    for k in ks:
        seen = set()
        for q, st, length, unit in cycles(k["colour"]):
          t = rot_canon(unit)
          if (q, t) in seen:
              continue
          seen.add((q, t))
          rows.append({"id": k["id"], "n": k["n"], "q": q, "start": st, "len": length, "unit": unit,
                     "type": "".join(chr(65 + x) for x in t), "k": len(set(unit)),
                     "structured": len(set(unit)) < q, "prov": prov_key(k), "museum": k["museum"],
                     "palette": tuple(sorted(set(unit)))})
    print(f"(khipu, cycle-type) stretches with >= {REPS} full units: {len(rows)} in {len({r['id'] for r in rows})} of {len(ks)} khipus")
    bytype = collections.defaultdict(list)
    for r in rows:
        bytype[(r["q"], r["type"])].append(r)
    struct = {t: rs for t, rs in bytype.items() if rs[0]["structured"]}
    print("q distribution:", collections.Counter(r["q"] for r in rows).most_common())
    print(f"structured types: {len(struct)}; shared by >=2 khipus: {sum(len(v) >= 2 for v in struct.values())}")
    for t, rs in sorted(struct.items(), key=lambda kv: -len(kv[1])):
        if len(rs) < 2:
            continue
        print(f"  q={t[0]} {t[1]} x{len(rs)}:",
              "; ".join(f"{r['id']}[{' '.join(r['unit'])}|{r['prov'] or '-'}]" for r in rs[:12]))
    # homophily test within (q,k) strata
    strata = collections.defaultdict(list)
    for r in rows:
        if r["structured"]:
            strata[(r["q"], r["k"])].append(r)

    def stat(labels_by_stratum, attr):
        same = tot = 0
        for key, rs in strata.items():
            labs = labels_by_stratum[key]
            for (i, a), (j, b) in itertools.combinations(enumerate(rs), 2):
                if a["id"] != b["id"] and labs[i] == labs[j] and a[attr] and b[attr]:
                    tot += 1
                    same += a[attr] == b[attr]
        return same, tot

    obs_labels = {key: [r["type"] for r in rs] for key, rs in strata.items()}
    rng = random.Random(17)
    out = {"n_cycle": len(rows), "types": {f"{t[0]}:{t[1]}": [r["id"] for r in rs] for t, rs in bytype.items() if len(rs) >= 2}}
    for attr in ("prov", "museum"):
        s, tot = stat(obs_labels, attr)
        # base rate among all pairs within strata
        nulls = []
        for _ in range(NPERM):
            pl = {}
            for key, labs in obs_labels.items():
                l2 = labs[:]
                rng.shuffle(l2)
                pl[key] = l2
            s2, t2 = stat(pl, attr)
            nulls.append(s2 / t2 if t2 else 0)
        nulls = np.array(nulls)
        frac = s / tot if tot else 0
        out[attr] = {"same_type_pairs_with_label": tot, "same_label": s, "frac": round(frac, 3),
                     "null_mean": round(float(nulls.mean()), 3), "null_sd": round(float(nulls.std()), 3),
                     "p": float(((nulls >= frac).sum() + 1) / (NPERM + 1))}
        print(attr, out[attr])
    # palette substitution among shared-type pairs
    pairs = []
    for t, rs in struct.items():
        for a, b in itertools.combinations(rs, 2):
            if a["id"] == b["id"]:
                continue
            pairs.append({"a": a["id"], "b": b["id"], "q": t[0], "type": t[1],
                          "same_palette": a["palette"] == b["palette"],
                          "known": tuple(sorted((a["id"], b["id"]))) in known,
                          "prov": (a["prov"], b["prov"]), "museum": (a["museum"][:25], b["museum"][:25])})
    out["shared_structured_pairs"] = pairs
    print(f"shared structured-type pairs: {len(pairs)}; same literal palette: {sum(p['same_palette'] for p in pairs)};"
          f" known links: {sum(p['known'] for p in pairs)}")
    out["rows"] = rows
    (OUT / "iso_templates.json").write_text(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()

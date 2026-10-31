#!/usr/bin/env python3
"""
Faithful port of the Medrano & Khosla (2024, LAA) "generalized Ascher relation" searches.

Source: khipufieldguide-data-science-khipu-article (companion repo), notebook
source/02_ascher_sum_relationships (relations 1-9) and 05 (handedness).  Every threshold,
enumeration order, trivial-match filter, dedupe quirk and handedness rule below is copied
from their code; places where their library (khipu_kamayuq, not published) had to be
inferred are marked INFERRED and were validated instance-by-instance against their
*_relation.csv output on their own 2024 snapshot (see mk_port_validate.py).

Importable API (all functions take a *prepared* khipu, see prepare()):

    from mk_port_relations import prepare, RELATIONS, run_all
    pk = prepare(json.load(open("public/data/khipus/KH0011.json")))
    rows = RELATIONS["pendant_pendant_sum"](pk)      # list of instance dicts
    everything = run_all(pk)                          # {relation: [instances]}

Each instance: {khipu, sum_cord, summands:[names], value, handedness, ...}.
handedness >= 0 is "right-handed" (summands lie to the right of the sum cord), as in
their notebook 05.

Relations ported: 1 pendant_pendant_sum, 2 pendant_pendants_color_sum,
3 indexed_pendant_sum, 4 pendant_sub_neighbor, 5 subsidiary_pendant_sum,
7 cluster_sum_bands, 9 sum_top_cords + double_sum_top_cords.

CLI:  python3 scripts/mk/mk_port_relations.py [--out DIR]
      runs all relations over public/data/khipus/*.json and writes DIR/<relation>.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from statistics import mean

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
SCRATCH = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/"
               "573e055a-1d0e-4a10-b794-c747179bc194/scratchpad")
OUT_DEFAULT = SCRATCH / "out" / "relations"

SEG_RE = re.compile(r"^(.*)\(([0-9.]+)-([0-9.]+)\)$")


# ---------------------------------------------------------------------------
# Data model: a minimal re-creation of the parts of their Khipu/Cluster/Cord API used
# ---------------------------------------------------------------------------

def longest_ascher_color(color: str | None) -> str:
    """Their Cord.longest_ascher_color(): colour of the longest segment for segmented
    cords ('MB(0.0-7.0)/W(7.0-35.0)' -> 'W'); otherwise the full colour string
    ('W:RG' stays 'W:RG').  INFERRED (tie -> first segment)."""
    if not color:
        return ""
    if "/" not in color and "(" not in color:
        return color
    best, blen = None, -1.0
    for seg in color.split("/"):
        m = SEG_RE.match(seg.strip())
        if not m:
            continue
        ln = float(m[3]) - float(m[2])
        if ln > blen:
            best, blen = m[1], ln
    return best if best is not None else color


class Cord:
    __slots__ = ("name", "v", "color", "top", "level", "parent", "children",
                 "pidx", "cl", "cpos", "skip")

    def __init__(self, name, v, color, top, level, parent):
        self.name, self.v, self.color, self.top = name, v, color, top
        self.level, self.parent = level, parent
        self.children: list[Cord] = []
        self.pidx = self.cl = self.cpos = None
        self.skip = False  # snapshot only: cord their object model did not see as a subsidiary

    def __repr__(self):
        return f"{self.name}:{self.v}"


class PK:
    """Prepared khipu.
    l1       : level-1 cords (pendants AND top cords) in primary-cord order.
               = their aKhipu.pendant_cords() and aKhipu[:,:]  (INFERRED, validated)
    clusters : list of lists of level-1 cords (their cord_clusters(), cluster_level 1)
    subs     : level-2 cords in cluster/cord/sub order (their aKhipu[:,:,:])
    """

    def __init__(self, kid, l1, clusters):
        self.id = kid
        self.l1 = l1
        self.clusters = clusters
        for i, c in enumerate(l1):
            # pendant_index(): cord ordinal - 1 (p-number), NOT the position in the
            # summation order (validated: 7,785 handedness values)
            c.pidx = int(c.name[1:]) - 1 if c.name[1:].isdigit() else i
        for ci, cl in enumerate(clusters):
            for j, c in enumerate(cl):
                c.cl, c.cpos = ci, j        # cluster.position(), cord.position()
        self.in_cluster = [c for cl in clusters for c in cl]
        self.subs = [s for c in self.in_cluster for s in c.children if not s.skip]

    # their Cluster.is_top_cord_cluster(): all cords are top cords
    def is_top_cluster(self, ci):
        cl = self.clusters[ci]
        return len(cl) > 0 and all(c.top for c in cl)

    # their Cluster.is_pendant_cluster() INFERRED: not a top-cord cluster
    def is_pendant_cluster(self, ci):
        return not self.is_top_cluster(ci)


def prepare(k: dict) -> PK:
    """Build a PK from one of our public/data/khipus/KH*.json dicts."""
    by = {}
    l1 = []
    for c in k["cords"]:
        v = c.get("value")
        v = int(v) if v is not None else 0
        top = (c.get("attach") == "T") if c["level"] == 1 else False
        cd = Cord(c["name"], v, longest_ascher_color(c.get("color")), top, c["level"], c.get("parent"))
        by[c["name"]] = (cd, c)
    for name, (cd, c) in by.items():
        if cd.parent and cd.parent in by:
            by[cd.parent][0].children.append(cd)
    l1 = sorted((cd for cd, c in by.values() if cd.level == 1), key=lambda cd: by[cd.name][1]["ordinal"])
    ng = len(k.get("groups") or [])
    clusters = [[] for _ in range(ng)]
    for cd in l1:
        g = by[cd.name][1].get("group")
        if g is not None and g < ng:
            clusters[g].append(cd)
    clusters = [cl for cl in clusters if cl]
    # their aKhipu.pendant_cords() walks the clusters in order (validated on their
    # snapshot); cords outside any cluster go last
    inc = {id(c) for cl in clusters for c in cl}
    l1 = [c for cl in clusters for c in cl] + [c for c in l1 if id(c) not in inc]
    return PK(k["id"], l1, clusters)


def _pmean(xs):
    return round(mean(xs))  # Python banker's rounding, exactly as theirs


def calc_handedness(sum_cord: Cord, summands: list[Cord]) -> int:
    return -(sum_cord.pidx - _pmean([c.pidx for c in summands]))


def fix_handedness(left, right):
    nl, nr = [], []
    for (s, ss) in left:
        (nl if calc_handedness(s, ss) < 0 else nr).append((s, ss))
    for (s, ss) in right:
        (nr if calc_handedness(s, ss) >= 0 else nl).append((s, ss))
    return nl, nr


def _record(pk, rel, s, ss, extra=None):
    h = calc_handedness(s, ss)
    r = {"khipu": pk.id, "sum_cord": s.name, "value": s.v,
         "summands": [c.name for c in ss], "summand_values": [c.v for c in ss],
         "num_summands": len(ss), "handedness": h, "color": s.color}
    if extra:
        r.update(extra)
    return r


# ---------------------------------------------------------------------------
# off-by-one helpers (identical to theirs)
# ---------------------------------------------------------------------------

def off_by_one(n: int) -> list[int]:
    digits = list(f"{n}")
    out = []
    for i, ch in enumerate(digits):
        d = int(ch)
        for pd in range(max(0, d - 1), min(9, d + 1) + 1):
            out.append(int("".join(digits[:i]) + f"{pd}" + "".join(digits[i + 1:])))
    return out


# ---------------------------------------------------------------------------
# 1. Pendant-pendant sum  (PendantSummer)
# ---------------------------------------------------------------------------

def _search_sum_at(si, vals, partials, n):
    target = vals[si]
    for start in range(si + 1, n):
        if vals[start] > 0:
            hit = np.where(partials[start] == target)[0]
            if len(hit):
                end = hit[0] + start + 1
                return (start, end) if end - start >= 2 else None
    return None


def _pendant_summer(vals):
    n = len(vals)
    rv = np.array(vals, dtype=np.int64)
    lv = rv[::-1].copy()
    rp = [np.cumsum(rv[i:]) for i in range(n)]
    lp = [np.cumsum(lv[i:]) for i in range(n)]

    def filt(d):
        return {k: r for k, r in d.items() if rv[k] > (r[1] - r[0])}

    right = {}
    for si in range(n - 2):
        if rv[si] > 10:
            f = _search_sum_at(si, rv, rp, n)
            if f:
                right[si] = f
    right = dict(sorted(filt(right).items()))
    left = {}
    for si in range(n - 2):
        if lv[si] > 10:
            f = _search_sum_at(si, lv, lp, n)
            if f:
                rs, re_ = f
                left[(n - si) - 1] = (n - re_, n - rs)
    left = dict(sorted(filt(left).items()))
    return left, right


def pendant_pendant_sum(pk: PK) -> list[dict]:
    pc = pk.l1
    left, right = _pendant_summer([c.v for c in pc])
    lt = [(pc[k], pc[a:b]) for k, (a, b) in left.items()]
    rt = [(pc[k], pc[a:b]) for k, (a, b) in right.items()]
    lt, rt = fix_handedness(lt, rt)
    out = []
    for s, ss in lt + rt:
        r = _record(pk, "pps", s, ss)
        if r["handedness"] == 0:
            r["handedness"] = 1
        out.append(r)
    return out


# ---------------------------------------------------------------------------
# shared: contiguous-combination matcher (relations 2, 3, 5)
# ---------------------------------------------------------------------------

def _contiguous_matches(target, cords, min_len, max_len_excl, equal=None):
    """Yield (cords[i:i+L]) in their enumeration order: L ascending, i ascending."""
    if not cords:
        return []
    vals = np.array([c.v for c in cords], dtype=np.int64)
    pre = np.concatenate([[0], np.cumsum(vals)])
    out = []
    n = len(cords)
    for L in range(min_len, max_len_excl):
        if L > n:
            break
        sums = pre[L:] - pre[:-L]
        if equal is None:
            idx = np.nonzero(sums == target)[0]
        else:
            idx = [i for i, s in enumerate(sums.tolist()) if equal(target, s)]
        for i in idx:
            out.append(cords[i:i + L])
    return out


def _dedupe(matches, trivial):
    """Their remove_duplicates(): trivial match kills the sum cord for this side
    (and it stays killed); otherwise keep the first-seen shortest."""
    clean = {}
    order = []
    for (s, ss) in matches:
        if s not in clean:
            order.append(s)
        if trivial(s, ss):
            clean[s] = []
        elif s not in clean:
            clean[s] = ss
        elif len(ss) < len(clean[s]):
            clean[s] = ss
    return [(s, clean[s]) for s in order if len(clean[s]) > 0]


# ---------------------------------------------------------------------------
# 2. Pendant sums by colour
# ---------------------------------------------------------------------------

def _find_matches_ge3(s, test):
    test = [c for c in test if c.v > 0]
    maxp = min(len(test) + 1, 250)
    res = []
    for m in _contiguous_matches(s.v, test, 3, maxp):
        if s.v > 1 or len(m) > 1:
            res.append((s, m))
    return res


def pendant_pendants_color_sum(pk: PK) -> list[dict]:
    L, R = [], []
    for p in pk.l1:
        if p.v > 10:
            same = [c for c in pk.in_cluster if c.color == p.color]
            if p not in same:
                continue  # their try/except on .index()
            pos = same.index(p)
            lp, rp = same[:pos], same[pos + 1:]
            if lp:
                L += _find_matches_ge3(p, lp)
            if rp:
                R += _find_matches_ge3(p, rp)
    triv = lambda s, ss: s.v <= len(ss) or s.v <= 10 or len(ss) < 2
    L, R = _dedupe(L, triv), _dedupe(R, triv)
    L, R = fix_handedness(L, R)
    return [_record(pk, "ppc", s, ss) for s, ss in L + R]


# ---------------------------------------------------------------------------
# 3. Indexed pendant sum
# ---------------------------------------------------------------------------

def indexed_pendant_sum(pk: PK) -> list[dict]:
    L, R = [], []
    pend_cl = [ci for ci in range(len(pk.clusters)) if pk.is_pendant_cluster(ci)]
    for ci, cl in enumerate(pk.clusters):
        for c in [c for c in cl if c.v > 5]:
            idx = c.cpos
            lc = [pk.clusters[j][idx] for j in pend_cl if j < ci and len(pk.clusters[j]) > idx]
            rc = [pk.clusters[j][idx] for j in pend_cl if j > ci and len(pk.clusters[j]) > idx]
            for side, test in ((L, lc), (R, rc)):
                test = [t for t in test if t.v > 0]
                for m in _contiguous_matches(c.v, test, 2, len(test) + 1):
                    v = c.v
                    tens = v < 100 and v % 10 == 0
                    hund = 100 <= v < 1000 and v % 100 == 0
                    if v > 1 and not tens and not hund and len(m) > 1:
                        side.append((c, m))
    triv = lambda s, ss: s.v <= len(ss) or s.v < 5 or len(ss) < 2
    L, R = _dedupe(L, triv), _dedupe(R, triv)
    L, R = fix_handedness(L, R)
    return [_record(pk, "ips", s, ss, {"summand_clusters": [t.cl for t in ss]}) for s, ss in L + R]


# ---------------------------------------------------------------------------
# 4. Pendant-subsidiary difference (neighbour)
# ---------------------------------------------------------------------------

def pendant_sub_neighbor(pk: PK, min_cluster_subs: int = 2) -> list[dict]:
    """Their Cluster.pendant_subsidiary_neighbor_relations(), run per cluster:
    neighbours are the adjacent cords *within the cluster*; subsidiary_sum = sum of
    direct children."""
    out = []
    for cl in pk.clusters:
        if min_cluster_subs and sum(len(c.children) for c in cl) < min_cluster_subs:
            continue
        n = len(cl)
        for i, p in enumerate(cl):
            if not (len(p.children) > 0 and p.v > 0):
                continue
            ss = sum(c.v for c in p.children)
            lc = cl[i - 1] if i > 0 else None
            rc = cl[i + 1] if i < n - 1 else None
            vp = p.v != 0 and ss != 0
            vl = vp and lc is not None and lc.v != 0
            vr = vp and rc is not None and rc.v != 0
            if vl and lc.v == abs(p.v - ss):
                m = (lc, -ss)
            elif vr and rc.v == abs(p.v - ss):
                m = (rc, -ss)
            elif vl and lc.v == p.v + ss:
                m = (lc, ss)
            elif vr and rc.v == p.v + ss:
                m = (rc, ss)
            else:
                continue
            nb, sub_sum = m
            h = -(p.pidx - nb.pidx)
            out.append({"khipu": pk.id, "sum_cord": p.name, "neighbor": nb.name, "value": p.v,
                        "sub_sum": sub_sum, "neighbor_value": nb.v, "handedness": h if h else 1,
                        "summands": [nb.name]})
    return out


# ---------------------------------------------------------------------------
# 5. Subsidiary-pendant sum
# ---------------------------------------------------------------------------

def subsidiary_pendant_sum(pk: PK) -> list[dict]:
    L, R = [], []
    pcs = pk.in_cluster
    for s in pk.subs:
        if s.v > 10:
            parent = next(c for c in pcs if c.name == s.parent)
            pos = pcs.index(parent)
            lp, rp = pcs[:pos + 1], pcs[pos + 1:]
            if lp:
                L += _find_matches_ge3(s, lp)
            if rp:
                R += _find_matches_ge3(s, rp)
    triv = lambda s, ss: s.v <= len(ss) or s.v <= 10 or (s.v < 100 and s.v % 10 == 0) or len(ss) < 2
    L, R = _dedupe(L, triv), _dedupe(R, triv)
    # subsidiary pendant_index() = parent pendant's index (validated)
    par = {c.name: c for c in pcs}
    for s in pk.subs:
        s.pidx = par[s.parent].pidx
    L, R = fix_handedness(L, R)
    return [_record(pk, "sps", s, ss, {"parent": s.parent}) for s, ss in L + R]


# ---------------------------------------------------------------------------
# 6. Decreasing cluster cord values (is_roughly_linearly_decreasing, tolerance 0.4)
# ---------------------------------------------------------------------------

def _best_fit(xs, ys):
    xy = [x * y for x, y in zip(xs, ys)]
    norm = (mean(xs) ** 2 - mean([x ** 2 for x in xs]))
    m = ((mean(xs) * mean(ys)) - mean(xy)) / norm if norm != 0.0 else 0.0
    return m, mean(ys) - m * mean(xs)


def _r2(ys, pred):
    se = sum((p - o) ** 2 for p, o in zip(pred, ys))
    my = mean(ys)
    sm = sum((my - o) ** 2 for o in ys)
    return 1 - se / sm if sm > 0.0 else 0.0


def ascher_decreasing_cluster(pk: PK, tolerance: float = 0.4, variant: str = "delta") -> list[dict]:
    """APPROXIMATE port.  variant 'linear' = their is_roughly_linearly_decreasing as
    printed (recovers 140/142 of their instances but adds ~87 more); 'delta' also needs
    max-min >= 5 (the tolerated_delta of their is_roughly_decreasing): 128/142, +18."""
    import math
    out = []
    for ci, cl in enumerate(pk.clusters):
        if not (len(cl) >= 3 and any(c.v > 0 for c in cl)):
            continue
        ys = [c.v for c in cl]
        xs = list(range(1, len(cl) + 1))
        m, b = _best_fit(xs, ys)
        r2 = _r2(ys, [m * x + b for x in xs])
        theta = math.atan(m) / math.pi * 180
        ok = r2 > 1.0 - tolerance and -87.0 < theta < -5.0
        if variant == "delta":
            ok = ok and (max(ys) - min(ys) >= 5)
        if ok:
            out.append({"khipu": pk.id, "cluster": ci, "sum_cord": f"cluster{ci}", "value": sum(ys),
                        "summands": [c.name for c in cl], "slope_deg": theta, "r2": r2, "num_cords": len(cl)})
    return out


# ---------------------------------------------------------------------------
# 7. Cluster sum bands
# ---------------------------------------------------------------------------

def cluster_sum_bands(pk: PK) -> list[dict]:
    out = []
    for ci, cl in enumerate(pk.clusters):
        vals = [c.v for c in cl]
        split = -1
        if sum(vals) >= 5 and len(set(vals)) > 1:
            for i in range(1, len(vals)):
                if sum(vals[:i]) == sum(vals[i:]):
                    split = i
        if split > 0 and split > 1 and split < len(cl) - 1 and len(set(vals)) != 1:
            out.append({"khipu": pk.id, "cluster": ci, "split": split, "num_cords": len(cl),
                        "split_sum": sum(vals[:split]), "value": sum(vals),
                        "sum_cord": f"cluster{ci}", "summands": [c.name for c in cl]})
    return out


# ---------------------------------------------------------------------------
# 9. Sum top cords and double-sum top cords (cluster level)
# ---------------------------------------------------------------------------

def _csum(cl):
    return sum(c.v for c in cl)


def _sums_match(a, b):
    ls, rs = _csum(a), _csum(b)
    if ls > 0:
        if ls == rs:
            return True, True
        if ls in off_by_one(rs) or rs in off_by_one(ls):
            return True, False
    return False, False


def _half_match(a, b):
    ls, rs = _csum(a), _csum(b)
    if ls > 0:
        if ls == round(rs / 2.0) or round(ls / 2.0) == rs:
            return True, True
        if round(ls / 2.0) in off_by_one(rs) or round(rs / 2.0) in off_by_one(ls):
            return True, False
    return False, False


def _tag(pk, matcher):
    tags = {}  # cluster idx -> (summand cluster idx, exact)   last write wins (INFERRED)
    C = pk.clusters
    if len(C) >= 2:
        for i in range(len(C) - 1):
            ok, exact = matcher(C[i], C[i + 1])
            if ok:
                if len(C[i]) == 1:
                    tags[i] = (i + 1, exact)
                elif len(C[i + 1]) == 1:
                    tags[i + 1] = (i, exact)
    out = []
    for ci, (sj, exact) in sorted(tags.items()):
        cl = C[ci]
        if pk.is_top_cluster(ci) and mean([c.v for c in cl]) > 0.0:
            out.append({"khipu": pk.id, "cluster": ci, "summand_cluster": sj,
                        "sum_cord": cl[0].name, "value": _csum(cl),
                        "summands": [c.name for c in C[sj]], "summand_value": _csum(C[sj]),
                        "num_summands": len(C[sj]), "exact": exact,
                        "handedness": 1 if sj > ci else -1})
    return out


def sum_top_cords(pk: PK) -> list[dict]:
    return _tag(pk, _sums_match)


def double_sum_top_cords(pk: PK) -> list[dict]:
    return _tag(pk, _half_match)


RELATIONS = {
    "pendant_pendant_sum": pendant_pendant_sum,
    "pendant_pendants_color_sum": pendant_pendants_color_sum,
    "indexed_pendant_sum": indexed_pendant_sum,
    "pendant_sub_neighbor": pendant_sub_neighbor,
    "subsidiary_pendant_sum": subsidiary_pendant_sum,
    "ascher_decreasing_cluster": ascher_decreasing_cluster,
    "cluster_sum_bands": cluster_sum_bands,
    "sum_top_cords": sum_top_cords,
    "double_sum_top_cords": double_sum_top_cords,
}


def run_all(pk: PK, relations=None) -> dict[str, list[dict]]:
    return {r: RELATIONS[r](pk) for r in (relations or RELATIONS)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--only", nargs="*", help="khipu ids")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res = {r: [] for r in RELATIONS}
    files = sorted(DATA.glob("KH*.json"))
    for f in files:
        k = json.loads(f.read_text())
        if a.only and k["id"] not in a.only:
            continue
        pk = prepare(k)
        for r, rows in run_all(pk).items():
            res[r] += rows
    for r, rows in res.items():
        (out / f"{r}.json").write_text(json.dumps(rows))
        print(f"{r:30s} {len(rows):6d} instances on {len({x['khipu'] for x in rows}):4d} khipus")


if __name__ == "__main__":
    main()

"""mk_sig_common: faithful numpy ports of Medrano & Khosla (2024) Ascher relations
1, 2, 3, 4, 5, 7, 9 (from their source/02_ascher_sum_relationships notebook), run on
our public/data/khipus JSON, plus the three structure-preserving nulls.

A khipu is reduced to a flat model:
  P   : list of pendants in ordinal order; each pendant = dict(v, col, subs=[(v,col)], g)
  groups: list of lists of pendant indices (pendant clusters, primary-cord order)
  tops : list of (group_position, [top values]) for top-cord-only clusters
  gorder: list of ("P", gi) / ("T", ti) giving primary-cord order of clusters

Nulls (all keep the number of groups and every group's size):
  a  : permute whole pendant cords (value+colour+subsidiaries) across all pendant slots
  b  : permute the order of groups, keep order inside each group
  c  : permute order inside each group, keep groups in place
"""
from __future__ import annotations
import json, collections
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
S = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/573e055a-1d0e-4a10-b794-c747179bc194/scratchpad")
OUT = S / "out"
OUT.mkdir(parents=True, exist_ok=True)
MK = S / "mk" / "khipufieldguide-data-science-khipu-article-a89c5dc"

REC = {"Gary Urton": "UR", "Marcia & Robert Ascher": "AS", "Carrie Brezine": "CB",
       "Hugo Pereyra": "HP", "Jon Clindaniel": "JC", "Kylie Quave": "KQ", "Manuel Medrano": "MM"}


def val(c):
    v = c.get("value")
    return int(v) if v is not None else 0


def longest_colour(c):
    segs = c.get("colorParsed") or []
    if not segs:
        return (c.get("color") or "").split("(")[0]
    best, bl = segs[0], -1.0
    for s in segs:
        r = s.get("range")
        L = (r[1] - r[0]) if r else 0.0
        if L > bl:
            best, bl = s, L
    codes, ops = best.get("codes", []), best.get("ops", [])
    out = codes[0] if codes else ""
    for i, cc in enumerate(codes[1:]):
        out += (ops[i] if i < len(ops) else ":") + cc
    return out


def recorder(k):
    c = (k.get("contributors") or "").split(",")[0].strip()
    return REC.get(c, REC.get(k.get("contributors"), "other"))


def model(k):
    cs = k["cords"]
    kids = collections.defaultdict(list)
    for c in cs:
        if c.get("parent"):
            kids[c["parent"]].append(c)
    l1 = sorted((c for c in cs if c["level"] == 1), key=lambda c: c["ordinal"])
    # clusters in primary-cord order by group index
    bygroup = collections.OrderedDict()
    for c in l1:
        bygroup.setdefault(c.get("group", 0), []).append(c)
    P, groups, tops, gorder = [], [], [], []
    for g in sorted(bygroup):
        cc = bygroup[g]
        pend = [c for c in cc if c.get("kind") != "top"]
        if pend:
            idx = []
            for c in pend:
                idx.append(len(P))
                P.append(dict(v=val(c), col=longest_colour(c), name=c["name"],
                              subs=[(val(s), longest_colour(s)) for s in kids.get(c["name"], []) if s.get("kind") != "marker"]))
            gorder.append(("P", len(groups)))
            groups.append(idx)
        else:
            gorder.append(("T", len(tops)))
            tops.append([val(c) for c in cc])
    return dict(id=k["id"], P=P, groups=groups, tops=tops, gorder=gorder)


def load_models():
    ks = [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]
    out = []
    for k in ks:
        m = model(k)
        m["rec"] = recorder(k)
        m["prov"] = k.get("provenance") or ""
        m["aliases"] = k.get("aliases") or []
        out.append(m)
    return out


# ---------------------------------------------------------------- nulls
def realise(m, perm_slots=None, group_perm=None, within=None):
    """Return a new model with pendants re-arranged.
    perm_slots: permutation of pendant objects over slots (null a)
    group_perm: new order of pendant groups (null b) - tops keep their slots
    within:     list of per-group permutations (null c)"""
    P, groups = m["P"], m["groups"]
    if perm_slots is not None:
        P = [P[i] for i in perm_slots]
    if within is not None:
        P2 = list(P)
        for gi, g in enumerate(groups):
            for j, src in enumerate(within[gi]):
                P2[g[j]] = P[g[src]]
        P = P2
    if group_perm is not None:
        newP, newG = [], []
        for gi in group_perm:
            idx = []
            for i in groups[gi]:
                idx.append(len(newP)); newP.append(P[i])
            newG.append(idx)
        P, groups = newP, newG
    return dict(id=m["id"], P=P, groups=groups, tops=m["tops"], gorder=m["gorder"])


def draw_null(m, kind, rng):
    n = len(m["P"])
    if kind == "a":
        return realise(m, perm_slots=rng.permutation(n))
    if kind == "b":
        return realise(m, group_perm=rng.permutation(len(m["groups"])))
    if kind == "c":
        return realise(m, within=[rng.permutation(len(g)) for g in m["groups"]])
    raise ValueError(kind)


# ---------------------------------------------------------------- relation 1
def _pp_one_side(v):
    """PendantSummer.search_right_sums on array v. returns dict sum_idx -> (start,end)."""
    n = len(v)
    Pf = np.concatenate([[0], np.cumsum(v)])
    res = {}
    nz = np.nonzero(v > 0)[0]
    for i in range(n - 2):
        t = v[i]
        if t <= 10:
            continue
        starts = nz[nz > i]
        if len(starts) == 0:
            continue
        targ = Pf[starts] + t
        e = np.searchsorted(Pf, targ, side="left")
        ok = (e <= n)
        e2 = np.minimum(e, n)
        hit = ok & (Pf[e2] == targ)
        if not hit.any():
            continue
        j = np.argmax(hit)
        s, end = starts[j], e2[j]
        if end - s >= 2 and t > (end - s):
            res[i] = (int(s), int(end))
    return res


def rel1(mm):
    """pendant-pendant sums. returns list of (sum_idx, summand_idx_list, right_handed)"""
    v = np.array([p["v"] for p in mm["P"]], dtype=np.int64)
    n = len(v)
    out = []
    if n < 3:
        return out
    for i, (s, e) in _pp_one_side(v).items():
        out.append((i, list(range(s, e)), True))
    vr = v[::-1].copy()
    for ri, (rs, re_) in _pp_one_side(vr).items():
        i = n - ri - 1
        s, e = n - re_, n - rs
        out.append((i, list(range(s, e)), False))
    return out


# ---------------------------------------------------------------- contiguous-combo helper
def _shortest_combo(vals, idxs, target, minlen, maxlen, kill_if_len_ge=None, valid=None):
    """vals: positive ints in order. find all contiguous runs (a..b) with sum==target,
    minlen<=len<=maxlen. Return shortest run's idxs or None. If any matching run has
    len >= kill_if_len_ge (their is_trivial rule) return None."""
    m = len(vals)
    if m < minlen:
        return None
    Q = np.concatenate([[0], np.cumsum(vals)])
    targ = Q[:-1] + target
    e = np.searchsorted(Q, targ, side="left")
    e2 = np.minimum(e, m)
    hit = (e <= m) & (Q[e2] == targ)
    L = e2 - np.arange(m)
    hit &= (L >= minlen) & (L <= maxlen)
    if not hit.any():
        return None
    a = np.nonzero(hit)[0]
    Ls = L[a]
    if kill_if_len_ge is not None and (Ls >= kill_if_len_ge).any():
        return None
    j = a[np.argmin(Ls)]
    return [idxs[t] for t in range(j, j + L[j])]


# ---------------------------------------------------------------- relation 2
def rel2(mm):
    P = mm["P"]
    bycol = collections.defaultdict(list)
    for i, p in enumerate(P):
        bycol[p["col"]].append(i)
    out = []
    for i, p in enumerate(P):
        t = p["v"]
        if t <= 10:
            continue
        same = bycol[p["col"]]
        pos = same.index(i)
        for side, lst in (("L", same[:pos]), ("R", same[pos + 1:])):
            lst = [j for j in lst if P[j]["v"] > 0]
            if len(lst) < 3:
                continue
            vals = np.array([P[j]["v"] for j in lst], dtype=np.int64)
            r = _shortest_combo(vals, lst, t, 3, 249, kill_if_len_ge=t)
            if r:
                h = round(np.mean(r)) - i
                out.append((i, r, h >= 0))
    return out


# ---------------------------------------------------------------- relation 3
def _rel3_valid(t):
    if t <= 1:
        return False
    if t < 100 and t % 10 == 0:
        return False
    if 100 <= t < 1000 and t % 100 == 0:
        return False
    return True


def rel3(mm):
    P, G = mm["P"], mm["groups"]
    out = []
    for gi, g in enumerate(G):
        for ci, i in enumerate(g):
            t = P[i]["v"]
            if t <= 5 or not _rel3_valid(t):
                continue
            left = [G[x][ci] for x in range(gi) if len(G[x]) > ci]
            right = [G[x][ci] for x in range(gi + 1, len(G)) if len(G[x]) > ci]
            for lst in (left, right):
                lst = [j for j in lst if P[j]["v"] > 0]
                if len(lst) < 2:
                    continue
                vals = np.array([P[j]["v"] for j in lst], dtype=np.int64)
                r = _shortest_combo(vals, lst, t, 2, 10 ** 9, kill_if_len_ge=t)
                if r:
                    h = round(np.mean(r)) - i
                    out.append((i, r, h >= 0))
    return out


# ---------------------------------------------------------------- relation 4
def rel4(mm):
    """pendant-subsidiary difference. returns (i, neighbour, right?, |p-s|, kind)"""
    P, G = mm["P"], mm["groups"]
    out = []
    for g in G:
        for k, i in enumerate(g):
            p = P[i]
            if not p["subs"] or p["v"] <= 0:
                continue
            s = sum(x[0] for x in p["subs"])
            if s == 0:
                continue
            L = g[k - 1] if k > 0 else None
            R = g[k + 1] if k < len(g) - 1 else None
            lv = P[L]["v"] if L is not None else 0
            rv = P[R]["v"] if R is not None else 0
            d = abs(p["v"] - s)
            a = p["v"] + s
            if L is not None and lv and lv == d:
                out.append((i, L, False, d, "minus"))
            elif R is not None and rv and rv == d:
                out.append((i, R, True, d, "minus"))
            elif L is not None and lv and lv == a:
                out.append((i, L, False, a, "plus"))
            elif R is not None and rv and rv == a:
                out.append((i, R, True, a, "plus"))
    return out


# ---------------------------------------------------------------- relation 5
def rel5(mm):
    P = mm["P"]
    out = []
    pv = np.array([p["v"] for p in P], dtype=np.int64)
    for i, p in enumerate(P):
        for (sv, sc) in p["subs"]:
            if sv <= 10 or (sv < 100 and sv % 10 == 0):
                continue
            for side, rng_ in (("L", range(0, i + 1)), ("R", range(i + 1, len(P)))):
                lst = [j for j in rng_ if pv[j] > 0]
                if len(lst) < 3:
                    continue
                r = _shortest_combo(pv[lst], lst, sv, 3, 249, kill_if_len_ge=sv)
                if r:
                    h = round(np.mean(r)) - i
                    out.append((i, r, h >= 0))
    return out


# ---------------------------------------------------------------- relation 7
def rel7(mm):
    P, G = mm["P"], mm["groups"]
    out = []
    for gi, g in enumerate(G):
        vals = [P[i]["v"] for i in g]
        n = len(vals)
        if sum(vals) < 5 or len(set(vals)) <= 1:
            continue
        pos = -1
        c = np.cumsum(vals)
        tot = c[-1]
        for i in range(1, n):
            if 2 * c[i - 1] == tot:
                pos = i
        if pos > 1 and pos < n - 1:
            out.append((gi, pos))
    return out


# ---------------------------------------------------------------- relation 9
def _near(d):
    return range(max(0, d - 1), min(9, d + 1) + 1)


def off_by_one(n):
    s = str(n)
    r = set()
    for i, ch in enumerate(s):
        for d in _near(int(ch)):
            r.add(int(s[:i] + str(d) + s[i + 1:]))
    return r


def rel9(mm):
    """top cord sums / double sums over adjacent clusters (clusters in primary order)."""
    P, G = mm["P"], mm["groups"]
    clusters = []  # (is_top, ncords, sum)
    pg = iter(range(len(G)))
    for kind, idx in mm["gorder"]:
        if kind == "P":
            g = G[next(pg)]
            clusters.append((False, len(g), sum(P[i]["v"] for i in g)))
        else:
            t = mm["tops"][idx]
            clusters.append((True, len(t), sum(t)))
    out = []
    for i in range(len(clusters) - 1):
        A, B = clusters[i], clusters[i + 1]
        ls, rs = A[2], B[2]
        if ls <= 0:
            continue
        m1 = ls == rs or ls in off_by_one(rs) or rs in off_by_one(ls)
        m2 = (ls == round(rs / 2.0) or round(ls / 2.0) == rs or
              round(ls / 2.0) in off_by_one(rs) or round(rs / 2.0) in off_by_one(ls))
        tag = i if A[1] == 1 else (i + 1 if B[1] == 1 else None)
        if tag is None:
            continue
        T = clusters[tag]
        if T[0] and T[2] > 0:
            if m1:
                out.append((tag, "sum"))
            elif m2:
                out.append((tag, "double"))
    return out


RELS = {1: rel1, 2: rel2, 3: rel3, 4: rel4, 5: rel5, 7: rel7, 9: rel9}

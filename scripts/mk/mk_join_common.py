"""Cross-break pendant-pendant sum engine (Medrano & Khosla 2024 splice test).

Reimplements KFG's PendantSummer (source/02_ascher_sum_relationships, 2.1):
  * sum cord value > 10, summands contiguous pendants, >= 2 summands,
    sum value > number of summands (zeros inside the run count),
  * greedy: scanning starts s = i+1, i+2, ... (skipping zero starts) the FIRST
    start whose running total hits the target decides; if that run has length 1
    the cord gets no sum in that direction;
  * right search on the list, left search = right search on the reversed list;
    the last two cords of the list are never sum cords.
Crossing (their num_crossed_relations): a sum whose sum cord and summands are not
all on the same fragment.

Fast crossing count for a splice L+R:
  crossings(L+R) = rightcross(L, R) + rightcross(rev R, rev L)
since only a right search from an L cord or a left search from an R cord can span
the break.
"""
from __future__ import annotations
import json, re, collections
from functools import lru_cache
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/"
           "573e055a-1d0e-4a10-b794-c747179bc194/scratchpad/out")
OUT.mkdir(parents=True, exist_ok=True)


def load_all():
    ks = {}
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        ks[k["id"]] = k
    return ks


def pendants(k, include_top=False):
    cs = [c for c in k["cords"] if c["level"] == 1 and (include_top or c.get("kind") != "top")]
    cs.sort(key=lambda c: c["ordinal"])
    return cs


def vals(k, include_top=False):
    return [int(c.get("value") or 0) for c in pendants(k, include_top)]


# ---------------------------------------------------------------- full search
def _first_match(v, P, i, target, lo, hi):
    """right search for sum cord i restricted to starts in [lo,hi) over whole list.
    Returns (s,e) (e exclusive) of the first start with a hit, or None if none."""
    n = len(v)
    for s in range(lo, hi):
        if v[s] <= 0:
            continue
        x = P[s] + target
        e = int(np.searchsorted(P, x, side="left"))
        if e < len(P) and P[e] == x:
            return s, e
    return None


def right_sums(v):
    """dict sum_index -> (s,e) exactly as PendantSummer.search_right_sums+filter."""
    v = np.asarray(v, dtype=np.int64)
    n = len(v)
    P = np.concatenate([[0], np.cumsum(v)])
    out = {}
    for i in range(n - 2):
        t = int(v[i])
        if t <= 10:
            continue
        m = _first_match(v, P, i, t, i + 1, n)
        if m is None:
            continue
        s, e = m
        if e - s < 2:
            continue
        if t > e - s:
            out[i] = (s, e)
    return out


def all_sums(v):
    """list of (sum_idx, s, e) in original indexing, right + left."""
    n = len(v)
    res = [(i, s, e) for i, (s, e) in right_sums(v).items()]
    for ri, (rs, re_) in right_sums(v[::-1]).items():
        i = n - 1 - ri
        res.append((i, n - re_, n - rs))
    return res


def crossings_full(v, cut):
    """count sums whose cords straddle position cut (L = [0,cut))."""
    c = 0
    for i, s, e in all_sums(v):
        idx = [i, s, e - 1]
        sides = {x < cut for x in idx} | ({True, False} if s < cut <= e - 1 else set())
        if len(sides) > 1:
            c += 1
    return c


# ---------------------------------------------------------------- fast splice
class Piece:
    """A fragment used as the LEFT piece of a splice (its right searches)."""

    def __init__(self, v):
        self.v = np.asarray(v, dtype=np.int64)
        n = len(self.v)
        self.n = n
        self.P = np.concatenate([[0], np.cumsum(self.v)])
        self.total = int(self.P[-1])
        # per candidate sum cord: (i, t, sstar, estar) where sstar = first start
        # inside the piece with a hit that ends inside the piece (None if none)
        self.cands = []
        for i in range(n):
            t = int(self.v[i])
            if t <= 10:
                continue
            m = _first_match(self.v, self.P, i, t, i + 1, n)
            self.cands.append((i, t, m))
        # prefix-sum -> first exclusive end index (for extending into this piece)
        self.first_end = {}
        for e in range(1, n + 1):
            x = int(self.P[e])
            if x not in self.first_end:
                self.first_end[x] = e
        self._bcache = {}

    def first_start_hit(self, t):
        """As the RIGHT piece: first start s (from 0) whose run hits t, (s,e) or None."""
        if t in self._bcache:
            return self._bcache[t]
        m = _first_match(self.v, self.P, -1, t, 0, self.n)
        self._bcache[t] = m
        return m


def rightcross(L: Piece, R: Piece):
    """right-search sums from L cords whose summands reach into R, as (depthL, depthR)."""
    nL, N = L.n, L.n + R.n
    out = []
    PL = L.P
    for i, t, m in L.cands:
        if i >= N - 2:
            continue
        sstar = m[0] if m is not None else nL
        # starts in [i+1, sstar) had no hit inside L; they may hit by running into R
        # only if suffix(L,s) < t  (suffix decreasing in s)
        hit = None
        for s in range(i + 1, sstar):
            if L.v[s] <= 0:
                continue
            suf = L.total - int(PL[s])
            if suf >= t:
                continue  # run stays inside L and missed
            need = t - suf
            e = R.first_end.get(need)
            if e is not None:
                hit = (s, nL + e)
                break
        if hit is None:
            if m is not None:
                continue  # original in-L match stands (not a crossing)
            r = R.first_start_hit(t)
            if r is None:
                continue
            hit = (nL + r[0], nL + r[1])
        s, e = hit
        if e - s < 2 or not (t > e - s):
            continue
        out.append((nL - i, e - nL))   # depth of sum cord in L, depth of last summand in R
    return out


class Frag:
    def __init__(self, v, name=""):
        self.name = name
        self.v = list(v)
        self.fw = Piece(self.v)
        self.rv = Piece(self.v[::-1])


def splice_cross(A: Frag, B: Frag, a_rev=False, b_rev=False):
    """crossings for (A or rev A) followed by (B or rev B)."""
    La = A.rv if a_rev else A.fw
    Lb = B.rv if b_rev else B.fw
    # left search from B cords = right search on reversed sequence: rev(Lb) + rev(La)
    Ra = A.fw if a_rev else A.rv
    Rb = B.fw if b_rev else B.rv
    return rightcross(La, Lb) + [(b, a) for a, b in rightcross(Rb, Ra)]


LOCAL = 30  # "local" crossing: sum cord and all summands within LOCAL cords of the break


def stat(hits, kind):
    if kind == "all":
        return len(hits)
    return sum(1 for a, b in hits if a <= LOCAL and b <= LOCAL)


CONFIGS = [("A+B", 0, 0, 0), ("B+A", 1, 0, 0), ("A+rB", 0, 0, 1), ("rB+A", 1, 0, 1)]


def config_counts(A: Frag, B: Frag, kind="all"):
    return {k: stat(h, kind) for k, h in config_hits(A, B).items()}


def config_hits(A: Frag, B: Frag):
    out = {}
    out["A+B"] = splice_cross(A, B)
    out["B+A"] = splice_cross(B, A)
    out["A+rB"] = splice_cross(A, B, b_rev=True)
    out["rB+A"] = splice_cross(B, A, a_rev=True)
    return out


# ---------------------------------------------------------------- null pool
def magnitude(v):
    nz = [x for x in v if x > 0]
    if not nz:
        return None
    return dict(n=len(v), lmed=float(np.log10(np.median(nz))),
                nzf=len(nz) / len(v), f10=sum(x > 10 for x in v) / len(v))


def matched_pool(target_v, pool, exclude, k_min=40):
    """pool: dict id -> values. Partners: real khipus with >= 0.5*len pendants
    (truncated to len(target), both orientations), matched on magnitude
    (log10 median nonzero value, share of cords > 10, share nonzero). Magnitude
    tolerance widens until >= k_min/2 khipus qualify; the tolerance is reported."""
    m = magnitude(target_v)
    n = len(target_v)
    if m is None:
        return [], None
    for tol in (0.15, 0.25, 0.35, 0.5, 0.75, 1.0, 9):
        ids = []
        for kid, v in pool.items():
            if kid in exclude or len(v) < 0.5 * n or len(v) < 3:
                continue
            mm = magnitude(v[:n])
            if mm is None:
                continue
            if abs(mm["lmed"] - m["lmed"]) <= tol and abs(mm["f10"] - m["f10"]) <= tol / 1.5 \
                    and abs(mm["nzf"] - m["nzf"]) <= tol / 1.5:
                ids.append(kid)
        if len(ids) >= k_min // 2:
            break
    wins = []
    for kid in ids:
        v = pool[kid]
        wins.append((kid, "fw", v[:n]))
        wins.append((kid, "rv", v[::-1][:n]))
    return wins, tol


def group_shuffles(v, g, n, rng):
    """permute whole groups (within-group order kept)."""
    blocks = collections.OrderedDict()
    for x, gi in zip(v, g):
        blocks.setdefault(gi, []).append(x)
    bl = list(blocks.values())
    out = []
    for _ in range(n):
        idx = rng.permutation(len(bl))
        out.append([x for j in idx for x in bl[j]])
    return out


def _summ(null, T):
    null = np.array(null, float)
    mu = null.mean(); sd = null.std(ddof=1) if len(null) > 1 else 0.0
    return dict(n=len(null), mean=round(float(mu), 2), sd=round(float(sd), 2),
                z=round(float((T - mu) / sd), 2) if sd > 0 else None,
                p=(1 + int((null >= T).sum())) / (1 + len(null)),
                q95=float(np.percentile(null, 95)), max=float(null.max()))


def calibrated(A, B, pool, exclude, frag_cache, gA=None, gB=None, n_shuf=100, seed=0,
               partner=True, kinds=("all", "local")):
    """T = max crossing count over the 4 configurations, for each statistic kind
    ('all' = paper's count; 'local' = sum cord and summands within LOCAL cords of
    the break). Nulls (each also maxed over the 4 configurations): partner null
    (replace B / replace A by magnitude-matched real khipus) and group-shuffle
    null (permute B's / A's groups, within-group order kept)."""
    oh = config_hits(A, B)
    res = dict(nA=len(A.v), nB=len(B.v))
    nulls = {k: {} for k in kinds}
    def add(side, hits_list, extra=None):
        for k in kinds:
            nulls[k].setdefault(side, [[], extra])[0].extend(
                max(stat(h, k) for h in hl.values()) for hl in hits_list)
    if partner:
        for side, keep, repl in (("replB", A, B), ("replA", B, A)):
            wins, tol = matched_pool(repl.v, pool, exclude)
            hl = []
            for kid, o, w in wins:
                key = (kid, o, len(w))
                X = frag_cache.get(key)
                if X is None:
                    X = frag_cache[key] = Frag(w, kid)
                hl.append(config_hits(keep, X) if side == "replB" else config_hits(X, keep))
            if hl:
                add(side, hl, tol)
    rng = np.random.default_rng(seed)
    for side, keep, repl, g in (("shufB", A, B, gB), ("shufA", B, A, gA)):
        if g is None or len(set(g)) < 3:
            continue
        hl = []
        for w in group_shuffles(repl.v, g, n_shuf, rng):
            X = Frag(w)
            hl.append(config_hits(keep, X) if side == "shufB" else config_hits(X, keep))
        add(side, hl)
    for k in kinds:
        obs = {c: stat(h, k) for c, h in oh.items()}
        T = max(obs.values())
        r = dict(obs=obs, T=T)
        ps = []
        for side, (null, extra) in nulls[k].items():
            r[side] = _summ(null, T)
            if extra is not None:
                r[side]["tol"] = extra
            ps.append(r[side]["p"])
        r["p"] = max(ps) if ps else None
        res[k] = r
    return res

#!/usr/bin/env python3
"""Tolerant (Smith-Waterman) alignment of level-1 value sequences across the whole corpus.

Exact n-gram scans miss copies with field errors.  This aligns EVERY pair of khipus (fwd and
reversed) with a local alignment whose substitution score is information-weighted:

  exact match v=v      : IC(v) - OFF          (IC = -log2 corpus frequency of v among level-1 values)
  slip (a != b)        : SLIPW*mean(IC) - OFF, floored at MIS
                         slips = one digit differs by 1 (covers +-1, +-10, +-100), |a-b|==1,
                         a == 10b (register shift), digit transposition, one digit dropped
  0 vs 0               : 0      (blank cords align freely)
  0 vs v               : ZMIS   (blank / missing cord)
  otherwise            : MIS
  affine gaps          : open GO, extend GE (inserted blank cords, dropped groups)

The C kernel (align_sw.c) is compiled on the fly into the scratchpad.  Nulls:
  * shuffle null  : K copies of every khipu with values permuted WITHIN groups; each pair (A,B)
                    is re-aligned as (A, shuffle_k(B)) -> per-pair mean/sd -> z.  One extra shuffle
                    (held out) gives the corpus-wide distribution of z under the null, so the
                    threshold is set by an empirical false-discovery count, not a guess.
  * matched null  : for the top pairs, A is aligned against 1000 fresh within-group shuffles of B
                    (empirical p) and against all other khipus of length within +-30% of B
                    (matched random pairs, excluding known links) -> rank p.
Group-total sequences (sum of level-1 values per group) are aligned (a) against other khipus'
level-1 sequences (aggregating copy) and (b) against other khipus' group totals; null = permute
the group-total order / within-group shuffle of the L1 side.

    python3 scripts/deep/align_scan.py            (~3-6 min on 8 cores)
"""
from __future__ import annotations

import ctypes
import json
import math
import os
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path(os.environ.get("ALIGN_OUT", "/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/"
                          "b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/align"))
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20260922

WARI = {"KH0280", "KH0281", "KH0282", "KH0288", "KH0289", "KH0271", "KH0346", "KH0348", "KH0384"}
UNREADABLE = {"KH0015", "KH0047", "KH0048", "KH0094", "KH0100", "KH0108", "KH0584"}
EXCL = WARI | UNREADABLE

OFF, MINM, SLIPW, MIS, ZMIS, GO, GE, ICCAP = 3.0, 0.1, 0.5, -3.0, -1.5, 4.0, 1.0, 13.0
K_SHUF = 20

KNOWN = [("KH0192", "KH0470"), ("KH0192", "KH0469"), ("KH0469", "KH0470"), ("KH0097", "KH0586"),
         ("KH0121", "KH0133"), ("KH0121", "KH0473"), ("KH0133", "KH0473"), ("KH0128", "KH0137"),
         ("KH0175", "KH0190"), ("KH0130", "KH0166"), ("KH0140", "KH0483"), ("KH0303", "KH0304"),
         ("KH0301", "KH0305"), ("KH0503", "KH0491"), ("KH0504", "KH0492"), ("KH0514", "KH0502"),
         ("KH0498", "KH0507"), ("KH0049", "KH0362"), ("KH0377", "KH0590"), ("KH0358", "KH0602"),
         ("KH0450", "KH0147"), ("KH0028", "KH0027"), ("KH0118", "KH0471"), ("KH0132", "KH0456"),
         ("KH0143", "KH0591"), ("KH0156", "KH0432"), ("KH0511", "KH0513"), ("KH0404", "KH0426"),
         ("KH0114", "KH0115"), ("KH0138", "KH0139")]
BASEL = [f"KH0{n}" for n in range(682, 692)]


def known_set() -> set[tuple[str, str]]:
    s = {tuple(sorted(p)) for p in KNOWN}
    for f in BASEL:
        for g in ["KH0450", "KH0147"] + BASEL:
            if f != g:
                s.add(tuple(sorted((f, g))))
    try:
        for p in json.loads((ROOT / "public/data/stories/links.json").read_text())["pairs"]:
            s.add(tuple(sorted((p["a"], p["b"]))))
    except Exception:
        pass
    return s


# ---------------------------------------------------------------- data
def load():
    ks = {}
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        if k["id"] in EXCL:
            continue
        cords = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
        vals = [int(c.get("value") or 0) for c in cords]
        grp = [c.get("group") if c.get("group") is not None else -1 for c in cords]
        if sum(1 for v in vals if v) < 4:
            continue
        ks[k["id"]] = (vals, grp)
    return ks


def group_totals(vals, grp):
    order, tot = [], {}
    for v, g in zip(vals, grp):
        if g not in tot:
            order.append(g)
            tot[g] = 0
        tot[g] += v
    return [tot[g] for g in order]


def is_slip(a: int, b: int) -> bool:
    if a == b or a <= 0 or b <= 0:
        return False
    if abs(a - b) == 1 or a == 10 * b or b == 10 * a:
        return True
    sa, sb = str(a), str(b)
    if len(sa) == len(sb):
        diff = [(x, y) for x, y in zip(sa, sb) if x != y]
        if len(diff) == 1 and abs(int(diff[0][0]) - int(diff[0][1])) == 1:
            return True
        if len(sa) >= 2 and sorted(sa) == sorted(sb):
            return True
    if abs(len(sa) - len(sb)) == 1 and min(a, b) >= 1:
        lo, hi = (sa, sb) if len(sa) < len(sb) else (sb, sa)
        for i in range(len(hi)):
            if hi[:i] + hi[i + 1:] == lo:
                return True
    return False


def slip_kind(a: int, b: int) -> str:
    if a == b:
        return "="
    if a == 0 or b == 0:
        return "blank"
    if abs(a - b) == 1:
        return "+-1"
    if a == 10 * b or b == 10 * a:
        return "x10"
    sa, sb = str(a), str(b)
    if len(sa) == len(sb):
        diff = [(x, y) for x, y in zip(sa, sb) if x != y]
        if len(diff) == 1 and abs(int(diff[0][0]) - int(diff[0][1])) == 1:
            return "digit+-1"
        if sorted(sa) == sorted(sb):
            return "transpose"
    if is_slip(a, b):
        return "drop-digit"
    return "mismatch"


class Scorer:
    def __init__(self, freq: Counter, extra_vals):
        T = sum(c for v, c in freq.items() if v)
        vals = sorted(set(freq) | set(extra_vals) | {0})
        self.idx = {v: i for i, v in enumerate(vals)}
        self.vals = vals
        ic = np.array([min(ICCAP, -math.log2((freq.get(v, 0) + 0.5) / T)) if v else 0.0 for v in vals])
        self.ic = ic
        D = len(vals)
        S = np.full((D, D), MIS, dtype=np.float32)
        S[0, :] = ZMIS
        S[:, 0] = ZMIS
        S[0, 0] = 0.0
        arr = np.array(vals)
        for i in range(1, D):
            S[i, i] = max(MINM, ic[i] - OFF)
        # slips: only check plausible partners (cheap enough: D ~ 3k -> 9M python calls is too slow,
        # so enumerate candidate partners per value)
        vset = self.idx
        for i in range(1, D):
            a = vals[i]
            cands = {a - 1, a + 1, a * 10}
            if a % 10 == 0:
                cands.add(a // 10)
            sa = str(a)
            for p in range(len(sa)):
                d = int(sa[p])
                for nd in (d - 1, d + 1):
                    if 0 <= nd <= 9 and not (p == 0 and nd == 0):
                        cands.add(int(sa[:p] + str(nd) + sa[p + 1:]))
                if len(sa) > 1:
                    s2 = sa[:p] + sa[p + 1:]
                    if s2 and s2[0] != "0":
                        cands.add(int(s2))
            if len(sa) >= 2:
                from itertools import permutations
                if len(sa) <= 5:
                    for q in set(permutations(sa)):
                        if q[0] != "0":
                            cands.add(int("".join(q)))
            for b in cands:
                j = vset.get(b)
                if j is None or j == 0 or j == i or not is_slip(a, b):
                    continue
                sc = max(MIS, SLIPW * 0.5 * (ic[i] + ic[j]) - OFF)
                S[i, j] = S[j, i] = sc
        self.S = np.ascontiguousarray(S)

    def enc(self, seq):
        return [self.idx[v] for v in seq]


# ---------------------------------------------------------------- C kernel
def kernel():
    so = OUT / "align_sw.so"
    src = Path(__file__).with_name("align_sw.c")
    if not so.exists() or so.stat().st_mtime < src.stat().st_mtime:
        subprocess.check_call(["cc", "-O3", "-shared", "-fPIC", "-o", str(so), str(src)])
    lib = ctypes.CDLL(str(so))
    P = np.ctypeslib.ndpointer
    lib.sw_batch.argtypes = [P(np.int32), P(np.int64), P(np.int32), P(np.int32), P(np.int32),
                             ctypes.c_long, P(np.float32), ctypes.c_int, ctypes.c_double,
                             ctypes.c_double, P(np.float64), P(np.int32), P(np.int32), ctypes.c_int]
    return lib


class Bank:
    """Concatenated sequence store handed to the C kernel."""

    def __init__(self):
        self.seqs: list[list[int]] = []

    def add(self, s) -> int:
        self.seqs.append(list(s))
        return len(self.seqs) - 1

    def freeze(self):
        self.len = np.array([len(s) for s in self.seqs], dtype=np.int32)
        self.off = np.zeros(len(self.seqs), dtype=np.int64)
        self.off[1:] = np.cumsum(self.len)[:-1]
        self.all = np.ascontiguousarray(np.concatenate([np.array(s, dtype=np.int32) for s in self.seqs]))
        self.maxlen = int(self.len.max())


def run(lib, bank: Bank, S: np.ndarray, px, py, threads=8):
    px = np.ascontiguousarray(px, dtype=np.int32)
    py = np.ascontiguousarray(py, dtype=np.int32)
    n = len(px)
    out = np.zeros(n)
    oi = np.zeros(n, dtype=np.int32)
    oj = np.zeros(n, dtype=np.int32)
    # balance by cell count
    cost = bank.len[px].astype(np.int64) * bank.len[py]
    order = np.argsort(-cost)
    chunks = [order[t::threads * 4] for t in range(threads * 4)]

    def work(ix):
        ix = np.sort(ix)
        a, b = px[ix].copy(), py[ix].copy()
        o = np.zeros(len(ix)); i1 = np.zeros(len(ix), dtype=np.int32); j1 = np.zeros(len(ix), dtype=np.int32)
        lib.sw_batch(bank.all, bank.off, bank.len, a, b, len(ix), S, S.shape[0], GO, GE, o, i1, j1,
                     bank.maxlen)
        return ix, o, i1, j1

    with ThreadPoolExecutor(threads) as ex:
        for ix, o, i1, j1 in ex.map(work, chunks):
            out[ix], oi[ix], oj[ix] = o, i1, j1
    return out, oi, oj


# ---------------------------------------------------------------- traceback (python, for reporting)
def traceback(a, b, S):
    """a, b: encoded index lists. returns score, list of (i or None, j or None) aligned columns."""
    n, m = len(a), len(b)
    NEG = -1e18
    H = np.zeros((n + 1, m + 1)); E = np.full((n + 1, m + 1), NEG); F = np.full((n + 1, m + 1), NEG)
    for i in range(1, n + 1):
        row = S[a[i - 1]]
        for j in range(1, m + 1):
            E[i, j] = max(E[i - 1, j] - GE, H[i - 1, j] - GO)
            F[i, j] = max(F[i, j - 1] - GE, H[i, j - 1] - GO)
            H[i, j] = max(0.0, H[i - 1, j - 1] + row[b[j - 1]], E[i, j], F[i, j])
    i, j = np.unravel_index(np.argmax(H), H.shape)
    best = H[i, j]
    cols = []
    state = "H"
    while i > 0 and j > 0:
        if state == "H":
            if H[i, j] <= 0:
                break
            if abs(H[i, j] - (H[i - 1, j - 1] + S[a[i - 1]][b[j - 1]])) < 1e-6:
                cols.append((i - 1, j - 1)); i -= 1; j -= 1
            elif abs(H[i, j] - E[i, j]) < 1e-6:
                state = "E"
            else:
                state = "F"
        elif state == "E":
            cols.append((i - 1, None))
            if abs(E[i, j] - (H[i - 1, j] - GO)) < 1e-6:
                state = "H"
            i -= 1
        else:
            cols.append((None, j - 1))
            if abs(F[i, j] - (H[i, j - 1] - GO)) < 1e-6:
                state = "H"
            j -= 1
    return float(best), cols[::-1]


def shuffle_within(vals, grp, rng):
    vals = np.array(vals)
    grp = np.array(grp)
    out = vals.copy()
    for g in np.unique(grp):
        ix = np.where(grp == g)[0]
        out[ix] = rng.permutation(vals[ix])
    return out.tolist()


# ---------------------------------------------------------------- main
def main():
    rng = np.random.default_rng(SEED)
    ks = load()
    ids = sorted(ks)
    N = len(ids)
    freq = Counter(v for vals, _ in ks.values() for v in vals)
    gts = {k: group_totals(*ks[k]) for k in ids}
    ngroups = {k: len(set(ks[k][1])) for k in ids}
    sc = Scorer(freq, [v for g in gts.values() for v in g])
    S = sc.S
    print(f"{N} khipus, D={S.shape[0]} distinct values", flush=True)
    lib = kernel()

    bank = Bank()
    fwd = [bank.add(sc.enc(ks[k][0])) for k in ids]
    rev = [bank.add(sc.enc(ks[k][0][::-1])) for k in ids]
    shuf = []  # shuf[r][i] (fwd) and its reverse
    shufr = []
    for r in range(K_SHUF + 1):
        row, rowr = [], []
        for k in ids:
            s = shuffle_within(*ks[k], rng)
            row.append(bank.add(sc.enc(s)))
            rowr.append(bank.add(sc.enc(s[::-1])))
        shuf.append(row); shufr.append(rowr)
    gperm = [[bank.add(sc.enc(rng.permutation(ks[k][0]).tolist())) for k in ids] for r in range(K_SHUF + 1)]
    gt = [bank.add(sc.enc(gts[k])) for k in ids]
    gtr = [bank.add(sc.enc(gts[k][::-1])) for k in ids]
    gtperm = []
    for r in range(K_SHUF):
        gtperm.append([bank.add(sc.enc(rng.permutation(gts[k]).tolist())) for k in ids])
    bank.freeze()

    I, J = np.triu_indices(N, 1)
    fwd_a, rev_a, shuf_a, shufr_a, gperm_a = map(np.array, (fwd, rev, shuf, shufr, gperm))
    res = {}
    import time
    t0 = time.time()
    for orient, target, null, gnull in (("fwd", fwd_a, shuf_a, gperm_a), ("rev", rev_a, shufr_a, gperm_a)):
        obs, oi, oj = run(lib, bank, S, fwd_a[I], target[J])
        nulls = np.zeros((K_SHUF + 1, len(I)))
        for r in range(K_SHUF + 1):
            nulls[r] = run(lib, bank, S, fwd_a[I], null[r][J])[0]
        gn = np.zeros((K_SHUF + 1, len(I)))
        for r in range(K_SHUF + 1):
            gn[r] = run(lib, bank, S, fwd_a[I], gnull[r][J])[0]
        res[orient] = (obs, oi, oj, nulls)
        np.savez(OUT / f"stage1_{orient}.npz", obs=obs, nulls=nulls, gnulls=gn, I=I, J=J, ids=np.array(ids))
        print(f"{orient}: done {time.time() - t0:.0f}s", flush=True)

    known = known_set()
    curated = {tuple(sorted(p)) for p in KNOWN}
    rows = []
    zs_null_all = []
    for orient in ("fwd", "rev"):
        obs, oi, oj, nulls = res[orient]
        base = nulls[:K_SHUF]
        mu, sd = base.mean(0), base.std(0) + 0.5
        z = (obs - mu) / sd
        znull = (nulls[K_SHUF] - mu) / sd  # held-out shuffle: z under the null, same pairs
        zs_null_all.append(znull)
        res[orient] = res[orient] + (z, znull, mu, sd)
    zfwd, zrev = res["fwd"][4], res["rev"][4]
    zbest = np.maximum(zfwd, zrev)
    znull_best = np.maximum(zs_null_all[0], zs_null_all[1])
    # threshold such that expected null exceedances (pairs) <= 1
    zs_sorted = np.sort(znull_best)[::-1]
    thr = {q: float(zs_sorted[q - 1]) for q in (1, 5, 20)}
    print("null z (held-out shuffle) top-1/5/20:", thr, flush=True)

    # recall on known links
    idx = {k: i for i, k in enumerate(ids)}
    pairpos = {(int(a), int(b)): n for n, (a, b) in enumerate(zip(I, J))}
    rank = np.argsort(-zbest)
    rankpos = np.empty_like(rank); rankpos[rank] = np.arange(len(rank))
    recall = []
    for a, b in sorted(curated):
        if a not in idx or b not in idx:
            recall.append((a, b, None, None, None, None)); continue
        x, y = sorted((idx[a], idx[b]))
        n = pairpos[(x, y)]
        o = "fwd" if zfwd[n] >= zrev[n] else "rev"
        recall.append((a, b, float(zbest[n]), int(rankpos[n]) + 1, o, float(res[o][0][n])))
    rec_ok = [r for r in recall if r[2] is not None]
    print("\nKNOWN (curated) pair recall: z, rank of 233k, orient, raw score")
    for r in recall:
        print("  ", r)
    for q in (1, 5, 20):
        print(f"recall z>{thr[q]:.2f} (null top-{q}): {sum(r[2] > thr[q] for r in rec_ok)}/{len(rec_ok)}")

    # candidates
    cand = []
    for n in rank[:400]:
        a, b = ids[I[n]], ids[J[n]]
        o = "fwd" if zfwd[n] >= zrev[n] else "rev"
        cand.append(dict(a=a, b=b, z=float(zbest[n]), orient=o, score=float(res[o][0][n]),
                         null_mu=float(res[o][6][n]), null_sd=float(res[o][7][n]),
                         known=tuple(sorted((a, b))) in known, curated=tuple(sorted((a, b))) in curated,
                         la=len(ks[a][0]), lb=len(ks[b][0])))
    np.save(OUT / "zbest.npy", zbest)
    np.save(OUT / "znull.npy", znull_best)

    # ---- matched nulls for top new + known candidates
    Slist = S
    enc_f = {k: sc.enc(ks[k][0]) for k in ids}
    lens = np.array([len(ks[k][0]) for k in ids])
    scoremat_f = np.zeros((N, N)); scoremat_r = np.zeros((N, N))
    scoremat_f[I, J] = res["fwd"][0]; scoremat_f[J, I] = res["fwd"][0]
    scoremat_r[I, J] = res["rev"][0]; scoremat_r[J, I] = res["rev"][0]
    top = [c for c in cand if c["z"] > thr[20]][:80]
    # extra shuffles: build a temporary bank per pair
    for c in top:
        a, b = c["a"], c["b"]
        tb = Bank()
        ia = tb.add(enc_f[a])
        ib = []
        for r in range(1000):
            s = shuffle_within(*ks[b], rng)
            ib.append(tb.add(sc.enc(s[::-1] if c["orient"] == "rev" else s)))
        tb.freeze()
        nulls = run(lib, tb, S, np.full(1000, ia), np.array(ib), threads=4)[0]
        c["p_shuffle"] = float((1 + (nulls >= c["score"]).sum()) / 1001)
        c["z1000"] = float((c["score"] - nulls.mean()) / nulls.std())
        # matched random pairs: a vs other khipus with length within 30% of b (and vice versa)
        mat = scoremat_f if c["orient"] == "fwd" else scoremat_r
        vals = []
        for x, y in ((a, b), (b, a)):
            ly = len(ks[y][0])
            others = [j for j, k in enumerate(ids) if k not in (x, y) and 0.7 * ly <= lens[j] <= 1.3 * ly
                      and tuple(sorted((x, k))) not in known]
            vals.extend(mat[idx[x], others])
        vals = np.array(vals)
        c["p_matched"] = float((1 + (vals >= c["score"]).sum()) / (1 + len(vals)))
        c["n_matched"] = int(len(vals))
        # traceback for the report
        sa = enc_f[b][::-1] if c["orient"] == "rev" else enc_f[b]
        vb = ks[b][0][::-1] if c["orient"] == "rev" else ks[b][0]
        if len(enc_f[a]) * len(sa) < 400000:
            best, cols = traceback(enc_f[a], sa, S)
            nb = len(vb)
            al = []
            for i, j in cols:
                va = ks[a][0][i] if i is not None else None
                vv = vb[j] if j is not None else None
                jj = (nb - 1 - j if c["orient"] == "rev" else j) if j is not None else None
                al.append((i, jj, va, vv, slip_kind(va, vv) if va is not None and vv is not None else "gap"))
            c["alignment"] = al
            kinds = Counter(x[4] for x in al)
            c["kinds"] = dict(kinds)
            ii = [x[0] for x in al if x[0] is not None]; jj = [x[1] for x in al if x[1] is not None]
            c["span_a"] = (min(ii), max(ii)); c["span_b"] = (min(jj), max(jj))
        print(f"{a}-{b} {c['orient']} z={c['z']:.1f} score={c['score']:.1f} p_shuf={c['p_shuffle']:.4f} "
              f"p_matched={c['p_matched']:.4f}/{c['n_matched']} known={c['known']} kinds={c.get('kinds')}",
              flush=True)

    # ---- group totals
    print("\nGROUP TOTALS", flush=True)
    okg = np.array([ngroups[k] >= 3 for k in ids])
    gt_a, gtr_a, gtp = np.array(gt), np.array(gtr), np.array(gtperm)
    # (a) GT(A) vs L1(B): ordered pairs, A with >=3 groups; null = permute GT(A) order
    A_, B_ = np.where(okg[:, None] & ~np.eye(N, dtype=bool))
    gres = {}
    for orient, tgt in (("fwd", fwd_a), ("rev", rev_a)):
        obs = run(lib, bank, S, gt_a[A_], tgt[B_])[0]
        nl = np.array([run(lib, bank, S, gtp[r][A_], tgt[B_])[0] for r in range(K_SHUF)])
        gres[orient] = (obs, (obs - nl.mean(0)) / (nl.std(0) + 0.5), nl)
    zg = np.maximum(gres["fwd"][1], gres["rev"][1])
    # held-out null z: use permutation 0 as observation against perms 1..
    nl = gres["fwd"][2]
    zg_null = (nl[0] - nl[1:].mean(0)) / (nl[1:].std(0) + 0.5)
    nlr = gres["rev"][2]
    zg_null = np.maximum(zg_null, (nlr[0] - nlr[1:].mean(0)) / (nlr[1:].std(0) + 0.5))
    gthr = float(np.sort(zg_null)[::-1][4])
    print("GT->L1 null z top-5:", gthr)
    gcand = []
    for n in np.argsort(-zg)[:40]:
        a, b = ids[A_[n]], ids[B_[n]]
        o = "fwd" if gres["fwd"][1][n] >= gres["rev"][1][n] else "rev"
        gcand.append(dict(a=a, b=b, z=float(zg[n]), orient=o, score=float(gres[o][0][n]),
                          known=tuple(sorted((a, b))) in known, ngroups=ngroups[a], lb=len(ks[b][0])))
        print("  GT", gcand[-1])
    # (b) GT vs GT: unordered, both with >=3 groups; null = permute GT(B)
    GI, GJ = np.array([(i, j) for i, j in zip(I, J) if okg[i] and okg[j]]).T
    g2 = {}
    for orient, tgt, perm_rev in (("fwd", gt_a, False), ("rev", gtr_a, True)):
        obs = run(lib, bank, S, gt_a[GI], tgt[GJ])[0]
        nl = np.array([run(lib, bank, S, gt_a[GI], gtp[r][GJ])[0] for r in range(K_SHUF)])
        g2[orient] = (obs, (obs - nl.mean(0)) / (nl.std(0) + 0.5), nl)
    z2 = np.maximum(g2["fwd"][1], g2["rev"][1])
    nl = g2["fwd"][2]
    z2null = (nl[0] - nl[1:].mean(0)) / (nl[1:].std(0) + 0.5)
    g2thr = float(np.sort(z2null)[::-1][4])
    print("GT<->GT null z top-5:", g2thr)
    g2cand = []
    for n in np.argsort(-z2)[:40]:
        a, b = ids[GI[n]], ids[GJ[n]]
        o = "fwd" if g2["fwd"][1][n] >= g2["rev"][1][n] else "rev"
        g2cand.append(dict(a=a, b=b, z=float(z2[n]), orient=o, score=float(g2[o][0][n]),
                           known=tuple(sorted((a, b))) in known, ga=gts[a], gb=gts[b]))
        print("  GT2", {k: v for k, v in g2cand[-1].items() if k not in ("ga", "gb")})

    json.dump(dict(params=dict(OFF=OFF, MINM=MINM, SLIPW=SLIPW, MIS=MIS, ZMIS=ZMIS, GO=GO, GE=GE,
                               K=K_SHUF), thresholds=thr, recall=recall, candidates=cand, top=top,
                   gt_l1=gcand, gt_l1_thr=gthr, gt_gt=g2cand, gt_gt_thr=g2thr),
              open(OUT / "align_results.json", "w"), default=lambda o: o if not isinstance(o, np.generic) else o.item(),
              indent=1)
    print("wrote", OUT / "align_results.json")


if __name__ == "__main__":
    sys.exit(main())

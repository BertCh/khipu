#!/usr/bin/env python3
"""(a) Corpus value vocabulary: which values are over-represented beyond a smooth baseline.

Unit of count = (khipu, value) presence (df), so a value repeated 40 times in one khipu counts once.
Baseline for value v = median df of the integers in a log-window around v (|log v' - log v| <= 0.08,
at least +-3 integers), excluding v itself and all multiples of 5 (so round numbers do not inflate
their own baseline).  Surprise = Poisson upper tail of df given the baseline.

Digit-preference classes (mult-of-10, mult-of-5-not-10, mult-of-12-not-5) are tested per magnitude
by a local ratio: obs(v) / mean(obs(v+-1), obs(v+-2)), summed over the class, with a khipu bootstrap CI.
Cords: all levels, value > 0; Wari canuto family and 7 unreadable khipus excluded.
"""
from __future__ import annotations
import collections, json, math
import numpy as np
from scipy import stats
import vocab_common as vc

rng = np.random.default_rng(20260922)
ks = [k for k in vc.load() if k["id"] not in vc.EXCLUDE]
N = len(ks)
kv = []  # per khipu Counter of values
for k in ks:
    c = collections.Counter(int(x["value"]) for x in k["cords"] if x.get("value"))
    kv.append(c)
df = collections.Counter(); ncord = collections.Counter(); regs = collections.defaultdict(collections.Counter)
for k, c in zip(ks, kv):
    for v, n in c.items():
        df[v] += 1; ncord[v] += n; regs[v][k["_region"] or "?"] += 1
VMAX = 20000
dfa = np.zeros(VMAX + 1); 
for v, n in df.items():
    if v <= VMAX: dfa[v] = n

def baseline(v):
    lo = max(1, min(v - 3, int(v / math.exp(0.08)))); hi = max(v + 3, int(v * math.exp(0.08)) + 1)
    hi = min(hi, VMAX)
    nb = [dfa[u] for u in range(lo, hi + 1) if u != v and u % 5 != 0]
    return max(np.median(nb) if nb else 0.0, 0.5)

rows = []
for v in range(1, VMAX + 1):
    if dfa[v] < 3: continue
    b = baseline(v)
    p = stats.poisson.sf(dfa[v] - 1, b)
    rows.append((v, int(dfa[v]), ncord[v], b, dfa[v] / b, p))
rows.sort(key=lambda r: r[5])
nt = len([v for v in range(1, VMAX+1) if dfa[v] >= 1])
out = []
print(f"khipus={N} distinct values={len(df)}; tested values(df>=3)={len(rows)}")
print(" value  df  ncords  base  ratio   p_poisson  top regions")
for v, d, n, b, r, p in rows[:45]:
    rg = ", ".join(f"{a}:{c}" for a, c in regs[v].most_common(4))
    print(f"{v:6d} {d:4d} {n:6d} {b:6.1f} {r:6.2f} {p:10.2e}  {rg}")
    out.append(dict(value=v, df=d, ncords=n, baseline=b, ratio=r, p=p, regions=dict(regs[v])))
# non-round anomalies (not multiples of 5 or 10)
print("\nTop anomalous values that are NOT multiples of 5 (Bonferroni over tested):")
nonround = [r for r in rows if r[0] % 5 != 0]
for v, d, n, b, r, p in nonround[:25]:
    rg = ", ".join(f"{a}:{c}" for a, c in regs[v].most_common(4))
    print(f"{v:6d} {d:4d} {n:6d} {b:6.1f} {r:6.2f} {p:10.2e} bonf={min(1,p*len(rows)):.2e} {rg}")

# Admin decimal numbers
print("\nInca decimal-administration numbers:")
for v in (10, 50, 100, 500, 1000, 5000, 10000):
    b = baseline(v); print(f"  {v:6d} df={int(dfa[v])} baseline={b:.1f} ratio={dfa[v]/b:.2f} p={stats.poisson.sf(dfa[v]-1,b):.2e}")

# digit-preference classes with khipu bootstrap
def class_ratio(sel_ks, lo, hi, pred):
    d = collections.Counter()
    for c in sel_ks:
        for v in c: d[v] += 1
    o = e = 0.0
    for v in range(lo, hi + 1):
        if not pred(v): continue
        nb = [d[v + s] for s in (-4, -3, -2, -1, 1, 2, 3, 4) if (v + s) % 5 != 0 and v + s > 0]
        o += d[v]; e += np.mean(nb)
    return o / e if e else float("nan")

classes = {"mult10": lambda v: v % 10 == 0, "mult5not10": lambda v: v % 5 == 0 and v % 10 != 0,
           "mult12not5": lambda v: v % 12 == 0 and v % 5 != 0, "mult100(3-4dig)": lambda v: v % 100 == 0,
           "digit_ends_1": lambda v: v % 10 == 1, "ends_9": lambda v: v % 10 == 9}
mags = {"10-99": (10, 99), "100-999": (100, 999), "1000-9999": (1000, 9999)}
print("\nDigit preference: obs / local-neighbour expectation (khipu bootstrap 95% CI, 300 reps)")
dig = {}
for cn, pred in classes.items():
    for mn, (lo, hi) in mags.items():
        if cn == "mult100(3-4dig)" and lo < 100: continue
        r0 = class_ratio(kv, lo, hi, pred)
        bs = [class_ratio([kv[i] for i in rng.integers(0, N, N)], lo, hi, pred) for _ in range(300)]
        lo_, hi_ = np.nanpercentile(bs, [2.5, 97.5])
        dig[f"{cn}|{mn}"] = (r0, lo_, hi_)
        print(f"  {cn:16s} {mn:10s} ratio={r0:5.2f}  CI=[{lo_:.2f},{hi_:.2f}]")

# regional round-number preference: mult10 among 10-99 by region
# units digit profile: leave-one-out linear fit within each decade over non-5 digits
print("\nUnits-digit profile, obs/expected (expected = linear fit over the other non-0/5 digits of the same decade)")
def digit_profile(cs, lo, hi):
    d = collections.Counter()
    for c in cs:
        for v in c: d[v] += 1
    o = np.zeros(10); e = np.zeros(10)
    for a in range(lo // 10, hi // 10 + 1):
        xs = [u for u in range(1, 10) if u != 5]
        ys = np.array([d[10 * a + u] for u in xs], float)
        if ys.sum() == 0: continue
        for u in range(10):
            m = [i for i, x in enumerate(xs) if x != u]
            A = np.vstack([np.ones(len(m)), np.array(xs)[m]]).T
            coef = np.linalg.lstsq(A, ys[m], rcond=None)[0]
            e[u] += max(coef[0] + coef[1] * u, 0); o[u] += d[10 * a + u]
    return o / np.maximum(e, 1e-9)
for mn, (lo, hi) in (("11-99", (10, 99)), ("100-999", (100, 999))):
    p0 = digit_profile(kv, lo, hi)
    bs = np.array([digit_profile([kv[i] for i in rng.integers(0, N, N)], lo, hi) for _ in range(200)])
    ci = np.percentile(bs, [2.5, 97.5], axis=0)
    print("  " + mn + ": " + "  ".join(f"{u}:{p0[u]:.2f}[{ci[0][u]:.2f},{ci[1][u]:.2f}]" for u in range(10)))
    dig["units|" + mn] = [list(p0), list(ci[0]), list(ci[1])]
print("\nmult10 ratio (10-999) by region:")
byr = collections.defaultdict(list)
for k, c in zip(ks, kv): byr[k["_region"] or "?"].append(c)
for rname, cs in sorted(byr.items(), key=lambda x: -len(x[1])):
    if len(cs) < 10: continue
    r0 = class_ratio(cs, 10, 999, classes["mult10"])
    bs = [class_ratio([cs[i] for i in rng.integers(0, len(cs), len(cs))], 10, 999, classes["mult10"]) for _ in range(200)]
    print(f"  {rname:12s} n={len(cs):3d} ratio={r0:.2f} CI=[{np.nanpercentile(bs,2.5):.2f},{np.nanpercentile(bs,97.5):.2f}]")
json.dump(dict(top=out, digits={k: list(v) for k, v in dig.items()}), open(vc.OUT / "a_values.json", "w"), indent=1, default=float)

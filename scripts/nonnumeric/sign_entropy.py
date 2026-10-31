#!/usr/bin/env python3
"""Analysis E: information-theoretic comparison of non-numeric (NN) vs numeric (NUM) khipus.

Sign definitions for level-1 cords in ordinal order:
  s1 = raw colour string
  s2 = (colour, attach, twist)
  s3 = (colour, attach, twist, majority knot direction)
  s4 = (colour, knot signature top->bottom, e.g. 'L L S')
  s5 = s3 + signature

Sections: inventory/Zipf/Heaps, entropy (H1, H2, block), repeats, feature MI, positional grammar.
"""
import json, glob, math, random, re, sys
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from scipy.stats import mannwhitneyu

SCRATCH = Path(__file__).resolve().parent  # scan_grammar.py writes scan_rows.json here
DATA = Path('/Users/roc8917/Documents/GitHub/khipu/public/data/khipus')
ASCHER = {'KH0015', 'KH0047', 'KH0048', 'KH0094', 'KH0100', 'KH0108', 'KH0584'}
SEED = 20260919
NSHUF = 200
NPERM = 1000

rows = {r['id']: r for r in json.load(open(SCRATCH / 'scan_rows.json'))}
NN = sorted(k for k, r in rows.items() if (r['n'] >= 20 and r['frac'] >= 0.3) or k in ASCHER)
NUM = sorted(k for k, r in rows.items() if r['n'] >= 20 and r['frac'] == 0 and k not in ASCHER)
print(f'NN = {len(NN)} khipus: {" ".join(NN)}')
print(f'NUM = {len(NUM)} khipus')

def load(kid):
    return json.load(open(DATA / f'{kid}.json'))

def signature(c):
    seq = sorted(c['knots'], key=lambda x: x['pos'])
    return ' '.join(x['type'] for x in seq) if seq else '-'

def majdir(c):
    d = Counter(ch for x in c['knots'] for ch in x['dir'] if ch in 'SZ')
    if not d: return 'U'
    return d.most_common(1)[0][0]

def cords_of(k):
    """Level-1 pendants (not top cords) in ordinal order, with sign tuples."""
    out = []
    for c in sorted((c for c in k['cords'] if c['level'] == 1 and c['kind'] == 'pendant'), key=lambda c: c['ordinal']):
        col = c['color'] or 'U'
        att = c['attach'] or 'U'
        tw = c['twist'] or 'U'
        md = majdir(c)
        sg = signature(c)
        out.append(dict(s1=col, s2=(col, att, tw), s3=(col, att, tw, md), s4=(col, sg), s5=(col, att, tw, md, sg),
                        col=col, att=att, tw=tw, dir=md, sig=sg, group=c.get('group'), ord=c['ordinal'], val=c['value']))
    return out

KH = {kid: cords_of(load(kid)) for kid in NN + NUM}
GROUPS = {kid: load(kid)['groups'] for kid in NN + NUM}

# ---------- helpers ----------
def entropy(counts):
    n = sum(counts.values())
    if n == 0: return 0.0
    return -sum(c / n * math.log2(c / n) for c in counts.values())

def H1(seq):
    return entropy(Counter(seq))

def H2(seq, mm=True):
    """Conditional entropy H(x_i | x_{i-1}) with Miller-Madow correction on joint and marginal."""
    if len(seq) < 2: return 0.0
    pairs = Counter(zip(seq[:-1], seq[1:]))
    marg = Counter(seq[:-1])
    n = len(seq) - 1
    hj = entropy(pairs); hm = entropy(marg)
    if mm:
        hj += (len(pairs) - 1) / (2 * n * math.log(2))
        hm += (len(marg) - 1) / (2 * n * math.log(2))
    return max(hj - hm, 0.0)

def block_entropy(seq, n):
    if len(seq) < n: return float('nan')
    return entropy(Counter(tuple(seq[i:i + n]) for i in range(len(seq) - n + 1)))

def zipf_slope(seq):
    freqs = sorted(Counter(seq).values(), reverse=True)
    freqs = [f for f in freqs if f >= 2]
    if len(freqs) < 3: return float('nan')
    x = np.log(np.arange(1, len(freqs) + 1)); y = np.log(freqs)
    return float(np.polyfit(x, y, 1)[0])

def heaps(seq):
    """Types at half length / types at full length (a growth ratio); also types/tokens."""
    half = len(seq) // 2
    return len(set(seq[:half])) / max(1, len(set(seq)))

def mw(a, b):
    a = [x for x in a if not (isinstance(x, float) and math.isnan(x))]
    b = [x for x in b if not (isinstance(x, float) and math.isnan(x))]
    if len(a) < 3 or len(b) < 3: return float('nan')
    return mannwhitneyu(a, b, alternative='two-sided').pvalue

def med(xs):
    xs = [x for x in xs if not (isinstance(x, float) and math.isnan(x))]
    return float(np.median(xs)) if xs else float('nan')

def shuffled_stat(seq, fn, rng, nshuf=NSHUF):
    vals = []
    s = list(seq)
    for _ in range(nshuf):
        rng.shuffle(s); vals.append(fn(s))
    return np.mean(vals), np.std(vals)

# ---------- 1. inventory / Zipf / Heaps ----------
print('\n=== 1. Sign inventory (level-1 pendants) ===')
SIGNS = ['s1', 's2', 's3', 's4', 's5']
inv = {}
for s in SIGNS:
    for grp, ids in (('NN', NN), ('NUM', NUM)):
        for kid in ids:
            seq = [c[s] for c in KH[kid]]
            if len(seq) < 10: continue
            inv[(s, grp, kid)] = dict(tokens=len(seq), types=len(set(seq)), tt=len(set(seq)) / len(seq),
                                     zipf=zipf_slope(seq), heaps=heaps(seq))
print(f'{"sign":5}{"set":5}{"n":>4}{"med tok":>9}{"med typ":>9}{"types/tok":>10}{"zipf":>8}{"heaps½":>8}  p(t/t) p(zipf)')
for s in SIGNS:
    d = {}
    for grp in ('NN', 'NUM'):
        rs = [v for (ss, g, _), v in inv.items() if ss == s and g == grp]
        d[grp] = rs
        print(f'{s:5}{grp:5}{len(rs):4}{med([r["tokens"] for r in rs]):9.0f}{med([r["types"] for r in rs]):9.0f}'
              f'{med([r["tt"] for r in rs]):10.2f}{med([r["zipf"] for r in rs]):8.2f}{med([r["heaps"] for r in rs]):8.2f}', end='')
        if grp == 'NUM':
            print(f'  {mw([r["tt"] for r in d["NN"]], [r["tt"] for r in rs]):.3f} {mw([r["zipf"] for r in d["NN"]], [r["zipf"] for r in rs]):.3f}')
        else:
            print()

# global pooled rank-frequency (s4) for NN vs NUM
for grp, ids in (('NN', NN), ('NUM', NUM)):
    pooled = [c['s4'] for kid in ids for c in KH[kid]]
    print(f'  pooled s4 {grp}: tokens {len(pooled)} types {len(set(pooled))} zipf {zipf_slope(pooled):.2f}; '
          f'top5 {Counter(pooled).most_common(5)}')
    pooled = [c['sig'] for kid in ids for c in KH[kid]]
    print(f'  pooled signature-only {grp}: types {len(set(pooled))}; top8 {Counter(pooled).most_common(8)}')

# ---------- 2. entropy ----------
print('\n=== 2. Entropy (bits) — observed vs 200 cord-order shuffles ===')
rng = random.Random(SEED)
ent = {}
for s in ('s1', 's3', 's4', 's5'):
    for grp, ids in (('NN', NN), ('NUM', NUM)):
        for kid in ids:
            seq = [c[s] for c in KH[kid]]
            if len(seq) < 20: continue
            h1 = H1(seq); h2 = H2(seq)
            mu, sd = shuffled_stat(seq, H2, rng)
            z = (h2 - mu) / sd if sd > 0 else float('nan')
            b2 = block_entropy(seq, 2); b3 = block_entropy(seq, 3)
            ent[(s, grp, kid)] = dict(h1=h1, h2=h2, ratio=h2 / h1 if h1 > 0 else float('nan'),
                                     shuf=mu, z=z, b2=b2, b3=b3, excess=(mu - h2))
print(f'{"sign":5}{"set":5}{"n":>4}{"H1":>7}{"H2":>7}{"H2/H1":>7}{"H2shuf":>8}{"z":>7}{"frac z<-2":>10}{"B2-B1":>7}{"B3-B2":>7}')
for s in ('s1', 's3', 's4', 's5'):
    for grp in ('NN', 'NUM'):
        rs = [v for (ss, g, _), v in ent.items() if ss == s and g == grp]
        zs = [r['z'] for r in rs if not math.isnan(r['z'])]
        print(f'{s:5}{grp:5}{len(rs):4}{med([r["h1"] for r in rs]):7.2f}{med([r["h2"] for r in rs]):7.2f}'
              f'{med([r["ratio"] for r in rs]):7.2f}{med([r["shuf"] for r in rs]):8.2f}{med(zs):7.2f}'
              f'{sum(1 for z in zs if z < -2) / max(1, len(zs)):10.2f}'
              f'{med([r["b2"] - r["h1"] for r in rs]):7.2f}{med([r["b3"] - r["b2"] for r in rs]):7.2f}')
    nn = [v for (ss, g, _), v in ent.items() if ss == s and g == 'NN']
    nu = [v for (ss, g, _), v in ent.items() if ss == s and g == 'NUM']
    print(f'      MW p: H2/H1 {mw([r["ratio"] for r in nn], [r["ratio"] for r in nu]):.3f}   '
          f'z {mw([r["z"] for r in nn], [r["z"] for r in nu]):.3f}   H1 {mw([r["h1"] for r in nn], [r["h1"] for r in nu]):.3f}')
print('\nPer-khipu NN entropy (s4):')
for kid in NN:
    r = ent.get(('s4', 'NN', kid))
    if r: print(f'  {kid} tok {len(KH[kid]):4} H1 {r["h1"]:.2f} H2 {r["h2"]:.2f} ratio {r["ratio"]:.2f} shufH2 {r["shuf"]:.2f} z {r["z"]:+.2f}')

# ---------- 3. repeats ----------
print('\n=== 3. Exact repeated n-grams (within khipu; n=2..5), observed − shuffle mean, as z ===')
def ngram_repeats(seq, n):
    c = Counter(tuple(seq[i:i + n]) for i in range(len(seq) - n + 1))
    return sum(v - 1 for v in c.values() if v > 1)  # repeated occurrences beyond first

rng = random.Random(SEED + 1)
rep = {}
for s in ('s4', 's5'):
    for grp, ids in (('NN', NN), ('NUM', NUM)):
        for kid in ids:
            seq = [c[s] for c in KH[kid]]
            if len(seq) < 20: continue
            for n in (2, 3, 4, 5):
                obs = ngram_repeats(seq, n)
                mu, sd = shuffled_stat(seq, lambda q, n=n: ngram_repeats(q, n), rng, 100)
                rep[(s, grp, kid, n)] = (obs, mu, sd, (obs - mu) / sd if sd > 0 else (0.0 if obs == mu else float('inf')))
for s in ('s4', 's5'):
    for grp in ('NN', 'NUM'):
        line = f'{s} {grp:4}'
        for n in (2, 3, 4, 5):
            rs = [v for (ss, g, _, nn_), v in rep.items() if ss == s and g == grp and nn_ == n]
            zs = [r[3] for r in rs if math.isfinite(r[3])]
            line += f'  n={n}: obs/shuf {med([r[0] for r in rs]):.0f}/{med([r[1] for r in rs]):.1f} z {med(zs):+.2f} (z>3 in {sum(1 for z in zs if z > 3)}/{len(rs)})'
        print(line)
# cross-khipu shared n-grams (s4), n=3..4, min info: not all-same sign
print('\nCross-khipu shared s4 n-grams (n=3,4; excluding runs of one sign):')
for n in (3, 4):
    where = defaultdict(set)
    for grp, ids in (('NN', NN), ('NUM', NUM)):
        for kid in ids:
            seq = [c['s4'] for c in KH[kid]]
            for i in range(len(seq) - n + 1):
                g = tuple(seq[i:i + n])
                if len(set(g)) > 1: where[g].add((grp, kid))
    shared = {g: v for g, v in where.items() if len(v) > 1}
    nn_nn = sum(1 for v in shared.values() if all(x[0] == 'NN' for x in v))
    mixed = sum(1 for v in shared.values() if len({x[0] for x in v}) == 2)
    num_num = sum(1 for v in shared.values() if all(x[0] == 'NUM' for x in v))
    print(f'  n={n}: shared grams {len(shared)}  NN-only {nn_nn}  NUM-only {num_num}  mixed {mixed}')
    top = sorted(shared.items(), key=lambda kv: -len(kv[1]))[:5]
    for g, v in top:
        print(f'    {len(v):3} khipus  {g}')

# ---------- 4. feature MI in NN ----------
print('\n=== 4. Mutual information (bits) between cord features and knot signature, NN khipus, perm p (1000) ===')
def mi(xs, ys):
    n = len(xs)
    jx = Counter(zip(xs, ys)); cx = Counter(xs); cy = Counter(ys)
    return sum(v / n * math.log2((v / n) / ((cx[a] / n) * (cy[b] / n))) for (a, b), v in jx.items())

def mi_perm(xs, ys, rng, nperm=NPERM):
    obs = mi(xs, ys)
    ys = list(ys); cnt = 0; vals = []
    for _ in range(nperm):
        rng.shuffle(ys); v = mi(xs, ys); vals.append(v)
        if v >= obs: cnt += 1
    return obs, (cnt + 1) / (nperm + 1), np.mean(vals)

rng = random.Random(SEED + 2)
def mi_table(ids, label):
    print(f'-- {label}')
    print(f'{"khipu":7}{"n":>4}{"H(sig)":>7}{"MI col":>8}{"p":>7}{"MI att":>8}{"p":>7}{"MI dir":>8}{"p":>7}{"MI tw":>8}{"p":>7}')
    agg = defaultdict(list)
    for kid in ids:
        cs = [c for c in KH[kid] if c['sig'] != '-']
        if len(cs) < 20: continue
        sig = [c['sig'] for c in cs]
        line = f'{kid:7}{len(cs):4}{H1(sig):7.2f}'
        for f in ('col', 'att', 'dir', 'tw'):
            xs = [c[f] for c in cs]
            if len(set(xs)) < 2:
                line += f'{"—":>8}{"":>7}'; continue
            obs, p, null = mi_perm(xs, sig, rng)
            agg[f].append((obs - null) / H1(sig) if H1(sig) > 0 else 0)
            agg[f + '_p'].append(p)
            line += f'{obs:8.2f}{p:7.3f}'
        print(line)
    for f in ('col', 'att', 'dir', 'tw'):
        if agg[f]:
            print(f'   {f}: median normalised excess MI {np.median(agg[f]):.3f}; khipus with p<0.01: {sum(1 for p in agg[f+"_p"] if p < 0.01)}/{len(agg[f])}')
    return agg
aggNN = mi_table(NN, 'NN')
rng = random.Random(SEED + 3)
aggNUM = mi_table(sorted(NUM, key=lambda k: -len(KH[k]))[:25], 'NUM (25 largest, for comparison)')
for f in ('col', 'att', 'dir', 'tw'):
    print(f'   MW p NN vs NUM normalised excess MI({f}): {mw(aggNN[f], aggNUM[f]):.3f}')

# ---------- 5. positional grammar ----------
print('\n=== 5. Signature vs position in group (NN khipus), chi-square with permutation ===')
def chi2(xs, ys):
    jx = Counter(zip(xs, ys)); cx = Counter(xs); cy = Counter(ys); n = len(xs)
    return sum((jx[(a, b)] - cx[a] * cy[b] / n) ** 2 / (cx[a] * cy[b] / n) for a in cx for b in cy)

def chi_perm(xs, ys, rng, nperm=NPERM):
    obs = chi2(xs, ys); ys = list(ys); cnt = 0
    for _ in range(nperm):
        rng.shuffle(ys)
        if chi2(xs, ys) >= obs: cnt += 1
    return obs, (cnt + 1) / (nperm + 1)

rng = random.Random(SEED + 4)
print(f'{"khipu":7}{"n":>4}{"groups":>7}{"first-vs-rest chi2":>20}{"p":>7}{"posclass chi2":>15}{"p":>7}{"gsize chi2":>12}{"p":>7}   top sig first | rest')
for kid in NN:
    cs = [c for c in KH[kid] if c['sig'] != '-' and c['group'] is not None]
    if len(cs) < 20: continue
    groups = GROUPS[kid]
    # ordinal within group
    gstart = {i: g['first'] for i, g in enumerate(groups)}
    gsize = {i: g['n'] for i, g in enumerate(groups)}
    sig = [c['sig'] for c in cs]
    # collapse rare signatures to 'other' to keep chi2 sane
    common = {s for s, v in Counter(sig).items() if v >= 3}
    sigc = [s if s in common else 'other' for s in sig]
    first = ['first' if c['ord'] == gstart[c['group']] else 'rest' for c in cs]
    posc = []
    for c in cs:
        k = c['ord'] - gstart[c['group']]; n = gsize[c['group']]
        posc.append('first' if k == 0 else ('last' if k == n - 1 else 'mid'))
    gs = ['g' + str(min(gsize[c['group']], 7)) for c in cs]
    o1, p1 = chi_perm(first, sigc, rng); o2, p2 = chi_perm(posc, sigc, rng); o3, p3 = chi_perm(gs, sigc, rng)
    tf = Counter(s for s, f in zip(sigc, first) if f == 'first').most_common(2)
    tr = Counter(s for s, f in zip(sigc, first) if f == 'rest').most_common(2)
    print(f'{kid:7}{len(cs):4}{len(groups):7}{o1:20.1f}{p1:7.3f}{o2:15.1f}{p2:7.3f}{o3:12.1f}{p3:7.3f}   {tf} | {tr}')

# ---------- summary table ----------
print('\n=== SUMMARY (s4 sign = colour × knot signature; level-1 pendants) ===')
def col(grp):
    i = [v for (s, g, _), v in inv.items() if s == 's4' and g == grp]
    e = [v for (s, g, _), v in ent.items() if s == 's4' and g == grp]
    r = [v for (s, g, _, n), v in rep.items() if s == 's4' and g == grp and n == 3]
    return dict(n=len(e), tt=med([x['tt'] for x in i]), zipf=med([x['zipf'] for x in i]), h1=med([x['h1'] for x in e]),
                ratio=med([x['ratio'] for x in e]), z=med([x['z'] for x in e]), rz=med([x[3] for x in r if math.isfinite(x[3])]))
a, b = col('NN'), col('NUM')
print(f'{"":14}{"NN":>8}{"NUM":>8}')
for k, lab in (('n', 'khipus'), ('tt', 'types/tokens'), ('zipf', 'Zipf slope'), ('h1', 'H1'), ('ratio', 'H2/H1'), ('z', 'H2 z vs shuf'), ('rz', '3-gram rep z')):
    print(f'{lab:14}{a[k]:8.2f}{b[k]:8.2f}')

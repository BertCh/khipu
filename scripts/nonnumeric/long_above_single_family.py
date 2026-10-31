#!/usr/bin/env python3
"""Family B: khipus with long / figure-eight knots ABOVE single knots, and the
khipus the Aschers declined to read.  Sections 1-5 as in the directive.

    python3 famB/analysis.py            # everything
    python3 famB/analysis.py 1 2        # chosen sections
"""
from __future__ import annotations
import json, glob, random, statistics, sqlite3, sys, re, math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path('/Users/roc8917/Documents/GitHub/khipu')
DATA = ROOT / 'public/data/khipus'
DB = ROOT / 'data/okr/data/khipu.db'
CORE = ['KH0100', 'KH0108', 'KH0103', 'KH0094', 'KH0001', 'KH0415', 'KH0431', 'KH0441',
        'KH0676', 'KH0015', 'KH0047', 'KH0048', 'KH0584']
LOW = ['KH0360', 'KH0332', 'KH0477', 'KH0030', 'KH0365']
GAFFRON = ['KH0100', 'KH0102', 'KH0103', 'KH0105', 'KH0106', 'KH0107', 'KH0108', 'KH0109', 'KH0101', 'KH0104', 'KH0261']
UNIT = {'L', 'E', 'EE', 'LL', 'BL', 'SP', 'TF'}
SEED = 4242
SHUF = 200
BAND_GAP = 3.0  # cm gap that separates two position bands


def load(kid):
    return json.loads((DATA / f'{kid}.json').read_text())


def seq(c):
    return sorted(c['knots'], key=lambda x: x['pos'])


def sig(c):
    return ' '.join(x['type'] for x in seq(c))


def knotted(k):
    return [c for c in k['cords'] if c['knots']]


def digit(x):
    """Digit a cluster would stand for if it were a digit: S count, L turns, E/EE 1, others turns."""
    if x['type'] == 'S':
        return x['n']
    if x['type'] in ('E', 'TF'):
        return 1
    if x['type'] == 'EE':
        return 2
    return x['n']


def bands(k, gap=BAND_GAP):
    """Khipu-wide position bands for level-1 cords: 1-D k-means on all cluster positions,
    k = the 90th-percentile number of clusters per cord (2..5).  Returns sorted band centres."""
    L1 = [c for c in k['cords'] if c['level'] == 1 and c['knots']]
    pos = sorted(x['pos'] for c in L1 for x in c['knots'])
    if len(pos) < 4:
        return []
    per = sorted(len(c['knots']) for c in L1)
    kk = max(2, min(5, per[int(0.9 * (len(per) - 1))]))
    cents = [statistics.quantiles(pos, n=kk + 1)[i] for i in range(kk)] if kk > 1 else [statistics.mean(pos)]
    for _ in range(50):
        groups = [[] for _ in cents]
        for p in pos:
            groups[min(range(kk), key=lambda i: abs(p - cents[i]))].append(p)
        new = [statistics.mean(g) if g else cents[i] for i, g in enumerate(groups)]
        if all(abs(a - b) < 1e-6 for a, b in zip(new, cents)):
            break
        cents = new
    return sorted(cents)


def band_of(p, edges):
    return min(range(len(edges)), key=lambda i: abs(p - edges[i]))


# ---------- value readings ----------
def v_kfg(c, k=None, edges=None):
    return c['value']


def v_kfg_rule(c, k=None, edges=None):
    """The rule memory says the KFG applies on KH0100: singles place-valued by rank from the
    bottom (lowest S cluster = 10), long/E add their turns wherever they sit."""
    s = seq(c)
    S = [x for x in s if x['type'] == 'S']
    v = 0
    for r, x in enumerate(reversed(S)):
        v += x['n'] * 10 ** (r + 1)
    for x in s:
        if x['type'] != 'S':
            v += digit(x)
    return v


def v_standard(c, k=None, edges=None):
    """Orthodox Inka: bottom cluster is units only if it is L/E; every S cluster is place
    valued by rank from the bottom (starting at 10 if there is a units knot, else 10 too --
    a lone S cluster at the bottom is read as tens, as the KFG does)."""
    return v_kfg_rule(c)


def v_bottom_up(c, k=None, edges=None):
    """Reversed: the top cluster is units, each lower cluster one place higher; digit = count/turns."""
    s = seq(c)
    return sum(digit(x) * 10 ** i for i, x in enumerate(s))


def v_top_down_digits(c, k=None, edges=None):
    """Every cluster is a digit, top = highest place (cord-local ranks)."""
    s = seq(c)
    m = len(s)
    return sum(digit(x) * 10 ** (m - 1 - i) for i, x in enumerate(s))


def v_band_digits(c, k, edges):
    """Every cluster is a digit in its khipu-wide band; lowest band = units.  Level>1 cords
    fall back to cord-local ranks."""
    s = seq(c)
    if c['level'] != 1 or not edges:
        return v_top_down_digits(c)
    nb = len(edges)
    v = 0
    for x in s:
        b = band_of(x['pos'], edges)
        v += digit(x) * 10 ** (nb - 1 - b)
    return v


def v_turn_sum(c, k=None, edges=None):
    return sum(digit(x) for x in seq(c))


def v_tally(c, k=None, edges=None):
    """Non-positional tally: every single knot = 10, long knots = turns, E = 1 (the rule the
    KFG values of KH0001/KH0415/KH0015/KH0441 follow)."""
    return sum(10 * x['n'] if x['type'] == 'S' else digit(x) for x in c['knots'])


READINGS = {
    'H1 KFG value': v_kfg,
    'H6 tally S=10': v_tally,
    'H2 bottom-up': v_bottom_up,
    'H3 band digits': v_band_digits,
    'H4 turn sum': v_turn_sum,
    'H5 top-down digits': v_top_down_digits,
}


# ---------- arithmetic consistency ----------
def level1(k):
    return sorted((c for c in k['cords'] if c['level'] == 1), key=lambda c: c['ordinal'])


def consistency(vals1, subs, groups, min_val=2):
    """vals1: list of values of level-1 cords in order; subs: list (same order) of lists of
    subsidiary values; groups: list of index lists.  Counts
      (a) cords equal to the sum of a run of >=2 immediate neighbours on one side (fewest summands),
      (b) cords equal to the sum of their >=2 subsidiaries,
      (c) pairs of groups with equal non-zero totals."""
    n = len(vals1)
    a = 0
    for i, v in enumerate(vals1):
        if v is None or v < min_val:
            continue
        hit = False
        for side in (1, -1):
            s = 0
            j = i + side
            cnt = 0
            while 0 <= j < n:
                vj = vals1[j]
                if vj is None:
                    break
                s += vj
                cnt += 1
                if s == v and cnt >= 2:
                    hit = True
                    break
                if s > v:
                    break
                j += side
            if hit:
                break
        a += hit
    b = 0
    for v, sl in zip(vals1, subs):
        if v is not None and v >= min_val and len(sl) >= 2 and all(x is not None for x in sl) and sum(sl) == v:
            b += 1
    c = 0
    tot = []
    for g in groups:
        vs = [vals1[i] for i in g if vals1[i] is not None]
        if vs and sum(vs) > 0:
            tot.append(sum(vs))
    cnt = Counter(tot)
    for t, m in cnt.items():
        c += m * (m - 1) // 2
    return a, b, c


def test_readings(k, shuf=SHUF, seed=SEED):
    edges = bands(k)
    L1 = level1(k)
    byname = {c['name']: c for c in k['cords']}
    children = defaultdict(list)
    for c in k['cords']:
        if c['level'] == 2 and c.get('parent'):
            children[c['parent']].append(c)
    groups = defaultdict(list)
    for i, c in enumerate(L1):
        if c.get('group') is not None:
            groups[c['group']].append(i)
    groups = list(groups.values())
    out = {}
    for name, fn in READINGS.items():
        vals1 = [fn(c, k, edges) if c['knots'] else 0 for c in L1]
        subs = [[fn(s, k, edges) if s['knots'] else 0 for s in children[c['name']]] for c in L1]
        obs = consistency(vals1, subs, groups)
        rng = random.Random(seed)
        null = []
        allsub = [v for sl in subs for v in sl]
        for _ in range(shuf):
            sv = vals1[:]
            rng.shuffle(sv)
            ss = allsub[:]
            rng.shuffle(ss)
            it = iter(ss)
            ssub = [[next(it) for _ in sl] for sl in subs]
            null.append(consistency(sv, ssub, groups))
        tot_obs = sum(obs)
        tot_null = [sum(x) for x in null]
        mu = statistics.mean(tot_null)
        sd = statistics.pstdev(tot_null) or 1e-9
        p = sum(1 for x in tot_null if x >= tot_obs) / shuf
        out[name] = dict(obs=obs, tot=tot_obs, mu=round(mu, 2), sd=round(sd, 2), z=round((tot_obs - mu) / sd, 2), p=p)
    return out


# ---------- section 1 ----------
def section1(kids):
    print('\n=== 1. inventory, bands, direction, value rule ===')
    print(f"{'khipu':8}{'alias':12}{'knotted':>8}{'sigs':>5}{'uS':>4}{'2L':>4}{'Lrank>=1':>9}{'P(L below S)':>13}{'bands':>6}{'dirL':>14}{'dirS':>14}{'KFGrule':>9}  best-fitting reading")
    for kid in kids:
        k = load(kid)
        kc = knotted(k)
        sigs = Counter(sig(c) for c in kc)
        edges = bands(k)
        uS = sum(1 for c in kc if any(x['type'] in UNIT for x in c['knots']) and any(x['type'] == 'S' for x in c['knots'])
                 and min(x['pos'] for x in c['knots'] if x['type'] in UNIT) < max(x['pos'] for x in c['knots'] if x['type'] == 'S'))
        twoL = sum(1 for c in kc if sum(1 for x in c['knots'] if x['type'] in UNIT) >= 2)
        # long knots at rank >= 1 from the bottom (cord-local)
        nL = 0
        nLhigh = 0
        for c in kc:
            s = seq(c)
            for r, x in enumerate(reversed(s)):
                if x['type'] in UNIT:
                    nL += 1
                    if r >= 1:
                        nLhigh += 1
        # P(unit knot hangs below single knot), level-1 cords, absolute cm
        Spos = [x['pos'] for c in k['cords'] if c['level'] == 1 for x in c['knots'] if x['type'] == 'S']
        Lpos = [x['pos'] for c in k['cords'] if c['level'] == 1 for x in c['knots'] if x['type'] in UNIT]
        ov = sum(1 for l in Lpos for s_ in Spos if l > s_) / (len(Lpos) * len(Spos)) if Lpos and Spos else float('nan')
        # which reading reproduces the KFG values?
        fits = {n: sum(1 for c in kc if c['value'] is not None and fn(c, k, edges) == c['value']) for n, fn in READINGS.items() if n != 'H1 KFG value'}
        fits['KFG rule'] = sum(1 for c in kc if c['value'] is not None and v_kfg_rule(c) == c['value'])
        best = max(fits.items(), key=lambda t: t[1])
        dL = Counter(ch for c in kc for x in c['knots'] if x['type'] in UNIT for ch in set(x['dir']))
        dS = Counter(ch for c in kc for x in c['knots'] if x['type'] == 'S' for ch in set(x['dir']))
        ruleok = sum(1 for c in kc if c['value'] is not None and v_kfg_rule(c) == c['value'])
        stdok = sum(1 for c in kc if c['value'] is not None and v_standard(c) == c['value'])
        fmt = lambda d: '/'.join(f'{a}{d[a]}' for a in 'SZU' if d.get(a))
        print(f"{kid:8}{k['aliases'][0][:11]:12}{len(kc):8}{len(sigs):5}{uS:4}{twoL:4}{nLhigh:5}/{nL:<4}{ov:13.2f}{len(edges):6}{fmt(dL):>14}{fmt(dS):>14}{ruleok:5}/{len(kc):<4} {best[0]} {best[1]}/{len(kc)}")
        top = ', '.join(f'{s}×{n}' for s, n in sigs.most_common(8))
        print(f"          sigs: {top}")
        print(f"          band centres (cm): {[round(a,1) for a in edges]}")
    print("uS = cords with a unit-type knot above a single-knot cluster; 2L = cords with >=2 unit-type knots;")
    print("Lrank>=1 = unit-type knots not in the lowest cluster of their cord; P(L below S) = share of (unit, single)")
    print("knot pairs on level-1 cords with the unit knot lower (1.0 = orthodox); KFGrule = cords whose KFG value")
    print("equals 'singles place-valued from the bottom + turns of every long/E knot'; dirL counts E knots too.")


# ---------- section 2 ----------
def section2(kids):
    print('\n=== 2. arithmetic consistency of five readings (z vs 200 within-khipu shuffles) ===')
    names = list(READINGS)
    print(f"{'khipu':8}" + ''.join(f"{n[:16]:>18}" for n in names))
    pooled = defaultdict(list)
    for kid in kids:
        k = load(kid)
        res = test_readings(k)
        row = f"{kid:8}"
        for n in names:
            r = res[n]
            row += f"{r['tot']:4}({r['obs'][0]},{r['obs'][1]},{r['obs'][2]}) z{r['z']:+5.1f}"
            pooled[n].append(r)
        print(row)
    print('pooled (Stouffer z = sum z / sqrt(n); mean obs-mu):')
    for n in names:
        zs = [r['z'] for r in pooled[n]]
        ex = [r['tot'] - r['mu'] for r in pooled[n]]
        print(f"  {n:20} Stouffer z {sum(zs)/math.sqrt(len(zs)):+5.2f}   mean excess {statistics.mean(ex):+5.2f}   khipus with p<0.05: {sum(1 for r in pooled[n] if r['p']<0.05)}/{len(zs)}")
    print("cells: total relations (neighbour-run sums, subsidiary sums, equal group totals) and z against shuffles")


# ---------- section 3 ----------
def chi2(flag, attr):
    cats = sorted(set(attr))
    n = len(flag)
    n1 = sum(flag)
    if n1 == 0 or n1 == n:
        return 0.0
    s = 0.0
    for a in cats:
        na = sum(1 for x in attr if x == a)
        o = sum(1 for f, x in zip(flag, attr) if x == a and f)
        e = na * n1 / n
        if e > 0:
            s += (o - e) ** 2 / e
            e0 = na - e
            s += ((na - o) - e0) ** 2 / e0 if e0 > 0 else 0
    return s


def section3(kids, shuf=1000):
    print('\n=== 3. does the anomaly sit on particular cords? (permutation chi2, 1000 shuffles) ===')
    for kid in kids:
        k = load(kid)
        kc = knotted(k)
        if len(kc) < 20:
            continue
        haschild = {c['parent'] for c in k['cords'] if c.get('parent')}
        flags = {
            'L_above_S': [int(any(x['type'] in UNIT for x in c['knots']) and any(x['type'] == 'S' for x in c['knots'])
                              and min(x['pos'] for x in c['knots'] if x['type'] in UNIT) < max(x['pos'] for x in c['knots'] if x['type'] == 'S')) for c in kc],
            'two_L': [int(sum(1 for x in c['knots'] if x['type'] in UNIT) >= 2) for c in kc],
        }

        def majdir(c):
            d = Counter(ch for x in c['knots'] for ch in x['dir'] if ch in 'SZ')
            if not d:
                return 'U'
            if len(d) == 2:
                return 'mixed'
            return next(iter(d))

        def ordcat(c):
            if c['level'] != 1 or c.get('group') is None:
                return 'na'
            g = k['groups'][c['group']]
            o = c['ordinal'] - g['first'] + 1
            return str(min(o, 6))

        attrs = {
            'attach': [c['attach'] or 'U' for c in kc],
            'twist': [c['twist'] or 'U' for c in kc],
            'colour': [c['color'] or '?' for c in kc],
            'knotdir': [majdir(c) for c in kc],
            'ord_in_group': [ordcat(c) for c in kc],
            'has_subs': [int(c['name'] in haschild) for c in kc],
            'level': [str(c['level']) for c in kc],
        }
        rng = random.Random(SEED)
        out = []
        for fname, flag in flags.items():
            if sum(flag) < 5 or sum(flag) > len(flag) - 5:
                continue
            for aname, attr in attrs.items():
                if len(set(attr)) < 2:
                    continue
                obs = chi2(flag, attr)
                null = []
                for _ in range(shuf):
                    f2 = flag[:]
                    rng.shuffle(f2)
                    null.append(chi2(f2, attr))
                p = sum(1 for x in null if x >= obs) / shuf
                if p < 0.01:
                    # describe direction
                    cats = sorted(set(attr))
                    desc = ', '.join(f"{a}:{sum(1 for f,x in zip(flag,attr) if x==a and f)}/{sum(1 for x in attr if x==a)}" for a in cats if sum(1 for x in attr if x == a) >= 3)
                    out.append(f"    {fname} ~ {aname}: p={p:.3f} chi2={obs:.1f}  [{desc[:150]}]")
        print(f"{kid} ({len(kc)} knotted cords): " + ('none at p<0.01' if not out else ''))
        for o in out:
            print(o)


# ---------- section 4 ----------
def section4(kids=('KH0047', 'KH0048', 'KH0584', 'KH0094')):
    print('\n=== 4. why were KH0047/KH0048/KH0584/KH0094 rejected? knot heights per cord ===')
    for kid in kids:
        k = load(kid)
        L1 = [c for c in level1(k) if c['knots']]
        print(f"\n{kid} {k['aliases']}  level-1 knotted cords {len(L1)}  primary {k['primary']['length']} cm")
        print(f"  {'cord':7}{'grp':>4}{'len':>6}{'colour':12} knots (type turns @cm dir)            value  [pos from cord end]")
        for c in L1:
            s = seq(c)
            ks = ' '.join(f"{x['n']}{x['type']}@{x['pos']}{x['dir'] if x['dir']!='U' else ''}" for x in s)
            fe = ' '.join(f"{round(c['length']-x['pos'],1)}" for x in s) if c['length'] else ''
            print(f"  {c['name']:7}{str(c.get('group')):>4}{str(c['length']):>6}{(c['color'] or '')[:11]:12} {ks:38} {str(c['value']):>6}  [{fe}]")
        # band consistency: positions of lowest cluster and of the tens (second lowest) by type
        low = [(seq(c)[-1]['type'], seq(c)[-1]['pos'], c['length']) for c in L1]
        Spos = [x['pos'] for c in L1 for x in c['knots'] if x['type'] == 'S']
        Lpos = [x['pos'] for c in L1 for x in c['knots'] if x['type'] in UNIT]
        auc = sum(1 for l in Lpos for s in Spos if l > s) / (len(Lpos) * len(Spos)) if Lpos and Spos else float('nan')
        # same from the cord end
        Spe = [c['length'] - x['pos'] for c in L1 for x in c['knots'] if x['type'] == 'S' and c['length']]
        Lpe = [c['length'] - x['pos'] for c in L1 for x in c['knots'] if x['type'] in UNIT and c['length']]
        auc_e = sum(1 for l in Lpe for s in Spe if l < s) / (len(Lpe) * len(Spe)) if Lpe and Spe else float('nan')
        cv = lambda xs: statistics.pstdev(xs) / statistics.mean(xs) if len(xs) > 1 and statistics.mean(xs) else float('nan')
        lowS = [p for t, p, _ in low if t == 'S']
        lowL = [p for t, p, _ in low if t in UNIT]
        print(f"  P(L below S) from attachment {auc:.2f}; from cord end {auc_e:.2f};  n S {len(Spos)} n L {len(Lpos)}")
        print(f"  lowest cluster height: when S mean {statistics.mean(lowS) if lowS else float('nan'):.1f} cv {cv(lowS):.2f} (n{len(lowS)}); when L mean {statistics.mean(lowL) if lowL else float('nan'):.1f} cv {cv(lowL):.2f} (n{len(lowL)})")
        edges = bands(k)
        print(f"  k-means band centres: {[round(a,1) for a in edges]}")
        # on cords with >=2 clusters: spacing between consecutive clusters
        gaps = [round(seq(c)[i+1]['pos'] - seq(c)[i]['pos'], 1) for c in L1 for i in range(len(seq(c)) - 1)]
        if gaps:
            print(f"  inter-cluster gaps on a cord: n {len(gaps)} median {statistics.median(gaps)} min {min(gaps)} max {max(gaps)} cv {cv(gaps):.2f}")
    # reference: a numeric khipu for the same measures
    print('\n  reference numeric khipus (same measures):')
    for kid in ('KH0081', 'KH0028', 'KH0699'):
        k = load(kid)
        L1 = [c for c in level1(k) if c['knots']]
        Spos = [x['pos'] for c in L1 for x in c['knots'] if x['type'] == 'S']
        Lpos = [x['pos'] for c in L1 for x in c['knots'] if x['type'] in UNIT]
        auc = sum(1 for l in Lpos for s in Spos if l > s) / (len(Lpos) * len(Spos)) if Lpos and Spos else float('nan')
        gaps = [seq(c)[i+1]['pos'] - seq(c)[i]['pos'] for c in L1 for i in range(len(seq(c)) - 1)]
        cvg = statistics.pstdev(gaps) / statistics.mean(gaps) if gaps else float('nan')
        low = [seq(c)[-1]['pos'] for c in L1]
        print(f"  {kid}: P(L below S) {auc:.2f}; gap cv {cvg:.2f}; lowest-cluster height cv {statistics.pstdev(low)/statistics.mean(low):.2f}")


# ---------- section 5 ----------
def section5():
    print('\n=== 5. the Gaffron (Munich) set: shared convention? ===')
    print(f"{'khipu':8}{'alias':12}{'knotted':>8}{'sigs':>5}{'uS':>4}{'2L':>4}{'L>=10':>6}{'nL':>5}{'L dir S/Z/U':>13}{'S dir S/Z/U':>13}{'E':>4}{'BAD%':>6}")
    db = sqlite3.connect(DB)
    for kid in GAFFRON:
        try:
            k = load(kid)
        except FileNotFoundError:
            print(kid, 'missing')
            continue
        kc = knotted(k)
        sigs = Counter(sig(c) for c in kc)
        uS = sum(1 for c in kc if any(x['type'] in UNIT for x in c['knots']) and any(x['type'] == 'S' for x in c['knots'])
                 and min(x['pos'] for x in c['knots'] if x['type'] in UNIT) < max(x['pos'] for x in c['knots'] if x['type'] == 'S'))
        twoL = sum(1 for c in kc if sum(1 for x in c['knots'] if x['type'] in UNIT) >= 2)
        Ls = [x for c in kc for x in c['knots'] if x['type'] == 'L']
        big = sum(1 for x in Ls if x['n'] >= 10)
        dL = Counter(ch for x in Ls for ch in set(x['dir']))
        dS = Counter(ch for c in kc for x in c['knots'] if x['type'] == 'S' for ch in set(x['dir']))
        nE = sum(1 for c in kc for x in c['knots'] if x['type'] == 'E')
        bad = uS + sum(1 for c in kc if sum(1 for x in c['knots'] if x['type'] in UNIT) >= 2 and not (any(x['type'] in UNIT for x in c['knots']) and any(x['type'] == 'S' for x in c['knots']) and min(x['pos'] for x in c['knots'] if x['type'] in UNIT) < max(x['pos'] for x in c['knots'] if x['type'] == 'S')))
        f = lambda d: f"{d.get('S',0)}/{d.get('Z',0)}/{d.get('U',0)}"
        okr = db.execute("select INVESTIGATOR_NUM, PROVENANCE from khipu_main where OKR_NUM=?", (kid,)).fetchone()
        print(f"{kid:8}{k['aliases'][0][:11]:12}{len(kc):8}{len(sigs):5}{uS:4}{twoL:4}{big:6}{len(Ls):5}{f(dL):>13}{f(dS):>13}{nE:4}{100*bad/len(kc) if kc else 0:6.0f}  {okr}")
        print('          ' + ', '.join(f'{s}×{n}' for s, n in sigs.most_common(6)))
    # turn-count distribution of L knots in the anomalous Gaffron trio vs the others
    print('\n  long-knot turn counts:')
    for kid in GAFFRON:
        try:
            k = load(kid)
        except FileNotFoundError:
            continue
        t = Counter(x['n'] for c in k['cords'] for x in c['knots'] if x['type'] == 'L')
        print(f"  {kid}: " + ' '.join(f"{n}:{t[n]}" for n in sorted(t)))
    print('\n  OKR notes mentioning reversed knots / axis, Gaffron set:')
    for kid in GAFFRON:
        row = db.execute("select NOTES from khipu_main where OKR_NUM=?", (kid,)).fetchone()
        if row and row[0]:
            for m in re.finditer(r'[^.\n]*(revers|axis|Z or|no axis)[^.\n]*', row[0], re.I):
                print(f"  {kid}: {m.group(0).strip()[:200]}")
    # cord notes
    rows = db.execute("select m.OKR_NUM, c.INVESTIGATOR_CORD_NUM, c.CORD_NOTES from cord c join khipu_main m on c.KHIPU_ID=m.KHIPU_ID where m.OKR_NUM in (%s) and c.CORD_NOTES is not null and c.CORD_NOTES<>''" % ','.join('?' * len(GAFFRON)), GAFFRON).fetchall()
    print(f"  cord notes in Gaffron set: {len(rows)}")
    for r in rows[:20]:
        print('   ', r[0], r[1], r[2][:150].replace('\n', ' '))


if __name__ == '__main__':
    secs = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4, 5]
    kids = CORE + LOW
    if 1 in secs:
        section1(kids)
    if 2 in secs:
        section2(kids)
    if 3 in secs:
        section3(kids)
    if 4 in secs:
        section4()
    if 5 in secs:
        section5()

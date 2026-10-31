#!/usr/bin/env python3
"""(b3) Group-size-sequence twins and accession adjacency.

For all khipu pairs with >= 8 groups each and |#groups diff| <= 3: normalized Levenshtein distance between
the group-size sequences (forward and reversed, min).  'Form twin' = distance <= 0.15.
Information content: a twin whose sequence is a constant or period-2 repetition (e.g. 10,10,10.. or 1,6,1,6..)
is flagged 'periodic' because those forms are common templates.
Tests: form-twin rate among accession-adjacent pairs vs same-museum same-recorder non-adjacent pairs vs all
pairs (Fisher exact + resampling).  Positive control: share of known links that are form twins.
Null for an individual twin: matched random pairs (same #groups +-3), share of pairs at <= its distance.
"""
import collections, itertools, json
import numpy as np
from scipy.stats import fisher_exact
import meta_common as mc

ks = mc.load(); N = len(ks); idx = {k["id"]: i for i, k in enumerate(ks)}
G = [[g["n"] for g in (k["groups"] or [])] for k in ks]

def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

def dist(a, b):
    return min(lev(a, b), lev(a, b[::-1])) / max(len(a), len(b))

def periodic(a):
    for p in (1, 2):
        if sum(a[t] == a[t - p] for t in range(p, len(a))) >= 0.8 * (len(a) - p): return True
    return False

el = [i for i in range(N) if 8 <= len(G[i]) <= 120]
D = {}
for a, b in itertools.combinations(el, 2):
    if abs(len(G[a]) - len(G[b])) <= 3:
        D[(a, b)] = dist(G[a], G[b])
print(f"eligible khipus {len(el)}, compared pairs {len(D)}")
twins = {p: d for p, d in D.items() if d <= 0.15}
acc = [(mc.accession(k["museum"]["number"]), k["museum"]["canonical"]) for k in ks]
def adjacent(i, j):
    a, b = acc[i], acc[j]
    return bool(a[0] and b[0] and a[1] == b[1] and a[0][0] == b[0][0] and abs(a[0][1] - b[0][1]) <= 1)
def samemus(i, j):
    return acc[i][1] is not None and acc[i][1] == acc[j][1] and ks[i]["_rec"] == ks[j]["_rec"]
known = mc.vc.known_all()
cat = collections.Counter()
for p, d in D.items():
    i, j = p; t = d <= 0.15
    c = "adj" if adjacent(i, j) else "mus" if samemus(i, j) else "other"
    cat[(c, t)] += 1
for c in ("adj", "mus", "other"):
    n1, n0 = cat[(c, True)], cat[(c, False)]
    print(f"  {c:5s}: twins {n1}/{n1 + n0} = {n1 / max(n1 + n0, 1):.4f}")
t = [[cat[("adj", True)], cat[("adj", False)]], [cat[("mus", True)], cat[("mus", False)]]]
print("  Fisher adjacent vs same-museum non-adjacent:", fisher_exact(t, alternative="greater"))
t2 = [[cat[("mus", True)], cat[("mus", False)]], [cat[("other", True)], cat[("other", False)]]]
print("  Fisher same-museum vs other:", fisher_exact(t2, alternative="greater"))
# positive control
kd = [(a, b, D.get(tuple(sorted((idx[a], idx[b]))))) for a, b in known if a in idx and b in idx]
kd_ = [x for x in kd if x[2] is not None]
print(f"positive control: known links comparable {len(kd_)}/{len(kd)}; form twins among them {sum(x[2] <= .15 for x in kd_)}")
# twin list with matched null
bylen = collections.defaultdict(list)
for p, d in D.items(): bylen[len(G[p[0]])].append(d)
out = []
for (i, j), d in sorted(twins.items(), key=lambda x: x[1]):
    pool = [x for L in range(len(G[i]) - 3, len(G[i]) + 4) for x in bylen.get(L, [])]
    p = (1 + sum(x <= d for x in pool)) / (1 + len(pool))
    a, b = ks[i]["id"], ks[j]["id"]
    out.append(dict(a=a, b=b, d=round(d, 3), p=p, nG=(len(G[i]), len(G[j])), periodic=periodic(G[i]),
                    adj=adjacent(i, j), samemus=samemus(i, j), known=tuple(sorted((a, b))) in known,
                    mus=(acc[i][1], acc[j][1]), accn=(ks[i]["museum"]["number"], ks[j]["museum"]["number"]),
                    reg=(ks[i]["_region"], ks[j]["_region"]), rec=(ks[i]["_rec"], ks[j]["_rec"]), form=G[i][:24]))
nonper = [o for o in out if not o["periodic"]]
print(f"\nform twins: {len(out)} ({len(nonper)} non-periodic). Non-periodic twins:")
for o in nonper:
    print(f"  {o['a']}-{o['b']} d={o['d']} p={o['p']:.2e} nG={o['nG']} {'ADJ' if o['adj'] else ''}{'MUS' if o['samemus'] else ''} "
          f"{'KNOWN' if o['known'] else ''} {o['accn']} {o['rec']} {o['reg']} form={o['form']}")
print("periodic twins (templates), adjacency share:", np.mean([o['adj'] for o in out if o['periodic']]) if out else None)
for o in out:
    if o["periodic"] and (o["adj"] or o["samemus"]):
        print(f"  [periodic] {o['a']}-{o['b']} d={o['d']} {'ADJ' if o['adj'] else 'MUS'} {o['accn']} form={o['form'][:12]}")
json.dump(dict(cat={f"{k[0]}|{k[1]}": v for k, v in cat.items()}, twins=out), open(mc.OUT / "b3_groupforms.json", "w"), indent=1, default=str)

# recorder-controlled version: same recorder, different museum as the comparison class
cat2 = collections.Counter()
for (i, j), d in D.items():
    if ks[i]["_rec"] != ks[j]["_rec"]: continue
    c = "adj" if adjacent(i, j) else "mus" if samemus(i, j) else "rec_only"
    cat2[(c, d <= 0.15)] += 1
print("\nsame-recorder pairs only:")
for c in ("adj", "mus", "rec_only"):
    n1, n0 = cat2[(c, True)], cat2[(c, False)]; print(f"  {c:8s} twins {n1}/{n1 + n0} = {n1 / max(1, n1 + n0):.4f}")
print("  Fisher same-museum vs same-recorder-other-museum:",
      fisher_exact([[cat2[("mus", True)], cat2[("mus", False)]], [cat2[("rec_only", True)], cat2[("rec_only", False)]]], alternative="greater"))

# the 'all pairs' form (>= 8 groups, >= 80% of groups of size 2): region distribution vs corpus
pairform = [i for i in range(N) if len(G[i]) >= 8 and sum(x == 2 for x in G[i]) >= 0.8 * len(G[i])]
print(f"\n'groups-of-2' form (>=8 groups, >=80% size 2): {len(pairform)} khipus")
for i in pairform:
    print(f"   {ks[i]['id']} {ks[i]['museum']['number']} {ks[i]['_rec']} {ks[i]['_region']} nG={len(G[i])}")
lab = [ks[i]["_macro"] for i in pairform if ks[i]["_macro"]]
base = collections.Counter(k["_macro"] for k in ks if k["_macro"] and len(G[idx[k['id']]]) >= 8)
print("  macro of provenanced pair-form khipus:", collections.Counter(lab), " base (>=8 groups):", dict(base))
from scipy.stats import binomtest
ns = sum(1 for l in lab if l == "South"); ps = base["South"] / sum(base.values())
print("  binomial test South share:", ns, len(lab), round(ps, 3), binomtest(ns, len(lab), ps, alternative="greater").pvalue)
recb = collections.Counter(ks[i]["_rec"] for i in pairform); print("  recorders:", recb)
# within-Ascher control (Ascher dominates the pair form; is it Ascher's grouping habit or the South?)
la = [ks[i]["_macro"] for i in pairform if ks[i]["_macro"] and ks[i]["_rec"] == "Ascher"]
ba = collections.Counter(k["_macro"] for k in ks if k["_macro"] and k["_rec"] == "Ascher" and len(G[idx[k['id']]]) >= 8)
ns = sum(1 for l in la if l == "South"); ps = ba["South"] / sum(ba.values())
print(f"  within Ascher: South {ns}/{len(la)} vs Ascher base {dict(ba)} share {ps:.3f}; binomial p={binomtest(ns, len(la), ps, alternative='greater').pvalue:.4f}")

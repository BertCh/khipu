"""Step 2: splice test applied to our existing object / fragment claims and to
same-accession multi-part objects."""
import sys, json, re, itertools, collections
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import *

ks = load_all()
NOVALUE = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384",
           "KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
pool = {k: vals(v) for k, v in ks.items() if k not in NOVALUE}

def norm_acc(num):
    s = re.sub(r"\s+", "", (num or "").upper())
    s = re.sub(r"\(.*?\)$", "", s)
    s = re.sub(r"(?<=\d)[A-Z]{1,2}$", "", s)
    return s

acc = collections.defaultdict(list)
for kid, k in ks.items():
    m = k.get("museum") or {}
    for part in re.split(r"[;,]", m.get("number") or ""):
        n = norm_acc(part)
        if n and n not in ("UNNUMBERED", "S/N"):
            acc[(m.get("canonical"), n)].append(kid)
pairs = {}
basel = [f"KH{n:04d}" for n in range(682, 692)]
for a, b in itertools.combinations(basel, 2): pairs[(a, b)] = "basel"
for a, b, why in [("KH0450", "KH0147", "unit-rule pair"), ("KH0121", "KH0473", "same khipu twice (claimed)"),
                  ("KH0140", "KH0483", "same khipu twice (claimed)"), ("KH0469", "KH0470", "object"),
                  ("KH0028", "KH0027", "object"), ("KH0114", "KH0115", "object (2 parts)"),
                  ("KH0138", "KH0139", "object (detail record)"), ("KH0464", "KH0465", "object (knotted)")]:
    pairs[tuple(sorted((a, b)))] = why
for b in basel:
    for x in ("KH0450", "KH0147"):
        pairs.setdefault(tuple(sorted((b, x))), "basel-vs-berlin")
for (mus, n), ids in acc.items():
    ids = sorted(set(ids))
    if 1 < len(ids) <= 10:
        for a, b in itertools.combinations(ids, 2):
            pairs.setdefault((a, b), f"same accession {n}")

def run(item):
    (a, b), why = item
    if a in NOVALUE or b in NOVALUE: return None
    va, vb = vals(ks[a]), vals(ks[b])
    if len(va) < 2 or len(vb) < 2: return None
    ga = [c["group"] for c in pendants(ks[a])]; gb = [c["group"] for c in pendants(ks[b])]
    r = calibrated(Frag(va, a), Frag(vb, b), pool, {a, b}, {}, gA=ga, gB=gb, n_shuf=100)
    return dict(a=a, b=b, why=why, **r)

if __name__ == "__main__":
    from multiprocessing import Pool
    with Pool(6) as P:
        rows = [r for r in P.map(run, sorted(pairs.items()), chunksize=1) if r]
    for r in rows:
        x = r["all"]; y = r["local"]
        zs = {s: x[s]["z"] for s in ("replB", "replA", "shufB", "shufA") if s in x}
        print(f"{r['a']} {r['b']} {r['why'][:28]:<28} n={r['nA']}/{r['nB']} all={x['obs']} p={x['p']} z={zs} | local T={y['T']} p={y['p']}")
    json.dump(rows, open(OUT / "mk_join_claims.json", "w"), indent=1)

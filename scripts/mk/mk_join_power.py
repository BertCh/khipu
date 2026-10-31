"""Positive control: cut intact khipus (>= 8 groups, >= 5 internal pendant-pendant
sums) at the middle group boundary and apply the same calibrated test as the
screen (T = max over 4 configs; nulls = 60 group shuffles and <= 60 matched real
partners, each side).  Power = share of TRUE joins that the test detects."""
import sys, json, math
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import *

ks = load_all()
NOVALUE = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384",
           "KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
pool = {k: vals(v) for k, v in ks.items() if k not in NOVALUE}
rng = np.random.default_rng(5)
def one(kid):
    rng = np.random.default_rng(int(kid[2:]))
    d = ks[kid]
    cs = pendants(d); v = [int(c["value"] or 0) for c in cs]; g = [c["group"] for c in cs]
    gl = sorted(set(g))
    mid = gl[len(gl) // 2]; cut = g.index(mid)
    A, B = Frag(v[:cut]), Frag(v[cut:])
    oh = config_hits(A, B)
    nh = {}
    for side, keep, repl, gg in (("B", A, B, g[cut:]), ("A", B, A, g[:cut])):
        sh = [Frag(w) for w in group_shuffles(repl.v, gg, 60, rng)]
        wins, _ = matched_pool(repl.v, pool, {kid})
        if len(wins) > 60: wins = [wins[i] for i in rng.choice(len(wins), 60, replace=False)]
        pa = [Frag(w) for _, _, w in wins]
        f = (lambda X: config_hits(keep, X)) if side == "B" else (lambda X: config_hits(X, keep))
        nh["shuf" + side] = [f(X) for X in sh]; nh["repl" + side] = [f(X) for X in pa]
    row = dict(id=kid, nA=len(A.v), nB=len(B.v), nsums=len(all_sums(v)))
    for kind in ("all", "local"):
        T = max(stat(h, kind) for h in oh.values()); T_ab = stat(oh["A+B"], kind)
        zs, es = {}, {}
        for s, hl in nh.items():
            nl = np.array([max(stat(h, kind) for h in x.values()) for x in hl], float)
            if len(nl) < 10: continue
            sd = nl.std(ddof=1)
            zs[s] = float((T - nl.mean()) / sd) if sd > 0 else (0.0 if T <= nl.mean() else 9.0)
            es[s] = (1 + (nl >= T).sum()) / (1 + len(nl))
        row[kind] = dict(T=T, T_AB=T_ab, best=max(oh, key=lambda c: stat(oh[c], kind)),
                         zmin=min(zs.values()) if zs else None, pemp=max(es.values()) if es else 1, z=zs)
    print(kid, row["nsums"], row["all"]["T"], row["all"]["best"], round(row["all"]["zmin"] or -99, 2), row["all"]["pemp"],
          "| local", row["local"]["T"], round(row["local"]["zmin"] or -99, 2), flush=True)
    return row

def eligible(kid):
    if kid in NOVALUE: return False
    cs = pendants(ks[kid]); v = [int(c["value"] or 0) for c in cs]
    return len(set(c["group"] for c in cs)) >= 8 and len(all_sums(v)) >= 5

if __name__ == "__main__":
    from multiprocessing import Pool
    el = [k for k in sorted(ks) if eligible(k)]
    print(len(el), "eligible intact-cut controls", flush=True)
    with Pool(8) as P:
        rows = P.map(one, el, chunksize=1)
    json.dump(rows, open(OUT / "mk_join_power.json", "w"), indent=1)
    for kind in ("all", "local"):
      z = [r[kind]["zmin"] for r in rows if r[kind]["zmin"] is not None]
      pe = [r[kind]["pemp"] for r in rows]
      best_ab = sum(r[kind]["best"] == "A+B" for r in rows)
      print(f"{kind}: n={len(rows)} median zmin={np.median(z):.2f} share zmin>2: {np.mean(np.array(z)>2):.2f} "
          f"share zmin>3.5: {np.mean(np.array(z)>3.5):.2f} share pemp<=0.05: {np.mean(np.array(pe)<=0.05):.2f} "
          f"true order A+B is the max config in {best_ab}/{len(rows)}")

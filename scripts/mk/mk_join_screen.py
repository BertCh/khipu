"""Step 3: screen all pairs of khipus with a broken primary end (beginning or
termination 'B') sharing a museum or provenance.  Statistic: T = max over the 4
splice configurations of the cross-break pendant-pendant sum count ('all') and of
the local count (within LOCAL cords of the break).  Nulls precomputed once per
fragment: 60 group shuffles and <= 60 magnitude-matched real-khipu windows.
Per pair: z against each of the 4 null sets (replace/shuffle A, replace/shuffle B);
zmin = min z; p_norm = upper normal tail of zmin; Bonferroni and BH over pairs."""
import sys, json, itertools, math
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import *

ks = load_all()
NOVALUE = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384",
           "KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
pool = {k: vals(v) for k, v in ks.items() if k not in NOVALUE}
def broken(d):
    p = d.get("primary") or {}
    return "B" in (p.get("beginning"), p.get("term"))
br = [k for k, d in ks.items() if broken(d) and k not in NOVALUE and len(vals(d)) >= 3]
bad = lambda s: (not s) or s.lower() in ("unknown", "none")
pairs = []
for a, b in itertools.combinations(sorted(br), 2):
    A, B = ks[a], ks[b]
    sm = not bad(A["museum"].get("canonical")) and A["museum"].get("canonical") == B["museum"].get("canonical")
    sp = not bad(A.get("provenance")) and A.get("provenance") == B.get("provenance")
    if sm or sp: pairs.append((a, b, ("M" if sm else "") + ("P" if sp else "")))
print(len(br), "broken fragments,", len(pairs), "pairs", flush=True)
need = sorted({x for p in pairs for x in p[:2]})
def build(kid):
    rng = np.random.default_rng(int(kid[2:]))
    v = vals(ks[kid]); g = [c["group"] for c in pendants(ks[kid])]
    ns = [Frag(w) for w in group_shuffles(v, g, 60, rng)] if len(set(g)) >= 3 else []
    wins, tol = matched_pool(v, pool, {kid})
    if len(wins) > 60:
        wins = [wins[i] for i in sorted(rng.choice(len(wins), 60, replace=False))]
    return kid, Frag(v, kid), ns, [Frag(w, k2) for k2, o, w in wins]
def main():
    global F, NS, NP
    from multiprocessing import Pool
    F, NS, NP = {}, {}, {}
    with Pool(6) as P:
        for kid, f, ns, np_ in P.imap_unordered(build, need):
            F[kid], NS[kid], NP[kid] = f, ns, np_
    print("nulls built", flush=True)
    def z_of(null, T):
        null = np.array(null, float)
        if len(null) < 10: return None, None
        sd = null.std(ddof=1)
        emp = (1 + (null >= T).sum()) / (1 + len(null))
        return ((T - null.mean()) / sd if sd > 0 else (0.0 if T <= null.mean() else 9.0)), emp
    rows = []
    for a, b, why in pairs:
        A, B = F[a], F[b]
        oh = config_hits(A, B)
        nh = {"replB": [config_hits(A, X) for X in NP[b]], "replA": [config_hits(X, B) for X in NP[a]],
              "shufB": [config_hits(A, X) for X in NS[b]], "shufA": [config_hits(X, B) for X in NS[a]]}
        row = dict(a=a, b=b, why=why, nA=len(A.v), nB=len(B.v))
        for kind in ("all", "local"):
            obs = {c: stat(h, kind) for c, h in oh.items()}; T = max(obs.values())
            zs, emps = {}, {}
            for s, hl in nh.items():
                z, e = z_of([max(stat(h, kind) for h in d.values()) for d in hl], T)
                if z is not None: zs[s] = round(float(z), 2); emps[s] = round(float(e), 3)
            zmin = min(zs.values()) if zs else None
            row[kind] = dict(obs=obs, T=T, z=zs, emp=emps, zmin=zmin,
                             pn=0.5 * math.erfc(zmin / math.sqrt(2)) if zmin is not None else 1.0,
                             pemp=max(emps.values()) if emps else 1.0)
        rows.append(row)
    M = len(rows)
    for kind in ("all", "local"):
        ps = sorted((r[kind]["pn"], i) for i, r in enumerate(rows))
        for rank, (p, i) in enumerate(ps, 1):
            rows[i][kind]["bonf"] = min(1, p * M); rows[i][kind]["bh_raw"] = p * M / rank
        # BH monotone
        run = 1.0
        for rank, (p, i) in reversed(list(enumerate(ps, 1))):
            run = min(run, rows[i][kind]["bh_raw"]); rows[i][kind]["bh"] = run
    json.dump(rows, open(OUT / "mk_join_screen.json", "w"), indent=1)
    for kind in ("all", "local"):
        print(f"\n== top 20 by zmin ({kind}) of {M} pairs; survivors BH<0.05:",
              sum(r[kind]["bh"] < 0.05 for r in rows), "Bonf<0.05:", sum(r[kind]["bonf"] < 0.05 for r in rows))
        for r in sorted(rows, key=lambda r: -(r[kind]["zmin"] if r[kind]["zmin"] is not None else -9))[:20]:
            x = r[kind]
            print(f"{r['a']} {r['b']} {r['why']:<2} n={r['nA']}/{r['nB']} T={x['T']} obs={x['obs']} z={x['z']} pemp={x['pemp']} bh={x['bh']:.3g}")


if __name__ == "__main__":
    main()

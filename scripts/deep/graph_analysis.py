#!/usr/bin/env python3
"""Communities, bridges, metadata enrichment and link prediction on the layers from graph_layers.py."""
from __future__ import annotations
import collections, json, math
import numpy as np, networkx as nx
from graph_common import *

rng = np.random.default_rng(7)
L = np.load(OUT / "layers.npz"); M = json.load(open(OUT / "meta.json"))
ids = M["ids"]; N = len(ids); idx = {x: i for i, x in enumerate(ids)}
I, J = L["I"], L["J"]
provs, insts, contr = M["provs"], M["insts"], M["contr"]
cur = curated_pairs(); scan = scan_pairs()
pid = {(ids[i], ids[j]): n for n, (i, j) in enumerate(zip(I, J))}
cur_mask = np.zeros(len(I), bool)
for p in cur: cur_mask[pid[p]] = True
scan_mask = np.zeros(len(I), bool)
for p in scan: scan_mask[pid[p]] = True
known = cur_mask | scan_mask

def graph_from(mask, w=None):
    G = nx.Graph(); G.add_nodes_from(ids)
    for n in np.where(mask)[0]:
        G.add_edge(ids[I[n]], ids[J[n]], weight=float(w[n]) if w is not None else 1.0)
    return G

# ---------- metadata enrichment of each layer ----------
print("== metadata enrichment of layer edges (vs all-pairs base rate; null = random pairs) ==")
base = {k: L[k].mean() for k in ("same_prov", "same_inst", "same_contr")}
for name, m in (("L1cos", L["e_all"]), ("L1z>=8", (L["z_all"]>=8)|(L["z_l1"]>=8)), ("L1rare", L["e_r"]), ("L2runs", L["run_long"] > 0), ("L3struct", L["e3"])):
    n = m.sum()
    row = []
    for k in ("same_prov", "same_inst", "same_contr"):
        obs = L[k][m].mean()
        # binomial sd for random-pair sample of size n
        sd = math.sqrt(base[k] * (1 - base[k]) / n)
        row.append(f"{k} {obs:.3f} (base {base[k]:.3f}, z {(obs-base[k])/sd:.1f})")
    print(f"  {name} n={n}: " + "; ".join(row))

# structure layer controlled for recorder: same-provenance enrichment among cross-recorder edges
m3 = L["e3"]; cc = ~L["same_contr"]
obs = L["same_prov"][m3 & cc].mean(); b = L["same_prov"][cc].mean()
print(f"  L3 cross-recorder edges n={(m3&cc).sum()}: same_prov {obs:.3f} vs base {b:.3f}")

# ---------- graphs ----------
# content graph: rare-value FDR edges + exact runs + pair-matched z >= 8 (FDR ~0.3-0.5 tier, see graph_layers log)
zmax = np.maximum(L["z_all"], L["z_l1"])
content = L["e_r"] | (L["run_long"] > 0) | (zmax >= 8)
wc = np.where(L["run_long"] > 0, 3.0, 0) + np.where(L["e_r"], 2.0, 0) + np.where(zmax >= 8, 1.0, 0)
Gc = graph_from(content, wc)
Gs = graph_from(L["e3"], L["s3"])
out = {}
for gname, G in (("content", Gc), ("structure", Gs)):
    H = G.subgraph([n for n in G if G.degree(n) > 0]).copy()
    comps = sorted(nx.connected_components(H), key=len, reverse=True)
    print(f"\n== {gname} graph: {H.number_of_nodes()} nodes with edges, {H.number_of_edges()} edges, {len(comps)} components; sizes {[len(c) for c in comps[:12]]}")
    comms = nx.community.louvain_communities(H, weight="weight", seed=1, resolution=1.0)
    comms = sorted(comms, key=len, reverse=True)
    Q = nx.community.modularity(H, comms, weight="weight")
    # null modularity: degree-preserving rewiring
    qn = []
    for s in range(10):
        R = nx.double_edge_swap(nx.Graph(H), nswap=H.number_of_edges() * 3, max_tries=H.number_of_edges() * 50, seed=s)
        qn.append(nx.community.modularity(R, nx.community.louvain_communities(R, seed=1)))
    print(f"   Louvain Q={Q:.3f}; degree-preserving rewired null Q {np.mean(qn):.3f}±{np.std(qn):.3f}; {len(comms)} communities")
    # label purity vs permuted-label null
    def purity(comms, lab):
        tot = 0; cnt = 0
        for c in comms:
            ls = [lab[idx[x]] for x in c if lab[idx[x]]]
            if len(ls) >= 2:
                tot += collections.Counter(ls).most_common(1)[0][1]; cnt += len(ls)
        return tot / max(cnt, 1)
    for lname, lab in (("prov", provs), ("inst", insts), ("contr", contr)):
        o = purity(comms, lab)
        nodes = list(H.nodes()); labs = [lab[idx[x]] for x in nodes]
        nl = []
        for s in range(200):
            pl = list(rng.permutation(labs)); d = dict(zip(nodes, pl))
            lab2 = [d.get(x, lab[i]) for i, x in enumerate(ids)]
            nl.append(purity(comms, lab2))
        print(f"   {lname} purity {o:.3f}; permuted-label null {np.mean(nl):.3f}±{np.std(nl):.3f}; p={(np.sum(np.array(nl)>=o)+1)/201:.3f}")
    rows = []
    for ci, c in enumerate(comms[:25]):
        pc = collections.Counter(provs[idx[x]] or "-" for x in c)
        ic = collections.Counter(insts[idx[x]][:22] for x in c)
        kc = collections.Counter((contr[idx[x]] or "-")[:14] for x in c)
        ncur = sum(1 for a in c for b in c if a < b and (a, b) in cur)
        rows.append(dict(i=ci, n=len(c), prov=pc.most_common(4), inst=ic.most_common(4), contr=kc.most_common(3), ids=sorted(c)))
        print(f"   C{ci} n={len(c)} curated-internal={ncur} prov={pc.most_common(3)} inst={ic.most_common(3)} contr={kc.most_common(2)}")
    out[gname] = rows
    # bridges
    if gname == "content":
        big = H.subgraph(comps[0]).copy()
        eb = nx.edge_betweenness_centrality(big, weight=None)
        nb = nx.betweenness_centrality(big)
        print("   top bridge edges:", [(a, b, round(v, 3)) for (a, b), v in sorted(eb.items(), key=lambda x: -x[1])[:10]])
        print("   top broker nodes:", [(a, round(v, 3), provs[idx[a]], insts[idx[a]][:15]) for a, v in sorted(nb.items(), key=lambda x: -x[1])[:10]])
        print("   true bridges (cut edges):", [e for e in nx.bridges(big)][:30])
json.dump(out, open(OUT / "communities.json", "w"), indent=1, default=str)

# ---------- link prediction ----------
print("\n== link prediction ==")
def adamic_adar(G):
    A = nx.to_scipy_sparse_array(G, nodelist=ids, weight=None).astype(float).toarray()
    deg = A.sum(1)
    inv = np.where(deg > 1, 1 / np.log(np.maximum(deg, 2)), 0)
    AA = (A * inv) @ A.T
    CN = A @ A.T
    return AA[I, J], CN[I, J]
aa_c, cn_c = adamic_adar(Gc)
aa_s, cn_s = adamic_adar(Gs)

def lg(x): return np.log1p(np.maximum(x, 0))
Fcontent = np.column_stack([np.clip(L["z_all"], -5, 30), np.clip(L["z_l1"], -5, 30), lg(L["rare_w"]), L["rare_c"],
                            lg(L["run_long"]), lg(L["run_n"]), lg(aa_c), lg(cn_c), L["s3"], lg(aa_s)])
Fmeta = np.column_stack([L["same_prov"], L["same_inst"], L["same_contr"], L["acc_d"] <= 3, L["acc_d"] <= 50, L["alias_d"] <= 2, L["alias_d"] <= 20])
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

pos = np.where(cur_mask)[0]
def cv_rank(F, drop_run=False, tag=""):
    """5-fold CV over curated positives; negatives = 50 random non-known pairs per positive.
    Returns rank (among all non-known pairs + held-out positive) of each held-out positive."""
    F = F.copy()
    folds = np.array_split(rng.permutation(pos), 5)
    ranks = []
    for f in folds:
        train_pos = np.setdiff1d(pos, f)
        neg = rng.choice(np.where(~known)[0], 50 * len(train_pos), replace=False)
        X = np.vstack([F[train_pos], F[neg]]); y = np.r_[np.ones(len(train_pos)), np.zeros(len(neg))]
        sc = StandardScaler().fit(X); mdl = LogisticRegression(C=0.3, max_iter=2000).fit(sc.transform(X), y)
        s = mdl.decision_function(sc.transform(F))
        bg = np.sort(s[~known])
        for p in f:
            ranks.append(len(bg) - np.searchsorted(bg, s[p]) + 1)
    ranks = np.array(ranks)
    print(f"   {tag}: CV rank of held-out curated pairs among {int((~known).sum())} unknown pairs: median {np.median(ranks):.0f}; top10 {np.mean(ranks<=10):.2f} top100 {np.mean(ranks<=100):.2f} top1000 {np.mean(ranks<=1000):.2f}")
    return ranks

def fit_all(F):
    neg = rng.choice(np.where(~known)[0], 50 * len(pos), replace=False)
    X = np.vstack([F[pos], F[neg]]); y = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    sc = StandardScaler().fit(X); mdl = LogisticRegression(C=0.3, max_iter=2000).fit(sc.transform(X), y)
    return mdl.decision_function(sc.transform(F)), mdl.coef_[0]

# content features WITHOUT the run layer (runs define half the positives; this asks whether the
# order-free and structural layers alone would have found the curated links)
nor = np.delete(Fcontent, [4, 5], axis=1)
r1 = cv_rank(nor, tag="content-no-runs")
r2 = cv_rank(Fcontent, tag="content+runs")
r3 = cv_rank(np.hstack([Fcontent, Fmeta]), tag="content+runs+meta")
r4 = cv_rank(Fmeta, tag="meta only")
# random-feature null for the CV rank
rn = cv_rank(rng.normal(size=(len(I), 5)), tag="random features (null)")

res = {}
for tag, F in (("content", Fcontent), ("content_meta", np.hstack([Fcontent, Fmeta]))):
    s, coef = fit_all(F)
    s2 = np.where(known, -np.inf, s)
    top = np.argsort(-s2)[:60]
    res[tag] = [dict(a=ids[I[n]], b=ids[J[n]], score=float(s[n]), cos=float(L["cos_all"][n]), p=float(zmax[n]),
                     rare_w=float(L["rare_w"][n]), rare_c=int(L["rare_c"][n]), aa=float(aa_c[n]), s3=float(L["s3"][n]),
                     same_prov=bool(L["same_prov"][n]), same_inst=bool(L["same_inst"][n]), acc_d=float(L["acc_d"][n]), alias_d=float(L["alias_d"][n]))
                for n in top]
    print(f"   [{tag}] coef {np.round(coef,2)}")
json.dump(res, open(OUT / "candidates.json", "w"), indent=1)
res["content_norun"] = None
s, coef = fit_all(nor); s2 = np.where(known, -np.inf, s); top = np.argsort(-s2)[:40]
print("   [content-no-runs] top new:")
for n in top:
    print("     ", ids[I[n]], ids[J[n]], f"s={s[n]:.2f} z={zmax[n]:.1f} rare={int(L['rare_c'][n])}/{L['rare_w'][n]:.1f} aa={aa_c[n]:.2f} s3={L['s3'][n]:.2f}", provs[I[n]], provs[J[n]], insts[I[n]][:14], insts[J[n]][:14])
print("   [content] top new:")
for r in res["content"][:40]:
    print("  ", r["a"], r["b"], f"s={r['score']:.2f} z={r['p']:.1f} rare={r['rare_c']}/{r['rare_w']:.1f} aa={r['aa']:.2f} s3={r['s3']:.2f}", provs[idx[r['a']]], provs[idx[r['b']]], insts[idx[r['a']]][:14], insts[idx[r['b']]][:14])

#!/usr/bin/env python3
"""(a) Provenance prediction with recorder / lot confounds controlled.

Targets: macro region (North / Central / South; Arica dropped, n=11) and fine region (classes n>=10).
Feature sets
  full      : every feature incl. recorder-convention r_* and raw colour codes
  subst     : full minus r_*
  robust    : subst minus features that flip by recorder inside the same museum/find-spot
              (meta_d_recorder: |D|>=0.5, p<=0.01 for Ascher|Urton, or |D|>=1 for any other pair),
              raw colour codes replaced by recorder-neutral merged shares (white / brown family / chromatic).
CV schemes (balanced accuracy; null = labels permuted, same scheme)
  strat     : stratified 5-fold x3
  lot       : GroupKFold on accession lot (museum + accession series + number//100) -> no same-lot leakage
  LORO      : leave-one-recorder-out (train on the other recorders, test only classes seen in training)
Classifiers: class-balanced L2 logistic regression and random forest (median imputation).
Predictions for unprovenanced khipus: models trained on all labelled khipus with the robust set;
confident = LR and RF agree and both >= 0.8.  External check: known links with one provenanced end.
"""
import collections, json, sys, warnings
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import StratifiedKFold, GroupKFold
from sklearn.metrics import balanced_accuracy_score
import meta_common as mc

warnings.filterwarnings("ignore")
rng = np.random.default_rng(7)
FAST = "--fast" in sys.argv
NPERM = 20 if FAST else 60

ks = [k for k in mc.load() if k["id"] not in mc.vc.UNREADABLE]
X, names = mc.matrix(ks)

# recorder-neutral colour merges
BROWN = {"B", "AB", "MB", "LB", "DB", "KB", "HB", "YB", "CB", "BB", "NB", "RB", "EB", "PB", "SB", "FB", "TB", "OB", "BS"}
def merged(k):
    c = collections.Counter(x for cd in k["cords"] for p in (cd.get("colorParsed") or []) for x in p["codes"])
    t = sum(c.values()) or 1
    w = c["W"] / t; b = sum(v for x, v in c.items() if x in BROWN) / t
    return [w, b, 1 - w - b]
M = np.array([merged(k) for k in ks]); X = np.hstack([X, M]); names = names + ["colM_white", "colM_brown", "colM_chrom"]

d = json.load(open(mc.OUT / "d_recorder.json"))
flag = set()
for pair, v in d.items():
    if "|" not in pair: continue
    for r in v["rows"]:
        if r["p"] <= 0.01 and (abs(r["D"]) >= (0.5 if pair == "Ascher|Urton" else 1.0)):
            flag.add(r["feature"])
flag |= {n for n in names if n.startswith("r_")}
print("recorder-flagged features removed from robust set:", sorted(flag))
IDX = {
    "full": [i for i, n in enumerate(names) if not n.startswith("colM_")],
    "subst": [i for i, n in enumerate(names) if not n.startswith(("r_", "colM_"))],
    "robust": [i for i, n in enumerate(names) if n not in flag and not n.startswith("col_")],
}
print({k: len(v) for k, v in IDX.items()})

def lot(k):
    a = mc.accession(k["museum"]["number"])
    m = k["museum"]["canonical"] or "?"
    return f"{m}|{a[0]}|{a[1] // 100}" if a else f"{m}|{k['id']}"

recs = np.array([k["_rec"] for k in ks]); lots = np.array([lot(k) for k in ks])

def models():
    return {"LR": make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                                LogisticRegression(C=0.3, class_weight="balanced", max_iter=2000)),
            "RF": make_pipeline(SimpleImputer(strategy="median"),
                                RandomForestClassifier(n_estimators=200, class_weight="balanced_subsample",
                                                       min_samples_leaf=2, random_state=0, n_jobs=-1))}

def cv_pred(Xs, y, scheme, mname, seed=0, groups=None):
    pred = np.full(len(y), -1)
    if scheme == "strat":
        for tr, te in StratifiedKFold(5, shuffle=True, random_state=seed).split(Xs, y):
            m = models()[mname].fit(Xs[tr], y[tr]); pred[te] = m.predict(Xs[te])
        return balanced_accuracy_score(y, pred), pred
    if scheme == "lot":
        for tr, te in GroupKFold(5).split(Xs, y, groups):
            if len(set(y[tr])) < 2: continue
            m = models()[mname].fit(Xs[tr], y[tr]); pred[te] = m.predict(Xs[te])
        ok = pred >= 0
        return balanced_accuracy_score(y[ok], pred[ok]), pred
    if scheme == "LORO":
        keep = np.zeros(len(y), bool)
        for r in np.unique(groups):
            te = groups == r; tr = ~te
            if te.sum() < 5: continue
            seen = set(y[tr]); te = te & np.isin(y, list(seen))
            if te.sum() == 0: continue
            m = models()[mname].fit(Xs[tr], y[tr]); pred[te] = m.predict(Xs[te]); keep |= te
        return balanced_accuracy_score(y[keep], pred[keep]), pred

res = {}
for target in ("macro", "fine"):
    lab = [k["_macro"] if target == "macro" else k["_region"] for k in ks]
    cnt = collections.Counter(l for l in lab if l)
    classes = sorted(c for c, n in cnt.items() if n >= (10 if target == "fine" else 20))
    ii = np.array([i for i, l in enumerate(lab) if l in classes])
    y = np.array([classes.index(lab[i]) for i in ii])
    maj = max(cnt[c] for c in classes) / len(ii)
    print(f"\n######## target={target} classes={ {c: cnt[c] for c in classes} } majority acc={maj:.3f} balanced chance={1/len(classes):.3f}")
    res[target] = {"classes": {c: cnt[c] for c in classes}, "majority": maj}
    for fs in ("full", "subst", "robust"):
        Xs = X[ii][:, IDX[fs]]
        for scheme in ("strat", "lot", "LORO"):
            for mname in ("LR", "RF"):
                if FAST and mname == "RF" and scheme != "strat": continue
                g = lots[ii] if scheme == "lot" else recs[ii] if scheme == "LORO" else None
                acc, pred = cv_pred(Xs, y, scheme, mname, groups=g)
                nperm = NPERM if mname == "LR" else max(10, NPERM // 4)
                null = []
                for s in range(nperm):
                    if scheme == "strat": yp = rng.permutation(y)
                    else:  # permute within recorder (LORO) or across lots (lot): keeps group structure
                        yp = y.copy()
                        for gg in np.unique(g):
                            m_ = g == gg
                            if scheme == "LORO": yp[m_] = rng.permutation(y[m_])
                        if scheme == "lot":
                            ul = np.unique(g); perm = rng.permutation(len(ul)); mp = dict(zip(ul, ul[perm]))
                            first = {gg: y[np.where(g == gg)[0][0]] for gg in ul}
                            yp = np.array([first[mp[gg]] for gg in g])  # whole lots relabelled
                    null.append(cv_pred(Xs, yp, scheme, mname, seed=s + 1, groups=g)[0])
                null = np.array(null)
                p = (1 + (null >= acc).sum()) / (1 + len(null))
                ok_ = pred >= 0; raw = float(np.mean(pred[ok_] == y[ok_]))
                print(f"  {fs:6s} {scheme:5s} {mname}: bal.acc={acc:.3f} raw={raw:.3f}  null={null.mean():.3f}+-{null.std():.3f}  p={p:.3f}")
                res[target][f"{fs}|{scheme}|{mname}"] = dict(acc=float(acc), raw=raw, null_mean=float(null.mean()),
                                                               null_sd=float(null.std()), p=float(p))
                if target == "macro" and scheme == "LORO" and mname == "LR":
                    per = {}
                    for r in np.unique(recs[ii]):
                        m_ = (recs[ii] == r) & (pred >= 0)
                        if m_.sum(): per[r] = (int(m_.sum()), float(np.mean(pred[m_] == y[m_])))
                    print("       per held-out recorder (n, raw acc):", per)
                    res[target][f"{fs}|LORO|perrec"] = per

# ---- predictions for unprovenanced, macro target, robust features
lab = [k["_macro"] for k in ks]; classes = ["Central", "North", "South"]
ii = np.array([i for i, l in enumerate(lab) if l in classes]); y = np.array([classes.index(lab[i]) for i in ii])
un = np.array([i for i, k in enumerate(ks) if k["_region"] is None and k["id"] not in mc.vc.WARI])
Xs = X[:, IDX["robust"]]; fn = [names[i] for i in IDX["robust"]]
M_ = models(); lr = M_["LR"].fit(Xs[ii], y); rf = M_["RF"].fit(Xs[ii], y)
Plr = lr.predict_proba(Xs[un]); Prf = rf.predict_proba(Xs[un])
coef = lr[-1].coef_; Z = lr[1].transform(lr[0].transform(Xs[un]))
out = []
for r, i in enumerate(un):
    c1, c2 = Plr[r].argmax(), Prf[r].argmax()
    contrib = Z[r] * coef[c1]; top = np.argsort(-contrib)[:3]
    k = ks[i]
    out.append(dict(id=k["id"], museum=k["museum"]["canonical"], acc=k["museum"]["number"], rec=k["_rec"],
                    prov_text=k["provenance"], lr=classes[c1], p_lr=float(Plr[r, c1]), rf=classes[c2], p_rf=float(Prf[r, c2]),
                    top=[(fn[t], round(float(contrib[t]), 2)) for t in top]))
conf = [o for o in out if o["lr"] == o["rf"] and o["p_lr"] >= .8]
print(f"\n{len(un)} unprovenanced (non-Wari); confident (LR>=0.8 and RF argmax agrees): {len(conf)}")
for o in sorted(conf, key=lambda o: (o["museum"] or "", o["id"])):
    print(f"  {o['id']} {str(o['museum'])[:26]:26s} {str(o['acc'])[:18]:18s} {o['rec']:9s} -> {o['lr']:7s} LR={o['p_lr']:.2f} RF={o['p_rf']:.2f} {o['top']}  [{(o['prov_text'] or '')[:30]}]")
res["predictions"] = out
# RF calibration check on held-out: fraction correct among CV predictions with p>=.8 (strat, robust)
pr = np.zeros((len(ii), 3))
for tr, te in StratifiedKFold(5, shuffle=True, random_state=0).split(Xs[ii], y):
    a = models()["LR"].fit(Xs[ii][tr], y[tr]); b = models()["RF"].fit(Xs[ii][tr], y[tr])
    pa, pb = a.predict_proba(Xs[ii][te]), b.predict_proba(Xs[ii][te])
    pr[te] = np.where(((pa.argmax(1) == pb.argmax(1)) & (pa.max(1) >= .8))[:, None], pa, np.nan)
m_ = ~np.isnan(pr[:, 0])
print(f"calibration: CV items passing the confident rule: {m_.sum()}/{len(ii)}, accuracy among them {np.mean(pr[m_].argmax(1) == y[m_]):.3f}")
res["calibration"] = dict(n=int(m_.sum()), acc=float(np.mean(pr[m_].argmax(1) == y[m_])))
# lot-grouped calibration (harsher)
pr = np.full((len(ii), 3), np.nan)
for tr, te in GroupKFold(5).split(Xs[ii], y, lots[ii]):
    a = models()["LR"].fit(Xs[ii][tr], y[tr]); b = models()["RF"].fit(Xs[ii][tr], y[tr])
    pa, pb = a.predict_proba(Xs[ii][te]), b.predict_proba(Xs[ii][te])
    pr[te] = np.where(((pa.argmax(1) == pb.argmax(1)) & (pa.max(1) >= .8))[:, None], pa, np.nan)
m_ = ~np.isnan(pr[:, 0])
print(f"calibration (lot-grouped): {m_.sum()}/{len(ii)} pass, accuracy {np.mean(pr[m_].argmax(1) == y[m_]):.3f}")
res["calibration_lot"] = dict(n=int(m_.sum()), acc=float(np.mean(pr[m_].argmax(1) == y[m_])))

# ---- external check: known links with exactly one provenanced end
idx = {k["id"]: i for i, k in enumerate(ks)}
pred_all = {}
Pall = lr.predict_proba(Xs); Rall = rf.predict_proba(Xs)
for i, k in enumerate(ks): pred_all[k["id"]] = (classes[Pall[i].argmax()], float(Pall[i].max()), classes[Rall[i].argmax()])
print("\nknown links with one unprovenanced end (Wari excluded; Basel fragments KH0682-0691 collapsed to one vote)")
tests = {}
for a, b in sorted(mc.vc.known_all()):
    if a not in idx or b not in idx or a in mc.vc.WARI or b in mc.vc.WARI: continue
    ra, rb = ks[idx[a]]["_region"], ks[idx[b]]["_region"]
    if (ra is None) == (rb is None): continue
    u, p = (a, b) if ra is None else (b, a)
    if ks[idx[p]]["_macro"] not in classes: continue
    key = "BASEL" if u in {f"KH{n:04d}" for n in range(682, 692)} else u
    tests.setdefault(key, []).append((u, p))
hits = []
for key, lst in sorted(tests.items()):
    u = lst[0][0]
    if key == "BASEL":
        votes = collections.Counter(pred_all[x][0] for x, _ in lst); pu = (votes.most_common(1)[0][0], 0, "")
    else: pu = pred_all[u]
    partners = {ks[idx[p]]["_macro"] for _, p in lst}
    ok = pu[0] in partners if len(partners) == 1 else None
    print(f"  {key} pred {pu[0]} (LR p={pu[1]:.2f}, RF {pu[2]}) partners {sorted(set(p for _, p in lst))} macro {partners} -> {ok}")
    if ok is not None: hits.append((pu[0], partners.pop()))
obs = sum(a == b for a, b in hits)
pool = [pred_all[k["id"]][0] for k in ks if k["_region"] is None and k["id"] not in mc.vc.WARI]
null = [sum(rng.choice(pool) == b for _, b in hits) for _ in range(5000)]
pv = (1 + sum(n >= obs for n in null)) / 5001
print(f"  agreement {obs}/{len(hits)}; null (predictions drawn from the unprovenanced prediction mix) {np.mean(null):.2f}+-{np.std(null):.2f}, p={pv:.4f}")
hits_n = obs; tot = len(hits)
res["link_check"] = dict(hits=hits_n, tot=tot, null_mean=float(np.mean(null)), null_sd=float(np.std(null)), p=pv)
json.dump(res, open(mc.OUT / "a_predict.json", "w"), indent=1, default=str)

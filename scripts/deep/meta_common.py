"""Shared loader / feature builder for the meta_* analyses (metadata inference, provenance prediction,
accession adjacency, dating, recorder-effect audit).

Reuses vocab_common (region regexes, Wari/unreadable sets, known links) and the per-khipu feature
function of vocab_b_dialects, then adds cord-length, register-spacing, group-size and value-profile
features.  Feature-name prefixes: k_ knots, c_ cord construction, s_ structure, v_ values, col_ colour,
p_ primary cord, L_ lengths, R_ register geometry, g_ group sizes, r_ recorder-convention ('U' rates).
"""
from __future__ import annotations
import collections, json, math, re, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import vocab_common as vc  # noqa: E402

OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/meta")
OUT.mkdir(parents=True, exist_ok=True)

# pull in vocab_b_dialects.features without running its analysis
_src = (HERE / "vocab_b_dialects.py").read_text().split("feats = [features")[0]
_ns: dict = {}
_cwd_path = list(sys.path)
exec(compile(_src.replace("ks = [k for k in vc.load() if k[\"id\"] not in vc.UNREADABLE]", "ks = []"), "vocab_b", "exec"), _ns)
_vfeatures = _ns["features"]

MACRO = {"Leymebamba": "North", "Chachapoyas": "North", "Santa": "North",
         "Pachacamac": "Central", "Armatambo": "Central", "Huaquerones": "Central", "Puruchuco": "Central",
         "CentralCoast": "Central",
         "Incahuasi": "South", "Huacones": "South", "Ica": "South", "Nazca": "South", "Chala": "South",
         "Arica": "Arica"}

REC = {"Marcia & Robert Ascher": "Ascher", "Gary Urton": "Urton", "Gary Urton, Karen Thompson (Dec2024)": "Urton",
       "Carrie Brezine": "Brezine", "Hugo Pereyra": "Pereyra", "Jon Clindaniel": "Clindaniel",
       "Kylie Quave": "Quave", "Manuel Medrano": "Medrano"}


def recorder(k):
    return REC.get(k["contributors"], "Other")


def load():
    ks = vc.load()
    for k in ks:
        k["_macro"] = MACRO.get(k["_region"]) if k["_region"] else None
        k["_rec"] = recorder(k)
    return ks


def _clusters(knots):
    """distinct knot positions on a cord (register clusters), in cm from the primary"""
    ps = sorted({round(float(x["pos"]), 1) for x in knots if x.get("pos") not in (None, 0, 0.0)})
    return ps


def features(k):
    f = dict(_vfeatures(k))
    cs = k["cords"]; ps = vc.pendants(k)
    L = np.array([c["length"] for c in cs if c.get("length")], float)
    f["L_meanlog"] = float(np.mean(np.log(L))) if len(L) else np.nan
    f["L_cv"] = float(L.std() / L.mean()) if len(L) > 2 else np.nan
    f["r_Lmissing"] = 1 - len(L) / max(len(cs), 1)  # recorder: length not recorded
    kn = [x for c in cs for x in c["knots"]]
    f["r_posmissing"] = (sum(1 for x in kn if not x.get("pos")) / len(kn)) if kn else np.nan
    gaps, ratio, top = [], [], []
    for c in ps:
        cl = _clusters(c["knots"])
        if len(cl) >= 2:
            g = np.diff(cl); gaps.append(g.mean())
            if c.get("length"): ratio.append(g.mean() / c["length"])
        if cl and c.get("length"): top.append(cl[0] / c["length"])
    f["R_gap"] = float(np.median(gaps)) if gaps else np.nan
    f["R_gapratio"] = float(np.median(ratio)) if ratio else np.nan
    f["R_top"] = float(np.median(top)) if top else np.nan
    f["R_firstpos"] = float(np.median([_clusters(c["knots"])[0] for c in ps if _clusters(c["knots"])])) if any(
        _clusters(c["knots"]) for c in ps) else np.nan
    gs = [g["n"] for g in (k["groups"] or [])]
    if gs:
        cnt = collections.Counter(gs); tot = len(gs)
        f["g_ent"] = -sum(v / tot * math.log(v / tot) for v in cnt.values())
        f["g_modefrac"] = cnt.most_common(1)[0][1] / tot
        f["g_ge10"] = sum(n >= 10 for n in gs) / tot
        f["g_is6"] = sum(n == 6 for n in gs) / tot
        f["g_is10"] = sum(n == 10 for n in gs) / tot
    else:
        for n in ("g_ent", "g_modefrac", "g_ge10", "g_is6", "g_is10"): f[n] = np.nan
    vals = [int(c.get("value") or 0) for c in ps if (c.get("value") or 0) > 0]
    if vals and k["id"] not in vc.WARI:
        lv = np.log10(vals)
        f["v_q50"] = float(np.median(lv)); f["v_q90"] = float(np.quantile(lv, .9)); f["v_max"] = float(lv.max())
    else:
        f["v_q50"] = f["v_q90"] = f["v_max"] = np.nan
    at = collections.Counter(c["attach"] for c in cs)
    f["c_attR"] = at["R"] / max(at["R"] + at["V"], 1) if (at["R"] + at["V"]) else np.nan
    fib = (k["primary"] or {}).get("fiber")
    f["p_fiberCN"] = 1.0 if fib == "CN" else 0.0 if fib else np.nan
    f["r_fibermissing"] = 0.0 if fib else 1.0
    return f


def matrix(ks):
    F = [features(k) for k in ks]
    names = list(F[0])
    X = np.array([[f.get(n, np.nan) for n in names] for f in F], float)
    return X, names


def prefix_groups(names):
    pre = {"knots": "k_", "cords": "c_", "struct": "s_", "values": "v_", "colour": "col_", "primary": "p_",
           "length": "L_", "register": "R_", "groups": "g_", "recorder": "r_"}
    return {g: [i for i, n in enumerate(names) if n.startswith(p)] for g, p in pre.items()}


ACC_RX = re.compile(r"^\s*([A-Za-z./ -]*?)\s*(\d[\d./-]*\d|\d)\s*[\(]?([A-Za-z]?)[\)]?")


def accession(num: str | None):
    """(prefix, int core, suffix) for adjacency; None if unparseable. Uses the first number listed."""
    if not num: return None
    s = num.split(",")[0].strip().strip('"')
    if s.lower() in ("unnumbered", "s/n"): return None
    mc = re.search(r"CMA[-.](\d+)/LC\d[- ]?([\d.]+)\s*([A-Z]?)", s)
    if mc:
        return ("CMA|", int(mc.group(1)), mc.group(2) + mc.group(3))
    m = re.match(r"^\s*([A-Za-z]*)\s*([\d./-]+?)(-02)?\s*\(?([A-Za-z]?)\)?\s*(\([A-Za-z]\))?$", s)
    if not m:
        m2 = re.match(r"^\s*([A-Za-z]*)\s*([\d]+)", s)
        if not m2: return None
        pre, core, suf = m2.group(1), m2.group(2), ""
    else:
        pre, core, suf = m.group(1), m.group(2), (m.group(4) or "")
    parts = re.split(r"[./-]", core)
    try:
        head = ".".join(parts[:-1]); last = int(parts[-1])
    except ValueError:
        return None
    tag = "-02" if (m and m.group(3)) else ""
    return (pre.upper() + "|" + head + tag, last, suf.upper())

"""Shared loaders for the Medrano & Khosla (2024) Inkawasi reconciliation (mk_ink_*)."""
import json, glob, os, collections
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = "/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/573e055a-1d0e-4a10-b794-c747179bc194/scratchpad/out"
os.makedirs(OUT, exist_ok=True)

def load_all():
    ks = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "public/data/khipus/KH*.json"))):
        k = json.load(open(f)); ks[k["id"]] = k
    return ks

def inkawasi(ks):
    return {i: k for i, k in ks.items() if "ncahuasi" in (k.get("provenance") or "")}

SECTOR_B = {f"KH0{n}" for n in range(608, 631)}

def v(c): return c.get("value") or 0

def groups(k):
    """level-1 pendants by group, in ordinal order -> list of lists of cords"""
    g = collections.defaultdict(list)
    for c in k["cords"]:
        if c.get("level") == 1 and c.get("kind", "pendant") == "pendant":
            g[c.get("group")].append(c)
    return [sorted(g[x], key=lambda c: c["ordinal"]) for x in sorted(g, key=lambda x: (x is None, x))]

def is_white(col): return col == "W"
def light(col):
    """solid white-ish (W or a W-dominant blend counted separately)"""
    return col in ("W",)

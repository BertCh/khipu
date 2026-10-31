"""Physical sanity check for candidate joins: primary cord (colour, structure,
fibre, thickness, ends), group size/spacing, pendant colour vocabulary (Jaccard),
attachment and ply shares, recorder.  Usage: python3 mk_join_sanity.py KHa KHb [...]"""
import sys, collections
import numpy as np
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from mk_join_common import load_all, pendants

ks = load_all()

def feat(k):
    p = k.get("primary") or {}
    cs = pendants(k)
    gs = collections.Counter(c["group"] for c in cs)
    sp = [g.get("spacing") for g in (k.get("groups") or []) if isinstance(k.get("groups"), list) and g.get("n", 0) > 1]
    cols = collections.Counter(c.get("color") for c in cs)
    return dict(id=k["id"], mus=(k.get("museum") or {}).get("canonical"), num=(k.get("museum") or {}).get("number"),
                prov=k.get("provenance"), rec=k.get("contributors"),
                prim=f"{p.get('color')}/{p.get('structure')}/{p.get('fiber')}/th{p.get('thick')}/beg{p.get('beginning')}/term{p.get('term')}",
                n=len(cs), groups=len(gs), gsize=round(float(np.median(list(gs.values()))), 1),
                spacing=round(float(np.median(sp)), 2) if sp else None,
                attach=dict(collections.Counter(c.get("attach") for c in cs)),
                twist=dict(collections.Counter(c.get("twist") for c in cs)),
                colors=set(cols), topcols=[c for c, _ in cols.most_common(5)],
                medv=float(np.median([c["value"] for c in cs if c.get("value")] or [0])))

def show(a, b):
    A, B = feat(ks[a]), feat(ks[b])
    j = len(A["colors"] & B["colors"]) / max(1, len(A["colors"] | B["colors"]))
    for F in (A, B):
        print({k: v for k, v in F.items() if k != "colors"})
    print(f"  colour-vocabulary Jaccard {j:.2f}\n")
    return j

if __name__ == "__main__":
    a = sys.argv[1:]
    for i in range(0, len(a), 2):
        show(a[i], a[i + 1])

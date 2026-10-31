"""Shared loaders for the tree_* analyses (hierarchy / subsidiary semantics)."""
from __future__ import annotations
import json, re, collections
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/tree")
OUT.mkdir(parents=True, exist_ok=True)

WARI = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384"}
UNREADABLE = {"KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
NOVALUE = WARI | UNREADABLE


def load(skip_novalue=True):
    ks = [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]
    if skip_novalue:
        ks = [k for k in ks if k["id"] not in NOVALUE]
    return ks


def val(c):
    v = c.get("value")
    return int(v) if v is not None else 0


def build_tree(k):
    """Returns (l1, children) where l1 = level-1 cords in ordinal order,
    children[name] = list of direct child cords in file order."""
    cs = k["cords"]
    ch = collections.defaultdict(list)
    for c in cs:
        if c.get("parent"):
            ch[c["parent"]].append(c)
    l1 = sorted((c for c in cs if c["level"] == 1), key=lambda c: c["ordinal"])
    return l1, ch


def curated_pairs():
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    ps = re.findall(r'a:\s*"(KH\d{4})",\s*\n\s*b:\s*"(KH\d{4})"', txt)
    return {tuple(sorted(p)) for p in ps}


def scan_pairs():
    d = json.loads((ROOT / "public/data/stories/links.json").read_text())
    return {tuple(sorted((p["a"], p["b"]))) for p in d["pairs"]}


def value_info(ks):
    """-log2 corpus frequency of each nonzero value over all cords."""
    cnt = collections.Counter()
    for k in ks:
        for c in k["cords"]:
            v = val(c)
            if v:
                cnt[v] += 1
    tot = sum(cnt.values())
    return {v: -np.log2(n / tot) for v, n in cnt.items()}, cnt

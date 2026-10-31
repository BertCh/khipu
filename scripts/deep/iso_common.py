"""Shared loaders for the iso_* analyses (isomorph / substitution-invariant matching)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/"
           "b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/iso")
OUT.mkdir(parents=True, exist_ok=True)

WARI = {"KH0280", "KH0281", "KH0282", "KH0288", "KH0289", "KH0271", "KH0346", "KH0348", "KH0384"}
UNREADABLE = {"KH0015", "KH0047", "KH0048", "KH0094", "KH0100", "KH0108", "KH0584"}
NOVALUE = WARI | UNREADABLE

# Basel fragments are pieces of KH0450/KH0147 -> treat their links as known
BASEL = {f"KH{n:04d}" for n in range(682, 692)}


def norm_colour(c: str | None) -> str:
    """Raw Ascher colour string with segment ranges dropped: 'MB:PB(0-4)/AB(4-41)' -> 'MB:PB/AB'."""
    if not c:
        return "?"
    return re.sub(r"\(.*?\)", "", c).strip() or "?"


def base_colour(c: str | None) -> str:
    c = norm_colour(c)
    return re.split(r"[:\-/ ]", c)[0] or "?"


def knot_sig(cord) -> str:
    return "-".join((k.get("type") or "?") for k in cord.get("knots") or []) or "0"


def load():
    out = []
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        cs = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
        # position within group (0-based) and group index
        gpos, gidx = [], []
        last_g, j = None, 0
        for c in cs:
            g = c.get("group")
            if g != last_g:
                j, last_g = 0, g
            gpos.append(j)
            gidx.append(g if g is not None else -1)
            j += 1
        out.append({
            "id": k["id"],
            "museum": (k.get("museum") or {}).get("canonical") or "",
            "prov": k.get("provenance") or "",
            "n": len(cs),
            "colour": [norm_colour(c.get("color")) for c in cs],
            "base": [base_colour(c.get("color")) for c in cs],
            "knot": [knot_sig(c) for c in cs],
            "attach": [c.get("attach") or "?" for c in cs],
            "twist": [c.get("twist") or "?" for c in cs],
            "value": [c.get("value") for c in cs],
            "gpos": gpos,
            "group": gidx,
            "groups": [g["n"] for g in k.get("groups") or []],
        })
    return out


def curated_pairs():
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    ps = re.findall(r'a:\s*"(KH\d{4})",\s*\n\s*b:\s*"(KH\d{4})"', txt)
    return {tuple(sorted(p)) for p in ps}


def scan_pairs():
    d = json.loads((ROOT / "public/data/stories/links.json").read_text())
    return {tuple(sorted((p["a"], p["b"]))) for p in d["pairs"]}


def known_pairs():
    return curated_pairs() | scan_pairs()


def canon(w) -> tuple:
    """First-occurrence relabelling: (W, LB, W, YB) -> (0, 1, 0, 2)."""
    m = {}
    return tuple(m.setdefault(x, len(m)) for x in w)


def min_period(p) -> int:
    L = len(p)
    for q in range(1, L):
        if all(p[i] == p[i + q] for i in range(L - q)):
            return q
    return L

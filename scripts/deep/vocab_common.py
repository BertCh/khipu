"""Shared loader for the vocab_* analyses (number vocabulary, dialects, colour semantics)."""
from __future__ import annotations
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/vocab")
OUT.mkdir(parents=True, exist_ok=True)

WARI = {f"KH{n:04d}" for n in (280, 281, 282, 288, 289, 271, 346, 348, 384)}
UNREADABLE = {f"KH{n:04d}" for n in (15, 47, 48, 94, 100, 108, 584)}
EXCLUDE = WARI | UNREADABLE

KNOWN = [("KH0192","KH0470"),("KH0192","KH0469"),("KH0469","KH0470"),("KH0097","KH0586"),
 ("KH0121","KH0133"),("KH0121","KH0473"),("KH0133","KH0473"),("KH0128","KH0137"),("KH0175","KH0190"),
 ("KH0130","KH0166"),("KH0140","KH0483"),("KH0303","KH0304"),("KH0301","KH0305"),("KH0503","KH0491"),
 ("KH0504","KH0492"),("KH0514","KH0502"),("KH0498","KH0507"),("KH0049","KH0362"),("KH0377","KH0590"),
 ("KH0358","KH0602"),("KH0450","KH0147"),("KH0028","KH0027"),("KH0118","KH0471"),("KH0132","KH0456"),
 ("KH0143","KH0591"),("KH0156","KH0432"),("KH0511","KH0513"),("KH0404","KH0426"),("KH0114","KH0115"),
 ("KH0138","KH0139")]
KNOWN = {tuple(sorted(p)) for p in KNOWN}


def known_all() -> set:
    s = set(KNOWN)
    lj = json.loads((ROOT / "public/data/stories/links.json").read_text())
    for p in lj["pairs"]:
        s.add(tuple(sorted((p["a"], p["b"]))))
    for n in range(682, 692):  # Basel fragments
        for m in (450, 147):
            s.add(tuple(sorted((f"KH{n:04d}", f"KH{m:04d}"))))
    return s

REGION_RULES = [
    ("Incahuasi", r"incahuasi|inkawasi"),
    ("Leymebamba", r"leymebamba|laguna de los c[oó]ndores"),
    ("Pachacamac", r"pachacamac"),
    ("Armatambo", r"armatambo"),
    ("Huaquerones", r"huaquerones"),
    ("Puruchuco", r"puruchuco"),
    ("Huacones", r"huacones"),
    ("Chala", r"chala"),
    ("Nazca", r"nazca|atarco"),
    ("Ica", r"\bica\b|callango|callengo|ocucaje|ullujalla|chulpaca|soniche|pisco|paracas|tambo colorado"),
    ("Arica", r"arica|lluta|playa miller"),
    ("Chachapoyas", r"chachapoya"),
    ("CentralCoast", r"ancon|anc[oó]n|chancay|huacho|lima|chuquitanta|cajamarquilla|maranga|huaca perez|cieneguilla|marquez"),
    ("Santa", r"\bsanta\b"),
]


def region(k: dict) -> str | None:
    s = " ".join(x or "" for x in (k.get("provenance"), (k.get("okr") or {}).get("provenance"), k.get("region")))
    s = s.lower()
    # Nazca Valley; Ancon ambiguous -> first rule matching in order Nazca before CentralCoast
    for name, rx in REGION_RULES:
        if re.search(rx, s):
            return name
    return None


def load() -> list[dict]:
    ks = [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]
    for k in ks:
        k["_region"] = region(k)
    return ks


def pendants(k: dict) -> list[dict]:
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def base_colour(c: dict) -> str | None:
    cp = c.get("colorParsed") or []
    if len(cp) == 1 and len(cp[0]["codes"]) == 1:
        return cp[0]["codes"][0]
    return None

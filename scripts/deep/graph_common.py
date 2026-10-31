"""Shared loaders for the graph_* analyses (multi-layer khipu graph + link prediction)."""
from __future__ import annotations
import json, re, collections
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/graph")
OUT.mkdir(parents=True, exist_ok=True)

WARI = {"KH0280","KH0281","KH0282","KH0288","KH0289","KH0271","KH0346","KH0348","KH0384"}
UNREADABLE = {"KH0015","KH0047","KH0048","KH0094","KH0100","KH0108","KH0584"}
NOVALUE = WARI | UNREADABLE


def load():
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def level1(k):
    cs = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
    return cs


def l1values(k):
    return [c.get("value") or 0 for c in level1(k)]


def curated_pairs():
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    ps = re.findall(r'a:\s*"(KH\d{4})",\s*\n\s*b:\s*"(KH\d{4})"', txt)
    return {tuple(sorted(p)) for p in ps}


def scan_pairs():
    d = json.loads((ROOT / "public/data/stories/links.json").read_text())
    return {tuple(sorted((p["a"], p["b"]))): p for p in d["pairs"]}


def institution(k):
    m = k["museum"].get("canonical") or k["museum"].get("name") or ""
    return "Berlin" if "Berlin" in m else m


def accession_num(k):
    n = (k["museum"].get("number") or "")
    m = re.findall(r"\d+", n)
    return (re.sub(r"[\d\W]", "", n).upper(), int(m[-1])) if m else None


PROV_KEYS = [("Pachacamac", "Pachacamac"), ("Incahuasi", "Inkawasi"), ("Inkawasi", "Inkawasi"),
             ("Leymebamba", "Leymebamba"), ("Laguna de los C", "Leymebamba"), ("Huaquerones", "Huaquerones"),
             ("Armatambo", "Armatambo"), ("Huacones", "Huacones"), ("Chala", "Chala"), ("Nazca", "Nazca"),
             ("Ica", "Ica"), ("Callango", "Ica"), ("Callengo", "Ica"), ("Ocucaje", "Ica"), ("Ullujalla", "Ica"),
             ("Atarco", "Nazca"), ("Paracas", "Paracas"), ("Santa", "Santa"), ("Chancay", "Chancay"),
             ("Ancon", "Ancon"), ("Arica", "Arica"), ("Lluta", "Arica"), ("Marquez", "Marquez"),
             ("Puruchuco", "Puruchuco"), ("Gaffron", None), ("Peru", None)]


def prov(k):
    p = k.get("provenance") or (k.get("okr") or {}).get("provenance") or ""
    for key, lab in PROV_KEYS:
        if key.lower() in p.lower():
            return lab
    return None


def alias_nums(k):
    out = {}
    for a in k["aliases"]:
        m = re.match(r"([A-Z]+)(\d+)", a)
        if m:
            out[m.group(1)] = int(m.group(2))
    return out


def colour_family(code: str) -> str:
    code = re.sub(r"\(.*?\)", "", code or "").strip()
    first = re.split(r"[:\-/ ]", code)[0] if code else ""
    first = re.sub(r"[^A-Z]", "", first.upper())
    if not first:
        return "?"
    return first[-1]  # AB/MB/KB/LB/YB -> B ; W ; G ; R ...

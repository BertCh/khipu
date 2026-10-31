#!/usr/bin/env python3
"""Shared loaders for the cross-khipu arithmetic screens (prefix arith_).

Excludes the Wari canuto family (turn-sum values) and the seven khipus declared
unreadable.  Level-1 pendant sequence = pendants (kind 'pendant', level 1) in
ordinal order; top cords are kept separately as targets.
"""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
SCRATCH = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/"
               "b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/arith")
SCRATCH.mkdir(parents=True, exist_ok=True)

WARI = {f"KH{n:04d}" for n in (280, 281, 282, 288, 289, 271, 346, 348, 384)}
UNREADABLE = {f"KH{n:04d}" for n in (15, 47, 48, 94, 100, 108, 584)}
EXCLUDE = WARI | UNREADABLE


def load(exclude: bool = True) -> dict[str, dict]:
    out = {}
    for p in sorted(DATA.glob("KH*.json")):
        k = json.loads(p.read_text())
        if exclude and k["id"] in EXCLUDE:
            continue
        out[k["id"]] = k
    return out


def pendants(k: dict) -> list[dict]:
    return sorted((c for c in k["cords"] if c["level"] == 1 and c["kind"] == "pendant"),
                  key=lambda c: c["ordinal"])


def pvals(k: dict) -> list[int]:
    return [int(c.get("value") or 0) for c in pendants(k)]


def known_pairs() -> tuple[set, set]:
    """(curated pairs, exact-scan pairs) as frozensets of two ids."""
    txt = (ROOT / "src/lib/stories/links.ts").read_text()
    cur = set()
    for m in re.finditer(r'a:\s*"(KH\d{4})",\s*b:\s*"(KH\d{4})"', txt):
        cur.add(frozenset(m.groups()))
    # fallback for multi-line objects
    for m in re.finditer(r'a:\s*"(KH\d{4})"[^}]*?b:\s*"(KH\d{4})"', txt, re.S):
        cur.add(frozenset(m.groups()))
    # Basel set: all fragments with each other + KH0147/KH0450
    basel = [f"KH{n:04d}" for n in range(682, 692)] + ["KH0147", "KH0450"]
    for i, a in enumerate(basel):
        for b in basel[i + 1:]:
            cur.add(frozenset((a, b)))
    scan = json.loads((ROOT / "public/data/stories/links.json").read_text())
    sc = {frozenset((p["a"], p["b"])) for p in scan["pairs"]}
    return cur, sc

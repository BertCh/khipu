"""Shared loader for the period_* analyses (periodicity, calendrics, tables)."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data" / "khipus"
OUT = Path("/private/tmp/claude-502/-Users-roc8917-Documents-GitHub-khipu/b34f81d5-f837-491e-8291-4abea8192531/scratchpad/deep/period")
OUT.mkdir(parents=True, exist_ok=True)
WARI = {"KH0280", "KH0281", "KH0282", "KH0288", "KH0289", "KH0271", "KH0346", "KH0348", "KH0384"}
UNREADABLE = {"KH0015", "KH0047", "KH0048", "KH0094", "KH0100", "KH0108", "KH0584"}
EXCLUDE_VALUES = WARI | UNREADABLE


def load():
    return [json.loads(p.read_text()) for p in sorted(DATA.glob("KH*.json"))]


def level1(k):
    return sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])


def base_colour(c):
    col = (c.get("color") or "").strip()
    if not col:
        return "?"
    # first colour code of the first segment, e.g. "AB(0-8)/YB" -> AB, "W:MB" -> W:MB (keep mottles)
    seg = col.split("/")[0].split("(")[0]
    return seg or "?"


def rng(seed=20260922):
    return np.random.default_rng(seed)

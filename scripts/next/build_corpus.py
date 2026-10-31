#!/usr/bin/env python3
"""Build public/data/next/corpus-lite.json: the compact corpus the
/next/proving-ground engine runs on (browser workers and Node checks).

    python3 scripts/next/build_corpus.py

Inputs: public/data/khipus/KH*.json and public/data/khipus.json.
Shape: CorpusLiteFile in src/lib/next/types.ts. Per khipu, one entry per
level-1 cord (level == 1, sorted by ordinal): value, kind, group, longest
colour, termination; direct subsidiary values; knot-derived values of cords
whose stored value disagrees with their knots; flags; place, museum, age.

The longest-colour rule is the verified bench port (compute-audit section 3):
the colorParsed segment with the longest range (first on a tie), its codes
joined by its ops (default ":"); with no colorParsed, color up to "(".

Self-checks (asserted): 684 khipus; 104 value/knot conflict cords on 49
khipus (claim value-knot-conflicts); gzipped size under 250 KB.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
OUT = DATA / "next" / "corpus-lite.json"

WARI = ["KH0280", "KH0281", "KH0282", "KH0288", "KH0289", "KH0271", "KH0346", "KH0348", "KH0384"]
UNREADABLE = ["KH0015", "KH0047", "KH0048", "KH0094", "KH0100", "KH0108", "KH0584"]
NOT_DECIMAL = set(WARI + UNREADABLE)

FLAG = {
    "NOT_DECIMAL": 1,
    "WARI": 2,
    "CORD_DATA_ERROR": 4,
    "VALUE_CONFLICT": 8,
    "INKAWASI": 16,
    "IN_OKR": 32,
}
INKAWASI_RE = re.compile(r"incahuasi|inkawasi", re.I)
KIND_CHAR = {"pendant": "P", "top": "T"}
TERM_CHAR = {"K": "K", "B": "B"}

EXPECT_KHIPUS = 684
EXPECT_KV_CORDS = 104
EXPECT_KV_KHIPUS = 49
GZ_LIMIT = 250_000


def num(v: float | int | None) -> float | int:
    """value ?? 0, unrounded, written as an int when it is one."""
    if v is None:
        return 0
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def trunc(v: float | int | None) -> int:
    return 0 if v is None else int(math.trunc(v))


def longest_colour(c: dict) -> str:
    segs = c.get("colorParsed") or []
    if not segs:
        return (c.get("color") or "").split("(")[0]
    best, best_len = segs[0], -1.0
    for g in segs:
        r = g.get("range")
        length = r[1] - r[0] if r else 0
        if length > best_len:
            best, best_len = g, length
    codes = best.get("codes") or []
    ops = best.get("ops") or []
    out = codes[0] if codes else ""
    for i in range(1, len(codes)):
        op = ops[i - 1] if i - 1 < len(ops) and ops[i - 1] is not None else ":"
        out += op + codes[i]
    return out


def year(s: str | None) -> int | None:
    if not s:
        return None
    m = re.match(r"^(-?\d{1,4})", str(s))
    return int(m.group(1)) if m else None


def main() -> int:
    summaries = {s["id"]: s for s in json.loads((DATA / "khipus.json").read_text())}
    files = sorted((DATA / "khipus").glob("KH*.json"), key=lambda p: p.stem)

    sha = hashlib.sha256()
    raws: list[dict] = []
    for f in files:
        b = f.read_bytes()
        sha.update(b)
        raws.append(json.loads(b))
    raws.sort(key=lambda k: k["id"])

    places = sorted({s["provenance"] for s in summaries.values() if s.get("provenance")})
    museums = sorted({s["museum"] for s in summaries.values() if s.get("museum")})
    place_ix = {p: i for i, p in enumerate(places)}
    museum_ix = {m: i for i, m in enumerate(museums)}
    colours: list[str] = []
    colour_ix: dict[str, int] = {}

    def intern_colour(key: str) -> int:
        if not key:
            return -1
        i = colour_ix.get(key)
        if i is None:
            i = colour_ix[key] = len(colours)
            colours.append(key)
        return i

    out_khipus = []
    kv_cords = 0
    kv_khipus = 0
    for k in raws:
        kid = k["id"]
        s = summaries.get(kid, {})
        l1 = sorted((c for c in k["cords"] if c.get("level") == 1), key=lambda c: c["ordinal"])
        index_of = {c["name"]: i for i, c in enumerate(l1)}
        kids: dict[int, list[int]] = {}
        for c in k["cords"]:
            if c.get("kind") != "subsidiary":
                continue
            i = index_of.get(c.get("parent"))
            if i is not None:
                kids.setdefault(i, []).append(trunc(c.get("value")))
        kv = [
            [i, num(c["valueConflict"]["knots"])]
            for i, c in enumerate(l1)
            if c.get("valueConflict") and c["valueConflict"].get("knots") is not None
        ]
        n_conflict_all = sum(1 for c in k["cords"] if c.get("valueConflict"))
        kv_cords += n_conflict_all
        if n_conflict_all:
            kv_khipus += 1

        flags = 0
        if kid in NOT_DECIMAL:
            flags |= FLAG["NOT_DECIMAL"]
        if kid in WARI:
            flags |= FLAG["WARI"]
        if k.get("cordDataError"):
            flags |= FLAG["CORD_DATA_ERROR"]
        if n_conflict_all:
            flags |= FLAG["VALUE_CONFLICT"]
        prov = s.get("provenance") or k.get("provenance")
        if prov and INKAWASI_RE.search(prov):
            flags |= FLAG["INKAWASI"]
        if s.get("inOkr"):
            flags |= FLAG["IN_OKR"]

        e, l = year(s.get("earliestAge")), year(s.get("latestAge"))
        age = [e, l] if e is not None and l is not None else None

        out_khipus.append(
            {
                "id": kid,
                "seq": [num(c.get("value")) for c in l1],
                "kind": "".join(KIND_CHAR.get(c.get("kind"), "M") for c in l1),
                "grp": [c["group"] if c.get("group") is not None else -1 for c in l1],
                "col": [intern_colour(longest_colour(c)) for c in l1],
                "term": "".join(TERM_CHAR.get(c.get("term"), "?") for c in l1),
                "subs": [[i, v] for i, v in sorted(kids.items())],
                "kv": kv,
                "nConflicts": n_conflict_all,
                "flags": flags,
                "place": place_ix.get(prov, -1) if prov else -1,
                "museum": museum_ix.get(s.get("museum"), -1) if s.get("museum") else -1,
                "age": age,
            }
        )

    doc = {
        "version": 1,
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "script": "scripts/next/build_corpus.py",
        "dataHash": sha.hexdigest(),
        "colours": colours,
        "places": places,
        "museums": museums,
        "khipus": out_khipus,
    }
    raw = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    gz = len(gzip.compress(raw, 9))
    kv_l1 = sum(len(k["kv"]) for k in out_khipus)

    print(f"khipus {len(out_khipus)}")
    print(f"value/knot conflict cords {kv_cords} on {kv_khipus} khipus")
    print(f"colours {len(colours)} places {len(places)} museums {len(museums)}")
    print(f"dataHash {doc['dataHash'][:12]}")
    print(f"size {len(raw):,} bytes, gzip {gz:,} bytes")

    ok = True
    for label, got, want in (
        ("khipus", len(out_khipus), EXPECT_KHIPUS),
        ("conflict cords", kv_cords, EXPECT_KV_CORDS),
        ("conflict khipus", kv_khipus, EXPECT_KV_KHIPUS),
    ):
        if got != want:
            print(f"CHECK FAILED: {label} {got} != {want}", file=sys.stderr)
            ok = False
    if kv_l1 != kv_cords:
        # kv holds level-1 cords only (types.ts KhipuLiteRaw.kv); the rest are
        # subsidiaries, counted with the level-1 ones in nConflicts.
        n1 = sum(1 for k in out_khipus if k["kv"])
        print(f"note: kv covers {kv_l1} level-1 cords on {n1} khipus; {kv_cords - kv_l1} conflicts sit on subsidiaries")
    if gz >= GZ_LIMIT:
        print(f"CHECK FAILED: gzip {gz} >= {GZ_LIMIT}", file=sys.stderr)
        ok = False
    if not ok:
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(raw)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

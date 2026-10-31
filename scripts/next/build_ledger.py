#!/usr/bin/env python3
"""Build public/data/next/claims.json (ClaimsFile in src/lib/next/types.ts)
from scripts/next/ledger_src.json, the hand-kept ledger of the project's
claims.

    python3 scripts/next/build_ledger.py

Adds to each claim: hypothesisId (static table below; ids must equal the
engine registry, src/lib/engine/registry.ts), pair, origin, downgrades, and
supersededBy/supersedes; appends the two control pseudo-claims; counts by
status. The engine never rewrites this file: a change of status goes through
ledger_src.json in a commit.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1].parent
SRC = ROOT / "scripts" / "next" / "ledger_src.json"
OUT = ROOT / "public" / "data" / "next" / "claims.json"

HYPOTHESIS_BY_CLAIM = {
    "scan-noise-floor": "scanFloor",
    "mk-relations-chance": "r1",
    "adjacent-sums-real": "r1adj",
    "mk-top-cord-sums-real": "r9",
    "sum-khipus-excess": "profileCounts",
    "total-on-first-cord": "firstCordTotals",
    "top-cord-totals-previous": "topCordPrev",
    "kh0517-totals-heads-kh0502": "chain:KH0517>KH0502",
    "kh0507-kh0513-heads": "chain:KH0507>KH0513",
    "white-pendants-larger": "whiteLarger",
    "value-knot-conflicts": "valueConflicts",
    "strands-thread-verified": "strandsVerified",
    "wari-canuto-no-reading": "wariR1",
    "paris-lima-pair": "pair:KH0097|KH0586",
    "as175-ur233-part1": "pair:KH0192|KH0470",
    "as175-ur232-part3": "pair:KH0192|KH0469",
    "brown-eight": "pair:KH0377|KH0590",
    "six-fields": "pair:KH0358|KH0602",
    "kh0284-kh0285-copy": "pair:KH0284|KH0285",
    "rounded-copy": "pair:KH0049|KH0362",
    "kh0118-kh0471-summary": "pair:KH0118|KH0471",
    "basel-fragment-assignments": "pair:KH0147|KH0683",
    "kh0132-kh0456-copy": "pair:KH0132|KH0456",
    "kh0691-kh0468": "pair:KH0468|KH0691",
    "kh0197-kh0402": "pair:KH0197|KH0402",
}

# old claim -> successor
SUPERSEDED = {
    "white-big-convention-survey": "white-pendants-larger",
    "no-pendants-equal-totals": "kh0517-totals-heads-kh0502",
    "kh0133-third-copy": "kh0133-kfg-duplicate",
    "mk-inkawasi-white-sum": "inkawasi-fixed-deduction",
    "kh0699-9-in-103": "lone-total-before-group",
    "kh0028-ten-groups": "kh0028-proportional-template",
}

CONTROLS = [
    {
        "id": "control:decoy",
        "statement": "A decoy pair (KH0097 against a shuffled KH0586) must fall",
        "khipus": ["KH0097", "KH0586"],
        "kind": "method",
        "status": "held",
        "test": "pair Smith–Waterman score vs shuffles of B, with B itself a seeded sequence shuffle (seed 777)",
        "numbers": None,
        "script": "scripts/next/check_engine.mts",
        "story": None,
        "prior": None,
        "confounds": None,
        "repro": "live",
        "origin": "audit",
        "downgrades": [],
        "hypothesisId": "decoyPair",
        "control": "negative",
    },
    {
        "id": "control:planted",
        "statement": "A planted copy of the Paris–Lima run must be found",
        "khipus": ["KH0097", "KH0586"],
        "kind": "method",
        "status": "held",
        "test": "KH0097's longest shared run planted into a seeded shuffle of KH0586, scored against shuffles of B",
        "numbers": None,
        "script": "scripts/next/check_engine.mts",
        "story": None,
        "prior": None,
        "confounds": None,
        "repro": "live",
        "origin": "audit",
        "downgrades": [],
        "hypothesisId": "plantedCopy",
        "control": "positive",
    },
]

STATUSES = ["held", "fell", "likely", "open", "published-prior"]
EXPECT_CLAIMS = 185
EXPECT_COUNTS = {"held": 102, "fell": 29, "likely": 20, "open": 19, "published-prior": 17}
EXPECT_HYPOTHESES = 27
EXPECT_SUPERSESSIONS = 6

RE_DATA = re.compile(r"KFG|revision|value|transcri")
RE_CONFOUND = re.compile(r"Inkawasi|museum|recorder|magnitude|tier|acquisition")
RE_PRIOR = re.compile(r"Urton|Ascher|KFG|published|Thompson")
RE_SCREEN = re.compile(r"link_screens|shared_passages|build_links")
PAIR_HYP = re.compile(r"^pair:(KH\d{4})\|(KH\d{4})$")


def pair_key(a: str, b: str) -> str:
    return f"{a}|{b}" if a < b else f"{b}|{a}"


def origin_of(c: dict) -> str:
    script = c.get("script") or ""
    if c["status"] == "published-prior":
        return "published"
    if "scripts/deep/" in script:
        return "deep"
    if RE_SCREEN.search(script):
        return "screen"
    if c.get("repro") == "scratchpad":
        return "survey"
    if c["kind"] == "data-correction":
        return "audit"
    if c.get("story"):
        return "story"
    return "audit"


def downgrades_of(c: dict) -> list[str]:
    out: list[str] = []
    confounds = c.get("confounds") or ""
    prior = c.get("prior") or ""
    if RE_DATA.search(confounds):
        out.append("data-error")
    if c["origin"] in ("screen", "deep"):
        out.append("multiplicity")
    if RE_CONFOUND.search(confounds):
        out.append("confound")
    if c["status"] == "published-prior" or RE_PRIOR.search(prior):
        out.append("prior-art")
    if c.get("repro") == "manual":
        out.append("hand-checked")
    return out


def main() -> int:
    src = json.loads(SRC.read_text())
    ids = [c["id"] for c in src]
    by_id = {c["id"]: c for c in src}
    problems: list[str] = []
    if len(ids) != len(by_id):
        problems.append("duplicate claim ids in ledger_src.json")
    for cid in list(HYPOTHESIS_BY_CLAIM) + list(SUPERSEDED) + list(SUPERSEDED.values()):
        if cid not in by_id:
            problems.append(f"unknown claim id {cid}")

    claims = []
    for c0 in src:
        c = dict(c0)
        c["origin"] = origin_of(c)
        c["downgrades"] = downgrades_of(c)
        hyp = HYPOTHESIS_BY_CLAIM.get(c["id"])
        if hyp:
            c["hypothesisId"] = hyp
        if c["kind"] == "link":
            ks = sorted(set(c.get("khipus") or []))
            if len(ks) == 2:
                c["pair"] = pair_key(ks[0], ks[1])
            elif hyp and (m := PAIR_HYP.match(hyp)):
                # a link claim over more khipus whose registry test is one pair
                c["pair"] = pair_key(m.group(1), m.group(2))
        if hyp and (m := PAIR_HYP.match(hyp)) and c.get("pair") and c["pair"] != pair_key(m.group(1), m.group(2)):
            problems.append(f"{c['id']}: pair {c['pair']} != hypothesis {hyp}")
        if c["id"] in SUPERSEDED:
            c["supersededBy"] = SUPERSEDED[c["id"]]
        claims.append(c)
    succ = {new: old for old, new in SUPERSEDED.items()}
    for c in claims:
        if c["id"] in succ:
            c["supersedes"] = succ[c["id"]]
    claims.extend(dict(c) for c in CONTROLS)

    counts = {s: 0 for s in STATUSES}
    for c in claims:
        counts[c["status"]] += 1
    hyp_ids = [c["hypothesisId"] for c in claims if c.get("hypothesisId")]
    n_super = sum(1 for c in claims if c.get("supersededBy"))
    n_pairs = sum(1 for c in claims if c.get("pair"))

    doc = {
        "version": 1,
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "scripts/next/ledger_src.json",
        "counts": counts,
        "claims": claims,
    }

    print(f"claims {len(src)} + {len(CONTROLS)} controls = {len(claims)}")
    print("counts " + ", ".join(f"{s} {counts[s]}" for s in STATUSES))
    print(f"hypothesisIds {len(hyp_ids)} ({len(set(hyp_ids))} distinct)")
    print(f"supersessions {n_super}")
    print(f"pairs {n_pairs}")
    print("origins " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(c["origin"] for c in claims).items())))
    print("downgrades " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(d for c in claims for d in c["downgrades"]).items())))

    if len(src) != EXPECT_CLAIMS:
        problems.append(f"claims {len(src)} != {EXPECT_CLAIMS}")
    if counts != EXPECT_COUNTS:
        problems.append(f"counts {counts} != {EXPECT_COUNTS}")
    expected_hyps = set(HYPOTHESIS_BY_CLAIM.values()) | {"decoyPair", "plantedCopy"}
    if len(hyp_ids) != EXPECT_HYPOTHESES or set(hyp_ids) != expected_hyps:
        problems.append(f"hypothesisIds {len(hyp_ids)}; missing {sorted(expected_hyps - set(hyp_ids))}")
    if n_super != EXPECT_SUPERSESSIONS:
        problems.append(f"supersessions {n_super} != {EXPECT_SUPERSESSIONS}")
    if problems:
        for p in problems:
            print(f"CHECK FAILED: {p}", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(raw + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(raw.encode()):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

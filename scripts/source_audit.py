#!/usr/bin/env python3
"""Reconcile the Khipu Field Guide workbooks with the Open Khipu Repository, corpus-wide.

Every khipu is compared field by field across the sources that describe it:

  KFG        data/kfg/xlsx/KH*.xlsx, read raw (before build_data.SOURCE_OVERRIDES)
  KFG log    each workbook's ChangeLog sheet (Thompson / Khosla corrections since 2023)
  OKR        data/okr/data/khipu.db, read through build_data.OkrCorpus (the same reader the ETL uses)
  registry   data/okr/data/okr-kh-numbers.csv, the OKR's KH-number list (names, museum numbers)
  naming     khipulab/renaming renaming.csv (Brezine et al. 2024 translation table), if present

Checks
  counts        pendants / subsidiaries, KFG vs OKR
  values        level-1 value sequence, KFG vs OKR (forward, and reversed for khipus the KFG turned round)
  primary       primary-cord length
  museum        museum number, KFG vs OKR vs registry
  provenance    find-spot, KFG vs OKR
  names         KFG aliases vs registry / naming table / OKR investigator number
  copies        cord sheets shared between two different khipus (exact or near), in either source, and
                KFG records whose cords match another khipu's OKR record better than their own
  changelog     ChangeLog edits naming a cord the workbook does not have (the KH0133 signature), and
                value edits whose "to" is not the workbook's current value
  internal      KFG cords whose value is not the sum of their knots (or a long knot's value is not its turns)
  overrides     every build_data.SOURCE_OVERRIDES entry re-checked against the raw sources

Each finding is graded
  benign      rounding, formatting, or explained by a KFG ChangeLog entry (the KFG corrected the OKR)
  review      a real disagreement one source cannot settle
  error       two sources agree against a third, or a record carries another khipu's cords

Writes public/data/stories/source-audit.json (committed next to links.json and strands.json, whose
scans it qualifies; the raw sources under data/ are not committed) and prints a summary.

    python3 scripts/source_audit.py [--renaming PATH]
"""
from __future__ import annotations

import argparse
import csv
import difflib
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as bd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "stories" / "source-audit.json"
REGISTRY = ROOT / "data" / "okr" / "data" / "okr-kh-numbers.csv"
RENAMING_DEFAULT = ROOT / "data" / "okr" / "renaming.csv"

CORD_REF = re.compile(r"(?<![A-Za-z])[pP](\d+)((?:s\d+)*)(?:\s*-\s*[pP]?(\d+)(?![s\d]))?")
STRUCTURAL = re.compile(r"turn|flip|upside|revers|renumber|delet|remov|\badd|insert|new cord|new pendant|cleave|"
                        r"combin|split|\bmov|merge|swap|order|extra|missing|fragment|reorganis|introduce", re.I)
# the KFG re-transcribed the khipu from a primary record rather than the OKR
RETRANSCRIBED = re.compile(r"original (data|document|notes|record)|museum image|from images|images? (provided|sent)|"
                           r"examination of (the )?image|KDB|Quave|photo", re.I)
UNNUMBERED = {"", "UNNUMBERED", "SN", "NA", "NONE", "UNKNOWN"}

# Museum numbers checked by hand against sources outside the KFG/OKR lineage, 2026-09-22.
# museum: the holding museum's online catalogue; ascher: Ascher & Ascher databook (1988) page for the AS number.
MANUAL_MUSEUM = {
    "KH0133": {"museum": "VA42545", "ascher": "VA42545"},
    "KH0140": {"ascher": "VA42670"},  # SMB has an online V A 42610 (Pachacamac khipu) and no V A 42670
    "KH0144": {"museum": "VA47098", "ascher": "VA77098"},
    "KH0171": {"museum": "VA37867B", "ascher": "VA37867B"},
    "KH0197": {"museum": "VA47126", "ascher": "VA47126"},
}
MANUAL_SOURCES = {
    "museum": "Staatliche Museen zu Berlin online catalogue (search.smb.museum), via the KFG's museum link or a "
              "search on the number",
    "ascher": "Ascher & Ascher, Code of the Quipu Databook, https://courses.cit.cornell.edu/quipu/data/asNNN.pdf",
}


# ------------------------------------------------------------------ loading

def load_kfg(path: str) -> dict:
    k = bd.load_workbook(path)
    k["changelog"] = bd.load_changelog(path)
    return k


def load_registry() -> dict[str, dict]:
    if not REGISTRY.exists():
        return {}
    with open(REGISTRY, encoding="utf-8-sig") as f:
        return {r["OKR Number"].strip(): r for r in csv.DictReader(f)}


def load_renaming(path: Path | None) -> dict[str, str]:
    if path and path.exists():
        with open(path, encoding="utf-8-sig") as f:
            return {r["okr_num"].strip(): r["cur_num"] for r in csv.DictReader(f)}
    try:
        raw = subprocess.run(
            ["gh", "api", "repos/khipulab/renaming/contents/renaming.csv", "-H", "Accept: application/vnd.github.raw"],
            capture_output=True, text=True, check=True, timeout=30,
        ).stdout
        RENAMING_DEFAULT.write_text(raw)
        return {r["okr_num"].strip(): r["cur_num"] for r in csv.DictReader(raw.splitlines())}
    except Exception:  # noqa: BLE001
        return {}


# ------------------------------------------------------------------ normalisers

def fold(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_accession(s: str | None) -> str | None:
    s = re.sub(r"[^A-Z0-9]", "", (s or "").upper())
    return None if s in UNNUMBERED or re.fullmatch(r"(SN|NA)[A-Z]?", s) else s


def acc_parts(s: str) -> list[str]:
    """'1916.09.0057' -> ['16', '9', '57'];  'VA 42597(B)' -> ['VA', '42597', 'B']."""
    out = []
    for p in re.findall(r"[A-Z]+|\d+", s.upper()):
        if p.isdigit():
            n = int(p)
            out.append(str(n % 100 if len(p) == 4 and 1850 <= n <= 2030 else n))
        elif p not in ("NO", "N"):
            out.append(p)
    return out


def same_accession(a: str, b: str) -> bool:
    """Formatting-level equivalence: one number's parts run inside the other's (a prefix, a year written
    out, a second number given alongside)."""
    for x in re.split(r"[,;]| and |&", a):
        for y in re.split(r"[,;]| and |&", b):
            px, py = acc_parts(x), acc_parts(y)
            if not px or not py:
                continue
            short, long_ = (px, py) if len(px) <= len(py) else (py, px)
            if any(long_[i:i + len(short)] == short for i in range(len(long_) - len(short) + 1)):
                return True
    return False


def norm_names(s: str | None) -> set[str]:
    out = set()
    for tok in re.split(r"[,;/]", s or ""):
        t = re.sub(r"\s+", "", tok.upper())
        m = re.fullmatch(r"([A-Z]+)0*(\d+)([A-Z]?)", t)
        if m:
            out.add(f"{m[1]}{int(m[2])}{m[3]}")
        elif t:
            out.add(t)
    return out


UNKNOWN_PLACE = {"", "unknown", "desconocido", "none", "peru", "sin procedencia"}


def l1(cords: list[dict]) -> list[dict]:
    return sorted((c for c in cords if c["level"] == 1), key=lambda c: c["ordinal"])


def vals(cords: list[dict]) -> list[int]:
    return [c["value"] or 0 for c in l1(cords)]


def knot_shape(c: dict) -> list[tuple]:
    """Knot clusters as (count or turns, type, position) - what a recorder saw, before any value is read."""
    return [(k["n"], k["type"], round(k["pos"])) for k in c["knots"]]


def sig(c: dict) -> tuple:
    """What a copied cord keeps and an independent re-recording would not: value and length together."""
    return (c["value"] or 0, round((c["length"] or 0) * 2) / 2)


# ------------------------------------------------------------------ changelog

def changelog_refs(log: list[dict]) -> tuple[dict[str, list[dict]], bool, bool]:
    """cord name -> changelog rows naming it; whether the log records a structural change; whether it
    records a re-transcription from a primary source."""
    refs: dict[str, list[dict]] = defaultdict(list)
    structural = retranscribed = False
    for r in log:
        text = " ".join(x for x in (r.get("what"), r.get("from"), r.get("to"), r.get("reason")) if x)
        what = r.get("what") or ""
        if STRUCTURAL.search(text):
            structural = True
        if RETRANSCRIBED.search(text):
            retranscribed = True
        for m in CORD_REF.finditer(what):
            a, tail, b = int(m[1]), m[2], m[3]
            if b and not tail and int(b) > a and int(b) - a < 400:
                for i in range(a, int(b) + 1):
                    refs[f"p{i}"].append(r)
            else:
                refs[f"p{a}{tail}"].append(r)
    return refs, structural, retranscribed


def knot_string(k: dict) -> str:
    return f"{k['n']}{k['type']}({k['pos']},{k['dir']}),{k.get('value', 0)}"


def applied_elsewhere(row: dict, cords: list[dict]) -> bool:
    """Whether a ChangeLog edit's new value is on some cord of the workbook (the cord was renamed since)."""
    to = (row.get("to") or "").strip()
    if not to or to.lower() in ("<empty>", "u", "--", "-") or len(to) < 3:
        return False
    for c in cords:
        if to in (c.get("color") or "", str(c.get("value")), ";".join(knot_string(k) for k in c["knots"])):
            return True
    return False


def value_edits(log: list[dict]) -> list[tuple[str, str | None, str | None]]:
    out = []
    for r in log:
        what = r.get("what") or ""
        if re.search(r"/\s*Value\s*$", what, re.I):
            m = CORD_REF.search(what)
            if m and not m[3]:
                out.append((f"p{m[1]}{m[2]}", r.get("from"), r.get("to")))
    return out


# ------------------------------------------------------------------ comparisons

def compare_values(kv: list[int], ov: list[int]) -> dict:
    """Best of forward and reversed alignment of two level-1 value sequences."""
    best = None
    for direction, o in (("fwd", ov), ("rev", ov[::-1])):
        sm = difflib.SequenceMatcher(None, kv, o, autojunk=False)
        matched = sum(b.size for b in sm.get_matching_blocks())
        same = len(kv) == len(o)
        diffs = [i for i in range(len(kv)) if kv[i] != o[i]] if same else None
        score = matched / max(1, max(len(kv), len(o)))
        cand = {"dir": direction, "matched": matched, "score": round(score, 3), "diffPositions": diffs}
        if best is None or cand["score"] > best["score"]:
            best = cand
    return best


def overlap(a: Counter, b: Counter) -> int:
    return sum((a & b).values())


def copy_pairs(sigs: dict[str, Counter], sizes: dict[str, int], min_n: int = 5, threshold: float = 0.6):
    """Pairs of khipus sharing >= threshold of the larger one's (value, length) cord signatures."""
    index: dict[tuple, list[str]] = defaultdict(list)
    for kid, s in sigs.items():
        for t in s:
            if t != (0, 0.0):
                index[t].append(kid)
    cand: Counter = Counter()
    for t, ids in index.items():
        if len(ids) > 25:
            continue
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                cand[(a, b) if a < b else (b, a)] += 1
    out = []
    for (a, b), n in cand.items():
        if min(sizes[a], sizes[b]) < min_n or n < min_n:
            continue
        shared = overlap(sigs[a], sigs[b])
        score = shared / max(sizes[a], sizes[b])
        if score >= threshold:
            out.append({"a": a, "b": b, "shared": shared, "sizes": [sizes[a], sizes[b]], "score": round(score, 3)})
    return sorted(out, key=lambda r: -r["score"])


def cross_best(kfg_sigs: dict[str, Counter], okr_sigs: dict[str, Counter]) -> dict[str, tuple[str, float]]:
    index: dict[tuple, list[str]] = defaultdict(list)
    for kid, s in okr_sigs.items():
        for t in s:
            if t != (0, 0.0):
                index[t].append(kid)
    out = {}
    for kid, s in kfg_sigs.items():
        cand: Counter = Counter()
        for t in s:
            if t != (0, 0.0) and len(index.get(t, ())) <= 25:
                for o in index.get(t, ()):
                    cand[o] += 1
        best, score = None, 0.0
        for o, _ in cand.most_common(8):
            sc = overlap(s, okr_sigs[o]) / max(sum(s.values()), sum(okr_sigs[o].values()))
            if sc > score:
                best, score = o, sc
        out[kid] = (best, round(score, 3))
    return out


# ------------------------------------------------------------------ main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--renaming", type=Path,
                    default=RENAMING_DEFAULT if RENAMING_DEFAULT.exists() else None,
                    help="khipulab/renaming renaming.csv (fetched with gh if missing)")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(bd.KFG_DIR, "KH*.xlsx")))
    with ProcessPoolExecutor() as ex:
        kfg = {k["id"]: k for k in ex.map(load_kfg, files, chunksize=8)}
    okr_db = bd.OkrCorpus()
    okr = {n: okr_db.khipu(n) for n in okr_db.main}
    registry = load_registry()
    renaming = load_renaming(args.renaming)

    findings: dict[str, list[dict]] = defaultdict(list)

    def add(kid: str, check: str, grade: str, msg: str, **detail) -> None:
        findings[kid].append({"check": check, "grade": grade, "msg": msg, **({"detail": detail} if detail else {})})

    both = sorted(set(kfg) & set(okr))
    for kid in both:
        k, o = kfg[kid], okr[kid]
        refs, structural, retrans = changelog_refs(k["changelog"])
        kl1, ol1 = l1(k["cords"]), l1(o["cords"])
        why_ok = "; the ChangeLog records a re-transcription from the primary record" if retrans else \
                 "; the ChangeLog records structural edits" if structural else ""
        if not o["cords"]:
            add(kid, "values", "benign", "the OKR record has no cord data")
            continue

        # counts
        kp, op_ = len(kl1), len(ol1)
        ks = sum(1 for c in k["cords"] if c["level"] > 1)
        os_ = sum(1 for c in o["cords"] if c["level"] > 1)
        if kp != op_:
            add(kid, "counts", "benign" if why_ok else "review", f"pendants KFG {kp} vs OKR {op_}{why_ok}")
        if ks != os_:
            add(kid, "counts", "benign" if why_ok or refs else "review", f"subsidiaries KFG {ks} vs OKR {os_}{why_ok}")

        # values
        kv, ov = vals(k["cords"]), vals(o["cords"])
        if kv != ov:
            cmp = compare_values(kv, ov)
            if cmp["dir"] == "rev" and cmp["score"] == 1.0:
                add(kid, "values", "benign", "KFG reads the khipu from the other end (turned round)")
            elif cmp["diffPositions"] is not None and cmp["dir"] == "fwd":
                rows = []
                for i in cmp["diffPositions"]:
                    a_, b_ = kl1[i], ol1[i]
                    why = ("changelog" if a_["name"] in refs else
                           "value re-read" if knot_shape(a_) == knot_shape(b_) else "knots differ")
                    rows.append({"cord": a_["name"], "kfg": kv[i], "okr": ov[i], "why": why})
                kinds = Counter(r["why"] for r in rows)
                add(kid, "values", "benign" if not kinds["knots differ"] or retrans else "review",
                    f"{len(rows)} of {kp} level-1 values differ ("
                    + ", ".join(f"{n} {w}" for w, n in kinds.most_common()) + ")" + (why_ok if retrans else ""),
                    cords=rows[:20], score=cmp["score"])
            else:
                add(kid, "values", "benign" if why_ok else "review",
                    f"level-1 value sequences align {cmp['score']:.0%} ({cmp['dir']}; KFG {kp}, OKR {op_} cords){why_ok}",
                    score=cmp["score"])

        # primary cord length
        kl, ol = k["primary"]["length"], o["primary"]["length"]
        if kl is not None and ol is not None and abs(kl - ol) > 0.5:
            logged = any(re.search(r"primary.*length|length.*primary", r.get("what") or "", re.I) for r in k["changelog"])
            big = abs(kl - ol) > max(5.0, 0.1 * max(kl, ol))
            add(kid, "primary", "benign" if logged or retrans or not big or not ol else "review",
                f"primary cord KFG {kl} cm vs OKR {ol} cm" + (" (ChangeLog)" if logged else why_ok))

        # provenance
        kp_, op2 = fold(k["provenance"]), fold(o["provenance"])
        if kp_ not in UNKNOWN_PLACE and op2 not in UNKNOWN_PLACE and kp_ != op2 \
                and kp_ not in op2 and op2 not in kp_:
            add(kid, "provenance", "review", f"provenance KFG {k['provenance']!r} vs OKR {o['provenance']!r}")

    # museum numbers: KFG, OKR, registry, and the hand checks against the museum and the Aschers
    reg_by_num = {norm_accession(r.get("Collection Number")): kid for kid, r in registry.items()}
    for kid, k in kfg.items():
        o = okr.get(kid) or {}
        nums = {"kfg": k["museum"]["number"], "okr": o.get("museumNumber"),
                "registry": registry.get(kid, {}).get("Collection Number"), **MANUAL_MUSEUM.get(kid, {})}
        nums = {s_: v for s_, v in nums.items() if norm_accession(v)}
        if len(nums) < 2:
            continue
        # sources grouped by formatting-level agreement
        groups: list[list[str]] = []
        for s_ in nums:
            for g in groups:
                if same_accession(nums[g[0]], nums[s_]):
                    g.append(s_)
                    break
            else:
                groups.append([s_])
        if len(groups) == 1:
            continue
        shown = ", ".join(f"{s_} {v!r}" for s_, v in nums.items())
        okr_n = norm_accession(nums.get("okr"))
        shifted = reg_by_num.get(okr_n) if okr_n else None
        if shifted and 0 < abs(int(shifted[2:]) - int(kid[2:])) <= 2 and "okr" in nums \
                and not same_accession(nums["okr"], nums.get("registry") or "") \
                and same_accession(nums["kfg"], nums.get("registry") or ""):
            add(kid, "museum", "error", f"OKR museum number is {shifted}'s (a shifted row): {shown}", against="okr", **nums)
            continue
        indep = [g for g in groups if "museum" in g or "ascher" in g]
        if "museum" in nums:
            wrong = [s_ for g in groups if "museum" not in g for s_ in g]
            add(kid, "museum", "error", f"{', '.join(wrong)} disagree{'s' if len(wrong) == 1 else ''} with the museum's "
                f"own catalogue: {shown}", against=wrong, **nums)
        elif indep:
            add(kid, "museum", "review", f"museum numbers disagree; the Aschers side with "
                f"{', '.join(s_ for s_ in indep[0] if s_ != 'ascher')}: {shown}", **nums)
        else:
            logged = any(re.search(r"museum ?num|accession", r.get("what") or "", re.I) for r in k["changelog"])
            add(kid, "museum", "benign" if logged else "review",
                f"museum numbers disagree{' (the KFG ChangeLog edits it)' if logged else ''}: {shown}", **nums)

    # names: KFG aliases vs registry / naming table / OKR investigator number (all KFG khipus)
    for kid, k in kfg.items():
        aliases = norm_names(",".join(k["aliases"]))
        other = {
            "registry": norm_names(registry.get(kid, {}).get("Other Names")),
            "naming": norm_names(renaming.get(kid)),
            "okr": norm_names((okr.get(kid) or {}).get("investigatorNum")),
        }
        missing = {s: sorted(v - aliases) for s, v in other.items() if v - aliases}
        if missing:
            add(kid, "names", "review" if any(len(v) for v in missing.values()) else "benign",
                "names in other sources the KFG aliases lack: "
                + "; ".join(f"{s} {', '.join(v)}" for s, v in missing.items()), aliases=sorted(aliases))

    # changelog: cords named that the workbook lacks; value edits not reflected in the sheet
    for kid, k in kfg.items():
        names = {c["name"] for c in k["cords"]}
        refs, structural, _ = changelog_refs(k["changelog"])
        orphans = sorted(n for n in refs if n not in names
                         and not all(applied_elsewhere(r, k["cords"]) for r in refs[n]))
        if orphans:
            o = okr.get(kid)
            in_okr = sorted(n for n in orphans if o and n in {c["name"] for c in o["cords"]})
            grade = "benign" if structural else ("error" if in_okr else "review")
            add(kid, "changelog", grade,
                f"ChangeLog names cords the workbook lacks: {', '.join(orphans[:8])}"
                + (f" (present in the OKR record: {', '.join(in_okr[:8])})" if in_okr else "")
                + ("; the log also records structural edits" if structural else ""), orphans=orphans, inOkr=in_okr)
        by = {c["name"]: c for c in k["cords"]}
        last = {n: (n, f, t) for n, f, t in value_edits(k["changelog"])}  # the log is in date order per khipu
        okr_by = {c["name"]: c for c in (okr.get(kid) or {}).get("cords", [])}
        renamed = {n for n in last if n in by and n in okr_by and by[n]["length"] != okr_by[n]["length"]}
        stale = [(n, f, t) for n, f, t in last.values()
                 if n in by and n not in renamed and t not in (None, "", "<empty>") and bd.num(t, int) is not None
                 and bd.num(t, int) != (by[n]["value"] or 0)]
        if stale and not structural:
            add(kid, "changelog", "review",
                f"{len(stale)} ChangeLog value edits not reflected in the sheet: "
                + ", ".join(f"{n} to {t} (sheet {by[n]['value']})" for n, _, t in stale[:6]))

    # internal consistency of each workbook: a cord's value against its knots
    for kid, k in kfg.items():
        bad = []
        for c in k["cords"]:
            ks = c["knots"]
            if not ks or any("value" not in x for x in ks):
                continue
            total = sum(x["value"] for x in ks)
            longs = [x for x in ks if x["type"] in bd.LONG_KNOT_TYPES and x["value"]
                     and not any(x["value"] == x["n"] * 10 ** e for e in range(5))]
            if total != (c["value"] or 0) or longs:
                kind = "value is not the knot sum" if total != (c["value"] or 0) else "long knot's turns and value differ"
                bad.append({"cord": c["name"], "value": c["value"], "knotSum": total, "kind": kind,
                            "knots": ";".join(knot_string(x) for x in ks)})
        if bad:
            add(kid, "internal", "review",
                f"{len(bad)} cord{'s' if len(bad) > 1 else ''} where the KFG sheet contradicts itself: "
                + ", ".join(f"{b['cord']} ({b['kind']}: {b['knots']} = {b['value']})" for b in bad[:3]), cords=bad[:20])

    # copies: exact / near cord sheets shared by two khipus, per source; KFG matching another OKR record
    kfg_sigs = {kid: Counter(sig(c) for c in k["cords"]) for kid, k in kfg.items()}
    okr_sigs = {kid: Counter(sig(c) for c in o["cords"]) for kid, o in okr.items() if o["cords"]}
    kfg_n = {kid: sum(s.values()) for kid, s in kfg_sigs.items()}
    okr_n = {kid: sum(s.values()) for kid, s in okr_sigs.items()}
    copies = {"kfg": copy_pairs(kfg_sigs, kfg_n), "okr": copy_pairs(okr_sigs, okr_n)}
    def own_match(kid: str) -> float:
        if kid not in kfg_sigs or kid not in okr_sigs:
            return 0.0
        return overlap(kfg_sigs[kid], okr_sigs[kid]) / max(kfg_n[kid], okr_n[kid])

    for src, rows in copies.items():
        for r in rows:
            exact = r["score"] == 1.0 and r["sizes"][0] == r["sizes"][1]
            for kid, other in ((r["a"], r["b"]), (r["b"], r["a"])):
                original = src == "kfg" and own_match(kid) >= 0.8 and own_match(other) < 0.5
                add(kid, "copies", "benign" if original else "error" if exact else "review",
                    f"{src.upper()} cord sheet {'identical to' if exact else 'shares ' + format(r['score'], '.0%') + ' of its cords with'} "
                    f"{other} ({r['shared']} of {max(r['sizes'])} cords, value and length)"
                    + (f"; these are {kid}'s own cords (its OKR record matches), {other}'s are the copy" if original else ""),
                    other=other, source=src)
    cross = cross_best(kfg_sigs, okr_sigs)
    for kid, (best, score) in cross.items():
        own = overlap(kfg_sigs[kid], okr_sigs[kid]) / max(kfg_n[kid], okr_n[kid]) if kid in okr_sigs else 0.0
        if best and best != kid and score >= 0.5 and score > own + 0.2:
            add(kid, "copies", "error",
                f"KFG cords match OKR {best} ({okr[best]['investigatorNum']}) at {score:.0%}, "
                f"their own OKR record at {own:.0%}", other=best, source="kfg-vs-okr")

    # overrides: re-check every entry
    override_status = {}
    for kid, o in bd.SOURCE_OVERRIDES.items():
        k = kfg.get(kid)
        st = []
        if o.get("cords") == "okr":
            still = any(f["check"] == "copies" and f["grade"] == "error" for f in findings.get(kid, []))
            st.append("cords: KFG still carries another khipu's cords" if still else
                      "cords: KFG no longer matches another khipu - override may be redundant")
        if "provenance" in o and k:
            same = fold(k["provenance"]) == fold(o["provenance"])
            st.append("provenance: KFG now agrees - redundant" if same else f"provenance: KFG still {k['provenance']!r}")
        if "museumNumber" in o and k:
            same = norm_accession(k["museum"]["number"]) == norm_accession(o["museumNumber"])
            st.append("museum number: KFG now agrees - redundant" if same else
                      f"museum number: KFG still {k['museum']['number']!r}")
        override_status[kid] = st

    # ---------------------------------------------------------- report
    grades = Counter()
    by_check = defaultdict(Counter)
    for kid, fs in findings.items():
        for f in fs:
            grades[f["grade"]] += 1
            by_check[f["check"]][f["grade"]] += 1
    khipus_by_grade = Counter(
        max((f["grade"] for f in fs), key=["benign", "review", "error"].index) for fs in findings.values()
    )
    report = {
        "generated": "scripts/source_audit.py",
        "sources": {
            "kfg": len(kfg), "okr": len(okr), "both": len(both), "registry": len(registry), "naming": len(renaming),
            "kfgOnly": sorted(set(kfg) - set(okr)), "okrOnly": sorted(set(okr) - set(kfg)),
        },
        "grades": {"benign": "rounding, formatting, or explained by a KFG ChangeLog entry",
                   "review": "a disagreement one source cannot settle",
                   "error": "two sources agree against a third, or a record carries another khipu's cords"},
        "summary": {c: dict(v) for c, v in sorted(by_check.items())},
        "khipusByWorstGrade": dict(khipus_by_grade),
        "manualChecks": {"sources": MANUAL_SOURCES, "museumNumbers": MANUAL_MUSEUM},
        "overrides": {kid: {"fields": [x for x in ("cords", "provenance", "museumNumber") if x in o],
                            "why": o["why"], "evidence": o["evidence"], "status": override_status[kid]}
                      for kid, o in bd.SOURCE_OVERRIDES.items()},
        "copies": copies,
        "khipus": {kid: findings[kid] for kid in sorted(findings)},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")

    print(f"KFG {len(kfg)} workbooks, OKR {len(okr)} khipus, {len(both)} in both; "
          f"registry {len(registry)}, naming table {len(renaming)}")
    print(f"KFG only: {len(report['sources']['kfgOnly'])}; OKR only: {report['sources']['okrOnly']}")
    print(f"\n{'check':<11} {'benign':>7} {'review':>7} {'error':>6}")
    for c, v in sorted(by_check.items()):
        print(f"{c:<11} {v.get('benign', 0):>7} {v.get('review', 0):>7} {v.get('error', 0):>6}")
    print(f"khipus with findings, by worst grade: {dict(khipus_by_grade)}")
    errs = [(kid, f) for kid in sorted(findings) for f in findings[kid] if f["grade"] == "error"]
    shifted = [kid for kid, f in errs if "shifted row" in f["msg"]]
    print("\nerrors (two sources against a third, or another khipu's cords):")
    for kid, f in errs:
        if "shifted row" not in f["msg"]:
            print(f"  {kid} [{f['check']}] {f['msg']}")
    print(f"  + {len(shifted)} OKR khipu_main.MUSEUM_NUM values that belong to a neighbouring KH number "
          f"(KFG and registry agree; the app uses the KFG's): {', '.join(shifted)}")
    print("\noverrides:")
    for kid, st in override_status.items():
        print(f"  {kid}: {'; '.join(st)}")
    print(f"\n-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Build frontend-ready JSON from the two raw khipu data sources.

Sources
  data/kfg/xlsx/KH*.xlsx      Khipu Field Guide workbooks (one per khipu)
  data/okr/data/khipu.db      Open Khipu Repository SQLite archive

Outputs (public/data/)
  khipus.json                 index: one summary record per khipu
  khipus/KH0279.json          full structure per khipu (primary, groups, cords, knots)
  cords.json                  flat columnar table of every cord (for ad-hoc corpus analysis)
  corpus.json                 precomputed corpus-wide aggregates for the overview charts
  silhouettes.json            per khipu: pendant lengths + base colour codes, for thumbnails
  colors.json                 Ascher colour code -> name / hex / family
  codes.json                  code tables (knot types, attachment, termination, fiber, ...)

Run:  python3 scripts/build_data.py
"""

from __future__ import annotations

import glob
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KFG_DIR = os.path.join(ROOT, "data", "kfg", "xlsx")
OKR_DB = os.path.join(ROOT, "data", "okr", "data", "khipu.db")
OUT_DIR = os.path.join(ROOT, "public", "data")

# ---------------------------------------------------------------------------
# Grammar
# ---------------------------------------------------------------------------

# 4S(5.0,ZZSZ),40[AXD]  ->  count, type, position cm, per-knot directions, [axis], value, [axis]
KNOT_RE = re.compile(
    r"^(?P<n>\d+)(?P<type>[A-Z]+)\((?P<pos>[0-9.]+),(?P<dir>[SZU?]+)\)"
    r"(?:\[(?P<axis1>[A-Z]+)\])?(?:,(?P<value>-?\d+))?(?:\[(?P<axis2>[A-Z]+)\])?$"
)
# p13s1s2  /  p5m1 (marker)
NAME_RE = re.compile(r"^p(\d+)((?:[sm]\d+)*)$")
# (1:8.0)(2:10.0)
POS_RE = re.compile(r"\((\d+):([0-9.]+)\)")
GROUP_RE = re.compile(
    r"^(?P<start>[0-9.]+)cm (?:group of (?P<n>\d+) pendants \((?P<a>\d+)-(?P<b>\d+)\) space of (?P<sp>[0-9.]+)cm"
    r"|(?P<n1>\d+) \((?P<single>\d+)\))\s*$"
)
COLOR_OPS = {":": "mottled", "-": "barberpole", "%": "striped", "^": "tweed", "**": "special"}
# For these knot types the leading number is the number of turns on ONE knot (the digit 2-9),
# not a count of knots.  For S/E/EE/TF the number is a count of knots in the cluster.
LONG_KNOT_TYPES = {"L", "LL", "BL", "SP"}


def physical_knots(k: dict) -> int:
    return 1 if k["type"] in LONG_KNOT_TYPES else k["n"]


def num(v, cast=float):
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "?", "None", "nan"):
        return None
    try:
        return cast(float(s)) if cast is int else cast(s)
    except ValueError:
        return None


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s not in ("?", "Unknown", "None", "0000-00-00") else None


def parse_knots(s: str | None) -> list[dict]:
    knots = []
    if not s:
        return knots
    for tok in str(s).split(";"):
        tok = tok.strip()
        if not tok:
            continue
        m = KNOT_RE.match(tok)
        if not m:
            raise ValueError(f"unparsed knot token: {tok!r}")
        n = int(m["n"])
        dirs = m["dir"]
        k = {
            "n": n,
            "type": m["type"],
            "pos": float(m["pos"]),
            "dir": dirs if len(dirs) > 1 else dirs[0],
        }
        if m["value"] is not None:
            k["value"] = int(m["value"])
        axis = m["axis1"] or m["axis2"]
        if axis:
            k["axis"] = axis
        knots.append(k)
    return knots


def parse_color(s: str | None) -> list[dict] | None:
    """'W:MB(0.0-25.0)/AB(25.0-41.0)' -> [{codes:[W,MB], ops:[':'], range:[0,25]}, ...]"""
    if not s:
        return None
    segs = []
    for seg in str(s).split("/"):
        seg = seg.strip()
        if not seg:
            continue
        rng = None
        rm = re.search(r"\(([0-9.]+)-([0-9.]+)\)\s*$", seg)
        if rm:
            rng = [float(rm[1]), float(rm[2])]
            seg = seg[: rm.start()].strip()
        parts = re.split(r"(\*\*|[:\-%^])", seg)
        codes = [p.strip() for p in parts[0::2] if p.strip()]
        ops = [p for p in parts[1::2]]
        d = {"codes": codes}
        if ops:
            d["ops"] = ops
        if rng:
            d["range"] = rng
        segs.append(d)
    return segs or None


def parse_name(name: str) -> tuple[str | None, int, str]:
    """Return (parent_name, level, kind) for a cord name."""
    m = NAME_RE.match(name)
    if not m:
        raise ValueError(f"unparsed cord name: {name!r}")
    tail = m[2]
    if not tail:
        return None, 1, "pendant"
    parts = re.findall(r"[sm]\d+", tail)
    parent = "p" + m[1] + "".join(parts[:-1])
    kind = "marker" if parts[-1][0] == "m" else "subsidiary"
    return parent, len(parts) + 1, kind


def kv_sheet(ws) -> dict[str, str]:
    d = {}
    for (v, *_rest) in ws.iter_rows(values_only=True):
        if isinstance(v, str) and ":" in v and not v.startswith("!"):
            k, val = v.split(":", 1)
            d[k.strip()] = val.strip()
    return d


# ---------------------------------------------------------------------------
# Museum names: the KFG records them as free text, so the same institution
# appears under several spellings.  Canonicalise for counting and filtering;
# the raw name is kept on the khipu record.
# ---------------------------------------------------------------------------

MUSEUM_CANON = {
    "Museum für Völkerkunde (Ethnologische Museum)": "Ethnologisches Museum, Berlin",
    "Ethnologisches Museum": "Ethnologisches Museum, Berlin",
    "Museo Nacional Pueblo Libre (Museo Nacional de Arqueología, Antropología e Historia del Perú)":
        "Museo Nacional de Arqueología, Antropología e Historia del Perú",
    "Museo Nacional de Arqueología, Antropología e Historia del Perú (Museo Nacional Pueblo Libre)":
        "Museo Nacional de Arqueología, Antropología e Historia del Perú",
    "Phoebe Hearst Museum (Lowie Museum), University of California": "Phoebe A. Hearst Museum of Anthropology",
    "Phoebe Hearst Museum of Anthropology (Lowie Museum), University of California":
        "Phoebe A. Hearst Museum of Anthropology",
    "Private collection (previously: Maiman Collection (deaccessed), Tel Aviv, Isreal)":
        "Private collection (formerly Maiman Collection, Tel Aviv)",
    "Private collection (previously: Maiman Collection (deaccessed), Tel Aviv, Israel)":
        "Private collection (formerly Maiman Collection, Tel Aviv)",
    "Private Collection, Anna Maria Soldi": "Private collection, Anna Maria Soldi",
    "Museo Chileno de Arte Precolombino (previous: Private collection, Percy Dauelsberg, Arica, Chile)":
        "Museo Chileno de Arte Precolombino",
    "Museo Amano, Museo Textil Precolombino": "Museo Amano",
    "Musee Quai Branly (previous names: Musee de l Homme, Musée d'Ethnographie du Trocadéro)":
        "Musée du quai Branly",
    "Museum of the American Indian, Heye Foundation (Smithsonian)": "National Museum of the American Indian",
    "Rijksmuseum fur Volkerkunde": "Rijksmuseum voor Volkenkunde, Leiden",
    "Dartmouth College, Hanover, New Hampshire": "Hood Museum of Art, Dartmouth College",
}
# generic names that only make sense with their city
MUSEUM_NEEDS_CITY = {"Museum für Völkerkunde", "Museum für Volkerkunde", "Landesmuseum", "Musee d Ethnographie"}


def canonical_museum(name: str | None, city: str | None) -> str | None:
    if not name:
        return None
    if name in MUSEUM_CANON:
        return MUSEUM_CANON[name]
    if name in MUSEUM_NEEDS_CITY and city:
        return f"{name.replace('Volkerkunde', 'Völkerkunde')}, {city}"
    return name


def summarise(cords: list[dict], groups: list[dict]) -> dict:
    """The per-khipu stats block, from cords in the KFG shape (whichever source they came from)."""
    colors_used: Counter = Counter()
    knot_types: Counter = Counter()
    for c in cords:
        for seg in c.get("colorParsed") or []:
            for code in seg["codes"]:
                colors_used[code] += 1
        for k in c["knots"]:
            knot_types[k["type"]] += physical_knots(k)
    return {
        "nCords": len(cords),
        "nPendants": sum(1 for c in cords if c["level"] == 1),
        "nSubsidiaries": sum(1 for c in cords if c["level"] > 1),
        "nTop": sum(1 for c in cords if c["kind"] == "top"),
        "nGroups": len(groups),
        "nKnots": sum(c["nKnots"] for c in cords),
        "maxLevel": max((c["level"] for c in cords), default=0),
        "nColors": len(colors_used),
        "totalValue": sum(c["value"] or 0 for c in cords),
        "maxValue": max((c["value"] or 0 for c in cords), default=0),
        "meanCordLength": round(
            sum(c["length"] for c in cords if c["length"]) / max(1, sum(1 for c in cords if c["length"])), 2
        ),
        "knotTypes": dict(knot_types),
        "topColors": [k for k, _ in colors_used.most_common(5)],
    }


def primary_from_kv(pc: dict) -> dict:
    return {
        "structure": clean(pc.get("Structure")),
        "thick": num(pc.get("Thickness")),
        "length": num(pc.get("Length")),
        "color": clean(pc.get("Color")),
        "colorParsed": parse_color(clean(pc.get("Color"))),
        "fiber": clean(pc.get("Fiber")),
        "beginning": clean(pc.get("Beginning")),
        "term": clean(pc.get("Termination")),
        "twist": clean(pc.get("Twist")),
        "notes": clean(pc.get("Plain_Notes")) or clean(pc.get("Notes")),
    }


def load_changelog(path: str) -> list[dict]:
    """The workbook's ChangeLog sheet as rows {date, who, what, from, to, impact, reason}."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "ChangeLog" not in wb.sheetnames:
        return []
    out = []
    keys = ("date", "who", "what", "from", "to", "impact", "reason")
    for i, r in enumerate(wb["ChangeLog"].iter_rows(values_only=True)):
        if i == 0 or not r or not any(v is not None for v in r):
            continue
        out.append({k: (str(v).strip() if v is not None else None) for k, v in zip(keys, r)})
    return out


# ---------------------------------------------------------------------------
# KFG workbook -> khipu dict
# ---------------------------------------------------------------------------

def load_workbook(path: str) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    meta = kv_sheet(wb["Khipu"])
    pc = kv_sheet(wb["PrimaryCord"])
    kid = meta["Name"]

    # --- cord groups (positions along the primary cord) ---
    groups = []
    for (v, *_r) in wb["CordGroups"].iter_rows(values_only=True):
        if not isinstance(v, str) or v.startswith("!"):
            continue
        m = GROUP_RE.match(v)
        if not m:
            raise ValueError(f"{kid}: unparsed group line {v!r}")
        if m["single"]:
            a = b = int(m["single"])
            sp = 0.0
        else:
            a, b, sp = int(m["a"]), int(m["b"]), float(m["sp"])
        groups.append({"start": float(m["start"]), "first": a, "last": b, "n": b - a + 1, "spacing": sp})

    # pendant ordinal -> (group index, position on primary cord)
    pendant_pos: dict[int, tuple[int, float]] = {}
    for gi, g in enumerate(groups):
        for i in range(g["first"], g["last"] + 1):
            pendant_pos[i] = (gi, round(g["start"] + (i - g["first"]) * g["spacing"], 3))

    # --- cords ---
    rows = list(wb["Cords"].iter_rows(values_only=True))
    header = [str(h) for h in rows[0]]
    cords: list[dict] = []
    by_name: dict[str, dict] = {}
    for r in rows[1:]:
        if not r or r[0] is None:
            continue
        d = dict(zip(header, r))
        name = str(d["Cord_Name"]).strip()
        parent, level, kind = parse_name(name)
        knots = parse_knots(d.get("Knots"))
        c = {
            "name": name,
            "level": level,
            "kind": kind,
            "twist": clean(d.get("Twist")),
            "attach": clean(d.get("Attachment")),
            "length": num(d.get("Length")),
            "term": clean(d.get("Termination")),
            "thick": num(d.get("Thickness")),
            "color": clean(d.get("Color")),
            "value": num(d.get("Value"), int),
            "altValue": num(d.get("Alt_Value"), int),
            "knots": knots,
            "nKnots": sum(physical_knots(k) for k in knots),
        }
        if parent:
            c["parent"] = parent
        if c["color"]:
            c["colorParsed"] = parse_color(c["color"])
        if c["attach"] == "T":
            c["kind"] = "top"
        sub = d.get("Position")
        if sub:
            c["subPositions"] = [(int(a), float(b)) for a, b in POS_RE.findall(str(sub))]
        notes = clean(d.get("Notes"))
        if notes:
            c["notes"] = notes
        if c["thick"] == 0:
            c["thick"] = None
        cords.append(c)
        by_name[name] = c

    # position of each cord on its parent
    # - pendants: from CordGroups
    # - subsidiaries: from parent's Position column, expanded in order
    child_counter: Counter = Counter()
    for c in cords:
        if c["level"] == 1:
            m = NAME_RE.match(c["name"])
            ordinal = int(m[1])
            c["ordinal"] = ordinal
            if ordinal in pendant_pos:
                c["group"], c["pos"] = pendant_pos[ordinal]
        else:
            p = by_name.get(c["parent"])
            idx = child_counter[c["parent"]]
            child_counter[c["parent"]] += 1
            c["ordinal"] = idx + 1
            if p and p.get("subPositions"):
                slots = [pos for n, pos in p["subPositions"] for _ in range(n)]
                if slots:
                    c["pos"] = slots[min(idx, len(slots) - 1)]

    for c in cords:
        c.pop("subPositions", None)

    primary = primary_from_kv(pc)

    aliases = [a.strip() for a in re.split(r"[,;]", meta.get("Aliases", "")) if a.strip()]
    khipu = {
        "id": kid,
        "aliases": aliases,
        "contributors": clean(meta.get("Contributors")),
        "kfgUrl": clean(meta.get("KFG URL")) or f"https://www.khipufieldguide.com/catalog/{kid}.html",
        "museum": {
            "name": clean(meta.get("Museum Name")),
            "canonical": canonical_museum(clean(meta.get("Museum Name")), clean(meta.get("Museum City/State"))),
            "number": clean(meta.get("Museum Number")),
            "city": clean(meta.get("Museum City/State")),
            "country": clean(meta.get("Museum Country")),
            "url": clean(meta.get("Museum URL")),
            "description": clean(meta.get("Museum Description")),
        },
        "provenance": clean(meta.get("Provenance")),
        "region": clean(meta.get("Region")),
        "created": clean(meta.get("Creation_Date")),
        "primary": primary,
        "groups": groups,
        "cords": cords,
        "stats": summarise(cords, groups),
    }
    return khipu


# ---------------------------------------------------------------------------
# OKR joins
# ---------------------------------------------------------------------------

class OkrCorpus:
    """Every khipu of the OKR database, readable in the shape load_workbook() returns.

    The KFG workbooks were built from this database and then corrected by hand, so for most
    khipus the two agree; source_audit.py compares them corpus-wide, and SOURCE_OVERRIDES below
    uses this reader where the KFG record is known to be wrong.

    Conventions (checked against the KFG for the khipus where both agree):
      - level-1 cords are ordered by cord cluster, then position in the cluster;
      - a cord's value is the sum of knot.knot_value_type over its knots (the column already
        holds place value x count for single knots and the turn count for long knots);
      - long knots (L/LL/BL/SP) become one KFG knot token whose leading number is the turn count,
        S/E/EE/TF clusters one token whose leading number is the knot count.
    """

    def __init__(self, path: str = OKR_DB) -> None:
        if not os.path.exists(path):
            sys.exit(f"missing {path}")
        con = sqlite3.connect(path)
        con.row_factory = sqlite3.Row
        self.main = {r["OKR_NUM"].strip(): dict(r) for r in con.execute("SELECT * FROM khipu_main")}
        self.primary = {r["KHIPU_ID"]: dict(r) for r in con.execute("SELECT * FROM primary_cord")}
        self.cords: dict[int, list[dict]] = defaultdict(list)
        for r in con.execute("SELECT * FROM cord"):
            self.cords[r["KHIPU_ID"]].append(dict(r))
        self.clusters = {r["CLUSTER_ID"]: dict(r) for r in con.execute("SELECT * FROM cord_cluster")}
        self.knots: dict[int, list[dict]] = defaultdict(list)
        for r in con.execute(
            "SELECT k.*, kc.START_POS AS KC_POS, kc.ORDINAL AS KC_ORD FROM knot k "
            "LEFT JOIN knot_cluster kc ON kc.CLUSTER_ID = k.CLUSTER_ID"
        ):
            self.knots[r["CORD_ID"]].append(dict(r))
        self.colors: dict[tuple[int, int], list[dict]] = defaultdict(list)
        for r in con.execute("SELECT * FROM ascher_cord_color ORDER BY COLOR_RANGE, RANGE_BEG"):
            self.colors[(r["PCORD_FLAG"] or 0, r["CORD_ID"])].append(dict(r))
        con.close()

    def color(self, pflag: int, cord_id: int) -> str | None:
        rows = self.colors.get((pflag, cord_id)) or []
        segs = [re.sub(r"\s+", "", r["FULL_COLOR"] or "") for r in rows]
        segs = [x for x in segs if x]
        if not segs:
            return None
        if len(segs) == 1:
            return segs[0]
        return "/".join(f"{x}({r['RANGE_BEG']:.1f}-{r['RANGE_END']:.1f})" for x, r in zip(segs, rows))

    def cord_knots(self, cord_id: int) -> tuple[list[dict], int]:
        clusters: dict = {}
        for k in sorted(self.knots.get(cord_id, []), key=lambda k: (k["KC_ORD"] or 0, k["KNOT_ORDINAL"] or 0)):
            clusters.setdefault(k["CLUSTER_ID"], []).append(k)
        out, total = [], 0
        for ks in clusters.values():
            t = (ks[0]["TYPE_CODE"] or "").strip().strip("'") or "U"
            value = int(sum(k["knot_value_type"] or 0 for k in ks))
            dirs = "".join(((k["DIRECTION"] or "").strip() or "U")[0] for k in ks)
            if t in LONG_KNOT_TYPES:
                n = int(ks[0]["NUM_TURNS"] or ks[0]["knot_value_type"] or 0)
                dirs = dirs[0]
            else:
                n = len(ks)
            pos = ks[0]["KC_POS"] if ks[0]["KC_POS"] is not None else 0.0
            d = {"n": n, "type": t, "pos": float(pos), "dir": dirs if len(set(dirs)) > 1 else dirs[0], "value": value}
            if ks[0]["AXIS_ORIENTATION"]:
                d["axis"] = ks[0]["AXIS_ORIENTATION"].strip()
            out.append(d)
            total += value
        return out, total

    def khipu(self, okr_num: str) -> dict | None:
        """{cords, groups, primary, museum, provenance, investigatorNum} for one khipu, or None."""
        m = self.main.get(okr_num)
        if not m:
            return None
        kid = m["KHIPU_ID"]
        rows = self.cords.get(kid, [])
        children: dict[int, list[dict]] = defaultdict(list)
        for r in rows:
            children[r["PENDANT_FROM"]].append(r)

        def order(r: dict) -> tuple:
            cl = self.clusters.get(r["CLUSTER_ID"]) or {}
            return (cl.get("ORDINAL") or 0, r["CLUSTER_ORDINAL"] or 0, r["CORD_ORDINAL"] or 0, r["CORD_ID"])

        cords: list[dict] = []

        def emit(r: dict, name: str, level: int, ordinal: int, parent: str | None) -> None:
            knots, value = self.cord_knots(r["CORD_ID"])
            color = self.color(0, r["CORD_ID"])
            is_top = level == 1 and (r["CORD_LEVEL"] or 0) < 0
            c = {
                "name": name,
                "level": level,
                "kind": "top" if is_top else "pendant" if level == 1 else "subsidiary",
                "twist": clean(r["TWIST"]),
                "attach": "T" if is_top else clean(r["ATTACHMENT_TYPE"]),
                "length": num(r["CORD_LENGTH"]),
                "term": clean(r["TERMINATION"]),
                "thick": num(r["THICKNESS"]) or None,
                "color": color,
                "value": value,
                "altValue": None,
                "knots": knots,
                "nKnots": sum(physical_knots(k) for k in knots),
                "ordinal": ordinal,
            }
            if parent:
                c["parent"] = parent
                c["pos"] = num(r["ATTACH_POS"])
            if color:
                c["colorParsed"] = parse_color(color)
            if clean(r["CORD_NOTES"]):
                c["notes"] = clean(r["CORD_NOTES"])
            c["okrCordId"] = r["CORD_ID"]
            cords.append(c)
            for j, ch in enumerate(sorted(children.get(r["CORD_ID"], []), key=order), 1):
                emit(ch, f"{name}s{j}", level + 1, j, name)

        # roots hang from the primary cord: PENDANT_FROM is the khipu id, the primary-cord id or 0 depending
        # on the record, so a root is any cord whose parent is not another cord. Top cords (negative
        # CORD_LEVEL) are roots too; the KFG numbers them among the pendants with attachment T.
        ids = {r["CORD_ID"] for r in rows}
        top = sorted((r for r in rows if r["PENDANT_FROM"] not in ids), key=order)
        groups = []
        seen: dict[int, int] = {}
        for i, r in enumerate(top, 1):
            cid = r["CLUSTER_ID"]
            if cid not in seen:
                cl = self.clusters.get(cid) or {}
                seen[cid] = len(groups)
                groups.append({"start": num(cl.get("START_POSITION")) or 0.0, "end": num(cl.get("END_POSITION")),
                               "first": i, "last": i, "n": 0, "spacing": 0.0})
            g = groups[seen[cid]]
            g["last"], g["n"] = i, g["n"] + 1
            emit(r, f"p{i}", 1, i, None)
        for g in groups:
            end = g.pop("end")
            if g["n"] > 1 and end is not None and end > g["start"]:
                g["spacing"] = round((end - g["start"]) / (g["n"] - 1), 3)
        for c in cords:
            if c["level"] == 1:
                gi = next(i for i, g in enumerate(groups) if g["first"] <= c["ordinal"] <= g["last"])
                g = groups[gi]
                c["group"], c["pos"] = gi, round(g["start"] + (c["ordinal"] - g["first"]) * g["spacing"], 3)

        pc = self.primary.get(kid) or {}
        pcolor = self.color(1, pc.get("PCORD_ID") or kid)
        primary = {
            "structure": clean(pc.get("STRUCTURE")),
            "thick": num(pc.get("THICKNESS")) or None,
            "length": num(pc.get("PCORD_LENGTH")),
            "color": pcolor,
            "colorParsed": parse_color(pcolor),
            "fiber": clean(pc.get("FIBER")),
            "beginning": clean(pc.get("BEGINNING")),
            "term": clean(pc.get("TERMINATION")),
            "twist": clean(pc.get("TWIST")),
            "notes": clean(pc.get("plainnotes")) or clean(pc.get("NOTES")),
        }
        return {
            "cords": cords,
            "groups": groups,
            "primary": primary,
            "museumName": clean(m["MUSEUM_NAME"]),
            "museumNumber": clean(m["MUSEUM_NUM"]),
            "provenance": clean(m["PROVENANCE"]),
            "investigatorNum": clean(m["INVESTIGATOR_NUM"]),
        }


def load_okr() -> tuple[dict[str, dict], dict, dict]:
    con = sqlite3.connect(OKR_DB)
    con.row_factory = sqlite3.Row
    okr = {}
    for r in con.execute(
        "SELECT OKR_NUM, KHIPU_ID, INVESTIGATOR_NUM, EARLIEST_AGE, LATEST_AGE, PROVENANCE, REGION, "
        "MUSEUM_NAME, MUSEUM_NUM, CONDITIONOFKHIPU, ARCHIVE_NUM, DATE_DISCOVERED, DISCOVERED_BY, NOTES "
        "FROM khipu_main"
    ):
        okr[r["OKR_NUM"].strip()] = {
            "okrId": r["KHIPU_ID"],
            "investigatorNum": clean(r["INVESTIGATOR_NUM"]),
            "earliestAge": clean(r["EARLIEST_AGE"]),
            "latestAge": clean(r["LATEST_AGE"]),
            "provenance": clean(r["PROVENANCE"]),
            "region": clean(r["REGION"]),
            "condition": clean(r["CONDITIONOFKHIPU"]),
            "archive": int(r["ARCHIVE_NUM"]) if r["ARCHIVE_NUM"] else None,
            "discovered": clean(r["DATE_DISCOVERED"]),
            "discoveredBy": clean(r["DISCOVERED_BY"]),
        }

    colors = {}
    for r in con.execute("SELECT * FROM ascher_color_dc"):
        code = r["AS_COLOR_CD"].strip()
        rgb = [round(r["R_DEC"] * 255), round(r["G_DEC"] * 255), round(r["B_DEC"] * 255)]
        colors[code] = {
            "name": r["COLOR_DESCR"],
            "hex": "#%02x%02x%02x" % tuple(rgb),
            "rgb": rgb,
            "family": r["COLOR"],
            "intensity": r["INTENSITY"],
            "isccNbs": r["ISCC_NBS_NUM"],
        }

    def table(sql):
        return {row[0].strip(): {"label": row[1], "notes": clean(row[2])} for row in con.execute(sql)}

    codes = {
        "knotType": table("SELECT TYPE_CODE, TYPE_DESCR, NOTES FROM knot_type_dc ORDER BY CODE_ORDER"),
        "attachment": table("SELECT ATTACH_CD, ATTACH_DESCR, NOTES FROM attachment_dc"),
        "termination": table("SELECT TERM_CD, TERMINATION_DESCR, NOTES FROM termination_dc"),
        "fiber": table("SELECT FIBER_CD, FIBER_DESCR, NOTES FROM fiber_dc"),
        "structure": table("SELECT STRUCT_CD, STRUCTURE_DESCR, NOTES FROM structure_dc"),
        "beginning": table("SELECT BEG_CD, BEGINNING_DESCR, NOTES FROM beginning_dc"),
        "colorOperator": table("SELECT OPERATOR, OPERATOR_DESCR, NOTES FROM color_operator_dc"),
        "archive": {
            str(r[0]): {"label": r[1], "notes": r[2]}
            for r in con.execute("SELECT ARCHIVE_NUM, ARCHIVE_NAME, ARCHIVE_NOTES FROM archive_dc")
        },
    }
    # extra KFG-only codes
    codes["attachment"].setdefault("T", {"label": "top cord", "notes": "cord hangs opposite to the pendants"})
    codes["attachment"].setdefault("U", {"label": "unknown", "notes": None})
    codes["termination"].setdefault("U", {"label": "unfinished", "notes": None})
    codes["twist"] = {
        "S": {"label": "S-plied", "notes": "final ply twist leans like the middle of an S"},
        "Z": {"label": "Z-plied", "notes": "final ply twist leans like the middle of a Z"},
        "U": {"label": "unknown", "notes": None},
    }
    codes["knotDirection"] = {
        "S": {"label": "S", "notes": "knot tied with an S slant"},
        "Z": {"label": "Z", "notes": "knot tied with a Z slant"},
        "U": {"label": "unknown", "notes": None},
    }
    codes["colorOperator"].update(
        {
            "/": {"label": "splice", "notes": "colour changes along the cord; ranges in cm"},
            "%": {"label": "striped", "notes": None},
            "^": {"label": "tweed", "notes": None},
        }
    )
    con.close()
    return okr, colors, codes


# ---------------------------------------------------------------------------
# Source overrides: the one place where the published KFG record is corrected.
#
# Each entry replaces part of a KFG record and says why.  Rule: an override needs at least two
# independent sources that agree against the KFG; a disagreement with only one source against the
# KFG is listed by scripts/source_audit.py as uncertain and left alone.  Downstream scripts read the
# corrected JSON and need no patches of their own; source_audit.py re-checks every entry against the
# raw workbooks and reports one that has become redundant (the KFG fixed upstream).
#
#   cords: "okr"      take cords, cord groups and primary cord from the OKR record of the same KH number
#   cords: "exclude"  keep the cords for display but mark them (cordDataError) so every value scan skips
#                     them - for a record known not to be its own with no other record to take instead
#   provenance: str   replace the recorded find-spot
#   museumNumber: str replace the museum (accession) number
# ---------------------------------------------------------------------------

SOURCE_OVERRIDES: dict[str, dict] = {
    "KH0133": {
        "cords": "okr",
        "why": "The KFG workbook for AS119 (VA42545) carries the cord, cord-group and primary-cord sheets of "
               "AS107 (KH0121) verbatim. The real AS119 has 7 pendants and 4 subsidiaries on a 50.5 cm primary cord.",
        "evidence": [
            "OKR khipu_main UR1119 = AS119, VA42545: 7 pendants, 4 subsidiaries, primary cord 50.5 cm DB:B:W",
            "Ascher & Ascher, Code of the Quipu Databook (1988), AS119, p. 794: the same 7 pendants, values "
            "49676, 14434, 2247, 12780, 14550, 11(4?)??, 0; https://courses.cit.cornell.edu/quipu/data/as119.pdf",
            "KFG KH0133 ChangeLog (Thompson, 11/12/2023) edits p6s1 from 8S(11.5,Z),800;5S(18.0,Z),50 - the OKR/Ascher "
            "AS119 cord; the workbook's own cords have no p6s1",
        ],
    },
    "KH0140": {
        "provenance": "Pachacamac",
        "why": "The KFG gives AS125's find-spot as 'Marquez'. Both museum numbers attached to this khipu - the "
               "Aschers' VA42670 and the KFG's VA42610 (Urton's UR247) - are recorded from Pachacamac.",
        "evidence": [
            "Ascher databook, AS97 observation 3, p. 681: AS125 is one of the quipus the Berlin museum acquired in "
            "1907 with provenance Pachacamac; https://courses.cit.cornell.edu/quipu/data/as97.pdf",
            "Staatliche Museen zu Berlin online catalogue, V A 42610 (obj-39467): khipu, Pachacámac; "
            "https://id.smb.museum/object/39467",
            "OKR khipu_main: AS125 and UR247 both Pachacamac",
        ],
    },
    "KH0171": {
        "museumNumber": "VA37867B",
        "why": "The KFG (and the OKR record it was built from) give AS155 as VA37967B; the museum and the Aschers "
               "have VA37867B, the B part of the accession whose A part is AS154 (KH0170, VA37867A).",
        "evidence": [
            "Staatliche Museen zu Berlin online catalogue, V A 37867 b (obj-1400739, the KFG's own museum link): "
            "khipu, Lima; https://id.smb.museum/object/1400739",
            "Ascher databook, AS155, p. 978: 'No. VA37867B'; https://courses.cit.cornell.edu/quipu/data/as155.pdf",
            "OKR KH-number registry (okr-kh-numbers.csv): VA37867B",
        ],
    },
    **{
        f"KH{n:04d}": {
            "provenance": "Huacho",
            "why": "The KFG records the collector-name 'Eduard Gaffron' as the find-spot of Basel IVc.366.03. The "
                   "museum's records have the cordage excavated from a burial ground near Huacho by Arnold Masarey "
                   "and bought from him in 1910.",
            "evidence": [
                "Forcart 1911, annual report of the Basel museum for 1910, pp. 194, 196: excavated 'in a burial "
                "ground near Huacho' by Dr Arnold Masarey",
                "Nordenskiold to Sarasin, December 1924 (Museum der Kulturen archive): 'the one from Huacho "
                "[IVc.366.03]'",
                "both quoted in Medrano 2022, PhD thesis, University of St Andrews, ch. 4 (with the 1910 payment "
                "of 400 marks to Masarey)",
            ],
        }
        for n in range(682, 692)
    },
}


def apply_overrides(k: dict, okr: OkrCorpus | None) -> None:
    o = SOURCE_OVERRIDES.get(k["id"])
    if not o:
        return
    notes = []
    if o.get("cords") == "okr":
        rec = okr.khipu(k["id"]) if okr else None
        if rec is None:
            raise SystemExit(f"{k['id']}: override wants OKR cords but the OKR has no record")
        before = k["stats"]
        k["cords"], k["groups"], k["primary"] = rec["cords"], rec["groups"], rec["primary"]
        k["stats"] = summarise(k["cords"], k["groups"])
        notes.append({
            "field": "cords",
            "from": f"KFG: {before['nPendants']} pendants, {before['nSubsidiaries']} subsidiaries",
            "to": f"OKR {rec['investigatorNum'] or k['id']}: {k['stats']['nPendants']} pendants, "
                  f"{k['stats']['nSubsidiaries']} subsidiaries, primary cord {rec['primary']['length']} cm",
        })
    if o.get("cords") == "exclude":
        k["cordDataError"] = o["why"]
        notes.append({"field": "cords", "from": "KFG", "to": "excluded from value scans"})
    if "provenance" in o:
        notes.append({"field": "provenance", "from": k["provenance"], "to": o["provenance"]})
        k["provenance"] = o["provenance"]
    if "museumNumber" in o:
        notes.append({"field": "museumNumber", "from": k["museum"]["number"], "to": o["museumNumber"]})
        k["museum"]["number"] = o["museumNumber"]
    for n in notes:
        n["why"], n["evidence"] = o["why"], o["evidence"]
    k["corrections"] = notes


# ---------------------------------------------------------------------------
# Value / knot conflicts: KFG cords whose Value column is not the sum of their knot tokens.
#
# Both numbers come straight from the workbook (the Value column and the ",value" of each knot token);
# nothing here decides which is right. The cord keeps `value` as published and gains
#   valueConflict: {knots, cause, note}
# where knots is the knot-token sum and cause is a best guess at how the two came apart:
#   reordered    the stored value is the knot sum of another conflicting cord nearby (rows moved, Value didn't)
#   logged-edit  the ChangeLog records a value/knot edit to this cord that reached only one of the two
#   knot-token   re-reading one knot token by its own notation (count x place, turns, TF = 1) gives the value
#   zero-value   Value is 0/blank although knots are recorded
#   no-knots     a value with no knots recorded
#   unexplained  none of the above
# scripts/mk/value_knot_conflicts.py lists them for reporting upstream.
# ---------------------------------------------------------------------------

UNIT_KNOT_TYPES = LONG_KNOT_TYPES | {"E", "EE", "TF"}


def knot_sum(c: dict) -> int:
    return sum(k.get("value") or 0 for k in c["knots"])


def token_rereadings(k: dict) -> list[int]:
    """Values a knot token could carry by its own notation."""
    if k["type"] in LONG_KNOT_TYPES or k["type"] in ("E", "EE"):
        return [k["n"]]
    if k["type"] == "TF":
        return [k["n"], *(k["n"] * 10**e for e in range(1, 6))] if k["n"] else [0]
    return [k["n"] * 10**e for e in range(6)]


def knot_string(k: dict) -> str:
    return f"{k['n']}{k['type']}({k['pos']},{k['dir']}),{k.get('value', 0)}"


def value_conflicts(cords: list[dict], log: list[dict] | None) -> int:
    """Mark every cord whose stored value differs from its knot sum; returns how many."""
    bad = [i for i, c in enumerate(cords) if (c["value"] or 0) != knot_sum(c)]

    def holder(i: int) -> int | None:
        """Another conflicting cord within 5 rows whose knots sum to cord i's stored value."""
        return next((j for j in bad if j != i and abs(j - i) <= 5 and knot_sum(cords[j]) == (cords[i]["value"] or 0)),
                    None)

    for i in bad:
        c = cords[i]
        stored, knots = c["value"] or 0, knot_sum(c)
        cause, note = "unexplained", "the Value column and the knot tokens disagree"
        # a move needs both ends: this value sits on the other cord's knots and the other's value on someone's knots
        j = holder(i)
        other = cords[j] if j is not None and holder(j) is not None else None
        edits = [r for r in log or [] if re.search(rf"(?<![\w]){re.escape(c['name'])}(?![\w])", r.get("what") or "")
                 and re.search(r"value|knot|notation|add|missing|\d[A-Z]+\(", f"{r.get('what')} {r.get('from')}", re.I)
                 and not re.search(r"notation only|value remains", r.get("impact") or "")]
        reread = None
        for ki, kn in enumerate(c["knots"]):
            for alt in token_rereadings(kn):
                if alt != (kn.get("value") or 0) and knots - (kn.get("value") or 0) + alt == stored:
                    reread = (kn, alt)
                    break
            if reread:
                break
        if other:
            cause, note = "reordered", f"the stored value is the knot sum of {other['name']}: Value column not moved with the knots"
        elif edits:
            e = edits[-1]
            cause = "logged-edit"
            note = f"last ChangeLog edit {e.get('date')}: {e.get('what')}: {e.get('from') or '-'} -> {e.get('to') or '-'}"
        elif reread:
            kn, alt = reread
            cause, note = "knot-token", f"with {knot_string(kn)} read as {alt}, the knots give the stored value"
        elif not stored and c["knots"]:
            cause, note = "zero-value", "Value is 0 although knots are recorded"
        elif not c["knots"]:
            cause, note = "no-knots", "a value with no knots recorded"
        c["valueConflict"] = {"knots": knots, "cause": cause, "note": note}
    return len(bad)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    files = sorted(glob.glob(os.path.join(KFG_DIR, "KH*.xlsx")))
    if not files:
        sys.exit(f"no workbooks found in {KFG_DIR}")
    okr, colors, codes = load_okr()
    okr_corpus = OkrCorpus()

    os.makedirs(os.path.join(OUT_DIR, "khipus"), exist_ok=True)
    index = []
    flat = defaultdict(list)
    errors = []
    silhouettes = {}
    n_conflicts = 0
    agg = {
        "colorCords": Counter(),      # atomic colour code -> cords using it
        "colorSolid": Counter(),      # colour string that is a single code -> cords
        "knotTypes": Counter(),       # physical knots by type
        "knotDir": Counter(),         # knot direction S/Z/U
        "leadingDigit": Counter(),    # first digit of non-zero cord values (Benford)
        "valueMagnitude": Counter(),  # floor(log10(value)) for value > 0
        "level": Counter(),
        "attach": Counter(),
        "twist": Counter(),
        "term": Counter(),
        "cordLength": Counter(),      # 5 cm bins
        "museum": Counter(),
        "country": Counter(),
        "provenance": Counter(),
        "region": Counter(),
        "fiber": Counter(),
        "cordsPerKhipu": Counter(),   # 25-cord bins
    }

    for i, path in enumerate(files):
        try:
            k = load_workbook(path)
        except Exception as e:  # noqa: BLE001
            errors.append((os.path.basename(path), str(e)))
            continue
        apply_overrides(k, okr_corpus)
        if any((c["value"] or 0) != knot_sum(c) for c in k["cords"]):
            n_conflicts += value_conflicts(k["cords"], load_changelog(path))
        k["okr"] = okr.get(k["id"])
        with open(os.path.join(OUT_DIR, "khipus", f"{k['id']}.json"), "w") as f:
            json.dump(k, f, separators=(",", ":"))

        rec = {
            "id": k["id"],
            "aliases": k["aliases"],
            "museum": k["museum"]["canonical"],
            "museumRaw": k["museum"]["name"],
            "museumCountry": k["museum"]["country"],
            "provenance": k["provenance"],
            "region": k["region"],
            "primaryLength": k["primary"]["length"],
            "primaryColor": k["primary"]["color"],
            "fiber": k["primary"]["fiber"],
            "inOkr": k["id"] in okr,
            **({"corrected": [n["field"] for n in k["corrections"]]} if k.get("corrections") else {}),
            "earliestAge": (k["okr"] or {}).get("earliestAge"),
            "latestAge": (k["okr"] or {}).get("latestAge"),
            "archive": (k["okr"] or {}).get("archive"),
            **k["stats"],
        }
        index.append(rec)

        pend = sorted((c for c in k["cords"] if c["level"] == 1), key=lambda c: c["ordinal"])
        silhouettes[k["id"]] = {
            "l": [c["length"] for c in pend],
            "c": [(c.get("colorParsed") or [{"codes": [None]}])[0]["codes"][0] for c in pend],
        }
        agg["cordsPerKhipu"][(len(k["cords"]) // 25) * 25] += 1
        agg["museum"][k["museum"]["canonical"] or "Unknown"] += 1
        agg["country"][k["museum"]["country"] or "Unknown"] += 1
        agg["provenance"][k["provenance"] or "Unknown"] += 1
        agg["region"][k["region"] or "Unknown"] += 1
        agg["fiber"][k["primary"]["fiber"] or "Unknown"] += 1
        for c in k["cords"]:
            agg["level"][c["level"]] += 1
            agg["attach"][c["attach"] or "U"] += 1
            agg["twist"][c["twist"] or "U"] += 1
            agg["term"][c["term"] or "U"] += 1
            if c["length"] is not None:
                agg["cordLength"][int(c["length"] // 5) * 5] += 1
            if c["value"]:
                agg["leadingDigit"][str(abs(c["value"]))[0]] += 1
                agg["valueMagnitude"][len(str(abs(c["value"]))) - 1] += 1
            seen = set()
            for seg in c.get("colorParsed") or []:
                for code in seg["codes"]:
                    if code not in seen:
                        agg["colorCords"][code] += 1
                        seen.add(code)
            if c["color"] and re.fullmatch(r"[A-Z0-9]+", c["color"]):
                agg["colorSolid"][c["color"]] += 1
            for kn in c["knots"]:
                agg["knotTypes"][kn["type"]] += physical_knots(kn)
                for d in (kn["dir"] if len(kn["dir"]) > 1 else kn["dir"] * physical_knots(kn)):
                    agg["knotDir"][d] += 1
            flat["khipu"].append(k["id"])
            flat["name"].append(c["name"])
            flat["level"].append(c["level"])
            flat["kind"].append(c["kind"])
            flat["pos"].append(c.get("pos"))
            flat["length"].append(c["length"])
            flat["value"].append(c["value"])
            flat["nKnots"].append(c["nKnots"])
            flat["color"].append(c["color"])
            flat["twist"].append(c["twist"])
            flat["attach"].append(c["attach"])
            flat["term"].append(c["term"])
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(files)}", file=sys.stderr)

    with open(os.path.join(OUT_DIR, "khipus.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "cords.json"), "w") as f:
        json.dump({"n": len(flat["khipu"]), "columns": dict(flat)}, f, separators=(",", ":"))
    corpus = {
        "nKhipus": len(index),
        "nCords": sum(r["nCords"] for r in index),
        "nKnots": sum(r["nKnots"] for r in index),
        "nInOkr": sum(1 for r in index if r["inOkr"]),
        "nMuseums": len(agg["museum"]),
        **{k: dict(sorted(v.items(), key=lambda kv: (-kv[1], str(kv[0])))) for k, v in agg.items()},
    }
    with open(os.path.join(OUT_DIR, "silhouettes.json"), "w") as f:
        json.dump(silhouettes, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "corpus.json"), "w") as f:
        json.dump(corpus, f, indent=1)
    with open(os.path.join(OUT_DIR, "colors.json"), "w") as f:
        json.dump(colors, f, indent=1)
    with open(os.path.join(OUT_DIR, "codes.json"), "w") as f:
        json.dump(codes, f, indent=1)

    total_cords = sum(r["nCords"] for r in index)
    total_knots = sum(r["nKnots"] for r in index)
    print(f"wrote {len(index)} khipus, {total_cords} cords, {total_knots} knots -> {OUT_DIR}")
    print(f"  joined to OKR: {sum(1 for r in index if r['inOkr'])}")
    print(f"  cords whose value is not their knot sum (valueConflict): {n_conflicts}")
    if errors:
        print(f"  {len(errors)} files failed:")
        for name, err in errors:
            print(f"    {name}: {err}")


if __name__ == "__main__":
    main()

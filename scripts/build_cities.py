#!/usr/bin/env python3
"""
Build a collection of khipus from the Cities Tool atlas: one census khipu per
US metro, and one for the country whose pendants are the metros.

Source
  ../cities-prototypes/app/public/data/   the cities app's built JSON
      index.json, national.json, metros/{metroId}.json
  (override with CITIES_DATA=<dir> or a path argument)

Outputs (public/data/cities/)
  index.json          the collection: one summary row per metro khipu, the
                      encoding constants, and the national totals
  us.json             the national khipu: a pendant per metro, grouped by
                      census division
  metros/{slug}.json  one khipu per metro: a pendant per place, grouped by
                      state; subsidiaries for jobs there and population
  places/{slug}.json  the metro's places' yearly series (population, the
                      commute counts, wage, home value), from which the app
                      ties one khipu per place on request (see below)
  silhouettes.json    per khipu: pendant lengths + colour codes, for thumbnails

The files have the same shape as public/data/khipus/KHxxxx.json (see
src/lib/khipu/types.ts), plus a `city` block and a `places` map keyed by cord
name, so the app's diagram, layout and knot glyphs draw them unchanged.

Encoding (see the /cities page for the reader's version)
  pendant       one place (city, town or census-designated place)
                knots   resident workers, decimal: one row per power of ten,
                        units nearest the free end, rows aligned across cords
                colour  the place's diagnosis quadrant; barber-poled with
                        white when borderline; undyed white when undiagnosed
                length  the units row plus a tail of 1 cm per WAGE_CM dollars
                        of the residents' mean wage
                attach  recto = incorporated place, verso = CDP
                knots   direction S = cost side, Z = amenity side
  p{n}s1        jobs located in the place (moderate brown)
  p{n}s2        population, where the atlas counts it (light grey)
  groups        the metro's states, principal state first; the principal city
                leads its group, the rest follow by size
  primary cord  coloured by the metro's own quadrant

  The metro's own population is not tied here: it is the metro's pendant on
  the national khipu, which is how the two levels join. (A top cord for it
  would need seven or eight knot rows hung upward, and it is not the sum of
  the places anyway — metros include unincorporated land.)

The third level: a khipu per place (src/lib/cities/tie.ts)
  16,943 place khipus would run to well over a gigabyte tied out in full, so
  this script only writes each metro's place series (places/{slug}.json) and
  the app ties a place's khipu when it is asked for, with the same encoding
  (the constants below are exported in index.json's `encoding` block; the
  cord builders in tie.ts mirror the ones here):
  groups        one per year, PLACE_YEAR0 to the window's end, oldest first;
                the same cords in the same order every year
  pendant 1     residents who work, in the place's own colour; beneath it
                s1 = those who also work in the place (STAY_COLOR) and
                s2 = those who commute out (COMMUTE_COLOR) — the pendant is
                their sum
  pendant 2     jobs located in the place (JOBS_COLOR); beneath it s1 = the
                same stay-at-home workers and s2 = those who commute in
  pendant 3     population (POPULATION_COLOR), incorporated places only
  pendant 4     home value in dollars (HOME_VALUE_COLOR)
  length        the residents' cord runs on by that year's mean wage
  The residents' cord in the last commute year is the place's pendant on
  the metro khipu; the jobs cord is its first subsidiary and the latest
  population its second — how this level joins the one above.

Run:  python3 scripts/build_cities.py [path/to/cities/public/data]
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(
    os.path.dirname(ROOT), "cities-prototypes", "app", "public", "data"
)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CITIES_DATA", DEFAULT_SRC)
OUT_DIR = os.path.join(ROOT, "public", "data", "cities")

# ---------------------------------------------------------------------------
# Encoding constants (cm; the diagram draws at 2.4–5 px per cm)
# ---------------------------------------------------------------------------

ROW0 = 6.0  # attachment → first (highest) decimal row
PITCH = 20.0  # between decimal rows; clears a nine-knot cluster at 2.4 px/cm
TAIL = 6.0  # below the units row
WAGE_CM = 4000  # dollars of mean wage per cm of extra tail on a pendant
SUB_POS = (2.0, 4.0)  # where s1 and s2 attach along their pendant
PENDANT_SPACING = 1.0  # cm between pendants along the primary cord
GROUP_GAP = 3.0  # cm between groups

QUADRANT_COLOR = {
    "demand_positive": "SR",  # Magnet / Boomtown: strong red
    "demand_negative": "KB",  # Leak / Cooling off: dark brown
    "supply_positive": "PB",  # Sponge / Lifestyle magnet: deep blue
    "supply_negative": "SY",  # Fortress / Held back: strong yellow
    None: "W",  # no diagnosis: undyed
}
JOBS_COLOR = "MB"
POPULATION_COLOR = "LG"
BORDERLINE_OP = "-"  # barber pole with white

# the place khipus (tied in the app; the constants travel in index.json)
STAY_COLOR = "YB"  # live and work in the place: light yellowish brown
COMMUTE_COLOR = "GL"  # commute out of / into it: moderate greenish blue
HOME_VALUE_COLOR = "GG"  # grayish green
PLACE_YEAR0 = 2010  # the atlas's place series start here
PLACE_SERIES = [  # the columns of a place's yearly rows, in this order
    "population",
    "residentWorkers",
    "jobsHere",
    "liveWorkHere",
    "outCommuters",
    "inCommuters",
    "wage",
    "homeValue",
]

DIVISIONS = [
    ("New England", ["CT", "ME", "MA", "NH", "RI", "VT"]),
    ("Middle Atlantic", ["NJ", "NY", "PA"]),
    ("East North Central", ["IL", "IN", "MI", "OH", "WI"]),
    ("West North Central", ["IA", "KS", "MN", "MO", "NE", "ND", "SD"]),
    ("South Atlantic", ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV"]),
    ("East South Central", ["AL", "KY", "MS", "TN"]),
    ("West South Central", ["AR", "LA", "OK", "TX"]),
    ("Mountain", ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"]),
    ("Pacific", ["AK", "CA", "HI", "OR", "WA"]),
]
DIVISION_OF = {st: name for name, states in DIVISIONS for st in states}
DIVISION_ORDER = {name: i for i, (name, _) in enumerate(DIVISIONS)}


# ---------------------------------------------------------------------------
# Cord builders
# ---------------------------------------------------------------------------


def color_of(quadrant, borderline):
    code = QUADRANT_COLOR.get(quadrant, "W")
    if borderline and code != "W":
        return f"{code}{BORDERLINE_OP}W", [{"codes": [code, "W"], "ops": [BORDERLINE_OP]}]
    return code, [{"codes": [code]}]


def decimal_knots(value, digits, offset, direction):
    """Knots for `value` on a cord whose rows fit `digits` powers of ten.

    Row r (0 = nearest the attachment) holds 10^(digits-1-r). A subsidiary
    attached `offset` cm down its parent has its rows pulled up by that much
    so they line up with the parent's.
    """
    if not value:
        return []
    s = str(int(value))
    knots = []
    for i, ch in enumerate(s):
        d = int(ch)
        if d == 0:
            continue
        p = len(s) - 1 - i
        depth = ROW0 + (digits - 1 - p) * PITCH - offset
        if p == 0:
            knots.append(
                {
                    "n": 1 if d == 1 else d,
                    "type": "E" if d == 1 else "L",
                    "pos": round(depth, 1),
                    "dir": direction,
                    "value": d,
                }
            )
        else:
            knots.append(
                {"n": d, "type": "S", "pos": round(depth, 1), "dir": direction, "value": d * 10**p}
            )
    return knots


def physical_knots(knots):
    return sum(k["n"] if k["type"] == "S" else 1 for k in knots)


def min_length(digits, offset=0.0):
    return ROW0 + (digits - 1) * PITCH + TAIL - offset


def make_cord(
    name,
    level,
    kind,
    ordinal,
    value,
    digits,
    color,
    *,
    parent=None,
    group=None,
    pos=None,
    offset=0.0,
    direction="U",
    attach="U",
    tail=0.0,
):
    code, parsed = color
    known = value is not None
    knots = decimal_knots(value, digits, offset, direction) if known else []
    cord = {
        "name": name,
        "level": level,
        "kind": kind,
        "ordinal": ordinal,
        "twist": "S",
        "attach": attach,
        "length": round(min_length(digits, offset) + tail, 1) if known else None,
        "term": "K",
        "thick": None,
        "color": code,
        "colorParsed": parsed,
        "value": int(value) if known else None,
        "altValue": None,
        "knots": knots,
        "nKnots": physical_knots(knots),
    }
    if parent is not None:
        cord["parent"] = parent
    if group is not None:
        cord["group"] = group
    if pos is not None:
        cord["pos"] = round(pos, 1)
    return cord


def digits_needed(values):
    return max((len(str(int(v))) for v in values if v), default=1)


def stats_for(cords, groups):
    pendants = [c for c in cords if c["level"] == 1 and c["kind"] == "pendant"]
    tops = [c for c in cords if c["kind"] == "top"]
    subs = [c for c in cords if c["level"] > 1]
    colors_used = Counter()
    for c in cords:
        for seg in c["colorParsed"]:
            for code in seg["codes"]:
                colors_used[code] += 1
    knot_types = Counter()
    for c in cords:
        for k in c["knots"]:
            knot_types[k["type"]] += k["n"] if k["type"] == "S" else 1
    values = [c["value"] for c in pendants if c["value"] is not None]
    lengths = [c["length"] for c in cords if c["length"] is not None]
    return {
        "nCords": len(cords),
        "nPendants": len(pendants),
        "nSubsidiaries": len(subs),
        "nTop": len(tops),
        "nGroups": len(groups),
        "nKnots": sum(c["nKnots"] for c in cords),
        "maxLevel": max((c["level"] for c in cords), default=0),
        "nColors": len(colors_used),
        "totalValue": sum(values),
        "maxValue": max(values, default=0),
        "meanCordLength": round(sum(lengths) / len(lengths), 2) if lengths else 0,
        "knotTypes": dict(knot_types),
        "topColors": [k for k, _ in colors_used.most_common(5)],
    }


def primary_for(quadrant, borderline, length):
    code, parsed = color_of(quadrant, borderline)
    return {
        "structure": "P",
        "thick": None,
        "length": round(length, 1),
        "color": code,
        "colorParsed": parsed,
        "fiber": None,
        "beginning": "K",
        "term": "K",
        "twist": "S",
        "notes": None,
    }


def silhouette(cords):
    pendants = [c for c in cords if c["level"] == 1 and c["kind"] == "pendant"]
    return {
        "l": [c["length"] for c in pendants],
        "c": [c["colorParsed"][0]["codes"][0] for c in pendants],
    }


def rows_of(columnar):
    cols = columnar["columns"]
    return [dict(zip(cols, r)) for r in columnar["rows"]]


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def place_slugs(places):
    """URL slugs for a metro's places: the name; the state when two places
    share a name (Kansas City, MO and KS); the GEOID when they still do
    (a city and the CDP around it, both called Willowbrook)."""
    slugs = {p["id"]: slugify(p["name"]) for p in places}
    for suffix in (lambda p: p["state"].lower(), lambda p: p["id"]):
        dups = {k for k, n in Counter(slugs.values()).items() if n > 1}
        for p in places:
            if slugs[p["id"]] in dups:
                slugs[p["id"]] = f"{slugs[p['id']]}-{suffix(p)}"
    return slugs


def place_series(place_json, years):
    """One row per year of PLACE_SERIES values, None where the atlas has
    nothing for that year."""
    by_year = {y: [None] * len(PLACE_SERIES) for y in years}
    col = {k: i for i, k in enumerate(PLACE_SERIES)}

    def put(year, key, value):
        row = by_year.get(year)
        if row is not None and value is not None:
            row[col[key]] = int(value)

    for r in place_json.get("panel", []):
        put(r["year"], "population", r.get("population"))
        put(r["year"], "wage", r.get("wage"))
    for r in place_json.get("commute", []):
        for k in ("residentWorkers", "jobsHere", "liveWorkHere", "outCommuters", "inCommuters"):
            put(r["year"], k, r.get(k))
    for r in place_json.get("housing", []):
        put(r["year"], "homeValue", r.get("value"))
    return [by_year[y] for y in years]


# ---------------------------------------------------------------------------
# One metro
# ---------------------------------------------------------------------------


def build_metro(metro, window):
    s = metro["summary"]
    dx = metro["diagnosis"]
    places = rows_of(metro["places"])
    slugs = place_slugs(places)
    principal = next((p for p in places if p["id"] == s["principalPlaceId"]), None)
    others = [p for p in places if principal is None or p["id"] != principal["id"]]

    # groups: one per state — the principal state first, the rest by how many
    # places they hold; within a group the principal city leads, then by size
    by_state = {}
    for p in others:
        by_state.setdefault(p["state"], []).append(p)
    if principal:
        by_state.setdefault(principal["state"], [])
    states = sorted(
        by_state, key=lambda st: (st != s["state"], -len(by_state[st]), st)
    )
    for st in states:
        by_state[st].sort(key=lambda p: -(p["residentWorkers"] or 0))
    if principal:
        by_state[principal["state"]].insert(0, principal)

    digits = digits_needed(
        [p["residentWorkers"] for p in places]
        + [p["jobsHere"] for p in places]
        + [p["population"] for p in places]
    )

    cords, groups, place_meta = [], [], {}
    cursor = 0.0
    ordinal = 0

    def add_group(members):
        nonlocal cursor
        start = cursor
        first = ordinal + 1
        for i, m in enumerate(members):
            m(start + i * PENDANT_SPACING)
        groups.append(
            {
                "start": round(start, 1),
                "first": first,
                "last": ordinal,
                "n": ordinal - first + 1,
                "spacing": PENDANT_SPACING,
            }
        )
        cursor = start + len(members) * PENDANT_SPACING + GROUP_GAP

    def add_place(p):
        def go(pos):
            nonlocal ordinal
            ordinal += 1
            name = f"p{ordinal}"
            direction = {"cost": "S", "amenity": "Z"}.get(p["supplySide"], "U")
            cords.append(
                make_cord(
                    name,
                    1,
                    "pendant",
                    ordinal,
                    p["residentWorkers"],
                    digits,
                    color_of(p["quadrant"], p["borderline"]),
                    group=len(groups),
                    pos=pos,
                    direction=direction,
                    attach="R" if p["class"] == "incorporated" else "V",
                    tail=(p["wage"] or 0) / WAGE_CM,
                )
            )
            cords.append(
                make_cord(
                    f"{name}s1",
                    2,
                    "subsidiary",
                    1,
                    p["jobsHere"],
                    digits,
                    (JOBS_COLOR, [{"codes": [JOBS_COLOR]}]),
                    parent=name,
                    pos=SUB_POS[0],
                    offset=SUB_POS[0],
                    direction=direction,
                )
            )
            if p["population"] is not None:
                cords.append(
                    make_cord(
                        f"{name}s2",
                        2,
                        "subsidiary",
                        2,
                        p["population"],
                        digits,
                        (POPULATION_COLOR, [{"codes": [POPULATION_COLOR]}]),
                        parent=name,
                        pos=SUB_POS[1],
                        offset=SUB_POS[1],
                        direction=direction,
                    )
                )
            place_meta[name] = {"slug": slugs[p["id"]]}
            place_meta[name].update(
                (k, p[k])
                for k in (
                    "id",
                    "name",
                    "state",
                    "class",
                    "population",
                    "popCagr",
                    "wage",
                    "wageCagr",
                    "homeValue",
                    "costCagr",
                    "unemployment",
                    "quadrant",
                    "borderline",
                    "supplySide",
                    "amenityPct",
                    "jobsHere",
                    "residentWorkers",
                )
            )

        return go

    for st in states:
        add_group([add_place(p) for p in by_state[st]])

    total_length = cursor - GROUP_GAP
    all_states = list(dict.fromkeys([s["state"]] + states))

    city = {
        "kind": "metro",
        "metroId": s["id"],
        "slug": s["slug"],
        "name": s["name"],
        "state": s["state"],
        "displayName": s["displayName"],
        "division": DIVISION_OF.get(s["state"]),
        "principalPlaceId": s["principalPlaceId"],
        "principalPlaceName": s["principalPlaceName"],
        "principalCord": "p1" if principal else None,
        "lat": s["lat"],
        "lng": s["lng"],
        "population": s["population"],
        "popCagr": dx["popCagr"],
        "wage": dx["wageEnd"],
        "wageCagr": dx["wageCagr"],
        "costCagr": dx["costCagr"],
        "quadrant": dx["quadrant"],
        "borderline": dx["borderline"],
        "supplySide": dx["supplySide"],
        "employment": (metro.get("shiftShareTotals") or {}).get("endEmployment"),
        "nPlaces": len(places),
        "states": all_states,
        "window": window,
        "digits": digits,
    }
    khipu = {
        "id": s["slug"],
        "city": city,
        "primary": primary_for(dx["quadrant"], dx["borderline"], total_length),
        "groups": groups,
        "cords": cords,
        "stats": stats_for(cords, groups),
        "places": place_meta,
    }
    return khipu


def build_place_series(khipu, window):
    """The metro's places' yearly rows, in khipu order, for the app to tie
    each place's own khipu from (places/{slug}.json)."""
    years = list(range(PLACE_YEAR0, window["end"] + 1))
    out = []
    for cord, meta in khipu["places"].items():
        pj = json.load(open(os.path.join(SRC, "places", f"{meta['id']}.json")))
        out.append(
            {
                "slug": meta["slug"],
                "id": meta["id"],
                "cord": cord,
                "name": meta["name"],
                "state": meta["state"],
                "stateName": pj.get("stateName"),
                "class": meta["class"],
                "quadrant": meta["quadrant"],
                "borderline": meta["borderline"],
                "supplySide": meta["supplySide"],
                "popCagr": meta["popCagr"],
                "wageCagr": meta["wageCagr"],
                "costCagr": meta["costCagr"],
                "amenityPct": meta["amenityPct"],
                "jobAccess": [
                    {k: r.get(k) for k in ("minutes", "jobs", "rankInMetro", "rankNational")}
                    for r in (pj.get("jobAccess") or [])
                ]
                or None,
                "features": pj.get("features") or None,
                "rows": place_series(pj, years),
            }
        )
    c = khipu["city"]
    return {
        "metro": {
            "slug": c["slug"],
            "metroId": c["metroId"],
            "displayName": c["displayName"],
            "quadrant": c["quadrant"],
            "borderline": c["borderline"],
        },
        "years": years,
        "series": PLACE_SERIES,
        "places": out,
    }


# ---------------------------------------------------------------------------
# The national khipu
# ---------------------------------------------------------------------------


def build_nation(index, metros, national, window):
    latest = national["allMetros"][-1]
    total_pop = latest["population"]
    summaries = sorted(
        index["metros"],
        key=lambda m: (DIVISION_ORDER.get(DIVISION_OF.get(m["state"]), 99), -(m["population"] or 0)),
    )
    digits = digits_needed([m["population"] for m in summaries])

    cords, groups, meta = [], [], {}
    cursor = 0.0
    ordinal = 0

    def group_close(start, first):
        groups.append(
            {
                "start": round(start, 1),
                "first": first,
                "last": ordinal,
                "n": ordinal - first + 1,
                "spacing": PENDANT_SPACING,
            }
        )

    division_of_group = {}
    for division, _ in DIVISIONS:
        members = [m for m in summaries if DIVISION_OF.get(m["state"]) == division]
        if not members:
            continue
        start = cursor
        first = ordinal + 1
        gi = len(groups)
        division_of_group[gi] = division
        for i, m in enumerate(members):
            ordinal += 1
            name = f"p{ordinal}"
            mx = metros[m["id"]]
            wage = mx["diagnosis"]["wageEnd"]
            direction = {"cost": "S", "amenity": "Z"}.get(m["supplySide"], "U")
            cords.append(
                make_cord(
                    name,
                    1,
                    "pendant",
                    ordinal,
                    m["population"],
                    digits,
                    color_of(m["quadrant"], m["borderline"]),
                    group=gi,
                    pos=start + i * PENDANT_SPACING,
                    direction=direction,
                    attach="R",
                    tail=(wage or 0) / WAGE_CM,
                )
            )
            meta[name] = {
                "id": m["id"],
                "slug": m["slug"],
                "name": m["displayName"],
                "state": m["state"],
                "division": division,
                "population": m["population"],
                "popCagr": m["popCagr"],
                "wage": wage,
                "wageCagr": m["wageCagr"],
                "costCagr": m["costCagr"],
                "quadrant": m["quadrant"],
                "borderline": m["borderline"],
                "supplySide": m["supplySide"],
                "nPlaces": m["nPlaces"],
            }
        group_close(start, first)
        cursor = start + len(members) * PENDANT_SPACING + GROUP_GAP

    total_length = cursor - GROUP_GAP
    khipu = {
        "id": "us",
        "city": {
            "kind": "nation",
            "slug": "us",
            "name": "United States",
            "displayName": "United States",
            "population": total_pop,
            "wage": latest["wage"],
            "popCagr": index["national"]["popCagr"],
            "wageCagr": index["national"]["wageCagr"],
            "costCagr": index["national"]["costCagr"],
            "quadrant": None,
            "borderline": False,
            "supplySide": None,
            "nMetros": len(summaries),
            "window": window,
            "digits": digits,
            "divisions": {str(gi): d for gi, d in division_of_group.items()},
        },
        "primary": primary_for(None, False, total_length),
        "groups": groups,
        "cords": cords,
        "stats": stats_for(cords, groups),
        "places": meta,
    }
    return khipu


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def dump(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))


def main():
    index_path = os.path.join(SRC, "index.json")
    if not os.path.exists(index_path):
        sys.exit(
            f"No cities data at {SRC} (expected index.json). "
            "Build it in the cities app with `pnpm data`, or pass the directory."
        )
    index = json.load(open(index_path))
    national = json.load(open(os.path.join(SRC, "national.json")))
    window = {"start": index["window"]["start"], "end": index["window"]["end"]}

    os.makedirs(os.path.join(OUT_DIR, "metros"), exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "places"), exist_ok=True)
    silhouettes = {}
    rows = []
    metros = {}
    for m in index["metros"]:
        metros[m["id"]] = json.load(open(os.path.join(SRC, "metros", f"{m['id']}.json")))

    for m in index["metros"]:
        k = build_metro(metros[m["id"]], window)
        dump(os.path.join(OUT_DIR, "metros", f"{k['id']}.json"), k)
        dump(os.path.join(OUT_DIR, "places", f"{k['id']}.json"), build_place_series(k, window))
        silhouettes[k["id"]] = silhouette(k["cords"])
        c, st = k["city"], k["stats"]
        rows.append(
            {
                "slug": c["slug"],
                "metroId": c["metroId"],
                "name": c["name"],
                "state": c["state"],
                "displayName": c["displayName"],
                "division": c["division"],
                "states": c["states"],
                "population": c["population"],
                "wage": c["wage"],
                "popCagr": c["popCagr"],
                "wageCagr": c["wageCagr"],
                "costCagr": c["costCagr"],
                "quadrant": c["quadrant"],
                "borderline": c["borderline"],
                "supplySide": c["supplySide"],
                "nPlaces": c["nPlaces"],
                "nIncorporated": sum(
                    1 for p in k["places"].values() if p["class"] == "incorporated"
                ),
                "residentWorkers": st["totalValue"],
                "jobs": sum(
                    (p["jobsHere"] or 0) for p in k["places"].values()
                ),
                "nCords": st["nCords"],
                "nPendants": st["nPendants"],
                "nSubsidiaries": st["nSubsidiaries"],
                "nGroups": st["nGroups"],
                "nKnots": st["nKnots"],
                "nColors": st["nColors"],
                "maxValue": st["maxValue"],
                "digits": c["digits"],
            }
        )

    nation = build_nation(index, metros, national, window)
    dump(os.path.join(OUT_DIR, "us.json"), nation)
    silhouettes["us"] = silhouette(nation["cords"])

    rows.sort(key=lambda r: -(r["population"] or 0))
    dump(
        os.path.join(OUT_DIR, "index.json"),
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": {
                "generatedAt": index["generatedAt"],
                "window": window,
                "medians": index["medians"],
                "national": index["national"],
            },
            "encoding": {
                "row0": ROW0,
                "pitch": PITCH,
                "tail": TAIL,
                "wagePerCm": WAGE_CM,
                "subPos": list(SUB_POS),
                "pendantSpacing": PENDANT_SPACING,
                "groupGap": GROUP_GAP,
                "quadrantColor": {k or "none": v for k, v in QUADRANT_COLOR.items()},
                "jobsColor": JOBS_COLOR,
                "populationColor": POPULATION_COLOR,
                "stayColor": STAY_COLOR,
                "commuteColor": COMMUTE_COLOR,
                "homeValueColor": HOME_VALUE_COLOR,
                "placeYears": [PLACE_YEAR0, window["end"]],
                "placeSeries": PLACE_SERIES,
            },
            "nation": {
                "population": nation["city"]["population"],
                "wage": nation["city"]["wage"],
                "nMetros": nation["city"]["nMetros"],
                "nPlaces": sum(r["nPlaces"] for r in rows),
                "nCords": nation["stats"]["nCords"] + sum(r["nCords"] for r in rows),
                "nKnots": nation["stats"]["nKnots"] + sum(r["nKnots"] for r in rows),
                "divisions": [d for d, _ in DIVISIONS],
            },
            "metros": rows,
        },
    )
    dump(os.path.join(OUT_DIR, "silhouettes.json"), silhouettes)

    n_cords = sum(r["nCords"] for r in rows)
    n_knots = sum(r["nKnots"] for r in rows)
    print(
        f"wrote {len(rows)} metro khipus + the national one to {OUT_DIR}: "
        f"{n_cords:,} cords, {n_knots:,} knots; "
        f"series for {sum(r['nPlaces'] for r in rows):,} place khipus"
    )


if __name__ == "__main__":
    main()

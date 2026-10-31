#!/usr/bin/env python3
"""
Load Medrano & Khosla's own 2024 corpus snapshot into the PK shape used by
mk_port_relations, so the port can be validated on exactly their inputs.

Structure (level-1 order, clusters, top-cord flag) comes from their KFG_DB.SQL
(converted to sqlite at $S/out/kfg2024.sqlite); cord values and colours come from their
KFG_DB_Excel/*.xlsx (cached as $S/out/kfg2024_xlsx.pkl) because the SQL stores knots,
not values.  Top cord = attachment_type 'T' or cord_classification 'T' (their is_top_cord()).
"""
from __future__ import annotations

import csv
import pickle
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mk_port_relations import SCRATCH, Cord, PK, longest_ascher_color  # noqa: E402

DB = SCRATCH / "out" / "kfg2024.sqlite"
XPKL = SCRATCH / "out" / "kfg2024_xlsx.pkl"
NAME_MAP = SCRATCH / "mk" / "name_map.csv"
NAME_RE = re.compile(r"^p(\d+)((?:[sm]\d+)*)$")
GROUP_RE = re.compile(
    r"^(?P<start>[0-9.]+)cm (?:group of (?P<n>\d+) pendants \((?P<a>\d+)-(?P<b>\d+)\) space of (?P<sp>[0-9.]+)cm"
    r"|(?P<n1>\d+) \((?P<single>\d+)\))\s*$")


def xname(mk_name):
    return mk_name.replace(" - ", "_").replace("/", "_").replace(" ", "_")


def name_map():
    with open(NAME_MAP) as f:
        return {r["mk_name"]: r for r in csv.DictReader(f)}


def _int(v):
    if v is None or v == "":
        return 0
    try:
        return int(float(v))
    except ValueError:
        return 0


def load_snapshot(names=None, cluster_source="xlsx", l1_order="clusters"):
    nm = name_map()
    xl = pickle.load(open(XPKL, "rb"))
    con = sqlite3.connect(DB)
    out = {}
    for mk_name, row in nm.items():
        if names and mk_name not in names:
            continue
        kid = int(row["mk_khipu_id"])
        x = xl.get(xname(mk_name))
        if x is None:
            continue
        pcord = con.execute("select pcord_id from primary_cord where khipu_id=?", (kid,)).fetchone()[0]
        l1rows = con.execute(
            "select cord_ordinal, cluster_id, cluster_ordinal, attachment_type, cord_classification "
            "from cord where khipu_id=? and pendant_from=? order by cord_ordinal", (kid, pcord)).fetchall()
        corder = {cid: o for cid, o in con.execute(
            "select cluster_id, ordinal from cord_cluster where khipu_id=?", (kid,))}
        by = {}
        for c in x["cords"]:
            nm_ = str(c["Cord_Name"]).strip()
            m = NAME_RE.match(nm_)
            if not m:
                continue
            parts = re.findall(r"[sm]\d+", m[2])
            level = len(parts) + 1
            parent = ("p" + m[1] + "".join(parts[:-1])) if parts else None
            by[nm_] = Cord(nm_, _int(c.get("Value")), longest_ascher_color(c.get("Color")),
                           False, level, parent)
        for cd in by.values():
            if cd.parent and cd.parent in by:
                by[cd.parent].children.append(cd)
        # DB cord_level of each level-2 cord (their model only treats |level|==2 as subsidiary)
        dbrows = con.execute("select cord_id, pendant_from, cord_ordinal, cord_level from cord where khipu_id=?",
                             (kid,)).fetchall()
        ch = defaultdict(dict)
        for cid, pf, ordn, lvl in dbrows:
            ch[pf][ordn] = (cid, lvl)
        for cd in by.values():
            if cd.level == 2:
                m2 = NAME_RE.match(cd.name)
                a = int(m2[1])
                b = int(re.findall(r"[sm](\d+)", m2[2])[0])
                pc = ch[pcord].get(a)
                sub = ch[pc[0]].get(b) if pc else None
                cd.skip = sub is None or abs(sub[1] or 0) != 2
        l1x = sorted((cd for cd in by.values() if cd.level == 1), key=lambda cd: int(cd.name[1:]))
        mism = len(l1x) != len(l1rows)
        topflag = {ordn: ((att == "T") or (cls == "T")) for ordn, clid, clord, att, cls in l1rows}
        for cd in l1x:
            cd.top = topflag.get(int(cd.name[1:]), False)
        byord = {int(cd.name[1:]): cd for cd in l1x}
        clusters = []
        if not mism and cluster_source == "db":
            # clusters from the DB: cord_cluster.ordinal order, cords by cluster_ordinal
            clmap = defaultdict(list)
            for ordn, clid, clord, att, cls in l1rows:
                if ordn in byord and clid in corder:
                    clmap[clid].append((clord, byord[ordn]))
            clusters = [[cd for _, cd in sorted(clmap[c], key=lambda t: t[0])]
                        for c in sorted(clmap, key=lambda c: corder[c])]
        else:
            # fallback: the workbook's Clusters sheet
            for line in x["clusters"]:
                g = GROUP_RE.match(str(line).strip())
                if not g:
                    continue
                a, b = (int(g["single"]),) * 2 if g["single"] else (int(g["a"]), int(g["b"]))
                cl = [byord[i] for i in range(a, b + 1) if i in byord]
                if cl:
                    clusters.append(cl)
        if l1_order == "clusters":
            seen = set()
            l1c = []
            for cl in clusters:
                for cd in cl:
                    if id(cd) not in seen:
                        seen.add(id(cd))
                        l1c.append(cd)
            l1c += [cd for cd in l1x if id(cd) not in seen]  # unclustered cords at the end
            l1x = l1c
        if mism and cluster_source == "xlsx":
            # workbook and DB disagree on the level-1 cords: their run used the DB
            out[mk_name] = load_snapshot_db([mk_name])[mk_name]
            out[mk_name].mismatch = True
            continue
        pk = PK(mk_name, l1x, clusters)
        pk.mismatch = mism
        pk.our_id = row["our_id"]
        out[mk_name] = pk
    return out


if __name__ == "__main__":
    s = load_snapshot()
    print(len(s), "snapshot khipus;", sum(p.mismatch for p in s.values()), "with xlsx/db level-1 count mismatch")


# ---------------------------------------------------------------------------
# DB-only loader (values from knot.knot_value_decimal, colours from ascher_cord_color)
# ---------------------------------------------------------------------------

def load_snapshot_db(names=None, cluster_key="start_beg"):
    nm = name_map()
    con = sqlite3.connect(DB)
    out = {}
    for mk_name, row in nm.items():
        if names and mk_name not in names:
            continue
        kid = int(row["mk_khipu_id"])
        pcord = con.execute("select pcord_id from primary_cord where khipu_id=?", (kid,)).fetchone()[0]
        vals = dict(con.execute(
            "select k.cord_id, sum(k.knot_value_decimal) from knot k join cord c on c.cord_id=k.cord_id "
            "where c.khipu_id=? group by k.cord_id", (kid,)))
        cols = defaultdict(list)
        for cid, rb, re_, fc, ci in con.execute(
                "select cord_id, range_beg, range_end, full_color, color_index from ascher_cord_color "
                "where khipu_id=? and pcord_flag=0 order by color_index", (kid,)):
            cols[cid].append(((re_ or 0) - (rb or 0), fc))
        rows = con.execute(
            "select cord_id, pendant_from, cord_level, cord_ordinal, cluster_id, cluster_ordinal, "
            "attachment_type, cord_classification from cord where khipu_id=? order by cord_ordinal", (kid,)).fetchall()
        by = {}
        kids = defaultdict(list)
        for cid, pf, lvl, ordn, clid, clord, att, cls in rows:
            kids[pf].append((ordn, cid))
        info = {r[0]: r for r in rows}

        def color(cid):
            segs = cols.get(cid) or []
            if not segs:
                return ""
            best = max(segs, key=lambda t: t[0])  # first max
            return best[1] or ""

        l1 = []
        for ordn, cid in sorted(kids[pcord]):
            r = info[cid]
            cd = Cord(f"p{ordn}", int(vals.get(cid) or 0), color(cid), (r[6] == "T") or (r[7] == "T"), 1, None)
            by[cid] = cd
            l1.append(cd)

        def add_children(pcid):
            for ordn, cid in sorted(kids.get(pcid, [])):
                par = by[pcid]
                cd = Cord(f"{par.name}s{ordn}", int(vals.get(cid) or 0), color(cid), False, par.level + 1, par.name)
                by[cid] = cd
                par.children.append(cd)
                add_children(cid)
        for cd_id in [cid for _, cid in sorted(kids[pcord])]:
            add_children(cd_id)
        cl_rows = {r[3]: r for r in con.execute(
            "select cord_cluster_index, ordinal, start_position, cluster_id, beg_cord, cluster_level "
            "from cord_cluster where khipu_id=?", (kid,))}
        clmap = defaultdict(list)
        for cid, pf, lvl, ordn, clid, clord, att, cls in rows:
            if pf == pcord and clid in cl_rows:
                clmap[clid].append((clord, by[cid]))

        def ck(c):
            r = cl_rows[c]
            if cluster_key == "ordinal":
                return (r[1],)
            if cluster_key == "start_beg":
                return (r[2], r[4] or 0)
            if cluster_key == "start_id":
                return (r[2], c)
            if cluster_key == "id":
                return (c,)
            if cluster_key == "index":
                return (r[0],)
        clusters = [[cd for _, cd in sorted(clmap[c], key=lambda t: t[0])] for c in sorted(clmap, key=ck)]
        seen = set()
        l1c = []
        for cl in clusters:
            for cd in cl:
                if id(cd) not in seen:
                    seen.add(id(cd))
                    l1c.append(cd)
        l1c += [cd for cd in l1 if id(cd) not in seen]
        pk = PK(mk_name, l1c, clusters)
        pk.mismatch = False
        pk.our_id = row["our_id"]
        out[mk_name] = pk
    return out

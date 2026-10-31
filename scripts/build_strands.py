#!/usr/bin/env python3
"""Cord-for-cord correspondences ("strands") for every link on the /network page.

Writes public/data/stories/strands.json, read by the island shelf to draw a thread
between each matched pair of cords:

    {"links": {"KH0502|KH0517": {"a": "KH0517", "b": "KH0502",
        "rule": "group total → group head",
        "threads": [{"a": [3, ...], "b": [2], "va": 3618, "vb": 3618, "kind": "sum"}]}}}

Key = the two ids sorted and joined by "|" (pairKey in src/lib/stories/links.ts);
a/b keep the curated link's orientation (or the scan pair's).  Thread indices are
0-based positions among the khipu's level-1 cords sorted by ordinal — the indexing
of the silhouettes and of the scan spans.  A subsidiary is pointed at through its
level-1 ancestor, and the thread gets a "note" naming the subsidiary.

kind: exact (the same value, never 0) · blank (both cords blank, where the
rule lays cords side by side: an agreeing field) · near (a small slip the rule
allows: off by one, within 2%, two digits swapped, or the story's own
tolerance; "how" names it) · differ (cords the rule pairs whose values
disagree; "how" names the story's verdict) · dropped (a value on one side, a
blank on the other) · sum (one side sums several cords) · scaled (fixed ratio).
A thread through a subsidiary names it in "subA"/"subB" (and in "note").

Every link also carries "level" (the curated level firm/likely/open, or "scan"
for an unexamined scan pair), "longest" (the scan's longest exact run, when the
scan sees the pair) and, for rules that compare field for field, "compared" and
"agree" (exact + blank) — the story's "89 of 104".  Curated links with no
cord-level rule are written too, with no threads.

Two sources, merged by pair:
  1. the curated links of links.ts, each re-derived here from the cords by the rule
     its note states (the same derivations as the story modules in src/lib/stories);
  2. every scan pair in public/data/stories/links.json with longest >= 4, its spans
     expanded into per-cord exact threads (used for a curated link too when the
     note is just "values in order" and there is no rule of its own).
Every thread is re-checked against the recorded values before it is written;
a thread that fails is dropped and reported.

    python3 scripts/build_strands.py
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "khipus"
LINKS_JSON = ROOT / "public" / "data" / "stories" / "links.json"
LINKS_TS = ROOT / "src" / "lib" / "stories" / "links.ts"
OUT = ROOT / "public" / "data" / "stories" / "strands.json"
MIN_SCAN_RUN = 4


# ---------------------------------------------------------------- khipu access

class K:
    """One khipu: level-1 cords in ordinal order, every cord by name."""

    _cache: dict[str, "K"] = {}

    def __init__(self, kid: str) -> None:
        d = json.loads((DATA / f"{kid}.json").read_text())
        self.id = kid
        self.cords = d["cords"]  # stored order: each pendant followed by its subsidiaries
        self.by_name = {c["name"]: c for c in self.cords}
        self.l1 = sorted((c for c in self.cords if c["level"] == 1), key=lambda c: c["ordinal"])
        self.idx = {c["name"]: i for i, c in enumerate(self.l1)}
        self.vals = [val(c) for c in self.l1]

    @classmethod
    def get(cls, kid: str) -> "K":
        if kid not in cls._cache:
            cls._cache[kid] = K(kid)
        return cls._cache[kid]

    def top(self, name: str) -> str:
        """The level-1 ancestor of a cord."""
        c = self.by_name[name]
        while c.get("parent"):
            c = self.by_name[c["parent"]]
        return c["name"]

    def index_of(self, name: str) -> int:
        return self.idx[self.top(name)]

    def value(self, name: str) -> int:
        return val(self.by_name[name])

    def name(self, i: int) -> str:
        return self.l1[i]["name"]

    def groups(self, pendants_only: bool = False) -> list[list[int]]:
        """Level-1 cord indices by recorded group, groups in order."""
        by: dict[int, list[int]] = {}
        for i, c in enumerate(self.l1):
            if pendants_only and c["kind"] != "pendant":
                continue
            by.setdefault(c.get("group") if c.get("group") is not None else -1, []).append(i)
        return [by[g] for g in sorted(by)]

    def flat(self, start: str, end: str) -> list[str]:
        """Cord names in stored order from start to end inclusive."""
        names = [c["name"] for c in self.cords]
        return names[names.index(start):names.index(end) + 1]


def val(c: dict) -> int:
    return c.get("value") or 0


# ---------------------------------------------------------------- value relations

def digits_swapped(a: int, b: int) -> bool:
    return a != b and sorted(str(a)) == sorted(str(b)) and len(str(a)) == len(str(b))


def register(a: int, b: int) -> bool:
    """One register lost or added: 50 for 500, 78 for 1078."""
    lo, hi = sorted((a, b))
    if lo <= 0:
        return False
    if hi == lo * 10:
        return True
    p = 10
    while p <= hi:
        if hi % p == lo and hi - lo == (hi // p) * p and hi // p < 10:
            return True
        p *= 10
    return False


def near(a: int, b: int) -> str | None:
    """The default slip: off by one, within 2%, or two digits swapped (3102 for
    3012). Anything wider is a difference unless a link's own rule says so."""
    if a == b or a <= 0 or b <= 0:
        return None
    d = abs(a - b)
    if d == 1:
        return "off by one"
    if d <= 0.02 * max(a, b):
        return "within 2%"
    if digits_swapped(a, b) and len(str(a)) >= 3:
        return "two digits swapped"
    return None


def near_or_register(a: int, b: int) -> str | None:
    return near(a, b) or ("a register slip" if register(a, b) else None)


def near_tied_twice(a: int, b: int) -> str | None:
    """tiedtwice.ts verdictOf: only "off by one" is a slip; the story counts a
    round ten and a register among the fields that differ."""
    return "off by one" if a > 0 and b > 0 and abs(a - b) == 1 else None


def verdict_tied_twice(a: int, b: int) -> str:
    """tiedtwice.ts VERDICT_TEXT for a pair that is not exact or off by one."""
    d = abs(a - b)
    if d % 10 == 0 and d <= 20:
        return "off by a ten"
    if a * 10 == b or b * 10 == a:
        return "one register apart"
    return "different"


def near_register(a: int, b: int) -> str | None:
    """parislima.ts leadVerdict 'register': a lost thousand or hundred."""
    ok = a != b and a > 0 and b > 0 and (a % 1000 == b % 1000 or abs(a - b) % 100 == 0)
    return "off by a register" if ok else None


def never(a: int, b: int) -> None:
    return None


def lcs(x: list[int], y: list[int], eq=lambda p, q: p == q and p != 0) -> list[tuple[int, int]]:
    """Longest common subsequence as index pairs (zeros never match)."""
    n, m = len(x), len(y)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            dp[i + 1][j + 1] = dp[i][j] + 1 if eq(x[i], y[j]) else max(dp[i][j + 1], dp[i + 1][j])
    out, i, j = [], n, m
    while i > 0 and j > 0:
        if eq(x[i - 1], y[j - 1]) and dp[i][j] == dp[i - 1][j - 1] + 1:
            out.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return out[::-1]


# ---------------------------------------------------------------- threads

class Link:
    def __init__(self, a: str, b: str, rule: str, fieldwise: bool = False) -> None:
        self.a, self.b, self.rule = a, b, rule
        self.ka, self.kb = K.get(a), K.get(b)
        self.raw: list[dict] = []
        # the rule compares field for field: write compared / agree counts
        self.fieldwise = fieldwise

    def add(self, na, nb, kind: str, check=None, note: str | None = None, how: str | None = None) -> None:
        """na/nb: a cord name, a level-1 index, or a list of either."""
        def names(k: K, x) -> list[str]:
            xs = x if isinstance(x, list) else [x]
            return [k.name(i) if isinstance(i, int) else i for i in xs]
        self.raw.append({"a": names(self.ka, na), "b": names(self.kb, nb), "kind": kind,
                         "check": check, "note": note, "how": how})

    def pairs(self, pairs, check=None, differ=None) -> None:
        """Cords the rule lays side by side (index or name). Every pair becomes a
        thread: exact, blank (both 0), near (where check allows), dropped (one
        side 0) or differ (differ(va, vb) names the story's verdict)."""
        chk = check or near
        for i, j in pairs:
            na = self.ka.name(i) if isinstance(i, int) else i
            nb = self.kb.name(j) if isinstance(j, int) else j
            va, vb = self.ka.value(na), self.kb.value(nb)
            if va == vb:
                self.add(na, nb, "exact" if va else "blank")
            elif va == 0 or vb == 0:
                self.add(na, nb, "dropped", how=f"blank on {self.a if va == 0 else self.b}")
            elif h := chk(va, vb):
                self.add(na, nb, "near", check=chk, how=h)
            else:
                self.add(na, nb, "differ", check=chk, how=differ(va, vb) if differ else None)

    def verify(self) -> tuple[list[dict], list[str]]:
        out, dropped, seen = [], [], set()
        for t in self.raw:
            va = sum(self.ka.value(n) for n in t["a"])
            vb = sum(self.kb.value(n) for n in t["b"])
            kind, ok = t["kind"], False
            multi = len(t["a"]) > 1 or len(t["b"]) > 1
            chk = t["check"] or near
            if kind == "exact":
                ok = not multi and va == vb != 0
            elif kind == "blank":
                ok = not multi and va == vb == 0
            elif kind == "near":
                ok = not multi and va != vb and va > 0 and vb > 0 and bool(chk(va, vb))
            elif kind == "differ":
                ok = not multi and va != vb and va > 0 and vb > 0 and not chk(va, vb)
            elif kind == "dropped":
                ok = not multi and (va == 0) != (vb == 0)
            elif kind == "sum":
                ok = multi and va == vb and va > 0
            elif kind == "scaled":
                ok = va > 0 and vb > 0 and bool(t["check"](va, vb))
            if not ok:
                dropped.append(f"{self.a}|{self.b} {kind} {t['a']}={va} {t['b']}={vb}")
                continue
            ia = sorted({self.ka.index_of(n) for n in t["a"]})
            ib = sorted({self.kb.index_of(n) for n in t["b"]})
            sig = (tuple(ia), tuple(ib), tuple(t["a"]), tuple(t["b"]))
            if sig in seen:
                continue
            seen.add(sig)
            th = {"a": ia, "b": ib, "va": va, "vb": vb, "kind": kind}
            if t["how"]:
                th["how"] = t["how"]
            notes = [t["note"]] if t["note"] else []
            for side, kid, k, ns in (("subA", self.a, self.ka, t["a"]), ("subB", self.b, self.kb, t["b"])):
                subs = [n for n in ns if k.by_name[n]["level"] > 1]
                if subs:
                    th[side] = subs
                    notes.append(f"{kid} {', '.join(subs)}: subsidiary, on pendant {k.top(subs[0])}")
            if notes:
                th["note"] = "; ".join(notes)
            out.append(th)
        return out, dropped


# ---------------------------------------------------------------- derivations

def mirror(a: str, b: str, rule: str, gap_max: int = 12) -> Link:
    """Inkawasi mirrors: anchor on distinctive values (>= 100, at most twice on
    each side) in order, then match the remaining non-blank values in order
    inside each gap between anchors (the fixed deduction, the nets)."""
    L = Link(a, b, rule)
    x, y = L.ka.vals, L.kb.vals
    cx, cy = Counter(x), Counter(y)
    ax = [i for i, v in enumerate(x) if v >= 100 and cx[v] <= 2 and cy[v] <= 2]
    ay = [j for j, v in enumerate(y) if v >= 100 and cx[v] <= 2 and cy[v] <= 2]
    anchors = [(ax[p], ay[q]) for p, q in lcs([x[i] for i in ax], [y[j] for j in ay])]
    bounds = [(-1, -1)] + anchors + [(len(x), len(y))]
    matched = list(anchors)
    for (i0, j0), (i1, j1) in zip(bounds, bounds[1:]):
        gi, gj = list(range(i0 + 1, i1)), list(range(j0 + 1, j1))
        if not gi or not gj or len(gi) > gap_max or len(gj) > gap_max:
            continue
        for p, q in lcs([x[i] for i in gi], [y[j] for j in gj]):
            matched.append((gi[p], gj[q]))
    L.pairs(sorted(matched))
    return L


def totals_to_heads(a: str, b: str, rule: str, minimum: int = 1000) -> Link:
    """totals.ts totalsToHeads: each group sum of a against the next equal group
    head (first non-blank cord) of b, in order."""
    L = Link(a, b, rule)
    heads = []
    for g in L.kb.groups():
        first = next((i for i in g if L.kb.vals[i] > 0), None)
        if first is not None:
            heads.append(first)
    frm = 0
    for g in L.ka.groups():
        total = sum(L.ka.vals[i] for i in g)
        if total < minimum:
            continue
        for h in range(frm, len(heads)):
            if L.kb.vals[heads[h]] == total:
                L.add(g, heads[h], "sum" if len(g) > 1 else "exact")
                frm = h + 1
                break
    return L


def tied_twice(a: str, b: str, part: tuple[int, int], fmap: list[int], units: str) -> Link:
    """tiedtwice.ts pairRows: AS175 group (five fields) against the Huacho unit."""
    L = Link(a, b, "field for field, a blank cord added to each unit", fieldwise=True)
    ga = L.ka.groups(pendants_only=True)
    if units == "recorded":
        ub = L.kb.groups(pendants_only=True)
    else:
        pend = [i for i, c in enumerate(L.kb.l1) if c["kind"] == "pendant"]
        pend.sort(key=lambda i: (L.kb.l1[i].get("group") or 0, L.kb.l1[i]["ordinal"]))
        ub = [pend[i:i + 6] for i in range(0, len(pend), 6)]
    n = min(part[1] - part[0] + 1, len(ub))
    pairs = []
    for u in range(n):
        fa = list(ga[part[0] + u])
        while len(fa) < 5:
            fa.insert(0, None)
        for f, ia in enumerate(fa[:5]):
            if ia is not None and fmap[f] < len(ub[u]):
                pairs.append((ia, ub[u][fmap[f]]))
    L.pairs(pairs, check=near_tied_twice, differ=verdict_tied_twice)
    return L


def paris_lima() -> Link:
    """parislima.ts unitRows: Paris part 1 (groups 1-15) against Lima's units of
    >= 9 cords; the leading totals, then the fields after them matched in order."""
    L = Link("KH0097", "KH0586", "unit for unit: leading totals, then the fields in order")
    pa = L.ka.groups(pendants_only=True)[0:15]
    li = [g for g in L.kb.groups(pendants_only=True) if len(g) >= 9]
    for ua, ub in zip(pa, li):
        L.pairs([(ua[0], ub[0])], check=near_register)
        for p, q in lcs([L.ka.vals[i] for i in ua[1:]], [L.kb.vals[j] for j in ub[1:]]):
            L.add(ua[1 + p], ub[1 + q], "exact")
    return L


def reversed_record(a: str, b: str) -> Link:
    """AS107 (KH0121) against UR237 (KH0473) read from the other end: cord i is
    UR237's cord 29-i up to the seventeenth, then 28-i past UR237's extra blank."""
    L = Link(a, b, "the same record read from the other end", fieldwise=True)
    n = len(L.ka.vals)
    pairs = [(i, 29 - i) for i in range(17)] + [(i, 28 - i) for i in range(17, n)]
    L.pairs(pairs, check=near_or_register)
    return L


def positional(L: Link, ga: list[int], gb: list[int], check=None) -> Link:
    """Two groups laid cord for cord."""
    L.fieldwise = True
    L.pairs(list(zip(ga, gb)), check=check)
    return L


def near2pct(a: int, b: int) -> str | None:
    """crosslinks.ts compareValue 'near': within 2%."""
    return "within 2%" if a != b and a > 0 and abs(a - b) / a <= 0.02 else None


def rounded_copy() -> Link:
    """crosslinks.ts roundedAlignments: four 18-field tables, group for group."""
    L = Link("KH0049", "KH0362", "table for table: rounded, some fields blanked", fieldwise=True)
    ga, gb = L.ka.groups(pendants_only=True), L.kb.groups(pendants_only=True)
    grp = lambda k, g: [i for i, c in enumerate(k.l1) if c["kind"] == "pendant" and c.get("group") == g]
    for x, y in ((2, 0), (4, 1), (5, 2), (6, 3)):
        ia, ib = grp(L.ka, x), grp(L.kb, y)
        L.pairs(list(zip(ia, ib)), check=near2pct,
                differ=lambda p, q: "rounded down" if q < p and q % 100 == 0 else "different")
    return L


def group_of(k: K, g: int) -> list[int]:
    return [i for i, c in enumerate(k.l1) if c["kind"] == "pendant" and c.get("group") == g]


# Basel fragments (basel.ts placeFragments) -----------------------------------

def big_groups(k: K) -> list[list[int]]:
    return [g for g in k.groups(pendants_only=True) if len(g) >= 10 and k.l1[g[0]].get("group") is not None]


def best_run(seq: list[int], unit: list[int], min_len: int):
    best = None
    for direction, target in (("fwd", unit), ("rev", unit[::-1])):
        for i in range(len(seq)):
            for j in range(len(target)):
                n = 0
                while i + n < len(seq) and j + n < len(target) and seq[i + n] == target[j + n]:
                    n += 1
                vs = seq[i:i + n]
                if n < min_len:
                    continue
                nz = [v for v in vs if v > 0]
                if min_len >= 3:
                    if len(set(nz)) < 3 or max(vs) < 10:
                        continue
                elif len(nz) != len(vs) or min(vs) < 50:
                    continue
                if best is None or n > best[0]:
                    ustart = j if direction == "fwd" else len(unit) - j - n
                    best = (n, i, ustart, direction)
    return best


def basel(frag: str, berlin: str, expect_k: int) -> Link:
    """A Basel fragment's run of values inside one unit of KH0450 (big groups
    numbered from its end) or KH0147 (numbered from its start)."""
    long = berlin == "KH0450"
    L = Link(frag, berlin, "")
    units = big_groups(L.kb)
    numbered = [(len(units) - i if long else i + 1, u) for i, u in enumerate(units)]
    seq = L.ka.vals
    best = None
    for min_len in (3, 2):
        for k, u in numbered:
            r = best_run(seq, [L.kb.vals[i] for i in u], min_len)
            if r and (best is None or r[0] > best[0][0]):
                best = (r, k, u)
        if best:
            break
    if not best or best[1] != expect_k:
        L.rule = f"unplaced (expected unit {expect_k}, found {best and best[1]})"
        return L
    (n, fs, us, direction), k, u = best
    side = "brown" if long else "white"
    L.rule = f"{side} group = unit {k}" + (" from KH0450's end" if long else " of KH0147") + (", reversed" if direction == "rev" else "")
    for t in range(n):
        j = us + t if direction == "fwd" else us + n - 1 - t
        L.pairs([(fs + t, u[j])])
    if not long:  # a stray last value equal to the closing cord of the white unit
        last = len(seq) - 1
        covered = set(range(fs, fs + n))
        if seq[last] >= 10 and last not in covered and seq[last] == L.kb.vals[u[-1]]:
            L.add(last, u[-1], "exact", note="stray last cord = the unit's closing cord")
    return L


def shared_values(a: str, b: str, rule: str, values: list[int]) -> Link:
    """Cords carrying the same rare value on both, where each occurs once."""
    L = Link(a, b, rule)
    for v in values:
        ia = [i for i, x in enumerate(L.ka.vals) if x == v]
        ib = [j for j, x in enumerate(L.kb.vals) if x == v]
        if len(ia) == 1 and len(ib) == 1:
            L.add(ia[0], ib[0], "exact")
    return L


def heads_in_order(a: str, b: str, rule: str, tol: int = 10, minimum: int = 500) -> Link:
    """Group leaders (first non-blank cord of each group) in the same order,
    exact or within `tol`, by an order-keeping alignment that prefers exact."""
    L = Link(a, b, rule)
    def heads(k: K) -> list[int]:
        out = []
        for g in k.groups():
            f = next((i for i in g if k.vals[i] > 0), None)
            if f is not None and k.vals[f] >= minimum:
                out.append(f)
        return out
    ha, hb = heads(L.ka), heads(L.kb)
    x, y = [L.ka.vals[i] for i in ha], [L.kb.vals[j] for j in hb]
    n, m = len(x), len(y)
    score = lambda p, q: 2 if p == q else (1 if abs(p - q) <= tol else 0)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            s = score(x[i], y[j])
            dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j], dp[i][j] + s if s else -1)
    i, j, out = n, m, []
    while i > 0 and j > 0:
        s = score(x[i - 1], y[j - 1])
        if s and dp[i][j] == dp[i - 1][j - 1] + s:
            out.append((ha[i - 1], hb[j - 1]))
            i, j = i - 1, j - 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    L.pairs(out[::-1], check=lambda p, q: f"within {tol}" if p != q and abs(p - q) <= tol else None)
    return L


def passage(a: str, b: str, rule: str, seq_a: list[str], seq_b: list[str]) -> Link:
    """Two passages given as cord-name lists (subsidiaries in place), matched in order."""
    L = Link(a, b, rule)
    for p, q in lcs([L.ka.value(n) for n in seq_a], [L.kb.value(n) for n in seq_b]):
        L.add(seq_a[p], seq_b[q], "exact")
    return L


def reverse_blocks(k: K, start: str, end: str) -> list[str]:
    """totals.ts sharedPassage: reverse pendant by pendant, subsidiaries kept after their pendant."""
    blocks: list[list[str]] = []
    for n in k.flat(start, end):
        if k.by_name[n]["level"] == 1 or not blocks:
            blocks.append([n])
        else:
            blocks[-1].append(n)
    return [n for blk in blocks[::-1] for n in blk]


def curated_builders() -> dict[str, Link]:
    B: dict[str, Link] = {}

    def put(L: Link) -> None:
        B["|".join(sorted((L.a, L.b)))] = L

    # tied twice
    put(tied_twice("KH0192", "KH0470", (0, 20), [0, 1, 3, 4, 5], "sixes"))
    put(tied_twice("KH0192", "KH0469", (24, 44), [0, 1, 2, 4, 5], "recorded"))
    # Paris / Lima, and the Berlin record from the other end
    put(paris_lima())
    put(reversed_record("KH0121", "KH0473"))
    # Inkawasi mirrors
    put(mirror("KH0503", "KH0491", "mirror: same sums, the deduction moved to the end"))
    put(mirror("KH0504", "KH0492", "mirror: the peanut ledger"))
    put(mirror("KH0514", "KH0502", "mirror: the ledger with a fixed 47"))
    # derived records
    put(rounded_copy())
    L = Link("KH0377", "KH0590", "a whole group retied inside another")
    put(positional(L, group_of(L.ka, 0)[10:18], group_of(L.kb, 1)))
    L = Link("KH0358", "KH0602", "six fields retied")
    put(positional(L, group_of(L.ka, 29), group_of(L.kb, 3)))
    # Basel fragments
    for frag, berlin, k in (("KH0689", "KH0450", 1), ("KH0689", "KH0147", 1),
                            ("KH0690", "KH0450", 4), ("KH0690", "KH0147", 4),
                            ("KH0682", "KH0450", 14), ("KH0682", "KH0147", 14),
                            ("KH0683", "KH0147", 13), ("KH0686", "KH0450", 7),
                            ("KH0688", "KH0450", 2)):
        put(basel(frag, berlin, k))
    # link screens
    L = Link("KH0118", "KH0471", "cords → leading cords of the groups")
    heads = [g[0] for g in L.kb.groups()[:9]]
    put(positional(L, list(range(7, 16)), heads))
    L = Link("KH0132", "KH0456", "group for group, the middle of group 2 blanked", fieldwise=True)
    L.pairs(list(zip(range(1, 8), range(6, 13))))
    L.pairs([(8, 13)] + list(zip(range(9, 14), range(14, 19))) + [(14, 19)])
    for t in L.raw:
        if L.ka.idx[t["a"][0]] in range(9, 14):
            t["note"] = "the Aschers record AS118's cords 10–14 as broken"
    put(L)
    L = Link("KH0143", "KH0591", "one eleven-cord group, cord for cord")
    put(positional(L, group_of(L.ka, 12), group_of(L.kb, 5)))
    L = Link("KH0156", "KH0432", "one group held twice, once reordered")
    L.pairs(list(zip(group_of(L.ka, 15), group_of(L.kb, 1))),
            check=lambda p, q: {1: "off by one", 2: "off by two"}.get(abs(p - q)))
    left = list(group_of(L.ka, 15))
    for j in group_of(L.kb, 3):
        i = next((i for i in left if L.ka.vals[i] == L.kb.vals[j]), None)
        if i is not None:
            left.remove(i)
            L.add(i, j, "exact", note="UR194 group 3 holds these values in another order")
    put(L)
    put(heads_in_order("KH0511", "KH0513", "same group leaders in order"))
    put(shared_values("KH0404", "KH0426", "two five-digit values in order", [24341, 32587]))
    # deep analysis
    put(totals_to_heads("KH0517", "KH0502", "group total → group head"))
    put(totals_to_heads("KH0507", "KH0513", "group total → group head"))
    put(totals_to_heads("KH0507", "KH0511", "group total → group head"))
    L = Link("KH0510", "KH0512", "lone value → group head")
    # the four lone values of UR273A against the heads of UR274A the note names
    lone = [i for i, v in enumerate(L.ka.vals) if v in (891, 453, 448)]
    heads = [L.kb.idx[n] for n in ("p22", "p32", "p36", "p42")]
    L.pairs(list(zip(lone, heads)))
    put(L)
    L = shared_values("KH0506", "KH0514", "one entry, 1505 / 47 / 1458, and the rare values",
                      [1505, 1458, 1653, 2633])
    e506, e514 = L.ka.vals.index(1505), L.kb.vals.index(1505)
    L.add(e506 + 2, e514 + 1, "exact", note="the deduction of the 1505 / 47 / 1458 entry")
    put(L)
    ka, k502, k514 = K.get("KH0506"), K.get("KH0502"), K.get("KH0514")
    pair_share = sorted({v for v in k502.vals if v >= 1000} & {v for v in k514.vals if v >= 1000})
    put(shared_values("KH0502", "KH0506", "values ≥ 1000 of the UR266 / UR275 pair",
                      [v for v in pair_share if v in set(ka.vals)]))
    L = Link("KH0505", "KH0514", "cord for cord over the first seven groups, UR268 at 2.8 to 5.7 times UR275",
             fieldwise=True)
    ga = [i for g in L.ka.groups()[:7] for i in g]
    gb = [i for g in L.kb.groups()[:7] for i in g]
    ratio = lambda p, q: 2.5 <= p / q <= 6.5
    for i, j in zip(ga, gb):
        va, vb = L.ka.vals[i], L.kb.vals[j]
        if va > 0 and vb > 0 and ratio(va, vb):
            L.add(i, j, "scaled", check=ratio)
        else:
            L.pairs([(i, j)], check=never, differ=lambda p, q: f"ratio {p / q:.2f}")
    put(L)
    L = Link("KH0284", "KH0285", "relaid: subsidiaries retied as pendants", fieldwise=True)
    fa = L.ka.flat("p1", "p32s1")
    fb = [n for n in L.kb.flat("p11", "p58") if L.kb.by_name[n]["level"] == 1]
    L.pairs(list(zip(fa, fb)), check=near2pct)
    put(L)
    k242, k245, k257 = K.get("KH0242"), K.get("KH0245"), K.get("KH0257")
    s242 = [n for n in k242.flat("p277", "p292s9") if n != "p292"]
    s245 = reverse_blocks(k245, "p119", "p143")
    s257 = k257.flat("p18", "p36")
    put(passage("KH0242", "KH0245", "shared passage, KH0245 reversed", s242, s245))
    put(passage("KH0242", "KH0257", "p292's subsidiaries = a passage of pendants", s242, s257))
    put(passage("KH0245", "KH0257", "shared passage, KH0245 reversed", s245, s257))
    L = Link("KH0165", "KH0196", "the same group", fieldwise=True)
    L.pairs(list(zip(group_of(L.ka, 3), group_of(L.kb, 0))))
    for t in L.raw:
        t["note"] = "AS149 repeats this group four times (groups 4–7); drawn to the first"
    put(L)
    L = Link("KH0152", "KH0432", "one group, 6 of 9 cords")
    put(positional(L, group_of(L.ka, 4), group_of(L.kb, 0), check=never))
    L = Link("KH0067", "KH0403", "analogous: seven pendants within 14%")
    within = lambda p, q: "within 14%" if p != q and abs(p - q) <= 0.14 * max(p, q) + 0.5 else None
    for i, j in zip(range(7), range(7)):
        L.add(i, j, "near", check=within, how="within 14%", note="analogous, not copied")
    put(L)
    L = Link("KH0521", "KH0525", "× 5")
    x5 = lambda p, q: q == 5 * p
    for na, j in zip(("p153", "p154", "p155", "p156"), group_of(L.kb, 4)):
        L.add(na, j, "scaled", check=x5)
    put(L)
    return B


# ---------------------------------------------------------------- scan pairs

def scan_link(p: dict, a: str, b: str, rule: str) -> Link:
    """A scan pair's spans as exact threads, oriented a/b as asked."""
    L = Link(a, b, rule)
    flip = p["a"] != a
    for n, i, j in p["spans"]:
        for t in range(n):
            ia = i + t
            jb = j + t if p["dir"] == "fwd" else j + n - 1 - t
            if flip:
                ia, jb = jb, ia
            L.pairs([(ia, jb)], check=never)
    return L


def curated_list() -> list[dict]:
    src = LINKS_TS.read_text()
    body = src[src.index("export const CURATED"):src.index("export const SETS")]
    out = []
    for m in re.finditer(r"\{\s*a: \"(KH\d+)\",\s*b: \"(KH\d+)\",(.*?)\n\t\}", body, re.S):
        short = re.search(r'short: "([^"]*)"', m.group(3))
        note = re.search(r'note:\s*"((?:[^"\\]|\\.)*)"', m.group(3))
        level = re.search(r'level: "(\w+)"', m.group(3))
        out.append({"a": m.group(1), "b": m.group(2), "short": short and short.group(1),
                    "note": note.group(1) if note else "", "level": level.group(1)})
    return out


# curated links no cord-level rule reaches: why, as the link's rule
NO_THREADS = {
    "KH0147|KH0450": "unit k from KH0450's end = unit k of KH0147 (set by the Basel fragments); "
                     "no value passes between the units, so no cord is threaded",
    "KH0498|KH0507": "61 shared values; the relation has not been read",
}
KINDS = ("exact", "blank", "near", "differ", "dropped", "sum", "scaled")
# the kinds that satisfy a link's rule outright (near is a slip, not agreement)
AGREE = ("exact", "blank", "sum", "scaled")


def entry(L: Link, threads: list[dict], level: str, scan: dict | None) -> dict:
    e = {"a": L.a, "b": L.b, "rule": L.rule, "level": level}
    if scan:
        e["longest"] = scan["longest"]
    if L.fieldwise and threads:
        e["compared"] = len(threads)
        e["agree"] = sum(t["kind"] in AGREE for t in threads)
    e["threads"] = threads
    return e


def main() -> None:
    curated = curated_list()
    scan = {"|".join(sorted((p["a"], p["b"]))): p
            for p in json.loads(LINKS_JSON.read_text())["pairs"] if p["longest"] >= MIN_SCAN_RUN}
    builders = curated_builders()
    links: dict[str, dict] = {}
    dropped_all: list[str] = []
    report: list[str] = []
    missing: list[str] = []
    for c in curated:
        key = "|".join(sorted((c["a"], c["b"])))
        L = builders.get(key)
        if L is None and key in scan:
            L = scan_link(scan[key], c["a"], c["b"], c["short"] or "values in order")
        if L is None:
            L = Link(c["a"], c["b"], NO_THREADS.get(key, "not read cord by cord"))
            missing.append(f"{c['a']}→{c['b']}: {c['note'][:90]}")
        if (L.a, L.b) != (c["a"], c["b"]):
            raise SystemExit(f"orientation mismatch for {key}: {L.a}/{L.b}")
        threads, dropped = L.verify()
        dropped_all += dropped
        links[key] = entry(L, threads, c["level"], scan.get(key))
        if not threads:
            continue
        n = Counter(t["kind"] for t in threads)
        agree = f"  agree {links[key]['agree']}/{links[key]['compared']}" if "agree" in links[key] else ""
        report.append(f"  {L.a}→{L.b:<7} {len(threads):>3} threads  " +
                      " ".join(f"{k} {n[k]}" for k in KINDS if n[k]) + agree +
                      f"   [{L.rule}]")
    n_scan = 0
    for key, p in scan.items():
        if key in links:
            continue
        L = scan_link(p, p["a"], p["b"], "shared run" + (", reversed" if p["dir"] == "rev" else ""))
        threads, dropped = L.verify()
        dropped_all += dropped
        if threads:
            links[key] = entry(L, threads, "scan", p)
            n_scan += 1

    print(f"curated links with threads: {len(report)} of {len(curated)}")
    print("\n".join(report))
    print(f"\nscan-only pairs (longest >= {MIN_SCAN_RUN}): {n_scan}")
    print(f"\ncurated links written without threads ({len(missing)}):")
    print("\n".join(f"  {m}" for m in missing))
    if dropped_all:
        print(f"\nthreads dropped on verification ({len(dropped_all)}):")
        print("\n".join(f"  {d}" for d in dropped_all))

    lines = ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}"
                       for k, v in sorted(links.items()))
    OUT.write_text('{"links":{\n' + lines + "\n}}\n")
    json.loads(OUT.read_text())
    print(f"\nwrote {OUT.relative_to(ROOT)}: {len(links)} links, "
          f"{sum(len(v['threads']) for v in links.values())} threads, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()

import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for the Twin Falls story (KH0699 / KT001, Herrett Center,
 * College of Southern Idaho). The khipu reads as three accounts built to one
 * pattern: a grand-total cord, a six-cord group of unit totals, a second total
 * with its own group, then six detail groups. Ten groups a section, three
 * sections, one lost to the cut primary: 29. Everything here is computed
 * from the recorded cords; the only constants are where the three sections
 * fall among the recorder's 29 groups. The corpus screens the story quotes
 * (lone-cord sums, group-size periodicity) are scripts/group_grammar.py.
 */

export const TWIN_FALLS_ID = "KH0699";

export type SectionKey = "A" | "B" | "C";

export interface Section {
	key: SectionKey;
	/** cm along the primary cord, for labels */
	from: number;
	to: number;
	/** 0-based indexes into khipu.groups; A has no surviving grand-total cord */
	total: number | null;
	sums: number;
	total2: number;
	sums2: number;
	details: number[];
}

export const SECTIONS: Section[] = [
	{
		key: "A",
		from: 3,
		to: 25,
		total: null,
		sums: 0,
		total2: 1,
		sums2: 2,
		details: [3, 4, 5, 6, 7, 8],
	},
	{
		key: "B",
		from: 26,
		to: 50,
		total: 9,
		sums: 10,
		total2: 11,
		sums2: 12,
		details: [13, 14, 15, 16, 17, 18],
	},
	{
		key: "C",
		from: 51,
		to: 85,
		total: 19,
		sums: 20,
		total2: 21,
		sums2: 22,
		details: [23, 24, 25, 26, 27, 28],
	},
];

export type Role = "total" | "sums" | "total2" | "sums2" | "detail";

/** Template positions of a section, in order, for aligning the three. */
export const TEMPLATE: Role[] = [
	"total",
	"sums",
	"total2",
	"sums2",
	"detail",
	"detail",
	"detail",
	"detail",
	"detail",
	"detail",
];

/**
 * A section as its sequence of group sizes, one entry per template position;
 * null where the section has no group (A's opening total, cut away).
 */
export function sectionShape(khipu: Khipu, s: Section): (number | null)[] {
	const size = (gi: number | null) => (gi === null ? null : khipu.groups[gi].n);
	return [
		size(s.total),
		size(s.sums),
		size(s.total2),
		size(s.sums2),
		...s.details.map(size),
	];
}

/** Which section a recorder's group belongs to, and what it does there. */
export function roleOfGroup(gi: number): { section: Section; role: Role } {
	for (const s of SECTIONS) {
		if (s.total === gi) return { section: s, role: "total" };
		if (s.sums === gi) return { section: s, role: "sums" };
		if (s.total2 === gi) return { section: s, role: "total2" };
		if (s.sums2 === gi) return { section: s, role: "sums2" };
		if (s.details.includes(gi)) return { section: s, role: "detail" };
	}
	return { section: SECTIONS[2], role: "detail" };
}

/** Descendant cords by their parent's name. */
export function childrenOf(khipu: Khipu): Map<string, Cord[]> {
	const m = new Map<string, Cord[]>();
	for (const c of khipu.cords) {
		if (!c.parent) continue;
		if (!m.has(c.parent)) m.set(c.parent, []);
		m.get(c.parent)?.push(c);
	}
	for (const list of m.values()) list.sort((a, b) => a.ordinal - b.ordinal);
	return m;
}

/**
 * A subsidiary that carries one figure-eight knot and nothing else. Read as
 * the number 1 these break two otherwise exact sums; read as labels they
 * make both exact, and the two white-and-brown ones hang from a summary cord
 * and from the first cord of the group it totals.
 */
export function isMarker(c: Cord): boolean {
	return c.level > 1 && c.knots.length === 1 && c.knots[0].type === "E";
}

/** A cord's value with every descendant's, markers excluded. */
export function cordTotal(c: Cord, kids: Map<string, Cord[]>): number {
	let v = c.value ?? 0;
	for (const k of kids.get(c.name) ?? []) {
		if (isMarker(k)) continue;
		v += cordTotal(k, kids);
	}
	return v;
}

/** Numeric subsidiaries of a cord, in order. */
export function numericSubs(c: Cord, kids: Map<string, Cord[]>): Cord[] {
	return (kids.get(c.name) ?? []).filter((k) => !isMarker(k));
}

export function groupTotal(khipu: Khipu, gi: number): number {
	const kids = childrenOf(khipu);
	const g = pendantGroups(khipu)[gi] ?? [];
	return g.reduce((a, c) => a + cordTotal(c, kids), 0);
}

/**
 * The same knots read one register lower: single-knot clusters as tens,
 * long knots and figure-eights as units. The opening six cords of KH0699
 * carry two clusters 13 cm apart, and the recorder logged the register as
 * an open question; the groups they total settle it.
 */
export function tensReading(c: Cord): number {
	let v = 0;
	for (const k of c.knots) {
		if (k.type === "S") v += 10 * k.n;
		else v += k.n;
	}
	return v;
}

export type Verdict = "exact" | "near" | "no";

export function verdictOf(a: number, b: number): Verdict {
	if (a === b) return "exact";
	if (Math.abs(a - b) <= 1) return "near";
	return "no";
}

export interface SumRow {
	/** the cord in the six-sum group */
	cord: Cord;
	/** its value as the recorder wrote it, descendants included */
	recorded: number;
	/** the value this reading uses (register-shifted in section A) */
	read: number;
	/** the detail group it should total: index and total */
	detail: number;
	detailTotal: number;
	verdict: Verdict;
}

/** One row per unit: the sum cord against the detail group in the same position. */
export function sumRows(khipu: Khipu, s: Section): SumRow[] {
	const groups = pendantGroups(khipu);
	const kids = childrenOf(khipu);
	const sumCords = groups[s.sums] ?? [];
	return s.details.map((gi, i) => {
		const cord = sumCords[i];
		const subs = numericSubs(cord, kids).reduce(
			(a, k) => a + cordTotal(k, kids),
			0,
		);
		const recorded = cordTotal(cord, kids);
		const read = s.key === "A" ? tensReading(cord) + subs : recorded;
		const detailTotal = (groups[gi] ?? []).reduce(
			(a, c) => a + cordTotal(c, kids),
			0,
		);
		return {
			cord,
			recorded,
			read,
			detail: gi,
			detailTotal,
			verdict: verdictOf(read, detailTotal),
		};
	});
}

export interface TotalRow {
	label: string;
	cord: Cord;
	value: number;
	group: number;
	groupTotal: number;
	verdict: Verdict;
}

/** The lone total cords of a section against the group each precedes. */
export function totalRows(khipu: Khipu, s: Section): TotalRow[] {
	const groups = pendantGroups(khipu);
	const kids = childrenOf(khipu);
	const rows: TotalRow[] = [];
	const add = (label: string, gi: number | null, target: number) => {
		if (gi == null) return;
		const cord = groups[gi]?.[0];
		if (!cord) return;
		const value = cordTotal(cord, kids);
		const total = (groups[target] ?? []).reduce(
			(a, c) => a + cordTotal(c, kids),
			0,
		);
		rows.push({
			label,
			cord,
			value,
			group: target,
			groupTotal: total,
			verdict: verdictOf(value, total),
		});
	};
	add("total", s.total, s.sums);
	add("second total", s.total2, s.sums2);
	return rows;
}

/**
 * Could this cord have lost its units? On KH0699 the units cluster of a
 * three-place cord sits about 14 cm below its hundreds and 7.5 cm below its
 * tens. A cord cut or broken before that point, whose lowest surviving
 * cluster is single knots, may have carried more.
 */
export function mayLackUnits(c: Cord): boolean {
	if (c.term !== "C" && c.term !== "B") return false;
	if (c.length == null) return false;
	if (c.knots.length === 0) return c.length < 19;
	const lowest = c.knots.reduce((a, k) => (k.pos > a.pos ? k : a));
	if (lowest.type !== "S") return false;
	const perKnot = (lowest.value ?? 0) / Math.max(1, lowest.n);
	const room = perKnot >= 100 ? 14 : 7.5;
	return c.length < lowest.pos + room;
}

export interface QuotaUnit {
	pendant: Cord;
	sub: Cord | null;
	pendantValue: number;
	subValue: number;
	sum: number;
	pendantCut: boolean;
	subCut: boolean;
}

/** The six units of section B's first summary group, pendant and subsidiary apart. */
export function quotaUnits(khipu: Khipu): QuotaUnit[] {
	const kids = childrenOf(khipu);
	const s = SECTIONS[1];
	return (pendantGroups(khipu)[s.sums] ?? []).map((p) => {
		const sub = numericSubs(p, kids)[0] ?? null;
		const pendantValue = p.value ?? 0;
		const subValue = sub ? cordTotal(sub, kids) : 0;
		return {
			pendant: p,
			sub,
			pendantValue,
			subValue,
			sum: pendantValue + subValue,
			pendantCut: mayLackUnits(p),
			subCut: sub ? mayLackUnits(sub) : false,
		};
	});
}

export interface SplitDigit {
	cord: Cord;
	kind: "long+eight" | "long+long";
	/** the units cluster as written, e.g. "4L + 3L" */
	text: string;
}

/**
 * Units digits written as a long knot followed by a figure-eight or by a
 * second long knot within 3 cm — 7 + 1 for 8, 4 + 3 for 7. Nineteen cords
 * here do the first, the most in the corpus.
 */
export function splitDigits(khipu: Khipu): SplitDigit[] {
	const out: SplitDigit[] = [];
	for (const c of khipu.cords) {
		const ks = [...c.knots].sort((a, b) => a.pos - b.pos);
		for (let i = 0; i + 1 < ks.length; i++) {
			const a = ks[i];
			const b = ks[i + 1];
			if (a.type !== "L" || b.pos - a.pos > 3) continue;
			if (b.type === "E")
				out.push({
					cord: c,
					kind: "long+eight",
					text: `${a.n}L + ${ks
						.slice(i + 1)
						.filter((k) => k.type === "E")
						.map(() => "1E")
						.join(" + ")}`,
				});
			else if (b.type === "L")
				out.push({ cord: c, kind: "long+long", text: `${a.n}L + ${b.n}L` });
			break;
		}
	}
	return out;
}

/** Cords whose notes record hair worked into the ply or a knot. */
export function hairCords(khipu: Khipu): Cord[] {
	return khipu.cords.filter((c) => c.notes && /hair/i.test(c.notes));
}

export function markers(khipu: Khipu): Cord[] {
	return khipu.cords.filter(isMarker);
}

/** Level-1 pendant by name, for the reader figures. */
export function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

/** The same cord with its single-knot clusters read as tens, for the reader. */
export function asTens(c: Cord): Cord {
	return {
		...c,
		value: tensReading(c),
		knots: c.knots.map((k) => (k.type === "S" ? { ...k, value: 10 * k.n } : k)),
	};
}

/** The same knots read with single-knot clusters as hundreds (806, not 86). */
export function hundredsReading(c: Cord): number {
	let v = 0;
	for (const k of c.knots) {
		if (k.type === "S") v += 100 * k.n;
		else v += k.n;
	}
	return v;
}

/**
 * One checked sum drawn as a thread over the khipu: level-1 cord indexes (as
 * in strands.json), the two values, and how it held. Kept free of the
 * component so the story tables and the drawing read the same rows.
 */
export interface LedgerThread {
	key: string;
	section: SectionKey;
	tier: "total" | "sum";
	from: number[];
	to: number[];
	toKind: "cords" | "group";
	vFrom: number;
	vTo: number;
	kind: "exact" | "near" | "reading" | "no";
	stub?: boolean;
	label?: string;
	title: string;
}

/** Level-1 index of every pendant by name; subsidiaries fold into it. */
function pendantIndex(khipu: Khipu): Map<string, number> {
	const l1 = khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
	return new Map(l1.map((c, i) => [c.name, i]));
}

const WORD: Record<Verdict, string> = {
	exact: "exact",
	near: "one knot off",
	no: "no match",
};

/**
 * The whole ledger as threads: each lone total to the group it totals (a fan
 * onto its cords), each summary cord to its detail group (a bracket). Section
 * A's summary cords are read as tens. Section B is drawn as the story reads
 * it: its lone total 778 + 422 as a reading of six units of 200, its second
 * total as consistent only, and its summary cords as stubs, since no sum onto
 * its detail groups was found.
 */
export function ledgerThreads(
	khipu: Khipu,
	register: "tens" | "hundreds" = "tens",
): LedgerThread[] {
	const groups = pendantGroups(khipu);
	const at = pendantIndex(khipu);
	const idx = (c: Cord) => at.get(c.name) ?? -1;
	const out: LedgerThread[] = [];
	for (const s of SECTIONS) {
		for (const r of totalRows(khipu, s)) {
			const to = (groups[r.group] ?? []).map(idx);
			const base = {
				key: `${s.key}-${r.cord.name}`,
				section: s.key,
				tier: "total" as const,
				from: [idx(r.cord)],
				to,
				toKind: "cords" as const,
				vFrom: r.value,
				vTo: r.groupTotal,
			};
			if (s.key === "B" && r.label === "total") {
				out.push({
					...base,
					vTo: 1200,
					kind: "reading",
					label: "6 × 200",
					title: `${r.cord.name} ${r.cord.value} + its subsidiary ${r.value - (r.cord.value ?? 0)} = ${r.value}, read as six units of 200; the six cords as recorded sum to ${r.groupTotal}, several cut above their units (reading, not a sum)`,
				});
			} else if (s.key === "B") {
				out.push({
					...base,
					kind: "reading",
					title: `${r.cord.name} ${r.value} against g${r.group + 1} as recorded ${r.groupTotal}, four cords cut below their tens: consistent, not demonstrated`,
				});
			} else {
				out.push({
					...base,
					kind: r.verdict,
					title: `${r.cord.name} ${r.value} = g${r.group + 1} (${to.length} cords) ${r.groupTotal}, ${WORD[r.verdict]}`,
				});
			}
		}
		const rows = sumRows(khipu, s);
		for (const r of rows) {
			const to = (groups[r.detail] ?? []).map(idx);
			const base = {
				key: `${s.key}-${r.cord.name}`,
				section: s.key,
				tier: "sum" as const,
				from: [idx(r.cord)],
				to,
				toKind: "group" as const,
				vTo: r.detailTotal,
			};
			if (s.key === "B") {
				out.push({
					...base,
					vFrom: r.read,
					kind: "no",
					stub: true,
					label: r === rows[0] ? "no sum found" : undefined,
					title: `${r.cord.name} ${r.read}: no sum onto g${r.detail + 1} (${r.detailTotal}) or any other detail group was found`,
				});
				continue;
			}
			const vFrom =
				s.key === "A" && register === "hundreds"
					? hundredsReading(r.cord) + (r.read - tensReading(r.cord))
					: r.read;
			const v = verdictOf(vFrom, r.detailTotal);
			const how =
				s.key === "A"
					? register === "tens"
						? ", read as tens"
						: ", read as hundreds"
					: "";
			out.push({
				...base,
				vFrom,
				kind: v,
				label:
					s.key === "A" && register === "hundreds"
						? `${vFrom} ≠ ${r.detailTotal}`
						: undefined,
				title: `${r.cord.name} ${vFrom}${how} ${v === "no" ? "against" : "="} g${r.detail + 1} (${to.length} cords) ${r.detailTotal}, ${WORD[v]}`,
			});
		}
	}
	return out;
}

/** The lone figure-eight label subsidiaries, as the level-1 cords they hang from. */
export function markerPendants(khipu: Khipu): { i: number; name: string }[] {
	const at = pendantIndex(khipu);
	const byName = new Map(khipu.cords.map((c) => [c.name, c]));
	return markers(khipu).map((m) => {
		let p = m;
		while (p.parent && p.level > 1) {
			const up = byName.get(p.parent);
			if (!up) break;
			p = up;
		}
		return { i: at.get(p.name) ?? -1, name: m.name };
	});
}

/** Level-1 cord range [from, to) of each section, for bands. */
export function sectionRanges(
	khipu: Khipu,
): { key: SectionKey; from: number; to: number }[] {
	const groups = pendantGroups(khipu);
	const at = pendantIndex(khipu);
	return SECTIONS.map((s) => {
		const first = s.total ?? s.sums;
		const last = s.details[s.details.length - 1];
		const g0 = groups[first] ?? [];
		const g1 = groups[last] ?? [];
		return {
			key: s.key,
			from: at.get(g0[0]?.name) ?? 0,
			to: (at.get(g1[g1.length - 1]?.name) ?? 0) + 1,
		};
	});
}

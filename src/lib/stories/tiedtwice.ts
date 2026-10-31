import type { Cord, CordGroup, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for the "tied twice" story: AS175 (KH0192, Berlin VA 42518,
 * catalogued Pachacamac) against the two spliced pieces UR233 and UR232
 * (KH0470 and KH0469, Berlin VA 63038 B and A, catalogued Huacho).
 *
 * The Aschers read AS175 as 45 five-cord groups in three parts: 21 groups,
 * 3 groups, 21 groups. Each Huacho piece carries 21 six-cord units. Laid
 * side by side, UR233 restates part 1 and UR232 part 3, field for field,
 * with one blank cord added to every unit. Everything here is computed from
 * the recorded cords; the constants are the part boundaries the Aschers
 * saw in the spacing, and where the blank cord sits in a Huacho unit.
 */

export const PACHACAMAC_ID = "KH0192";
export const HUACHO_B_ID = "KH0470";
export const HUACHO_A_ID = "KH0469";

export interface Part {
	key: "1" | "2" | "3";
	label: string;
	/** 0-based group indexes into AS175, inclusive */
	from: number;
	to: number;
}

export const PARTS: Part[] = [
	{ key: "1", label: "Part 1", from: 0, to: 20 },
	{ key: "2", label: "Part 2", from: 21, to: 23 },
	{ key: "3", label: "Part 3", from: 24, to: 44 },
];

export function partOfGroup(gi: number): Part {
	return PARTS.find((p) => gi >= p.from && gi <= p.to) ?? PARTS[2];
}

/** The five positions of the Aschers' template, named by their part-1 colour. */
export const FIELDS = [
	{ i: 0, code: "W", label: "white" },
	{ i: 1, code: "LB", label: "deep brown" },
	{ i: 2, code: "YG", label: "green" },
	{ i: 3, code: "YB", label: "light brown" },
	{ i: 4, code: "YB:0G", label: "brown and olive" },
] as const;

export interface HuachoSide {
	id: string;
	alias: string;
	accession: string;
	/** the part of AS175 this piece restates */
	part: Part;
	/** position in a six-cord unit of each of the five fields */
	map: number[];
	/** the position left over, always knotless */
	blankAt: number;
	/**
	 * UR233's recorder split some units by spacing, so its pendants are
	 * chunked in sixes; UR232's recorded groups are its units.
	 */
	units: "sixes" | "recorded";
}

export const HUACHO: HuachoSide[] = [
	{
		id: HUACHO_B_ID,
		alias: "UR233",
		accession: "VA 63038 (B)",
		part: PARTS[0],
		map: [0, 1, 3, 4, 5],
		blankAt: 2,
		units: "sixes",
	},
	{
		id: HUACHO_A_ID,
		alias: "UR232",
		accession: "VA 63038 (A)",
		part: PARTS[2],
		map: [0, 1, 2, 4, 5],
		blankAt: 3,
		units: "recorded",
	},
];

/** A group of AS175 as five fields. The first group has lost its white cord. */
export function fieldsOf(group: Cord[]): (Cord | null)[] {
	const out: (Cord | null)[] = [...group];
	while (out.length < 5) out.unshift(null);
	return out.slice(0, 5);
}

/** A Huacho piece's pendants as six-cord units, in order. */
export function unitsOf(khipu: Khipu, mode: HuachoSide["units"]): Cord[][] {
	if (mode === "recorded") return pendantGroups(khipu);
	const pend = khipu.cords
		.filter((c) => c.kind === "pendant")
		.sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || a.ordinal - b.ordinal);
	const out: Cord[][] = [];
	for (let i = 0; i < pend.length; i += 6) out.push(pend.slice(i, i + 6));
	return out;
}

/**
 * A copy of a Huacho piece whose recorded groups are its six-cord units, so
 * a layout boxes each unit and a figure can frame one.
 */
export function unitsKhipu(khipu: Khipu, mode: HuachoSide["units"]): Khipu {
	const units = unitsOf(khipu, mode);
	const groups: CordGroup[] = units.map((u) => ({
		start: u[0]?.pos ?? 0,
		first: u[0]?.ordinal ?? 0,
		last: u[u.length - 1]?.ordinal ?? 0,
		n: u.length,
		spacing: 0.5,
	}));
	const index = new Map<string, number>();
	units.forEach((u, i) => {
		for (const c of u) index.set(c.name, i);
	});
	return {
		...khipu,
		groups,
		cords: khipu.cords.map((c) =>
			index.has(c.name) ? { ...c, group: index.get(c.name) } : c,
		),
		stats: { ...khipu.stats, nGroups: groups.length },
	};
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

export type Verdict = "exact" | "one" | "ten" | "register" | "no" | "na";

export const VERDICT_TEXT: Record<Verdict, string> = {
	exact: "same",
	one: "off by one",
	ten: "off by a ten",
	register: "one register apart",
	no: "different",
	na: "no cord",
};

export function verdictOf(a: number | null, b: number | null): Verdict {
	if (a == null || b == null) return "na";
	if (a === b) return "exact";
	const d = Math.abs(a - b);
	if (d === 1) return "one";
	if (d % 10 === 0 && d <= 20) return "ten";
	if (a * 10 === b || b * 10 === a) return "register";
	return "no";
}

export interface FieldPair {
	field: number;
	a: Cord | null;
	b: Cord | null;
	va: number | null;
	vb: number | null;
	verdict: Verdict;
}

export interface UnitRow {
	/** 0-based unit on the Huacho piece */
	unit: number;
	/** the AS175 group it restates */
	group: number;
	a: Cord[];
	b: Cord[];
	blank: Cord | null;
	fields: FieldPair[];
}

/** Every unit of a Huacho piece against the AS175 group in the same position. */
export function pairRows(a: Khipu, b: Khipu, side: HuachoSide): UnitRow[] {
	const ga = pendantGroups(a);
	const units = unitsOf(b, side.units);
	const n = Math.min(side.part.to - side.part.from + 1, units.length);
	const rows: UnitRow[] = [];
	for (let u = 0; u < n; u++) {
		const gi = side.part.from + u;
		const fa = fieldsOf(ga[gi] ?? []);
		const unit = units[u];
		rows.push({
			unit: u,
			group: gi,
			a: ga[gi] ?? [],
			b: unit,
			blank: unit[side.blankAt] ?? null,
			fields: fa.map((ca, f) => {
				const cb = unit[side.map[f]] ?? null;
				const va = ca ? (ca.value ?? 0) : null;
				const vb = cb ? (cb.value ?? 0) : null;
				return { field: f, a: ca, b: cb, va, vb, verdict: verdictOf(va, vb) };
			}),
		});
	}
	return rows;
}

export type PairStats = Record<Verdict, number> & { compared: number };

export function pairStats(rows: UnitRow[]): PairStats {
	const s: PairStats = {
		exact: 0,
		one: 0,
		ten: 0,
		register: 0,
		no: 0,
		na: 0,
		compared: 0,
	};
	for (const r of rows)
		for (const f of r.fields) {
			s[f.verdict]++;
			if (f.verdict !== "na") s.compared++;
		}
	return s;
}

/** The fields that do not agree, in order. */
export function differences(rows: UnitRow[]): (FieldPair & { unit: number })[] {
	return rows.flatMap((r) =>
		r.fields
			.filter((f) => f.verdict !== "exact" && f.verdict !== "na")
			.map((f) => ({ ...f, unit: r.unit })),
	);
}

export interface SummaryTerm {
	group: number;
	a: Cord | null;
	b: Cord | null;
}

export interface SummaryRow {
	/** which of the three summary groups, 0-based */
	k: number;
	field: number;
	target: Cord;
	terms: SummaryTerm[];
	sumA: number;
	sumB: number;
	/** a term is missing on the Huacho piece, so sumB counts it as 0 */
	partial: boolean;
	verdictA: Verdict;
	verdictB: Verdict;
}

/**
 * The Aschers' reading of part 2: part 3 is seven sets of three groups, and
 * the k-th summary group holds, field by field, the sum of the k-th group of
 * every set. Checked here with AS175's own part-3 values and with UR232's.
 */
export function summaryRows(a: Khipu, b: Khipu): SummaryRow[] {
	const ga = pendantGroups(a);
	const side = HUACHO[1];
	const units = unitsOf(b, side.units);
	const p2 = PARTS[1];
	const p3 = PARTS[2];
	const rows: SummaryRow[] = [];
	for (let k = 0; k < 3; k++) {
		const summary = fieldsOf(ga[p2.from + k] ?? []);
		for (let f = 0; f < 5; f++) {
			const target = summary[f];
			if (!target) continue;
			const terms: SummaryTerm[] = [];
			for (let s = 0; s < 7; s++) {
				const gi = p3.from + k + 3 * s;
				if (gi > p3.to) break;
				terms.push({
					group: gi,
					a: fieldsOf(ga[gi] ?? [])[f],
					b: units[gi - p3.from]?.[side.map[f]] ?? null,
				});
			}
			const sumA = terms.reduce((t, x) => t + (x.a?.value ?? 0), 0);
			const sumB = terms.reduce((t, x) => t + (x.b?.value ?? 0), 0);
			const v = target.value ?? 0;
			rows.push({
				k,
				field: f,
				target,
				terms,
				sumA,
				sumB,
				partial: terms.some((x) => x.b == null),
				verdictA: verdictOf(sumA, v),
				verdictB: verdictOf(sumB, v),
			});
		}
	}
	return rows;
}

/** Subsidiaries shorter than 3 cm and recorded as broken: cords that were cut away. */
export function stubs(khipu: Khipu): Cord[] {
	return khipu.cords.filter(
		(c) => c.level > 1 && (c.length ?? 0) < 3 && c.term === "B",
	);
}

export interface SubMatch {
	unit: number;
	field: number;
	/** the surviving Huacho subsidiary */
	b: Cord;
	/** the AS175 cord in the same field and its subsidiary */
	a: Cord | null;
	aSub: Cord | null;
	verdict: Verdict;
}

/** Huacho subsidiaries long enough to carry knots, against AS175's on the same field. */
export function survivingSubs(
	a: Khipu,
	b: Khipu,
	side: HuachoSide,
): SubMatch[] {
	const rows = pairRows(a, b, side);
	const kidsA = childrenOf(a);
	const kidsB = childrenOf(b);
	const out: SubMatch[] = [];
	for (const r of rows)
		for (const f of r.fields) {
			if (!f.b) continue;
			for (const sub of kidsB.get(f.b.name) ?? []) {
				if ((sub.length ?? 0) < 3) continue;
				const aSub = f.a ? (kidsA.get(f.a.name)?.[0] ?? null) : null;
				out.push({
					unit: r.unit,
					field: f.field,
					b: sub,
					a: f.a,
					aSub,
					verdict: verdictOf(sub.value ?? 0, aSub ? (aSub.value ?? 0) : null),
				});
			}
		}
	return out;
}

/** How many AS175 cords in each field carry a subsidiary, by part. */
export function subsidiaryCounts(a: Khipu): { field: number; n: number }[] {
	const kids = childrenOf(a);
	const counts = [0, 0, 0, 0, 0];
	for (const g of pendantGroups(a))
		fieldsOf(g).forEach((c, f) => {
			if (c && (kids.get(c.name)?.length ?? 0) > 0) counts[f]++;
		});
	return counts.map((n, field) => ({ field, n }));
}

/** Colours a field wears on a Huacho piece, most common first. */
export function fieldColours(
	rows: UnitRow[],
): { field: number; colours: { code: string; n: number }[] }[] {
	return [0, 1, 2, 3, 4].map((field) => {
		const tally = new Map<string, number>();
		for (const r of rows) {
			const c = r.fields[field]?.b;
			if (!c) continue;
			// the first colour of the cord, without any length range the recorder noted
			const code = (c.color ?? "?").split("/")[0].replace(/\(.*$/, "");
			tally.set(code, (tally.get(code) ?? 0) + 1);
		}
		return {
			field,
			colours: [...tally.entries()]
				.map(([code, n]) => ({ code, n }))
				.sort((x, y) => y.n - x.n),
		};
	});
}

/** The blank cords of a piece: the position no field maps to. */
export function blanks(rows: UnitRow[]): Cord[] {
	return rows.flatMap((r) => (r.blank ? [r.blank] : []));
}

/** Direction of every long knot on a khipu, tallied. */
export function longKnotDirections(khipu: Khipu): Record<string, number> {
	const out: Record<string, number> = {};
	for (const c of khipu.cords)
		for (const k of c.knots) {
			if (k.type !== "L") continue;
			out[k.dir] = (out[k.dir] ?? 0) + 1;
		}
	return out;
}

/** Attachment of every pendant, tallied. */
export function attachments(khipu: Khipu): Record<string, number> {
	const out: Record<string, number> = {};
	for (const c of khipu.cords) {
		if (c.kind !== "pendant") continue;
		const k = c.attach ?? "U";
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

/** Level-1 pendant by name, for the reader figures. */
export function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

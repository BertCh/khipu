import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";
import { childrenOf } from "#/lib/stories/twinfalls";

/**
 * Derivations for the proportional-template story (KH0028 / AS026B, Penn
 * Museum SA4030, tied to KH0027 / AS026A). The Aschers noticed in 1978 that
 * most of this khipu's ten-cord groups carry one value N with N/2 at
 * positions 3, 9 and 10, and that N changes from group to group. Everything
 * here recomputes that from the recorded cords: which groups fit on a strict
 * pendant-only reading, how the halves are knotted, what the subsidiaries do
 * underneath, how the magnitudes relate, and how far the positional shape
 * outlives the proportional one. The only constants are the template itself,
 * the group indexes the reading names, and the Aschers' numbering. A broken
 * stub with no knots is read as unknown, never as zero. The corpus screens
 * the story quotes are scripts/kh0028_analysis.py (sections 8 and 8b); their
 * results are carried in CORPUS below because the page cannot load 684 khipus.
 */

export const KHIPU_ID = "KH0028";
export const PAIR_ID = "KH0027";

/** N, N, N/2, N, N, N, N, N, N/2, N/2 for ten cords … */
export const TEMPLATE_10 = [1, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 0.5];
/** … and for nine, one middle N position missing (the Aschers' reading). */
export const TEMPLATE_9 = [1, 1, 0.5, 1, 1, 1, 1, 0.5, 0.5];

/** 1-based positions that carry N/2, by group size. */
export function halfPositions(n: number): number[] {
	if (n === 10) return [3, 9, 10];
	if (n === 9) return [3, 8, 9];
	return [];
}

/** Recorder groups (0-based, singles included) the pendant-only reading accepts. */
export const TEMPLATE_GROUPS = [0, 2, 4, 8, 9, 10, 11];
/** The template's low positions but not its ratios. */
export const NEAR_MISS = [7];
/** Outside the scheme: the hundreds group, the seven-cord group, and the last group. */
export const NON_FIT = [3, 5, 12];
/** The two lone pendants, 31 and 406. */
export const SINGLES = [1, 6];

/** The Aschers number the eleven multi-cord groups 1–11, skipping the two lone pendants. */
export const ASCHER_GROUP: Record<number, number> = {
	0: 1,
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	7: 6,
	8: 7,
	9: 8,
	10: 9,
	11: 10,
	12: 11,
};

/** A broken stub with no knots: read as unknown, never as zero. */
export function isUnreadable(c: Cord): boolean {
	return c.term === "B" && c.knots.length === 0;
}

export function readValue(c: Cord): number | null {
	return isUnreadable(c) ? null : (c.value ?? 0);
}

/** Most common first colour code among a set of cords. */
export function groupColour(cords: Cord[]): string {
	const count = new Map<string, number>();
	for (const c of cords) {
		const code = c.colorParsed?.[0]?.codes[0] ?? "?";
		count.set(code, (count.get(code) ?? 0) + 1);
	}
	return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
}

export interface MatrixRow {
	index: number;
	ascher: number | null;
	cords: Cord[];
	values: (number | null)[];
	colour: string;
	n: number;
	broken: number;
	/** sum of readable pendant values */
	total: number;
	/** cm along the primary cord where the group starts */
	start: number;
}

/** Every recorder group as a row of pendant values in ordinal order. */
export function matrixRows(khipu: Khipu): MatrixRow[] {
	return pendantGroups(khipu).map((cords, index) => {
		const values = cords.map(readValue);
		return {
			index,
			ascher: ASCHER_GROUP[index] ?? null,
			cords,
			values,
			colour: groupColour(cords),
			n: cords.length,
			broken: values.filter((v) => v === null).length,
			total: values.reduce<number>((a, v) => a + (v ?? 0), 0),
			start: khipu.groups[index]?.start ?? cords[0]?.pos ?? 0,
		};
	});
}

export type CellClass =
	| "exact"
	| "down"
	| "up"
	| "mismatch"
	| "broken"
	| "absent";

export interface FitCell {
	pos: number;
	value: number | null;
	want: number;
	half: boolean;
	cls: CellClass;
}

export type FitVerdict =
	| "exact"
	| "exact with rounding"
	| "fits where readable"
	| "does not fit"
	| "not tested";

export interface Fit {
	N: number | null;
	cells: FitCell[];
	counts: Record<CellClass, number>;
	verdict: FitVerdict;
}

const EMPTY_COUNTS: Record<CellClass, number> = {
	exact: 0,
	down: 0,
	up: 0,
	mismatch: 0,
	broken: 0,
	absent: 0,
};

/** N of a group: the most common readable value at its non-half positions. */
export function templateN(values: (number | null)[]): number | null {
	const halves = halfPositions(values.length);
	const count = new Map<number, number>();
	values.forEach((v, i) => {
		if (v === null || halves.includes(i + 1)) return;
		count.set(v, (count.get(v) ?? 0) + 1);
	});
	const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
	return best ? best[0] : null;
}

/**
 * Each position of a 9- or 10-cord group against N or N/2. An odd N halves
 * to floor or ceil; both count as rounding, and are reported apart. null is
 * a broken cord; the string "absent" marks a position with nothing to test
 * (used for subsidiary series, where a pendant may carry no cord of a colour).
 */
export function fitGroup(values: (number | null | "absent")[]): Fit {
	const halves = halfPositions(values.length);
	const plain = values.map((v) => (v === "absent" ? null : v));
	const N = halves.length ? templateN(plain) : null;
	if (N === null)
		return { N, cells: [], counts: { ...EMPTY_COUNTS }, verdict: "not tested" };
	const cells = values.map<FitCell>((v, i) => {
		const pos = i + 1;
		const half = halves.includes(pos);
		const want = half ? N / 2 : N;
		let cls: CellClass;
		if (v === "absent") cls = "absent";
		else if (v === null) cls = "broken";
		else if (v === want) cls = "exact";
		else if (half && N % 2 === 1 && v === Math.floor(N / 2)) cls = "down";
		else if (half && N % 2 === 1 && v === Math.floor(N / 2) + 1) cls = "up";
		else cls = "mismatch";
		return { pos, value: v === "absent" ? null : v, want, half, cls };
	});
	const counts = { ...EMPTY_COUNTS };
	for (const c of cells) counts[c.cls]++;
	const verdict: FitVerdict =
		counts.mismatch > 0
			? "does not fit"
			: counts.broken > 0 || counts.absent > 0
				? "fits where readable"
				: counts.down > 0 || counts.up > 0
					? "exact with rounding"
					: "exact";
	return { N, cells, counts, verdict };
}

export interface FitRow extends MatrixRow {
	fit: Fit;
}

export function fitRows(khipu: Khipu): FitRow[] {
	return matrixRows(khipu).map((r) => ({ ...r, fit: fitGroup(r.values) }));
}

/** The 9- and 10-cord groups: those the template can be tried on. */
export function testedGroups(rows: FitRow[]): FitRow[] {
	return rows.filter((r) => r.fit.verdict !== "not tested");
}

/** Groups the strict reading accepts: exact, rounded, or consistent wherever readable. */
export function fittingGroups(rows: FitRow[]): FitRow[] {
	return testedGroups(rows).filter((r) => r.fit.verdict !== "does not fit");
}

export function byVerdict(rows: FitRow[], v: FitVerdict): FitRow[] {
	return rows.filter((r) => r.fit.verdict === v);
}

/** Cell classes summed over the fitting groups, all positions or half positions only. */
export function cellStats(
	rows: FitRow[],
	halfOnly = false,
): Record<CellClass, number> & { total: number } {
	const out = { ...EMPTY_COUNTS, total: 0 };
	for (const r of fittingGroups(rows))
		for (const c of r.fit.cells) {
			if (halfOnly && !c.half) continue;
			out[c.cls]++;
			out.total++;
		}
	return out;
}

/** Half-position cells of fitting groups with even N: how many are exactly N/2. */
export function evenHalves(rows: FitRow[]): { exact: number; total: number } {
	let exact = 0;
	let total = 0;
	for (const r of fittingGroups(rows)) {
		if (r.fit.N === null || r.fit.N % 2 === 1) continue;
		for (const c of r.fit.cells) {
			if (!c.half || c.cls === "broken") continue;
			total++;
			if (c.cls === "exact") exact++;
		}
	}
	return { exact, total };
}

/** "4L+4L", "2S+4L", "1E" — the knots on a cord in order, or "none". */
export function knotSignature(c: Cord): string {
	if (c.knots.length === 0) return "none";
	return [...c.knots]
		.sort((a, b) => a.pos - b.pos)
		.map((k) => `${k.n}${k.type}`)
		.join("+");
}

export interface KnotTallyRow {
	value: number;
	forms: { sig: string; count: number; cords: Cord[] }[];
	total: number;
}

/** How each value is knotted on the pendants of the given groups. */
export function knotTally(
	rows: MatrixRow[],
	groupIdx: number[],
): KnotTallyRow[] {
	const by = new Map<number, Map<string, Cord[]>>();
	for (const r of rows) {
		if (!groupIdx.includes(r.index)) continue;
		r.cords.forEach((c, i) => {
			const v = r.values[i];
			if (v === null) return;
			const sig = knotSignature(c);
			if (!by.has(v)) by.set(v, new Map());
			const m = by.get(v) as Map<string, Cord[]>;
			m.set(sig, [...(m.get(sig) ?? []), c]);
		});
	}
	return [...by.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([value, m]) => {
			const forms = [...m.entries()]
				.map(([sig, cords]) => ({ sig, count: cords.length, cords }))
				.sort((a, b) => b.count - a.count);
			return { value, forms, total: forms.reduce((a, f) => a + f.count, 0) };
		});
}

/** Count of cords with this value knotted in this form, from a tally. */
export function formCount(
	tally: KnotTallyRow[],
	value: number,
	sig: string,
): number {
	return (
		tally.find((t) => t.value === value)?.forms.find((f) => f.sig === sig)
			?.count ?? 0
	);
}

export function valueCount(tally: KnotTallyRow[], value: number): number {
	return tally.find((t) => t.value === value)?.total ?? 0;
}

/** Cords of a value knotted in any form but the given one. */
export function oddForms(
	tally: KnotTallyRow[],
	value: number,
	sig: string,
): Cord[] {
	return (tally.find((t) => t.value === value)?.forms ?? [])
		.filter((f) => f.sig !== sig)
		.flatMap((f) => f.cords);
}

/**
 * The Aschers' reading of a subsidiary: one knot of one, single or
 * figure-eight, is the number 1 (the build values three lone single knots
 * at 10). Pendants keep the build value.
 */
export function ascherValue(c: Cord): number | null {
	if (isUnreadable(c)) return null;
	if (c.kind !== "pendant" && c.knots.length === 1 && c.knots[0].n === 1)
		return 1;
	return c.value ?? 0;
}

export function descendants(c: Cord, kids: Map<string, Cord[]>): Cord[] {
	const out: Cord[] = [];
	for (const k of kids.get(c.name) ?? []) {
		out.push(k);
		out.push(...descendants(k, kids));
	}
	return out;
}

/** Pendant plus every cord below it, Ascher reading; null if any of them is broken. */
export function withSubs(c: Cord, kids: Map<string, Cord[]>): number | null {
	const parts = [readValue(c), ...descendants(c, kids).map(ascherValue)];
	return parts.some((p) => p === null)
		? null
		: parts.reduce<number>((a, p) => a + (p ?? 0), 0);
}

/** The matrix again, with subsidiaries folded into their pendant. */
export function withSubsRows(khipu: Khipu): FitRow[] {
	const kids = childrenOf(khipu);
	return matrixRows(khipu).map((r) => {
		const values = r.cords.map((c) => withSubs(c, kids));
		return { ...r, values, fit: fitGroup(values) };
	});
}

/** Rounding at the half positions of tested groups whose N is odd. */
export function oddHalfStats(rows: FitRow[]): Record<CellClass, number> {
	const out = { ...EMPTY_COUNTS };
	for (const r of testedGroups(rows)) {
		if (r.fit.N === null || r.fit.N % 2 === 0) continue;
		for (const c of r.fit.cells) if (c.half) out[c.cls]++;
	}
	return out;
}

/** Sum of every cord in a group as built (broken as 0): pendants and all descendants. */
export function groupTotalWithSubs(khipu: Khipu, gi: number): number {
	const kids = childrenOf(khipu);
	return (pendantGroups(khipu)[gi] ?? []).reduce(
		(a, c) =>
			a +
			(c.value ?? 0) +
			descendants(c, kids).reduce((b, d) => b + (d.value ?? 0), 0),
		0,
	);
}

export interface ColourSeries {
	colour: string;
	/** pendants of the group carrying at least one subsidiary of this colour */
	present: number;
	/** by position: the colour's subsidiaries under the pendant (with their own subsidiaries), Ascher reading */
	values: (number | null | "absent")[];
	fit: Fit;
}

/**
 * A group's direct subsidiaries split by recorded colour, each colour as a
 * series over the pendant positions: the sum of that colour's subsidiaries
 * under the pendant plus their sub-subsidiaries, on the Ascher reading;
 * "absent" where the pendant has none of the colour, null where one is
 * broken. Only colours hung under at least `min` pendants are returned.
 */
export function colourSeries(
	khipu: Khipu,
	gi: number,
	min = 5,
): ColourSeries[] {
	const kids = childrenOf(khipu);
	const pendants = pendantGroups(khipu)[gi] ?? [];
	const colours = new Map<string, number>();
	for (const p of pendants) {
		const seen = new Set<string>();
		for (const s of kids.get(p.name) ?? []) seen.add(s.color ?? "?");
		for (const c of seen) colours.set(c, (colours.get(c) ?? 0) + 1);
	}
	return [...colours.entries()]
		.filter(([, n]) => n >= min)
		.sort((a, b) => b[1] - a[1])
		.map(([colour, present]) => {
			const values = pendants.map<number | null | "absent">((p) => {
				const subs = (kids.get(p.name) ?? []).filter(
					(s) => (s.color ?? "?") === colour,
				);
				if (subs.length === 0) return "absent";
				let sum = 0;
				for (const s of subs) {
					const parts = [
						ascherValue(s),
						...descendants(s, kids).map(ascherValue),
					];
					if (parts.some((v) => v === null)) return null;
					sum += parts.reduce<number>((a, v) => a + (v ?? 0), 0);
				}
				return sum;
			});
			return { colour, present, values, fit: fitGroup(values) };
		});
}

export interface SingleKnotSubs {
	eight: number;
	singleAsOne: number;
	singleAsTen: Cord[];
	total: number;
}

/** Subsidiaries carrying exactly one knot of one: figure-eights, and single knots the build reads as 1 or 10. */
export function singleKnotSubs(khipu: Khipu): SingleKnotSubs {
	let eight = 0;
	let singleAsOne = 0;
	const singleAsTen: Cord[] = [];
	for (const c of khipu.cords) {
		if (c.kind === "pendant" || c.knots.length !== 1 || c.knots[0].n !== 1)
			continue;
		if (c.knots[0].type === "E") eight++;
		else if (c.knots[0].type === "S") {
			if ((c.value ?? 0) === 1) singleAsOne++;
			else singleAsTen.push(c);
		}
	}
	return {
		eight,
		singleAsOne,
		singleAsTen,
		total: eight + singleAsOne + singleAsTen.length,
	};
}

/** Subsidiaries and pendants that are broken stubs. */
export function unreadableCounts(khipu: Khipu): {
	pendants: number;
	subsidiaries: number;
} {
	let pendants = 0;
	let subsidiaries = 0;
	for (const c of khipu.cords) {
		if (!isUnreadable(c)) continue;
		if (c.kind === "pendant") pendants++;
		else subsidiaries++;
	}
	return { pendants, subsidiaries };
}

/** Sum of pendant values, broken stubs as 0. */
export function pendantTotal(khipu: Khipu): number {
	return khipu.cords
		.filter((c) => c.kind === "pendant")
		.reduce((a, c) => a + (readValue(c) ?? 0), 0);
}

/** What a complete group of this size would total under the template: 7N + 3⌊N/2⌋, or 6N + 3⌊N/2⌋ for nine. */
export function templateTotal(N: number, n: number): number | null {
	const halves = halfPositions(n).length;
	if (!halves) return null;
	return (n - halves) * N + halves * Math.floor(N / 2);
}

/** "8/3", "2", "1/2": a ratio in lowest terms. */
export function ratioText(a: number, b: number): string {
	const g = gcd(a, b);
	const p = a / g;
	const q = b / g;
	return q === 1 ? String(p) : `${p}/${q}`;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** Numbers divided by their common factor: 204, 68, 34, 17 → 12, 4, 2, 1. */
export function inLowestTerms(xs: number[]): number[] {
	const g = xs.reduce((a, x) => gcd(a, x), 0);
	return g ? xs.map((x) => x / g) : xs;
}

/** N of each fitting group in cord order. */
export function nSequence(rows: FitRow[]): { index: number; N: number }[] {
	return fittingGroups(rows)
		.filter((r) => r.fit.N !== null)
		.map((r) => ({ index: r.index, N: r.fit.N as number }));
}

/** Pairs of fitting groups whose N stand in the given integer ratio. */
export function ratioPairs(
	seq: { index: number; N: number }[],
	k: number,
): [number, number][] {
	const out: [number, number][] = [];
	for (let i = 0; i < seq.length; i++)
		for (let j = i + 1; j < seq.length; j++) {
			const a = seq[i].N;
			const b = seq[j].N;
			if (a === k * b || b === k * a) out.push([seq[i].index, seq[j].index]);
		}
	return out;
}

/** Magnitudes that stand in no whole ratio with any other in the sequence. */
export function loneMagnitudes(seq: { index: number; N: number }[]): number[] {
	const Ns = [...new Set(seq.map((s) => s.N))];
	return Ns.filter(
		(a) => !Ns.some((b) => b !== a && (a % b === 0 || b % a === 0)),
	);
}

export interface SubsetSums {
	hits: number;
	subsets: number;
	/** how many of the integers 1..limit some subset reaches */
	reachable: number;
	limit: number;
	/** one hit, as group indexes */
	example: number[] | null;
}

/** Can a target be written as a sum of some of these totals, and how easily is anything? */
export function subsetSums(
	totals: { index: number; total: number }[],
	target: number,
	limit = 500,
): SubsetSums {
	const reach = new Set<number>();
	let hits = 0;
	let example: number[] | null = null;
	const n = totals.length;
	const subsets = 2 ** n - 1;
	for (let mask = 1; mask <= subsets; mask++) {
		let s = 0;
		const members: number[] = [];
		for (let i = 0; i < n; i++)
			if (mask & (1 << i)) {
				s += totals[i].total;
				members.push(totals[i].index);
			}
		reach.add(s);
		if (s === target) {
			hits++;
			if (!example || members.length < example.length) example = members;
		}
	}
	return {
		hits,
		subsets,
		reachable: [...reach].filter((x) => x >= 1 && x <= limit).length,
		limit,
		example,
	};
}

/** 1-based positions of a group's three smallest values, or null when the third ties the fourth. */
export function lowTriple(values: (number | null)[]): number[] | null {
	if (values.some((v) => v === null) || values.length < 9) return null;
	const vals = values as number[];
	const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
	if (!(vals[order[2]] < vals[order[3]])) return null;
	return order
		.slice(0, 3)
		.map((i) => i + 1)
		.sort((a, b) => a - b);
}

export interface LowPositionTest {
	/** complete groups of this size */
	tested: MatrixRow[];
	/** those whose three smallest sit at the template's half positions */
	agreeing: MatrixRow[];
	/** the half positions for this size */
	want: number[];
	/** (1/C(n,3))^(k-1): chance k independently shuffled groups pick one triple */
	chance: number;
}

function choose3(n: number): number {
	return (n * (n - 1) * (n - 2)) / 6;
}

/** Complete groups of one size (no broken cord) against the template's half positions. */
export function lowPositionTest(
	rows: MatrixRow[],
	size: 9 | 10,
): LowPositionTest {
	const tested = rows.filter((r) => r.n === size && r.broken === 0);
	const want = halfPositions(size);
	const agreeing = tested.filter(
		(r) => lowTriple(r.values)?.join(",") === want.join(","),
	);
	const k = tested.length;
	return {
		tested,
		agreeing,
		want,
		chance: k > 1 ? (1 / choose3(size)) ** (k - 1) : 1,
	};
}

/** mulberry32: a small seeded generator so the shuffle is repeatable. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface ShuffleResult {
	trials: number;
	seed: number;
	/** trials by the largest number of groups sharing one low triple */
	histogram: Record<number, number>;
	/** the largest agreement any trial reached */
	max: number;
	/** trials reaching the observed agreement or better */
	atLeastObserved: number;
}

/**
 * Shuffle each complete ten-cord group's values independently and count how
 * many groups then share one low triple. The script does this with Python's
 * generator at seed 1; this repeats it in the page with a different
 * generator, so the tail counts differ in detail but not in kind.
 */
export function shuffleTest(
	rows: MatrixRow[],
	observed: number,
	trials = 200000,
	seed = 1,
): ShuffleResult {
	const next = rng(seed);
	const groups = rows
		.filter((r) => r.n === 10 && r.broken === 0)
		.map((r) => r.values as number[]);
	const histogram: Record<number, number> = {};
	let atLeastObserved = 0;
	let max = 0;
	const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	for (let t = 0; t < trials; t++) {
		const count = new Map<number, number>();
		let best = 0;
		for (const g of groups) {
			const v = g.slice();
			for (let i = v.length - 1; i > 0; i--) {
				const j = Math.floor(next() * (i + 1));
				const tmp = v[i];
				v[i] = v[j];
				v[j] = tmp;
			}
			const order = idx.slice().sort((a, b) => v[a] - v[b]);
			if (!(v[order[2]] < v[order[3]])) continue;
			const key = order
				.slice(0, 3)
				.sort((a, b) => a - b)
				.reduce((a, p) => a * 16 + p, 0);
			const c = (count.get(key) ?? 0) + 1;
			count.set(key, c);
			if (c > best) best = c;
		}
		histogram[best] = (histogram[best] ?? 0) + 1;
		if (best > max) max = best;
		if (best >= observed) atLeastObserved++;
	}
	return { trials, seed, histogram, max, atLeastObserved };
}

/** Every (attachment, twist) pair on the khipu with its count. */
export function attachTwistTally(
	khipu: Khipu,
): { attach: string; twist: string; count: number }[] {
	const m = new Map<string, number>();
	for (const c of khipu.cords) {
		const k = `${c.attach ?? "?"}|${c.twist ?? "?"}`;
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return [...m.entries()].map(([k, count]) => {
		const [attach, twist] = k.split("|");
		return { attach, twist, count };
	});
}

/** Distinct recorded colour strings of a khipu's cords. */
export function colourSet(khipu: Khipu): Set<string> {
	return new Set(khipu.cords.map((c) => c.color ?? "").filter(Boolean));
}

export function sharedColours(
	a: Khipu,
	b: Khipu,
): { shared: string[]; onlyA: string[]; onlyB: string[] } {
	const A = colourSet(a);
	const B = colourSet(b);
	return {
		shared: [...A].filter((c) => B.has(c)).sort(),
		onlyA: [...A].filter((c) => !B.has(c)).sort(),
		onlyB: [...B].filter((c) => !A.has(c)).sort(),
	};
}

/** A cord by name, for the reader figures. */
export function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

export interface PairGroup {
	index: number;
	n: number;
	colour: string;
	values: (number | null)[];
	first: number | null;
	/** range of the readable values after the first */
	restMin: number | null;
	restMax: number | null;
	total: number;
}

/** KH0027's groups: the first cord against the rest (the Aschers' observation). */
export function pairGroups(khipu: Khipu): PairGroup[] {
	return matrixRows(khipu).map((r) => {
		const rest = r.values.slice(1).filter((v): v is number => v !== null);
		return {
			index: r.index,
			n: r.n,
			colour: r.colour,
			values: r.values,
			first: r.values[0] ?? null,
			restMin: rest.length ? Math.min(...rest) : null,
			restMax: rest.length ? Math.max(...rest) : null,
			total: r.total,
		};
	});
}

/** Where the two main cords meet, from the recorded cord positions. */
export function joinGeometry(main: Khipu, pair: Khipu) {
	const p = (k: Khipu, name: string) =>
		k.cords.find((c) => c.name === name)?.pos ?? null;
	return {
		mainFirstPendant: p(main, "p1"),
		mainLength: main.primary.length,
		pairP2: p(pair, "p2"),
		pairP3: p(pair, "p3"),
		pairLength: pair.primary.length,
	};
}

/**
 * Figures from scripts/kh0028_analysis.py, sections 8 and 8b, which cannot be
 * recomputed in the page without loading every khipu. The screen treats the
 * recorder's cord groups as given, drops broken cords, and compares values
 * as exact fractions; near-proportional groups are not scored. Groups whose
 * values are all equal, or that hold one number (possibly repeated) among
 * zeros, are set aside before any comparison: such groups are trivially
 * proportional to each other and say nothing about a shape.
 */
export const CORPUS = {
	khipus: 684,
	/** groups of >= 5 fully readable pendants, scaled by their first value */
	minGroup: 5,
	/** khipus with two same-size groups whose readable values are exact non-trivial multiples */
	proportionalPairKhipus: ["KH0028"],
	proportionalPairs: 9,
	/** the single-pair result holds at these minimum group sizes … */
	pairStableAtSizes: [4, 5, 9],
	/** … and at three cords one other khipu has one pair (script run with MIN_GROUP 3) */
	pairAtSize3: {
		id: "KH0101",
		groups: [
			[4, 4, 2],
			[2, 2, 1],
		],
	},
	/** khipus with >= 3 groups sharing one normalised vector at different scales */
	ratioTemplateKhipus: ["KH0028"],
	/** the three-group result is the same at these minimum group sizes */
	stableAtSizes: [3, 4, 5, 9],
	/** khipus with >= 3 groups repeating one vector at the same scale (identical groups), at this minimum group size */
	sameScaleMinGroup: 3,
	sameScaleKhipus: [
		"KH0101",
		"KH0123",
		"KH0135",
		"KH0141",
		"KH0165",
		"KH0323",
		"KH0582",
	],
	/** complete (no broken cord) 9/10-cord groups anywhere fitting the template with rounding: all on KH0028 */
	templateGroups: 6,
	/** khipus with >= 3 complete 9/10-cord groups whose three lowest cords share one position triple */
	positional: [
		{
			id: "KH0517",
			alias: "UR278",
			where: "Incahuasi",
			size: 9,
			triple: [3, 8, 9],
			groups: 7,
		},
		{
			id: "KH0028",
			alias: "AS026B",
			where: null,
			size: 10,
			triple: [3, 9, 10],
			groups: 6,
		},
		{
			id: "KH0193",
			alias: null,
			where: null,
			size: 9,
			triple: [1, 2, 4],
			groups: 5,
		},
		{
			id: "KH0562",
			alias: null,
			where: null,
			size: 9,
			triple: [2, 4, 9],
			groups: 5,
		},
		{
			id: "KH0156",
			alias: null,
			where: null,
			size: 9,
			triple: [2, 3, 7],
			groups: 4,
		},
		{
			id: "KH0152",
			alias: null,
			where: null,
			size: 9,
			triple: [2, 4, 9],
			groups: 3,
		},
		{
			id: "KH0698",
			alias: null,
			where: null,
			size: 9,
			triple: [2, 4, 7],
			groups: 3,
		},
	],
	/** how pendants worth 8 and 4 are knotted, corpus-wide */
	knotForms: {
		eight: { total: 602, asEightL: 481, asFourFour: 57 },
		eightElsewhere: { total: 587, asFourFour: 42 },
		four: { total: 1471, asFourL: 1328, asTwoTwo: 64 },
	},
};

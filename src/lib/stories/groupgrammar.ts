import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for "Where the big number sits": the grammar of a cord group
 * read across the whole corpus. The corpus-wide screen (134 khipu × group-size
 * templates, the last-digit histogram, the fixed-constant khipus) is computed
 * by scripts/corpus_grammar_stats.py --json into
 * public/data/stories/group-grammar.json, because 684 khipu files cannot be
 * scanned in the browser. Everything about a single khipu is recomputed here
 * from its cords, so the page's examples can be checked against the screen.
 */

export const GRAMMAR_JSON = "stories/group-grammar.json";

/** One (khipu, group size) template from the corpus screen. */
export interface SlotCase {
	id: string;
	alias: string;
	provenance: string | null;
	/** cords per group */
	n: number;
	/** groups of that size with at least three knotted cords */
	groups: number;
	/** 1-based slot that most often carries the group maximum, and how often */
	maxSlot: number;
	maxCount: number;
	/** z against a uniform 1/n null */
	z: number;
	position: "first" | "middle" | "last";
	/** 1-based slot most often knotless, and how often (null if never blank) */
	blankSlot: number | null;
	blankCount: number;
}

export interface GroupGrammar {
	generated: string;
	nKhipus: number;
	screen: {
		minGroup: number;
		minGroups: number;
		minKnotted: number;
		zThreshold: number;
		blankShare: number;
		roundMinValues: number;
		constantShare: number;
	};
	cases: SlotCase[];
	/** every value >= 10 in the corpus by its last digit, 0..9 */
	lastDigits: { total: number; counts: number[] };
	/** per khipu with >= roundMinValues values >= 10: share ending in 0 */
	roundShare: {
		id: string;
		alias: string;
		provenance: string | null;
		n: number;
		round: number;
	}[];
	/** khipus where one value >= 11 sits on >= constantShare of knotted cords */
	constants: {
		id: string;
		alias: string;
		provenance: string | null;
		value: number;
		count: number;
		knotted: number;
	}[];
}

export const TABLE_ID = "KH0698";
export const PACHACAMAC_TABLE_ID = "KH0147";
export const BLANK_COLUMN_ID = "KH0082";
export const LADDER_ID = "KH0454";
export const SIXTIES_ID = "KH0457";
export const SCHEDULE_ID = "KH0141";
export const PER_HEAD_ID = "KH0157";

export const value = (c: Cord) => c.value ?? 0;

/** The screen's strong cases: one slot carries the maximum at z above the threshold. */
export function strongCases(g: GroupGrammar): SlotCase[] {
	return g.cases.filter((c) => c.z > g.screen.zThreshold);
}

export function positionCounts(cases: SlotCase[]) {
	const out = { first: 0, middle: 0, last: 0 };
	for (const c of cases) out[c.position] += 1;
	return out;
}

/** Templates with one slot knotless in at least `share` of their groups. */
export function blankColumnCases(g: GroupGrammar): SlotCase[] {
	return g.cases.filter(
		(c) =>
			c.blankSlot !== null && c.blankCount >= g.screen.blankShare * c.groups,
	);
}

/**
 * Two-sided binomial tail for the first-versus-last split: under any null
 * that treats a group's ends alike, first and last are equally likely to hold
 * the maximum, so P(last <= k of first+last) is the fair test.
 */
export function endsTail(first: number, last: number): number {
	const n = first + last;
	const k = Math.min(first, last);
	let p = 0;
	for (let i = 0; i <= k; i++) p += choose(n, i);
	return p / 2 ** n;
}

function choose(n: number, k: number): number {
	let r = 1;
	for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
	return r;
}

/** Groups of one khipu that are exactly `n` pendants long with >= `minKnotted` knotted. */
export function sameSizeGroups(
	khipu: Khipu,
	n: number,
	minKnotted = 3,
): { index: number; cords: Cord[] }[] {
	return pendantGroups(khipu)
		.map((cords, index) => ({ index, cords }))
		.filter(
			(g) =>
				g.cords.length === n &&
				g.cords.filter((c) => value(c) > 0).length >= minKnotted,
		);
}

/** 1-based slot of the largest value in a group (first on ties). */
export function slotOfMax(cords: Cord[]): number {
	let best = 0;
	cords.forEach((c, i) => {
		if (value(c) > value(cords[best])) best = i;
	});
	return best + 1;
}

export interface SlotProfile {
	n: number;
	groups: number;
	/** how many groups put their maximum in each 1-based slot */
	maxBySlot: number[];
	maxSlot: number;
	maxCount: number;
	z: number;
	/** how many groups leave each slot knotless */
	blankBySlot: number[];
	blankSlot: number | null;
	blankCount: number;
}

/** The corpus screen's statistic, recomputed for one khipu and group size. */
export function slotProfile(khipu: Khipu, n: number): SlotProfile {
	const gs = sameSizeGroups(khipu, n);
	const maxBySlot = Array<number>(n).fill(0);
	const blankBySlot = Array<number>(n).fill(0);
	for (const g of gs) {
		maxBySlot[slotOfMax(g.cords) - 1] += 1;
		g.cords.forEach((c, i) => {
			if (value(c) === 0) blankBySlot[i] += 1;
		});
	}
	const maxSlot = argmax(maxBySlot) + 1;
	const maxCount = maxBySlot[maxSlot - 1];
	const p = 1 / n;
	const z =
		gs.length > 0
			? (maxCount - gs.length * p) / Math.sqrt(gs.length * p * (1 - p))
			: 0;
	const blankSlotIdx = argmax(blankBySlot);
	const blankCount = blankBySlot[blankSlotIdx];
	return {
		n,
		groups: gs.length,
		maxBySlot,
		maxSlot,
		maxCount,
		z,
		blankBySlot,
		blankSlot: blankCount > 0 ? blankSlotIdx + 1 : null,
		blankCount,
	};
}

function argmax(xs: number[]): number {
	let b = 0;
	xs.forEach((x, i) => {
		if (x > xs[b]) b = i;
	});
	return b;
}

/** Values >= 10 on every cord of a khipu, binned by last digit. */
export function lastDigitHistogram(khipu: Khipu): {
	total: number;
	counts: number[];
} {
	const counts = Array<number>(10).fill(0);
	let total = 0;
	for (const c of khipu.cords) {
		const v = value(c);
		if (v >= 10) {
			counts[v % 10] += 1;
			total += 1;
		}
	}
	return { total, counts };
}

/** Share of a khipu's values >= 10 that end in 0. */
export function roundShare(khipu: Khipu): number {
	const h = lastDigitHistogram(khipu);
	return h.total ? h.counts[0] / h.total : 0;
}

/** Every distinct value on the khipu with its count, largest count first. */
export function valueCounts(khipu: Khipu): { value: number; count: number }[] {
	const m = new Map<number, number>();
	for (const c of khipu.cords) {
		const v = value(c);
		if (v > 0) m.set(v, (m.get(v) ?? 0) + 1);
	}
	return [...m.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value - b.value);
}

/** Knotted cords (any level) on the khipu. */
export function knottedCount(khipu: Khipu): number {
	return khipu.cords.filter((c) => value(c) > 0).length;
}

/** Does any knotted cord carry a multiple of `m`? */
export function multiplesOf(khipu: Khipu, m: number): number {
	return khipu.cords.filter((c) => value(c) > 0 && value(c) % m === 0).length;
}

/**
 * KH0454's ladder: each knotless white pendant carries a subsidiary that
 * reads 24 and, below it, a sub-subsidiary that reads 48. Returns, per
 * pendant, the pair of values found on that chain (null where absent).
 */
export interface LadderRung {
	pendant: Cord;
	sub: Cord | null;
	subSub: Cord | null;
}

export function ladderRungs(khipu: Khipu): LadderRung[] {
	const byName = new Map(khipu.cords.map((c) => [c.name, c]));
	const kids = (name: string) =>
		khipu.cords
			.filter((c) => c.parent === name)
			.sort((a, b) => a.ordinal - b.ordinal);
	return khipu.cords
		.filter((c) => c.kind === "pendant")
		.sort((a, b) => a.ordinal - b.ordinal)
		.map((pendant) => {
			const subs = kids(pendant.name);
			const sub = subs.find((s) => value(s) > 0) ?? null;
			const subSub = sub
				? (kids(sub.name).find((s) => value(s) > 0) ?? null)
				: null;
			return { pendant: byName.get(pendant.name) ?? pendant, sub, subSub };
		});
}

/** The rungs that read exactly (a, b) on subsidiary and sub-subsidiary. */
export function rungsReading(rungs: LadderRung[], a: number, b: number) {
	return rungs.filter(
		(r) => r.sub && value(r.sub) === a && r.subSub && value(r.subSub) === b,
	);
}

/** Rows for a value matrix: same-size groups as arrays of values. */
export function matrixRows(
	khipu: Khipu,
	n: number,
	minKnotted = 3,
): { index: number; values: number[]; cords: Cord[] }[] {
	return sameSizeGroups(khipu, n, minKnotted).map((g) => ({
		index: g.index,
		values: g.cords.map(value),
		cords: g.cords,
	}));
}

/** Column-wise count of a value across matrix rows (for the schedule test). */
export function columnMode(rows: { values: number[] }[], col: number) {
	const m = new Map<number, number>();
	for (const r of rows) {
		const v = r.values[col];
		m.set(v, (m.get(v) ?? 0) + 1);
	}
	let best = 0;
	let bestN = 0;
	for (const [v, c] of m)
		if (c > bestN) {
			best = v;
			bestN = c;
		}
	return { value: best, count: bestN };
}

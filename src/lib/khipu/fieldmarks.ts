import type { Cord, CordGroup, KhipuLike } from "./types";

/**
 * Fieldmarks: structure computed from a khipu's record rather than written on
 * it. The first is the Khipu Field Guide's "coloured pendant sum" — a cord
 * whose value is the sum of a run of consecutive same-coloured cords elsewhere
 * on the khipu, one of the summation relationships Marcia Ascher noted in her
 * databooks. The search here reproduces the Field Guide's own lists — checked
 * cord for cord on fifteen khipus, KH0082's 283 sums included, by
 * scripts/check_sums.mts.
 */

export type Hand = "R" | "L";

export interface CordSum {
	/** the sum cord */
	sum: string;
	value: number;
	/** the colour the run was found in (a cord's own code, so "W:MB" and "W" are different colours) */
	color: string;
	/** R: summands lie to the sum cord's right; L: to its left */
	hand: Hand;
	/** the summand cords, in khipu order */
	summands: string[];
	/** positions in the level-1 sequence (levelOneCords), for drawing */
	sumIndex: number;
	summandIndices: number[];
}

export interface SumSearch {
	/** summands must share the sum cord's colour */
	sameColor: boolean;
	minSummands: number;
	/** sum cords below this are ignored: 1 = 1 + 0 is not a sum */
	minValue: number;
}

/** The Field Guide's parameters for its coloured pendant sums. */
export const COLORED_PENDANT_SUM: SumSearch = {
	sameColor: true,
	minSummands: 3,
	minValue: 11,
};

/** Level-1 cords — pendants and top cords alike — in khipu order. */
export function levelOneCords(khipu: KhipuLike): Cord[] {
	return khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => {
			const ga = a.group ?? Number.POSITIVE_INFINITY;
			const gb = b.group ?? Number.POSITIVE_INFINITY;
			return ga - gb || a.ordinal - b.ordinal;
		});
}

/**
 * The colour a cord is searched under: its Ascher string, except that a
 * spliced cord (colour changes along its length) counts as its longest stretch,
 * so `AB(0.0-8.0)/YB(8.0-35.0)` is a YB cord.
 */
export function colorKey(cord: Cord): string | null {
	const segs = cord.colorParsed;
	if (segs && segs.length > 1 && segs.every((s) => s.range)) {
		const longest = segs.reduce((best, s) =>
			(s.range as [number, number])[1] - (s.range as [number, number])[0] >
			(best.range as [number, number])[1] - (best.range as [number, number])[0]
				? s
				: best,
		);
		return longest.codes
			.map((code, i) =>
				i === 0 ? code : `${longest.ops?.[i - 1] ?? ":"}${code}`,
			)
			.join("");
	}
	return cord.color;
}

/** The Field Guide's group-relative name for a level-1 cord: p10 in group 3 is g3p2. */
export function groupName(cord: Cord, groups: CordGroup[]): string {
	if (cord.group == null) return cord.name;
	const g = groups[cord.group];
	if (!g) return cord.name;
	return `g${cord.group + 1}p${cord.ordinal - g.first + 1}`;
}

/**
 * Find every (sum cord, hand) pair. Cords without a value drop out of the
 * sequence first, so a run may step over them. Where more than one run fits,
 * the one with the fewest summands is kept, the leftmost on a tie.
 */
export function pendantSums(
	khipu: KhipuLike,
	search: SumSearch = COLORED_PENDANT_SUM,
): CordSum[] {
	const seq = levelOneCords(khipu);
	const buckets = new Map<string, number[]>();
	seq.forEach((c, i) => {
		if (!c.value || c.value <= 0) return;
		const key = search.sameColor ? (colorKey(c) ?? "") : "";
		let b = buckets.get(key);
		if (!b) {
			b = [];
			buckets.set(key, b);
		}
		b.push(i);
	});

	const out: CordSum[] = [];
	for (const [key, idx] of buckets) {
		const n = idx.length;
		const vals = idx.map((i) => seq[i].value as number);
		// values are positive, so prefix sums are strictly increasing and each
		// (start, total) pair names at most one run end
		const prefix = [0];
		for (const v of vals) prefix.push(prefix[prefix.length - 1] + v);
		const endAt = new Map<number, number>();
		prefix.forEach((p, i) => {
			endAt.set(p, i);
		});

		for (let i = 0; i < n; i++) {
			const value = vals[i];
			if (value < search.minValue) continue;
			let bestR: [number, number] | null = null;
			let bestL: [number, number] | null = null;
			for (let a = 0; a < n; a++) {
				const end = endAt.get(prefix[a] + value);
				if (end === undefined) continue;
				const b = end - 1;
				const len = b - a + 1;
				if (len < search.minSummands) continue;
				if (a > i) {
					if (!bestR || len < bestR[1] - bestR[0] + 1) bestR = [a, b];
				} else if (b < i) {
					if (!bestL || len < bestL[1] - bestL[0] + 1) bestL = [a, b];
				}
			}
			for (const [hand, run] of [
				["R", bestR],
				["L", bestL],
			] as const) {
				if (!run) continue;
				const members = idx.slice(run[0], run[1] + 1);
				out.push({
					sum: seq[idx[i]].name,
					value,
					color: key,
					hand,
					summands: members.map((j) => seq[j].name),
					sumIndex: idx[i],
					summandIndices: members,
				});
			}
		}
	}
	return out.sort(
		(a, b) => a.sumIndex - b.sumIndex || (a.hand === "R" ? -1 : 1),
	);
}

export interface SumStats {
	n: number;
	maxSummands: number;
	min: number;
	mean: number;
	max: number;
}

export function sumStats(sums: CordSum[]): SumStats | null {
	if (sums.length === 0) return null;
	const values = sums.map((s) => s.value);
	return {
		n: sums.length,
		maxSummands: Math.max(...sums.map((s) => s.summands.length)),
		min: Math.min(...values),
		mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
		max: Math.max(...values),
	};
}

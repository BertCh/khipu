import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for the "tied in two cities" story: AS084 (KH0097, Musée du
 * quai Branly 71.1930.19.470, Paris) against HP055 (KH0586, MNAAHP 29934,
 * Lima).
 *
 * The Aschers read the Paris khipu as 26 groups in two parts, groups 1–15
 * and 16–26. Pereyra's Lima khipu has fifteen groups of nine or more cords
 * with short brown groups between them. Laid side by side, Paris part 1 and
 * the fifteen Lima units open with the same four-digit total, unit for
 * unit, and carry the same template of fields under it in different colours.
 * Everything here is computed from the recorded cords; the constants are the
 * Aschers' part boundary and the corpus figures from the screening scripts.
 *
 * A second pair is used as a contrast: AS107 (KH0121) and UR237 (KH0473), one
 * physical object recorded from opposite ends. (The KFG's AS119, KH0133, carries
 * a copy of AS107's cords; it is not a third record.)
 */

export const PARIS_ID = "KH0097";
export const LIMA_ID = "KH0586";
export const OBJECT_ASCHER_ID = "KH0121";
export const OBJECT_URTON_ID = "KH0473";

/** The Aschers' part 1 of AS084: its first fifteen groups (0-based, inclusive). */
export const PARIS_PART_1 = { from: 0, to: 14 } as const;

/** A Lima group of this many cords or more is a unit; the rest are separators. */
export const LIMA_UNIT_MIN = 9;

/**
 * Corpus figures from the screening scripts (not computable from two khipus).
 * scripts/paris_lima_pair.py: 2,000 random pairings of the fifteen Lima units
 * with the fifteen Paris units, counting Paris non-leading values that recur
 * in order in the paired Lima unit.
 */
export const RANDOM_PAIRING = {
	trials: 2000,
	median: 66,
	p99: 77,
	max: 81,
} as const;

/**
 * The corpus scan of 2026-09-19 that found the pair: five consecutive
 * pendant values, at least four non-zero and four distinct, forward and
 * reversed, over all 684 khipus. The Paris/Lima pair ranked first among pairs
 * not already known to be one object or a published match. Reproduce with
 * scripts/shared_passages.py.
 */
export const PAIR_SCAN = { runs: 9, values: 51, window: 5 } as const;

export type LeadVerdict = "exact" | "register" | "different";

export const LEAD_TEXT: Record<LeadVerdict, string> = {
	exact: "same",
	register: "a register lost",
	different: "different",
};

/** Two leading totals: identical, the same but for a lost thousand or hundred, or not. */
export function leadVerdict(a: number | null, b: number | null): LeadVerdict {
	if (a == null || b == null) return "different";
	if (a === b) return "exact";
	if (a % 1000 === b % 1000 || Math.abs(a - b) % 100 === 0) return "register";
	return "different";
}

export function parisUnits(paris: Khipu): Cord[][] {
	return pendantGroups(paris).slice(PARIS_PART_1.from, PARIS_PART_1.to + 1);
}

/** The Aschers' part 2: every later group with more than one cord. */
export function parisPart2(paris: Khipu): Cord[][] {
	return pendantGroups(paris)
		.slice(PARIS_PART_1.to + 1)
		.filter((g) => g.length > 1);
}

export function limaUnits(lima: Khipu): Cord[][] {
	return pendantGroups(lima).filter((g) => g.length >= LIMA_UNIT_MIN);
}

export interface Separator {
	/** 0-based index of the unit this short group follows (-1: before the first) */
	after: number;
	cords: Cord[];
}

/** Lima's short brown groups, each tied to the unit it follows. */
export function limaSeparators(lima: Khipu): Separator[] {
	const out: Separator[] = [];
	let after = -1;
	for (const g of pendantGroups(lima)) {
		if (g.length >= LIMA_UNIT_MIN) after++;
		else out.push({ after, cords: g });
	}
	return out;
}

/**
 * Longest common subsequence of two value lists, as index pairs. Zeros never
 * match: a blank field is not evidence that two records agree.
 */
export function lcsPairs(x: number[], y: number[]): [number, number][] {
	const n = x.length;
	const m = y.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			dp[i + 1][j + 1] =
				x[i] === y[j] && x[i] !== 0
					? dp[i][j] + 1
					: Math.max(dp[i][j + 1], dp[i + 1][j]);
		}
	}
	const pairs: [number, number][] = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		if (x[i - 1] === y[j - 1] && x[i - 1] !== 0) {
			pairs.push([i - 1, j - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
		else j--;
	}
	return pairs.reverse();
}

export interface UnitRow {
	/** 0-based unit */
	unit: number;
	a: Cord[];
	b: Cord[];
	lead: { a: number | null; b: number | null; verdict: LeadVerdict };
	/** cords after the leading one, matched in order by value */
	pairs: [number, number][];
	/** Paris non-leading values that carry a knot */
	knotted: number;
}

const val = (c: Cord | undefined) => c?.value ?? 0;

/** Every Paris unit against the Lima unit in the same position. */
export function unitRows(paris: Khipu, lima: Khipu): UnitRow[] {
	const pa = parisUnits(paris);
	const li = limaUnits(lima);
	const n = Math.min(pa.length, li.length);
	const rows: UnitRow[] = [];
	for (let u = 0; u < n; u++) {
		const a = pa[u];
		const b = li[u];
		const xa = a.slice(1).map(val);
		const xb = b.slice(1).map(val);
		rows.push({
			unit: u,
			a,
			b,
			lead: {
				a: a[0]?.value ?? null,
				b: b[0]?.value ?? null,
				verdict: leadVerdict(a[0]?.value ?? null, b[0]?.value ?? null),
			},
			pairs: lcsPairs(xa, xb).map(([i, j]) => [i + 1, j + 1]),
			knotted: xa.filter((v) => v > 0).length,
		});
	}
	return rows;
}

export interface PairStats {
	units: number;
	exact: number;
	register: number;
	different: number;
	/** Paris non-leading knotted values that recur in order on Lima */
	matched: number;
	knotted: number;
}

export function pairStats(rows: UnitRow[]): PairStats {
	return {
		units: rows.length,
		exact: rows.filter((r) => r.lead.verdict === "exact").length,
		register: rows.filter((r) => r.lead.verdict === "register").length,
		different: rows.filter((r) => r.lead.verdict === "different").length,
		matched: rows.reduce((s, r) => s + r.pairs.length, 0),
		knotted: rows.reduce((s, r) => s + r.knotted, 0),
	};
}

export interface FieldColour {
	value: number;
	/** how many units pair a Paris cord of this value with a Lima cord of the same value */
	units: number;
	paris: { color: string; n: number }[];
	lima: { color: string; n: number }[];
}

function tally(colors: string[]): { color: string; n: number }[] {
	const m = new Map<string, number>();
	for (const c of colors) m.set(c, (m.get(c) ?? 0) + 1);
	return [...m.entries()]
		.map(([color, n]) => ({ color, n }))
		.sort((p, q) => q.n - p.n);
}

/**
 * The template values the two khipus share, and the colours each recorder
 * gave them — read off the matched cord pairs, so a field is only counted
 * where both khipus carry it in the same unit.
 */
export function fieldColours(rows: UnitRow[], min = 4): FieldColour[] {
	const by = new Map<number, { paris: string[]; lima: string[] }>();
	for (const r of rows) {
		for (const [i, j] of r.pairs) {
			const v = val(r.a[i]);
			if (!by.has(v)) by.set(v, { paris: [], lima: [] });
			const e = by.get(v);
			e?.paris.push(r.a[i].color ?? "?");
			e?.lima.push(r.b[j].color ?? "?");
		}
	}
	return [...by.entries()]
		.filter(([, e]) => e.paris.length >= min)
		.map(([value, e]) => ({
			value,
			units: e.paris.length,
			paris: tally(e.paris),
			lima: tally(e.lima),
		}))
		.sort((p, q) => q.units - p.units || p.value - q.value);
}

export interface AlignedCell {
	a: number | null;
	b: number | null;
}

/**
 * One record against the reverse of another, value for value, with a gap
 * wherever only one of them has a cord. Zeros count here: a blank cord on a
 * duplicate transcription is still a cord.
 */
export function alignReversed(a: Khipu, b: Khipu): AlignedCell[] {
	const x = a.cords.filter((c) => c.level === 1).map(val);
	const y = b.cords
		.filter((c) => c.level === 1)
		.map(val)
		.reverse();
	const n = x.length;
	const m = y.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			dp[i + 1][j + 1] =
				x[i] === y[j] ? dp[i][j] + 1 : Math.max(dp[i][j + 1], dp[i + 1][j]);
		}
	}
	const cells: AlignedCell[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && x[i - 1] === y[j - 1]) {
			cells.push({ a: x[i - 1], b: y[j - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			cells.push({ a: null, b: y[j - 1] });
			j--;
		} else {
			cells.push({ a: x[i - 1], b: null });
			i--;
		}
	}
	return cells.reverse();
}

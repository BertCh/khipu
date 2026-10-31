/**
 * "What chance can do": a re-check of Medrano & Khosla (2024) against
 * shuffled khipus. Corpus figures come from public/data/stories/chance.json
 * (scripts/build_chance.py); the interactive demo re-runs relation 1 live on
 * a khipu's own cords, with the same rule as the Python port
 * (scripts/mk/mk_sig_common.py, rel1), so a reader can shuffle a khipu and
 * count again.
 */
import type { Khipu } from "#/lib/khipu/types";

export const CHANCE_JSON = "stories/chance.json";

/** the most sum-rich khipu in the paper's count, and a khipu with real excess */
export const DEMO_IDS = ["KH0698", "KH0081"] as const;
export type DemoId = (typeof DEMO_IDS)[number];

export const REJOIN_ID = "KH0468";

export interface RelationCount {
	obs: number;
	null: number;
	sd: number;
	khipus: number;
	nullKhipus: number;
}

export type RelationKey =
	| "r1"
	| "r1adj"
	| "r2"
	| "r3"
	| "r4"
	| "r5"
	| "r7"
	| "r9";

/** [id, pendants, log10 mean nonzero value, raw sums, expected, z, p] */
export type KhipuScore = [
	string,
	number,
	number,
	number,
	number,
	number,
	number,
];

export interface ChanceData {
	R: number;
	nKhipus: number;
	relations: Record<RelationKey, RelationCount>;
	anyRelation: { obs: number; null: number; of: number };
	khipus: KhipuScore[];
	magnitude: {
		label: string;
		khipus: number;
		obs: number;
		null: number;
		sig: number;
	}[];
	handedness: {
		right: number;
		nullRight: number;
		nullSd: number;
		n: number;
		byGradient: {
			key: "decreasing" | "flat" | "increasing";
			khipus: number;
			sums: number;
			right: number;
		}[];
	};
	demo: Record<DemoId, { obs: number; null: number[] }>;
}

/** Relations in reading order, with their names and the paper's Table 1 khipu counts (of 650). */
export const RELATIONS: {
	key: RelationKey;
	name: string;
	what: string;
	paper?: number;
}[] = [
	{
		key: "r1",
		name: "1 · Pendant–pendant sums",
		what: "a pendant equals a run of neighbouring pendants",
		paper: 427,
	},
	{
		key: "r2",
		name: "2 · Sums by colour",
		what: "a pendant equals same-coloured pendants nearby",
		paper: 261,
	},
	{
		key: "r3",
		name: "3 · Sums by index",
		what: "a pendant equals the same slot in nearby groups",
		paper: 228,
	},
	{
		key: "r5",
		name: "5 · Subsidiary–pendant sums",
		what: "a subsidiary equals a run of pendants",
		paper: 117,
	},
	{
		key: "r4",
		name: "4 · Pendant–subsidiary difference",
		what: "a neighbour equals pendant minus its subsidiaries",
		paper: 145,
	},
	{
		key: "r7",
		name: "7 · Cluster sum bands",
		what: "a group's two halves have equal sums",
		paper: 87,
	},
	{
		key: "r1adj",
		name: "Sum beside its parts",
		what: "relation 1 where the run starts on the next cord",
	},
	{
		key: "r9",
		name: "9 · Top-cord sums",
		what: "a top cord totals (or doubles) a neighbouring group",
		paper: 29,
	},
];

/**
 * Findings from the other re-check scripts, kept as constants with their
 * script names (their inputs are the 2024 Zenodo release or long null runs).
 */
export const FIXED = {
	/** mk_sig_whiteclusters.py — groups whose first pendant is white */
	white: {
		sumClusters: 0.4,
		allGroups: 0.341,
		nonSumSameKhipus: 0.367,
		pWithinKhipu: 0.0005,
		pWithinKhipuAndValue: 0.078,
		paperSum: 0.41,
		paperAll: 0.32,
		flankSum: 0.885,
		flankNonSum: 0.869,
	},
	/** mk_join_power.py — intact khipus cut at the middle group boundary */
	joinPower: { cuts: 197, detected: 0 },
	/** mk_join_kh0468.py — the paper's rejoined Berlin khipu */
	kh0468: {
		ab: 49,
		ba: 62,
		best: 63,
		partnersMean: 53,
		partnersP: 0.21,
		shuffleMean: 63.5,
		shuffleP: 0.6,
	},
	/** mk_type_pairs.py — linked pairs where one khipu restates another */
	hierarchy: { upperLarger: 10, pairs: 12 },
	/** mk_type_analyse.py — khipus with top cords */
	topBanded: { withTop: 0.65, rest: 0.37, n: 52 },
	/** scripts/deep/tree_grouptotals.py (Totals that travel) */
	firstCord: { obs: 91, null: 7 },
	/** mk_port_compare.py — khipus whose KFG records changed since 2024 */
	port: { unchanged: 286, changed: 364 },
} as const;

// ---------------------------------------------------------------- the demo

/** pendant values in primary-cord order (group, then ordinal), top cords excluded */
export function pendantValues(k: Khipu): number[] {
	return k.cords
		.filter((c) => c.level === 1 && c.kind !== "top")
		.sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || a.ordinal - b.ordinal)
		.map((c) => (c.value && c.value > 0 ? Math.round(c.value) : 0));
}

export interface PendantSum {
	/** index of the sum cord */
	at: number;
	/** first and last summand, inclusive */
	from: number;
	to: number;
	right: boolean;
}

/** first index e in the non-decreasing array `a` with a[e] >= x */
function lowerBound(a: number[], x: number): number {
	let lo = 0;
	let hi = a.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (a[mid] < x) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * One side of Medrano & Khosla's pendant-pendant search: for each value > 10,
 * the first run of cords to its right (starting on a nonzero cord) that adds
 * up to it; kept if the run has at least two cords and fewer cords than the
 * value. Returns sum index → [start, end) as in the Python port.
 */
function oneSide(v: number[]): Map<number, [number, number]> {
	const n = v.length;
	const pf = [0];
	for (const x of v) pf.push(pf[pf.length - 1] + x);
	const nz: number[] = [];
	v.forEach((x, i) => {
		if (x > 0) nz.push(i);
	});
	const out = new Map<number, [number, number]>();
	for (let i = 0; i < n - 2; i++) {
		const t = v[i];
		if (t <= 10) continue;
		for (const s of nz) {
			if (s <= i) continue;
			const target = pf[s] + t;
			const e = lowerBound(pf, target);
			if (e <= n && pf[e] === target) {
				if (e - s >= 2 && t > e - s) out.set(i, [s, e]);
				break;
			}
		}
	}
	return out;
}

/** Relation 1, both directions. */
export function pendantSums(v: number[]): PendantSum[] {
	const n = v.length;
	if (n < 3) return [];
	const out: PendantSum[] = [];
	for (const [i, [s, e]] of oneSide(v))
		out.push({ at: i, from: s, to: e - 1, right: true });
	const rev = [...v].reverse();
	for (const [ri, [rs, re]] of oneSide(rev))
		out.push({ at: n - ri - 1, from: n - re, to: n - rs - 1, right: false });
	return out;
}

/** small seeded PRNG so a given shuffle number is reproducible */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffled<T>(xs: T[], seed: number): T[] {
	const rnd = mulberry32(seed);
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** share of `null` at or above `obs` (upper tail, with the +1 correction) */
export function upperP(obs: number, nulls: number[]): number {
	return (1 + nulls.filter((x) => x >= obs).length) / (nulls.length + 1);
}

export function lowerP(obs: number, nulls: number[]): number {
	return (1 + nulls.filter((x) => x <= obs).length) / (nulls.length + 1);
}

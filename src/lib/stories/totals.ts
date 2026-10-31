import type { Cord, Khipu } from "#/lib/khipu/types";
import { compareRuns, type FieldComparison } from "#/lib/stories/crosslinks";

/**
 * "Totals that travel" — the links the September 2026 deep analysis added
 * (scripts/deep/*). Every table on the page is derived here from the khipu
 * JSON so it moves with the data; the corpus-level counts in GRAMMAR are the
 * outputs of the named scripts and are not recomputed in the browser.
 */

export const LEDGER_TOTALS_ID = "KH0517"; // UR278, Inkawasi 13833
export const LEDGER_HEADS_ID = "KH0502"; // UR266, Inkawasi 13829
export const LEDGER_MIRROR_ID = "KH0514"; // UR275, curated mirror of UR266
export const SERIES_THIRD_ID = "KH0506"; // UR269
export const SECOND_TOTALS_ID = "KH0507"; // UR270
export const SECOND_HEADS_ID = "KH0513"; // UR274B
export const SECOND_LEADERS_ID = "KH0511"; // UR273B, same leaders as UR274B
export const RELAID_SOURCE_ID = "KH0284"; // UR053B
export const RELAID_COPY_ID = "KH0285"; // UR053C
export const PASSAGE_IDS = ["KH0242", "KH0245", "KH0257"] as const;
export const BERLIN_A_ID = "KH0165"; // AS149
export const BERLIN_B_ID = "KH0196"; // AS179
export const TRIAD_A_ID = "KH0152"; // AS136
export const TRIAD_B_ID = "KH0432"; // UR194
export const SCALED_A_ID = "KH0521";
export const SCALED_B_ID = "KH0525";

export const TOTALS_IDS = [
	LEDGER_TOTALS_ID,
	LEDGER_HEADS_ID,
	LEDGER_MIRROR_ID,
	SERIES_THIRD_ID,
	SECOND_TOTALS_ID,
	SECOND_HEADS_ID,
	SECOND_LEADERS_ID,
	RELAID_SOURCE_ID,
	RELAID_COPY_ID,
	...PASSAGE_IDS,
	BERLIN_A_ID,
	BERLIN_B_ID,
	TRIAD_A_ID,
	TRIAD_B_ID,
	SCALED_A_ID,
	SCALED_B_ID,
];

const v = (c: Cord) => c.value ?? 0;

function pendants(k: Khipu): Cord[] {
	return k.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
}

function byGroup(k: Khipu): Map<number, Cord[]> {
	const m = new Map<number, Cord[]>();
	for (const c of pendants(k)) {
		const key = c.group ?? 0;
		const g = m.get(key) ?? [];
		g.push(c);
		m.set(key, g);
	}
	return m;
}

export interface TotalToHead {
	/** 1-based group on the totals khipu */
	group: number;
	cords: number;
	total: number;
	/** the matching head on the other khipu, if any */
	head?: { name: string; group: number; value: number };
}

/**
 * Sum each group of `totals`, then walk the other khipu's group heads (first
 * non-blank cord of each group) in order and take the next head equal to the
 * total. Totals under 1000 are skipped: they are too common to count.
 */
export function totalsToHeads(
	totals: Khipu,
	heads: Khipu,
	min = 1000,
): TotalToHead[] {
	const headList: { name: string; group: number; value: number }[] = [];
	for (const [g, cords] of byGroup(heads)) {
		const first = cords.find((c) => v(c) > 0);
		if (first)
			headList.push({ name: first.name, group: g + 1, value: v(first) });
	}
	let from = 0;
	const out: TotalToHead[] = [];
	for (const [g, cords] of byGroup(totals)) {
		const total = cords.reduce((s, c) => s + v(c), 0);
		const row: TotalToHead = { group: g + 1, cords: cords.length, total };
		if (total >= min) {
			const j = headList.findIndex((h, i) => i >= from && h.value === total);
			if (j >= 0) {
				row.head = headList[j];
				from = j + 1;
			}
		}
		out.push(row);
	}
	return out;
}

/** two numbers of one length that differ in a single decimal digit (3095 / 3096, 2533 / 2633) */
export function oneDigitApart(a: number, b: number): boolean {
	const x = String(a);
	const y = String(b);
	if (x.length !== y.length) return false;
	let d = 0;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
	return d === 1;
}

/** one pendant in level-1 order: its 0-based group and value */
export interface Pendant {
	name: string;
	group: number;
	value: number;
}

export function pendantList(k: Khipu): Pendant[] {
	return pendants(k).map((c) => ({
		name: c.name,
		group: c.group ?? 0,
		value: v(c),
	}));
}

export interface CascadeGroup {
	/** 1-based group on the totals khipu */
	group: number;
	/** its level-1 cords, [from, to) */
	from: number;
	to: number;
	total: number;
	/** level-1 index of the head it equals on the other khipu */
	head?: number;
	/** an unmatched total one digit away from a head that sits, in order,
	 * between the neighbouring matches */
	near?: { cord: number; value: number };
}

/**
 * totalsToHeads with cord positions, for drawing: the same greedy in-order
 * walk, plus the near misses (one digit apart, and in order) when asked.
 */
export function totalsCascade(
	totals: Khipu,
	heads: Khipu,
	{ min = 1000, near = false }: { min?: number; near?: boolean } = {},
): CascadeGroup[] {
	const hp = pendantList(heads);
	const headList: { cord: number; value: number }[] = [];
	const seen = new Set<number>();
	hp.forEach((p, i) => {
		if (seen.has(p.group) || p.value <= 0) return;
		seen.add(p.group);
		headList.push({ cord: i, value: p.value });
	});
	const out: (CascadeGroup & { j?: number })[] = [];
	let from = 0;
	let at = 0;
	for (const [g, cords] of byGroup(totals)) {
		const total = cords.reduce((s, c) => s + v(c), 0);
		const row: CascadeGroup & { j?: number } = {
			group: g + 1,
			from: at,
			to: at + cords.length,
			total,
		};
		at += cords.length;
		if (total >= min) {
			const j = headList.findIndex((h, i) => i >= from && h.value === total);
			if (j >= 0) {
				row.head = headList[j].cord;
				row.j = j;
				from = j + 1;
			}
		}
		out.push(row);
	}
	if (near)
		out.forEach((r, i) => {
			if (r.total < min || r.j != null) return;
			const lo = Math.max(
				-1,
				...out.slice(0, i).map((x) => (x.j == null ? -1 : x.j)),
			);
			const hi = Math.min(
				headList.length,
				...out.slice(i + 1).map((x) => (x.j == null ? headList.length : x.j)),
			);
			const h = headList
				.slice(lo + 1, hi)
				.find((c) => oneDigitApart(c.value, r.total));
			if (h) r.near = { cord: h.cord, value: h.value };
		});
	return out.map(({ j: _j, ...r }) => r);
}

/** one past the last cord of the group holding level-1 cord `i` */
export function groupEnd(k: Khipu, i: number): number {
	const ps = pendantList(k);
	const g = ps[i]?.group;
	let j = i;
	while (j < ps.length && ps[j].group === g) j++;
	return j;
}

/** the cords of one group, values only */
export function groupValues(k: Khipu, group1: number): number[] {
	return (byGroup(k).get(group1 - 1) ?? []).map(v);
}

/** cords in stored order (pendants followed by their subsidiaries), by name range */
export function flatRange(k: Khipu, from: string, to: string): Cord[] {
	const i = k.cords.findIndex((c) => c.name === from);
	const j = k.cords.findIndex((c) => c.name === to);
	return i < 0 || j < 0 ? [] : k.cords.slice(i, j + 1);
}

export interface RelaidRow extends FieldComparison {
	source: string;
	copy: string;
	wasSubsidiary: boolean;
}

/**
 * KH0284 p1…p32s1 read in stored order (each pendant followed by its
 * subsidiary) against KH0285's pendants p11…p58.
 */
export function relaid(source: Khipu, copy: Khipu): RelaidRow[] {
	const a = flatRange(source, "p1", "p32s1");
	const b = flatRange(copy, "p11", "p58").filter((c) => c.level === 1);
	const rows = compareRuns(a.map(v), b.map(v));
	return rows.map((r, i) => ({
		...r,
		source: a[i]?.name ?? "—",
		copy: b[i]?.name ?? "—",
		wasSubsidiary: (a[i]?.level ?? 1) > 1,
	}));
}

export interface PassageRow {
	id: string;
	label: string;
	values: number[];
}

/** the passage ending 20 · 61 · 20 as it sits on each of the three khipus */
export function sharedPassage(ks: Record<string, Khipu>): PassageRow[] {
	const [a, b, c] = PASSAGE_IDS;
	// reverse pendant by pendant, each subsidiary kept after its pendant
	const blocks: Cord[][] = [];
	for (const cord of flatRange(ks[b], "p119", "p143")) {
		if (cord.level === 1 || blocks.length === 0) blocks.push([cord]);
		else blocks[blocks.length - 1].push(cord);
	}
	const r245 = blocks.reverse().flat().map(v);
	return [
		{
			id: a,
			label: "p277–p291, then p292’s nine subsidiaries",
			values: flatRange(ks[a], "p277", "p292s9")
				.filter((x) => x.name !== "p292")
				.map(v),
		},
		{ id: b, label: "p143 back to p119 (read in reverse)", values: r245 },
		{ id: c, label: "p18–p36", values: flatRange(ks[c], "p18", "p36").map(v) },
	];
}

/** values of named cords, for short side-by-side rows */
export function named(k: Khipu, names: string[]): number[] {
	return names.map((n) => v(k.cords.find((c) => c.name === n) ?? ({} as Cord)));
}

/** first group of `k` whose values start with `lead`, 1-based, or 0 */
export function groupStarting(k: Khipu, lead: number[]): number {
	for (const [g, cords] of byGroup(k)) {
		const vals = cords.map(v);
		if (lead.every((x, i) => vals[i] === x)) return g + 1;
	}
	return 0;
}

/**
 * Corpus-level counts from the deep analysis, each re-derived by an
 * independent sceptic with its own null. Source script in `script`.
 */
export const GRAMMAR = [
	{
		claim: "A group’s total sits on its first cord",
		observed: "91",
		expected: "≈ 7",
		note: "Inkawasi 73 against 0.34; elsewhere 18 against 6.8 ± 2.4. Last position 8 (null 7.2).",
		level: "firm" as const,
		script: "scripts/deep/tree_grouptotals.py",
	},
	{
		claim: "A top cord totals the group before it",
		observed: "47",
		expected: "8.3",
		note: "The group after gives 15 against 7.0. A further 42 top cords miss by ±1 or a register (19.6 expected) — about half may be recording slips. Under their own rule Medrano & Khosla (2024) count 75 sum and 21 double-sum top-cord clusters on 23 khipus in the current data (86 and 21 on 29 in their paper), without asking which group is summed. Top-cord khipus lean colour-banded, 65% against 41%.",
		level: "firm" as const,
		script: "scripts/deep/tree_topcords.py",
	},
	{
		claim: "Totals sit to the left of their parts",
		observed: "54%",
		expected: "50%",
		note: "Share of pendant sums whose sum cord lies left of its summands, against a value shuffle. Real, but explained by magnitude: groups get smaller along the cord (59% on khipus that decrease, 46% on ones that increase). First noted by Medrano & Khosla 2024.",
		level: "firm" as const,
		script: "scripts/mk/mk_sig_gradient.py",
	},
	{
		claim: "White pendants carry the larger numbers",
		observed: "z 6.7",
		expected: "0",
		note: "171 khipus to 121; holds on intact cords and within every recorder.",
		level: "firm" as const,
		script: "scripts/deep/vocab_d_colour.py",
	},
	{
		claim: "Colour tracks slot more than size",
		observed: "44%",
		expected: "—",
		note: "Colour follows position in the group in about 44% of khipus; it adds magnitude beyond slot and group in 20 of 346 (6%).",
		level: "likely" as const,
		script: "scripts/deep/vocab_d_colour.py",
	},
	{
		claim: "Round numbers on intact cords",
		observed: "3× / 10×",
		expected: "1×",
		note: "Multiples of 10 and of 100 on term = K cords; a units digit of 9 is avoided (0.65–0.7×). The glut of 1000 and 10000 is broken cords: 38 of the 52 tokens of 1000.",
		level: "firm" as const,
		script: "scripts/deep/vocab_a_values.py",
	},
	{
		claim: "Round group totals",
		observed: "41",
		expected: "29",
		note: "Composed totals that are exact hundreds, p ≈ 0.02. Whole-khipu totals are not round beyond chance.",
		level: "open" as const,
		script: "scripts/deep/vocab_c_decimal.py",
	},
];

/** what the deep analysis looked for and did not find */
export const EMPTY = [
	"No broad network of arithmetic between khipus: sums of one khipu equal cords of another at 0.95× the rate of shuffled values. The only informative ordered chains are four at Inkawasi.",
	"No scaled, constant-difference or constant-sum windows beyond one ×5 block.",
	"Sharing rare values without order finds no link that a magnitude-matched null does not; every edge above it was already known.",
	"Community detection finds nothing beyond the pairs themselves (modularity 0.956 against 0.955 rewired).",
	"Knot-type, twist and attachment sequences share no pattern across khipus beyond chance, even allowing relabelling.",
	"No calendrical count or total (365, 360, 328, 41, 30, 12) beyond chance; the UR006 month parse holds under 1 of 9 counting rules.",
	"No base-12 preference, no colour that codes a number, no region-specific standard quantity.",
	"Find-spot is predicted mostly by who recorded the khipu: 0.37–0.44 with the recorder held out, against 0.31 by chance.",
];

export const CONFOUNDS = [
	"Recorders name the same dye differently — Ascher’s W:BB is Urton’s W:KB; in Berlin AB is 1% of one recorder’s cords and 21% of another’s.",
	"Twist and attachment follow the recorder: at Incahuasi one recorded S on 4,490 of 4,490 cords, another Z on 1,214 of 1,217, and the two worked different seasons.",
	"An accession number shared by two khipus usually means one object in parts; adjacent numbers showed 0 value links in 188 pairs.",
	"Broken cords inflate round numbers; screens should use intact (term = K) cords.",
	"Shuffling values across the whole corpus over-reports links about thirty-fold; nulls must match magnitude.",
	"The KH0502 heads are themselves totals (through UR275), but that does not produce the UR278 match: KH0517 reproduces exactly heads that UR275’s own cords miss by 10–34, and 4 of the 11 exist only on KH0502. Cord-shuffle and shift nulls peak at 3 matches (scripts/mk/mk_ink_totals_null.py). Not in Medrano & Khosla 2024.",
];

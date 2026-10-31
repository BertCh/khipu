import { colorKey, levelOneCords, pendantSums } from "#/lib/khipu/fieldmarks";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for the Mirror Ledger story (KH0081 / AS068 / UR281, Museo
 * Nacional de Arqueología, Antropología e Historia del Perú, Lima, no. 1745;
 * Monte de Cacatilla, Nazca valley, from a burial).
 *
 * The reading, first stated by Marcia and Robert Ascher in 1978 and re-tested
 * here: the 33 recorder's groups fall in two parts of one form. Each part is
 * an opening group of thousands, five summary groups of hundreds and ten
 * detail groups of tens; every full group runs the same seven colour slots.
 * In part A the first two opening cords are exactly the same-colour column
 * sums of the five summary groups (5928 = five W cords, 1120 = five MB
 * cords); in part B the MB cord is (934), the W cord is two short of its
 * column as recorded, and the last YB cord balances once one long knot is
 * read as Urton read it. The remaining opening cords are of the order of
 * their columns and equal nothing that was searched. The summary tier is not
 * a total of the detail tier in any slot.
 *
 * Everything here is computed from the record; the constants are the two
 * parts' group indexes, the seven-slot colour templates, and which of the
 * file's alternative values are the Aschers' readings rather than Urton's
 * (Databook I, pp. 384–398). The Python version, with the OKR comparison the
 * browser cannot run, is scripts/kh0081_analysis.py.
 */

export const MIRROR_LEDGER_ID = "KH0081";

export type PartKey = "A" | "B";
export type Tier = "opening" | "summary" | "marker" | "detail";

export interface Part {
	key: PartKey;
	/** 0-based indexes into khipu.groups */
	opening: number;
	summary: number[];
	/** Urton's singleton p40 between part A's tiers; the Aschers did not see it */
	marker: number | null;
	detail: number[];
	template: string[];
}

export const PARTS: Part[] = [
	{
		key: "A",
		opening: 0,
		summary: [1, 2, 3, 4, 5],
		marker: 6,
		detail: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
		template: ["W", "MB", "YB:CB", "YB:CB", "YB", "0G", "YB"],
	},
	{
		key: "B",
		opening: 17,
		summary: [18, 19, 20, 21, 22],
		marker: null,
		detail: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
		template: ["W", "MB", "YB:CB", "LA", "YB", "CB", "YB"],
	},
];

export const SLOTS = 7;

/**
 * The file keeps one alternative value where its two sources disagree. Most
 * are Urton's readings; on these four the file follows Urton and the
 * alternative is the Aschers' (p3 2002?, p48 1017, p49 300, p117 95 — no
 * thousands knot, Databook I pp. 385, 387, 390). p103's alternative (2) is
 * neither recorder's published value and is left out of both variants.
 */
export const ALT_SOURCE: Record<string, "ascher" | "unknown"> = {
	p3: "ascher",
	p48: "ascher",
	p49: "ascher",
	p117: "ascher",
	p103: "unknown",
};

export type Reading = "recorded" | "urton" | "ascher";

/** A cord's value under one of the three readings the file supports. */
export function readValue(c: Cord, reading: Reading = "recorded"): number {
	const v = c.value ?? 0;
	if (reading === "recorded" || !c.altValue) return v;
	const src = ALT_SOURCE[c.name];
	if (reading === "urton") return src === undefined ? c.altValue : v;
	return src === "ascher" ? c.altValue : v;
}

/** Which recorder each alternative value belongs to. */
export function altSources(khipu: Khipu): {
	total: number;
	urton: Cord[];
	ascher: Cord[];
	unknown: Cord[];
	/** disagreements of exactly one, a long knot's turn count */
	byOne: Cord[];
} {
	const withAlt = khipu.cords.filter((c) => c.altValue);
	return {
		total: withAlt.length,
		urton: withAlt.filter((c) => ALT_SOURCE[c.name] === undefined),
		ascher: withAlt.filter((c) => ALT_SOURCE[c.name] === "ascher"),
		unknown: withAlt.filter((c) => ALT_SOURCE[c.name] === "unknown"),
		byOne: withAlt.filter(
			(c) => Math.abs((c.value ?? 0) - (c.altValue ?? 0)) === 1,
		),
	};
}

export function partOf(gi: number): Part | null {
	for (const p of PARTS) {
		if (
			p.opening === gi ||
			p.marker === gi ||
			p.summary.includes(gi) ||
			p.detail.includes(gi)
		)
			return p;
	}
	return null;
}

export function tierOf(gi: number): Tier | null {
	for (const p of PARTS) {
		if (p.opening === gi) return "opening";
		if (p.marker === gi) return "marker";
		if (p.summary.includes(gi)) return "summary";
		if (p.detail.includes(gi)) return "detail";
	}
	return null;
}

/** Sizes of the recorder's groups, in order. */
export function groupSizes(khipu: Khipu): number[] {
	return khipu.groups.map((g) => g.n);
}

/** A part as its group sizes by template position: opening, 5 summary, marker, 10 detail. */
export function partShape(khipu: Khipu, p: Part): (number | null)[] {
	const size = (gi: number | null) => (gi === null ? null : khipu.groups[gi].n);
	return [
		size(p.opening),
		...p.summary.map(size),
		size(p.marker),
		...p.detail.map(size),
	];
}

/** Cords of a part, by tier. */
export function partCords(
	khipu: Khipu,
	p: Part,
): { opening: Cord[]; summary: Cord[]; detail: Cord[]; marker: Cord[] } {
	const groups = pendantGroups(khipu);
	return {
		opening: groups[p.opening] ?? [],
		summary: p.summary.flatMap((gi) => groups[gi] ?? []),
		detail: p.detail.flatMap((gi) => groups[gi] ?? []),
		marker: p.marker === null ? [] : (groups[p.marker] ?? []),
	};
}

/** Groups whose first cord is at least `min`: the two openings. */
export function groupsOpeningWith(khipu: Khipu, min: number): number[] {
	return pendantGroups(khipu)
		.map((g, i) => ((g[0]?.value ?? 0) >= min ? i : -1))
		.filter((i) => i >= 0);
}

/** First cord's value in every group. */
export function firstValues(khipu: Khipu): number[] {
	return pendantGroups(khipu).map((g) => g[0]?.value ?? 0);
}

/**
 * Assign a group's cords to the seven template slots: walk the cords in
 * order with a pointer; a cord takes the first slot at or after the pointer
 * whose template colour is its own, otherwise the slot at the pointer. Cords
 * of an off-template colour (three CB cords in part A) are placed by
 * position.
 */
export function slotsOf(cords: Cord[], template: string[]): number[] {
	const out: number[] = [];
	let next = 0;
	for (const c of cords) {
		let pick = -1;
		for (let s = next; s < template.length; s++) {
			if (template[s] === c.color) {
				pick = s;
				break;
			}
		}
		if (pick < 0) pick = next;
		out.push(pick);
		next = pick + 1;
	}
	return out;
}

export interface SlotRow {
	/** 0-based group index */
	gi: number;
	part: Part;
	tier: Tier;
	/** one entry per slot, null where the group has no cord there */
	cells: (Cord | null)[];
	/** slots with no cord */
	missing: number[];
	/** cords whose colour is not the template's for their slot */
	offTemplate: Cord[];
}

/** The slot table of one part: opening, summary, then detail groups. */
export function slotRows(khipu: Khipu, p: Part): SlotRow[] {
	const groups = pendantGroups(khipu);
	const order = [p.opening, ...p.summary, ...p.detail];
	return order.map((gi) => {
		const cords = groups[gi] ?? [];
		const slots = slotsOf(cords, p.template);
		const cells: (Cord | null)[] = Array.from({ length: SLOTS }, () => null);
		cords.forEach((c, i) => {
			if (slots[i] < SLOTS && cells[slots[i]] === null) cells[slots[i]] = c;
		});
		const missing: number[] = [];
		cells.forEach((c, s) => {
			if (c === null) missing.push(s);
		});
		return {
			gi,
			part: p,
			tier: tierOf(gi) ?? "detail",
			cells,
			missing,
			offTemplate: cords.filter((c, i) => p.template[slots[i]] !== c.color),
		};
	});
}

/** Which slot a level-1 cord sits in, for painting the diagram; null for p40. */
export function slotIndex(khipu: Khipu): Map<string, number> {
	const m = new Map<string, number>();
	for (const p of PARTS)
		for (const row of slotRows(khipu, p))
			row.cells.forEach((c, s) => {
				if (c) m.set(c.name, s);
			});
	return m;
}

/** Colour census of a tier by raw Ascher string, most common first. */
export function colourCensus(cords: Cord[]): [string, number][] {
	const m = new Map<string, number>();
	for (const c of cords) {
		const k = c.color ?? "?";
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export interface Column {
	slot: number;
	colour: string;
	cords: Cord[];
	sum: number;
	/** groups of the tier that have a cord in this slot */
	nGroups: number;
	/** groups in the tier */
	ofGroups: number;
}

/** Sum of slot s over the groups of a tier. */
export function columns(
	khipu: Khipu,
	p: Part,
	tier: "summary" | "detail",
	reading: Reading = "recorded",
): Column[] {
	const rows = slotRows(khipu, p).filter((r) => r.tier === tier);
	return p.template.map((colour, slot) => {
		const cords = rows
			.map((r) => r.cells[slot])
			.filter((c): c is Cord => c !== null);
		return {
			slot,
			colour,
			cords,
			sum: cords.reduce((a, c) => a + readValue(c, reading), 0),
			nGroups: cords.length,
			ofGroups: rows.length,
		};
	});
}

export type Verdict = "exact" | "near" | "no" | "blank" | "none";

export interface OpeningRow {
	part: Part;
	slot: number;
	colour: string;
	opening: Cord | null;
	value: number;
	column: Column;
	/** value − column */
	diff: number;
	verdict: Verdict;
}

/** Each opening cord against the same slot summed over the five summary groups. */
export function openingRows(
	khipu: Khipu,
	p: Part,
	reading: Reading = "recorded",
): OpeningRow[] {
	const rows = slotRows(khipu, p);
	const open = rows.find((r) => r.tier === "opening");
	const cols = columns(khipu, p, "summary", reading);
	return cols.map((column) => {
		const opening = open?.cells[column.slot] ?? null;
		const value = opening ? readValue(opening, reading) : 0;
		const diff = value - column.sum;
		let verdict: Verdict;
		if (!opening) verdict = "none";
		else if (value === 0) verdict = "blank";
		else if (diff === 0) verdict = "exact";
		else if (Math.abs(diff) <= 2) verdict = "near";
		else verdict = "no";
		return {
			part: p,
			slot: column.slot,
			colour: column.colour,
			opening,
			value,
			column,
			diff,
			verdict,
		};
	});
}

/** Opening cords with a value that equal their column, under a reading. */
export function columnMatches(
	khipu: Khipu,
	reading: Reading = "recorded",
): { tested: number; exact: OpeningRow[]; near: OpeningRow[] } {
	const all = PARTS.flatMap((p) => openingRows(khipu, p, reading)).filter(
		(r) => r.opening && r.value > 0,
	);
	return {
		tested: all.length,
		exact: all.filter((r) => r.verdict === "exact"),
		near: all.filter((r) => r.verdict === "near"),
	};
}

export interface SlotCompare {
	slot: number;
	colour: string;
	summary: Column;
	detail: Column;
	ratio: number | null;
}

/** The summary column of each slot against the detail column of the same slot. */
export function summaryVsDetail(khipu: Khipu, p: Part): SlotCompare[] {
	const s = columns(khipu, p, "summary");
	const d = columns(khipu, p, "detail");
	return s.map((summary, i) => ({
		slot: i,
		colour: p.template[i],
		summary,
		detail: d[i],
		ratio: d[i].sum > 0 ? summary.sum / d[i].sum : null,
	}));
}

/** Group totals in order, and any total that recurs. */
export function groupTotals(khipu: Khipu): {
	totals: number[];
	repeats: { value: number; groups: number[] }[];
} {
	const totals = pendantGroups(khipu).map((g) =>
		g.reduce((a, c) => a + (c.value ?? 0), 0),
	);
	const by = new Map<number, number[]>();
	totals.forEach((t, i) => {
		by.set(t, [...(by.get(t) ?? []), i]);
	});
	return {
		totals,
		repeats: [...by.entries()]
			.filter(([, gs]) => gs.length > 1)
			.map(([value, groups]) => ({ value, groups })),
	};
}

/** Each summary group's total against the two detail groups in the same rank. */
export function summaryGroupPairs(
	khipu: Khipu,
	p: Part,
): {
	summary: number;
	total: number;
	details: number[];
	detailTotal: number;
}[] {
	const { totals } = groupTotals(khipu);
	return p.summary.map((gi, i) => {
		const details = [p.detail[2 * i], p.detail[2 * i + 1]];
		return {
			summary: gi,
			total: totals[gi],
			details,
			detailTotal: details.reduce((a, d) => a + totals[d], 0),
		};
	});
}

export interface SummaryDetailMatch {
	part: Part;
	cord: Cord;
	gi: number;
	slot: number;
	column: Column;
}

/** Summary cords whose value is exactly the detail column of their slot (the Aschers' 7c). */
export function summaryCordMatches(khipu: Khipu): {
	tested: number;
	matches: SummaryDetailMatch[];
} {
	let tested = 0;
	const matches: SummaryDetailMatch[] = [];
	for (const p of PARTS) {
		const d = columns(khipu, p, "detail");
		for (const row of slotRows(khipu, p).filter((r) => r.tier === "summary"))
			row.cells.forEach((c, slot) => {
				if (!c) return;
				tested++;
				if ((c.value ?? 0) > 0 && c.value === d[slot].sum)
					matches.push({ part: p, cord: c, gi: row.gi, slot, column: d[slot] });
			});
	}
	return { tested, matches };
}

/**
 * The Aschers' 7(d): summary column over the last five detail groups' slot
 * cords, for slots 1–3 of each part.
 */
export function aschersRatios(
	khipu: Khipu,
	p: Part,
): { slot: number; summary: number; lastFive: number; ratio: number }[] {
	const rows = slotRows(khipu, p);
	const detail = rows.filter((r) => r.tier === "detail").slice(-5);
	const s = columns(khipu, p, "summary");
	return [0, 1, 2].map((slot) => {
		const lastFive = detail.reduce(
			(a, r) => a + (r.cells[slot]?.value ?? 0),
			0,
		);
		return {
			slot,
			summary: s[slot].sum,
			lastFive,
			ratio: lastFive > 0 ? s[slot].sum / lastFive : Number.NaN,
		};
	});
}

/** Sum of one slot over the first or last five detail groups of a part (the Aschers' Observation 9). */
export function fiveSum(
	khipu: Khipu,
	p: Part,
	slot: number,
	which: "first" | "last",
): number {
	const detail = slotRows(khipu, p).filter((r) => r.tier === "detail");
	const five = which === "first" ? detail.slice(0, 5) : detail.slice(-5);
	return five.reduce((a, r) => a + (r.cells[slot]?.value ?? 0), 0);
}

/** Slot s of part A against slot s of part B, group pair by group pair. */
export function pairCompare(
	khipu: Khipu,
	slot: number,
): { aGreater: number; bGreater: number; equal: number; pairs: number } {
	const [ra, rb] = PARTS.map((p) => slotRows(khipu, p));
	let aGreater = 0;
	let bGreater = 0;
	let equal = 0;
	let pairs = 0;
	for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
		const a = ra[i].cells[slot];
		const b = rb[i].cells[slot];
		if (!a || !b) continue;
		pairs++;
		const va = a.value ?? 0;
		const vb = b.value ?? 0;
		if (va > vb) aGreater++;
		else if (vb > va) bGreater++;
		else equal++;
	}
	return { aGreater, bGreater, equal, pairs };
}

/**
 * The Aschers' 9(b): the W differences between the two detail tiers, group
 * by group; the first five sum to one part's tenth detail W cord, the last
 * five to the other's.
 */
export function wDifferences(khipu: Khipu): {
	a: Cord[];
	b: Cord[];
	diffs: number[];
	firstFive: number;
	lastFive: number;
	all: number;
	tenthA: Cord | null;
	tenthB: Cord | null;
	sumA: number;
	sumB: number;
} {
	const [ra, rb] = PARTS.map((p) =>
		slotRows(khipu, p).filter((r) => r.tier === "detail"),
	);
	const a = ra.map((r) => r.cells[0]).filter((c): c is Cord => c !== null);
	const b = rb.map((r) => r.cells[0]).filter((c): c is Cord => c !== null);
	const n = Math.min(a.length, b.length);
	const diffs = Array.from(
		{ length: n },
		(_, i) => (a[i].value ?? 0) - (b[i].value ?? 0),
	);
	const sum = (xs: number[]) => xs.reduce((p, q) => p + q, 0);
	return {
		a,
		b,
		diffs,
		firstFive: sum(diffs.slice(0, 5)),
		lastFive: sum(diffs.slice(5, 10)),
		all: sum(diffs),
		tenthA: a[9] ?? null,
		tenthB: b[9] ?? null,
		sumA: sum(a.map((c) => c.value ?? 0)),
		sumB: sum(b.map((c) => c.value ?? 0)),
	};
}

/** Values above a floor that occur in both parts. */
export function sharedBetweenParts(khipu: Khipu, min = 20): number[] {
	const pick = (p: Part) => {
		const pc = partCords(khipu, p);
		return new Set(
			[...pc.opening, ...pc.summary, ...pc.detail]
				.map((c) => c.value ?? 0)
				.filter((v) => v > min),
		);
	};
	const a = pick(PARTS[0]);
	return [...pick(PARTS[1])].filter((v) => a.has(v)).sort((x, y) => x - y);
}

/** In how many groups of each tier the W cord is the largest. */
export function wLargest(
	khipu: Khipu,
): Record<
	"opening" | "summary" | "detail",
	{ yes: number; of: number; exceptions: { gi: number; largest: Cord }[] }
> {
	const out = {
		opening: { yes: 0, of: 0, exceptions: [] },
		summary: { yes: 0, of: 0, exceptions: [] },
		detail: { yes: 0, of: 0, exceptions: [] },
	} as ReturnType<typeof wLargest>;
	for (const p of PARTS)
		for (const row of slotRows(khipu, p)) {
			const tier = row.tier as "opening" | "summary" | "detail";
			const cords = row.cells.filter((c): c is Cord => c !== null);
			const w = row.cells[0];
			if (!w) continue;
			const largest = cords.reduce((a, c) =>
				(c.value ?? 0) > (a.value ?? 0) ? c : a,
			);
			out[tier].of++;
			if (largest === w) out[tier].yes++;
			else out[tier].exceptions.push({ gi: row.gi, largest });
		}
	return out;
}

/** Place (1, 10, 100, 1000) of a knot cluster from its value and count. */
function placeOf(k: Cord["knots"][number]): number | null {
	if (!k.value) return null;
	return 10 ** Math.floor(Math.log10(k.value / Math.max(1, k.n)));
}

/**
 * Where the four decimal places sit on this khipu: mean position of the
 * thousands, hundreds, tens and units clusters over the complete cords that
 * carry all four.
 */
export function placePositions(khipu: Khipu): {
	cords: Cord[];
	mean: Record<1000 | 100 | 10 | 1, number>;
} {
	const cords = khipu.cords.filter((c) => {
		if (c.level !== 1 || c.term !== "K" || c.knots.length !== 4) return false;
		const places = c.knots.map(placeOf);
		return [1000, 100, 10, 1].every((p) => places.includes(p));
	});
	const mean = { 1000: 0, 100: 0, 10: 0, 1: 0 } as Record<
		1000 | 100 | 10 | 1,
		number
	>;
	for (const p of [1000, 100, 10, 1] as const) {
		const xs = cords.map(
			(c) => c.knots.find((k) => placeOf(k) === p)?.pos ?? 0,
		);
		mean[p] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
	}
	return { cords, mean };
}

export interface CordState {
	cord: Cord;
	/** "complete" | "broken" | "stub" */
	state: "complete" | "broken" | "stub";
	/** cm from the attachment to the lowest knot, if any */
	lastKnot: number | null;
	/** the lowest knot's place */
	lastPlace: number | null;
}

/** How much of a cord survives, for saying what a broken value could have been. */
export function cordState(c: Cord): CordState {
	const lowest = c.knots.reduce<Cord["knots"][number] | null>(
		(a, k) => (a === null || k.pos > a.pos ? k : a),
		null,
	);
	const state =
		c.length !== null && c.length <= 1
			? "stub"
			: c.term === "B"
				? "broken"
				: "complete";
	return {
		cord: c,
		state,
		lastKnot: lowest?.pos ?? null,
		lastPlace: lowest ? placeOf(lowest) : null,
	};
}

/** The fate of one slot's cords across a tier: stubs, broken, complete, missing. */
export function slotFates(
	khipu: Khipu,
	p: Part,
	tier: "summary" | "detail",
	slot: number,
): { stubs: Cord[]; broken: Cord[]; complete: Cord[]; missing: number } {
	const rows = slotRows(khipu, p).filter((r) => r.tier === tier);
	const cords = rows
		.map((r) => r.cells[slot])
		.filter((c): c is Cord => c !== null);
	const states = cords.map(cordState);
	return {
		stubs: states.filter((s) => s.state === "stub").map((s) => s.cord),
		broken: states.filter((s) => s.state === "broken").map((s) => s.cord),
		complete: states.filter((s) => s.state === "complete").map((s) => s.cord),
		missing: rows.length - cords.length,
	};
}

/** Level-1 cords with no value at all (blank or stub). */
export function zeroCords(khipu: Khipu): Cord[] {
	return khipu.cords.filter((c) => c.level === 1 && !(c.value ?? 0));
}

/** Level-1 cord by name. */
export function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

/* ------------------------------------------------------------------ chance */

/** A small seeded generator (mulberry32) so the shuffles are repeatable. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffleInPlace<T>(xs: T[], rng: () => number) {
	for (let i = xs.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[xs[i], xs[j]] = [xs[j], xs[i]];
	}
}

/** Permute values among cords of the same class (colour, tier, or one class for all). */
function shuffleWithin(
	values: number[],
	classes: string[],
	rng: () => number,
): number[] {
	const out = values.slice();
	const byClass = new Map<string, number[]>();
	classes.forEach((k, i) => {
		byClass.set(k, [...(byClass.get(k) ?? []), i]);
	});
	for (const idx of byClass.values()) {
		const vs = idx.map((i) => values[i]);
		shuffleInPlace(vs, rng);
		idx.forEach((i, j) => {
			out[i] = vs[j];
		});
	}
	return out;
}

export interface RunSumRule {
	sameColour: boolean;
	minSummands: number;
	minValue: number;
}

/** The Field Guide's coloured-pendant-sum thresholds. */
export const KFG_RULE: RunSumRule = {
	sameColour: true,
	minSummands: 3,
	minValue: 11,
};

/**
 * Count (cord, hand) pairs whose value is the sum of a run of at least
 * `minSummands` consecutive non-zero cords lying wholly to one side of it —
 * same colour or any colour. Zeros drop out before windowing, as in the
 * Field Guide's search (fieldmarks.ts); this counts rather than lists so a
 * thousand shuffles are cheap.
 */
let endAtBuf = new Int32Array(0);

export function runSumCount(
	values: number[],
	keys: (string | null)[],
	rule: RunSumRule,
): number {
	const buckets = new Map<string, number[]>();
	let total = 0;
	values.forEach((v, i) => {
		if (v <= 0) return;
		total += v;
		const k = rule.sameColour ? (keys[i] ?? "") : "";
		buckets.set(k, [...(buckets.get(k) ?? []), i]);
	});
	// prefix sums index a shared lookup table (reset after each bucket) so a
	// thousand shuffles do not allocate a Map each
	if (endAtBuf.length < total + 1)
		endAtBuf = new Int32Array(total + 1).fill(-1);
	const endAt = endAtBuf;
	let count = 0;
	for (const idx of buckets.values()) {
		const n = idx.length;
		const prefix = new Int32Array(n + 1);
		for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[idx[i]];
		for (let i = 0; i <= n; i++) endAt[prefix[i]] = i;
		for (let i = 0; i < n; i++) {
			const v = values[idx[i]];
			if (v < rule.minValue) continue;
			let r = false;
			let l = false;
			for (let a = 0; a < n; a++) {
				const target = prefix[a] + v;
				if (target > total) break;
				const e = endAt[target];
				if (e < 0) continue;
				const b = e - 1;
				if (b - a + 1 < rule.minSummands) continue;
				if (a > i) r = true;
				else if (b < i) l = true;
				if (r && l) break;
			}
			count += (r ? 1 : 0) + (l ? 1 : 0);
		}
		for (let i = 0; i <= n; i++) endAt[prefix[i]] = -1;
	}
	return count;
}

export interface Baseline {
	label: string;
	observed: number;
	mean: number;
	sd: number;
	z: number;
	max: number;
	/** shuffles scoring at least the observed count */
	atLeast: number;
	shuffles: number;
}

function summarise(
	label: string,
	observed: number,
	counts: number[],
): Baseline {
	const n = counts.length;
	const mean = counts.reduce((a, b) => a + b, 0) / n;
	const sd = Math.sqrt(counts.reduce((a, c) => a + (c - mean) ** 2, 0) / n);
	return {
		label,
		observed,
		mean,
		sd,
		z: sd > 0 ? (observed - mean) / sd : Number.POSITIVE_INFINITY,
		max: Math.max(...counts),
		atLeast: counts.filter((c) => c >= observed).length,
		shuffles: n,
	};
}

/** Tier of every level-1 cord in sequence order; p40 counts with the detail tier. */
export function tierClasses(seq: Cord[]): string[] {
	return seq.map((c) => {
		const t = tierOf(c.group ?? -1);
		return t === "marker" ? "detail" : (t ?? "detail");
	});
}

export const SHUFFLE_SEED = 20260918;

/**
 * The run-sum count of the khipu against shuffled versions of itself:
 * values permuted across the whole khipu, within colour, and within tier
 * (opening / summary / detail). The last keeps the tier layout — a few
 * large values followed by many small ones — and is the honest baseline.
 */
export function runSumBaselines(
	khipu: Khipu,
	shuffles = 1000,
	seed = SHUFFLE_SEED,
): { coloured: Baseline[]; any: Baseline[]; any2: Baseline } {
	const seq = levelOneCords(khipu);
	const values = seq.map((c) => c.value ?? 0);
	const keys = seq.map((c) => colorKey(c));
	const tiers = tierClasses(seq);
	const all = seq.map(() => "all");
	const anyRule: RunSumRule = { ...KFG_RULE, sameColour: false };
	const any2Rule: RunSumRule = { ...anyRule, minSummands: 2 };
	const obsColoured = runSumCount(values, keys, KFG_RULE);
	const obsAny = runSumCount(values, keys, anyRule);
	const obsAny2 = runSumCount(values, keys, any2Rule);
	const run = (
		label: string,
		classes: string[],
		rule: RunSumRule,
		observed: number,
	) => {
		const rng = seededRandom(seed);
		const counts: number[] = [];
		for (let i = 0; i < shuffles; i++)
			counts.push(runSumCount(shuffleWithin(values, classes, rng), keys, rule));
		return summarise(label, observed, counts);
	};
	return {
		coloured: [
			run("values permuted across the khipu", all, KFG_RULE, obsColoured),
			run(
				"permuted within colour",
				keys.map((k) => k ?? ""),
				KFG_RULE,
				obsColoured,
			),
			run("permuted within tier", tiers, KFG_RULE, obsColoured),
		],
		any: [
			run("values permuted across the khipu", all, anyRule, obsAny),
			run("permuted within tier", tiers, anyRule, obsAny),
		],
		any2: run("values permuted across the khipu", all, any2Rule, obsAny2),
	};
}

/**
 * The column test: keep the opening cords and the slot layout, permute the
 * summary-tier values within each part, and count opening cords that equal
 * their column. Three of eleven do as recorded.
 */
export function columnBaseline(
	khipu: Khipu,
	shuffles = 1000,
	seed = SHUFFLE_SEED,
): Baseline {
	// per part: the summary cords' values and, per opening slot, the indexes
	// of its summands in that list
	const parts = PARTS.map((p) => {
		const rows = slotRows(khipu, p);
		const summaryRows = rows.filter((r) => r.tier === "summary");
		const open = rows.find((r) => r.tier === "opening");
		const names: string[] = [];
		const values: number[] = [];
		const at = new Map<string, number>();
		for (const r of summaryRows)
			for (const c of r.cells)
				if (c) {
					at.set(c.name, names.length);
					names.push(c.name);
					values.push(c.value ?? 0);
				}
		const tests: { value: number; summands: number[] }[] = [];
		open?.cells.forEach((c, s) => {
			if (!c || !(c.value ?? 0)) return;
			tests.push({
				value: c.value ?? 0,
				summands: summaryRows
					.map((r) => r.cells[s])
					.filter((x): x is Cord => x !== null)
					.map((x) => at.get(x.name) as number),
			});
		});
		return { values, tests };
	});
	const count = (vals: number[][]) =>
		parts.reduce(
			(n, p, i) =>
				n +
				p.tests.filter(
					(t) => t.summands.reduce((a, j) => a + vals[i][j], 0) === t.value,
				).length,
			0,
		);
	const observed = count(parts.map((p) => p.values));
	const rng = seededRandom(seed);
	const counts: number[] = [];
	for (let k = 0; k < shuffles; k++) {
		const vals = parts.map((p) => {
			const v = p.values.slice();
			shuffleInPlace(v, rng);
			return v;
		});
		counts.push(count(vals));
	}
	return summarise(
		"summary values permuted within each part",
		observed,
		counts,
	);
}

/** The Field Guide's coloured pendant sums for this khipu, with the R/L split. */
export function kfgSums(khipu: Khipu): {
	n: number;
	right: number;
	left: number;
	openingSums: string[];
} {
	const sums = pendantSums(khipu);
	const openings = new Set(
		PARTS.flatMap((p) => partCords(khipu, p).opening.map((c) => c.name)),
	);
	return {
		n: sums.length,
		right: sums.filter((s) => s.hand === "R").length,
		left: sums.filter((s) => s.hand === "L").length,
		openingSums: sums
			.filter((s) => openings.has(s.sum))
			.map((s) => `${s.sum}${s.hand}`),
	};
}

/* ----------------------------------------------------- published figures */

/**
 * The Aschers' Table 1 (Databook I, p. 396), transcribed: section A values
 * over the sums of the five section-B groups, both parts. Quoted, not
 * computed; the story sets it beside the record's own columns.
 */
export const ASCHERS_TABLE_1: Record<
	PartKey,
	{ opening: string[]; sums: string[] }
> = {
	A: {
		opening: ["5928", "1120", "2002", "94?", "1948", "?", "0"],
		sums: ["5928", "1120", "1177", "?", "1904", "1662", "384"],
	},
	B: {
		opening: ["5513", "934", "2000–2999", "1283", "1287", "–", "686"],
		sums: ["4521", "934", "2771–2879", "1047", "1317", "?", "685"],
	},
};

/** The Aschers' ratio for Part I, positions 1–3 (Observation 7d, p. 397). */
export const ASCHERS_RATIO = "11.83 ± 1.4 %";

/**
 * Position 6 of the ten groups of AS47, as the Aschers tabulated it
 * (Databook I, pp. 256–267; cord 38 taken as position 6 of the nine-cord
 * group 5). Transcribed for the cross-khipu equality they report.
 */
export const AS47_POSITION_6 = [21, 37, 35, 38, 20, 30, 11, 18, 15, 19];

/** Khipu Field Guide catalogue figures for KH0081, as published. */
export const KFG_CATALOG = {
	ascherSums: 227,
	pendantPendant: 158,
	indexed: 33,
	coloured: 32,
	benford: 0.9756,
	colours: 9,
};

/* ------------------------------------------------------------- threads */

/**
 * The opening-cord columns as threads over the whole khipu: each opening cord
 * with a value fans onto the five summary cords of its slot. Level-1 indexes
 * as in strands.json. A column that balances is exact; one off by one or two
 * is near; one that does not balance is a stub. Nothing joins part A to
 * part B, and nothing joins the summary tier to the detail tier: neither is a
 * sum.
 */
export interface ColumnThread {
	key: string;
	part: PartKey;
	slot: number;
	from: number[];
	to: number[];
	vFrom: number;
	vTo: number;
	kind: "exact" | "near" | "no";
	stub?: boolean;
	label?: string;
	title: string;
}

export function columnThreads(khipu: Khipu): ColumnThread[] {
	const l1 = khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
	const at = new Map(l1.map((c, i) => [c.name, i]));
	const out: ColumnThread[] = [];
	for (const p of PARTS) {
		const urton = openingRows(khipu, p, "urton");
		openingRows(khipu, p).forEach((r, k) => {
			if (!r.opening || r.verdict === "blank" || r.verdict === "none") return;
			const from = [at.get(r.opening.name) ?? -1];
			const to = r.column.cords.map((c) => at.get(c.name) ?? -1);
			const u = urton[k];
			const slot = `${p.key}${r.slot + 1} (${r.colour})`;
			const base = {
				key: `${p.key}${r.slot}`,
				part: p.key,
				slot: r.slot,
				from,
				to,
				vFrom: r.value,
				vTo: r.column.sum,
			};
			if (r.verdict === "exact")
				out.push({
					...base,
					kind: "exact",
					label: String(r.value),
					title: `${slot}: opening ${r.opening.name} ${r.value} = its five summary cords ${r.column.cords.map((c) => c.value ?? 0).join(" + ")} = ${r.column.sum}, exact`,
				});
			else if (r.verdict === "near")
				out.push({
					...base,
					kind: "near",
					label: String(r.value),
					title: `${slot}: opening ${r.opening.name} ${r.value} against ${r.column.sum} as recorded, ${Math.abs(r.diff)} off${u.verdict === "exact" ? `; exact with Urton's reading (${u.column.sum})` : ", a near miss on every reading"}`,
				});
			else
				out.push({
					...base,
					kind: "no",
					stub: true,
					title: `${slot}: opening ${r.opening.name} ${r.value} against ${r.column.sum}, does not balance`,
				});
		});
	}
	return out;
}

/** Level-1 cord range [from, to) of each part, for bands. */
export function partRanges(
	khipu: Khipu,
): { key: PartKey; from: number; to: number }[] {
	const l1 = khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
	return PARTS.map((p) => {
		const gs = [p.opening, ...p.summary, ...p.detail];
		const idx = l1
			.map((c, i) => (c.group !== undefined && gs.includes(c.group) ? i : -1))
			.filter((i) => i >= 0);
		return { key: p.key, from: Math.min(...idx), to: Math.max(...idx) + 1 };
	});
}

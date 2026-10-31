import type { Cord, Khipu, KhipuSummary } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";

/**
 * Derivations for the KH0135 story (AS121 / UR1121, Ethnologisches Museum
 * Berlin, provenance Pachacamac). The khipu is eighty recorder groups:
 * seventy three-cord groups, every one coloured white–brown–white, laid out
 * in ten blocks of seven, then ten seven-cord groups of a single brown each.
 * Only 21 of its 281 cords carry knots, and all of them sit in the tenth
 * block and the tenth seven-cord group. Everything here is computed from the
 * recorded cords; the only constants are which recorder groups make up the
 * two sections, how many triads make a block, and the colour template the
 * triads are compared against. The Python twin of this file is
 * scripts/kh0135_analysis.py, which also runs the corpus screens.
 *
 * Layout caveat: build_data.py reads the Field Guide's "space of X cm" as
 * the spacing between cords inside a group. For this khipu the Open Khipu
 * Repository's start/end positions show it is the gap AFTER the group where
 * a block ends (6.5, 5.5 or 25 cm) and for every seven-cord group (1.5 cm,
 * while the group itself spans 1 cm). So the layout functions below use
 * groups[i].start, which is reliable, and the measured widths of a triad
 * (0.5 cm) and a seven-cord group (1 cm); they never read cord.pos or
 * groups[i].spacing.
 */

export const KHIPU_ID = "KH0135";

/** 0-based indexes into khipu.groups: recorder groups 1–70 are the triads. */
export const TRIAD_GROUPS = Array.from({ length: 70 }, (_, i) => i);
/** Recorder groups 71–80 are the seven-cord groups at the end. */
export const TAIL_GROUPS = Array.from({ length: 10 }, (_, i) => 70 + i);
/** Triads per block, and cords per tail group. */
export const BLOCK = 7;
export const N_BLOCKS = 10;
/** Cord colours of a triad in ordinal order. */
export const TEMPLATE = ["W", "B", "W"];
/** Measured width of a triad and of a seven-cord group along the primary cord. */
export const TRIAD_WIDTH_CM = 0.5;
export const TAIL_WIDTH_CM = 1.0;
/**
 * Two other khipus whose recorder groups are mostly threes, for the
 * comparison in the story (found by the screen in scripts/kh0135_analysis.py
 * among khipus with ten or more groups: these two and KH0135 itself are the
 * only ones at 85 % threes or more).
 */
export const TRIAD_SIBLINGS = ["KH0112", "KH0503"];

/** Group sizes as run lengths: [{ size: 3, count: 70 }, { size: 7, count: 10 }]. */
export function groupSizeRuns(khipu: Khipu): { size: number; count: number }[] {
	const out: { size: number; count: number }[] = [];
	for (const g of khipu.groups) {
		const last = out.at(-1);
		if (last && last.size === g.n) last.count++;
		else out.push({ size: g.n, count: 1 });
	}
	return out;
}

/** The seventy triads, as pendant lists in ordinal order. */
export function triads(khipu: Khipu): Cord[][] {
	const groups = pendantGroups(khipu);
	return TRIAD_GROUPS.map((gi) => groups[gi] ?? []);
}

/** The ten seven-cord groups. */
export function tailGroups(khipu: Khipu): Cord[][] {
	const groups = pendantGroups(khipu);
	return TAIL_GROUPS.map((gi) => groups[gi] ?? []);
}

/** Triads chunked into blocks of seven: blocks[b][t] is a triad. */
export function blocks(khipu: Khipu): Cord[][][] {
	const t = triads(khipu);
	return Array.from({ length: N_BLOCKS }, (_, b) =>
		t.slice(b * BLOCK, (b + 1) * BLOCK),
	);
}

/** 0-based block index of a triad group, or -1 for a tail group. */
export function blockOfGroup(gi: number): number {
	const i = TRIAD_GROUPS.indexOf(gi);
	return i < 0 ? -1 : Math.floor(i / BLOCK);
}

/** 0-based tail-group index of a recorder group, or -1. */
export function tailOfGroup(gi: number): number {
	return TAIL_GROUPS.indexOf(gi);
}

/** Position of a pendant within its recorder group, 1-based. */
export function positionInGroup(khipu: Khipu, c: Cord): number {
	const g = khipu.groups[c.group ?? -1];
	return g ? c.ordinal - g.first + 1 : 0;
}

export interface TemplateCheck {
	matches: number;
	total: number;
	exceptions: { group: number; colours: (string | null)[] }[];
	/** colour counts at each of the three positions */
	byPosition: Record<string, number>[];
}

/** Every triad's colours against the W-B-W template. */
export function templateCheck(khipu: Khipu): TemplateCheck {
	const t = triads(khipu);
	const byPosition = TEMPLATE.map(() => ({}) as Record<string, number>);
	const exceptions: TemplateCheck["exceptions"] = [];
	t.forEach((cords, i) => {
		const colours = cords.map((c) => c.color);
		colours.forEach((col, p) => {
			const key = col ?? "?";
			byPosition[p][key] = (byPosition[p][key] ?? 0) + 1;
		});
		const ok =
			colours.length === TEMPLATE.length &&
			colours.every((c, p) => c === TEMPLATE[p]);
		if (!ok) exceptions.push({ group: TRIAD_GROUPS[i] + 1, colours });
	});
	return {
		matches: t.length - exceptions.length,
		total: t.length,
		exceptions,
		byPosition,
	};
}

/** Cord colour counts over the whole khipu, most common first. */
export function colourCounts(khipu: Khipu): { code: string; n: number }[] {
	const m = new Map<string, number>();
	for (const c of khipu.cords) {
		const k = c.color ?? "?";
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return [...m.entries()]
		.map(([code, n]) => ({ code, n }))
		.sort((a, b) => b.n - a.n);
}

/** One colour per tail group, or "mixed" when a group is not monochrome. */
export function tailColours(khipu: Khipu): string[] {
	return tailGroups(khipu).map((g) => {
		const set = new Set(g.map((c) => c.color ?? "?"));
		return set.size === 1 ? [...set][0] : "mixed";
	});
}

/** Subsidiaries by parent name, in ordinal order. */
export function subsOf(khipu: Khipu): Map<string, Cord[]> {
	const m = new Map<string, Cord[]>();
	for (const c of khipu.cords) {
		if (!c.parent) continue;
		if (!m.has(c.parent)) m.set(c.parent, []);
		m.get(c.parent)?.push(c);
	}
	for (const l of m.values()) l.sort((a, b) => a.ordinal - b.ordinal);
	return m;
}

export type Where = "block" | "tail" | "subsidiary";

export interface KnottedRow {
	cord: Cord;
	where: Where;
	/** 1-based block or tail-group number */
	unit: number;
	/** 1-based triad within the block (blocks only) */
	triad: number | null;
	/** 1-based position within the group; for a subsidiary, its parent's */
	position: number;
	value: number;
	knots: string;
}

function knotText(c: Cord): string {
	return c.knots.map((k) => `${k.n}${k.type} at ${k.pos} cm`).join(", ");
}

/** Every cord with at least one knot, with where it sits in the structure. */
export function knottedCords(khipu: Khipu): KnottedRow[] {
	const byName = new Map(khipu.cords.map((c) => [c.name, c]));
	const rows: KnottedRow[] = [];
	for (const c of khipu.cords) {
		if (c.knots.length === 0) continue;
		const host = c.level > 1 ? (byName.get(c.parent ?? "") ?? c) : c;
		const gi = host.group ?? -1;
		const b = blockOfGroup(gi);
		const t = tailOfGroup(gi);
		rows.push({
			cord: c,
			where: c.level > 1 ? "subsidiary" : b >= 0 ? "block" : "tail",
			unit: b >= 0 ? b + 1 : t + 1,
			triad: b >= 0 ? (TRIAD_GROUPS.indexOf(gi) % BLOCK) + 1 : null,
			position: positionInGroup(khipu, host),
			value: c.value ?? 0,
			knots: knotText(c),
		});
	}
	return rows;
}

/** Which blocks and which tail groups carry any knot (1-based). */
export function knottedUnits(khipu: Khipu): {
	blocks: number[];
	tails: number[];
} {
	const b = new Set<number>();
	const t = new Set<number>();
	for (const r of knottedCords(khipu)) {
		if (r.where === "tail") t.add(r.unit);
		else b.add(r.unit);
	}
	return {
		blocks: [...b].sort((x, y) => x - y),
		tails: [...t].sort((x, y) => x - y),
	};
}

export interface KnotSummary {
	/** cords with at least one knot */
	cords: number;
	/** knot clusters (one entry of Cord.knots each) */
	clusters: number;
	byType: { type: string; n: number }[];
	byDir: { dir: string; n: number }[];
	/** range of positions of single-knot (tens) clusters, cm from attachment */
	tensPos: [number, number] | null;
	/** the same for long and figure-eight (units) clusters */
	unitsPos: [number, number] | null;
	total: number;
	max: number;
}

export function knotSummary(khipu: Khipu): KnotSummary {
	const byType = new Map<string, number>();
	const byDir = new Map<string, number>();
	const tens: number[] = [];
	const units: number[] = [];
	let clusters = 0;
	for (const c of khipu.cords)
		for (const k of c.knots) {
			clusters++;
			byType.set(k.type, (byType.get(k.type) ?? 0) + 1);
			byDir.set(k.dir, (byDir.get(k.dir) ?? 0) + 1);
			(k.type === "S" ? tens : units).push(k.pos);
		}
	const range = (xs: number[]): [number, number] | null =>
		xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
	return {
		cords: khipu.cords.filter((c) => c.knots.length > 0).length,
		clusters,
		byType: [...byType].map(([type, n]) => ({ type, n })),
		byDir: [...byDir].map(([dir, n]) => ({ dir, n })),
		tensPos: range(tens),
		unitsPos: range(units),
		total: khipu.cords.reduce((a, c) => a + (c.value ?? 0), 0),
		max: Math.max(0, ...khipu.cords.map((c) => c.value ?? 0)),
	};
}

export interface TriadRow {
	/** 1-based triad within the block */
	triad: number;
	/** 1-based recorder group */
	group: number;
	cords: Cord[];
	values: number[];
	sum: number;
	subs: Cord[];
	subSum: number;
}

/** A block triad by triad: values, their sum, and any subsidiaries. */
export function blockRows(khipu: Khipu, b: number): TriadRow[] {
	const kids = subsOf(khipu);
	return blocks(khipu)[b].map((cords, i) => {
		const values = cords.map((c) => c.value ?? 0);
		const subs = cords.flatMap((c) => kids.get(c.name) ?? []);
		return {
			triad: i + 1,
			group: TRIAD_GROUPS[b * BLOCK + i] + 1,
			cords,
			values,
			sum: values.reduce((a, v) => a + v, 0),
			subs,
			subSum: subs.reduce((a, s) => a + (s.value ?? 0), 0),
		};
	});
}

/** In a block, how many cords of each template colour carry a knot. */
export function knottedByColour(
	khipu: Khipu,
	b: number,
): { code: string; knotted: number; total: number }[] {
	const m = new Map<string, { knotted: number; total: number }>();
	for (const triad of blocks(khipu)[b])
		for (const c of triad) {
			const k = c.color ?? "?";
			const e = m.get(k) ?? { knotted: 0, total: 0 };
			e.total++;
			if (c.knots.length) e.knotted++;
			m.set(k, e);
		}
	return [...m].map(([code, e]) => ({ code, ...e }));
}

/** Knotted pendants of a block by position in the triad (1, 2, 3). */
export function knottedByPosition(khipu: Khipu, b: number): number[] {
	const out = TEMPLATE.map(() => 0);
	for (const triad of blocks(khipu)[b])
		triad.forEach((c, p) => {
			if (c.knots.length) out[p]++;
		});
	return out;
}

export interface DecimalRow {
	cord: Cord;
	tens: number;
	units: number;
	read: number;
	/** the recorder's value agrees with tens × 10 + units */
	agrees: boolean;
}

/**
 * A tail group read in plain decimal: single knots as tens, long knots and
 * figure-eights as units. Cord.value already carries this; the row shows
 * the two registers separately and checks they agree.
 */
export function tailDecimal(khipu: Khipu, j: number): DecimalRow[] {
	return tailGroups(khipu)[j].map((cord) => {
		let tens = 0;
		let units = 0;
		for (const k of cord.knots) {
			if (k.type === "S") tens += k.n;
			else units += k.n;
		}
		const read = tens * 10 + units;
		return { cord, tens, units, read, agrees: read === (cord.value ?? 0) };
	});
}

/** Every a = b + c among distinct positions of a value list (b before c). */
export function sumTriples(
	values: number[],
): { a: number; b: number; c: number }[] {
	const out: { a: number; b: number; c: number }[] = [];
	for (let a = 0; a < values.length; a++)
		for (let b = 0; b < values.length; b++)
			for (let c = b + 1; c < values.length; c++) {
				if (a === b || a === c) continue;
				if (values[a] > 0 && values[a] === values[b] + values[c])
					out.push({ a, b, c });
			}
	return out;
}

export interface LengthStats {
	n: number;
	min: number;
	max: number;
	mean: number;
}

export function lengthStats(cords: Cord[]): LengthStats {
	const xs = cords.map((c) => c.length ?? 0).filter((l) => l > 0);
	if (!xs.length) return { n: 0, min: 0, max: 0, mean: 0 };
	return {
		n: xs.length,
		min: Math.min(...xs),
		max: Math.max(...xs),
		mean: xs.reduce((a, b) => a + b, 0) / xs.length,
	};
}

/** Cords with a recorded length (the record has 0 where none was taken). */
export function measuredCords(khipu: Khipu): Cord[] {
	return khipu.cords.filter((c) => (c.length ?? 0) > 0);
}

/** Mean recorded length of a block's pendants at each triad position. */
export function blockLengthsByPosition(khipu: Khipu, b: number): LengthStats[] {
	return TEMPLATE.map((_, p) =>
		lengthStats(blocks(khipu)[b].map((triad) => triad[p])),
	);
}

/**
 * Do the measured cords coincide exactly with the knotted units (block b,
 * its subsidiaries, and tail group j)?
 */
export function measuredAreKnottedUnits(
	khipu: Khipu,
	b: number,
	j: number,
): boolean {
	const kids = subsOf(khipu);
	const unit = new Set<string>();
	for (const triad of blocks(khipu)[b])
		for (const c of triad) {
			unit.add(c.name);
			for (const s of kids.get(c.name) ?? []) unit.add(s.name);
		}
	for (const c of tailGroups(khipu)[j]) unit.add(c.name);
	const measured = measuredCords(khipu).map((c) => c.name);
	return measured.length === unit.size && measured.every((n) => unit.has(n));
}

export interface Span {
	/** 1-based block or tail-group number */
	n: number;
	start: number;
	end: number;
	/** cm to the next unit's start, null for the last */
	gapAfter: number | null;
	/** pitch between the group starts inside the unit (blocks only) */
	pitch: number | null;
}

/** Where each block sits along the primary cord, from groups[i].start. */
export function blockSpans(khipu: Khipu): Span[] {
	const starts = TRIAD_GROUPS.map((gi) => khipu.groups[gi].start);
	return Array.from({ length: N_BLOCKS }, (_, b) => {
		const s = starts.slice(b * BLOCK, (b + 1) * BLOCK);
		const start = s[0];
		const end = s[s.length - 1] + TRIAD_WIDTH_CM;
		const next =
			b + 1 < N_BLOCKS
				? starts[(b + 1) * BLOCK]
				: khipu.groups[TAIL_GROUPS[0]].start;
		return {
			n: b + 1,
			start,
			end,
			gapAfter: next - end,
			pitch: s.length > 1 ? (s[s.length - 1] - s[0]) / (s.length - 1) : null,
		};
	});
}

/** Where each seven-cord group sits. */
export function tailSpans(khipu: Khipu): Span[] {
	const starts = TAIL_GROUPS.map((gi) => khipu.groups[gi].start);
	return starts.map((start, j) => ({
		n: j + 1,
		start,
		end: start + TAIL_WIDTH_CM,
		gapAfter:
			j + 1 < starts.length ? starts[j + 1] - start - TAIL_WIDTH_CM : null,
		pitch: null,
	}));
}

export interface LayoutSummary {
	firstCord: number;
	lastCord: number;
	triadSection: [number, number];
	tailSection: [number, number];
	/** gap between the last block and the first tail group */
	silence: number;
	/** the pitch between triads: the median over blocks (one block is 0.25 cm short in the transcription) */
	triadPitch: number | null;
	tailPitch: number | null;
	gaps: number[];
}

export function layoutSummary(khipu: Khipu): LayoutSummary {
	const b = blockSpans(khipu);
	const t = tailSpans(khipu);
	const pitches = b
		.map((s) => s.pitch)
		.filter((p): p is number => p != null)
		.sort((x, y) => x - y);
	const tailPitches = new Set(
		t.slice(1).map((s, i) => (s.start - t[i].start).toFixed(2)),
	);
	return {
		firstCord: b[0].start,
		lastCord: t[t.length - 1].end,
		triadSection: [b[0].start, b[b.length - 1].end],
		tailSection: [t[0].start, t[t.length - 1].end],
		silence: b[b.length - 1].gapAfter ?? 0,
		triadPitch: pitches.length
			? Math.round(pitches[Math.floor(pitches.length / 2)] * 100) / 100
			: null,
		tailPitch: tailPitches.size === 1 ? t[1].start - t[0].start : null,
		gaps: b.slice(0, -1).map((s) => s.gapAfter ?? 0),
	};
}

/** Binomial coefficient as a double (exact to ~1e15, fine for ratios). */
export function choose(n: number, k: number): number {
	if (k < 0 || k > n) return 0;
	const kk = Math.min(k, n - k);
	let r = 1;
	for (let i = 1; i <= kk; i++) r = (r * (n - kk + i)) / i;
	return r;
}

/**
 * Chance test (a): if m of a block's cords were knotted at random, how often
 * would all m fall on its white cords? Hypergeometric, exact.
 */
export function pAllOnColour(
	khipu: Khipu,
	b: number,
	code: string,
): { m: number; onColour: number; total: number; p: number } {
	const cords = blocks(khipu)[b].flat();
	const m = cords.filter((c) => c.knots.length).length;
	const onColour = cords.filter((c) => c.color === code).length;
	return {
		m,
		onColour,
		total: cords.length,
		p: choose(onColour, m) / choose(cords.length, m),
	};
}

/**
 * Chance test (b): the knotted pendants placed at random among all
 * pendants — how often would they fall inside at most two of the twenty
 * units (ten blocks, ten tail groups)? Exact, by inclusion–exclusion over
 * single units and pairs.
 */
export function pWithinTwoUnits(khipu: Khipu): {
	knotted: number;
	pendants: number;
	units: number;
	p: number;
} {
	const sizes = [
		...blocks(khipu).map((b) => b.flat().length),
		...tailGroups(khipu).map((t) => t.length),
	];
	const pendants = sizes.reduce((a, b) => a + b, 0);
	const knotted = khipu.cords.filter(
		(c) => c.level === 1 && c.knots.length > 0,
	).length;
	const all = choose(pendants, knotted);
	let ways = 0;
	for (const n of sizes) ways += choose(n, knotted);
	for (let i = 0; i < sizes.length; i++)
		for (let j = i + 1; j < sizes.length; j++)
			ways +=
				choose(sizes[i] + sizes[j], knotted) -
				choose(sizes[i], knotted) -
				choose(sizes[j], knotted);
	return { knotted, pendants, units: sizes.length, p: ways / all };
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** "1 in 14,500" or, for very small p, "1 in 3 × 10¹⁷". */
export function oneIn(p: number): string {
	if (p <= 0) return "never";
	const inv = 1 / p;
	if (inv < 1e6) {
		const digits = Math.max(0, 3 - Math.ceil(Math.log10(inv)));
		const step = 10 ** -digits;
		return `1 in ${(Math.round(inv / step) * step).toLocaleString()}`;
	}
	const e = Math.floor(Math.log10(inv));
	const mant = Math.round(inv / 10 ** e);
	const sup = String(e)
		.split("")
		.map((d) => SUP[Number(d)])
		.join("");
	return `1 in ${mant} × 10${sup}`;
}

/**
 * A copy for drawing: the recorders took no length for most cords (the
 * record holds 0), so those are given a nominal length — the mean of the
 * measured pendants — and the diagram says so in its caption.
 */
export function forDrawing(khipu: Khipu): { khipu: Khipu; nominal: number } {
	const nominal =
		Math.round(
			lengthStats(measuredCords(khipu).filter((c) => c.level === 1)).mean,
		) || 25;
	return {
		nominal,
		khipu: {
			...khipu,
			cords: khipu.cords.map((c) =>
				(c.length ?? 0) > 0 ? c : { ...c, length: nominal },
			),
		},
	};
}

/** Share of a khipu's recorder groups that are three-cord groups. */
export function triadShare(khipu: Khipu): { threes: number; groups: number } {
	return {
		threes: khipu.groups.filter((g) => g.n === 3).length,
		groups: khipu.groups.length,
	};
}

export interface DensityRank {
	/** khipus considered */
	n: number;
	/** 1 = fewest knots per cord */
	rank: number;
	density: number;
	median: number;
	/** the lowest few, for the table */
	lowest: { id: string; cords: number; knots: number; density: number }[];
}

/**
 * Knots per cord among the corpus khipus with at least `minCords` cords,
 * from the index (which counts individual knots, so the pair of single
 * knots on p279 counts twice). The analysis script ranks by the share of
 * cords that carry any knot instead and reaches the same place.
 */
export function knotDensityRank(
	index: KhipuSummary[],
	id: string,
	minCords = 100,
	show = 6,
): DensityRank | null {
	const rows = index
		.filter((k) => k.nCords >= minCords)
		.map((k) => ({
			id: k.id,
			cords: k.nCords,
			knots: k.nKnots,
			density: k.nKnots / k.nCords,
		}))
		.sort((a, b) => a.density - b.density || a.id.localeCompare(b.id));
	const i = rows.findIndex((r) => r.id === id);
	if (i < 0) return null;
	const ds = rows.map((r) => r.density);
	const mid = Math.floor(ds.length / 2);
	const median = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2;
	return {
		n: rows.length,
		rank: i + 1,
		density: rows[i].density,
		median,
		lowest: rows.slice(0, show),
	};
}

/** The khipu the story compares KH0135's emptiness with: 101 cords, no knots. */
export const COMPARISON_ID = "KH0208";

/** Share of a khipu's cords that carry any knot. */
export function knottedShare(khipu: Khipu): {
	knotted: number;
	cords: number;
	share: number;
} {
	const knotted = khipu.cords.filter((c) => c.knots.length > 0).length;
	return {
		knotted,
		cords: khipu.cords.length,
		share: knotted / khipu.cords.length,
	};
}

/** Colour runs of the tail groups: [{ code: "B", n: 1 }, { code: "BB", n: 8 }, …]. */
export function tailColourRuns(khipu: Khipu): { code: string; n: number }[] {
	const out: { code: string; n: number }[] = [];
	for (const code of tailColours(khipu)) {
		const last = out.at(-1);
		if (last && last.code === code) last.n++;
		else out.push({ code, n: 1 });
	}
	return out;
}

/** Three-cord colour patterns of a khipu's triad groups, commonest first. */
export function triadPatterns(khipu: Khipu): { pattern: string; n: number }[] {
	const m = new Map<string, number>();
	for (const g of pendantGroups(khipu)) {
		if (g.length !== 3) continue;
		const key = g.map((c) => c.color ?? "?").join(" – ");
		m.set(key, (m.get(key) ?? 0) + 1);
	}
	return [...m]
		.map(([pattern, n]) => ({ pattern, n }))
		.sort((a, b) => b.n - a.n);
}

export interface TriadSumTest {
	/** the modal first + last sum across the block's triads */
	target: number;
	/** triads whose first + last equals the target */
	hits: number;
	triads: number;
	/**
	 * Exact chance, over every permutation of the last-position values among
	 * the triads, of at least `hits` triads summing to the target.
	 */
	p: number;
}

/**
 * Chance test (c): are the first- and last-position values of a block paired
 * more often than shuffling would give? The script draws 10,000 shuffles;
 * with seven triads every permutation can be enumerated instead, so the
 * value here is exact.
 */
export function triadSumTest(khipu: Khipu, b: number): TriadSumTest {
	const rows = blockRows(khipu, b);
	const first = rows.map((r) => r.values[0] ?? 0);
	const last = rows.map((r) => r.values[r.values.length - 1] ?? 0);
	const sums = rows.map((_, i) => first[i] + last[i]);
	const counts = new Map<number, number>();
	for (const s of sums) counts.set(s, (counts.get(s) ?? 0) + 1);
	let target = 0;
	let best = -1;
	for (const [s, n] of counts)
		if (n > best || (n === best && s > target)) {
			best = n;
			target = s;
		}
	const hits = sums.filter((s) => s === target).length;
	let total = 0;
	let atLeast = 0;
	const used = new Array<boolean>(last.length).fill(false);
	const perm: number[] = [];
	const walk = () => {
		if (perm.length === last.length) {
			total++;
			let h = 0;
			for (let i = 0; i < perm.length; i++)
				if (first[i] + perm[i] === target) h++;
			if (h >= hits) atLeast++;
			return;
		}
		for (let j = 0; j < last.length; j++) {
			if (used[j]) continue;
			used[j] = true;
			perm.push(last[j]);
			walk();
			perm.pop();
			used[j] = false;
		}
	};
	walk();
	return { target, hits, triads: rows.length, p: total ? atLeast / total : 1 };
}

export interface Pairing {
	tail: number[];
	triadTotals: number[];
	differences: number[];
	ratios: number[];
	tailSum: number;
	triadSum: number;
}

/**
 * The knotted tail group against the knotted block, cord for triad: the
 * Aschers' guess that the seventy tail cords answer the seventy triads can
 * be tested only at this one pair.
 */
export function pairing(khipu: Khipu, b: number, j: number): Pairing {
	const rows = blockRows(khipu, b);
	const tail = tailGroups(khipu)[j].map((c) => c.value ?? 0);
	const triadTotals = rows.map((r) => r.sum + r.subSum);
	return {
		tail,
		triadTotals,
		differences: tail.map((v, i) => v - (triadTotals[i] ?? 0)),
		ratios: tail.map((v, i) =>
			triadTotals[i] ? v / triadTotals[i] : Number.NaN,
		),
		tailSum: tail.reduce((a, v) => a + v, 0),
		triadSum: triadTotals.reduce((a, v) => a + v, 0),
	};
}

/** Small deterministic PRNG so a shuffle test gives the same answer on every render. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Contiguous runs of two or more values whose sum equals a value outside the
 * run, counted once per (run, matching value) pair — the script's definition.
 */
export function runCoincidences(values: number[]): number {
	let n = 0;
	for (let i = 0; i < values.length; i++) {
		let s = values[i];
		for (let j = i + 1; j < values.length; j++) {
			s += values[j];
			for (let t = 0; t < values.length; t++)
				if (values[t] === s && (t < i || t > j)) n++;
		}
	}
	return n;
}

export interface CoincidenceTest {
	values: number[];
	observed: number;
	shuffles: number;
	/** share of shuffles with at least as many coincidences */
	p: number;
}

/**
 * Chance test (d): the Field Guide counts "Ascher sums" on this khipu. With
 * twenty small values, runs that add up to another value are expected; this
 * counts them on the recorded order and on shuffles of the same values.
 */
export function coincidenceTest(
	khipu: Khipu,
	shuffles = 2000,
	seed = 135,
): CoincidenceTest {
	const values = khipu.cords
		.filter((c) => c.level === 1 && (c.value ?? 0) > 0)
		.sort((a, b) => a.ordinal - b.ordinal)
		.map((c) => c.value ?? 0);
	const observed = runCoincidences(values);
	const rnd = mulberry32(seed);
	let atLeast = 0;
	const v = [...values];
	for (let s = 0; s < shuffles; s++) {
		for (let i = v.length - 1; i > 0; i--) {
			const j = Math.floor(rnd() * (i + 1));
			[v[i], v[j]] = [v[j], v[i]];
		}
		if (runCoincidences(v) >= observed) atLeast++;
	}
	return { values, observed, shuffles, p: atLeast / shuffles };
}

/** Knot types at each triad position of a block, e.g. [{E:5,L:1},{},{L:7}]. */
export function knotTypesByPosition(
	khipu: Khipu,
	b: number,
): Record<string, number>[] {
	const out = TEMPLATE.map(() => ({}) as Record<string, number>);
	for (const triad of blocks(khipu)[b])
		triad.forEach((c, p) => {
			for (const k of c.knots) out[p][k.type] = (out[p][k.type] ?? 0) + 1;
		});
	return out;
}

/** Distinct knot heights (cm from attachment) at each triad position of a block. */
export function knotHeightsByPosition(khipu: Khipu, b: number): number[][] {
	return TEMPLATE.map((_, p) => {
		const set = new Set<number>();
		for (const triad of blocks(khipu)[b])
			for (const k of triad[p]?.knots ?? []) set.add(k.pos);
		return [...set].sort((x, y) => x - y);
	});
}

/** Cords of a khipu whose value is non-zero, in ordinal order (level 1 only). */
export function valuedPendants(khipu: Khipu): Cord[] {
	return khipu.cords
		.filter((c) => c.level === 1 && (c.value ?? 0) > 0)
		.sort((a, b) => a.ordinal - b.ordinal);
}

/** Count of index khipus with at least `minCords` cords. */
export function bigKhipus(index: KhipuSummary[], minCords = 100): number {
	return index.filter((k) => k.nCords >= minCords).length;
}

/** Pendants whose termination is recorded as broken. */
export function brokenCords(khipu: Khipu): Cord[] {
	return khipu.cords.filter((c) => c.term === "B");
}

/** Recorded twist / attachment / termination codes with counts, pendants only. */
export function codeCounts(
	khipu: Khipu,
	field: "twist" | "attach" | "term",
): { code: string; n: number }[] {
	const m = new Map<string, number>();
	for (const c of khipu.cords) {
		if (c.level !== 1) continue;
		const k = c[field] ?? "?";
		m.set(k, (m.get(k) ?? 0) + 1);
	}
	return [...m].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n);
}

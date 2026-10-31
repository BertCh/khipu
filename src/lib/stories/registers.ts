import type { Cord, Khipu } from "#/lib/khipu/types";

/**
 * Derivations for the "Counting to two" story: KH0034 (Peabody Museum,
 * Harvard, AS32 / UR1032, Nazca) and KH0670 (Michael C. Carlos Museum,
 * Emory, QU024, no provenance). Both write almost every pendant as 0, 1 or
 * 2 in a single knot register at a fixed height, with no tens or hundreds
 * cluster anywhere on a pendant. The story reads them as registers of small
 * counts, not ledgers of sums: KH0034 organised by column (position in an
 * eight-cord colour template predicts the value), KH0670 by row (whole
 * five-cord groups are heavy or light).
 *
 * Everything here is computed from the recorded cords. The constants are the
 * ones that define the reading: how a marker, a mended cord, a top cord or a
 * zero-length artefact is recognised; the eight-cord colour template of
 * KH0034 and the Aschers' reverse numbering of it; the length below which a
 * blank broken cord is scored unknown rather than zero; and the seed and
 * count of the shuffles. RADIOCARBON, ASCHER_AS32 and KFG_FIELDMARKS are
 * transcribed from print and cited on the page. The same analysis, with
 * the corpus screen, is scripts/registers_analysis.py.
 */

export const KH0034_ID = "KH0034";
export const KH0670_ID = "KH0670";
/** The other khipus that pass the corpus screen (scripts/registers_analysis.py). */
export const RELATIVE_IDS = ["KH0084", "KH0239", "KH0297"];

export const SEED = 34670;
export const SHUFFLES = 1000;

/** KH0034's colour template in the KFG's cord order. */
export const CYCLE = ["W", "W", "W", "LB", "LB", "LB", "LB", "LB"] as const;
/** The Aschers listed AS32 from the other end: their position for each template index. */
export const ASCHER_POS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/**
 * A blank cord recorded as broken and shorter than this cannot reach the
 * knot register, so its 0 is unknown. Chosen from the observed register:
 * KH0034 pendant knots sit at 11–20 cm and subsidiary knots at 4–18 cm;
 * KH0670 pendant knots at 4–12 cm.
 */
export const READ_LEN = {
	KH0034: { pendant: 20, subsidiary: 15 },
	KH0670: { pendant: 12 },
} as const;

/** Transcribed from Cherkinsky & Urton 2014, Table 1 (p. 34) and text (p. 33). */
export const RADIOCARBON = {
	KH0034: {
		lab: "UGAMS-4276",
		/** printed with two digits transposed; the museum number is 42-28-30/4532 */
		sample: "42-28-30/4352",
		bp: 377,
		pm: 23,
		cal2: "1477–1630",
		cal1: "1496–1512 (0.189) and 1546–1623 (0.811)",
	},
	KH0670: {
		lab: "AA-64905",
		sample: "Carlos2002.1.118",
		bp: 335,
		pm: 36,
		cal2: "1489–1652",
		cal1: "1509–1580 (0.771) and 1620–1641 (0.229)",
		text: "1571 ± 81 AD",
	},
} as const;

/** Transcribed from Ascher & Ascher 1978, Code of the Quipu: Databook, AS32 pp. 124–153. */
export const ASCHER_AS32 = {
	listed: 405,
	claimedPendants: "406 of 432",
	claimedGroups: "51 of 54",
	missing: "16 pendants at the broken end and 10 at the mend",
	brokenPendants: "72 of 406",
	brokenSubs: "27 of 119",
	basis: 334,
	basisSubs: 92,
	pct: "96%",
	/** Ascher position → the values they list there */
	bounds: {
		1: [0, 1, 2, 4],
		2: [0, 1, 2, 3, 4],
		3: [0, 1, 2, 3, 4, 6],
		4: [0, 1, 2, 3],
		5: [0, 1, 2],
		6: [0, 1, 2],
		7: [0, 1, 2, 3, 4],
		8: [0, 1],
	} as Record<number, number[]>,
} as const;

/**
 * Spot rows of the Databook's AS32 listing, transcribed, for checking the
 * cord map: their cord number → knots (height), length, colour, value, and
 * any subsidiary. "b" is their mark for a broken cord, "?" an unknown value.
 */
export const ASCHER_SPOT_ROWS: { n: number; text: string }[] = [
	{ n: 1, text: "— 7.0 b W ?" },
	{ n: 4, text: "— 5.0 b LB ?; subsidiary 1E (11.0) 23.0 LB 1" },
	{ n: 5, text: "2L (14.0) 14.5 b LB 2" },
	{ n: 8, text: "2L (15.0) 28.5 W 2; subsidiary 2L (8.0) 20.0 LB 2" },
	{ n: 48, text: "1E (17.0) 22.0 W 1; two subsidiaries at 3.0–3.5" },
	{
		n: 274,
		text: "— 5.0 b W ?; subsidiary 1E (13.0) 23.0 DB 1 (first after the mend)",
	},
	{ n: 294, text: "1E (17.0) 21.5 LB 1; subsidiary 1E (14.0) 18.0 b BL 1" },
	{ n: 335, text: "1E (17.0); 1E (31.0) 39.0 LB 1+1(?)" },
];

/**
 * The KFG's own fieldmark pages for KH0670, by the spacing-group number its
 * cord references use (YB@[9, 1] is the first cord of group 9, counted from
 * 1 over all 48 spacing groups, the top cord and the two artefacts included).
 */
export const KFG_FIELDMARKS = {
	sumBands: [9, 15, 22, 28],
	sumBandHalves: [3, 3, 7, 3],
	decreasing: [29, 39],
} as const;

// ----------------------------------------------------------------- shared

export function isMarker(c: Cord): boolean {
	return c.level === 1 && /Marker M/.test(c.notes ?? "");
}

export function isMended(c: Cord): boolean {
	return /added by Urton/.test(c.notes ?? "");
}

/** A zero-length "cord" KH0670's recorder noted as a knot in the primary cord. */
export function isArtefact(c: Cord): boolean {
	return (
		(c.length ?? 0) === 0 && /KNOT in or between primary/.test(c.notes ?? "")
	);
}

/** Level-1 data cords: pendants that are not markers, artefacts or top cords. */
export function dataPendants(k: Khipu): Cord[] {
	return k.cords
		.filter(
			(c) =>
				c.level === 1 && c.kind === "pendant" && !isMarker(c) && !isArtefact(c),
		)
		.sort((a, b) => a.ordinal - b.ordinal);
}

export function subsidiaries(k: Khipu): Cord[] {
	return k.cords.filter((c) => c.level > 1);
}

/** Level-1 cords in recorded order, whatever their kind. */
export function levelOne(k: Khipu): Cord[] {
	return k.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
}

/** A blank cord is unknown only if it is broken (term B) below the register. */
export function isReadable(c: Cord, cut: number): boolean {
	if (c.knots.length > 0) return true;
	if (c.term !== "B") return true;
	return (c.length ?? 0) >= cut;
}

/** The KFG's value: what the recorder computed from the knots. */
export function kfgValue(c: Cord): number {
	return c.value ?? 0;
}

/**
 * The value this reading uses. Urton recorded a lone single knot on three
 * KH0034 cords (10, 10, 11) where the Aschers recorded a figure-eight; the
 * knot sits inside the units register, so it is read as 1 here. Every
 * other cord reads as the KFG has it.
 */
export function readValue(c: Cord): number {
	if (!c.knots.some((k) => k.type === "S")) return c.value ?? 0;
	return c.knots.reduce((a, k) => a + k.n, 0);
}

/** Cords the two readings disagree on: KFG value beside the units reading. */
export function disputedCords(
	k: Khipu,
): { cord: Cord; kfg: number; read: number }[] {
	return k.cords
		.filter((c) => c.knots.some((kn) => kn.type === "S") && c.kind !== "top")
		.map((cord) => ({ cord, kfg: kfgValue(cord), read: readValue(cord) }));
}

export type Hist = Map<number, number>;

export function histogram(
	cords: Cord[],
	value: (c: Cord) => number = readValue,
): Hist {
	const h: Hist = new Map();
	for (const c of cords) h.set(value(c), (h.get(value(c)) ?? 0) + 1);
	return new Map([...h.entries()].sort((a, b) => a[0] - b[0]));
}

export function histText(h: Hist): string {
	return [...h.entries()].map(([v, n]) => `${v}: ${n}`).join(", ");
}

export function count(h: Hist, pred: (v: number) => boolean): number {
	let n = 0;
	for (const [v, c] of h) if (pred(v)) n += c;
	return n;
}

export function total(h: Hist): number {
	let n = 0;
	for (const c of h.values()) n += c;
	return n;
}

export function pct(a: number, b: number, digits = 0): string {
	return b ? `${((100 * a) / b).toFixed(digits)} %` : "—";
}

export function mean(xs: number[]): number {
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function sd(xs: number[]): number {
	const m = mean(xs);
	return xs.length ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : 0;
}

export function pearson(xs: number[], ys: number[]): number {
	const mx = mean(xs);
	const my = mean(ys);
	const sx = sd(xs);
	const sy = sd(ys);
	if (!sx || !sy) return 0;
	let s = 0;
	for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
	return s / (xs.length * sx * sy);
}

export function fmt(x: number, digits = 1): string {
	return x.toFixed(digits);
}

export interface Register {
	n: number;
	mean: number;
	sd: number;
	min: number;
	max: number;
	/** Pearson r between knot height and cord length */
	r: number;
	/** cords with more than one knot cluster */
	twoClusters: number;
}

/**
 * Where the knots sit. Heights of every figure-eight and long knot (single
 * knots are left out: the three disputed KH0034 cords) measured from the
 * cord's attachment, and their relation to the cord's length. A register at
 * a fixed distance from the primary cord has r near 0.
 */
export function register(cords: Cord[]): Register {
	const hs: number[] = [];
	const ls: number[] = [];
	let two = 0;
	for (const c of cords) {
		const ks = c.knots.filter((k) => k.type === "E" || k.type === "L");
		if (ks.length > 1) two++;
		for (const k of ks) {
			hs.push(k.pos);
			ls.push(c.length ?? k.pos);
		}
	}
	return {
		n: hs.length,
		mean: mean(hs),
		sd: sd(hs),
		min: hs.length ? Math.min(...hs) : 0,
		max: hs.length ? Math.max(...hs) : 0,
		r: pearson(hs, ls),
		twoClusters: two,
	};
}

export interface RegisterPoint {
	name: string;
	length: number;
	height: number;
	value: number;
}

/** One point per knot: cord length against knot height, for the register plot. */
export function registerPoints(cords: Cord[]): RegisterPoint[] {
	const out: RegisterPoint[] = [];
	for (const c of cords) {
		if (c.length == null) continue;
		for (const k of c.knots)
			out.push({
				name: c.name,
				length: c.length,
				height: k.pos,
				value: readValue(c),
			});
	}
	return out;
}

/** How each value is written: value → knot signature → count, e.g. 2 → "2L" → 48. */
export function knotSignatures(
	cords: Cord[],
): Map<number, Map<string, number>> {
	const out = new Map<number, Map<string, number>>();
	for (const c of cords) {
		if (!c.knots.length) continue;
		const v = readValue(c);
		const sig = [...c.knots]
			.sort((a, b) => a.pos - b.pos)
			.map((k) => `${k.n}${k.type}`)
			.join(" + ");
		if (!out.has(v)) out.set(v, new Map());
		const m = out.get(v) as Map<string, number>;
		m.set(sig, (m.get(sig) ?? 0) + 1);
	}
	return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

/** "2L at 15 cm" style text for a cord's knots, or "—" for a blank cord. */
export function knotsText(c: Cord): string {
	if (!c.knots.length) return "—";
	return c.knots.map((k) => `${k.n}${k.type} at ${k.pos} cm`).join(", ");
}

/** "23 cm, broken" style text for a cord's length and end. */
export function endText(c: Cord): string {
	const end =
		c.term === "B"
			? "broken"
			: c.term === "K"
				? "knotted end"
				: c.term === "C"
					? "cut"
					: "end unrecorded";
	return `${c.length ?? "?"} cm, ${end}`;
}

export function countBy<T>(
	xs: T[],
	key: (x: T) => string,
): Map<string, number> {
	const m = new Map<string, number>();
	for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
	return m;
}

export function colorCode(c: Cord): string {
	return c.colorParsed?.[0]?.codes[0] ?? c.color ?? "?";
}

// ----------------------------------------------------------------- KH0034

export function markers(k: Khipu): Cord[] {
	return levelOne(k).filter(isMarker);
}

export function mendedCords(k: Khipu): Cord[] {
	return levelOne(k).filter(isMended);
}

/** The six stretches of pendants between the looped markers, in KFG order. */
export function parts34(k: Khipu): Cord[][] {
	const parts: Cord[][] = [[]];
	for (const c of levelOne(k)) {
		if (isMarker(c)) parts.push([]);
		else parts[parts.length - 1].push(c);
	}
	return parts.filter((p) => p.length);
}

export interface Slot {
	cord: Cord;
	/** 0-based cycle number in KFG order */
	cycle: number;
	/** 0-based index in the template (0–2 W, 3–7 LB); 8 for the one extra LB */
	pos: number;
	/** the Aschers' position, 9 − KFG position */
	ascher: number;
	/** colour or position does not fit the template */
	off: boolean;
}

/**
 * Walk the data pendants and give each its place in the W W W LB LB LB LB LB
 * template: the index resets to 0 at each W after an LB, jumps to 3 at the
 * first LB after a W, and otherwise advances by one. p33 (a sixth LB) lands
 * at 8 and p403 (recorded "B") at a W slot; both are flagged off-template.
 */
export function templateSlots(k: Khipu): Slot[] {
	const out: Slot[] = [];
	let i = 0;
	let cycle = -1;
	let prev: string | null = null;
	for (const c of dataPendants(k)) {
		const col = colorCode(c);
		if (prev === null) {
			i = 0;
			cycle = 0;
		} else if (col === "W" && prev !== "W") {
			i = 0;
			cycle++;
		} else if (col !== prev) i = 3;
		else i++;
		const pos = Math.min(i, 7);
		out.push({
			cord: c,
			cycle,
			pos,
			ascher: ASCHER_POS[pos],
			off: i > 7 || CYCLE[pos] !== col,
		});
		prev = col;
	}
	return out;
}

export function cycles34(k: Khipu): Slot[][] {
	const by = new Map<number, Slot[]>();
	for (const s of templateSlots(k)) {
		if (!by.has(s.cycle)) by.set(s.cycle, []);
		by.get(s.cycle)?.push(s);
	}
	return [...by.values()];
}

/**
 * The Aschers numbered AS32 from the other end: their cord n is the n-th
 * level-1 cord counted back from the KFG's last pendant, skipping the five
 * markers and the five mended cords Urton added.
 */
export function ascherNumber(k: Khipu): Map<string, number> {
	const m = new Map<string, number>();
	const seq = levelOne(k)
		.filter((c) => !isMarker(c) && !isMended(c))
		.reverse();
	seq.forEach((c, i) => {
		m.set(c.name, i + 1);
	});
	return m;
}

export interface PositionRow {
	pos: number;
	colour: string;
	ascher: number;
	/** data pendants at this position */
	pendants: number;
	readable: number;
	knotted: number;
	mean: number;
	max: number;
	hist: Hist;
	withSub: number;
	subs: number;
}

/** Value and knotted share by template position, readable pendants only. */
export function positionTable34(k: Khipu): PositionRow[] {
	const cut = READ_LEN.KH0034.pendant;
	const kids = childrenOf(k);
	const rows: PositionRow[] = CYCLE.map((colour, pos) => ({
		pos,
		colour,
		ascher: ASCHER_POS[pos],
		pendants: 0,
		readable: 0,
		knotted: 0,
		mean: 0,
		max: 0,
		hist: new Map(),
		withSub: 0,
		subs: 0,
	}));
	const vals: number[][] = CYCLE.map(() => []);
	for (const s of templateSlots(k)) {
		const r = rows[s.pos];
		r.pendants++;
		const subs = kids.get(s.cord.name) ?? [];
		if (subs.length) r.withSub++;
		r.subs += subs.length;
		if (!isReadable(s.cord, cut)) continue;
		const v = readValue(s.cord);
		r.readable++;
		if (v > 0) r.knotted++;
		r.hist.set(v, (r.hist.get(v) ?? 0) + 1);
		vals[s.pos].push(v);
	}
	for (const r of rows) {
		r.mean = mean(vals[r.pos]);
		r.max = vals[r.pos].length ? Math.max(...vals[r.pos]) : 0;
		r.hist = new Map([...r.hist.entries()].sort((a, b) => a[0] - b[0]));
	}
	return rows;
}

/** The Aschers' position bounds against the values read here. */
export function ascherBoundsCheck(k: Khipu): {
	ascher: number;
	allowed: number[];
	exceptions: { cord: Cord; value: number }[];
}[] {
	const cut = READ_LEN.KH0034.pendant;
	const out = [];
	for (let a = 1; a <= 8; a++) {
		const allowed = ASCHER_AS32.bounds[a];
		const exceptions = templateSlots(k)
			.filter((s) => s.ascher === a && isReadable(s.cord, cut))
			.map((s) => ({ cord: s.cord, value: readValue(s.cord) }))
			.filter((x) => !allowed.includes(x.value));
		out.push({ ascher: a, allowed, exceptions });
	}
	return out;
}

export function childrenOf(k: Khipu): Map<string, Cord[]> {
	const m = new Map<string, Cord[]>();
	for (const c of k.cords) {
		if (!c.parent) continue;
		if (!m.has(c.parent)) m.set(c.parent, []);
		m.get(c.parent)?.push(c);
	}
	return m;
}

export interface SubStats {
	n: number;
	readable: number;
	knotted: number;
	hist: Hist;
	pendantsWith: number;
	pendantsWithTwo: number;
	maxPer: number;
	/** parent colour → [pendants with a subsidiary, pendants] */
	byParentColour: Map<string, [number, number]>;
	colours: Map<string, number>;
	register: Register;
	/** readable pendants with / without a subsidiary: knotted share */
	knottedWith: [number, number];
	knottedWithout: [number, number];
	db: { n: number; broken: number; stubs: number; unreadable: number };
	lb: { n: number; broken: number; stubs: number; unreadable: number };
}

export function subStats34(k: Khipu): SubStats {
	const cut = READ_LEN.KH0034.subsidiary;
	const subs = subsidiaries(k);
	const kids = childrenOf(k);
	const readable = subs.filter((c) => isReadable(c, cut));
	const hist = histogram(readable);
	const pend = dataPendants(k);
	const byParentColour = new Map<string, [number, number]>();
	let withTwo = 0;
	let maxPer = 0;
	for (const p of pend) {
		const n = (kids.get(p.name) ?? []).length;
		const col = colorCode(p);
		const e = byParentColour.get(col) ?? [0, 0];
		e[1]++;
		if (n) e[0]++;
		byParentColour.set(col, e);
		if (n >= 2) withTwo++;
		maxPer = Math.max(maxPer, n);
	}
	const rp = pend.filter((c) => isReadable(c, READ_LEN.KH0034.pendant));
	const withS = rp.filter((c) => (kids.get(c.name) ?? []).length > 0);
	const without = rp.filter((c) => !(kids.get(c.name) ?? []).length);
	const survival = (code: string) => {
		const xs = subs.filter((c) => colorCode(c) === code);
		return {
			n: xs.length,
			broken: xs.filter((c) => c.term === "B").length,
			stubs: xs.filter((c) => (c.length ?? 0) <= 1).length,
			unreadable: xs.filter((c) => !isReadable(c, cut)).length,
		};
	};
	return {
		n: subs.length,
		readable: readable.length,
		knotted: readable.filter((c) => readValue(c) > 0).length,
		hist,
		pendantsWith: pend.filter((p) => (kids.get(p.name) ?? []).length > 0)
			.length,
		pendantsWithTwo: withTwo,
		maxPer,
		byParentColour,
		colours: countBy(subs, (c) => c.color ?? "?"),
		register: register(subs),
		knottedWith: [withS.filter((c) => readValue(c) > 0).length, withS.length],
		knottedWithout: [
			without.filter((c) => readValue(c) > 0).length,
			without.length,
		],
		db: survival("DB"),
		lb: survival("LB"),
	};
}

export function rectoPendants(k: Khipu): Cord[] {
	return dataPendants(k).filter((c) => c.attach === "R");
}

/** Blank pendants that are unbroken yet shorter than the cut-off: kept as zeros. */
export function shortZeros34(k: Khipu): Cord[] {
	return dataPendants(k).filter(
		(c) =>
			!c.knots.length &&
			c.term !== "B" &&
			(c.length ?? 0) < READ_LEN.KH0034.pendant,
	);
}

// ----------------------------------------------------------------- KH0670

export function topCord(k: Khipu): Cord | undefined {
	return k.cords.find((c) => c.kind === "top");
}

export function artefacts(k: Khipu): Cord[] {
	return levelOne(k).filter(isArtefact);
}

/** The three parts of KH0670's primary cord: level-1 cords split at the top cord and the artefacts. */
export function parts670(k: Khipu): Cord[][] {
	const parts: Cord[][] = [[]];
	for (const c of levelOne(k)) {
		if (c.kind === "top" || isArtefact(c)) {
			if (parts[parts.length - 1].length) parts.push([]);
			continue;
		}
		parts[parts.length - 1].push(c);
	}
	return parts.filter((p) => p.length);
}

export interface Group670 {
	index: number;
	first: Cord;
	cords: Cord[];
	/** readValue, or null where the cord is unreadable */
	values: (number | null)[];
	sum: number;
	full: boolean;
	/** 0-based part of the primary cord */
	part: number;
}

/** The 45 five-cord groups, with their part and readable values. */
export function groups670(k: Khipu): Group670[] {
	const cut = READ_LEN.KH0670.pendant;
	const parts = parts670(k);
	const partOf = new Map<string, number>();
	parts.forEach((p, i) => {
		for (const c of p) partOf.set(c.name, i);
	});
	const by = new Map<number, Cord[]>();
	for (const c of dataPendants(k)) {
		const g = c.group ?? -1;
		if (!by.has(g)) by.set(g, []);
		by.get(g)?.push(c);
	}
	const out: Group670[] = [];
	for (const [gi, cords] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
		if (cords.length !== 5) continue;
		const values = cords.map((c) => (isReadable(c, cut) ? readValue(c) : null));
		out.push({
			index: gi,
			first: cords[0],
			cords,
			values,
			sum: values.reduce<number>((a, v) => a + (v ?? 0), 0),
			full: values.every((v) => v !== null),
			part: partOf.get(cords[0].name) ?? 0,
		});
	}
	return out;
}

export interface PositionRow670 {
	pos: number;
	readable: number;
	knotted: number;
	mean: number;
	hist: Hist;
}

export function positionTable670(k: Khipu): PositionRow670[] {
	const rows: PositionRow670[] = [0, 1, 2, 3, 4].map((pos) => ({
		pos,
		readable: 0,
		knotted: 0,
		mean: 0,
		hist: new Map(),
	}));
	const vals: number[][] = rows.map(() => []);
	for (const g of groups670(k)) {
		g.values.forEach((v, i) => {
			if (v === null) return;
			rows[i].readable++;
			if (v > 0) rows[i].knotted++;
			rows[i].hist.set(v, (rows[i].hist.get(v) ?? 0) + 1);
			vals[i].push(v);
		});
	}
	for (const r of rows) {
		r.mean = mean(vals[r.pos]);
		r.hist = new Map([...r.hist.entries()].sort((a, b) => a[0] - b[0]));
	}
	return rows;
}

/**
 * Five values that never increase and take at least three distinct values:
 * the KFG's "Ascher decreasing group". Unreadable cords count as 0, as the
 * KFG has them, so its two flags on KH0670 are reproduced.
 */
export function isDecreasing(values: (number | null)[]): boolean {
	const v = values.map((x) => x ?? 0);
	for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) return false;
	return new Set(v).size >= 3;
}

/** A group that splits 2|3 or 3|2 into equal halves of at least 3 (the KFG's "group sum band"). */
export function sumBandSplit(values: (number | null)[]): number | null {
	if (values.some((v) => v === null)) return null;
	const v = values as number[];
	for (const at of [2, 3]) {
		const a = v.slice(0, at).reduce((x, y) => x + y, 0);
		const b = v.slice(at).reduce((x, y) => x + y, 0);
		if (a === b && a >= 3) return at;
	}
	return null;
}

export interface TopCordCheck {
	cord: Cord;
	value: number;
	pendantTotal: number;
	byPart: number[];
	deficit: number;
	/** contiguous runs of pendants (in recorded order) that sum to the top cord */
	runs: number;
	unreadable: number;
	readableMean: number;
	expectedOnUnreadable: number;
	perSpacingGroup: number;
	perGroup: number;
}

/** Is the top cord a total of anything that survives? */
export function topCordCheck(k: Khipu): TopCordCheck | null {
	const top = topCord(k);
	if (!top) return null;
	const cut = READ_LEN.KH0670.pendant;
	const value = top.value ?? 0;
	const pend = dataPendants(k);
	const vals = pend.map(readValue);
	const pendantTotal = vals.reduce((a, b) => a + b, 0);
	let runs = 0;
	for (let i = 0; i < vals.length; i++) {
		let s = 0;
		for (let j = i; j < vals.length && s < value; j++) {
			s += vals[j];
			if (s === value) runs++;
		}
	}
	const readable = pend.filter((c) => isReadable(c, cut));
	const readableMean = mean(readable.map(readValue));
	const unreadable = pend.length - readable.length;
	return {
		cord: top,
		value,
		pendantTotal,
		byPart: parts670(k).map((p) => p.reduce((a, c) => a + readValue(c), 0)),
		deficit: value - pendantTotal,
		runs,
		unreadable,
		readableMean,
		expectedOnUnreadable: readableMean * unreadable,
		perSpacingGroup: value / k.groups.length,
		perGroup: value / groups670(k).length,
	};
}

/** Twist counts of a set of cords: S / Z / U. */
export function twistCounts(cords: Cord[]): Map<string, number> {
	return countBy(cords, (c) => c.twist ?? "U");
}

/** Attachment counts of a set of cords: V / R / U. */
export function attachCounts(cords: Cord[]): Map<string, number> {
	return countBy(cords, (c) => c.attach ?? "U");
}

// ----------------------------------------------------------------- shuffles

/** mulberry32: a small seeded generator so the page's shuffles are reproducible. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffleInPlace<T>(xs: T[], next: () => number): void {
	for (let i = xs.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[xs[i], xs[j]] = [xs[j], xs[i]];
	}
}

export interface ShuffleResult {
	observed: number;
	mean: number;
	/** share of shuffles with a statistic at least as large */
	pGe: number;
	pLe: number;
	n: number;
}

/**
 * Compare a statistic of a sequence with the same statistic over SHUFFLES
 * permutations of it. `permute` may restrict the shuffle (within a stratum);
 * by default the whole sequence is shuffled freely.
 */
export function shuffleTest<T>(
	seq: T[],
	stat: (xs: T[]) => number,
	permute?: (xs: T[], next: () => number) => void,
	seed = SEED,
	n = SHUFFLES,
): ShuffleResult {
	const next = rng(seed);
	const observed = stat(seq);
	const pool = [...seq];
	let sum = 0;
	let ge = 0;
	let le = 0;
	for (let i = 0; i < n; i++) {
		(permute ?? shuffleInPlace)(pool, next);
		const s = stat(pool);
		sum += s;
		if (s >= observed) ge++;
		if (s <= observed) le++;
	}
	return { observed, mean: sum / n, pGe: ge / n, pLe: le / n, n };
}

/** Shuffle values only among positions that share a stratum label. */
export function withinStrata<T>(strata: number[]) {
	return (xs: T[], next: () => number) => {
		const idx = new Map<number, number[]>();
		strata.forEach((s, i) => {
			if (!idx.has(s)) idx.set(s, []);
			idx.get(s)?.push(i);
		});
		for (const ids of idx.values()) {
			const vals = ids.map((i) => xs[i]);
			shuffleInPlace(vals, next);
			ids.forEach((i, j) => {
				xs[i] = vals[j];
			});
		}
	};
}

/** Chi-square of a bins × class table; classes are min(value, 2). */
export function chiSquare(
	bins: number[],
	values: number[],
	cls = (v: number) => Math.min(v, 2),
): number {
	const tot = values.length;
	const colTot = new Map<number, number>();
	const rowTot = new Map<number, number>();
	const cell = new Map<string, number>();
	for (let i = 0; i < tot; i++) {
		const c = cls(values[i]);
		colTot.set(c, (colTot.get(c) ?? 0) + 1);
		rowTot.set(bins[i], (rowTot.get(bins[i]) ?? 0) + 1);
		const key = `${bins[i]}:${c}`;
		cell.set(key, (cell.get(key) ?? 0) + 1);
	}
	let x2 = 0;
	for (const [b, nb] of rowTot)
		for (const [c, nc] of colTot) {
			const e = (nb * nc) / tot;
			if (!e) continue;
			const o = cell.get(`${b}:${c}`) ?? 0;
			x2 += (o - e) ** 2 / e;
		}
	return x2;
}

export function variance(xs: number[]): number {
	return sd(xs) ** 2;
}

export interface Tests34 {
	position: ShuffleResult;
	colour: ShuffleResult;
	cycleVariance: ShuffleResult;
	adjacentEqual: ShuffleResult;
	runs: ShuffleResult;
}

/**
 * Column against row on KH0034. Position and colour are tested as chi-square
 * of position × value class against a free shuffle of the readable values;
 * the cycles as the variance of their mean values (cycles with at least six
 * readable pendants); serial structure as adjacent equal pairs and the
 * number of runs of blank and knotted cords.
 */
export function tests34(k: Khipu): Tests34 {
	const cut = READ_LEN.KH0034.pendant;
	const slots = templateSlots(k).filter((s) => isReadable(s.cord, cut));
	const values = slots.map((s) => readValue(s.cord));
	const pos = slots.map((s) => s.pos);
	const col = slots.map((s) => (s.pos < 3 ? 0 : 1));
	const cyc = slots.map((s) => s.cycle);
	const cycleSizes = new Map<number, number>();
	for (const c of cyc) cycleSizes.set(c, (cycleSizes.get(c) ?? 0) + 1);
	const cycleVar = (vals: number[]) => {
		const sums = new Map<number, number>();
		vals.forEach((v, i) => {
			sums.set(cyc[i], (sums.get(cyc[i]) ?? 0) + v);
		});
		const means: number[] = [];
		for (const [c, s] of sums) {
			const n = cycleSizes.get(c) ?? 0;
			if (n >= 6) means.push(s / n);
		}
		return variance(means);
	};
	return {
		position: shuffleTest(values, (v) => chiSquare(pos, v)),
		colour: shuffleTest(values, (v) => chiSquare(col, v)),
		cycleVariance: shuffleTest(values, cycleVar),
		adjacentEqual: shuffleTest(values, adjacentEqual),
		runs: shuffleTest(values, nRuns),
	};
}

export function adjacentEqual(xs: number[]): number {
	let n = 0;
	for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) n++;
	return n;
}

export function nRuns(xs: number[]): number {
	if (!xs.length) return 0;
	let n = 1;
	for (let i = 1; i < xs.length; i++) if (xs[i] > 0 !== xs[i - 1] > 0) n++;
	return n;
}

export function longestRun(xs: number[], pred: (v: number) => boolean): number {
	let best = 0;
	let cur = 0;
	for (const v of xs) {
		cur = pred(v) ? cur + 1 : 0;
		best = Math.max(best, cur);
	}
	return best;
}

export interface Tests670 {
	position: ShuffleResult;
	part: ShuffleResult;
	groupVariance: ShuffleResult;
	groupVarianceWithinPart: ShuffleResult;
	sumBands: ShuffleResult;
	decreasing: ShuffleResult;
	patterns: ShuffleResult;
	patternsWithinGroup: ShuffleResult;
	longestKnotted: ShuffleResult;
	fullGroups: number;
}

/**
 * Row against column on KH0670. Position in the five-cord group and part of
 * the primary cord as chi-square of bin × value class; the groups as the
 * variance of the fully readable group sums, against a free shuffle and a
 * shuffle within each part; the KFG's sum bands and decreasing groups, and
 * repeated five-value patterns, against a free shuffle and a shuffle that
 * keeps each group's own five values.
 */
export function tests670(k: Khipu): Tests670 {
	const full = groups670(k).filter((g) => g.full);
	const cut = READ_LEN.KH0670.pendant;
	const parts = parts670(k);
	const partOf = new Map<string, number>();
	parts.forEach((p, i) => {
		for (const c of p) partOf.set(c.name, i);
	});
	// all readable pendants in order, for position / part / runs
	const all = groups670(k).flatMap((g) =>
		g.cords
			.map((c, i) => ({ c, i, part: g.part }))
			.filter((x) => isReadable(x.c, cut)),
	);
	const values = all.map((x) => readValue(x.c));
	const posBins = all.map((x) => x.i);
	const partBins = all.map((x) => x.part);
	// fully readable groups as a flat sequence of 5 × n values
	const flat = full.flatMap((g) => g.values as number[]);
	const groupIdx = flat.map((_, i) => Math.floor(i / 5));
	const groupPart = full.flatMap((g) => [
		g.part,
		g.part,
		g.part,
		g.part,
		g.part,
	]);
	const chunks = (v: number[]) => {
		const out: number[][] = [];
		for (let i = 0; i < v.length; i += 5) out.push(v.slice(i, i + 5));
		return out;
	};
	const gVar = (v: number[]) =>
		variance(chunks(v).map((g) => g.reduce((a, b) => a + b, 0)));
	const bands = (v: number[]) =>
		chunks(v).filter((g) => sumBandSplit(g) !== null).length;
	const decr = (v: number[]) => chunks(v).filter(isDecreasing).length;
	const patterns = (v: number[]) => {
		const seen = new Map<string, number>();
		for (const g of chunks(v)) {
			const key = g.join(",");
			seen.set(key, (seen.get(key) ?? 0) + 1);
		}
		let n = 0;
		for (const c of seen.values()) if (c > 1) n += c - 1;
		return n;
	};
	return {
		position: shuffleTest(values, (v) => chiSquare(posBins, v)),
		part: shuffleTest(values, (v) => chiSquare(partBins, v)),
		groupVariance: shuffleTest(flat, gVar),
		groupVarianceWithinPart: shuffleTest(flat, gVar, withinStrata(groupPart)),
		sumBands: shuffleTest(flat, bands),
		decreasing: shuffleTest(flat, decr),
		patterns: shuffleTest(flat, patterns),
		patternsWithinGroup: shuffleTest(flat, patterns, withinStrata(groupIdx)),
		longestKnotted: shuffleTest(values, (v) => longestRun(v, (x) => x > 0)),
		fullGroups: full.length,
	};
}

export function pText(p: number): string {
	if (p < 0.001) return "P < 0.001";
	if (p < 0.01) return "P < 0.01";
	return `P = ${p.toFixed(2)}`;
}

// ----------------------------------------------------------------- corpus

export interface Profile {
	id: string;
	alias: string;
	museum: string;
	provenance: string;
	pendants: number;
	subsidiaries: number;
	/** knotted cords at every level, top cords excluded */
	knotted: number;
	shareLe5: number;
	shareLe2: number;
	colours: number;
	/** commonest group sizes, e.g. "3, 5" */
	groupSizes: string;
	register: Register;
}

/**
 * The corpus screen's profile of a khipu: among cords with a value above 0
 * (top cords excluded), the share reading 5 or less and 2 or less, with the
 * structure that says whether it is built like the two here. The screen
 * itself (every khipu with 100 or more pendants) is run in
 * scripts/registers_analysis.py; the page recomputes the profiles of its hits.
 */
export function profile(k: Khipu): Profile {
	const cords = k.cords.filter((c) => c.kind !== "top");
	const knotted = cords.filter((c) => kfgValue(c) > 0);
	const le5 = knotted.filter((c) => kfgValue(c) <= 5).length;
	const le2 = knotted.filter((c) => kfgValue(c) <= 2).length;
	const sizes = countBy(k.groups, (g) => String(g.n));
	const top = [...sizes.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 2)
		.map(([s, n]) => `${n} × ${s}`)
		.join(", ");
	return {
		id: k.id,
		alias: k.aliases[0] ?? k.id,
		museum: k.museum.canonical ?? k.museum.name ?? "—",
		provenance: k.provenance ?? "none recorded",
		pendants: k.cords.filter((c) => c.level === 1 && c.kind !== "top").length,
		subsidiaries: k.cords.filter((c) => c.level > 1).length,
		knotted: knotted.length,
		shareLe5: knotted.length ? le5 / knotted.length : 0,
		shareLe2: knotted.length ? le2 / knotted.length : 0,
		colours: k.stats.nColors,
		groupSizes: top,
		register: register(
			k.cords.filter((c) => c.level === 1 && c.kind !== "top"),
		),
	};
}

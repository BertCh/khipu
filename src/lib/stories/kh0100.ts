import type { Cord, Khipu, KhipuLike, Knot } from "#/lib/khipu/types";

/**
 * Derivations for the story "Knots that are not decimal" (KH0100 / AS087,
 * Museum Fünf Kontinente, Munich, G-3304). The Aschers declined to assign
 * values to this khipu because its knot clusters do not follow the base-ten
 * positional system; the Khipu Field Guide's workbook carries a value on
 * every cord anyway. The story tests each cord against the Inka decimal
 * grammar, reproduces the mechanical rule behind the KFG values, recounts
 * the Aschers' nineteen knot-cluster orders, and asks what on the khipu is
 * patterned if the knots are not numbers.
 *
 * Everything here is computed from the recorded cords. The only constants
 * are the ones that define the reading: the grammar predicate, the KFG rule,
 * the ten-turn threshold for a "big" long knot, the pendant ordinal at which
 * attachment flips from recto to verso, and the two figures transcribed from
 * the Aschers' note. Corpus-wide figures are literals from
 * scripts/kh0100_analysis.py §9 and are gathered in CORPUS.
 *
 * Note on positions: the workbook records no pendant positions along the
 * primary cord (the OKR holds attach_pos 0 for every pendant), so Cord.pos
 * on level-1 cords is a build artefact and is never used here. Knot heights
 * along each pendant (Knot.pos) are recorded and are used throughout.
 */

export const KHIPU_ID = "KH0100";

/** The Aschers' figures, transcribed from their note on AS087 (via the KFG page). */
export const ASCHER_ORDERS = 19;
export const ASCHER_BIG_KNOTS = 13;

/** A long knot of this many turns or more lies outside the decimal grammar's 2–9. */
export const BIG = 10;
/** Threshold used only for the twist comparison of high-turn long knots. */
export const HIGH_TURNS = 8;
/** First pendant ordinal after which attachment is (almost) always verso. */
export const SPLIT_AT = 50;
/** Two adjacent single-knot clusters closer than this might be one cluster. */
export const CLOSE_CM = 3;

/**
 * Transcribed from the KFG workbook's ChangeLog sheet (K. Thompson): cords
 * whose long knots were re-encoded from 1L/2L/3L to 11L/12L/13L to match the
 * recorded values, on 11/09/2023 and on 06/26/2025.
 */
export const KFG_REENCODED_2023 = ["p3", "p9", "p14s1", "p22", "p27s1", "p86"];
export const KFG_REENCODED_2025 = ["p56"];

/** Corpus-wide figures from scripts/kh0100_analysis.py §9 (684 workbooks). */
export const CORPUS = {
	khipus: 684,
	knottedCords: 43262,
	sClustersTenPlus: 17,
	sClustersTenPlusKhipus: 9,
	bigLongKnots: 168,
	bigLongKnotKhipus: 19,
	longAboveSingleCords: 493,
	longAboveSingleKhipus: 71,
	twoLongCords: 1825,
	twoLongKhipus: 188,
	illegalCords: 3709,
	illegalKhipus: 316,
	illegalShareMedian: 0.01,
	illegalShareRank: 21,
	illegalShareRanked: 454,
	longAboveSinglePer100: 1.14,
	bigLongPer100: 0.39,
	nonZeroValues: 43211,
	rankOf11115: 124,
	valuesTenThousandPlus: 151,
	valuesThousandPlus: 1500,
	khipusWithBigButNoLongAbove: 8,
	/** knotted cords with two or more single-knot clusters … */
	multiSingleCords: 5574,
	/** … of which every cluster is one knot (the KFG reads 110, 1110 …) */
	repunitCords: 173,
	/** hypergeometric tail: P(≥ 10 such cords among KH0100's 24, drawing from the rest) */
	repunitTailP: 4.99e-10,
} as const;

/** The only khipus with ten or more multi-cluster single-knot cords that come close (script §9). */
export const CORPUS_REPUNIT_CLOSEST = [
	{ id: "KH0416", repunit: 14, multi: 14 },
	{ id: "KH0453", repunit: 6, multi: 14 },
	{ id: "KH0100", repunit: 10, multi: 24 },
	{ id: "KH0386", repunit: 5, multi: 14 },
];

export interface CorpusRow {
	id: string;
	museum: string;
	provenance: string;
	knotted: number;
	longAbove: number;
	big: number;
}

/** Khipus ranked by long-above-single cords (script §9). */
export const CORPUS_FAMILY: CorpusRow[] = [
	{
		id: "KH0001",
		museum: "American Museum of Natural History",
		provenance: "Chuquitanta",
		knotted: 156,
		longAbove: 96,
		big: 32,
	},
	{
		id: "KH0431",
		museum: "Ethnologisches Museum, Berlin",
		provenance: "Pachacamac",
		knotted: 222,
		longAbove: 74,
		big: 29,
	},
	{
		id: "KH0676",
		museum: "Brooklyn Museum",
		provenance: "Ancón (purported)",
		knotted: 137,
		longAbove: 43,
		big: 5,
	},
	{
		id: "KH0015",
		museum: "British Museum",
		provenance: "—",
		knotted: 75,
		longAbove: 42,
		big: 6,
	},
	{
		id: "KH0108",
		museum: "Museum für Völkerkunde, Munich",
		provenance: "Pachacamac",
		knotted: 196,
		longAbove: 38,
		big: 34,
	},
	{
		id: "KH0441",
		museum: "Ethnologisches Museum, Berlin",
		provenance: "Pachacamac",
		knotted: 155,
		longAbove: 29,
		big: 8,
	},
	{
		id: "KH0415",
		museum: "American Museum of Natural History",
		provenance: "Chuquitanta",
		knotted: 84,
		longAbove: 28,
		big: 0,
	},
	{
		id: "KH0100",
		museum: "Museum für Völkerkunde, Munich",
		provenance: "Peru",
		knotted: 96,
		longAbove: 19,
		big: 15,
	},
];

export interface MunichRow {
	id: string;
	illegal: number;
	knotted: number;
	longAbove: number;
	big: number;
}

/**
 * The other Munich Gaffron khipus the Aschers associated with this one
 * (their note, in the OKR text: "AS87, 89, 90, 92, 93, 94 are associated in
 * that the Museum designates them all as donated by Gaffron", i.e. KH0100,
 * KH0102, KH0103, KH0105, KH0106, KH0107), plus KH0108 (AS095), which the
 * note names separately as "also donated by Gaffron". The KFG page renders
 * the same list as KH0110 and KH0112, but those are AS097 and AS099 in
 * Berlin (VA 42553, VA 42526), a mis-mapping, so they are not included.
 * Figures from script §9; illegal = knotted cords not legal top-down.
 */
export const MUNICH_GAFFRON: MunichRow[] = [
	{ id: "KH0102", illegal: 1, knotted: 12, longAbove: 0, big: 0 },
	{ id: "KH0103", illegal: 42, knotted: 58, longAbove: 0, big: 0 },
	{ id: "KH0105", illegal: 0, knotted: 50, longAbove: 0, big: 0 },
	{ id: "KH0106", illegal: 1, knotted: 57, longAbove: 0, big: 0 },
	{ id: "KH0107", illegal: 0, knotted: 38, longAbove: 0, big: 0 },
	{ id: "KH0108", illegal: 121, knotted: 196, longAbove: 38, big: 34 },
];

// ---------------------------------------------------------------------------
// basics

/** A cord's knots from the attachment downward. */
export function sortedKnots(c: Cord): Knot[] {
	return [...c.knots].sort((a, b) => a.pos - b.pos);
}

export function isKnotted(c: Cord): boolean {
	return c.knots.length > 0;
}

export function knottedCords(khipu: Khipu): Cord[] {
	return khipu.cords.filter(isKnotted);
}

export function pendants(khipu: Khipu): Cord[] {
	return khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
}

export function subsidiaries(khipu: Khipu): Cord[] {
	return khipu.cords.filter((c) => c.level > 1);
}

export function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

/** Level-1 pendants whose ordinal is below / at-or-above SPLIT_AT. */
export function halvesOf(khipu: Khipu): [Cord[], Cord[]] {
	const p = pendants(khipu);
	return [
		p.filter((c) => c.ordinal < SPLIT_AT),
		p.filter((c) => c.ordinal >= SPLIT_AT),
	];
}

/** Plain white: a single colour code W with no operator. */
export function isPlainWhite(c: Cord): boolean {
	const seg = c.colorParsed?.[0];
	return !!seg && seg.codes.length === 1 && seg.codes[0] === "W";
}

export interface Stats {
	n: number;
	min: number;
	median: number;
	max: number;
}

export function stats(xs: number[]): Stats {
	if (xs.length === 0) return { n: 0, min: 0, median: 0, max: 0 };
	const s = [...xs].sort((a, b) => a - b);
	const mid = s.length >> 1;
	const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
	return { n: s.length, min: s[0], median, max: s[s.length - 1] };
}

export function pearson(xs: number[], ys: number[]): number {
	const n = Math.min(xs.length, ys.length);
	if (n < 2) return 0;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Counts of a key over a list, sorted by count descending then key. */
export function tally<T extends string | number>(
	keys: T[],
): { key: T; n: number }[] {
	const m = new Map<T, number>();
	for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
	return [...m.entries()]
		.map(([key, n]) => ({ key, n }))
		.sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ---------------------------------------------------------------------------
// cluster sizes and the "big" long knots

/** Distribution of n over knots of one type, ascending by n. */
export function clusterSizes(
	cords: Cord[],
	type: Knot["type"],
): { size: number; n: number }[] {
	const m = new Map<number, number>();
	for (const c of cords)
		for (const k of c.knots)
			if (k.type === type) m.set(k.n, (m.get(k.n) ?? 0) + 1);
	return [...m.entries()]
		.map(([size, n]) => ({ size, n }))
		.sort((a, b) => a.size - b.size);
}

export function largestCluster(cords: Cord[], type: Knot["type"]): number {
	return cords.reduce(
		(a, c) =>
			c.knots.reduce((b, k) => (k.type === type ? Math.max(b, k.n) : b), a),
		0,
	);
}

/** Knots of a type counted as entries (a long knot is one entry). */
export function knotEntries(cords: Cord[], type: Knot["type"]): number {
	return cords.reduce(
		(a, c) => a + c.knots.filter((k) => k.type === type).length,
		0,
	);
}

/** Sum of n over knots of a type (single knots in clusters, turns of long knots). */
export function knotUnits(cords: Cord[], type: Knot["type"]): number {
	return cords.reduce(
		(a, c) =>
			a + c.knots.filter((k) => k.type === type).reduce((b, k) => b + k.n, 0),
		0,
	);
}

export interface BigKnot {
	cord: Cord;
	knot: Knot;
}

/** Long knots of BIG or more turns, in cord order then height. */
export function bigLongKnots(cords: Cord[], min = BIG): BigKnot[] {
	const out: BigKnot[] = [];
	for (const c of cords)
		for (const k of sortedKnots(c))
			if (k.type === "L" && k.n >= min) out.push({ cord: c, knot: k });
	return out;
}

// ---------------------------------------------------------------------------
// knot-type orders and words

/** The Aschers' "knot cluster order": knot types top to bottom, e.g. "L S". */
export function typeSignature(c: Cord): string {
	return sortedKnots(c)
		.map((k) => k.type)
		.join(" ");
}

/** The cord's knots as a word, e.g. "2L 1S" (n = turns for L, count for S/E). */
export function word(c: Cord): string {
	return sortedKnots(c)
		.map((k) => `${k.n}${k.type}`)
		.join(" ");
}

export function signatureCounts(cords: Cord[]): { key: string; n: number }[] {
	return tally(cords.filter(isKnotted).map(typeSignature));
}

/** How many distinct knot-type orders the knotted cords show (the Aschers' count). */
export function distinctOrders(cords: Cord[]): number {
	return new Set(cords.filter(isKnotted).map(typeSignature)).size;
}

/** Knot direction per cluster, most common first. */
export function knotDirections(cords: Cord[]): { key: string; n: number }[] {
	return tally(cords.flatMap((c) => c.knots.map((k) => k.dir || "?")));
}

/** Longest run of consecutive cords passing, and failing, a test. */
export function longestRuns(
	cords: Cord[],
	test: (c: Cord) => boolean,
): { pass: number; fail: number } {
	let pass = 0;
	let fail = 0;
	let run = 0;
	let last: boolean | null = null;
	for (const c of cords) {
		const v = test(c);
		run = v === last ? run + 1 : 1;
		last = v;
		if (v) pass = Math.max(pass, run);
		else fail = Math.max(fail, run);
	}
	return { pass, fail };
}

/** Names of the cords passing a test, in record order. */
export function names(cords: Cord[], test: (c: Cord) => boolean): string[] {
	return cords.filter(test).map((c) => c.name);
}

export function wordCounts(cords: Cord[]): { key: string; n: number }[] {
	return tally(cords.filter(isKnotted).map(word));
}

export interface OrderPair {
	a: string;
	b: string;
	na: number;
	nb: number;
}

/** Words made of the same knots in both orders, e.g. "1S 2L" and "2L 1S". */
export function bothOrders(cords: Cord[]): OrderPair[] {
	const counts = new Map(wordCounts(cords).map((w) => [w.key, w.n]));
	const out: OrderPair[] = [];
	const seen = new Set<string>();
	for (const [w, n] of counts) {
		const parts = w.split(" ");
		if (parts.length !== 2) continue;
		const rev = [parts[1], parts[0]].join(" ");
		if (rev === w || seen.has(rev) || !counts.has(rev)) continue;
		seen.add(w);
		const [a, b] = n >= (counts.get(rev) ?? 0) ? [w, rev] : [rev, w];
		out.push({ a, b, na: counts.get(a) ?? 0, nb: counts.get(b) ?? 0 });
	}
	return out.sort((x, y) => y.na + y.nb - (x.na + x.nb));
}

/**
 * A long knot sits strictly higher on the cord than a single-knot cluster.
 * Strict, so two knots recorded at the same height count as neither above
 * the other (this is the definition behind the corpus literals in CORPUS).
 */
export function longAboveSingle(c: Cord): boolean {
	return c.knots.some(
		(k) =>
			k.type === "L" && c.knots.some((j) => j.type === "S" && k.pos < j.pos),
	);
}

export function hasTwoLong(c: Cord): boolean {
	return c.knots.filter((k) => k.type === "L").length >= 2;
}

/** A figure-eight sits strictly higher on the cord than some other knot. */
export function eightAboveOther(c: Cord): boolean {
	return c.knots.some(
		(k) => k.type === "E" && c.knots.some((j) => k.pos < j.pos),
	);
}

export function singlesOnly(c: Cord): boolean {
	return isKnotted(c) && c.knots.every((k) => k.type === "S");
}

/** Hyland's "nether knot": any knot strictly below the first long or figure-eight knot. */
export function hasNetherKnot(c: Cord): boolean {
	const first = sortedKnots(c).find((k) => k.type === "L" || k.type === "E");
	return !!first && c.knots.some((k) => k.pos > first.pos);
}

// ---------------------------------------------------------------------------
// the Inka decimal grammar

export type Violation =
	| "legal"
	| "S cluster over 9"
	| "L turns outside 2–9"
	| "two units knots"
	| "units knot above an S cluster"
	| "other knot type";

/**
 * Inka convention read from the attachment down: single-knot clusters of
 * 1–9 in descending places, then at most one units knot at the bottom, a
 * long knot of 2–9 turns or one figure-eight. Returns the first violation.
 */
export function decimalLegal(knots: Knot[]): Violation {
	for (const k of knots) {
		if (k.type === "S" && k.n > 9) return "S cluster over 9";
		if (k.type === "L" && (k.n < 2 || k.n > 9)) return "L turns outside 2–9";
	}
	const types = knots.map((k) => k.type);
	if (types.some((t) => t !== "S" && t !== "L" && t !== "E"))
		return "other knot type";
	const units = types.filter((t) => t === "L" || t === "E");
	if (units.length > 1) return "two units knots";
	if (units.length && types[types.length - 1] === "S")
		return "units knot above an S cluster";
	return "legal";
}

export type Legality = "both" | "top-down only" | "bottom-up only" | "neither";

export function legality(c: Cord): Legality {
	const ks = sortedKnots(c);
	const down = decimalLegal(ks) === "legal";
	const up = decimalLegal([...ks].reverse()) === "legal";
	if (down && up) return "both";
	if (down) return "top-down only";
	if (up) return "bottom-up only";
	return "neither";
}

export function legalTopDown(c: Cord): boolean {
	return decimalLegal(sortedKnots(c)) === "legal";
}

export interface GrammarTest {
	knotted: number;
	topDown: number;
	bottomUp: number;
	both: number;
	topDownOnly: number;
	bottomUpOnly: number;
	neither: number;
	/** first violation top-down, most frequent first */
	violations: { key: Violation; n: number }[];
}

export function grammarTest(cords: Cord[]): GrammarTest {
	const ks = cords.filter(isKnotted);
	const l = ks.map(legality);
	const count = (x: Legality) => l.filter((v) => v === x).length;
	const both = count("both");
	const topDownOnly = count("top-down only");
	const bottomUpOnly = count("bottom-up only");
	return {
		knotted: ks.length,
		topDown: both + topDownOnly,
		bottomUp: both + bottomUpOnly,
		both,
		topDownOnly,
		bottomUpOnly,
		neither: count("neither"),
		violations: tally(
			ks.map((c) => decimalLegal(sortedKnots(c))).filter((v) => v !== "legal"),
		),
	};
}

// ---------------------------------------------------------------------------
// the KFG's rule

export interface KfgTerm {
	knot: Knot;
	/** what the rule assigns this knot */
	term: number;
}

/**
 * The rule behind the workbook values: single-knot clusters ranked from the
 * lowest one take 10, 100, 1000 …; long and figure-eight knots add their
 * turn or knot count wherever they sit on the cord.
 */
export function kfgTerms(c: Cord): KfgTerm[] {
	const ks = sortedKnots(c);
	const singles = ks.filter((k) => k.type === "S").length;
	let rank = singles;
	return ks.map((knot) => {
		if (knot.type === "S") {
			rank -= 1;
			return { knot, term: knot.n * 10 ** (rank + 1) };
		}
		return { knot, term: knot.n };
	});
}

export function kfgReading(c: Cord): number {
	return kfgTerms(c).reduce((a, t) => a + t.term, 0);
}

export interface RuleCheck {
	cords: number;
	matches: number;
	mismatches: { cord: Cord; recorded: number; rule: number }[];
}

/** How many recorded values the rule reproduces. */
export function kfgRuleCheck(cords: Cord[]): RuleCheck {
	const mismatches: RuleCheck["mismatches"] = [];
	for (const c of cords) {
		const rule = kfgReading(c);
		if ((c.value ?? 0) !== rule)
			mismatches.push({ cord: c, recorded: c.value ?? 0, rule });
	}
	return {
		cords: cords.length,
		matches: cords.length - mismatches.length,
		mismatches,
	};
}

/** Cords by recorded value, largest first. */
export function largestValues(cords: Cord[], n: number): Cord[] {
	return [...cords]
		.filter((c) => c.value != null)
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
		.slice(0, n);
}

/** Cords with a recorded value that are not legal decimal cords top-down. */
export function valuedButIllegal(cords: Cord[]): number {
	return cords.filter(
		(c) => isKnotted(c) && c.value != null && !legalTopDown(c),
	).length;
}

/** Sum of two long knots' turns on cords that carry two or more. */
export function twoLongSums(cords: Cord[]): { cord: Cord; turns: number[] }[] {
	return cords.filter(hasTwoLong).map((c) => ({
		cord: c,
		turns: sortedKnots(c)
			.filter((k) => k.type === "L")
			.map((k) => k.n),
	}));
}

export interface ClosePair {
	cord: Cord;
	a: Knot;
	b: Knot;
	gap: number;
	/** place value the workbook gave each knot (its recorded value / n) */
	placeA: number;
	placeB: number;
}

/** Adjacent single-knot clusters closer than `within` cm, with the places they were read as. */
export function closePairs(cords: Cord[], within = CLOSE_CM): ClosePair[] {
	const out: ClosePair[] = [];
	for (const c of cords) {
		const terms = kfgTerms(c);
		for (let i = 1; i < terms.length; i++) {
			const a = terms[i - 1];
			const b = terms[i];
			if (a.knot.type !== "S" || b.knot.type !== "S") continue;
			const gap = b.knot.pos - a.knot.pos;
			if (gap >= within) continue;
			out.push({
				cord: c,
				a: a.knot,
				b: b.knot,
				gap,
				placeA: (a.knot.value ?? a.term) / a.knot.n,
				placeB: (b.knot.value ?? b.term) / b.knot.n,
			});
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// repunits: cords whose every cluster is one single knot

/** Two or more single-knot clusters on the cord. */
export function hasMultiSingle(c: Cord): boolean {
	return c.knots.filter((k) => k.type === "S").length >= 2;
}

/** Every knot on the cord is a lone single knot, and there are at least two: the KFG reads 110, 1110 … */
export function isRepunit(c: Cord): boolean {
	return (
		c.knots.length >= 2 && c.knots.every((k) => k.type === "S" && k.n === 1)
	);
}

export interface RepunitTest {
	multi: Cord[];
	repunit: Cord[];
	share: number;
}

export function repunitTest(cords: Cord[]): RepunitTest {
	const multi = cords.filter(hasMultiSingle);
	const repunit = multi.filter(isRepunit);
	return {
		multi,
		repunit,
		share: multi.length ? repunit.length / multi.length : 0,
	};
}

// ---------------------------------------------------------------------------
// alternative counts

export interface AltCounts {
	turns: Stats;
	knots: Stats;
	clustersPerCord: { key: number; n: number }[];
	distinctWords: number;
	wordsOnce: number;
}

export function altCounts(cords: Cord[]): AltCounts {
	const ks = cords.filter(isKnotted);
	const words = wordCounts(ks);
	return {
		turns: stats(ks.map((c) => c.knots.reduce((a, k) => a + k.n, 0))),
		knots: stats(
			ks.map((c) =>
				c.knots.reduce((a, k) => a + (k.type === "L" ? 1 : k.n), 0),
			),
		),
		clustersPerCord: tally(ks.map((c) => c.knots.length)).sort(
			(a, b) => a.key - b.key,
		),
		distinctWords: words.length,
		wordsOnce: words.filter((w) => w.n === 1).length,
	};
}

// ---------------------------------------------------------------------------
// knot heights

export interface Heights {
	top: Stats;
	lowest: Stats;
	gaps: Stats;
	/** single-knot clusters by the place the workbook's knot value gives them */
	byPlace: { place: number; heights: number[]; stats: Stats }[];
	long: Stats;
	eight: Stats;
	/** Pearson r between cord length and the height of the topmost knot */
	rLengthTop: number;
	lowestFraction: Stats;
}

export function heights(cords: Cord[]): Heights {
	const ks = cords.filter(isKnotted);
	const tops = ks.map((c) => sortedKnots(c)[0].pos);
	const lows = ks.map((c) => sortedKnots(c).at(-1)?.pos ?? 0);
	const gaps: number[] = [];
	for (const c of ks) {
		const s = sortedKnots(c);
		for (let i = 1; i < s.length; i++) gaps.push(s[i].pos - s[i - 1].pos);
	}
	const byPlaceMap = new Map<number, number[]>();
	const longs: number[] = [];
	const eights: number[] = [];
	for (const c of ks)
		for (const t of kfgTerms(c)) {
			if (t.knot.type === "S") {
				// the recorded knot value where there is one (p39 was entered by
				// hand as 10 + 10), else the rule's term
				const place = (t.knot.value ?? t.term) / t.knot.n;
				if (!byPlaceMap.has(place)) byPlaceMap.set(place, []);
				byPlaceMap.get(place)?.push(t.knot.pos);
			} else if (t.knot.type === "L") longs.push(t.knot.pos);
			else if (t.knot.type === "E") eights.push(t.knot.pos);
		}
	const withLength = ks.filter((c) => c.length != null);
	return {
		top: stats(tops),
		lowest: stats(lows),
		gaps: stats(gaps),
		byPlace: [...byPlaceMap.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([place, hs]) => ({ place, heights: hs, stats: stats(hs) })),
		long: stats(longs),
		eight: stats(eights),
		rLengthTop: pearson(
			withLength.map((c) => c.length ?? 0),
			withLength.map((c) => sortedKnots(c)[0].pos),
		),
		lowestFraction: stats(
			withLength.map(
				(c) => (sortedKnots(c).at(-1)?.pos ?? 0) / Math.max(1, c.length ?? 1),
			),
		),
	};
}

// ---------------------------------------------------------------------------
// cord construction

export interface Run {
	attach: string;
	from: number;
	to: number;
	n: number;
}

/** Consecutive pendants sharing an attachment side. */
export function attachmentRuns(khipu: Khipu): Run[] {
	const out: Run[] = [];
	for (const c of pendants(khipu)) {
		const a = c.attach ?? "?";
		const last = out.at(-1);
		if (last && last.attach === a) {
			last.to = c.ordinal;
			last.n += 1;
		} else out.push({ attach: a, from: c.ordinal, to: c.ordinal, n: 1 });
	}
	return out;
}

/**
 * The khipu with its cord groups replaced by the two attachment halves, so the
 * diagram can band and label them. The recorder's own two groups (p1 alone,
 * then p2–p89) carry no information, and no pendant position along the
 * primary was recorded; the layout is ordinal, so the group starts are unused.
 */
export function halvesView(khipu: Khipu): KhipuLike {
	const p = pendants(khipu);
	const first = p.filter((c) => c.ordinal < SPLIT_AT);
	const second = p.filter((c) => c.ordinal >= SPLIT_AT);
	const box = (cs: Cord[]) => ({
		start: 0,
		first: cs[0]?.ordinal ?? 0,
		last: cs.at(-1)?.ordinal ?? 0,
		n: cs.length,
		spacing: 0,
	});
	return {
		id: khipu.id,
		primary: khipu.primary,
		stats: khipu.stats,
		groups: [box(first), box(second)],
		cords: khipu.cords.map((c) =>
			c.level === 1 ? { ...c, group: c.ordinal < SPLIT_AT ? 0 : 1 } : c,
		),
	};
}

export interface HalfProfile {
	label: string;
	n: number;
	verso: number;
	zTwist: number;
	plainWhite: number;
	knotted: number;
	legal: number;
	singlesOnly: number;
	withLong: number;
	highTurnKnots: number;
}

export function halfProfile(label: string, cords: Cord[]): HalfProfile {
	const ks = cords.filter(isKnotted);
	return {
		label,
		n: cords.length,
		verso: cords.filter((c) => c.attach === "V").length,
		zTwist: cords.filter((c) => c.twist === "Z").length,
		plainWhite: cords.filter(isPlainWhite).length,
		knotted: ks.length,
		legal: ks.filter(legalTopDown).length,
		singlesOnly: ks.filter(singlesOnly).length,
		withLong: ks.filter((c) => c.knots.some((k) => k.type === "L")).length,
		highTurnKnots: ks.reduce(
			(a, c) =>
				a + c.knots.filter((k) => k.type === "L" && k.n >= HIGH_TURNS).length,
			0,
		),
	};
}

export interface ColourTwist {
	colour: string;
	n: number;
	s: number;
	z: number;
}

/** Pendant twist by recorded colour, most common colour first. */
export function twistByColour(khipu: Khipu): ColourTwist[] {
	const m = new Map<string, ColourTwist>();
	for (const c of pendants(khipu)) {
		const key = c.color ?? "?";
		const row = m.get(key) ?? { colour: key, n: 0, s: 0, z: 0 };
		row.n += 1;
		if (c.twist === "S") row.s += 1;
		if (c.twist === "Z") row.z += 1;
		m.set(key, row);
	}
	return [...m.values()].sort((a, b) => b.n - a.n);
}

export interface TwoByTwo {
	/** rows: has attribute / has not; columns: outcome yes / no */
	a: number;
	b: number;
	c: number;
	d: number;
	shareA: number;
	shareB: number;
	p: number;
}

/** A 2×2 table with Fisher's exact test, two-sided (tables no more probable than the observed). */
export function fisher2x2(
	a: number,
	b: number,
	c: number,
	d: number,
): TwoByTwo {
	const n = a + b + c + d;
	const logFact: number[] = [0];
	for (let i = 1; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
	const logHyper = (x: number) => {
		const r1 = a + b;
		const r2 = c + d;
		const c1 = a + c;
		const bx = r1 - x;
		const cx = c1 - x;
		const dx = r2 - cx;
		if (bx < 0 || cx < 0 || dx < 0) return Number.NEGATIVE_INFINITY;
		return (
			logFact[r1] +
			logFact[r2] +
			logFact[c1] +
			logFact[b + d] -
			logFact[n] -
			logFact[x] -
			logFact[bx] -
			logFact[cx] -
			logFact[dx]
		);
	};
	const obs = logHyper(a);
	let p = 0;
	const lo = Math.max(0, a + c - (c + d));
	const hi = Math.min(a + b, a + c);
	for (let x = lo; x <= hi; x++) {
		const lp = logHyper(x);
		if (lp <= obs + 1e-9) p += Math.exp(lp);
	}
	return {
		a,
		b,
		c,
		d,
		shareA: a + b ? a / (a + b) : 0,
		shareB: c + d ? c / (c + d) : 0,
		p: Math.min(1, p),
	};
}

/** A p-value for prose: "< 0.001" or two decimals. */
export function pText(p: number): string {
	return p < 0.001 ? "< 0.001" : `≈ ${p.toFixed(2)}`;
}

/** Z twist among plain-white pendants against every pendant carrying a colour. */
export function plainVersusColouredTwist(khipu: Khipu): TwoByTwo {
	const p = pendants(khipu).filter((c) => c.twist === "S" || c.twist === "Z");
	const plain = p.filter(isPlainWhite);
	const mottled = p.filter((c) => !isPlainWhite(c));
	const z = (xs: Cord[]) => xs.filter((c) => c.twist === "Z").length;
	return fisher2x2(
		z(plain),
		plain.length - z(plain),
		z(mottled),
		mottled.length - z(mottled),
	);
}

/** Does an attribute predict whether a knotted pendant is a legal decimal cord? */
export function attributeVersusLegal(
	khipu: Khipu,
	has: (c: Cord) => boolean,
): TwoByTwo {
	const ks = pendants(khipu).filter(isKnotted);
	const yes = ks.filter(has);
	const no = ks.filter((c) => !has(c));
	const legal = (xs: Cord[]) => xs.filter(legalTopDown).length;
	return fisher2x2(
		legal(yes),
		yes.length - legal(yes),
		legal(no),
		no.length - legal(no),
	);
}

/** Long knots of HIGH_TURNS or more turns on pendants, by the cord's twist. */
export function highTurnByTwist(khipu: Khipu): { s: number; z: number } {
	let s = 0;
	let z = 0;
	for (const c of pendants(khipu))
		for (const k of c.knots)
			if (k.type === "L" && k.n >= HIGH_TURNS) {
				if (c.twist === "S") s += 1;
				if (c.twist === "Z") z += 1;
			}
	return { s, z };
}

export function colourCounts(khipu: Khipu): { key: string; n: number }[] {
	return tally(khipu.cords.map((c) => c.color ?? "?"));
}

export function twistCounts(cords: Cord[]): { s: number; z: number } {
	return {
		s: cords.filter((c) => c.twist === "S").length,
		z: cords.filter((c) => c.twist === "Z").length,
	};
}

export function attachCounts(cords: Cord[]): { r: number; v: number } {
	return {
		r: cords.filter((c) => c.attach === "R").length,
		v: cords.filter((c) => c.attach === "V").length,
	};
}

export function pendantLengths(khipu: Khipu): Stats {
	return stats(
		pendants(khipu)
			.map((c) => c.length)
			.filter((l): l is number => l != null),
	);
}

/** Text of a cord's knots for captions: "2L at 15 cm, 1S at 30.5 cm". */
export function knotsText(c: Cord): string {
	return sortedKnots(c)
		.map((k) => `${k.n}${k.type} at ${k.pos} cm`)
		.join(", ");
}

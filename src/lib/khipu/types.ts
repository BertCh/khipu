/**
 * Shapes of the JSON produced by scripts/build_data.py (public/data/).
 */

export type KnotType = "S" | "L" | "E" | "EE" | "LL" | "BL" | "SP" | "TF" | "U";

export interface Knot {
	/** For S/E/EE/TF: number of knots in the cluster. For L/LL/BL/SP: number of turns on the one knot. */
	n: number;
	type: KnotType;
	/** Distance from the cord's attachment, in cm. */
	pos: number;
	/** "S" | "Z" | "U", or one letter per knot when they differ, e.g. "ZZSZ". */
	dir: string;
	/** Decimal value the knot cluster contributes to the cord's value. */
	value?: number;
	axis?: string;
}

export interface ColorSegment {
	/** Ascher colour codes, e.g. ["W", "MB"]. */
	codes: string[];
	/** Operators between codes: ":" mottled, "-" barber pole, "%" striped, "^" tweed. */
	ops?: string[];
	/** [from, to] in cm when the cord changes colour along its length. */
	range?: [number, number];
}

export type CordKind = "pendant" | "subsidiary" | "top" | "marker";

export interface Cord {
	/** p12, p12s1, p12s1s2, p5m1 … */
	name: string;
	/** 1 = pendant on the primary cord, 2 = subsidiary of a pendant, … */
	level: number;
	kind: CordKind;
	parent?: string;
	/** 1-based ordinal among siblings (pendant number for level 1). */
	ordinal: number;
	/** Index into Khipu.groups for level-1 cords. */
	group?: number;
	/** cm along the parent (primary cord for pendants) where this cord attaches. */
	pos?: number;
	twist: string | null;
	attach: string | null;
	length: number | null;
	term: string | null;
	thick: number | null;
	color: string | null;
	colorParsed?: ColorSegment[];
	value: number | null;
	altValue: number | null;
	knots: Knot[];
	nKnots: number;
	notes?: string;
	/**
	 * Present only when the KFG's Value column differs from the sum of this cord's knot tokens
	 * (104 cords). `value` stays as published; `knots` is what the knots read. See
	 * scripts/build_data.py value_conflicts() and scripts/mk/value_knot_conflicts.md.
	 */
	valueConflict?: ValueConflict;
}

export interface ValueConflict {
	/** Sum of the knot tokens' values. */
	knots: number;
	cause:
		| "reordered"
		| "logged-edit"
		| "knot-token"
		| "zero-value"
		| "no-knots"
		| "unexplained";
	/** One-line diagnosis for the tooltip. */
	note: string;
}

export interface CordGroup {
	/** cm along the primary cord where the group starts. */
	start: number;
	first: number;
	last: number;
	n: number;
	spacing: number;
}

export interface PrimaryCord {
	structure: string | null;
	thick: number | null;
	length: number | null;
	color: string | null;
	colorParsed: ColorSegment[] | null;
	fiber: string | null;
	beginning: string | null;
	term: string | null;
	twist: string | null;
	notes: string | null;
}

export interface KhipuStats {
	nCords: number;
	nPendants: number;
	nSubsidiaries: number;
	nTop: number;
	nGroups: number;
	nKnots: number;
	maxLevel: number;
	nColors: number;
	totalValue: number;
	maxValue: number;
	meanCordLength: number;
	knotTypes: Partial<Record<KnotType, number>>;
	topColors: string[];
}

export interface OkrRecord {
	okrId: number;
	investigatorNum: string | null;
	earliestAge: string | null;
	latestAge: string | null;
	provenance: string | null;
	region: string | null;
	condition: string | null;
	archive: number | null;
	discovered: string | null;
	discoveredBy: string | null;
}

export interface Khipu {
	id: string;
	aliases: string[];
	contributors: string | null;
	kfgUrl: string;
	museum: {
		/** as recorded */
		name: string | null;
		/** normalised institution name used for counting and filtering */
		canonical: string | null;
		number: string | null;
		city: string | null;
		country: string | null;
		url: string | null;
		description: string | null;
	};
	provenance: string | null;
	region: string | null;
	created: string | null;
	primary: PrimaryCord;
	groups: CordGroup[];
	cords: Cord[];
	stats: KhipuStats;
	okr: OkrRecord | null;
	/** where the ETL overrides the Field Guide (scripts/build_data.py SOURCE_OVERRIDES) */
	corrections?: SourceCorrection[];
}

export interface SourceCorrection {
	field: "cords" | "provenance" | "museumNumber";
	from: string | null;
	to: string;
	why: string;
	evidence: string[];
}

/**
 * What the layout and the diagram need of a khipu. The recorded khipus and the
 * synthetic city khipus (public/data/cities, see src/lib/cities) both satisfy it.
 */
export type KhipuLike = Pick<
	Khipu,
	"id" | "primary" | "groups" | "cords" | "stats"
>;

/** One row of public/data/khipus.json. */
export interface KhipuSummary extends KhipuStats {
	id: string;
	aliases: string[];
	/** canonical institution name */
	museum: string | null;
	museumRaw: string | null;
	museumCountry: string | null;
	provenance: string | null;
	region: string | null;
	primaryLength: number | null;
	primaryColor: string | null;
	fiber: string | null;
	inOkr: boolean;
	earliestAge: string | null;
	latestAge: string | null;
	archive: number | null;
}

export interface AscherColor {
	name: string;
	hex: string;
	rgb: [number, number, number];
	/** Hue family letter from the Ascher chart. */
	family: string;
	intensity: number;
	isccNbs: number;
}

export type ColorTable = Record<string, AscherColor>;

export interface CodeEntry {
	label: string;
	notes: string | null;
}

export type CodeTables = Record<
	| "knotType"
	| "attachment"
	| "termination"
	| "fiber"
	| "structure"
	| "beginning"
	| "colorOperator"
	| "archive"
	| "twist"
	| "knotDirection",
	Record<string, CodeEntry>
>;

export type Counts = Record<string, number>;

export interface Corpus {
	nKhipus: number;
	nCords: number;
	nKnots: number;
	nInOkr: number;
	nMuseums: number;
	colorCords: Counts;
	colorSolid: Counts;
	knotTypes: Counts;
	knotDir: Counts;
	leadingDigit: Counts;
	valueMagnitude: Counts;
	level: Counts;
	attach: Counts;
	twist: Counts;
	term: Counts;
	cordLength: Counts;
	museum: Counts;
	country: Counts;
	provenance: Counts;
	region: Counts;
	fiber: Counts;
	/** khipus by cord count, 25-cord bins */
	cordsPerKhipu: Counts;
}

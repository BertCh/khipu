import type { KhipuSummary } from "#/lib/khipu/types";

/**
 * Every link between two khipus the project knows of, for the /network page.
 *
 * Two layers. The scan layer is public/data/stories/links.json, written by
 * scripts/build_links.py: every pair of khipus that share a run of five or
 * more consecutive level-1 values, forward or reversed, with no judgement
 * attached. The editorial layer is this file: the links a story or a
 * published paper has examined, what kind of relation they are, and how sure
 * we are. The two are merged by pair in buildGraph(); a curated link keeps
 * its kind and picks up the scan's counts, an unexamined scan pair becomes a
 * "passage" link, and the curated sets (khipus found or accessioned together)
 * become the islands' outlines.
 */

export type LinkKind =
	/** the same account, tied twice: field-for-field or from the other end */
	| "account"
	/** one record derived from another: rounded, excerpted, retied */
	| "derived"
	/** pieces of one object, or two objects physically joined */
	| "object"
	/** a shared run of values the scan found and nobody has examined */
	| "passage";

export type LinkLevel = "firm" | "likely" | "open";

export interface CuratedLink {
	a: string;
	b: string;
	kind: Exclude<LinkKind, "passage">;
	level: LinkLevel;
	/** one line on what matches */
	note: string;
	/** two or three words for the diagram's edge label: "totals → heads" */
	short?: string;
	/** a derived link whose direction is not known: no arrow from a to b */
	undirected?: true;
	/** story route, when one reads this link */
	story?: string;
	/** a published source, when the link is not ours */
	source?: string;
	/** what the literature already says about the pair; buildGraph() gives
	 * every link without one the not-found default (see CHECKED) */
	prior?: PriorWork;
}

export type PriorStatus =
	/** a paper makes this match */
	| "published"
	/** museum or catalogue records already tie the two, without a reading */
	| "catalogue"
	/** no prior claim in any source read */
	| "not-found";

/** The literature audit of 22 September 2026, per link. */
export interface PriorWork {
	status: PriorStatus;
	/** the sources read for this link */
	checked: string[];
	note?: string;
}

export type SetKind =
	/** khipus a story or a paper treats as one find */
	| "set"
	/** one museum number */
	| "accession"
	/** one recorded find-spot */
	| "place";

export interface KhipuSet {
	id: string;
	kind: SetKind;
	label: string;
	ids: string[];
	note: string;
	story?: string;
}

export interface ScanPair {
	a: string;
	b: string;
	dir: "fwd" | "rev";
	values: number;
	runs: number;
	longest: number;
	/** [run length, start cord in a, start cord in b], longest first */
	spans: [number, number, number][];
}

export interface ScanFile {
	windows: number[];
	shuffles: number;
	/** pairs by longest run, observed against the mean of shuffled corpora */
	baseline: Record<"6" | "5" | "4", { observed: number; shuffled: number }>;
	pairs: ScanPair[];
	accessions: { id: string; museum: string; number: string; ids: string[] }[];
	places: { id: string; label: string; ids: string[] }[];
}

export const KIND_LABEL: Record<LinkKind, string> = {
	account: "Same account",
	derived: "Derived record",
	object: "Same object",
	passage: "Shared passage",
};

export const KIND_BLURB: Record<LinkKind, string> = {
	account:
		"Two records of one account: the same figures in the same order, sometimes in a different template or read from the other end.",
	derived:
		"One record made from another: a rounded copy, a group excerpted, six values retied in a new colour.",
	object:
		"Fragments of one khipu, or two khipus whose primary cords are tied or spliced together.",
	passage:
		"A run of five or more identical consecutive values found by the scan between two khipus; not yet examined.",
};

export const STORY_TITLE: Record<string, string> = {
	"/stories/tied-twice": "An account tied twice",
	"/stories/tied-in-two-cities": "One account, tied in two cities",
	"/stories/rounded-copy": "The account that was rounded",
	"/stories/pachacamac-fragment": "The fragments between two archives",
	"/stories/brown-eight": "Eight brown cords",
	"/stories/six-fields": "Six numbers, retied",
	"/stories/inkawasi": "Inkawasi storehouse accounts",
	"/stories/santa-valley": "Six khipus and a census",
	"/stories/proportional-template": "One shape at five scales",
	"/stories/totals-that-travel": "Totals that travel",
};

const SCREENS = "Link screens, September 2026";
const DEEP = "Deep analysis, September 2026";
/** sources that are this project's own screens rather than publications */
const OWN_SOURCES: ReadonlySet<string> = new Set([SCREENS, DEEP]);

/**
 * Open sources read for earlier claims of these links (22–23 September 2026).
 * Not yet read: Urton & Chu 2015 main text, pp. 520–522, and Urton & Chu
 * 2019; Urton 2001 (Latin American Antiquity 12); Pereyra 2011 on HP055; the
 * Berlin, quai Branly and Dallas online catalogues.
 */
const CHECKED = [
	"Urton 2005, Latin American Antiquity 16",
	"Urton & Brezine 2005, Science 309",
	"Urton & Chu 2015, Appendix I",
	"Urton & Quilter (eds.) 2002, Narrative Threads",
	"reviews of Urton 2017 in Cambridge Archaeological Journal and Journal of Latin American Studies",
	"Ascher & Ascher databook (1988)",
	"Thompson 2025, corrections to the Aschers' data",
	"Medrano 2022, St Andrews thesis",
	"Khipu Field Guide catalogue notes and change logs",
	"OKR records, issues and KH registry",
	"Brezine et al. 2024 naming table (khipulab/renaming)",
	"Urton 2017, Inka History in Knots (full text)",
	"Urton 2003, Signs of the Inka Khipu; Ascher & Ascher 1997",
	"Urton 2004, Boletín de Arqueología PUCP 8",
	"Thompson's Khipu-Biblio Cross-Reference (doi 10.26188/25661322)",
	"Harvard Khipu Database Project site (archived) and 2012 database dump",
	"Ascher databook scans (OCR), per khipu",
	"Medrano & Khosla 2024, Latin American Antiquity (read in full, with companion data and code, Zenodo 10.5281/zenodo.10472429); FitzPatrick 2025 and Clindaniel 2025 preprints",
];
const published = (source: string, note?: string): PriorWork => ({
	status: "published",
	checked: [source],
	...(note ? { note } : {}),
});
const catalogue = (note: string): PriorWork => ({
	status: "catalogue",
	checked: CHECKED,
	note,
});
const notFound = (note?: string): PriorWork => ({
	status: "not-found",
	checked: CHECKED,
	...(note ? { note } : {}),
});
const URTON_2005 = "Urton 2005, Latin American Antiquity 16";
const URTON_BREZINE = "Urton & Brezine 2005, Science 309";
const URTON_CHU =
	"Urton & Chu 2015, Latin American Antiquity 26 (the Inkawasi matching pairs)";
const URTON_2017 = "Urton 2017, Inka History in Knots";
const URTON_2017_T61 = `${URTON_2017}, pp. 118–120 and table 6.1`;
const LEYMEBAMBA =
	"Urton 2004, Boletín de Arqueología PUCP 8: 298–302 (table 1 underlines 2, 1, 8, 4, 3, 1, 1, 20, 61, 20); Urton 2017, ch. 4, pp. 78–82; Harvard Khipu Database 'Calendar matches' page";
const LEYMEBAMBA_NOTE =
	"Urton shows UR9 and UR21 repeating a four-month segment of UR6, this passage included. Not in print: that UR9 runs in reverse, the nested subsidiary, the cord positions.";
const INKAWASI_2017 =
	"Urton 2017, ch. 9 returns to the Inkawasi peanut and pepper pairs (JLAS review, doi 10.1017/S0022216X19000221).";

export const CURATED: CuratedLink[] = [
	// Berlin: AS175 against the spliced Huacho pair
	{
		a: "KH0192",
		b: "KH0470",
		kind: "account",
		level: "firm",
		short: "89 / 104",
		note: "Part 1 of AS175 is UR233 in groups of six: 89 of 104 fields exact.",
		story: "/stories/tied-twice",
	},
	{
		a: "KH0192",
		b: "KH0469",
		kind: "account",
		level: "firm",
		short: "72 / 104",
		note: "Part 3 of AS175 is UR232: 72 of 104 fields exact, and its summary fits UR232's figures better than its own.",
		story: "/stories/tied-twice",
	},
	{
		a: "KH0469",
		b: "KH0470",
		kind: "object",
		level: "firm",
		note: "One Berlin accession, VA 63038 A and B; the two primary cords are spliced beginning to end.",
		story: "/stories/tied-twice",
		prior: catalogue("One Berlin accession, VA 63038 A and B."),
	},
	// Paris ↔ Lima, and one Berlin khipu under two numbers. (KH0133, AS119, is
	// not a third: its KFG cords are a copy of KH0121's, replaced by the real
	// AS119 in scripts/build_data.py SOURCE_OVERRIDES.)
	{
		a: "KH0097",
		b: "KH0586",
		kind: "account",
		level: "firm",
		note: "Fifteen units open with the same four-digit totals in the same order: 13 exact, 2 off by a register.",
		story: "/stories/tied-in-two-cities",
	},
	{
		a: "KH0121",
		b: "KH0473",
		kind: "object",
		level: "firm",
		note: "AS107 (VA 24370 B) and UR237 (VA 66834): the same values read from opposite ends, 17 and 9 in reverse, 500 for 50; the knotted end of the primary cord recorded at the other end; cord lengths agree within 3 cm (19.5 cm for random pairings). Probably one khipu under two accession numbers, though the Aschers found AS107 tied to AS106's bar.",
		story: "/stories/tied-in-two-cities",
		prior: notFound(
			"Urton 2017 never mentions UR237; its 'matching pair with opposite directionality' is UR53B/UR53C.",
		),
	},
	// the Aschers' Berlin pairs (Urton 2005)
	{
		a: "KH0128",
		b: "KH0137",
		kind: "account",
		level: "likely",
		note: "AS114 and AS123, matched by Urton: sixteen values in order between Ica and Pisco.",
		source: "Urton 2005, Latin American Antiquity 16",
		prior: published(URTON_2005),
	},
	{
		a: "KH0175",
		b: "KH0190",
		kind: "account",
		level: "likely",
		note: "AS159 and AS173, matched by Urton; seven values in order from the first cord.",
		source: "Urton 2005, Latin American Antiquity 16",
		prior: published(URTON_2005),
	},
	{
		a: "KH0130",
		b: "KH0166",
		kind: "account",
		level: "open",
		note: "AS116 and AS150, matched by Urton; the scan finds no shared run in the recorded values.",
		source: "Urton 2005, Latin American Antiquity 16",
		prior: published(URTON_2005),
	},
	// Urton's 'closely matched' Pachacamac pairs: cord counts, colours and
	// totals, not values in order (Urton 2017, table 6.1)
	{
		a: "KH0147",
		b: "KH0108",
		kind: "account",
		level: "open",
		note: "UR1131 (AS131) and UR1095 (AS095, Munich): 146 cords each, totals 10,449 and 9,694 in Urton's table. 26 values ≥10 in common, but no more than 4 line up in any alignment.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	{
		a: "KH0160",
		b: "KH0456",
		kind: "account",
		level: "open",
		note: "UR1144 (AS144) and UR218: 62 cords each, totals 8,148 and 8,282 in Urton's table. Only 6 values ≥10 in common and none line up.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	{
		a: "KH0167",
		b: "KH0207",
		kind: "account",
		level: "open",
		note: "UR1151 (AS151) and AS189: 23 cords each, about two-thirds with subsidiaries. 2 values ≥10 in common.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	{
		a: "KH0109",
		b: "KH0434",
		kind: "account",
		level: "open",
		note: "UR1096 (AS096) and UR196: 77 and 78 cords, totals 437 and 410 in Urton's table; up to 7 values line up at one offset.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	{
		a: "KH0550",
		b: "KH0479",
		kind: "account",
		level: "open",
		note: "HP018 and UR243: 28 and 29 cords, totals 434 and 439 in Urton's table. 2 values ≥10 in common.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	{
		a: "KH0463",
		b: "KH0467",
		kind: "account",
		level: "open",
		note: "UR226 and UR230: 36 cords each; totals 12,019 and 830 in Urton's table. 1 value ≥10 in common.",
		source: URTON_2017_T61,
		prior: published(URTON_2017_T61),
	},
	// the same Berlin object under two catalogue numbers
	{
		a: "KH0140",
		b: "KH0483",
		kind: "account",
		level: "likely",
		note: "Both catalogued as UR247: the Aschers' AS125 and Urton's record of the same khipu, twelve values in order from the first cord.",
		prior: catalogue(
			"Only the KFG ties them: it files AS125 under UR247's name and number, VA 42610. The Aschers' databook has AS125 as VA 42670, and the 2024 naming table keeps the two apart; the museum's online catalogue has a VA 42610 khipu from Pachacamac and no VA 42670. The shared values make them one khipu either way.",
		),
	},
	// Puruchuco
	{
		a: "KH0303",
		b: "KH0304",
		kind: "account",
		level: "firm",
		note: "UR066 and UR067: twenty values in order from the eighth cord; the matched pair at the top of the Puruchuco hierarchy (level III), into which UR068's three sections sum (Urton 2017, pp. 90–97).",
		source: "Urton & Brezine 2005, Science 309",
		prior: published(URTON_BREZINE),
	},
	{
		a: "KH0301",
		b: "KH0305",
		kind: "account",
		level: "likely",
		note: "UR064 and UR068: runs of 14 and 7 values in order; two of the three level II khipus in the Puruchuco hierarchy.",
		source: "Urton & Brezine 2005, Science 309",
		prior: published(URTON_BREZINE),
	},
	// Inkawasi mirrors
	{
		a: "KH0503",
		b: "KH0491",
		kind: "account",
		level: "firm",
		short: "mirror",
		note: "UR267A and UR255: the same sums group for group, the fixed deduction moved to the end of each group.",
		story: "/stories/inkawasi",
		prior: published(URTON_CHU, INKAWASI_2017),
	},
	{
		a: "KH0504",
		b: "KH0492",
		kind: "account",
		level: "firm",
		short: "mirror",
		note: "UR267B and UR256: the peanut ledger and its mirror.",
		story: "/stories/inkawasi",
		prior: published(URTON_CHU, INKAWASI_2017),
	},
	{
		a: "KH0514",
		b: "KH0502",
		kind: "account",
		level: "firm",
		short: "mirror",
		note: "UR275 and UR266: the ledger with a fixed 47 and its mirror.",
		story: "/stories/inkawasi",
		prior: published(URTON_CHU, INKAWASI_2017),
	},
	{
		a: "KH0498",
		b: "KH0507",
		kind: "account",
		level: "open",
		short: "61 values",
		note: "UR262 and UR270 share 61 values; the relation has not been read.",
		story: "/stories/inkawasi",
	},
	// derived records
	{
		a: "KH0049",
		b: "KH0362",
		kind: "derived",
		level: "likely",
		short: "38 / 72",
		note: "Four 18-field tables, one detailed and one selectively blanked and rounded: 38 of 72 fields exact.",
		story: "/stories/rounded-copy",
	},
	{
		a: "KH0377",
		b: "KH0590",
		kind: "derived",
		level: "firm",
		note: "An entire brown group reappears inside a group on the other: eight values, order, colour and knot types.",
		story: "/stories/brown-eight",
	},
	{
		a: "KH0358",
		b: "KH0602",
		kind: "derived",
		level: "firm",
		note: "Six nonzero values retied while colour, attachment and knot height all change.",
		story: "/stories/six-fields",
	},
	// Pachacamac ↔ Basel
	{
		a: "KH0450",
		b: "KH0147",
		kind: "account",
		level: "likely",
		note: "Two accounts that appear to cover the same fourteen units, one in reverse order; reconstructed from the fragments that carry a group of each.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0689",
		b: "KH0450",
		kind: "object",
		level: "firm",
		note: "Brown group: thirteen values of the first big group from KH0450's end, reversed.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0689",
		b: "KH0147",
		kind: "object",
		level: "firm",
		note: "White group: unit 1 of KH0147.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0690",
		b: "KH0450",
		kind: "object",
		level: "firm",
		note: "Brown group: unit 4 from KH0450's end, reversed.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0690",
		b: "KH0147",
		kind: "object",
		level: "firm",
		note: "White group: unit 4 of KH0147.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0682",
		b: "KH0450",
		kind: "object",
		level: "firm",
		note: "Brown group: unit 14 from KH0450's end.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0682",
		b: "KH0147",
		kind: "object",
		level: "firm",
		note: "White group: unit 14 of KH0147.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0683",
		b: "KH0147",
		kind: "object",
		level: "firm",
		note: "White group: unit 13 of KH0147, reversed.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0686",
		b: "KH0450",
		kind: "object",
		level: "firm",
		note: "Brown group: unit 7 of KH0450.",
		story: "/stories/pachacamac-fragment",
	},
	{
		a: "KH0688",
		b: "KH0450",
		kind: "object",
		level: "likely",
		note: "Brown group: probably unit 2 of KH0450.",
		story: "/stories/pachacamac-fragment",
	},
	// Philadelphia
	{
		a: "KH0028",
		b: "KH0027",
		kind: "object",
		level: "firm",
		note: "AS026B and AS026A: one Penn Museum accession, the two khipus tied together.",
		story: "/stories/proportional-template",
		prior: catalogue(
			"One Penn Museum accession; the Aschers' AS026A and AS026B.",
		),
	},
	// the link screens of 21 September 2026 (scripts/link_screens.py)
	{
		a: "KH0118",
		b: "KH0471",
		kind: "derived",
		level: "firm",
		note: "Cords 8–16 of AS104 are the leading cords of UR234's first nine groups in order: seven exact, one with two digits swapped (3102 for 3012), one that UR234 leaves blank. A summary of the longer khipu.",
		source: SCREENS,
	},
	{
		a: "KH0132",
		b: "KH0456",
		kind: "derived",
		level: "firm",
		note: "AS118's group 1 is UR218's group 1 value for value (620 470 528 935 474 319 453, one off by three); group 2 opens and closes the same (492 … 275) with the middle lost: the Aschers record AS118's cords 10–14 as broken. Both from Pachacamac.",
		source: SCREENS,
	},
	{
		a: "KH0143",
		b: "KH0591",
		kind: "account",
		level: "likely",
		note: "One eleven-cord group aligns cord for cord: 55, 226, 115, 124 and 161 in the same five positions, the other six fields different. Nazca to Dallas.",
		source: SCREENS,
	},
	{
		a: "KH0156",
		b: "KH0432",
		kind: "account",
		level: "likely",
		note: "UR194's group 3 holds exactly the nine values of AS140's group 15 in another order, and its group 1 the same values in AS140's order with two off by one or two.",
		source: SCREENS,
	},
	{
		a: "KH0511",
		b: "KH0513",
		kind: "account",
		level: "likely",
		short: "same leaders",
		note: "UR273B and UR274B, consecutive Inkawasi accessions: the leading four-digit values of the first thirteen groups run in the same order, 2300 2142 1249 1200 1332 1575 exact and the rest within ten.",
		source: SCREENS,
		prior: notFound(
			"Nearest anticipation: Urton & Chu 2015, Appendix I, notes UR273B's numbers resemble the thousands on the matching pair UR266 and UR275.",
		),
	},
	{
		a: "KH0404",
		b: "KH0426",
		kind: "account",
		level: "open",
		note: "Two five-digit values, 24341 and 32587, in the same order on both; nothing else matches. Lima to Paris.",
		source: SCREENS,
	},
	{
		a: "KH0114",
		b: "KH0115",
		kind: "object",
		level: "firm",
		note: "AS101 part 1 and part 2: one khipu under one Berlin number, VA 42528, recorded in two parts.",
		source: SCREENS,
		prior: catalogue(
			"The Aschers recorded AS101 in two parts under one number, VA 42528.",
		),
	},
	{
		a: "KH0138",
		b: "KH0139",
		kind: "object",
		level: "firm",
		note: "AS124 and the Aschers' 'AS124 Detail 1': a second, partial record of the same khipu, VA 24371.",
		source: SCREENS,
		prior: catalogue("The Aschers' own 'AS124 Detail 1'."),
	},
	// Deep analysis (alignment, arithmetic, graph, tree), each link re-derived by a sceptic
	{
		a: "KH0517",
		b: "KH0502",
		kind: "derived",
		level: "firm",
		short: "totals → heads",
		note: "UR278's nine-cord group totals are the heads of UR266's groups, in order: 11 exact four-digit values (g1 = 3618 = p3). Through the UR266/UR275 mirror they head KH0514's groups too.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0507",
		b: "KH0513",
		kind: "derived",
		level: "likely",
		short: "totals → heads",
		note: "UR270's group totals 1200, 1332, 1402, 1300, 1575 head UR274B's groups at p52, p62, p66, p69, p72 in order; 1402 occurs nowhere else.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0507",
		b: "KH0511",
		kind: "derived",
		level: "open",
		short: "totals → heads",
		note: "The same UR270 totals (1200, 1332, 1575, 1256) head UR273B's groups at p57, p73, p82, p85; this follows from the UR273B/UR274B pair.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0506",
		b: "KH0514",
		kind: "account",
		level: "likely",
		short: "1505 / 47 / 1458",
		note: "One entry in both, 1505 / 47 / 1458 (gross, deduction, net); 1458, 1505, 1653 and 2633 occur only in KH0502, KH0506 and KH0514. Order is not kept.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0502",
		b: "KH0506",
		kind: "account",
		level: "likely",
		short: "third record",
		note: "UR269 is a third record of the UR266/UR275 series: 5 of the 20 values ≥1000 the pair shares, every other khipu at most 1.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0505",
		b: "KH0514",
		kind: "derived",
		level: "likely",
		short: "× 2.8–5.7",
		undirected: true,
		note: "First seven groups (33 cords) share sizes 6,6,4,4,4,4,5 and colours; 30 of the 33 values run 2.8 to 5.7 times their partner's (median 4.4; permutation p = 0.0008), then the layouts part.",
		source: DEEP,
	},
	{
		a: "KH0510",
		b: "KH0512",
		kind: "derived",
		level: "open",
		short: "lone values → heads",
		note: "Lone values 891, 453, 448, 448 of UR273A are heads of UR274A at p22, p32, p36, p42 in order; not significant corpus-wide.",
		source: DEEP,
	},
	{
		a: "KH0284",
		b: "KH0285",
		kind: "derived",
		level: "firm",
		note: "UR053B p1–p32s1 = UR053C p11–p58 on one diagonal: 35 exact values, 11 of them subsidiaries retied as pendants. The exact-run scan misses it because the interleaving breaks every run.",
		story: "/stories/totals-that-travel",
		source: DEEP,
		prior: published(
			`${URTON_2017}, pp. 146–150 and table 8.1; ${URTON_2005}`,
			"Urton's 'matching pair with opposite directionality': from UR53C's cord 11 and UR53B's cord 1 the values are 'identical, or (generally) quite close'.",
		),
	},
	{
		a: "KH0245",
		b: "KH0257",
		kind: "derived",
		level: "firm",
		note: "A shared passage (KH0245 reversed) ending 20 · 61 · 20 with a nested subsidiary 1; KH0242 holds it too.",
		story: "/stories/totals-that-travel",
		source: DEEP,
		prior: published(LEYMEBAMBA, LEYMEBAMBA_NOTE),
	},
	{
		a: "KH0242",
		b: "KH0245",
		kind: "derived",
		level: "firm",
		note: "UR006 p277–p291 and the nine subsidiaries of p292 (… 20 61 20) = KH0245 p143 back to p119.",
		story: "/stories/totals-that-travel",
		source: DEEP,
		prior: published(LEYMEBAMBA, LEYMEBAMBA_NOTE),
	},
	{
		a: "KH0242",
		b: "KH0257",
		kind: "derived",
		level: "firm",
		note: "UR006 p292's subsidiaries (2 1 8 4 3(+1) 1 20 61 20) = KH0257 p28–p36, nested 1 included.",
		story: "/stories/totals-that-travel",
		source: DEEP,
		prior: published(LEYMEBAMBA, LEYMEBAMBA_NOTE),
	},
	{
		a: "KH0165",
		b: "KH0196",
		kind: "account",
		level: "firm",
		note: "AS149 repeats the group 1430 / 670 / 3410 / 820 four times; AS179 opens with 1430 / 670 / 3424 / 820 on the same B-GG colour plan.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0152",
		b: "KH0432",
		kind: "account",
		level: "likely",
		note: "AS136 g4 and UR194 g0 agree on 6 of 9 cords (100 5 · 19 · 20 27 11 ·; p = 0.001), forming a triad with KH0156. Ascher's W:BB is Urton's W:KB.",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0067",
		b: "KH0403",
		kind: "account",
		level: "open",
		note: "Analogous, not copied: seven pendants within ±14% in order (4769/5540, 620/580, 2353/2303 …) on consecutive Ica accession numbers.",
		source: DEEP,
	},
	{
		a: "KH0521",
		b: "KH0525",
		kind: "derived",
		level: "likely",
		short: "× 5",
		note: "KH0521 p153–p156 [20, 2910, 2910, 200] × 5 = KH0525's last group [100, 14550, 14550, 1000].",
		story: "/stories/totals-that-travel",
		source: DEEP,
	},
	{
		a: "KH0464",
		b: "KH0465",
		kind: "object",
		level: "firm",
		note: "UR227 and UR228, VA 44677 A: the KFG notes record them knotted to each other at 2 and 52 cm.",
		source: DEEP,
		prior: catalogue(
			"One Berlin accession, VA 44677 A; the KFG notes record the two knotted together.",
		),
	},
];

export const SETS: KhipuSet[] = [
	{
		id: "santa",
		kind: "set",
		label: "Santa valley, 1670",
		ids: ["KH0323", "KH0324", "KH0325", "KH0326", "KH0327", "KH0328"],
		note: "Six khipus kept together, matched as a set to one Spanish tax census: 133 groups of six cords, 132 named tributaries.",
		story: "/stories/santa-valley",
	},
	{
		id: "basel",
		kind: "set",
		label: "Basel IVc.366.03",
		ids: [
			"KH0682",
			"KH0683",
			"KH0684",
			"KH0685",
			"KH0686",
			"KH0687",
			"KH0688",
			"KH0689",
			"KH0690",
			"KH0691",
		],
		note: "Ten fragments under one accession in the Museum der Kulturen, excavated near Huacho by Arnold Masarey and bought from him in 1910.",
		story: "/stories/pachacamac-fragment",
	},
	{
		id: "inkawasi",
		kind: "set",
		label: "Inkawasi storehouse",
		ids: [
			"KH0491",
			"KH0492",
			"KH0493",
			"KH0494",
			"KH0495",
			"KH0496",
			"KH0497",
			"KH0498",
			"KH0499",
			"KH0500",
			"KH0501",
			"KH0502",
			"KH0503",
			"KH0504",
			"KH0505",
			"KH0506",
			"KH0507",
			"KH0508",
			"KH0509",
			"KH0510",
			"KH0511",
			"KH0512",
			"KH0513",
			"KH0514",
			"KH0515",
			"KH0516",
			"KH0517",
			"KH0518",
			"KH0519",
		],
		note: "UR255 to UR280, excavated together from the storerooms at Inkawasi, Cañete valley: the ledgers, their mirrors and the records that restate their totals.",
		story: "/stories/inkawasi",
	},
	{
		id: "puruchuco",
		kind: "set",
		label: "Puruchuco archive",
		ids: ["KH0300", "KH0301", "KH0302", "KH0303", "KH0304", "KH0305"],
		note: "UR063 to UR068, found together in one urn at Puruchuco. All but UR065 belong to the published three-level accounting hierarchy: UR063 (with UR073) at the base, UR064 and UR068 in the middle, UR066 and UR067 at the top.",
	},
];

export interface GraphNode {
	id: string;
	summary: KhipuSummary;
	/** short catalogue name, the first alias */
	alias: string;
	links: GraphLink[];
	sets: KhipuSet[];
}

export interface GraphLink {
	id: string;
	a: string;
	b: string;
	kind: LinkKind;
	level: LinkLevel;
	note: string;
	short?: string;
	undirected?: true;
	story?: string;
	source?: string;
	prior?: PriorWork;
	scan?: ScanPair;
}

export interface Island {
	id: string;
	nodes: GraphNode[];
	links: GraphLink[];
	sets: KhipuSet[];
	/** the story most of the island's links point to, when there is one */
	story?: string;
}

export interface Graph {
	nodes: GraphNode[];
	links: GraphLink[];
	islands: Island[];
}

/** The Aschers' name where there is one (AS175 over UR1175), else the first alias. */
export const shortAlias = (k: KhipuSummary) =>
	k.aliases.find((a) => a.startsWith("AS")) ?? k.aliases[0] ?? k.id;

export const pairKey = (a: string, b: string) =>
	a < b ? `${a}|${b}` : `${b}|${a}`;

export interface GraphOptions {
	/** shortest shared run a scan pair needs to be drawn */
	minRun: number;
	/** add every shared museum number as a set */
	accessions: boolean;
	/** add every recorded find-spot as a set */
	places: boolean;
}

/** Merge the curated links, the scan and the sets into one graph. */
export function buildGraph(
	index: KhipuSummary[],
	scan: ScanFile,
	{ minRun, accessions, places }: GraphOptions = {
		minRun: 6,
		accessions: false,
		places: false,
	},
): Graph {
	const byId = new Map(index.map((k) => [k.id, k]));
	const scanByKey = new Map(scan.pairs.map((p) => [pairKey(p.a, p.b), p]));
	const links: GraphLink[] = CURATED.filter(
		(c) => byId.has(c.a) && byId.has(c.b),
	).map((c) => ({
		...c,
		id: pairKey(c.a, c.b),
		prior: c.prior ?? notFound(),
		scan: scanByKey.get(pairKey(c.a, c.b)),
	}));
	const curated = new Set(links.map((l) => l.id));
	for (const p of scan.pairs) {
		const key = pairKey(p.a, p.b);
		if (curated.has(key) || p.longest < minRun) continue;
		if (!byId.has(p.a) || !byId.has(p.b)) continue;
		links.push({
			id: key,
			a: p.a,
			b: p.b,
			kind: "passage",
			level: "open",
			note:
				p.runs === 1
					? `${p.longest} consecutive values in common${p.dir === "rev" ? ", one read in reverse" : ""}; not yet examined.`
					: `${p.runs} shared runs, ${p.values} values in all${p.dir === "rev" ? ", one khipu read in reverse" : ""}; not yet examined.`,
			scan: p,
		});
	}

	const nodes = new Map<string, GraphNode>();
	const node = (id: string) => {
		let n = nodes.get(id);
		if (!n) {
			const summary = byId.get(id);
			if (!summary) return null;
			n = { id, summary, alias: shortAlias(summary), links: [], sets: [] };
			nodes.set(id, n);
		}
		return n;
	};
	for (const l of links) {
		node(l.a)?.links.push(l);
		node(l.b)?.links.push(l);
	}
	const sets: KhipuSet[] = SETS.map((s) => ({
		...s,
		ids: s.ids.filter((id) => byId.has(id)),
	}));
	if (accessions)
		for (const a of scan.accessions)
			sets.push({
				id: a.id,
				kind: "accession",
				label: `${a.number}, ${shortMuseum({ museum: a.museum } as KhipuSummary)}`,
				ids: a.ids.filter((id) => byId.has(id)),
				note: `${a.ids.length} records under one museum number, ${a.number} at the ${a.museum}.`,
			});
	if (places)
		for (const p of scan.places)
			sets.push({
				id: p.id,
				kind: "place",
				label: shortPlace(p.label),
				ids: p.ids.filter((id) => byId.has(id)),
				note: `${p.ids.length} khipus whose recorded provenance is “${p.label}”.`,
			});
	for (const s of sets) for (const id of s.ids) node(id)?.sets.push(s);

	// islands: connected components over links and set membership
	const parent = new Map<string, string>();
	const find = (x: string): string => {
		const p = parent.get(x) ?? x;
		if (p === x) return x;
		const r = find(p);
		parent.set(x, r);
		return r;
	};
	const union = (x: string, y: string) => parent.set(find(x), find(y));
	for (const l of links) union(l.a, l.b);
	for (const s of sets) for (const id of s.ids.slice(1)) union(s.ids[0], id);

	const groups = new Map<string, Island>();
	for (const n of nodes.values()) {
		const root = find(n.id);
		let g = groups.get(root);
		if (!g) {
			g = { id: root, nodes: [], links: [], sets: [] };
			groups.set(root, g);
		}
		g.nodes.push(n);
	}
	for (const l of links) groups.get(find(l.a))?.links.push(l);
	for (const s of sets) if (s.ids[0]) groups.get(find(s.ids[0]))?.sets.push(s);
	for (const g of groups.values()) {
		const votes = new Map<string, number>();
		for (const l of g.links)
			if (l.story) votes.set(l.story, (votes.get(l.story) ?? 0) + 1);
		for (const s of g.sets)
			if (s.story && s.kind === "set")
				votes.set(s.story, (votes.get(s.story) ?? 0) + 2);
		g.story = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
		g.nodes.sort((x, y) => x.id.localeCompare(y.id));
		g.id = g.nodes[0].id;
	}
	const islands = [...groups.values()].sort(
		(x, y) =>
			y.nodes.length - x.nodes.length ||
			y.links.length - x.links.length ||
			x.id.localeCompare(y.id),
	);
	return { nodes: [...nodes.values()], links, islands };
}

/** A find-spot as a label: the catalogue sometimes files a whole note there. */
export function shortPlace(label: string): string {
	const clean = label.replace(/^["“]+|["”.]+$/g, "");
	return clean.length > 36 ? `${clean.slice(0, 34).trimEnd()}…` : clean;
}

/** A short citation for a published matching: "Urton 2005". */
export function shortSource(source: string): string {
	return source.split(",")[0];
}

/** A one-line name for an island: its story, its set, its source, or its museums. */
export function islandLabel(island: Island): string {
	const place = island.sets
		.filter((s) => s.kind === "place")
		.sort((x, y) => y.ids.length - x.ids.length)
		.map((s) => shortPlace(s.label));
	if (place.length === 1) return place[0];
	if (place.length > 1)
		return place.length > 3
			? `${place.slice(0, 3).join(" · ")} and ${place.length - 3} more`
			: place.join(" · ");
	if (island.story && STORY_TITLE[island.story])
		return STORY_TITLE[island.story];
	const named = island.sets.find((s) => s.kind === "set");
	if (named) return named.label;
	const numbers = island.sets.filter((s) => s.kind === "accession");
	if (numbers.length === 1) return numbers[0].label;
	if (numbers.length > 1)
		return `${numbers.length} museum numbers, ${islandMuseums(island).join(" · ")}`;
	// a published matching names its island; our own passes (the link screens,
	// the deep analysis) are how a link was found, not what the island is
	const source = island.links.find(
		(l) => l.source && !OWN_SOURCES.has(l.source),
	)?.source;
	if (source) return shortSource(source);
	return islandMuseums(island).join(" ↔ ");
}

export function islandMuseums(island: Island): string[] {
	return [...new Set(island.nodes.map((n) => shortMuseum(n.summary)))];
}

/** The second line under an island: its museums, or its find-spots when the museums are the label. */
export function islandSub(island: Island, label: string): string {
	const museums = islandMuseums(island);
	if (island.sets.some((s) => s.kind === "place")) {
		const n = island.nodes.length;
		const linked = island.links.length;
		return `${n} khipus, ${linked} ${linked === 1 ? "link" : "links"} · ${
			museums.length > 3
				? `${museums.slice(0, 3).join(", ")} and ${museums.length - 3} more`
				: museums.join(", ")
		}`;
	}
	const line =
		museums.length > 3
			? `${museums.slice(0, 3).join(", ")} and ${museums.length - 3} more`
			: museums.join(" · ");
	if (line !== label) return line;
	const places = [
		...new Set(
			island.nodes.map((n) => n.summary.provenance).filter(Boolean) as string[],
		),
	].filter((place) => !museums.includes(place));
	return places.length ? `${line}, from ${places.join(" and ")}` : line;
}

/** The city, or failing that the institution, as the stories name them. */
const CITY: [RegExp, string][] = [
	[/quai Branly/i, "Paris"],
	[/Museo Nacional de Arqu|Temple Radicati/i, "Lima"],
	[/Dallas/i, "Dallas"],
	[/Lowe Art/i, "Miami"],
	[/World Culture/i, "Gothenburg"],
	[/Museum der Kulturen/i, "Basel"],
	[/Puruchuco/i, "Puruchuco"],
	[/Incahuasi/i, "Inkawasi"],
	[/Mallqui/i, "Leymebamba"],
	[/Dumbarton/i, "Washington"],
	[/Chileno/i, "Santiago"],
	[/Penn Museum/i, "Philadelphia"],
	[/American Museum of Natural/i, "New York"],
	[/Carlos Museum/i, "Atlanta"],
	[/Peabody/i, "Cambridge"],
];

export function shortMuseum(k: KhipuSummary): string {
	const m = k.museum ?? "";
	for (const [re, city] of CITY) if (re.test(m)) return city;
	const city = m.match(/,\s*([^,]+)$/)?.[1];
	return city?.trim() || m || "unknown museum";
}

/**
 * The hypothesis registry of /next/proving-ground: every claim the engine
 * can re-derive, its default specification, the axes a reader may vary, and
 * the recorded numbers a default run is judged against. Node-importable.
 *
 * Static entries follow spec §5 P2; ids equal build_ledger.py's
 * HYPOTHESIS_BY_CLAIM. Pair ("pair:A|B") and chain ("chain:T>H") ids that
 * are not static are synthesised on demand.
 */

import { alignmentMeasures } from "../next/linktest.ts";
import type {
	Claim,
	Executor,
	Expected,
	Hypothesis,
	SpecAxis,
} from "../next/types.ts";
import { chainExec } from "./tests/chains.ts";
import { whiteLargerExec } from "./tests/colour.ts";
import { valueConflictsExec } from "./tests/conflicts.ts";
import { decoyExec, plantedExec } from "./tests/controls.ts";
import { firstCordTotalsExec } from "./tests/grouptotals.ts";
import { pairExec } from "./tests/pair.ts";
import { scanFloorExec } from "./tests/passages.ts";
import { profileCountsExec } from "./tests/profile.ts";
import { strandsVerifiedExec } from "./tests/strandsCheck.ts";
import { r1adjExec, r1Exec, r9Exec } from "./tests/sums.ts";
import { topCordExec } from "./tests/topcords.ts";

/* ─────────── axes ─────────── */

const valueSourceAxis: SpecAxis = {
	key: "valueSource",
	label: "Values",
	options: [
		{ value: "kfg", label: "Values as the KFG records them" },
		{
			value: "knots",
			label: "Values re-read from the knots where they differ",
		},
	],
};

const mkNullAxis: SpecAxis = {
	key: "null",
	label: "Chance model",
	options: [
		{ value: "pendants", label: "Whole pendants shuffled (MK a)" },
		{ value: "values", label: "Pendant values shuffled, colours stay" },
		{ value: "within", label: "Pendants shuffled within their group (MK c)" },
		{ value: "groupOrder", label: "Groups shuffled as blocks (MK b)" },
	],
};

const subsetAxis: SpecAxis = {
	key: "subset",
	label: "Khipus",
	options: [
		{
			value: "arithmetic",
			label: "Decimal khipus (Wari and unreadable left out)",
		},
		{ value: "wari", label: "Wari canuto khipus only" },
		{ value: "all", label: "Every khipu, as chance.json counts them" },
	],
};

const pairAxes: SpecAxis[] = [
	{
		key: "statistic",
		label: "Measure",
		options: [
			{ value: "sw", label: "Tolerant alignment score (slips allowed)" },
			{ value: "run", label: "Longest exact shared run" },
		],
	},
	{
		key: "null",
		label: "Chance model",
		options: [
			{ value: "sequence", label: "Second khipu's cords shuffled end to end" },
			{
				value: "seqWithin",
				label: "Second khipu's cords shuffled within groups",
			},
		],
	},
	valueSourceAxis,
	{
		key: "minMax",
		label: "Exact-run windows need a value of at least",
		options: [
			{ value: 15, label: "15" },
			{ value: 50, label: "50" },
		],
	},
];

const controlAxes: SpecAxis[] = pairAxes.slice(0, 2);

const chainAxes: SpecAxis[] = [
	{
		key: "gmin",
		label: "Smallest total counted",
		options: [
			{ value: 100, label: "100" },
			{ value: 1000, label: "1,000" },
		],
	},
	{
		key: "slip",
		label: "Matches",
		options: [
			{ value: false, label: "Exact values only" },
			{ value: true, label: "Also one digit apart" },
		],
	},
	{
		key: "null",
		label: "Chance model",
		options: [
			{
				value: "both",
				label: "Both khipus' pendant values shuffled (totals redrawn)",
			},
			{
				value: "values",
				label: "Heads khipu's values shuffled (order only)",
			},
			{
				value: "within",
				label: "Heads khipu's values shuffled within groups (order only)",
			},
		],
	},
];

/* ─────────── helpers ─────────── */

const PAIR_SPEC = {
	statistic: "sw",
	null: "sequence",
	valueSource: "kfg",
	minMax: 15,
};
// null "both" is arith_chain.py's null: every khipu's pendant values
// permuted, so the totals are redrawn from the totals khipu's own values and
// the test asks whether the coincidences happen at all. slip stays false: the
// recorded chains (11, 5) count exact matches; arith_chain.py also admits
// one-digit variants, which lengthens both chains (18, 7).
const CHAIN_SPEC = { gmin: 100, slip: false, null: "both" };
// subset "all", not the spec's "arithmetic": build_chance.py (chance.json,
// the recorded 8648 / 740) keeps the Wari and unreadable khipus; on
// "arithmetic" r1 is 8312 and r1adj 718.
const R1_SPEC = { null: "pendants", valueSource: "kfg", subset: "all" };

export function pairKeyOf(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pairHypothesis(
	a: string,
	b: string,
	claimId: string,
	extra: Partial<Hypothesis> = {},
): Hypothesis {
	return {
		id: `pair:${a}|${b}`,
		claimId,
		label: `${a} and ${b}`,
		scope: "pair",
		ids: [a, b],
		statistic: `how well ${a} aligns with ${b} (tolerant score), against ${b} shuffled`,
		defaultSpec: { ...PAIR_SPEC },
		axes: pairAxes,
		R: 1000,
		lineup: true,
		cost: "instant",
		...extra,
	};
}

function chainHypothesis(
	totals: string,
	heads: string,
	claimId: string,
	extra: Partial<Hypothesis> = {},
): Hypothesis {
	return {
		id: `chain:${totals}>${heads}`,
		claimId,
		label: `${totals} totals heading ${heads}`,
		scope: "pair",
		ids: [totals, heads],
		statistic: `${totals} group totals found in order among ${heads}'s pendants, against both khipus' values shuffled`,
		defaultSpec: { ...CHAIN_SPEC },
		axes: chainAxes,
		R: 1000,
		python: "python3 scripts/deep/arith_chain.py",
		cost: "instant",
		...extra,
	};
}

/**
 * the 12 pair claims of build_ledger.py, [a, b, claimId, python, direction];
 * direction null: found by a corpus screen, shown but not judged (see WHY)
 */
const PAIRS: [
	string,
	string,
	string,
	string | undefined,
	"above" | "chance" | null,
][] = [
	[
		"KH0097",
		"KH0586",
		"paris-lima-pair",
		"python3 scripts/paris_lima_pair.py",
		"above",
	],
	[
		"KH0192",
		"KH0470",
		"as175-ur233-part1",
		"python3 scripts/tied_twice.py",
		"above",
	],
	[
		"KH0192",
		"KH0469",
		"as175-ur232-part3",
		"python3 scripts/tied_twice.py",
		"above",
	],
	[
		"KH0377",
		"KH0590",
		"brown-eight",
		"python3 scripts/cross_khipu_analysis.py",
		"above",
	],
	[
		"KH0358",
		"KH0602",
		"six-fields",
		"python3 scripts/cross_khipu_analysis.py",
		"above",
	],
	[
		"KH0284",
		"KH0285",
		"kh0284-kh0285-copy",
		"python3 scripts/deep/align_verify.py",
		"above",
	],
	[
		"KH0049",
		"KH0362",
		"rounded-copy",
		"python3 scripts/cross_khipu_analysis.py",
		"above",
	],
	[
		"KH0118",
		"KH0471",
		"kh0118-kh0471-summary",
		"python3 scripts/link_screens.py",
		null,
	],
	[
		"KH0147",
		"KH0683",
		"basel-fragment-assignments",
		"python3 scripts/basel_fragments.py",
		"above",
	],
	[
		"KH0132",
		"KH0456",
		"kh0132-kh0456-copy",
		"python3 scripts/link_screens.py",
		null,
	],
	[
		"KH0468",
		"KH0691",
		"kh0691-kh0468",
		"python3 scripts/link_screens.py",
		null,
	],
	[
		"KH0197",
		"KH0402",
		"kh0197-kh0402",
		"python3 scripts/link_screens.py",
		null,
	],
];

/* ─────────── static registry ─────────── */

export const HYPOTHESES: Hypothesis[] = [
	{
		id: "scanFloor",
		claimId: "scan-noise-floor",
		label: "Shared runs beat a shuffled corpus",
		scope: "corpus",
		statistic: "khipu pairs whose longest exact shared run is 6 or more",
		defaultSpec: { cls: "6+", atLeast: 6, windows: "5+4", minMax: 15 },
		axes: [
			{
				key: "cls",
				label: "Longest shared run",
				options: [
					{ value: "6+", label: "6 or more" },
					{ value: "5", label: "exactly 5" },
					{ value: "4", label: "exactly 4" },
				],
			},
			{
				key: "windows",
				label: "Windows",
				options: [
					{ value: "5+4", label: "Five-cord and four-cord windows" },
					{ value: "5", label: "Five-cord windows only" },
				],
			},
			{
				key: "minMax",
				label: "A window needs a value of at least",
				options: [
					{ value: 15, label: "15" },
					{ value: 50, label: "50" },
				],
			},
		],
		// 100, not 20: at R = 20 the smallest attainable p is 1/21, so an
		// "above" verdict (p < 0.01) could never be reached
		R: 100,
		expected: {
			value: 24,
			tol: 0,
			nullMean: 0.7,
			nullTol: 0.8,
			direction: "above",
			source:
				"public/data/stories/links.json baseline (scripts/build_links.py)",
		},
		python: "python3 scripts/build_links.py",
		cost: "seconds",
	},
	{
		id: "r1",
		claimId: "mk-relations-chance",
		label: "Pendant sums at chance",
		scope: "corpus",
		statistic: "pendants that equal the sum of a run of neighbouring pendants",
		defaultSpec: { ...R1_SPEC },
		axes: [mkNullAxis, valueSourceAxis, subsetAxis],
		R: 200,
		expected: {
			value: 8648,
			tol: 0,
			nullMean: 8525,
			nullTol: 25,
			direction: "chance",
			ratioMax: 1.05,
			source:
				"public/data/stories/chance.json relations.r1 (scripts/build_chance.py)",
		},
		python: "python3 scripts/build_chance.py",
		cost: "seconds",
	},
	{
		id: "r1adj",
		claimId: "adjacent-sums-real",
		label: "Adjacent sums beat chance",
		scope: "corpus",
		statistic: "pendant sums whose parts start on the very next cord",
		defaultSpec: { ...R1_SPEC },
		axes: [mkNullAxis, valueSourceAxis, subsetAxis],
		R: 200,
		expected: {
			value: 740,
			tol: 0,
			nullMean: 584,
			nullTol: 12,
			direction: "above",
			source:
				"public/data/stories/chance.json relations.r1adj (scripts/build_chance.py)",
		},
		python: "python3 scripts/build_chance.py",
		cost: "seconds",
	},
	{
		id: "r9",
		claimId: "mk-top-cord-sums-real",
		label: "Top-cord sums beat chance",
		scope: "corpus",
		statistic:
			"lone top cords that sum a neighbouring group (a one-digit slip allowed)",
		defaultSpec: { null: "pendants", slip: true },
		axes: [
			{
				key: "null",
				label: "Chance model",
				options: [
					{ value: "pendants", label: "Whole pendants shuffled (MK a)" },
					{
						value: "within",
						label: "Pendants shuffled within their group (MK c)",
					},
				],
			},
			{
				key: "slip",
				label: "Matches",
				options: [
					{ value: true, label: "Exact, or one digit off" },
					{ value: false, label: "Exact only" },
				],
			},
		],
		R: 200,
		expected: {
			value: 101,
			tol: 0,
			nullMean: 32.1,
			nullTol: 2.5,
			direction: "above",
			source:
				"public/data/stories/chance.json relations.r9 (scripts/build_chance.py)",
		},
		python: "python3 scripts/build_chance.py",
		cost: "seconds",
	},
	{
		id: "profileCounts",
		claimId: "sum-khipus-excess",
		label: "Khipus with clear sums",
		scope: "corpus",
		statistic: "khipus whose own sums clearly beat a shuffle of their values",
		defaultSpec: { valueSource: "kfg" },
		axes: [valueSourceAxis],
		R: 1000,
		expected: {
			value: 48,
			tol: 4,
			detail: {
				some: { value: 29, tol: 4 },
				none: { value: 428, tol: 8 },
				small: { value: 163, tol: 0 },
				untested: { value: 16, tol: 0 },
			},
			direction: "count",
			source:
				"public/data/profiles.json meta.counts (scripts/build_profiles.py)",
		},
		python: "python3 scripts/build_profiles.py",
		cost: "heavy",
	},
	{
		id: "firstCordTotals",
		claimId: "total-on-first-cord",
		label: "Totals on the first cord",
		scope: "corpus",
		statistic: "groups whose total sits on their first cord",
		defaultSpec: {
			null: "values",
			minCord: 10,
			exclude: "none",
			valueSource: "kfg",
			position: "first",
		},
		axes: [
			{
				key: "null",
				label: "Chance model",
				options: [
					{ value: "values", label: "Pendant values shuffled along the khipu" },
					{
						value: "within",
						label: "Pendant values shuffled within their group",
					},
				],
			},
			{
				key: "minCord",
				label: "Total cord at least",
				options: [
					{ value: 10, label: "10" },
					{ value: 50, label: "50" },
				],
			},
			{
				key: "exclude",
				label: "Khipus",
				options: [
					{ value: "none", label: "All decimal khipus" },
					{ value: "inkawasi", label: "Inkawasi left out" },
				],
			},
			valueSourceAxis,
			{
				key: "position",
				label: "Total cord position",
				options: [
					{ value: "first", label: "First cord of the group" },
					{ value: "last", label: "Last cord" },
					{ value: "interior", label: "Inside the group" },
				],
			},
		],
		R: 200,
		expected: {
			value: 91,
			tol: 0,
			nullMean: 7,
			nullTol: 1.5,
			direction: "above",
			source:
				"scripts/deep/tree_grouptotals.py (GRAMMAR in src/lib/stories/totals.ts)",
		},
		python: "python3 scripts/deep/tree_grouptotals.py",
		cost: "seconds",
	},
	{
		id: "topCordPrev",
		claimId: "top-cord-totals-previous",
		label: "Top cords total the group before, not after",
		scope: "corpus",
		statistic:
			"top cords equal to the total of the group before them, against an even split between the group before and the group after",
		defaultSpec: { target: "prev", slip: false, null: "direction" },
		axes: [
			{
				key: "null",
				label: "Chance model",
				options: [
					{
						value: "direction",
						label: "Before and after equally likely (sign test)",
					},
					{
						value: "pooled",
						label: "Top-cord values drawn from other khipus",
					},
				],
			},
			{
				key: "target",
				label: "Group compared",
				options: [
					{ value: "prev", label: "The group before" },
					{ value: "next", label: "The group after" },
					{ value: "same", label: "Its own group" },
				],
			},
			{
				key: "slip",
				label: "Matches",
				options: [
					{ value: false, label: "Exact only" },
					{ value: true, label: "Also ±1 or a register slip" },
				],
			},
		],
		R: 0,
		// The claim is a contrast, before not after, so the default null is a
		// sign test between the two neighbours: 47 top cords total the group
		// before, 15 the group after, and chance would split the 62 evenly
		// (31). tree_topcords.py's pooled null (47 against 0.8) is kept as an
		// option; under it the group after (15 against 0.8) also beats chance,
		// so it cannot carry the direction. The ledger's 8.3 is a sceptic's
		// re-derivation under a third null.
		expected: {
			value: 47,
			tol: 0,
			nullMean: 31,
			nullTol: 0.5,
			detail: { next: { value: 15, tol: 0 } },
			direction: "above",
			source:
				"scripts/deep/tree_topcords.py (PREV 47, NEXT 15; sign test between them)",
		},
		python: "python3 scripts/deep/tree_topcords.py",
		cost: "instant",
	},
	chainHypothesis("KH0517", "KH0502", "kh0517-totals-heads-kh0502", {
		expected: {
			value: 11,
			tol: 0,
			direction: "above",
			source:
				"scripts/deep/arith_chain.py; src/lib/stories/totals.ts totalsToHeads",
		},
	}),
	chainHypothesis("KH0507", "KH0513", "kh0507-kh0513-heads", {
		expected: {
			value: 5,
			tol: 0,
			direction: "above",
			source: "scripts/deep/arith_chain.py",
		},
	}),
	{
		id: "whiteLarger",
		claimId: "white-pendants-larger",
		label: "White pendants carry larger numbers",
		scope: "corpus",
		statistic:
			"how far white pendants sit above the other colours of their khipu",
		defaultSpec: { null: "values", minPendants: 8, exclude: "none" },
		axes: [
			{
				key: "null",
				label: "Chance model",
				options: [
					{ value: "values", label: "Pendant values shuffled along the khipu" },
					{
						value: "within",
						label: "Pendant values shuffled within their group",
					},
				],
			},
			{
				key: "minPendants",
				label: "Khipus with valued pendants, at least",
				options: [
					{ value: 8, label: "8" },
					{ value: 20, label: "20" },
				],
			},
			{
				key: "exclude",
				label: "Khipus",
				options: [
					{ value: "none", label: "All decimal khipus" },
					{ value: "inkawasi", label: "Inkawasi left out" },
				],
			},
		],
		R: 200,
		expected: {
			// The engine's rule (level-1 cords, value > 0, single-code longest
			// colour, khipus with >= 8 such cords and >= 2 colours, NOT_DECIMAL
			// out) gives +0.04235 over 332 khipus, null -0.00001 sd 0.0057, z 7.5
			// at 2000 reps. vocab_d_colour.py's "solid colour" rule on the
			// 2026-09-24 data: +0.0428 over 317 khipus, null sd 0.006, z +7.2.
			value: 0.0423,
			tol: 0.001,
			nullMean: 0,
			// 0.003: the null sd is 0.0057, so a quick run (R 40) has a
			// Monte Carlo error of about 0.0009 on the chance level
			nullTol: 0.003,
			direction: "above",
			source:
				"scripts/deep/vocab_d_colour.py (white +0.0428, z 7.2 on 2026-09-24 data; story: z 6.7, 171 khipus against 121)",
		},
		python: "python3 scripts/deep/vocab_d_colour.py",
		cost: "seconds",
	},
	{
		id: "valueConflicts",
		claimId: "value-knot-conflicts",
		label: "Values that disagree with their knots",
		scope: "corpus",
		statistic: "cords whose KFG value differs from the sum of their knots",
		defaultSpec: {},
		axes: [],
		R: 0,
		expected: {
			value: 104,
			tol: 0,
			detail: { khipus: { value: 49, tol: 0 } },
			direction: "count",
			source: "scripts/build_data.py value_conflicts()",
		},
		python: "python3 scripts/mk/value_knot_conflicts.py",
		cost: "instant",
	},
	{
		id: "strandsVerified",
		claimId: "strands-thread-verified",
		label: "Every thread checks out",
		scope: "corpus",
		statistic: "share of strands.json threads whose values match the corpus",
		defaultSpec: {},
		axes: [],
		R: 0,
		expected: {
			value: 1,
			tol: 0,
			direction: "count",
			source: "scripts/build_strands.py",
		},
		python: "python3 scripts/build_strands.py",
		cost: "instant",
	},
	{
		id: "wariR1",
		claimId: "wari-canuto-no-reading",
		label: "Wari canuto sums at chance",
		scope: "corpus",
		statistic: "pendant sums on the nine Wari canuto khipus",
		defaultSpec: { ...R1_SPEC, subset: "wari" },
		axes: [mkNullAxis, valueSourceAxis, subsetAxis],
		R: 200,
		expected: {
			direction: "chance",
			ratioMax: 1.5,
			source: "scripts/nonnumeric/canuto_family.py (pooled z within ±1)",
		},
		control: "negative",
		python: "python3 scripts/nonnumeric/canuto_family.py",
		cost: "instant",
	},
	{
		id: "decoyPair",
		claimId: "control:decoy",
		label: "Decoy pair must fall",
		scope: "pair",
		ids: ["KH0097", "KH0586"],
		statistic:
			"KH0097 aligned with a shuffled KH0586 (seed 777), against further shuffles",
		defaultSpec: { statistic: "sw", null: "sequence" },
		axes: controlAxes,
		R: 1000,
		expected: {
			direction: "chance",
			source: "negative control (scripts/next/check_engine.mts)",
		},
		control: "negative",
		lineup: true,
		cost: "instant",
	},
	{
		id: "plantedCopy",
		claimId: "control:planted",
		label: "Planted copy must be found",
		scope: "pair",
		ids: ["KH0097", "KH0586"],
		statistic:
			"KH0097 aligned with a shuffled KH0586 carrying the pair's longest run planted back",
		defaultSpec: { statistic: "sw", null: "sequence" },
		axes: controlAxes,
		R: 1000,
		expected: {
			direction: "above",
			source: "positive control (scripts/next/check_engine.mts)",
		},
		control: "positive",
		lineup: true,
		cost: "instant",
	},
	...PAIRS.map(([a, b, claimId, python, direction]) =>
		pairHypothesis(
			a,
			b,
			claimId,
			direction
				? {
						python,
						expected: {
							direction,
							source:
								direction === "chance"
									? `${claimId}: recorded as fallen (${python ?? "screen"})`
									: `${claimId} (${python ?? "story"})`,
						},
					}
				: { python },
		),
	),
];

/* ─────────── why a run is shown but not judged ─────────── */

const SCREEN_WHY =
	"found by a screen over about 233,000 khipu pairs; a shuffle of this one pair cannot account for that search, so the run is shown but not judged";
const SCAN_WHY =
	"found by a scan over many khipu pairs; a shuffle of this one pair cannot account for that search, so the run is shown but not judged";

/** static entries with no expectation, and why */
const STATIC_WHY = new Map<string, string>(
	PAIRS.filter((p) => p[4] === null).map((p) => [
		`pair:${p[0]}|${p[1]}`,
		p[2] === "kh0118-kh0471-summary"
			? `${SCREEN_WHY}; its evidence is a match of group leaders, which the whole-sequence alignment does not measure`
			: SCREEN_WHY,
	]),
);
const CLAIM_WHY = new WeakMap<Hypothesis, string>();

/** Why a hypothesis carries no expectation (its runs are exploratory), if known. */
export function unjudgedWhy(h: Hypothesis): string | undefined {
	return CLAIM_WHY.get(h) ?? STATIC_WHY.get(h.id);
}

/**
 * Axes whose options change what is tested rather than how: the other
 * positions of a total cord, the other target groups of a top cord, another
 * run class, another khipu family. Their specifications are controls, and
 * the specification curve leaves them out of "holds in N of M".
 */
const CLAIM_AXES: Record<string, string[]> = {
	firstCordTotals: ["position"],
	topCordPrev: ["target"],
	scanFloor: ["cls"],
	wariR1: ["subset"],
};

export function claimChangingAxes(h: Hypothesis): string[] {
	return CLAIM_AXES[h.id] ?? [];
}

const STATIC = new Map(HYPOTHESES.map((h) => [h.id, h]));

const STATIC_EXEC: Record<string, Executor> = {
	scanFloor: scanFloorExec,
	r1: r1Exec,
	r1adj: r1adjExec,
	r9: r9Exec,
	profileCounts: profileCountsExec,
	firstCordTotals: firstCordTotalsExec,
	topCordPrev: topCordExec,
	whiteLarger: whiteLargerExec,
	valueConflicts: valueConflictsExec,
	strandsVerified: strandsVerifiedExec,
	wariR1: r1Exec,
	decoyPair: decoyExec,
	plantedCopy: plantedExec,
};

function parsePairId(id: string): [string, string] | null {
	const m = /^pair:(KH\d{4})\|(KH\d{4})$/.exec(id);
	if (!m || m[1] === m[2]) return null;
	return [m[1], m[2]];
}

function parseChainId(id: string): [string, string] | null {
	const m = /^chain:(KH\d{4})>(KH\d{4})$/.exec(id);
	if (!m || m[1] === m[2]) return null;
	return [m[1], m[2]];
}

const synth = new Map<string, Hypothesis>();

/** a static entry, else a synthesised "pair:A|B" or "chain:T>H" */
export function getHypothesis(id: string): Hypothesis | undefined {
	const s = STATIC.get(id);
	if (s) return s;
	const hit = synth.get(id);
	if (hit) return hit;
	let h: Hypothesis | undefined;
	const p = parsePairId(id);
	if (p) h = pairHypothesis(p[0], p[1], `pair:${pairKeyOf(p[0], p[1])}`);
	const c = p ? null : parseChainId(id);
	if (c) h = chainHypothesis(c[0], c[1], `chain:${c[0]}>${c[1]}`);
	if (h) synth.set(id, h);
	return h;
}

const execs = new Map<string, Executor>();

/** the executor behind a hypothesis id; throws on an unknown id */
export function getExecutor(id: string): Executor {
	const s = STATIC_EXEC[id];
	if (s) return s;
	let ex = execs.get(id);
	if (ex) return ex;
	const p = parsePairId(id);
	if (p) ex = pairExec(p[0], p[1]);
	const c = p ? null : parseChainId(id);
	if (c) ex = chainExec(c[0], c[1]);
	if (!ex) throw new Error(`unknown hypothesis ${id}`);
	execs.set(id, ex);
	return ex;
}

/** a claim-specific copy of `h` with no expectation, and why */
export function unjudged(h: Hypothesis, claim: Claim, why: string): Hypothesis {
	const { expected: _dropped, ...rest } = h;
	const out: Hypothesis = { ...rest, claimId: claim.id };
	CLAIM_WHY.set(out, why);
	return out;
}

/**
 * Attach a claim's recorded direction to a hypothesis that has none (a
 * synthesised pair or chain): held, likely and published-prior must beat
 * chance, fell must not. The claim stays exploratory, with the reason kept
 * for `unjudgedWhy`, when it is open, when it was found by a scan (a single
 * pair's shuffle cannot see the search), or when its evidence is not an
 * ordered alignment of main-cord values (a catalogue identity, a ratio, a
 * leader match, subsidiaries, cord lengths). Static entries are returned
 * unchanged.
 */
export function withClaimExpectation(h: Hypothesis, claim: Claim): Hypothesis {
	if (h.expected || STATIC.has(h.id)) return h;
	if (claim.status === "open")
		return unjudged(h, claim, "an open claim: nothing is recorded to judge");
	const isChain = h.id.startsWith("chain:");
	if (!isChain && !alignmentMeasures(claim.test, claim.statement))
		return unjudged(
			h,
			claim,
			`the live test aligns main-cord values; this claim's evidence (${claim.test ?? "not recorded"}) is not what it measures`,
		);
	if (claim.downgrades.includes("multiplicity") || claim.origin === "screen")
		return unjudged(h, claim, SCAN_WHY);
	let direction: Expected["direction"] | null = null;
	if (
		claim.status === "held" ||
		claim.status === "likely" ||
		claim.status === "published-prior"
	)
		direction = "above";
	else if (claim.status === "fell") direction = "chance";
	if (!direction) return { ...h, claimId: claim.id };
	return {
		...h,
		claimId: claim.id,
		expected: {
			direction,
			source: `${claim.id}: recorded ${claim.status}${claim.script ? ` (${claim.script})` : ""}`,
		},
	};
}

/** true for ids of the form pair:KHxxxx|KHxxxx */
export function isPairId(id: string): boolean {
	return parsePairId(id) !== null;
}

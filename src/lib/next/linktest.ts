/**
 * Which live test measures a link or a pair claim. The engine's pair test
 * scores an ordered alignment of main-cord values (Smith–Waterman against the
 * second khipu shuffled); the chain test scores group totals found in order
 * among another khipu's pendants. Evidence of any other kind (a catalogue
 * identity, a ratio, a match of group leaders, subsidiaries, cord lengths)
 * is not what either test measures, so it is shown but never judged by them.
 * Node-importable: no imports.
 */

export type LinkTest =
	| { kind: "align" }
	| { kind: "chain"; totals: string; heads: string }
	| { kind: "none"; why: string };

/** strands.json rules that are not an ordered alignment of main-cord values */
const NOT_ALIGN_RULE =
	/not read cord by cord|×\s*\d|mirror|analogous|values ≥|shared values|one entry|lone value|leading cords|group leaders|subsidiar|times|no value passes/i;

/** How a strands.json link (rule, a, b) is scored live. */
export function linkTestOf(rule: string, a: string, b: string): LinkTest {
	if (/group total\s*→\s*group head/i.test(rule))
		return { kind: "chain", totals: a, heads: b };
	if (NOT_ALIGN_RULE.test(rule))
		return {
			kind: "none",
			why: `the link rests on "${rule}", which an alignment of main-cord values does not measure`,
		};
	return { kind: "align" };
}

/** a ledger `test` the pair alignment measures */
const ALIGN_TEST =
	/align|ordered match|group match|value match|exact match|field|smith|shared run|in order/i;
/** tests (or statements) whose evidence lies outside the main-cord values */
const NOT_ALIGN_TEST =
	/catalogue|accession|kfg notes|ratio|scal|rare-value|leaders|near-value|value overlap|shared values|length|subsidiar|not an ordered value alignment|sceptic/i;

/**
 * Does the whole-sequence pair test measure this claim's evidence? `test` is
 * the claim's recorded test, `statement` its sentence.
 */
export function alignmentMeasures(
	test: string | null,
	statement = "",
): boolean {
	if (!test) return false;
	if (NOT_ALIGN_TEST.test(test)) return false;
	if (/subsidiar|cord length/i.test(statement)) return false;
	return ALIGN_TEST.test(test);
}

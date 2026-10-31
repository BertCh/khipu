import { readJson } from "#/lib/khipu/data";

/**
 * Cord-by-cord matches between linked khipus (`public/data/stories/strands.json`):
 * for each link, which pendant of one khipu answers which pendant of the
 * other, and how. Indices are 0-based level-1 cord positions, the same
 * indexing as the silhouettes and the scan spans.
 */

export type ThreadKind =
	/** the same value, never 0 */
	| "exact"
	/** both cords blank where the rule lays them side by side: an agreeing field */
	| "blank"
	/** a small slip the link's rule allows (`how` names it: off by one, within 2%…) */
	| "near"
	/** cords the rule pairs whose values disagree (`how`: the story's verdict) */
	| "differ"
	/** a value on one side, a blank on the other */
	| "dropped"
	/** one side sums several cords */
	| "sum"
	/** a fixed ratio */
	| "scaled";

export interface StrandThread {
	/** cords of khipu `a`; more than one when they add up to the other side */
	a: number[];
	b: number[];
	va: number;
	vb: number;
	kind: ThreadKind;
	/** for near / differ / dropped: which slip or verdict ("off by a ten") */
	how?: string;
	/** subsidiary cords (by name) this end stands for; the index is their pendant */
	subA?: string[];
	subB?: string[];
	note?: string;
}

/** A curated link's level, or "scan" for an unexamined scan pair. */
export type StrandLevel = "firm" | "likely" | "open" | "scan";

export interface StrandLink {
	a: string;
	b: string;
	rule: string;
	/** firm / likely / open from links.ts CURATED; "scan" = no one has read it
	 * (a longest run of 4 is at the chance floor — see links.json baseline) */
	level?: StrandLevel;
	/** the scan's longest run of exact consecutive values, when it sees the pair */
	longest?: number;
	/** field-for-field rules: fields laid side by side, and how many agree
	 * outright (exact, blank, sum or scaled) — the stories' "89 of 104" */
	compared?: number;
	agree?: number;
	/** empty for a curated link no cord-level rule reaches */
	threads: StrandThread[];
}

export interface StrandFile {
	/** keyed by `pairKey(a, b)` from links.ts */
	links: Record<string, StrandLink>;
}

export const THREAD_LABEL: Record<ThreadKind, string> = {
	exact: "exact",
	blank: "both blank",
	near: "near",
	differ: "differs",
	dropped: "one side blank",
	sum: "sum",
	scaled: "scaled",
};

/** Kinds that join two cords the link says correspond in value. */
export const MATCH_KINDS: ReadonlySet<ThreadKind> = new Set([
	"exact",
	"near",
	"sum",
	"scaled",
]);

/** Threads that carry a value across (not blank pairs, differences or drops). */
export function matchedThreads(link: StrandLink | undefined): StrandThread[] {
	return link ? link.threads.filter((t) => MATCH_KINDS.has(t.kind)) : [];
}

/** Curated levels: someone has read the pair. */
export const CURATED_LEVELS: ReadonlySet<StrandLevel> = new Set([
	"firm",
	"likely",
	"open",
]);

/**
 * The strength gate for drawing a link: curated links always; unexamined
 * scan pairs only when asked for, and never a longest run under 5 (a run of
 * 4 is at the chance floor — links.json baseline).
 */
export function drawableLink(link: StrandLink, includeScan = false): boolean {
	const level = link.level ?? "scan";
	if (CURATED_LEVELS.has(level)) return true;
	return includeScan && (link.longest ?? 0) >= 5;
}

/** The strand file, or undefined while it has not been built. */
export async function getStrands(): Promise<StrandFile | undefined> {
	try {
		const f = await readJson<StrandFile>("stories/strands.json");
		return f?.links ? f : undefined;
	} catch {
		return undefined;
	}
}

/** One thread seen from one khipu: its own cords, and the partner's. */
export interface CordMatch {
	kind: ThreadKind;
	/** this khipu's level-1 cord indices (more than one when they sum) */
	mine: number[];
	theirs: number[];
	/** the value on this khipu's side, and on the partner's */
	value: number;
	partnerValue: number;
	/** subsidiary cords (by name) the thread passes through, on each side */
	subMine?: string[];
	subTheirs?: string[];
	how?: string;
	note?: string;
}

/** Every thread between one khipu and one partner, oriented from the khipu. */
export interface PartnerMatches {
	partner: string;
	/** `pairKey(id, partner)` */
	key: string;
	rule: string;
	level: StrandLevel;
	longest?: number;
	/** the link is a scan pair no one has read */
	unexamined: boolean;
	/** field-for-field rules: fields compared, and how many agree */
	compared?: number;
	agree?: number;
	matches: CordMatch[];
}

/**
 * The strands that touch one khipu, turned so that `mine` is always its side
 * (a thread's `a` follows the link's `a`, whichever way the key sorts). Scan
 * pairs whose longest run is below `minScanRun` are left out: a run of four
 * is what a shuffled corpus produces (links.json baseline).
 */
export function matchesFor(
	file: StrandFile | undefined,
	id: string,
	{ minScanRun = 5 }: { minScanRun?: number } = {},
): PartnerMatches[] {
	if (!file) return [];
	const out: PartnerMatches[] = [];
	for (const [key, link] of Object.entries(file.links)) {
		if (link.a !== id && link.b !== id) continue;
		const level = link.level ?? "scan";
		if (level === "scan" && (link.longest ?? 0) < minScanRun) continue;
		const isA = link.a === id;
		out.push({
			partner: isA ? link.b : link.a,
			key,
			rule: link.rule,
			level,
			longest: link.longest,
			unexamined: level === "scan",
			compared: link.compared,
			agree: link.agree,
			matches: link.threads.map((t) => ({
				kind: t.kind,
				mine: isA ? t.a : t.b,
				theirs: isA ? t.b : t.a,
				value: isA ? t.va : t.vb,
				partnerValue: isA ? t.vb : t.va,
				subMine: isA ? t.subA : t.subB,
				subTheirs: isA ? t.subB : t.subA,
				how: t.how,
				note: t.note,
			})),
		});
	}
	const rank: Record<StrandLevel, number> = {
		firm: 0,
		likely: 1,
		open: 2,
		scan: 3,
	};
	return out.sort(
		(x, y) =>
			rank[x.level] - rank[y.level] ||
			y.matches.length - x.matches.length ||
			x.partner.localeCompare(y.partner),
	);
}

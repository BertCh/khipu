/**
 * The claims ledger (public/data/next/claims.json) and how each claim meets
 * the engine: which hypothesis re-runs it, what its live label is, and how
 * certain it stands once downgrades and the live verdict are counted.
 * Link pairs the ledger never wrote down get a synthetic claim, id
 * "pair:<pairKey>", so every /network link can be opened here.
 */
import {
	getHypothesis,
	unjudged,
	unjudgedWhy,
	withClaimExpectation,
} from "#/lib/engine/registry";
import { readJson } from "#/lib/khipu/data";
import type { Graph, GraphLink } from "#/lib/stories/links";
import type { StrandFile, StrandLink } from "#/lib/stories/strands";
import { type LinkTest, linkTestOf } from "./linktest.ts";
import type {
	Claim,
	ClaimStatus,
	ClaimsFile,
	Downgrade,
	Hypothesis,
	VerdictRecord,
} from "./types.ts";

export function getClaims(): Promise<ClaimsFile> {
	return readJson<ClaimsFile>("next/claims.json");
}

const ID_RE = /^KH\d{4}$/;

function normPair(pair: string): string | undefined {
	const [a, b, ...rest] = pair.split("|");
	if (rest.length || !a || !b || !ID_RE.test(a) || !ID_RE.test(b) || a === b)
		return undefined;
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const LEVEL_STATUS: Record<string, ClaimStatus> = {
	firm: "held",
	likely: "likely",
	open: "open",
	scan: "open",
};

/** A synthetic claim for a pair the ledger has no entry for. */
export function claimForPair(
	pair: string,
	link?: StrandLink,
	curated?: GraphLink,
): Claim {
	const key = normPair(pair) ?? pair;
	const [a, b] = key.split("|");
	const isCurated = !!curated && curated.kind !== "passage";
	const level = isCurated ? curated.level : (link?.level ?? "scan");
	const longest = curated?.scan?.longest ?? link?.longest;
	const prior = curated?.prior;
	const published = prior?.status === "published" || !!curated?.source;
	const status: ClaimStatus = published
		? "published-prior"
		: (LEVEL_STATUS[level] ?? "open");
	const statement = isCurated
		? curated.note
		: longest
			? `${a} and ${b} share a run of ${longest} identical cord values that nobody has read yet.`
			: `${a} and ${b} are linked; no reading has been written down here.`;
	const numbers: string[] = [];
	if (longest) numbers.push(`longest exact run ${longest}`);
	if (link?.compared)
		numbers.push(`${link.agree ?? 0} of ${link.compared} fields agree`);
	if (link?.threads.length) numbers.push(`${link.threads.length} threads`);
	const downgrades: Downgrade[] = [];
	if (!isCurated) downgrades.push("multiplicity");
	if (published) downgrades.push("prior-art");
	// the live test follows the link's rule: an alignment, a totals → heads
	// chain, or none (the pair test still draws the evidence, unjudged)
	const lt: LinkTest = link
		? linkTestOf(link.rule, link.a, link.b)
		: { kind: "align" };
	const hypothesisId =
		lt.kind === "chain" ? `chain:${lt.totals}>${lt.heads}` : `pair:${key}`;
	const test =
		lt.kind === "chain"
			? `${lt.totals}'s group totals found in order among ${lt.heads}'s pendants, against both khipus shuffled`
			: lt.kind === "none"
				? `${link?.rule}: not an ordered value alignment`
				: "Smith–Waterman score against the second khipu shuffled";
	return {
		id: `pair:${key}`,
		statement,
		khipus: [a, b],
		kind: "link",
		status,
		test,
		numbers: numbers.length ? numbers.join("; ") : null,
		script: isCurated ? null : "scripts/shared_passages.py",
		story: curated?.story ?? null,
		prior: prior
			? [prior.status, prior.note].filter(Boolean).join(": ")
			: (curated?.source ?? null),
		confounds: null,
		repro: "live",
		origin: published ? "published" : isCurated ? "story" : "screen",
		downgrades,
		hypothesisId,
		pair: key,
	};
}

/**
 * Look a claim up by id. "pair:A|B" resolves to the ledger claim whose
 * hypothesis is that pair when there is one, else to a synthetic claim built
 * from strands.json and the graph.
 */
export function resolveClaim(
	id: string,
	file: ClaimsFile,
	strands?: StrandFile,
	graph?: Graph,
): Claim | undefined {
	const direct = file.claims.find((c) => c.id === id);
	if (direct) return direct;
	if (!id.startsWith("pair:")) return undefined;
	const key = normPair(id.slice(5));
	if (!key) return undefined;
	const hid = `pair:${key}`;
	const [ka, kb] = key.split("|");
	const chains = [`chain:${ka}>${kb}`, `chain:${kb}>${ka}`];
	const ledger =
		file.claims.find((c) => c.hypothesisId === hid) ??
		file.claims.find((c) => c.pair === key && !c.supersededBy) ??
		file.claims.find((c) => chains.includes(c.hypothesisId ?? ""));
	if (ledger) return ledger;
	const link = strands?.links[key];
	const graphLinks =
		graph?.links.filter(
			(l) => (l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`) === key,
		) ?? [];
	const curated = graphLinks.find((l) => l.kind !== "passage") ?? graphLinks[0];
	return claimForPair(key, link, curated);
}

const hypCache = new Map<string, Hypothesis | undefined>();

/** The hypothesis that re-runs a claim, with the claim's expectation for synthetic pairs. */
export function hypothesisFor(claim: Claim): Hypothesis | undefined {
	const hid =
		claim.hypothesisId ?? (claim.pair ? `pair:${claim.pair}` : undefined);
	if (!hid) return undefined;
	const key = `${claim.id}\u0001${hid}\u0001${claim.status}`;
	if (hypCache.has(key)) return hypCache.get(key);
	let h: Hypothesis | undefined;
	try {
		h = getHypothesis(hid);
		if (
			h &&
			!h.expected &&
			(hid.startsWith("pair:") || hid.startsWith("chain:"))
		)
			h = withClaimExpectation(h, claim);
		else if (h && !claim.hypothesisId && h.claimId !== claim.id)
			// the pair's static test belongs to another claim: show it, unjudged
			h = unjudged(
				h,
				claim,
				`this pair's live test belongs to the claim "${h.claimId}"; this claim's evidence (${claim.test ?? "not recorded"}) is not what it measures`,
			);
	} catch {
		h = undefined;
	}
	hypCache.set(key, h);
	return h;
}

/**
 * The verdict to show for a claim. A claim whose hypothesis carries no
 * expectation for it (open, found by a scan, or evidence the live test does
 * not measure) is exploratory whatever another claim sharing the same
 * hypothesis id was judged, with the reason as its note.
 */
export function claimVerdict(
	claim: Claim,
	verdicts: Record<string, VerdictRecord>,
): VerdictRecord | undefined {
	const h = hypothesisFor(claim);
	if (!h) return undefined;
	const v = verdicts[h.id];
	if (!v || h.expected) return v;
	return {
		...v,
		verdict: "exploratory",
		note: unjudgedWhy(h) ?? "no recorded number to compare with",
	};
}

/**
 * Every pair a link claim's evidence covers: its own pair first, then the
 * strands.json links among its khipus that carry threads (the three Basel
 * fragment assignments, for one). Chains and single pairs give one entry.
 */
export function claimPairs(
	claim: Claim,
	h: Hypothesis | undefined,
	strands?: StrandFile,
): string[] {
	if (!h || !h.id.startsWith("pair:")) return [];
	const own = h.id.slice(5);
	const out = [own];
	if (!strands || claim.khipus.length < 3) return out;
	const ks = claim.khipus;
	for (let i = 0; i < ks.length; i++)
		for (let j = i + 1; j < ks.length; j++) {
			const k = normPair(`${ks[i]}|${ks[j]}`);
			if (!k || out.includes(k)) continue;
			if ((strands.links[k]?.threads.length ?? 0) > 0) out.push(k);
		}
	return out;
}

export type LiveLabel =
	| "holds"
	| "drifted"
	| "weak"
	| "contradicted"
	| "exploratory"
	| "not reproducible here"
	| "superseded"
	| "not run";

export function liveLabel(claim: Claim, v?: VerdictRecord): LiveLabel {
	if (claim.supersededBy) return "superseded";
	if (!hypothesisFor(claim)) return "not reproducible here";
	if (!v) return "not run";
	switch (v.verdict) {
		case "reproduces":
			return "holds";
		case "drift":
			return "drifted";
		case "weak":
			return "weak";
		case "contradicts":
			return "contradicted";
		case "exploratory":
			return "exploratory";
		default:
			return "not reproducible here";
	}
}

export function certainty(claim: Claim, v?: VerdictRecord): 1 | 2 | 3 | 4 {
	const downs = new Set(claim.downgrades).size;
	const hit =
		v &&
		(v.verdict === "weak" ||
			v.verdict === "contradicts" ||
			v.verdict === "drift")
			? 1
			: 0;
	return Math.max(1, Math.min(4, 4 - downs - hit)) as 1 | 2 | 3 | 4;
}

export const STATUS_TEXT: Record<ClaimStatus, string> = {
	held: "held",
	fell: "fell",
	likely: "likely",
	open: "open",
	"published-prior": "published",
};

export const LIVE_TEXT: Record<LiveLabel, string> = {
	holds: "holds",
	drifted: "drifted",
	weak: "weak",
	contradicted: "contradicted",
	exploratory: "exploratory",
	"not reproducible here": "not reproducible here",
	superseded: "superseded",
	"not run": "not run",
};

export const DOWNGRADE_TEXT: Record<Downgrade, string> = {
	"data-error":
		"Data: rests on transcribed values that have been revised or disagree with their knots",
	multiplicity:
		"Multiplicity: found by a scan over many pairs or tests, so some hits are expected by chance",
	confound:
		"Confound: place, museum, recorder or magnitude could produce the pattern on their own",
	"prior-art": "Prior art: the finding, or most of it, is already published",
	"hand-checked":
		"Hand-checked: verified by reading, with no script that re-runs it",
};

import { readJson } from "#/lib/khipu/data";
import {
	CURATED,
	type LinkKind,
	type LinkLevel,
	pairKey,
	type ScanFile,
	SETS,
} from "#/lib/stories/links";

/**
 * A khipu's profile: public/data/profiles.json, written by
 * scripts/build_profiles.py, plus its place in the link graph, derived here
 * from the curated links and the scan. Every arithmetic count carries the
 * count the same khipu's values give when shuffled.
 */

export interface TestResult {
	observed: number;
	/** mean count over the shuffles */
	chance: number;
	/** share of shuffles at or above the observed count, (1 + k) / (1 + n) */
	p: number;
}

export type ArithTest =
	| "groupTotals"
	| "adjacentSums"
	| "topSums"
	| "paperSums";

export type ArithLabel = "clear" | "some" | "none" | "small" | "untested";

export interface Profile {
	scale: {
		label: "units" | "tens" | "hundreds" | "thousands" | "none";
		/** median non-zero level-1 pendant value */
		median: number;
		nonZero: number;
		shareThousands: number;
	};
	colour: {
		label: "banded" | "seriated" | "mixed" | "irregular" | "few";
		banded: number;
		seriated: number;
		clusters: number;
		/** the Field Guide's own counts (2024), or our approximation */
		source: "kfg" | "approx";
	};
	structure: {
		pendants: number;
		groups: number;
		subsidiaries: number;
		topCords: number;
		/** lone top cords whose value totals the neighbouring group */
		topSums: number;
		sixShare: number;
		brokenPrimary: boolean;
	};
	arithmetic: {
		label: ArithLabel;
		why?: "small" | "not-decimal" | "data-error";
		reps?: number;
		tests?: Partial<Record<ArithTest, TestResult>>;
		/** smallest p times the number of tests */
		pAdjusted?: number;
		lead?: ArithTest;
	};
}

export interface ProfileFile {
	meta: {
		built: string;
		reps: number;
		earlyStop: number;
		seed: number;
		thresholds: { clear: number; some: number; minNonZero: number };
		counts: Record<ArithLabel, number>;
	};
	profiles: Record<string, Profile>;
}

export const getProfiles = () => readJson<ProfileFile>("profiles.json");

/** One line of the khipu's place in the network. */
export interface Role {
	partner: string;
	kind: LinkKind;
	level: LinkLevel;
	/** how this khipu stands to the partner, as a phrase */
	relation: string;
	note: string;
	story?: string;
}

/** Scan pairs sharing a run this long are drawn on /network by default:
 * 24 such pairs against 0.7 in shuffled corpora. */
const SCAN_MIN_RUN = 6;

export function networkRole(id: string, scan: ScanFile | null) {
	const roles: Role[] = [];
	const seen = new Set<string>();
	for (const l of CURATED) {
		if (l.a !== id && l.b !== id) continue;
		const partner = l.a === id ? l.b : l.a;
		const isA = l.a === id;
		seen.add(pairKey(l.a, l.b));
		let relation: string;
		if (l.kind === "derived" && l.short?.startsWith("totals")) {
			relation = isA ? "its totals are carried by" : "carries the totals of";
		} else if (l.kind === "derived" && !l.undirected) {
			relation = isA ? "is the source of" : "is derived from";
		} else if (l.kind === "derived") {
			relation = "is related by derivation to";
		} else if (l.kind === "account") {
			relation = "holds the same account as";
		} else {
			relation = "is part of one object with";
		}
		roles.push({
			partner,
			kind: l.kind,
			level: l.level,
			relation,
			note: l.note,
			story: l.story,
		});
	}
	for (const p of scan?.pairs ?? []) {
		if (p.a !== id && p.b !== id) continue;
		if (p.longest < SCAN_MIN_RUN || seen.has(pairKey(p.a, p.b))) continue;
		roles.push({
			partner: p.a === id ? p.b : p.a,
			kind: "passage",
			level: "open",
			relation: "shares a run of values with",
			note: `${p.longest} consecutive values in common${p.dir === "rev" ? ", one read in reverse" : ""}; not yet examined.`,
		});
	}
	const order: Record<LinkKind, number> = {
		derived: 0,
		account: 1,
		object: 2,
		passage: 3,
	};
	roles.sort(
		(x, y) =>
			order[x.kind] - order[y.kind] || x.partner.localeCompare(y.partner),
	);
	const sets = SETS.filter((s) => s.kind === "set" && s.ids.includes(id));
	return { roles, sets };
}

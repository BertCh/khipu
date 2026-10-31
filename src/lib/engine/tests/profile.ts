/**
 * Per-khipu arithmetic profiles, ported from scripts/build_profiles.py (the
 * verified bench port in scratchpad/bench/bench.mjs matches its observed
 * counts on all 662 testable khipus). Node-importable.
 *
 * Tests on the pendant model (pv, group sizes, clusters, colours, subsidiaries):
 * - groupTotals: a group (>= 3 non-zero) with a cord c > 10 where 2c == total,
 *   else (>= 2 non-zero, total > 10) the cord just before or after the group
 *   equals the total;
 * - adjacentSums: relation-1 runs that start on the cord next to the sum cord;
 * - topSums: relation 9 "sum" only (exact or one digit off), tested only when
 *   a lone top-cord cluster exists;
 * - paperSums: relations 1 + 2 + 3 + 5.
 *
 * Null ("values"): only the pendant values are permuted among pendant slots;
 * colours, subsidiaries, group sizes and top cords stay. Up to 1000 shuffles
 * in batches of 100, stopping once every live test has >= 20 shuffles at or
 * above its observed count. pAdj = min(1, min p × live tests); the lead test
 * is the first with the smallest p, in the order above.
 *
 * Verdicts as in build_profiles.py: NOT_DECIMAL or cord data error ->
 * "untested"; fewer than 10 non-zero pendant values -> "small" (the Python
 * still runs the null for those with >= 3 pendants and keeps the label);
 * otherwise "clear" (pAdj < .01 and the lead test observed >= 2), "some"
 * (pAdj < .05) or "none". Seeds differ from numpy's, so p-values near a
 * threshold can move a khipu between labels; observed counts are exact.
 */
import type {
	CorpusLite,
	Executor,
	Hit,
	KhipuLite,
	Observation,
	Spec,
	UnitResult,
} from "../../next/types.ts";
import { corpusFor, isArithmetic } from "../corpus.ts";
import { drawNull } from "../nulls.ts";
import { mulberry32 } from "../rng.ts";
import {
	clusterSums,
	offByOne,
	rel1,
	rel2,
	rel3,
	rel5,
	scratchFor,
	sourceOf,
} from "./sums.ts";

const NREPS = 1000;
const BATCH = 100;
const EARLY_STOP = 20;
const MIN_NONZERO = 10;
const P_CLEAR = 0.01;
const P_SOME = 0.05;

function groupTotals(k: KhipuLite, v: ArrayLike<number>): number {
	let h = 0;
	let a = 0;
	for (const sz of k.sizes) {
		const b = a + sz;
		let t = 0;
		let nz = 0;
		for (let i = a; i < b; i++) {
			t += v[i];
			if (v[i] > 0) nz++;
		}
		let hit = false;
		if (nz >= 3)
			for (let i = a; i < b; i++)
				if (2 * v[i] === t && v[i] > 10) {
					hit = true;
					break;
				}
		if (
			!hit &&
			nz >= 2 &&
			t > 10 &&
			((a > 0 && v[a - 1] === t) || (b < v.length && v[b] === t))
		)
			hit = true;
		if (hit) h++;
		a = b;
	}
	return h;
}

/** a top-cord-only cluster of exactly one cord exists */
function hasLoneTop(k: KhipuLite): boolean {
	for (const cl of k.clusters)
		if (cl.k === "T" && cl.values.length === 1) return true;
	return false;
}

/** build_profiles.top_sums: relation 9 "sum" only, exact or one digit off */
function topSums(k: KhipuLite, v: ArrayLike<number>): number {
	const cs = clusterSums(k, v);
	let h = 0;
	for (let i = 0; i < cs.length - 1; i++) {
		const A = cs[i];
		const B = cs[i + 1];
		const ls = A.sum;
		const rs = B.sum;
		if (ls <= 0) continue;
		const tag = A.n === 1 ? i : B.n === 1 ? i + 1 : -1;
		if (tag < 0 || !cs[tag].top || cs[tag].sum <= 0) continue;
		if (ls === rs || offByOne(rs).has(ls) || offByOne(ls).has(rs)) h++;
	}
	return h;
}

const TESTS = ["groupTotals", "adjacentSums", "topSums", "paperSums"] as const;
type TestName = (typeof TESTS)[number];

function stats(
	k: KhipuLite,
	v: ArrayLike<number>,
	hasTop: boolean,
): Record<TestName, number> {
	const r = rel1(v);
	return {
		groupTotals: groupTotals(k, v),
		adjacentSums: r.adj,
		topSums: hasTop ? topSums(k, v) : 0,
		paperSums: r.count + rel2(k, v) + rel3(k, v) + rel5(k, v),
	};
}

/** observed counts of the four profile tests (topSums null when the khipu has no lone top cord) */
export function profileObserved(k: KhipuLite): {
	groupTotals: number;
	adjacentSums: number;
	paperSums: number;
	topSums: number | null;
} {
	const hasTop = hasLoneTop(k);
	const s = stats(k, k.pv, hasTop);
	return {
		groupTotals: s.groupTotals,
		adjacentSums: s.adjacentSums,
		paperSums: s.paperSums,
		topSums: hasTop ? s.topSums : null,
	};
}

function nonZero(k: KhipuLite): number {
	let n = 0;
	for (let i = 0; i < k.pv.length; i++) if (k.pv[i] > 0) n++;
	return n;
}

/** "untested" | "small" | null (testable) */
function why(k: KhipuLite): "untested" | "small" | null {
	if (!isArithmetic(k)) return "untested";
	if (nonZero(k) < MIN_NONZERO) return "small";
	return null;
}

function runProfile(k: KhipuLite, seed: number): UnitResult {
	const w = why(k);
	if (w === "untested" || k.pv.length < 3)
		return { unit: k.id, observed: 0, p: null, label: w ?? "small" };
	const hasTop = hasLoneTop(k);
	const live: TestName[] = TESTS.filter((t) => t !== "topSums" || hasTop);
	const obs = stats(k, k.pv, hasTop);
	const ge: Record<TestName, number> = {
		groupTotals: 0,
		adjacentSums: 0,
		topSums: 0,
		paperSums: 0,
	};
	const rng = mulberry32(seed);
	const scratch = scratchFor(k);
	let reps = 0;
	while (reps < NREPS) {
		for (let b = 0; b < BATCH; b++) {
			const t = drawNull(k, "values", rng, scratch);
			const s = stats(k, t.pv, hasTop);
			for (const x of live) if (s[x] >= obs[x]) ge[x]++;
		}
		reps += BATCH;
		if (live.every((x) => ge[x] >= EARLY_STOP)) break;
	}
	const p = (x: TestName) => (1 + ge[x]) / (1 + reps);
	let lead = live[0];
	for (const x of live) if (p(x) < p(lead)) lead = x;
	const pAdj = Math.min(1, p(lead) * live.length);
	let label: string = w ?? "none";
	if (w === null) {
		if (pAdj < P_CLEAR && obs[lead] >= 2) label = "clear";
		else if (pAdj < P_SOME) label = "some";
	}
	const detail: Record<string, number> = {
		reps,
		lead: TESTS.indexOf(lead),
	};
	for (const x of live) {
		detail[x] = obs[x];
		detail[`p_${x}`] = p(x);
	}
	return { unit: k.id, observed: obs[lead], p: pAdj, label, detail };
}

const LABELS = ["clear", "some", "none", "small", "untested"] as const;

/** One unit per khipu (every khipu gets a label); value = number of "clear" khipus. */
export const profileCountsExec: Executor = {
	scope: "corpus",
	nullKind: "units",
	observe(c0: CorpusLite, spec: Spec): Observation {
		// the observed counts only (no null): how many khipus are testable
		const c = corpusFor(c0, sourceOf(spec));
		const detail: Record<string, number> = {
			testable: 0,
			small: 0,
			untested: 0,
		};
		const hits: Hit[] = [];
		for (const k of c.khipus) {
			const w = why(k);
			if (w === "untested") detail.untested++;
			else if (w === "small" || k.pv.length < 3) detail.small++;
			else {
				detail.testable++;
				const o = profileObserved(k);
				const n = o.groupTotals + o.adjacentSums + (o.topSums ?? 0);
				if (n > 0) hits.push({ ids: [k.id], value: n });
			}
		}
		return { value: detail.testable, hits, detail };
	},
	units(c0, spec) {
		const c = corpusFor(c0, sourceOf(spec));
		return c.khipus.map((k) => k.id);
	},
	runUnit(c0, spec, unit, seed) {
		const c = corpusFor(c0, sourceOf(spec));
		const k = c.byId.get(unit);
		if (!k) throw new Error(`profileCounts: no khipu ${unit}`);
		return runProfile(k, seed);
	},
	combine(results: UnitResult[]): Observation {
		const detail: Record<string, number> = {};
		for (const l of LABELS) detail[l] = 0;
		const hits: Hit[] = [];
		for (const r of results) {
			detail[r.label] = (detail[r.label] ?? 0) + 1;
			if (r.label === "clear" || r.label === "some")
				hits.push({ ids: [r.unit], value: r.observed, label: r.label });
		}
		return { value: detail.clear, hits, detail };
	},
};

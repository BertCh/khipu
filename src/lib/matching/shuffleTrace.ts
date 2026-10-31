/**
 * Instrumented shuffles for the "against chance" chapter: Fisher–Yates with
 * its swaps recorded, and a simplified, visualisation-oriented version of
 * three of src/lib/engine/nulls.ts's null models, operating directly on a
 * level-1 tape (an array of group ids, one per tape position — see
 * src/lib/matching/tape.ts) rather than on a parsed KhipuLite.
 *
 * `fisherYates` is an exact, instrumented copy of
 * src/lib/engine/rng.ts's `shuffleInPlace` loop — applying `shuffleInPlace`
 * to an identity array with the same seed reproduces its `perm` exactly
 * (checked in scripts/matching/check_traces.mts).
 *
 * `nullPerm`'s 'sequence' model is exactly nulls.ts's (a full Fisher–Yates of
 * every tape position). 'seqWithin' matches nulls.ts's `blocksByGroup`: every
 * position sharing a group id is one shuffle block, wherever those positions
 * sit (nulls.ts groups by value, not by run). 'groupOrder' is a
 * *simplification* of nulls.ts's `drawGroupOrder`: here a "group" is a
 * maximal run of consecutive equal group ids in the tape as given (a
 * negative id, e.g. a top cord with no group, is its own fixed run of one),
 * and whole runs trade places, each keeping its own contents and length.
 * nulls.ts instead derives its groups from a khipu's `clusters`, built by
 * sorting level-1 indices by (group, ordinal) first — the same thing only
 * when a khipu's groups are already contiguous in tape order, which holds
 * for ordinary khipus but is not guaranteed. Treat `nullPerm('groupOrder', …)`
 * as illustrating the *idea* of the null, not as a byte-for-byte port; the
 * engine's own `drawNull` is the source of truth for any statistic that is
 * actually reported as a finding.
 */
import { mulberry32, shuffleInPlace } from "../engine/rng.ts";
import type { Rng } from "../next/types.ts";

export type TapeNullModel = "sequence" | "seqWithin" | "groupOrder";

export interface FisherYatesResult {
	/** every (i, j) pair drawn, in order, high i to low — includes i === j */
	swaps: [number, number][];
	/** perm[pos] = index that ends up at pos */
	perm: Int32Array;
}

/** Fisher–Yates on an identity array, recording every swap. Same draw order as shuffleInPlace. */
export function fisherYates(n: number, rng: Rng): FisherYatesResult {
	const perm = Int32Array.from({ length: n }, (_, i) => i);
	const swaps: [number, number][] = [];
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		swaps.push([i, j]);
		const t = perm[i];
		perm[i] = perm[j];
		perm[j] = t;
	}
	return { swaps, perm };
}

/** Maximal runs of consecutive equal values, in the order given. */
function runsOf(groups: ArrayLike<number>): number[][] {
	const out: number[][] = [];
	let i = 0;
	while (i < groups.length) {
		let j = i + 1;
		while (j < groups.length && groups[j] === groups[i]) j++;
		out.push(Array.from({ length: j - i }, (_, k) => i + k));
		i = j;
	}
	return out;
}

/**
 * One permutation under a chance model on a level-1 tape. `groups[i]` is the
 * group id of tape position i (negative = no group, e.g. most top cords).
 * Returns `perm` with `perm[pos]` = the original tape index now sitting at
 * `pos`.
 */
export function nullPerm(
	model: TapeNullModel,
	groups: ArrayLike<number>,
	rng: Rng,
): Int32Array {
	const n = groups.length;
	const perm = Int32Array.from({ length: n }, (_, i) => i);
	if (model === "sequence") {
		shuffleInPlace(perm, rng);
		return perm;
	}
	if (model === "seqWithin") {
		const byGroup = new Map<number, number[]>();
		for (let i = 0; i < n; i++) {
			const g = groups[i];
			const list = byGroup.get(g);
			if (list) list.push(i);
			else byGroup.set(g, [i]);
		}
		for (const idxs of byGroup.values()) {
			for (let i = idxs.length - 1; i > 0; i--) {
				const j = Math.floor(rng() * (i + 1));
				const x = perm[idxs[i]];
				perm[idxs[i]] = perm[idxs[j]];
				perm[idxs[j]] = x;
			}
		}
		return perm;
	}
	// groupOrder: runs with a real group id (>= 0) trade whole contents;
	// ungrouped runs (a single negative-id position) stay fixed in place.
	const runs = runsOf(groups);
	const movable = runs
		.map((_, idx) => idx)
		.filter((idx) => groups[runs[idx][0]] >= 0);
	const order = movable.slice();
	shuffleInPlace(order, rng);
	const content = runs.map((r) => r);
	for (let k = 0; k < movable.length; k++) content[movable[k]] = runs[order[k]];
	let pos = 0;
	for (const block of content) for (const origin of block) perm[pos++] = origin;
	return perm;
}

/**
 * P(original position i lands at position j) over `draws` replicates of
 * `model`, estimated by simulation (the "bias matrix" idiom): n×n,
 * row-major, `matrix[i * n + j]`. Fair Fisher–Yates ('sequence') tends to
 * uniform grey; 'seqWithin' and 'groupOrder' stay block-structured.
 */
export function biasMatrix(
	n: number,
	model: TapeNullModel,
	groups: ArrayLike<number>,
	draws: number,
	seed: number,
): Float64Array {
	const counts = new Float64Array(n * n);
	const rng = mulberry32(seed);
	for (let d = 0; d < draws; d++) {
		const perm = nullPerm(model, groups, rng);
		for (let j = 0; j < n; j++) counts[perm[j] * n + j]++;
	}
	for (let i = 0; i < counts.length; i++) counts[i] /= draws;
	return counts;
}

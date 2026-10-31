/**
 * The "fast version" of relation 1: src/lib/stories/chance.ts's `oneSide`
 * does not grow a running sum cord by cord to test a start `s` against a
 * target `t` (that is what src/lib/matching/sumTrace.ts animates, cord by
 * cord, for the slow reading). Instead it keeps a prefix-sum array `pf`
 * (`pf[j]` = sum of the first `j` values) and finds the first index `e` with
 * `pf[e] >= pf[s] + t` by binary search (`lowerBound`), then checks
 * `pf[e] === pf[s] + t` for an exact hit. Because every value is >= 0, `pf`
 * never decreases, so that is a valid search, and it lands on exactly the
 * index a cord-by-cord growth would stop at — in O(log n) steps instead of
 * up to `e - s`.
 *
 * `search` below is `lowerBound` itself, copied verbatim from chance.ts and
 * instrumented to record each [lo, hi) halving. It is not re-derived or
 * approximated: same comparison (`a[mid] < x`), same midpoint, same return.
 */

export interface PrefixStep {
	lo: number;
	hi: number;
	mid: number;
	/** pf[mid] */
	value: number;
	/** the index this step lands on once lo === hi */
	done: boolean;
}

export interface PrefixSearchResult {
	/** prefix sums, length n + 1; pf[0] = 0 */
	pf: number[];
	/** the value being searched for: pf[s] + t */
	target: number;
	steps: PrefixStep[];
	/** first index e with pf[e] >= target (lowerBound's own return) */
	e: number;
}

function prefixSums(v: readonly number[]): number[] {
	const pf = [0];
	for (const x of v) pf.push(pf[pf.length - 1] + x);
	return pf;
}

/** `lowerBound` from chance.ts, instrumented: first index e in the non-decreasing `pf` with pf[e] >= target. */
function lowerBoundTraced(
	pf: number[],
	target: number,
): { e: number; steps: PrefixStep[] } {
	let lo = 0;
	let hi = pf.length;
	const steps: PrefixStep[] = [];
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (pf[mid] < target) lo = mid + 1;
		else hi = mid;
		steps.push({ lo, hi, mid, value: pf[mid], done: lo === hi });
	}
	return { e: lo, steps };
}

/**
 * The binary search `oneSide` runs for one candidate start `s` against
 * target cord value `t`: find e with pf[e] === pf[s] + t (a hit) or not (a
 * miss). `v` is the whole tape — the search is over the whole prefix array,
 * exactly as chance.ts's does, not a local window.
 */
export function prefixSearch(
	v: readonly number[],
	s: number,
	t: number,
): PrefixSearchResult {
	const pf = prefixSums(v);
	const target = pf[s] + t;
	const { e, steps } = lowerBoundTraced(pf, target);
	return { pf, target, steps, e };
}

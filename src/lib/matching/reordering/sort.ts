/**
 * Chapter-specific pure logic for "When the order changes": a textbook
 * insertion sort, instrumented step by step, used to show two groups
 * settling onto the same signature (their sorted values); and a value-match
 * permutation between two orderings of the same multiset, used to measure
 * how much the order moved (PermutationArcs + an inversion count).
 *
 * Node-importable (relative imports, no DOM), like the shared src/lib/matching/*.
 */

export interface SortTraceStep {
	/** order[k] = index into the original array now sitting at position k */
	order: number[];
	/** positions in `order` just compared this step, or null on the first step */
	compare: [number, number] | null;
	swapped: boolean;
	/** cumulative through this step */
	comparisons: number;
	swaps: number;
}

export interface SortTrace {
	steps: SortTraceStep[];
	comparisons: number;
	swaps: number;
}

/**
 * Insertion sort over `values`, ascending, one step per comparison (and, when
 * a comparison fails, the swap that follows). The arrangement is returned as
 * a permutation of indices into `values` at every step, so a caller can
 * reorder any parallel array (here, the group's own Cords) the same way —
 * see NumberTape, which animates a reorder of the same cords via their
 * stable `i`.
 */
export function insertionSortTrace(values: readonly number[]): SortTrace {
	const order = values.map((_, i) => i);
	const steps: SortTraceStep[] = [
		{
			order: [...order],
			compare: null,
			swapped: false,
			comparisons: 0,
			swaps: 0,
		},
	];
	let comparisons = 0;
	let swaps = 0;
	for (let i = 1; i < order.length; i++) {
		let j = i;
		while (j > 0 && values[order[j - 1]] > values[order[j]]) {
			comparisons++;
			steps.push({
				order: [...order],
				compare: [j - 1, j],
				swapped: false,
				comparisons,
				swaps,
			});
			const t = order[j - 1];
			order[j - 1] = order[j];
			order[j] = t;
			swaps++;
			steps.push({
				order: [...order],
				compare: [j - 1, j],
				swapped: true,
				comparisons,
				swaps,
			});
			j--;
		}
		if (j > 0) {
			// the comparison that stopped the inner loop still happened
			comparisons++;
			steps.push({
				order: [...order],
				compare: [j - 1, j],
				swapped: false,
				comparisons,
				swaps,
			});
		}
	}
	return { steps, comparisons, swaps };
}

/**
 * How `to` can be read back onto positions in `from`, when both hold the
 * same multiset of values: perm[pos in `to`] = the first not-yet-used index
 * in `from` carrying that value (repeats matched in the order they appear —
 * a drawing convention, not a claim that one particular repeated cord is
 * "the same" cord as another). Returns -1 at a position whose value has no
 * remaining match in `from` (the two arrays are expected to be equal
 * multisets here; -1 only appears if they are not, e.g. a cord missing).
 */
export function matchPermutation(
	from: readonly number[],
	to: readonly number[],
): number[] {
	const used = new Array<boolean>(from.length).fill(false);
	return to.map((v) => {
		const idx = from.findIndex((x, i) => x === v && !used[i]);
		if (idx >= 0) used[idx] = true;
		return idx;
	});
}

/** The number of pairs out of order in `perm` — how much a reordering moved. */
export function countInversions(perm: readonly number[]): number {
	let inv = 0;
	for (let i = 0; i < perm.length; i++)
		for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inv++;
	return inv;
}

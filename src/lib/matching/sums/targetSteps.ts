import type { SumDir, SumStep } from "#/lib/matching/sumTrace";

/**
 * The contiguous slice of a `sumTrace` step list belonging to one target
 * cord: its `target` step, then every `tryStart`/`add`/`outcome` group up to
 * (not including) the next `target` step. Lets a figure scrub one search
 * without re-running `sumTrace` or reimplementing its loop.
 */
export function stepsForTarget(
	steps: readonly SumStep[],
	i: number,
	dir: SumDir,
): SumStep[] {
	const start = steps.findIndex(
		(s) => s.kind === "target" && s.i === i && s.dir === dir,
	);
	if (start < 0) return [];
	let end = steps.length;
	for (let j = start + 1; j < steps.length; j++) {
		if (steps[j].kind === "target") {
			end = j;
			break;
		}
	}
	return steps.slice(start, end);
}

/** The starting cords (`tryStart.s`) tried within one target's step slice, in order, de-duplicated. */
export function startsTried(steps: readonly SumStep[]): number[] {
	const out: number[] = [];
	for (const s of steps) if (s.kind === "tryStart") out.push(s.s);
	return out;
}

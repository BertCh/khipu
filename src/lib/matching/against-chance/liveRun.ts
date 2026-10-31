/**
 * A small, chapter-specific helper for running a Monte Carlo loop (up to a
 * few thousand replicates) in the browser without blocking the main thread:
 * it computes `step(i)` for i = 0..total-1 in batches, yielding to
 * `requestAnimationFrame` once a batch has used its time budget, and reports
 * the values accumulated so far after every batch.
 *
 * This is not a port of anything in the engine. It mirrors, in spirit, the
 * per-frame progress reporting in src/lib/engine/engine.worker.ts's
 * "replicates" case (a time budget, a progress callback) but runs on the
 * main thread rather than in a worker: a single pair's replicate (an
 * alignment or an exact-run scan over a few dozen cords) is fast enough
 * that moving it off-thread would add more overhead than it saves, and the
 * chapter only ever runs one such loop at a time.
 */

/** Cancel the run; no further `onProgress` calls will arrive after this returns. */
export type CancelRun = () => void;

export function runChunked(
	total: number,
	step: (i: number) => number,
	onProgress: (values: number[], done: number, total: number) => void,
	budgetMs = 8,
): CancelRun {
	let cancelled = false;
	let i = 0;
	const values: number[] = [];
	function frame() {
		if (cancelled) return;
		const start = performance.now();
		while (i < total && performance.now() - start < budgetMs) {
			values.push(step(i));
			i++;
		}
		onProgress(values.slice(), i, total);
		if (i < total && !cancelled) requestAnimationFrame(frame);
	}
	if (total <= 0) onProgress([], 0, total);
	else requestAnimationFrame(frame);
	return () => {
		cancelled = true;
	};
}

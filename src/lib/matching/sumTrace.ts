/**
 * An instrumented port of relation 1 (pendant–pendant sums) from
 * src/lib/stories/chance.ts's `pendantSums`: for each cord worth more than
 * 10, the running sum grows cord by cord from the next nonzero cord until it
 * equals or passes the target; if it overshoots, the search restarts from
 * the *next* nonzero cord. chance.ts's own implementation uses prefix sums
 * and a binary search purely for speed — because every value is >= 0, the
 * prefix sum at the first index where it reaches or passes the target is
 * exactly what growing the sum one cord at a time would reach, so stepping
 * through it here one cord at a time produces identical results, checked
 * against `pendantSums` directly in scripts/matching/check_traces.mts (on
 * KH0081 and KH0698).
 *
 * Both directions run: forward exactly as chance.ts's `oneSide`, and
 * "backward" by running the same logic on the reversed value array and
 * mapping every index back (chance.ts does this with `[...v].reverse()`);
 * steps from the backward pass are tagged `dir: 'left'` and already carry
 * original-array indices, so a consumer never needs to un-reverse anything
 * itself.
 */
import type { PendantSum } from "../stories/chance.ts";

export type SumDir = "right" | "left";

export type SumStep =
	| { kind: "target"; dir: SumDir; i: number; value: number }
	| { kind: "tryStart"; dir: SumDir; i: number; s: number }
	| {
			kind: "add";
			dir: SumDir;
			i: number;
			s: number;
			/** the cord just added to the running sum */
			cord: number;
			running: number;
			target: number;
	  }
	| {
			kind: "outcome";
			dir: SumDir;
			i: number;
			s: number;
			/** last cord added (inclusive) */
			last: number;
			result: "equal" | "miss";
			/** whether this run satisfies pendantSums's own extra conditions (>= 2 cords, fewer cords than the value) */
			recorded: boolean;
	  };

export interface SumTraceResult {
	steps: SumStep[];
	sums: PendantSum[];
}

/**
 * One direction of the search, in the coordinates of `v` as given (`v` is
 * `values` reversed for the 'left' pass); `toOrig` maps a `v`-index back to
 * the original array's index, and results are pushed into `sums`/`steps`
 * already in original coordinates.
 */
function oneSideTraced(
	v: number[],
	dir: SumDir,
	toOrig: (idx: number) => number,
	steps: SumStep[],
	sums: PendantSum[],
): void {
	const n = v.length;
	const nz: number[] = [];
	v.forEach((x, i) => {
		if (x > 0) nz.push(i);
	});
	for (let i = 0; i < n - 2; i++) {
		const t = v[i];
		if (t <= 10) continue;
		steps.push({ kind: "target", dir, i: toOrig(i), value: t });
		for (const s of nz) {
			if (s <= i) continue;
			steps.push({ kind: "tryStart", dir, i: toOrig(i), s: toOrig(s) });
			let running = 0;
			let e = s;
			while (running < t && e < n) {
				running += v[e];
				steps.push({
					kind: "add",
					dir,
					i: toOrig(i),
					s: toOrig(s),
					cord: toOrig(e),
					running,
					target: t,
				});
				e++;
			}
			const last = e - 1;
			if (running === t) {
				const recorded = e - s >= 2 && t > e - s;
				steps.push({
					kind: "outcome",
					dir,
					i: toOrig(i),
					s: toOrig(s),
					last: toOrig(last),
					result: "equal",
					recorded,
				});
				if (recorded) {
					const origS = toOrig(s);
					const origLast = toOrig(last);
					const from = Math.min(origS, origLast);
					const to = Math.max(origS, origLast);
					sums.push({ at: toOrig(i), from, to, right: dir === "right" });
				}
				break;
			}
			steps.push({
				kind: "outcome",
				dir,
				i: toOrig(i),
				s: toOrig(s),
				last: toOrig(last),
				result: "miss",
				recorded: false,
			});
		}
	}
}

/** Relation 1, both directions, instrumented. `sums` equals `pendantSums(v)`. */
export function sumTrace(v: number[]): SumTraceResult {
	const n = v.length;
	const steps: SumStep[] = [];
	const sums: PendantSum[] = [];
	if (n < 3) return { steps, sums };
	oneSideTraced(v, "right", (i) => i, steps, sums);
	const rev = [...v].reverse();
	oneSideTraced(rev, "left", (i) => n - i - 1, steps, sums);
	return { steps, sums };
}

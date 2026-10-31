/**
 * Step 1 of the "Bending the rules" chapter: where the *exact* shared-passage
 * scan (src/lib/engine/tests/passages.ts's `pairRun`) breaks on a pair of
 * near-twin khipus. Pure, so the route can read the same numbers it draws.
 *
 * KH0303 and KH0304 are the same length (32 level-1 cords) and agree almost
 * everywhere; `pairRun` still reports only its one longest exact run, because
 * every cord where the two differ cuts the run in two. This is the brittleness
 * that motivates a tolerant alignment (the rest of the chapter).
 */
import { pairRun } from "../../engine/tests/passages.ts";
import type { Khipu } from "../../khipu/types.ts";
import { type TapeCord, tapeOf } from "../tape.ts";

export interface BrokenRunsResult {
	tapeA: TapeCord[];
	tapeB: TapeCord[];
	longest: number;
	dir: "fwd" | "rev";
	spans: [number, number, number][];
	/** tape indices (A-side, B-side) covered by any exact run */
	runA: Set<number>;
	runB: Set<number>;
	/** tape indices where the two tapes disagree outside of any run (same length only) */
	diffA: Set<number>;
	diffB: Set<number>;
	/** cords that hold the same value at the same position, run or not */
	agree: number;
	/** min(tapeA.length, tapeB.length) */
	compared: number;
}

export function brokenRuns(a: Khipu, b: Khipu): BrokenRunsResult {
	const tapeA = tapeOf(a);
	const tapeB = tapeOf(b);
	const va = tapeA.map((c) => c.value);
	const vb = tapeB.map((c) => c.value);
	const r = pairRun(va, vb);
	const runA = new Set<number>();
	const runB = new Set<number>();
	for (const [len, i, j] of r.spans) {
		for (let t = 0; t < len; t++) {
			runA.add(i + t);
			runB.add(j + t);
		}
	}
	const diffA = new Set<number>();
	const diffB = new Set<number>();
	let agree = 0;
	const compared = Math.min(va.length, vb.length);
	if (va.length === vb.length) {
		for (let i = 0; i < va.length; i++) {
			if (va[i] === vb[i]) agree++;
			else if (!runA.has(i)) {
				diffA.add(i);
				diffB.add(i);
			}
		}
	}
	return {
		tapeA,
		tapeB,
		longest: r.longest,
		dir: r.dir,
		spans: r.spans,
		runA,
		runB,
		diffA,
		diffB,
		agree,
		compared,
	};
}
